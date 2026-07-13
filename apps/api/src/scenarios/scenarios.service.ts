import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';
import { detectDocumentMime } from './document-mime.util';
import {
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from './document-storage.util';

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

  async uploadDocument(
    partieId: string,
    mjId: string,
    file: Express.Multer.File,
    scenarioId?: string,
  ): Promise<ScenarioDocumentDto> {
    await this.parties.getOwned(partieId, mjId);

    // scenarioId est un champ multipart optionnel : `undefined` = bibliothèque (voulu), mais
    // une chaîne vide ou malformée est une entrée cliente invalide, jamais interprétée
    // silencieusement comme "absent" (contrairement à un simple `if (scenarioId)`).
    if (scenarioId !== undefined) {
      if (!isUUID(scenarioId)) {
        throw new BadRequestException(
          'scenarioId doit être un UUID valide ou absent',
        );
      }
      const scenario = await this.prisma.scenario.findUnique({
        where: { id: scenarioId },
      });
      if (!scenario) throw new NotFoundException('Scénario introuvable');
      if (scenario.partieId !== partieId) {
        throw new BadRequestException(
          "Ce scénario n'appartient pas à cette Partie",
        );
      }
      if (scenario.status === 'PASSE') {
        throw new BadRequestException(
          'Un scénario clôturé ne peut plus recevoir de nouveaux documents — seul le résumé de fin (Epic 8) reste éditable',
        );
      }
    }

    const mime = detectDocumentMime(file.buffer);
    if (!mime) {
      throw new BadRequestException(
        "Le fichier fourni n'est pas un PDF ou un texte valide",
      );
    }

    const filename = await writeDocumentFile(file.buffer, mime);
    try {
      const document = await this.prisma.scenarioDocument.create({
        data: {
          partieId,
          scenarioId: scenarioId ?? null,
          filename,
          originalName: file.originalname,
          sizeBytes: file.size,
        },
      });
      return toDocumentDto(document);
    } catch (e) {
      // Nettoyage du fichier orphelin si l'insertion échoue — même pattern que
      // updatePortrait (Story 4.5) : jamais de fichier sur disque sans ligne correspondante.
      await deleteDocumentFile(filename);
      throw e;
    }
  }

  async listDocuments(
    scenarioId: string,
    userId: string,
  ): Promise<ScenarioDocumentDto[]> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    await this.parties.getViewable(scenario.partieId, userId);

    const documents = await this.prisma.scenarioDocument.findMany({
      where: {
        OR: [{ scenarioId }, { partieId: scenario.partieId, scenarioId: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return documents.map(toDocumentDto);
  }

  async listLibraryDocuments(
    partieId: string,
    userId: string,
  ): Promise<ScenarioDocumentDto[]> {
    await this.parties.getViewable(partieId, userId);

    const documents = await this.prisma.scenarioDocument.findMany({
      where: { partieId, scenarioId: null },
      orderBy: { createdAt: 'desc' },
    });
    return documents.map(toDocumentDto);
  }

  async listDrafts(partieId: string, mjId: string): Promise<ScenarioDto[]> {
    await this.parties.getOwned(partieId, mjId);

    const scenarios = await this.prisma.scenario.findMany({
      where: { partieId, status: 'BROUILLON' },
      orderBy: { createdAt: 'desc' },
    });
    return scenarios.map(toDto);
  }

  // AD-6 : aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur. Lecture
  // ouverte à tout membre (getViewable), pas MJ-only comme listDrafts. Tri chronologique croissant
  // (passé → futur) pour alimenter la timeline joueur (Story 7.5).
  async findAllForPartie(partieId: string, userId: string): Promise<ScenarioDto[]> {
    await this.parties.getViewable(partieId, userId);

    const scenarios = await this.prisma.scenario.findMany({
      where: { partieId },
      orderBy: { createdAt: 'asc' },
    });
    return scenarios.map(toDto);
  }

  async open(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status !== 'BROUILLON') {
      throw new BadRequestException(
        'Seul un scénario Brouillon peut être ouvert aux joueurs',
      );
    }

    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: { status: 'A_VENIR' },
    });

    return toDto(updated);
  }

  async getDocumentFile(
    documentId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mime: string; originalName: string }> {
    const document = await this.prisma.scenarioDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    await this.parties.getViewable(document.partieId, userId);

    const file = await readDocumentFile(document.filename);
    if (!file) throw new NotFoundException('Fichier introuvable');

    return {
      buffer: file.buffer,
      mime: file.mime,
      originalName: document.originalName,
    };
  }
}

function toDocumentDto(document: any): ScenarioDocumentDto {
  return {
    id: document.id,
    partieId: document.partieId,
    scenarioId: document.scenarioId,
    originalName: document.originalName,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt.toISOString(),
  };
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
