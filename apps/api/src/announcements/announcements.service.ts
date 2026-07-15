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
}
