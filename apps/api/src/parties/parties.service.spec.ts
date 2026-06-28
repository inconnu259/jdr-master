import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AggregatedSlotDto, AvailableSlotDto } from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from './parties.service';

describe('PartiesService', () => {
  let service: PartiesService;
  let prisma: {
    partie: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    membership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let avail: {
    getActiveDeclarations: jest.Mock;
    computeSlotStatus: jest.Mock;
  };

  const partie = {
    id: 'p1',
    name: 'La Nuit',
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      partie: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    avail = {
      getActiveDeclarations: jest.fn().mockResolvedValue(new Map()),
      computeSlotStatus: jest.fn().mockReturnValue('UNKNOWN'),
    };
    service = new PartiesService(
      prisma as unknown as PrismaService,
      avail as unknown as AvailabilityService,
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

  it('listForUser(player) renvoie les parties des memberships', async () => {
    prisma.membership.findMany.mockResolvedValue([{ partie }]);
    expect(await service.listForUser('u', 'player')).toEqual([partie]);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u' },
        include: { partie: true },
      }),
    );
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

  describe('getAvailableSlots', () => {
    const members = [
      { userId: 'u1', user: { id: 'u1', pseudo: 'Alice' } },
      { userId: 'u2', user: { id: 'u2', pseudo: 'Bob' } },
    ];

    beforeEach(() => {
      prisma.partie.findUnique.mockResolvedValue(partie); // mjId = 'mj1'
      prisma.membership.findMany.mockResolvedValue(members);
      avail.getActiveDeclarations.mockResolvedValue(
        new Map([
          ['u1', []],
          ['u2', []],
        ]),
      );
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');
    });

    it('appelle getActiveDeclarations une seule fois pour N membres (pas de N+1)', async () => {
      await service.getAvailableSlots('p1', 'mj1', 1);
      expect(avail.getActiveDeclarations).toHaveBeenCalledTimes(1);
      expect(avail.getActiveDeclarations).toHaveBeenCalledWith(['u1', 'u2']);
    });

    it('exclut un créneau si un membre est UNAVAILABLE', async () => {
      // Premier appel (u1 sur le 1er slot) = UNAVAILABLE ; tous les suivants = UNKNOWN
      avail.computeSlotStatus
        .mockReturnValueOnce('UNAVAILABLE')
        .mockReturnValue('UNKNOWN');

      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        1,
      )) as AvailableSlotDto[];
      // Aucun créneau retourné ne doit contenir un membre UNAVAILABLE
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
      avail.getActiveDeclarations.mockResolvedValue(new Map([['u1', []]]));

      await service.getAvailableSlots('p1', 'mj1', 1);
      expect(avail.getActiveDeclarations).toHaveBeenCalledWith(['u1']);
    });

    it('renvoie au plus 5 créneaux triés par date croissante', async () => {
      avail.computeSlotStatus.mockReturnValue('UNKNOWN');

      const results = (await service.getAvailableSlots(
        'p1',
        'mj1',
        8,
      )) as AvailableSlotDto[];
      expect(results.length).toBeLessThanOrEqual(5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].date >= results[i - 1].date).toBe(true);
      }
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
        status: 'UNKNOWN',
      });
    });

    it('renvoie AggregatedSlotDto[] (sans identité) pour un membre non-MJ', async () => {
      // player1 est membre mais pas MJ
      prisma.membership.findMany.mockResolvedValue([
        ...members,
        { userId: 'player1', user: { id: 'player1', pseudo: 'Charlie' } },
      ]);
      avail.getActiveDeclarations.mockResolvedValue(
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
  });
});
