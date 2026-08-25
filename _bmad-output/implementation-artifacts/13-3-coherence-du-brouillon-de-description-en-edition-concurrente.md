---
baseline_commit: e6c23187d4942010e7b435504b652b0aa184aef7
---

# Story 13.3: Cohérence du brouillon de description en édition concurrente

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want que ma saisie en cours dans le champ description (ou résumé de fin) ne soit pas silencieusement écrasée ou perdue si le scénario est rechargé pendant que je tape,
so that je ne perde jamais du texte déjà saisi sans le savoir.

## Acceptance Criteria

1. **Given** je suis en train de taper dans `descriptionDraft` (valeur différente de `scenario().description` actuel) **When** `scenarioInput()` reçoit une nouvelle valeur dont `description` est **identique** à celle du scénario précédent (le rechargement ne touche pas ce champ) **Then** `descriptionDraft` conserve ma saisie en cours, inchangée.
2. **Given** je suis en train de taper dans `descriptionDraft` **When** `scenarioInput()` reçoit une nouvelle valeur dont `description` **diffère** de celle du scénario précédent (modifiée côté serveur entre-temps, ex. un autre onglet/utilisateur) **Then** `descriptionDraft` est remplacé par la nouvelle valeur serveur (mon brouillon local est perdu, sciemment — le texte serveur est réputé plus à jour).
3. **Given** je suis en train de taper dans `resumeFinDraft` **When** `scenarioInput()` change **Then** le même comportement que AC1/AC2 s'applique (champ identique/différent → conserver/écraser), par symétrie avec `descriptionDraft` (même `effect()`, même risque de divergence silencieuse).
4. **Given** le tout premier montage du composant (aucun scénario précédent) **When** `scenarioInput()` reçoit sa valeur initiale **Then** `descriptionDraft`/`resumeFinDraft` s'initialisent avec les valeurs du scénario reçu — comportement actuel inchangé (non-régression).

## Tasks / Subtasks

- [x] **Task 1 — `ScenarioEditor` : comparaison avant écrasement des brouillons (AC1, AC2, AC3, AC4)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`, `effect()` du constructeur (lignes 124-139).
  - **Le seul chemin réel qui déclenche aujourd'hui ce `effect()` après le montage initial** est un changement de référence de l'objet passé au `[scenario]` input du parent — vérifié dans les deux appelants : `ScenarioOneShotTab` (`openToPlayers()` réassigne son signal `scenario` local, ré-émis vers `[scenario]`) et `ScenarioDetail` (n'assigne son `scenario` local **qu'une seule fois** dans `ngOnInit`, jamais rebindé ensuite — donc ce chemin n'est atteignable aujourd'hui que via l'onglet ONE_SHOT). Peu importe : le correctif se fait dans l'`effect()` lui-même, indépendamment de qui le déclenche.
  - **Import requis** : ajouter `untracked` à l'import `@angular/core` existant (ligne 1). Précédent direct dans ce même repo : `scenario-timeline.ts` (Story 13.2, `effect()` du constructeur) lit `this.partieId()` de façon réactive mais utilise `untracked(() => this.loadScenarios(partieId))` pour ne pas créer de dépendance sur l'appel englobé — même besoin ici, dans l'autre sens (lire `this.scenario()` **sans** en faire une dépendance de cet `effect()`, ce qui créerait une boucle : l'`effect()` appelle `this.scenario.set(s)`, et s'il dépendait aussi de `this.scenario()`, cette écriture le re-déclencherait lui-même).
  - Modifier l'`effect()` :
    ```typescript
    effect(() => {
      const s = this.scenarioInput();
      const previous = untracked(() => this.scenario());
      this.scenario.set(s);
      if (!previous || previous.description !== s.description) {
        this.descriptionDraft.set(s.description ?? '');
      }
      if (!previous || previous.resumeFin !== s.resumeFin) {
        this.resumeFinDraft.set(s.resumeFin ?? '');
      }
      // FR2 (Story 13.1, inchangé) : reset des erreurs périmées — toujours inconditionnel, ne
      // dépend pas de `previous` (contrairement aux 2 drafts ci-dessus).
      this.markCourantError.set(null);
      this.closeError.set(null);
      this.addSeanceError.set(null);
      this.fieldEditError.set(null);
      this.uploadError.set(null);
      this.downloadError.set(null);
      this.resumeFinError.set(null);
    });
    ```
  - **Ne pas toucher** au reset inconditionnel des 7 signaux d'erreur (Story 13.1, FR2) — ce comportement reste correct et n'a aucun rapport avec la divergence de brouillon traitée ici (un message d'erreur périmé n'est pas une saisie utilisateur à préserver).
  - **`previous` peut être `null`** uniquement au tout premier passage de l'`effect()` (signal `scenario` initialisé à `signal<ScenarioDto | null>(null)`, ligne 62) — dans ce cas `!previous` est `true`, les deux drafts sont initialisés sans condition, comportement identique à aujourd'hui (AC4).

- [x] **Task 2 — Décision de scope actée : pas de nouveau chemin de rechargement via `changed()`**
  - **Ne pas ajouter d'écoute de `scenariosService.changed()` dans `ScenarioEditor`** — décision déjà actée et documentée dans les Dev Notes de la Story 13.1 (« hors scope de cette story, le FR ne le demande pas, et cela toucherait FR19/Epic 17, hors scope du Palier 6 en cours pour cette partie »), toujours valable ici : la Story 13.3 corrige la divergence *au sein* du chemin de rechargement déjà existant (`scenarioInput()`), elle n'en introduit pas un nouveau. Le texte de l'epic (« signal `changed` déclenché ailleurs ») est une reformulation informelle du concept de « rechargement externe », pas une exigence technique littérale d'ajouter un abonnement à ce signal précis — confirmé par l'absence de toute mention de ce mécanisme dans le FR-5 du PRD (`prd-jdr-master-2026-07-18/prd.md` §4.1), qui ne parle que d'un « rechargement externe » générique.
  - Aucune action de code pour cette tâche — seulement une note dans Completion Notes confirmant que ce choix a été respecté.

- [x] **Task 3 — Tests**
  - `scenario-editor.spec.ts`, nouveau bloc `describe('Cohérence du brouillon en édition concurrente (Story 13.3)', ...)` :
    - AC1 : monter le composant, taper dans `descriptionDraft` (`comp.descriptionDraft.set('brouillon en cours')`) avec une valeur différente de `SCENARIO.description`, puis `fixture.componentRef.setInput('scenario', { ...SCENARIO, title: 'Autre' })` (description **inchangée**) → `comp.descriptionDraft()` reste `'brouillon en cours'`.
    - AC2 : même mise en place, mais `setInput('scenario', { ...SCENARIO, description: 'Nouvelle description serveur' })` (description **différente**) → `comp.descriptionDraft()` devient `'Nouvelle description serveur'`.
    - AC3 : mêmes 2 tests, symétriques, pour `resumeFinDraft`/`resumeFin` (utiliser un scénario `status: 'PASSE'` comme dans les tests `submitResumeFin` existants, ex. ligne 903+).
    - AC4 (non-régression) : test déjà implicitement couvert par `createComponent()` (le premier `setInput` initial peuple déjà `descriptionDraft`/`resumeFinDraft` — vérifié par les tests existants qui lisent `descriptionDraft()`/`resumeFinDraft()` après montage) ; ajouter seulement une assertion explicite si aucun test existant ne le fait déjà (vérifier avant d'en écrire un redondant).
  - Suivre la convention `fixture.componentRef.setInput('scenario', {...}); fixture.detectChanges();` déjà utilisée dans les tests `scenarioInput() change → XError se réinitialise (Story 13.1, AC2)` (ex. lignes 187-199, 420-432) de ce même fichier — même fixture, même pattern, pas de nouveau helper.

### Review Findings

- [x] [Review][Patch] Comparaison `previous.description !== s.description`/`previous.resumeFin !== s.resumeFin` non normalisée (`null`/`undefined` bruts) alors que l'affectation elle-même normalise via `?? ''` — un aller-retour serveur qui changerait `null` en `undefined` (ou inversement) sans changement de sens écraserait le brouillon à tort [`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` — `effect()`, lignes ~139-148] — corrigé : comparaison normalisée via `(previous.description ?? '') !== (s.description ?? '')` (et symétriquement pour `resumeFin`)
- [x] [Review][Defer] Le brouillon n'est pas réinitialisé si `scenarioInput()` change vers un **autre scénario** (id différent) dont `description`/`resumeFin` coïncident par hasard avec l'ancien — le brouillon de l'ancien scénario resterait affiché sous le nouveau [`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` — `effect()`] — deferred, pre-existing (aucun appelant actuel de `ScenarioEditor` ne fait réellement changer l'id du scénario reçu sans démonter le composant — `ScenarioOneShotTab` garde toujours le même scénario, `ScenarioDetail` n'assigne son `scenario` qu'une fois — risque latent non atteignable aujourd'hui)

- [x] **Task 4 — Validation finale**
  - `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - `docker compose exec web pnpm exec ng build --configuration development` — compilation propre (pas de script `typecheck` dédié, précédent établi Stories 13.1/13.2).
  - Aucune modification backend, aucune migration Prisma, aucun nouveau module (AD-9) — cette story est strictement frontend, un seul fichier `.ts` touché (+ son spec).

## Dev Notes

### Architecture — aucune décision contraignante spécifique (confirmé, `ARCHITECTURE-SPINE.md` du 2026-07-18)

- Table de cohérence de la spine, ligne FR2-FR5 : « Correctifs locaux, aucune décision d'architecture requise — pas de risque de divergence entre implémentations indépendantes. » Comme la Story 13.2, aucune AD à respecter au-delà des conventions héritées.
- **Comportement exact déjà tranché avec l'utilisateur au niveau PRD** (`prd-jdr-master-2026-07-18/prd.md` §4.1 FR-5, 2026-07-18) : « la saisie en cours est conservée par défaut lors d'un rechargement externe — sauf si ce champ précis a été modifié côté serveur entre-temps (autre onglet/utilisateur), auquel cas la valeur serveur est reprise pour ce champ. » Ce n'est **pas** une décision laissée à cette story (contrairement à FR-21/Epic 17, qui est lui explicitement encore ouvert) — la story ci-dessus applique directement cette décision déjà actée, aucune latitude d'implémentation sur le *comportement* (garder vs. écraser), seulement sur les détails techniques (comparaison de valeurs via `untracked`).
- **P1-AD-5 (héritée)** : aucun template touché par cette story (modification `.ts` uniquement) — non applicable ici mais à ne pas régresser si le template venait à être touché.
- **AD-9** : aucun nouveau module NestJS — non déclenché (story 100% frontend, un seul fichier).
- Seed de l'arborescence source (indicatif) : la spine liste `scenario-editor.ts # + signal pending (AD-8), reset erreurs (FR-2), draft (FR-5)` comme fichier attendu — le "draft (FR-5)" correspond exactement à cette story (les 2 autres items de cette ligne, `pending`/`reset erreurs`, sont déjà traités par la Story 13.1).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** (fichier entier, 351 lignes après Story 13.2) — `effect()` du constructeur (124-139, cible de cette story), déclaration de `descriptionDraft`/`resumeFinDraft` (76-77), `scenario` signal (62, `signal<ScenarioDto | null>(null)`), méthodes `submitDescription()` (208-224) et `submitResumeFin()` (311-325) qui lisent ces drafts au moment de la soumission (aucune modification requise sur ces deux méthodes — hors scope).
- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** (Story 13.2) — usage déjà en place d'`untracked()` dans un `effect()` de ce même projet, à titre de précédent syntaxique (usage différent : là pour éviter de dépendre de l'appel asynchrone englobé, ici pour éviter de dépendre de la valeur qu'on écrit soi-même dans le même effect).
- **`apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts`** (fichier entier, court) — seul chemin observé aujourd'hui qui fait effectivement changer la référence de `[scenario]` après le montage initial (`openToPlayers()`, ligne ~54, `this.scenario.set(await this.scenarios.open(s.id))`) ; utile pour comprendre un scénario réel de déclenchement de l'`effect()`, mais aucune modification requise dans ce fichier.
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts`** — tests `scenarioInput() change → XError se réinitialise (Story 13.1, AC2)` (ex. lignes 187, 292, 420, 531, 745, 903) : patron exact de déclenchement (`fixture.componentRef.setInput('scenario', {...}); fixture.detectChanges();`) à réutiliser pour les nouveaux tests de cette story.
- **`_bmad-output/implementation-artifacts/13-1-garde-anti-double-clic-et-reinitialisation-des-erreurs-sur-les-mutations-scenario.md`** (Dev Notes) — décision explicite déjà actée de ne PAS écouter `changed()` dans `ScenarioEditor`/`ScenarioReadDialog` (cf. Task 2 ci-dessus, qui applique cette même décision à cette story).

### Piège à éviter

`untracked(() => this.scenario())` doit être appelé **avant** `this.scenario.set(s)` dans le corps de l'`effect()` — inverser l'ordre lirait la valeur qu'on vient tout juste d'écrire (toujours égale à `s`), et la comparaison `previous.description !== s.description` serait alors toujours fausse, désactivant silencieusement toute la logique de cette story (les drafts ne seraient plus jamais mis à jour, y compris quand ils le devraient, AC2/AC3).

### Project Structure Notes

- Fichiers modifiés : `scenario-editor.ts` + `.spec.ts` uniquement.
- Aucun nouveau fichier, aucune nouvelle dépendance, aucune migration Prisma, aucun nouveau module NestJS.

### Testing Standards

- Frontend : Vitest, `*.spec.ts` déjà en place à côté du composant — étendre le fichier existant, ne pas en créer un nouveau.
- Ce projet est zoneless (pas de `zone.js`) — les tests de cette story n'impliquent aucune promesse asynchrone nouvelle (`descriptionDraft.set(...)` et `fixture.componentRef.setInput(...)` sont synchrones), donc la boucle habituelle de 10 `await Promise.resolve()` avant `whenStable()` n'est nécessaire que pour la phase de montage initial déjà gérée par `createComponent()` — pas pour les assertions propres à cette story elles-mêmes.

## Change Log

- 2026-07-18 : Implémentation complète (Tasks 1-4). Comparaison avant écrasement des brouillons dans l'`effect()` de `ScenarioEditor` (`untracked` pour éviter la boucle de dépendance), aucune écoute de `changed()` ajoutée (scope confirmé conforme à la décision de la Story 13.1). 5 nouveaux tests, 810/810 tests web au vert, build development propre, aucune régression. Statut passé à review.
- 2026-07-18 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 1 patch appliqué (comparaison `description`/`resumeFin` normalisée via `?? ''` avant comparaison, pour ne pas confondre `null`/`undefined` avec un vrai changement serveur). 1 item différé (voir `deferred-work.md`) : brouillon non réinitialisé si `scenarioInput()` change vers un scénario différent dont les champs coïncident par hasard — risque latent non atteignable avec les appelants actuels. 10 écartés (bruit ou comportement déjà accepté par le design de la story). 810/810 tests web après correction, aucune régression. Statut passé à done.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 186-196 — Epic 13 / Story 13.3 complète, FR5)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (table de cohérence, FR2-FR5 « correctifs locaux » ; section Deferred, ligne « Comportement exact de FR-5 ... Laissés à la story » — nuancé par le PRD qui, lui, tranche déjà le comportement)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.1 FR-5 — décision utilisateur du 2026-07-18 sur le comportement exact garder/écraser)
- `_bmad-output/implementation-artifacts/13-1-garde-anti-double-clic-et-reinitialisation-des-erreurs-sur-les-mutations-scenario.md` (Dev Notes — décision de ne pas écouter `changed()` dans `ScenarioEditor`, réappliquée ici)
- `_bmad-output/implementation-artifacts/13-2-fraicheur-des-listes-de-scenarios-et-indicateur-de-chargement.md` (précédent d'usage d'`untracked()` dans un `effect()` de ce projet, `scenario-timeline.ts`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Task 1 : `effect()` du constructeur modifié — capture de `previous = untracked(() => this.scenario())` avant `this.scenario.set(s)`, puis comparaison champ par champ (`previous.description !== s.description`, `previous.resumeFin !== s.resumeFin`) avant d'écraser `descriptionDraft`/`resumeFinDraft`. `!previous` (premier montage) déclenche toujours l'initialisation, comportement inchangé. Reset inconditionnel des 7 signaux d'erreur (FR2, Story 13.1) non touché.
- Task 2 : confirmé — aucune écoute de `scenariosService.changed()` ajoutée à `ScenarioEditor`, conformément à la décision déjà actée dans les Dev Notes de la Story 13.1. Le correctif reste entièrement dans le chemin de rechargement existant (`scenarioInput()`).
- Task 3 : 5 nouveaux tests dans le bloc `describe('Cohérence du brouillon en édition concurrente (Story 13.3)', ...)` — AC1 (description inchangée → draft conservé), AC2 (description différente → draft écrasé), AC3 ×2 (même paire pour `resumeFinDraft`), AC4 (non-régression du peuplement initial, assertion explicite ajoutée).
- Task 4 : 810/810 tests web (69 fichiers), 0 régression. Build `ng build --configuration development` propre (seul warning préexistant `poll-creation.html`, hors scope).

### File List

- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — Task 1)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — Task 3, 5 nouveaux tests)
