import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityDeclarationDto, CalendarLayerKey } from '@master-jdr/shared';
import type { AgendaEntry } from '../calendar-agenda-view/calendar-agenda-view';
import { CalendarWeekView, buildWeek, getWeekStart } from './calendar-week-view';
import { LONG_PRESS_MS } from '../selection.utils';

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

// ─── Sélection par glissement (Story 30.3) ────────────────────────────────────

describe('CalendarWeekView — sélection par glissement', () => {
  let fixture: ComponentFixture<CalendarWeekView>;
  let el: HTMLElement;

  // Semaine future pour éviter que les cellules soient marquées isPast.
  const futureStart = new Date();
  futureStart.setDate(futureStart.getDate() + 14);

  function create(): void {
    fixture = TestBed.createComponent(CalendarWeekView);
    fixture.componentRef.setInput('startDate', futureStart);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  // Les 7 cellules d'une ligne partagent le même sélecteur data-cell-slot ; on les récupère toutes
  // puis on indexe par jour (ordre du DOM == ordre des jours de buildWeek).
  function slotCells(slot: 'MORNING' | 'AFTERNOON' | 'EVENING'): HTMLElement[] {
    return Array.from(el.querySelectorAll(`.slot-cell[data-cell-slot="${slot}"]`));
  }

  function pointerEvent(type: string, x: number, y: number, pointerType = 'mouse'): PointerEvent {
    return new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CalendarWeekView] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ⚠️ Story 36.3, AC15 — un tap COURT est un geste de lecture : le rail suit (AC2 de 36.1) et
  // rien ne s'ouvre. Ni le panneau (AC1), ni la barre.
  it('AC15 — un tap court ne fait que peupler le rail : aucune barre, aucune sélection', () => {
    create();
    const spy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(spy);
    const cell = slotCells('EVENING')[0];
    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    const grid = el.querySelector('.week-grid') as HTMLElement;
    grid.dispatchEvent(pointerEvent('pointerup', 10, 10));
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
    expect(el.querySelector('app-selection-bar')).toBeNull();
  });

  it('AC15 — un appui maintenu à la SOURIS arme la sélection et affiche la barre', () => {
    vi.useFakeTimers();
    create();
    const cell = slotCells('EVENING')[0];

    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(1);
    expect(fixture.componentInstance['scope']()).toBe('EVENING');
    expect(el.querySelector('app-selection-bar')).not.toBeNull();
  });

  it('AC18 — en mode modification, le clic bascule N’IMPORTE QUELLE ligne, pas seulement celle de l’ancre', () => {
    vi.useFakeTimers();
    create();
    const grid = el.querySelector('.week-grid') as HTMLElement;
    const tap = (cell: HTMLElement) => {
      cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
      grid.dispatchEvent(pointerEvent('pointerup', 10, 10));
      fixture.detectChanges();
    };

    // Sélection armée sur la ligne « Soirée ».
    slotCells('EVENING')[0].dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    grid.dispatchEvent(pointerEvent('pointerup', 10, 10));
    fixture.detectChanges();

    // Un matin d'un autre jour rejoint la sélection : la contrainte de ligne droite est celle
    // du GLISSEMENT, pas du clic.
    tap(slotCells('MORNING')[2]);
    const cells = fixture.componentInstance['selectedCells']();
    expect(cells).toHaveLength(2);
    expect(cells.map((c: { slot: string }) => c.slot).sort()).toEqual(['EVENING', 'MORNING']);
    // Créneaux divergents → plus aucune portée commune.
    expect(fixture.componentInstance['scope']()).toBeNull();

    // Et le même clic l'en retire.
    tap(slotCells('MORNING')[2]);
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(1);
  });

  it('glissement souris sur plusieurs cellules → sélectionne la plage, aucun tap émis', () => {
    create();
    const tapSpy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(tapSpy);
    const cells = slotCells('EVENING');
    const grid = el.querySelector('.week-grid') as HTMLElement;

    cells[1].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    // Stub elementFromPoint : jsdom ne calcule pas de géométrie réelle.
    const target3 = cells[3];
    document.elementFromPoint = vi.fn().mockReturnValue(target3);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(3);
    expect(tapSpy).not.toHaveBeenCalled();

    grid.dispatchEvent(pointerEvent('pointerup', 50, 0));
    // La sélection reste affichée après relâchement (barre visible) tant qu'aucune action n'est prise.
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(3);
  });

  it('glissement tactile avant expiration du délai d’appui maintenu → aucune sélection (AC4)', () => {
    vi.useFakeTimers();
    create();
    const cells = slotCells('MORNING');
    const grid = el.querySelector('.week-grid') as HTMLElement;

    cells[0].dispatchEvent(pointerEvent('pointerdown', 0, 0, 'touch'));
    // Déplacement significatif avant l'expiration du délai → traité comme un défilement natif.
    grid.dispatchEvent(pointerEvent('pointermove', 0, 100, 'touch'));
    vi.advanceTimersByTime(1000);

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
  });

  it('appui maintenu tactile jusqu’à expiration du délai → arme la sélection (AC4)', () => {
    vi.useFakeTimers();
    create();
    const cells = slotCells('MORNING');

    cells[0].dispatchEvent(pointerEvent('pointerdown', 0, 0, 'touch'));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(1);
  });

  it('Échap efface la sélection sans émettre de lot', () => {
    create();
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = slotCells('EVENING');
    const grid = el.querySelector('.week-grid') as HTMLElement;

    cells[1].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[3]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(3);

    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
    expect(batchSpy).not.toHaveBeenCalled();
  });

  it('validation via la barre de sélection émet batchDeclareRequested avec le kind attendu', () => {
    create();
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = slotCells('EVENING');
    const grid = el.querySelector('.week-grid') as HTMLElement;

    cells[1].dispatchEvent(pointerEvent('pointerdown', 0, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(cells[2]);
    grid.dispatchEvent(pointerEvent('pointermove', 50, 0));
    fixture.detectChanges();
    grid.dispatchEvent(pointerEvent('pointerup', 50, 0));
    fixture.detectChanges();

    const unavailableBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Indisponible',
    )!;
    unavailableBtn.click();

    expect(batchSpy).toHaveBeenCalledTimes(1);
    const payload = batchSpy.mock.calls[0][0];
    expect(payload.kind).toBe('UNAVAILABLE');
    expect(payload.cells).toHaveLength(2);
    // La sélection est effacée dès la validation (avant même la réponse de l'API, gérée par le parent).
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
  });

  it('Maj+flèche droite étend la sélection depuis une cellule (AC5)', () => {
    create();
    const cells = slotCells('EVENING');
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });

    cells[1].dispatchEvent(shiftRight);
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(2);

    cells[1].dispatchEvent(shiftRight);
    fixture.detectChanges();
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(3);
  });

  it('Maj+flèche gauche étend la sélection vers la gauche (AC5)', () => {
    create();
    const cells = slotCells('MORNING');
    const shiftLeft = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      shiftKey: true,
      bubbles: true,
    });

    cells[3].dispatchEvent(shiftLeft);
    cells[3].dispatchEvent(shiftLeft);
    fixture.detectChanges();

    expect(fixture.componentInstance['selectedCells']()).toHaveLength(3);
  });

  // ⚠️ Story 36.3, AC6 — remplace « Entrée valide avec Indisponible d'office » (story 30.3).
  it('AC6 — Entrée valide la sélection avec l’intention armée par la barre', () => {
    create();
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = slotCells('AFTERNOON');
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });

    cells[0].dispatchEvent(shiftRight);
    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();
    cells[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0].kind).toBe('UNAVAILABLE');
    expect(batchSpy.mock.calls[0][0].cells).toHaveLength(3);

    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();
    fixture.componentInstance['onArmedKindChange']('AVAILABLE');
    fixture.detectChanges();
    cells[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(batchSpy).toHaveBeenCalledTimes(2);
    expect(batchSpy.mock.calls[1][0].kind).toBe('AVAILABLE');
  });

  // ⚠️ Story 36.3, AC7 — remplace « Entrée sans sélection ouvre le panneau ».
  it('AC7 — Entrée sans sélection armée ne fait rien', () => {
    create();
    const slotSpy = vi.fn();
    const batchSpy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(slotSpy);
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cell = slotCells('EVENING')[0];

    cell.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(slotSpy).not.toHaveBeenCalled();
    expect(batchSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
  });

  it('AC3 — la portée gouverne le créneau écrit, pour toute la sélection', () => {
    create();
    const batchSpy = vi.fn();
    fixture.componentInstance.batchDeclareRequested.subscribe(batchSpy);
    const cells = slotCells('AFTERNOON');
    const shiftRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      shiftKey: true,
      bubbles: true,
    });
    cells[0].dispatchEvent(shiftRight);
    fixture.detectChanges();

    fixture.componentInstance['onScopeChange']('EVENING');
    fixture.detectChanges();
    fixture.componentInstance['onSelectionCommit']('AVAILABLE');

    const payload = batchSpy.mock.calls[0][0];
    expect(payload.cells).toHaveLength(2);
    expect(payload.cells.every((c: { slot: string }) => c.slot === 'EVENING')).toBe(true);
  });

  it('AC2 — la portée « journée » marque les trois lignes des jours retenus', () => {
    vi.useFakeTimers();
    create();
    const cell = slotCells('EVENING')[0];
    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fixture.detectChanges();
    expect(el.querySelectorAll('.slot-cell.selected')).toHaveLength(1);

    fixture.componentInstance['onScopeChange']('FULL_DAY');
    fixture.detectChanges();
    expect(el.querySelectorAll('.slot-cell.selected')).toHaveLength(3);
  });

  it('AC4 — « Autre… » émet declarationPanelRequested sur l’ancre, à la portée courante', () => {
    vi.useFakeTimers();
    create();
    const spy = vi.fn();
    fixture.componentInstance.declarationPanelRequested.subscribe(spy);
    const cell = slotCells('EVENING')[0];
    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fixture.detectChanges();

    const otherBtn = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Autre…',
    )!;
    otherBtn.click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].slot).toBe('EVENING');
    expect(fixture.componentInstance['selectedCells']()).toHaveLength(0);
  });
});

// ─── Story 36.13 — la grille Semaine à densité variable ───────────────────────

describe('CalendarWeekView — densité variable (Story 36.13)', () => {
  let fixture: ComponentFixture<CalendarWeekView>;
  let el: HTMLElement;

  // Semaine future : évite `isPast`, qui retire le rôle bouton et l'aria-label des cellules.
  const futureStart = new Date();
  futureStart.setDate(futureStart.getDate() + 14);
  const weekStart = getWeekStart(
    new Date(Date.UTC(futureStart.getFullYear(), futureStart.getMonth(), futureStart.getDate())),
  );

  /** Le jour de la colonne `i`, dans la convention `YYYY-MM-DD` locale des entrées. */
  function dayKey(i: number): string {
    const d = new Date(
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth(),
      weekStart.getUTCDate() + i,
    );
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function seanceEntry(dayIndex: number, over: Partial<AgendaEntry> = {}): AgendaEntry {
    return {
      key: `seance-${dayIndex}`,
      type: 'mes-seances',
      date: dayKey(dayIndex),
      label: 'Le Convoi du Nord',
      slot: 'EVENING',
      partieId: 'p1',
      scenarioId: 's1',
      ...over,
    };
  }

  function voteEntry(dayIndex: number): AgendaEntry {
    return {
      key: `poll-${dayIndex}`,
      type: 'votes-en-cours',
      date: dayKey(dayIndex),
      label: 'Les Cendres d Ashal',
      slot: 'MORNING',
      partieId: 'p1',
    };
  }

  function create(entries: AgendaEntry[] = [], activeLayers: CalendarLayerKey[] = []): void {
    fixture = TestBed.createComponent(CalendarWeekView);
    fixture.componentRef.setInput('startDate', futureStart);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('activeLayers', activeLayers);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  function cellAt(slot: 'MORNING' | 'AFTERNOON' | 'EVENING', dayIndex: number): HTMLElement {
    return Array.from(el.querySelectorAll<HTMLElement>(`.slot-cell[data-cell-slot="${slot}"]`))[
      dayIndex
    ];
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CalendarWeekView] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // AC1 — sept colonnes, à toutes les largeurs. La densité étant purement CSS, la structure est
  // la même dans les deux cas : c'est précisément ce que cet AC garantit.
  it('AC1 — conserve sept colonnes et rend trois lignes de sept cellules', () => {
    create();
    expect(el.querySelectorAll('.col-header')).toHaveLength(7);
    for (const slot of ['MORNING', 'AFTERNOON', 'EVENING'] as const) {
      expect(el.querySelectorAll(`.slot-cell[data-cell-slot="${slot}"]`)).toHaveLength(7);
    }
  });

  // AC1 + AC2 — la gouttière porte une icône par créneau, et chacune est nommée. L'icône y
  // REMPLACE le mot (contrairement au rail, où elle l'accompagne et reste aria-hidden).
  it('AC1/AC2 — la gouttière porte trois icônes de créneau, chacune avec un libellé accessible', () => {
    create();
    const icons = Array.from(el.querySelectorAll('.row-label .slot-icon'));
    expect(icons).toHaveLength(3);
    expect(icons.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Matin',
      'Après-midi',
      'Soirée',
    ]);
    expect(icons.some((i) => i.getAttribute('aria-hidden') === 'true')).toBe(false);
  });

  // AC6 — la case du Mois n'en porte pas : la position y dit déjà le créneau. Vérifié ici par
  // l'absence de toute icône hors gouttière dans cette vue (le Mois a sa propre spec, intacte).
  it('AC6 — aucune icône de créneau hors de la gouttière', () => {
    create([seanceEntry(3)], ['mes-seances']);
    expect(el.querySelectorAll('.slot-cell .slot-icon')).toHaveLength(0);
  });

  // AC3/AC4 — le titre est TOUJOURS dans le DOM ; seul le CSS décide de ce qui se voit. jsdom
  // n'évalue pas les container queries : l'assertion porte donc sur la présence, jamais sur la
  // visibilité effective — d'où la vérification visuelle exigée par la story.
  it('AC3/AC4 — la cellule portant une séance rend son titre', () => {
    create([seanceEntry(3)], ['mes-seances']);
    expect(cellAt('EVENING', 3).querySelector('.ev-title')?.textContent?.trim()).toBe(
      'Le Convoi du Nord',
    );
    expect(cellAt('EVENING', 0).querySelector('.ev-title')).toBeNull();
  });

  // AC4 — les informations pratiques sont rendues, et composées par le POINT UNIQUE
  // `composeSeanceInfo` au niveau `compact` (deux champs : l'heure puis le lieu, la note cède).
  it('AC4/AC7 — la cellule rend les informations pratiques au niveau compact', () => {
    create(
      [
        seanceEntry(3, {
          seanceHeure: '20:30',
          seanceLieu: 'chez Marc',
          seanceNote: 'apporter les dés',
        }),
      ],
      ['mes-seances'],
    );
    expect(cellAt('EVENING', 3).querySelector('.ev-info')?.textContent?.trim()).toBe(
      '20:30 · chez Marc',
    );
  });

  // AC10 — un vote est un événement comme un autre : il est nommé. Sa PISTE relève de la 36.6.
  it('AC10 — la cellule nomme un vote en cours', () => {
    create([voteEntry(2)], ['votes-en-cours']);
    expect(cellAt('MORNING', 2).querySelector('.ev-title')?.textContent?.trim()).toBe(
      'Les Cendres d Ashal',
    );
  });

  // AC11 — la couche gouverne le TEXTE ; l'indisponibilité dérivée d'une séance DEMEURE (FR-50).
  it('AC11 — couche eteinte : le titre disparait, l indisponibilite demeure', () => {
    create([seanceEntry(3)], []);
    const cell = cellAt('EVENING', 3);
    expect(cell.querySelector('.ev-title')).toBeNull();
    expect(cell.getAttribute('data-status')).toBe('UNAVAILABLE');
  });

  // AC11 — le rang « vote », lui, EST gouverné par sa couche (décision du 2026-08-18) : couche
  // éteinte, le créneau retombe sur son statut déclaré et ne nomme rien.
  it('AC11 — couche de votes eteinte : le vote n est pas nomme', () => {
    create([voteEntry(2)], []);
    expect(cellAt('MORNING', 2).querySelector('.ev-title')).toBeNull();
  });

  // AC12 — ce que le CSS tronque visuellement n'est JAMAIS tronqué dans le nom accessible.
  it('AC12 — le nom accessible porte le titre complet et les informations pratiques', () => {
    create([seanceEntry(3, { seanceHeure: '20:30', seanceLieu: 'chez Marc' })], ['mes-seances']);
    const label = cellAt('EVENING', 3).getAttribute('aria-label')!;
    expect(label).toContain('Le Convoi du Nord');
    expect(label).toContain('20:30 · chez Marc');
    expect(label).toContain('indisponible');
  });

  // 🚨 AC9 — LE CONTRAT DOM DU GLISSEMENT. `elementFromPoint` est stubbé partout ailleurs : si un
  // nœud ajouté sortait de la cellule, les 15 tests de glissement resteraient VERTS et le geste
  // serait cassé en production. Ce test-ci est le seul garde-fou, et il n'utilise aucun stub.
  it('AC9 — tout noeud ajoute reste un descendant porteur de data-cell-date', () => {
    create([seanceEntry(3, { seanceHeure: '20:30', seanceLieu: 'chez Marc' })], ['mes-seances']);
    const cell = cellAt('EVENING', 3);
    const title = cell.querySelector('.ev-title')!;
    const info = cell.querySelector('.ev-info')!;
    expect(title.closest('[data-cell-date]')).toBe(cell);
    expect(info.closest('[data-cell-date]')).toBe(cell);
  });
});
