---
baseline_commit: "17b8c7fea1ccc078c2d57385598db4343c082714"
---

# Story 2.6 : Brancher le mode MJ sur le calendrier

Status: done

## Story

As the routing layer of the application,
I want `CalendarView` to receive its `mode` from the route definition (not infer it from `partieId`),
So that the split-layout MJ panel is activated by an explicit contract rather than an implicit URL-param side effect.

## Acceptance Criteria

**AC1 — `withComponentInputBinding()` activé dans le router**

Given `app.config.ts` uses `provideRouter(routes)`
When the developer reads `provideRouter`
Then it is updated to `provideRouter(routes, withComponentInputBinding())`
So that Angular Router binds route `data` properties to component `input()` signals.

**AC2 — Routes CalendarView portent leur `mode` en `data`**

Given `app.routes.ts` declares two CalendarView routes
When the developer reads the routes
Then:
- `/parties/:id/calendar` has `data: { mode: 'mj' }` (MJ + party member access)
- `/profile/calendar` has `data: { mode: 'personal' }` (personal calendar)

**AC3 — `isMjMode()` dérivé du signal `mode` et non de `partieId`**

Given `CalendarView` currently computes `isMjMode = computed(() => this.partieId() !== null)`
When the story is implemented
Then `isMjMode = computed(() => this.mode() === 'mj')`
And all template usage of `isMjMode()` continues to work identically (no template changes required).

**AC4 — Comportement fonctionnel inchangé**

Given the routes are updated and `isMjMode()` is re-derived
When a MJ navigates to `/parties/:id/calendar`
Then the split layout, date-range form, and available-slots panel still appear
And `partieId` is still read from route params for API calls (unchanged)
And when a user navigates to `/profile/calendar`
Then the personal calendar (no MJ panel) still appears.

**AC5 — Test Vitest pour le signal `mode`**

Given a new `calendar-view.spec.ts` file
When the Vitest suite runs
Then at minimum:
- `isMjMode()` returns `true` when `mode='mj'`
- `isMjMode()` returns `false` when `mode='personal'` (default)
All 58+ existing frontend tests continue to pass.

## Tasks/Subtasks

- [x] Task 1 — `app.config.ts` : ajouter `withComponentInputBinding()` (AC1)
  - [x] Importer `withComponentInputBinding` depuis `@angular/router`
  - [x] Changer `provideRouter(routes)` en `provideRouter(routes, withComponentInputBinding())`

- [x] Task 2 — `app.routes.ts` : ajouter `data: { mode }` aux deux routes CalendarView (AC2)
  - [x] `/parties/:id/calendar` → `data: { mode: 'mj' }`
  - [x] `/profile/calendar` → `data: { mode: 'personal' }`

- [x] Task 3 — `calendar-view.ts` : changer `isMjMode()` (AC3)
  - [x] Modifier uniquement la ligne `isMjMode` de `computed(() => this.partieId() !== null)` vers `computed(() => this.mode() === 'mj')`
  - [x] Vérifier qu'aucun autre usage de `mode()` dans le composant n'est nécessaire (ngOnInit reste inchangé)

- [x] Task 4 — Créer `calendar-view.spec.ts` avec 2 tests (AC5)
  - [x] Test 1 : `mode='mj'` → `isMjMode()` retourne `true`
  - [x] Test 2 : mode par défaut → `isMjMode()` retourne `false`

- [x] Task 5 — Validation finale (AC4, AC5)
  - [x] `docker compose exec web pnpm test` — 0 régression + 2 nouveaux tests passent

## Dev Notes

### Vue d'ensemble de l'architecture actuelle

`CalendarView` est utilisé par deux routes dans `app.routes.ts` :

```typescript
{ path: 'parties/:id/calendar', component: CalendarView },  // MJ ou joueur d'une partie
{ path: 'profile/calendar',     component: CalendarView },  // calendrier personnel
```

Actuellement, `isMjMode()` est calculé de façon implicite :
```typescript
// AVANT (stub — ne lit jamais l'input `mode`)
protected readonly isMjMode = computed(() => this.partieId() !== null);
```

`mode` est défini comme un Angular signal input :
```typescript
readonly mode = input<'personal' | 'mj'>('personal');
```

Mais il n'est **jamais lu** car `isMjMode()` se base sur `partieId`. Cette story le branche explicitement.

### Task 1 — `app.config.ts` (1 ligne)

**Fichier** : `apps/web/src/app/app.config.ts`

```typescript
// AVANT :
import { provideRouter } from '@angular/router';
provideRouter(routes),

// APRÈS :
import { provideRouter, withComponentInputBinding } from '@angular/router';
provideRouter(routes, withComponentInputBinding()),
```

`withComponentInputBinding()` dit au Router de binder les `data` de la route vers les `input()` du composant. Angular 16+ feature, stable en Angular 22.

### Task 2 — `app.routes.ts` (2 lignes)

**Fichier** : `apps/web/src/app/app.routes.ts`

```typescript
// AVANT :
{ path: 'parties/:id/calendar', component: CalendarView },
{ path: 'profile/calendar', component: CalendarView },

// APRÈS :
{ path: 'parties/:id/calendar', component: CalendarView, data: { mode: 'mj' } },
{ path: 'profile/calendar', component: CalendarView, data: { mode: 'personal' } },
```

Avec `withComponentInputBinding()`, Angular lie automatiquement `data.mode` au signal `mode()` du composant.

### Task 3 — `calendar-view.ts` (1 ligne)

**Fichier** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`

```typescript
// AVANT (ligne 49) :
protected readonly isMjMode = computed(() => this.partieId() !== null);

// APRÈS :
protected readonly isMjMode = computed(() => this.mode() === 'mj');
```

**C'est le seul changement dans ce fichier.** Aucune autre ligne ne doit être modifiée :
- `ngOnInit` lit toujours `partieId` depuis `route.snapshot.paramMap.get('id')` → inchangé
- La logique `if (id)` dans `ngOnInit` reste le garde pour charger les données MJ → inchangé
- Tout le template continue d'utiliser `isMjMode()` → inchangé

**Pourquoi c'est safe ?** Parce que la route `/parties/:id/calendar` passe `mode='mj'` et a toujours un `:id` param. La route `/profile/calendar` passe `mode='personal'` et n'a jamais d'`:id`. Le couplage logique route-data / param reste cohérent.

### Task 4 — `calendar-view.spec.ts` (nouveau fichier)

**Fichier** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (NOUVEAU)

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { CalendarView } from './calendar-view';
import { ActivatedRoute } from '@angular/router';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { PollService } from '../../../core/poll/poll.service';

function makeActivatedRoute() {
  return {
    snapshot: {
      paramMap:      { get: () => null },
      queryParamMap: { get: () => null },
    },
  };
}

function makeAvailabilityService() {
  return { getMyDeclarations: vi.fn().mockResolvedValue([]) };
}

function makePollService() {
  return {
    getAvailableSlots: vi.fn().mockResolvedValue([]),
    getHeatmap:        vi.fn().mockResolvedValue([]),
  };
}

async function createCalendarView(mode?: 'mj' | 'personal') {
  await TestBed.configureTestingModule({
    imports: [CalendarView],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: ActivatedRoute,      useValue: makeActivatedRoute() },
      { provide: AvailabilityService, useValue: makeAvailabilityService() },
      { provide: PollService,         useValue: makePollService() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarView);
  if (mode) fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('CalendarView — signal mode', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('isMjMode() retourne true quand mode="mj"', async () => {
    const fixture = await createCalendarView('mj');
    expect((fixture.componentInstance as any).isMjMode()).toBe(true);
  });

  it('isMjMode() retourne false avec le mode par défaut ("personal")', async () => {
    const fixture = await createCalendarView();
    expect((fixture.componentInstance as any).isMjMode()).toBe(false);
  });
});
```

**Patterns importants pour ce spec :**
- `fixture.componentRef.setInput('mode', 'mj')` — la seule façon correcte de setter un `input()` signal en Angular 22
- `(fixture.componentInstance as any).isMjMode()` — `isMjMode` est `protected` ; le cast en `any` est nécessaire dans les tests (acceptable)
- `AvailabilityService` ET `PollService` doivent être mockés car `ngOnInit` les appelle (même si `partieId` est null et que les branches if sont court-circuitées, les services doivent exister pour l'injection)
- `provideAnimationsAsync()` est requis pour Angular Material dans le template
- `makeActivatedRoute()` retourne `null` pour `id` et les query params — ainsi `ngOnInit` prend le chemin `else { await this.loadDeclarations(); }` qui appelle `getMyDeclarations()`

### Ce qui NE doit PAS changer

- Template `calendar-view.html` — aucune modification
- `calendar-view.scss` — aucune modification
- `ngOnInit` dans `calendar-view.ts` — aucune modification (partieId continue d'être lu depuis route params)
- `loadAvailableSlots`, `loadHeatmap`, `loadDeclarations` — aucune modification
- `onSearch`, `onFromChange`, `onToChange` — aucune modification
- Aucun fichier backend

### Piège : `withComponentInputBinding()` et les params de route

Avec `withComponentInputBinding()`, Angular tente de binder **tous** les params/data de la route aux inputs du composant. La route `/parties/:id/calendar` a un param `id`. Angular va chercher un input `id` sur CalendarView — il n'existe pas, donc c'est silencieusement ignoré. Pas de problème.

### Piège : `mode` est toujours `'personal'` avant que le Router l'override

Quand le composant s'instancie, `mode()` vaut `'personal'` (la default). Angular applique les bindings de route **avant** d'appeler `ngOnInit`. Donc quand `ngOnInit` s'exécute, `this.mode()` a déjà la valeur correcte de la route. Pas de race condition.

### Piège : test sans route active

Dans le spec, on utilise `provideRouter([])` (routes vides) et `ActivatedRoute` mocké. Il n'y a pas de route active qui fournirait `data.mode`. C'est pourquoi on utilise `fixture.componentRef.setInput('mode', 'mj')` pour setter l'input directement, ce qui simule ce que le Router ferait en production.

### Contexte git récent

- `17b8c7f` — feat: add date research for the poll (story 2-5 committée)
- `8de527e` — feat: add button to see date analyser (story 2-3)
- `89d37d5` — feat: add frontend to visualize player disposition (story 2-2)

### Commandes de test

```bash
docker compose exec web pnpm test
```

## Review Findings

- [x] [Review][Defer] Spec ne teste pas le binding route→data→input end-to-end [calendar-view.spec.ts] — deferred, `provideRouter([])` + `setInput()` direct bypass `withComponentInputBinding()` ; couverture d'intégration à ajouter si un harness router-aware est mis en place
- [x] [Review][Defer] `isMjMode` est `protected`, accès via `(component as any)` dans les tests [calendar-view.spec.ts:52] — deferred, pattern accepté pour les membres protégés en Angular/Vitest ; assertion DOM alternative plus robuste à terme
- [x] [Review][Defer] Param `:id` ignoré silencieusement par `withComponentInputBinding()` — fragilité future si un `id = input()` est ajouté [calendar-view.ts:43] — deferred, safe aujourd'hui
- [x] [Review][Defer] Tests vérifient la valeur du computed signal mais pas le rendu DOM [calendar-view.spec.ts] — deferred, dépasse la portée du story AC5
- [x] [Review][Defer] `ngOnInit` async : second `detectChanges()` manquant après `whenStable()` [calendar-view.spec.ts:44] — deferred, sans impact car les tests ne testent pas le DOM post-chargement

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Aucun — implémentation directe, 0 erreur.

### Completion Notes List

- Task 1 : `withComponentInputBinding()` ajouté à `provideRouter()` dans `app.config.ts`
- Task 2 : `data: { mode: 'mj' }` et `data: { mode: 'personal' }` ajoutés aux deux routes `CalendarView` dans `app.routes.ts`
- Task 3 : `isMjMode` passé de `computed(() => this.partieId() !== null)` à `computed(() => this.mode() === 'mj')` — 1 seule ligne modifiée dans `calendar-view.ts`
- Task 4 : `calendar-view.spec.ts` créé avec 2 tests via `fixture.componentRef.setInput()` + cast `as any` pour l'accès au membre `protected`
- Task 5 : `pnpm test` → 60/60 tests passent (14 fichiers, 2 nouveaux tests verts, 0 régression)

### File List

```
apps/web/src/app/app.config.ts                                             UPDATE
apps/web/src/app/app.routes.ts                                             UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.ts          UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts     NEW
```

### Change Log

- 2026-06-29 : Story créée — analyse du stub `mode`, wiring routes, `isMjMode()` rebasé sur signal
- 2026-06-29 : Implémentation complète — 4 fichiers modifiés/créés, 60/60 tests passent
