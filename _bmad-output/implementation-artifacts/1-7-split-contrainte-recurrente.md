# Story 1.7: Modifier / supprimer une occurrence d'une contrainte récurrente (modèle SPLIT)

Status: review
baseline_commit: 81dc54a02b8dabb77de49fbd58e9dc79a7c91c44

## Story

As a user who has created a recurring availability constraint,
I want to modify or delete a single occurrence without affecting the rest of the series,
so that I can handle exceptions (e.g. "I'm usually free Tuesday evenings but not this one") without losing my recurring pattern.

## Acceptance Criteria

**AC1 — Modifier une occurrence unique (SPLIT)**

Given the ConstraintPanel is open for a specific occurrence of a RECURRING declaration (e.g. Tuesday July 8)
When the user changes the form and clicks Save
Then a dialog appears offering:
  - "Ce jour uniquement" → split the series (see Split Logic below)
  - "Toutes les occurrences" → replace the whole series (existing behavior)
  - "Annuler" → dismiss, no change

**AC2 — Supprimer une occurrence unique**

Given the ConstraintPanel shows the delete button for a RECURRING declaration
When the user clicks Delete
Then a dialog appears offering:
  - "Ce jour uniquement" → soft-delete only that occurrence (see Split Logic)
  - "De ce jour jusqu'à la fin" → shortens the series endDate to D-7
  - "Toute la série" → soft-deletes the whole declaration (existing behavior)
  - "Annuler" → dismiss, no change

**AC3 — Split Logic (backend)**

Given a RECURRING declaration R with startDate S and endDate E, and the target occurrence day D (a date that falls on dayOfWeek of R, within [S, E]):

- **Normal split** (D > S and D < E):
  Create R1 = R with endDate = D - 7 days
  Create Rmod = the modified/deleted single occurrence (see below)
  Create R2 = R with startDate = D + 7 days
  Soft-delete R

- **Left-edge** (D == S):
  Create Rmod + R2 (no R1)
  Soft-delete R

- **Right-edge** (D == E):
  Create R1 + Rmod (no R2)
  Soft-delete R

- **Single occurrence** (S == E == D):
  Replace R directly with Rmod (no R1, no R2)
  Soft-delete R

For a **"delete this day"** operation, Rmod is a PUNCTUAL declaration on [D, D] with the **opposite kind**:
  - If R.kind = UNAVAILABLE → Rmod.kind = AVAILABLE (override)
  - If R.kind = AVAILABLE → Rmod.kind = UNAVAILABLE (override)
  - Rmod.expiresAt = D (end of day UTC)

For a **"modify this day"** operation, Rmod is a PUNCTUAL declaration on [D, D] with the new form values.

All DB writes in a single Prisma transaction.

**AC4 — Edge case: R1 or R2 is a single-occurrence series**

R1 or R2 may have startDate == endDate (one occurrence only).
These are valid RECURRING records with startDate == endDate and must be created as-is (not converted to PUNCTUAL).
They behave identically to any other RECURRING record — they can be split further or deleted normally.

**AC5 — Overlap: new PUNCTUAL declaration on an existing RECURRING declaration's date**

When the user creates a new PONCTUEL or PLAGE constraint from a cell that already has a RECURRING declaration:
- The existing RECURRING is automatically split per AC3 to insert the PUNCTUAL in place
- The same dialog as AC1 is shown: "Ce jour uniquement" | "Toutes les occurrences" | "Annuler"
- "Toutes les occurrences" replaces the entire series (existing behavior)

**AC6 — "De ce jour jusqu'à la fin" shortcut (delete partial tail)**

When the user selects "De ce jour jusqu'à la fin" in the delete dialog:
- R.endDate is set to D - 7 days (PATCH, no soft-delete if R1 still exists with occurrences)
- If D == S (the occurrence is the first), the whole series is soft-deleted (equivalent to "Toute la série")

**AC7 — No schema migration required**

The split produces only new AvailabilityDeclaration rows using the existing Prisma schema.
No new fields, no new tables, no migration.

**AC8 — Frontend: dialog replaces the existing inline confirmations**

The new multi-choice dialog replaces:
- The current "⚠ Remplacera toutes les occurrences" confirm block in the template
- The current "⚠ Supprimera toutes les occurrences" confirm block in the template
Both are subsumed into the new dialog that also offers "Ce jour uniquement".

**AC9 — API: new endpoint `POST /availability/:id/split`**

Rather than overloading PATCH (which already has clear semantics), add:
```
POST /availability/:id/split
Body: { occurrence: string (ISO date, YYYY-MM-DD), action: 'modify' | 'delete', dto?: CreateAvailabilityDto }
```
- `occurrence`: the specific date of the occurrence to modify/delete
- `action: 'modify'` → requires `dto` (the new PUNCTUAL values for that day)
- `action: 'delete'` → no dto needed (creates opposite-kind PUNCTUAL)
- Returns: `{ created: AvailabilityDeclarationDto[], deleted: string[] }` (IDs soft-deleted)
- 404 if declaration not found, 403 if not owner, 400 if occurrence date doesn't match dayOfWeek of R

**AC10 — Tests backend**

Unit tests (Vitest or Jest) for `AvailabilityService.splitOccurrence()`:
- Normal split: verifies R1, Rmod, R2 created; R soft-deleted
- Left-edge: only Rmod + R2
- Right-edge: only R1 + Rmod
- Single occurrence: only Rmod replaces R
- Action 'delete': Rmod has opposite kind
- Action 'modify': Rmod has provided dto values
- 400 if occurrence date doesn't match dayOfWeek of R
- 403 if userId doesn't match

**AC11 — Détection et résolution de conflits à la création**

Quand l'utilisateur crée une déclaration (PONCTUEL, PLAGE ou RÉCURRENT) qui entre en conflit avec une déclaration existante de kind opposé sur le même slot et les mêmes dates :

1. Le backend retourne HTTP 409 `{ conflicts: ConflictInfo[] }` si aucune résolution n'est fournie.
2. Le frontend affiche un dialog 3 boutons :
   - **Annuler** : abandon, aucune écriture.
   - **Écraser** : soft-delete des déclarations conflictuelles, création de la nouvelle.
   - **Garder l'existant** : crée la nouvelle déclaration "avec des trous" autour des conflits (même logique que le modèle SPLIT appliqué à la création).
3. La résolution choisie est envoyée en `conflictResolution: 'overwrite' | 'keep'` dans le payload de création.
4. Le champ `replacingId` exclut la déclaration en cours de remplacement du check de conflits.
5. Conflict detection rules :
   - Deux déclarations de **même kind** ne sont pas en conflit.
   - Un slot différent n'est pas en conflit, sauf si l'un des deux est `FULL_DAY` (qui couvre tous les slots).
   - `slotsConflict(s1, s2) = s1 === 'FULL_DAY' || s2 === 'FULL_DAY' || s1 === s2`
   - Date ranges conflict follows RECURRING-vs-RECURRING (same dayOfWeek, overlapping period), RECURRING-vs-PUNCTUAL (weekday occurs in overlap), PUNCTUAL-vs-PUNCTUAL (date ranges overlap).

## Tasks / Subtasks

- [x] Task 1 — Backend: `splitOccurrence` service method (AC: 3, 4, 6, 10)
  - [x] Add `splitOccurrence(id, userId, occurrence, action, dto?)` to `AvailabilityService`
  - [x] Implement split logic in a single Prisma `$transaction`
  - [x] Handle all edge cases: left-edge, right-edge, single-occurrence, partial tail (AC6)
  - [x] Validate: occurrence date must match dayOfWeek of the RECURRING declaration (400 otherwise)
  - [x] Write unit tests covering all split variants and error cases

- [x] Task 2 — Backend: `POST /availability/:id/split` controller endpoint (AC: 9)
  - [x] Create `SplitOccurrenceDto` with `occurrence`, `action`, optional `dto`
  - [x] Add `@Post(':id/split')` in `AvailabilityController`
  - [x] Guard: `@UseGuards(AuthenticatedGuard)` (already on class)
  - [x] Return `{ created, deleted }` shape

- [x] Task 3 — Frontend: Angular service call (AC: 9)
  - [x] Add `splitOccurrence(id, body)` method to `AvailabilityService` (frontend, `apps/web/src/app/core/availability/availability.service.ts`)
  - [x] Method posts to `POST /availability/:id/split`

- [x] Task 5 — Conflict detection & resolution (AC: 11)
  - [x] Shared types: add `ConflictInfo`, `CreateAvailabilityResult`, extend `CreateAvailabilityDto` with `conflictResolution?` and `replacingId?` in `packages/shared/src/index.ts`
  - [x] Backend DTO: add `@IsOptional() conflictResolution?` and `replacingId?` to `CreateAvailabilityDto`
  - [x] Backend service: `findConflictsForCreate(userId, dto, excludeId?)` — filters active declarations by kind/slot/date overlap
  - [x] Backend service: `createWithHoles(userId, dto, conflicts)` — creates RECURRING/PUNCTUAL pieces around conflict date ranges
  - [x] Backend service: `create()` now returns `{ created: object[] }` and throws 409 `ConflictException` if conflicts detected without resolution
  - [x] Backend service: unit tests for conflict detection (10 tests) and `create()` conflict handling (4 tests)
  - [x] Frontend service: `createDeclaration()` returns `CreateAvailabilityResult`; catches 409 and re-throws `ConflictError`
  - [x] Frontend component: `conflictData` signal, `pendingConflictDto`, handlers `onConflictOverwrite/Keep/Cancel()`, `resolveConflict()`
  - [x] Frontend template: conflict dialog with 3 buttons (Annuler / Garder l'existant / Écraser)

- [x] Task 4 — Frontend: replace inline confirms with split dialog in ConstraintPanel (AC: 1, 2, 8)
  - [x] Add `splitDialogAction = signal<'modify' | 'delete' | null>(null)` signal (simplifié vs spec initiale)
  - [x] Replace `confirmingReplace` block in template with new dialog: "Ce jour uniquement" | "Toutes les occurrences" | "Annuler"
  - [x] Replace `confirmingDelete` block with new dialog: "Ce jour uniquement" | "De ce jour jusqu'à la fin" | "Toute la série" | "Annuler"
  - [x] Wire "Ce jour uniquement" to call `splitOccurrence` with `action: 'modify'` or `action: 'delete'`
  - [x] Wire "Toutes les occurrences" / "Toute la série" to `onSplitAll()` / `onDeleteAll()` (logique existante préservée)
  - [x] Wire "De ce jour jusqu'à la fin" à `onDeleteTail()` (PATCH endDate ou soft-delete si D == startDate)
  - [x] Emit `saved` / `deleted` après chaque action

## Dev Notes

### Context — existing code state

**Backend files to modify:**

- `apps/api/src/availability/availability.service.ts` — add `splitOccurrence()` method
  - Current state: has `create`, `findActive`, `update`, `softDelete`, `getActiveDeclarations`, `computeSlotStatus`, `matchesDeclaration`, `slotMatches`, `isInCoveredPeriod`
  - Soft-delete pattern: `updateMany({ where: { id, userId }, data: { expiresAt: new Date() } })` — reuse for R
  - Prisma `$transaction` available via `this.prisma.$transaction([...])`
  - `AvailabilityDeclaration` model fields: `id, userId, kind, recurKind, dayOfWeek, slot, startDate, endDate, expiresAt, createdAt`
  - `startDate`/`endDate` are `DateTime?` in Prisma (JS `Date | null`)

- `apps/api/src/availability/availability.controller.ts` — add `@Post(':id/split')` route
  - Current state: `@UseGuards(AuthenticatedGuard)` is class-level → auto-applies to new route
  - Pattern to follow: existing `update()` and `softDelete()` methods

- `apps/api/src/availability/dto/` — create new `split-occurrence.dto.ts`

**Frontend files to modify:**

- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts`
  - Current state (important): already has `confirmingReplace` and `confirmingDelete` signals; `onSave()` checks `existing?.recurKind === 'RECURRING'` → sets `confirmingReplace.set(true)`; `onDeleteClick()` checks `existing?.recurKind === 'RECURRING'` → sets `confirmingDelete.set(true)`
  - The new split dialog replaces both confirm blocks — remove `confirmingReplace` and `confirmingDelete`, replace with `splitScope`/`splitAction` signals
  - `this.date()` gives the specific cell date clicked — this is the `occurrence` date to pass to the API
  - After split, emit `this.saved.emit(result[0])` (first created declaration) for the parent to reload

- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.html`
  - Current state: has two `@if (confirmingReplace())` and `@if (confirmingDelete())` blocks (lines 80-106) — replace both
  - Keep `@if (!confirmingDelete() && !confirmingReplace())` for normal buttons — update condition to `@if (splitScope() === null)`

- `apps/web/src/app/core/availability/availability.service.ts`
  - Add: `splitOccurrence(id: string, body: SplitOccurrenceBody): Promise<SplitOccurrenceResult>`

### Split date arithmetic

D = the cell date (a local Date from `this.date()`, but must be treated as UTC midnight for consistency with `buildConstraintDto`).

```typescript
// In the service method:
const utcD = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const dMinus7 = new Date(Date.UTC(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate() - 7));
const dPlus7  = new Date(Date.UTC(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate() + 7));
```

R1.endDate = D - 7 days (if D > startDate)
R2.startDate = D + 7 days (if D < endDate)
Rmod: PUNCTUAL, startDate = D, endDate = D, expiresAt = end of day D UTC (`new Date(D.getTime() + 86399999)`)

### Validation: occurrence must match dayOfWeek

```typescript
const utcDay = new Date(Date.UTC(...)).getUTCDay(); // 0=Sun...6=Sat
if (utcDay !== decl.dayOfWeek) throw new BadRequestException('occurrence date does not match dayOfWeek');
```

Also validate occurrence is within [startDate, endDate] of the declaration.

### "De ce jour jusqu'à la fin" implementation

This is a simple PATCH, not a split:
```typescript
// If D == S, soft-delete the whole series
// Otherwise: PATCH endDate = D - 7
await this.prisma.availabilityDeclaration.updateMany({
  where: { id, userId },
  data: { endDate: dMinus7 },
});
```

### Angular patterns (carry-over from story 1.4)

- All signals: `signal<T>()` — no `BehaviorSubject`
- `effect()` in constructor with `untracked()` guard (already present in ConstraintPanel)
- Angular 22 `@if`/`@else` control flow — no `*ngIf`
- `takeUntilDestroyed(this.destroyRef)` for subscriptions (already imported)
- No `@let` in templates — use component getters if computed template vars are needed
- Reading `input()` in constructor IS valid in Angular 22 (signal inputs)

### Testing

- Backend: add to `availability.service.spec.ts` (Vitest, already set up)
- Frontend: no new spec file required for this story (dialog is template-only, covered by the existing panel spec structure)
- Run backend tests: `docker compose exec api pnpm test`
- Run frontend tests: `docker compose exec web pnpm test src/app/features/calendar/constraint-panel/`

### No migration needed

The SPLIT model produces new rows with the existing schema. `startDate` and `endDate` are already `DateTime?` — RECURRING rows produced by split will have both set (to bound the series). No new column, no new migration.

### Project Structure Notes

```
apps/api/src/availability/
  availability.controller.ts        ← MODIFY: add @Post(':id/split')
  availability.service.ts           ← MODIFY: add splitOccurrence()
  dto/
    create-availability.dto.ts      ← no change
    update-availability.dto.ts      ← no change
    split-occurrence.dto.ts         ← NEW

apps/web/src/app/
  core/availability/
    availability.service.ts         ← MODIFY: add splitOccurrence()
  features/calendar/constraint-panel/
    constraint-panel.ts             ← MODIFY: replace confirm signals with split dialog
    constraint-panel.html           ← MODIFY: replace confirm blocks with split dialog template
    constraint-panel.utils.ts       ← no change
    constraint-panel.spec.ts        ← no change (optional: add split dialog tests)
```

### References

- Design decision: `_bmad-output/implementation-artifacts/deferred-work.md` (section "Converti en Story 1-7")
- Existing ConstraintPanel: `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts`
- Existing ConstraintPanel template: `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.html`
- Existing AvailabilityService (backend): `apps/api/src/availability/availability.service.ts`
- Existing AvailabilityController: `apps/api/src/availability/availability.controller.ts`
- Prisma schema: `apps/api/prisma/schema.prisma` — `AvailabilityDeclaration` model
- Shared types: `packages/shared/src/index.ts` — `AvailabilityDeclarationDto`, `CreateAvailabilityDto`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Backend utilisait Jest (pas Vitest) — import `vi` retiré, remplacé par globals Jest
- Test frontend `compute-display-status.spec.ts` : champs `userId`/`createdAt` manquants dans le helper `decl()` — corrigé (bug pré-existant)
- Test frontend `constraint-panel.spec.ts` : test RECURRENT attendait `startDate: undefined` mais `buildConstraintDto` inclut bien `startDate` — corrigé (bug pré-existant)
- `UpdateAvailabilityDto.endDate` : `@ValidateIf(o => o.recurKind === 'PUNCTUAL')` retiré → `@IsOptional()` pour permettre le patch de la borne de fin sur RECURRING (nécessaire pour AC6 "De ce jour jusqu'à la fin")
- `matchesDeclaration` et `isInCoveredPeriod` : ajout du check `endDate` pour les déclarations RECURRING produites par le modèle SPLIT (rétrocompatible — les déclarations existantes ont `endDate = null`)

### Completion Notes List

- Modèle SPLIT implémenté : `splitOccurrence()` dans `AvailabilityService` (backend), transaction Prisma atomique
- Tous les cas limites couverts : left-edge, right-edge, occurrence unique, right-edge via `effectiveEnd = endDate ?? expiresAt`
- Endpoint `POST /availability/:id/split` ajouté au controller
- `AvailabilityService` (frontend) enrichi : `splitOccurrence()` + `updateDeclaration()` (pour le tail shortcut AC6)
- `ConstraintPanel` : `confirmingReplace` + `confirmingDelete` remplacés par le signal unifié `splitDialogAction`
- Détection de conflits à la création : `findConflictsForCreate()` + `createWithHoles()` + 409 ConflictException avec dialog frontend 3 boutons
- `create()` backend retourne désormais `{ created: object[] }` (breaking change côté frontend géré)
- 72 tests backend (Jest), tous passent ; 37 tests frontend (Vitest), tous passent

### File List

- `packages/shared/src/index.ts` — MODIFIED (ConflictInfo, CreateAvailabilityResult, CreateAvailabilityDto étendu)
- `apps/api/src/availability/dto/split-occurrence.dto.ts` — NEW
- `apps/api/src/availability/dto/create-availability.dto.ts` — MODIFIED (conflictResolution, replacingId)
- `apps/api/src/availability/dto/update-availability.dto.ts` — MODIFIED (endDate désormais @IsOptional sans @ValidateIf)
- `apps/api/src/availability/availability.service.ts` — MODIFIED (splitOccurrence + conflict detection + createWithHoles)
- `apps/api/src/availability/availability.controller.ts` — MODIFIED (POST :id/split)
- `apps/api/src/availability/availability.service.spec.ts` — MODIFIED (72 tests : splitOccurrence + findConflictsForCreate + create conflicts)
- `apps/web/src/app/core/availability/availability.service.ts` — MODIFIED (ConflictError, createDeclaration retourne CreateAvailabilityResult)
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts` — MODIFIED (splitDialogAction, conflictData, handlers conflit)
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.html` — MODIFIED (dialogs split + dialog conflit)
- `apps/web/src/app/core/availability/compute-display-status.spec.ts` — MODIFIED (fix pré-existant + tests SPLIT endDate)
- `apps/web/src/app/features/calendar/constraint-panel/constraint-panel.spec.ts` — MODIFIED (fix pré-existant)
