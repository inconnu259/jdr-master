---
baseline_commit: 3b221066cc3339101ea1b3f12bdc678861c5361d
---

# Story 21.2: Câblage ScenarioDrafts et ScenarioOneShotTab

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want voir les brouillons de scénario créés, publiés ou supprimés par un co-MJ, même si ma vue reste ouverte ailleurs,
so that je ne travaille jamais sur une liste de brouillons obsolète.

## Acceptance Criteria

1. **Given** `ScenarioDrafts` affiché **When** un co-MJ crée, publie (`open()`) ou supprime un brouillon de scénario sur la même Partie **Then** la liste des brouillons se met à jour sans rechargement de page.
2. **Given** `ScenarioOneShotTab` affiché **When** un co-MJ crée, publie ou supprime le scénario unique de la Partie (auto-créé, cf. Dev Notes) **Then** l'onglet se met à jour sans rechargement de page — en particulier, le bouton « Ouvrir aux joueurs » disparaît si un autre onglet/MJ a déjà publié ce scénario.

## Tasks / Subtasks

- [x] **Task 1 — `ScenarioDrafts` : connexion SSE + effet réactif (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.ts` (58 lignes). `ngOnInit()` appelle `this.scenarios.listDrafts(partieId)` inline, une seule fois, aucune réactivité. `resolvePartieId()` (méthode privée déjà existante) résout `partieId` depuis l'`input()` optionnel OU le paramètre de route `:id` — **réutiliser cette méthode telle quelle**, ne pas la dupliquer.
  - Injecter `RealtimeService`, `DestroyRef` (nouveaux imports : `import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';` et `import { matchesPartie } from '../../../core/scenarios/scenarios.service';`, `DestroyRef` déjà importable depuis `@angular/core`).
  - Extraire la logique de chargement de `ngOnInit()` en une méthode privée `loadDrafts(partieId: string)` réutilisable par le fetch initial ET le déclenchement temps réel — **reproduire le pattern déjà établi par `ScenarioTimeline.loadScenarios()`** (`scenario-timeline.ts` lignes 160-171) : compteur `loadGeneration` (ignore une réponse HTTP obsolète) + garde anti-démontage `destroyed` (Story 13.2, convention projet). Ce composant partage exactement le même service (`ScenariosService`) et le même risque de double `changed()` rapproché que `ScenarioTimeline` — mirroring direct, pas de nouvelle décision de conception.
  - Dans le constructeur, ajouter un `effect()` gardé par `firstRun` (même piège que `ScenarioEditor`/`Dashboard`, Stories 19.2/21.1 : `ScenariosService` est `providedIn: 'root'`, son `_changed` peut déjà porter une valeur avant le montage) qui compare `matchesPartie(change, partieId)` avant de recharger — **`partieId` doit être résolu via `resolvePartieId()` à l'intérieur de l'`effect()`** (pas figé une seule fois dans le constructeur), car ce composant n'a pas de `partieId` garanti au moment de la construction (dépend de l'input ou de la route, résolu de façon synchrone mais après construction de la classe — vérifier empiriquement l'ordre avant de coder, cf. Dev Notes).
  - Ouvrir la connexion SSE dans `ngOnInit()` (comme `PartieDetail`/`ScenarioEditor`) **seulement si `resolvePartieId()` retourne une valeur** (même garde `if (partieId)` que les autres composants) :
    ```typescript
    async ngOnInit(): Promise<void> {
      const partieId = this.resolvePartieId();
      if (!partieId) {
        this.loadError.set('Partie introuvable.');
        return;
      }
      this.realtime.connect(partieTopic(partieId));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(partieId)));
      await this.loadDrafts(partieId);
    }
    ```
  - **Ne pas toucher** `newScenario()`/`openScenario()`/`openToPlayers()` — inchangés.

- [x] **Task 2 — `ScenarioOneShotTab` : connexion SSE + effet réactif (AC2)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts` (64 lignes). `partieId` est un `input.required<string>()` — toujours défini, contrairement à `ScenarioDrafts`. `ngOnInit()` tente `listDrafts()` puis retombe sur `listAll()` si vide, définit `this.scenario`/`this.notFound`.
  - **Piège spécifique à ce composant** (à documenter en commentaire, pas juste corriger silencieusement) : ce composant rend `<app-scenario-editor [scenario]="s" />` (voir `scenario-one-shot-tab.html` ligne 16), et `ScenarioEditor` a **déjà** sa propre connexion SSE + son propre `effect()` réactif à `ScenariosService.changed()` (Story 19.2) qui rafraîchit **sa copie interne** du scénario. **Cela ne suffit PAS** : le gabarit de `ScenarioOneShotTab` lui-même décide de l'affichage du bouton « Ouvrir aux joueurs » via `@if (s.status === 'BROUILLON')` (ligne 6), où `s` vient de **`ScenarioOneShotTab.scenario()`**, jamais de l'état interne de `ScenarioEditor`. Si un co-MJ publie ce scénario ailleurs, `ScenarioEditor` (enfant) se met à jour tout seul, mais le bouton du parent reste affiché à tort tant que `ScenarioOneShotTab.scenario()` n'est pas lui-même rafraîchi. **Ce composant doit donc réagir à `changed()` indépendamment de `ScenarioEditor`**, malgré la connexion déjà ouverte par l'enfant (cf. Dev Notes sur la redondance de connexion, acceptée par AD-6).
  - Injecter `RealtimeService`, `DestroyRef`, importer `partieTopic`/`matchesPartie` (mêmes imports que Task 1).
  - Extraire la logique `listDrafts()` → repli `listAll()` de `ngOnInit()` en une méthode privée `loadScenario()` réutilisable par le fetch initial ET le déclenchement temps réel (pas de compteur `loadGeneration` nécessaire ici — un seul scénario possible par Partie one-shot, AD-7 backend, contrairement à `ScenarioDrafts`/`ScenarioTimeline` qui chargent des listes).
  - Constructeur : `effect()` gardé par `firstRun`, `matchesPartie(change, this.partieId())` avant de recharger (`partieId` est ici un `input.required`, toujours défini — pas besoin de résolution différée comme Task 1).
  - `ngOnInit()` :
    ```typescript
    async ngOnInit(): Promise<void> {
      this.realtime.connect(partieTopic(this.partieId()));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(this.partieId())));
      await this.loadScenario();
    }
    ```
  - **Ne pas toucher** `openToPlayers()` — inchangé. **Ne pas toucher** `ScenarioEditor` — déjà complet (Story 19.2), aucune modification attendue dans ce fichier.

- [x] **Task 3 — Tests (AC1, AC2)**
  - **`scenario-drafts.spec.ts`** : ajouter un mock `RealtimeService` (`{ connect: vi.fn(), disconnect: vi.fn() }`) et `changed: signal<{ partieId: string } | null>(null)` sur le mock `scenariosSvc` existant (factory `createComponent()`, ligne 25). Nouveaux tests :
    - `connect()` appelé avec `partieTopic('p1')` au montage (cas `[partieId]` en entrée ET cas repli route `:id` — les deux chemins de résolution doivent connecter).
    - `disconnect()` appelé à `fixture.destroy()`.
    - `scenariosSvc.changed.set({ partieId: 'p1' })` après montage → `listDrafts` rappelé une deuxième fois, `comp.drafts()` reflète le nouveau retour (flush microtasks, boucle déjà établie `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`).
    - `scenariosSvc.changed.set({ partieId: 'autre-partie' })` → **aucun** second appel à `listDrafts` (filtrage `matchesPartie`, même test que `ScenarioTimeline`/`ScenarioEditor`).
    - Garde `firstRun` : créer le composant avec `changed` déjà à une valeur non-nulle correspondant à `'p1'` avant montage → `listDrafts` appelé une seule fois.
    - Cas `ni [partieId] ni paramètre de route` (test existant ligne 99) : vérifier que `realtimeSvc.connect` n'est **pas** appelé (aucun topic résoluble).
  - **`scenario-one-shot-tab.spec.ts`** : `RealtimeService` est **déjà mocké** (ligne 34, pour `ScenarioEditor` enfant) — réutiliser le même mock, ajouter les assertions sur les appels de `ScenarioOneShotTab` lui-même (ne pas supposer un seul appelant : `ScenarioEditor` ET `ScenarioOneShotTab` appellent chacun `connect(partieTopic('p1'))` quand l'éditeur est rendu — utiliser `toHaveBeenCalledWith(...)`, pas un compte exact d'appels, sauf dans le cas `notFound`/`loadError` où `ScenarioEditor` n'est jamais rendu). Nouveaux tests :
    - `connect()` appelé avec `partieTopic('p1')` au montage, y compris dans le cas `notFound` (aucun scénario) — ce composant doit connecter même sans scénario affiché, pour détecter une création future.
    - `disconnect()` appelé à `fixture.destroy()`.
    - `scenariosSvc.changed.set({ partieId: 'p1' })` après montage, scénario passé de `BROUILLON` à `A_VENIR` côté serveur (`scenariosSvc.listDrafts`/`listAll` mocks mis à jour avant le changement) → `comp.scenario()?.status` reflète `'A_VENIR'`, et surtout **le bouton « Ouvrir aux joueurs » disparaît du DOM** (assertion sur `fixture.nativeElement.textContent`, pas seulement sur l'état interne — c'est le symptôme concret du bug que cette story corrige).
    - `scenariosSvc.changed.set({ partieId: 'autre-partie' })` → aucun refetch.
    - Garde `firstRun` (même style que Task 1).

- [x] **Task 4 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (dernier chiffre connu : 893 tests, Story 21.1, + les nouveaux tests Task 3).
  - Aucune migration Prisma, aucun changement de schéma, **aucune modification côté `apps/api`** (FR-12 est un gap purement frontend — le backend émet déjà `partieTopic` sur toute mutation de `ScenariosService`, Epic 18).
  - Fichiers modifiés attendus : `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts` (+ spec). **Aucune modification** `apps/web/src/app/core/realtime/realtime.service.ts` (le préfixe `'partie:'` → `ScenariosService.notifyRealtimeChanged()` existe déjà depuis la Story 19.1, ces deux composants ne font qu'ouvrir une connexion supplémentaire sur un topic déjà géré), `apps/web/src/app/core/scenarios/scenarios.service.ts` (déjà complet : `changed`/`notifyRealtimeChanged`/`matchesPartie` existants), `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (déjà câblé, Story 19.2).

### Review Findings

Revue de code le 2026-07-23 (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 3 patches appliqués, 4 items différés, 3 écartés.

- [x] [Review][Patch] `ScenarioOneShotTab.loadScenario()` ne réinitialisait jamais `loadError` sur un rechargement réussi — une erreur de chargement initiale restait affichée indéfiniment même après un rafraîchissement temps réel réussi. Corrigé : `loadError.set(null)` ajouté aux trois branches de succès. [`scenario-one-shot-tab.ts`]
- [x] [Review][Patch] `ScenarioOneShotTab.ngOnInit()` relisait `this.partieId()` en direct au moment de `disconnect()` au lieu de capturer la valeur utilisée à la connexion — si l'input venait à changer sans réinstanciation du composant, `disconnect()` viserait le mauvais topic. Corrigé : `partieId` capturé dans une constante locale, comme `ScenarioDrafts`/`PartieDetail`. [`scenario-one-shot-tab.ts`]
- [x] [Review][Patch] Test « changed() pour une autre Partie » de `scenario-one-shot-tab.spec.ts` n'attendait aucun flush de microtasks avant son assertion — test trivialement vrai même si la garde `matchesPartie` était cassée. Corrigé : boucle de flush ajoutée, cohérente avec le reste du fichier. [`scenario-one-shot-tab.spec.ts`]
- [x] [Review][Defer] Absence de garde `loadGeneration`/`destroyed` dans `ScenarioOneShotTab.loadScenario()` — déjà explicitement acceptée par les Dev Notes de cette story (« non bloquant pour les AC ») ; un rechargement lent en vol au moment d'un second déclenchement `changed()` pourrait théoriquement écraser un état plus frais. [`scenario-one-shot-tab.ts`] — deferred, pre-existing scope decision
- [x] [Review][Defer] Réutilisation d'instance de composant avec changement de `partieId` sans démontage (les deux composants) — même limitation déjà connue et différée depuis la Story 18.3 (`PartieDetail`, cf. `deferred-work.md`), non atteignable en usage réel actuel (aucun parcours de navigation ne réutilise l'instance). [`scenario-drafts.ts`, `scenario-one-shot-tab.ts`] — deferred, pre-existing
- [x] [Review][Defer] Bloc `firstRun`/`effect()` dupliqué une 3e/4e fois à travers les composants du palier (`ScenarioEditor`, `Dashboard`, et maintenant ces deux composants) — candidat à une extraction en helper partagé, mais pattern déjà établi tel quel dans tout le palier, pas une régression de cette story. — deferred, pre-existing pattern
- [x] [Review][Defer] Commentaire de tête de `ScenarioOneShotTab` citant « AD-7 » pour la contrainte d'unicité backend du one-shot — référence incorrecte (AD-7 de `ARCHITECTURE-SPINE.md` désigne la clé de topic généralisée, pas cette règle), préexistante, non introduite par cette story. [`scenario-one-shot-tab.ts:9`] — deferred, pre-existing doc nit

**Écarté (faux positifs / non pertinents)** : comportement de `matchesPartie()`/`partieTopic()` non ré-exercé par ce diff (fonctions déjà testées dans leurs stories d'origine, hors scope) ; fragilité spéculative du `firstRun` face à un refactor futur hypothétique ; commentaire jugé long sans démonstration red/green explicite (opinion de style, non actionnable).

## Dev Notes

### Ce qui existe déjà (rien à poser, seulement à câbler)

Contrairement aux Stories 18.x, cette story n'introduit **aucune infrastructure nouvelle** : `RealtimeService`, `partieTopic()`, `matchesPartie()`, et le handler `'partie:' → ScenariosService.notifyRealtimeChanged()` existent tous depuis les Stories 18.2/17.3/19.1. Cette story reproduit un pattern déjà appliqué trois fois (`ScenarioTimeline`/`SeanceList`/`CalendarView` en 19.1, `ScenarioEditor` en 19.2) sur deux composants supplémentaires qui consomment le même `ScenariosService`.

### Piège principal : `ScenarioOneShotTab` ne peut pas se reposer sur `ScenarioEditor`

Vérifié empiriquement (lecture de `scenario-one-shot-tab.html` et `scenario-editor.ts`) : `ScenarioEditor` (Story 19.2) maintient sa **propre** copie interne du scénario, rafraîchie sur `changed()`. Mais `ScenarioOneShotTab.html` décide de l'affichage du bouton « Ouvrir aux joueurs » via **son propre** signal `scenario()`, jamais celui de l'enfant. Sans le câblage de cette Task 2, un MJ verrait le bouton « Ouvrir aux joueurs » rester affiché indéfiniment après qu'un co-MJ ait déjà publié le scénario ailleurs — bug silencieux, pas un crash, donc facile à manquer en test superficiel. La AC2 de cette story cible explicitement ce symptôme (assertion DOM, pas seulement sur l'état interne).

### Redondance de connexion assumée (AD-6)

Quand `ScenarioOneShotTab` a un scénario chargé, `ScenarioEditor` (enfant) ET `ScenarioOneShotTab` (parent) ouvrent chacun leur propre connexion `EventSource` sur le **même** topic `partie:{id}`. C'est intentionnel et déjà couvert par l'architecture : **AD-6** — *« Chaque composant routé... ouvre sa propre connexion EventSource au montage... Deux composants simultanément ouverts sur le même topic maintiennent chacun leur propre connexion, sans partage »*. Ne pas tenter de dédupliquer ou de faire remonter la connexion de l'enfant vers le parent — hors scope, contredirait AD-6.

### `ScenarioDrafts` : deux points d'entrée, résolution de `partieId` différée

`ScenarioDrafts` est rendu à la fois **imbriqué** dans `PartieDetail` (`[partieId]` en `input()`, `PartieDetail` maintient déjà sa propre connexion `partie:{id}` depuis la Story 18.3) et via une **route directe** `parties/:id/scenarios/drafts` (`app.routes.ts` ligne 47-51, aucun ancêtre ne connecte alors). Contrairement à `ScenarioOneShotTab` (`input.required`, jamais utilisé en route directe), `ScenarioDrafts` doit donc absolument ouvrir sa propre connexion pour couvrir le cas route directe — la redondance dans le cas imbriqué est acceptée (AD-6, même raisonnement que ci-dessus).

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis dans les deux fichiers de spec existants (factories `createComponent()`).
- Flush de microtasks : boucle déjà établie `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`, pas `whenStable()` seul (zoneless, cf. mémoire projet `jdr-zoneless-test-timing`).
- `matchesPartie()` (exporté par `scenarios.service.ts`) : réutiliser directement dans le composant, ne jamais réimplémenter une comparaison de `partieId` ad hoc.

### Previous Story Intelligence (Stories 19.1, 19.2, 21.1)

- Pattern `firstRun` dans le constructeur : établi Story 19.2 (`ScenarioEditor`) et reproduit Story 21.1 (`Dashboard`) — un composant ayant déjà un chargement dédié dans `ngOnInit()` doit neutraliser la première exécution de l'`effect()` du constructeur (les `effect()` s'exécutent à la construction, avant `ngOnInit()`), sous peine de double-fetch redondant au montage.
- Pattern `loadGeneration`/`destroyed` : établi Story 19.1 (`ScenarioTimeline`) pour ignorer une réponse HTTP obsolète et une écriture post-démontage — réutilisé ici pour `ScenarioDrafts` (liste), pas nécessaire pour `ScenarioOneShotTab` (scénario unique, risque de collision de réponses bien moindre, mais garder le réflexe `destroyed` reste une bonne pratique si le temps le permet — non bloquant pour les AC).
- Régression transitive à anticiper (établie Story 19.1) : vérifier qu'aucun fichier de spec tiers ne mock `ScenariosService` sans `changed` — `scenario-one-shot-tab.spec.ts` l'a déjà (ligne 30), `scenario-drafts.spec.ts` ne l'a **pas encore** (à ajouter, Task 3).

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 21.2 complète, lignes 287-297)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4, AD-6, AD-7 ; Structural Seed listant explicitement les deux fichiers de cette story, lignes 190-191)
- `_bmad-output/implementation-artifacts/19-1-cablage-scenariotimeline-seancelist-et-calendarview.md` (pattern `loadGeneration`/`destroyed`)
- `_bmad-output/implementation-artifacts/19-2-cablage-scenarioeditor-et-scenarioreaddialog-avec-garde-du-brouillon.md` (pattern `firstRun` + `matchesPartie`, connexion propre par composant)
- `_bmad-output/implementation-artifacts/21-1-canal-utilisateur-et-cablage-dashboard-invitations-recues.md` (pattern `firstRun` le plus récent, garde de robustesse `if (id)`)
- Vérifications empiriques effectuées pendant la préparation de cette story : `scenario-drafts.ts`/`scenario-one-shot-tab.ts` n'ont aujourd'hui aucune réactivité SSE ; `scenario-one-shot-tab.spec.ts` mock déjà `RealtimeService` (pour l'enfant `ScenarioEditor`) mais le composant lui-même n'appelle pas encore `connect()`/`disconnect()` ; `scenario-drafts.spec.ts` ne mock ni `RealtimeService` ni `changed` sur `ScenariosService` aujourd'hui ; `ScenarioDrafts` est rendu à la fois imbriqué (`partie-detail.html:339`) et via route directe (`app.routes.ts:47-51`) ; `ScenarioOneShotTab` n'est utilisé qu'imbriqué (aucune route directe trouvée).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm ng test --watch=false --include='**/scenario-drafts.spec.ts'` — 12/12 après Task 1.
- `docker compose exec web pnpm ng test --watch=false --include='**/scenario-one-shot-tab.spec.ts'` — 11/11 après Task 2/3.
- `docker compose exec web pnpm test` — suite complète : 71 fichiers / 905 tests, 0 échec (avant revue de code).
- `tsc --noEmit` brut échoue sur une erreur `rootDir` préexistante du monorepo (package `game-rules`, sans rapport avec cette story) — le compilateur Angular réel (`ng test`/`ng build`, esbuild) a déjà compilé les deux composants sans erreur pendant la suite complète.
- Après revue de code (3 patches appliqués + 2 nouveaux tests de régression) : `docker compose exec web pnpm ng test --watch=false --include='**/scenario-one-shot-tab.spec.ts'` — 13/13 ; suite complète finale : 71 fichiers / 907 tests, 0 échec.

### Completion Notes List

- Task 1 : `ScenarioDrafts` ouvre désormais sa propre connexion SSE (`partieTopic`, résolue via `resolvePartieId()` réutilisée telle quelle) et réagit à `ScenariosService.changed()` via un `effect()` gardé par `firstRun`, avec le pattern `loadGeneration`/`destroyed` de `ScenarioTimeline` (Story 19.1) pour `loadDrafts()`. Aucune connexion ouverte si `resolvePartieId()` ne retourne rien (cas route directe sans id).
- Task 2 : `ScenarioOneShotTab` ouvre également sa propre connexion SSE et réagit à `changed()` indépendamment de `ScenarioEditor` (enfant, déjà câblé Story 19.2) — le gabarit du parent pilote l'affichage du bouton « Ouvrir aux joueurs » via son propre signal `scenario()`, jamais celui de l'enfant ; sans ce câblage, le bouton serait resté affiché à tort après publication ailleurs. Logique `listDrafts()` → repli `listAll()` extraite en `loadScenario()`, réutilisée par `ngOnInit()` et l'`effect()` temps réel.
- Task 3 : nouveaux tests pour les deux composants (connect/disconnect, refetch sur `changed()` scopé à la bonne Partie, garde `firstRun`, et pour `ScenarioOneShotTab` une assertion DOM explicite confirmant la disparition du bouton « Ouvrir aux joueurs » après publication distante — symptôme concret ciblé par l'AC2).
- Task 4 : suite complète relancée (905/905 tests web), aucune régression. Aucune modification `apps/api`, `RealtimeService`, `ScenariosService` — conforme aux attentes de la story (câblage frontend pur, réutilisant l'infrastructure déjà posée aux Stories 18.2/19.1/19.2).

### File List

- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts` (modifié)

## Change Log

- 2026-07-23 : Implémentation complète de la Story 21.2 (Tasks 1-4) — câblage temps réel de `ScenarioDrafts` et `ScenarioOneShotTab` (connexion SSE propre par composant + réactivité à `ScenariosService.changed()`). 905/905 tests web passants, aucune régression.
- 2026-07-23 : Revue de code (3 couches adversariales) — 3 patches appliqués (`loadError` non réinitialisé après succès, `disconnect()` visant un `partieId` non capturé, test « autre Partie » sans flush), 4 items différés (voir `deferred-work.md`), 3 écartés. 2 nouveaux tests de régression ajoutés. Suite finale : 907/907 tests web. Statut passé à `done`.
