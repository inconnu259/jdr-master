import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityDeclarationDto } from '@master-jdr/shared';
import { CalendarWeekView, buildWeek, getWeekStart } from './calendar-week-view';

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

  it('tap sans déplacement (pointerdown + pointerup sur la même cellule) ouvre toujours le panneau (AC3, AC9)', () => {
    create();
    const spy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(spy);
    const cell = slotCells('EVENING')[0];
    cell.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    const grid = el.querySelector('.week-grid') as HTMLElement;
    grid.dispatchEvent(pointerEvent('pointerup', 10, 10));
    expect(spy).toHaveBeenCalledTimes(1);
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

  it('Entrée valide la sélection clavier avec Indisponible par défaut (AC5)', () => {
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
    const payload = batchSpy.mock.calls[0][0];
    expect(payload.kind).toBe('UNAVAILABLE');
    expect(payload.cells).toHaveLength(3);
  });

  it('Entrée sans sélection active ouvre le panneau normalement (tap inchangé)', () => {
    create();
    const spy = vi.fn();
    fixture.componentInstance.slotSelected.subscribe(spy);
    const cell = slotCells('EVENING')[0];

    cell.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
