import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GameSystemService } from './game-system.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    gameSystem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    contentType: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    contentEntry: {
      upsert: jest.fn(),
    },
  };
}

describe('GameSystemService', () => {
  let service: GameSystemService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        GameSystemService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(GameSystemService);
  });

  it('getContent("ryuutama") → retourne le contenu groupé par clé de ContentType', async () => {
    prisma.contentType.findMany.mockResolvedValue([
      {
        key: 'class',
        entries: [
          { key: 'artisan', data: { label: 'Artisan' } },
          { key: 'chasseur', data: { label: 'Chasseur' } },
        ],
      },
      {
        key: 'weaponCategory',
        entries: [{ key: 'arc', data: { label: 'Arc' } }],
      },
    ]);

    const result = await service.getContent('ryuutama');

    expect(result).toEqual({
      class: [
        { key: 'artisan', data: { label: 'Artisan' } },
        { key: 'chasseur', data: { label: 'Chasseur' } },
      ],
      weaponCategory: [{ key: 'arc', data: { label: 'Arc' } }],
    });
    expect(prisma.contentType.findMany).toHaveBeenCalledWith({
      where: { gameSystemId: 'ryuutama' },
      include: { entries: { where: { scope: 'BASE' } } },
    });
  });

  it('getContent("unknown") → NotFoundException', async () => {
    await expect(service.getContent('unknown')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.contentType.findMany).not.toHaveBeenCalled();
  });

  it('getContent() en cache après le premier appel → un seul aller-retour DB pour plusieurs appels', async () => {
    prisma.contentType.findMany.mockResolvedValue([
      { key: 'class', entries: [{ key: 'chasseur', data: {} }] },
    ]);

    const first = await service.getContent('ryuutama');
    const second = await service.getContent('ryuutama');

    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  describe('getSchema', () => {
    it('"ryuutama" présent en base → retourne le schéma', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue({
        id: 'ryuutama',
        name: 'Ryuutama',
        version: '1.0.0',
      });
      const schema = await service.getSchema('ryuutama');
      expect(schema.sheetSchema).toBeDefined();
      expect(prisma.gameSystem.findUnique).toHaveBeenCalledWith({
        where: { id: 'ryuutama' },
      });
    });

    it('id absent de la base → NotFoundException "introuvable" (distinct du cas ci-dessous)', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue(null);
      await expect(service.getSchema('ryuutama')).rejects.toThrow(
        'Système de jeu introuvable',
      );
    });

    it('id présent en base mais aucun schéma codé → NotFoundException "aucun schéma implémenté" (pas confondu avec "introuvable")', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue({
        id: 'conte-de-minuit',
        name: 'Conte de Minuit',
        version: '1.0.0',
      });
      await expect(service.getSchema('conte-de-minuit')).rejects.toThrow(
        'Aucun schéma implémenté pour ce système de jeu',
      );
    });
  });
});
