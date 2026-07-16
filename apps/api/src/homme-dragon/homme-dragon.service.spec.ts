import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// HommeDragonService importe validateHommeDragon depuis @master-jdr/game-rules (ESM, non
// transformé par ts-jest) — même mécanisme que ailleurs dans le projet (cf. mémoire d'équipe :
// "game-rules ESM jest.mock") pour éviter "Unexpected token export" au chargement du module.
jest.mock('@master-jdr/game-rules', () => ({
  validateHommeDragon: jest.fn(),
}));

import { validateHommeDragon } from '@master-jdr/game-rules';
import { HommeDragonService } from './homme-dragon.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';

const mockValidate = validateHommeDragon as jest.Mock;

function makePrisma() {
  return {
    hommeDragon: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any;
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

function makeGameSystems() {
  return {
    getContent: jest.fn(),
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

const CATALOG_CONTENT = {
  hommeDragonArtefact: [
    { key: 'grand-arc', data: { key: 'grand-arc', label: 'Grand arc', race: 'DRAGON_ROUGE' } },
    { key: 'lanterne', data: { key: 'lanterne', label: 'Lanterne', race: 'DRAGON_VERT' } },
  ],
};

describe('HommeDragonService', () => {
  let service: HommeDragonService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;
  let gameSystems: ReturnType<typeof makeGameSystems>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    gameSystems = makeGameSystems();
    gameSystems.getContent.mockResolvedValue(CATALOG_CONTENT);
    mockValidate.mockReturnValue({ valid: true, errors: [] });

    const module = await Test.createTestingModule({
      providers: [
        HommeDragonService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: GameSystemService, useValue: gameSystems },
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
});
