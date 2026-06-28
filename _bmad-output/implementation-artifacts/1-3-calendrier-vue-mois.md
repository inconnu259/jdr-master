---
baseline_commit: 144b52d653438330b7f17eeba5e1ced08f8e7674
status: done
---

# Story 1.3 : Calendrier personnel — vue mois

As a user,
I want to see my monthly calendar showing my declared constraints per slot,
So that I can visualize at a glance when I'm available or not.

## Acceptance Criteria

**Given** an authenticated user navigates to `/profile/calendar`
**When** the page loads
**Then** the `CalendarViewComponent` (mode: `personal`) is displayed
**And** `AvailabilityService.getMyDeclarations()` is called to load active declarations
**And** the current month is shown as a 7-column grid (Monday-first, European style)

**Given** the month view is displayed
**When** the user looks at any day cell
**Then** 3 colored segments are visible at the bottom of the cell (left=Matin, center=AM, right=Soir)
**And** each segment is colored according to `computeDisplayStatus(date, slot, declarations)`:
  - Vert (`--color-available`) = AVAILABLE (explicit or inferred in covered period)
  - Rouge (`--color-unavailable`) = UNAVAILABLE
  - Gris pointillé (`--color-unknown`) = UNKNOWN (outside covered period)

**Given** a day cell with 3 segments
**When** a screen reader announces the cell
**Then** each segment has an `aria-label` in the format "Matin : disponible" / "Après-midi : indisponible" / "Soirée : inconnu"

**Given** the month view
**When** the user taps/clicks `<` or `>` navigation buttons
**Then** the displayed month changes and declarations are recalculated for the new month

**Given** the Angular `AvailabilityService` in `core/availability/`
**When** a developer inspects it
**Then** it exposes `getMyDeclarations(): Promise<AvailabilityDeclarationDto[]>` calling `GET /availability` with session credentials

**Given** `computeDisplayStatus` is unit tested (Vitest, `compute-display-status.spec.ts`)
**When** the test suite runs
**Then** the following cases all pass:
  - UNAVAILABLE RECURRING matching date+slot → UNAVAILABLE
  - AVAILABLE RECURRING matching date+slot → AVAILABLE
  - UNAVAILABLE beats AVAILABLE on same slot
  - Date in covered period, no slot match → AVAILABLE (positive inference)
  - Date outside covered period, no declarations → UNKNOWN
  - Expired declaration (expiresAt < now) ignored → UNKNOWN
  - FULL_DAY declaration matches any specific slot (MORNING/AFTERNOON/EVENING)

## Tasks/Subtasks

- [x] Task 1: Créer AvailabilityService Angular (`core/availability/availability.service.ts`) avec `getMyDeclarations()`
- [x] Task 2: Créer `computeDisplayStatus` + 7 tests unitaires (7/7 ✅)
- [x] Task 3: Créer `CalendarMonthView` component (grille mois, segments colorés, navigation prev/next)
- [x] Task 4: Créer `CalendarView` wrapper (mode=personal) + route `/profile/calendar` + lien dans Shell

### Review Findings (2026-06-27)

- [x] [Review][Decision→Patch] Positive inference supprimée — option 3 choisie : supprimer `isInCoveredPeriod` entièrement, seules les déclarations explicites comptent, UNKNOWN sinon. Mise à jour de `computeDisplayStatus` et du test "covered period".
- [x] [Review][Patch] CalendarView.ngOnInit sans catch — échec API silencieux, le calendrier reste vide sans feedback utilisateur [`calendar-view.ts:21`] ✅ fixed
- [x] [Review][Patch] `aria-hidden="true"` sur le toggle mode mobile visible — le groupe de toggles de la ligne 2 est caché aux AT alors qu'il est le seul contrôle visible sur mobile (<600px) [`shell.html:52`] ✅ fixed
- [x] [Review][Patch] `setMonth()` overflow en navigation — déjà résolu dans le code commité (day=1 dans le constructeur Date) [`calendar-month-view.ts`] ✅ pre-resolved
- [x] [Review][Defer] Signal input `mode` déclaré mais jamais consommé — stub pour Story 2.x, pas de bug actuel [`calendar-view.ts:14`] — deferred, Story 2.x
- [x] [Review][Defer] Risque timezone PUNCTUAL — `new Date(d.startDate!)` peut décaler d'un jour si le backend émet un offset non-UTC (Prisma émet UTC aujourd'hui) [`compute-display-status.ts:14`] — deferred, pre-existing latent
- [x] [Review][Defer] Pas de `takeUntilDestroyed` — requête HTTP en vol survit à la destruction du composant [`calendar-view.ts:21`] — deferred, pattern Angular acceptable
- [x] [Review][Defer] 42 cellules fixes incluent des jours hors-mois navigables par virtual cursor AT [`calendar-month-view.ts`] — deferred, pre-existing
- [x] [Review][Defer] `isToday` peut rater lors du passage à l'heure d'été (setHours(0,0,0,0) sur minuit inexistant) [`calendar-month-view.ts:25`] — deferred, 1 jour/an

## Dev Notes

### Architecture
- **AvailabilityService** : pattern identique à `InvitationsService` — `const API = 'http://localhost:3000'`, `HttpClient` + `firstValueFrom`, `withCredentials: true`.
- **computeDisplayStatus** : fonction pure dans `core/availability/compute-display-status.ts`, miroir du backend `computeSlotStatus`. Opère sur `AvailabilityDeclarationDto[]` (dates = ISO strings). Priorité : UNAVAILABLE > AVAILABLE > covered-period inference > UNKNOWN. FULL_DAY matches any query slot.
- **Dates UTC** : passer `date` comme `new Date(Date.UTC(year, month, day))` pour éviter les bugs timezone. Utiliser `getUTCDay()` pour RECURRING (pas `getDay()`).
- **CalendarMonthView** : standalone component, imports MatButtonModule + MatIconModule. Signals `displayDate` + `declarations`. `computed weeks()` = tableau 6×7 `DayCell[]`. `buildMonth()` = fonction pure (hors classe, dans le fichier .ts).
- **DayCell** interface locale : `{ date: Date; isCurrentMonth: boolean; isToday: boolean; morning: SlotStatus; afternoon: SlotStatus; evening: SlotStatus; }`
- **Grille Lundi-premier** : `startDow = dow === 0 ? 6 : dow - 1` (européen).
- **CalendarView** : thin wrapper, `@Input() mode: 'personal' | 'mj' = 'personal'`. Charge les déclarations et les passe à CalendarMonthView.
- **Route** : `/profile/calendar` dans les children du Shell guard (authentifié).

### Clés de tests (same dates as backend to maintain consistency)
- `NOW = new Date('2026-06-30T12:00:00Z')` — référence pour l'expiry
- `WED = new Date('2026-07-01T00:00:00Z')` — Mercredi (getUTCDay() === 3)
- `FAR = new Date('2027-01-01T00:00:00Z')` — expiration lointaine

## Dev Agent Record

### Implementation Plan

(à remplir à l'implémentation)

## File List

- `apps/web/src/app/core/availability/availability.service.ts` — nouveau
- `apps/web/src/app/core/availability/compute-display-status.ts` — nouveau
- `apps/web/src/app/core/availability/compute-display-status.spec.ts` — nouveau
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` — nouveau
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html` — nouveau
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss` — nouveau
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — nouveau
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — nouveau
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` — nouveau
- `apps/web/src/app/app.routes.ts` — ajout route `/profile/calendar`
- `apps/web/src/app/layout/shell/shell.html` — ajout lien calendrier
- `apps/web/src/app/core/theme/tones.ts` — ajout clé `nav.calendar`

## Change Log

- Implémentation complète Story 1.3 : AvailabilityService, computeDisplayStatus (7 tests), CalendarMonthView, CalendarView, route /profile/calendar, lien Shell
