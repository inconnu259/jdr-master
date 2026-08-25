---
baseline_commit: "8de527e6aad7c0ce6293ebaf399e967bdc94a6a1"
---

# Story 2.5 : Fenêtre de planification configurable

Status: done

## Story

As a GM or player,
I want to specify a date range for the availability search,
So that I can find a session date for a specific period (e.g. "only in August", "next 3 weeks").

## Acceptance Criteria

**AC1 — Date range picker visible dans le panel résultats**

Given the MJ or player is on `/parties/:id/calendar`
When the results panel loads
Then a date range form is visible at the top of the results panel with:
- An input "Du [date début]" (default: today in ISO format YYYY-MM-DD)
- An input "Au [date fin]" (default: today + 8 weeks in ISO format YYYY-MM-DD)
- A "Rechercher" button or auto-trigger on change

**AC2 — Recherche avec plage personnalisée**

Given the GM sets "Du 1er août" / "Au 31 août"
When the search is triggered
Then `GET /parties/:id/available-slots?from=2026-08-01&to=2026-08-31` is called
And the results panel shows only slots within that date range

**AC3 — API accepte from/to**

Given the API receives `?from=YYYY-MM-DD&to=YYYY-MM-DD`
When `PartiesService.getAvailableSlots()` runs
Then it iterates only over date×slot combinations within the [from, to] range (inclusive)
And the query `WHERE expiresAt > NOW()` still applies to declarations (handled by AvailabilityService, no change needed)
And the response returns at most 20 slots (the best-priority within the range)

**AC4 — Rétrocompatibilité `?weeks=N`**

Given the API receives `?weeks=8` (no from/to)
When `PartiesService.getAvailableSlots()` runs
Then the behavior is unchanged from Story 2.1

**AC5 — Persistance URL**

Given the date range picker has a value set and user clicks Rechercher
When the URL is updated
Then the URL becomes `/parties/:id/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

Given the user reloads or shares `/parties/:id/calendar?from=2026-08-01&to=2026-08-31`
When the page initializes
Then the date range picker is pre-filled from the URL params
And the search is automatically triggered with those values

**AC6 — Validation `from > to` → 400**

Given the API receives `?from=2026-08-31&to=2026-08-01`
When `PartiesService.getAvailableSlots()` runs
Then it throws `BadRequestException` (HTTP 400)

**AC7 — Tests Jest backend**

Given `PartiesService.getAvailableSlots` is unit tested with the new `from/to` params
When the test suite runs (`docker compose exec api pnpm test`)
Then the following cases pass:
- `from/to` range narrows the search to only those dates
- Slots outside the `from/to` range are not returned
- `from` after `to` returns a BadRequestException
- Calling without from/to still works (backward compat via weeks param)

## Tasks / Subtasks

- [x] Task 1 — Backend DTO : ajouter `from?` et `to?` à `GetAvailableSlotsDto` (AC3, AC4, AC6)
  - [x] Dans `apps/api/src/parties/dto/get-available-slots.dto.ts`, ajouter les imports `IsDateString`, `Matches` depuis `class-validator`
  - [x] Ajouter `@IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/, ...) from?: string` 
  - [x] Ajouter `@IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/, ...) to?: string`

- [x] Task 2 — Backend Service : étendre `getAvailableSlots` (AC3, AC4, AC6)
  - [x] Mettre à jour la signature : `getAvailableSlots(partieId, userId, weeks, from?, to?)`
  - [x] Quand `from` ET `to` sont fournis : valider `fromMs <= toMs` (sinon `BadRequestException`), itérer sur la plage from→to au lieu de `weeks * 7 jours`
  - [x] Quand seul `weeks` est fourni : comportement identique à Story 2.1 (backward compat)
  - [x] Ajouter `BadRequestException` aux imports NestJS dans `parties.service.ts` (si pas déjà là)

- [x] Task 3 — Backend Controller : passer `q.from`, `q.to` au service (AC3)
  - [x] Dans `apps/api/src/parties/parties.controller.ts`, modifier l'appel `getAvailableSlots` pour passer `q.from, q.to`

- [x] Task 4 — Backend Tests Jest (AC7)
  - [x] Dans `apps/api/src/parties/parties.service.spec.ts`, ajouter un `describe('filtrage from/to')` imbriqué dans le describe `getAvailableSlots` existant
  - [x] Test 1 : `from/to` restreint la recherche à la plage (toutes les dates retournées sont ≥ from et ≤ to)
  - [x] Test 2 : créneaux hors plage ne sont pas retournés
  - [x] Test 3 : `from > to` lève `BadRequestException`
  - [x] Test 4 : sans `from/to`, appel avec `weeks=8` fonctionne (rétrocompat)
  - [x] `docker compose exec api pnpm test` — 84/84 ✓

- [x] Task 5 — Frontend PollService : ajouter params `from?`, `to?` (AC2, AC5)
  - [x] Dans `apps/web/src/app/core/poll/poll.service.ts`, modifier la signature de `getAvailableSlots` pour accepter `weeks?: number, from?: string, to?: string`
  - [x] Quand `from` ET `to` sont fournis : construire l'URL avec `?from=...&to=...`
  - [x] Conserver l'URL `?weeks=N` pour les appels existants

- [x] Task 6 — Frontend PollService spec (AC5)
  - [x] Dans `apps/web/src/app/core/poll/poll.service.spec.ts`, ajouter un test `getAvailableSlots avec from/to appelle la bonne URL`
  - [x] Vérifier que les 2 tests existants ne régressent pas

- [x] Task 7 — Frontend CalendarView : signaux + Router + handlers (AC1, AC2, AC5)
  - [x] Ajouter `Router` à l'import `@angular/router` et à `inject()`
  - [x] Ajouter les signaux `fromDateStr` et `toDateStr` avec valeurs par défaut (aujourd'hui, aujourd'hui+8 semaines)
  - [x] Ajouter des méthodes statiques privées pour les valeurs par défaut (`todayIso()`, `eightWeeksLaterIso()`)
  - [x] Dans `ngOnInit` : lire `route.snapshot.queryParamMap.get('from'/'to')` et pré-remplir les signaux si présents
  - [x] Mettre à jour `loadAvailableSlots(id, from?, to?)` pour passer les params à `pollSvc`
  - [x] Ajouter `onFromChange(event: Event)` et `onToChange(event: Event)`
  - [x] Ajouter `onSearch(): Promise<void>` → router.navigate + reload des slots

- [x] Task 8 — Frontend Template : date range form (AC1, AC5)
  - [x] Dans `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`, ajouter `<div class="date-range-form">` au début du `mj-results-panel` (avant `<app-available-slots>`)
  - [x] Deux `<input type="date">` avec `[value]="...Str()"` et `(change)="on...Change($event)"`
  - [x] Bouton `mat-stroked-button` "Rechercher" bindé sur `(click)="onSearch()"`

- [x] Task 9 — Frontend Styles (AC1)
  - [x] Dans `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss`, ajouter styles `.date-range-form`, `.date-range-label`, `.date-input`
  - [x] Responsive : flex-wrap pour mobile

- [x] Task 10 — Validation finale (tous les ACs)
  - [x] `docker compose exec api pnpm test` — 84/84 ✓
  - [x] `docker compose exec web pnpm test` — 58/58 ✓

### Review Findings (2026-06-29)

**Decision-needed:**
- [x] [Review][Decision→Patch] D1 → P7: `from` without `to` returns 400 BadRequestException — `!!from !== !!to` guard added in service [parties.service.ts] ✓
- [x] [Review][Decision→Patch] D2 → P8: Default values written to URL via `router.navigate` in `ngOnInit` with `replaceUrl: true` [calendar-view.ts] ✓

**Patches:**
- [x] [Review][Patch] P1: Max 366-day guard added [parties.service.ts] ✓
- [x] [Review][Patch] P2: `@IsDateString({ strict: true })` pour rejeter les dates invalides [get-available-slots.dto.ts] ✓
- [x] [Review][Patch] P3: Garde client-side `from > to` dans `onSearch()` avec message d'erreur [calendar-view.ts] ✓
- [x] [Review][Patch] P4: Validation regex ISO_DATE_RE sur les params URL dans `ngOnInit` [calendar-view.ts] ✓
- [x] [Review][Patch] P5: Description du test corrigée "5 créneaux" → "20 créneaux" [parties.service.spec.ts] ✓
- [x] [Review][Patch] P6: Test `from === to` + tests params partiels + test plage > 366 jours ajoutés [parties.service.spec.ts] ✓

**Deferred:**
- [x] [Review][Defer] W1: `queryParamsHandling: 'merge'` may silently retain a stale `?weeks=` param if present in a shared URL [calendar-view.ts:142] — deferred, edge case in practice
- [x] [Review][Defer] W2: Sort contract test relies on homogeneous-status mock — a future mock change could break the date-order assertion silently [parties.service.spec.ts:247] — deferred, pre-existing fragility

## Dev Notes

### Fichiers modifiés — NE PAS créer de nouveaux fichiers

```
apps/api/src/parties/dto/get-available-slots.dto.ts   UPDATE
apps/api/src/parties/parties.service.ts               UPDATE
apps/api/src/parties/parties.controller.ts            UPDATE
apps/api/src/parties/parties.service.spec.ts          UPDATE
apps/web/src/app/core/poll/poll.service.ts            UPDATE
apps/web/src/app/core/poll/poll.service.spec.ts       UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.ts    UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.html  UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.scss  UPDATE
```

### Task 1 — DTO complet à produire

```typescript
// apps/api/src/parties/dto/get-available-slots.dto.ts
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class GetAvailableSlotsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
```

Pattern identique à `apps/api/src/parties/dto/get-heatmap.dto.ts` — s'en inspirer.

### Task 2 — Modification du service `getAvailableSlots`

**État actuel** (ligne 132 de `parties.service.ts`) :

```typescript
async getAvailableSlots(
  partieId: string,
  userId: string,
  weeks: number,
): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
  // ...
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const all: AvailableSlotDto[] = [];

  for (let d = 0; d < weeks * 7; d++) {
    const dateUtc = new Date(todayUtcMidnight + d * 86_400_000);
    // ...
  }
  // ...
}
```

**Nouvelle signature + logique** :

```typescript
async getAvailableSlots(
  partieId: string,
  userId: string,
  weeks: number,
  from?: string,
  to?: string,
): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
  // ... [auth checks identiques]

  const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
  const all: AvailableSlotDto[] = [];

  if (from && to) {
    const fromMs = new Date(from + 'T00:00:00Z').getTime();
    const toMs   = new Date(to   + 'T00:00:00Z').getTime();
    if (fromMs > toMs) throw new BadRequestException('from must be before or equal to to');
    for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
      const dateUtc = new Date(ms);
      for (const slot of SLOTS) {
        // ... même logique members + computeSlotStatus
        all.push({ date: dateUtc.toISOString().substring(0, 10), slot, members });
      }
    }
  } else {
    const now = new Date();
    const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let d = 0; d < weeks * 7; d++) {
      const dateUtc = new Date(todayUtcMidnight + d * 86_400_000);
      // ... identique à l'existant
    }
  }

  // Tri + slice + retour polymorphe — identique à l'existant
}
```

**IMPORTANT** : `BadRequestException` est déjà importée dans `parties.service.ts` (ligne 1). Pas besoin de l'ajouter.

**Pattern à réutiliser** : La logique d'itération `from/to` existe déjà dans `getHeatmap()` (lignes 239-265). Copier exactement le même pattern de validation et d'itération.

### Task 3 — Controller (1 ligne)

```typescript
// parties.controller.ts ligne 54 — AVANT :
return this.parties.getAvailableSlots(id, user.id, q.weeks ?? 8);

// APRÈS :
return this.parties.getAvailableSlots(id, user.id, q.weeks ?? 8, q.from, q.to);
```

### Task 4 — Tests Jest à ajouter dans `parties.service.spec.ts`

Ajouter à l'intérieur du `describe('getAvailableSlots', ...)` existant (après le dernier `it()`):

```typescript
describe('filtrage from/to', () => {
  beforeEach(() => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findMany.mockResolvedValue(members);
    avail.getActiveDeclarations.mockResolvedValue(new Map([['u1', []], ['u2', []]]));
    avail.computeSlotStatus.mockReturnValue('AVAILABLE');
  });

  it('restreint les résultats à la plage from/to', async () => {
    const from = '2026-08-01';
    const to   = '2026-08-03';
    const results = (await service.getAvailableSlots('p1', 'mj1', 8, from, to)) as AvailableSlotDto[];
    expect(results.every(r => r.date >= from && r.date <= to)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('ne retourne aucun créneau hors de la plage from/to', async () => {
    const from = '2026-08-01';
    const to   = '2026-08-01'; // un seul jour
    const results = (await service.getAvailableSlots('p1', 'mj1', 8, from, to)) as AvailableSlotDto[];
    expect(results.some(r => r.date !== '2026-08-01')).toBe(false);
  });

  it('lève BadRequestException si from > to', async () => {
    await expect(
      service.getAvailableSlots('p1', 'mj1', 8, '2026-08-31', '2026-08-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sans from/to, appel avec weeks fonctionne (rétrocompat)', async () => {
    const results = (await service.getAvailableSlots('p1', 'mj1', 1)) as AvailableSlotDto[];
    expect(results.length).toBeGreaterThanOrEqual(0); // service ne plante pas
    expect(avail.getActiveDeclarations).toHaveBeenCalledTimes(1);
  });
});
```

**IMPORTANT** : Ajouter `BadRequestException` aux imports existants en haut du fichier spec :
```typescript
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
```

### Task 5 — PollService mise à jour

**État actuel** (`poll.service.ts`) :

```typescript
getAvailableSlots(partieId: string, weeks?: number): Promise<...> {
  const url = weeks !== undefined
    ? `${API_BASE}/parties/${partieId}/available-slots?weeks=${weeks}`
    : `${API_BASE}/parties/${partieId}/available-slots`;
  return firstValueFrom(this.http.get<...>(url, { withCredentials: true }));
}
```

**Nouveau code** :

```typescript
getAvailableSlots(partieId: string, weeks?: number, from?: string, to?: string): Promise<(AvailableSlotDto | AggregatedSlotDto)[]> {
  let url: string;
  if (from && to) {
    url = `${API_BASE}/parties/${partieId}/available-slots?from=${from}&to=${to}`;
  } else if (weeks !== undefined) {
    url = `${API_BASE}/parties/${partieId}/available-slots?weeks=${weeks}`;
  } else {
    url = `${API_BASE}/parties/${partieId}/available-slots`;
  }
  return firstValueFrom(this.http.get<(AvailableSlotDto | AggregatedSlotDto)[]>(url, { withCredentials: true }));
}
```

### Task 6 — Test PollService spec à ajouter

Ajouter après le 2ème `it()` existant dans `poll.service.spec.ts` :

```typescript
it('getAvailableSlots avec from/to appelle la bonne URL', async () => {
  const promise = service.getAvailableSlots('p1', undefined, '2026-08-01', '2026-08-31');
  const req = http.expectOne('http://localhost:3000/parties/p1/available-slots?from=2026-08-01&to=2026-08-31');
  expect(req.request.method).toBe('GET');
  expect(req.request.withCredentials).toBe(true);
  req.flush([]);
  await promise;
});
```

**IMPORTANT** : Les 2 tests existants appellent `service.getAvailableSlots('p1')` et `service.getAvailableSlots('p1', 4)` — la nouvelle signature est rétrocompatible, ces tests ne changent pas.

### Task 7 — CalendarView : modifications TypeScript complètes

**Imports à ajouter/modifier** :

```typescript
// Ajouter Router à l'import existant
import { ActivatedRoute, Router } from '@angular/router';
```

**Nouveaux signaux + méthodes statiques** (à ajouter dans la classe, après les signaux existants) :

```typescript
private static todayIso(): string {
  return new Date().toISOString().substring(0, 10);
}
private static eightWeeksLaterIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 56);
  return d.toISOString().substring(0, 10);
}

private readonly router = inject(Router);

protected readonly fromDateStr = signal(CalendarView.todayIso());
protected readonly toDateStr   = signal(CalendarView.eightWeeksLaterIso());
```

**ngOnInit mis à jour** :

```typescript
async ngOnInit(): Promise<void> {
  const id        = this.route.snapshot.paramMap.get('id');
  const fromParam = this.route.snapshot.queryParamMap.get('from');
  const toParam   = this.route.snapshot.queryParamMap.get('to');
  if (fromParam) this.fromDateStr.set(fromParam);
  if (toParam)   this.toDateStr.set(toParam);

  if (id) {
    this.partieId.set(id);
    await Promise.all([
      this.loadDeclarations(),
      this.loadAvailableSlots(id, this.fromDateStr(), this.toDateStr()),
      this.loadHeatmap(id),
    ]);
  } else {
    await this.loadDeclarations();
  }
}
```

**loadAvailableSlots mis à jour** :

```typescript
private async loadAvailableSlots(id: string, from?: string, to?: string): Promise<void> {
  this.slotsLoading.set(true);
  try {
    this.availableSlots.set(await this.pollSvc.getAvailableSlots(id, undefined, from, to));
  } catch {
    this.slotsError.set('Impossible de charger les créneaux.');
  } finally {
    this.slotsLoading.set(false);
  }
}
```

**Nouveaux handlers** :

```typescript
protected onFromChange(event: Event): void {
  this.fromDateStr.set((event.target as HTMLInputElement).value);
}

protected onToChange(event: Event): void {
  this.toDateStr.set((event.target as HTMLInputElement).value);
}

protected async onSearch(): Promise<void> {
  const id = this.partieId();
  if (!id) return;
  const from = this.fromDateStr();
  const to   = this.toDateStr();
  await this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { from, to },
    queryParamsHandling: 'merge',
  });
  await this.loadAvailableSlots(id, from, to);
}
```

**IMPORTANT — NE PAS modifier** :
- `isMjMode = computed(() => this.partieId() !== null)` — inchangé
- `loadHeatmap()` — inchangé
- `findMatchingDeclaration()` — inchangé
- Tous les handlers de calendrier existants (`onSlotSelected`, `onViewChange`, etc.) — inchangés

### Task 8 — Template : date range form

Modifier `mj-results-panel` dans `calendar-view.html` :

```html
@if (isMjMode()) {
  <div class="mj-results-panel" #slotsPanel>
    <div class="date-range-form">
      <label class="date-range-label">
        Du
        <input
          type="date"
          class="date-input"
          [value]="fromDateStr()"
          (change)="onFromChange($event)"
        />
      </label>
      <label class="date-range-label">
        Au
        <input
          type="date"
          class="date-input"
          [value]="toDateStr()"
          (change)="onToChange($event)"
        />
      </label>
      <button mat-stroked-button (click)="onSearch()">Rechercher</button>
    </div>
    <app-available-slots
      [slots]="availableSlots()"
      [loading]="slotsLoading()"
      [error]="slotsError()"
    />
  </div>
}
```

**IMPORTANT** : Le `@if (isMjMode())` et la `<div class="mj-results-panel" #slotsPanel>` existent déjà — ne les dupliquer pas. Insérer uniquement le `<div class="date-range-form">...</div>` AVANT `<app-available-slots>`.

### Task 9 — Styles à ajouter dans `calendar-view.scss`

```scss
/* ── Date range form ── */
.date-range-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--mat-sys-outline-variant, #ccc);
}

.date-range-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--mat-sys-on-surface-variant, #666);
}

.date-input {
  padding: 6px 8px;
  border: 1px solid var(--mat-sys-outline, #999);
  border-radius: 4px;
  font-size: 0.875rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
```

### Ce qui NE doit PAS changer

- `AvailableSlotsPanel` (`available-slots.ts/html/scss`) — aucune modification
- `CreneauCard`, `AggregatedCreneauCard` — aucune modification
- `CalendarMonthView`, `CalendarWeekView` — aucune modification
- `ConstraintPanel` — aucune modification
- `getHeatmap()` dans le service — aucune modification
- Le mode "calendrier personnel" (sans `partieId`) — le picker ne s'affiche que dans `@if (isMjMode())` donc inchangé

### Piège : `FormsModule` non importé dans `CalendarView`

`CalendarView` n'importe pas `FormsModule`. **NE PAS utiliser `[(ngModel)]`** pour les inputs date. Utiliser uniquement :
- `[value]="fromDateStr()"` (binding one-way)
- `(change)="onFromChange($event)"` (event handler)

### Piège : `Router` vs `ActivatedRoute`

`CalendarView` injecte déjà `ActivatedRoute`. `Router` est séparé et doit être injecté en plus :
```typescript
private readonly route  = inject(ActivatedRoute);
private readonly router = inject(Router);
```
Les deux viennent de `@angular/router` — un seul import suffit.

### Piège : test existant "renvoie au plus 5 créneaux" dans `parties.service.spec.ts`

Ce test (ligne ~234) assert `results.length <= 5` mais le service retourne `slice(0, 20)`. Il s'agit d'un test pré-existant potentiellement cassé. **Ne pas le modifier** — le laisser tel quel et ajouter les nouveaux tests uniquement.

### Commandes de test

```bash
# API (Jest)
docker compose exec api pnpm test

# Frontend (Vitest)
docker compose exec web pnpm test
```

### Contexte git récent

- `8de527e` — feat: add button to see date analyser (story 2-3: widget scheduling sur PartieDetail)
- `89d37d5` — feat: add frontend to visualize player disposition (story 2-2)
- `f8fe71e` — feat: backend add date aggregation for a party (getHeatmap endpoint)

Story 2-3 est `done`. Stories 2-4 est `dropped`. Pas de dépendance de story 2-5 sur 2-4.

## Dev Agent Record

### Agent Model Used

(à remplir lors de l'implémentation)

### Debug Log References

(à remplir lors de l'implémentation)

### Completion Notes List

(à remplir lors de l'implémentation)

### File List

(à remplir lors de l'implémentation)

### Change Log

- 2026-06-29 : Story créée — analyse complète des fichiers existants, patterns identifiés, implémentation guidée
