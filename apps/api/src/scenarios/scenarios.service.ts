import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  CharacterNoteDto,
  PartieKind,
  ScenarioDocumentDto,
  ScenarioDto,
  SeanceDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CharacterService } from '../characters/character.service';
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
    private readonly characters: CharacterService,
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
    // Un scénario a systématiquement besoin d'au moins une séance pour planifier sa date — le MJ
    // peut toujours en ajouter d'autres ensuite (addSeance, aucun plafond, cf. AC1 Story 8.2).
    await this.prisma.seance.create({ data: { scenarioId: scenario.id } });

    return toEnrichedDto(this.prisma, this.characters, scenario, partie.kind);
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

    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
    const partie = await this.parties.getOwned(partieId, mjId);

    const scenarios = await this.prisma.scenario.findMany({
      where: { partieId, status: 'BROUILLON' },
      orderBy: { createdAt: 'desc' },
    });
    const seancesByScenario = await loadSeancesBatch(
      this.prisma,
      scenarios.map((s) => s.id),
    );
    return scenarios.map((s) =>
      toDto(s, partie.kind, undefined, seancesByScenario.get(s.id) ?? []),
    );
  }

  // AD-6 : aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur. Lecture
  // ouverte à tout membre (getViewable), pas MJ-only comme listDrafts. Tri chronologique croissant
  // (passé → futur) pour alimenter la timeline joueur (Story 7.5).
  async findAllForPartie(
    partieId: string,
    userId: string,
  ): Promise<ScenarioDto[]> {
    const partie = await this.parties.getViewable(partieId, userId);

    const scenarios = await this.prisma.scenario.findMany({
      where: { partieId },
      orderBy: { createdAt: 'asc' },
    });
    const scenarioIds = scenarios.map((s) => s.id);
    const seancesByScenario = await loadSeancesBatch(this.prisma, scenarioIds);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      return Promise.all(
        scenarios.map(async (s) => {
          const seances = seancesByScenario.get(s.id) ?? [];
          const retrospectiveNotes = await loadRetrospectiveNotes(
            this.prisma,
            this.characters,
            s,
            partie.kind,
            seances,
            undefined,
          );
          return toDto(s, partie.kind, undefined, seances, retrospectiveNotes);
        }),
      );
    }

    const participants = await this.prisma.scenarioParticipant.findMany({
      where: { scenarioId: { in: scenarioIds } },
      include: { user: { select: { pseudo: true } } },
    });
    const byScenario = new Map<string, { userId: string; pseudo: string }[]>();
    for (const p of participants) {
      const list = byScenario.get(p.scenarioId) ?? [];
      list.push({ userId: p.userId, pseudo: p.user.pseudo });
      byScenario.set(p.scenarioId, list);
    }
    return Promise.all(
      scenarios.map(async (s) => {
        const seances = seancesByScenario.get(s.id) ?? [];
        const scenarioParticipants = byScenario.get(s.id) ?? [];
        const retrospectiveNotes = await loadRetrospectiveNotes(
          this.prisma,
          this.characters,
          s,
          partie.kind,
          seances,
          scenarioParticipants,
        );
        return toDto(s, partie.kind, scenarioParticipants, seances, retrospectiveNotes);
      }),
    );
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

    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
      return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
      throw new BadRequestException(
        'Seul un scénario Courant peut être clôturé',
      );
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
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-9 : écriture MJ-only (getOwned, comme create/update/open/markCourant/close) — ajouter une
  // séance est une action MJ, contrairement à participate() (AD-9 joueur). Aucun plafond (AC1).
  async addSeance(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    await this.prisma.seance.create({ data: { scenarioId } });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-4 : une Seance CAMPAGNE_EPISODIQUE ne peut jamais être liée à un SessionPoll (Inscription à
  // la place, Story 8.3). P2-AD-2 : PollModule reste le seul écrivain de SessionPoll — cette méthode
  // ne fait que poser la relation Seance.pollId (déjà @unique en base), jamais créer/modifier un poll.
  async linkSeancePoll(
    seanceId: string,
    mjId: string,
    pollId: string,
  ): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (partie.kind === 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException(
        "Une séance de campagne épisodique ne peut jamais être liée à un vote de date — utilisez l'inscription à capacité limitée",
      );
    }

    if (seance.pollId) {
      throw new BadRequestException(
        'Cette séance est déjà liée à un vote de date',
      );
    }

    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== scenario.partieId) {
      throw new BadRequestException(
        "Ce vote de date n'appartient pas à cette Partie",
      );
    }
    if (poll.status !== 'OPEN') {
      throw new BadRequestException("Ce vote de date n'est plus ouvert");
    }

    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { pollId },
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-4/AD-5 : capacité d'inscription réservée à CAMPAGNE_EPISODIQUE — symétrique au rejet
  // CAMPAGNE_EPISODIQUE de linkSeancePoll (ici c'est l'inverse qui est rejeté). addSeance() reste
  // inchangé (Story 8.2) : la capacité se définit dans un second temps, comme linkSeancePoll pour
  // le linéaire (cf. Dev Notes Story 8.3 — schéma en deux temps cohérent entre les deux mécanismes).
  async setSeanceCapacity(
    seanceId: string,
    mjId: string,
    inscriptionMin: number,
    inscriptionMax: number,
  ): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException(
        "La capacité d'inscription ne peut être définie que pour les campagnes épisodiques",
      );
    }
    if (inscriptionMax < inscriptionMin) {
      throw new BadRequestException(
        'Le maximum doit être supérieur ou égal au minimum',
      );
    }

    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { inscriptionMin, inscriptionMax },
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-5 (verbatim) : verrou de ligne explicite SELECT ... FOR UPDATE obligatoire — READ COMMITTED
  // seul ne suffit pas à empêcher un dépassement de max entre deux inscriptions concurrentes.
  async inscrire(seanceId: string, userId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getViewable(scenario.partieId, userId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException(
        "L'inscription à capacité limitée n'est disponible que pour les campagnes épisodiques",
      );
    }
    if (seance.inscriptionMax == null) {
      throw new BadRequestException(
        "Cette séance n'a pas encore de capacité définie par le MJ",
      );
    }
    if (seance.dateValidee) {
      throw new BadRequestException(
        'Cette séance a déjà une date validée — les inscriptions sont figées',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Seance" WHERE id = ${seanceId} FOR UPDATE`;
      const existing = await tx.inscription.findUnique({
        where: { seanceId_userId: { seanceId, userId } },
      });
      // AC2 vs AC4 : ce check précède le comptage — un joueur déjà inscrit reste inscrit sans
      // jamais être rejeté par un quota déjà atteint par d'autres (idempotence).
      if (existing) return;
      // Relit inscriptionMax sous le verrou — sinon un setSeanceCapacity() concurrent entre la
      // lecture initiale (hors transaction) et cette comparaison utiliserait une valeur périmée,
      // ce que le verrou FOR UPDATE est censé prévenir (trouvé en revue de code, 2026-07-14).
      const locked = await tx.seance.findUniqueOrThrow({ where: { id: seanceId } });
      const count = await tx.inscription.count({ where: { seanceId } });
      if (count >= locked.inscriptionMax!) {
        throw new ConflictException(
          'Cette séance a atteint son nombre maximal d’inscrits',
        );
      }
      await tx.inscription.create({ data: { seanceId, userId } });
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // deleteMany (pas delete) : idempotent si l'utilisateur n'était pas inscrit — pas d'effet de
  // bord dangereux possible, aucune garde de kind/capacité nécessaire (cf. Dev Notes Story 8.3).
  async desinscrire(seanceId: string, userId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getViewable(scenario.partieId, userId);

    // Décision utilisateur (revue de code, 2026-07-14) : la date validée fige le roster — un
    // joueur ne peut plus se désinscrire une fois la séance confirmée par le MJ.
    if (seance.dateValidee) {
      throw new BadRequestException(
        'Cette séance a déjà une date validée — les inscriptions sont figées',
      );
    }

    await this.prisma.inscription.deleteMany({ where: { seanceId, userId } });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AC6 : aucune validation de remplissage — validable à tout niveau, y compris 0 inscrit. Ne
  // touche jamais Partie.nextSessionDate/nextSessionSlot (exclusivement piloté par PollService
  // pour le linéaire/one-shot — aucune notion de « prochaine séance » unique en épisodique, AD-4).
  async validerDate(seanceId: string, mjId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException(
        'La validation de date ne concerne que les campagnes épisodiques',
      );
    }
    // Sans capacité définie, dateValidee serait écrite mais resterait invisible côté DTO
    // (toSeanceDto ne peuple `inscription` que si inscriptionMax != null) — trouvé en revue de
    // code (2026-07-14), état silencieusement perdu jusqu'à ce que la capacité soit enfin définie.
    if (seance.inscriptionMax == null) {
      throw new BadRequestException(
        "Impossible de valider une date sans capacité d'inscription définie",
      );
    }

    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { dateValidee: new Date() },
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-1/AD-9 : compte-rendu = champ neutre de Seance, jamais restreint par kind ni par un
  // hypothétique statut (Seance n'en a aucun) — contrairement à setSeanceCapacity/inscrire/
  // validerDate (Story 8.3, réservés à CAMPAGNE_EPISODIQUE). Écriture MJ-only (getOwned).
  async setCompteRendu(
    seanceId: string,
    mjId: string,
    compteRendu: string,
  ): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({
      where: { id: seanceId },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { compteRendu },
    });

    const updated = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenario.id },
    });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }

  // AD-1/AD-9 : résumé de fin = champ de Scenario, écriture MJ-only (getOwned). Garde de statut
  // inversée par rapport à update() (scenarios.service.ts:76-80) : celle-ci rejette tant que le
  // scénario n'est pas encore PASSE, update() rejette une fois PASSE — les deux se complètent.
  // Aucune restriction de kind, rappelable à volonté après la première rédaction (AC3).
  async setResumeFin(
    scenarioId: string,
    mjId: string,
    resumeFin: string,
  ): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (scenario.status !== 'PASSE') {
      throw new BadRequestException(
        "Le résumé de fin ne peut être rédigé qu'après clôture du scénario",
      );
    }

    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: { resumeFin },
    });

    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
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
  seances?: SeanceDto[],
  retrospectiveNotes?: CharacterNoteDto[],
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
    seances: seances ?? [],
    ...(partieKind === 'CAMPAGNE_EPISODIQUE' && {
      participants: participants ?? [],
    }),
    retrospectiveNotes,
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

const SEANCE_INCLUDE = {
  poll: {
    include: {
      options: {
        include: { votes: { include: { user: { select: { pseudo: true } } } } },
      },
    },
  },
  inscriptions: { include: { user: { select: { pseudo: true } } } },
} as const;

function toSessionPollDto(poll: any): SessionPollDto {
  return {
    id: poll.id,
    partieId: poll.partieId,
    status: poll.status,
    scenarioRef: poll.scenarioRef,
    expiresAt: poll.expiresAt?.toISOString() ?? null,
    chosenDate: poll.chosenDate?.toISOString() ?? null,
    chosenSlot: poll.chosenSlot,
    options: (poll.options ?? []).map((opt: any) => ({
      id: opt.id,
      date: opt.date.toISOString(),
      slot: opt.slot,
      votes: (opt.votes ?? []).map((v: any) => ({
        userId: v.userId,
        pseudo: v.user.pseudo,
        answer: v.answer,
      })),
    })),
  };
}

function toSeanceDto(seance: any): SeanceDto {
  return {
    id: seance.id,
    scenarioId: seance.scenarioId,
    poll: seance.poll ? toSessionPollDto(seance.poll) : undefined,
    inscription:
      seance.inscriptionMax != null
        ? {
            min: seance.inscriptionMin ?? 0,
            max: seance.inscriptionMax,
            inscrits: (seance.inscriptions ?? []).map((i: any) => ({
              userId: i.userId,
              pseudo: i.user.pseudo,
            })),
            dateValidee: seance.dateValidee
              ? seance.dateValidee.toISOString()
              : null,
          }
        : undefined,
    compteRendu: seance.compteRendu,
    createdAt: seance.createdAt.toISOString(),
  };
}

async function loadSeancesBatch(
  prisma: PrismaService,
  scenarioIds: string[],
): Promise<Map<string, SeanceDto[]>> {
  const seances = await prisma.seance.findMany({
    where: { scenarioId: { in: scenarioIds } },
    orderBy: { createdAt: 'asc' },
    include: SEANCE_INCLUDE,
  });
  const byScenario = new Map<string, SeanceDto[]>();
  for (const s of seances) {
    const list = byScenario.get(s.scenarioId) ?? [];
    list.push(toSeanceDto(s));
    byScenario.set(s.scenarioId, list);
  }
  return byScenario;
}

async function loadSeances(
  prisma: PrismaService,
  scenarioId: string,
): Promise<SeanceDto[]> {
  const byScenario = await loadSeancesBatch(prisma, [scenarioId]);
  return byScenario.get(scenarioId) ?? [];
}

// Garantit que `participants`/`seances` restent toujours cohérents sur le DTO retourné par toute
// transition d'état (create/open/update/markCourant/close/participate/addSeance/linkSeancePoll) —
// sinon ces champs redeviendraient `undefined`/vides après une action MJ, faisant disparaître à
// tort la liste des participants/séances côté frontend (ScenarioEditor/ScenarioReadDialog).
async function toEnrichedDto(
  prisma: PrismaService,
  characters: CharacterService,
  scenario: any,
  partieKind: PartieKind,
): Promise<ScenarioDto> {
  const seances = await loadSeances(prisma, scenario.id);
  if (partieKind !== 'CAMPAGNE_EPISODIQUE') {
    const retrospectiveNotes = await loadRetrospectiveNotes(
      prisma,
      characters,
      scenario,
      partieKind,
      seances,
      undefined,
    );
    return toDto(scenario, partieKind, undefined, seances, retrospectiveNotes);
  }
  const participants = await loadParticipants(prisma, scenario.id);
  const retrospectiveNotes = await loadRetrospectiveNotes(
    prisma,
    characters,
    scenario,
    partieKind,
    seances,
    participants,
  );
  return toDto(scenario, partieKind, participants, seances, retrospectiveNotes);
}

// AD-11 : agrégation en lecture seule via CharacterService (jamais d'accès Prisma direct à
// CharacterNote depuis ScenariosModule). Ne s'exécute que pour un scénario PASSE (AC7) — sinon
// retourne `undefined` immédiatement, sans appel CharacterService. Fenêtre = [min, max] des dates
// effectives des séances (poll.chosenDate ?? inscription.dateValidee), `null`/`null` si aucune
// séance datée (cf. `[ASSUMPTION]` Story 8.6 : aucune automatisation sur donnée non confirmée).
async function loadRetrospectiveNotes(
  prisma: PrismaService,
  characters: CharacterService,
  scenario: { id: string; partieId: string; status: string },
  partieKind: PartieKind,
  seances: SeanceDto[],
  participants: { userId: string; pseudo: string }[] | undefined,
): Promise<CharacterNoteDto[] | undefined> {
  if (scenario.status !== 'PASSE') return undefined;

  const dates = seances
    .map((s) => s.poll?.chosenDate ?? s.inscription?.dateValidee ?? null)
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d));
  const windowStart =
    dates.length > 0
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : null;
  const windowEnd =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;

  const allCharacters = await characters.findAllByPartie(scenario.partieId);
  const relevantCharacters =
    partieKind === 'CAMPAGNE_EPISODIQUE'
      ? allCharacters.filter((c) =>
          (participants ?? []).some((p) => p.userId === c.userId),
        )
      : allCharacters;

  const notesPerCharacter = await Promise.all(
    relevantCharacters.map((c) =>
      characters.getRetrospectiveNotes(
        c.id,
        scenario.id,
        windowStart,
        windowEnd,
      ),
    ),
  );
  return notesPerCharacter.flat();
}
