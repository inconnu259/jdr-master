import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateHommeDragonDto, HommeDragonDto, UpdateHommeDragonDto } from '@master-jdr/shared';
import { validateHommeDragon, type HommeDragonArtefactCatalogEntry } from '@master-jdr/game-rules';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';

@Injectable()
export class HommeDragonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly gameSystems: GameSystemService,
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
      return toDto(hommeDragon);
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
    return toDto(updated);
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
    return hommeDragon ? toDto(hommeDragon) : null;
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
}

function toDto(hommeDragon: any): HommeDragonDto {
  return {
    id: hommeDragon.id,
    userId: hommeDragon.userId,
    partieId: hommeDragon.partieId,
    gameSystemId: hommeDragon.gameSystemId,
    sheetData: hommeDragon.sheetData,
    createdAt: hommeDragon.createdAt.toISOString(),
    updatedAt: hommeDragon.updatedAt.toISOString(),
  };
}
