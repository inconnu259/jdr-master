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
  /** Créneau d'origine du geste — la bande touchée, ou `FULL_DAY` depuis le corps de la case
   *  ou une case fusionnée (collision 8). Il initialise la portée à l'armement (Story 36.3). */
  slot: DaySlot;
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
  /** Story 36.3, AC4 — « Autre… » de la barre. Depuis cette story, c'est le **seul** chemin vers
   *  `ConstraintPanel`, donc vers la contrainte récurrente (story 1.7), la modification, la
   *  suppression et la découpe. Le tap n'ouvre plus le panneau. */
  readonly declarationPanelRequested = output<SlotSelectedEvent>();

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

  // ─── Sélection (Story 30.3, refondue par la Story 36.3) ────────────────────
  // La sélection porte désormais un CRÉNEAU par cellule, comme en vue Semaine : l'AC1 demande
  // « une sélection d'un seul créneau », ce qu'un modèle à la journée ne peut pas exprimer.
  // Le créneau de l'ancre initialise la PORTÉE ; c'est ensuite la portée qui gouverne, seule,
  // ce qui est marqué à l'écran et ce qui est écrit (AC2, AC3).
  private pointerDown: PointerDownInfo | null = null;
  /** Un geste armé se termine par un `click` que le navigateur émet spontanément : il doit être
   *  avalé, sans quoi il rebasculerait la case qui vient d'être sélectionnée. Remis à zéro au
   *  `pointerdown` suivant, pour qu'un geste sans `click` (glissement se terminant ailleurs) ne
   *  laisse pas le drapeau armé pour le clic légitime d'après. */
  private suppressNextClick = false;
  protected readonly dragArmed = signal(false);
  protected readonly selectionAnchor = signal<SelectedCell | null>(null);
  protected readonly selectionCurrent = signal<SelectedCell | null>(null);
  /** Portée courante (AC2) : **dérivée** de la sélection, non plus imposée à elle. Elle vaut le
   *  créneau commun quand tous les créneaux retenus s'accordent, `null` dès qu'ils divergent —
   *  ce qui devient possible depuis l'AC18, la bascule se faisant créneau par créneau. */
  protected readonly scope = computed<DaySlot | null>(() => {
    const cells = this.selectedCells();
    if (cells.length === 0) return null;
    const first = cells[0].slot;
    return cells.every((c) => c.slot === first) ? first : null;
  });
  /** Ce que `Entrée` valide (AC6). Défaut `UNAVAILABLE` — le résultat que produisait déjà le
   *  chemin clavier, désormais affiché par la barre et modifiable. */
  protected readonly armedKind = signal<AvailKind>('UNAVAILABLE');
  /** AC16 — la date courante : la dernière case cliquée. Un tap court ne déclare rien, mais il
   *  désigne — le rail en montre le détail, et la case doit le dire aussi. */
  protected readonly currentDate = signal<Date | null>(null);

  /** ⚠️ Story 36.3, AC17/AC18 — la sélection est un **ENSEMBLE DE CRÉNEAUX** (`date` + `slot`),
   *  identique en vue Semaine. Un glissement ou `Maj`+flèches y écrit une plage sur la ligne de
   *  l'ancre ; un clic en mode modification y ajoute ou en retire **la bande touchée**, et non
   *  la journée. Toujours trié par date. */
  protected readonly selectedCells = signal<SelectedCell[]>([]);

  private static cellKey(cell: SelectedCell): string {
    return `${cell.date.getTime()}|${cell.slot}`;
  }

  private readonly selectedKeys = computed(
    () => new Set(this.selectedCells().map(CalendarMonthView.cellKey)),
  );

  /** Les jours touchés par la sélection, dédoublonnés — c'est eux que la case entoure. */
  protected readonly selectedDays = computed<Date[]>(() => {
    const seen = new Map<number, Date>();
    for (const c of this.selectedCells()) seen.set(c.date.getTime(), c.date);
    return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
  });

  private readonly selectedDayTimes = computed(
    () => new Set(this.selectedDays().map((d) => d.getTime())),
  );

  /** Écrit la plage ancre → cible, au créneau de l'ancre. Un glissement **remplace** la
   *  sélection : il exprime une intention continue, pas un ajout. */
  private setRange(current: SelectedCell): void {
    const anchor = this.selectionAnchor();
    if (!anchor) return;
    this.selectionCurrent.set(current);
    this.selectedCells.set(
      monthRangeDays(anchor.date, current.date).map((date) => ({ date, slot: anchor.slot })),
    );
  }

  /** AC17/AC18 — bascule **un créneau** dans la sélection en cours. Retirer le dernier **quitte
   *  le mode modification** : la barre disparaît d'elle-même, sans passer par « Annuler ». */
  private toggleCell(date: Date, slot: DaySlot): void {
    const key = CalendarMonthView.cellKey({ date, slot });
    const cells = this.selectedCells();
    const without = cells.filter((c) => CalendarMonthView.cellKey(c) !== key);
    if (without.length !== cells.length) {
      this.selectedCells.set(without);
      if (without.length === 0) {
        this.selectionAnchor.set(null);
        this.selectionCurrent.set(null);
      }
      return;
    }
    this.selectedCells.set(
      [...cells, { date, slot }].sort((a, b) => a.date.getTime() - b.date.getTime()),
    );
    // L'ancre suit le dernier créneau ajouté : c'est lui que « Autre… » ouvrira, et le point de
    // départ d'une extension au clavier.
    this.selectionAnchor.set({ date, slot });
    this.selectionCurrent.set({ date, slot });
  }

  /** AC2 — la portée s'applique à **toute** la sélection : elle réécrit le créneau de chaque
   *  jour retenu. C'est une ACTION, pas un filtre — après quoi un clic peut encore affiner
   *  créneau par créneau. */
  protected onScopeChange(slot: DaySlot): void {
    this.selectedCells.set(this.selectedDays().map((date) => ({ date, slot })));
  }

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
    // ⚠️ Story 36.3, AC15 — hors mode modification, un tap court est un geste de LECTURE : il
    // désigne le créneau, le rail suit (AC2 de 36.1), et rien ne s'ouvre. Ni le panneau (retiré
    // par l'AC1), ni la barre — celle-ci appartient à l'appui maintenu et au glissement.
    this.slotSelected.emit({ date, slot });
    this.currentDate.set(date);
    // Un geste armé (appui maintenu ou glissement) se termine par un `click` que le navigateur
    // émet de lui-même. Sans cette garde il rebasculerait aussitôt la case qu'on vient de
    // sélectionner — et un appui maintenu simple ressortait donc du mode modification à la
    // relâche. Défaut constaté à l'écran ; la vue Semaine y échappait faute de (click).
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    // AC17/AC18 — une fois la barre ouverte, le même clic BASCULE le créneau touché. Le geste ne
    // change pas de nature, c'est le mode qui lui donne son sens.
    if (this.selectedCells().length > 0) this.toggleCell(date, slot);
  }

  /** Sélection d'une seule cellule, armée par `Espace` ou par `1`/`2`/`3` (AC7, AC15).
   *  La portée part du créneau visé : c'est la seule valeur qui rende la collision 8 vraie sans
   *  que l'utilisateur ait à toucher la barre. */
  private armSelection(date: Date, slot: DaySlot): void {
    this.selectionAnchor.set({ date, slot });
    this.selectionCurrent.set({ date, slot });
    this.selectedCells.set([{ date, slot }]);
  }

  /** Équivalent clavier de l'appui maintenu (AC15). Le clavier n'a pas de « geste long » : une
   *  frappe délibérée sur `Espace` ou `1`/`2`/`3` **est** l'intention de déclarer, elle arme donc
   *  directement. Le rail suit aussi, comme pour un tap. */
  protected onCellKeySelect(cell: DayCell, slot: DaySlot): void {
    if (cell.isPast || !cell.isCurrentMonth) return;
    this.slotSelected.emit({ date: cell.date, slot });
    this.armSelection(cell.date, slot);
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
    return this.selectedDayTimes().has(cell.date.getTime());
  }

  /** Story 36.3, AC16 — la date courante : la dernière case cliquée, celle dont le rail montre
   *  le détail. Distinct de `.selected`, qui dit « ce jour partira à l'écriture ». */
  protected isCurrentDay(cell: DayCell): boolean {
    return this.currentDate()?.getTime() === cell.date.getTime();
  }

  /** AC2/AC3/AC18 — le marquage suit la sélection **créneau par créneau**. Un créneau retenu en
   *  `FULL_DAY` allume les trois bandes du jour : c'est la journée entière qui partira. */
  protected isBandSelected(cell: DayCell, slot: DaySlot): boolean {
    const keys = this.selectedKeys();
    const time = cell.date.getTime();
    return keys.has(`${time}|${slot}`) || keys.has(`${time}|FULL_DAY`);
  }

  /** true pendant qu'un pointeur est actuellement enfoncé sur la grille — utilisé pour ne bloquer
   *  le menu contextuel natif (clic droit) que pendant un geste, pas en permanence. */
  protected isGestureActive(): boolean {
    return this.pointerDown !== null;
  }

  // ─── Geste souris/tactile ───────────────────────────────────────────────
  protected onCellPointerDown(
    event: PointerEvent,
    cell: DayCell,
    slot: DaySlot = 'FULL_DAY',
    fromBand = false,
  ): void {
    if (cell.isPast || !cell.isCurrentMonth) return;
    // Seul le bouton principal peut amorcer un geste (clic droit/milieu = menu contextuel/autre).
    if (event.button !== 0) return;
    // Un geste est déjà en cours pour un autre pointeur (deuxième doigt, paume) : on l'ignore
    // plutôt que de remplacer silencieusement l'état du premier.
    if (this.pointerDown && this.pointerDown.pointerId !== event.pointerId) return;
    this.clearPointerState();
    this.suppressNextClick = false;
    this.dragArmed.set(false);
    this.pointerDown = {
      cell,
      slot,
      pointerId: event.pointerId,
      pointerType: event.pointerType as GesturePointerType,
      startX: event.clientX,
      startY: event.clientY,
      // ⚠️ Story 36.3, AC15 — l'appui maintenu arme la barre **pour tous les pointeurs**, souris
      // comprise, et non plus seulement au doigt. C'est lui qui sépare désormais lire (tap court)
      // de déclarer (appui long). Le glissement reste la seconde porte, plus découvrable en
      // ordinateur.
      longPressTimer: setTimeout(() => this.armDrag(cell, slot), LONG_PRESS_MS),
      fromBand,
    };
  }

  /** Un pointerdown parti d'une bande ne doit pas buller vers la case (sinon un tap sur la
   *  bande rejouerait aussi un tap FULL_DAY, cf. test de non-régression) — on démarre donc
   *  manuellement le même état de geste que sur la case elle-même, marqué fromBand. */
  protected onBandPointerDown(event: PointerEvent, cell: DayCell, slot: DaySlot): void {
    this.onCellPointerDown(event, cell, slot, true);
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
      // Story 36.3, AC5 — un geste qui DÉMARRE vertical appartient au défilement de la page :
      // « aucun geste de pointeur ne vise la journée » (collision 1). Le test d'axe ne gouverne
      // que l'ARMEMENT ; une fois armée, la sélection s'étend librement, y compris en enjambant
      // des lignes de semaine. Le tactile n'en a pas besoin : l'appui maintenu l'assure déjà.
      if (Math.abs(dx) <= Math.abs(dy)) {
        this.cancelLongPressTimer();
        return;
      }
      this.armDrag(down.cell, down.slot);
    }

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-cell-date]');
    if (!target) return;
    const dateMs = Number(target.dataset['cellDate']);
    const cellMatch = this.allCells().find((c) => c.date.getTime() === dateMs);
    if (!cellMatch || cellMatch.isPast || !cellMatch.isCurrentMonth) return;
    const anchor = this.selectionAnchor();
    if (!anchor) return;
    this.setRange({ date: cellMatch.date, slot: anchor.slot });
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
    // Le geste a armé : le `click` que le navigateur va émettre derrière ce `pointerup` ne doit
    // pas être pris pour une bascule, sans quoi la sélection qu'on vient d'armer se déferait.
    this.suppressNextClick = true;
    // La sélection reste affichée (anchor/current conservés) — la barre reste visible
    // jusqu'à validation ou annulation par l'utilisateur.
  }

  private armDrag(cell: DayCell, slot: DaySlot): void {
    // Le glissement souris peut armer avant l'échéance de l'appui maintenu : sans cette
    // annulation, le minuteur rejouerait armDrag() et ramènerait l'ancre à la case de départ,
    // effaçant l'extension en cours.
    this.cancelLongPressTimer();
    this.dragArmed.set(true);
    this.armSelection(cell.date, slot);
  }

  private cancelLongPressTimer(): void {
    if (this.pointerDown?.longPressTimer) clearTimeout(this.pointerDown.longPressTimer);
  }

  private clearPointerState(): void {
    this.cancelLongPressTimer();
    this.pointerDown = null;
  }

  // ─── Clavier ─────────────────────────────────────────────────────────────
  /** Story 36.3, AC6/AC7 — `Entrée` est **réservée à la validation**. Elle valide ce que la barre
   *  affiche (`armedKind`), au lieu de « indisponible » d'office comme le faisait la story 30.3 ;
   *  et hors sélection elle ne fait plus rien : `Espace` garde la journée entière.
   *  [Source: EXPERIENCE.md §6 bis — encadré de dette, ses deux points] */
  protected onCellEnterKey(): void {
    if (!this.selectionAnchor()) return;
    this.onSelectionCommit(this.armedKind());
  }

  protected onShiftArrow(cell: DayCell, direction: -1 | 1): void {
    if (cell.isPast) return;
    // Ancre posée sans `current` : tant qu'aucune extension n'a abouti, aucune sélection ne
    // s'affiche. C'est ce qui fait qu'un Maj+flèche buttant sur le bord du mois ne sélectionne
    // rien du tout (garde issue de la revue de code de la story 30.3) — ne pas passer par
    // `armSelection()`, qui pose les deux.
    const anchor: SelectedCell = this.selectionAnchor() ?? { date: cell.date, slot: 'FULL_DAY' };
    if (!this.selectionAnchor()) this.selectionAnchor.set(anchor);
    const currentSel = this.selectionCurrent() ?? anchor;
    const next = new Date(currentSel.date);
    next.setDate(next.getDate() + direction);
    const nextCell = this.allCells().find((c) => c.date.getTime() === next.getTime());
    if (!nextCell || nextCell.isPast || !nextCell.isCurrentMonth) return;
    this.setRange({ date: next, slot: anchor.slot });
  }

  protected onSelectionCancelled(): void {
    this.selectionAnchor.set(null);
    this.selectionCurrent.set(null);
    this.selectedCells.set([]);
    this.armedKind.set('UNAVAILABLE');
  }

  protected onArmedKindChange(kind: AvailKind): void {
    this.armedKind.set(kind);
  }

  /** AC4 — « Autre… » remet l'intention au panneau, avec la cellule d'ancrage et la portée
   *  courante. La sélection a fait son office : elle a désigné la cible, elle s'effface pour ne
   *  pas survivre à un panneau qui gouverne désormais autre chose (récurrence, plage). */
  protected onOtherRequested(): void {
    // Le premier créneau RETENU, pas l'ancre : un changement de portée réécrit la sélection
    // sans toucher à l'ancre, qui porterait alors un créneau périmé.
    const target = this.selectedCells()[0] ?? this.selectionAnchor();
    if (!target) return;
    this.declarationPanelRequested.emit({ date: target.date, slot: target.slot });
    this.onSelectionCancelled();
  }

  protected onSelectionCommit(kind: AvailKind): void {
    const cells = this.selectedCells();
    if (cells.length === 0) return;
    this.batchDeclareRequested.emit({ cells, kind });
    this.onSelectionCancelled();
  }
}
