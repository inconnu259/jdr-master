import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { describe, expect, it } from 'vitest';
import { CalendarMonthView, buildMonth } from './calendar-month-view';

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
  // recalcule le jour courant. Ce test vérifie que le mois précédent ne contient aucun isToday
  // parmi ses propres jours (les cellules de débordement d'un autre mois peuvent légitimement
  // inclure aujourd'hui et ne sont donc pas concernées par cette assertion).
  it('does not mark any cell as isToday in a past month', () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const display = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const weeks = buildMonth(display, [], null);
    const currentMonthCells = weeks.flat().filter((c) => c.isCurrentMonth);
    expect(currentMonthCells.every((c) => !c.isToday)).toBe(true);
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
    expect(firstWeek[2].isCurrentMonth).toBe(true); // mer 1er juillet
  });

  it('marks all current-month cells as isCurrentMonth = true', () => {
    const display = new Date(2026, 5, 1); // juin 2026
    const weeks = buildMonth(display, [], null);
    const currentMonthCells = weeks.flat().filter((c) => c.isCurrentMonth);
    expect(currentMonthCells).toHaveLength(30); // juin a 30 jours
  });
});

describe('CalendarMonthView — navigation UTC-midnight (Q8)', () => {
  function isUtcMidnight(d: Date): boolean {
    return d.getTime() % 86_400_000 === 0;
  }

  async function createMonthView() {
    await TestBed.configureTestingModule({
      imports: [CalendarMonthView],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarMonthView);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('goToToday() émet un Date UTC-midnight', async () => {
    const fixture = await createMonthView();
    const emitted: Date[] = [];
    fixture.componentInstance.displayDateChange.subscribe((d) => emitted.push(d));
    fixture.componentInstance.goToToday();
    expect(emitted).toHaveLength(1);
    expect(isUtcMidnight(emitted[0])).toBe(true);
    const today = new Date();
    expect(emitted[0].getUTCDate()).toBe(today.getUTCDate());
    expect(emitted[0].getUTCMonth()).toBe(today.getUTCMonth());
  });

  it('nextMonth() émet un Date UTC-midnight au 1er du mois suivant', async () => {
    const fixture = await createMonthView();
    const emitted: Date[] = [];
    fixture.componentInstance.displayDateChange.subscribe((d) => emitted.push(d));
    fixture.componentInstance.nextMonth();
    expect(emitted).toHaveLength(1);
    expect(isUtcMidnight(emitted[0])).toBe(true);
    expect(emitted[0].getUTCDate()).toBe(1);
  });

  it('prevMonth() émet un Date UTC-midnight au 1er du mois précédent', async () => {
    const fixture = await createMonthView();
    const emitted: Date[] = [];
    fixture.componentInstance.displayDateChange.subscribe((d) => emitted.push(d));
    fixture.componentInstance.prevMonth();
    expect(emitted).toHaveLength(1);
    expect(isUtcMidnight(emitted[0])).toBe(true);
    expect(emitted[0].getUTCDate()).toBe(1);
  });
});

describe('CalendarMonthView — accessibilité clavier des segments (touches 1/2/3)', () => {
  async function createMonthView() {
    await TestBed.configureTestingModule({
      imports: [CalendarMonthView],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarMonthView);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it("touche '1' sur la cellule du jour → sélectionne le créneau MORNING (équivalent clavier du segment matin)", async () => {
    const fixture = await createMonthView();
    const emitted: { date: Date; slot: string }[] = [];
    fixture.componentInstance.slotSelected.subscribe((e) => emitted.push(e));

    const cell = fixture.nativeElement.querySelector('.day-cell.today') as HTMLElement;
    expect(cell).toBeTruthy();
    cell.dispatchEvent(new KeyboardEvent('keyup', { key: '1' }));
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].slot).toBe('MORNING');
  });

  it("touche '2' sur la cellule du jour → sélectionne le créneau AFTERNOON", async () => {
    const fixture = await createMonthView();
    const emitted: { date: Date; slot: string }[] = [];
    fixture.componentInstance.slotSelected.subscribe((e) => emitted.push(e));

    const cell = fixture.nativeElement.querySelector('.day-cell.today') as HTMLElement;
    cell.dispatchEvent(new KeyboardEvent('keyup', { key: '2' }));
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].slot).toBe('AFTERNOON');
  });

  it("touche '3' sur la cellule du jour → sélectionne le créneau EVENING", async () => {
    const fixture = await createMonthView();
    const emitted: { date: Date; slot: string }[] = [];
    fixture.componentInstance.slotSelected.subscribe((e) => emitted.push(e));

    const cell = fixture.nativeElement.querySelector('.day-cell.today') as HTMLElement;
    cell.dispatchEvent(new KeyboardEvent('keyup', { key: '3' }));
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].slot).toBe('EVENING');
  });

  it('la cellule interactive référence les instructions clavier via aria-describedby', async () => {
    const fixture = await createMonthView();
    const cell = fixture.nativeElement.querySelector('.day-cell.today') as HTMLElement;
    expect(cell.getAttribute('aria-describedby')).toBe('month-cell-instructions');
    const instructions = fixture.nativeElement.querySelector('#month-cell-instructions');
    expect(instructions).toBeTruthy();
    expect(instructions.textContent).toContain('1');
  });
});
