import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AggregatedSlotDto, AvailableSlotDto } from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from './parties.service';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';

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
    user: {
      findUnique: jest.Mock;
    };
    scenario: {
      create: jest.Mock;
    };
    seance: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
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
    const p: any = {
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
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      scenario: {
        create: jest.fn().mockResolvedValue({ id: 'scenario1' }),
      },
      seance: {
        create: jest.fn(),
      },
    };
    // $transaction exécute le callback avec le même mock en guise de `tx`
    p.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(p));
    prisma = p;
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
    expect(prisma.seance.create).toHaveBeenCalledWith({ data: { scenarioId: 'scenario1' } });
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
      avail.getActiveDeclarations.mockResolvedValue(new Map([['u1', []]]));

      await service.getAvailableSlots('p1', 'mj1', 1);
      expect(avail.getActiveDeclarations).toHaveBeenCalledWith(['u1']);
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
        avail.getActiveDeclarations.mockResolvedValue(
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

    describe('filtrage from/to', () => {
      beforeEach(() => {
        prisma.partie.findUnique.mockResolvedValue(partie);
        prisma.membership.findMany.mockResolvedValue(members);
        avail.getActiveDeclarations.mockResolvedValue(
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
        expect(avail.getActiveDeclarations).toHaveBeenCalledTimes(1);
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
