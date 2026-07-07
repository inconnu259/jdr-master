import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CharacterDto } from '@master-jdr/shared';
import {
  computeDerived,
  validate,
  type RyuutamaCatalog,
  type RyuutamaSheetData,
} from '@master-jdr/game-rules';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { SUPPORTED_GAME_SYSTEMS } from '../game-systems/supported-game-systems';
import { CreateCharacterDto } from './dto/create-character.dto';
import type { PortraitCropDataDto } from './dto/portrait-crop-data.dto';
import {
  detectImageMime,
  extensionForImageMime,
  type DetectedImageMime,
} from './image-mime.util';
import {
  PORTRAITS_DIR,
  PORTRAITS_URL_PREFIX,
  extractPortraitFilename,
  readPortraitFile,
} from './portrait-storage.util';

@Injectable()
export class CharacterService {
  private readonly logger = new Logger(CharacterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly users: UsersService,
    private readonly gameSystems: GameSystemService,
  ) {}

  async create(
    partieId: string,
    userId: string,
    dto: CreateCharacterDto,
  ): Promise<CharacterDto> {
    const partie = await this.parties.getViewable(partieId, userId);

    if (!SUPPORTED_GAME_SYSTEMS.includes(dto.gameSystemId)) {
      throw new BadRequestException(
        `Système de jeu non supporté : ${dto.gameSystemId}`,
      );
    }

    const catalog = await this.buildRyuutamaCatalog(dto.gameSystemId);
    const sheetData = dto.sheetData as unknown as RyuutamaSheetData;
    const result = validate(sheetData, 'strict', catalog);
    if (!result.valid) {
      throw new BadRequestException(result.errors);
    }
    const derived = computeDerived(sheetData);

    try {
      const character = await this.prisma.character.create({
        data: {
          gameSystemId: dto.gameSystemId,
          sheetData: dto.sheetData as any,
          userId,
          partieId,
          derived: derived as any,
        },
      });
      const owner = await this.users.findById(userId);
      return toDto(character, owner?.pseudo ?? '', partie.mjId === userId);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          'Vous avez déjà un personnage sur cette partie',
        );
      }
      throw e;
    }
  }

  /**
   * Dérive le catalogue de validation Ryuutama du contenu réellement seedé en base
   * (`GameSystemService.getContent`), pour que `validate()` ne code plus en dur ses propres
   * listes déconnectées du contenu seed.
   */
  private async buildRyuutamaCatalog(
    gameSystemId: string,
  ): Promise<RyuutamaCatalog> {
    const content = await this.gameSystems.getContent(gameSystemId);
    const keysOf = (typeKey: string) =>
      (content[typeKey] ?? []).map((entry) => entry.key);
    // `entry.data` vient de `ContentEntry.data` (Json, aucune contrainte de forme en base) — la
    // garde vérifie que `values` est un tableau ET que chaque élément est bien un nombre, pas
    // seulement `Array.isArray()` (qui laisserait passer ex. ["8","4","6","6"] et produirait un
    // tri silencieusement faux via NaN dans `.sort((a, b) => a - b)`).
    const isNumberArray = (values: unknown): values is number[] =>
      Array.isArray(values) && values.every((v) => typeof v === 'number');
    const attributePatterns = (content['attributePattern'] ?? [])
      .map((entry) => (entry.data as { values?: unknown }).values)
      .filter(isNumberArray)
      .map((values) => [...values].sort((a, b) => a - b));

    return {
      validClasses: keysOf('class'),
      validTypes: keysOf('type'),
      validWeapons: keysOf('weaponCategory'),
      attributePatterns,
    };
  }

  async findOne(id: string, userId: string): Promise<CharacterDto> {
    const character = await this.prisma.character.findUnique({
      where: { id },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');

    // Le MJ a déjà été résolu par getOwned() pour un viewer non-propriétaire — pas besoin
    // de re-requêter la partie via resolveOwnerInfo() dans ce cas.
    let mjId: string | undefined;
    if (character.userId !== userId) {
      mjId = (await this.parties.getOwned(character.partieId, userId)).mjId;
    } else {
      mjId = (
        await this.prisma.partie.findUnique({
          where: { id: character.partieId },
          select: { mjId: true },
        })
      )?.mjId;
    }
    const owner = await this.users.findById(character.userId);
    return toDto(character, owner?.pseudo ?? '', mjId === character.userId);
  }

  async findByPartie(
    partieId: string,
    userId: string,
  ): Promise<CharacterDto[]> {
    const partie = await this.parties.getViewable(partieId, userId);
    const characters =
      partie.mjId === userId
        ? await this.prisma.character.findMany({ where: { partieId } })
        : await this.prisma.character.findMany({
            where: { partieId, userId },
          });
    if (characters.length === 0) return [];

    // Résolution en lot (pas de N+1) — même pattern que PartiesService.resolveParticipants.
    const ownerIds = [...new Set(characters.map((c) => c.userId))];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, pseudo: true },
    });
    const pseudoById = new Map(owners.map((o) => [o.id, o.pseudo]));

    return characters.map((c) =>
      toDto(c, pseudoById.get(c.userId) ?? '', c.userId === partie.mjId),
    );
  }

  /**
   * Mutation du portrait : accès PROPRIÉTAIRE SEUL, contrairement à `findOne`
   * qui autorise aussi le MJ. Le MJ reste strictement en lecture seule sur les
   * personnages de ses joueurs (FR39) — aucune action d'édition à aucun palier.
   *
   * Verrou optimiste sur `updatedAt` : deux requêtes concurrentes sur le même personnage
   * (double-clic, onglets multiples) ne doivent jamais laisser un fichier orphelin sur
   * disque sans que la seconde requête échoue proprement (409) plutôt que de silencieusement
   * écraser/perdre le travail de l'autre.
   */
  async updatePortrait(
    id: string,
    userId: string,
    file: Express.Multer.File,
    cropData: PortraitCropDataDto | null,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);

    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException(
        "Le fichier fourni n'est pas une image JPEG/PNG/WEBP valide",
      );
    }

    await mkdir(PORTRAITS_DIR, { recursive: true });
    const filename = `${randomUUID()}${extensionForImageMime(mime)}`;
    await writeFile(join(PORTRAITS_DIR, filename), file.buffer);

    try {
      const result = await this.prisma.character.updateMany({
        where: { id, updatedAt: character.updatedAt },
        data: {
          portraitUrl: `${PORTRAITS_URL_PREFIX}${filename}`,
          portraitCropData: (cropData ?? null) as any,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
    } catch (e) {
      // Le nouveau fichier n'est référencé nulle part : DB en conflit ou en échec, on
      // nettoie immédiatement plutôt que de laisser un fichier orphelin sur disque.
      await this.unlinkPortraitFile(filename);
      throw e;
    }

    if (character.portraitUrl) {
      await this.deletePortraitFile(character.portraitUrl);
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj);
  }

  async removePortrait(id: string, userId: string): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);

    const result = await this.prisma.character.updateMany({
      where: { id, updatedAt: character.updatedAt },
      data: { portraitUrl: null, portraitCropData: Prisma.JsonNull },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Le personnage a été modifié entretemps, réessayez.',
      );
    }

    if (character.portraitUrl) {
      await this.deletePortraitFile(character.portraitUrl);
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj);
  }

  /**
   * Recadrage dédié pour l'export PDF (Story 4.7, AC2) : enregistré séparément de
   * `portraitCropData` (avatar web), sans toucher au fichier image existant — pas d'upload ici.
   */
  async updatePdfPortraitCrop(
    id: string,
    userId: string,
    cropData: PortraitCropDataDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);
    if (!character.portraitUrl) {
      throw new BadRequestException(
        "Ce personnage n'a pas de portrait à recadrer",
      );
    }

    const result = await this.prisma.character.updateMany({
      where: { id, updatedAt: character.updatedAt },
      data: { pdfPortraitCropData: cropData as any },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Le personnage a été modifié entretemps, réessayez.',
      );
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj);
  }

  /**
   * Lecture du fichier portrait : mêmes règles d'accès que `findOne` (propriétaire OU MJ),
   * contrairement aux mutations (propriétaire seul, cf. `getOwnCharacterOrThrow`) — consulter
   * un portrait n'est pas une action d'édition.
   */
  async getPortraitFile(
    id: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mime: DetectedImageMime }> {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundException('Personnage introuvable');
    if (character.userId !== userId) {
      await this.parties.getOwned(character.partieId, userId);
    }

    const portrait = await readPortraitFile(character.portraitUrl);
    if (!portrait)
      throw new NotFoundException("Ce personnage n'a pas de portrait");
    return portrait;
  }

  /** Pseudo du propriétaire + s'il est le MJ de la partie — résolu en une seule paire de requêtes ciblées (`select` minimal, jamais le hash). */
  private async resolveOwnerInfo(
    ownerId: string,
    partieId: string,
  ): Promise<{ pseudo: string; isMj: boolean }> {
    const [owner, partie] = await Promise.all([
      this.users.findById(ownerId),
      this.prisma.partie.findUnique({
        where: { id: partieId },
        select: { mjId: true },
      }),
    ]);
    return { pseudo: owner?.pseudo ?? '', isMj: partie?.mjId === ownerId };
  }

  private async getOwnCharacterOrThrow(id: string, userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { id },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    if (character.userId !== userId) {
      throw new ForbiddenException(
        'Seul le propriétaire du personnage peut modifier son portrait',
      );
    }
    return character;
  }

  private async deletePortraitFile(portraitUrl: string): Promise<void> {
    const filename = extractPortraitFilename(portraitUrl);
    if (!filename) {
      this.logger.warn(
        `portraitUrl inattendu, suppression ignorée : ${portraitUrl}`,
      );
      return;
    }
    await this.unlinkPortraitFile(filename);
  }

  private async unlinkPortraitFile(filename: string): Promise<void> {
    try {
      await unlink(join(PORTRAITS_DIR, filename));
    } catch (e) {
      this.logger.warn(
        `Échec de suppression du portrait ${filename}`,
        e as Error,
      );
    }
  }
}

function toDto(
  character: any,
  ownerPseudo: string,
  ownerIsMj: boolean,
): CharacterDto {
  return {
    id: character.id,
    userId: character.userId,
    partieId: character.partieId,
    gameSystemId: character.gameSystemId,
    sheetData: character.sheetData,
    derived: character.derived,
    portraitUrl: character.portraitUrl ?? null,
    portraitCropData: character.portraitCropData ?? null,
    pdfPortraitCropData: character.pdfPortraitCropData ?? null,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
    ownerPseudo,
    ownerIsMj,
  };
}
