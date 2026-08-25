---
baseline_commit: b4823cd0d73029e81ea00ddc2d11267c3a871b96
status: review
---

# Story 1.4 : Déclarer une contrainte depuis le calendrier

As a user,
I want to tap a day in my calendar and declare an availability constraint,
So that I can manage my schedule directly from the calendar without navigating elsewhere.

## Acceptance Criteria

**Given** the calendar (month or week view) is displayed
**When** the user taps/clicks a day cell or slot cell
**Then** the `ConstraintPanel` opens:
  - On mobile (< 768px): as a bottom-sheet sliding up
  - On desktop (≥ 768px): as a 320px right side-panel sliding in

**Given** the `ConstraintPanel` is open for "Mercredi 2 juillet — Soirée"
**When** the user views the panel
**Then** the title shows the selected day and slot
**And** a toggle allows switching between "Indisponible" and "Disponible"
**And** a type selector offers 3 options: "Ce créneau uniquement", "Récurrent (chaque semaine)", "Plage de dates"
**And** an expiration date picker is visible (required field, default +6 months for recurring)
**And** "Annuler" and "Sauvegarder la contrainte" buttons are present

**Given** the user selects "Récurrent" type
**When** they confirm the form
**Then** `POST /availability` is called with `recurKind: "RECURRING"`, `dayOfWeek` inferred from the selected date, and the selected slot
**And** the panel closes with a success toast using `ThemeToneService.tone['success.constraint_saved']`
**And** the calendar refreshes to show the new declaration

**Given** the user selects "Plage de dates"
**When** they fill the start/end dates and submit
**Then** `POST /availability` is called with `recurKind: "PUNCTUAL"`, `startDate`, `endDate`

**Given** the user taps "Annuler"
**When** no changes have been saved
**Then** the panel closes with no API call made

**Given** all mobile calendar cells in the month view
**When** measured on a 375px viewport
**Then** each cell's tappable area is ≥ 44×44px (NFR1 touch target)

**Given** an existing declaration is tapped in the calendar
**When** the ConstraintPanel opens
**Then** it pre-fills the existing values and shows a "Supprimer" button
**And** tapping "Supprimer" calls `DELETE /availability/:id` and refreshes the calendar

## Tasks/Subtasks

- [x] Task 1: CalendarMonthView — ajouter output `slotSelected` + click handlers sur segments et cellules
- [x] Task 2: Créer `ConstraintPanel` component (formulaire, overlay bottom-sheet/side-panel, pre-fill, save/delete)
- [x] Task 3: CalendarView — wirer le panel (ouvrir/fermer, refresh déclarations, finding matching existing declaration)
- [x] Task 4: Tests unitaires `buildConstraintDto` + run Vitest (13 tests passent — 7 originaux + 6 nouveaux)

## Dev Notes

### Architecture
- **SlotSelectedEvent** : `{ date: Date; slot: 'MORNING' | 'AFTERNOON' | 'EVENING' }` — interface exportée depuis `calendar-month-view.ts`
- **ConstraintPanel** : standalone component, `position: fixed`, CSS media-query pour bottom-sheet (<768px) vs side-panel (≥768px). Pas de MatDialog/MatBottomSheet (évite overhead de configuration).
- **buildConstraintDto** : fonction pure exportée depuis `constraint-panel.ts`, testable sans DOM.
- **Matching existing declaration** : méthode privée dans CalendarView, réplique la logique `matches` de `compute-display-status.ts` (date UTC + dayOfWeek ou range PUNCTUAL).
- **Sauvegarder** : toujours `createDeclaration()` (nouveau record), même avec pre-fill — cohérent avec Story 1.6 (renewal pattern).
- **MatSnackBar** : injecté dans ConstraintPanel pour toast ; `provideAnimationsAsync()` déjà présent dans `app.config.ts`.
- **Imports Material** : MatButtonModule, MatButtonToggleModule, MatIconModule, MatRadioModule + ReactiveFormsModule dans ConstraintPanel.
- **FormBuilder.nonNullable** : pour éviter les types `string | null` dans les form values.
- **Dates** : `<input type="date">` natif (pas MatDatepicker — évite DateAdapter setup). Format `YYYY-MM-DD`.
- **expiresAt** : ajout `T23:59:59Z` pour ISO string car `type="date"` retourne juste `YYYY-MM-DD`.

### Conventions Angular 22
- Signals inputs via `input()` / `input.required()`
- Outputs via `output()`
- Computed state via `signal()` + `computed()`
- Pas de `ngModel`, formulaires réactifs

## Dev Agent Record

### Implementation Plan

- `buildConstraintDto` et `ConstraintFormValue` extraits dans `constraint-panel.utils.ts` (pure, pas d'imports Angular) → testables sans JIT compiler.
- `CalendarMonthView` : `output<SlotSelectedEvent>()` + `onCellClick()`. Click sur segment avec `stopPropagation()` pour slot précis, click sur cell pour MORNING par défaut. `role="button"` + keyboard handlers.
- `ConstraintPanel` : overlay `position: fixed`, slideUp (mobile) / slideIn (desktop) via CSS animation. `FormBuilder.nonNullable` + `ReactiveFormsModule`. `<input type="date">` natif. Pre-fill via `prefill()`. Snackbar toast. `buildConstraintDto()` pour construire le DTO.
- `CalendarView` : `findMatchingDeclaration()` remémore la logique de `matches()` de computeDisplayStatus. `loadDeclarations()` réutilisée ngOnInit + refresh. Backdrop semi-transparent sur mobile, transparent sur desktop.

## File List

- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` — ajout `SlotSelectedEvent`, output `slotSelected`, méthode `onCellClick()`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html` — click handlers sur segments + day-cell (role=button, keyboard)
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.utils.ts` — nouveau : `buildConstraintDto`, `ConstraintFormValue`, `toISODate`, `addMonths` (pur, sans Angular)
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts` — nouveau : `ConstraintPanel` component standalone
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.html` — nouveau : template du panneau
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.scss` — nouveau : overlay bottom-sheet/side-panel
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.spec.ts` — nouveau : 6 tests unitaires `buildConstraintDto`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — panel state signals + `onSlotSelected()`, `findMatchingDeclaration()`, `loadDeclarations()`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — ajout backdrop + `<app-constraint-panel>` conditionnel
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` — ajout `.calendar-error`, `.constraint-backdrop`

## Code Review (2026-06-27)

### Patches appliqués
- **1.4-A** (High) — `executeReplace()` : ajout guard `if (this.saving()) return;` contre double-clic
- **1.4-B** (High) — `confirmDelete()` + `onDeleteClick` non-récurrent : ajout guard `saving()`, suppression `void` sur `doDelete`
- **1.4-C** (High) — `doActualSave()` : create-then-delete (était delete-then-create) — préserve l'ancienne déclaration si la création échoue
- **1.4-D** (Medium) — `addMonths()` : fixe le débordement de jour (`setDate(1)` avant `setMonth`) via clamp au dernier jour du mois cible
- **1.4-E** (Medium) — `isFormValid` : rejette `endDate < startDate` pour PLAGE (comparaison lexicographique ISO)
- **1.4-F** (Medium) — `prefill()` : PLAGE d'un seul jour (startDate=endDate≠cellDate) correctement identifiée comme PLAGE et non PONCTUEL
- **1.4-G** (Low) — `aria-label` des segments : utilise le statut preview quand actif (cohérence avec `data-status`)
- **1.4-H** (Medium) — Panel garde le bon formulaire si l'utilisateur clique une autre cellule pendant que le panel est ouvert : remplacé `ngOnInit` par un `effect()` sur `date()`/`slot()`/`existingDeclaration()`
- **1.4-I** (Low) — `findMatchingDeclaration()` : normalisation UTC avec `.substring(0,10)+'T00:00:00Z'` pour éviter les décalages d'offset
- **Nouveau** (UX) — Dates passées grisées et non-cliquables dans `calendar-month-view` : classe `.past`, `pointer-events: none`, guard dans `onCellClick`

### Deferred
- **1.4-J** — Spinner absent pendant reload post-save : pre-existing, cosmétique
- **1.4-K** — `confirmingDelete` non réinitialisé sur form edit : risque négligeable
- **1.4-L** — Validation past-date côté serveur : à ajouter (Story 2.1 ou validation DTO séparée)
- **1.4-M** — Titre panel : jour et slot sur deux `<span>` (cosmétique, spec ambiguë)
- **1.4-N** — Segments touch target 14px : décision design assumée (vue mois compacte)

## Change Log

- 2026-06-27: Story 1.4 créée depuis epics.md et implémentée — ConstraintPanel + wiring CalendarView + 6 tests unitaires (13 total passent)
- 2026-06-27: Code review appliqué — 9 patches Story 1.4 + 4 patches Story 1.1 + feature dates passées grisées
