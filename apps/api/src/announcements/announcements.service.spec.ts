import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// ScenariosService (import réel pour servir de jeton DI) importe transitivement CharacterService
// -> @master-jdr/game-rules (ESM, non transformé par ts-jest) — même mock que
// scenarios.service.spec.ts pour éviter "Unexpected token export" au chargement du module.
jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  pendingLevels: jest.fn(),
  LEVEL_TABLE: [],
}));

import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';

function makePrisma() {
  return {
    announcement: {
      create: jest.fn(),
    },
  } as any;
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

function makeScenariosService() {
  return {
    verifyScenarioBelongsToPartie: jest.fn(),
  };
}

function makeAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ann1',
    partieId: 'p1',
    scenarioId: null,
    text: 'Une annonce',
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;
  let scenarios: ReturnType<typeof makeScenariosService>;

  beforeEach(async () => {
    prisma = makePrisma();
    parties = makePartiesService();
    scenarios = makeScenariosService();
    const module = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: ScenariosService, useValue: scenarios },
      ],
    }).compile();
    service = module.get(AnnouncementsService);
  });

  describe('create()', () => {
    it("pas de scenarioId → Announcement créée avec scenarioId: null (AC1)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.announcement.create.mockResolvedValue(makeAnnouncement());

      const result = await service.create('p1', 'mj1', { text: 'Une annonce' });

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(scenarios.verifyScenarioBelongsToPartie).not.toHaveBeenCalled();
      expect(prisma.announcement.create).toHaveBeenCalledWith({
        data: { partieId: 'p1', scenarioId: null, text: 'Une annonce' },
      });
      expect(result.scenarioId).toBeNull();
    });

    it('scenarioId valide de la Partie → Announcement créée avec ce scenarioId (AC2)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      scenarios.verifyScenarioBelongsToPartie.mockResolvedValue(undefined);
      prisma.announcement.create.mockResolvedValue(
        makeAnnouncement({ scenarioId: 's1' }),
      );

      const result = await service.create('p1', 'mj1', {
        text: 'Une annonce scopée',
        scenarioId: 's1',
      });

      expect(scenarios.verifyScenarioBelongsToPartie).toHaveBeenCalledWith(
        's1',
        'p1',
      );
      expect(prisma.announcement.create).toHaveBeenCalledWith({
        data: { partieId: 'p1', scenarioId: 's1', text: 'Une annonce scopée' },
      });
      expect(result.scenarioId).toBe('s1');
    });

    it("scenarioId d'une autre Partie → rejet propagé par verifyScenarioBelongsToPartie, aucune écriture (AC3)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      scenarios.verifyScenarioBelongsToPartie.mockRejectedValue(
        new Error("Ce scénario n'appartient pas à cette Partie"),
      );

      await expect(
        service.create('p1', 'mj1', { text: 'x', scenarioId: 's-autre' }),
      ).rejects.toThrow();
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });

    it('scenarioId visant un scénario BROUILLON/A_VENIR de la même Partie → acceptée, aucune validation de statut (AC7)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      // verifyScenarioBelongsToPartie ne valide jamais le statut (délégué à ScenariosService, AD-2) —
      // ce test documente que AnnouncementsService ne fait lui non plus aucune vérification de statut.
      scenarios.verifyScenarioBelongsToPartie.mockResolvedValue(undefined);
      prisma.announcement.create.mockResolvedValue(
        makeAnnouncement({ scenarioId: 's-brouillon' }),
      );

      await expect(
        service.create('p1', 'mj1', { text: 'x', scenarioId: 's-brouillon' }),
      ).resolves.toBeDefined();
      expect(prisma.announcement.create).toHaveBeenCalled();
    });

    it('non-MJ → ForbiddenException propagée par getOwned, aucune écriture (AC6)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create('p1', 'stranger', { text: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(scenarios.verifyScenarioBelongsToPartie).not.toHaveBeenCalled();
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });
  });
});
