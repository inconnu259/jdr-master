---
baseline_commit: 44eccdffd32607150b6bb230181dae91ce15d403
---

# Story 1.8: Robustesse & polish calendrier (tech debt déféré)

Status: done

## Story

As a developer maintaining the calendar feature,
I want to fix a set of deferred correctness and accessibility bugs in the calendar views,
so that the application is reliable across timezones, screen readers, and long-running sessions.

## Acceptance Criteria

**AC1 — `findWeekDecl` respecte `endDate` des RECURRING (correctif modèle SPLIT)**

Given a RECURRING declaration that has been split (and possède donc un `endDate` borné),
When the week view computes `declLabel` for a cell after `endDate`,
Then `findWeekDecl` returns `null` for this cell (pas de label "Indispo · Récurrent" après la borne).

*Contexte :* Story 1-7 a ajouté le check `endDate` dans `computeDisplayStatus`, `findMatchingDeclaration` (calendar-view), et `matchesDeclaration` (service). `findWeekDecl` dans `calendar-week-view.ts` a été oublié — il manque le `return false` quand `utcDate > endDate`. Ce bug cause un affichage du label "Indispo · Récurrent" sur des cellules qui n'appartiennent plus à la série.

**AC2 — `getWeekStart` utilise UTC**

Given a user in a UTC− timezone (e.g. UTC-5) consulte le calendrier un dimanche soir (23h heure locale = lundi 4h UTC),
When the week view calculates the start of the week,
Then `getWeekStart` donne lundi (correct) et non dimanche (incorrect avec la méthode locale actuelle).

*Fix :* remplacer les méthodes locales (`getDay()`, `setHours()`, `setDate()`) par des équivalents UTC dans `getWeekStart`.

**AC3 — `todayMidnight` est recalculé dynamiquement**

Given a user who keeps the calendar open across midnight,
When a new day begins,
Then `isToday` and `isPast` are calculated correctly relative to the actual current day (not the day the component was initialized).

*Fix :* les deux composants (vue mois et vue semaine) calculent `todayMidnight` comme propriété de classe immuable à l'init. Il faut passer ce calcul dans les fonctions `buildMonth` / `buildWeek` (qui sont recalculées à chaque signal change), ou utiliser `Date.now()` à chaque accès.

**AC4 — Cellules hors-mois non atteignables au clavier ni par les screen readers**

Given the month view renders 42 cells (6 weeks × 7 days),
When a cell belongs to a previous or next month (`isCurrentMonth === false`),
Then this cell has `aria-hidden="true"` and `tabindex="-1"` (or no tabindex attribute),
And clicks/keypress on it are silently ignored (no panel opens, no error).

*Contexte :* actuellement ces cellules ont `role="button"` et tabindex non négatif quand elles ne sont pas "past", ce qui les rend focusables alors qu'elles appartiennent à un autre mois.

**AC5 — `ThemeToneService` est SSR-safe**

Given the application runs in a Server-Side Rendering context where `localStorage` is not available,
When `ThemeToneService` is instantiated,
Then no `ReferenceError` is thrown (the service falls back to the default theme).

*Fix :* entourer les accès `localStorage` d'un guard `typeof localStorage !== 'undefined'`.

**AC6 — Tests unitaires couvrent les corrections**

- AC1 : test unitaire `findWeekDecl` avec une déclaration RECURRING ayant `endDate < utcDate` → retourne `null`
- AC2 : test unitaire `getWeekStart` avec une date un dimanche soir UTC− → retourne le lundi correct
- AC3 : test unitaire `buildWeek` / `buildMonth` : `isToday` est calculé à partir de la date passée, pas d'un snapshot statique
- AC4 : pas de test unitaire requis (comportement HTML/aria, validé manuellement ou par e2e)
- AC5 : pas de test unitaire requis (guard simple)

## Tasks / Subtasks

- [x] Task 1 — Corriger `findWeekDecl` : ajouter check `endDate` pour RECURRING (AC1)
  - [x] Dans `calendar-week-view.ts` > `findWeekDecl`, après le check `d.startDate`, ajouter : `if (d.endDate && utcDate > toUTCMidnight(d.endDate)) return false;`
  - [x] Écrire un test unitaire dans `calendar-week-view.spec.ts` couvrant ce cas (série RECURRING avec `endDate`, cellule après `endDate` → null)

- [x] Task 2 — Corriger `getWeekStart` : passer en UTC (AC2)
  - [x] Réécrire `getWeekStart` dans `calendar-week-view.ts` pour utiliser `getUTCDay()` et `Date.UTC(...)`
  - [x] Mettre à jour les tests existants dans `calendar-week-view.spec.ts` si nécessaire
  - [x] Ajouter un test : date dimanche 23h UTC-5 → retourne le lundi UTC correct

- [x] Task 3 — Corriger `todayMidnight` stale (AC3)
  - [x] Vue mois (`calendar-month-view.ts`) : supprimer la propriété de classe, recalcul dans `onCellClick` à chaque appel
  - [x] Vue semaine (`calendar-week-view.ts`) : supprimer la propriété de classe, recalcul dans `onCellClick` à chaque appel ; `buildWeek` était déjà correct
  - [x] Vérifier que `isToday` et `isPast` restent corrects dans les tests existants

- [x] Task 4 — Cellules hors-mois non focusables (AC4)
  - [x] Dans `calendar-month-view.html` : sur les cellules `other-month`, poser `[attr.aria-hidden]`, `[attr.tabindex]` et `[attr.role]`
  - [x] Dans `calendar-month-view.ts` > `onCellClick` : guard par comparaison du mois de la date avec `this.displayDate()`

- [x] Task 5 — SSR guard `localStorage` dans ThemeToneService (AC5)
  - [x] Dans `readStoredTheme()` : guard `typeof localStorage !== 'undefined'`
  - [x] Dans `setTheme()` : guard `typeof localStorage !== 'undefined'`
  - [x] Dans `applyClass()` : guard `typeof document !== 'undefined'`

- [x] Task 6 — Valider que tous les tests passent (AC6)
  - [x] `docker compose exec api pnpm test` → 72 tests, 6 suites, tous verts
  - [x] `docker compose exec web pnpm test` → 46 tests, 9 suites, tous verts

### Review Findings (code-review 2026-06-28)

- [x] [Review][Patch] `buildWeek` isToday/isPast utilise local midnight alors que la semaine est UTC-alignée — pour UTC+/- users near midnight, le cell marqué isToday peut être incorrect [calendar-week-view.ts:92-95,127-128]
- [x] [Review][Patch] Tests `getWeekStart` : inputs créés avec `new Date(year, month, day)` (local) mais assertions en UTC — timezone-sensitive en CI non-UTC [calendar-week-view.spec.ts:8-28]
- [x] [Review][Patch] `tabindex="-1"` sur cellules `aria-hidden` viole la spec ARIA (éléments focusables dans un sous-arbre caché) — changer en `null` [calendar-month-view.html:39]
- [x] [Review][Defer] `displayDateChange` émet UTC-midnight depuis week view vs local depuis month view — architecture pré-existante [calendar-week-view.ts:206,212] — deferred, pre-existing
- [x] [Review][Defer] `toUTCMidnight` sur `expiresAt` peut tronquer les composantes selon l'env — pré-existant [calendar-week-view.ts:63] — deferred, pre-existing

## Dev Notes

### Contexte de priorité

Ces correctifs sont du tech debt déféré de stories 1-3 à 1-7. Ordre de priorité :
1. **AC1 (findWeekDecl)** — bug fonctionnel visible : les labels week-view "bleed" à travers les bornes SPLIT. C'est la régression la plus tangible après story 1-7.
2. **AC2 (getWeekStart UTC)** — bug latent pour utilisateurs UTC−. Impact faible en développement (serveur souvent UTC), fort en production.
3. **AC3 (todayMidnight)** — bug de session longue, 1 fois/jour max.
4. **AC4 (aria other-month)** — polish accessibilité.
5. **AC5 (localStorage SSR)** — préventif, SSR non encore activé.

### Corrections détaillées

#### AC1 — `findWeekDecl` dans `calendar-week-view.ts` (lignes 45–70)

**Code actuel :**
```typescript
if (d.recurKind === 'RECURRING') {
  if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
  if (d.startDate) {
    const start = toUTCMidnight(d.startDate);
    if (utcDate < start) return false;
  }
  return utcDate <= toUTCMidnight(d.expiresAt);  // ← MANQUE endDate check
}
```

**Fix :**
```typescript
if (d.recurKind === 'RECURRING') {
  if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
  if (d.startDate) {
    const start = toUTCMidnight(d.startDate);
    if (utcDate < start) return false;
  }
  if (d.endDate) {                               // ← AJOUTÉ
    const end = toUTCMidnight(d.endDate);
    if (utcDate > end) return false;
  }
  return utcDate <= toUTCMidnight(d.expiresAt);
}
```

Note : `toUTCMidnight` est déjà défini dans ce fichier (ligne 34) et accepte une `string`. `d.endDate` est `string | null` dans `AvailabilityDeclarationDto`.

#### AC2 — `getWeekStart` (ligne 25–32 de `calendar-week-view.ts`)

**Code actuel (local-time) :**
```typescript
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();           // ← local timezone
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);   // ← local timezone
  return d;
}
```

**Fix (UTC) :**
```typescript
export function getWeekStart(date: Date): Date {
  const dow = date.getUTCDay();                          // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;                // lundi = jour 0 de semaine
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + diff,
  ));
}
```

**Attention :** `getWeekStart` est exportée et utilisée dans :
- `CalendarWeekView` constructor/effect (via `this.displayWeekStart`)
- `CalendarView.isCurrentWeek` (si appliqué)
- `calendar-week-view.spec.ts` (tests existants à vérifier)

La fonction retournera désormais un Date UTC minuit au lieu d'un Date local minuit. Vérifier que `prevWeek()` / `nextWeek()` qui appellent `new Date(ws); next.setDate(ws.getDate() + 7)` restent corrects — remplacer par `Date.UTC(...)` si nécessaire.

#### AC3 — `todayMidnight` stale

**Vue mois (`calendar-month-view.ts`) :**
```typescript
// Avant : propriété de classe immuable
private readonly todayMidnight = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
```

**Fix :** passer `todayMidnight` en paramètre de `buildMonth` (déjà appelé via `computed` donc recalculé à chaque changement de signal) :

```typescript
// Dans buildMonth :
function buildMonth(display: Date, decls: ..., pendingDecl: ...): DayCell[][] {
  const today = new Date();
  const todayMidnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  // ... utiliser todayMidnight pour isToday/isPast
}
```

Et supprimer la propriété de classe `todayMidnight`. La méthode `onCellClick` utilise aussi `this.todayMidnight` — remplacer par `Date.UTC(...)` inline :
```typescript
protected onCellClick(date: Date, slot: DaySlot): void {
  const cellMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  if (cellMidnight < Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) return;
  this.slotSelected.emit({ date, slot });
}
```

**Vue semaine (`calendar-week-view.ts`) :** même pattern, le `todayMidnight` est calculé dans `buildWeek` (ligne 92 : `today.setHours(0, 0, 0, 0)` et `todayTime = today.getTime()`). Déjà dans la fonction, pas en propriété de classe — **vérifier que c'est bien le cas**. Si oui, AC3 est déjà correct pour la vue semaine.

Vérification rapide du code actuel de `buildWeek` (lignes 87–134) : `const today = new Date(); today.setHours(0, 0, 0, 0); const todayTime = today.getTime();` — oui, calculé dans la fonction. ✅ Seule la **vue mois** est impactée.

La propriété `todayMidnight` de classe reste utilisée dans `onCellClick` (vue mois). Mettre à jour cette méthode séparément.

#### AC4 — Cellules hors-mois

Dans `calendar-month-view.html`, la div `.day-cell` doit recevoir :
```html
[attr.aria-hidden]="!cell.isCurrentMonth ? 'true' : null"
[attr.tabindex]="!cell.isCurrentMonth ? -1 : (cell.isPast ? null : 0)"
[attr.role]="!cell.isCurrentMonth ? 'presentation' : (cell.isPast ? 'presentation' : 'button')"
```

Dans `calendar-month-view.ts` > `onCellClick`, le `date` reçu n'inclut pas `isCurrentMonth`. Deux options :
- Option A (recommandée) : changer la signature en `onCellClick(cell: DayCell, slot: DaySlot)` et vérifier `if (!cell.isCurrentMonth) return;`
- Option B : comparer le mois de la `date` avec `this.displayDate().getMonth()`.

Préférer Option A pour la clarté.

#### AC5 — ThemeToneService SSR

Pattern standard Angular SSR :
```typescript
private readStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'grimoire-emeraude';
  const stored = localStorage.getItem(LS_KEY);
  return THEMES.includes(stored as Theme) ? (stored as Theme) : 'grimoire-emeraude';
}
```
Même pattern pour `setTheme` et `applyClass` (guard `typeof document !== 'undefined'`).

### Fichiers à modifier

```
apps/web/src/app/features/calendar/
  calendar-week-view/
    calendar-week-view.ts           ← MODIFY: findWeekDecl + getWeekStart + buildWeek
    calendar-week-view.spec.ts      ← MODIFY: tests AC1, AC2
  calendar-month-view/
    calendar-month-view.ts          ← MODIFY: todayMidnight → dynamic + onCellClick guard
    calendar-month-view.html        ← MODIFY: aria-hidden + tabindex other-month cells

apps/web/src/app/core/theme/
  theme-tone.service.ts             ← MODIFY: SSR guard localStorage + document
```

### Tests existants à préserver

- `calendar-week-view.spec.ts` : 3 tests `buildWeek` et 2 tests `getWeekStart` — vérifier qu'ils passent après la correction UTC
- `compute-display-status.spec.ts` : non touché
- `constraint-panel.spec.ts` : non touché
- `availability.service.spec.ts` : non touché

### Commandes

```bash
# Tests frontend complets
docker compose exec web pnpm test

# Tests backend (vérif aucune régression)
docker compose exec api pnpm test
```

### Project Structure Notes

- `getWeekStart` est exportée — si d'autres composants l'importent, la correction UTC s'y applique automatiquement
- `buildMonth` et `buildWeek` sont des fonctions pures exportées testées directement — pas de dépendance à Angular TestBed
- `ThemeToneService` : pas de `isPlatformBrowser` nécessaire — le guard `typeof localStorage !== 'undefined'` est suffisant et plus léger

### References

- Code actuel vue semaine : `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts`
- Code actuel vue mois : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`
- Template vue mois : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- ThemeToneService : `apps/web/src/app/core/theme/theme-tone.service.ts`
- Sprint status note 1-8 : `_bmad-output/implementation-artifacts/sprint-status.yaml` (champ `note`)
- Story 1-7 (SPLIT model) : `_bmad-output/implementation-artifacts/1-7-split-contrainte-recurrente.md` (AC3, AC10 + Task 4)
- `computeDisplayStatus` endDate fix (référence pour le pattern) : `apps/web/src/app/core/availability/compute-display-status.ts` ligne 73–75

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC1 : `findWeekDecl` corrigé — ajout du check `if (d.endDate) { const end = toUTCMidnight(d.endDate); if (utcDate > end) return false; }` avant le `return` final RECURRING. Corrige le bleed-through des labels après un SPLIT.
- AC2 : `getWeekStart` réécrit en UTC pur (`getUTCDay`, `Date.UTC`). `buildWeek` également passé en UTC pour la génération des cellules (les dates locales pour l'affichage sont reconstruites depuis les composantes UTC). `prevWeek`/`nextWeek`/`weekLabel` aussi mis à jour.
- AC3 : propriété de classe `todayMidnight` supprimée de `CalendarWeekView` et `CalendarMonthView`. `onCellClick` recalcule `today` localement à chaque invocation. `buildWeek` et `buildMonth` calculaient déjà `todayTime` dans leur corps — pas de modification nécessaire sur ces fonctions.
- AC4 : template vue mois — cellules `other-month` reçoivent `aria-hidden="true"`, `role="presentation"`, `tabindex="-1"`. Guard dans `onCellClick` via comparaison de mois/année avec `displayDate()`.
- AC5 : `ThemeToneService` protégé par `typeof localStorage !== 'undefined'` et `typeof document !== 'undefined'` pour SSR.
- Tests : 46 tests frontend (9 suites) + 72 tests backend (6 suites) — tous verts, aucune régression.
- Nouveau fichier `calendar-month-view.spec.ts` créé avec 5 tests couvrant `buildMonth` (isToday, isCurrentMonth, 6 semaines).
- Nouveaux tests dans `calendar-week-view.spec.ts` : 1 test UTC edge case (AC2), 3 tests `findWeekDecl endDate` (AC1).

### File List

- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts` (nouveau)
- `apps/web/src/app/core/theme/theme-tone.service.ts`
- `_bmad-output/implementation-artifacts/1-8-robustesse-calendrier.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-06-28 : Implémentation story 1-8 — correctifs timezone UTC, endDate RECURRING, todayMidnight stale, aria other-month, SSR guard localStorage. 46 tests frontend + 72 tests backend verts.
