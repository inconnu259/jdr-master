import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GameSystemService } from './game-system.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    gameSystem: {
      findMany: jest.fn(),
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
});
