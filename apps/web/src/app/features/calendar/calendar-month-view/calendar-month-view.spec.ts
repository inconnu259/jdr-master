import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// ─── Sélection par glissement (Story 30.3) ────────────────────────────────────

describe('CalendarMonthView — sélection par glissement', () => {
  let fixture: Awaited<ReturnType<typeof createMonthView>>;
  let el: HTMLElement;

  async function createMonthView() {
    await TestBed.configureTestingModule({
      imports: [CalendarMonthView],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const f = TestBed.createComponent(CalendarMonthView);
    f.detectChanges();
    return f;
  }

  function dayCells(): HTMLElement[] {
    return Array.from(el.querySelectorAll('.day-cell:not(.other-month):not(.past)'));
  }

  function allDayCells(): HTMLElement[] {
    return Array.from(el.querySelectorAll('.day-cell'));
  }

  function pointerEvent(type: string, x: number, y: number, pointerType = 'mouse'): PointerEvent {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true });
  }

  beforeEach(() => {
    // 10 août 2026 — milieu de mois, marge suffisante avant/après pour tester un glissement
    // sans dépendre du jour réel d'exécution des tests.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10));
  });

  afterEach(async () => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('tap sans déplacement ouvre toujours le panneau (AC3, AC9)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const spy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(spy);
    const cell = dayCells()[0];
    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    const grid = el.querySelector('.calendar-grid') as HTMLElement;
    grid.dispatchEvent(pointerEvent('pointerup', 10, 10));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('glissement souris sur plusieurs jours → sélectionne la plage à la journée entière (AC2)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const tapSpy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(tapSpy);
    const cells = dayCells();
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    cells[0].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[2]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedDays']()).toHaveLength(3);
    expect(tapSpy).not.toHaveBeenCalled();
  });

  it('un tap rapide (sans glissement) sur un segment ne rejoue pas un tap FULL_DAY en double', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const tapSpy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(tapSpy);
    const segment = el.querySelector(
      '.day-cell:not(.other-month):not(.past) .segment',
    ) as HTMLElement;
    const grid = el.querySelector('.calendar-grid') as HTMLElement;
    segment.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    grid.dispatchEvent(pointerEvent('pointerup', 0, 0));

    // Le segment gère son propre tap via (click), simulé indépendamment ici : on vérifie
    // uniquement que notre mécanisme de geste (pointerdown/up) n'émet pas lui-même de FULL_DAY.
    expect(tapSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(0);
  });

  it('un glissement parti d’un segment arme quand même une sélection de journée (le bug corrigé)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const cells = dayCells();
    const segment = cells[0].querySelector('.segment') as HTMLElement;
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    segment.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[2]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedDays']()).toHaveLength(3);
  });

  it('Échap efface la sélection sans émettre de lot', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = dayCells();
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    cells[0].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[2]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(3);

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedDays']()).toHaveLength(0);
    expect(batchSpy).not.toHaveBeenCalled();
  });

  it('validation via la barre de sélection émet batchDeclareRequested en FULL_DAY', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = dayCells();
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    cells[0].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[1]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();
    grid.dispatchEvent(pointerEvent('pointerup', 50, 0));
    fixture.detectChanges();

    const availableBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Disponible',
    )!;
    availableBtn.click();

    expect(batchSpy).toHaveBeenCalledTimes(1);
    const payload = batchSpy.mock.calls[0][0];
    expect(payload.kind).toBe('AVAILABLE');
    expect(payload.cells).toHaveLength(2);
    expect(payload.cells.every((c: { slot: string }) => c.slot === 'FULL_DAY')).toBe(true);
  });

  it('Maj+flèche droite étend la sélection à la journée entière (AC5)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const cells = dayCells();
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });

    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(2);

    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(3);
  });

  it('Entrée valide la sélection clavier avec Indisponible par défaut (AC5)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = dayCells();
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });

    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();
    cells[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(batchSpy).toHaveBeenCalledTimes(1);
    const payload = batchSpy.mock.calls[0][0];
    expect(payload.kind).toBe('UNAVAILABLE');
    expect(payload.cells).toHaveLength(2);
  });

  it('Entrée sans sélection active ouvre le panneau normalement (tap inchangé)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const spy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(spy);
    const cell = dayCells()[0];

    cell.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('le glissement ne s’étend pas sur un jour hors du mois affiché (review finding)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const all = allDayCells();
    const currentMonthCells = dayCells();
    const lastCurrent = currentMonthCells[currentMonthCells.length - 1];
    const lastCurrentIndex = all.indexOf(lastCurrent);
    const otherMonthCell = all[lastCurrentIndex + 1];
    expect(otherMonthCell.classList.contains('other-month')).toBe(true);
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    lastCurrent.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(otherMonthCell);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedDays']()).toHaveLength(1);
  });

  it('Maj+flèche droite ne s’étend pas sur un jour hors du mois affiché (review finding)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const currentMonthCells = dayCells();
    const lastCurrent = currentMonthCells[currentMonthCells.length - 1];
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });

    lastCurrent.dispatchEvent(shiftRight);
    fixture.detectChanges();

    // Aucune extension possible depuis ce jour (limite du mois) : l'ancre est posée mais la
    // cellule courante n'avance jamais vers le mois suivant, la sélection reste vide.
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(0);
  });
});
