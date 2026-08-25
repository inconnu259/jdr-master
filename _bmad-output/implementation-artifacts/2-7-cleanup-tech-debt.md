---
baseline_commit: "3e379ce2fb3217d78eda31d74a710e91d3e0a438"
---

# Story 2.7 : Tech debt & bugfixes Epic 2 (defers groupés)

Status: done

## Story

As the dev team,
We want to address all deferred findings from Epic 2 that can be implemented now (excluding Epic 3 items),
So that the codebase is clean, correct, and consistent before moving to Epic 3.

## Acceptance Criteria

**AC1 — Q1 : Le MJ est toujours inclus dans le calcul, et tout créneau où il est UNAVAILABLE est hard-exclu**

Given `getAvailableSlots` dans `parties.service.ts`
When un créneau est calculé et que le MJ a le statut UNAVAILABLE sur ce créneau
Then ce créneau n'apparaît pas dans les résultats (ni pour le MJ, ni pour les joueurs)
And les créneaux où le MJ est AVAILABLE ou UNKNOWN continuent d'apparaître.

**AC2 — Q2B : `AggregatedSlotDto.unavailable` reflète le vrai compte de membres non-MJ indisponibles**

Given un créneau où certains joueurs (pas le MJ) sont UNAVAILABLE
When ce créneau est retourné pour un joueur (réponse agrégée)
Then `AggregatedSlotDto.unavailable` est > 0 et reflète le vrai nombre de membres UNAVAILABLE
And les créneaux concernés sont visibles dans les résultats (pas exclus).

**AC3 — Q5 : La valeur `weeks` max est réduite à 16**

Given `GetAvailableSlotsDto`
When un client envoie `weeks=17` ou plus
Then la validation retourne une erreur 400
And `weeks=16` est accepté.

**AC4 — W1 : Le paramètre `?weeks=` stale est nettoyé lors d'une recherche from/to**

Given l'URL contient `?weeks=8` (param stale d'une ancienne navigation)
When l'utilisateur lance une recherche from/to via `onSearch()`
Then `?weeks=` est retiré de l'URL (non propagé)
And seuls `?from=` et `?to=` subsistent.

**AC5 — W2 : Le test de tri dans `parties.service.spec.ts` ne dépend plus de statuts homogènes**

Given le test `'renvoie au plus 20 créneaux triés par date croissante'`
When les mocks retournent des statuts homogènes (UNKNOWN)
Then le test vérifie explicitement le comportement de tri par priorité et par date
And un test séparé couvre le tri mixte (AVAILABLE + UNAVAILABLE) pour prévenir les régressions.

**AC6 — Constante `DEFAULT_WEEKS` extraite dans le controller**

Given `parties.controller.ts` contient `q.weeks ?? 8` inline
When l'implémentation est appliquée
Then une constante `DEFAULT_WEEKS = 8` est déclarée avant la classe
And le controller l'utilise à la place de la valeur magique.

**AC7 — AC6 weekday en lowercase dans `partie-detail.ts`**

Given `nextSessionLabel` compute `Intl.DateTimeFormat.format(d)` avec `weekday: 'long'`
When le résultat est rendu dans le template
Then le jour de la semaine est en minuscule (`lundi` et non `Lundi`)
And `.toLocaleLowerCase('fr-FR')` est appliqué explicitement (pas de dépendance au runtime).

**AC8 — Q7 : `loadLinks()` déclenché de façon réactive via `effect()`**

Given `partie-detail.ts` appelle `if (this.isMj()) await this.loadLinks()` dans `ngOnInit`
When l'implémentation est appliquée
Then `loadLinks()` est déclenché par un `effect()` dans le constructeur qui réagit au signal `isMj()`
And l'appel impératif est retiré de `ngOnInit`
And le scan de patterns similaires dans le projet est documenté dans le Dev Agent Record.

**AC9 — Q8 : `displayDateChange` émet UTC-midnight depuis `calendar-month-view.ts`**

Given les méthodes `goToToday()`, `prevMonth()`, `nextMonth()` émettent des `Date` local-midnight
When l'implémentation est appliquée
Then chaque méthode émet `new Date(Date.UTC(...))` cohérent avec ce que `calendar-week-view` émet déjà
And `loadHeatmap()` dans `calendar-view.ts` utilise les méthodes UTC (`getUTCFullYear()`, `getUTCMonth()`, `getUTCDay()`, `getUTCDate()`) pour calculer la grille.

**AC10 — D2+D4 : Assertion DOM dans `calendar-view.spec.ts`**

Given `calendar-view.spec.ts` vérifie `isMjMode()` via `(component as any)`
When l'implémentation est appliquée
Then au moins un test vérifie la présence/absence d'un élément DOM correspondant au panel MJ dans le template
And le cast `as any` peut être conservé en complément mais le test DOM est ajouté.

**AC11 — D5 : Second `detectChanges()` après `whenStable()` dans `calendar-view.spec.ts`**

Given `createCalendarView` fait `detectChanges()` + `whenStable()` sans second cycle
When l'implémentation est appliquée
Then un second `fixture.detectChanges()` est ajouté après `await fixture.whenStable()`
And les tests existants continuent de passer.

## Tasks/Subtasks

- [x] Task 1 — Backend : Q1 MJ hard-exclude + Q2B AggregatedSlotDto (AC1, AC2)
  - [x] Dans `parties.service.ts`, après la construction du tableau `all`, filtrer les slots où le MJ est UNAVAILABLE avant le tri
  - [x] Vérifier que le mapping `AggregatedSlotDto` (`unavailable: members.filter(m => m.status === 'UNAVAILABLE').length`) est correct tel quel
  - [x] Ajouter un test backend : créneau MJ UNAVAILABLE → absent des résultats
  - [x] Ajouter un test backend : créneau joueur UNAVAILABLE (mais MJ AVAILABLE) → présent, `unavailable > 0` dans AggregatedSlotDto
  - [x] Lancer `docker compose exec api pnpm test` — 0 régression

- [x] Task 2 — Backend : Q5 + constante `DEFAULT_WEEKS` (AC3, AC6)
  - [x] `apps/api/src/parties/dto/get-available-slots.dto.ts:9` — `@Max(52)` → `@Max(16)`
  - [x] `apps/api/src/parties/parties.controller.ts:55` — extraire `const DEFAULT_WEEKS = 8` avant la classe, remplacer `q.weeks ?? 8` par `q.weeks ?? DEFAULT_WEEKS`
  - [x] Ajouter un test DTO : `weeks=17` → erreur de validation
  - [x] Lancer `docker compose exec api pnpm test` — 0 régression

- [x] Task 3 — Backend : W2 fix test sort fragility (AC5)
  - [x] `apps/api/src/parties/parties.service.spec.ts:238` — renommer le test en `'renvoie au plus 20 créneaux (limite de résultats)'`
  - [x] Séparer l'assertion de count (`toBeLessThanOrEqual(20)`) de l'assertion de sort
  - [x] Ajouter un test avec statuts mixtes (mock `computeSlotStatus` alternant AVAILABLE/UNAVAILABLE) qui vérifie que les slots AVAILABLE arrivent avant les UNAVAILABLE dans les résultats
  - [x] Lancer `docker compose exec api pnpm test` — 0 régression

- [x] Task 4 — Frontend : W1 stale `?weeks=` param (AC4)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:155` — dans `onSearch()`, ajouter `weeks: null` dans `queryParams: { from, to, weeks: null }` pour vider le param stale lors d'une navigation merge
  - [x] Vérifier que le comportement existant est inchangé (pas de régression sur la navigation)

- [x] Task 5 — Frontend : AC7 weekday lowercase dans `partie-detail.ts` (AC7)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts:80` — ajouter `.toLocaleLowerCase('fr-FR')` après `.format(d)`

- [x] Task 6 — Frontend : Q7 pattern réactif `effect()` pour `loadLinks()` (AC8)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` — ajouter `effect` à l'import Angular
  - [x] Ajouter un constructeur avec `effect(() => { if (this.isMj()) void this.loadLinks(); })`
  - [x] Retirer `if (this.isMj()) await this.loadLinks();` de `ngOnInit`
  - [x] Scanner le projet pour des patterns similaires (voir Dev Notes §Q7)
  - [x] Documenter les résultats du scan dans le Dev Agent Record
  - [x] Lancer `docker compose exec web pnpm test` — 0 régression

- [x] Task 7 — Frontend : Q8 UTC-midnight `calendar-month-view.ts` + `loadHeatmap` (AC9)
  - [x] `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` — corriger `goToToday()`, `prevMonth()`, `nextMonth()`
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:173` — corriger `loadHeatmap()` pour utiliser `getUTCFullYear()`, `getUTCMonth()`, `getUTCDay()`, `getUTCDate()`
  - [x] Ajouter des tests dans `calendar-month-view.spec.ts` : `goToToday()`, `nextMonth()`, `prevMonth()` émettent un `Date` UTC-midnight
  - [x] Lancer `docker compose exec web pnpm test` — 0 régression

- [x] Task 8 — Frontend : D2+D4 DOM assertion + D5 second detectChanges (AC10, AC11)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` — sélecteur `.mj-results-panel` identifié dans le template
  - [x] Ajouter un test DOM : quand `mode='mj'`, `.mj-results-panel` est présent ; quand `mode='personal'`, il est absent
  - [x] Dans `createCalendarView()`, ajouter `fixture.detectChanges()` après `await fixture.whenStable()`
  - [x] Lancer `docker compose exec web pnpm test` — 0 régression

- [x] Task 9 — Validation finale
  - [x] `docker compose exec api pnpm test` — 94 tests, 0 régression
  - [x] `docker compose exec web pnpm test` — 65 tests, 0 régression

## Dev Notes

### Vue d'ensemble des items groupés

Cette story regroupe 12 deferred items issus des code reviews d'Epic 2. Ordre recommandé : backend d'abord (Tasks 1-3), puis frontend (Tasks 4-8).

---

### Task 1 — Q1 MJ hard-exclude + Q2B AggregatedSlotDto

**Fichier** : `apps/api/src/parties/parties.service.ts`

`resolveParticipants()` (ligne 107) inclut déjà le MJ via `user.findUnique` + `seen` set. Il est toujours le premier élément de `participants`. Aucun changement dans `resolveParticipants`.

Le problème : dans `getAvailableSlots`, les slots où le MJ est UNAVAILABLE ont priorité 3 dans le tri mais ne sont pas hard-exclus — ils apparaissent en dernier mais restent dans les résultats.

**Fix Q1 — filtrage avant le tri** (après les deux boucles `from/to` et `weeks`) :

```typescript
// Après la construction de `all`, avant le tri
// Q1 : hard-exclude tout créneau où le MJ est UNAVAILABLE
const mjId = partie.mjId;
const filtered = all.filter((s) => {
  const mj = s.members.find((m) => m.userId === mjId);
  return mj?.status !== 'UNAVAILABLE';
});

// Puis trier `filtered` au lieu de `all`
const sorted = [...filtered].sort((a, b) => { ... });
```

**Fix Q2B** : le mapping `AggregatedSlotDto` (lignes 235-242) calcule déjà :
```typescript
unavailable: members.filter((m) => m.status === 'UNAVAILABLE').length,
```
Avec Q1 appliqué, les slots restants peuvent avoir des joueurs UNAVAILABLE (mais pas le MJ). Ce count sera maintenant > 0 pour ces slots. **Aucun changement de code nécessaire** pour Q2B — c'est automatique.

**Tests à ajouter** dans `parties.service.spec.ts` :

```typescript
it('hard-exclut un créneau où le MJ est UNAVAILABLE', async () => {
  // MJ = 'mj1', membre = 'u1'
  avail.computeSlotStatus.mockImplementation((_decls, _date, _slot) => {
    // MJ indisponible partout
    if (_decls === avail.computeSlotStatus.mock.calls[0]?.[0]) return 'UNAVAILABLE';
    return 'AVAILABLE';
  });
  // Utiliser des mocks plus précis par userId
  avail.getActiveDeclarations.mockResolvedValue(new Map([
    ['mj1', []], ['u1', []],
  ]));
  avail.computeSlotStatus.mockImplementation((_decls, _date, _slot) => 'UNAVAILABLE');
  // Tous les créneaux MJ sont UNAVAILABLE → 0 résultat
  const results = await service.getAvailableSlots('p1', 'mj1', 1);
  expect(results).toHaveLength(0);
});
```

Note : adapter le mock selon la structure existante (`avail.computeSlotStatus` reçoit `(decls[], date, slot)` — on peut distinguer MJ vs joueur via la Map retournée par `getActiveDeclarations`).

---

### Task 2 — Q5 `@Max(16)` + constante `DEFAULT_WEEKS`

**Fichier 1** : `apps/api/src/parties/dto/get-available-slots.dto.ts:9`
```typescript
// AVANT :
@Max(52)
// APRÈS :
@Max(16)
```

**Fichier 2** : `apps/api/src/parties/parties.controller.ts`
```typescript
// AVANT (ligne 55) :
return this.parties.getAvailableSlots(id, user.id, q.weeks ?? 8, q.from, q.to);

// APRÈS (extraire avant la classe) :
const DEFAULT_WEEKS = 8;

@UseGuards(AuthenticatedGuard)
@Controller('parties')
export class PartiesController {
  // ...
  return this.parties.getAvailableSlots(id, user.id, q.weeks ?? DEFAULT_WEEKS, q.from, q.to);
}
```

---

### Task 3 — W2 fix sort test fragility

**Fichier** : `apps/api/src/parties/parties.service.spec.ts:238`

Test actuel (fragile) :
```typescript
it('renvoie au plus 20 créneaux triés par date croissante', async () => {
  avail.computeSlotStatus.mockReturnValue('UNKNOWN');
  const results = (await service.getAvailableSlots('p1', 'mj1', 8)) as AvailableSlotDto[];
  expect(results.length).toBeLessThanOrEqual(20);
  for (let i = 1; i < results.length; i++) {
    expect(results[i].date >= results[i - 1].date).toBe(true); // fragile
  }
});
```

Pourquoi c'est fragile : le tri est par priorité en premier, puis par date. L'assertion date-croissante est fausse si les priorités varient. Elle passe ici seulement parce que tous les statuts sont UNKNOWN (priorité 2 homogène).

**Fix** : séparer les assertions, rendre le contrat explicite.

```typescript
it('renvoie au plus 20 créneaux (limite de résultats)', async () => {
  avail.computeSlotStatus.mockReturnValue('UNKNOWN');
  const results = await service.getAvailableSlots('p1', 'mj1', 8);
  expect(results.length).toBeLessThanOrEqual(20);
});

it('trie les créneaux : AVAILABLE avant UNKNOWN avant UNAVAILABLE', async () => {
  // Premier appel → AVAILABLE (mj), deuxième → UNAVAILABLE (membre), reste → UNKNOWN
  let callCount = 0;
  avail.computeSlotStatus.mockImplementation(() => {
    callCount++;
    if (callCount % 2 === 0) return 'UNAVAILABLE';
    return 'AVAILABLE';
  });
  const results = (await service.getAvailableSlots('p1', 'mj1', 1)) as AvailableSlotDto[];
  // Le premier résultat doit avoir tous les membres AVAILABLE (priorité 0)
  // (ajuster selon la logique MJ hard-exclude)
  expect(results.length).toBeGreaterThan(0);
  // Les slots sans refus apparaissent avant ceux avec refus
  const firstHasUnavail = results[0].members.some((m) => m.status === 'UNAVAILABLE');
  expect(firstHasUnavail).toBe(false);
});
```

Note : adapter les mocks à la logique Q1 (le MJ est le premier participant). Après Q1, les slots où le MJ est UNAVAILABLE sont exclus, donc le mock doit s'assurer que le MJ n'est pas UNAVAILABLE si on veut des résultats.

---

### Task 4 — W1 stale `?weeks=` param

**Fichier** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:155`

```typescript
// AVANT :
queryParams: { from, to },
queryParamsHandling: 'merge',

// APRÈS :
queryParams: { from, to, weeks: null },  // null efface le param lors du merge
queryParamsHandling: 'merge',
```

Angular Router : `null` dans `queryParams` avec `queryParamsHandling: 'merge'` supprime le paramètre de l'URL.

---

### Task 5 — AC7 weekday lowercase

**Fichier** : `apps/web/src/app/features/parties/partie-detail/partie-detail.ts:80`

```typescript
// AVANT :
}).format(d);

// APRÈS :
}).format(d).toLocaleLowerCase('fr-FR');
```

`Intl.DateTimeFormat` retourne `'lundi'` (lowercase) en V8 actuellement, mais la spec ne le garantit pas. `.toLocaleLowerCase('fr-FR')` rend le comportement explicite et portable.

---

### Task 6 — Q7 pattern réactif `effect()` pour `loadLinks()`

**Fichier** : `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`

**Pourquoi la race condition existe** : dans `ngOnInit` (ligne 91-97), `partie.set(...)` est appelé, puis `isMj()` est évalué immédiatement après. Si le signal `auth.currentUser()` n'est pas encore résolu (cas d'un rechargement de page avec session asynchrone), `isMj()` retourne `false` et `loadLinks()` n'est jamais appelé. Avec `effect()`, la réactivité garantit que `loadLinks()` sera appelé quand `isMj()` devient `true`, peu importe l'ordre de résolution.

**Changement** :

```typescript
// AJOUTER 'effect' à l'import :
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';

// AJOUTER un constructeur :
constructor() {
  effect(() => {
    if (this.isMj()) void this.loadLinks();
  });
}

// MODIFIER ngOnInit — retirer l'appel conditionnel :
async ngOnInit(): Promise<void> {
  const id = this.route.snapshot.paramMap.get('id');
  if (!id) return;
  this.partie.set(await this.parties.get(id));
  await this.loadMembers();
  // SUPPRIMÉ : if (this.isMj()) await this.loadLinks();
}
```

**Comportement attendu** :
- Au démarrage : `isMj()` = false (partie non chargée) → effect ne fait rien
- Après `this.partie.set(...)` : `isMj()` se recalcule → si true, effect déclenche `loadLinks()`
- Si `auth.currentUser()` résout après `partie.set()` : effect se redéclenche → `loadLinks()` appelé correctement

**Attention** : l'effect sera déclenché à chaque fois que `isMj()` passe à `true`. Dans ce composant c'est déterministe (la partie change une fois), mais vérifier qu'il n'y a pas de double-call possible.

**Scan de patterns similaires** : chercher dans `apps/web/src` des patterns `if (this.someComputed()) await this.someLoad()` dans des `ngOnInit`. Documenter dans le Dev Agent Record.

```
grep -r "if (this\." apps/web/src --include="*.ts" | grep "await this\."
```

---

### Task 7 — Q8 UTC-midnight `calendar-month-view.ts` + `loadHeatmap`

#### Architecture : comment les dates circulent

```
calendar-month-view
  displayDate (signal interne) : Date local-midnight  → utilisé par buildMonth()
  displayDateChange (output)   : doit émettre UTC-midnight (cohérent avec week-view)

calendar-view
  onMonthDateChange(d: Date)   : reçoit UTC-midnight → passe à loadHeatmap()
  loadHeatmap(centerDate)      : doit utiliser getUTC*() pour calculer la grille
```

#### Fix 1 — `calendar-month-view.ts` lignes 175-192

Les trois méthodes de navigation émettent des `Date` local-midnight. Fix : garder `displayDate` en local (pour `buildMonth` qui utilise `getFullYear()`/`getMonth()`), mais émettre UTC-midnight dans `displayDateChange`.

```typescript
// AVANT :
goToToday(): void {
  const today = new Date();
  this.displayDate.set(today);
  this.displayDateChange.emit(today);
}

// APRÈS :
goToToday(): void {
  const today = new Date();
  this.displayDate.set(today); // local-midnight pour buildMonth
  const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  this.displayDateChange.emit(utc); // UTC-midnight pour le parent
}

// AVANT :
prevMonth(): void {
  const d = this.displayDate();
  const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  this.displayDate.set(next);
  this.displayDateChange.emit(next);
}

// APRÈS :
prevMonth(): void {
  const d = this.displayDate();
  const next = new Date(d.getFullYear(), d.getMonth() - 1, 1); // local
  this.displayDate.set(next);
  const utc = new Date(Date.UTC(next.getFullYear(), next.getMonth(), 1));
  this.displayDateChange.emit(utc);
}

// AVANT :
nextMonth(): void {
  const d = this.displayDate();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  this.displayDate.set(next);
  this.displayDateChange.emit(next);
}

// APRÈS :
nextMonth(): void {
  const d = this.displayDate();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1); // local
  this.displayDate.set(next);
  const utc = new Date(Date.UTC(next.getFullYear(), next.getMonth(), 1));
  this.displayDateChange.emit(utc);
}
```

#### Fix 2 — `calendar-view.ts:loadHeatmap()` lignes 173-187

`centerDate` est maintenant UTC-midnight (venant de `displayDateChange`). Les méthodes locales (`getFullYear()`, `getMonth()`) peuvent retourner une valeur incorrecte en timezone UTC− (ex: UTC-5 voit `2026-06-01T00:00:00Z` comme `2026-05-31 19:00`). Fix : utiliser les méthodes UTC.

```typescript
// AVANT :
private async loadHeatmap(id: string, centerDate: Date = new Date()): Promise<void> {
  const firstOfMonth = new Date(centerDate.getFullYear(), centerDate.getMonth(), 1);
  const dow = firstOfMonth.getDay();
  const startOffset = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - startOffset);
  const gridEnd   = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41);
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // ...
}

// APRÈS :
private async loadHeatmap(id: string, centerDate: Date = new Date()): Promise<void> {
  const year  = centerDate.getUTCFullYear();
  const month = centerDate.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = firstOfMonth.getUTCDay();
  const startOffset = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(Date.UTC(year, month, 1 - startOffset));
  const gridEnd   = new Date(Date.UTC(
    gridStart.getUTCFullYear(),
    gridStart.getUTCMonth(),
    gridStart.getUTCDate() + 41,
  ));
  const toIso = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  // ...
}
```

Note : l'appel initial dans `ngOnInit` est `loadHeatmap(id)` sans `centerDate`, donc `new Date()` est utilisé. Cela reste correct : `new Date()` a `getUTCFullYear/Month/Date()` toujours corrects quelle que soit la timezone.

#### Tests pour Q8

Dans `calendar-month-view.spec.ts`, ajouter des tests sur le composant (pas seulement `buildMonth`) :

```typescript
it('goToToday() émet un Date UTC-midnight', () => {
  // Instancier CalendarMonthView dans TestBed, souscrire à displayDateChange
  // Appeler goToToday(), vérifier que emittedDate.getTime() % 86400000 === 0
  // ET que emittedDate.getUTCDate() === new Date().getUTCDate()
});

it('nextMonth() émet un Date UTC-midnight au 1er du mois suivant', () => {
  // Similar
});
```

---

### Task 8 — D2+D4 DOM assertion + D5 second detectChanges

**Fichier** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

#### D2+D4 : trouver le sélecteur DOM

Lire `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` avant d'écrire le test. Chercher l'élément conditionnel `@if (isMjMode())`. Son tag ou sa classe CSS sera le sélecteur à utiliser.

```typescript
it('affiche le panel MJ quand mode="mj"', async () => {
  const fixture = await createCalendarView('mj');
  const el = fixture.nativeElement.querySelector('.mj-results-panel'); // adapter le sélecteur
  expect(el).not.toBeNull();
});

it('masque le panel MJ quand mode="personal"', async () => {
  const fixture = await createCalendarView('personal');
  const el = fixture.nativeElement.querySelector('.mj-results-panel'); // adapter le sélecteur
  expect(el).toBeNull();
});
```

#### D5 : second `detectChanges()`

```typescript
// AVANT :
fixture.detectChanges();
await fixture.whenStable();
return fixture;

// APRÈS :
fixture.detectChanges();
await fixture.whenStable();
fixture.detectChanges(); // second cycle pour les bindings asynchrones
return fixture;
```

---

### Ce qui NE doit PAS changer

- `resolveParticipants()` dans `parties.service.ts` — la logique d'inclusion du MJ est déjà correcte
- `buildMonth()` dans `calendar-month-view.ts` — utilise délibérément local-midnight pour le rendu (inchangé)
- `DayCell.date` — reste local-midnight (utilisé uniquement pour la navigation UI)
- `onCellClick()` → `slotSelected.emit()` — émet local-midnight vers `findMatchingDeclaration()` qui convertit en UTC correctement
- `getHeatmap()` dans `parties.service.ts` — non concerné par ces stories
- Template `calendar-view.html` — peut nécessiter une lecture mais pas de modification
- Aucun schema Prisma

---

### Contexte git récent

- `3e379ce` — feat: add mj mod for calendar (story 2-6, baseline de cette story)
- `17b8c7f` — feat: add date research for the poll (story 2-5)
- `8de527e` — feat: add button to see date analyser (story 2-3)

### Commandes de test

```bash
docker compose exec api pnpm test
docker compose exec web pnpm test
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Aucun blocage. Implémentation directe sur tous les items.

### Completion Notes List

- Task 1 (Q1) : filtre `filtered = all.filter(s => mj?.status !== 'UNAVAILABLE')` inséré avant le tri dans `parties.service.ts`. Sort et slice appliqués sur `filtered` au lieu de `all`.
- Task 1 (Q2B) : le mapping `unavailable` dans `AggregatedSlotDto` était déjà correct ; automatiquement non-nul après Q1 car les slots avec joueurs UNAVAILABLE (sans MJ UNAVAILABLE) ne sont plus exclus.
- Task 2 (Q5) : `@Max(52)` → `@Max(16)` dans `get-available-slots.dto.ts`.
- Task 2 (DEFAULT_WEEKS) : `const DEFAULT_WEEKS = 8` extrait avant la classe dans `parties.controller.ts`.
- Task 3 (W2) : test split en 2 — `'renvoie au plus 20 créneaux (limite)'` + `'trie par priorité'` avec statuts mixtes. Ajout describe `'Q1 : exclusion hard MJ UNAVAILABLE'` avec 2 tests dédiés incluant mock MJ user.
- Task 4 (W1) : `queryParams: { from, to, weeks: null }` dans `onSearch()` — `null` efface le param stale lors du merge.
- Task 5 (AC7) : `.toLocaleLowerCase('fr-FR')` ajouté après `.format(d)` dans `nextSessionLabel`.
- Task 6 (Q7) : `effect(() => { if (this.isMj()) void this.loadLinks(); })` dans constructeur. Appel impératif retiré de `ngOnInit`. Scan : aucun autre pattern similaire trouvé dans `apps/web/src`.
- Task 7 (Q8) : `goToToday/prevMonth/nextMonth` gardent `displayDate` local (pour buildMonth) mais émettent `new Date(Date.UTC(...))`. `loadHeatmap` passe à `getUTC*` pour cohérence avec les dates reçues. 3 tests de navigation UTC ajoutés dans `calendar-month-view.spec.ts`.
- Task 8 (D4+D5) : 2 tests DOM `.mj-results-panel` ajoutés. Second `fixture.detectChanges()` ajouté après `whenStable()` dans `createCalendarView()`.
- Résultat final : 94 tests API (6 nouveaux), 65 tests frontend (5 nouveaux), 0 régression.

### File List

```
apps/api/src/parties/parties.service.ts                                          UPDATE
apps/api/src/parties/parties.service.spec.ts                                     UPDATE
apps/api/src/parties/dto/get-available-slots.dto.ts                              UPDATE
apps/api/src/parties/parties.controller.ts                                       UPDATE
apps/web/src/app/features/parties/partie-detail/partie-detail.ts                 UPDATE
apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts    UPDATE
apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts  UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.ts                UPDATE
apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts           UPDATE
```

### Change Log

- 2026-06-30 : Story créée depuis deferred-work.md — décisions Q1/Q2B/Q5/Q7/Q8 confirmées par l'utilisateur
- 2026-06-30 : Implémentation complète — 9 fichiers modifiés, 11 nouveaux tests (6 API + 5 frontend), 159 tests total, 0 régression
