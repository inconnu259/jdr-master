import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CharacterDto } from '@master-jdr/shared';
import {
  computeDerived,
  validate,
  type RyuutamaSheetData,
} from '@master-jdr/game-rules';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORTED_GAME_SYSTEMS } from '../game-systems/supported-game-systems';
import { CreateCharacterDto } from './dto/create-character.dto';
import type { PortraitCropDataDto } from './dto/portrait-crop-data.dto';
import {
  detectImageMime,
  extensionForImageMime,
  isValidPortraitFilename,
  mimeForExtension,
  type DetectedImageMime,
} from './image-mime.util';

const UPLOADS_ROOT = join(process.cwd(), 'uploads');
const PORTRAITS_DIR = join(UPLOADS_ROOT, 'portraits');
const PORTRAITS_URL_PREFIX = '/uploads/portraits/';

@Injectable()
export class CharacterService {
  private readonly logger = new Logger(CharacterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async create(
    partieId: string,
    userId: string,
    dto: CreateCharacterDto,
  ): Promise<CharacterDto> {
    await this.parties.getViewable(partieId, userId);

    if (!SUPPORTED_GAME_SYSTEMS.includes(dto.gameSystemId)) {
      throw new BadRequestException(
        `Système de jeu non supporté : ${dto.gameSystemId}`,
      );
    }

    const sheetData = dto.sheetData as unknown as RyuutamaSheetData;
    const result = validate(sheetData, 'strict');
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
      return toDto(character);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          'Vous avez déjà un personnage sur cette partie',
        );
      }
      throw e;
    }
  }

  async findOne(id: string, userId: string): Promise<CharacterDto> {
    const character = await this.prisma.character.findUnique({
      where: { id },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    if (character.userId === userId) return toDto(character);

    await this.parties.getOwned(character.partieId, userId);
    return toDto(character);
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
    return characters.map(toDto);
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
    return toDto(updated);
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
    return toDto(updated);
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

    const filename = this.extractPortraitFilename(character.portraitUrl);
    if (!filename)
      throw new NotFoundException("Ce personnage n'a pas de portrait");

    const mime = mimeForExtension(extname(filename));
    if (!mime) throw new NotFoundException("Ce personnage n'a pas de portrait");

    try {
      const buffer = await readFile(join(PORTRAITS_DIR, filename));
      return { buffer, mime };
    } catch {
      throw new NotFoundException('Portrait introuvable');
    }
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

  /**
   * Un nom de fichier de portrait légitime est toujours `<uuid>.<ext connue>` (cf.
   * `image-mime.util.ts`) — un `portraitUrl` corrompu (édité manuellement, migration ratée)
   * ne doit jamais atteindre `unlink`/`readFile` avec un chemin non validé.
   */
  private extractPortraitFilename(portraitUrl: string | null): string | null {
    if (!portraitUrl || !portraitUrl.startsWith(PORTRAITS_URL_PREFIX))
      return null;
    const filename = portraitUrl.slice(PORTRAITS_URL_PREFIX.length);
    return isValidPortraitFilename(filename) ? filename : null;
  }

  private async deletePortraitFile(portraitUrl: string): Promise<void> {
    const filename = this.extractPortraitFilename(portraitUrl);
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

function toDto(character: any): CharacterDto {
  return {
    id: character.id,
    userId: character.userId,
    partieId: character.partieId,
    gameSystemId: character.gameSystemId,
    sheetData: character.sheetData,
    derived: character.derived,
    portraitUrl: character.portraitUrl ?? null,
    portraitCropData: character.portraitCropData ?? null,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
  };
}
