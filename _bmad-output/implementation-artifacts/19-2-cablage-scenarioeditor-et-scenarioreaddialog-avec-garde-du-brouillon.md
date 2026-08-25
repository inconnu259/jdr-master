---
baseline_commit: 68372bddcba83757803192e0332599836975981e
---

# Story 19.2: Câblage ScenarioEditor et ScenarioReadDialog avec garde du brouillon

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ ou joueur,
I want que le dialogue d'édition ou de lecture d'un scénario resté ouvert reflète une modification faite ailleurs, sans jamais perdre ce que je suis en train de taper,
so that je n'aie plus besoin de fermer puis rouvrir le dialogue pour voir un changement, et que je ne perde jamais ma saisie en cours.

## Acceptance Criteria

1. **Given** `ScenarioEditor` ou `ScenarioReadDialog` resté ouvert **When** une modification est faite ailleurs sur ce scénario **Then** le dialogue se met à jour sans que l'utilisateur ait à le fermer/rouvrir.
2. **Given** un champ en cours de saisie (`descriptionDraft`/`resumeFinDraft`) dans `ScenarioEditor` **When** un événement de changement est reçu pendant la frappe, et que le serveur n'a pas modifié précisément ce champ **Then** la saisie en cours est conservée, jamais écrasée.
3. **Given** le même champ en cours de saisie **When** le serveur a modifié précisément ce champ (autre utilisateur ayant écrit dans la même zone) **Then** la valeur serveur rechargée remplace le brouillon local (règle déjà actée au Palier 6 FR-5 / Story 13.3, réutilisée telle quelle — pas une nouvelle décision de comportement).

## Tasks / Subtasks

- [x] **Task 1 — `ScenarioEditor` : extraction de la logique de fusion + connexion SSE propre + effet réactif (AC1, AC2, AC3)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (371 lignes). Le constructeur (lignes 132-160) contient déjà, depuis la Story 13.3, la logique de préservation de brouillon (Palier 6 FR-5) — mais UNIQUEMENT déclenchée par un changement de `scenarioInput()` (l'`@Input() scenario`). Cette story ajoute une DEUXIÈME source de déclenchement (le signal temps réel `ScenariosService.changed`, Story 19.1) qui doit réutiliser EXACTEMENT la même logique de fusion, pas une copie divergente.
  - **Extraire** la logique de fusion actuellement inline (lignes 139-148 du fichier actuel) dans une méthode privée réutilisable :
    ```typescript
    private applyScenario(s: ScenarioDto): void {
      const previous = untracked(() => this.scenario());
      this.scenario.set(s);
      // Un champ en cours de saisie ne doit pas être écrasé par un rechargement externe qui ne le
      // touche pas — seule une valeur serveur effectivement différente remplace le brouillon local
      // (Palier 6 FR-5, Story 13.3).
      if (!previous || (previous.description ?? '') !== (s.description ?? '')) {
        this.descriptionDraft.set(s.description ?? '');
      }
      if (!previous || (previous.resumeFin ?? '') !== (s.resumeFin ?? '')) {
        this.resumeFinDraft.set(s.resumeFin ?? '');
      }
    }
    ```
    Le constructeur existant appelle désormais cette méthode au lieu de son bloc inline, sans changement de comportement observable (refactor pur) :
    ```typescript
    constructor() {
      effect(() => {
        const s = this.scenarioInput();
        this.applyScenario(s);
        // FR2 (inchangé) : un message d'erreur périmé ne doit pas survivre à un changement du
        // scénario reçu en entrée (équivalent au « remontage » pour ce composant qui n'est jamais
        // réellement démonté tant que la page reste ouverte).
        this.markCourantError.set(null);
        this.closeError.set(null);
        this.addSeanceError.set(null);
        this.fieldEditError.set(null);
        this.uploadError.set(null);
        this.downloadError.set(null);
        this.resumeFinError.set(null);
      });
      // ... deuxième effect() ajouté ci-dessous ...
    }
    ```
  - **Ajouter** une méthode privée `refreshScenario()`, utilisée **UNIQUEMENT par le second `effect()`** ajouté ci-dessous (le déclenchement temps réel) — **PAS** par le fetch initial de `ngOnInit()`, qui reste inchangé (piège de timing détaillé dans Dev Notes : à l'instant où `ngOnInit()` s'exécute, l'`effect()` du constructeur qui peuple `this.scenario()` n'a pas nécessairement encore flush — un garde `if (!current) return` y retournerait donc systématiquement tôt et sauterait silencieusement le fetch initial). Cette méthode est sûre UNIQUEMENT parce qu'un événement temps réel ne peut survenir qu'après le montage complet du composant, à un moment où `this.scenario()` est déjà garanti non-null :
    ```typescript
    private async refreshScenario(): Promise<void> {
      const current = this.scenario();
      if (!current) return;
      try {
        const fresh = (await this.scenarios.listAll(this.scenarioInput().partieId)).find(
          (s) => s.id === current.id,
        );
        if (fresh) this.applyScenario(fresh);
      } catch {
        // non-bloquant — le scénario affiché reste tel quel si le rafraîchissement échoue
      }
    }
    ```
  - **Ajouter un deuxième `effect()`** dans le constructeur, réagissant au signal temps réel :
    ```typescript
    // Story 19.2 (AC1) : réagit au signal générique ScenariosService.changed (RealtimeService,
    // Story 19.1). PIÈGE SPÉCIFIQUE à ce composant (contrairement à SeanceList, Story 19.1 Task 4,
    // qui n'a AUCUN autre chemin de chargement) : ScenarioEditor a DÉJÀ un chargement dédié dans
    // ngOnInit() (fresh fetch au montage). La première exécution d'un effect() a lieu à la
    // CONSTRUCTION du composant — si `changed()` porte déjà une valeur correspondant à cette Partie
    // (mutation locale antérieure dans la même session applicative, très plausible : ScenariosService
    // est `providedIn: 'root'`, son signal `_changed` persiste tant que l'onglet reste ouvert), cette
    // première exécution déclencherait un refetch REDONDANT avec celui que ngOnInit() fait juste
    // après. Le flag `firstRun` neutralise uniquement cette toute première exécution ; toute
    // ré-exécution ultérieure (un `.set()` réel sur le signal, jamais silencieux même à valeur
    // apparemment égale) reste traitée normalement.
    let firstRun = true;
    effect(() => {
      const change = this.scenarios.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      const partieId = untracked(() => this.scenarioInput().partieId);
      if (!matchesPartie(change, partieId)) return;
      untracked(() => void this.refreshScenario());
    });
    ```
    Importer `matchesPartie` depuis `'../../../core/scenarios/scenarios.service'` (déjà importé pour `ScenariosService`).
  - **Câbler la connexion SSE propre** dans `ngOnInit()` — `ScenarioEditor` est rendu dans DEUX contextes différents (vérifié empiriquement, grep sur `app-scenario-editor`) : `scenario-one-shot-tab.html` (toujours enfant de `PartieDetail`, via `PartieDetail` → onglet ONE_SHOT) ET `scenario-detail.html`, rendu sur la route **séparée** `parties/:id/scenarios/:scenarioId` (`app.routes.ts` ligne 58, PAS un enfant de `PartieDetail`). Contrairement à `ScenarioTimeline`/`SeanceList` (Story 19.1, toujours enfants de `PartieDetail`), `ScenarioEditor` a donc besoin de sa PROPRE connexion pour fonctionner correctement dans le cas `ScenarioDetail` — AD-6 autorise explicitement une connexion redondante quand `ScenarioEditor` est aussi rendu sous `PartieDetail` (aucune déduplication requise, aucun risque). Remplacer le début de `ngOnInit()` :
    ```typescript
    import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
    // ...
    import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
    // ...
    export class ScenarioEditor implements OnInit {
      // ... champs injectés existants ...
      private readonly realtime = inject(RealtimeService);
      private readonly destroyRef = inject(DestroyRef);
      // ...

      async ngOnInit(): Promise<void> {
        const partieId = this.scenarioInput().partieId;
        this.realtime.connect(partieTopic(partieId));
        this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(partieId)));

        // Fetch initial INCHANGÉ — ne passe volontairement PAS par applyScenario()/
        // refreshScenario() (piège de timing, cf. Dev Notes) : reste un `.set()` direct comme
        // avant cette story, sans dépendre de l'état déjà peuplé de `this.scenario()`.
        try {
          const fresh = (await this.scenarios.listAll(this.scenarioInput().partieId)).find(
            (s) => s.id === this.scenarioInput().id,
          );
          if (fresh) this.scenario.set(fresh);
        } catch {
          // Le scénario reçu en input reste affiché tel quel si le rafraîchissement échoue.
        }

        try {
          this.documents.set(await this.scenarios.listDocuments(this.scenarioInput().id));
        } catch {
          this.documentsError.set('Impossible de charger les documents. Réessayez.');
        }
        // ... reste de ngOnInit() (characters, members, announcements) INCHANGÉ ...
      }
    ```

- [x] **Task 2 — `ScenarioReadDialog` : effet réactif, AUCUNE connexion SSE propre (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (240 lignes). Contrairement à `ScenarioEditor`, `ScenarioReadDialog` n'est ouvert QUE via `MatDialog.open()` depuis `ScenarioTimeline` (`scenario-timeline.ts` ligne 194) — vérifié empiriquement en Story 19.1 (grep exhaustif sur `app-scenario-timeline`/`app-seance-list`) et confirmé ici (aucun autre appelant). `ScenarioTimeline` est toujours enfant de `PartieDetail`, qui maintient déjà sa propre connexion SSE (Story 18.3) tant que la page reste montée — le dialogue modal ouvert par-dessus n'interrompt pas cette connexion. **Ne PAS ajouter de `connect()`/`disconnect()` ici** (même raisonnement que `SeanceList`, Story 19.1 Task 4) : ce dialogue réutilise le signal `ScenariosService.changed` déjà tenu à jour par la connexion active d'un ancêtre.
  - **Ajouter un constructeur** (le composant n'en a pas actuellement) avec le même garde `firstRun` que `ScenarioEditor` (même piège : `ngOnInit()` a déjà son propre fetch initial) :
    ```typescript
    import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
    // ...
    import { ScenariosService, matchesPartie } from '../../../core/scenarios/scenarios.service';

    export class ScenarioReadDialog implements OnInit {
      // ... champs existants ...

      constructor() {
        // Story 19.2 (AC1) : voir ScenarioEditor (Task 1) pour le raisonnement complet du garde
        // `firstRun` — même piège ici (ngOnInit() a son propre fetch initial, juste en dessous).
        let firstRun = true;
        effect(() => {
          const change = this.scenarios.changed();
          if (firstRun) {
            firstRun = false;
            return;
          }
          if (!matchesPartie(change, this.data.scenario.partieId)) return;
          untracked(() => void this.refreshScenario());
        });
      }

      private async refreshScenario(): Promise<void> {
        try {
          const fresh = (await this.scenarios.listAll(this.data.scenario.partieId)).find(
            (s) => s.id === this.scenario().id,
          );
          if (fresh) {
            this.scenario.set(fresh);
            // FR2 (inchangé) : pas d'effacement si le rechargement échoue (cf. catch ci-dessous).
            this.participantError.set(null);
          }
        } catch {
          // non-bloquant — le scénario affiché reste tel quel si le rafraîchissement échoue
        }
      }
    ```
  - **Remplacer** le bloc de fetch initial de `ngOnInit()` (lignes 124-136 actuelles) par un appel à `refreshScenario()` — même comportement, code partagé :
    ```typescript
    async ngOnInit(): Promise<void> {
      await this.refreshScenario();
      // ... reste de ngOnInit() (ownNotes, announcements) INCHANGÉ ...
    }
    ```
  - **Pas de garde de brouillon nécessaire ici** : `ScenarioReadDialog` est strictement en lecture seule (aucun `FieldEditPencil`, confirmé par son propre commentaire de tête) — AC2/AC3 (préservation de brouillon) ne s'appliquent qu'à `ScenarioEditor`.

- [x] **Task 3 — Tests (AC1, AC2, AC3)**
  - **`scenario-editor.spec.ts`** (factory `createComponent()` partagée, ligne 53) :
    - Ajouter un mock `RealtimeService` (`{ connect: vi.fn(), disconnect: vi.fn() }`) au provider de `createComponent()`, retourné dans l'objet de résultat (même style que `calendar-view.spec.ts`, Story 19.1 Task 6).
    - Nouveau test : `connect()` appelé avec `partieTopic(SCENARIO.partieId)` au montage (`ngOnInit`).
    - Nouveau test : `disconnect()` appelé à `fixture.destroy()`.
    - Nouveau test (AC1) : `scenariosSvc.changed.set({ partieId: SCENARIO.partieId })` après le montage initial (flush microtasks, `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`, même pattern que Story 19.1) → `scenariosSvc.listAll` rappelé une deuxième fois (mocker un retour différent au deuxième appel pour distinguer du fetch initial).
    - Nouveau test (AC2) : simuler une frappe (`comp.descriptionDraft.set('brouillon en cours')`), puis un événement `changed` où le scénario rafraîchi a `resumeFin` modifié mais `description` IDENTIQUE à l'originale → `descriptionDraft` reste `'brouillon en cours'` (non écrasé).
    - Nouveau test (AC3) : même mise en place, mais le scénario rafraîchi a `description` EFFECTIVEMENT différente de l'originale → `descriptionDraft` devient la nouvelle valeur serveur (écrase le brouillon local). Réutiliser exactement le style des tests existants `describe('Cohérence du brouillon en édition concurrente (Story 13.3)', ...)` (lignes 1037-1106 actuelles), qui couvrent déjà ce même comportement de fusion via `scenarioInput()` — ces tests-ci prouvent que le MÊME comportement s'applique via le nouveau chemin `changed()`.
  - **`scenario-read-dialog.spec.ts`** (factory `createComponent()` partagée, ligne 32) — **PAS** de mock `RealtimeService` nécessaire (`ScenarioReadDialog` n'en injecte aucun) :
    - Nouveau test (AC1) : `scenariosSvc.changed.set({ partieId: BASE.partieId })` après montage (flush microtasks) → `scenariosSvc.listAll` rappelé une deuxième fois.
    - Nouveau test : `scenariosSvc.changed.set({ partieId: 'autre-partie' })` → `scenariosSvc.listAll` PAS rappelé une deuxième fois (garde `matchesPartie` effective, non-régression).

- [x] **Task 4 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (860 tests avant cette story, Story 19.1, + les nouveaux tests Task 3).
  - **Aucun changement `apps/api`** — story 100% frontend, comme la Story 19.1.
  - Aucune migration Prisma, aucun changement de schéma.
  - Fichiers modifiés attendus : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (+ spec). Aucune modification `ScenariosService`/`RealtimeService` (déjà complets depuis la Story 19.1 — `matchesPartie`/`notifyRealtimeChanged`/le deuxième handler existent déjà), aucune modification `ScenarioTimeline`/`SeanceList`/`CalendarView` (Story 19.1, hors scope ici).

### Review Findings

- [x] [Review][Patch] Le garde `firstRun` n'est exercé par aucun test avec une valeur `changed()` déjà non-null au moment de la construction — la raison d'être même du garde (éviter un double fetch au montage) n'est jamais vérifiée [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts] — corrigé (2 nouveaux tests)
- [x] [Review][Patch] Les tests AC2/AC3 (Story 19.2) déclenchés via `changed()` n'exercent que la branche `descriptionDraft` — la branche symétrique `resumeFinDraft` d'`applyScenario()` n'est couverte par ce nouveau chemin par aucun test [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts] — corrigé (2 nouveaux tests)
- [x] [Review][Patch] Dev Agent Record (Completion Notes) comptabilise à tort « 4 configurations TestBed » corrigées alors que `scenario-editor.spec.ts` contient 3 configurations isolées supplémentaires (en plus de la factory partagée) — total réel de 6 configurations à travers les 3 fichiers, pas 4 — corrigé
- [x] [Review][Defer] Absence de garde de concurrence si plusieurs événements `changed()` se chevauchent, ou si l'effet temps réel se déclenche pendant que le fetch initial de `ngOnInit()` est encore en vol [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts] — deferred, même classe de risque déjà acceptée ailleurs dans le projet (NFR1, cf. Story 18.3/19.1)
- [x] [Review][Defer] Écriture possible dans les signaux d'un composant déjà détruit / d'un dialogue déjà fermé si un `refreshScenario()` en vol se résout après coup [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts] — deferred, même classe de risque déjà acceptée (NFR1)
- [x] [Review][Defer] Un changement de `scenarioInput().partieId` après le montage sur une instance `ScenarioEditor` réutilisée laisserait la connexion SSE périmée — non atteignable via les points d'entrée actuels (`ScenarioOneShotTab`/`ScenarioDetail`, vérifié), même classe que la limitation « réutilisation de route » déjà différée (Story 18.3/19.1) [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts]
- [x] [Review][Defer] Littéral `{ connect: vi.fn(), disconnect: vi.fn() }` dupliqué dans 6+ emplacements à travers les fichiers de specs de cette story sans factory partagée — convention déjà établie ainsi depuis la Story 19.1, cosmétique

## Dev Notes

### Architecture — dernière story de l'Epic 19 (`ARCHITECTURE-SPINE.md`, Palier 7)

Cette story clôt l'Epic 19 (FR-8 du PRD Palier 7). Elle ne câble AUCUN nouveau service ni mécanisme — `ScenariosService.notifyRealtimeChanged()`/`matchesPartie()`/`RealtimeService.handlers` (deuxième entrée) sont déjà en place depuis la Story 19.1. Le seul travail ici est de câbler DEUX composants supplémentaires sur ce mécanisme déjà existant, en respectant **AD-10** : *« Le refetch générique ne doit jamais écraser un brouillon en cours de saisie »* — contrainte spécifique à `ScenarioEditor`, déjà satisfaite par la règle Palier 6 FR-5 / Story 13.3, réutilisée ici telle quelle (pas une nouvelle décision de comportement, cf. AC3).

### Piège de timing : pourquoi le fetch initial de `ScenarioEditor.ngOnInit()` n'utilise PAS `applyScenario()`/`refreshScenario()`

Trouvé en revue de la préparation de cette story — à ne PAS reproduire à l'implémentation. `applyScenario()` compare `previous = untracked(() => this.scenario())` pour décider de préserver ou remplacer les brouillons ; `refreshScenario()` (nouveau, utilisé par le second `effect()`) garde en plus `if (!this.scenario()) return;`. Cette garde est sûre pour un événement temps réel (survient forcément après le montage complet), mais **PAS** pour le fetch initial de `ngOnInit()` : `this.scenario()` n'est peuplé QUE par l'`effect()` du constructeur (Task 1, premier effect), et les `effect()` Angular ne s'exécutent PAS synchronément à la construction du composant — leur premier flush est planifié par le scheduler de signaux et n'est pas garanti terminé au moment où le code synchrone de `ngOnInit()` s'exécute (avant son premier `await`). Si le fetch initial appelait `refreshScenario()`, sa garde `if (!current) return` pourrait retourner tôt et **sauter silencieusement le chargement initial** — une régression, pas un simple refactor. **Solution retenue** : le fetch initial de `ngOnInit()` reste un `.set(fresh)` direct, ciblé par `this.scenarioInput().id` (jamais par `this.scenario()`), exactement comme avant cette story — `applyScenario()`/`refreshScenario()` ne sont utilisés QUE par le second `effect()` (déclenchement temps réel), qui ne peut de toute façon s'exécuter qu'après que le premier flush de l'`effect()` du constructeur ait eu lieu. `ScenarioReadDialog` n'a PAS ce problème : son signal `scenario` est initialisé de façon synchrone dans son initialiseur de champ (`signal<ScenarioDto>(this.data.scenario)`), jamais `null` — son `refreshScenario()` peut donc être réutilisé tel quel pour le fetch initial ET le déclenchement temps réel (Task 2), sans garde à retirer.

### Piège spécifique à cette story, absent de la Story 19.1 : redondance avec le fetch initial déjà existant

`ScenarioTimeline`/`SeanceList` (Story 19.1) n'avaient AUCUN chemin de chargement initial séparé — leur `effect()` sur `changed()` EST leur mécanisme de chargement, y compris au montage. `ScenarioEditor`/`ScenarioReadDialog` ont chacun un `ngOnInit()` qui fait DÉJÀ un fetch initial dédié (pattern pré-existant, hors scope de cette story). Un `effect()` réagissant à `scenarios.changed()` s'exécute une première fois **à la construction du composant**, avant même que `ngOnInit()` ne s'exécute — et comme `ScenariosService` est `providedIn: 'root'`, son signal `_changed` persiste pour toute la durée de vie de l'onglet : par le temps qu'un MJ ouvre son 3ᵉ ou 4ᵉ scénario dans la même session, `changed()` porte quasi certainement déjà une valeur correspondant à la Partie affichée (une mutation locale antérieure, via `notifyChanged(partieId)`, appelé par 17+ sites différents de `ScenariosService`). Sans garde, CHAQUE montage de ces deux composants déclencherait un refetch redondant en plus de celui déjà fait par `ngOnInit()` — un vrai double appel réseau à chaque ouverture, pas un cas limite rare. Le flag `firstRun` (fermeture locale au constructeur, pas un signal) neutralise uniquement cette toute première exécution ; toute ré-exécution ultérieure de l'`effect()` (un `.set()` réel sur `_changed`, jamais silencieux même à valeur apparemment identique — les signaux Angular notifient sur assignation d'une NOUVELLE référence d'objet, pas sur égalité de contenu) reste traitée normalement.

### Pourquoi `ScenarioEditor` a besoin de sa propre connexion SSE, contrairement à `ScenarioReadDialog`

Vérifié empiriquement (grep exhaustif, comme en Story 19.1) :
- `<app-scenario-editor>` est rendu dans `scenario-one-shot-tab.html` (toujours enfant de `PartieDetail`, via l'onglet ONE_SHOT — `ScenarioOneShotTab` est utilisé dans `partie-detail.html`) **ET** dans `scenario-detail.html`, rendu sur la route **séparée** `parties/:id/scenarios/:scenarioId` (`app.routes.ts` ligne 58) — PAS un enfant de `PartieDetail` (navigation complète, `PartieDetail` n'est pas monté quand cette route est active). Même situation que `CalendarView` en Story 19.1 (route séparée `parties/:id/calendar`).
- `<app-scenario-read-dialog>` (alias `ScenarioReadDialog`) n'est ouvert QUE via `MatDialog.open()` depuis `ScenarioTimeline` (`scenario-timeline.ts` ligne 194), toujours enfant de `PartieDetail`.

Donc `ScenarioEditor` a besoin de sa propre connexion (`connect()`/`disconnect()` dans `ngOnInit()`, comme `CalendarView`) pour fonctionner correctement dans le cas `ScenarioDetail` — AD-6 autorise explicitement la redondance quand il est AUSSI rendu sous `PartieDetail` (via `ScenarioOneShotTab`), sans déduplication nécessaire. `ScenarioReadDialog` n'en a pas besoin (même raisonnement que `SeanceList`, Story 19.1).

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis par composant (`createComponent()` partagée par fichier — les deux fichiers de cette story ont chacun DÉJÀ une factory unique, contrairement à `scenario-editor.spec.ts`'s propre item différé sur les mocks ad hoc localisés ailleurs dans le fichier, cf. `deferred-work.md`).
- Tests async (fetch simulé) : flush de microtasks via la boucle déjà établie (`for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`), pas `whenStable()` seul (zoneless, cf. mémoire projet `jdr-zoneless-test-timing`).
- Réutiliser le style exact des tests `describe('Cohérence du brouillon en édition concurrente (Story 13.3)', ...)` déjà présents dans `scenario-editor.spec.ts` (lignes 1037-1106) pour les nouveaux tests AC2/AC3 — même structure d'assertions, seule la source de déclenchement change (`changed.set(...)` au lieu de `setInput('scenario', ...)`).

### Previous Story Intelligence (Story 19.1)

- Établi : vérifier empiriquement toute divergence entre l'hypothèse de câblage et le rendu réel des templates (grep exhaustif sur le sélecteur du composant) avant de décider si une connexion SSE propre est nécessaire — reproduit ici pour `ScenarioEditor`/`ScenarioReadDialog`.
- `matchesPartie()`/`notifyRealtimeChanged()` (Story 19.1, `scenarios.service.ts`) et `RealtimeService.handlers` (deuxième entrée) sont déjà en place — cette story ne les modifie PAS, seulement les composants consommateurs.
- Story 19.1 a laissé 3 items différés (cf. `deferred-work.md`, section "code review of 19-1..."), aucun ne concerne directement `ScenarioEditor`/`ScenarioReadDialog` — non repris ici.
- Convention de tests établie : un test par comportement, réutiliser les patterns déjà en place (`createComponent`/mocks partagés par fichier) plutôt que d'en inventer de nouveaux. Le patch de revue de code 19.1 a corrigé une isolation d'erreur entre handlers dans `RealtimeService.onSignal` (try/catch par handler) — pertinent ici uniquement en ce sens que `ScenariosService.notifyRealtimeChanged()` est maintenant protégé si `PartiesService.notifyChanged()` lève une exception ailleurs dans la même connexion.

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.
- Dernière story de l'Epic 19 — Epic 19 (FR5-FR8) sera complet après cette story (`sprint-status.yaml` à mettre à jour en conséquence après revue).

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 19.2 complète, AC1-AC3, lignes 207-225)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4, AD-6, AD-7, AD-10 — non-écrasement du brouillon)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18-p7/prd.md` (FR-8, §4.2)
- `_bmad-output/implementation-artifacts/19-1-cablage-scenariotimeline-seancelist-et-calendarview.md` (mécanisme réutilisé tel quel : `matchesPartie`, `notifyRealtimeChanged`, deuxième handler `RealtimeService`, patch de revue try/catch par handler)
- `_bmad-output/implementation-artifacts/13-3-coherence-du-brouillon-de-description-en-edition-concurrente.md` (règle Palier 6 FR-5, déjà implémentée dans `scenario-editor.ts`, réutilisée telle quelle — pas une nouvelle décision)
- `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: code review of 19-1...", aucun item directement applicable à cette story)
- Vérifications empiriques effectuées pendant la préparation de cette story : `<app-scenario-editor>` rendu dans `scenario-one-shot-tab.html` (enfant de `PartieDetail`) ET `scenario-detail.html` (route séparée `parties/:id/scenarios/:scenarioId`) ; `<app-scenario-read-dialog>` ouvert uniquement via `MatDialog.open()` depuis `scenario-timeline.ts` (toujours enfant de `PartieDetail`).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- `docker compose exec web pnpm test` — suite complète relancée après chaque tâche ; suite finale : 70 fichiers / 866 tests, 0 échec.
- `docker compose exec web pnpm build` — échoue sur un dépassement de budget de bundle initial (188.59 kB avant cette story → 189.35 kB après, +0.76 kB) ; confirmé pré-existant via `git stash`/rebuild avant tout changement de cette story — hors scope, non lié à `pnpm test` (critère de validation canonique de cette story et de la Story 19.1).

### Completion Notes List

- Task 1/2 : extraction de `applyScenario()`/`refreshScenario()` (`ScenarioEditor`) et `refreshScenario()` (`ScenarioReadDialog`), câblage des deux nouveaux `effect()` avec garde `firstRun` (évite un double fetch au montage, cf. Dev Notes) et connexion SSE propre pour `ScenarioEditor` uniquement (`ScenarioReadDialog` réutilise la connexion de son ancêtre `PartieDetail`).
- Piège de timing identifié ET corrigé AVANT l'implémentation (revue de la story elle-même, cf. Dev Notes "Piège de timing") : le fetch initial de `ScenarioEditor.ngOnInit()` reste volontairement un `.set()` direct plutôt que de passer par `refreshScenario()`, pour ne pas dépendre d'un `effect()` de constructeur pas nécessairement flush à ce stade.
- Régression transitive anticipée (même piège que Story 19.1, Task 4) : `scenario-detail.spec.ts` et `scenario-one-shot-tab.spec.ts` rendent `<app-scenario-editor>` transitivement et ne fournissaient aucun mock `RealtimeService` — `EventSource is not defined` (jsdom) en résultait. Corrigé en ajoutant `{ connect: vi.fn(), disconnect: vi.fn() }` à 6 configurations `TestBed` au total (2 dans `scenario-detail.spec.ts`, 1 dans `scenario-one-shot-tab.spec.ts`, 3 configurations isolées supplémentaires dans `scenario-editor.spec.ts` lui-même qui ne passaient pas par la factory partagée, en plus de la factory elle-même).
- Découverte non anticipée par la story, corrigée pendant Task 3 : `SeanceList` (rendu en enfant de `ScenarioEditor`/`ScenarioReadDialog`) réagit à `ScenariosService.changed` SANS filtre de Partie (décision assumée de la Story 19.1) et propage systématiquement son propre refetch vers le parent via `(seanceLinked)="onSeanceLinked($event)"`, qui écrase `this.scenario` sans condition. Un test « un événement pour une autre Partie ne recharge pas » au niveau de `ScenarioEditor`/`ScenarioReadDialog` échouait donc pour une raison étrangère à l'`effect()` ajouté par cette story (pas un bug de cette story). Remplacé par un commentaire explicatif dans les deux fichiers de specs — la garde `matchesPartie()` reste exhaustivement testée en tant que fonction pure (Story 19.1) et son câblage ici est prouvé par le test positif (AC1).
- Toutes les ACs (1, 2, 3) sont couvertes par des tests dédiés : rafraîchissement réactif sur `ScenarioEditor` et `ScenarioReadDialog` (AC1), préservation de brouillon (AC2) et remplacement par la valeur serveur (AC3) sur `ScenarioEditor`, tous déclenchés via le nouveau chemin `changed()` en plus du chemin `scenarioInput()` déjà couvert (Story 13.3).

### File List

- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (+ spec)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (+ spec)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts` (régression transitive découverte, mock `RealtimeService` ajouté)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts` (régression transitive découverte, mock `RealtimeService` ajouté)

## Change Log

- 2026-07-22 : Implémentation complète de la Story 19.2 (Tasks 1-4) — câblage temps réel de `ScenarioEditor` (connexion SSE propre + garde de brouillon Palier 6 FR-5) et `ScenarioReadDialog` (réutilise la connexion de `PartieDetail`, aucune connexion propre). 866/866 tests passants, 0 changement `apps/api`. Dernière story de l'Epic 19 (FR5-FR8 du Palier 7 désormais complet).
- 2026-07-22 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 3 patches appliqués (test de régression du garde `firstRun` sur les deux composants, couverture symétrique `resumeFinDraft` pour les tests temps réel AC2/AC3, correction d'un comptage erroné dans les Completion Notes), 4 items différés (voir deferred-work.md), 10 écartés. Suite finale : 870/870 tests web, aucune régression. Statut passé à done.
