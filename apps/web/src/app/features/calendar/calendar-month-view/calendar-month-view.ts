import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type {
  AvailKind,
  AvailabilityDeclarationDto,
  CalendarLayerKey,
  CreateAvailabilityDto,
  DaySlot,
  SlotStatus,
} from '@master-jdr/shared';
import { SelectionBar } from '../selection-bar/selection-bar';
import type { AgendaEntry } from '../calendar-agenda-view/calendar-agenda-view';
import {
  type RailSlot,
  type SlotWinner,
  bandsAreUniform,
  buildMonthDetails,
  toDateKey,
} from '../day-detail.utils';
import {
  LONG_PRESS_MS,
  MOVE_THRESHOLD_PX,
  type GesturePointerType,
  type SelectedCell,
  monthRangeDays,
} from '../selection.utils';

export interface SlotSelectedEvent {
  date: Date;
  slot: DaySlot;
}

/**
 * Story 36.2 — une bande de la case du Mois. Une par créneau, pleine largeur, dans l'ordre
 * matin → après-midi → soir : **la position verticale porte le créneau**, sans icône ni libellé
 * (AC1). Le contenu est entièrement dérivé de `buildDayDetail()` : la préséance n'est écrite
 * qu'à un seul endroit.
 */
export interface DayBand {
  slot: RailSlot;
  label: string;
  winner: SlotWinner;
  status: SlotStatus;
  /** Titre de séance ou libellé de vote, **déjà gouverné par les couches** — `null` quand la
   *  couche est éteinte, sans que le rang ni l'indisponibilité en soient affectés (AC6/FR-50). */
  text: string | null;
  /** Aperçu live pendant l'édition dans `ConstraintPanel` — `null` si identique au réel. */
  preview: SlotStatus | null;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  bands: DayBand[];
  /** AC4 — les trois créneaux portent le même rang et aucun événement : une seule bande est
   *  rendue, occupant la hauteur. C'est ce qui empêche la grille de devenir bariolée. */
  uniform: boolean;
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

export function buildMonth(
  display: Date,
  entries: AgendaEntry[],
  activeLayers: readonly CalendarLayerKey[],
  decls: AvailabilityDeclarationDto[],
  pendingDecl: AvailabilityDeclarationDto | null,
): DayCell[][] {
  const year = display.getFullYear();
  const month = display.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const firstDay = new Date(year, month, 1);
  const dow = firstDay.getDay();
  const startOffset = dow === 0 ? 6 : dow - 1;

  const declsWithPending = pendingDecl ? [...decls, pendingDecl] : decls;

  // Revue de code — Task 2 : une seule projection par mois, pas 42×2 appels individuels à
  // `buildDayDetail()`. Les 42 jours de la grille sont d'abord énumérés pour construire leurs
  // clés, puis projetés en un seul passage par `buildMonthDetails()` (au-dessus de
  // `buildDayDetail()` — la préséance n'est toujours écrite qu'à un seul endroit).
  const cellDates: Date[] = [];
  let dayOffset = 1 - startOffset;
  for (let i = 0; i < 42; i++) {
    cellDates.push(new Date(year, month, dayOffset));
    dayOffset++;
  }
  const dateKeys = cellDates.map(toDateKey);

  const details = buildMonthDetails(dateKeys, entries, activeLayers, decls);
  const previewDetails = pendingDecl
    ? buildMonthDetails(dateKeys, entries, activeLayers, declsWithPending)
    : null;

  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellLocal = cellDates[w * 7 + d];
      const key = dateKeys[w * 7 + d];
      const cellMidnight = new Date(cellLocal);
      cellMidnight.setHours(0, 0, 0, 0);

      const detail = details.get(key)!;
      const previewDetail = previewDetails?.get(key) ?? null;

      week.push({
        date: cellLocal,
        isCurrentMonth: cellLocal.getMonth() === month,
        isToday: cellMidnight.getTime() === todayTime,
        isPast: cellMidnight.getTime() < todayTime,
        bands: detail.slots.map((s, i): DayBand => {
          const previewStatus = previewDetail?.slots[i].status ?? null;
          return {
            slot: s.slot,
            label: s.label,
            winner: s.winner,
            status: s.status,
            // Revue de code : le texte doit suivre le RANG GAGNANT, pas être choisi par
            // nullish-coalescing — sinon une séance dont la couche est éteinte peut afficher le
            // titre d'un vote qui couvre le même créneau, alors que la bande est stylée séance.
            text: s.winner === 'seance' ? s.seanceLabel : s.winner === 'vote' ? s.pollLabel : null,
            preview: previewStatus !== null && previewStatus !== s.status ? previewStatus : null,
          };
        }),
        uniform: bandsAreUniform(previewDetail ?? detail),
      });
    }
    weeks.push(week);
  }

  return weeks;
}

interface PointerDownInfo {
  cell: DayCell;
  pointerId: number;
  pointerType: GesturePointerType;
  startX: number;
  startY: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  /** true si le pointerdown est parti d'une bande matin/après-midi/soir plutôt que du fond de
   *  la case — dans ce cas, un relâchement rapide ne doit pas rejouer un tap FULL_DAY (la bande
   *  gère déjà son propre tap via son (click)), seul un armement (glissement) doit être
   *  possible depuis là. Story 36.2 : les bandes remplacent les segments, le mécanisme est
   *  conservé à l'identique. */
  fromBand: boolean;
}

@Component({
  selector: 'app-calendar-month-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, SelectionBar],
  templateUrl: './calendar-month-view.html',
  styleUrl: './calendar-month-view.scss',
})
export class CalendarMonthView {
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);
  readonly pendingDto = input<CreateAvailabilityDto | null>(null);
  readonly initialDate = input<Date | null>(null);
  /** Story 36.2 — entrées du calendrier **non filtrées par couche** (`allCalendarEntries()`).
   *  Remplacent les anciens inputs `heatmap` et `seanceDates`, qui n'alimentaient que les deux
   *  pastilles retirées par cette story. */
  readonly entries = input<AgendaEntry[]>([]);
  /** Couches actives : gouvernent le TEXTE des bandes, jamais leur rang ni l'indisponibilité. */
  readonly activeLayers = input<readonly CalendarLayerKey[]>([]);

  readonly slotSelected = output<SlotSelectedEvent>();
  readonly displayDateChange = output<Date>();
  /** Story 30.3 : lot construit par un glissement (souris/tactile) ou une validation clavier —
   *  CalendarView construit les items et appelle createDeclarationBatch(), jamais cette vue. */
  readonly batchDeclareRequested = output<{ cells: SelectedCell[]; kind: AvailKind }>();

  protected readonly displayDate = signal(new Date());

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.displayDate()),
  );

  private readonly pendingDecl = computed<AvailabilityDeclarationDto | null>(() => {
    const dto = this.pendingDto();
    return dto ? toFakeDecl(dto) : null;
  });

  protected readonly weeks = computed(() =>
    buildMonth(
      this.displayDate(),
      this.entries(),
      this.activeLayers(),
      this.declarations(),
      this.pendingDecl(),
    ),
  );

  private readonly allCells = computed(() => this.weeks().flat());

  protected readonly DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  protected readonly isCurrentMonth = computed(() => {
    const d = this.displayDate();
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  // ─── Sélection par glissement (Story 30.3) ─────────────────────────────────
  private pointerDown: PointerDownInfo | null = null;
  protected readonly dragArmed = signal(false);
  protected readonly selectionAnchor = signal<Date | null>(null);
  protected readonly selectionCurrent = signal<Date | null>(null);

  protected readonly selectedDays = computed<Date[]>(() => {
    const anchor = this.selectionAnchor();
    const current = this.selectionCurrent();
    if (!anchor || !current) return [];
    return monthRangeDays(anchor, current);
  });

  private readonly selectedKeys = computed(
    () => new Set(this.selectedDays().map((d) => d.getTime())),
  );

  protected readonly selectionRangeLabel = computed<string | null>(() => {
    const days = this.selectedDays();
    if (days.length === 0) return null;
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
    if (days.length === 1) return fmt(days[0]);
    return `${fmt(days[0])} → ${fmt(days[days.length - 1])}`;
  });

  constructor() {
    const init = this.initialDate();
    if (init) {
      this.displayDate.set(new Date(init.getFullYear(), init.getMonth(), 1));
    }
  }

  goToToday(): void {
    const today = new Date();
    this.displayDate.set(today); // local-midnight pour buildMonth
    const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    this.displayDateChange.emit(utc);
  }

  prevMonth(): void {
    const d = this.displayDate();
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1); // local pour buildMonth
    this.displayDate.set(next);
    const utc = new Date(Date.UTC(next.getFullYear(), next.getMonth(), 1));
    this.displayDateChange.emit(utc);
  }

  nextMonth(): void {
    const d = this.displayDate();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1); // local pour buildMonth
    this.displayDate.set(next);
    const utc = new Date(Date.UTC(next.getFullYear(), next.getMonth(), 1));
    this.displayDateChange.emit(utc);
  }

  protected onCellClick(date: Date, slot: DaySlot): void {
    // Bloquer les clics sur les cellules hors-mois courant.
    const displayDate = this.displayDate();
    if (
      date.getMonth() !== displayDate.getMonth() ||
      date.getFullYear() !== displayDate.getFullYear()
    )
      return;
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (midnight.getTime() < today.getTime()) return; // date passée — ignorée
    this.slotSelected.emit({ date, slot });
  }

  /** Story 36.2, AC12 — le nom accessible d'une bande dit son créneau ET son état EN TOUTES
   *  LETTRES : un lecteur d'écran ne voit ni fond, ni filet, ni trame. Quand un événement est
   *  posé et nommé, c'est son titre qui fait l'état (« Soir : Le Convoi du Nord ») ; quand la
   *  couche est éteinte, on retombe sur l'état de disponibilité, qui lui demeure (AC6). */
  protected bandAriaLabel(band: DayBand): string {
    if (band.text) return `${band.label} : ${band.text}`;
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'non déclaré',
    };
    return `${band.label} : ${labels[band.status]}`;
  }

  /** AC4 — le nom accessible d'une case fusionnée : un seul état, annoncé une fois, pour la
   *  JOURNÉE entière — jamais « Matin », qui ne serait vrai que par accident d'indexation
   *  (revue de code, décision utilisateur 2026-08-18). */
  protected uniformAriaLabel(cell: DayCell): string {
    return this.bandAriaLabel({ ...cell.bands[0], label: 'Journée' });
  }

  protected isDaySelected(cell: DayCell): boolean {
    return this.selectedKeys().has(cell.date.getTime());
  }

  /** true pendant qu'un pointeur est actuellement enfoncé sur la grille — utilisé pour ne bloquer
   *  le menu contextuel natif (clic droit) que pendant un geste, pas en permanence. */
  protected isGestureActive(): boolean {
    return this.pointerDown !== null;
  }

  // ─── Geste souris/tactile ───────────────────────────────────────────────
  protected onCellPointerDown(event: PointerEvent, cell: DayCell, fromBand = false): void {
    if (cell.isPast || !cell.isCurrentMonth) return;
    // Seul le bouton principal peut amorcer un geste (clic droit/milieu = menu contextuel/autre).
    if (event.button !== 0) return;
    // Un geste est déjà en cours pour un autre pointeur (deuxième doigt, paume) : on l'ignore
    // plutôt que de remplacer silencieusement l'état du premier.
    if (this.pointerDown && this.pointerDown.pointerId !== event.pointerId) return;
    this.clearPointerState();
    this.dragArmed.set(false);
    this.pointerDown = {
      cell,
      pointerId: event.pointerId,
      pointerType: event.pointerType as GesturePointerType,
      startX: event.clientX,
      startY: event.clientY,
      longPressTimer:
        event.pointerType === 'touch' ? setTimeout(() => this.armDrag(cell), LONG_PRESS_MS) : null,
      fromBand,
    };
  }

  /** Un pointerdown parti d'une bande ne doit pas buller vers la case (sinon un tap sur la
   *  bande rejouerait aussi un tap FULL_DAY, cf. test de non-régression) — on démarre donc
   *  manuellement le même état de geste que sur la case elle-même, marqué fromBand. */
  protected onBandPointerDown(event: PointerEvent, cell: DayCell): void {
    this.onCellPointerDown(event, cell, true);
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
      this.armDrag(down.cell);
    }

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-cell-date]');
    if (!target) return;
    const dateMs = Number(target.dataset['cellDate']);
    const cellMatch = this.allCells().find((c) => c.date.getTime() === dateMs);
    if (!cellMatch || cellMatch.isPast || !cellMatch.isCurrentMonth) return;
    this.selectionCurrent.set(cellMatch.date);
  }

  protected onGridPointerUp(event: PointerEvent): void {
    const down = this.pointerDown;
    if (!down || down.pointerId !== event.pointerId) return;
    const wasArmed = this.dragArmed();
    this.cancelLongPressTimer();
    this.pointerDown = null;
    if (!wasArmed) {
      // Relâché sans déplacement ni appui maintenu écoulé → tap normal (AC3, AC9).
      // Un pointerdown parti d'une bande ne rejoue pas de tap FULL_DAY : la bande gère déjà
      // son propre tap via son (click), qui n'est pas passé par ce mécanisme.
      if (down && !down.fromBand) this.onCellClick(down.cell.date, 'FULL_DAY');
      return;
    }
    this.dragArmed.set(false);
    // La sélection reste affichée (anchor/current conservés) — la barre reste visible
    // jusqu'à validation ou annulation par l'utilisateur.
  }

  private armDrag(cell: DayCell): void {
    this.dragArmed.set(true);
    this.selectionAnchor.set(cell.date);
    this.selectionCurrent.set(cell.date);
  }

  private cancelLongPressTimer(): void {
    if (this.pointerDown?.longPressTimer) clearTimeout(this.pointerDown.longPressTimer);
  }

  private clearPointerState(): void {
    this.cancelLongPressTimer();
    this.pointerDown = null;
  }

  // ─── Clavier ─────────────────────────────────────────────────────────────
  protected onCellEnterKey(cell: DayCell): void {
    if (this.selectionAnchor()) {
      // Aucune touche unique ne peut exprimer disponible/indisponible : Indisponible par défaut
      // (Story 30.3, Task 4 — cohérent avec le cas d'usage nommé par la story : « une semaine
      // d'absence »).
      this.onSelectionCommit('UNAVAILABLE');
      return;
    }
    this.onCellClick(cell.date, 'FULL_DAY');
  }

  protected onShiftArrow(cell: DayCell, direction: -1 | 1): void {
    if (cell.isPast) return;
    const anchor = this.selectionAnchor() ?? cell.date;
    if (!this.selectionAnchor()) this.selectionAnchor.set(anchor);
    const currentSel = this.selectionCurrent() ?? anchor;
    const next = new Date(currentSel);
    next.setDate(next.getDate() + direction);
    const nextCell = this.allCells().find((c) => c.date.getTime() === next.getTime());
    if (!nextCell || nextCell.isPast || !nextCell.isCurrentMonth) return;
    this.selectionCurrent.set(next);
  }

  protected onSelectionCancelled(): void {
    this.selectionAnchor.set(null);
    this.selectionCurrent.set(null);
  }

  protected onSelectionCommit(kind: AvailKind): void {
    const days = this.selectedDays();
    if (days.length === 0) return;
    const cells: SelectedCell[] = days.map((date) => ({ date, slot: 'FULL_DAY' }));
    this.batchDeclareRequested.emit({ cells, kind });
    this.selectionAnchor.set(null);
    this.selectionCurrent.set(null);
  }
}
