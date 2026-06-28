import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { buildMonth } from './calendar-month-view';

describe('buildMonth', () => {
  it('returns 6 weeks of 7 days', () => {
    const result = buildMonth(new Date(2026, 5, 1), [], null);
    expect(result).toHaveLength(6);
    result.forEach((week) => expect(week).toHaveLength(7));
  });

  it('marks today as isToday in the current month view', () => {
    const today = new Date();
    const display = new Date(today.getFullYear(), today.getMonth(), 1);
    const weeks = buildMonth(display, [], null);
    const allCells = weeks.flat();

    const todayMidnight = new Date(today);
    todayMidnight.setHours(0, 0, 0, 0);

    const todayCell = allCells.find((c) => {
      const cellMidnight = new Date(c.date);
      cellMidnight.setHours(0, 0, 0, 0);
      return cellMidnight.getTime() === todayMidnight.getTime();
    });

    expect(todayCell).toBeDefined();
    expect(todayCell?.isToday).toBe(true);
  });

  // AC3 : isToday ne doit PAS dépendre d'un snapshot statique — chaque appel de buildMonth
  // recalcule le jour courant. Ce test vérifie que le mois précédent ne contient aucun isToday.
  it('does not mark any cell as isToday in a past month', () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const display = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const weeks = buildMonth(display, [], null);
    const allCells = weeks.flat();
    expect(allCells.every((c) => !c.isToday)).toBe(true);
  });

  it('marks cells of previous and next months as isCurrentMonth = false', () => {
    // Juin 2026 : le 1er est un lundi, donc pas de cellules d'autres mois avant.
    // Juillet 2026 : le 1er est un mercredi, donc on a lundi et mardi du mois précédent.
    const display = new Date(2026, 6, 1); // juillet 2026
    const weeks = buildMonth(display, [], null);
    const firstWeek = weeks[0];
    // Les 2 premières cellules sont en juin
    expect(firstWeek[0].isCurrentMonth).toBe(false); // lun 29 juin
    expect(firstWeek[1].isCurrentMonth).toBe(false); // mar 30 juin
    expect(firstWeek[2].isCurrentMonth).toBe(true);  // mer 1er juillet
  });

  it('marks all current-month cells as isCurrentMonth = true', () => {
    const display = new Date(2026, 5, 1); // juin 2026
    const weeks = buildMonth(display, [], null);
    const currentMonthCells = weeks.flat().filter((c) => c.isCurrentMonth);
    expect(currentMonthCells).toHaveLength(30); // juin a 30 jours
  });
});
