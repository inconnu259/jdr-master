import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

jest.mock('./document-mime.util', () => ({
  detectDocumentMime: jest.fn(),
  isStructurallyValidPdf: jest.fn(),
}));
jest.mock('./document-storage.util', () => ({
  writeDocumentFile: jest.fn(),
  readDocumentFile: jest.fn(),
  deleteDocumentFile: jest.fn(),
}));
// CharacterService (import réel pour servir de jeton DI, cf. plus bas) importe transitivement
// @master-jdr/game-rules (ESM, non transformé par ts-jest) — même mock que character.service.spec.ts
// pour éviter "Unexpected token export" au chargement du module.
jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  pendingLevels: jest.fn(),
  LEVEL_TABLE: [],
}));

import {
  detectDocumentMime,
  isStructurallyValidPdf,
} from './document-mime.util';
import {
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from './document-storage.util';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CharacterService } from '../characters/character.service';
import { PollService } from '../poll/poll.service';
import { ScenariosService } from './scenarios.service';

function makePrisma() {
  const tx = {
    $queryRaw: jest.fn(),
    scenario: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    seance: {
      findUniqueOrThrow: jest.fn(),
    },
    inscription: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    scenario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    scenarioDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    scenarioParticipant: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    seance: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    sessionPoll: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    inscription: {
      deleteMany: jest.fn(),
    },
    partie: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'p1',
        nextSessionDate: null,
        nextSessionSlot: null,
        reminderSentAt: null,
      }),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    tx,
  };
}

function makeParties() {
  return { getOwned: jest.fn(), getViewable: jest.fn() };
}

function makeCharacters() {
  return {
    findAllByPartie: jest.fn().mockResolvedValue([]),
    getRetrospectiveNotes: jest.fn().mockResolvedValue([]),
  };
}

function makePollService() {
  return { create: jest.fn() };
}

const VALID_SCENARIO_ID = '22222222-2222-4222-a222-222222222222';

function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    buffer: Buffer.from('%PDF-1.4\n...'),
    originalname: 'lettre-ossian.pdf',
    size: 12,
    ...overrides,
  } as Express.Multer.File;
}

describe('ScenariosService', () => {
  let service: ScenariosService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makeParties>;
  let characters: ReturnType<typeof makeCharacters>;
  let pollService: ReturnType<typeof makePollService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Défaut : la plupart des tests uploadDocument() mockent detectDocumentMime → 'application/pdf'
    // sans porter sur la validation structurelle elle-même — sans ce défaut, isStructurallyValidPdf
    // (jest.fn() nu, non mocké explicitement) résoudrait `undefined`, faussement falsy.
    (isStructurallyValidPdf as jest.Mock).mockResolvedValue(true);
    prisma = makePrisma();
    parties = makeParties();
    characters = makeCharacters();
    pollService = makePollService();
    // Chaque transition d'état (toEnrichedDto) charge désormais les séances — [] par défaut pour
    // les tests qui ne portent pas explicitement sur `seances` (AC7, jamais undefined).
    prisma.seance.findMany.mockResolvedValue([]);
    // Idem pour les participants (branche CAMPAGNE_EPISODIQUE de toEnrichedDto) — [] par défaut
    // pour les tests Story 8.3 qui utilisent ce kind sans porter sur `participants`.
    prisma.scenarioParticipant.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        ScenariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: CharacterService, useValue: characters },
        { provide: PollService, useValue: pollService },
      ],
    }).compile();
    service = module.get(ScenariosService);
  });

  describe('create()', () => {
    it('crée un scénario BROUILLON rattaché à la Partie (AC1)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.create.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Le Marché aux Ombres',
        description: null,
        status: 'BROUILLON',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.create('p1', 'mj1', {
        title: 'Le Marché aux Ombres',
      });

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partieId: 'p1',
            title: 'Le Marché aux Ombres',
            status: 'BROUILLON',
          }),
        }),
      );
      expect(result.status).toBe('BROUILLON');
      expect(result.id).toBe('s1');
    });

    it('crée automatiquement une première Seance rattachée (le scénario a toujours besoin d’au moins une date à planifier)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.create.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Le Marché aux Ombres',
        description: null,
        status: 'BROUILLON',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      await service.create('p1', 'mj1', { title: 'Le Marché aux Ombres' });

      expect(prisma.seance.create).toHaveBeenCalledWith({
        data: { scenarioId: 's1' },
      });
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture (AC2)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create('p1', 'stranger', { title: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.create).not.toHaveBeenCalled();
    });

    it('Partie ONE_SHOT → rejet, aucune écriture (FR-1 : un seul scénario, jamais créé manuellement)', async () => {
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'ONE_SHOT',
      });

      await expect(
        service.create('p1', 'mj1', { title: 'Second scénario' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenario.create).not.toHaveBeenCalled();
    });

    it('Partie CAMPAGNE_LINEAIRE → autorisée (pas de restriction de kind)', async () => {
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.create.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'BROUILLON',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.create('p1', 'mj1', {
        title: 'Chapitre 1',
      });
      expect(result.status).toBe('BROUILLON');
    });

    it('plusieurs créations indépendantes créent chacune un BROUILLON, sans contrainte d’ordre (AC6)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.create
        .mockResolvedValueOnce({
          id: 's1',
          partieId: 'p1',
          title: 'A',
          description: null,
          status: 'BROUILLON',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
          closedAt: null,
        })
        .mockResolvedValueOnce({
          id: 's2',
          partieId: 'p1',
          title: 'B',
          description: null,
          status: 'BROUILLON',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
          closedAt: null,
        });

      const first = await service.create('p1', 'mj1', { title: 'A' });
      const second = await service.create('p1', 'mj1', { title: 'B' });

      expect(first.status).toBe('BROUILLON');
      expect(second.status).toBe('BROUILLON');
      expect(prisma.scenario.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('update()', () => {
    it('édite un scénario hors PASSE (AC4)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.update.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Nouveau titre',
        description: null,
        status: 'A_VENIR',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.update('s1', 'mj1', {
        title: 'Nouveau titre',
      });

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({ title: 'Nouveau titre' }),
        }),
      );
      expect(result.title).toBe('Nouveau titre');
    });

    it('CAMPAGNE_EPISODIQUE : participants restent peuplés dans le DTO retourné après update() (non-régression)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.update.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Nouveau titre',
        description: null,
        status: 'A_VENIR',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        { scenarioId: 's1', userId: 'u1', user: { pseudo: 'Alice' } },
      ]);

      const result = await service.update('s1', 'mj1', {
        title: 'Nouveau titre',
      });

      expect(result.participants).toEqual([{ userId: 'u1', pseudo: 'Alice' }]);
    });

    it('scénario PASSE → rejet, aucune écriture (AC5)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'PASSE',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      await expect(
        service.update('s1', 'mj1', { description: 'nouvelle description' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.update('s1', 'stranger', { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadDocument()', () => {
    it('upload avec scenarioId → ScenarioDocument rattaché au scénario (AC1)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'BROUILLON',
      });
      (detectDocumentMime as jest.Mock).mockReturnValue('application/pdf');
      (writeDocumentFile as jest.Mock).mockResolvedValue('uuid.pdf');
      prisma.scenarioDocument.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        scenarioId: VALID_SCENARIO_ID,
        originalName: 'lettre-ossian.pdf',
        sizeBytes: 12,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
      });

      const result = await service.uploadDocument(
        'p1',
        'mj1',
        makeFile(),
        VALID_SCENARIO_ID,
      );

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenarioDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partieId: 'p1',
            scenarioId: VALID_SCENARIO_ID,
          }),
        }),
      );
      expect(result.scenarioId).toBe(VALID_SCENARIO_ID);
    });

    it('upload sans scenarioId → scenarioId: null (AC3)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      (detectDocumentMime as jest.Mock).mockReturnValue('application/pdf');
      (writeDocumentFile as jest.Mock).mockResolvedValue('uuid.pdf');
      prisma.scenarioDocument.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        scenarioId: null,
        originalName: 'regles-maison.pdf',
        sizeBytes: 12,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
      });

      const result = await service.uploadDocument('p1', 'mj1', makeFile());

      expect(prisma.scenario.findUnique).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ partieId: 'p1', scenarioId: null }),
        }),
      );
      expect(result.scenarioId).toBeNull();
    });

    it('upload sur un scénario PASSE → rejet, aucune écriture (exigence croisée 7.1 AC5)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'PASSE',
      });

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile(), VALID_SCENARIO_ID),
      ).rejects.toThrow(BadRequestException);
      expect(writeDocumentFile).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('upload sur un scenarioId n’appartenant pas à la Partie → rejet', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'AUTRE_PARTIE',
        status: 'BROUILLON',
      });

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile(), VALID_SCENARIO_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('scenarioId inexistant → 404, aucune écriture', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile(), VALID_SCENARIO_ID),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('fichier non reconnu (ni PDF ni texte) → rejet, aucune écriture (AC1/AC2)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      (detectDocumentMime as jest.Mock).mockReturnValue(null);

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile()),
      ).rejects.toThrow(BadRequestException);
      expect(writeDocumentFile).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('PDF détecté par signature magique mais structurellement invalide → rejet, aucune écriture (Story 16.1 AC1)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      (detectDocumentMime as jest.Mock).mockReturnValue('application/pdf');
      (isStructurallyValidPdf as jest.Mock).mockResolvedValue(false);

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile()),
      ).rejects.toThrow(BadRequestException);
      expect(writeDocumentFile).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('fichier texte détecté → isStructurallyValidPdf jamais appelé, upload réussit (Story 16.1 AC3, non-régression texte)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      (detectDocumentMime as jest.Mock).mockReturnValue('text/plain');
      (writeDocumentFile as jest.Mock).mockResolvedValue('uuid.txt');
      prisma.scenarioDocument.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        scenarioId: null,
        originalName: 'regles-maison.txt',
        sizeBytes: 12,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
      });

      const result = await service.uploadDocument('p1', 'mj1', makeFile());

      expect(isStructurallyValidPdf).not.toHaveBeenCalled();
      expect(result.scenarioId).toBeNull();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.uploadDocument('p1', 'stranger', makeFile()),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('scenarioId malformé (pas un UUID) → rejet, aucune écriture', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile(), 'not-a-uuid'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenario.findUnique).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('scenarioId fourni en chaîne vide → rejet explicite, jamais traité comme absent', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile(), ''),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
    });

    it('échec de l’insertion Prisma → nettoie le fichier orphelin puis relance l’erreur', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      (detectDocumentMime as jest.Mock).mockReturnValue('application/pdf');
      (writeDocumentFile as jest.Mock).mockResolvedValue('uuid.pdf');
      const dbError = new Error('DB down');
      prisma.scenarioDocument.create.mockRejectedValue(dbError);

      await expect(
        service.uploadDocument('p1', 'mj1', makeFile()),
      ).rejects.toThrow(dbError);
      expect(deleteDocumentFile).toHaveBeenCalledWith('uuid.pdf');
    });
  });

  describe('listDocuments()', () => {
    it('combine documents du scénario ET bibliothèque de Partie (AC4)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenarioDocument.findMany.mockResolvedValue([]);

      await service.listDocuments('s1', 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.scenarioDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ scenarioId: 's1' }, { partieId: 'p1', scenarioId: null }],
          },
        }),
      );
    });

    it('aucun filtre sur le statut du scénario, même BROUILLON (AC6, AD-6)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenarioDocument.findMany.mockResolvedValue([
        {
          id: 'd1',
          partieId: 'p1',
          scenarioId: 's1',
          originalName: 'x.pdf',
          sizeBytes: 1,
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
        },
      ]);

      const result = await service.listDocuments('s1', 'u1');
      expect(result).toHaveLength(1);
    });

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);
      await expect(service.listDocuments('s1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('non-membre → 403 propagé par getViewable', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.listDocuments('s1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('listLibraryDocuments()', () => {
    it('ne renvoie que les documents scenarioId: null d’une Partie sans aucun scénario créé', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenarioDocument.findMany.mockResolvedValue([]);

      await service.listLibraryDocuments('p1', 'u1');

      expect(prisma.scenario.findUnique).not.toHaveBeenCalled();
      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.scenarioDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { partieId: 'p1', scenarioId: null },
        }),
      );
    });
  });

  describe('getDocumentFile()', () => {
    it('téléchargement réussi, aucun filtre sur le statut du scénario parent (AC6, AD-6)', async () => {
      prisma.scenarioDocument.findUnique.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        filename: 'uuid.pdf',
        originalName: 'lettre-ossian.pdf',
      });
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      (readDocumentFile as jest.Mock).mockResolvedValue({
        buffer: Buffer.from('bytes'),
        mime: 'application/pdf',
      });

      const result = await service.getDocumentFile('d1', 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(result.originalName).toBe('lettre-ossian.pdf');
      expect(result.mime).toBe('application/pdf');
    });

    it('document introuvable → 404', async () => {
      prisma.scenarioDocument.findUnique.mockResolvedValue(null);
      await expect(service.getDocumentFile('d1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('fichier disque manquant → 404', async () => {
      prisma.scenarioDocument.findUnique.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        filename: 'uuid.pdf',
        originalName: 'x.pdf',
      });
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      (readDocumentFile as jest.Mock).mockResolvedValue(null);

      await expect(service.getDocumentFile('d1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('non-membre → 403 propagé par getViewable', async () => {
      prisma.scenarioDocument.findUnique.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        filename: 'uuid.pdf',
        originalName: 'x.pdf',
      });
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.getDocumentFile('d1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('listDrafts()', () => {
    it('retourne uniquement les scénarios BROUILLON de la Partie (AC2)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.findMany.mockResolvedValue([]);

      await service.listDrafts('p1', 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.findMany).toHaveBeenCalledWith({
        where: { partieId: 'p1', status: 'BROUILLON' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('non-MJ → 403 propagé par getOwned, aucune lecture', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.listDrafts('p1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.scenario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllForPartie()', () => {
    it('lecture ouverte à tout membre (getViewable, pas getOwned), tri chronologique croissant avec tie-breaker id (Story 17.1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([]);

      await service.findAllForPartie('p1', 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(parties.getOwned).not.toHaveBeenCalled();
      expect(prisma.scenario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { partieId: 'p1' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('skip/take fournis → transmis tels quels à Prisma (AC1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([]);

      await service.findAllForPartie('p1', 'u1', { skip: 20, take: 10 });

      expect(prisma.scenario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('skip/take absents → aucune limite appliquée (comportement par défaut inchangé)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([]);

      await service.findAllForPartie('p1', 'u1');

      expect(prisma.scenario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: undefined, take: undefined }),
      );
    });

    it('inscriptions triées par createdAt asc avec tie-breaker id (AC2, Story 17.1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([]);
      prisma.seance.findMany.mockResolvedValue([]);

      await service.findAllForPartie('p1', 'u1');

      expect(prisma.seance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            inscriptions: expect.objectContaining({
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
          }),
        }),
      );
    });

    it('aucun filtrage par statut — un scénario BROUILLON est bien retourné (AD-6)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([
        {
          id: 's1',
          partieId: 'p1',
          title: 'Brouillon secret',
          description: null,
          status: 'BROUILLON',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-01'),
          closedAt: null,
        },
      ]);

      const result = await service.findAllForPartie('p1', 'u1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 's1', status: 'BROUILLON' });
    });

    it('non-membre → 403 propagé par getViewable, aucune lecture', async () => {
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.findAllForPartie('p1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.scenario.findMany).not.toHaveBeenCalled();
    });

    it('CAMPAGNE_EPISODIQUE : chaque ScenarioDto porte ses participants exacts (AC7)', async () => {
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.findMany.mockResolvedValue([
        {
          id: 's1',
          partieId: 'p1',
          title: 'Enquête 1',
          description: null,
          status: 'COURANT',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-01'),
          closedAt: null,
        },
        {
          id: 's2',
          partieId: 'p1',
          title: 'Enquête 2',
          description: null,
          status: 'COURANT',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-02'),
          closedAt: null,
        },
      ]);
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        { scenarioId: 's1', userId: 'u1', user: { pseudo: 'Alice' } },
        { scenarioId: 's1', userId: 'u2', user: { pseudo: 'Bob' } },
      ]);

      const result = await service.findAllForPartie('p1', 'u1');

      expect(prisma.scenarioParticipant.findMany).toHaveBeenCalledWith({
        where: { scenarioId: { in: ['s1', 's2'] } },
        include: { user: { select: { pseudo: true } } },
      });
      expect(result.find((s) => s.id === 's1')?.participants).toEqual([
        { userId: 'u1', pseudo: 'Alice' },
        { userId: 'u2', pseudo: 'Bob' },
      ]);
      expect(result.find((s) => s.id === 's2')?.participants).toEqual([]);
    });

    it.each(['CAMPAGNE_LINEAIRE', 'ONE_SHOT'])(
      '%s : participants toujours undefined, scenarioParticipant.findMany jamais appelé (AC1/AD-4)',
      async (kind) => {
        parties.getViewable.mockResolvedValue({ id: 'p1', kind });
        prisma.scenario.findMany.mockResolvedValue([
          {
            id: 's1',
            partieId: 'p1',
            title: 'Chapitre 1',
            description: null,
            status: 'COURANT',
            dureeHeures: null,
            dureeSeances: null,
            resumeFin: null,
            createdAt: new Date('2026-07-01'),
            closedAt: null,
          },
        ]);

        const result = await service.findAllForPartie('p1', 'u1');

        expect(result[0].participants).toBeUndefined();
        expect(prisma.scenarioParticipant.findMany).not.toHaveBeenCalled();
      },
    );

    describe('retrospectiveNotes (AC5, AC7, Story 8.6)', () => {
      function makeScenario(overrides: Record<string, unknown> = {}) {
        return {
          id: 's1',
          partieId: 'p1',
          title: 'Chapitre 1',
          description: null,
          status: 'COURANT',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-01'),
          closedAt: null,
          ...overrides,
        };
      }

      it('status !== PASSE → retrospectiveNotes undefined, CharacterService jamais appelé (AC7)', async () => {
        parties.getViewable.mockResolvedValue({
          id: 'p1',
          kind: 'CAMPAGNE_LINEAIRE',
        });
        prisma.scenario.findMany.mockResolvedValue([
          makeScenario({ status: 'COURANT' }),
        ]);

        const result = await service.findAllForPartie('p1', 'u1');

        expect(result[0].retrospectiveNotes).toBeUndefined();
        expect(characters.findAllByPartie).not.toHaveBeenCalled();
        expect(characters.getRetrospectiveNotes).not.toHaveBeenCalled();
      });

      it('PASSE, CAMPAGNE_LINEAIRE → agrège les notes de TOUS les membres de la Partie', async () => {
        parties.getViewable.mockResolvedValue({
          id: 'p1',
          kind: 'CAMPAGNE_LINEAIRE',
        });
        prisma.scenario.findMany.mockResolvedValue([
          makeScenario({ status: 'PASSE' }),
        ]);
        characters.findAllByPartie.mockResolvedValue([
          { id: 'char1', userId: 'u1' },
          { id: 'char2', userId: 'u2' },
        ]);
        characters.getRetrospectiveNotes
          .mockResolvedValueOnce([
            { id: 'n1', characterId: 'char1', text: 'A', shared: true, scenarioId: null, createdAt: '2026-07-01T00:00:00.000Z' },
          ])
          .mockResolvedValueOnce([
            { id: 'n2', characterId: 'char2', text: 'B', shared: false, scenarioId: 's1', createdAt: '2026-07-02T00:00:00.000Z' },
          ]);

        const result = await service.findAllForPartie('p1', 'u1');

        expect(characters.findAllByPartie).toHaveBeenCalledWith('p1');
        expect(characters.getRetrospectiveNotes).toHaveBeenCalledWith(
          'char1',
          's1',
          null,
          null,
        );
        expect(characters.getRetrospectiveNotes).toHaveBeenCalledWith(
          'char2',
          's1',
          null,
          null,
        );
        expect(result[0].retrospectiveNotes).toEqual([
          expect.objectContaining({ id: 'n1' }),
          expect.objectContaining({ id: 'n2' }),
        ]);
      });

      it('PASSE, CAMPAGNE_EPISODIQUE → agrège seulement les personnages des participants du scénario', async () => {
        parties.getViewable.mockResolvedValue({
          id: 'p1',
          kind: 'CAMPAGNE_EPISODIQUE',
        });
        prisma.scenario.findMany.mockResolvedValue([
          makeScenario({ status: 'PASSE' }),
        ]);
        prisma.scenarioParticipant.findMany.mockResolvedValue([
          { scenarioId: 's1', userId: 'u1', user: { pseudo: 'Alice' } },
        ]);
        characters.findAllByPartie.mockResolvedValue([
          { id: 'char1', userId: 'u1' },
          { id: 'char2', userId: 'u2' },
        ]);
        characters.getRetrospectiveNotes.mockResolvedValue([]);

        await service.findAllForPartie('p1', 'u1');

        expect(characters.getRetrospectiveNotes).toHaveBeenCalledTimes(1);
        expect(characters.getRetrospectiveNotes).toHaveBeenCalledWith(
          'char1',
          's1',
          null,
          null,
        );
      });

      it('fenêtre calculée à partir de poll.chosenDate/inscription.dateValidee mixtes (min/max)', async () => {
        parties.getViewable.mockResolvedValue({
          id: 'p1',
          kind: 'CAMPAGNE_LINEAIRE',
        });
        prisma.scenario.findMany.mockResolvedValue([
          makeScenario({ status: 'PASSE' }),
        ]);
        prisma.seance.findMany.mockResolvedValue([
          {
            id: 'seance1',
            scenarioId: 's1',
            poll: {
              id: 'poll1',
              partieId: 'p1',
              status: 'CLOSED',
              scenarioRef: null,
              expiresAt: null,
              chosenDate: new Date('2026-06-10T00:00:00.000Z'),
              chosenSlot: 'MORNING',
              options: [],
            },
            inscriptions: [],
            compteRendu: null,
            createdAt: new Date('2026-06-01'),
          },
          {
            id: 'seance2',
            scenarioId: 's1',
            poll: null,
            inscriptionMin: 2,
            inscriptionMax: 5,
            dateValidee: new Date('2026-06-20T00:00:00.000Z'),
            inscriptions: [],
            compteRendu: null,
            createdAt: new Date('2026-06-05'),
          },
        ]);
        characters.findAllByPartie.mockResolvedValue([
          { id: 'char1', userId: 'u1' },
        ]);
        characters.getRetrospectiveNotes.mockResolvedValue([]);

        await service.findAllForPartie('p1', 'u1');

        expect(characters.getRetrospectiveNotes).toHaveBeenCalledWith(
          'char1',
          's1',
          new Date('2026-06-10T00:00:00.000Z'),
          new Date('2026-06-20T00:00:00.000Z'),
        );
      });

      it('aucune séance datée → fenêtre null/null, seule la branche manuelle s’applique côté CharacterService', async () => {
        parties.getViewable.mockResolvedValue({
          id: 'p1',
          kind: 'CAMPAGNE_LINEAIRE',
        });
        prisma.scenario.findMany.mockResolvedValue([
          makeScenario({ status: 'PASSE' }),
        ]);
        prisma.seance.findMany.mockResolvedValue([
          {
            id: 'seance1',
            scenarioId: 's1',
            poll: null,
            inscriptions: [],
            compteRendu: null,
            createdAt: new Date('2026-06-01'),
          },
        ]);
        characters.findAllByPartie.mockResolvedValue([
          { id: 'char1', userId: 'u1' },
        ]);
        characters.getRetrospectiveNotes.mockResolvedValue([]);

        await service.findAllForPartie('p1', 'u1');

        expect(characters.getRetrospectiveNotes).toHaveBeenCalledWith(
          'char1',
          's1',
          null,
          null,
        );
      });
    });
  });

  describe('participate()', () => {
    it('CAMPAGNE_EPISODIQUE : upsert créé, participants renvoyés (AC2)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenarioParticipant.upsert.mockResolvedValue({});
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Enquête',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01'),
        closedAt: null,
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        {
          scenarioId: VALID_SCENARIO_ID,
          userId: 'u1',
          user: { pseudo: 'Alice' },
        },
      ]);

      const result = await service.participate(VALID_SCENARIO_ID, 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.scenarioParticipant.upsert).toHaveBeenCalledWith({
        where: {
          scenarioId_userId: { scenarioId: VALID_SCENARIO_ID, userId: 'u1' },
        },
        create: { scenarioId: VALID_SCENARIO_ID, userId: 'u1' },
        update: {},
      });
      expect(result.participants).toEqual([{ userId: 'u1', pseudo: 'Alice' }]);
    });

    it('second appel du même joueur → upsert toujours appelé, aucune exception (idempotence, AC2)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenarioParticipant.upsert.mockResolvedValue({});
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Enquête',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01'),
        closedAt: null,
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        {
          scenarioId: VALID_SCENARIO_ID,
          userId: 'u1',
          user: { pseudo: 'Alice' },
        },
      ]);

      await service.participate(VALID_SCENARIO_ID, 'u1');
      await expect(
        service.participate(VALID_SCENARIO_ID, 'u1'),
      ).resolves.toBeDefined();
      expect(prisma.scenarioParticipant.upsert).toHaveBeenCalledTimes(2);
    });

    it.each(['ONE_SHOT', 'CAMPAGNE_LINEAIRE'])(
      '%s → rejet 400, scenarioParticipant.upsert jamais appelé (AC6)',
      async (kind) => {
        prisma.scenario.findUnique.mockResolvedValue({
          id: VALID_SCENARIO_ID,
          partieId: 'p1',
          status: 'COURANT',
        });
        parties.getViewable.mockResolvedValue({ id: 'p1', kind });

        await expect(
          service.participate(VALID_SCENARIO_ID, 'u1'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.scenarioParticipant.upsert).not.toHaveBeenCalled();
      },
    );

    it('non-membre → 403 propagé par getViewable, aucune écriture (AC5)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(
        service.participate(VALID_SCENARIO_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenarioParticipant.upsert).not.toHaveBeenCalled();
    });

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.participate(VALID_SCENARIO_ID, 'u1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scenarioParticipant.upsert).not.toHaveBeenCalled();
    });
  });

  describe('open()', () => {
    it('transition BROUILLON → A_VENIR réussie (AC3)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.update.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Le Marché aux Ombres',
        description: null,
        status: 'A_VENIR',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.open(VALID_SCENARIO_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VALID_SCENARIO_ID },
          data: { status: 'A_VENIR' },
        }),
      );
      expect(result.status).toBe('A_VENIR');
    });

    it('CAMPAGNE_EPISODIQUE : participants restent peuplés dans le DTO retourné après open() (non-régression)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.update.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Enquête',
        description: null,
        status: 'A_VENIR',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        {
          scenarioId: VALID_SCENARIO_ID,
          userId: 'u1',
          user: { pseudo: 'Alice' },
        },
      ]);

      const result = await service.open(VALID_SCENARIO_ID, 'mj1');

      expect(result.participants).toEqual([{ userId: 'u1', pseudo: 'Alice' }]);
    });

    it.each(['A_VENIR', 'COURANT', 'PASSE'])(
      'scénario déjà %s → rejet, aucune écriture (AC4)',
      async (status) => {
        prisma.scenario.findUnique.mockResolvedValue({
          id: VALID_SCENARIO_ID,
          partieId: 'p1',
          status,
        });
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

        await expect(service.open(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.scenario.update).not.toHaveBeenCalled();
      },
    );

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(service.open(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'BROUILLON',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.open(VALID_SCENARIO_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });
  });

  describe('markCourant()', () => {
    it('CAMPAGNE_LINEAIRE, aucun autre COURANT → transition réussie sous verrou (AC1)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.tx.scenario.findFirst.mockResolvedValue(null);
      prisma.tx.scenario.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 2',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.markCourant(VALID_SCENARIO_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.tx.scenario.findFirst).toHaveBeenCalledWith({
        where: { partieId: 'p1', status: 'COURANT' },
      });
      expect(prisma.tx.scenario.updateMany).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID, status: 'A_VENIR' },
        data: { status: 'COURANT' },
      });
      expect(result.status).toBe('COURANT');
    });

    it('CAMPAGNE_LINEAIRE, statut changé sous le nez du verrou (count 0) → 409, aucune écriture (AC1, TOCTOU)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.tx.scenario.findFirst.mockResolvedValue(null);
      prisma.tx.scenario.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markCourant(VALID_SCENARIO_ID, 'mj1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.tx.scenario.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('CAMPAGNE_LINEAIRE, un scénario déjà COURANT → 409, aucune écriture (AC2)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.tx.scenario.findFirst.mockResolvedValue({
        id: 'autre-scenario',
        partieId: 'p1',
        status: 'COURANT',
      });

      await expect(
        service.markCourant(VALID_SCENARIO_ID, 'mj1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.tx.scenario.updateMany).not.toHaveBeenCalled();
    });

    it('CAMPAGNE_EPISODIQUE, un COURANT existant → transition réussie sans verrou (AC3)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 1 });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Digression',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([]);

      const result = await service.markCourant(VALID_SCENARIO_ID, 'mj1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.scenario.updateMany).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID, status: 'A_VENIR' },
        data: { status: 'COURANT' },
      });
      expect(result.status).toBe('COURANT');
    });

    it('statut changé sous le nez de l’écriture directe (count 0, hors CAMPAGNE_LINEAIRE) → 409 (AC1, TOCTOU)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markCourant(VALID_SCENARIO_ID, 'mj1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.scenario.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('ONE_SHOT → transition réussie sans verrou (AC6)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'ONE_SHOT',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 1 });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'One-shot',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.markCourant(VALID_SCENARIO_ID, 'mj1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.status).toBe('COURANT');
    });

    it.each(['BROUILLON', 'COURANT', 'PASSE'])(
      'statut source %s (≠ A_VENIR) → rejet, aucune écriture (AC4)',
      async (status) => {
        prisma.scenario.findUnique.mockResolvedValue({
          id: VALID_SCENARIO_ID,
          partieId: 'p1',
          status,
        });
        parties.getOwned.mockResolvedValue({
          id: 'p1',
          mjId: 'mj1',
          kind: 'CAMPAGNE_LINEAIRE',
        });

        await expect(
          service.markCourant(VALID_SCENARIO_ID, 'mj1'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
      },
    );

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.markCourant(VALID_SCENARIO_ID, 'mj1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune lecture/écriture (AC5)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.markCourant(VALID_SCENARIO_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('COURANT → transition réussie vers PASSE, closedAt renseigné (AC1)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 1 });
      const closedAt = new Date('2026-07-13T10:00:00.000Z');
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'PASSE',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt,
      });

      const result = await service.close(VALID_SCENARIO_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.updateMany).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID, status: 'COURANT' },
        data: { status: 'PASSE', closedAt: expect.any(Date) },
      });
      expect(result.status).toBe('PASSE');
      expect(result.closedAt).toEqual(closedAt.toISOString());
    });

    it('CAMPAGNE_EPISODIQUE : participants restent peuplés dans le DTO retourné après close() (non-régression)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 1 });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Enquête',
        description: null,
        status: 'PASSE',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: new Date('2026-07-13T10:00:00.000Z'),
      });
      prisma.scenarioParticipant.findMany.mockResolvedValue([
        {
          scenarioId: VALID_SCENARIO_ID,
          userId: 'u1',
          user: { pseudo: 'Alice' },
        },
      ]);

      const result = await service.close(VALID_SCENARIO_ID, 'mj1');

      expect(result.participants).toEqual([{ userId: 'u1', pseudo: 'Alice' }]);
    });

    it.each(['BROUILLON', 'A_VENIR', 'PASSE'])(
      'statut source %s (≠ COURANT) → rejet, aucune écriture (AC2)',
      async (status) => {
        prisma.scenario.findUnique.mockResolvedValue({
          id: VALID_SCENARIO_ID,
          partieId: 'p1',
          status,
        });
        parties.getOwned.mockResolvedValue({
          id: 'p1',
          mjId: 'mj1',
          kind: 'CAMPAGNE_LINEAIRE',
        });

        await expect(service.close(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
          BadRequestException,
        );
        expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
      },
    );

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(service.close(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune lecture/écriture (AC3)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.close(VALID_SCENARIO_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
    });

    it('count 0 (course concurrente) → 409, aucune reconstruction du DTO', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.close(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.scenario.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('AC5 : après close() sur CAMPAGNE_LINEAIRE, markCourant() sur un autre A_VENIR de la même Partie réussit sans 409', async () => {
      // close() du scénario COURANT
      prisma.scenario.findUnique.mockResolvedValueOnce({
        id: 'courant-1',
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValueOnce({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.scenario.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'courant-1',
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'PASSE',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: new Date('2026-07-13T10:00:00.000Z'),
      });

      await service.close('courant-1', 'mj1');

      // markCourant() sur un second scénario A_VENIR — plus aucun COURANT après la clôture ci-dessus
      prisma.scenario.findUnique.mockResolvedValueOnce({
        id: 'a-venir-2',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValueOnce({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.tx.scenario.findFirst.mockResolvedValueOnce(null);
      prisma.tx.scenario.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.tx.scenario.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'a-venir-2',
        partieId: 'p1',
        title: 'Chapitre 2',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
      });

      const promoted = await service.markCourant('a-venir-2', 'mj1');

      expect(promoted.status).toBe('COURANT');
      expect(prisma.tx.scenario.findFirst).toHaveBeenCalledWith({
        where: { partieId: 'p1', status: 'COURANT' },
      });
    });
  });

  describe('addSeance()', () => {
    it('scénario PASSE → rejet 400, aucune création de séance (Story 17.2 AC1)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'PASSE',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.addSeance(VALID_SCENARIO_ID, 'mj1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });

    it('crée une Seance rattachée au scénario, seances peuplées dans le DTO retourné (AC1, AC7)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: 3,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
      });
      prisma.seance.findMany.mockResolvedValue([
        {
          id: 'seance-1',
          scenarioId: VALID_SCENARIO_ID,
          poll: null,
          compteRendu: null,
          createdAt: new Date('2026-07-13T00:00:00.000Z'),
        },
      ]);

      const result = await service.addSeance(VALID_SCENARIO_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.seance.create).toHaveBeenCalledWith({
        data: { scenarioId: VALID_SCENARIO_ID },
      });
      expect(result.seances).toEqual([
        {
          id: 'seance-1',
          scenarioId: VALID_SCENARIO_ID,
          poll: undefined,
          compteRendu: null,
          createdAt: '2026-07-13T00:00:00.000Z',
        },
      ]);
    });

    it('aucun plafond — une 3e séance se crée sans erreur', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
      });
      prisma.seance.findMany.mockResolvedValue([
        {
          id: 's1',
          scenarioId: VALID_SCENARIO_ID,
          poll: null,
          compteRendu: null,
          createdAt: new Date(),
        },
        {
          id: 's2',
          scenarioId: VALID_SCENARIO_ID,
          poll: null,
          compteRendu: null,
          createdAt: new Date(),
        },
        {
          id: 's3',
          scenarioId: VALID_SCENARIO_ID,
          poll: null,
          compteRendu: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.addSeance(VALID_SCENARIO_ID, 'mj1');

      expect(result.seances).toHaveLength(3);
    });

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(service.addSeance(VALID_SCENARIO_ID, 'mj1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.addSeance(VALID_SCENARIO_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });
  });

  describe('recalculateNextSession() (Story 8.8, Décision 2)', () => {
    const NOW = new Date('2026-07-14T12:00:00.000Z');
    const FUTURE_NEAR = new Date('2026-08-01T00:00:00.000Z');
    const FUTURE_FAR = new Date('2026-09-01T00:00:00.000Z');
    const PAST = new Date('2026-06-01T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('plusieurs séances actives → Partie.nextSessionDate reflète la plus proche dans le futur', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', dateValidee: null, poll: { chosenDate: FUTURE_FAR, chosenSlot: 'MORNING' } },
        { id: 's2', dateValidee: null, poll: { chosenDate: FUTURE_NEAR, chosenSlot: 'EVENING' } },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_NEAR,
          nextSessionSlot: 'EVENING',
          reminderSentAt: null,
        },
      });
    });

    it('date passée ignorée — seules les dates futures comptent', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', dateValidee: null, poll: { chosenDate: PAST, chosenSlot: 'MORNING' } },
        { id: 's2', dateValidee: null, poll: { chosenDate: FUTURE_FAR, chosenSlot: 'AFTERNOON' } },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_FAR,
          nextSessionSlot: 'AFTERNOON',
          reminderSentAt: null,
        },
      });
    });

    it('épisodique sans poll, dateValidee brut (héritage) → utilisé, slot null', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', dateValidee: FUTURE_NEAR, poll: null },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_NEAR,
          nextSessionSlot: null,
          reminderSentAt: null,
        },
      });
    });

    it('aucune date future → nextSessionDate/nextSessionSlot remis à null', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', dateValidee: null, poll: null },
        { id: 's2', dateValidee: PAST, poll: null },
      ]);
      prisma.partie.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'p1',
        nextSessionDate: PAST,
        nextSessionSlot: 'MORNING',
        reminderSentAt: null,
      });

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: null,
          nextSessionSlot: null,
          reminderSentAt: null,
        },
      });
    });

    it('date/slot inchangés → reminderSentAt non réinitialisé', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', dateValidee: null, poll: { chosenDate: FUTURE_NEAR, chosenSlot: 'EVENING' } },
      ]);
      prisma.partie.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'p1',
        nextSessionDate: FUTURE_NEAR,
        nextSessionSlot: 'EVENING',
        reminderSentAt: new Date('2026-07-13T00:00:00.000Z'),
      });

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_NEAR,
          nextSessionSlot: 'EVENING',
        },
      });
    });
  });

  describe('deleteSeance()', () => {
    const FIRST_SEANCE_ID = '55555555-5555-4555-a555-555555555555';
    const SECOND_SEANCE_ID = '66666666-6666-4666-a666-666666666666';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('séance non-première → suppression réussie (AC5)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValueOnce([
        {
          id: FIRST_SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);

      await service.deleteSeance(SECOND_SEANCE_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.seance.delete).toHaveBeenCalledWith({
        where: { id: SECOND_SEANCE_ID },
      });
    });

    it('référence scénario orpheline → 404 explicite, pas de 500 (Story 17.2 AC2)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'An operation failed because it depends on one or more records that were required but not found.',
          { code: 'P2025', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.deleteSeance(SECOND_SEANCE_ID, 'mj1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('erreur Prisma autre que P2025 → propagée telle quelle, pas absorbée en 404 (revue de code, Story 17.2)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed.',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      prisma.scenario.findUniqueOrThrow.mockRejectedValue(otherError);

      await expect(
        service.deleteSeance(SECOND_SEANCE_ID, 'mj1'),
      ).rejects.toBe(otherError);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('séance liée à un vote (OPEN ou CLOSED) → le SessionPoll est supprimé avec elle (revue de code : plus d’orphelin)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'poll-orphan',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValueOnce([
        {
          id: FIRST_SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);

      await service.deleteSeance(SECOND_SEANCE_ID, 'mj1');

      expect(prisma.seance.delete).toHaveBeenCalledWith({
        where: { id: SECOND_SEANCE_ID },
      });
      expect(prisma.sessionPoll.delete).toHaveBeenCalledWith({
        where: { id: 'poll-orphan' },
      });
    });

    it('séance sans vote lié → aucun appel à sessionPoll.delete', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValueOnce([
        {
          id: FIRST_SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);

      await service.deleteSeance(SECOND_SEANCE_ID, 'mj1');

      expect(prisma.sessionPoll.delete).not.toHaveBeenCalled();
    });

    it('première séance du scénario → rejet 400, aucune suppression', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: FIRST_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValueOnce([
        {
          id: FIRST_SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);

      await expect(
        service.deleteSeance(FIRST_SEANCE_ID, 'mj1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteSeance(SECOND_SEANCE_ID, 'mj1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune suppression', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.deleteSeance(SECOND_SEANCE_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('scénario PASSE (clôturé) → rejet 400, aucune suppression (revue de code)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario({ status: 'PASSE' }));
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.deleteSeance(SECOND_SEANCE_ID, 'mj1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('détection de la première séance : tie-breaker `id` sur `createdAt` égal (revue de code)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SECOND_SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValueOnce([
        {
          id: FIRST_SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);

      await service.deleteSeance(SECOND_SEANCE_ID, 'mj1');

      expect(prisma.seance.findMany).toHaveBeenCalledWith({
        where: { scenarioId: VALID_SCENARIO_ID },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 1,
      });
    });
  });

  describe('createSeancePoll()', () => {
    const SEANCE_ID = '33333333-3333-4333-a333-333333333333';
    const POLL_ID = '44444444-4444-4444-a444-444444444444';
    const OPTIONS = [
      { date: '2026-08-01T00:00:00.000Z', slot: 'AFTERNOON' as const },
      { date: '2026-08-02T00:00:00.000Z', slot: 'AFTERNOON' as const },
    ];

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('ONE_SHOT/CAMPAGNE_LINEAIRE : création + liaison réussie dans le même appel (AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow
        .mockResolvedValueOnce(mockScenario())
        .mockResolvedValueOnce(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      pollService.create.mockResolvedValue({ id: POLL_ID });
      prisma.seance.findMany.mockResolvedValue([
        {
          id: SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          poll: {
            id: POLL_ID,
            partieId: 'p1',
            status: 'OPEN',
            scenarioRef: null,
            expiresAt: null,
            chosenDate: null,
            chosenSlot: null,
            options: [],
          },
          compteRendu: null,
          createdAt: new Date('2026-07-13T00:00:00.000Z'),
        },
      ]);

      const result = await service.createSeancePoll(SEANCE_ID, 'mj1', OPTIONS);

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(pollService.create).toHaveBeenCalledWith('p1', 'mj1', {
        options: OPTIONS,
      });
      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { pollId: POLL_ID },
      });
      expect(result.seances[0].poll?.id).toBe(POLL_ID);
    });

    it('CAMPAGNE_EPISODIQUE : création + liaison réussie, coexiste avec inscription (Story 8.8, Décision 1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow
        .mockResolvedValueOnce(mockScenario())
        .mockResolvedValueOnce(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      pollService.create.mockResolvedValue({ id: POLL_ID });
      prisma.seance.findMany.mockResolvedValue([
        {
          id: SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          inscriptionMin: 4,
          inscriptionMax: 6,
          poll: {
            id: POLL_ID,
            partieId: 'p1',
            status: 'OPEN',
            scenarioRef: null,
            expiresAt: null,
            chosenDate: null,
            chosenSlot: null,
            options: [],
          },
          inscriptions: [{ userId: 'u2', user: { pseudo: 'Bob' } }],
          compteRendu: null,
          createdAt: new Date('2026-07-13T00:00:00.000Z'),
        },
      ]);

      const result = await service.createSeancePoll(SEANCE_ID, 'mj1', OPTIONS);

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(pollService.create).toHaveBeenCalledWith('p1', 'mj1', {
        options: OPTIONS,
      });
      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { pollId: POLL_ID },
      });
      // Coexistence poll + inscription sur le même SeanceDto (Décision 1, AD-4 révisé).
      expect(result.seances[0].poll?.id).toBe(POLL_ID);
      expect(result.seances[0].inscription?.max).toBe(6);
    });

    it('séance déjà liée à un poll → rejet 400, aucun poll créé, aucune écriture (pas d’écrasement silencieux)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'ancien-poll',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.createSeancePoll(SEANCE_ID, 'mj1', OPTIONS),
      ).rejects.toThrow(BadRequestException);
      expect(pollService.create).not.toHaveBeenCalled();
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('scénario PASSE (clôturé) → rejet 400, aucun poll créé, aucune écriture (revue de code, 2026-07-14)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario({ status: 'PASSE' }));
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.createSeancePoll(SEANCE_ID, 'mj1', OPTIONS),
      ).rejects.toThrow(BadRequestException);
      expect(pollService.create).not.toHaveBeenCalled();
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(
        service.createSeancePoll(SEANCE_ID, 'mj1', OPTIONS),
      ).rejects.toThrow(NotFoundException);
      expect(pollService.create).not.toHaveBeenCalled();
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucun poll créé, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.createSeancePoll(SEANCE_ID, 'stranger', OPTIONS),
      ).rejects.toThrow(ForbiddenException);
      expect(pollService.create).not.toHaveBeenCalled();
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });
  });

  describe('resetSeanceDate() (Story 8.8, AC4)', () => {
    const SEANCE_ID = '33333333-3333-4333-a333-333333333333';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('détache le poll et retire dateValidee, déclenche le recalcul de nextSessionDate', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'poll1',
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValue([]);

      await service.resetSeanceDate(SEANCE_ID, 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { pollId: null, dateValidee: null },
      });
      // Recalcul déclenché : Partie relue/réécrite via recalculateNextSession().
      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ nextSessionDate: null, nextSessionSlot: null }),
      });
    });

    it('le SessionPoll lié est supprimé (revue de code : sans séance, le vote perd son sens — plus d’orphelin)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'poll1',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValue([]);

      await service.resetSeanceDate(SEANCE_ID, 'mj1');

      expect(prisma.sessionPoll.delete).toHaveBeenCalledWith({ where: { id: 'poll1' } });
    });

    it('séance sans poll lié (héritage dateValidee seul) → aucun appel à sessionPoll.delete', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
        dateValidee: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.seance.findMany.mockResolvedValue([]);

      await service.resetSeanceDate(SEANCE_ID, 'mj1');

      expect(prisma.sessionPoll.delete).not.toHaveBeenCalled();
    });

    it('scénario PASSE (clôturé) → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'poll1',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario({ status: 'PASSE' }));
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.resetSeanceDate(SEANCE_ID, 'mj1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(
        service.resetSeanceDate(SEANCE_ID, 'mj1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'poll1',
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.resetSeanceDate(SEANCE_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });
  });

  describe('setSeanceCapacity()', () => {
    const SEANCE_ID = '55555555-5555-4555-a555-555555555555';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'La Dette du Forgeron',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('scénario PASSE → rejet 400, aucune écriture (Story 17.2 AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(
        mockScenario({ status: 'PASSE' }),
      );
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(
        service.setSeanceCapacity(SEANCE_ID, 'mj1', 4, 6),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('CAMPAGNE_EPISODIQUE : capacité enregistrée, reflétée dans le DTO retourné (AC1, AC9)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.seance.findMany.mockResolvedValue([
        {
          id: SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
          poll: null,
          inscriptionMin: 4,
          inscriptionMax: 6,
          dateValidee: null,
          inscriptions: [],
          compteRendu: null,
          createdAt: new Date('2026-07-13T00:00:00.000Z'),
        },
      ]);

      const result = await service.setSeanceCapacity(SEANCE_ID, 'mj1', 4, 6);

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { inscriptionMin: 4, inscriptionMax: 6 },
      });
      expect(result.seances[0].inscription).toEqual({
        min: 4,
        max: 6,
        inscrits: [],
        dateValidee: null,
      });
    });

    it('non-épisodique (CAMPAGNE_LINEAIRE) → rejet 400, aucune écriture (AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(
        service.setSeanceCapacity(SEANCE_ID, 'mj1', 4, 6),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('max < min → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(
        service.setSeanceCapacity(SEANCE_ID, 'mj1', 6, 4),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(
        service.setSeanceCapacity(SEANCE_ID, 'mj1', 4, 6),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.setSeanceCapacity(SEANCE_ID, 'stranger', 4, 6),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });
  });

  describe('inscrire()', () => {
    const SEANCE_ID = '66666666-6666-4666-a666-666666666666';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'La Dette du Forgeron',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('référence scénario orpheline → 404 explicite, pas de 500 (Story 17.2 AC2)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'An operation failed because it depends on one or more records that were required but not found.',
          { code: 'P2025', clientVersion: '7.8.0' },
        ),
      );

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('scénario BROUILLON → rejet 400, aucune inscription créée (Story 17.2 AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(
        mockScenario({ status: 'BROUILLON' }),
      );
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scénario PASSE → rejet 400, aucune inscription créée (Story 17.2 AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(
        mockScenario({ status: 'PASSE' }),
      );
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('nouvel inscrit, count < max → Inscription créée sous verrou (AC2, AC5)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.tx.inscription.findUnique.mockResolvedValue(null);
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({
        id: SEANCE_ID,
        inscriptionMax: 6,
      });
      prisma.tx.inscription.count.mockResolvedValue(2);
      prisma.seance.findMany.mockResolvedValue([]);

      await service.inscrire(SEANCE_ID, 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.tx.$queryRaw).toHaveBeenCalled();
      expect(prisma.tx.inscription.count).toHaveBeenCalledWith({
        where: { seanceId: SEANCE_ID },
      });
      expect(prisma.tx.inscription.create).toHaveBeenCalledWith({
        data: { seanceId: SEANCE_ID, userId: 'u1' },
      });
    });

    it('capacité modifiée entre la lecture initiale et la transaction → utilise la valeur relue sous le verrou', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6, // valeur périmée : setSeanceCapacity() a réduit le max entretemps
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.tx.inscription.findUnique.mockResolvedValue(null);
      // Valeur fraîche sous le verrou : max abaissé à 2, déjà atteint par 2 inscrits.
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({
        id: SEANCE_ID,
        inscriptionMax: 2,
      });
      prisma.tx.inscription.count.mockResolvedValue(2);

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('déjà inscrit (idempotent) — ne recompte jamais le quota, même si max déjà atteint par d’autres (AC2 vs AC4)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.tx.inscription.findUnique.mockResolvedValue({
        seanceId: SEANCE_ID,
        userId: 'u1',
      });
      prisma.seance.findMany.mockResolvedValue([]);

      await service.inscrire(SEANCE_ID, 'u1');

      expect(prisma.tx.seance.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.tx.inscription.count).not.toHaveBeenCalled();
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('nouvel inscrit, count >= max → rejet 409, aucune écriture (AC4)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.tx.inscription.findUnique.mockResolvedValue(null);
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({
        id: SEANCE_ID,
        inscriptionMax: 6,
      });
      prisma.tx.inscription.count.mockResolvedValue(6);

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('capacité non définie (inscriptionMax null) → rejet 400', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: null,
        inscriptionMax: null,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('date déjà validée (héritage Seance.dateValidee) → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('date choisie via un vote clôturé (poll.chosenDate) → rejet 400, aucune écriture (Story 8.8, gap gel du roster)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
        poll: { chosenDate: new Date('2026-08-01T00:00:00.000Z') },
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('date validée (via poll.chosenDate) concurremment entre le check initial et la lecture sous verrou → rejet 409, aucune écriture (TOCTOU, revue de code 2026-07-14)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
        poll: null, // pas encore de date validée au moment du check initial hors transaction
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.tx.inscription.findUnique.mockResolvedValue(null);
      // Le MJ a choisi une date (choose()) entre le check initial et l'acquisition du verrou.
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({
        id: SEANCE_ID,
        inscriptionMax: 6,
        dateValidee: null,
        poll: { chosenDate: new Date('2026-08-01T00:00:00.000Z') },
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.tx.inscription.count).not.toHaveBeenCalled();
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('non-épisodique → rejet 400', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
        dateValidee: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(service.inscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('non-membre → 403 propagé par getViewable, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        inscriptionMin: 4,
        inscriptionMax: 6,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.inscrire(SEANCE_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });
  });

  describe('desinscrire()', () => {
    const SEANCE_ID = '77777777-7777-4777-a777-777777777777';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'La Dette du Forgeron',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('retrait réussi (AC3)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await service.desinscrire(SEANCE_ID, 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.inscription.deleteMany).toHaveBeenCalledWith({
        where: { seanceId: SEANCE_ID, userId: 'u1' },
      });
    });

    it('scénario PASSE → retrait toujours autorisé (décision explicite, Story 17.2 AC1)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(
        mockScenario({ status: 'PASSE' }),
      );
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await service.desinscrire(SEANCE_ID, 'u1');

      expect(prisma.inscription.deleteMany).toHaveBeenCalledWith({
        where: { seanceId: SEANCE_ID, userId: 'u1' },
      });
    });

    it('non-inscrit → no-op silencieux, aucune erreur (AC3)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });
      prisma.inscription.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.desinscrire(SEANCE_ID, 'u1')).resolves.toBeDefined();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(service.desinscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();
    });

    it('non-membre → 403 propagé par getViewable', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.desinscrire(SEANCE_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();
    });

    it('date déjà validée (héritage Seance.dateValidee) → rejet 400, aucune écriture (roster figé après validation MJ)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        dateValidee: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.desinscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();
    });

    it('date choisie via un vote clôturé (poll.chosenDate) → rejet 400, aucune écriture (Story 8.8, gap gel du roster)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        dateValidee: null,
        poll: { chosenDate: new Date('2026-08-01T00:00:00.000Z') },
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getViewable.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      await expect(service.desinscrire(SEANCE_ID, 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();
    });
  });


  describe('setCompteRendu()', () => {
    const SEANCE_ID = '99999999-9999-4999-a999-999999999999';

    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'La Dette du Forgeron',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it.each(['ONE_SHOT', 'CAMPAGNE_LINEAIRE', 'CAMPAGNE_EPISODIQUE'] as const)(
      '%s : compte-rendu enregistré, aucune restriction de kind (AC1)',
      async (kind) => {
        prisma.seance.findUnique.mockResolvedValue({
          id: SEANCE_ID,
          scenarioId: VALID_SCENARIO_ID,
        });
        prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind });

        await service.setCompteRendu(SEANCE_ID, 'mj1', 'Les PJ ont vaincu le dragon.');

        expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
        expect(prisma.seance.update).toHaveBeenCalledWith({
          where: { id: SEANCE_ID },
          data: { compteRendu: 'Les PJ ont vaincu le dragon.' },
        });
      },
    );

    it('chaîne vide acceptée — efface un compte-rendu déjà rédigé', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await service.setCompteRendu(SEANCE_ID, 'mj1', '');

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { compteRendu: '' },
      });
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(
        service.setCompteRendu(SEANCE_ID, 'mj1', 'texte'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.setCompteRendu(SEANCE_ID, 'stranger', 'texte'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });
  });

  describe('setResumeFin()', () => {
    function mockScenario(overrides: Record<string, unknown> = {}) {
      return {
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'La Dette du Forgeron',
        description: null,
        status: 'PASSE',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
        ...overrides,
      };
    }

    it('scénario PASSE : résumé de fin enregistré (AC1)', async () => {
      prisma.scenario.findUnique.mockResolvedValue(mockScenario());
      prisma.scenario.update.mockResolvedValue(mockScenario());
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await service.setResumeFin(
        VALID_SCENARIO_ID,
        'mj1',
        'Les PJ ont vaincu le dragon et sauvé le village.',
      );

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.update).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID },
        data: { resumeFin: 'Les PJ ont vaincu le dragon et sauvé le village.' },
      });
    });

    it('chaîne vide acceptée — efface un résumé déjà rédigé', async () => {
      prisma.scenario.findUnique.mockResolvedValue(
        mockScenario({ resumeFin: 'Ancien résumé' }),
      );
      prisma.scenario.update.mockResolvedValue(mockScenario({ resumeFin: '' }));
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await service.setResumeFin(VALID_SCENARIO_ID, 'mj1', '');

      expect(prisma.scenario.update).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID },
        data: { resumeFin: '' },
      });
    });

    it('rédaction acceptée une seconde fois après une première écriture (AC3, non-régression)', async () => {
      prisma.scenario.findUnique.mockResolvedValue(
        mockScenario({ resumeFin: 'Premier jet' }),
      );
      prisma.scenario.update.mockResolvedValue(
        mockScenario({ resumeFin: 'Version corrigée' }),
      );
      prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario());
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });

      await service.setResumeFin(VALID_SCENARIO_ID, 'mj1', 'Version corrigée');

      expect(prisma.scenario.update).toHaveBeenCalledWith({
        where: { id: VALID_SCENARIO_ID },
        data: { resumeFin: 'Version corrigée' },
      });
    });

    it.each(['BROUILLON', 'A_VENIR', 'COURANT'] as const)(
      'statut %s : rejet 400, aucune écriture (AC2)',
      async (status) => {
        prisma.scenario.findUnique.mockResolvedValue(mockScenario({ status }));
        parties.getOwned.mockResolvedValue({
          id: 'p1',
          mjId: 'mj1',
          kind: 'CAMPAGNE_LINEAIRE',
        });

        await expect(
          service.setResumeFin(VALID_SCENARIO_ID, 'mj1', 'texte'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.scenario.update).not.toHaveBeenCalled();
      },
    );

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.setResumeFin(VALID_SCENARIO_ID, 'mj1', 'texte'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture (AC5)', async () => {
      prisma.scenario.findUnique.mockResolvedValue(mockScenario());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.setResumeFin(VALID_SCENARIO_ID, 'stranger', 'texte'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });
  });

  describe('verifyScenarioBelongsToPartie() (Story 9.1, AD-2)', () => {
    const OTHER_PARTIE_ID = 'p2';

    it('scénario existant et appartenant à la Partie → résout sans erreur', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });

      await expect(
        service.verifyScenarioBelongsToPartie(VALID_SCENARIO_ID, 'p1'),
      ).resolves.toBeUndefined();
    });

    it('scénario BROUILLON de la Partie → résout sans erreur (AC7, aucune validation de statut)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'BROUILLON',
      });

      await expect(
        service.verifyScenarioBelongsToPartie(VALID_SCENARIO_ID, 'p1'),
      ).resolves.toBeUndefined();
    });

    it('scénario A_VENIR de la Partie → résout sans erreur (AC7, aucune validation de statut)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'A_VENIR',
      });

      await expect(
        service.verifyScenarioBelongsToPartie(VALID_SCENARIO_ID, 'p1'),
      ).resolves.toBeUndefined();
    });

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyScenarioBelongsToPartie(VALID_SCENARIO_ID, 'p1'),
      ).rejects.toThrow(NotFoundException);
    });

    it("scénario appartenant à une autre Partie → 400 (AC3)", async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: OTHER_PARTIE_ID,
        status: 'COURANT',
      });

      await expect(
        service.verifyScenarioBelongsToPartie(VALID_SCENARIO_ID, 'p1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
