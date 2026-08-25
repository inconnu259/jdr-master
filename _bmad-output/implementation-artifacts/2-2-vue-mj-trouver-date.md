---
baseline_commit: f8fe71ed750a032352af938745cd4e9057b54fa7
---

# Story 2.2: Vue MJ "Trouver une date" — frontend & layout desktop

Status: done

## Story

As a GM,
I want to see the computed available slots in a split-screen view on desktop,
so that I can see the calendar and the results side by side without switching screens.

## Acceptance Criteria

**AC1 — Route `/parties/:id/calendar` → `CalendarViewComponent` en mode MJ**

Given the GM navigates to `/parties/:id/calendar`
When the page loads
Then `CalendarView` renders (the route exists in `app.routes.ts`)
And on desktop (≥ 768px): a 60/40 split layout is shown — left column = calendar (month view by default), right column = sticky "Prochaines fenêtres d'aventure" panel
And on mobile (< 768px): the calendar is shown first; a button "Voir les créneaux calculés" allows the user to scroll/reveal the results panel

**AC2 — Appel API et affichage des créneaux calculés**

Given the split layout on desktop
When the page loads
Then `GET /parties/:id/available-slots?weeks=8` is called (via `PollService.getAvailableSlots`)
And the right panel shows up to 5 `CreneauCard` components, sorted by date

**AC3 — Contenu d'une `CreneauCard`**

Given a `CreneauCard` for a slot
When the GM views it
Then the card shows: date (ex. "Samedi 4 juillet") + slot label (Matin / Après-midi / Soirée)
And per-member badges: pseudo + status icon (✅ AVAILABLE / ⚠️ UNKNOWN)
And members with status UNKNOWN show the microcopy `ThemeToneService.tone()['status.unknown_label']`
And a slot where all members are AVAILABLE shows a "Guilde complète" tag (accent color)

**AC4 — Alerte membre sans déclaration**

Given a member has status UNKNOWN in a `CreneauCard`
When the GM views the card
Then an alert is rendered using `ThemeToneService.tone()['alert.missing_player'].replace('{name}', member.pseudo)`

**AC5 — État vide**

Given no common slot is found in the 8-week window
When the results panel renders
Then the empty state shows `ThemeToneService.tone()['empty.no_slots']`

**AC6 — `PollService` stub dans `core/poll/`**

Given a developer creates `apps/web/src/app/core/poll/poll.service.ts`
When it is inspected
Then it exposes: `getAvailableSlots(partieId: string, weeks?: number): Promise<AvailableSlotDto[]>` calling `GET /parties/:id/available-slots?weeks={weeks}` (omit `weeks` param when undefined, defaults to 8 server-side)
And is decorated `@Injectable({ providedIn: 'root' })`

## Tasks / Subtasks

- [x] Task 1 — Ajouter la route `/parties/:id/calendar` (AC1)
  - [x] Dans `apps/web/src/app/app.routes.ts`, ajouter dans la zone authentifiée (après `parties/:id/edit`) :
    `{ path: 'parties/:id/calendar', component: CalendarView }`
  - [x] Importer `CalendarView` si pas déjà présent (il l'est déjà)

- [x] Task 2 — Créer `PollService` stub (AC6)
  - [x] Créer `apps/web/src/app/core/poll/poll.service.ts`
  - [x] Importer `import { API_BASE } from '../api-base'` (même pattern que `AvailabilityService`)
  - [x] Importer `import type { AvailableSlotDto } from '@master-jdr/shared'`
  - [x] Méthode `getAvailableSlots(partieId, weeks?)` : `GET ${API_BASE}/parties/${partieId}/available-slots` avec `{ withCredentials: true }`
    - Si `weeks` est défini, ajouter `?weeks=${weeks}` ; sinon, pas de query param
  - [x] Retourne `Promise<AvailableSlotDto[]>`
  - [x] Écrire 2 tests Vitest (voir Task 7)

- [x] Task 3 — Mettre à jour `tones.ts` : `alert.missing_player` avec `{name}` (AC4)
  - [x] Dans `apps/web/src/app/core/theme/tones.ts`, modifier la clé `alert.missing_player` pour les 3 thèmes :
    - `'grimoire-emeraude'` : `"{name} n'a pas encore consulté l'oracle."`
    - `'foret-ancienne'` : `"{name} n'a pas encore parcouru la forêt."`
    - `'medieval-steampunk'` : `"{name} n'a pas alimenté le registre."`

- [x] Task 4 — Créer `CreneauCard` component (AC3, AC4)
  - [x] Créer `apps/web/src/app/features/calendar/creneau-card/creneau-card.ts` (standalone)
  - [x] Input : `slot = input.required<AvailableSlotDto>()`
  - [x] Injecter `ThemeToneService`
  - [x] Signal dérivé `allAvailable = computed(() => this.slot().members.every(m => m.status === 'AVAILABLE'))`
  - [x] Signal dérivé `unknownMembers = computed(() => this.slot().members.filter(m => m.status === 'UNKNOWN'))`
  - [x] Template `creneau-card.html` :
    - En-tête : date formatée `Intl.DateTimeFormat` UTC + label de slot (MORNING→'Matin', AFTERNOON→'Après-midi', EVENING→'Soirée')
    - `@if (allAvailable())` → tag "Guilde complète" avec classe CSS accent
    - `@for (m of slot().members)` → badge : pseudo + icône statut (✅ si AVAILABLE, ⚠️ si UNKNOWN, ❌ si UNAVAILABLE)
    - `@for (m of unknownMembers())` → alerte : `tone()['alert.missing_player'].replace('{name}', m.pseudo)`
  - [x] Créer `creneau-card.scss` (styles badge, tag "Guilde complète")
  - [x] Écrire 3 tests Vitest (voir Task 7)

- [x] Task 5 — Créer `AvailableSlotsPanel` component (AC2, AC3, AC5)
  - [x] Créer `apps/web/src/app/features/calendar/available-slots/available-slots.ts` (standalone)
  - [x] Inputs :
    - `slots = input.required<AvailableSlotDto[]>()`
    - `loading = input<boolean>(false)`
    - `error = input<string | null>(null)`
  - [x] Injecter `ThemeToneService`
  - [x] Template `available-slots.html` :
    - Titre `h2` : `tone()['section.slots']`
    - `@if (loading())` → skeleton/spinner
    - `@if (error())` → message d'erreur
    - `@if (!loading() && !error() && slots().length === 0)` → `tone()['empty.no_slots']`
    - `@for (s of slots())` → `<app-creneau-card [slot]="s" />`
  - [x] Créer `available-slots.scss`
  - [x] Écrire 3 tests Vitest (voir Task 7)

- [x] Task 6 — Mettre à jour `CalendarView` pour le mode MJ (AC1, AC2)
  - [x] **`calendar-view.ts`** — ajouter :
    - `import { ActivatedRoute } from '@angular/router'`
    - `import { PollService } from '../../../core/poll/poll.service'`
    - `import type { AvailableSlotDto } from '@master-jdr/shared'`
    - `import { AvailableSlotsPanel } from '../available-slots/available-slots'`
    - Inject `ActivatedRoute` et `PollService`
    - Signals : `partieId = signal<string | null>(null)`, `availableSlots = signal<AvailableSlotDto[]>([])`, `slotsLoading = signal(false)`, `slotsError = signal<string | null>(null)`
    - Signal dérivé : `isMjMode = computed(() => this.partieId() !== null)`
    - Dans `ngOnInit` : lire `this.route.snapshot.paramMap.get('id')`, si non-null → `this.partieId.set(id)` puis appeler `loadAvailableSlots(id)` en parallèle de `loadDeclarations()`
    - Méthode privée `loadAvailableSlots(partieId: string)` : appelle `pollSvc.getAvailableSlots(partieId)`, met à jour `availableSlots`, `slotsLoading`, `slotsError`
    - Ajouter `AvailableSlotsPanel` dans le tableau `imports` du décorateur `@Component`
  - [x] **`calendar-view.html`** — restructurer :
    - Wrapper externe `<div class="calendar-page" [class.calendar-page--mj]="isMjMode()">` (déjà présent)
    - Entourer le contenu calendrier (toggle + vues) dans `<div class="calendar-main">`
    - Après `calendar-main`, ajouter :
      ```html
      @if (isMjMode()) {
        <button class="see-slots-btn show-mobile" (click)="scrollToSlots()">
          Voir les créneaux calculés
        </button>
        <div class="mj-results-panel" #slotsPanel>
          <app-available-slots
            [slots]="availableSlots()"
            [loading]="slotsLoading()"
            [error]="slotsError()"
          />
        </div>
      }
      ```
    - Garder le bloc `@if (panelOpen())` (constraint panel) en dehors, au même niveau qu'avant
    - Ajouter dans la classe TS la méthode `scrollToSlots()` avec `@ViewChild('slotsPanel') slotsPanel!: ElementRef` et `this.slotsPanel.nativeElement.scrollIntoView({ behavior: 'smooth' })`
  - [x] **`calendar-view.scss`** — ajouter en fin de fichier :
    ```scss
    .calendar-main {
      flex: 1;
      min-width: 0;
    }

    .mj-results-panel {
      flex: 0 0 40%;
    }

    .see-slots-btn {
      display: none;
    }

    @media (max-width: 767px) {
      .see-slots-btn.show-mobile {
        display: block;
        margin: 12px auto;
      }
      .mj-results-panel {
        margin-top: 24px;
      }
    }

    @media (min-width: 768px) {
      .calendar-page--mj {
        display: flex;
        align-items: flex-start;
        gap: 24px;
      }
      .mj-results-panel {
        position: sticky;
        top: 16px;
        align-self: flex-start;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
      }
    }
    ```

- [x] Task 7 — Tests Vitest (AC2, AC3, AC4, AC5, AC6)
  - [x] **`PollService`** (`poll.service.spec.ts`) — 2 tests : ✅ 2/2
  - [x] **`CreneauCard`** (`creneau-card.spec.ts`) — 3 tests : ✅ 3/3
  - [x] **`AvailableSlotsPanel`** (`available-slots.spec.ts`) — 3 tests : ✅ 3/3
  - [x] Lancer `docker compose exec web pnpm test` → 54/54 verts, 0 régression

## Dev Notes

### Ce qui existe déjà — NE PAS réinventer

**`CalendarView` (`apps/web/src/app/features/calendar/calendar-view/`)**

- Déjà un composant standalone avec `mode = input<'personal' | 'mj'>('personal')` (déclaré mais non utilisé)
- Déjà injecte `AvailabilityService`, gère déclarations personnelles, constraint panel
- NE PAS modifier la logique de déclarations personnelle (AC non-regression)
- En mode MJ, les deux fonctionnalités coexistent : calendrier perso à gauche + résultats groupe à droite

**`ThemeToneService` + `tones.ts` (`apps/web/src/app/core/theme/`)**

- `tone = computed(() => TONE_MAP[activeTheme()])` — retourne un `Record<string, string>`
- Clés déjà présentes et utilisables :
  - `section.slots` — "Fenêtres de la destinée" / "Clairières disponibles" / "Créneaux validés par l'automate"
  - `status.unknown_label` — "Mystère" / "Perdu dans les branches" / "Signal inconnu"
  - `empty.no_slots` — existe dans les 3 thèmes
  - `cta.find_date` — existe (pour story 2-3)
- **À modifier en Task 3** : `alert.missing_player` — actuellement message générique sans `{name}`. Doit devenir per-membre avec `{name}` placeholder, sur le modèle de `partie.notice_invited` (pattern `.replace('{name}', pseudo)`)

**Frontend `PartiesService` (`apps/web/src/app/core/parties/parties.service.ts`)**

- NE PAS y ajouter `getAvailableSlots`. La spec (AC6) place cette méthode dans `PollService` (stub pour Epic 3)
- `PartiesService` utilise `const API = 'http://localhost:3000'` (hardcodé) — utiliser `API_BASE` pour le nouveau `PollService`

**`api-base.ts` (`apps/web/src/app/core/api-base.ts`)**

- Exporté sous `API_BASE` — importé par `AvailabilityService` via `'../api-base'`
- `PollService` à `apps/web/src/app/core/poll/poll.service.ts` : même relative path `'../api-base'`

**Route existante `app.routes.ts`**

- `/profile/calendar` → `CalendarView` sans `:id` (mode personal)
- La route MJ `/parties/:id/calendar` → `CalendarView` avec `:id` dans les params
- `ActivatedRoute.snapshot.paramMap.get('id')` retournera `null` en mode perso, non-null en mode MJ
- Pas besoin de `data: { mode: 'mj' }` — le composant auto-détecte via `paramMap.get('id')`

**Types partagés (`@master-jdr/shared`)**

- `AvailableSlotDto` : `{ date: string, slot: DaySlot, members: { userId: string, pseudo: string, status: SlotStatus }[] }` — déjà exporté
- `AggregatedSlotDto` : déjà exporté (pour story 2-4, non utilisé dans cette story)
- `SlotStatus` : `'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN'`
- `DaySlot` : `'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY'` (l'API ne retourne jamais `FULL_DAY` pour des créneaux calculés)

### Décisions techniques

**Character class emoji** : `AvailableSlotDto.members[]` ne contient que `{ userId, pseudo, status }` — aucune information de classe de personnage. Utiliser "⚔" ou "🎲" comme emoji générique dans les badges. Ne PAS tenter de mapper les classes — ce n'est pas dans le DTO ni dans le scope de cette story.

**Mode detection** : utiliser `ActivatedRoute.snapshot.paramMap.get('id')` dans `ngOnInit`. Si non-null → mode MJ. L'input `mode = input<'personal' | 'mj'>('personal')` reste pour les tests (peut être ignoré en prod).

**`PollService` vs `PartiesService`** : la spec place `getAvailableSlots` dans `PollService` (stub pour Epic 3). Ne pas modifier `PartiesService` (frontend). Ce choix est cohérent car l'Epic 3 étend ce service avec les votes.

**`scrollToSlots` sur mobile** : utiliser `@ViewChild('slotsPanel') slotsPanel!: ElementRef` + `this.slotsPanel.nativeElement.scrollIntoView({ behavior: 'smooth' })`. Pas de routage séparé.

### Format date dans `CreneauCard`

```typescript
// Dans CreneauCard TS :
readonly datePipe = inject(DatePipe); // ou construire via new Date(slot.date + 'T00:00:00Z')

// date string ex : "2026-07-04"
// Utiliser DatePipe avec timezone UTC pour éviter décalage fuseau :
// datePipe.transform(new Date(slot.date + 'T00:00:00Z'), 'EEEE d MMMM', 'UTC', 'fr')
// → "samedi 4 juillet"
```

**Alternative si `DatePipe` n'est pas disponible facilement en standalone** : utiliser `Intl.DateTimeFormat` :
```typescript
const d = new Date(slot.date + 'T00:00:00Z');
new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
// → "samedi 4 juillet"
```

### Label des slots

```typescript
const SLOT_LABELS: Record<string, string> = {
  MORNING:   'Matin',
  AFTERNOON: 'Après-midi',
  EVENING:   'Soirée',
};
```

Définir cette constante dans `creneau-card.ts` ou en dehors du composant.

### Icônes de statut

```
AVAILABLE   → '✅'
UNKNOWN     → '⚠️'
UNAVAILABLE → '❌' (ne devrait jamais apparaître — l'API filtre, mais defensive)
```

### Structure des nouveaux fichiers

```
apps/web/src/app/features/calendar/
  available-slots/
    available-slots.ts        NEW  (AvailableSlotsPanel component)
    available-slots.html      NEW
    available-slots.scss      NEW
    available-slots.spec.ts   NEW
  creneau-card/
    creneau-card.ts           NEW  (CreneauCard component)
    creneau-card.html         NEW
    creneau-card.scss         NEW
    creneau-card.spec.ts      NEW
  calendar-view/
    calendar-view.ts          UPDATE
    calendar-view.html        UPDATE
    calendar-view.scss        UPDATE

apps/web/src/app/core/poll/
  poll.service.ts             NEW
  poll.service.spec.ts        NEW

apps/web/src/app/app.routes.ts          UPDATE
apps/web/src/app/core/theme/tones.ts   UPDATE
```

### Tests Vitest — patterns à suivre

Le runner de test frontend est Vitest avec Angular TestBed. Les composants standalone se testent via `TestBed.configureTestingModule({ imports: [ComponentClass] })`. Pour les services HTTP, utiliser `provideHttpClientTesting()` et `HttpTestingController`.

Voir `apps/web/src/app/core/availability/compute-display-status.spec.ts` pour le format Vitest de ce projet (describe/it, expect).

### Dépendances entre tâches

1 → aucune ; 2 → aucune ; 3 → aucune ; 4 → nécessite 3 (tone keys) ; 5 → nécessite 2 (PollService) et 4 (CreneauCard) ; 6 → nécessite 2, 5 ; 7 → nécessite 2, 4, 5

### Architecture (rappel AD-7)

| Route | Composant | Layout |
|-------|-----------|--------|
| `/profile/calendar` | `CalendarView` (personal) | pleine largeur |
| `/parties/:id/calendar` | `CalendarView` (MJ) | split 60/40 desktop |

Le composant `AvailableSlotsPanel` correspond à `available-slots/available-slots.ts` dans l'architecture.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_aucun_

### Completion Notes List

- Route `/parties/:id/calendar` ajoutée dans `app.routes.ts`, réutilise `CalendarView` existant.
- `PollService` créé comme stub injectable `providedIn: 'root'`, expose `getAvailableSlots` avec et sans `weeks`.
- `tones.ts` : `alert.missing_player` mis à jour pour les 3 thèmes avec placeholder `{name}` (pattern identique à `partie.notice_invited`).
- `CreneauCard` : standalone, date formatée via `Intl.DateTimeFormat` UTC (évite décalage fuseau), emoji ⚔ générique (pas de classe de personnage dans le DTO).
- `AvailableSlotsPanel` : standalone, importe `CreneauCard`, affiche skeleton, état vide, ou liste.
- `CalendarView` : auto-détecte le mode MJ via `paramMap.get('id')` (signal `isMjMode`), appelle `loadDeclarations` + `loadAvailableSlots` en parallèle en mode MJ. Le mode personnel `/profile/calendar` ne touche pas `PollService`.
- Split layout CSS : flex row desktop (≥768px) avec panel sticky, stacked mobile avec bouton "Voir les créneaux calculés" (scrollIntoView).
- 54/54 tests Vitest verts, 0 régression.

### File List

- `apps/web/src/app/app.routes.ts` — UPDATE
- `apps/web/src/app/core/theme/tones.ts` — UPDATE
- `apps/web/src/app/core/poll/poll.service.ts` — NEW
- `apps/web/src/app/core/poll/poll.service.spec.ts` — NEW
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.ts` — NEW
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.html` — NEW
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.scss` — NEW
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.spec.ts` — NEW
- `apps/web/src/app/features/calendar/available-slots/available-slots.ts` — NEW
- `apps/web/src/app/features/calendar/available-slots/available-slots.html` — NEW
- `apps/web/src/app/features/calendar/available-slots/available-slots.scss` — NEW
- `apps/web/src/app/features/calendar/available-slots/available-slots.spec.ts` — NEW
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — UPDATE
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — UPDATE
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` — UPDATE

### Change Log

- 2026-06-28 : Story 2-2 implémentée — route `/parties/:id/calendar`, `PollService` stub, `CreneauCard`, `AvailableSlotsPanel`, split layout MJ 60/40 desktop. 8 tests Vitest nouveaux (54 total).

### Review Findings

- [x] [Review][Decision] Joueurs exposés au layout MJ — **Décision : comportement intentionnel.** Les joueurs voient le layout split avec les données agrégées (sans identités individuelles). Utile pour les inciter à se libérer si tout le monde est dispo. Backend déjà correct (retourne `AggregatedSlotDto` pour les non-MJ).
- [x] [Review][Patch] Aucune limite de plage sur `/heatmap` — Correction double : (1) frontend charge uniquement la grille du mois affiché (~42 jours, rechargé à chaque navigation) ; (2) backend refuse les plages > 45 jours (`BadRequestException`). [`apps/api/src/parties/parties.service.ts`, `calendar-view.ts`]
- [x] [Review][Patch] `from > to` retourne silencieusement un tableau vide — le DTO valide le format ISO mais pas `from <= to`. Correction : `BadRequestException` dans `getHeatmap` si `fromMs > toMs`. [`apps/api/src/parties/parties.service.ts`]
- [x] [Review][Patch] `@IsDateString()` accepte les datetimes ISO complets — si `from` vaut `2026-01-01T12:00:00Z`, le code `new Date(from + 'T00:00:00Z')` produit `NaN` et la boucle est silencieusement ignorée. Correction : `@Matches(/^\d{4}-\d{2}-\d{2}$/)` ajouté sur `from` et `to`. [`apps/api/src/parties/dto/get-heatmap.dto.ts`]
- [x] [Review][Defer] MJ supprimé exclu silencieusement — si `partie.mjId` pointe vers un user supprimé, `resolveParticipants` écarte le MJ sans erreur. Problème d'intégrité référentielle pré-existant (cascade FK manquante). [`apps/api/src/parties/parties.service.ts:118`] — deferred, pre-existing
- [x] [Review][Defer] Input `mode` inutilisé — `readonly mode = input<'personal' | 'mj'>('personal')` déclaré mais jamais lu. Intentionnel selon les dev notes ; sera branché en story 2-6. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:21`] — deferred, pre-existing
- [x] [Review][Defer] `/heatmap` accessible aux joueurs — l'endpoint retourne des données agrégées (anonymes) pour tout membre, pas seulement le MJ. Non-bloquant car pas de fuite de PII, mais à documenter ou restreindre selon la décision sur D1. [`apps/api/src/parties/parties.controller.ts:58`] — deferred, pre-existing
