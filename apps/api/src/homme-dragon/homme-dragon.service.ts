import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChooseEveilPowerDto as ChooseEveilPowerPayload,
  CreateHommeDragonDto,
  HommeDragonDto,
  UpdateHommeDragonDto,
} from '@master-jdr/shared';
import {
  validateHommeDragon,
  computeHommeDragonDerived,
  levelForScenariosPasse,
  pendingEveilLevels,
  type HommeDragonArtefactCatalogEntry,
} from '@master-jdr/game-rules';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';

@Injectable()
export class HommeDragonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly gameSystems: GameSystemService,
    private readonly scenarios: ScenariosService,
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
          sheetData: sheetData as any,
        },
      });
      return this.buildDto(hommeDragon, partieId, userId);
    } catch (e: any) {
      if (e?.code === 'P2002') {
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

    const existingSheetData = existing.sheetData as any;
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
      data: { sheetData: sheetData as any },
    });
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
          userId_partieId_gameSystemId: { userId, partieId, gameSystemId: RYUUTAMA_ID },
        },
      });
      if (!existing) throw new NotFoundException('Homme Dragon introuvable');

      const existingSheetData = existing.sheetData as any;
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
        where: { userId_partieId_gameSystemId: { userId, partieId, gameSystemId: RYUUTAMA_ID } },
        data: { sheetData: sheetData as any },
      });
    });
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
    hommeDragon: any,
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
    const eveilPowers = ((hommeDragon.sheetData as any).eveilPowers ?? []) as {
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
      sheetData: hommeDragon.sheetData,
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
