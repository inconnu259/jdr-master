import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AggregatedSlotDto,
  AvailableSlotDto,
  PartieDto,
  PartieStatus,
} from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from '../realtime/realtime-events.service';
import { CreatePartieDto } from './dto/create-partie.dto';
import { UpdatePartieDto } from './dto/update-partie.dto';

/**
 * Projection explicite (AD-15, Story 29.1) — énumère les champs renvoyés, jamais un objet Prisma
 * propagé tel quel. `coverImageUrl` volontairement absent (story 29.10).
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
      return toPartieDto(partie, 'mj', dto.kind === 'ONE_SHOT');
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
      const hasScenarioIds = await this.hasScenarioByPartieId(
        memberships.map((m) => m.partie.id),
      );
      return memberships.map((m) =>
        toPartieDto(m.partie, 'player', hasScenarioIds.has(m.partie.id)),
      );
    }
    const parties = await this.prisma.partie.findMany({
      where: { mjId: userId },
      orderBy: { createdAt: 'desc' },
    });
    const hasScenarioIds = await this.hasScenarioByPartieId(
      parties.map((p) => p.id),
    );
    return parties.map((p) => toPartieDto(p, 'mj', hasScenarioIds.has(p.id)));
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
    const hasScenario = await this.hasScenario(id);
    const dto = toPartieDto(partie, role, hasScenario);
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
    return { ok: true };
  }

  async update(
    id: string,
    userId: string,
    dto: UpdatePartieDto,
  ): Promise<PartieDto> {
    await this.getOwned(id, userId);
    const updated = await this.prisma.partie.update({
      where: { id },
      data: { ...dto },
    });
    this.realtimeEvents.emit(partieTopic(id));
    const hasScenario = await this.hasScenario(id);
    // getOwned() a déjà garanti que l'appelant est le MJ (revue de code, AC6).
    return toPartieDto(updated, 'mj', hasScenario);
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
    const hasScenario = await this.hasScenario(id);
    return toPartieDto(updated, 'mj', hasScenario);
  }

  /** Revient sur une clôture (AD-8, Story 29.6) — MJ uniquement. */
  async reopen(id: string, userId: string): Promise<PartieDto> {
    const partie = await this.getOwned(id, userId);
    const updated = await this.prisma.partie.update({
      where: { id },
      data: { closedAt: null },
    });
    await this.emitPartieAndMembersSafe(id, partie.mjId);
    const hasScenario = await this.hasScenario(id);
    return toPartieDto(updated, 'mj', hasScenario);
  }

  async remove(id: string, userId: string) {
    await this.getOwned(id, userId);
    await this.prisma.partie.delete({ where: { id } });
    return { ok: true };
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

  /** Retourne MJ + membres (dédoublonnés) avec leur pseudo et leur nom affiché. */
  private async resolveParticipants(partieId: string, mjId: string) {
    const [mjUser, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: mjId },
        select: { id: true, pseudo: true, displayName: true },
      }),
      this.prisma.membership.findMany({
        where: { partieId },
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
    const declarationsMap =
      await this.availability.getActiveDeclarations(participantIds);

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
    const declarationsMap =
      await this.availability.getActiveDeclarations(participantIds);

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
        });
      }
    }

    return results;
  }
}
