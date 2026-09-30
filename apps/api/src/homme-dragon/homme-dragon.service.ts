import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HommeDragon } from '@prisma/client';
import type {
  ChooseArtefactCadeauDto as ChooseArtefactCadeauPayload,
  ChooseEveilPowerDto as ChooseEveilPowerPayload,
  CreateHommeDragonDto,
  HommeDragonDto,
  HommeDragonSheetData,
  MyHommeDragonDto,
  UpdateHommeDragonDto,
} from '@master-jdr/shared';
import {
  ARTEFACT_CADEAU_LEVEL,
  validateHommeDragon,
  computeHommeDragonDerived,
  levelForScenariosPasse,
  pendingEveilLevels,
  type HommeDragonArtefactCatalogEntry,
} from '@master-jdr/game-rules';
import { PrismaService } from '../prisma/prisma.service';
import { hasPrismaErrorCode } from '../common/prisma-error.util';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';

@Injectable()
export class HommeDragonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly gameSystems: GameSystemService,
    private readonly scenarios: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async create(
    partieId: string,
    userId: string,
    dto: CreateHommeDragonDto,
  ): Promise<HommeDragonDto> {
    const partie = await this.parties.getOwned(partieId, userId);

    if (partie.gameSystemId !== RYUUTAMA_ID) {
      throw new BadRequestException(
        `L'Homme Dragon n'existe que pour Ryuutama, pas pour "${partie.gameSystemId}"`,
      );
    }

    const catalog = await this.buildArtefactCatalog(partie.gameSystemId);
    const sheetData = {
      ...dto,
      mondesProteges: dto.mondesProteges ?? partie.name,
    };
    const result = validateHommeDragon(sheetData, catalog);
    if (!result.valid) {
      throw new BadRequestException(result.errors);
    }

    try {
      const hommeDragon = await this.prisma.hommeDragon.create({
        data: {
          userId,
          partieId,
          gameSystemId: partie.gameSystemId,
          sheetData: sheetData,
        },
      });
      this.realtimeEvents.emit(partieTopic(partieId));
      // HOMME_DRAGON_A_CREER (Story 29.7, AD-14) : en plus de partieTopic ci-dessus, jamais en
      // remplacement — getOwned() garantit que userId est déjà le MJ.
      await this.parties.notifyPartieSignalsChanged(partieId, userId);
      return this.buildDto(hommeDragon, partieId, userId);
    } catch (e) {
      if (hasPrismaErrorCode(e, 'P2002')) {
        throw new ConflictException('Vous avez déjà un Homme Dragon sur cette Partie');
      }
      throw e;
    }
  }

  /**
   * AD-2 : pas de verrouillage optimiste — MJ seul écrivain, `update()` simple. Race jamais
   * éditable (absente d'`UpdateHommeDragonDto`). Toujours revalidé contre le catalogue (revue de
   * code : un `dto` sans `artefact` contournait jusqu'ici la règle « nom obligatoire »).
   * `dto.artefact` est fusionné avec l'artefact existant (revue de code : un spread au niveau
   * racine écrasait `nom`/`inscription` personnalisés dès qu'un `{ key }` seul était envoyé).
   */
  async update(
    partieId: string,
    userId: string,
    dto: UpdateHommeDragonDto,
  ): Promise<HommeDragonDto> {
    const partie = await this.parties.getOwned(partieId, userId);

    // Revue de code : sans cette garde, un MJ pouvait modifier une fiche Homme Dragon orpheline
    // après avoir fait basculer sa Partie hors Ryuutama (UpdatePartieDto.gameSystemId est éditable).
    if (partie.gameSystemId !== RYUUTAMA_ID) {
      throw new BadRequestException(
        `L'Homme Dragon n'existe que pour Ryuutama, pas pour "${partie.gameSystemId}"`,
      );
    }

    const existing = await this.prisma.hommeDragon.findUnique({
      where: {
        userId_partieId_gameSystemId: {
          userId,
          partieId,
          gameSystemId: RYUUTAMA_ID,
        },
      },
    });
    if (!existing) throw new NotFoundException('Homme Dragon introuvable');

    const existingSheetData = existing.sheetData as unknown as HommeDragonSheetData;
    const sheetData = {
      ...existingSheetData,
      ...dto,
      artefact: dto.artefact
        ? { ...existingSheetData.artefact, ...dto.artefact }
        : existingSheetData.artefact,
    };

    const catalog = await this.buildArtefactCatalog(partie.gameSystemId);
    const result = validateHommeDragon(sheetData, catalog);
    if (!result.valid) {
      throw new BadRequestException(result.errors);
    }

    const updated = await this.prisma.hommeDragon.update({
      where: {
        userId_partieId_gameSystemId: {
          userId,
          partieId,
          gameSystemId: RYUUTAMA_ID,
        },
      },
      data: { sheetData: sheetData },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    return this.buildDto(updated, partieId, userId);
  }

  /**
   * Choix d'un pouvoir d'éveil pour un niveau franchi (Story 10.4) — MJ seul via `getOwned`, même
   * garde que `create()`/`update()`. Décision utilisateur : le catalogue `eveilPower` est un pool
   * commun à toutes les races, sans niveau de déblocage par pouvoir — un pouvoir ne peut donc être
   * choisi qu'une seule fois, quel que soit le niveau pour lequel il est choisi.
   */
  /**
   * Revue de code : verrou de ligne explicite `SELECT ... FOR UPDATE` (même pattern que
   * `ScenariosService`, AD-5/AD-10) — sans lui, deux appels concurrents (ou un double-clic
   * contournant le bouton désactivé côté frontend) liraient le même `sheetData.eveilPowers` et
   * s'écraseraient mutuellement à l'écriture. `sheetData` est copié (`{ ...sheetData }`) plutôt
   * que muté en place, pour ne jamais modifier l'objet renvoyé par Prisma avant d'avoir validé
   * la requête.
   */
  async chooseEveilPower(
    partieId: string,
    userId: string,
    dto: ChooseEveilPowerPayload,
  ): Promise<HommeDragonDto> {
    const partie = await this.parties.getOwned(partieId, userId);
    if (partie.gameSystemId !== RYUUTAMA_ID) {
      throw new BadRequestException(
        `L'Homme Dragon n'existe que pour Ryuutama, pas pour "${partie.gameSystemId}"`,
      );
    }

    // Même calcul que buildDto() (niveau depuis historique.length) — dupliqué ici plutôt que
    // factorisé car chooseEveilPower() n'a pas besoin du reste du DTO (voyageursProteges,
    // historique complet) avant d'avoir validé la requête ; buildDto() est appelé à la toute fin
    // pour construire la réponse, une fois l'écriture faite.
    const voyageurs = await this.computeVoyageursProteges(partieId, userId);
    const historique = await this.computeHistorique(partieId, userId, voyageurs);
    const level = levelForScenariosPasse(historique.length);
    const catalogKeys = await this.buildEveilPowerCatalogKeys(partie.gameSystemId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "HommeDragon" WHERE "userId" = ${userId} AND "partieId" = ${partieId} AND "gameSystemId" = ${RYUUTAMA_ID} FOR UPDATE`;

      const existing = await tx.hommeDragon.findUnique({
        where: {
          userId_partieId_gameSystemId: {
            userId,
            partieId,
            gameSystemId: RYUUTAMA_ID,
          },
        },
      });
      if (!existing) throw new NotFoundException('Homme Dragon introuvable');

      const existingSheetData = existing.sheetData as unknown as HommeDragonSheetData;
      const appliedEveilPowers: { level: number; key: string }[] =
        existingSheetData.eveilPowers ?? [];

      const pending = pendingEveilLevels(
        level,
        appliedEveilPowers.map((e) => e.level),
      );
      if (!pending.includes(dto.level)) {
        throw new BadRequestException(
          "Ce niveau n'est pas en attente d'un choix de pouvoir d'éveil",
        );
      }

      if (!catalogKeys.has(dto.key)) {
        throw new BadRequestException("Pouvoir d'éveil invalide");
      }
      // Pool commun (décision utilisateur) : un pouvoir n'est jamais proposé deux fois, quel que
      // soit le niveau pour lequel il aurait déjà été choisi.
      if (appliedEveilPowers.some((e) => e.key === dto.key)) {
        throw new BadRequestException("Ce pouvoir d'éveil a déjà été choisi");
      }

      const sheetData = {
        ...existingSheetData,
        eveilPowers: [...appliedEveilPowers, { level: dto.level, key: dto.key }],
      };
      return tx.hommeDragon.update({
        where: {
          userId_partieId_gameSystemId: {
            userId,
            partieId,
            gameSystemId: RYUUTAMA_ID,
          },
        },
        data: { sheetData: sheetData },
      });
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    return this.buildDto(updated, partieId, userId);
  }

  /**
   * Choix de l'artefact cadeau du niveau 4 (Story 33.7) — MJ seul via `getOwned`, Ryuutama seul.
   * Choix unique et définitif : refusé si le niveau est < 4, si un cadeau existe déjà, si la clé
   * est absente du catalogue `hommeDragonArtefact` ou si l'artefact est de la race du dragon.
   * Même mécanique que `chooseEveilPower()` : niveau recalculé côté serveur, verrou de ligne
   * `SELECT ... FOR UPDATE` dans une transaction (deux appels concurrents ne peuvent pas
   * s'écraser), `sheetData` copié plutôt que muté.
   */
  async chooseArtefactCadeau(
    partieId: string,
    userId: string,
    dto: ChooseArtefactCadeauPayload,
  ): Promise<HommeDragonDto> {
    const partie = await this.parties.getOwned(partieId, userId);
    if (partie.gameSystemId !== RYUUTAMA_ID) {
      throw new BadRequestException(
        `L'Homme Dragon n'existe que pour Ryuutama, pas pour "${partie.gameSystemId}"`,
      );
    }

    const voyageurs = await this.computeVoyageursProteges(partieId, userId);
    const historique = await this.computeHistorique(partieId, userId, voyageurs);
    const level = levelForScenariosPasse(historique.length);
    const catalog = await this.buildArtefactCatalog(partie.gameSystemId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "HommeDragon" WHERE "userId" = ${userId} AND "partieId" = ${partieId} AND "gameSystemId" = ${RYUUTAMA_ID} FOR UPDATE`;

      const existing = await tx.hommeDragon.findUnique({
        where: {
          userId_partieId_gameSystemId: {
            userId,
            partieId,
            gameSystemId: RYUUTAMA_ID,
          },
        },
      });
      if (!existing) throw new NotFoundException('Homme Dragon introuvable');

      const existingSheetData = existing.sheetData as unknown as HommeDragonSheetData;

      if (level < ARTEFACT_CADEAU_LEVEL) {
        throw new BadRequestException(
          `L'artefact cadeau n'est disponible qu'à partir du niveau ${ARTEFACT_CADEAU_LEVEL}`,
        );
      }
      if (existingSheetData.artefactCadeau) {
        throw new BadRequestException("L'artefact cadeau a déjà été choisi");
      }

      const entry = catalog.find((e) => e.key === dto.key);
      // Entrée sans race (mappée à '' par buildArtefactCatalog) : jamais un cadeau valide.
      if (!entry || !entry.race) {
        throw new BadRequestException('Artefact cadeau invalide');
      }
      if (entry.race === existingSheetData.race) {
        throw new BadRequestException(
          "L'artefact cadeau doit appartenir à une autre race que celle de l'Homme Dragon",
        );
      }

      const sheetData = {
        ...existingSheetData,
        artefactCadeau: { key: dto.key },
      };
      return tx.hommeDragon.update({
        where: {
          userId_partieId_gameSystemId: {
            userId,
            partieId,
            gameSystemId: RYUUTAMA_ID,
          },
        },
        data: { sheetData: sheetData },
      });
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    return this.buildDto(updated, partieId, userId);
  }

  /**
   * `hommeDragon.userId` EST le MJ (contrainte unique `[userId, partieId, gameSystemId]`, toujours
   * créé par le MJ via `getOwned` — jamais un joueur). Utilisé pour l'export PDF (Story 10.5),
   * `HommeDragonDto` n'exposant pas le pseudo du propriétaire.
   */
  async getOwnerPseudo(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pseudo: true },
    });
    return user.pseudo;
  }

  /**
   * Lecture ouverte à tout membre (NFR1) — cible toujours le Homme Dragon DU MJ de la Partie
   * (`partie.mjId`), pas celui du `userId` courant : un joueur qui consulte n'en a pas le sien.
   * `null` = pas encore créé, jamais un 404 (état normal, pas une erreur) — y compris si la Partie
   * a basculé hors Ryuutama depuis (revue de code : même raisonnement que `update()`, une fiche
   * orpheline n'est plus « la » fiche Homme Dragon de cette Partie).
   */
  async findOne(partieId: string, userId: string): Promise<HommeDragonDto | null> {
    const partie = await this.parties.getViewable(partieId, userId);
    if (partie.gameSystemId !== RYUUTAMA_ID) return null;

    const hommeDragon = await this.prisma.hommeDragon.findUnique({
      where: {
        userId_partieId_gameSystemId: {
          userId: partie.mjId,
          partieId,
          gameSystemId: RYUUTAMA_ID,
        },
      },
    });
    return hommeDragon ? this.buildDto(hommeDragon, partieId, userId) : null;
  }

  /**
   * Lecture agrégée pour « Personnages » (Story 33.5) : les Hommes Dragons de l'appelant, en une
   * seule requête (jamais une requête par partie) et sans `buildDto` (qui calcule niveau,
   * voyageurs et historique partie par partie). Scopé à l'appelant ET à ses parties dont il est
   * encore MJ : un ancien MJ ne reçoit plus le dragon d'une partie qu'il ne mène plus, et aucun
   * autre membre ne reçoit jamais celui du MJ. Retourne un tableau — jamais « un par partie »
   * figé (Story 33.8).
   */
  async findMine(userId: string): Promise<MyHommeDragonDto[]> {
    const rows = await this.prisma.hommeDragon.findMany({
      where: { userId, partie: { mjId: userId } },
      include: { partie: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      // Colonne JSON : relecture vers le contrat au seul point de sortie (cf. buildDto).
      const sheetData = row.sheetData as unknown as HommeDragonSheetData;
      return {
        id: row.id,
        partieId: row.partie.id,
        partieName: row.partie.name,
        gameSystemId: row.gameSystemId,
        nom: sheetData.nom ?? '',
        race: sheetData.race,
        ...(sheetData.avatar ? { avatar: sheetData.avatar } : {}),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async buildArtefactCatalog(
    gameSystemId: string,
  ): Promise<HommeDragonArtefactCatalogEntry[]> {
    const content = await this.gameSystems.getContent(gameSystemId);
    return (content['hommeDragonArtefact'] ?? []).map((entry) => ({
      key: entry.key,
      race: (entry.data as { race?: string })?.race ?? '',
    }));
  }

  private async buildEveilPowerCatalogKeys(gameSystemId: string): Promise<Set<string>> {
    const content = await this.gameSystems.getContent(gameSystemId);
    return new Set((content['eveilPower'] ?? []).map((entry) => entry.key));
  }

  /**
   * AD-3 : `voyageursProteges`/`historique` sont calculés à la lecture, jamais stockés — cette
   * règle s'applique à TOUTE réponse contenant l'état de la fiche (`create`/`update`/`findOne`),
   * pas seulement `findOne()`, pour ne jamais renvoyer une forme de DTO incohérente selon l'endpoint
   * appelé (Story 10.2).
   */
  private async buildDto(
    hommeDragon: HommeDragon,
    partieId: string,
    userId: string,
  ): Promise<HommeDragonDto> {
    // Revue de code : voyageursProteges calculé une seule fois puis partagé avec computeHistorique
    // (au lieu d'un 2e appel interne à listMembers) — évite un aller-retour Prisma redondant et une
    // divergence possible entre les deux champs si la composition de la Partie changeait entre deux
    // appels non coordonnés.
    const voyageursProteges = await this.computeVoyageursProteges(partieId, userId);
    const historique = await this.computeHistorique(partieId, userId, voyageursProteges);
    // Story 10.3 : `historique` est déjà filtré `status === 'PASSE'` — sa longueur EST le nombre
    // de scénarios Passé recherché, aucune requête Prisma supplémentaire nécessaire.
    const level = levelForScenariosPasse(historique.length);
    const { PS } = computeHommeDragonDerived(level);
    // Colonne JSON : Prisma la rend en `JsonValue`, sans forme garantie. Relecture vers le type
    // du contrat ici, au seul point de sortie.
    const sheetData = hommeDragon.sheetData as unknown as HommeDragonSheetData;
    const eveilPowers = (sheetData.eveilPowers ?? []) as {
      level: number;
      key: string;
    }[];
    const pending = pendingEveilLevels(
      level,
      eveilPowers.map((e) => e.level),
    );
    return {
      id: hommeDragon.id,
      userId: hommeDragon.userId,
      partieId: hommeDragon.partieId,
      gameSystemId: hommeDragon.gameSystemId,
      sheetData,
      createdAt: hommeDragon.createdAt.toISOString(),
      updatedAt: hommeDragon.updatedAt.toISOString(),
      voyageursProteges,
      historique,
      derived: { level, PS },
      eveilPowers,
      pendingEveilLevels: pending,
    };
  }

  private async computeVoyageursProteges(
    partieId: string,
    userId: string,
  ): Promise<{ userId: string; pseudo: string }[]> {
    const members = await this.parties.listMembers(partieId, userId);
    return members.map((m) => ({ userId: m.userId, pseudo: m.pseudo }));
  }

  private async computeHistorique(
    partieId: string,
    userId: string,
    voyageurs: { userId: string; pseudo: string }[],
  ): Promise<{ scenarioTitle: string; date: string; participants: string[] }[]> {
    const scenarios = await this.scenarios.findAllForPartie(partieId, userId);
    return scenarios
      .filter((s) => s.status === 'PASSE' && s.closedAt !== null)
      .map((s) => ({
        scenarioTitle: s.title,
        date: s.closedAt as string,
        // AD-4 (Story 8.1) : ScenarioDto.participants n'est peuplé QUE pour CAMPAGNE_EPISODIQUE.
        // Pour ONE_SHOT/CAMPAGNE_LINEAIRE (undefined), tous les membres actuels sont réputés
        // avoir participé — pas d'inscription individuelle pour ces deux kinds.
        participants: s.participants?.map((p) => p.pseudo) ?? voyageurs.map((v) => v.pseudo),
      }));
  }
}
