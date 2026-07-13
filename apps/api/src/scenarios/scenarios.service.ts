import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { PartieKind, ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
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
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

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

    return toEnrichedDto(this.prisma, updated, partie.kind);
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
    return scenarios.map((s) => toDto(s));
  }

  // AD-6 : aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur. Lecture
  // ouverte à tout membre (getViewable), pas MJ-only comme listDrafts. Tri chronologique croissant
  // (passé → futur) pour alimenter la timeline joueur (Story 7.5).
  async findAllForPartie(partieId: string, userId: string): Promise<ScenarioDto[]> {
    const partie = await this.parties.getViewable(partieId, userId);

    const scenarios = await this.prisma.scenario.findMany({
      where: { partieId },
      orderBy: { createdAt: 'asc' },
    });

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      return scenarios.map((s) => toDto(s, partie.kind));
    }

    const participants = await this.prisma.scenarioParticipant.findMany({
      where: { scenarioId: { in: scenarios.map((s) => s.id) } },
      include: { user: { select: { pseudo: true } } },
    });
    const byScenario = new Map<string, { userId: string; pseudo: string }[]>();
    for (const p of participants) {
      const list = byScenario.get(p.scenarioId) ?? [];
      list.push({ userId: p.userId, pseudo: p.user.pseudo });
      byScenario.set(p.scenarioId, list);
    }
    return scenarios.map((s) => toDto(s, partie.kind, byScenario.get(s.id) ?? []));
  }

  async open(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status !== 'BROUILLON') {
      throw new BadRequestException(
        'Seul un scénario Brouillon peut être ouvert aux joueurs',
      );
    }

    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: { status: 'A_VENIR' },
    });

    return toEnrichedDto(this.prisma, updated, partie.kind);
  }

  // AD-10 : unicité du scénario Courant vérifiée en service (verrou SELECT ... FOR UPDATE, même
  // mécanisme qu'AD-5), uniquement pour CAMPAGNE_LINEAIRE — CAMPAGNE_EPISODIQUE/ONE_SHOT autorisent
  // plusieurs COURANT simultanés (AD-4), aucun verrou/vérification pour ces kinds.
  async markCourant(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status !== 'A_VENIR') {
      throw new BadRequestException(
        'Seul un scénario À venir peut être marqué Courant',
      );
    }

    if (partie.kind === 'CAMPAGNE_LINEAIRE') {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Scenario" WHERE "partieId" = ${partie.id} FOR UPDATE`;
        const existingCourant = await tx.scenario.findFirst({
          where: { partieId: partie.id, status: 'COURANT' },
        });
        if (existingCourant) {
          throw new ConflictException(
            'Un scénario est déjà marqué Courant sur cette Partie.',
          );
        }
        // `status: 'A_VENIR'` dans le where empêche d'écraser un statut ayant changé
        // entre la lecture hors verrou plus haut et cette écriture sous verrou.
        const { count } = await tx.scenario.updateMany({
          where: { id: scenarioId, status: 'A_VENIR' },
          data: { status: 'COURANT' },
        });
        if (count === 0) {
          throw new ConflictException(
            'Le statut du scénario a changé entretemps, réessayez.',
          );
        }
        return tx.scenario.findUniqueOrThrow({ where: { id: scenarioId } });
      });
      return toDto(updated);
    }

    const { count } = await this.prisma.scenario.updateMany({
      where: { id: scenarioId, status: 'A_VENIR' },
      data: { status: 'COURANT' },
    });
    if (count === 0) {
      throw new ConflictException(
        'Le statut du scénario a changé entretemps, réessayez.',
      );
    }
    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });
    return toEnrichedDto(this.prisma, updated, partie.kind);
  }

  // AD-9 : écriture MJ-only (getOwned). Contrairement à markCourant/AD-10, close() ne
  // contraint que le scénario ciblé lui-même — updateMany + count suffit (pas de verrou
  // FOR UPDATE/$transaction, aucune contrainte d'unicité entre scénarios ici).
  async close(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status !== 'COURANT') {
      throw new BadRequestException('Seul un scénario Courant peut être clôturé');
    }

    const { count } = await this.prisma.scenario.updateMany({
      where: { id: scenarioId, status: 'COURANT' },
      data: { status: 'PASSE', closedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException(
        'Le statut du scénario a changé entretemps, réessayez.',
      );
    }
    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });
    return toEnrichedDto(this.prisma, updated, partie.kind);
  }

  // AD-9 : action joueur, getViewable (pas getOwned) — MJ+membre. AD-4 : ScenarioParticipant
  // n'existe que pour CAMPAGNE_EPISODIQUE, jamais peuplé/lu pour ONE_SHOT/CAMPAGNE_LINEAIRE.
  async participate(scenarioId: string, userId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getViewable(scenario.partieId, userId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException(
        "La participation individuelle n'est disponible que pour les campagnes épisodiques",
      );
    }

    await this.prisma.scenarioParticipant.upsert({
      where: { scenarioId_userId: { scenarioId, userId } },
      create: { scenarioId, userId },
      update: {},
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });
    return toDto(updated, partie.kind, await loadParticipants(this.prisma, scenarioId));
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

function toDto(
  scenario: any,
  partieKind?: PartieKind,
  participants?: { userId: string; pseudo: string }[],
): ScenarioDto {
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
    ...(partieKind === 'CAMPAGNE_EPISODIQUE' && { participants: participants ?? [] }),
  };
}

async function loadParticipants(
  prisma: PrismaService,
  scenarioId: string,
): Promise<{ userId: string; pseudo: string }[]> {
  const participants = await prisma.scenarioParticipant.findMany({
    where: { scenarioId },
    include: { user: { select: { pseudo: true } } },
  });
  return participants.map((p) => ({ userId: p.userId, pseudo: p.user.pseudo }));
}

// Garantit que `participants` reste toujours cohérent sur le DTO retourné par toute transition
// d'état (open/update/markCourant/close), pas seulement participate()/findAllForPartie() — sinon
// le champ redeviendrait `undefined` après une action MJ sur un scénario CAMPAGNE_EPISODIQUE,
// faisant disparaître à tort la liste des participants côté frontend (ScenarioEditor).
async function toEnrichedDto(
  prisma: PrismaService,
  scenario: any,
  partieKind: PartieKind,
): Promise<ScenarioDto> {
  if (partieKind !== 'CAMPAGNE_EPISODIQUE') return toDto(scenario, partieKind);
  return toDto(scenario, partieKind, await loadParticipants(prisma, scenario.id));
}
