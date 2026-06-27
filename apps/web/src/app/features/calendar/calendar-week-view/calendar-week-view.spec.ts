import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { AvailabilityDeclarationDto } from '@master-jdr/shared';
import { buildWeek, getWeekStart } from './calendar-week-view';

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date(2026, 5, 24); // Wed 24 Jun 2026
    const result = getWeekStart(wed);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(22);
    expect(result.getMonth()).toBe(5);
  });

  it('returns previous Monday for a Sunday', () => {
    const sun = new Date(2026, 5, 28); // Sun 28 Jun 2026
    const result = getWeekStart(sun);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(22);
    expect(result.getMonth()).toBe(5);
  });

  it('returns same day for a Monday', () => {
    const mon = new Date(2026, 5, 22); // Mon 22 Jun 2026
    const result = getWeekStart(mon);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(22);
    expect(result.getMonth()).toBe(5);
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
