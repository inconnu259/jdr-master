import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type {
  AggregatedSlotDto,
  AvailableSlotDto,
  ListViewMode,
  PartieDto,
  PartieKindTransitionRefusal,
  PartieStatus,
} from '@master-jdr/shared';
// Seul import RUNTIME de `@master-jdr/shared` dans ce service : la matrice de conversion (Story
// 29.14), partagée avec le formulaire d'édition. Impose `jest.mock('@master-jdr/shared')` dans les
// specs de ce service — le paquet est ESM, que le runner Jest de l'API ne sait pas charger.
import { checkPartieKindTransition } from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from '../realtime/realtime-events.service';
import {
  detectImageMime,
  extractUploadFilename,
  stripImageMetadata,
  unlinkUploadFile,
  type DetectedImageMime,
} from '../common/image-upload.util';
import { UPLOADS_ROOT } from '../common/uploads-root';
import { ConvertPartieKindDto } from './dto/convert-partie-kind.dto';
import { CreatePartieDto } from './dto/create-partie.dto';
import { UpdatePartieDto } from './dto/update-partie.dto';

/** Traduit un code de refus de conversion (union fermée) en message destiné au MJ.
 *  NFR-4 : le message nomme la cause réelle et le nombre en jeu — jamais un texte générique. */
function refusalMessage(
  refusal: PartieKindTransitionRefusal,
  scenarioCount: number,
): string {
  switch (refusal) {
    case 'PARTIE_CLOSED':
      return 'Cette partie est clôturée : rouvrez-la avant de changer son type';
    case 'TOO_MANY_SCENARIOS_FOR_ONE_SHOT':
      return `Cette partie compte ${scenarioCount} scénarios ; un one-shot n'en a qu'un`;
    default: {
      // Revue de code : `apps/api/tsconfig.json` n'active pas `noImplicitReturns` — sans cette
      // garde, un futur membre ajouté à `PartieKindTransitionRefusal` sans mettre à jour ce
      // `switch` retournerait silencieusement `undefined` au lieu d'échouer bruyamment.
      const exhaustive: never = refusal;
      throw new Error(
        `Motif de refus de conversion non géré : ${String(exhaustive)}`,
      );
    }
  }
}

/** Dossier/préfixe du domaine couverture (Story 29.12, AD-17) — paramétrise l'utilitaire d'upload
 *  commun, même patron que `PORTRAITS_DIR`/`PORTRAITS_URL_PREFIX` (`character.service.ts`). */
export const COVERS_DIR = join(UPLOADS_ROOT, 'covers');
export const COVERS_URL_PREFIX = '/uploads/covers/';

const INVALID_COVER_IMAGE_MESSAGE =
  "Le fichier fourni n'est pas une image JPEG/PNG/WEBP valide";

/**
 * Dimensions cibles des dérivées (Story 29.12, AC9) — alignées sur le rendu réel de `PartyBanner`
 * (Stories 29.10/29.11 : grand 320×124, moyen 44×44, liste 28×28), doublées pour rester nettes sur
 * les écrans à forte densité. Fixées côté serveur, jamais un `dpr` ni une largeur venus du client
 * (vecteur de déni de service par redimensionnement).
 */
const COVER_DIMENSIONS: Record<
  ListViewMode,
  { width: number; height: number }
> = {
  large: { width: 640, height: 248 },
  medium: { width: 88, height: 88 },
  compact: { width: 56, height: 56 },
};

/** Dérivées pré-générées au dépôt, jamais redimensionnées à la volée (coût CPU × 12 tuiles × chaque
 *  chargement de liste, cf. Décisions de la story). Toutes converties en WebP — allège nettement
 *  par rapport à la conservation du format d'entrée, ce qui sert directement AC9. */
const COVER_DERIVATIVE_MIME: DetectedImageMime = 'image/webp';
const COVER_DERIVATIVE_EXT = '.webp';

/**
 * Jeton de version dérivé de `Partie.coverImageUrl` (Story 29.12, AD-19) — le stem UUID du fichier
 * déposé, sans extension. `null` si aucune couverture. Jamais le chemin de stockage exposé côté
 * client : seule sa présence/son changement comptent (indicateur + cache-busting).
 */
export function coverImageVersion(coverImageUrl: string | null): string | null {
  const filename = extractUploadFilename(coverImageUrl, COVERS_URL_PREFIX);
  if (!filename) return null;
  return filename.slice(0, filename.lastIndexOf('.'));
}

/**
 * Projection explicite (AD-15, Story 29.1) — énumère les champs renvoyés, jamais un objet Prisma
 * propagé tel quel.
 *
 * `hasScenario` détermine `status` (AD-8) : `closedAt` renseigné prime toujours (`TERMINEE`),
 * sinon la présence d'au moins un `Scenario` fait passer de `A_VENIR` à `EN_COURS`. Compter les
 * `Scenario` suffit à détecter « sans aucun scénario ni séance » — `Seance.scenarioId` est une FK
 * obligatoire (pas de séance orpheline) et tout scénario créé reçoit systématiquement au moins une
 * séance (cf. `create()` ci-dessous, `ScenariosService.addSeance`).
 */
function toPartieDto(
  partie: any,
  role: 'mj' | 'player',
  hasScenario: boolean,
  isFavorite: boolean,
): PartieDto {
  const status: PartieStatus = partie.closedAt
    ? 'TERMINEE'
    : hasScenario
      ? 'EN_COURS'
      : 'A_VENIR';
  return {
    id: partie.id,
    name: partie.name,
    kind: partie.kind,
    gameSystemId: partie.gameSystemId,
    description: partie.description,
    mjId: partie.mjId,
    createdAt: partie.createdAt,
    nextSessionDate: partie.nextSessionDate,
    nextSessionSlot: partie.nextSessionSlot,
    role,
    status,
    isFavorite,
    coverImageVersion: coverImageVersion(partie.coverImageUrl ?? null),
  };
}

@Injectable()
export class PartiesService {
  private readonly logger = new Logger(PartiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async create(mjId: string, dto: CreatePartieDto): Promise<PartieDto> {
    return this.prisma.$transaction(async (tx) => {
      const partie = await tx.partie.create({
        data: {
          name: dto.name,
          kind: dto.kind,
          gameSystemId: dto.gameSystemId,
          description: dto.description ?? null,
          mjId,
        },
      });

      // AD-7 : une Partie ONE_SHOT n'existe jamais sans son scénario unique — créé au même titre
      // que la Partie, statut BROUILLON, ouverture (BROUILLON→A_VENIR) toujours une action MJ
      // explicite ultérieure (Story 7.3), jamais automatique ici.
      if (dto.kind === 'ONE_SHOT') {
        const scenario = await tx.scenario.create({
          data: {
            partieId: partie.id,
            title: partie.name,
            status: 'BROUILLON',
          },
        });
        // Un scénario a systématiquement besoin d'au moins une séance pour planifier sa date — le
        // MJ peut toujours en ajouter d'autres ensuite (ScenariosService.addSeance, aucun plafond).
        await tx.seance.create({ data: { scenarioId: scenario.id } });
      }

      // Le créateur est toujours MJ de la partie qu'il crée (revue de code, AC6).
      // hasScenario connu synchronement : le scénario unique vient d'être créé dans cette même
      // transaction pour ONE_SHOT (ci-dessus) ; CAMPAGNE_LINEAIRE/CAMPAGNE_EPISODIQUE n'en créent
      // aucun — aucune requête `scenario.count()` nécessaire ici (Story 29.6).
      // isFavorite toujours false ici : une partie tout juste créée n'est jamais favorite,
      // aucune requête `partieFavorite` nécessaire (Story 29.8).
      return toPartieDto(partie, 'mj', dto.kind === 'ONE_SHOT', false);
    });
  }

  /** Lecture en lot (AD-3) : une seule requête groupée pour dériver `status` de tout le tableau
   *  renvoyé — jamais un `scenario.count()` par partie dans une boucle (Story 29.6). */
  private async hasScenarioByPartieId(
    partieIds: string[],
  ): Promise<Set<string>> {
    if (partieIds.length === 0) return new Set();
    const counts = await this.prisma.scenario.groupBy({
      by: ['partieId'],
      where: { partieId: { in: partieIds } },
      _count: { _all: true },
    });
    // `groupBy` ne renvoie jamais de groupe à compte zéro pour un partieId sans scénario — chaque
    // ligne retournée a donc nécessairement au moins un scénario, aucun filtre supplémentaire requis.
    return new Set(counts.map((c) => c.partieId));
  }

  /** Variante mono-partie de `hasScenarioByPartieId` — la lecture en lot (AD-3) ne s'applique pas
   *  quand une seule partie est concernée (`findOneDto`, `update`, `close`, `reopen`). */
  private async hasScenario(partieId: string): Promise<boolean> {
    const count = await this.prisma.scenario.count({
      where: { partieId },
    });
    return count > 0;
  }

  /** Lecture en lot (même discipline qu'AD-3/`hasScenarioByPartieId`, Story 29.8) : une seule
   *  requête groupée pour dériver `isFavorite` de tout le tableau renvoyé par `listForUser()`. */
  private async favoritePartieIds(
    userId: string,
    partieIds: string[],
  ): Promise<Set<string>> {
    if (partieIds.length === 0) return new Set();
    const favorites = await this.prisma.partieFavorite.findMany({
      where: { userId, partieId: { in: partieIds } },
      select: { partieId: true },
    });
    return new Set(favorites.map((f) => f.partieId));
  }

  /** Variante mono-partie de `favoritePartieIds` — même logique que `hasScenario()` vs
   *  `hasScenarioByPartieId()` (`findOneDto`, `update`, `close`, `reopen`). */
  private async isFavorite(userId: string, partieId: string): Promise<boolean> {
    const favorite = await this.prisma.partieFavorite.findUnique({
      where: { userId_partieId: { userId, partieId } },
    });
    return favorite !== null;
  }

  /**
   * `mj` = les parties que je maîtrise ; `player` = celles où je suis membre (via `Membership`).
   */
  async listForUser(
    userId: string,
    role: 'mj' | 'player',
  ): Promise<PartieDto[]> {
    if (role === 'player') {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        include: { partie: true },
      });
      const partieIds = memberships.map((m) => m.partie.id);
      const [hasScenarioIds, favoriteIds] = await Promise.all([
        this.hasScenarioByPartieId(partieIds),
        this.favoritePartieIds(userId, partieIds),
      ]);
      return memberships.map((m) =>
        toPartieDto(
          m.partie,
          'player',
          hasScenarioIds.has(m.partie.id),
          favoriteIds.has(m.partie.id),
        ),
      );
    }
    const parties = await this.prisma.partie.findMany({
      where: { mjId: userId },
      orderBy: { createdAt: 'desc' },
    });
    const partieIds = parties.map((p) => p.id);
    const [hasScenarioIds, favoriteIds] = await Promise.all([
      this.hasScenarioByPartieId(partieIds),
      this.favoritePartieIds(userId, partieIds),
    ]);
    return parties.map((p) =>
      toPartieDto(p, 'mj', hasScenarioIds.has(p.id), favoriteIds.has(p.id)),
    );
  }

  /** Récupère une partie en vérifiant que l'utilisateur en est le MJ (sinon 404 / 403). */
  async getOwned(id: string, userId: string) {
    const partie = await this.prisma.partie.findUnique({ where: { id } });
    if (!partie) throw new NotFoundException('Partie introuvable');
    if (partie.mjId !== userId) throw new ForbiddenException();
    return partie;
  }

  /** Récupère une partie visible par l'utilisateur : MJ **ou** membre (sinon 404 / 403). */
  async getViewable(id: string, userId: string) {
    const partie = await this.prisma.partie.findUnique({ where: { id } });
    if (!partie) throw new NotFoundException('Partie introuvable');
    if (partie.mjId === userId) return partie;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_partieId: { userId, partieId: id } },
    });
    if (!membership) throw new ForbiddenException();
    return partie;
  }

  /** Récupère une partie visible par l'utilisateur (garde inchangée, cf. `getViewable`) enrichie
   *  du pseudo/nom affiché du MJ (AD-2) — le MJ n'étant jamais un `Membership`, son identité
   *  n'apparaît nulle part ailleurs dans `PartieDto`. Revue de code : `mj` gardé comme
   *  `resolveParticipants()` plutôt qu'une assertion non-null — une ligne `User` orpheline ne doit
   *  jamais transformer ce chemin de lecture principal en 500 (mjPseudo/mjDisplayName optionnels). */
  async findOneDto(id: string, userId: string): Promise<PartieDto> {
    const partie = await this.getViewable(id, userId);
    const role: 'mj' | 'player' = partie.mjId === userId ? 'mj' : 'player';
    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    const dto = toPartieDto(partie, role, hasScenario, favorite);
    const mj = await this.prisma.user.findUnique({
      where: { id: partie.mjId },
      select: { pseudo: true, displayName: true },
    });
    if (!mj) return dto;
    return { ...dto, mjPseudo: mj.pseudo, mjDisplayName: mj.displayName };
  }

  /** Liste des joueurs d'une partie (visible par le MJ ou un membre). L'e-mail n'est renseigné
   *  que si le demandeur est le MJ (AD-2) — un `InviteLink` acceptant un nombre d'usages
   *  illimité, un membre n'est pas nécessairement quelqu'un que le MJ a choisi individuellement. */
  async listMembers(partieId: string, userId: string) {
    const partie = await this.getViewable(partieId, userId);
    const isMj = partie.mjId === userId;
    const memberships = await this.prisma.membership.findMany({
      where: { partieId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: {
          select: { id: true, pseudo: true, displayName: true, email: true },
        },
      },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      pseudo: m.user.pseudo,
      displayName: m.user.displayName,
      email: isMj ? m.user.email : undefined,
      joinedAt: m.joinedAt,
    }));
  }

  /** Le MJ retire un joueur de SA partie. */
  async removeMember(partieId: string, userId: string, targetUserId: string) {
    await this.getOwned(partieId, userId);
    await this.prisma.membership.deleteMany({
      where: { partieId, userId: targetUserId },
    });
    // Bug fix : le MJ/les autres membres ne voyaient jamais le roster rétrécir sans recharger, et
    // le joueur retiré ne voyait jamais sa propre liste de Parties se mettre à jour.
    this.realtimeEvents.emit(partieTopic(partieId));
    this.realtimeEvents.emit(userTopic(targetUserId));
    // AUCUN_MEMBRE_INVITE (Story 29.7, AD-14) : retirer le dernier membre fait réapparaître ce
    // signal pour le MJ — getOwned() garantit que userId est déjà le MJ. `partieTopic` déjà émis
    // ci-dessus : `emitMembersOnlySafe` (pas `emitPartieAndMembersSafe`) pour ne pas le réémettre
    // (revue de code, Story 29.7 — double émission SSE trouvée sur tous les points d'appel).
    await this.emitMembersOnlySafe(partieId, userId);
    return { ok: true };
  }

  async update(
    id: string,
    userId: string,
    dto: UpdatePartieDto,
  ): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);

    // Story 29.14 : jusqu'ici `data: { ...dto }` écrivait `kind` sans aucune vérification, alors que
    // le type gouverne des invariants dans quatre services. Changer de type est une OPÉRATION à
    // effets (création de scénario, semis de participants, rétrogradation de statuts) portant son
    // propre paramètre — elle passe par `convertKind()`, jamais par cette édition de champs.
    // Un `kind` IDENTIQUE reste accepté : le formulaire renvoie toujours les quatre champs, et le
    // rejeter casserait l'enregistrement d'un simple changement de nom.
    if (dto.kind !== undefined && dto.kind !== partie.kind) {
      throw new BadRequestException(
        'Le type de partie ne se change pas par cette route — utiliser la conversion dédiée',
      );
    }

    const updated = await this.prisma.partie.update({
      where: { id },
      data: { ...dto },
    });
    this.realtimeEvents.emit(partieTopic(id));
    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    // getOwned() a déjà garanti que l'appelant est le MJ (revue de code, AC6).
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  /**
   * Convertit le type d'une partie (Story 29.14) — MJ uniquement.
   *
   * Tout se joue dans une seule transaction : lecture de l'état, évaluation par la matrice
   * partagée, puis — et seulement si le verdict est favorable — écriture du `kind` et de ses
   * effets. Un refus lève AVANT toute écriture (AC10) : évaluer après avoir écrit laisserait une
   * partie convertie suivie d'une exception, le pire des deux mondes.
   *
   * La matrice vit dans `@master-jdr/shared` et non ici : le formulaire d'édition la consomme
   * aussi, pour désactiver les types inatteignables. Deux tables de règles divergeraient.
   */
  async convertKind(
    id: string,
    userId: string,
    dto: ConvertPartieKindDto,
  ): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const [scenarioCount, courantCount] = await Promise.all([
        tx.scenario.count({ where: { partieId: id } }),
        tx.scenario.count({ where: { partieId: id, status: 'COURANT' } }),
      ]);

      const verdict = checkPartieKindTransition(partie.kind, dto.kind, {
        scenarioCount,
        courantCount,
        isClosed: partie.closedAt !== null,
      });

      if (!verdict.allowed) {
        throw new BadRequestException(
          refusalMessage(verdict.refusal, scenarioCount),
        );
      }

      // Le scénario qui reste Courant est validé avant toute écriture, lui aussi : il doit exister,
      // appartenir à CETTE partie (isolation) et être réellement COURANT.
      let keptCourantId: string | null = null;
      if (verdict.requiresCourantChoice) {
        if (!dto.courantScenarioId) {
          throw new BadRequestException(
            'Cette partie a plusieurs scénarios Courant : désignez celui qui doit le rester',
          );
        }
        const kept = await tx.scenario.findUnique({
          where: { id: dto.courantScenarioId },
        });
        if (!kept || kept.partieId !== id) {
          throw new BadRequestException(
            "Ce scénario n'appartient pas à cette partie",
          );
        }
        if (kept.status !== 'COURANT') {
          throw new BadRequestException(
            'Le scénario désigné pour rester Courant ne l’est pas',
          );
        }
        keptCourantId = kept.id;
      }

      const written = await tx.partie.update({
        where: { id },
        data: { kind: dto.kind },
      });

      for (const effect of verdict.effects) {
        // Revue de code : `switch` exhaustif plutôt qu'une chaîne de `if` — un futur membre ajouté
        // à `PartieKindTransitionEffect` sans mettre à jour cette boucle échoue bruyamment (`default`
        // ci-dessous) au lieu d'être silencieusement ignoré.
        switch (effect) {
          case 'CREATE_SCENARIO': {
            // Même geste que `create()` pour un ONE_SHOT (AD-7) : un scénario BROUILLON titré du nom
            // de la partie, plus la séance sans laquelle il n'a aucune date à planifier. Sans cela la
            // partie resterait sans scénario pour toujours — `ScenariosService.create()` refuse d'en
            // créer un sur un ONE_SHOT, et il n'existe aucun autre chemin.
            const scenario = await tx.scenario.create({
              data: { partieId: id, title: partie.name, status: 'BROUILLON' },
            });
            await tx.seance.create({ data: { scenarioId: scenario.id } });
            break;
          }

          case 'SEED_PARTICIPANTS': {
            // Hors épisodique, le code tient déjà pour vrai que tous les membres participent
            // (`homme-dragon.service.ts`). On l'explicite, sans quoi la conversion viderait les notes
            // de rétrospective et ferait refuser les associations de journal.
            // `skipDuplicates` rend le semis idempotent, comme l'upsert de `participate()`.
            const [scenarios, memberships] = await Promise.all([
              tx.scenario.findMany({
                where: { partieId: id },
                select: { id: true },
              }),
              tx.membership.findMany({
                where: { partieId: id },
                select: { userId: true },
              }),
            ]);
            const rows = scenarios.flatMap((s) =>
              memberships.map((m) => ({ scenarioId: s.id, userId: m.userId })),
            );
            if (rows.length > 0) {
              await tx.scenarioParticipant.createMany({
                data: rows,
                skipDuplicates: true,
              });
            }
            break;
          }

          case 'DEMOTE_EXTRA_COURANTS': {
            // Revue de code : `keptCourantId` remplace une assertion non-null par une garde
            // explicite — `requiresCourantChoice` (donc cet effet) n'est posé par la matrice que
            // lorsque `keptCourantId` a été validé plus haut, mais un futur refactor qui romprait ce
            // lien lèverait ici au lieu de rétrograder silencieusement TOUS les scénarios Courant
            // (`{ not: null }` matcherait tout).
            if (!keptCourantId) {
              throw new Error(
                'DEMOTE_EXTRA_COURANTS appliqué sans scénario Courant désigné — invariant rompu',
              );
            }
            // Règle A — rien n'est effacé : seul `status` change. Séances, votes et dates des
            // scénarios rétrogradés restent intacts, et un scénario A_VENIR peut parfaitement porter
            // une séance datée (seul PASSE fige, cf. `addSeance`/`createSeancePoll`).
            await tx.scenario.updateMany({
              where: {
                partieId: id,
                status: 'COURANT',
                id: { not: keptCourantId },
              },
              data: { status: 'A_VENIR' },
            });
            break;
          }

          default: {
            const exhaustive: never = effect;
            throw new Error(
              `Effet de conversion non géré : ${String(exhaustive)}`,
            );
          }
        }
      }

      return written;
    });

    // AD-14 : la conversion change des statuts de scénario, donc des signaux. Émission tolérante
    // aux pannes (patron `close()`/`reopen()`, Story 29.6) — un commit réussi ne doit jamais se
    // transformer en 500 parce qu'une notification a échoué.
    await this.emitPartieAndMembersSafe(id, partie.mjId);

    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    // getOwned() a déjà garanti que l'appelant est le MJ.
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  /** Déclare la partie terminée (AD-8, Story 29.6) — MJ uniquement. Réversible via `reopen()`. */
  async close(id: string, userId: string): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);
    const updated = await this.prisma.partie.update({
      where: { id },
      data: { closedAt: new Date() },
    });
    await this.emitPartieAndMembersSafe(id, partie.mjId);
    // Le MJ peut clôturer une partie jamais commencée (aucun scénario) — hasScenario recalculé,
    // jamais supposé, `closedAt` primant de toute façon sur le résultat dans toPartieDto().
    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  /** Revient sur une clôture (AD-8, Story 29.6) — MJ uniquement. */
  async reopen(id: string, userId: string): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);
    const updated = await this.prisma.partie.update({
      where: { id },
      data: { closedAt: null },
    });
    await this.emitPartieAndMembersSafe(id, partie.mjId);
    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  async remove(id: string, userId: string) {
    await this.getOwned(id, userId);
    await this.prisma.partie.delete({ where: { id } });
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Image de couverture (Story 29.12, AD-17/AD-19) — MJ seul en écriture (getOwned), lecture
  // ouverte à tout membre (getViewable). Patron repris de `character.service.ts:updatePortrait()`
  // pour la validation/le nettoyage/le nettoyage du fichier orphelin, étendu pour écrire trois
  // dérivées pré-générées (AC9) plutôt qu'un fichier unique.
  // ─────────────────────────────────────────────────────────────────────────

  /** Noms des 3 fichiers dérivés partageant le même `stem` UUID (`<stem>-<mode>.webp`). */
  private coverDerivativeFilenames(stem: string): Record<ListViewMode, string> {
    return {
      large: `${stem}-large${COVER_DERIVATIVE_EXT}`,
      medium: `${stem}-medium${COVER_DERIVATIVE_EXT}`,
      compact: `${stem}-compact${COVER_DERIVATIVE_EXT}`,
    };
  }

  /** Extrait le `stem` (UUID sans extension) du `coverImageUrl` stocké — c'est une identité
   *  logique, jamais un chemin littéral sur disque (aucun fichier n'existe réellement à ce nom
   *  exact, seules les 3 dérivées `<stem>-<mode>.webp` existent). Alias de `coverImageVersion()`
   *  (Review Findings : deux implémentations indépendantes de la même règle d'extraction
   *  divergeraient silencieusement si le format d'URL changeait un jour). */
  private coverStem(coverImageUrl: string): string | null {
    return coverImageVersion(coverImageUrl);
  }

  private async deleteCoverFiles(coverImageUrl: string): Promise<void> {
    const stem = this.coverStem(coverImageUrl);
    if (!stem) {
      this.logger.warn(
        `coverImageUrl inattendu, suppression ignorée : ${coverImageUrl}`,
      );
      return;
    }
    const filenames = Object.values(this.coverDerivativeFilenames(stem));
    await Promise.all(
      filenames.map((filename) =>
        unlinkUploadFile(COVERS_DIR, filename).catch((e) => {
          this.logger.warn(
            `Échec de suppression de la couverture ${filename}`,
            e as Error,
          );
        }),
      ),
    );
  }

  /**
   * Dépose une image de couverture (AC1, AC4, AC6, AC9) — MJ seul (`getOwned`). Détection MIME →
   * nettoyage EXIF → 3 dérivées redimensionnées pré-générées → écriture DB, avec nettoyage des
   * fichiers orphelins si une étape échoue après coup (patron `character.service.ts`). Au
   * remplacement d'une image existante, l'ancienne est supprimée (les 3 dérivées).
   */
  async setCoverImage(
    id: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);

    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException(INVALID_COVER_IMAGE_MESSAGE);
    }
    let cleanedBuffer: Buffer;
    try {
      cleanedBuffer = await stripImageMetadata(file.buffer);
    } catch (err) {
      this.logger.warn(
        `Échec du nettoyage EXIF (sharp) sur une couverture uploadée : ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(INVALID_COVER_IMAGE_MESSAGE);
    }

    const stem = randomUUID();
    const filenames = this.coverDerivativeFilenames(stem);
    const written: string[] = [];
    try {
      await mkdir(COVERS_DIR, { recursive: true });
      for (const mode of Object.keys(COVER_DIMENSIONS) as ListViewMode[]) {
        const { width, height } = COVER_DIMENSIONS[mode];
        // Rapports très différents entre le mode grand (≈2,6/1) et moyen/liste (1/1) : recadrage
        // au centre plutôt que déformation (Décisions de la story).
        const resized = await sharp(cleanedBuffer)
          .resize({ width, height, fit: 'cover', position: 'centre' })
          .webp()
          .toBuffer();
        await writeFile(join(COVERS_DIR, filenames[mode]), resized);
        written.push(filenames[mode]);
      }
    } catch (err) {
      await Promise.all(
        written.map((f) =>
          unlinkUploadFile(COVERS_DIR, f).catch(() => undefined),
        ),
      );
      this.logger.warn(
        `Échec de génération des dérivées de couverture : ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(INVALID_COVER_IMAGE_MESSAGE);
    }

    const newCoverImageUrl = `${COVERS_URL_PREFIX}${stem}${COVER_DERIVATIVE_EXT}`;
    try {
      await this.prisma.partie.update({
        where: { id },
        data: { coverImageUrl: newCoverImageUrl },
      });
    } catch (e) {
      // Les nouveaux fichiers ne sont référencés nulle part : DB en échec, nettoyage immédiat
      // plutôt que de laisser des fichiers orphelins sur disque (patron portrait).
      await Promise.all(
        written.map((f) =>
          unlinkUploadFile(COVERS_DIR, f).catch(() => undefined),
        ),
      );
      throw e;
    }

    if (partie.coverImageUrl) {
      await this.deleteCoverFiles(partie.coverImageUrl);
    }

    // AD-14 : les autres membres continuent de voir l'ancienne identité visuelle jusqu'à un
    // rechargement complet sans cette émission — `emitPartieAndMembersSafe` n'a pas encore été
    // appelée pour cette mutation (contrairement à `close()`/`reopen()`), donc `partieTopic` n'a
    // pas déjà été émis ailleurs.
    await this.emitPartieAndMembersSafe(id, partie.mjId);

    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    const updated = await this.prisma.partie.findUniqueOrThrow({
      where: { id },
    });
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  /** Retire l'image de couverture (AC3, AC4) — MJ seul. La bannière générée reprend sa place. */
  async removeCoverImage(id: string, userId: string): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);

    await this.prisma.partie.update({
      where: { id },
      data: { coverImageUrl: null },
    });

    if (partie.coverImageUrl) {
      await this.deleteCoverFiles(partie.coverImageUrl);
    }

    await this.emitPartieAndMembersSafe(id, partie.mjId);

    const [hasScenario, favorite] = await Promise.all([
      this.hasScenario(id),
      this.isFavorite(userId, id),
    ]);
    const updated = await this.prisma.partie.findUniqueOrThrow({
      where: { id },
    });
    return toPartieDto(updated, 'mj', hasScenario, favorite);
  }

  /**
   * Lecture d'une dérivée de couverture (AC8, AC9) — mêmes règles d'accès que `findOneDto`
   * (`getViewable`, MJ ou membre), contrairement aux mutations (MJ seul). Retourne `null` si la
   * partie n'a pas de couverture, ou si le fichier référencé a disparu du disque (base et disque
   * désynchronisés) — **jamais une exception** : CAP-20 impose qu'aucune partie ne soit jamais
   * nue, c'est au contrôleur/au front de retomber sur la bannière générée, pas à cette méthode de
   * faire échouer la requête.
   */
  async getCoverFile(
    id: string,
    userId: string,
    mode: ListViewMode,
  ): Promise<{
    buffer: Buffer;
    mime: DetectedImageMime;
    version: string;
  } | null> {
    const partie = await this.getViewable(id, userId);
    if (!partie.coverImageUrl) return null;

    const stem = this.coverStem(partie.coverImageUrl);
    if (!stem) return null;

    try {
      const buffer = await readFile(
        join(COVERS_DIR, this.coverDerivativeFilenames(stem)[mode]),
      );
      return { buffer, mime: COVER_DERIVATIVE_MIME, version: stem };
    } catch {
      return null;
    }
  }

  /** Double émission temps réel (AD-14) pour toute mutation partagée à l'échelle d'une Partie :
   *  `partie:{id}` pour l'écran de détail déjà connecté, `user:{id}` pour chaque membre (MJ inclus)
   *  afin que sa propre liste de parties (Dashboard) reflète le changement sans recharger. */
  private async emitPartieAndMembers(
    partieId: string,
    mjId: string,
  ): Promise<void> {
    this.realtimeEvents.emit(partieTopic(partieId));
    const { participants } = await this.resolveParticipants(partieId, mjId);
    for (const p of participants) this.realtimeEvents.emit(userTopic(p.userId));
  }

  /** Variante de `emitPartieAndMembers` qui n'échoue jamais l'appelant (`close()`/`reopen()`) —
   *  appelée après que la mutation DB a déjà été committée, une erreur ici ne doit jamais faire
   *  croire au client que la clôture/réouverture a échoué alors qu'elle a bien eu lieu (revue de
   *  code, Story 29.6). */
  private async emitPartieAndMembersSafe(
    partieId: string,
    mjId: string,
  ): Promise<void> {
    try {
      await this.emitPartieAndMembers(partieId, mjId);
    } catch (err) {
      this.logger.warn(
        `Échec de l'émission temps réel après mutation de la partie ${partieId} : ${String(err)}`,
      );
    }
  }

  /** Variante d'`emitPartieAndMembers` qui n'émet PAS `partieTopic` — réservée aux appelants qui
   *  l'ont déjà émis eux-mêmes (revue de code, Story 29.7 : `emitPartieAndMembersSafe` d'origine
   *  causait une double émission `partie:{id}` sur chaque point d'appel de
   *  `notifyPartieSignalsChanged`, qui a tous déjà leur propre `realtimeEvents.emit(partieTopic(...))`
   *  juste avant). */
  private async emitMembersOnly(partieId: string, mjId: string): Promise<void> {
    const { participants } = await this.resolveParticipants(partieId, mjId);
    for (const p of participants) this.realtimeEvents.emit(userTopic(p.userId));
  }

  /** Variante sans échec d'`emitMembersOnly` — même garde que `emitPartieAndMembersSafe`. */
  private async emitMembersOnlySafe(
    partieId: string,
    mjId: string,
  ): Promise<void> {
    try {
      await this.emitMembersOnly(partieId, mjId);
    } catch (err) {
      this.logger.warn(
        `Échec de l'émission temps réel (membres) après mutation de la partie ${partieId} : ${String(err)}`,
      );
    }
  }

  /** Point d'entrée public (Story 29.7, AD-14/AD-3) — réutilisé par les services propriétaires des
   *  mutations qui affectent un signal de FR-12 (`CharacterService`, `HommeDragonService`,
   *  `ScenariosService`, `PollService`, `InvitationsService`, `InviteLinksService`, tous injectent
   *  déjà `PartiesService`). Ces appelants émettent **déjà** `partieTopic` eux-mêmes juste avant
   *  d'appeler cette méthode — elle n'émet donc que `userTopic` par membre (`emitMembersOnlySafe`),
   *  jamais `emitPartieAndMembersSafe` qui réémettrait `partieTopic` une seconde fois. */
  async notifyPartieSignalsChanged(
    partieId: string,
    mjId: string,
  ): Promise<void> {
    await this.emitMembersOnlySafe(partieId, mjId);
  }

  /** Retourne MJ + membres (dédoublonnés) avec leur pseudo et leur nom affiché. */
  private async resolveParticipants(partieId: string, mjId: string) {
    const [mjUser, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: mjId },
        select: { id: true, pseudo: true, displayName: true },
      }),
      this.prisma.membership.findMany({
        where: { partieId },
        // Story 36.8 — ORDRE FIXE DE LA TROUPE. La couche « disponibilité du groupe » rend une
        // pastille par membre et fait porter l'identité par la POSITION (FR-53) : sans clé de
        // tri, deux requêtes successives pouvaient permuter deux personnes, et la promesse
        // « la position identifie la personne » devenait fausse par intermittence. Même clé que
        // `listMembers()`, qui l'a depuis toujours — les deux listes s'accordent désormais.
        // Revue de code : `userId` en départage — deux membres invités dans le même lot peuvent
        // partager le même `joinedAt`, ce qui rendrait `joinedAt` seul insuffisant pour garantir
        // un ordre stable d'une requête à l'autre.
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        include: {
          user: { select: { id: true, pseudo: true, displayName: true } },
        },
      }),
    ]);

    const seen = new Set<string>();
    const participants: {
      userId: string;
      pseudo: string;
      displayName: string;
    }[] = [];

    if (mjUser) {
      seen.add(mjUser.id);
      participants.push({
        userId: mjUser.id,
        pseudo: mjUser.pseudo,
        displayName: mjUser.displayName,
      });
    }
    for (const m of memberships) {
      if (!seen.has(m.user.id)) {
        seen.add(m.user.id);
        participants.push({
          userId: m.user.id,
          pseudo: m.user.pseudo,
          displayName: m.user.displayName,
        });
      }
    }
    return { participants, memberships };
  }

  async getAvailableSlots(
    partieId: string,
    userId: string,
    weeks: number,
    from?: string,
    to?: string,
  ): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
    });
    if (!partie) throw new NotFoundException('Partie introuvable');

    const { participants, memberships } = await this.resolveParticipants(
      partieId,
      partie.mjId,
    );

    const isMj = partie.mjId === userId;
    const isMember = memberships.some((m) => m.userId === userId);
    if (!isMj && !isMember) throw new ForbiddenException();

    const participantIds = participants.map((p) => p.userId);
    // getActiveDeclarationsWithSeances (pas getActiveDeclarations) : injecte l'indisponibilité
    // dérivée des séances datées d'AUTRES parties des membres (AD-9, Story 30.5) — source unique
    // partagée par getAvailableSlots (vue MJ) et getHeatmap (vue joueur), AC6.
    const declarationsMap =
      await this.availability.getActiveDeclarationsWithSeances(participantIds);

    if (!!from !== !!to) {
      throw new BadRequestException(
        'from and to must both be provided together',
      );
    }

    const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
    const all: AvailableSlotDto[] = [];

    if (from && to) {
      const fromMs = new Date(from + 'T00:00:00Z').getTime();
      const toMs = new Date(to + 'T00:00:00Z').getTime();
      if (fromMs > toMs)
        throw new BadRequestException('from must be before or equal to to');
      if (toMs - fromMs > 366 * 86_400_000)
        throw new BadRequestException('Date range cannot exceed 366 days');
      for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
        const dateUtc = new Date(ms);
        for (const slot of SLOTS) {
          const members = participants.map((p) => ({
            userId: p.userId,
            pseudo: p.pseudo,
            displayName: p.displayName,
            status: this.availability.computeSlotStatus(
              declarationsMap.get(p.userId) ?? [],
              dateUtc,
              slot,
            ),
          }));
          all.push({
            date: dateUtc.toISOString().substring(0, 10),
            slot,
            members,
          });
        }
      }
    } else {
      const now = new Date();
      const todayUtcMidnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      for (let d = 0; d < weeks * 7; d++) {
        const dateUtc = new Date(todayUtcMidnight + d * 86_400_000);
        for (const slot of SLOTS) {
          const members = participants.map((p) => ({
            userId: p.userId,
            pseudo: p.pseudo,
            displayName: p.displayName,
            status: this.availability.computeSlotStatus(
              declarationsMap.get(p.userId) ?? [],
              dateUtc,
              slot,
            ),
          }));
          all.push({
            date: dateUtc.toISOString().substring(0, 10),
            slot,
            members,
          });
        }
      }
    }

    // Q1: hard-exclude tout créneau où le MJ est UNAVAILABLE (prérequis organisateur)
    const mjId = partie.mjId;
    const filtered = all.filter((s) => {
      const mj = s.members.find((m) => m.userId === mjId);
      return mj?.status !== 'UNAVAILABLE';
    });

    // Priorité : 0=tous dispos, 1=mixte sans refus, 2=tous inconnus, 3=au moins un refus
    const priority = (s: AvailableSlotDto): number => {
      const hasUnavail = s.members.some((m) => m.status === 'UNAVAILABLE');
      const availCount = s.members.filter(
        (m) => m.status === 'AVAILABLE',
      ).length;
      if (hasUnavail) return 3;
      if (availCount === s.members.length) return 0;
      if (availCount > 0) return 1;
      return 2;
    };

    const slotIdx = (s: AvailableSlotDto) =>
      SLOTS.indexOf(s.slot as (typeof SLOTS)[number]);

    const sorted = [...filtered].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (pa === 1) {
        const ca = a.members.filter((m) => m.status === 'AVAILABLE').length;
        const cb = b.members.filter((m) => m.status === 'AVAILABLE').length;
        if (ca !== cb) return cb - ca;
      }
      const dateCmp = a.date.localeCompare(b.date);
      return dateCmp !== 0 ? dateCmp : slotIdx(a) - slotIdx(b);
    });

    const limited = sorted.slice(0, 20);

    if (isMj) return limited;

    return limited.map(({ date, slot, members }) => ({
      date,
      slot,
      available: members.filter((m) => m.status === 'AVAILABLE').length,
      unavailable: members.filter((m) => m.status === 'UNAVAILABLE').length,
      unknown: members.filter((m) => m.status === 'UNKNOWN').length,
      total: members.length,
    }));
  }

  async getHeatmap(
    partieId: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<AggregatedSlotDto[]> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
    });
    if (!partie) throw new NotFoundException('Partie introuvable');

    const { participants, memberships } = await this.resolveParticipants(
      partieId,
      partie.mjId,
    );

    const isMj = partie.mjId === userId;
    const isMember = memberships.some((m) => m.userId === userId);
    if (!isMj && !isMember) throw new ForbiddenException();

    const participantIds = participants.map((p) => p.userId);
    // getActiveDeclarationsWithSeances (pas getActiveDeclarations) : injecte l'indisponibilité
    // dérivée des séances datées d'AUTRES parties des membres (AD-9, Story 30.5) — source unique
    // partagée par getAvailableSlots (vue MJ) et getHeatmap (vue joueur), AC6.
    const declarationsMap =
      await this.availability.getActiveDeclarationsWithSeances(participantIds);

    const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
    const fromMs = new Date(from + 'T00:00:00Z').getTime();
    const toMs = new Date(to + 'T00:00:00Z').getTime();
    if (fromMs > toMs)
      throw new BadRequestException('from must be before or equal to to');
    if (toMs - fromMs > 45 * 86_400_000)
      throw new BadRequestException('Date range must not exceed 45 days');
    const results: AggregatedSlotDto[] = [];

    for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
      const dateUtc = new Date(ms);
      const dateStr = dateUtc.toISOString().substring(0, 10);
      for (const slot of SLOTS) {
        const statuses = participants.map((p) =>
          this.availability.computeSlotStatus(
            declarationsMap.get(p.userId) ?? [],
            dateUtc,
            slot,
          ),
        );
        results.push({
          date: dateStr,
          slot,
          available: statuses.filter((s) => s === 'AVAILABLE').length,
          unavailable: statuses.filter((s) => s === 'UNAVAILABLE').length,
          unknown: statuses.filter((s) => s === 'UNKNOWN').length,
          total: participants.length,
          // Story 36.8 (FR-53) — le détail nominatif, POUR LE SEUL MJ. Les statuts par membre
          // sont déjà calculés juste au-dessus : jusqu'ici on les agrégeait et on jetait les
          // identités. Aucune requête nouvelle n'est émise ici.
          //
          // 🚨 La garde est `isMj`, celle qui existe déjà en tête de méthode — ne pas la
          // dupliquer, ne pas la déplacer. Le spread conditionnel OMET la clé pour un joueur ;
          // un `members: isMj ? … : []` exposerait la forme de la donnée, et un `: undefined`
          // laisserait la clé dans l'objet. L'absence ne dit rien, c'est ce qu'on veut.
          ...(isMj
            ? {
                members: participants.map((p, i) => ({
                  userId: p.userId,
                  pseudo: p.pseudo,
                  displayName: p.displayName,
                  status: statuses[i],
                })),
              }
            : {}),
        });
      }
    }

    return results;
  }
}
