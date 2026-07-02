import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { AvailabilityDeclarationDto } from '@master-jdr/shared';
import { buildWeek, getWeekStart } from './calendar-week-view';

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date(Date.UTC(2026, 5, 24)); // Wed 24 Jun 2026 UTC
    const result = getWeekStart(wed);
    expect(result.getUTCDay()).toBe(1); // Monday UTC
    expect(result.getUTCDate()).toBe(22);
    expect(result.getUTCMonth()).toBe(5);
  });

  it('returns previous Monday for a Sunday', () => {
    const sun = new Date(Date.UTC(2026, 5, 28)); // Sun 28 Jun 2026 UTC
    const result = getWeekStart(sun);
    expect(result.getUTCDay()).toBe(1); // Monday UTC
    expect(result.getUTCDate()).toBe(22);
    expect(result.getUTCMonth()).toBe(5);
  });

  it('returns same day for a Monday', () => {
    const mon = new Date(Date.UTC(2026, 5, 22)); // Mon 22 Jun 2026 UTC
    const result = getWeekStart(mon);
    expect(result.getUTCDay()).toBe(1);
    expect(result.getUTCDate()).toBe(22);
    expect(result.getUTCMonth()).toBe(5);
  });

  // AC2 : un instant UTC qui est lundi 4h (= dimanche 23h UTC-5) → semaine commence lundi
  it('returns Monday UTC for a date that is Monday 4am UTC (Sunday 11pm in UTC-5)', () => {
    const mondayEarlyUtc = new Date(Date.UTC(2026, 5, 29, 4, 0, 0)); // Mon Jun 29 04:00 UTC
    const result = getWeekStart(mondayEarlyUtc);
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.getUTCDate()).toBe(29);
    expect(result.getUTCMonth()).toBe(5);
    expect(result.getUTCHours()).toBe(0); // UTC midnight
  });
});

describe('buildWeek', () => {
  const emptyDecls: AvailabilityDeclarationDto[] = [];

  it('returns 7 cells', () => {
    const weekStart = getWeekStart(new Date(2026, 5, 22));
    const cells = buildWeek(weekStart, emptyDecls, null);
    expect(cells).toHaveLength(7);
  });

  it('marks today as isToday', () => {
    const today = new Date();
    const weekStart = getWeekStart(today);
    const cells = buildWeek(weekStart, emptyDecls, null);

    const todayCell = cells.find((c) => {
      const midnight = new Date(c.date);
      midnight.setHours(0, 0, 0, 0);
      const todayMidnight = new Date(today);
      todayMidnight.setHours(0, 0, 0, 0);
      return midnight.getTime() === todayMidnight.getTime();
    });

    expect(todayCell).toBeDefined();
    expect(todayCell?.isToday).toBe(true);
  });

  it('marks past days as isPast', () => {
    // Week starting 2 weeks ago — all cells should be past
    const pastWeekStart = new Date();
    pastWeekStart.setDate(pastWeekStart.getDate() - 14);
    const weekStart = getWeekStart(pastWeekStart);
    const cells = buildWeek(weekStart, emptyDecls, null);
    expect(cells.every((c) => c.isPast)).toBe(true);
  });

  it('does not mark future days as isPast', () => {
    // Week starting next week — no cells should be past
    const futureWeekStart = new Date();
    futureWeekStart.setDate(futureWeekStart.getDate() + 7);
    const weekStart = getWeekStart(futureWeekStart);
    const cells = buildWeek(weekStart, emptyDecls, null);
    expect(cells.every((c) => !c.isPast)).toBe(true);
  });
});

// AC1 : findWeekDecl doit respecter endDate pour les RECURRING (correctif modèle SPLIT)
describe('buildWeek - findWeekDecl avec endDate (AC1)', () => {
  const BASE_DECL: Pick<AvailabilityDeclarationDto, 'id' | 'userId' | 'createdAt' | 'expiresAt'> = {
    id: 'test-recurring',
    userId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-12-31T23:59:59.000Z',
  };

  // Semaine du lundi 22 juin 2026 (UTC)
  const weekStart = new Date(Date.UTC(2026, 5, 22));

  it('renvoie null declLabel pour une déclaration RECURRING dont endDate est dépassé', () => {
    const decl: AvailabilityDeclarationDto = {
      ...BASE_DECL,
      kind: 'UNAVAILABLE',
      recurKind: 'RECURRING',
      dayOfWeek: 1, // lundi
      slot: 'MORNING',
      startDate: null,
      endDate: '2026-06-21', // veille du lundi → la série est terminée
    };
    const cells = buildWeek(weekStart, [decl], null);
    const monday = cells[0]; // index 0 = lundi
    expect(monday.morning.declLabel).toBeNull();
  });

  it("renvoie le declLabel pour une déclaration RECURRING dont endDate est exactement aujourd'hui", () => {
    const decl: AvailabilityDeclarationDto = {
      ...BASE_DECL,
      kind: 'UNAVAILABLE',
      recurKind: 'RECURRING',
      dayOfWeek: 1, // lundi
      slot: 'MORNING',
      startDate: null,
      endDate: '2026-06-22', // exactement le jour de la cellule → encore valide
    };
    const cells = buildWeek(weekStart, [decl], null);
    const monday = cells[0];
    expect(monday.morning.declLabel).not.toBeNull();
    expect(monday.morning.declLabel).toContain('Récurrent');
  });

  it('renvoie le declLabel pour une déclaration RECURRING sans endDate', () => {
    const decl: AvailabilityDeclarationDto = {
      ...BASE_DECL,
      kind: 'AVAILABLE',
      recurKind: 'RECURRING',
      dayOfWeek: 3, // mercredi
      slot: 'AFTERNOON',
      startDate: null,
      endDate: null,
    };
    const cells = buildWeek(weekStart, [decl], null);
    const wednesday = cells[2]; // index 2 = mercredi
    expect(wednesday.afternoon.declLabel).not.toBeNull();
  });
});
