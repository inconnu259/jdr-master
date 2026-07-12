import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ScenarioDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async create(
    partieId: string,
    mjId: string,
    dto: CreateScenarioDto,
  ): Promise<ScenarioDto> {
    const partie = await this.parties.getOwned(partieId, mjId);

    // FR-1 (PRD §9) : une Partie ONE_SHOT a un unique scénario, créé automatiquement
    // (PartiesService.create, AD-7) — jamais de gestion multi-scénarios pour ce cas.
    if (partie.kind === 'ONE_SHOT') {
      throw new BadRequestException(
        'Une Partie de type ONE_SHOT ne peut pas avoir plusieurs scénarios — son scénario unique est créé automatiquement',
      );
    }

    const scenario = await this.prisma.scenario.create({
      data: {
        partieId,
        title: dto.title,
        description: dto.description ?? null,
        dureeHeures: dto.dureeHeures ?? null,
        dureeSeances: dto.dureeSeances ?? null,
        status: 'BROUILLON',
      },
    });

    return toDto(scenario);
  }

  async update(
    scenarioId: string,
    mjId: string,
    dto: UpdateScenarioDto,
  ): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status === 'PASSE') {
      throw new BadRequestException(
        'Un scénario clôturé ne peut plus être modifié via cet endpoint — seule l’édition du résumé de fin (Epic 8) reste possible, via un mécanisme dédié',
      );
    }

    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dureeHeures !== undefined && { dureeHeures: dto.dureeHeures }),
        ...(dto.dureeSeances !== undefined && {
          dureeSeances: dto.dureeSeances,
        }),
      },
    });

    return toDto(updated);
  }
}

function toDto(scenario: any): ScenarioDto {
  return {
    id: scenario.id,
    partieId: scenario.partieId,
    title: scenario.title,
    description: scenario.description,
    status: scenario.status,
    dureeHeures: scenario.dureeHeures,
    dureeSeances: scenario.dureeSeances,
    resumeFin: scenario.resumeFin,
    createdAt: scenario.createdAt.toISOString(),
    closedAt: scenario.closedAt ? scenario.closedAt.toISOString() : null,
  };
}
