import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake-image-bytes')),
}));

jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, randomUUID: jest.fn(() => 'fixed-uuid') };
});

import { Prisma } from '@prisma/client';
import { validate, computeDerived } from '@master-jdr/game-rules';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { CharacterService } from './character.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { UsersService } from '../users/users.service';

/** Nom de fichier légitime généré côté serveur (`randomUUID()` + extension) — cf. `image-mime.util.ts`. */
const OLD_PORTRAIT_UUID = '11111111-1111-1111-1111-111111111111';

const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function makeMulterFile(buffer: Buffer = JPEG_BUFFER): Express.Multer.File {
  return {
    buffer,
    originalname: 'portrait.jpg',
    mimetype: 'image/jpeg',
    size: buffer.length,
  } as Express.Multer.File;
}

function makePrisma() {
  return {
    character: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    partie: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

function makeUsersService() {
  return {
    findById: jest.fn(),
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
  let users: ReturnType<typeof makeUsersService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    users = makeUsersService();
    // Défauts neutres : la plupart des tests ne portent pas sur ownerPseudo/ownerIsMj.
    users.findById.mockResolvedValue({
      id: 'default',
      pseudo: 'default-pseudo',
    });
    prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj-default' });
    const module = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: UsersService, useValue: users },
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

  it('findOne() résout ownerPseudo et ownerIsMj (propriétaire = joueur)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharacter());
    users.findById.mockResolvedValue({ id: 'u1', pseudo: 'alice' });
    prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj1' });

    const result = await service.findOne('char1', 'u1');

    expect(result.ownerPseudo).toBe('alice');
    expect(result.ownerIsMj).toBe(false);
  });

  it('findOne() résout ownerIsMj=true quand le propriétaire est le MJ de la partie', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharacter({ userId: 'mj1' }),
    );
    users.findById.mockResolvedValue({ id: 'mj1', pseudo: 'le-mj' });
    prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj1' });

    const result = await service.findOne('char1', 'mj1');

    expect(result.ownerPseudo).toBe('le-mj');
    expect(result.ownerIsMj).toBe(true);
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

  it('create() résout ownerPseudo/ownerIsMj du créateur sans requête partie supplémentaire (réutilise getViewable)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'u1' });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (computeDerived as jest.Mock).mockReturnValue({});
    prisma.character.create.mockResolvedValue(makeCharacter({ userId: 'u1' }));
    users.findById.mockResolvedValue({ id: 'u1', pseudo: 'bob' });

    const result = await service.create('p1', 'u1', {
      gameSystemId: 'ryuutama',
      sheetData: validSheet(),
    });

    expect(result.ownerPseudo).toBe('bob');
    expect(result.ownerIsMj).toBe(true);
    expect(prisma.partie.findUnique).not.toHaveBeenCalled();
  });

  describe('findByPartie()', () => {
    it('MJ → reçoit tous les personnages, avec le bon pseudo par personnage (une seule requête user.findMany)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        makeCharacter({ id: 'c1', userId: 'u1' }),
        makeCharacter({ id: 'c2', userId: 'u2' }),
        makeCharacter({ id: 'c3', userId: 'mj1' }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', pseudo: 'alice' },
        { id: 'u2', pseudo: 'bob' },
        { id: 'mj1', pseudo: 'le-mj' },
      ]);

      const result = await service.findByPartie('p1', 'mj1');

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { partieId: 'p1' },
      });
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['u1', 'u2', 'mj1'] } },
        select: { id: true, pseudo: true },
      });
      expect(result.map((c) => c.ownerPseudo)).toEqual([
        'alice',
        'bob',
        'le-mj',
      ]);
      expect(result.map((c) => c.ownerIsMj)).toEqual([false, false, true]);
    });

    it('joueur → ne reçoit que ses propres personnages', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        makeCharacter({ id: 'c1', userId: 'u1' }),
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', pseudo: 'alice' }]);

      await service.findByPartie('p1', 'u1');

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { partieId: 'p1', userId: 'u1' },
      });
    });

    it('aucun personnage → ne fait aucun appel user.findMany', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([]);

      const result = await service.findByPartie('p1', 'mj1');

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('userId sans pseudo résolu (défensif) → ownerPseudo vide plutôt que de planter', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        makeCharacter({ id: 'c1', userId: 'orphan' }),
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.findByPartie('p1', 'mj1');

      expect(result[0].ownerPseudo).toBe('');
    });
  });

  describe('updatePortrait()', () => {
    it('propriétaire + image valide → écrit le fichier et met à jour portraitUrl/portraitCropData', async () => {
      const character = makeCharacter();
      prisma.character.findUnique.mockResolvedValue(character);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(
        makeCharacter({
          portraitUrl: '/uploads/portraits/fixed-uuid.jpg',
          portraitCropData: { scale: 1.5, offsetX: 0, offsetY: 0 },
        }),
      );

      const result = await service.updatePortrait(
        'char1',
        'u1',
        makeMulterFile(),
        { scale: 1.5, offsetX: 0, offsetY: 0 },
      );

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('fixed-uuid.jpg'),
        JPEG_BUFFER,
      );
      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: 'char1', updatedAt: character.updatedAt },
        data: {
          portraitUrl: '/uploads/portraits/fixed-uuid.jpg',
          portraitCropData: { scale: 1.5, offsetX: 0, offsetY: 0 },
        },
      });
      expect(result.portraitUrl).toBe('/uploads/portraits/fixed-uuid.jpg');
    });

    it('non-propriétaire (y compris le MJ) → ForbiddenException, aucune écriture disque', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ userId: 'owner' }),
      );

      await expect(
        service.updatePortrait('char1', 'mj1', makeMulterFile(), null),
      ).rejects.toThrow(ForbiddenException);
      expect(writeFile).not.toHaveBeenCalled();
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    });

    it('personnage introuvable → NotFoundException', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      await expect(
        service.updatePortrait('unknown', 'u1', makeMulterFile(), null),
      ).rejects.toThrow(NotFoundException);
    });

    it('fichier non-image (octets magiques invalides) → BadRequestException, aucune écriture disque', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());

      await expect(
        service.updatePortrait(
          'char1',
          'u1',
          makeMulterFile(Buffer.from('not an image')),
          null,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('portrait existant → l’ancien fichier est supprimé (remplacement, pas de cumul)', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
        }),
      );
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(makeCharacter());

      await service.updatePortrait('char1', 'u1', makeMulterFile(), null);

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${OLD_PORTRAIT_UUID}.jpg`),
      );
    });

    it('conflit de concurrence (updatedAt modifié entretemps) → ConflictException, le nouveau fichier écrit est nettoyé', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updatePortrait('char1', 'u1', makeMulterFile(), null),
      ).rejects.toThrow(ConflictException);
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('fixed-uuid.jpg'),
      );
    });

    it('échec de la mise à jour Prisma → le nouveau fichier écrit est nettoyé, erreur propagée', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      prisma.character.updateMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.updatePortrait('char1', 'u1', makeMulterFile(), null),
      ).rejects.toThrow('db down');
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('fixed-uuid.jpg'),
      );
    });

    it('résout ownerPseudo/ownerIsMj sur le résultat retourné', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(makeCharacter());
      users.findById.mockResolvedValue({ id: 'u1', pseudo: 'alice' });
      prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj1' });

      const result = await service.updatePortrait(
        'char1',
        'u1',
        makeMulterFile(),
        null,
      );

      expect(result.ownerPseudo).toBe('alice');
      expect(result.ownerIsMj).toBe(false);
    });
  });

  describe('removePortrait()', () => {
    it('propriétaire avec portrait existant → supprime le fichier et met portraitUrl/portraitCropData à null', async () => {
      const character = makeCharacter({
        portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
      });
      prisma.character.findUnique.mockResolvedValue(character);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(makeCharacter());

      await service.removePortrait('char1', 'u1');

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${OLD_PORTRAIT_UUID}.jpg`),
      );
      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: 'char1', updatedAt: character.updatedAt },
        data: { portraitUrl: null, portraitCropData: Prisma.JsonNull },
      });
    });

    it('non-propriétaire → ForbiddenException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ userId: 'owner' }),
      );
      await expect(service.removePortrait('char1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('conflit de concurrence (updatedAt modifié entretemps) → ConflictException', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.removePortrait('char1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('résout ownerPseudo/ownerIsMj sur le résultat retourné', async () => {
      const character = makeCharacter({
        portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
      });
      prisma.character.findUnique.mockResolvedValue(character);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(makeCharacter());
      users.findById.mockResolvedValue({ id: 'u1', pseudo: 'alice' });
      prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj1' });

      const result = await service.removePortrait('char1', 'u1');

      expect(result.ownerPseudo).toBe('alice');
      expect(result.ownerIsMj).toBe(false);
    });
  });

  describe('getPortraitFile()', () => {
    it('propriétaire → retourne le buffer et le mime déduit de l’extension', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
        }),
      );
      (readFile as jest.Mock).mockResolvedValue(Buffer.from('bytes'));

      const result = await service.getPortraitFile('char1', 'u1');

      expect(result.mime).toBe('image/jpeg');
      expect(result.buffer).toEqual(Buffer.from('bytes'));
      expect(parties.getOwned).not.toHaveBeenCalled();
    });

    it('MJ (non-propriétaire) de la partie → accès autorisé', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
        }),
      );
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      await service.getPortraitFile('char1', 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    });

    it('tiers (ni propriétaire ni MJ) → ForbiddenException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
        }),
      );
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.getPortraitFile('char1', 'stranger'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('personnage sans portrait → NotFoundException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ portraitUrl: null }),
      );
      await expect(service.getPortraitFile('char1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('personnage introuvable → NotFoundException', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      await expect(service.getPortraitFile('unknown', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
