import {
  BadRequestException,
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
  return {
    scenario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    scenarioDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
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
});
