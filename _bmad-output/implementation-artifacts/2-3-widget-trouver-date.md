---
baseline_commit: "89d37d5ef8736ea7b0d46e02870b330cc42713cf"
---

# Story 2.3: Widget "Trouver une date" sur la page de partie

Status: done

## Story

As a GM or party member,
I want to see the next confirmed session date and a "Find a date" button directly on the party detail page,
so that I can access the scheduling tools and know when the next session is without navigating through menus.

## Acceptance Criteria

**AC1 — Affichage de la prochaine séance**

Given any user (MJ ou joueur) is on `/parties/:id`
When the page renders
Then a scheduling widget is visible in the party detail card showing:
- "Prochaine séance : [date formatted as "Samedi 12 juillet — Soirée"]" if `nextSessionDate` is set on the party
- The empty state `ThemeToneService.tone()['partie.no_session']` if no confirmed date exists

**AC2 — Bouton "Trouver une date" (MJ uniquement)**

Given the currently authenticated user is the MJ of the party
When they view the scheduling widget
Then a button displaying `ThemeToneService.tone()['cta.find_date']` is visible
And clicking it navigates to `/parties/:id/calendar`

Given the currently authenticated user is NOT the MJ (joueur)
When they view the scheduling widget
Then the "Trouver une date" / "Voir le calendrier" button is NOT shown in the widget
(Note: the player "Calendrier de la guilde" button is implemented in Story 2.4)

**AC3 — Champs Prisma sur Partie**

Given the developer runs `prisma migrate dev --name add_next_session_to_partie`
When the migration completes
Then the `Partie` model has two new nullable fields:
- `nextSessionDate DateTime?`
- `nextSessionSlot DaySlot?`

**AC4 — PartieDto mis à jour**

Given `@master-jdr/shared` is inspected
When a developer reads `PartieDto`
Then it contains `nextSessionDate: string | null` and `nextSessionSlot: DaySlot | null`

**AC5 — Clés de microcopy thématisées**

Given `tones.ts` is inspected
When a developer reads the TONE_MAP
Then all 3 themes contain the key `partie.no_session` with a thematically appropriate empty state message
And all 3 themes contain the key `partie.scheduling_title` with a thematically appropriate section title

**AC6 — Format de la date (Intl.DateTimeFormat UTC)**

Given `nextSessionDate` is `"2026-08-15T00:00:00.000Z"` and `nextSessionSlot` is `"EVENING"`
When the formatted string is computed
Then it reads "samedi 15 août — Soirée" (lowercase weekday, FR locale, UTC timezone)

## Tasks / Subtasks

- [x] Task 1 — Migration Prisma (AC3)
  - [x] Ajouter dans `apps/api/prisma/schema.prisma`, modèle `Partie` : `nextSessionDate DateTime?` et `nextSessionSlot DaySlot?` (enum DaySlot déjà défini)
  - [x] Exécuter `docker compose exec api pnpm prisma migrate dev --name add_next_session_to_partie`
  - [x] Exécuter `docker compose exec api pnpm prisma generate`

- [x] Task 2 — Mettre à jour `PartieDto` dans `@master-jdr/shared` (AC4)
  - [x] Dans `packages/shared/src/index.ts`, ajouter à `PartieDto` : `nextSessionDate: string | null;` et `nextSessionSlot: DaySlot | null;`

- [x] Task 3 — Clés de microcopy dans `tones.ts` (AC5)
  - [x] Dans `apps/web/src/app/core/theme/tones.ts`, ajouter dans les 3 thèmes sous `/* — partie-detail — */` :
    - `'partie.scheduling_title'` : titre thématisé de la section
    - `'partie.no_session'` : message vide thématisé

- [x] Task 4 — Backend : vérifier que `getViewable` retourne bien les nouveaux champs (AC3, AC4)
  - [x] `getViewable` fait `prisma.partie.findUnique({ where: { id } })` — les champs sont inclus automatiquement post-génération. Aucune modification de code serveur nécessaire.
  - [x] `parties.controller.ts` retourne la partie complète — confirmé.

- [x] Task 5 — Frontend : widget dans `PartieDetail` (AC1, AC2, AC6)
  - [x] `partie-detail.ts` : `nextSessionLabel` computed signal ajouté (formatage Intl.DateTimeFormat UTC fr-FR + SLOT_LABELS)
  - [x] `partie-detail.html` : section `.scheduling-widget` ajoutée avant `<section class="members">`
  - [x] `partie-detail.scss` : styles `.scheduling-widget` ajoutés

- [x] Task 6 — Tests Vitest (AC1, AC2, AC6)
  - [x] `partie-detail.spec.ts` créé avec 3 tests (état vide, date+slot formatés, bouton MJ-only)
  - [x] `docker compose exec web pnpm test` → 57 tests, 0 régression

## Dev Notes

### Ce qui existe déjà — NE PAS réinventer

**`PartieDetail` (`apps/web/src/app/features/parties/partie-detail/`)**

- Composant standalone, déjà dans `app.routes.ts` sur `parties/:id`
- Injecte déjà : `ActivatedRoute`, `Router`, `AuthService`, `PartiesService`, `ModeService`, `MatDialog`, `ThemeToneService`
- `isMj = computed(() => this.partie()?.mjId === this.auth.currentUser()?.id)` — déjà disponible, à réutiliser pour le bouton AC2
- Importe déjà `RouterLink` — vérifier dans le tableau `imports:` du décorateur avant d'ajouter
- Template utilise `@if (partie(); as p)` comme variable de template — accessible dans la section à ajouter

**`ThemeToneService` / `tones.ts`**

- `cta.find_date` est déjà présent dans les 3 thèmes — **NE PAS modifier, utiliser directement**
- `partie.no_session` et `partie.scheduling_title` sont manquants — à ajouter en Task 3
- Pattern : ajouter sous `/* — partie-detail — */` dans chaque thème, en respectant l'indentation et les guillemets

**Prisma schema**

- `DaySlot` enum est déjà défini (lignes 107-113 du schema)
- `Partie` model n'a pas encore de `nextSessionDate` ni `nextSessionSlot` — à ajouter en Task 1
- Après `pnpm prisma generate`, le client Prisma incluera ces champs automatiquement

**`PartieDto` dans `@master-jdr/shared`**

- Actuellement : pas de champs `nextSessionDate`/`nextSessionSlot`
- Ajouter APRÈS `createdAt` pour cohérence avec l'ordre du modèle Prisma
- `DaySlot` type est déjà exporté depuis le même fichier — utiliser `DaySlot | null`

### Signal `nextSessionLabel` — implémentation précise

```typescript
protected readonly nextSessionLabel = computed(() => {
  const p = this.partie();
  if (!p?.nextSessionDate) return null;
  const d = new Date(p.nextSessionDate);
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  const SLOT_LABELS: Record<string, string> = {
    MORNING:   'Matin',
    AFTERNOON: 'Après-midi',
    EVENING:   'Soirée',
    FULL_DAY:  'Journée',
  };
  const slot = p.nextSessionSlot ? ` — ${SLOT_LABELS[p.nextSessionSlot] ?? p.nextSessionSlot}` : '';
  return `${date}${slot}`;
});
```

Pattern identique à `formatDate()` dans `creneau-card.ts` et `aggregated-creneau-card.ts` (déjà utilisé dans ce projet).

### Microcopy à ajouter — suggestions thématisées

| Clé | Grimoire Émeraude | Forêt Ancienne | Médiéval Steampunk |
|---|---|---|---|
| `partie.scheduling_title` | `'Prochaine séance'` | `'Prochaine clairière'` | `'Prochaine mission'` |
| `partie.no_session'` | `'Aucune séance convoquée. Consultez l\'oracle des créneaux.'` | `'Aucune clairière réservée. L\'écureuil cherche encore.'` | `'Aucune mission planifiée. Interrogez l\'automate.'` |

### Ordre d'implémentation suggéré (dépendances entre tâches)

1 → 2 → 3 → 4 → 5 → 6

- Task 1 (migration) doit précéder Task 4 (vérification backend)
- Task 2 (shared types) doit précéder Task 5 (frontend TS — PartieDto.nextSessionDate)
- Task 3 (tones) doit précéder Task 5 (frontend template — tone keys)

### Structure de fichiers modifiés

```
apps/api/prisma/schema.prisma                     UPDATE — Partie model (+2 fields)
packages/shared/src/index.ts                      UPDATE — PartieDto (+2 fields)
apps/web/src/app/core/theme/tones.ts              UPDATE — 3 themes (+2 keys each)
apps/web/src/app/features/parties/partie-detail/
  partie-detail.ts                                UPDATE — nextSessionLabel computed
  partie-detail.html                              UPDATE — scheduling widget section
  partie-detail.scss                              UPDATE — .scheduling-widget styles
  partie-detail.spec.ts                           NEW — 3 Vitest tests
```

**Aucun nouveau composant.** Tout est intégré dans `PartieDetail` existant.

### Aucune modification backend (controllers/services)

`PartiesService.getViewable()` retourne déjà `prisma.partie.findUnique({ where: { id } })` — après régénération du client Prisma, les champs `nextSessionDate` et `nextSessionSlot` (nullables) seront inclus dans la réponse automatiquement. Pas besoin de modifier le service ou le controller.

### Tests Vitest — pattern à suivre

```typescript
// partie-detail.spec.ts
import { TestBed } from '@angular/core/testing';
import { PartieDetail } from './partie-detail';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

// Mock ActivatedRoute snapshot
const mockRoute = { snapshot: { paramMap: { get: () => 'test-id' } } };

describe('PartieDetail — scheduling widget', () => {
  // ... configureTestingModule avec providers
});
```

Voir `apps/web/src/app/features/calendar/available-slots/available-slots.spec.ts` pour le pattern Vitest Angular en usage dans ce projet.

### Context git récent

- Commit `f8fe71e` — backend add date aggregation for a party (heatmap endpoint)
- Commit `70c6883` — fix some stuff on calendar (bugfixes story 2-2)
- Story 2-2 est `done` — le split layout `/parties/:id/calendar` fonctionne pour MJ et joueurs

### Story 2.4 — ne PAS implémenter ici

Story 2.4 ajoutera un bouton "Calendrier de la guilde" visible par les JOUEURS sur `/parties/:id`. Ce bouton est intentionnellement absent de la story 2.3 pour maintenir un scope propre. Résister à la tentation de l'ajouter ici.

## Review Findings

- [x] [Review][Patch] SLOT_LABELS: move to module scope and type as `Record<DaySlot, string>` [`partie-detail.ts:68`] — objet recréé à chaque signal recomputation + perte de type-safety exhaustiveness
- [x] [Review][Patch] Guard `new Date(nextSessionDate)` — pas de protection contre une date malformée ; `Intl.DateTimeFormat.format()` lève une `RangeError` si `new Date(str)` vaut `Invalid Date` [`partie-detail.ts:62`]
- [x] [Review][Defer] AC6 weekday pas explicitement lowercasé [`partie-detail.ts:65`] — deferred, `fr-FR` retourne du lowercase en V8 par spec, risque quasi nul
- [x] [Review][Defer] Backend : Prisma `DateTime` → objet `Date` → string implicite via `JSON.stringify` [`parties.service.ts:62`] — deferred, pre-existing pattern sur toutes les entités
- [x] [Review][Defer] Race condition `isMj()` / `loadLinks()` si `currentUser()` résout après `partie.set()` [`partie-detail.ts:59`] — deferred, pre-existing, présent avant cette story
- [x] [Review][Defer] `FULL_DAY` dans `SLOT_LABELS` mais `getAvailableSlots` n'inclut jamais `FULL_DAY` — deferred, Epic 3 décidera si `chosenSlot=FULL_DAY` est valide
- [x] [Review][Defer] Pas d'`aria-label` contextualisé sur les boutons CTA du widget [`partie-detail.html:22`] — deferred, amélioration a11y basse priorité
- [x] [Review][Defer] Write-side timezone guard (Epic 3) : si `nextSessionDate` est construit comme `new Date('2026-08-15')` côté navigateur, il sera midi UTC− — deferred, hors scope story 2-3

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-06-29)

### Debug Log References

- `fakeAsync` non disponible dans ce Vitest setup → remplacé par `async/await + fixture.whenStable()`
- `parties.service.spec.ts` construisait un `PartieDto` incomplet → corrigé en ajoutant `nextSessionDate: null, nextSessionSlot: null`

### Completion Notes List

- Migration `20260628231853_add_next_session_to_partie` créée et appliquée
- `PartieDto` étendu dans `@master-jdr/shared` — champs nullables, aucune breaking change sur les objets existants (backend retourne null par défaut)
- 6 clés de microcopy ajoutées (2 × 3 thèmes)
- `nextSessionLabel` computed signal : formatage UTC fr-FR + SLOT_LABELS inline
- Widget `.scheduling-widget` placé avant la section membres dans la card
- 3 tests unitaires : état vide, date+slot, bouton MJ-only
- 57 tests passent, 0 régression

### File List

- `apps/api/prisma/schema.prisma` — UPDATE (+2 champs sur Partie)
- `apps/api/prisma/migrations/20260628231853_add_next_session_to_partie/migration.sql` — NEW
- `packages/shared/src/index.ts` — UPDATE (PartieDto +nextSessionDate +nextSessionSlot)
- `apps/web/src/app/core/theme/tones.ts` — UPDATE (+partie.scheduling_title, +partie.no_session × 3 thèmes)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` — UPDATE (nextSessionLabel computed)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` — UPDATE (section scheduling-widget)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss` — UPDATE (.scheduling-widget styles)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` — NEW (3 tests)
- `apps/web/src/app/core/parties/parties.service.spec.ts` — UPDATE (PartieDto fixture complétée)

### Change Log

- 2026-06-29 : Implémentation complète de la story 2-3 — migration Prisma, types partagés, microcopy thématisée, widget frontend, tests Vitest
