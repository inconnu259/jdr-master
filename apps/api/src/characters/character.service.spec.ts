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
  levelForXp: jest.fn((xp: number) => (xp >= 100 ? 2 : 1)),
  pendingLevels: jest.fn(),
  LEVEL_TABLE: [
    { level: 2, xp: 100, capabilities: ['attribute'] },
    { level: 3, xp: 600, capabilities: ['landscape'] },
    { level: 4, xp: 1200, capabilities: ['attribute', 'immunity'] },
  ],
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
import {
  validate,
  computeDerived,
  pendingLevels,
} from '@master-jdr/game-rules';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { CharacterService } from './character.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { UsersService } from '../users/users.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { EmailService } from '../email/email.service';

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
  const prisma: any = {
    character: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    characterSnapshot: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    partie: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  // Le client transactionnel réutilise les mêmes mocks (updateMany/snapshot.create) que le client
  // racine — suffisant pour asserter les appels ; le rollback réel n'est pas testé ici.
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
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

function makeEmailService() {
  return {
    sendMail: jest.fn().mockResolvedValue({ ok: true }),
  };
}

function makeGameSystemService() {
  return {
    getContent: jest.fn().mockResolvedValue({
      class: [{ key: 'chasseur', data: {} }],
      type: [{ key: 'attaque', data: {} }],
      weaponCategory: [{ key: 'arc', data: {} }],
      attributePattern: [{ key: 'polyvalent', data: { values: [8, 4, 6, 6] } }],
    }),
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
    xp: 0,
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
  let gameSystems: ReturnType<typeof makeGameSystemService>;
  let email: ReturnType<typeof makeEmailService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    users = makeUsersService();
    gameSystems = makeGameSystemService();
    email = makeEmailService();
    // Défauts neutres : la plupart des tests ne portent pas sur ownerPseudo/ownerIsMj.
    users.findById.mockResolvedValue({
      id: 'default',
      pseudo: 'default-pseudo',
      email: 'default@example.com',
    });
    prisma.partie.findUnique.mockResolvedValue({ mjId: 'mj-default' });
    (pendingLevels as jest.Mock).mockReturnValue([]);
    const module = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: UsersService, useValue: users },
        { provide: GameSystemService, useValue: gameSystems },
        { provide: EmailService, useValue: email },
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

    expect(validate).toHaveBeenCalledWith(
      validSheet(),
      'strict',
      expect.objectContaining({
        validClasses: ['chasseur'],
        validTypes: ['attaque'],
        validWeapons: ['arc'],
        attributePatterns: [[4, 6, 6, 8]],
      }),
    );
    expect(computeDerived).toHaveBeenCalledWith(validSheet());
  });

  it('create() dérive le catalog de validate() du contenu réellement seedé (GameSystemService.getContent)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (computeDerived as jest.Mock).mockReturnValue({});
    prisma.character.create.mockResolvedValue(makeCharacter());

    await service.create('p1', 'u1', {
      gameSystemId: 'ryuutama',
      sheetData: validSheet(),
    });

    expect(gameSystems.getContent).toHaveBeenCalledWith('ryuutama');
  });

  it('create() ignore un attributePattern malformé (values non-numériques) plutôt que de produire un pattern trié n’importe comment', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    gameSystems.getContent.mockResolvedValue({
      class: [{ key: 'chasseur', data: {} }],
      type: [{ key: 'attaque', data: {} }],
      weaponCategory: [{ key: 'arc', data: {} }],
      attributePattern: [
        { key: 'polyvalent', data: { values: [8, 4, 6, 6] } },
        { key: 'corrompu', data: { values: ['8', '4', '6', '6'] } },
      ],
    });
    (validate as jest.Mock).mockReturnValue({ valid: true, errors: [] });
    (computeDerived as jest.Mock).mockReturnValue({});
    prisma.character.create.mockResolvedValue(makeCharacter());

    await service.create('p1', 'u1', {
      gameSystemId: 'ryuutama',
      sheetData: validSheet(),
    });

    expect(validate).toHaveBeenCalledWith(
      validSheet(),
      'strict',
      expect.objectContaining({ attributePatterns: [[4, 6, 6, 8]] }),
    );
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

  describe('updatePdfPortraitCrop()', () => {
    const CROP_DATA = { scale: 1.5, offsetX: 10, offsetY: -20 };

    it('propriétaire avec portrait existant → enregistre pdfPortraitCropData', async () => {
      const character = makeCharacter({
        portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
      });
      prisma.character.findUnique.mockResolvedValue(character);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(
        makeCharacter({ pdfPortraitCropData: CROP_DATA }),
      );

      const result = await service.updatePdfPortraitCrop(
        'char1',
        'u1',
        CROP_DATA,
      );

      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: 'char1', updatedAt: character.updatedAt },
        data: { pdfPortraitCropData: CROP_DATA },
      });
      expect(result.pdfPortraitCropData).toEqual(CROP_DATA);
    });

    it('non-propriétaire → ForbiddenException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ userId: 'owner' }),
      );
      await expect(
        service.updatePdfPortraitCrop('char1', 'stranger', CROP_DATA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('personnage sans portrait → BadRequestException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ portraitUrl: null }),
      );
      await expect(
        service.updatePdfPortraitCrop('char1', 'u1', CROP_DATA),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    });

    it('conflit de concurrence (updatedAt modifié entretemps) → ConflictException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          portraitUrl: `/uploads/portraits/${OLD_PORTRAIT_UUID}.jpg`,
        }),
      );
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updatePdfPortraitCrop('char1', 'u1', CROP_DATA),
      ).rejects.toThrow(ConflictException);
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

      const result = await service.updatePdfPortraitCrop(
        'char1',
        'u1',
        CROP_DATA,
      );

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

  describe('applyXpDelta()', () => {
    it('incrémente via prisma.character.update (pas updateMany), aucun seuil franchi → pas d’e-mail', async () => {
      prisma.character.update.mockResolvedValue(makeCharacter({ xp: 50 }));
      (pendingLevels as jest.Mock).mockReturnValue([]);

      await service.applyXpDelta('char1', 50);

      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: 'char1' },
        data: { xp: { increment: 50 } },
      });
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
      expect(email.sendMail).not.toHaveBeenCalled();
    });

    it('franchissement de seuil → déclenche EmailService.sendMail("level-up", ...)', async () => {
      prisma.character.update.mockResolvedValue(
        makeCharacter({ xp: 150, partieId: 'p1', userId: 'u1' }),
      );
      (pendingLevels as jest.Mock).mockReturnValue([2]);
      users.findById.mockResolvedValue({
        id: 'u1',
        pseudo: 'alice',
        email: 'alice@example.com',
      });
      prisma.partie.findUnique.mockResolvedValue({ name: 'Les Brumes' });

      await service.applyXpDelta('char1', 150);

      expect(email.sendMail).toHaveBeenCalledWith(
        'level-up',
        'alice@example.com',
        expect.objectContaining({ partieName: 'Les Brumes' }),
      );
    });

    it('toDto() expose xp/level sur les méthodes existantes (findOne) — level = niveau appliqué, pas le potentiel XP', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 150 }));

      const result = await service.findOne('char1', 'u1');

      expect(result.xp).toBe(150);
      // xp=150 franchit le seuil du niveau 2, mais sheetData.levelUps est vide (aucune montée
      // validée) → level doit rester 1, pas 2 (régression : level ne doit jamais dériver de xp).
      expect(result.level).toBe(1);
    });

    it("level reste au niveau courant tant qu'un niveau en attente n'a pas été appliqué, même avec beaucoup d'XP", async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 700 }));

      const result = await service.findOne('char1', 'u1');

      expect(result.level).toBe(1);
    });

    it('level = 1 + nombre de levelUps appliqués, indépendamment de l’xp restant', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          xp: 700,
          sheetData: {
            ...validSheet(),
            levelUps: [
              { level: 2, pvAllocated: 2, peAllocated: 1, capabilities: [{ type: 'attribute', params: {} }] },
              { level: 3, pvAllocated: 1, peAllocated: 2, capabilities: [{ type: 'landscape', params: {} }] },
            ],
          },
        }),
      );

      const result = await service.findOne('char1', 'u1');

      expect(result.level).toBe(3);
    });
  });

  describe('applyLevelUp()', () => {
    const validDto = {
      pvAllocated: 2,
      peAllocated: 1,
      capabilities: [{ type: 'attribute', params: { attribute: 'VIG' } }],
    };

    it('aucun niveau en attente → BadRequestException', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 0 }));
      (pendingLevels as jest.Mock).mockReturnValue([]);

      await expect(
        service.applyLevelUp('char1', 'u1', validDto as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    });

    it('somme PV+PE ≠ 3 → BadRequestException', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 150 }));
      (pendingLevels as jest.Mock).mockReturnValue([2]);

      await expect(
        service.applyLevelUp('char1', 'u1', {
          pvAllocated: 1,
          peAllocated: 1,
          capabilities: [{ type: 'attribute', params: { attribute: 'VIG' } }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('attribut déjà à 12 → BadRequestException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({
          xp: 150,
          sheetData: {
            ...validSheet(),
            attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 12 },
          },
        }),
      );
      (pendingLevels as jest.Mock).mockReturnValue([2]);

      await expect(
        service.applyLevelUp('char1', 'u1', {
          pvAllocated: 2,
          peAllocated: 1,
          capabilities: [{ type: 'attribute', params: { attribute: 'VIG' } }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('succès → applique levelUps[]/derived, crée le snapshot', async () => {
      const character = makeCharacter({ xp: 150 });
      prisma.character.findUnique.mockResolvedValue(character);
      (pendingLevels as jest.Mock).mockReturnValue([2]);
      (computeDerived as jest.Mock).mockReturnValue({
        PV: 18,
        PE: 13,
        Condition: 14,
        Initiative: 10,
        Encombrement: 12,
      });
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(
        makeCharacter({ xp: 150 }),
      );

      await service.applyLevelUp('char1', 'u1', validDto as any);

      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { id: 'char1', updatedAt: character.updatedAt },
        data: expect.objectContaining({
          sheetData: expect.objectContaining({
            levelUps: [
              {
                level: 2,
                pvAllocated: 2,
                peAllocated: 1,
                capabilities: validDto.capabilities,
              },
            ],
          }),
        }),
      });
      expect(prisma.characterSnapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          characterId: 'char1',
          level: 2,
          trigger: 'LEVEL_UP',
        }),
      });
    });

    it('409 si updatedAt périmé (conflit de concurrence)', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 150 }));
      (pendingLevels as jest.Mock).mockReturnValue([2]);
      (computeDerived as jest.Mock).mockReturnValue({});
      prisma.character.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.applyLevelUp('char1', 'u1', validDto as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
    });

    it('non-propriétaire → ForbiddenException', async () => {
      prisma.character.findUnique.mockResolvedValue(
        makeCharacter({ userId: 'owner', xp: 150 }),
      );

      await expect(
        service.applyLevelUp('char1', 'stranger', validDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('niveau à deux capacités (4) → exige et applique les DEUX (Attribut ET immunité)', async () => {
      const character = makeCharacter({ xp: 1200 });
      prisma.character.findUnique.mockResolvedValue(character);
      (pendingLevels as jest.Mock).mockReturnValue([4]);
      (computeDerived as jest.Mock).mockReturnValue({});
      gameSystems.getContent.mockResolvedValue({
        immunityState: [{ key: 'blesse', data: { label: 'Blessé' } }],
      });
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.character.findUniqueOrThrow.mockResolvedValue(character);

      await service.applyLevelUp('char1', 'u1', {
        pvAllocated: 2,
        peAllocated: 1,
        capabilities: [
          { type: 'attribute', params: { attribute: 'VIG' } },
          { type: 'immunity', params: { key: 'blesse' } },
        ],
      } as any);

      const data = prisma.character.updateMany.mock.calls[0][0].data;
      expect(data.sheetData.attributes.VIG).toBe(10); // 8 + 2
      expect(data.sheetData.levelUps[0].capabilities).toHaveLength(2);
    });

    it("niveau à deux capacités : n'en fournir qu'une → BadRequestException", async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 1200 }));
      (pendingLevels as jest.Mock).mockReturnValue([4]);

      await expect(
        service.applyLevelUp('char1', 'u1', {
          pvAllocated: 2,
          peAllocated: 1,
          capabilities: [{ type: 'attribute', params: { attribute: 'VIG' } }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    });

    it('clé de capacité absente du contenu seedé → BadRequestException', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter({ xp: 600 }));
      (pendingLevels as jest.Mock).mockReturnValue([3]);
      gameSystems.getContent.mockResolvedValue({
        landscape: [{ key: 'foret', data: { label: 'Forêt' } }],
      });

      await expect(
        service.applyLevelUp('char1', 'u1', {
          pvAllocated: 2,
          peAllocated: 1,
          capabilities: [{ type: 'landscape', params: { key: 'inconnu' } }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getHistory()', () => {
    it('propriétaire → retourne la liste triée par la base (desc)', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      prisma.characterSnapshot.findMany.mockResolvedValue([
        {
          id: 's2',
          characterId: 'char1',
          sheetData: {},
          derived: {},
          level: 3,
          trigger: 'LEVEL_UP',
          note: null,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          id: 's1',
          characterId: 'char1',
          sheetData: {},
          derived: {},
          level: 2,
          trigger: 'LEVEL_UP',
          note: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getHistory('char1', 'u1');

      expect(prisma.characterSnapshot.findMany).toHaveBeenCalledWith({
        where: { characterId: 'char1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.map((s) => s.id)).toEqual(['s2', 's1']);
      expect(result[0].createdAt).toBe('2026-02-01T00:00:00.000Z');
    });

    it('MJ (non-propriétaire) → accès autorisé', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.characterSnapshot.findMany.mockResolvedValue([]);

      await service.getHistory('char1', 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    });

    it('ni propriétaire ni MJ → ForbiddenException', async () => {
      prisma.character.findUnique.mockResolvedValue(makeCharacter());
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(service.getHistory('char1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('personnage introuvable → NotFoundException', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      await expect(service.getHistory('unknown', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('inventoryItems', () => {
    function makeCharacterWithEquipment(individual: unknown[] = []) {
      return makeCharacter({
        sheetData: { ...validSheet(), equipment: { individual, group: [] } },
      });
    }

    describe('addInventoryItem()', () => {
      it('ajoute un objet avec le poids fourni, addedBy forcé à player, id généré', async () => {
        const character = makeCharacterWithEquipment();
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.addInventoryItem('char1', 'u1', { name: 'Cape', weight: 1.2 } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual).toEqual([
          { id: 'fixed-uuid', name: 'Cape', weight: 1.2, addedBy: 'player' },
        ]);
      });

      it('ajoute un objet sans poids → weight 0', async () => {
        const character = makeCharacterWithEquipment();
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.addInventoryItem('char1', 'u1', { name: 'Sac' } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual[0]).toEqual({
          id: 'fixed-uuid',
          name: 'Sac',
          weight: 0,
          addedBy: 'player',
        });
      });

      it('addedBy injecté dans le DTO (mock any) est ignoré — toujours player en sortie', async () => {
        const character = makeCharacterWithEquipment();
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.addInventoryItem('char1', 'u1', {
          name: 'Objet suspect',
          addedBy: 'mj',
        } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual[0].addedBy).toBe('player');
      });

      it('409 si updatedAt périmé', async () => {
        prisma.character.findUnique.mockResolvedValue(makeCharacterWithEquipment());
        prisma.character.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.addInventoryItem('char1', 'u1', { name: 'Cape' } as any),
        ).rejects.toThrow(ConflictException);
      });

      it('non-propriétaire → ForbiddenException', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacter({ userId: 'owner' }),
        );

        await expect(
          service.addInventoryItem('char1', 'stranger', { name: 'Cape' } as any),
        ).rejects.toThrow(ForbiddenException);
      });

      it("n'appelle jamais characterSnapshot.create (FR-12 exclut l'inventaire)", async () => {
        const character = makeCharacterWithEquipment();
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.addInventoryItem('char1', 'u1', { name: 'Cape' } as any);

        expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      });

      it('personnage legacy (equipment.individual encore string[]) → normalisé avant ajout, pas de tableau mixte (défense en profondeur, revue de code)', async () => {
        const character = makeCharacterWithEquipment(['Vieux sac']);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.addInventoryItem('char1', 'u1', { name: 'Cape' } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual).toEqual([
          { id: 'fixed-uuid', name: 'Vieux sac', weight: 0, addedBy: 'player' },
          { id: 'fixed-uuid', name: 'Cape', weight: 0, addedBy: 'player' },
        ]);
      });
    });

    describe('updateInventoryItem()', () => {
      it('modifie le nom seul, poids inchangé', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1.2, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.updateInventoryItem('char1', 'u1', 'item-1', { name: 'Cape usée' } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual[0]).toEqual({
          id: 'item-1',
          name: 'Cape usée',
          weight: 1.2,
          addedBy: 'player',
        });
      });

      it('modifie le poids seul, nom inchangé', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1.2, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.updateInventoryItem('char1', 'u1', 'item-1', { weight: 2 } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual[0]).toEqual({
          id: 'item-1',
          name: 'Cape',
          weight: 2,
          addedBy: 'player',
        });
      });

      it('modifie le bon objet parmi plusieurs, quel que soit son index', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
          { id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.updateInventoryItem('char1', 'u1', 'item-2', { name: 'Sac usé' } as any);

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual).toEqual([
          { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
          { id: 'item-2', name: 'Sac usé', weight: 2, addedBy: 'player' },
        ]);
      });

      it('itemId introuvable → NotFoundException (jamais un fallback sur un autre objet)', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacterWithEquipment([{ id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' }]),
        );

        await expect(
          service.updateInventoryItem('char1', 'u1', 'item-inconnu', { name: 'x' } as any),
        ).rejects.toThrow(NotFoundException);
      });

      it("objet déjà retiré par une autre requête (id périmé côté client) → NotFoundException, jamais une mauvaise cible (résout la faille d'adressage par index de la revue de code)", async () => {
        // Simule : le personnage tel que relu par CETTE requête ne contient plus l'objet que le
        // client pensait éditer (retiré entretemps par une autre requête, déjà appliquée).
        prisma.character.findUnique.mockResolvedValue(
          makeCharacterWithEquipment([{ id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' }]),
        );

        await expect(
          service.updateInventoryItem('char1', 'u1', 'item-1', { weight: 5 } as any),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.character.updateMany).not.toHaveBeenCalled();
      });

      it('409 si updatedAt périmé', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacterWithEquipment([{ id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' }]),
        );
        prisma.character.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.updateInventoryItem('char1', 'u1', 'item-1', { weight: 2 } as any),
        ).rejects.toThrow(ConflictException);
      });

      it('non-propriétaire → ForbiddenException', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacter({ userId: 'owner' }),
        );

        await expect(
          service.updateInventoryItem('char1', 'stranger', 'item-1', { weight: 2 } as any),
        ).rejects.toThrow(ForbiddenException);
      });

      it('n’appelle jamais characterSnapshot.create', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.updateInventoryItem('char1', 'u1', 'item-1', { weight: 2 } as any);

        expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      });
    });

    describe('removeInventoryItem()', () => {
      it('retire le bon objet par id, quel que soit son index', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
          { id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.removeInventoryItem('char1', 'u1', 'item-1');

        const data = prisma.character.updateMany.mock.calls[0][0].data;
        expect(data.sheetData.equipment.individual).toEqual([
          { id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' },
        ]);
      });

      it('itemId introuvable → NotFoundException', async () => {
        prisma.character.findUnique.mockResolvedValue(makeCharacterWithEquipment([]));

        await expect(
          service.removeInventoryItem('char1', 'u1', 'item-inconnu'),
        ).rejects.toThrow(NotFoundException);
      });

      it("objet déjà retiré par une autre requête → NotFoundException, jamais suppression d'un autre objet", async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacterWithEquipment([{ id: 'item-2', name: 'Sac', weight: 2, addedBy: 'player' }]),
        );

        await expect(
          service.removeInventoryItem('char1', 'u1', 'item-1'),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.character.updateMany).not.toHaveBeenCalled();
      });

      it('409 si updatedAt périmé', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacterWithEquipment([{ id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' }]),
        );
        prisma.character.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.removeInventoryItem('char1', 'u1', 'item-1'),
        ).rejects.toThrow(ConflictException);
      });

      it('non-propriétaire → ForbiddenException', async () => {
        prisma.character.findUnique.mockResolvedValue(
          makeCharacter({ userId: 'owner' }),
        );

        await expect(
          service.removeInventoryItem('char1', 'stranger', 'item-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('n’appelle jamais characterSnapshot.create', async () => {
        const character = makeCharacterWithEquipment([
          { id: 'item-1', name: 'Cape', weight: 1, addedBy: 'player' },
        ]);
        prisma.character.findUnique.mockResolvedValue(character);
        prisma.character.updateMany.mockResolvedValue({ count: 1 });
        prisma.character.findUniqueOrThrow.mockResolvedValue(character);

        await service.removeInventoryItem('char1', 'u1', 'item-1');

        expect(prisma.characterSnapshot.create).not.toHaveBeenCalled();
      });
    });
  });
});
