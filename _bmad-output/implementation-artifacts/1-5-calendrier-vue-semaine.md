---
status: done
baseline_commit: 1885917846c6bc4df8dd03d49949cc6ab79314cd
---

# Story 1.5 : Calendrier personnel — vue semaine

As a user,
I want to switch to a weekly view of my calendar,
So that I can see slot-level detail and manage constraints with more precision.

## Acceptance Criteria

**Given** the `/profile/calendar` page is displayed
**When** the user taps/clicks the "Vue semaine" toggle
**Then** `CalendarWeekView` replaces `CalendarMonthView` (no navigation away)
**And** the current week (Lundi–Dimanche) is shown as a 7-column × 3-row grid
**And** row labels on the left show "Matin", "Après-midi", "Soirée"
**And** column headers show abbreviated day names + date number (e.g. "Lun 30", "Mar 1")

**Given** the week view is displayed
**When** the user looks at a cell (e.g. Mercredi × Soirée)
**Then** the cell background color reflects the slot status (AVAILABLE / UNAVAILABLE / UNKNOWN)
**And** explicitly declared slots show a small label (e.g. "Indispo · Récurrent")
**And** UNKNOWN cells (outside covered period) have a dashed border

**Given** the week view is displayed
**When** the user clicks/taps a cell
**Then** the ConstraintPanel opens (reusing Story 1.4 component — no changes to it)
**And** past cells (before today) are non-clickable (same rule as month view)

**Given** the week view
**When** the user taps `<` or `>` navigation
**Then** the displayed week shifts by 7 days and declarations are recalculated

**Given** the user is not on the current week
**When** they look at the navigation bar
**Then** a "today" icon button is visible to return to the current week
**And** the button is hidden (visibility: hidden, not removed) when already on the current week

**Given** the user switches from week view back to month view
**When** they click "Vue mois"
**Then** the month view is restored showing the same month as the current week start

**Given** the user switches from month view to week view
**When** they click "Vue semaine"
**Then** the week view starts on the week containing the month view's currently displayed date

## Tasks / Subtasks

- [x] Task 1: Créer `CalendarWeekView` (nouveau composant standalone)
  - [x] 1.1 — Interfaces + fonction `buildWeek()` : `WeekCell` (date, label, isToday, isPast, morning/afternoon/evening chacun avec status/preview/declLabel), `getWeekStart(date)` retourne le lundi UTC
  - [x] 1.2 — Signals internes : `startDate = input<Date>(new Date())`, `displayWeekStart = signal<Date>(...)`, effect synchronisant `displayWeekStart` sur `startDate` via `untracked()`
  - [x] 1.3 — Navigation : `prevWeek()`, `nextWeek()`, `goToToday()`, `isCurrentWeek()` computed, output `displayDateChange = output<Date>()`
  - [x] 1.4 — `cells = computed(() => buildWeek(displayWeekStart(), declarations(), pendingDecl()))` utilisant `computeDisplayStatus` + matching de déclaration pour le label
  - [x] 1.5 — Template `calendar-week-view.html` : grille CSS `grid-template-columns: auto repeat(7, 1fr)`, row labels, en-têtes de colonnes, cellules colorées par `data-status`, classe `.past`, `.unknown` (bordure pointillée), label de contrainte, nav + bouton today
  - [x] 1.6 — SCSS `calendar-week-view.scss` : `.week-grid`, `.col-header`, `.row-label`, `.slot-cell` avec fond par `data-status`, `.slot-cell.unknown` en pointillé, `.slot-cell.past` opacité 0.3 pointer-events none, `.decl-label` en petit texte
  - [x] 1.7 — `aria-label` sur chaque cellule : format "Matin, lundi 30 juin : disponible"

- [x] Task 2: Mettre à jour `CalendarMonthView` (ajouts minimes, rétrocompatible)
  - [x] 2.1 — Ajouter `initialDate = input<Date | null>(null)` ; dans le constructeur, si `initialDate()` non null, initialiser `displayDate` au 1er du mois de `initialDate()`
  - [x] 2.2 — Ajouter `displayDateChange = output<Date>()` ; émettre dans `prevMonth()`, `nextMonth()`, `goToToday()`

- [x] Task 3: Mettre à jour `CalendarView` — toggle + synchronisation de date
  - [x] 3.1 — Ajouter signal `protected readonly view = signal<'month' | 'week'>('month')` et `protected readonly sharedDate = signal<Date>(new Date())`
  - [x] 3.2 — Importer `CalendarWeekView` + `MatButtonToggleModule` dans `imports[]`
  - [x] 3.3 — Handlers `onMonthDateChange(d: Date)` et `onWeekDateChange(d: Date)` qui font `this.sharedDate.set(d)`
  - [x] 3.4 — Template : `mat-button-toggle-group` au-dessus du calendrier ; `@if (view() === 'month') { <app-calendar-month-view [initialDate]="sharedDate()" (displayDateChange)="onMonthDateChange($event)" ... /> } @else { <app-calendar-week-view [startDate]="sharedDate()" (displayDateChange)="onWeekDateChange($event)" ... /> }`

- [x] Task 4: Tests Vitest sur fonctions pures de `CalendarWeekView`
  - [x] 4.1 — `getWeekStart` : lundi d'un mercredi, d'un dimanche (cas limite), d'un lundi lui-même
  - [x] 4.2 — `buildWeek` : 7 jours retournés, `isToday` correct sur la cellule du jour actuel, `isPast` correct sur les jours passés

### Review Findings (AI) — 2026-06-28

- [x] [Review][Patch] aria-label utilise `cell.label` abrégé au lieu du format long "lundi 30 juin" [`calendar-week-view.ts:cellAriaLabel`]
- [x] [Review][Patch] `keyup.space` ne prévient pas le scroll page sur les cellules [`calendar-week-view.html`]
- [x] [Review][Patch] `computeDisplayStatus` appelé 3× par slot dans la preview path (perf) [`calendar-week-view.ts:buildWeek`]
- [x] [Review][Patch] `view.set($event.value)` sans cast de type sur l'event `mat-button-toggle` [`calendar-view.html`]
- [x] [Review][Defer] `todayMidnight` static — stale après minuit (même pattern dans `calendar-month-view.ts`) [`calendar-week-view.ts`] — deferred, pre-existing
- [x] [Review][Defer] `getWeekStart` en temps local : les utilisateurs UTC− voient la semaine décalée le dimanche soir [`calendar-week-view.ts:getWeekStart`] — deferred, pre-existing pattern (même approche dans month view)
- [x] [Review][Defer] `findWeekDecl` double vérification d'expiration avec sémantiques différentes (timestamp vs UTC midnight) [`calendar-week-view.ts:findWeekDecl`] — deferred, pre-existing (copié de la spec)

## Dev Notes

### Contexte de l'existant (lire avant d'écrire quoi que ce soit)

#### `CalendarMonthView` — patterns réutilisables

Fichier : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`

Structure actuelle (à reproduire/adapter dans WeekView) :
- `declarations = input<AvailabilityDeclarationDto[]>([])` — déclarations actives passées par CalendarView
- `pendingDto = input<CreateAvailabilityDto | null>(null)` — preview en cours
- `slotSelected = output<SlotSelectedEvent>()` — émis quand l'utilisateur clique une cellule
- `displayDate = signal(new Date())` — date affichée (mois courant)
- `pendingDecl = computed(...)` — transforme `pendingDto` en `AvailabilityDeclarationDto` via `toFakeDecl()`
- `weeks = computed(() => buildMonth(...))` — calcul réactif de la grille

Fonction `toFakeDecl` (à copier telle quelle dans WeekView) :
```typescript
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
```

**Pattern des dates passées** (à reproduire dans WeekView) :
```typescript
// Dans buildMonth / buildWeek
const today = new Date();
today.setHours(0, 0, 0, 0);
const todayTime = today.getTime();
// ...
isPast: cellMidnight.getTime() < todayTime
```

**Guard dans onCellClick** :
```typescript
if (midnight.getTime() < this.todayMidnight) return; // date passée — ignorée
```

**Bouton "aujourd'hui"** — déjà patché pour Story 1.5 avant sa création (fix UX) :
```html
<button mat-icon-button (click)="goToToday()" aria-label="Revenir au mois actuel" class="today-btn"
        [style.visibility]="isCurrentMonth() ? 'hidden' : 'visible'">
  <mat-icon>today</mat-icon>
</button>
```
→ Reproduire exactement ce pattern dans CalendarWeekView avec `isCurrentWeek()`.

**`computeDisplayStatus`** (importé depuis `compute-display-status.ts`) :
```typescript
computeDisplayStatus(utcDate: Date, 'MORNING' | 'AFTERNOON' | 'EVENING', declarations): SlotStatus
```
`utcDate` DOIT être construit avec `new Date(Date.UTC(y, m, d))` — jamais `new Date(y, m, d)`.

#### `CalendarView` — état actuel

Fichier : `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`

Signals actuels : `declarations`, `loading`, `error`, `panelOpen`, `selectedDate`, `selectedSlot`, `selectedExisting`, `pendingDto`.

La vue HTML est actuellement : `<app-calendar-month-view ... />` uniquement. Task 3 ajoute le toggle au-dessus.

Le `ConstraintPanel` est câblé dans `calendar-view.html` indépendamment de la vue (mois ou semaine) — il s'ouvre dès que `panelOpen()` est true. Aucun changement nécessaire côté panel.

#### `compute-display-status.ts` — déjà mis à jour (Story 1.4 + bugs RECURRING)

Fichier : `apps/web/src/app/core/availability/compute-display-status.ts`

La fonction `matchesDate` inclut maintenant les bornes RECURRING :
```typescript
function matchesDate(d: AvailabilityDeclarationDto, date: Date): boolean {
  if (d.recurKind === 'RECURRING') {
    if (d.dayOfWeek !== date.getUTCDay()) return false;
    if (d.startDate && date < toUTCMidnight(d.startDate)) return false;
    return date <= toUTCMidnight(d.expiresAt);
  }
  // ... PUNCTUAL range check
}
```
**Ne pas modifier ce fichier** — la logique est correcte.

---

### Architecture `CalendarWeekView`

#### Interfaces (dans `calendar-week-view.ts`)

```typescript
interface SlotData {
  status: SlotStatus;
  preview: SlotStatus | null;
  declLabel: string | null; // "Indispo · Récurrent" | "Dispo · Ponctuel" | null
}

interface WeekCell {
  date: Date;            // date locale (pour onCellClick)
  label: string;         // "Lun 30" (formaté avec Intl.DateTimeFormat)
  isToday: boolean;
  isPast: boolean;
  morning: SlotData;
  afternoon: SlotData;
  evening: SlotData;
}
```

#### Fonction `getWeekStart(date: Date): Date`

```typescript
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // ramène au lundi
  d.setDate(d.getDate() + diff);
  return d;
}
```

#### Fonction `buildWeek`

```typescript
function buildWeek(
  weekStart: Date,
  decls: AvailabilityDeclarationDto[],
  pendingDecl: AvailabilityDeclarationDto | null,
): WeekCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const now = new Date();
  const declsWithPending = pendingDecl ? [...decls, pendingDecl] : decls;

  return Array.from({ length: 7 }, (_, i) => {
    const cellLocal = new Date(weekStart);
    cellLocal.setDate(weekStart.getDate() + i);
    const cellMidnight = new Date(cellLocal);
    cellMidnight.setHours(0, 0, 0, 0);
    const utcCell = new Date(Date.UTC(
      cellLocal.getFullYear(), cellLocal.getMonth(), cellLocal.getDate()
    ));

    const computeSlot = (slot: 'MORNING' | 'AFTERNOON' | 'EVENING'): SlotData => {
      const status = computeDisplayStatus(utcCell, slot, decls);
      const preview = pendingDecl
        ? computeDisplayStatus(utcCell, slot, declsWithPending) !== status
          ? computeDisplayStatus(utcCell, slot, declsWithPending)
          : null
        : null;
      const matchingDecl = findWeekDecl(decls, utcCell, slot, now);
      return {
        status,
        preview,
        declLabel: matchingDecl ? formatDeclLabel(matchingDecl) : null,
      };
    };

    return {
      date: cellLocal,
      label: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' }).format(cellLocal),
      isToday: cellMidnight.getTime() === todayTime,
      isPast: cellMidnight.getTime() < todayTime,
      morning: computeSlot('MORNING'),
      afternoon: computeSlot('AFTERNOON'),
      evening: computeSlot('EVENING'),
    };
  });
}
```

#### Fonctions utilitaires

```typescript
function findWeekDecl(
  decls: AvailabilityDeclarationDto[],
  utcDate: Date,
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING',
  now: Date,
): AvailabilityDeclarationDto | null {
  return decls.find((d) => {
    if (new Date(d.expiresAt) <= now) return false;
    const slotMatch = d.slot === 'FULL_DAY' || d.slot === slot;
    if (!slotMatch) return false;
    if (d.recurKind === 'RECURRING') {
      if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
      if (d.startDate) {
        const start = toUTCMidnight(d.startDate);
        if (utcDate < start) return false;
      }
      return utcDate <= toUTCMidnight(d.expiresAt);
    }
    if (!d.startDate || !d.endDate) return false;
    const start = new Date(d.startDate.substring(0, 10) + 'T00:00:00Z');
    const end = new Date(d.endDate.substring(0, 10) + 'T00:00:00Z');
    return utcDate >= start && utcDate <= end;
  }) ?? null;
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
```

#### Component class

```typescript
@Component({
  selector: 'app-calendar-week-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './calendar-week-view.html',
  styleUrl: './calendar-week-view.scss',
})
export class CalendarWeekView {
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);
  readonly pendingDto = input<CreateAvailabilityDto | null>(null);
  readonly startDate = input<Date>(new Date()); // synchronisation avec CalendarView

  readonly slotSelected = output<SlotSelectedEvent>();
  readonly displayDateChange = output<Date>(); // permet à CalendarView de tracker la date courante

  protected readonly displayWeekStart = signal<Date>(getWeekStart(new Date()));

  private readonly pendingDecl = computed<AvailabilityDeclarationDto | null>(() => {
    const dto = this.pendingDto();
    return dto ? toFakeDecl(dto) : null;
  });

  protected readonly cells = computed(() =>
    buildWeek(this.displayWeekStart(), this.declarations(), this.pendingDecl()),
  );

  protected readonly weekLabel = computed(() => {
    const start = this.displayWeekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
    const fmtYear = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    // Si même mois : "30 juin – 6 juil 2026" ; sinon "30 juin – 6 juil 2026"
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${fmtYear(end)}`
      : `${fmt(start)} – ${fmtYear(end)}`;
  });

  protected readonly isCurrentWeek = computed(() => {
    const ws = this.displayWeekStart();
    const curr = getWeekStart(new Date());
    return ws.getTime() === curr.getTime();
  });

  private readonly todayMidnight = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  protected readonly SLOT_ROWS: { key: 'morning' | 'afternoon' | 'evening'; label: string; slot: DaySlot }[] = [
    { key: 'morning', label: 'Matin', slot: 'MORNING' },
    { key: 'afternoon', label: 'Après-midi', slot: 'AFTERNOON' },
    { key: 'evening', label: 'Soirée', slot: 'EVENING' },
  ];

  constructor() {
    // Synchronise avec l'input startDate quand CalendarView switche de vue
    effect(() => {
      const d = this.startDate();
      untracked(() => this.displayWeekStart.set(getWeekStart(d)));
    });
  }

  prevWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(ws);
    next.setDate(ws.getDate() - 7);
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  nextWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(ws);
    next.setDate(ws.getDate() + 7);
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  goToToday(): void {
    const today = getWeekStart(new Date());
    this.displayWeekStart.set(today);
    this.displayDateChange.emit(today);
  }

  protected onCellClick(date: Date, slot: DaySlot): void {
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    if (midnight.getTime() < this.todayMidnight) return;
    this.slotSelected.emit({ date, slot });
  }

  protected cellAriaLabel(cell: WeekCell, slotData: SlotData, slotName: string): string {
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'inconnu',
    };
    const status = slotData.preview ?? slotData.status;
    return `${slotName}, ${cell.label} : ${labels[status]}`;
  }
}
```

#### Template `calendar-week-view.html`

Structure :
```html
<div class="calendar-week">
  <!-- Navigation -->
  <div class="week-nav">
    <button mat-icon-button (click)="prevWeek()" aria-label="Semaine précédente">
      <mat-icon>chevron_left</mat-icon>
    </button>
    <h2 class="week-title">{{ weekLabel() }}</h2>
    <button mat-icon-button (click)="nextWeek()" aria-label="Semaine suivante">
      <mat-icon>chevron_right</mat-icon>
    </button>
    <button mat-icon-button (click)="goToToday()" class="today-btn" aria-label="Revenir à la semaine actuelle"
            [style.visibility]="isCurrentWeek() ? 'hidden' : 'visible'">
      <mat-icon>today</mat-icon>
    </button>
  </div>

  @if (loading()) {
    <div class="loading-overlay"><mat-spinner diameter="40" /></div>
  } @else {
    <div class="week-grid" role="grid">
      <!-- En-têtes colonnes -->
      <div class="grid-cell header-corner"></div>
      @for (cell of cells(); track cell.date.getTime()) {
        <div class="grid-cell col-header" [class.today]="cell.isToday">
          {{ cell.label }}
        </div>
      }

      <!-- Lignes de slots -->
      @for (row of SLOT_ROWS; track row.key) {
        <div class="grid-cell row-label">{{ row.label }}</div>
        @for (cell of cells(); track cell.date.getTime()) {
          @let slotData = cell[row.key];
          @let displayStatus = slotData.preview ?? slotData.status;
          <div
            class="grid-cell slot-cell"
            [attr.data-status]="displayStatus"
            [class.past]="cell.isPast"
            [class.today-col]="cell.isToday"
            [class.preview]="slotData.preview !== null"
            [class.unknown]="displayStatus === 'UNKNOWN'"
            [attr.role]="cell.isPast ? 'presentation' : 'button'"
            [attr.tabindex]="cell.isPast ? null : 0"
            [attr.aria-label]="cell.isPast ? null : cellAriaLabel(cell, slotData, row.label)"
            (click)="onCellClick(cell.date, row.slot)"
            (keyup.enter)="onCellClick(cell.date, row.slot)"
            (keyup.space)="onCellClick(cell.date, row.slot)"
          >
            @if (slotData.declLabel) {
              <span class="decl-label">{{ slotData.declLabel }}</span>
            }
          </div>
        }
      }
    </div>
  }
</div>
```

**Note `@let`** : `@let` est une syntaxe Angular 18+ disponible dans Angular 22. Si la CI n'accepte pas `@let`, utiliser des getters dans la classe ou dupliquer l'expression.

#### SCSS `calendar-week-view.scss`

Points clés :
- `.week-grid` : `display: grid; grid-template-columns: auto repeat(7, minmax(0, 1fr)); gap: 2px;`
- `.header-corner` : cellule vide en haut à gauche (aligne avec row-label)
- `.col-header` : en-tête de colonne, `text-align: center`, `font-size: 0.7rem`, `&.today { background: var(--mat-sys-primary); color: var(--mat-sys-on-primary); border-radius: 50%; }`
- `.row-label` : `font-size: 0.65rem; font-weight: 600; writing-mode: vertical-rl; text-orientation: mixed;` **OU** horizontal avec `white-space: nowrap; padding: 0 6px;` — choisir selon rendu. Préférer horizontal sur desktop.
- `.slot-cell` : `min-height: 44px; cursor: pointer; border-radius: 4px; transition: background 0.1s; display: flex; align-items: flex-start; padding: 4px;`
- Couleurs par `data-status` : mêmes variables CSS que la vue mois
  ```scss
  &[data-status='AVAILABLE'] { background: color-mix(in srgb, var(--color-available) 25%, transparent); }
  &[data-status='UNAVAILABLE'] { background: color-mix(in srgb, var(--color-unavailable) 25%, transparent); }
  &[data-status='UNKNOWN'] { background: transparent; border: 1px dashed var(--color-unknown); }
  ```
- `.slot-cell.past` : `opacity: 0.3; cursor: default; pointer-events: none;`
- `.slot-cell.preview` : `animation: segmentPulse 1.2s ease-in-out infinite alternate;` (déjà défini dans month-view.scss — redéfinir localement)
- `.decl-label` : `font-size: 0.6rem; line-height: 1.2; color: var(--mat-sys-on-surface); opacity: 0.8; word-break: break-word;`

#### Changements dans `CalendarMonthView`

**`calendar-month-view.ts`** — ajouts minimes :

```typescript
// Nouvel input (avant displayDate)
readonly initialDate = input<Date | null>(null);

// Nouveau output (après slotSelected)
readonly displayDateChange = output<Date>();

// Dans le constructor : après l'initialisation de displayDate
constructor() {
  const init = this.initialDate();
  if (init) {
    this.displayDate.set(new Date(init.getFullYear(), init.getMonth(), 1));
  }
}

// Dans prevMonth(), nextMonth(), goToToday() : ajouter l'émission
prevMonth(): void {
  const d = this.displayDate();
  const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  this.displayDate.set(next);
  this.displayDateChange.emit(next); // ← ajouter
}
// etc.
```

**Note** : `initialDate()` dans un constructeur Angular 22 est valide — les inputs sont disponibles dès la construction avec la nouvelle API `input()`.

#### Changements dans `CalendarView`

**`calendar-view.ts`** — ajouts :

```typescript
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { CalendarWeekView } from '../calendar-week-view/calendar-week-view';

// Ajouter dans imports:
imports: [CalendarMonthView, CalendarWeekView, ConstraintPanel, MatButtonToggleModule],

// Nouveaux signals dans la classe :
protected readonly view = signal<'month' | 'week'>('month');
protected readonly sharedDate = signal<Date>(new Date());

// Nouveaux handlers :
protected onMonthDateChange(d: Date): void { this.sharedDate.set(d); }
protected onWeekDateChange(d: Date): void { this.sharedDate.set(d); }
```

**`calendar-view.html`** — ajout du toggle et du branchement conditionnel :

```html
<div class="calendar-page">
  @if (error()) {
    <p class="calendar-error" role="alert">{{ error() }}</p>
  }
  <div class="view-toggle">
    <mat-button-toggle-group [value]="view()" (change)="view.set($event.value)" aria-label="Vue du calendrier">
      <mat-button-toggle value="month">Vue mois</mat-button-toggle>
      <mat-button-toggle value="week">Vue semaine</mat-button-toggle>
    </mat-button-toggle-group>
  </div>

  @if (view() === 'month') {
    <app-calendar-month-view
      [declarations]="declarations()"
      [loading]="loading()"
      [pendingDto]="pendingDto()"
      [initialDate]="sharedDate()"
      (slotSelected)="onSlotSelected($event)"
      (displayDateChange)="onMonthDateChange($event)"
    />
  } @else {
    <app-calendar-week-view
      [declarations]="declarations()"
      [loading]="loading()"
      [pendingDto]="pendingDto()"
      [startDate]="sharedDate()"
      (slotSelected)="onSlotSelected($event)"
      (displayDateChange)="onWeekDateChange($event)"
    />
  }
</div>

@if (panelOpen()) {
  <div class="constraint-backdrop" (click)="closePanel()" aria-hidden="true"></div>
  <app-constraint-panel
    [date]="selectedDate()"
    [slot]="selectedSlot()"
    [existingDeclaration]="selectedExisting()"
    (saved)="onPanelSaved()"
    (deleted)="onPanelDeleted()"
    (cancelled)="closePanel()"
    (formChanged)="onFormChanged($event)"
  />
}
```

**`calendar-view.scss`** — ajout :

```scss
.view-toggle {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
```

---

### Imports Angular à ne pas oublier

`CalendarWeekView` needs:
```typescript
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto, DaySlot, SlotStatus } from '@master-jdr/shared';
import { computeDisplayStatus } from '../../../core/availability/compute-display-status';
```

Note : `SlotSelectedEvent` est exporté depuis `calendar-month-view.ts` — l'importer de là.

---

### Tests Vitest (Task 4)

Créer `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts`.

```typescript
import { describe, expect, it } from 'vitest';
// importer getWeekStart, buildWeek depuis calendar-week-view.ts (exporter ces fonctions)

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => { ... });
  it('returns previous Monday for a Sunday', () => { ... });
  it('returns same day for a Monday', () => { ... });
});

describe('buildWeek', () => {
  it('returns 7 cells', () => { ... });
  it('marks today as isToday', () => { ... });
  it('marks past days as isPast', () => { ... });
});
```

**Important** : exporter `getWeekStart` et `buildWeek` du fichier `.ts` pour les rendre testables sans DOM.

---

### Contraintes et pièges courants

1. **UTC vs local** : les dates passées à `computeDisplayStatus` doivent être `Date.UTC(y,m,d)`. Les dates passées à `onCellClick` sont des dates locales (pour `new Date(date).setHours(0,0,0,0)`). Ne pas mélanger.

2. **`effect()` et inputs Angular 22** : dans le constructeur de `CalendarWeekView`, l'`effect()` qui synchronise `displayWeekStart` sur `startDate` doit utiliser `untracked()` pour l'écriture du signal interne, sinon Angular lance un warning "signal written during effect".

3. **`@let` dans le template** : Angular 18+ supporte `@let`. Si `tsc` échoue, utiliser un getter `getSlotData(cell: WeekCell, key: 'morning' | 'afternoon' | 'evening'): SlotData` dans la classe.

4. **`mat-button-toggle-group` value binding avec signal** : `[value]="view()"` (lecture) + `(change)="view.set($event.value)"` (écriture) — pas de two-way binding sur un signal.

5. **`initialDate` dans CalendarMonthView** : lire `this.initialDate()` dans le constructeur Angular 22 est valide car les inputs basés sur `input()` sont disponibles dès la construction (contrairement à `@Input()` qui nécessitait `ngOnInit`).

6. **Ne pas modifier `ConstraintPanel`** : il est déjà connecté dans `CalendarView` et fonctionne indépendamment de la vue active. Aucune modification requise.

7. **`findMatchingDeclaration` dans `CalendarView`** : doit continuer à fonctionner pour les deux vues (mois et semaine). Aucune modification — il travaille sur `selectedDate` et `selectedSlot` qui sont identiques dans les deux cas.

---

### Acceptance criteria mapping

| AC | Task |
|----|------|
| Toggle vue semaine → CalendarWeekView affiché | Task 3 |
| Semaine Mon–Dim, grille 7×3, labels Matin/AM/Soir, en-têtes | Task 1 |
| Couleur fond par statut, label contrainte, bordure pointillée UNKNOWN | Task 1.5–1.6 |
| Clic cellule → ConstraintPanel | Task 1 (slotSelected output) |
| Dates passées non cliquables | Task 1.1 (isPast) + 1.5 (guard) |
| Navigation < / > semaine + bouton today | Task 1.2–1.3 |
| Bouton today hidden quand semaine courante | Task 1.3 (isCurrentWeek) |
| Switch week→month : même mois | Task 2 + Task 3 (sharedDate) |
| Switch month→week : même semaine | Task 3 (startDate input) |

## Dev Agent Record

### Agent Model Used

create-story workflow (claude-sonnet-4-6) / dev: claude-sonnet-4-6

### Completion Notes List

- Story créée après correction du bug "bouton aujourd'hui" (déjà appliqué dans calendar-month-view.html — visibility:hidden au lieu de @if pour éviter le décalage du bouton ">").
- `getWeekStart` et `buildWeek` doivent être exportées pour les tests.
- Le pattern `@let` n'est pas utilisé dans le template final — un getter `getSlotData()` a été ajouté à la classe pour éviter la répétition d'expression, ce qui est plus sûr et compatible.
- `import '@angular/compiler'` ajouté dans le spec pour éviter l'erreur JIT lors de l'import du composant Angular Material.
- 7 tests unitaires passent (3 pour `getWeekStart`, 4 pour `buildWeek`).
- 6 échecs préexistants dans d'autres suites (describe not defined, constraint-panel assertion) — non causés par cette story.

## File List

- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` — NOUVEAU
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html` — NOUVEAU
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss` — NOUVEAU
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts` — NOUVEAU
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` — MODIFIER (initialDate input + displayDateChange output)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — MODIFIER (view signal, sharedDate, imports)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — MODIFIER (toggle + @if view)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` — MODIFIER (view-toggle styles)

## Change Log

- 2026-06-27: Story 1.5 créée depuis epics.md — vue semaine CalendarWeekView + toggle + synchronisation de date entre vues
- 2026-06-28: Implémentation complète (claude-sonnet-4-6) — CalendarWeekView créé (ts+html+scss+spec), CalendarMonthView mis à jour (initialDate + displayDateChange), CalendarView mis à jour (toggle mat-button-toggle-group + sharedDate). 7 tests Vitest passent.
