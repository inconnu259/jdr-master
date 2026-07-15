import { Injectable } from '@nestjs/common';
import type { AnnouncementDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

function toDto(announcement: any): AnnouncementDto {
  return {
    id: announcement.id,
    partieId: announcement.partieId,
    scenarioId: announcement.scenarioId,
    text: announcement.text,
    createdAt: announcement.createdAt.toISOString(),
  };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly scenarios: ScenariosService,
  ) {}

  async create(
    partieId: string,
    mjId: string,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementDto> {
    await this.parties.getOwned(partieId, mjId);

    if (dto.scenarioId !== undefined) {
      await this.scenarios.verifyScenarioBelongsToPartie(
        dto.scenarioId,
        partieId,
      );
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        partieId,
        scenarioId: dto.scenarioId ?? null,
        text: dto.text,
      },
    });

    return toDto(announcement);
  }

  /** Story 9.2 (AD-9/AD-6) : lecture ouverte à tout membre (getViewable), retourne TOUTES les
   * annonces de la Partie sans filtrage de statut de scénario — l'anti-spoil (AC6) est un rendu
   * Angular conditionnel côté consommateur, jamais un filtrage serveur. */
  async findAll(partieId: string, userId: string): Promise<AnnouncementDto[]> {
    await this.parties.getViewable(partieId, userId);
    const announcements = await this.prisma.announcement.findMany({
      where: { partieId },
      orderBy: { createdAt: 'desc' },
    });
    return announcements.map(toDto);
  }
}
