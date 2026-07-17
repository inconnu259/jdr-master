import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// HommeDragonService importe validateHommeDragon/computeHommeDragonDerived/levelForScenariosPasse
// depuis @master-jdr/game-rules (ESM, non transformé par ts-jest) — même mécanisme que ailleurs
// dans le projet (cf. mémoire d'équipe : "game-rules ESM jest.mock") pour éviter "Unexpected token
// export" au chargement du module. levelForScenariosPasse/computeHommeDragonDerived sont réimplémentées
// ici à l'identique (fonctions pures, triviales) plutôt que mockées en jest.fn() — les tests Story 10.3
// vérifient une vraie table de vérité niveau/PS, pas juste que la fonction est appelée.
jest.mock('@master-jdr/game-rules', () => ({
  validateHommeDragon: jest.fn(),
  levelForScenariosPasse: (count: number) => {
    const thresholds = [
      { level: 2, scenariosPasse: 1 },
      { level: 3, scenariosPasse: 3 },
      { level: 4, scenariosPasse: 7 },
      { level: 5, scenariosPasse: 12 },
    ];
    let level = 1;
    for (const entry of thresholds) {
      if (count >= entry.scenariosPasse) level = entry.level;
    }
    return level;
  },
  computeHommeDragonDerived: (level: number) => {
    if (level <= 2) return { PS: 3 };
    if (level <= 4) return { PS: 5 };
    return { PS: 10 };
  },
  pendingEveilLevels: (currentLevel: number, appliedLevels: number[]) => {
    const pending: number[] = [];
    for (let level = 2; level <= currentLevel; level++) {
      if (!appliedLevels.includes(level)) pending.push(level);
    }
    return pending;
  },
}));

import { validateHommeDragon } from '@master-jdr/game-rules';
import { HommeDragonService } from './homme-dragon.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { ScenariosService } from '../scenarios/scenarios.service';

const mockValidate = validateHommeDragon as jest.Mock;

function makePrisma() {
  const tx = {
    $queryRaw: jest.fn(),
    hommeDragon: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    hommeDragon: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    tx,
  } as any;
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
    listMembers: jest.fn(),
  };
}

function makeGameSystems() {
  return {
    getContent: jest.fn(),
  };
}

function makeScenarios() {
  return {
    findAllForPartie: jest.fn(),
  };
}

function makeHommeDragon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hd1',
    userId: 'mj1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {
      race: 'DRAGON_ROUGE',
      artefact: { key: 'grand-arc' },
      nom: 'Ignis',
    },
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

function makeScenarioDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    partieId: 'p1',
    title: 'Le Marché aux Ombres',
    description: null,
    status: 'PASSE',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    closedAt: '2026-07-10T00:00:00.000Z',
    seances: [],
    ...overrides,
  };
}

const CATALOG_CONTENT = {
  hommeDragonArtefact: [
    { key: 'grand-arc', data: { key: 'grand-arc', label: 'Grand arc', race: 'DRAGON_ROUGE' } },
    { key: 'lanterne', data: { key: 'lanterne', label: 'Lanterne', race: 'DRAGON_VERT' } },
  ],
  eveilPower: [
    { key: 'escorte-du-dragon', data: { key: 'escorte-du-dragon', label: 'Escorte du dragon', ps: 2 } },
    { key: 'couche-du-dragon', data: { key: 'couche-du-dragon', label: 'Couche du dragon', ps: 2 } },
  ],
};

describe('HommeDragonService', () => {
  let service: HommeDragonService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;
  let gameSystems: ReturnType<typeof makeGameSystems>;
  let scenarios: ReturnType<typeof makeScenarios>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    gameSystems = makeGameSystems();
    scenarios = makeScenarios();
    gameSystems.getContent.mockResolvedValue(CATALOG_CONTENT);
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    // Valeurs neutres par défaut (Story 10.2) — ne doivent PAS casser les tests Story 10.1
    // existants qui n'assertent pas sur voyageursProteges/historique.
    parties.listMembers.mockResolvedValue([]);
    scenarios.findAllForPartie.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        HommeDragonService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: GameSystemService, useValue: gameSystems },
        { provide: ScenariosService, useValue: scenarios },
      ],
    }).compile();
    service = module.get(HommeDragonService);
  });

  describe('create()', () => {
    const dto = {
      race: 'DRAGON_ROUGE' as const,
      artefact: { key: 'grand-arc' },
      nom: 'Ignis',
    };

    it('MJ sans Homme Dragon existant → création réussie (AC1)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      prisma.hommeDragon.create.mockResolvedValue(makeHommeDragon());

      const result = await service.create('p1', 'mj1', dto);

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.hommeDragon.create).toHaveBeenCalledWith({
        data: {
          userId: 'mj1',
          partieId: 'p1',
          gameSystemId: 'ryuutama',
          sheetData: expect.objectContaining({ race: 'DRAGON_ROUGE', nom: 'Ignis' }),
        },
      });
      expect(result.sheetData.nom).toBe('Ignis');
    });

    it("mondesProteges non fourni → pré-rempli avec partie.name en défense de profondeur", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      prisma.hommeDragon.create.mockResolvedValue(makeHommeDragon());

      await service.create('p1', 'mj1', dto);

      expect(prisma.hommeDragon.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sheetData: expect.objectContaining({ mondesProteges: 'Ma Campagne' }),
        }),
      });
    });

    it('mondesProteges fourni par le DTO → conservé tel quel, pas écrasé', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      prisma.hommeDragon.create.mockResolvedValue(makeHommeDragon());

      await service.create('p1', 'mj1', { ...dto, mondesProteges: 'Monde perso' });

      expect(prisma.hommeDragon.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sheetData: expect.objectContaining({ mondesProteges: 'Monde perso' }),
        }),
      });
    });

    it('artefact hors catalogue/mauvaise race → BadRequestException, aucune écriture', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      mockValidate.mockReturnValue({
        valid: false,
        errors: [{ field: 'artefact.key', message: 'invalide' }],
      });

      await expect(service.create('p1', 'mj1', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.hommeDragon.create).not.toHaveBeenCalled();
    });

    it('Partie non-Ryuutama → BadRequestException, aucune écriture', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'autre-systeme', name: 'X' });

      await expect(service.create('p1', 'mj1', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.hommeDragon.create).not.toHaveBeenCalled();
    });

    it("2e création sur la même Partie (P2002) → ConflictException (AC2)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      prisma.hommeDragon.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create('p1', 'mj1', dto)).rejects.toThrow(
        'Vous avez déjà un Homme Dragon sur cette Partie',
      );
    });

    it('non-MJ → ForbiddenException propagée par getOwned, aucune écriture (AC3)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.create('p1', 'stranger', dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.hommeDragon.create).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it("changement d'artefact accepté, aucun verrou optimiste (AD-2, AC4)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      prisma.hommeDragon.update.mockResolvedValue(
        makeHommeDragon({
          sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grande-epee' }, nom: 'Ignis' },
        }),
      );

      const result = await service.update('p1', 'mj1', { artefact: { key: 'grande-epee' } });

      expect(prisma.hommeDragon.update).toHaveBeenCalledWith({
        where: { userId_partieId_gameSystemId: { userId: 'mj1', partieId: 'p1', gameSystemId: 'ryuutama' } },
        data: {
          sheetData: expect.objectContaining({ artefact: { key: 'grande-epee' } }),
        },
      });
      expect(result.sheetData.artefact.key).toBe('grande-epee');
    });

    it("changement d'artefact vers la mauvaise race → BadRequestException, aucune écriture", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      mockValidate.mockReturnValue({
        valid: false,
        errors: [{ field: 'artefact.key', message: 'invalide' }],
      });

      await expect(
        service.update('p1', 'mj1', { artefact: { key: 'lanterne' } }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.hommeDragon.update).not.toHaveBeenCalled();
    });

    it('champs narratifs seuls (sans artefact) → revalidé et appliqué (revue de code : nom obligatoire re-vérifié)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      prisma.hommeDragon.update.mockResolvedValue(makeHommeDragon());

      await service.update('p1', 'mj1', { demeure: 'Une auberge' });

      expect(mockValidate).toHaveBeenCalled();
      expect(prisma.hommeDragon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sheetData: expect.objectContaining({ demeure: 'Une auberge' }) },
        }),
      );
    });

    it("nom vidé sans artefact → BadRequestException, aucune écriture (revue de code)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      mockValidate.mockReturnValue({
        valid: false,
        errors: [{ field: 'nom', message: 'Le nom est obligatoire' }],
      });

      await expect(service.update('p1', 'mj1', { nom: '' })).rejects.toThrow(BadRequestException);
      expect(prisma.hommeDragon.update).not.toHaveBeenCalled();
    });

    it("changement d'artefact vers une nouvelle clé sans nom/inscription → conserve le nom/inscription existants (revue de code : merge, pas un remplacement)", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(
        makeHommeDragon({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc', nom: 'Le Perceur', inscription: 'Pour Ignis' },
            nom: 'Ignis',
          },
        }),
      );
      prisma.hommeDragon.update.mockResolvedValue(makeHommeDragon());

      await service.update('p1', 'mj1', { artefact: { key: 'grande-epee' } });

      expect(prisma.hommeDragon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sheetData: expect.objectContaining({
              artefact: { key: 'grande-epee', nom: 'Le Perceur', inscription: 'Pour Ignis' },
            }),
          },
        }),
      );
    });

    it('Partie basculée hors Ryuutama entretemps → BadRequestException, aucune écriture (revue de code)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'draconis' });

      await expect(service.update('p1', 'mj1', { demeure: 'x' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.hommeDragon.findUnique).not.toHaveBeenCalled();
    });

    it("aucun Homme Dragon existant → NotFoundException", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(null);

      await expect(service.update('p1', 'mj1', { demeure: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.hommeDragon.update).not.toHaveBeenCalled();
    });

    it('non-MJ → ForbiddenException propagée par getOwned, aucune écriture (AC3)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.update('p1', 'stranger', { demeure: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.hommeDragon.update).not.toHaveBeenCalled();
    });
  });

  describe('findOne()', () => {
    it('Homme Dragon existant → DTO retourné (MJ ou membre, NFR1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'u2');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u2');
      expect(prisma.hommeDragon.findUnique).toHaveBeenCalledWith({
        where: { userId_partieId_gameSystemId: { userId: 'mj1', partieId: 'p1', gameSystemId: 'ryuutama' } },
      });
      expect(result?.id).toBe('hd1');
    });

    it("aucun Homme Dragon créé → null, jamais d'exception", async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      prisma.hommeDragon.findUnique.mockResolvedValue(null);

      const result = await service.findOne('p1', 'mj1');

      expect(result).toBeNull();
    });

    it('Partie basculée hors Ryuutama entretemps → null, aucune fuite de fiche orpheline (revue de code)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'draconis' });

      const result = await service.findOne('p1', 'mj1');

      expect(result).toBeNull();
      expect(prisma.hommeDragon.findUnique).not.toHaveBeenCalled();
    });

    it('non-membre → ForbiddenException propagée par getViewable', async () => {
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(service.findOne('p1', 'stranger')).rejects.toThrow(ForbiddenException);
      expect(prisma.hommeDragon.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('voyageursProteges / historique (Story 10.2)', () => {
    function makeMembers() {
      return [
        { userId: 'u1', pseudo: 'alice', email: 'a@x.test', joinedAt: new Date() },
        { userId: 'u2', pseudo: 'bob', email: 'b@x.test', joinedAt: new Date() },
      ];
    }

    it('findOne() : voyageursProteges reflète les membres actuels, historique liste le scénario PASSE avec titre/date/participants (AC1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([makeScenarioDto()]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'u2');

      expect(result?.voyageursProteges).toEqual([
        { userId: 'u1', pseudo: 'alice' },
        { userId: 'u2', pseudo: 'bob' },
      ]);
      expect(result?.historique).toEqual([
        {
          scenarioTitle: 'Le Marché aux Ombres',
          date: '2026-07-10T00:00:00.000Z',
          participants: ['alice', 'bob'],
        },
      ]);
    });

    it('aucun scénario PASSE → historique: [], pas d’exception (AC2)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.historique).toEqual([]);
    });

    it('scénarios BROUILLON/A_VENIR/COURANT mélangés avec un PASSE → seul le PASSE apparaît (AC3)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([
        makeScenarioDto({ id: 's-brouillon', title: 'Brouillon', status: 'BROUILLON', closedAt: null }),
        makeScenarioDto({ id: 's-avenir', title: 'À venir', status: 'A_VENIR', closedAt: null }),
        makeScenarioDto({ id: 's-courant', title: 'Courant', status: 'COURANT', closedAt: null }),
        makeScenarioDto({ id: 's-passe', title: 'Passé', status: 'PASSE' }),
      ]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.historique).toHaveLength(1);
      expect(result?.historique[0].scenarioTitle).toBe('Passé');
    });

    it('CAMPAGNE_EPISODIQUE avec participants peuplés sur le ScenarioDto → historique ne liste que ces participants, pas tous les membres', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([
        makeScenarioDto({ participants: [{ userId: 'u1', pseudo: 'alice' }] }),
      ]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.historique[0].participants).toEqual(['alice']);
    });

    it('ONE_SHOT/CAMPAGNE_LINEAIRE (participants undefined sur le ScenarioDto) → historique liste tous les membres actuels (fallback)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([makeScenarioDto({ participants: undefined })]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.historique[0].participants).toEqual(['alice', 'bob']);
    });

    it('create() retourne aussi voyageursProteges/historique peuplés, pas seulement findOne()', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([makeScenarioDto()]);
      prisma.hommeDragon.create.mockResolvedValue(makeHommeDragon());

      const result = await service.create('p1', 'mj1', {
        race: 'DRAGON_ROUGE',
        artefact: { key: 'grand-arc' },
        nom: 'Ignis',
      });

      expect(result.voyageursProteges).toEqual([
        { userId: 'u1', pseudo: 'alice' },
        { userId: 'u2', pseudo: 'bob' },
      ]);
      expect(result.historique).toHaveLength(1);
    });

    it('update() retourne aussi voyageursProteges/historique peuplés, pas seulement findOne()', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue(makeMembers());
      scenarios.findAllForPartie.mockResolvedValue([makeScenarioDto()]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      prisma.hommeDragon.update.mockResolvedValue(makeHommeDragon());

      const result = await service.update('p1', 'mj1', { demeure: 'Une auberge' });

      expect(result.voyageursProteges).toEqual([
        { userId: 'u1', pseudo: 'alice' },
        { userId: 'u2', pseudo: 'bob' },
      ]);
      expect(result.historique).toHaveLength(1);
    });
  });

  describe('derived (niveau/PS, Story 10.3)', () => {
    function makePasseScenarios(count: number) {
      return Array.from({ length: count }, (_, i) =>
        makeScenarioDto({
          id: `s${i}`,
          title: `Scénario ${i}`,
          status: 'PASSE',
          closedAt: '2026-07-10T00:00:00.000Z',
        }),
      );
    }

    it('findOne() : 0 scénario PASSE → derived: { level: 1, PS: 3 } (AC1)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue([]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.derived).toEqual({ level: 1, PS: 3 });
    });

    it.each([
      [1, 2, 3],
      [3, 3, 5],
      [7, 4, 5],
      [12, 5, 10],
    ])(
      'findOne() : %i scénarios PASSE → niveau %i, PS %i (AC2)',
      async (count, level, PS) => {
        parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenarios(count));
        prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

        const result = await service.findOne('p1', 'mj1');

        expect(result?.derived).toEqual({ level, PS });
      },
    );

    it('create() retourne aussi derived peuplé (AC3)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama', name: 'Ma Campagne' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue(makePasseScenarios(3));
      prisma.hommeDragon.create.mockResolvedValue(makeHommeDragon());

      const result = await service.create('p1', 'mj1', {
        race: 'DRAGON_ROUGE',
        artefact: { key: 'grand-arc' },
        nom: 'Ignis',
      });

      expect(result.derived).toEqual({ level: 3, PS: 5 });
    });

    it('update() retourne aussi derived peuplé (AC3)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue(makePasseScenarios(7));
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());
      prisma.hommeDragon.update.mockResolvedValue(makeHommeDragon());

      const result = await service.update('p1', 'mj1', { demeure: 'Une auberge' });

      expect(result.derived).toEqual({ level: 4, PS: 5 });
    });

    it('scénarios BROUILLON/A_VENIR/COURANT mélangés à des PASSE → seuls les PASSE comptent pour le niveau', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue([
        ...makePasseScenarios(1),
        makeScenarioDto({ id: 's-brouillon', status: 'BROUILLON', closedAt: null }),
        makeScenarioDto({ id: 's-avenir', status: 'A_VENIR', closedAt: null }),
        makeScenarioDto({ id: 's-courant', status: 'COURANT', closedAt: null }),
      ]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.derived).toEqual({ level: 2, PS: 3 });
    });
  });

  describe('eveilPowers / pendingEveilLevels (Story 10.4)', () => {
    it("findOne() : niveau 2, aucun eveilPowers en sheetData → pendingEveilLevels: [2] (AC1)", async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue([
        makeScenarioDto({ status: 'PASSE', closedAt: '2026-07-10T00:00:00.000Z' }),
      ]);
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.eveilPowers).toEqual([]);
      expect(result?.pendingEveilLevels).toEqual([2]);
    });

    it('findOne() : eveilPowers déjà choisi pour le niveau atteint → pendingEveilLevels: [] (AC2)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue([
        makeScenarioDto({ status: 'PASSE', closedAt: '2026-07-10T00:00:00.000Z' }),
      ]);
      prisma.hommeDragon.findUnique.mockResolvedValue(
        makeHommeDragon({
          sheetData: {
            race: 'DRAGON_ROUGE',
            artefact: { key: 'grand-arc' },
            nom: 'Ignis',
            eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
          },
        }),
      );

      const result = await service.findOne('p1', 'mj1');

      expect(result?.eveilPowers).toEqual([{ level: 2, key: 'escorte-du-dragon' }]);
      expect(result?.pendingEveilLevels).toEqual([]);
    });

    it('findOne() : plusieurs seuils franchis d’un coup, aucun choix fait → pendingEveilLevels liste tous les niveaux intermédiaires (AC3)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
      parties.listMembers.mockResolvedValue([]);
      scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(12));
      prisma.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

      const result = await service.findOne('p1', 'mj1');

      expect(result?.pendingEveilLevels).toEqual([2, 3, 4, 5]);
    });

    function makePasseScenariosFor(count: number) {
      return Array.from({ length: count }, (_, i) =>
        makeScenarioDto({ id: `s${i}`, status: 'PASSE', closedAt: '2026-07-10T00:00:00.000Z' }),
      );
    }

    describe('chooseEveilPower()', () => {
      it('niveau en attente + clé valide du catalogue → choix enregistré, append sans écraser les précédents', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(3));
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(
          makeHommeDragon({
            sheetData: {
              race: 'DRAGON_ROUGE',
              artefact: { key: 'grand-arc' },
              nom: 'Ignis',
              eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
            },
          }),
        );
        prisma.tx.hommeDragon.update.mockResolvedValue(makeHommeDragon());

        await service.chooseEveilPower('p1', 'mj1', { level: 3, key: 'couche-du-dragon' });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.tx.hommeDragon.update).toHaveBeenCalledWith({
          where: { userId_partieId_gameSystemId: { userId: 'mj1', partieId: 'p1', gameSystemId: 'ryuutama' } },
          data: {
            sheetData: expect.objectContaining({
              eveilPowers: [
                { level: 2, key: 'escorte-du-dragon' },
                { level: 3, key: 'couche-du-dragon' },
              ],
            }),
          },
        });
      });

      it("écriture ne mute jamais l'objet sheetData renvoyé par la lecture (copie, pas mutation en place)", async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(1));
        const originalSheetData = {
          race: 'DRAGON_ROUGE',
          artefact: { key: 'grand-arc' },
          nom: 'Ignis',
        };
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(
          makeHommeDragon({ sheetData: originalSheetData }),
        );
        prisma.tx.hommeDragon.update.mockResolvedValue(makeHommeDragon());

        await service.chooseEveilPower('p1', 'mj1', { level: 2, key: 'escorte-du-dragon' });

        expect(originalSheetData).not.toHaveProperty('eveilPowers');
      });

      it('niveau pas en attente (déjà pourvu) → BadRequestException, aucune écriture (AC2)', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(1));
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(
          makeHommeDragon({
            sheetData: {
              race: 'DRAGON_ROUGE',
              artefact: { key: 'grand-arc' },
              nom: 'Ignis',
              eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
            },
          }),
        );

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 2, key: 'couche-du-dragon' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it('niveau au-delà du niveau actuel → BadRequestException, aucune écriture', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(1));
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 5, key: 'escorte-du-dragon' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it('clé inconnue du catalogue → BadRequestException, aucune écriture', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(1));
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(makeHommeDragon());

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 2, key: 'pouvoir-inconnu' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it("pouvoir déjà choisi pour un autre niveau (pool commun) → BadRequestException, aucune écriture", async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue(makePasseScenariosFor(3));
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(
          makeHommeDragon({
            sheetData: {
              race: 'DRAGON_ROUGE',
              artefact: { key: 'grand-arc' },
              nom: 'Ignis',
              eveilPowers: [{ level: 2, key: 'escorte-du-dragon' }],
            },
          }),
        );

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 3, key: 'escorte-du-dragon' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it('non-MJ → ForbiddenException propagée par getOwned, aucune écriture', async () => {
        parties.getOwned.mockRejectedValue(new ForbiddenException());

        await expect(
          service.chooseEveilPower('p1', 'stranger', { level: 2, key: 'escorte-du-dragon' }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it('aucun Homme Dragon existant → NotFoundException', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' });
        parties.listMembers.mockResolvedValue([]);
        scenarios.findAllForPartie.mockResolvedValue([]);
        prisma.tx.hommeDragon.findUnique.mockResolvedValue(null);

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 2, key: 'escorte-du-dragon' }),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.tx.hommeDragon.update).not.toHaveBeenCalled();
      });

      it('Partie basculée hors Ryuutama → BadRequestException, aucune écriture (même garde que update())', async () => {
        parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1', gameSystemId: 'draconis' });

        await expect(
          service.chooseEveilPower('p1', 'mj1', { level: 2, key: 'escorte-du-dragon' }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });
});
