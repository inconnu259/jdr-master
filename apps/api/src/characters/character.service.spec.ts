import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CharacterService } from './character.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
}));

import { validate, computeDerived } from '@master-jdr/game-rules';

function makePrisma() {
  return {
    character: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

function validSheet() {
  return {
    classId: 'chasseur',
    typeId: 'attaque',
    weaponCategoryId: 'arc',
    attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
  };
}

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'char1',
    userId: 'u1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: validSheet(),
    derived: {
      PV: 16,
      PE: 12,
      Condition: 14,
      Initiative: 10,
      Encombrement: 11,
    },
    portraitUrl: null,
    portraitCropData: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CharacterService', () => {
  let service: CharacterService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    const module = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
      ],
    }).compile();
    service = module.get(CharacterService);
  });

  it('create() sheetData valide → prisma.character.create appelé avec derived calculé', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    const derived = {
      PV: 16,
      PE: 12,
      Condition: 14,
      Initiative: 10,
      Encombrement: 11,
    };
    (computeDerived as jest.Mock).mockReturnValue(derived);
    prisma.character.create.mockResolvedValue(makeCharacter({ derived }));

    await service.create('p1', 'u1', {
      gameSystemId: 'ryuutama',
      sheetData: validSheet(),
    });

    expect(prisma.character.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gameSystemId: 'ryuutama',
          userId: 'u1',
          partieId: 'p1',
          derived,
        }),
      }),
    );
  });

  it('create() gameSystemId non supporté → BadRequestException, validate/computeDerived non appelés', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

    await expect(
      service.create('p1', 'u1', {
        gameSystemId: 'conte-de-minuit',
        sheetData: validSheet(),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(validate).not.toHaveBeenCalled();
    expect(computeDerived).not.toHaveBeenCalled();
    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it('create() sheetData invalide → BadRequestException, prisma.character.create non appelé', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    (validate as jest.Mock).mockReturnValue({
      valid: false,
      errors: [{ field: 'classId', message: 'Classe invalide' }],
    });

    await expect(
      service.create('p1', 'u1', {
        gameSystemId: 'ryuutama',
        sheetData: { classId: '' } as any,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it('create() erreur Prisma P2002 → ConflictException avec message spécifique', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (computeDerived as jest.Mock).mockReturnValue({});
    prisma.character.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create('p1', 'u1', {
        gameSystemId: 'ryuutama',
        sheetData: validSheet(),
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('findOne() par le propriétaire → retourne le personnage', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    const result = await service.findOne('char1', 'u1');
    expect(result.id).toBe('char1');
    expect(parties.getOwned).not.toHaveBeenCalled();
  });

  it('findOne() par le MJ (non-propriétaire) → retourne le personnage', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    const result = await service.findOne('char1', 'mj1');
    expect(result.id).toBe('char1');
    expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
  });

  it('findOne() par non-membre → ForbiddenException', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    parties.getOwned.mockRejectedValue(new ForbiddenException());
    await expect(service.findOne('char1', 'stranger')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('findOne() personnage introuvable → NotFoundException', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    await expect(service.findOne('unknown', 'u1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('create() utilise validate et computeDerived de @master-jdr/game-rules', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (computeDerived as jest.Mock).mockReturnValue({});
    prisma.character.create.mockResolvedValue(makeCharacter());

    await service.create('p1', 'u1', {
      gameSystemId: 'ryuutama',
      sheetData: validSheet(),
    });

    expect(validate).toHaveBeenCalledWith(validSheet(), 'strict');
    expect(computeDerived).toHaveBeenCalledWith(validSheet());
  });
});
