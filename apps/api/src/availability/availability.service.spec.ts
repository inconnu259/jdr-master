import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DaySlot } from '@master-jdr/shared';
import { AvailabilityService, DeclarationLike } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

function makeMockRealtimeEvents() {
  return { emit: jest.fn() } as unknown as RealtimeEventsService;
}

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
  availabilityDeclaration: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
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
  // Story bug-fix temps réel : affectedPartieIds() interroge membership/partie — vides par défaut
  // (aucun effet sur les tests existants, qui n'assertent pas sur les topics émis).
  const mockMembershipFindMany = jest.fn(
    async () => [] as { partieId: string }[],
  );
  const mockPartieFindMany = jest.fn(async () => [] as { id: string }[]);
  // AD-9 (Story 30.5) — getSeanceDerivedUnavailability() lit aussi partie.findMany (forme enrichie
  // kind/mjId/memberships) et seance.findMany : vide par défaut, sans effet sur les tests existants.
  const mockSeanceFindMany = jest.fn(() => Promise.resolve([] as object[]));
  // GET /me/calendar (AD-18, Story 30.5) — couche `votes-en-cours` : vide par défaut.
  const mockSessionPollFindMany = jest.fn(() =>
    Promise.resolve([] as object[]),
  );

  // Story 36.4 : la résolution « Remplacer » expire les déclarations en conflit À L'INTÉRIEUR de
  // la transaction du lot (create() le fait hors transaction — ce n'est pas le modèle à suivre).
  // Le client transactionnel doit donc exposer updateMany, ce qui n'était pas le cas avant.
  const tx: MockTxClient = {
    availabilityDeclaration: {
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
  };
  const mockPrisma = {
    availabilityDeclaration: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
      updateMany: mockUpdateMany,
    },
    membership: { findMany: mockMembershipFindMany },
    partie: { findMany: mockPartieFindMany },
    seance: { findMany: mockSeanceFindMany },
    sessionPoll: { findMany: mockSessionPollFindMany },
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
    mockMembershipFindMany,
    mockPartieFindMany,
    mockSeanceFindMany,
    mockSessionPollFindMany,
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
      makeMockRealtimeEvents(),
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
      makeMockRealtimeEvents(),
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
      makeMockRealtimeEvents(),
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

// ─── createBatch — écriture groupée (Story 30.2) ─────────────────────────────

/** La clause `where` du updateMany groupé du lot. `mock.calls` étant typé `any`, on caste le
 *  tuple d'appel une fois ici plutôt qu'à chaque assertion (no-unsafe-member-access). */
function updateManyWhere(mock: jest.Mock): {
  id: { in: string[] };
  userId: string;
} {
  return (
    mock.mock.calls[0] as [{ where: { id: { in: string[] }; userId: string } }]
  )[0].where;
}

describe('AvailabilityService.createBatch', () => {
  let service: AvailabilityService;
  let mockCreate: jest.Mock;
  let mockFindMany: jest.Mock;
  let mockUpdateMany: jest.Mock;
  let mockPrisma: {
    $transaction: jest.Mock;
    availabilityDeclaration: { findMany: jest.Mock };
  };
  let mockMembershipFindMany: jest.Mock;
  let mockPartieFindMany: jest.Mock;

  const item = (
    overrides: Partial<{
      kind: 'UNAVAILABLE' | 'AVAILABLE';
      recurKind: 'RECURRING' | 'PUNCTUAL';
      dayOfWeek: number | null;
      slot: DaySlot;
      startDate: string | null;
      endDate: string | null;
      expiresAt: string;
      conflictResolution: 'overwrite' | 'keep';
    }> = {},
  ) => ({
    kind: 'AVAILABLE' as const,
    recurKind: 'RECURRING' as const,
    dayOfWeek: 3,
    slot: 'EVENING' as DaySlot,
    expiresAt: FUTURE.toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    const mocks = makeMockPrisma();
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
      makeMockRealtimeEvents(),
    );
    mockCreate = mocks.mockCreate;
    mockFindMany = mocks.mockFindMany;
    mockUpdateMany = mocks.mockUpdateMany;
    mockPrisma = mocks.mockPrisma;
    mockMembershipFindMany = mocks.mockMembershipFindMany;
    mockPartieFindMany = mocks.mockPartieFindMany;
    mockFindMany.mockResolvedValue([]);
  });

  it('lot valide de N créneaux → N créations, 1 seule $transaction, 1 seul emitForUser', async () => {
    mockMembershipFindMany.mockResolvedValue([{ partieId: 'p1' }]);
    mockPartieFindMany.mockResolvedValue([]);

    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING' }),
      item({ dayOfWeek: 2, slot: 'AFTERNOON' }),
      item({ dayOfWeek: 3, slot: 'EVENING' }),
    ];
    const result = await service.createBatch(USER_ID, items);

    expect(result.created).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('AC6 : un lot de N créneaux ne provoque qu’une seule lecture findMany', async () => {
    const items = [
      item({ dayOfWeek: 1 }),
      item({ dayOfWeek: 2 }),
      item({ dayOfWeek: 3 }),
      item({ dayOfWeek: 4 }),
    ];
    await service.createBatch(USER_ID, items);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  // ⚠️ Story 36.4 — ce test CHANGE DE VÉRITÉ (il ne disparaît pas). Le lot sans résolution
  // échoue toujours et n'écrit toujours rien, mais le 409 doit désormais ÉNUMÉRER TOUS les
  // conflits : le dialogue de résolution les NOMME (AC2), il ne peut pas le faire à partir
  // d'une seule entrée.
  it('conflit externe sans résolution → 409, aucune création, le créneau fautif nommé', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3,
        slot: 'EVENING',
      }),
    ]);
    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING' }),
      item({ dayOfWeek: 3, slot: 'EVENING' }), // conflit ici, index 1
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [expect.objectContaining({ batchIndex: 1 })],
      },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('AC9 : plusieurs créneaux en conflit → le 409 les énumère TOUS, dans l’ordre du lot', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'ex-lundi',
        kind: 'UNAVAILABLE',
        dayOfWeek: 1,
        slot: 'MORNING',
      }),
      makePrismaDecl({
        id: 'ex-mercredi',
        kind: 'UNAVAILABLE',
        dayOfWeek: 3,
        slot: 'EVENING',
      }),
    ]);
    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING' }), // conflit, index 0
      item({ dayOfWeek: 2, slot: 'AFTERNOON' }), // sans conflit
      item({ dayOfWeek: 3, slot: 'EVENING' }), // conflit, index 2
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [
          expect.objectContaining({ batchIndex: 0, id: 'ex-lundi' }),
          expect.objectContaining({ batchIndex: 2, id: 'ex-mercredi' }),
        ],
      },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('AC9 : un créneau en conflit avec DEUX déclarations → les deux couples sont énumérés', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ id: 'ex-a', kind: 'UNAVAILABLE', dayOfWeek: 3 }),
      makePrismaDecl({
        id: 'ex-b',
        kind: 'UNAVAILABLE',
        dayOfWeek: 3,
        slot: 'FULL_DAY',
      }),
    ]);
    const items = [item({ dayOfWeek: 3, slot: 'EVENING' })];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [
          expect.objectContaining({ batchIndex: 0, id: 'ex-a' }),
          expect.objectContaining({ batchIndex: 0, id: 'ex-b' }),
        ],
      },
    });
  });

  it('AC4/AC8 : résolution « overwrite » → conflits expirés ET item créé, dans UNE seule transaction', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ id: 'ex-1', kind: 'UNAVAILABLE', dayOfWeek: 3 }),
    ]);
    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING' }),
      item({ dayOfWeek: 3, slot: 'EVENING', conflictResolution: 'overwrite' }),
    ];

    const result = await service.createBatch(USER_ID, items);

    expect(result.created).toHaveLength(2);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(updateManyWhere(mockUpdateMany)).toEqual({
      id: { in: ['ex-1'] },
      userId: USER_ID,
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('AC16 : « overwrite » borne toujours l’expiration à l’utilisateur de la session', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ id: 'ex-1', kind: 'UNAVAILABLE', dayOfWeek: 3 }),
    ]);
    await service.createBatch(USER_ID, [
      item({ dayOfWeek: 3, slot: 'EVENING', conflictResolution: 'overwrite' }),
    ]);

    expect(updateManyWhere(mockUpdateMany).userId).toBe(USER_ID);
  });

  it('AC8 : plusieurs « overwrite » dans le même lot → UN SEUL updateMany groupé', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'ex-1',
        kind: 'UNAVAILABLE',
        dayOfWeek: 1,
        slot: 'MORNING',
      }),
      makePrismaDecl({
        id: 'ex-2',
        kind: 'UNAVAILABLE',
        dayOfWeek: 3,
        slot: 'EVENING',
      }),
    ]);
    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING', conflictResolution: 'overwrite' }),
      item({ dayOfWeek: 3, slot: 'EVENING', conflictResolution: 'overwrite' }),
    ];

    await service.createBatch(USER_ID, items);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(updateManyWhere(mockUpdateMany).id.in).toEqual(
      expect.arrayContaining(['ex-1', 'ex-2']),
    );
  });

  it('AC6 : résolution « keep » → la découpe s’applique dans le lot, sans expirer l’existant', async () => {
    // Existant PONCTUEL le 8 juillet ; l'item couvre le 6 → 10 : la découpe doit produire
    // deux morceaux (6-7 et 9-10) autour du trou, exactement comme le chemin unitaire.
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'ex-trou',
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'EVENING',
        startDate: new Date('2026-07-08T00:00:00Z'),
        endDate: new Date('2026-07-08T00:00:00Z'),
      }),
    ]);
    const items = [
      item({
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'EVENING',
        startDate: '2026-07-06',
        endDate: '2026-07-10',
        conflictResolution: 'keep',
      }),
    ];

    const result = await service.createBatch(USER_ID, items);

    expect(result.created).toHaveLength(2);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('AC3 : résolutions MIXTES dans un même lot → chaque décision ne porte que sur son créneau', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'ex-1',
        kind: 'UNAVAILABLE',
        dayOfWeek: 1,
        slot: 'MORNING',
      }),
      makePrismaDecl({
        id: 'ex-2',
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'EVENING',
        startDate: new Date('2026-07-08T00:00:00Z'),
        endDate: new Date('2026-07-08T00:00:00Z'),
      }),
    ]);
    const items = [
      item({ dayOfWeek: 1, slot: 'MORNING', conflictResolution: 'overwrite' }),
      item({
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'EVENING',
        startDate: '2026-07-06',
        endDate: '2026-07-10',
        conflictResolution: 'keep',
      }),
    ];

    await service.createBatch(USER_ID, items);

    // Seul le conflit du créneau « overwrite » est expiré ; celui du créneau « keep » survit.
    expect(updateManyWhere(mockUpdateMany).id.in).toEqual(['ex-1']);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('AC10/AC12 : un créneau déjà déclaré peut être redéclaré en un seul appel résolu', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ id: 'ex-1', kind: 'UNAVAILABLE', dayOfWeek: 3 }),
    ]);
    const result = await service.createBatch(USER_ID, [
      item({ dayOfWeek: 3, slot: 'EVENING', conflictResolution: 'overwrite' }),
    ]);

    expect(result.created).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it('AC14 : un conflit INTERNE reste non résoluble, même si les items portent une résolution', async () => {
    const items = [
      item({
        dayOfWeek: 3,
        slot: 'FULL_DAY',
        kind: 'UNAVAILABLE',
        conflictResolution: 'overwrite',
      }),
      item({
        dayOfWeek: 3,
        slot: 'MORNING',
        kind: 'AVAILABLE',
        conflictResolution: 'overwrite',
      }),
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('un conflit INTERNE porte `internal: true` sur ses deux entrées (revue de code)', async () => {
    const items = [
      item({
        dayOfWeek: 3,
        slot: 'FULL_DAY',
        kind: 'UNAVAILABLE',
        conflictResolution: 'overwrite',
      }),
      item({
        dayOfWeek: 3,
        slot: 'MORNING',
        kind: 'AVAILABLE',
        conflictResolution: 'overwrite',
      }),
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [
          expect.objectContaining({ internal: true }),
          expect.objectContaining({ internal: true }),
        ],
      },
    });
  });

  it('un conflit EXTERNE ne porte jamais `internal: true` (revue de code)', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({ id: 'ex-1', kind: 'UNAVAILABLE', dayOfWeek: 3 }),
    ]);
    const items = [item({ dayOfWeek: 3, slot: 'EVENING' })];

    try {
      await service.createBatch(USER_ID, items);
      throw new Error('expected createBatch to reject');
    } catch (err) {
      const conflicts = (
        err as { response: { conflicts: Array<{ internal?: boolean }> } }
      ).response.conflicts;
      expect(conflicts[0].internal).toBeFalsy();
    }
  });

  // Revue de code Story 36.4 : dans le même lot, un item `overwrite` et un item `keep`
  // ciblent la MÊME déclaration persistée. Décision retenue : `overwrite` prime — la
  // déclaration sera expirée au commit, le `keep` ne doit donc PAS creuser de trou à son sujet.
  it('« overwrite » prime sur « keep » quand deux items du lot recouvrent la MÊME déclaration persistée', async () => {
    mockFindMany.mockResolvedValue([
      makePrismaDecl({
        id: 'ex-partagee',
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'FULL_DAY',
        startDate: new Date('2026-07-08T00:00:00Z'),
        endDate: new Date('2026-07-08T00:00:00Z'),
      }),
    ]);
    const items = [
      // Item A : recouvre uniquement le 8 juillet, choisit « overwrite ».
      item({
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'MORNING',
        startDate: '2026-07-08',
        endDate: '2026-07-08',
        conflictResolution: 'overwrite',
      }),
      // Item B : recouvre une plage plus large incluant le 8 juillet, choisit « keep ».
      item({
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'FULL_DAY',
        startDate: '2026-07-06',
        endDate: '2026-07-10',
        conflictResolution: 'keep',
      }),
    ];

    const result = await service.createBatch(USER_ID, items);

    // La déclaration partagée est expirée (overwrite gagne)...
    expect(updateManyWhere(mockUpdateMany).id.in).toEqual(['ex-partagee']);
    // ...et l'item « keep » n'a PAS creusé de trou à son sujet : 1 pièce pour l'item A +
    // 1 SEULE pièce continue pour l'item B (sans la correction, B produirait 2 pièces
    // séparées par un trou injustifié autour du 8 juillet → 3 au total).
    expect(result.created).toHaveLength(2);
  });

  it('conflit interne au lot (FULL_DAY vs MORNING, kinds opposés, même jour) → 409, aucune création', async () => {
    const items = [
      item({ dayOfWeek: 3, slot: 'FULL_DAY', kind: 'UNAVAILABLE' }),
      item({ dayOfWeek: 3, slot: 'MORNING', kind: 'AVAILABLE' }),
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [
          expect.objectContaining({ batchIndex: 0 }),
          expect.objectContaining({ batchIndex: 1 }),
        ],
      },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('expiresAt passé sur un élément → rejet du lot entier', async () => {
    const items = [
      item(),
      item({ expiresAt: new Date('2020-01-01').toISOString() }),
    ];
    await expect(service.createBatch(USER_ID, items)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('lot vide (appel direct hors DTO) → rejeté par une garde défensive du service', async () => {
    await expect(service.createBatch(USER_ID, [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('conflit interne au lot : les deux entrées ont des id synthétiques distincts', async () => {
    const items = [
      item({ dayOfWeek: 3, slot: 'FULL_DAY', kind: 'UNAVAILABLE' }),
      item({ dayOfWeek: 3, slot: 'MORNING', kind: 'AVAILABLE' }),
    ];

    await expect(service.createBatch(USER_ID, items)).rejects.toMatchObject({
      response: {
        conflicts: [
          expect.objectContaining({ id: 'batch-item-0' }),
          expect.objectContaining({ id: 'batch-item-1' }),
        ],
      },
    });
  });
});

// ─── Émission temps réel (bug fix : calendrier MJ jamais notifié) ────────────

describe('AvailabilityService — émission temps réel', () => {
  let service: AvailabilityService;
  let mockRealtimeEvents: RealtimeEventsService;
  let mockEmit: jest.Mock;
  let mockMembershipFindMany: jest.Mock;
  let mockPartieFindMany: jest.Mock;
  let mockFindMany: jest.Mock;
  let mockFindUnique: jest.Mock;

  const baseDto = {
    kind: 'AVAILABLE' as const,
    recurKind: 'RECURRING' as const,
    dayOfWeek: 3,
    slot: 'EVENING' as DaySlot,
    expiresAt: FUTURE.toISOString(),
  };

  beforeEach(() => {
    const mocks = makeMockPrisma();
    mockRealtimeEvents = makeMockRealtimeEvents();
    mockEmit = mockRealtimeEvents.emit as jest.Mock;
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
      mockRealtimeEvents,
    );
    mockMembershipFindMany = mocks.mockMembershipFindMany;
    mockPartieFindMany = mocks.mockPartieFindMany;
    mockFindMany = mocks.mockFindMany;
    mockFindUnique = mocks.mockFindUnique;
    // Par défaut : aucun conflit pour create().
    mockFindMany.mockResolvedValue([]);
  });

  it('create() émet partieTopic pour chaque Partie où l’utilisateur est membre ou MJ', async () => {
    mockMembershipFindMany.mockResolvedValue([
      { partieId: 'p1' },
      { partieId: 'p2' },
    ]);
    mockPartieFindMany.mockResolvedValue([{ id: 'p3' }]);

    await service.create(USER_ID, baseDto);

    expect(mockEmit).toHaveBeenCalledTimes(3);
    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
    expect(mockEmit).toHaveBeenCalledWith('partie:p2');
    expect(mockEmit).toHaveBeenCalledWith('partie:p3');
  });

  it('create() ne dédouble pas un partieId présent à la fois en membership et en Partie possédée', async () => {
    mockMembershipFindMany.mockResolvedValue([{ partieId: 'p1' }]);
    mockPartieFindMany.mockResolvedValue([{ id: 'p1' }]);

    await service.create(USER_ID, baseDto);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
  });

  it('create() sans aucune Partie associée → aucune émission', async () => {
    await service.create(USER_ID, baseDto);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('createBatch() n’émet partieTopic qu’une seule fois, quelle que soit la taille du lot (AC7)', async () => {
    mockMembershipFindMany.mockResolvedValue([
      { partieId: 'p1' },
      { partieId: 'p2' },
    ]);
    mockPartieFindMany.mockResolvedValue([]);

    const items = [
      { ...baseDto, dayOfWeek: 1, slot: 'MORNING' as DaySlot },
      { ...baseDto, dayOfWeek: 2, slot: 'AFTERNOON' as DaySlot },
      { ...baseDto, dayOfWeek: 3, slot: 'EVENING' as DaySlot },
    ];
    await service.createBatch(USER_ID, items);

    expect(mockEmit).toHaveBeenCalledTimes(2);
    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
    expect(mockEmit).toHaveBeenCalledWith('partie:p2');
  });

  it('update() émet partieTopic après la résolution complète de l’écriture', async () => {
    mockMembershipFindMany.mockResolvedValue([{ partieId: 'p1' }]);
    mockFindUnique.mockResolvedValue({ id: DECL_ID, userId: USER_ID });

    await service.update(DECL_ID, USER_ID, { kind: 'AVAILABLE' });

    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
  });

  it('softDelete() émet partieTopic', async () => {
    mockMembershipFindMany.mockResolvedValue([{ partieId: 'p1' }]);
    mockFindUnique.mockResolvedValue({ id: DECL_ID, userId: USER_ID });

    await service.softDelete(DECL_ID, USER_ID);

    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
  });

  it('splitOccurrence() émet partieTopic après la transaction', async () => {
    mockMembershipFindMany.mockResolvedValue([{ partieId: 'p1' }]);
    mockFindUnique.mockResolvedValue(
      makeRecurring({ startDate: WED1, endDate: null }),
    );

    await service.splitOccurrence(DECL_ID, USER_ID, '2026-07-01', 'delete');

    expect(mockEmit).toHaveBeenCalledWith('partie:p1');
  });
});

// ─── computeSlotStatus ────────────────────────────────────────────────────────

describe('AvailabilityService.computeSlotStatus', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService(
      {} as PrismaService,
      {} as RealtimeEventsService,
    );
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
      makeDecl({
        kind: 'AVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'MORNING',
        startDate: WED,
        endDate: WED,
      }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'AVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe(
      'UNKNOWN',
    );
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe(
      'UNKNOWN',
    );
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
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe(
      'AVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe(
      'AVAILABLE',
    );
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe(
      'AVAILABLE',
    );
  });

  it('RECURRING MORNING : inférence cross-day sur même slot → AVAILABLE', () => {
    // Jeudi n'est pas le jour de la semaine de la déclaration (mercredi=3)
    // mais le jeudi est dans la période couverte ET le slot correspond → AVAILABLE via isInCoveredPeriod
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, THU, 'MORNING', NOW)).toBe(
      'AVAILABLE',
    );
  });

  it('RECURRING MORNING : inférence cross-day bloquée sur slot différent → UNKNOWN', () => {
    // Même période couverte, mais AFTERNOON ne correspond pas au slot MORNING → pas d'inférence
    const decls = [
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' }),
    ];
    expect(service.computeSlotStatus(decls, THU, 'AFTERNOON', NOW)).toBe(
      'UNKNOWN',
    );
    expect(service.computeSlotStatus(decls, THU, 'EVENING', NOW)).toBe(
      'UNKNOWN',
    );
  });

  it('PUNCTUAL sur plage de dates : slot couvert dans la plage → AVAILABLE, hors plage → UNKNOWN', () => {
    const inRange = new Date('2026-07-07T00:00:00Z'); // dans la plage
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
    expect(service.computeSlotStatus(decls, inRange, 'MORNING', NOW)).toBe(
      'AVAILABLE',
    );
    expect(service.computeSlotStatus(decls, inRange, 'AFTERNOON', NOW)).toBe(
      'UNKNOWN',
    );
    expect(service.computeSlotStatus(decls, outRange, 'MORNING', NOW)).toBe(
      'UNKNOWN',
    );
  });
});

// ─── getActiveDeclarationsWithSeances / AD-9 (Story 30.5) ──────────────────────

describe('AvailabilityService.getActiveDeclarationsWithSeances (AD-9, Story 30.5)', () => {
  let service: AvailabilityService;
  let mockPartieFindMany: jest.Mock;
  let mockSeanceFindMany: jest.Mock;
  let mockDeclFindMany: jest.Mock;

  beforeEach(() => {
    const mocks = makeMockPrisma();
    mockPartieFindMany = mocks.mockPartieFindMany;
    mockSeanceFindMany = mocks.mockSeanceFindMany;
    mockDeclFindMany = mocks.mockFindMany;
    mockDeclFindMany.mockResolvedValue([]);
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
      makeMockRealtimeEvents(),
    );
  });

  it('renvoie un tableau vide par utilisateur quand aucune Partie n’est trouvée', async () => {
    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(map.get('u1')).toEqual([]);
  });

  it('injecte une indisponibilité UNAVAILABLE synthétique pour un membre occupé par une séance datée d’une autre Partie (ONE_SHOT)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: {
          chosenDate: new Date('2026-09-10T00:00:00Z'),
          chosenSlot: 'EVENING',
        },
        dateValidee: null,
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    const entries = map.get('u1')!;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'UNAVAILABLE',
      recurKind: 'PUNCTUAL',
      dayOfWeek: null,
      slot: 'EVENING',
    });
    expect(entries[0].startDate?.toISOString().substring(0, 10)).toBe(
      '2026-09-10',
    );
    expect(entries[0].endDate?.toISOString().substring(0, 10)).toBe(
      '2026-09-10',
    );
  });

  it('utilise dateValidee et FULL_DAY quand aucun poll n’est lié (AC5)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'CAMPAGNE_LINEAIRE',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: null,
        dateValidee: new Date('2026-09-11T00:00:00Z'),
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(map.get('u1')![0].slot).toBe('FULL_DAY');
  });

  it('utilise FULL_DAY quand le poll lié n’a pas encore de chosenSlot (AC5)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: {
          chosenDate: new Date('2026-09-16T00:00:00Z'),
          chosenSlot: null,
        },
        dateValidee: null,
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(map.get('u1')![0].slot).toBe('FULL_DAY');
  });

  it('CAMPAGNE_EPISODIQUE : seul un utilisateur inscrit à la séance est marqué occupé, pas tous les membres', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'CAMPAGNE_EPISODIQUE',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }, { userId: 'u2' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: null,
        dateValidee: new Date('2026-09-12T00:00:00Z'),
        inscriptions: [{ userId: 'u1' }],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1', 'u2']);
    expect(map.get('u1')).toHaveLength(1);
    expect(map.get('u2')).toHaveLength(0);
  });

  it('le MJ est toujours occupé par les séances de ses propres parties, y compris CAMPAGNE_EPISODIQUE sans y être inscrit', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'CAMPAGNE_EPISODIQUE',
        mjId: 'mjB',
        memberships: [],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: null,
        dateValidee: new Date('2026-09-13T00:00:00Z'),
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['mjB']);
    expect(map.get('mjB')).toHaveLength(1);
  });

  it('n’injecte rien pour une séance non datée (aucun poll.chosenDate ni dateValidee)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: null,
        dateValidee: null,
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(map.get('u1')).toEqual([]);
  });

  it('fusionne les entrées synthétiques avec les déclarations réelles existantes, sans les remplacer', async () => {
    const realDecl: DeclarationLike & { userId: string } = {
      userId: 'u1',
      kind: 'AVAILABLE',
      recurKind: 'RECURRING',
      dayOfWeek: 1,
      slot: 'MORNING',
      startDate: null,
      endDate: null,
      expiresAt: FUTURE,
    };
    mockDeclFindMany.mockResolvedValue([realDecl]);
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: {
          chosenDate: new Date('2026-09-14T00:00:00Z'),
          chosenSlot: 'AFTERNOON',
        },
        dateValidee: null,
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(map.get('u1')).toHaveLength(2);
  });

  it('la sortie ne porte jamais d’identité de partie/scénario — seulement les champs DeclarationLike (non-fuite structurelle, AC3)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        poll: {
          chosenDate: new Date('2026-09-15T00:00:00Z'),
          chosenSlot: 'MORNING',
        },
        dateValidee: null,
        inscriptions: [],
        scenario: { partieId: 'partieB' },
      },
    ]);

    const map = await service.getActiveDeclarationsWithSeances(['u1']);
    expect(Object.keys(map.get('u1')![0]).sort()).toEqual(
      [
        'dayOfWeek',
        'endDate',
        'expiresAt',
        'kind',
        'recurKind',
        'slot',
        'startDate',
      ].sort(),
    );
  });

  it('une seule requête partie.findMany et une seule seance.findMany, quel que soit le nombre d’utilisateurs (pas de N+1)', async () => {
    mockPartieFindMany.mockResolvedValue([
      {
        id: 'partieB',
        kind: 'ONE_SHOT',
        mjId: 'mjB',
        memberships: [{ userId: 'u1' }],
      },
    ]);
    mockSeanceFindMany.mockResolvedValue([]);

    await service.getActiveDeclarationsWithSeances(['u1', 'u2', 'u3']);
    expect(mockPartieFindMany).toHaveBeenCalledTimes(1);
    expect(mockSeanceFindMany).toHaveBeenCalledTimes(1);
  });
});

// ─── getMyCalendar / GET /me/calendar (AD-18, Story 30.5) ──────────────────────

describe('AvailabilityService.getMyCalendar (AD-18, Story 30.5)', () => {
  let service: AvailabilityService;
  let mockPartieFindMany: jest.Mock;
  let mockSeanceFindMany: jest.Mock;
  let mockSessionPollFindMany: jest.Mock;
  let mockDeclFindMany: jest.Mock;

  const myPartie = {
    id: 'A',
    name: 'Ma Partie',
    kind: 'ONE_SHOT',
    mjId: 'me',
  };

  beforeEach(() => {
    const mocks = makeMockPrisma();
    mockPartieFindMany = mocks.mockPartieFindMany;
    mockSeanceFindMany = mocks.mockSeanceFindMany;
    mockSessionPollFindMany = mocks.mockSessionPollFindMany;
    mockDeclFindMany = mocks.mockFindMany;
    mockDeclFindMany.mockResolvedValue([]);
    mockPartieFindMany.mockResolvedValue([myPartie]);
    service = new AvailabilityService(
      mocks.mockPrisma as unknown as PrismaService,
      makeMockRealtimeEvents(),
    );
  });

  it('renvoie les 5 couches, chacune un tableau vide par défaut (AC1, AC2)', async () => {
    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result).toEqual({
      'mes-indisponibilites': [],
      'mes-disponibilites': [],
      'mes-seances': [],
      'votes-en-cours': [],
      'inscriptions-ouvertes': [],
    });
  });

  it("ne renvoie jamais la clé 'disponibilite-groupe' (AC2, encadré n°2)", async () => {
    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(
      Object.prototype.hasOwnProperty.call(result, 'disponibilite-groupe'),
    ).toBe(false);
  });

  it('lève BadRequestException si from > to', async () => {
    await expect(
      service.getMyCalendar('me', '2026-10-31', '2026-10-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lève BadRequestException si la plage dépasse 366 jours', async () => {
    await expect(
      service.getMyCalendar('me', '2024-01-01', '2025-12-31'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mes séances portent explicitement mon identité de partie/scénario (AC4)', async () => {
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: {
          chosenDate: new Date('2026-10-10T00:00:00Z'),
          chosenSlot: 'MORNING',
        },
        dateValidee: null,
        inscriptions: [],
        inscriptionMin: null,
        inscriptionMax: null,
        scenario: { partieId: 'A', title: 'Le Donjon Oublié' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['mes-seances']).toEqual([
      {
        seanceId: 'seance1',
        partieId: 'A',
        partieName: 'Ma Partie',
        scenarioId: 'scenario1',
        scenarioTitle: 'Le Donjon Oublié',
        date: '2026-10-10',
        slot: 'MORNING',
      },
    ]);
  });

  it('créneau sans chosenSlot sur le poll rattaché → FULL_DAY (AC5)', async () => {
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: {
          chosenDate: new Date('2026-10-10T00:00:00Z'),
          chosenSlot: null,
        },
        dateValidee: null,
        inscriptions: [],
        inscriptionMin: null,
        inscriptionMax: null,
        scenario: { partieId: 'A', title: 'Le Donjon Oublié' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['mes-seances'][0].slot).toBe('FULL_DAY');
  });

  it('dateValidee sans poll lié → date lue, slot FULL_DAY (AC5)', async () => {
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: null,
        dateValidee: new Date('2026-10-11T00:00:00Z'),
        inscriptions: [],
        inscriptionMin: null,
        inscriptionMax: null,
        scenario: { partieId: 'A', title: 'Le Donjon Oublié' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['mes-seances'][0]).toMatchObject({
      date: '2026-10-11',
      slot: 'FULL_DAY',
    });
  });

  it("une séance d'une partie dont je ne suis ni MJ ni membre n'apparaît dans aucune couche (AC7)", async () => {
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seanceEtrangere',
        scenarioId: 'scenarioX',
        poll: null,
        dateValidee: new Date('2026-10-15T00:00:00Z'),
        inscriptions: [],
        inscriptionMin: 1,
        inscriptionMax: 4,
        // Partie 'Z' absente de myParties (mocké à [myPartie] seulement) — simule une ligne
        // renvoyée par erreur (défense en profondeur, la requête réelle la filtrerait déjà).
        scenario: { partieId: 'Z', title: 'Ne devrait jamais apparaître' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['mes-seances']).toEqual([]);
    expect(result['inscriptions-ouvertes']).toEqual([]);
  });

  it('couche votes-en-cours : sondage OPEN avec une option dans la plage, identité de partie incluse', async () => {
    mockSessionPollFindMany.mockResolvedValue([
      {
        id: 'poll1',
        partieId: 'A',
        options: [
          { date: new Date('2026-10-20T00:00:00Z'), slot: 'EVENING' },
          { date: new Date('2026-11-05T00:00:00Z'), slot: 'MORNING' },
        ],
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['votes-en-cours']).toEqual([
      {
        pollId: 'poll1',
        partieId: 'A',
        partieName: 'Ma Partie',
        options: [
          { date: '2026-10-20', slot: 'EVENING' },
          { date: '2026-11-05', slot: 'MORNING' },
        ],
      },
    ]);
  });

  it('couche votes-en-cours : sondage sans aucune option dans la plage est exclu', async () => {
    mockSessionPollFindMany.mockResolvedValue([
      {
        id: 'poll1',
        partieId: 'A',
        options: [{ date: new Date('2026-11-05T00:00:00Z'), slot: 'MORNING' }],
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['votes-en-cours']).toEqual([]);
  });

  it('couche inscriptions-ouvertes : séance CAMPAGNE_EPISODIQUE sans date validée et à capacité définie, non filtrée par plage', async () => {
    mockPartieFindMany.mockResolvedValue([
      { id: 'A', name: 'Ma Partie', kind: 'CAMPAGNE_EPISODIQUE', mjId: 'me' },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: null,
        dateValidee: null,
        inscriptions: [{ userId: 'me' }, { userId: 'other' }],
        inscriptionMin: 2,
        inscriptionMax: 5,
        scenario: { partieId: 'A', title: 'Enquête épisodique' },
      },
    ]);

    // Plage totalement hors du "futur" — n'a aucun effet, cette couche n'est pas filtrée par plage.
    const result = await service.getMyCalendar(
      'me',
      '2020-01-01',
      '2020-01-02',
    );
    expect(result['inscriptions-ouvertes']).toEqual([
      {
        seanceId: 'seance1',
        partieId: 'A',
        partieName: 'Ma Partie',
        scenarioTitle: 'Enquête épisodique',
        inscriptionMin: 2,
        inscriptionMax: 5,
        inscritsCount: 2,
        jeSuisInscrit: true,
      },
    ]);
  });

  it('couche inscriptions-ouvertes : une séance dont la date est déjà validée est exclue (roster figé)', async () => {
    mockPartieFindMany.mockResolvedValue([
      { id: 'A', name: 'Ma Partie', kind: 'CAMPAGNE_EPISODIQUE', mjId: 'me' },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: null,
        dateValidee: new Date('2026-10-05T00:00:00Z'),
        inscriptions: [],
        inscriptionMin: 2,
        inscriptionMax: 5,
        scenario: { partieId: 'A', title: 'Enquête épisodique' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['inscriptions-ouvertes']).toEqual([]);
  });

  it('couche inscriptions-ouvertes : une séance sans capacité définie (inscriptionMax null) est exclue', async () => {
    mockPartieFindMany.mockResolvedValue([
      { id: 'A', name: 'Ma Partie', kind: 'CAMPAGNE_EPISODIQUE', mjId: 'me' },
    ]);
    mockSeanceFindMany.mockResolvedValue([
      {
        id: 'seance1',
        scenarioId: 'scenario1',
        poll: null,
        dateValidee: null,
        inscriptions: [],
        inscriptionMin: null,
        inscriptionMax: null,
        scenario: { partieId: 'A', title: 'Enquête épisodique' },
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['inscriptions-ouvertes']).toEqual([]);
  });

  it('mes-indisponibilites/mes-disponibilites : déclarations réelles réparties par kind et filtrées par plage', async () => {
    mockDeclFindMany.mockResolvedValue([
      {
        id: 'd1',
        userId: 'me',
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'EVENING',
        startDate: new Date('2026-10-15T00:00:00Z'),
        endDate: new Date('2026-10-15T00:00:00Z'),
        expiresAt: new Date('2026-10-16T00:00:00Z'),
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 'd2',
        userId: 'me',
        kind: 'AVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: 'MORNING',
        startDate: new Date('2026-12-01T00:00:00Z'), // hors plage [10-01, 10-31]
        endDate: new Date('2026-12-01T00:00:00Z'),
        expiresAt: new Date('2026-12-02T00:00:00Z'),
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);

    const result = await service.getMyCalendar(
      'me',
      '2026-10-01',
      '2026-10-31',
    );
    expect(result['mes-indisponibilites']).toHaveLength(1);
    expect(result['mes-indisponibilites'][0].id).toBe('d1');
    expect(result['mes-disponibilites']).toEqual([]); // d2 est hors plage
  });

  it('aucune itération par partie : une seule requête pour chaque table, quel que soit le nombre de mes parties (AC1)', async () => {
    mockPartieFindMany.mockResolvedValue([
      myPartie,
      { id: 'B', name: 'Autre partie', kind: 'ONE_SHOT', mjId: 'me' },
    ]);

    await service.getMyCalendar('me', '2026-10-01', '2026-10-31');
    expect(mockSeanceFindMany).toHaveBeenCalledTimes(1);
    expect(mockSessionPollFindMany).toHaveBeenCalledTimes(1);
  });
});
