import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarMonthView, buildMonth } from './calendar-month-view';

describe('buildMonth', () => {
  it('returns 6 weeks of 7 days', () => {
    const result = buildMonth(new Date(2026, 5, 1), [], [], [], null);
    expect(result).toHaveLength(6);
    result.forEach((week) => expect(week).toHaveLength(7));
  });

  it('marks today as isToday in the current month view', () => {
    const today = new Date();
    const display = new Date(today.getFullYear(), today.getMonth(), 1);
    const weeks = buildMonth(display, [], [], [], null);
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
    const weeks = buildMonth(display, [], [], [], null);
    const currentMonthCells = weeks.flat().filter((c) => c.isCurrentMonth);
    expect(currentMonthCells.every((c) => !c.isToday)).toBe(true);
  });

  it('marks cells of previous and next months as isCurrentMonth = false', () => {
    // Juin 2026 : le 1er est un lundi, donc pas de cellules d'autres mois avant.
    // Juillet 2026 : le 1er est un mercredi, donc on a lundi et mardi du mois précédent.
    const display = new Date(2026, 6, 1); // juillet 2026
    const weeks = buildMonth(display, [], [], [], null);
    const firstWeek = weeks[0];
    // Les 2 premières cellules sont en juin
    expect(firstWeek[0].isCurrentMonth).toBe(false); // lun 29 juin
    expect(firstWeek[1].isCurrentMonth).toBe(false); // mar 30 juin
    expect(firstWeek[2].isCurrentMonth).toBe(true); // mer 1er juillet
  });

  it('marks all current-month cells as isCurrentMonth = true', () => {
    const display = new Date(2026, 5, 1); // juin 2026
    const weeks = buildMonth(display, [], [], [], null);
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

describe('CalendarMonthView — accessibilité clavier des bandes (touches 1/2/3)', () => {
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

  it("touche '1' sur la cellule du jour → sélectionne le créneau MORNING (équivalent clavier de la bande matin)", async () => {
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

  // Story 36.2 : les bandes remplacent les segments comme cible de pointeur. Ces deux tests
  // protègent le mécanisme `fromBand` (ex-`fromSegment`) — ils sont transposés, pas supprimés.
  it('un tap rapide (sans glissement) sur une bande ne rejoue pas un tap FULL_DAY en double', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const tapSpy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(tapSpy);
    const band = el.querySelector('.day-cell:not(.other-month):not(.past) .band') as HTMLElement;
    const grid = el.querySelector('.calendar-grid') as HTMLElement;
    band.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    grid.dispatchEvent(pointerEvent('pointerup', 0, 0));

    // La bande gère son propre tap via (click), simulé indépendamment ici : on vérifie
    // uniquement que notre mécanisme de geste (pointerdown/up) n'émet pas lui-même de FULL_DAY.
    expect(tapSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance['selectedDays']()).toHaveLength(0);
  });

  it('un glissement parti d’une bande arme quand même une sélection de journée (le bug corrigé)', async () => {
    fixture = await createMonthView();
    el = fixture.nativeElement;
    const cells = dayCells();
    const band = cells[0].querySelector('.band') as HTMLElement;
    const grid = el.querySelector('.calendar-grid') as HTMLElement;

    band.dispatchEvent(pointerEvent('pointerdown', 0, 0));
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

// ─────────────────────────────────────────────────────────────────────────────
// Story 36.2 — la case à trois bandes et la préséance
// ─────────────────────────────────────────────────────────────────────────────

describe('CalendarMonthView — les trois bandes', () => {
  let fixture: any;
  let el: HTMLElement;

  const ALL_LAYERS = [
    'mes-indisponibilites',
    'mes-disponibilites',
    'mes-seances',
    'votes-en-cours',
    'inscriptions-ouvertes',
    'disponibilite-groupe',
  ] as any[];

  function seance(date: string, slot: string | undefined = 'EVENING') {
    return {
      key: 'seance-s1',
      type: 'mes-seances',
      date,
      label: 'Le Convoi du Nord',
      slot,
      partieId: 'p1',
      scenarioId: 'sc1',
      seanceId: 's1',
    } as any;
  }

  function vote(date: string, slot = 'MORNING') {
    return { key: 'poll-p1', type: 'votes-en-cours', date, label: 'Ashal', slot } as any;
  }

  function decl(over: Record<string, unknown> = {}) {
    return {
      id: 'd1',
      userId: 'u1',
      kind: 'AVAILABLE',
      recurKind: 'PUNCTUAL',
      dayOfWeek: null,
      slot: 'FULL_DAY',
      startDate: '2026-08-20T00:00:00.000Z',
      endDate: '2026-08-20T00:00:00.000Z',
      expiresAt: '2099-12-31T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
      ...over,
    } as any;
  }

  async function createWith(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({
      imports: [CalendarMonthView],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const f = TestBed.createComponent(CalendarMonthView);
    f.componentRef.setInput('activeLayers', ALL_LAYERS);
    f.componentRef.setInput('initialDate', new Date(2026, 7, 15));
    for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
    f.detectChanges();
    fixture = f;
    el = f.nativeElement;
    return f;
  }

  /** La case du jour donné (août 2026 affiché). */
  function cellOf(day: number): HTMLElement {
    const target = new Date(2026, 7, day).getTime();
    return el.querySelector(`.day-cell[data-cell-date="${target}"]`) as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('rend trois bandes pour un jour dont les créneaux diffèrent (AC1)', async () => {
    await createWith({ entries: [seance('2026-08-20')], declarations: [decl()] });

    expect(cellOf(20).querySelectorAll('.band')).toHaveLength(3);
  });

  it('arbitre bande par bande, jamais à la journée (AC2)', async () => {
    await createWith({ entries: [seance('2026-08-20')], declarations: [decl()] });

    const winners = Array.from(cellOf(20).querySelectorAll('.band')).map((b) =>
      b.getAttribute('data-winner'),
    );
    expect(winners).toEqual(['available', 'available', 'seance']);
  });

  it('la séance gagne sur le vote sur un même créneau (AC2)', async () => {
    await createWith({ entries: [seance('2026-08-20'), vote('2026-08-20', 'EVENING')] });

    const winners = Array.from(cellOf(20).querySelectorAll('.band')).map((b) =>
      b.getAttribute('data-winner'),
    );
    expect(winners[2]).toBe('seance');
  });

  it('un vote gagne sur une déclaration (AC2)', async () => {
    await createWith({ entries: [vote('2026-08-20', 'MORNING')], declarations: [decl()] });

    const winners = Array.from(cellOf(20).querySelectorAll('.band')).map((b) =>
      b.getAttribute('data-winner'),
    );
    expect(winners[0]).toBe('vote');
  });

  it('une séance sans créneau occupe les trois bandes (AC11 / AD-9)', async () => {
    // Entrée construite sans propriété `slot` du tout — c'est le cas réel d'une séance dont la
    // date est validée sans vote rattaché : `chosenSlot` est absent et vaut FULL_DAY.
    const sansCreneau = { ...seance('2026-08-20') };
    delete (sansCreneau as Record<string, unknown>)['slot'];
    await createWith({ entries: [sansCreneau] });

    const winners = Array.from(cellOf(20).querySelectorAll('.band')).map((b) =>
      b.getAttribute('data-winner'),
    );
    expect(winners).toEqual(['seance', 'seance', 'seance']);
  });

  it('fusionne les trois bandes sur un jour uniforme sans événement (AC4)', async () => {
    await createWith({ declarations: [decl()] });

    const bands = cellOf(20).querySelectorAll('.band');
    expect(bands).toHaveLength(1);
    expect(bands[0].classList.contains('band--uniform')).toBe(true);
  });

  it('ne fusionne pas quand un événement est posé, même sur les trois créneaux (AC4)', async () => {
    await createWith({ entries: [seance('2026-08-20', 'FULL_DAY')] });

    expect(cellOf(20).querySelectorAll('.band')).toHaveLength(3);
  });

  it('écrit le titre de la séance dans sa bande (AC5)', async () => {
    await createWith({ entries: [seance('2026-08-20')] });

    expect(cellOf(20).querySelector('.band__label')?.textContent?.trim()).toBe('Le Convoi du Nord');
  });

  it('éteindre la couche « mes séances » retire le texte mais garde le rang (AC6)', async () => {
    await createWith({
      entries: [seance('2026-08-20')],
      activeLayers: ALL_LAYERS.filter((l) => l !== 'mes-seances'),
    });

    const bands = cellOf(20).querySelectorAll('.band');
    expect(bands[2].getAttribute('data-winner')).toBe('seance');
    expect(cellOf(20).querySelector('.band__label')).toBeNull();
  });

  it('revue de code (2026-08-18) : couche « mes séances » éteinte ne laisse pas fuiter le libellé d’un vote qui couvre le même créneau', async () => {
    await createWith({
      entries: [seance('2026-08-20'), vote('2026-08-20', 'EVENING')],
      activeLayers: ALL_LAYERS.filter((l) => l !== 'mes-seances'),
    });

    const bands = cellOf(20).querySelectorAll('.band');
    // La séance gagne toujours le rang (AC6) mais son texte disparaît — la bande ne doit pas
    // afficher le titre du vote à la place, alors qu'elle reste stylée « seance ».
    expect(bands[2].getAttribute('data-winner')).toBe('seance');
    expect(cellOf(20).querySelector('.band__label')).toBeNull();
  });

  it('retire l’ancienne signalétique — pastilles et réglette de segments (AC7)', async () => {
    await createWith({ entries: [seance('2026-08-20')], declarations: [decl()] });

    expect(el.querySelector('.guild-dot')).toBeNull();
    expect(el.querySelector('.seance-dot')).toBeNull();
    expect(el.querySelector('.segment')).toBeNull();
    expect(el.querySelector('.segments')).toBeNull();
  });

  it('nomme chaque bande avec son créneau et son état en toutes lettres (AC12)', async () => {
    await createWith({ entries: [seance('2026-08-20')], declarations: [decl()] });

    const labels = Array.from(cellOf(20).querySelectorAll('.band')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels[0]).toBe('Matin : disponible');
    expect(labels[2]).toBe('Soir : Le Convoi du Nord');
  });

  it('garde un seul arrêt de tabulation par case — 42 sur la grille, pas 126 (AC12)', async () => {
    await createWith({ entries: [seance('2026-08-20')] });

    expect(el.querySelectorAll('.band[tabindex]')).toHaveLength(0);
    expect(el.querySelectorAll('.day-cell[tabindex="0"]').length).toBeLessThanOrEqual(42);
  });

  it('un tap sur une bande émet le créneau correspondant (AC9)', async () => {
    await createWith({ entries: [seance('2026-08-20')] });
    const emitted: any[] = [];
    fixture.componentInstance.slotSelected.subscribe((e: any) => emitted.push(e));

    (cellOf(20).querySelectorAll('.band')[1] as HTMLElement).click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].slot).toBe('AFTERNOON');
  });

  it('un tap sur une case fusionnée vaut la journée entière (AC4)', async () => {
    await createWith({ declarations: [decl()] });
    const emitted: any[] = [];
    fixture.componentInstance.slotSelected.subscribe((e: any) => emitted.push(e));

    (cellOf(20).querySelector('.band') as HTMLElement).click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].slot).toBe('FULL_DAY');
  });
});
