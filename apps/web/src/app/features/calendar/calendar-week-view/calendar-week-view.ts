import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type {
  AvailKind,
  AvailabilityDeclarationDto,
  CreateAvailabilityDto,
  DaySlot,
  SlotStatus,
} from '@master-jdr/shared';
import { computeDisplayStatus } from '../../../core/availability/compute-display-status';
import { SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';
import { SelectionBar } from '../selection-bar/selection-bar';
import {
  LONG_PRESS_MS,
  MOVE_THRESHOLD_PX,
  type GesturePointerType,
  type SelectedCell,
  weekRangeCells,
} from '../selection.utils';

interface SlotData {
  status: SlotStatus;
  preview: SlotStatus | null;
  declLabel: string | null;
}

export interface WeekCell {
  date: Date;
  label: string;
  isToday: boolean;
  isPast: boolean;
  morning: SlotData;
  afternoon: SlotData;
  evening: SlotData;
}

export function getWeekStart(date: Date): Date {
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function toUTCMidnight(isoDate: string): Date {
  const d = new Date(isoDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatDeclLabel(d: AvailabilityDeclarationDto): string {
  const kind = d.kind === 'UNAVAILABLE' ? 'Indispo' : 'Dispo';
  const recur = d.recurKind === 'RECURRING' ? 'Récurrent' : 'Ponctuel';
  return `${kind} · ${recur}`;
}

function findWeekDecl(
  decls: AvailabilityDeclarationDto[],
  utcDate: Date,
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING',
  now: Date,
): AvailabilityDeclarationDto | null {
  return (
    decls.find((d) => {
      if (new Date(d.expiresAt) <= now) return false;
      const slotMatch = d.slot === 'FULL_DAY' || d.slot === slot;
      if (!slotMatch) return false;
      if (d.recurKind === 'RECURRING') {
        if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
        if (d.startDate) {
          const start = toUTCMidnight(d.startDate);
          if (utcDate < start) return false;
        }
        if (d.endDate) {
          const end = toUTCMidnight(d.endDate);
          if (utcDate > end) return false;
        }
        return utcDate <= toUTCMidnight(d.expiresAt);
      }
      if (!d.startDate || !d.endDate) return false;
      const start = new Date(d.startDate.substring(0, 10) + 'T00:00:00Z');
      const end = new Date(d.endDate.substring(0, 10) + 'T00:00:00Z');
      return utcDate >= start && utcDate <= end;
    }) ?? null
  );
}

function toFakeDecl(dto: CreateAvailabilityDto): AvailabilityDeclarationDto {
  return {
    id: '__preview__',
    userId: '__preview__',
    kind: dto.kind,
    recurKind: dto.recurKind,
    dayOfWeek: dto.dayOfWeek ?? null,
    slot: dto.slot,
    startDate: dto.startDate ?? null,
    endDate: dto.endDate ?? null,
    expiresAt: dto.expiresAt || '2099-12-31T23:59:59.000Z',
    createdAt: new Date().toISOString(),
  };
}

export function buildWeek(
  weekStart: Date,
  decls: AvailabilityDeclarationDto[],
  pendingDecl: AvailabilityDeclarationDto | null,
): WeekCell[] {
  const now = new Date();
  // Minuit UTC d'aujourd'hui — cohérent avec l'alignement UTC des semaines.
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const declsWithPending = pendingDecl ? [...decls, pendingDecl] : decls;

  return Array.from({ length: 7 }, (_, i) => {
    const utcCell = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i),
    );
    // Pour l'affichage (label, date émise) : date locale représentant le même jour calendaire.
    const cellLocal = new Date(
      utcCell.getUTCFullYear(),
      utcCell.getUTCMonth(),
      utcCell.getUTCDate(),
    );

    const computeSlot = (slot: 'MORNING' | 'AFTERNOON' | 'EVENING'): SlotData => {
      const status = computeDisplayStatus(utcCell, slot, decls);
      let preview: SlotStatus | null = null;
      if (pendingDecl) {
        const withPending = computeDisplayStatus(utcCell, slot, declsWithPending);
        if (withPending !== status) preview = withPending;
      }
      const matchingDecl = findWeekDecl(decls, utcCell, slot, now);
      return {
        status,
        preview,
        declLabel: matchingDecl ? formatDeclLabel(matchingDecl) : null,
      };
    };

    return {
      date: cellLocal,
      label: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' }).format(
        cellLocal,
      ),
      isToday: utcCell.getTime() === todayUtcMidnight,
      isPast: utcCell.getTime() < todayUtcMidnight,
      morning: computeSlot('MORNING'),
      afternoon: computeSlot('AFTERNOON'),
      evening: computeSlot('EVENING'),
    };
  });
}

interface PointerDownInfo {
  cell: WeekCell;
  slot: DaySlot;
  pointerId: number;
  pointerType: GesturePointerType;
  startX: number;
  startY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

@Component({
  selector: 'app-calendar-week-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, SelectionBar],
  templateUrl: './calendar-week-view.html',
  styleUrl: './calendar-week-view.scss',
})
export class CalendarWeekView {
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);
  readonly pendingDto = input<CreateAvailabilityDto | null>(null);
  readonly startDate = input<Date>(new Date());
  /** Story 30.6, revue de code (AC1) : dates (yyyy-mm-dd) portant au moins une séance à venir de
   *  la couche `mes-seances` — inscriptions-ouvertes n'a structurellement pas de date donc reste
   *  Agenda-only. */
  readonly seanceDates = input<Set<string>>(new Set());

  readonly slotSelected = output<SlotSelectedEvent>();
  readonly displayDateChange = output<Date>();
  /** Story 30.3 : lot construit par un glissement (souris/tactile) ou une validation clavier —
   *  CalendarView construit les items et appelle createDeclarationBatch(), jamais cette vue. */
  readonly batchDeclareRequested = output<{ cells: SelectedCell[]; kind: AvailKind }>();

  protected readonly displayWeekStart = signal<Date>(getWeekStart(new Date()));

  private readonly pendingDecl = computed<AvailabilityDeclarationDto | null>(() => {
    const dto = this.pendingDto();
    return dto ? toFakeDecl(dto) : null;
  });

  protected readonly cells = computed(() =>
    buildWeek(this.displayWeekStart(), this.declarations(), this.pendingDecl()),
  );

  protected readonly weekLabel = computed(() => {
    const ws = this.displayWeekStart();
    // Dates locales construites depuis les composantes UTC pour l'affichage.
    const start = new Date(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate());
    const end = new Date(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() + 6);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
    const fmtYear = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        d,
      );
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${fmtYear(end)}`
      : `${fmt(start)} – ${fmtYear(end)}`;
  });

  protected readonly isCurrentWeek = computed(() => {
    const ws = this.displayWeekStart();
    const curr = getWeekStart(new Date());
    return ws.getTime() === curr.getTime();
  });

  protected readonly SLOT_ROWS: {
    key: 'morning' | 'afternoon' | 'evening';
    label: string;
    slot: DaySlot;
  }[] = [
    { key: 'morning', label: 'Matin', slot: 'MORNING' },
    { key: 'afternoon', label: 'Après-midi', slot: 'AFTERNOON' },
    { key: 'evening', label: 'Soirée', slot: 'EVENING' },
  ];

  // ─── Sélection par glissement (Story 30.3) ─────────────────────────────────
  private pointerDown: PointerDownInfo | null = null;
  protected readonly dragArmed = signal(false);
  protected readonly selectionAnchor = signal<SelectedCell | null>(null);
  protected readonly selectionCurrent = signal<SelectedCell | null>(null);

  protected readonly selectedCells = computed<SelectedCell[]>(() => {
    const anchor = this.selectionAnchor();
    const current = this.selectionCurrent();
    if (!anchor || !current) return [];
    return weekRangeCells(anchor, current, this.cells());
  });

  private readonly selectedKeys = computed(() => {
    return new Set(this.selectedCells().map((c) => `${c.date.getTime()}|${c.slot}`));
  });

  protected readonly selectionRangeLabel = computed<string | null>(() => {
    const cells = this.selectedCells();
    if (cells.length === 0) return null;
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' }).format(d);
    const slotLabel = this.SLOT_ROWS.find((r) => r.slot === cells[0].slot)?.label ?? '';
    if (cells.length === 1) return `${fmt(cells[0].date)}, ${slotLabel}`;
    return `${fmt(cells[0].date)} → ${fmt(cells[cells.length - 1].date)}, ${slotLabel}`;
  });

  constructor() {
    effect(() => {
      const d = this.startDate();
      untracked(() => this.displayWeekStart.set(getWeekStart(d)));
    });
  }

  prevWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(Date.UTC(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() - 7));
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  nextWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(Date.UTC(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() + 7));
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  goToToday(): void {
    const today = getWeekStart(new Date());
    this.displayWeekStart.set(today);
    this.displayDateChange.emit(today);
  }

  protected onCellClick(date: Date, slot: DaySlot): void {
    const now = new Date();
    // cellLocal est construit depuis les composantes UTC → getFullYear/Month/Date() == composantes UTC.
    const cellUtcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (cellUtcMidnight < todayUtcMidnight) return;
    this.slotSelected.emit({ date, slot });
  }

  protected getSlotData(cell: WeekCell, key: 'morning' | 'afternoon' | 'evening'): SlotData {
    return cell[key];
  }

  protected dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  protected cellAriaLabel(cell: WeekCell, slotData: SlotData, slotName: string): string {
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'inconnu',
    };
    const status = slotData.preview ?? slotData.status;
    const fullDate = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(cell.date);
    return `${slotName}, ${fullDate} : ${labels[status]}`;
  }

  protected isCellSelected(cell: WeekCell, slot: DaySlot): boolean {
    return this.selectedKeys().has(`${cell.date.getTime()}|${slot}`);
  }

  /** true pendant qu'un pointeur est actuellement enfoncé sur la grille — utilisé pour ne bloquer
   *  le menu contextuel natif (clic droit) que pendant un geste, pas en permanence. */
  protected isGestureActive(): boolean {
    return this.pointerDown !== null;
  }

  // ─── Geste souris/tactile ───────────────────────────────────────────────
  protected onCellPointerDown(event: PointerEvent, cell: WeekCell, slot: DaySlot): void {
    if (cell.isPast) return;
    // Seul le bouton principal peut amorcer un geste (clic droit/milieu = menu contextuel/autre).
    if (event.button !== 0) return;
    // Un geste est déjà en cours pour un autre pointeur (deuxième doigt, paume) : on l'ignore
    // plutôt que de remplacer silencieusement l'état du premier.
    if (this.pointerDown && this.pointerDown.pointerId !== event.pointerId) return;
    this.clearPointerState();
    this.dragArmed.set(false);
    this.pointerDown = {
      cell,
      slot,
      pointerId: event.pointerId,
      pointerType: event.pointerType as GesturePointerType,
      startX: event.clientX,
      startY: event.clientY,
      longPressTimer:
        event.pointerType === 'touch'
          ? setTimeout(() => this.armDrag(cell, slot), LONG_PRESS_MS)
          : null,
    };
  }

  protected onGridPointerMove(event: PointerEvent): void {
    const down = this.pointerDown;
    if (!down || down.pointerId !== event.pointerId) return;
    const dx = event.clientX - down.startX;
    const dy = event.clientY - down.startY;
    const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX;

    if (!this.dragArmed()) {
      if (down.pointerType === 'touch') {
        // Appui maintenu requis (AC4) : un déplacement avant l'expiration du délai laisse le
        // défilement natif se produire, on n'appelle pas preventDefault().
        if (moved) {
          this.cancelLongPressTimer();
          this.pointerDown = null;
        }
        return;
      }
      if (!moved) return;
      this.armDrag(down.cell, down.slot);
    }

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-cell-date]');
    if (!target) return;
    const dateMs = Number(target.dataset['cellDate']);
    const cellMatch = this.cells().find((c) => c.date.getTime() === dateMs);
    if (!cellMatch || cellMatch.isPast) return;
    const anchor = this.selectionAnchor();
    if (!anchor) return;
    this.selectionCurrent.set({ date: cellMatch.date, slot: anchor.slot });
  }

  protected onGridPointerUp(event: PointerEvent): void {
    const down = this.pointerDown;
    if (!down || down.pointerId !== event.pointerId) return;
    const wasArmed = this.dragArmed();
    this.cancelLongPressTimer();
    this.pointerDown = null;
    if (!wasArmed) {
      // Relâché sans déplacement ni appui maintenu écoulé → tap normal (AC3, AC9).
      if (down) this.onCellClick(down.cell.date, down.slot);
      return;
    }
    this.dragArmed.set(false);
    // La sélection reste affichée (anchor/current conservés) — la barre reste visible
    // jusqu'à validation ou annulation par l'utilisateur.
  }

  private armDrag(cell: WeekCell, slot: DaySlot): void {
    this.dragArmed.set(true);
    this.selectionAnchor.set({ date: cell.date, slot });
    this.selectionCurrent.set({ date: cell.date, slot });
  }

  private cancelLongPressTimer(): void {
    if (this.pointerDown?.longPressTimer) clearTimeout(this.pointerDown.longPressTimer);
  }

  private clearPointerState(): void {
    this.cancelLongPressTimer();
    this.pointerDown = null;
  }

  // ─── Clavier ─────────────────────────────────────────────────────────────
  protected onCellEnterKey(cell: WeekCell, slot: DaySlot): void {
    if (this.selectionAnchor()) {
      // Aucune touche unique ne peut exprimer disponible/indisponible : Indisponible par défaut
      // (Story 30.3, Task 4 — cohérent avec le cas d'usage nommé par la story : « une semaine
      // d'absence »).
      this.onSelectionCommit('UNAVAILABLE');
      return;
    }
    this.onCellClick(cell.date, slot);
  }

  protected onShiftArrow(cell: WeekCell, slot: DaySlot, direction: -1 | 1): void {
    if (cell.isPast) return;
    const anchor = this.selectionAnchor() ?? { date: cell.date, slot };
    if (!this.selectionAnchor()) this.selectionAnchor.set(anchor);
    const cellsArr = this.cells();
    const currentSel = this.selectionCurrent() ?? anchor;
    const idx = cellsArr.findIndex((c) => c.date.getTime() === currentSel.date.getTime());
    const nextIdx = Math.min(Math.max(idx + direction, 0), cellsArr.length - 1);
    const nextCell = cellsArr[nextIdx];
    if (nextCell.isPast) return;
    this.selectionCurrent.set({ date: nextCell.date, slot: anchor.slot });
  }

  protected onSelectionCancelled(): void {
    this.selectionAnchor.set(null);
    this.selectionCurrent.set(null);
  }

  protected onSelectionCommit(kind: AvailKind): void {
    const cells = this.selectedCells();
    if (cells.length === 0) return;
    this.batchDeclareRequested.emit({ cells, kind });
    this.selectionAnchor.set(null);
    this.selectionCurrent.set(null);
  }
}
