import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('./document-mime.util', () => ({
  detectDocumentMime: jest.fn(),
}));
jest.mock('./document-storage.util', () => ({
  writeDocumentFile: jest.fn(),
  readDocumentFile: jest.fn(),
  deleteDocumentFile: jest.fn(),
}));

import { detectDocumentMime } from './document-mime.util';
import {
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from './document-storage.util';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from './scenarios.service';

function makePrisma() {
  const tx = {
    $queryRaw: jest.fn(),
    scenario: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
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
    },
    sessionPoll: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    tx,
  };
}

function makeParties() {
  return { getOwned: jest.fn(), getViewable: jest.fn() };
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

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makeParties();
    // Chaque transition d'état (toEnrichedDto) charge désormais les séances — [] par défaut pour
    // les tests qui ne portent pas explicitement sur `seances` (AC7, jamais undefined).
    prisma.seance.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        ScenariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
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

      expect(prisma.seance.create).toHaveBeenCalledWith({ data: { scenarioId: 's1' } });
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_EPISODIQUE' });
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

      const result = await service.update('s1', 'mj1', { title: 'Nouveau titre' });

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
    it('lecture ouverte à tout membre (getViewable, pas getOwned), tri chronologique croissant (AC1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1' });
      prisma.scenario.findMany.mockResolvedValue([]);

      await service.findAllForPartie('p1', 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(parties.getOwned).not.toHaveBeenCalled();
      expect(prisma.scenario.findMany).toHaveBeenCalledWith({
        where: { partieId: 'p1' },
        orderBy: { createdAt: 'asc' },
      });
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
      parties.getViewable.mockResolvedValue({ id: 'p1', kind: 'CAMPAGNE_EPISODIQUE' });
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
  });

  describe('participate()', () => {
    it('CAMPAGNE_EPISODIQUE : upsert créé, participants renvoyés (AC2)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getViewable.mockResolvedValue({ id: 'p1', kind: 'CAMPAGNE_EPISODIQUE' });
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
        { scenarioId: VALID_SCENARIO_ID, userId: 'u1', user: { pseudo: 'Alice' } },
      ]);

      const result = await service.participate(VALID_SCENARIO_ID, 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(prisma.scenarioParticipant.upsert).toHaveBeenCalledWith({
        where: { scenarioId_userId: { scenarioId: VALID_SCENARIO_ID, userId: 'u1' } },
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
      parties.getViewable.mockResolvedValue({ id: 'p1', kind: 'CAMPAGNE_EPISODIQUE' });
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
        { scenarioId: VALID_SCENARIO_ID, userId: 'u1', user: { pseudo: 'Alice' } },
      ]);

      await service.participate(VALID_SCENARIO_ID, 'u1');
      await expect(service.participate(VALID_SCENARIO_ID, 'u1')).resolves.toBeDefined();
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

        await expect(service.participate(VALID_SCENARIO_ID, 'u1')).rejects.toThrow(
          BadRequestException,
        );
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

      await expect(service.participate(VALID_SCENARIO_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.scenarioParticipant.upsert).not.toHaveBeenCalled();
    });

    it('scénario introuvable → 404', async () => {
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(service.participate(VALID_SCENARIO_ID, 'u1')).rejects.toThrow(
        NotFoundException,
      );
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_EPISODIQUE' });
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
        { scenarioId: VALID_SCENARIO_ID, userId: 'u1', user: { pseudo: 'Alice' } },
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

        await expect(
          service.open(VALID_SCENARIO_ID, 'mj1'),
        ).rejects.toThrow(BadRequestException);
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

      await expect(
        service.open(VALID_SCENARIO_ID, 'stranger'),
      ).rejects.toThrow(ForbiddenException);
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_EPISODIQUE' });
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
        { scenarioId: VALID_SCENARIO_ID, userId: 'u1', user: { pseudo: 'Alice' } },
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
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });

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

      await expect(service.close(VALID_SCENARIO_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
    });

    it('count 0 (course concurrente) → 409, aucune reconstruction du DTO', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
      parties.getOwned.mockResolvedValueOnce({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
      parties.getOwned.mockResolvedValueOnce({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
    it('crée une Seance rattachée au scénario, seances peuplées dans le DTO retourné (AC1, AC7)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        status: 'COURANT',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
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
        { id: 's1', scenarioId: VALID_SCENARIO_ID, poll: null, compteRendu: null, createdAt: new Date() },
        { id: 's2', scenarioId: VALID_SCENARIO_ID, poll: null, compteRendu: null, createdAt: new Date() },
        { id: 's3', scenarioId: VALID_SCENARIO_ID, poll: null, compteRendu: null, createdAt: new Date() },
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

      await expect(service.addSeance(VALID_SCENARIO_ID, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });
  });

  describe('linkSeancePoll()', () => {
    const SEANCE_ID = '33333333-3333-4333-a333-333333333333';
    const POLL_ID = '44444444-4444-4444-a444-444444444444';

    it('ONE_SHOT/CAMPAGNE_LINEAIRE : liaison réussie, Seance.pollId renseigné (AC2)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
      prisma.sessionPoll.findUnique.mockResolvedValue({ id: POLL_ID, partieId: 'p1', status: 'OPEN' });
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

      const result = await service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID);

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: SEANCE_ID },
        data: { pollId: POLL_ID },
      });
      expect(result.seances[0].poll?.id).toBe(POLL_ID);
    });

    it('CAMPAGNE_EPISODIQUE → rejet 400, aucune écriture (AC4)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
      });
      prisma.scenario.findUniqueOrThrow.mockResolvedValue({
        id: VALID_SCENARIO_ID,
        partieId: 'p1',
        title: 'Enquête',
        description: null,
        status: 'COURANT',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        closedAt: null,
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_EPISODIQUE' });

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('séance déjà liée à un poll → rejet 400, aucune écriture (pas d’écrasement silencieux)', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: 'ancien-poll',
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('poll non OPEN (déjà clôturé) → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: POLL_ID,
        partieId: 'p1',
        status: 'CLOSED',
      });

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('poll appartenant à une autre Partie → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
      prisma.sessionPoll.findUnique.mockResolvedValue({ id: POLL_ID, partieId: 'autre-partie' });

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('poll introuvable → rejet 400, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
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
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', kind: 'CAMPAGNE_LINEAIRE' });
      prisma.sessionPoll.findUnique.mockResolvedValue(null);

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('séance introuvable → 404', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);

      await expect(service.linkSeancePoll(SEANCE_ID, 'mj1', POLL_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: SEANCE_ID,
        scenarioId: VALID_SCENARIO_ID,
        pollId: null,
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
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.linkSeancePoll(SEANCE_ID, 'stranger', POLL_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });
  });
});
