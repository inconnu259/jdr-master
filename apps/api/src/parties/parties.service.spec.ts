jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake-cover-bytes')),
}));

// Doit être un UUID valide (pas une étiquette lisible) : `extractUploadFilename()` (appelé par
// `coverImageVersion()` en lecture) valide la forme du nom de fichier par regex — une valeur
// mockée hors-format ferait échouer silencieusement l'extraction et casserait les assertions sur
// `dto.coverImageVersion` de façon trompeuse (défense en profondeur qui se retournerait contre le
// test).
jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: jest.fn(() => '99999999-9999-9999-9999-999999999999'),
  };
});

// Mock partiel, même patron que character.service.spec.ts : detectImageMime/mimeForExtension/etc.
// restent réels (fonctions pures), seule stripImageMetadata est mockée (passthrough) pour éviter
// qu'un vrai sharp() sur un buffer de test (signature magique seule) échoue.
jest.mock('../common/image-upload.util', () => ({
  ...jest.requireActual('../common/image-upload.util'),
  stripImageMetadata: jest.fn((buf: Buffer) => Promise.resolve(buf)),
}));

// `sharp` mocké pour le redimensionnement des dérivées (Task 5) — seule la chaîne
// resize()/webp()/toBuffer() est exercée par PartiesService, jamais autoOrient() (qui vit dans
// stripImageMetadata, lui-même mocké en passthrough ci-dessus).
const sharpResizeCalls: unknown[] = [];
jest.mock('sharp', () => {
  const chain: any = {};
  chain.resize = jest.fn((opts: unknown) => {
    sharpResizeCalls.push(opts);
    return chain;
  });
  chain.webp = jest.fn(() => chain);
  chain.toBuffer = jest
    .fn()
    .mockResolvedValue(Buffer.from('resized-webp-bytes'));
  return jest.fn(() => chain);
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import type { AggregatedSlotDto, AvailableSlotDto } from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from './parties.service';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';
import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from '../realtime/realtime-events.service';

describe('PartiesService', () => {
  let service: PartiesService;
  let prisma: {
    partie: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    membership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    scenario: {
      create: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    scenarioParticipant: {
      createMany: jest.Mock;
    };
    seance: {
      create: jest.Mock;
    };
    partieFavorite: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let avail: {
    getActiveDeclarations: jest.Mock;
    getActiveDeclarationsWithSeances: jest.Mock;
    computeSlotStatus: jest.Mock;
  };
  let realtimeEvents: { emit: jest.Mock };

  const partie = {
    id: 'p1',
    name: 'La Nuit',
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj1',
    createdAt: new Date(),
    nextSessionDate: null,
    nextSessionSlot: null,
  };

  beforeEach(() => {
    // Les mocks de `node:fs/promises`/`sharp` sont au niveau module (jest.mock ci-dessus) : sans
    // ce reset, l'historique d'appels (writeFile/unlink) fuiterait d'un test à l'autre, faussant
    // les assertions `toHaveBeenCalledTimes`/`not.toHaveBeenCalled` des tests de couverture.
    jest.clearAllMocks();
    const p: any = {
      partie: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      scenario: {
        create: jest.fn().mockResolvedValue({ id: 'scenario1' }),
        // Défaut « sans scénario » (status: A_VENIR) — les tests de dérivation ci-dessous
        // reconfigurent explicitement ces mocks quand ils veulent tester EN_COURS/TERMINEE.
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      scenarioParticipant: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      seance: {
        create: jest.fn(),
      },
      // Défaut « aucun favori » — les tests dédiés au favori (Story 29.8) reconfigurent
      // explicitement ces mocks.
      partieFavorite: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    // $transaction exécute le callback avec le même mock en guise de `tx`
    p.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(p));
    prisma = p;
    avail = {
      getActiveDeclarations: jest.fn().mockResolvedValue(new Map()),
      // getAvailableSlots/getHeatmap appellent cette variante (AD-9, Story 30.5) — le mock reflète
      // getActiveDeclarations par défaut ; les tests AD-9 dédiés reconfigurent explicitement.
      getActiveDeclarationsWithSeances: jest.fn().mockResolvedValue(new Map()),
      computeSlotStatus: jest.fn().mockReturnValue('UNKNOWN'),
    };
    realtimeEvents = { emit: jest.fn() };
    service = new PartiesService(
      prisma as unknown as PrismaService,
      avail as unknown as AvailabilityService,
      realtimeEvents as unknown as RealtimeEventsService,
    );
  });

  it('create attache le mjId', async () => {
    prisma.partie.create.mockResolvedValue(partie);
    await service.create('mj1', {
      name: 'La Nuit',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
    });
    expect(prisma.partie.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mjId: 'mj1',
        name: 'La Nuit',
        description: null,
      }),
    });
  });

  it("create renvoie une partie projetée avec role: 'mj' (revue de code, AC6) — le créateur est toujours MJ", async () => {
    prisma.partie.create.mockResolvedValue(partie);
    const dto = await service.create('mj1', {
      name: 'La Nuit',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
    });
    expect(dto).toEqual({
      id: partie.id,
      name: partie.name,
      kind: partie.kind,
      gameSystemId: partie.gameSystemId,
      description: partie.description,
      mjId: partie.mjId,
      createdAt: partie.createdAt,
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'mj',
      status: 'EN_COURS',
      isFavorite: false,
      coverImageVersion: null,
    });
  });

  it('create() ONE_SHOT ne fait aucun appel scenario.count/groupBy — hasScenario connu synchronement (Story 29.6)', async () => {
    prisma.partie.create.mockResolvedValue(partie);
    await service.create('mj1', {
      name: 'La Nuit',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
    });
    expect(prisma.scenario.count).not.toHaveBeenCalled();
    expect(prisma.scenario.groupBy).not.toHaveBeenCalled();
  });

  it('create CAMPAGNE_LINEAIRE renvoie status: A_VENIR (aucun scénario auto-créé, Story 29.6)', async () => {
    prisma.partie.create.mockResolvedValue({
      ...partie,
      kind: 'CAMPAGNE_LINEAIRE',
    });
    const dto = await service.create('mj1', {
      name: 'Les Chroniques',
      kind: 'CAMPAGNE_LINEAIRE',
      gameSystemId: 'draconis',
    });
    expect(dto.status).toBe('A_VENIR');
    expect(prisma.scenario.count).not.toHaveBeenCalled();
    expect(prisma.scenario.groupBy).not.toHaveBeenCalled();
  });

  it('create ONE_SHOT crée automatiquement son scénario unique BROUILLON dans la même transaction (AC3, Story 7.1)', async () => {
    prisma.partie.create.mockResolvedValue(partie);
    await service.create('mj1', {
      name: 'La Nuit',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.scenario.create).toHaveBeenCalledWith({
      data: {
        partieId: partie.id,
        title: partie.name,
        status: 'BROUILLON',
      },
    });
    expect(prisma.seance.create).toHaveBeenCalledWith({
      data: { scenarioId: 'scenario1' },
    });
  });

  it('create CAMPAGNE_LINEAIRE/CAMPAGNE_EPISODIQUE ne crée aucun scénario automatique (Story 7.1)', async () => {
    prisma.partie.create.mockResolvedValue({
      ...partie,
      kind: 'CAMPAGNE_LINEAIRE',
    });
    await service.create('mj1', {
      name: 'Les Chroniques',
      kind: 'CAMPAGNE_LINEAIRE',
      gameSystemId: 'draconis',
    });
    expect(prisma.scenario.create).not.toHaveBeenCalled();

    await service.create('mj1', {
      name: 'Agence',
      kind: 'CAMPAGNE_EPISODIQUE',
      gameSystemId: 'draconis',
    });
    expect(prisma.scenario.create).not.toHaveBeenCalled();
  });

  it('listForUser(player) renvoie les parties des memberships, projetées avec role: player', async () => {
    prisma.membership.findMany.mockResolvedValue([{ partie }]);
    expect(await service.listForUser('u', 'player')).toEqual([
      {
        id: partie.id,
        name: partie.name,
        kind: partie.kind,
        gameSystemId: partie.gameSystemId,
        description: partie.description,
        mjId: partie.mjId,
        createdAt: partie.createdAt,
        nextSessionDate: null,
        nextSessionSlot: null,
        role: 'player',
        status: 'A_VENIR',
        isFavorite: false,
        coverImageVersion: null,
      },
    ]);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u' },
        include: { partie: true },
      }),
    );
  });

  it('listForUser(mj) renvoie les parties dont je suis MJ, projetées avec role: mj (revue de code)', async () => {
    prisma.partie.findMany.mockResolvedValue([partie]);
    expect(await service.listForUser('mj1', 'mj')).toEqual([
      {
        id: partie.id,
        name: partie.name,
        kind: partie.kind,
        gameSystemId: partie.gameSystemId,
        description: partie.description,
        mjId: partie.mjId,
        createdAt: partie.createdAt,
        nextSessionDate: null,
        nextSessionSlot: null,
        role: 'mj',
        status: 'A_VENIR',
        isFavorite: false,
        coverImageVersion: null,
      },
    ]);
  });

  it('listForUser(mj) : status: EN_COURS quand scenario.groupBy renvoie un compte > 0 pour la partie (Story 29.6)', async () => {
    prisma.partie.findMany.mockResolvedValue([partie]);
    prisma.scenario.groupBy.mockResolvedValue([
      { partieId: 'p1', _count: { _all: 2 } },
    ]);
    const [dto] = await service.listForUser('mj1', 'mj');
    expect(dto.status).toBe('EN_COURS');
  });

  it('listForUser(mj) : status: TERMINEE quand closedAt est renseigné, quel que soit le nombre de scénarios (Story 29.6)', async () => {
    prisma.partie.findMany.mockResolvedValue([
      { ...partie, closedAt: new Date('2026-08-01T00:00:00.000Z') },
    ]);
    prisma.scenario.groupBy.mockResolvedValue([
      { partieId: 'p1', _count: { _all: 3 } },
    ]);
    const [dto] = await service.listForUser('mj1', 'mj');
    expect(dto.status).toBe('TERMINEE');
  });

  it('listForUser(mj) : scenario.groupBy appelé une seule fois pour N parties (pas de N+1, AD-3)', async () => {
    const partieB = { ...partie, id: 'p2' };
    prisma.partie.findMany.mockResolvedValue([partie, partieB]);
    await service.listForUser('mj1', 'mj');
    expect(prisma.scenario.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.scenario.groupBy).toHaveBeenCalledWith({
      by: ['partieId'],
      where: { partieId: { in: ['p1', 'p2'] } },
      _count: { _all: true },
    });
    expect(prisma.scenario.count).not.toHaveBeenCalled();
  });

  describe('isFavorite (Story 29.8)', () => {
    it('listForUser(mj) : une partie favorite porte isFavorite: true, une autre isFavorite: false', async () => {
      const partieB = { ...partie, id: 'p2' };
      prisma.partie.findMany.mockResolvedValue([partie, partieB]);
      prisma.partieFavorite.findMany.mockResolvedValue([{ partieId: 'p1' }]);
      const [dtoA, dtoB] = await service.listForUser('mj1', 'mj');
      expect(dtoA.isFavorite).toBe(true);
      expect(dtoB.isFavorite).toBe(false);
    });

    it('listForUser(mj) : partieFavorite.findMany appelé une seule fois pour N parties (pas de N+1, AD-3)', async () => {
      const partieB = { ...partie, id: 'p2' };
      prisma.partie.findMany.mockResolvedValue([partie, partieB]);
      await service.listForUser('mj1', 'mj');
      expect(prisma.partieFavorite.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.partieFavorite.findMany).toHaveBeenCalledWith({
        where: { userId: 'mj1', partieId: { in: ['p1', 'p2'] } },
        select: { partieId: true },
      });
    });

    it('listForUser(player) : une partie favorite porte isFavorite: true', async () => {
      prisma.membership.findMany.mockResolvedValue([{ partie }]);
      prisma.partieFavorite.findMany.mockResolvedValue([{ partieId: 'p1' }]);
      const [dto] = await service.listForUser('u', 'player');
      expect(dto.isFavorite).toBe(true);
    });

    it('create() : isFavorite: false, aucune requête partieFavorite émise', async () => {
      prisma.partie.create.mockResolvedValue(partie);
      const dto = await service.create('mj1', {
        name: 'La Nuit',
        kind: 'ONE_SHOT',
        gameSystemId: 'draconis',
      });
      expect(dto.isFavorite).toBe(false);
      expect(prisma.partieFavorite.findUnique).not.toHaveBeenCalled();
      expect(prisma.partieFavorite.findMany).not.toHaveBeenCalled();
    });

    it('findOneDto() : isFavorite toujours présent (true si favori)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.partieFavorite.findUnique.mockResolvedValue({
        id: 'f1',
        userId: 'mj1',
        partieId: 'p1',
      });
      const dto = await service.findOneDto('p1', 'mj1');
      expect(dto.isFavorite).toBe(true);
      expect(prisma.partieFavorite.findUnique).toHaveBeenCalledWith({
        where: { userId_partieId: { userId: 'mj1', partieId: 'p1' } },
      });
    });

    it('update()/close()/reopen() : isFavorite toujours présent dans le DTO retourné', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue(partie);
      prisma.membership.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.partieFavorite.findUnique.mockResolvedValue({
        id: 'f1',
        userId: 'mj1',
        partieId: 'p1',
      });

      const updated = await service.update('p1', 'mj1', {
        name: 'Nouveau nom',
      });
      expect(updated.isFavorite).toBe(true);

      const closed = await service.close('p1', 'mj1');
      expect(closed.isFavorite).toBe(true);

      const reopened = await service.reopen('p1', 'mj1');
      expect(reopened.isFavorite).toBe(true);
    });
  });

  it("toPartieDto() n'énumère que les champs du DTO — un champ Prisma non listé (ex. futur ajout de colonne) ne fuite jamais (revue de code, AC6)", async () => {
    prisma.partie.findMany.mockResolvedValue([
      { ...partie, sheetVisibility: { secret: true }, internalFlag: 'nope' },
    ]);
    const [dto] = await service.listForUser('mj1', 'mj');
    expect(dto).not.toHaveProperty('sheetVisibility');
    expect(dto).not.toHaveProperty('internalFlag');
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'name',
        'kind',
        'gameSystemId',
        'description',
        'mjId',
        'createdAt',
        'nextSessionDate',
        'nextSessionSlot',
        'role',
        'status',
        'isFavorite',
        'coverImageVersion',
      ].sort(),
    );
  });

  it("toPartieDto() n'énumère que les champs du DTO côté branche player aussi (revue de code, AC6)", async () => {
    prisma.membership.findMany.mockResolvedValue([
      {
        partie: {
          ...partie,
          sheetVisibility: { secret: true },
          internalFlag: 'nope',
        },
      },
    ]);
    const [dto] = await service.listForUser('u', 'player');
    expect(dto).not.toHaveProperty('sheetVisibility');
    expect(dto).not.toHaveProperty('internalFlag');
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'name',
        'kind',
        'gameSystemId',
        'description',
        'mjId',
        'createdAt',
        'nextSessionDate',
        'nextSessionSlot',
        'role',
        'status',
        'isFavorite',
        'coverImageVersion',
      ].sort(),
    );
  });

  describe('coverImageVersion (Story 29.12, AD-19)', () => {
    it('sans couverture (coverImageUrl null) → coverImageVersion null', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { ...partie, coverImageUrl: null },
      ]);
      const [dto] = await service.listForUser('mj1', 'mj');
      expect(dto.coverImageVersion).toBeNull();
    });

    it('avec une couverture valide → coverImageVersion est le stem UUID, sans extension ni préfixe', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          ...partie,
          coverImageUrl:
            '/uploads/covers/11111111-1111-1111-1111-111111111111.webp',
        },
      ]);
      const [dto] = await service.listForUser('mj1', 'mj');
      expect(dto.coverImageVersion).toBe(
        '11111111-1111-1111-1111-111111111111',
      );
    });

    it('coverImageUrl corrompu (mauvais préfixe ou format invalide) → coverImageVersion null, jamais une exception', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { ...partie, coverImageUrl: '/uploads/portraits/x.jpg' },
      ]);
      const [dto] = await service.listForUser('mj1', 'mj');
      expect(dto.coverImageVersion).toBeNull();
    });
  });

  describe('setCoverImage/removeCoverImage/getCoverFile (Story 29.12, Task 10)', () => {
    function makeCoverFile(buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0])) {
      return {
        buffer,
        originalname: 'cover.jpg',
        mimetype: 'image/jpeg',
        size: buffer.length,
      } as Express.Multer.File;
    }

    beforeEach(() => {
      prisma.membership.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'mj1',
        pseudo: 'mj-pseudo',
        displayName: 'MJ Nom',
      });
    });

    it('AC1 : dépôt → coverImageUrl renseigné en DB, les 3 dérivées écrites sur disque', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue({
        ...partie,
        coverImageUrl:
          '/uploads/covers/99999999-9999-9999-9999-999999999999.webp',
      });
      prisma.partie.findUniqueOrThrow.mockResolvedValue({
        ...partie,
        coverImageUrl:
          '/uploads/covers/99999999-9999-9999-9999-999999999999.webp',
      });

      const dto = await service.setCoverImage('p1', 'mj1', makeCoverFile());

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          coverImageUrl:
            '/uploads/covers/99999999-9999-9999-9999-999999999999.webp',
        },
      });
      expect(writeFile).toHaveBeenCalledTimes(3);
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-large.webp',
        ),
        expect.any(Buffer),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-medium.webp',
        ),
        expect.any(Buffer),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-compact.webp',
        ),
        expect.any(Buffer),
      );
      expect(dto.coverImageVersion).toBe(
        '99999999-9999-9999-9999-999999999999',
      );
    });

    it('AC9 : chaque dérivée est redimensionnée pour son mode — dimensions distinctes par mode, jamais une largeur unique', async () => {
      sharpResizeCalls.length = 0;
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue(partie);
      prisma.partie.findUniqueOrThrow.mockResolvedValue(partie);

      await service.setCoverImage('p1', 'mj1', makeCoverFile());

      expect(sharpResizeCalls).toContainEqual(
        expect.objectContaining({ width: 640, height: 248, fit: 'cover' }),
      );
      expect(sharpResizeCalls).toContainEqual(
        expect.objectContaining({ width: 88, height: 88, fit: 'cover' }),
      );
      expect(sharpResizeCalls).toContainEqual(
        expect.objectContaining({ width: 56, height: 56, fit: 'cover' }),
      );
    });

    it('AC4 : joueur non-MJ → ForbiddenException, aucune écriture disque', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie); // mjId: 'mj1'
      await expect(
        service.setCoverImage('p1', 'autre', makeCoverFile()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(writeFile).not.toHaveBeenCalled();
      expect(prisma.partie.update).not.toHaveBeenCalled();
    });

    it('fichier non-image (octets magiques invalides) → BadRequestException, aucune écriture disque', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      await expect(
        service.setCoverImage(
          'p1',
          'mj1',
          makeCoverFile(Buffer.from('not an image')),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('remplacement → les 3 dérivées de l’ancienne couverture sont supprimées, pas laissées orphelines', async () => {
      const OLD_STEM = '22222222-2222-2222-2222-222222222222';
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        coverImageUrl: `/uploads/covers/${OLD_STEM}.webp`,
      });
      prisma.partie.update.mockResolvedValue(partie);
      prisma.partie.findUniqueOrThrow.mockResolvedValue(partie);

      await service.setCoverImage('p1', 'mj1', makeCoverFile());

      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${OLD_STEM}-large.webp`),
      );
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${OLD_STEM}-medium.webp`),
      );
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${OLD_STEM}-compact.webp`),
      );
    });

    it('échec DB après écriture disque → les dérivées fraîchement écrites sont nettoyées, erreur propagée', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.setCoverImage('p1', 'mj1', makeCoverFile()),
      ).rejects.toThrow('db down');
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-large.webp',
        ),
      );
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-medium.webp',
        ),
      );
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(
          '99999999-9999-9999-9999-999999999999-compact.webp',
        ),
      );
    });

    it('dépôt émet un événement temps réel scopé sur la Partie et ses membres (AD-14)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue(partie);
      prisma.partie.findUniqueOrThrow.mockResolvedValue(partie);

      await service.setCoverImage('p1', 'mj1', makeCoverFile());

      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
    });

    it('AC3 : retrait → coverImageUrl remis à null, les 3 dérivées supprimées', async () => {
      const STEM = '33333333-3333-3333-3333-333333333333';
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        coverImageUrl: `/uploads/covers/${STEM}.webp`,
      });
      prisma.partie.update.mockResolvedValue({
        ...partie,
        coverImageUrl: null,
      });
      prisma.partie.findUniqueOrThrow.mockResolvedValue({
        ...partie,
        coverImageUrl: null,
      });

      const dto = await service.removeCoverImage('p1', 'mj1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { coverImageUrl: null },
      });
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining(`${STEM}-large.webp`),
      );
      expect(dto.coverImageVersion).toBeNull();
    });

    it('AC4 : retrait par un joueur non-MJ → ForbiddenException, aucune écriture', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      await expect(
        service.removeCoverImage('p1', 'autre'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.partie.update).not.toHaveBeenCalled();
    });

    it('retrait émet un événement temps réel scopé sur la Partie et ses membres (AD-14)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue(partie);
      prisma.partie.findUniqueOrThrow.mockResolvedValue(partie);

      await service.removeCoverImage('p1', 'mj1');

      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
    });

    it('getCoverFile : lit la dérivée du mode demandé et renvoie le jeton de version', async () => {
      const STEM = '44444444-4444-4444-4444-444444444444';
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        coverImageUrl: `/uploads/covers/${STEM}.webp`,
      });
      (readFile as jest.Mock).mockResolvedValue(
        Buffer.from('derivative-bytes'),
      );

      const result = await service.getCoverFile('p1', 'mj1', 'medium');

      expect(readFile).toHaveBeenCalledWith(
        expect.stringContaining(`${STEM}-medium.webp`),
      );
      expect(result).toEqual({
        buffer: Buffer.from('derivative-bytes'),
        mime: 'image/webp',
        version: STEM,
      });
    });

    it('getCoverFile : aucune couverture (coverImageUrl null) → null, jamais un accès disque', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        coverImageUrl: null,
      });
      const result = await service.getCoverFile('p1', 'mj1', 'large');
      expect(result).toBeNull();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('getCoverFile : coverImageUrl renseigné mais fichier absent du disque → null, jamais une exception (CAP-20)', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        coverImageUrl:
          '/uploads/covers/55555555-5555-5555-5555-555555555555.webp',
      });
      (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.getCoverFile('p1', 'mj1', 'large'),
      ).resolves.toBeNull();
    });

    it('getCoverFile : non-membre et non-MJ → ForbiddenException (getViewable)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie); // mjId: 'mj1'
      prisma.membership.findUnique.mockResolvedValue(null);
      await expect(
        service.getCoverFile('p1', 'etranger', 'large'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('getViewable : renvoie la partie au MJ sans vérifier les memberships', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    expect(await service.getViewable('p1', 'mj1')).toEqual(partie);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('getViewable : autorise un membre', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue({
      userId: 'u',
      partieId: 'p1',
    });
    expect(await service.getViewable('p1', 'u')).toEqual(partie);
  });

  it('getViewable : 403 si ni MJ ni membre', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.getViewable('p1', 'u')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('findOneDto : retourne mjPseudo/mjDisplayName et role: mj pour le MJ (getViewable inchangée)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.user.findUnique.mockResolvedValue({
      pseudo: 'mj-pseudo',
      displayName: 'MJ Nom',
    });
    const dto = await service.findOneDto('p1', 'mj1');
    expect(dto).toEqual({
      id: partie.id,
      name: partie.name,
      kind: partie.kind,
      gameSystemId: partie.gameSystemId,
      description: partie.description,
      mjId: partie.mjId,
      createdAt: partie.createdAt,
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'mj',
      status: 'A_VENIR',
      mjPseudo: 'mj-pseudo',
      mjDisplayName: 'MJ Nom',
      isFavorite: false,
      coverImageVersion: null,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'mj1' },
      select: { pseudo: true, displayName: true },
    });
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('findOneDto : retourne mjPseudo/mjDisplayName et role: player pour un joueur consultant la même partie', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue({
      userId: 'u',
      partieId: 'p1',
    });
    prisma.user.findUnique.mockResolvedValue({
      pseudo: 'mj-pseudo',
      displayName: 'MJ Nom',
    });
    const dto = await service.findOneDto('p1', 'u');
    expect(dto).toEqual({
      id: partie.id,
      name: partie.name,
      kind: partie.kind,
      gameSystemId: partie.gameSystemId,
      description: partie.description,
      mjId: partie.mjId,
      createdAt: partie.createdAt,
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'player',
      status: 'A_VENIR',
      mjPseudo: 'mj-pseudo',
      mjDisplayName: 'MJ Nom',
      isFavorite: false,
      coverImageVersion: null,
    });
  });

  it('findOneDto : status: EN_COURS quand la partie a au moins un scénario (Story 29.6)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.scenario.count.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);
    const dto = await service.findOneDto('p1', 'mj1');
    expect(dto.status).toBe('EN_COURS');
    expect(prisma.scenario.count).toHaveBeenCalledWith({
      where: { partieId: 'p1' },
    });
  });

  it('findOneDto : status: TERMINEE quand closedAt est renseigné, même avec des scénarios (Story 29.6)', async () => {
    prisma.partie.findUnique.mockResolvedValue({
      ...partie,
      closedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.scenario.count.mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue(null);
    const dto = await service.findOneDto('p1', 'mj1');
    expect(dto.status).toBe('TERMINEE');
  });

  it('findOneDto : 403 si ni MJ ni membre (getViewable inchangée)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.findOneDto('p1', 'u')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("findOneDto : renvoie la partie projetée (avec role), sans mjPseudo/mjDisplayName, si l'utilisateur MJ est introuvable (revue de code, pas de 500)", async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.user.findUnique.mockResolvedValue(null);
    const dto = await service.findOneDto('p1', 'mj1');
    expect(dto).toEqual({
      id: partie.id,
      name: partie.name,
      kind: partie.kind,
      gameSystemId: partie.gameSystemId,
      description: partie.description,
      mjId: partie.mjId,
      createdAt: partie.createdAt,
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'mj',
      status: 'A_VENIR',
      isFavorite: false,
      coverImageVersion: null,
    });
    expect((dto as any).mjPseudo).toBeUndefined();
  });

  it('removeMember : MJ uniquement, puis supprime le membership', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeMember('p1', 'mj1', 'u');
    expect(prisma.membership.deleteMany).toHaveBeenCalledWith({
      where: { partieId: 'p1', userId: 'u' },
    });
  });

  it('removeMember : 403 si pas le MJ (aucune suppression)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(
      service.removeMember('p1', 'autre', 'u'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.deleteMany).not.toHaveBeenCalled();
  });

  it('removeMember : bug fix — émet partieTopic (roster) et userTopic (liste de Parties du joueur retiré)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeMember('p1', 'mj1', 'u');
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
    expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u'));
  });

  it('removeMember : notifie aussi le MJ via userTopic (Story 29.7, AD-14, signal AUCUN_MEMBRE_INVITE réapparaissant si dernier membre retiré)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: 'mj1',
      pseudo: 'mj-pseudo',
      displayName: 'MJ Nom',
    });
    prisma.membership.findMany.mockResolvedValue([]);
    await service.removeMember('p1', 'mj1', 'u');
    expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
  });

  it('getOwned : 404 si introuvable', async () => {
    prisma.partie.findUnique.mockResolvedValue(null);
    await expect(service.getOwned('p1', 'mj1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getOwned : 403 si pas le MJ', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(service.getOwned('p1', 'autre')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('getOwned : renvoie la partie si MJ', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    expect(await service.getOwned('p1', 'mj1')).toEqual(partie);
  });

  it('update() émet un événement temps réel scopé sur la Partie (Story 18.3, AC1)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.partie.update.mockResolvedValue({ ...partie, name: 'Nouveau nom' });
    await service.update('p1', 'mj1', { name: 'Nouveau nom' });
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it("update() renvoie une partie projetée avec role: 'mj' (revue de code, AC6) — getOwned garantit que l'appelant est MJ", async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.partie.update.mockResolvedValue({ ...partie, name: 'Nouveau nom' });
    const dto = await service.update('p1', 'mj1', { name: 'Nouveau nom' });
    expect(dto).toEqual({
      id: partie.id,
      name: 'Nouveau nom',
      kind: partie.kind,
      gameSystemId: partie.gameSystemId,
      description: partie.description,
      mjId: partie.mjId,
      createdAt: partie.createdAt,
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'mj',
      status: 'A_VENIR',
      isFavorite: false,
      coverImageVersion: null,
    });
  });

  describe('close/reopen (Story 29.6, AD-8/AD-14)', () => {
    beforeEach(() => {
      prisma.membership.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'mj1',
        pseudo: 'mj-pseudo',
        displayName: 'MJ Nom',
      });
    });

    it('close() : MJ uniquement (403 sinon, aucun update)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      await expect(service.close('p1', 'autre')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.partie.update).not.toHaveBeenCalled();
    });

    it('close() : renseigne closedAt (AC1)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-09T00:00:00.000Z'),
      });
      await service.close('p1', 'mj1');
      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { closedAt: expect.any(Date) },
      });
    });

    it('close() : renvoie status: TERMINEE', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-09T00:00:00.000Z'),
      });
      const dto = await service.close('p1', 'mj1');
      expect(dto.status).toBe('TERMINEE');
    });

    it('close() : émet partieTopic(id) et userTopic(userId) pour le MJ et chaque membre résolu (AD-14)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-09T00:00:00.000Z'),
      });
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'Alice', displayName: 'Alice au pays' } },
        { user: { id: 'u2', pseudo: 'Bob', displayName: 'Bob' } },
      ]);
      await service.close('p1', 'mj1');
      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u2'));
    });

    it('close() sur une partie CAMPAGNE sans aucun scénario : recalcule hasScenario plutôt que de le supposer (Story 29.6, Task 5)', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.count.mockResolvedValue(0);
      prisma.partie.update.mockResolvedValue({
        ...partie,
        kind: 'CAMPAGNE_LINEAIRE',
        closedAt: new Date('2026-08-09T00:00:00.000Z'),
      });
      const dto = await service.close('p1', 'mj1');
      // closedAt prime toujours sur hasScenario dans toPartieDto() — TERMINEE quel que soit le
      // nombre de scénarios (cf. tests de dérivation ci-dessus).
      expect(dto.status).toBe('TERMINEE');
    });

    it('reopen() : MJ uniquement (403 sinon, aucun update)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      await expect(service.reopen('p1', 'autre')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.partie.update).not.toHaveBeenCalled();
    });

    it('reopen() : efface closedAt (AC2)', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.partie.update.mockResolvedValue({ ...partie, closedAt: null });
      await service.reopen('p1', 'mj1');
      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { closedAt: null },
      });
    });

    it('reopen() : la partie redevient active — status: A_VENIR sans scénario, EN_COURS sinon (AC2)', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.partie.update.mockResolvedValue({ ...partie, closedAt: null });
      prisma.scenario.count.mockResolvedValue(0);
      const dto = await service.reopen('p1', 'mj1');
      expect(dto.status).toBe('A_VENIR');
    });

    it('reopen() : émet partieTopic(id) et userTopic(userId) pour le MJ et chaque membre résolu (AD-14)', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        closedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      prisma.partie.update.mockResolvedValue({ ...partie, closedAt: null });
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'Alice', displayName: 'Alice au pays' } },
      ]);
      await service.reopen('p1', 'mj1');
      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u1'));
    });
  });

  describe('notifyPartieSignalsChanged (Story 29.7, AD-14)', () => {
    it("émet userTopic(userId) pour le MJ et chaque membre résolu, MAIS PAS partieTopic (déjà émis par l'appelant — revue de code, double émission corrigée)", async () => {
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'Alice', displayName: 'Alice au pays' } },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'mj1',
        pseudo: 'mj-pseudo',
        displayName: 'MJ Nom',
      });
      await service.notifyPartieSignalsChanged('p1', 'mj1');
      expect(realtimeEvents.emit).not.toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u1'));
    });

    it("n'échoue jamais l'appelant si l'émission lève une exception (même garde que close()/reopen())", async () => {
      prisma.membership.findMany.mockRejectedValue(new Error('boom'));
      await expect(
        service.notifyPartieSignalsChanged('p1', 'mj1'),
      ).resolves.toBeUndefined();
    });
  });

  it('remove : vérifie la propriété puis supprime', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.partie.delete.mockResolvedValue(partie);
    await service.remove('p1', 'mj1');
    expect(prisma.partie.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('remove : 403 si pas le MJ (et aucune suppression)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(service.remove('p1', 'autre')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.partie.delete).not.toHaveBeenCalled();
  });

  describe('listMembers', () => {
    it("renvoie displayName pour chaque membre, et l'e-mail uniquement si le demandeur est le MJ", async () => {
      prisma.partie.findUnique.mockResolvedValue(partie); // mjId = 'mj1'
      prisma.membership.findMany.mockResolvedValue([
        {
          joinedAt: new Date('2026-01-01'),
          user: {
            id: 'u1',
            pseudo: 'Alice',
            displayName: 'Alice au pays',
            email: 'alice@b.c',
          },
        },
      ]);

      const asMj = await service.listMembers('p1', 'mj1');
      expect(asMj[0]).toMatchObject({
        userId: 'u1',
        pseudo: 'Alice',
        displayName: 'Alice au pays',
        email: 'alice@b.c',
      });

      prisma.membership.findUnique.mockResolvedValue({
        userId: 'u1',
        partieId: 'p1',
      });
      const asMember = await service.listMembers('p1', 'u1');
      expect(asMember[0]).toMatchObject({
        userId: 'u1',
        pseudo: 'Alice',
        displayName: 'Alice au pays',
      });
      expect(asMember[0].email).toBeUndefined();
    });

    it('lève ForbiddenException si ni MJ ni membre (aucune requête membership)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.membership.findUnique.mockResolvedValue(null);
      await expect(
        service.listMembers('p1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.membership.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableSlots', () => {
    const members = [
      {
        userId: 'u1',
        user: { id: 'u1', pseudo: 'Alice', displayName: 'Alice au pays' },
      },
      { userId: 'u2', user: { id: 'u2', pseudo: 'Bob', displayName: 'Bob' } },
    ];

    beforeEach(() => {
      prisma.partie.findUnique.mockResolvedValue(partie); // mjId = 'mj1'
      prisma.membership.findMany.mockResolvedValue(members);
      avail.getActiveDeclarationsWithSeances.mockResolvedValue(
        new Map([
          ['u1', []],
          ['u2', []],
        ]),
      );
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');
    });

    it('appelle getActiveDeclarations une seule fois pour N membres (pas de N+1)', async () => {
      await service.getAvailableSlots('p1', 'mj1', 1);
      expect(avail.getActiveDeclarationsWithSeances).toHaveBeenCalledTimes(1);
      expect(avail.getActiveDeclarationsWithSeances).toHaveBeenCalledWith([
        'u1',
        'u2',
      ]);
    });

    it('les créneaux avec membres non-MJ UNAVAILABLE sont classés en priorité 3 (fins de liste)', async () => {
      // Premier appel (u1 sur le 1er slot) = UNAVAILABLE ; tous les suivants = UNKNOWN
      // Avec 1 semaine = 21 créneaux, le créneau UNAVAILABLE (priorité 3) arrive en 21ème
      // position → exclu par slice(0, 20). Non hard-exclu : seulement de-priorisé.
      avail.computeSlotStatus
        .mockReturnValueOnce('UNAVAILABLE')
        .mockReturnValue('UNKNOWN');

      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        1,
      )) as AvailableSlotDto[];
      expect(results.length).toBeLessThanOrEqual(20);
      // Le créneau UNAVAILABLE ne figure pas dans les 20 premiers (relégué en priorité 3)
      expect(
        results.every((r) =>
          r.members.every((m) => m.status !== 'UNAVAILABLE'),
        ),
      ).toBe(true);
    });

    it('inclut un créneau si tous les membres sont UNKNOWN', async () => {
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');

      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        1,
      )) as AvailableSlotDto[];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].members.every((m) => m.status === 'UNKNOWN')).toBe(
        true,
      );
    });

    it("n'inclut pas un membre retiré (absent de memberships) dans le calcul", async () => {
      // Seul u1 est encore membre (u2 a été retiré)
      prisma.membership.findMany.mockResolvedValue([
        { userId: 'u1', user: { id: 'u1', pseudo: 'Alice' } },
      ]);
      avail.getActiveDeclarationsWithSeances.mockResolvedValue(
        new Map([['u1', []]]),
      );

      await service.getAvailableSlots('p1', 'mj1', 1);
      expect(avail.getActiveDeclarationsWithSeances).toHaveBeenCalledWith([
        'u1',
      ]);
    });

    it('renvoie au plus 20 créneaux (limite de résultats)', async () => {
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');
      const results = await service.getAvailableSlots('p1', 'mj1', 8);
      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('trie par priorité : AVAILABLE avant UNKNOWN, UNAVAILABLE en dernier', async () => {
      // Alterne AVAILABLE / UNAVAILABLE par participant pour créer des priorités mixtes
      // (MJ absent du mock → seuls u1/u2 sont participants)
      let callCount = 0;
      avail.computeSlotStatus.mockImplementation(() => {
        callCount++;
        // Tous les slots homogènes sauf les 2 premiers : u1=AVAILABLE, u2=UNAVAILABLE
        if (callCount === 1) return 'AVAILABLE';
        if (callCount === 2) return 'UNAVAILABLE';
        return 'AVAILABLE';
      });
      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        1,
      )) as AvailableSlotDto[];
      expect(results.length).toBeGreaterThan(0);
      // Les 20 premiers résultats ne doivent PAS commencer par le créneau mixte (priorité 1)
      // avant un créneau all-AVAILABLE (priorité 0) — vérifier que le tri est respecté
      for (let i = 1; i < results.length; i++) {
        const pa = results[i - 1].members.some(
          (m) => m.status === 'UNAVAILABLE',
        )
          ? 3
          : results[i - 1].members.every((m) => m.status === 'AVAILABLE')
            ? 0
            : results[i - 1].members.some((m) => m.status === 'AVAILABLE')
              ? 1
              : 2;
        const pb = results[i].members.some((m) => m.status === 'UNAVAILABLE')
          ? 3
          : results[i].members.every((m) => m.status === 'AVAILABLE')
            ? 0
            : results[i].members.some((m) => m.status === 'AVAILABLE')
              ? 1
              : 2;
        expect(pa).toBeLessThanOrEqual(pb);
      }
    });

    describe('Q1 : exclusion hard MJ UNAVAILABLE', () => {
      const mjUser = { id: 'mj1', pseudo: 'MJ' };
      const memberU1 = { userId: 'u1', user: { id: 'u1', pseudo: 'Alice' } };

      beforeEach(() => {
        prisma.partie.findUnique.mockResolvedValue(partie);
        prisma.user.findUnique.mockResolvedValue(mjUser);
        prisma.membership.findMany.mockResolvedValue([memberU1]);
        avail.getActiveDeclarationsWithSeances.mockResolvedValue(
          new Map([
            ['mj1', []],
            ['u1', []],
          ]),
        );
      });

      it('hard-exclut tout créneau où le MJ est UNAVAILABLE', async () => {
        avail.computeSlotStatus.mockReturnValue('UNAVAILABLE');
        const results = await service.getAvailableSlots('p1', 'mj1', 1);
        expect(results).toHaveLength(0);
      });

      it('conserve un créneau où le MJ est AVAILABLE et un joueur est UNAVAILABLE (Q2B)', async () => {
        // mj1 → AVAILABLE, u1 → UNAVAILABLE sur le premier créneau
        let callIdx = 0;
        avail.computeSlotStatus.mockImplementation(() => {
          // Participants = [mj1, u1] — alterne par participant
          const isEven = callIdx++ % 2 === 0;
          return isEven ? 'AVAILABLE' : 'UNAVAILABLE'; // mj=AVAILABLE, u1=UNAVAILABLE
        });
        const results = (await service.getAvailableSlots(
          'p1',
          'u1',
          1,
        )) as AggregatedSlotDto[];
        expect(results.length).toBeGreaterThan(0);
        // Au moins un créneau doit avoir unavailable > 0 (Q2B)
        expect(results.some((r) => r.unavailable > 0)).toBe(true);
      });
    });

    it('renvoie AvailableSlotDto[] (avec members) pour le MJ', async () => {
      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        1,
      )) as AvailableSlotDto[];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('members');
      expect(results[0].members[0]).toMatchObject({
        userId: 'u1',
        pseudo: 'Alice',
        displayName: 'Alice au pays',
        status: 'UNKNOWN',
      });
    });

    it('renvoie AggregatedSlotDto[] (sans identité) pour un membre non-MJ', async () => {
      // player1 est membre mais pas MJ
      prisma.membership.findMany.mockResolvedValue([
        ...members,
        { userId: 'player1', user: { id: 'player1', pseudo: 'Charlie' } },
      ]);
      avail.getActiveDeclarationsWithSeances.mockResolvedValue(
        new Map([
          ['u1', []],
          ['u2', []],
          ['player1', []],
        ]),
      );
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');

      const results = (await service.getAvailableSlots(
        'p1',
        'player1',
        1,
      )) as AggregatedSlotDto[];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('available');
      expect(results[0]).toHaveProperty('unavailable');
      expect(results[0]).toHaveProperty('unknown');
      expect(results[0]).toHaveProperty('total');
      expect(results[0]).not.toHaveProperty('members');
    });

    it('lève ForbiddenException si ni MJ ni membre', async () => {
      await expect(
        service.getAvailableSlots('p1', 'stranger', 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    describe('filtrage from/to', () => {
      beforeEach(() => {
        prisma.partie.findUnique.mockResolvedValue(partie);
        prisma.membership.findMany.mockResolvedValue(members);
        avail.getActiveDeclarationsWithSeances.mockResolvedValue(
          new Map([
            ['u1', []],
            ['u2', []],
          ]),
        );
        avail.computeSlotStatus.mockReturnValue('AVAILABLE');
      });

      it('restreint les résultats à la plage from/to', async () => {
        const from = '2026-08-01';
        const to = '2026-08-03';
        const results = (await service.getAvailableSlots(
          'p1',
          'mj1',
          8,
          from,
          to,
        )) as AvailableSlotDto[];
        expect(results.length).toBeGreaterThan(0);
        expect(results.every((r) => r.date >= from && r.date <= to)).toBe(true);
      });

      it('ne retourne aucun créneau hors de la plage from/to', async () => {
        const from = '2026-08-01';
        const to = '2026-08-01';
        const results = (await service.getAvailableSlots(
          'p1',
          'mj1',
          8,
          from,
          to,
        )) as AvailableSlotDto[];
        expect(results.every((r) => r.date === '2026-08-01')).toBe(true);
        expect(results.some((r) => r.date !== '2026-08-01')).toBe(false);
      });

      it('lève BadRequestException si from > to', async () => {
        await expect(
          service.getAvailableSlots('p1', 'mj1', 8, '2026-08-31', '2026-08-01'),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('sans from/to, appel avec weeks fonctionne (rétrocompat)', async () => {
        const results = (await service.getAvailableSlots(
          'p1',
          'mj1',
          1,
        )) as AvailableSlotDto[];
        expect(avail.getActiveDeclarationsWithSeances).toHaveBeenCalledTimes(1);
        expect(results.length).toBeGreaterThanOrEqual(0);
      });

      it("accepte from === to (plage d'un seul jour)", async () => {
        const results = (await service.getAvailableSlots(
          'p1',
          'mj1',
          8,
          '2026-08-15',
          '2026-08-15',
        )) as AvailableSlotDto[];
        expect(results.every((r) => r.date === '2026-08-15')).toBe(true);
        expect(results.length).toBe(3);
      });

      it('lève BadRequestException si seulement from est fourni', async () => {
        await expect(
          service.getAvailableSlots('p1', 'mj1', 8, '2026-08-01', undefined),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('lève BadRequestException si seulement to est fourni', async () => {
        await expect(
          service.getAvailableSlots('p1', 'mj1', 8, undefined, '2026-08-31'),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('lève BadRequestException si la plage dépasse 366 jours', async () => {
        await expect(
          service.getAvailableSlots('p1', 'mj1', 8, '2024-01-01', '2025-12-31'),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });
  });

  describe('getAvailableSlots — AD-9 end-to-end (Story 30.5)', () => {
    // Câblage réel PartiesService + AvailabilityService (pas de mock sur avail) : vérifie que la
    // production appelle bien getActiveDeclarationsWithSeances et que la dérivation traverse
    // effectivement jusqu'aux deux vues (AC3, AC6), sans identité de la Partie tierce (AC3).
    const partieA = {
      id: 'A',
      name: 'Partie A',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
      description: null,
      mjId: 'mjA',
      createdAt: new Date(),
      nextSessionDate: null,
      nextSessionSlot: null,
    };

    it("un membre occupé par une séance datée d'une autre Partie (B) apparaît UNAVAILABLE dans le calendrier de A, pour la vue MJ ET la vue joueur, sans qu'aucun champ ne nomme la Partie B", async () => {
      const p: any = {
        partie: {
          findUnique: jest.fn().mockResolvedValue(partieA),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'B',
              kind: 'ONE_SHOT',
              mjId: 'mjB',
              memberships: [{ userId: 'u1' }],
            },
          ]),
        },
        membership: {
          findMany: jest.fn().mockResolvedValue([
            {
              userId: 'u1',
              user: { id: 'u1', pseudo: 'Alice', displayName: 'Alice' },
            },
          ]),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'mjA', pseudo: 'MJ', displayName: 'MJ' }),
        },
        availabilityDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
        seance: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'seanceB1',
              poll: {
                chosenDate: new Date('2026-09-20T00:00:00Z'),
                chosenSlot: 'EVENING',
              },
              dateValidee: null,
              inscriptions: [],
              scenario: { partieId: 'B' },
            },
          ]),
        },
      };
      const realAvailability = new AvailabilityService(p, {
        emit: jest.fn(),
      } as unknown as RealtimeEventsService);
      const svc = new PartiesService(p, realAvailability, {
        emit: jest.fn(),
      } as unknown as RealtimeEventsService);

      const mjResults = (await svc.getAvailableSlots(
        'A',
        'mjA',
        8,
        '2026-09-20',
        '2026-09-20',
      )) as AvailableSlotDto[];
      const eveningMj = mjResults.find((r) => r.slot === 'EVENING')!;
      expect(eveningMj.members.find((m) => m.userId === 'u1')!.status).toBe(
        'UNAVAILABLE',
      );
      const mjSerialized = JSON.stringify(mjResults);
      expect(mjSerialized).not.toContain('mjB');
      expect(mjSerialized).not.toContain('partieB');

      const playerResults = (await svc.getAvailableSlots(
        'A',
        'u1',
        8,
        '2026-09-20',
        '2026-09-20',
      )) as AggregatedSlotDto[];
      const eveningPlayer = playerResults.find((r) => r.slot === 'EVENING')!;
      expect(eveningPlayer.unavailable).toBeGreaterThanOrEqual(1);

      // AC6 : getHeatmap (pas seulement la branche non-MJ de getAvailableSlots) doit s'accorder
      // avec la vue MJ sur le même créneau, sans nommer la Partie B non plus.
      const heatmap = await svc.getHeatmap(
        'A',
        'u1',
        '2026-09-20',
        '2026-09-20',
      );
      const eveningHeatmap = heatmap.find((r) => r.slot === 'EVENING')!;
      expect(eveningHeatmap.unavailable).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(heatmap)).not.toContain('mjB');
    });
  });

  describe('convertKind (Story 29.14 — garde de conversion de type)', () => {
    // La VRAIE matrice de `@master-jdr/shared` est exercée ici : les verdicts ne sont jamais
    // simulés, ils sont produits par l'état que ces tests posent dans les mocks Prisma. La table
    // de vérité elle-même (les 6 transitions × leurs états limites) est couverte séparément par
    // `apps/web/src/app/core/parties/partie-kind-transition.spec.ts`.
    const campagne = { ...partie, kind: 'CAMPAGNE_LINEAIRE', closedAt: null };
    const episodique = {
      ...partie,
      kind: 'CAMPAGNE_EPISODIQUE',
      closedAt: null,
    };

    /** Pose le nombre de scénarios total et le nombre de COURANT vus par la conversion.
     *  Distingue les deux appels par leur clause `where`, plutôt que par leur ordre. */
    function setScenarioCounts(total: number, courant: number): void {
      prisma.scenario.count.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.status === 'COURANT' ? courant : total),
      );
    }

    /** Vrai si AUCUNE écriture n'a eu lieu, sur aucune des quatre tables concernées (AC10). */
    function expectNoWrites(): void {
      expect(prisma.partie.update).not.toHaveBeenCalled();
      expect(prisma.scenario.create).not.toHaveBeenCalled();
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
      expect(prisma.scenarioParticipant.createMany).not.toHaveBeenCalled();
      expect(prisma.seance.create).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      prisma.partie.findUnique.mockResolvedValue(campagne);
      prisma.partie.update.mockResolvedValue({
        ...campagne,
        kind: 'ONE_SHOT',
      });
      prisma.membership.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'mj1',
        pseudo: 'mj-pseudo',
        displayName: 'MJ Nom',
      });
      setScenarioCounts(1, 0);
    });

    it('MJ uniquement : 403 pour un non-MJ, et aucune écriture', async () => {
      await expect(
        service.convertKind('p1', 'autre', { kind: 'ONE_SHOT' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNoWrites();
    });

    it('Cas 1 — ONE_SHOT → CAMPAGNE_LINEAIRE : autorisée sans condition', async () => {
      prisma.partie.findUnique.mockResolvedValue({ ...partie, closedAt: null });

      await service.convertKind('p1', 'mj1', { kind: 'CAMPAGNE_LINEAIRE' });

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { kind: 'CAMPAGNE_LINEAIRE' },
      });
    });

    it('AC10 — refus (3 scénarios → ONE_SHOT) : BadRequest levée AVANT toute écriture', async () => {
      setScenarioCounts(3, 0);

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectNoWrites();
    });

    it('AC6 — le message de refus nomme la cause réelle et le nombre en jeu', async () => {
      setScenarioCounts(3, 0);

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).rejects.toThrow(/3/);
    });

    it('Règle C — partie clôturée : refus avec un message distinct invitant à rouvrir', async () => {
      prisma.partie.findUnique.mockResolvedValue({
        ...campagne,
        closedAt: new Date(),
      });

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).rejects.toThrow(/rouvr/i);
      expectNoWrites();
    });

    it('Règle C — la clôture prime sur un refus qui serait sinon dû au nombre de scénarios', async () => {
      setScenarioCounts(5, 0);
      prisma.partie.findUnique.mockResolvedValue({
        ...campagne,
        closedAt: new Date(),
      });

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).rejects.toThrow(/rouvr/i);
    });

    it('Cas 3 à 1 scénario : autorisée, écrit le kind et rien d’autre', async () => {
      await service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' });

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { kind: 'ONE_SHOT' },
      });
      expect(prisma.scenario.create).not.toHaveBeenCalled();
      expect(prisma.scenario.updateMany).not.toHaveBeenCalled();
      expect(prisma.scenarioParticipant.createMany).not.toHaveBeenCalled();
    });

    it('AC7 — cas 3 à 0 scénario : crée un scénario BROUILLON titré du nom de la partie, ET sa séance', async () => {
      setScenarioCounts(0, 0);
      prisma.scenario.create.mockResolvedValue({ id: 'sc-neuf' });

      await service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' });

      expect(prisma.scenario.create).toHaveBeenCalledWith({
        data: { partieId: 'p1', title: campagne.name, status: 'BROUILLON' },
      });
      expect(prisma.seance.create).toHaveBeenCalledWith({
        data: { scenarioId: 'sc-neuf' },
      });
    });

    it('AC8 — cas 4 : inscrit chaque membre à chaque scénario existant', async () => {
      prisma.scenario.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      prisma.membership.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      await service.convertKind('p1', 'mj1', {
        kind: 'CAMPAGNE_EPISODIQUE',
      });

      const call = prisma.scenarioParticipant.createMany.mock.calls[0][0];
      expect(call.data).toEqual(
        expect.arrayContaining([
          { scenarioId: 's1', userId: 'u1' },
          { scenarioId: 's1', userId: 'u2' },
          { scenarioId: 's2', userId: 'u1' },
          { scenarioId: 's2', userId: 'u2' },
        ]),
      );
      expect(call.data).toHaveLength(4);
    });

    it('AC8 — le semis est idempotent : skipDuplicates, rejouer ne crée aucun doublon', async () => {
      prisma.scenario.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.membership.findMany.mockResolvedValue([{ userId: 'u1' }]);

      await service.convertKind('p1', 'mj1', { kind: 'CAMPAGNE_EPISODIQUE' });

      expect(prisma.scenarioParticipant.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });

    it('semis sans aucun membre : aucun appel createMany à vide', async () => {
      prisma.scenario.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.membership.findMany.mockResolvedValue([]);

      await service.convertKind('p1', 'mj1', { kind: 'CAMPAGNE_EPISODIQUE' });

      expect(prisma.scenarioParticipant.createMany).not.toHaveBeenCalled();
    });

    it('AC9 — effet DEMOTE_EXTRA_COURANTS : rétrograde en A_VENIR tous les COURANT sauf celui désigné', async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);
      prisma.scenario.findUnique.mockResolvedValue({
        id: 'sc-garde',
        partieId: 'p1',
        status: 'COURANT',
      });

      await service.convertKind('p1', 'mj1', {
        kind: 'CAMPAGNE_LINEAIRE',
        courantScenarioId: 'sc-garde',
      });

      expect(prisma.scenario.updateMany).toHaveBeenCalledWith({
        where: { partieId: 'p1', status: 'COURANT', id: { not: 'sc-garde' } },
        data: { status: 'A_VENIR' },
      });
    });

    it('AC9 — la rétrogradation ne touche ni séances, ni votes, ni dates (Règle A)', async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);
      prisma.scenario.findUnique.mockResolvedValue({
        id: 'sc-garde',
        partieId: 'p1',
        status: 'COURANT',
      });

      await service.convertKind('p1', 'mj1', {
        kind: 'CAMPAGNE_LINEAIRE',
        courantScenarioId: 'sc-garde',
      });

      // Seul `status` est écrit : aucune suppression de séance, aucun champ de date touché.
      expect(prisma.scenario.updateMany.mock.calls[0][0].data).toEqual({
        status: 'A_VENIR',
      });
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });

    it('requiresCourantChoice sans courantScenarioId : BadRequest, aucune écriture', async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'CAMPAGNE_LINEAIRE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectNoWrites();
    });

    it("courantScenarioId d'une AUTRE partie : BadRequest, aucune écriture", async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);
      prisma.scenario.findUnique.mockResolvedValue({
        id: 'sc-ailleurs',
        partieId: 'p-autre',
        status: 'COURANT',
      });

      await expect(
        service.convertKind('p1', 'mj1', {
          kind: 'CAMPAGNE_LINEAIRE',
          courantScenarioId: 'sc-ailleurs',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectNoWrites();
    });

    it('courantScenarioId qui n’est pas COURANT : BadRequest, aucune écriture', async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);
      prisma.scenario.findUnique.mockResolvedValue({
        id: 'sc-brouillon',
        partieId: 'p1',
        status: 'BROUILLON',
      });

      await expect(
        service.convertKind('p1', 'mj1', {
          kind: 'CAMPAGNE_LINEAIRE',
          courantScenarioId: 'sc-brouillon',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectNoWrites();
    });

    it('courantScenarioId introuvable : BadRequest, aucune écriture', async () => {
      prisma.partie.findUnique.mockResolvedValue(episodique);
      setScenarioCounts(4, 2);
      prisma.scenario.findUnique.mockResolvedValue(null);

      await expect(
        service.convertKind('p1', 'mj1', {
          kind: 'CAMPAGNE_LINEAIRE',
          courantScenarioId: 'sc-fantome',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectNoWrites();
    });

    it('AD-14 — émet partieTopic et userTopic pour le MJ et chaque membre après un succès', async () => {
      // `resolveParticipants()` lit les memberships avec `include: { user }` — forme différente du
      // `select: { userId }` utilisé par le semis de participants.
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'u1-pseudo', displayName: 'U1' } },
      ]);

      await service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' });

      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('mj1'));
      expect(realtimeEvents.emit).toHaveBeenCalledWith(userTopic('u1'));
    });

    it('une émission qui échoue ne transforme pas un commit réussi en 500 (patron close()/reopen())', async () => {
      prisma.membership.findMany.mockRejectedValue(new Error('boom'));

      await expect(
        service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).resolves.toMatchObject({ id: 'p1' });
    });

    it("renvoie un PartieDto projeté avec role: 'mj' (AD-15)", async () => {
      const dto = await service.convertKind('p1', 'mj1', { kind: 'ONE_SHOT' });
      expect(dto).toMatchObject({ id: 'p1', role: 'mj', kind: 'ONE_SHOT' });
    });
  });

  describe('update() — verrou contre le changement de type silencieux (Story 29.14, Task 4)', () => {
    beforeEach(() => {
      prisma.partie.findUnique.mockResolvedValue({
        ...partie,
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.partie.update.mockResolvedValue({
        ...partie,
        kind: 'CAMPAGNE_LINEAIRE',
      });
    });

    it('un kind DIFFÉRENT est rejeté, sans écriture — la conversion a sa propre route', async () => {
      await expect(
        service.update('p1', 'mj1', { kind: 'ONE_SHOT' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.partie.update).not.toHaveBeenCalled();
    });

    it('un kind IDENTIQUE reste accepté — le formulaire renvoie toujours les quatre champs', async () => {
      await expect(
        service.update('p1', 'mj1', {
          name: 'Nouveau nom',
          kind: 'CAMPAGNE_LINEAIRE',
        }),
      ).resolves.toBeDefined();
      expect(prisma.partie.update).toHaveBeenCalled();
    });

    it('sans kind du tout : enregistrement normal', async () => {
      await service.update('p1', 'mj1', { name: 'Nouveau nom' });
      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'Nouveau nom' },
      });
    });
  });
});

describe('GetAvailableSlotsDto', () => {
  it('accepte weeks=16 (valeur max)', async () => {
    const dto = plainToInstance(GetAvailableSlotsDto, { weeks: '16' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejette weeks=17 (dépasse le max)', async () => {
    const dto = plainToInstance(GetAvailableSlotsDto, { weeks: '17' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'weeks')).toBe(true);
  });

  it('accepte weeks absent (optionnel)', async () => {
    const dto = plainToInstance(GetAvailableSlotsDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
