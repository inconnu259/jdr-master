---
baseline_commit: 84bca7814f8bcb08083d85338bbc58e47ffde11d
---

# Story 13.2: Fraîcheur des listes de scénarios et indicateur de chargement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que la chronologie des scénarios reste à jour et que l'accès direct à une fiche affiche un état de chargement,
so that je ne consulte jamais une page silencieusement vide ou obsolète.

## Acceptance Criteria

1. **Given** je change de Partie sans que `ScenarioTimeline` soit détruit/recréé **When** l'identifiant de Partie change **Then** la timeline se recharge avec les scénarios de la nouvelle Partie.
2. **Given** `ScenarioEditor` échoue à charger la liste des participants **When** l'erreur survient **Then** un signal d'erreur cohérent avec le reste du composant s'affiche (jamais un échec silencieux).
3. **Given** `loadScenarios()` est en vol quand le composant `ScenarioTimeline` est démonté **When** la requête se résout après la destruction **Then** aucune écriture n'est tentée sur un signal du composant détruit.
4. **Given** j'accède directement par URL ou je recharge (F5) une fiche scénario **When** le fallback réseau est en cours de résolution **Then** un indicateur de chargement visible est affiché, jamais une page vide sans feedback.

## Tasks / Subtasks

- [x] **Task 1 — Vérifier AC1 : `ScenarioTimeline` réagit déjà à `partieId()` (pas de code manquant, non-régression seulement)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`, `effect()` du constructeur (lignes 111-115).
  - **Constat important** : `deferred-work.md` (ligne 457) décrit ce gap comme non résolu (« `ngOnInit` ne charge qu'une fois »), mais cette description est **fausse depuis l'origine** — l'historique git confirme que `scenario-timeline.ts` a toujours utilisé ce mécanisme d'`effect()` réactif depuis sa création (pas de version antérieure à `ngOnInit` unique), donc il ne s'agit pas d'un refactor ultérieur qui aurait corrigé le gap, mais d'une description erronée dès l'écriture de cette ligne. Le composant lit `partieId()` de façon réactive à l'intérieur d'un `effect()` (`const partieId = this.partieId();` ligne 112, hors `untracked()`), qui redéclenche `loadScenarios(partieId)` à chaque changement. AC1 est donc **déjà satisfaite structurellement**.
  - **Nuance sur l'atteignabilité réelle** : `ScenarioTimeline` est instancié par `PartieDetail`, qui lit son propre `partieId` de route (`route.snapshot.paramMap.get('id')`) une seule fois dans `ngOnInit`, jamais de façon réactive — donc naviguer entre deux Parties sans réellement démonter `PartieDetail` (si Angular réutilisait l'instance) ne changerait pas `p.id` non plus, aujourd'hui. Le test de non-régression du Task 5 valide le comportement du composant *isolément* (via `componentRef.setInput`), pas un chemin utilisateur nécessairement atteignable dans l'app actuelle — c'est le même type de limite déjà connue pour `ScenarioDetail`/route non réactive (`deferred-work.md`). Hors scope de cette story : ne pas rendre `PartieDetail.partieId` réactif ici.
  - Ne modifier aucun code pour cette tâche — seulement ajouter le test de non-régression du Task 5 qui le prouve, et corriger la ligne obsolète de `deferred-work.md` (cf. Task 6).

- [x] **Task 2 — `ScenarioTimeline` : garde anti-démontage sur `loadScenarios()` (AC3)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`.
  - `loadScenarios()` (lignes 143-154) a déjà un garde anti-obsolescence (`loadGeneration`, ligne 104/144/147/151) qui ignore une réponse HTTP dépassée par une plus récente — mais **aucun garde de démontage** : si le composant est détruit pendant l'appel réseau, `this.scenarios.set(...)`/`this.loadError.set(...)` s'exécutent quand même à la résolution.
  - **Aucun pattern `DestroyRef` guardant une écriture de signal après une `Promise` n'existe encore dans ce codebase** (recherche exhaustive faite — seuls 2 usages de `DestroyRef` existent : `partie-detail.ts:251-253`, pour retirer un `document.addEventListener`, et `constraint-panel.ts:128`, `takeUntilDestroyed` sur un Observable de formulaire réactif — aucun des deux ne s'applique littéralement ici, car `ScenariosService.listAll()` retourne une `Promise`, pas un `Observable`, et `takeUntilDestroyed` ne s'y greffe pas directement).
  - Implémentation : injecter `DestroyRef` (`private readonly destroyRef = inject(DestroyRef);`), poser un booléen local (`private destroyed = false;`), l'activer via `this.destroyRef.onDestroy(() => { this.destroyed = true; });` dans le constructeur, et vérifier `if (this.destroyed || generation !== this.loadGeneration) return;` aux deux points de sortie de `loadScenarios()` (succès et `catch`), en plus (pas à la place) du garde `generation` déjà présent.

- [x] **Task 3 — `ScenarioEditor` : signal d'erreur visible sur l'échec de chargement des participants (AC2)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`, bloc `try/catch` du chargement des personnages dans `ngOnInit()` (lignes 159-164).
  - Le `catch {}` est actuellement vide avec un commentaire explicite justifiant la dégradation silencieuse — **gap déjà documenté** dans `deferred-work.md` (ligne 477, section « Deferred from: code review of la session bug-fix 8.1 »), à traiter maintenant par décision du Palier 6.
  - Ajouter un nouveau signal `protected readonly participantsLoadError = signal<string | null>(null);` (à côté de `documentsError`, ligne 64 — **ne pas réutiliser/renommer `participantError`**, un signal différent porté par `scenario-read-dialog.ts:115` pour un tout autre échec, celui de la mutation `participate()`, pas du chargement de liste).
  - Dans le `catch` (ligne 161-164), remplacer le commentaire silencieux par `this.participantsLoadError.set('Impossible de charger les participants. Réessayez.');` — même formulation/style que `documentsError` (ligne 157).
  - Template (`scenario-editor.html`, section `.participants`, lignes ~80-99) : ajouter `@if (participantsLoadError()) { <p class="error">{{ participantsLoadError() }}</p> }` à l'intérieur de la section, même patron que le bloc `@if (documentsError())` (lignes 145-147).
  - **Limite de portée assumée** : cette section `.participants` (et donc son message d'erreur) ne s'affiche que si `isEpisodique()` est vrai. Si `characterService.listByPartie()` échoue pour un scénario non-épisodique, `participantsLoadError` sera positionné mais n'aura aucun emplacement pour s'afficher — limite volontaire (les personnages ne sont utilisés que par cette section pour l'instant), cohérente avec le scope du Task 5 qui ne teste que le cas épisodique.

- [x] **Task 4 — `ScenarioDetail` : indicateur de chargement sur l'accès direct/F5 (AC4)**
  - Fichiers : `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts`, `.html`.
  - **Aucun pattern de spinner/indicateur de chargement n'existe encore ailleurs dans ce codebase** (recherche exhaustive : aucun `mat-spinner`/`MatProgressSpinner`/signal `loading` sur une page routée) — cette story introduit le premier de ce type, à garder minimal (texte, pas de nouvelle dépendance Material).
  - Ajouter `protected readonly loading = signal(true);` dans `ScenarioDetail`.
  - Dans `ngOnInit()` (lignes 33-58) : mettre `this.loading.set(false)` sur **toutes** les branches de sortie qui affichent un résultat final — `scenarioId`/`partieId` manquants (ligne 36-37), `navigationScenario` déjà disponible (ligne 40-43, sortie synchrone — pas de fenêtre de chargement réelle mais garder la cohérence), et dans un `finally` autour du bloc réseau (lignes 48-57) pour couvrir succès/`found` introuvable/`catch`.
  - Template (`scenario-detail.html`) : ajouter une 3ᵉ branche entre `loadError()` et `scenario(); as s` : `@if (loading()) { <p>Chargement…</p> } @else if (loadError()) {...} @else if (scenario(); as s) {...}`.

- [x] **Task 5 — Tests**
  - `scenario-timeline.spec.ts` :
    - Test de non-régression AC1 : `fixture.componentRef.setInput('partieId', 'p2')` sur un composant déjà monté avec `partieId='p1'` → `scenariosSvc.listAll` rappelé avec `'p2'` (suivre la convention déjà en place aux lignes 383+, qui teste `scenariosSvc.changed.update(...)` de façon similaire).
    - Test AC3 : simuler la destruction du composant (`fixture.destroy()`) pendant qu'un appel `listAll` est en vol (promesse non résolue avant destruction), puis résoudre la promesse après → `scenarios()`/`loadError()` ne doivent pas être accédés/modifiés après destruction (assert sur l'absence d'exception + éventuellement un spy sur `console.error` si Angular logue une écriture post-destruction).
  - `scenario-editor.spec.ts` : test dédié — `characterService.listByPartie` rejeté → `participantsLoadError()` porte un message, section `.participants` affiche l'erreur (si `isEpisodique()` est vrai dans le scénario de test).
  - `scenario-detail.spec.ts` : test AC4 — pendant que `scenarios.listAll(...)` est en vol (promesse non résolue), `loading()` est `true` et le texte « Chargement… » est présent dans le DOM ; après résolution, `loading()` repasse à `false` et le contenu normal (scénario ou erreur) s'affiche.

- [x] **Task 6 — Nettoyage `deferred-work.md`**
  - Marquer résolues les 3 entrées déjà identifiées et maintenant traitées par cette story (lignes 457, 476, 477) — noter dans le fichier qu'elles sont closes par la Story 13.2, sans les supprimer (garder l'historique).
  - Corriger l'entrée ligne 457 pour noter que la description « `ngOnInit` ne charge qu'une fois » était déjà obsolète avant même cette story (le refactor `effect()` l'avait déjà réglée).

### Review Findings

- [x] [Review][Patch] Test AC3 ne couvre que la branche succès du garde `destroyed`, pas la branche `catch` [`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` — test « AC3 »] — corrigé : assertion `loadError()` ajoutée au test existant + nouveau test dédié à la branche `catch`
- [x] [Review][Defer] `ScenarioDetail.ngOnInit()` n'a aucun garde anti-démontage, contrairement au correctif appliqué à `ScenarioTimeline` dans ce même diff [`apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts` — `ngOnInit`] — deferred, pre-existing
- [x] [Review][Defer] `participantsLoadError` n'est jamais réinitialisé par l'`effect()` du constructeur lors d'un rechargement externe du scénario [`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` — constructeur] — deferred, pre-existing (même limitation que `documentsError`, déjà non réinitialisée par ce même `effect()`)
- [x] [Review][Defer] Aucun test ne vérifie l'interaction entre le rechargement AC1 (`partieId()` change) et le garde de démontage AC3 lorsqu'ils se produisent en même temps [`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` — `loadScenarios`] — deferred, pre-existing

- [x] **Task 7 — Validation finale**
  - `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - `docker compose exec web pnpm exec ng build --configuration development` — compilation propre (pas de script `typecheck` dédié, cf. précédent établi par la Story 13.1).
  - Aucune modification backend, aucune migration Prisma, aucun nouveau module (AD-9) — cette story est strictement frontend.

## Dev Notes

### Architecture — aucune décision contraignante spécifique (confirmé, `ARCHITECTURE-SPINE.md` du 2026-07-18)

- La table de cohérence de la spine couvre FR2 à FR5 (dont FR3/FR4, cette story) par une seule ligne : « Correctifs locaux, aucune décision d'architecture requise — pas de risque de divergence entre implémentations indépendantes. » Contrairement à la Story 13.1 (AD-8, contraignante), cette story n'a **aucune AD à respecter** au-delà des conventions héritées.
- **P1-AD-5 (héritée)** : tout template Angular touché utilise `@if`/`@for`, jamais `*ngIf`/`*ngFor`.
- **AD-9** : aucun nouveau module NestJS — non déclenché ici (story 100% frontend).
- Seed de l'arborescence source (indicatif, pas normatif) : la spine liste explicitement `scenario-timeline.ts` (garde démontage FR-3, réactivité `partieId` FR-3) et `scenario-detail.ts` (indicateur de chargement FR-4) comme fichiers attendus — cohérent avec les Tasks 2 et 4 ci-dessus.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** (fichier entier, 265 lignes) — l'`effect()` du constructeur (106-115) réagit déjà à `partieId()` (Task 1) ; `loadScenarios()` (143-154) a le garde `loadGeneration` à étendre (Task 2).
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** (fichier entier) — `ngOnInit()` (141-176), bloc participants lignes 159-164 (Task 3). `documentsError` (ligne 64) est le patron exact à répliquer.
- **`apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts`** et **`.html`** (fichiers entiers, courts) — `ngOnInit()` (33-58), 3 branches de sortie à couvrir par `loading.set(false)` (Task 4).
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** (lignes 251-253) — seul usage existant de `DestroyRef.onDestroy()` dans ce codebase, patron à adapter pour Task 2 (usage différent : ici pour retirer un listener DOM, dans cette story pour ignorer une écriture de signal post-destruction).
- **`apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts`** (ligne 128) — seul usage de `takeUntilDestroyed`, **non applicable littéralement** à `loadScenarios()` (Observable-only, `ScenariosService.listAll()` retourne une `Promise`) — à ne pas essayer de réutiliser tel quel, juste pour référence sur la disponibilité de `@angular/core/rxjs-interop` dans ce projet (Angular 22, RxJS ~7.8.0).
- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts`** (describe `ScenarioTimeline`, ligne 85 ; tests `changed()`/rechargement lignes 383+, 397+, 420+) — conventions de test à réutiliser pour le Task 5.

### Historique — gaps déjà documentés (Palier 6)

- **AC2/AC4** : `deferred-work.md` lignes 476-477, section « Deferred from: code review of la session bug-fix 8.1 (2026-07-13, mode no-spec) » — items pré-identifiés, maintenant traités par cette story.
- **AC1** : `deferred-work.md` ligne 457 décrit un gap qui **n'existe plus** (description périmée, cf. Task 1) — à corriger dans le fichier (Task 6), pas à re-corriger dans le code.
- **AC3** : aucune entrée existante dans `deferred-work.md` — trouvaille nouvelle de cette story, pas un report d'un gap déjà connu.

### Project Structure Notes

- Fichiers modifiés : `scenario-timeline.ts` + `.spec.ts`, `scenario-editor.ts`/`.html` + `.spec.ts`, `scenario-detail.ts`/`.html` + `.spec.ts`, `deferred-work.md`.
- Aucun nouveau fichier, aucune nouvelle dépendance (pas de `MatProgressSpinnerModule` — indicateur texte simple, cf. Task 4).
- Aucune migration Prisma, aucun nouveau module NestJS, aucune modification backend.

### Testing Standards

- Frontend : Vitest, fichiers `*.spec.ts` déjà en place à côté des composants — étendre les fichiers existants.
- Pour le test de démontage (AC3, Task 2) : utiliser `fixture.destroy()` avant de résoudre la promesse mockée du service, puis résoudre-la et vérifier qu'aucune exception n'est levée et qu'aucun état post-destruction n'est observable — s'inspirer du pattern déjà établi dans `scenario-timeline.spec.ts` pour les réponses obsolètes (ligne 420+, `loadGeneration`).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 100, 162-184 — Epic 13 / Story 13.2 complète, FR3/FR4)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (table de cohérence, FR2-FR5 « correctifs locaux »)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.1 FR3/FR4)
- `_bmad-output/implementation-artifacts/deferred-work.md` (lignes 457, 476, 477 — gaps déjà identifiés, deux traités ici, un périmé)
- `_bmad-output/implementation-artifacts/13-1-garde-anti-double-clic-et-reinitialisation-des-erreurs-sur-les-mutations-scenario.md` (story précédente, même epic — aucune dépendance directe mais même famille de composants `ScenarioEditor`/`ScenarioTimeline`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

### Completion Notes List

- AC1 confirmée déjà satisfaite structurellement (aucun code modifié) : `ScenarioTimeline` réagit déjà à `partieId()` via l'`effect()` du constructeur. Test de non-régression ajouté.
- AC3 : garde anti-démontage ajoutée à `loadScenarios()` via `DestroyRef.onDestroy()` (patron adapté de `partie-detail.ts`) — `this.destroyed` vérifié aux deux points de sortie (succès + `catch`), en plus du garde `loadGeneration` déjà présent.
- AC2 : nouveau signal `participantsLoadError` sur `ScenarioEditor`, positionné dans le `catch` du chargement des personnages (`ngOnInit`), affiché dans la section `.participants` — limite assumée : ne s'affiche que si `isEpisodique()` est vrai (section conditionnelle existante).
- AC4 : nouveau signal `loading` sur `ScenarioDetail` (initialisé à `true`), remis à `false` sur les 3 branches de sortie de `ngOnInit()` (paramètres manquants, état de navigation synchrone, `finally` du bloc réseau). Indicateur texte simple (« Chargement… »), aucune nouvelle dépendance Material.
- `deferred-work.md` nettoyé : 3 entrées marquées résolues (barrées, historique conservé) — la ligne 457 (AC1) corrigée pour noter que la description du gap était déjà obsolète avant même cette story.
- Suite complète Vitest : 804/804 tests (69 fichiers), 0 régression, incluant les 4 nouveaux tests (AC1 non-régression, AC2, AC3, AC4). Build `ng build --configuration development` propre (seul warning préexistant, `poll-creation.html`, hors scope).

### File List

- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — AC3)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié — tests AC1, AC3)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — AC2)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié — AC2)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — test AC2)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts` (modifié — AC4)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.html` (modifié — AC4)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts` (modifié — test AC4)
- `_bmad-output/implementation-artifacts/deferred-work.md` (modifié — Task 6)

## Change Log

- 2026-07-18 : Implémentation complète (Tasks 1-7). AC1 vérifiée sans modification de code ; AC2/AC3/AC4 implémentées. 804/804 tests web, build development propre, aucune régression. Statut passé à review.
- 2026-07-18 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 1 patch appliqué (couverture de test manquante sur la branche `catch` du garde `destroyed`, AC3). 3 items différés (voir `deferred-work.md`) : absence de garde anti-démontage sur `ScenarioDetail` (hors scope AC3), `participantsLoadError` non réinitialisé (même limitation que `documentsError`), interaction AC1/AC3 non testée. 6 écartés (bruit ou déjà accepté par le scope de la story). 805/805 tests web après correction, aucune régression. Statut passé à done.
