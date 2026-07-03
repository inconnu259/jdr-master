import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class CharacterService {
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
