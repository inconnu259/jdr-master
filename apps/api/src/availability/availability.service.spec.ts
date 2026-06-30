import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DaySlot } from '@master-jdr/shared';
import { AvailabilityService, DeclarationLike } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';

// Dates de référence (UTC) :
// June 24, 2026 = mercredi (getUTCDay() = 3)
// July 1, 2026  = mercredi (getUTCDay() = 3)
// July 8, 2026  = mercredi (getUTCDay() = 3)
// July 15, 2026 = mercredi (getUTCDay() = 3)
// July 2, 2026  = jeudi    (getUTCDay() = 4)
const NOW = new Date('2026-06-30T12:00:00Z');
const WED1 = new Date('2026-06-24T00:00:00Z'); // premier mercredi
const WED2 = new Date('2026-07-01T00:00:00Z'); // deuxième mercredi
const WED3 = new Date('2026-07-08T00:00:00Z'); // troisième mercredi
const THU = new Date('2026-07-02T00:00:00Z'); // jeudi UTC
const FAR = new Date('2027-01-01T00:00:00Z'); // date d'expiration lointaine
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

// Alias rétrocompatibilité
const WED = WED2;

function makeDecl(overrides: Partial<DeclarationLike>): DeclarationLike {
  return {
    kind: 'UNAVAILABLE',
    recurKind: 'RECURRING',
    dayOfWeek: 3, // mercredi
    slot: 'EVENING',
    startDate: null,
    endDate: null,
    expiresAt: FAR,
    ...overrides,
  };
}

// ─── splitOccurrence ──────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const DECL_ID = 'decl-1';

function makeRecurring(
  overrides: {
    startDate?: Date | null;
    endDate?: Date | null;
    expiresAt?: Date;
    kind?: 'UNAVAILABLE' | 'AVAILABLE';
  } = {},
) {
  return {
    id: DECL_ID,
    userId: USER_ID,
    kind: 'UNAVAILABLE' as const,
    recurKind: 'RECURRING' as const,
    dayOfWeek: 3,
    slot: 'EVENING' as DaySlot,
    startDate: WED1,
    endDate: null as Date | null,
    expiresAt: FAR,
    createdAt: new Date(),
    ...overrides,
  };
}

type MockTxClient = {
  availabilityDeclaration: { create: jest.Mock; update: jest.Mock };
};

function makeMockPrisma() {
  const mockCreate = jest.fn(async ({ data }: { data: object }) => ({
    id: 'new-' + Math.random(),
    ...data,
  }));
  const mockUpdate = jest.fn(async () => ({}));
  const mockUpdateMany = jest.fn(async () => ({ count: 0 }));
  const mockFindUnique = jest.fn();
  const mockFindMany = jest.fn(async () => [] as object[]);

  const tx: MockTxClient = {
    availabilityDeclaration: { create: mockCreate, update: mockUpdate },
  };
  const mockPrisma = {
    availabilityDeclaration: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
      updateMany: mockUpdateMany,
    },
    $transaction: jest.fn(async (fn: (tx: MockTxClient) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  return {
    mockPrisma,
    mockCreate,
    mockUpdate,
    mockUpdateMany,
    mockFindUnique,
    mockFindMany,
  };
}

describe('AvailabilityService.splitOccurrence', () => {
  let service: AvailabilityService;
  let mockCreate: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockFindUnique: jest.Mock;

  beforeEach(() => {
    const mocks = makeMockPrisma();
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
    );
    mockCreate = mocks.mockCreate;
    mockUpdate = mocks.mockUpdate;
    mockFindUnique = mocks.mockFindUnique;
  });

  it('normal split : crée R1, Rmod, R2 et soft-delete R', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecurring({ startDate: WED1, endDate: null }),
    );
    const { created, deleted } = await service.splitOccurrence(
      DECL_ID,
      USER_ID,
      '2026-07-01',
      'delete',
    );
    expect(deleted).toEqual([DECL_ID]);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const [r1, rmod, r2] = calls.map((c) => c[0].data);
    expect(r1.recurKind).toBe('RECURRING');
    expect(r1.endDate).toEqual(new Date('2026-06-24T00:00:00Z'));
    expect(rmod.recurKind).toBe('PUNCTUAL');
    expect(rmod.startDate).toEqual(new Date('2026-07-01T00:00:00Z'));
    expect(rmod.kind).toBe('AVAILABLE');
    expect(r2.recurKind).toBe('RECURRING');
    expect(r2.startDate).toEqual(new Date('2026-07-08T00:00:00Z'));
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: DECL_ID },
      data: expect.objectContaining({ expiresAt: expect.any(Date) }),
    });
    expect(created).toHaveLength(3);
  });

  it('left-edge (D == startDate) : pas de R1, seulement Rmod + R2', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecurring({ startDate: WED2, endDate: null }),
    );
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const [rmod, r2] = calls.map((c) => c[0].data);
    expect(rmod.recurKind).toBe('PUNCTUAL');
    expect(r2.recurKind).toBe('RECURRING');
    expect(r2.startDate).toEqual(WED3);
  });

  it('right-edge (dPlus7 > expiresAt) : seulement R1 + Rmod, pas de R2', async () => {
    const expiresAfterWed2ButBeforeWed3 = new Date('2026-07-05T23:59:59Z');
    mockFindUnique.mockResolvedValue(
      makeRecurring({
        startDate: WED1,
        endDate: null,
        expiresAt: expiresAfterWed2ButBeforeWed3,
      }),
    );
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const [r1, rmod] = calls.map((c) => c[0].data);
    expect(r1.recurKind).toBe('RECURRING');
    expect(rmod.recurKind).toBe('PUNCTUAL');
  });

  it('occurrence unique (startDate == endDate == D) : seulement Rmod remplace R', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecurring({ startDate: WED2, endDate: WED2 }),
    );
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const [rmod] = calls.map((c) => c[0].data);
    expect(rmod.recurKind).toBe('PUNCTUAL');
  });

  it('action delete : Rmod a le kind opposé (UNAVAILABLE → AVAILABLE)', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecurring({ kind: 'UNAVAILABLE', startDate: WED1 }),
    );
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const rmodCall = calls.find((c) => c[0].data.recurKind === 'PUNCTUAL');
    expect(rmodCall![0].data.kind).toBe('AVAILABLE');
  });

  it('action delete : Rmod a le kind opposé (AVAILABLE → UNAVAILABLE)', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecurring({ kind: 'AVAILABLE', startDate: WED1 }),
    );
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const rmodCall = calls.find((c) => c[0].data.recurKind === 'PUNCTUAL');
    expect(rmodCall![0].data.kind).toBe('UNAVAILABLE');
  });

  it('action modify : Rmod utilise les valeurs dto', async () => {
    mockFindUnique.mockResolvedValue(makeRecurring({ startDate: WED1 }));
    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'modify', {
      kind: 'AVAILABLE',
      slot: 'MORNING',
    });
    const calls = mockCreate.mock.calls as [
      { data: Record<string, unknown> },
    ][];
    const rmodCall = calls.find((c) => c[0].data.recurKind === 'PUNCTUAL');
    expect(rmodCall![0].data.kind).toBe('AVAILABLE');
    expect(rmodCall![0].data.slot).toBe('MORNING');
  });

  it('400 si la date ne correspond pas au dayOfWeek de la déclaration', async () => {
    mockFindUnique.mockResolvedValue(makeRecurring());
    await expect(
      service.splitOccurrence(DECL_ID, USER_ID, '2026-07-02', 'delete'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 si action=modify sans dto', async () => {
    mockFindUnique.mockResolvedValue(makeRecurring({ startDate: WED1 }));
    await expect(
      service.splitOccurrence(
        DECL_ID,
        USER_ID,
        '2026-07-01',
        'modify',
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403 si userId ne correspond pas', async () => {
    mockFindUnique.mockResolvedValue(makeRecurring());
    await expect(
      service.splitOccurrence(DECL_ID, 'wrong-user', '2026-07-01', 'delete'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 si déclaration introuvable', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      service.splitOccurrence('unknown-id', USER_ID, '2026-07-01', 'delete'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── findConflictsForCreate ────────────────────────────────────────────────────

function makePrismaDecl(
  overrides: Partial<{
    id: string;
    userId: string;
    kind: 'UNAVAILABLE' | 'AVAILABLE';
    recurKind: 'RECURRING' | 'PUNCTUAL';
    dayOfWeek: number | null;
    slot: DaySlot;
    startDate: Date | null;
    endDate: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }> = {},
) {
  return {
    id: 'existing-1',
    userId: USER_ID,
    kind: 'AVAILABLE' as const,
    recurKind: 'RECURRING' as const,
    dayOfWeek: 3,
    slot: 'EVENING' as DaySlot,
    startDate: null as Date | null,
    endDate: null as Date | null,
    expiresAt: FUTURE,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AvailabilityService.findConflictsForCreate', () => {
  let service: AvailabilityService;
  let mockFindMany: jest.Mock;

  beforeEach(() => {
    const mocks = makeMockPrisma();
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
    );
    mockFindMany = mocks.mockFindMany;
  });

  it('même kind → pas de conflit', async () => {
    mockFindMany.mockResolvedValue([makePrismaDecl({ kind: 'UNAVAILABLE' })]);
    const dto = {
      kind: 'UNAVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(0);
  });

  it('slot différent (MORNING vs EVENING) → pas de conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ kind: 'UNAVAILABLE', slot: 'MORNING' }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(0);
  });

  it('FULL_DAY vs EVENING → conflit (FULL_DAY couvre tous les slots)', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ kind: 'UNAVAILABLE', slot: 'FULL_DAY' }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(1);
  });

  it('RECURRING vs RECURRING même dayOfWeek → conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3,
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(1);
  });

  it('RECURRING vs RECURRING dayOfWeek différent → pas de conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 4,
      }),
    ]); // jeudi
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(0);
  });

  it('nouveau RECURRING vs PUNCTUAL : le mercredi est dans la plage PUNCTUAL → conflit', async () => {
    // PUNCTUAL couvrant WED1–WED3 (24 Jun – 8 Jul)
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: WED1,
        endDate: WED3,
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      startDate: '2026-06-01',
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(1);
  });

  it('nouveau RECURRING vs PUNCTUAL : aucun mercredi dans la plage → pas de conflit', async () => {
    // PUNCTUAL jeu–ven uniquement
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: new Date('2026-07-02T00:00:00Z'),
        endDate: new Date('2026-07-03T00:00:00Z'),
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(0);
  });

  it('nouveau PUNCTUAL vs RECURRING : couvre un mercredi → conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3,
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'PUNCTUAL' as const,
      slot: 'EVENING' as DaySlot,
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      expiresAt: '2026-07-07T23:59:59Z',
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(1);
  });

  it('nouveau PUNCTUAL vs PUNCTUAL chevauchants → conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-10T00:00:00Z'),
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'PUNCTUAL' as const,
      slot: 'EVENING' as DaySlot,
      startDate: '2026-07-05',
      endDate: '2026-07-15',
      expiresAt: '2026-07-15T23:59:59Z',
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(1);
  });

  it('nouveau PUNCTUAL vs PUNCTUAL sans chevauchement → pas de conflit', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-05T00:00:00Z'),
      }),
    ]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'PUNCTUAL' as const,
      slot: 'EVENING' as DaySlot,
      startDate: '2026-07-10',
      endDate: '2026-07-15',
      expiresAt: '2026-07-15T23:59:59Z',
    };
    expect(await service.findConflictsForCreate(USER_ID, dto)).toHaveLength(0);
  });

  it('excludeId → passe la clause NOT à Prisma', async () => {
    mockFindMany.mockResolvedValue([]);
    const dto = {
      kind: 'AVAILABLE' as const,
      recurKind: 'RECURRING' as const,
      dayOfWeek: 3,
      slot: 'EVENING' as DaySlot,
      expiresAt: FUTURE.toISOString(),
    };
    await service.findConflictsForCreate(USER_ID, dto, 'skip-me');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { id: 'skip-me' } }),
      }),
    );
  });
});

// ─── create — gestion des conflits ───────────────────────────────────────────

describe('AvailabilityService.create — conflict detection', () => {
  let service: AvailabilityService;
  let mockCreate: jest.Mock;
  let mockUpdateMany: jest.Mock;
  let mockFindMany: jest.Mock;

  const baseDto = {
    kind: 'AVAILABLE' as const,
    recurKind: 'RECURRING' as const,
    dayOfWeek: 3,
    slot: 'EVENING' as DaySlot,
    expiresAt: FUTURE.toISOString(),
  };

  beforeEach(() => {
    const mocks = makeMockPrisma();
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
    );
    mockCreate = mocks.mockCreate;
    mockUpdateMany = mocks.mockUpdateMany;
    mockFindMany = mocks.mockFindMany;
  });

  it('sans conflit → retourne { created: [declaration] }', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = (await service.create(USER_ID, baseDto)) as {
      created: unknown[];
    };
    expect(result).toHaveProperty('created');
    expect(result.created).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('conflit sans conflictResolution → lance ConflictException', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3,
      }),
    ]);
    await expect(service.create(USER_ID, baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('conflictResolution=overwrite → soft-delete les conflits puis crée', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'conflict-1',
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3,
      }),
    ]);
    await service.create(USER_ID, {
      ...baseDto,
      conflictResolution: 'overwrite',
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['conflict-1'] } }),
      }),
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('conflictResolution=keep + RECURRING new + PUNCTUAL conflit → crée des pièces', async () => {
    // Conflit PUNCTUAL sur WED2 (Jul 1)
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'conflict-1',
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: WED2,
        endDate: WED2,
      }),
    ]);
    const result = (await service.create(USER_ID, {
      ...baseDto,
      startDate: '2026-06-24',
      conflictResolution: 'keep',
    })) as { created: unknown[] };
    expect(result.created.length).toBeGreaterThanOrEqual(1);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── computeSlotStatus ────────────────────────────────────────────────────────

describe('AvailabilityService.computeSlotStatus', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService({} as PrismaService);
  });

  it('déclaration UNAVAILABLE sur le bon créneau → UNAVAILABLE', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe(
      'UNAVAILABLE',
    );
  });

  it('déclaration AVAILABLE explicite sur le bon créneau → AVAILABLE', () => {
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'AVAILABLE',
    );
  });

  it('UNAVAILABLE prime sur AVAILABLE sur le même créneau', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe(
      'UNAVAILABLE',
    );
  });

  it('date dans la période couverte, slot non couvert → UNKNOWN', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'UNKNOWN',
    );
  });

  it('date hors de la période couverte, pas de déclaration → UNKNOWN', () => {
    const decls = [
      makeDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: new Date('2026-07-05'),
        endDate: new Date('2026-07-10'),
      }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'UNKNOWN',
    );
  });

  it('déclaration expirée ignorée → UNKNOWN', () => {
    const expired = makeDecl({ expiresAt: new Date('2026-01-01') });
    expect(service.computeSlotStatus([expired], WED, 'EVENING', NOW)).toBe(
      'UNKNOWN',
    );
  });

  it('déclaration RECURRING : ne correspond pas à un autre jour de la semaine', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
    ];
    expect(service.computeSlotStatus(decls, THU, 'EVENING', NOW)).toBe(
      'AVAILABLE',
    );
  });

  it('déclaration FULL_DAY UNAVAILABLE couvre tous les slots', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'FULL_DAY' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'UNAVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe(
      'UNAVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe(
      'UNAVAILABLE',
    );
  });

  it('déclaration MORNING AVAILABLE ne doit pas rendre AFTERNOON AVAILABLE (régression bug FULL_DAY→MORNING)', () => {
    const decls = [
      makeDecl({ kind: 'AVAILABLE', recurKind: 'PUNCTUAL', dayOfWeek: null, slot: 'MORNING', startDate: WED, endDate: WED }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('AVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe('UNKNOWN');
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe('UNKNOWN');
  });

  it('déclaration MORNING UNAVAILABLE ne couvre pas AFTERNOON → UNKNOWN', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'UNAVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe(
      'UNKNOWN',
    );
  });

  it('déclaration FULL_DAY AVAILABLE couvre tous les slots', () => {
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'FULL_DAY' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('AVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe('AVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe('AVAILABLE');
  });

  it('RECURRING MORNING : inférence cross-day sur même slot → AVAILABLE', () => {
    // Jeudi n'est pas le jour de la semaine de la déclaration (mercredi=3)
    // mais le jeudi est dans la période couverte ET le slot correspond → AVAILABLE via isInCoveredPeriod
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, THU, 'MORNING', NOW)).toBe('AVAILABLE');
  });

  it('RECURRING MORNING : inférence cross-day bloquée sur slot différent → UNKNOWN', () => {
    // Même période couverte, mais AFTERNOON ne correspond pas au slot MORNING → pas d'inférence
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, THU, 'AFTERNOON', NOW)).toBe('UNKNOWN');
    expect(service.computeSlotStatus(decls, THU, 'EVENING', NOW)).toBe('UNKNOWN');
  });

  it('PUNCTUAL sur plage de dates : slot couvert dans la plage → AVAILABLE, hors plage → UNKNOWN', () => {
    const inRange  = new Date('2026-07-07T00:00:00Z'); // dans la plage
    const outRange = new Date('2026-07-11T00:00:00Z'); // hors plage
    const decls = [
      makeDecl({
        kind: 'AVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'MORNING',
        startDate: new Date('2026-07-05T00:00:00Z'),
        endDate: new Date('2026-07-10T00:00:00Z'),
      }),
    ];
    expect(service.computeSlotStatus(decls, inRange,  'MORNING',   NOW)).toBe('AVAILABLE');
    expect(service.computeSlotStatus(decls, inRange,  'AFTERNOON', NOW)).toBe('UNKNOWN');
    expect(service.computeSlotStatus(decls, outRange, 'MORNING',   NOW)).toBe('UNKNOWN');
  });
});
