---
baseline_commit: 8a1950259d9e59c3290d6794f6aced8a7bed3de2
---

# Story 36.16: « C'est passé » en calendrier personnel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ consultant son calendrier personnel,
I want voir mes séances passées dont le compte-rendu manque,
so that je retrouve en un endroit unique ce qui reste à documenter, sans dépendre du contexte d'une partie précise.

---

**Story ajoutée le 2026-08-24** (epics.md, Epic 36), Question n°1 posée par la 36.11, tranchée avec l'utilisateur le même jour (`deferred-work.md`) : **story serveur dédiée** plutôt que section vide assumée.

**🚨 PÉRIMÈTRE CORRIGÉ pendant la création de cette story — à lire avant de coder.** L'analyse de la 36.11 (et la décision de l'utilisateur qui s'appuyait dessus) présumait « deux changements serveur ». En lisant `AvailabilityService.getMyCalendar()`, **un seul des deux en est vraiment un** :

1. ✅ **Vrai gap serveur** : `MyCalendarSeanceEntry` ne porte pas `compteRendu`/`compteRenduManquant`. **C'est l'objet de cette story.**
2. ❌ **PAS un gap serveur** : `getMyCalendar(userId, from, to)` (ligne 829) filtre déjà sur les bornes `from`/`to` que **l'appelant envoie** — rien, côté serveur, ne force `from` à valoir « aujourd'hui ». C'est `CalendarView.fromDateStr` (front, `apps/web/.../calendar-view.ts:1237`, `signal(CalendarView.todayIso())`) qui ne demande jamais de plage passée en contexte personnel. **Ce morceau est un changement FRONT**, et il est **volontairement exclu du périmètre de cette story** (cf. Encadré n°2 — le signal est partagé avec le formulaire de recherche MJ, dette déjà ouverte et non tranchée dans `deferred-work.md`).

**Conséquence assumée : livrée seule, cette story ne rendra PAS la section « C'est passé » visible en pratique** — le champ existera et sera correct dès qu'une plage passée sera demandée, mais rien ne la demande encore. Ce n'est pas un défaut d'implémentation, c'est une limite de périmètre à documenter dans Completion Notes, pas à contourner en douce dans cette story.

---

## Acceptance Criteria

Les quatre AC d'`epics.md`, verbatim :

**AC1 — le champ est renseigné à `true` quand le compte-rendu manque**
**Given** une séance passée dont `compteRendu` n'est pas renseigné
**When** `MyCalendarSeanceEntry` est construit pour cette séance
**Then** elle porte `compteRenduManquant: true`

**AC2 — le champ est renseigné à `false` quand le compte-rendu existe**
**Given** une séance passée dont `compteRendu` est renseigné
**When** `MyCalendarSeanceEntry` est construit
**Then** elle porte `compteRenduManquant: false`

**AC3 — aucun changement serveur supplémentaire n'est nécessaire pour la plage**
**Given** une plage `[from, to]` incluant des dates passées, envoyée explicitement par l'appelant
**When** `GET /me/calendar` est appelé avec cette plage
**Then** les séances passées qualifiantes sont retournées avec leur `compteRenduManquant`, sans qu'aucun changement serveur supplémentaire ne soit requis (le filtrage par plage est déjà piloté par l'appelant)

**AC4 — aucune régression de scope d'accès**
**Given** une séance d'une partie où l'utilisateur n'est **ni** MJ **ni** membre
**When** `GET /me/calendar` est appelé par cet utilisateur
**Then** cette séance n'apparaît jamais

## Tasks / Subtasks

- [x] **Task 0 — Vérifier le baseline** (dev-story) : `git rev-parse HEAD`, consigner `baseline_commit` en frontmatter, arbre propre.

- [x] **Task 1 — Type partagé** (AC1, AC2)
  - [x] `packages/shared/src/index.ts`, `MyCalendarSeanceEntry` : ajouté `compteRenduManquant: boolean` (non optionnel, cf. Encadré n°1).

- [x] **Task 2 — Serveur : peupler le champ** (AC1, AC2, AC4)
  - [x] `apps/api/src/availability/availability.service.ts`, `buildMySeancesLayer()` : ajouté `compteRendu?: string | null` à la signature inline du paramètre `seances`, puis `compteRenduManquant: !s.compteRendu?.trim()` dans l'objet poussé — même formule que le front (`CalendarView.allCalendarEntries()` ligne 535).
  - [x] Aucune autre méthode touchée : `getMyCalendar()` inchangée.

- [x] **Task 3 — Tests serveur** (toutes les AC)
  - [x] 4 nouveaux tests dans `availability.service.spec.ts` : `compteRendu` null → `true`, espaces seuls → `true`, renseigné → `false`, plage explicitement passée → séance qualifiante retournée avec `compteRenduManquant` correct (AC3).
  - [x] Test existant `toEqual` strict (ligne ~1853) corrigé : ajout de `compteRenduManquant: true` à l'objet attendu — c'était le seul site cassé par le nouveau champ requis.

- [x] **Task 4 — Ne PAS toucher au front dans cette story** (cf. Encadré n°2)
  - [x] `CalendarView.fromDateStr`/`loadMeCalendarForRange()` non modifiés. Vérifié : le front (`allCalendarEntries()`, branche `else` contexte personnel) ne lit pas encore `compteRenduManquant` sur `MyCalendarSeanceEntry` — c'est attendu, hors périmètre.
  - [x] Documenté dans Completion Notes et `deferred-work.md`.

### Review Findings

Revue du 2026-08-24 (3 couches parallèles, combinée avec la 36.15 — même diff non commité). 1 defer propre à cette story, le reste des constats bruts appartenant soit à la 36.15 soit rejeté comme bruit (voir le détail complet dans `36-15-sceller-depuis-la-barre-de-selection-de-la-grille.md`). Aucun patch, aucune décision — les deux AC serveur (`compteRenduManquant`) sont confirmées conformes par l'Acceptance Auditor : « No hard violations of any AC found ».

- [x] [Review][Defer] AC4 (non-régression du scope d'accès) n'a aucun test dédié re-vérifiant qu'une séance d'un utilisateur ni MJ ni membre n'apparaît toujours pas — deferred, comportement vérifié inchangé (le filtrage `partieIds`, lignes 848-868, n'est pas touché par ce diff), seule la couverture de test explicite manque. [apps/api/src/availability/availability.service.spec.ts]

## Dev Notes

### Encadré n°1 — Pourquoi `compteRenduManquant` n'est PAS optionnel ici, contrairement à `AgendaEntry`

`AgendaEntry.compteRenduManquant` (`calendar-agenda-view.ts:108`) est `?: boolean` avec une sémantique à trois valeurs délibérée : `undefined` = « on ne sait pas » (contexte de partie où l'info n'a pas encore été chargée par ce chemin), distinct de `false` = « le compte-rendu existe ». **Cette distinction n'a pas lieu d'être ici** : `MyCalendarSeanceEntry` est construit côté serveur à partir d'un `Seance` complet, toujours chargé — il n'existe aucun état « on ne sait pas » possible. Ajouter `compteRenduManquant: boolean` (non optionnel) au DTO partagé est donc correct et ne doit pas copier l'optionalité de l'autre type par réflexe de cohérence apparente — les deux types répondent à des contraintes différentes malgré le nom de champ identique.

### Encadré n°2 — La plage de dates : pourquoi ce n'est PAS un gap serveur, et pourquoi le front est hors périmètre

`AvailabilityService.getMyCalendar(userId, from, to)` accepte déjà n'importe quelle plage passée par l'appelant (bornée à 366 jours, `ME_CALENDAR_MAX_RANGE_DAYS`, ligne 821) et filtre correctement dedans (`buildMySeancesLayer`, ligne 1039 : `date.getTime() < fromMs || date.getTime() > toMs`). **Rien côté serveur ne force `from` à être « aujourd'hui »** — ce n'était donc jamais un gap serveur, contrairement à ce que l'analyse de la 36.11 supposait.

Le vrai verrou est `CalendarView.fromDateStr` (`calendar-view.ts:1237`), initialisé une seule fois à `CalendarView.todayIso()` et **partagé** entre deux usages bien distincts :
- le formulaire de recherche MJ (`date-range-form`/`onSearch()`, contexte de partie, l'utilisateur choisit une plage à l'écran) ;
- `loadMeCalendarForRange()` (contexte personnel, aucune UI ne montre/n'édite cette plage — elle est purement interne).

Élargir le défaut de `fromDateStr` **seulement en contexte personnel** semble à première vue sûr (le formulaire MJ n'est visible qu'en contexte de partie), mais la 36.14 a rendu `CalendarView` **persistant à travers un changement de route** (`:id` change sans destruction du composant) — un enchaînement `/profile/calendar` → `/parties/:id/calendar` dans la même session laisserait fuiter une plage passée dans le formulaire MJ, qui ne réinitialise `fromDateStr` nulle part explicitement (vérifié : aucun `fromDateStr.set(...)` inconditionnel au changement de mode). C'est très exactement l'écart déjà documenté et **non tranché** par `deferred-work.md` (section « code review of 30-6 », item « Réutilisation des signaux `fromDateStr`/`toDateStr` ... »).

**Décision pour cette story : ne pas y toucher.** Résoudre cette fragilité (séparer le signal, ou réinitialiser explicitement au changement de contexte) est une décision d'architecture à part entière, que cette story ne doit pas trancher en chemin (P-5, `prd.md:57`). Si l'utilisateur veut que « C'est passé » affiche réellement quelque chose à court terme, une **story de suivi distincte** — scope FRONT, qui statue sur `deferred-work.md:98` — est nécessaire après celle-ci.

### Project Structure Notes

- Fichiers à modifier : `packages/shared/src/index.ts` (type), `apps/api/src/availability/availability.service.ts` (population), `apps/api/src/availability/availability.service.spec.ts` (tests). **Aucun fichier front.**
- Aucune migration Prisma : `compteRendu` existe déjà sur le modèle `Seance` (`schema.prisma:535`, `String?`), déjà consommé par `scenarios.service.ts` pour le DTO de partie — cette story ne fait que le faire transiter par un second chemin (`getMyCalendar`), pattern déjà établi pour `heureRdv`/`lieu`/`notePratique` (36.5, note ligne 653-656 de `MyCalendarSeanceEntry`).
- Cohérent avec `AD-9`/`AD-2` (anonymat du calendrier personnel) : `compteRenduManquant` est un booléen dérivé, ne transporte aucune identité — aucun conflit avec ces principes.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`, Epic 36, Story 36.16 — AC et contexte corrigé le 2026-08-24]
- [Source: `deferred-work.md`, section « Décisions actées avec l'utilisateur (2026-08-24) », item 2 ; et section « code review of 30-6 » pour la dette `fromDateStr`/`toDateStr` non tranchée]
- [Source: `apps/api/src/availability/availability.service.ts:829-938` — `getMyCalendar()`]
- [Source: `apps/api/src/availability/availability.service.ts:1014-1067` — `buildMySeancesLayer()`]
- [Source: `apps/api/src/availability/availability.service.ts:821` — `ME_CALENDAR_MAX_RANGE_DAYS = 366`]
- [Source: `apps/api/prisma/schema.prisma:535` — `Seance.compteRendu String?`]
- [Source: `packages/shared/src/index.ts:645-660` — `MyCalendarSeanceEntry`]
- [Source: `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:535, 1237` — `compteRenduManquant` côté partie (patron de formule), `fromDateStr` (verrou front hors périmètre)]
- [Source: `apps/api/src/availability/availability.service.spec.ts:1761-2041` — patron de tests existants pour `getMyCalendar`]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story, 2026-08-24)

### Debug Log References

- `pnpm test -- availability.service` (API) : 104/104 verts, dont les 4 nouveaux tests et le test `toEqual` corrigé.
- `pnpm test` (API, suite complète) : 60 suites / 1321 tests verts, aucune régression.
- `pnpm typecheck` (API, `tsc --noEmit -p tsconfig.build.json`) : propre, exit 0.
- `pnpm lint` (API) : 1937 problèmes, tous pré-existants — vérifié qu'aucun n'est situé sur les lignes touchées (`availability.service.ts:1014-1070`, nouveaux tests de `availability.service.spec.ts`). Baseline API connue pour un volume élevé de `no-unsafe-*`/`require-await` sur le harnais de test (`any` de Prisma mocké), documenté ailleurs dans le projet comme assumé.
- `pnpm test` (web, suite complète) : 115 fichiers / 2231 tests verts, aucune régression — confirme que le nouveau champ requis `compteRenduManquant` sur `MyCalendarSeanceEntry` ne casse aucun test front (Vitest ne type-check pas les fixtures de mock à l'exécution ; les sites `mes-seances` incomplets déjà présents dans `calendar-view.spec.ts` continuent de fonctionner tels quels, comme avant cette story pour `heureRdv`/`lieu`/`notePratique`).

### Completion Notes List

- **Périmètre resserré au strict nécessaire serveur** (cf. Encadré n°2 du fichier de story) : seul `compteRenduManquant` manquait réellement côté serveur. La « plage qui part d'aujourd'hui » n'est pas un gap serveur — `getMyCalendar()` filtre déjà sur les bornes envoyées par l'appelant sans aucune borne figée sur « aujourd'hui ».
- **Le front n'a PAS été touché**, décision volontaire : élargir `CalendarView.fromDateStr` (signal partagé avec le formulaire de recherche MJ) sans trancher formellement la dette `deferred-work.md` (section 30-6) aurait décidé une question d'architecture en chemin (P-5).
- ⚠️ **Conséquence assumée, à répéter clairement à l'utilisateur** : cette story, livrée seule, **ne rend PAS visible** la section « C'est passé » du calendrier personnel — le champ `compteRenduManquant` est désormais correct et servi, mais rien côté front ne demande encore de plage passée pour `/profile/calendar`. Une story de suivi FRONT distincte est nécessaire pour un résultat visible à l'écran (elle devra statuer sur la dette du signal partagé `fromDateStr`/`toDateStr`).
- Seul test cassé par le nouveau champ requis : un `toEqual` strict sur `result['mes-seances']` (une chaîne d'objet complète) — corrigé en ajoutant `compteRenduManquant: true` à l'objet attendu. Tous les autres sites utilisaient déjà `toMatchObject` (tolérant aux champs en plus) ou ne portaient aucun scénario de séance.
- Aucune vérification visuelle Chrome MCP requise pour cette story : c'est un changement serveur pur (type + calcul), sans aucun rendu front concerné (le front ne consomme pas encore ce champ).

### File List

- `packages/shared/src/index.ts` (modifié)
- `apps/api/src/availability/availability.service.ts` (modifié)
- `apps/api/src/availability/availability.service.spec.ts` (modifié)
