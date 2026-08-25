---
baseline_commit: b47b47f34d8ebdb58f1efa5c3b4a845c92a2c21b
---

# Story 19.1: Câblage ScenarioTimeline, SeanceList et CalendarView

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que la chronologie des scénarios, la liste des séances et le calendrier de disponibilités reflètent les changements faits par un autre membre,
so that je n'aie jamais besoin de recharger la page pour voir une inscription, un vote, ou un nouveau scénario.

## Acceptance Criteria

1. **Given** `ScenarioTimeline` affiché sur une Partie **When** un scénario est ajouté, modifié ou clôturé par un autre membre **Then** il apparaît/se met à jour dans la timeline sans rechargement de page (en complément de la réactivité déjà existante au changement de `partieId`, Palier 6 FR-3).
2. **Given** `SeanceList` affiché **When** une inscription, désinscription ou modification de séance est faite par un autre membre **Then** elle est reflétée sans rechargement de page.
3. **Given** `CalendarView` affiché **When** un autre joueur vote ou le MJ ouvre un nouveau sondage **Then** le changement est visible sans rechargement de page.

## Tasks / Subtasks

- [x] **Task 1 — Résolution de la collision de nom sur `ScenariosService` (AC1, AC2, AC3)**
  - **Rappel du piège identifié dès la Story 18.2** (Dev Notes) : `ScenariosService` (frontend, `apps/web/src/app/core/scenarios/scenarios.service.ts`) a déjà, depuis la Story 17.3, un `_changed`/`changed`/**`notifyChanged(partieId: string): void`** — **privé**, appelé après CHACUNE des 17 mutations locales du service. Le contrat public AD-4 attendu par `RealtimeService` (Story 18.2/18.3) est **zéro-argument** (`notifyChanged(): void`) — signature incompatible.
  - **Résolution retenue** (pas un renommage des 17 sites existants — trop invasif, aucun bénéfice) : ajouter une méthode PUBLIQUE à **nom différent**. `RealtimeService.TopicHandler.notifyChanged` est juste le nom du CHAMP de l'interface (une fermeture) — rien n'exige que la méthode qu'elle appelle sur le service de domaine porte littéralement ce même nom.
  - **Problème additionnel découvert** : l'effet de `ScenarioTimeline` (Story 17.3, AC1) filtre déjà `changed()` par `partieId` exact (`change.partieId !== partieId`) pour ignorer les mutations locales concernant une AUTRE Partie. Un événement SSE générique (Story 18.x) n'a — et ne doit pas avoir, cf. AD-4 zéro-argument — de `partieId` précis à fournir. **Résolution** : un sentinel « wildcard » explicite, reconnu par un helper pur exporté (testable isolément, même convention que `matchingHandlers`, Story 18.2).
  - Fichier `apps/web/src/app/core/scenarios/scenarios.service.ts` — ajouter (ne RIEN modifier d'autre, les 17 sites `notifyChanged(partieId)` existants restent inchangés) :
    ```typescript
    // Sentinel reconnu par matchesPartie() — un événement temps réel générique (Story 19.1) n'a
    // jamais de partieId précis à fournir (contrat AD-4, notifyChanged(): void, zéro argument).
    const REALTIME_WILDCARD = '*';

    /** Vrai si `change` concerne exactement `partieId`, OU provient d'un événement temps réel
     *  générique (wildcard). Fonction pure, testable isolément — même convention que
     *  `matchingHandlers` (Story 18.2). */
    export function matchesPartie(
      change: { partieId: string } | null,
      partieId: string,
    ): boolean {
      return change !== null && (change.partieId === REALTIME_WILDCARD || change.partieId === partieId);
    }

    // dans la classe ScenariosService, à côté de notifyChanged(partieId) existant (INCHANGÉ) :
    /** Contrat public AD-4 (zéro argument), appelé par RealtimeService sur un événement SSE
     *  partie:{id} — nom délibérément différent de notifyChanged(partieId), privé et
     *  incompatible en signature (Story 17.3), pour ne toucher aucun de ses 17 appelants. */
    notifyRealtimeChanged(): void {
      this._changed.set({ partieId: REALTIME_WILDCARD });
    }
    ```

- [x] **Task 2 — `RealtimeService` : deuxième entrée dans `handlers` (AC1, AC2, AC3)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (Story 18.2/18.3) — injecter `ScenariosService` (à côté de `PartiesService`, même style `inject()` au niveau champ) et ajouter une **deuxième** entrée au **même préfixe** `'partie:'` (plusieurs handlers peuvent partager un préfixe — `matchingHandlers` les appelle tous, c'est le mécanisme voulu) :
    ```typescript
    private readonly parties = inject(PartiesService);
    private readonly scenarios = inject(ScenariosService);

    private readonly handlers: TopicHandler[] = [
      { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
    ];
    ```
  - Aucune circularité : `PartiesService`/`ScenariosService` n'importent ni l'un ni l'autre ni `RealtimeService`.
  - **Aucun changement backend** — `ScenariosService`/`PollService` (`apps/api`) émettent déjà sur `partieTopic(partieId)` pour TOUTES les mutations pertinentes à cette story (`createSeancePoll`, `inscrire`, `desinscrire`, `setSeanceCapacity`, `resetSeanceDate`, `deleteSeance`, `open`, `markCourant`, `close`, etc. — Story 18.1 Task 3 ; `PollService.castVote`/`choose`/`close`/`create` — Story 18.1 Task 4). **Vérifié empiriquement** (contrairement à la lacune trouvée en Story 18.3 pour `PartiesService.update()`) : aucun angle mort backend pour cette story.

- [x] **Task 3 — `ScenarioTimeline` : accepte le wildcard dans son filtre existant (AC1)**
  - Fichier `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` — lire intégralement le constructeur (lignes ~111-137 actuelles) avant modification. Le filtre existant (Story 17.3, AC1) :
    ```typescript
    if (!partieIdChanged && change !== null && change.partieId !== partieId) {
      return;
    }
    ```
    devient, en réutilisant `matchesPartie()` (Task 1) :
    ```typescript
    if (!partieIdChanged && change !== null && !matchesPartie(change, partieId)) {
      return;
    }
    ```
    Importer `matchesPartie` depuis `'../../../core/scenarios/scenarios.service'` (même fichier que `ScenariosService`, déjà importé). **Ne rien changer d'autre à cet `effect()`** — la logique `partieIdChanged`/`lastPartieId` (réactivité au changement d'`@Input partieId`) reste inchangée, hors scope de cette story.
  - **Pourquoi `ScenarioTimeline` n'a PAS besoin de son propre `RealtimeService.connect()`/`disconnect()`** : vérifié — `<app-scenario-timeline>` n'est rendu que dans `apps/web/src/app/features/parties/partie-detail/partie-detail.html`, jamais ailleurs. `PartieDetail` gère déjà sa propre connexion SSE sur `partieTopic(id)` depuis la Story 18.3 (même Partie, ouverte tant que la page reste montée) — `ScenarioTimeline`, toujours un enfant de `PartieDetail`, bénéficie de cette connexion déjà active sans en ouvrir une seconde. Ne PAS ajouter de `connect()`/`disconnect()` ici — ce serait une connexion redondante (AD-6 autorise plusieurs connexions simultanées sur le même topic, mais rien ne le justifie ici).

- [x] **Task 4 — `SeanceList` : nouvel `effect()` sur `ScenariosService.changed` (AC2)**
  - Fichier `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` — **aucun `effect()` n'existe actuellement dans ce composant** (vérifié, import list actuelle : `Component, computed, inject, input, output, signal`, sans `effect`/`untracked`). Ajouter à l'import Angular, injecter rien de nouveau (`ScenariosService` déjà injecté, `readonly scenarios = inject(ScenariosService)` existant), et ajouter dans un **nouveau constructeur** (le composant n'en a pas actuellement) :
    ```typescript
    import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
    // ...
    export class SeanceList {
      private readonly scenarios = inject(ScenariosService); // déjà existant, inchangé
      // ...

      constructor() {
        // Story 19.1 (AC2) : réutilise le signal ScenariosService.changed déjà actif — SeanceList
        // n'ouvre AUCUNE connexion SSE propre, son parent (ScenarioEditor/ScenarioReadDialog,
        // toujours ouvert depuis ScenarioTimeline lui-même enfant de PartieDetail, Story 18.3)
        // maintient déjà la connexion partie:{id}. Réutilise refreshScenario() existante — pas de
        // nouvelle méthode.
        effect(() => {
          this.scenarios.changed();
          untracked(() => void this.refreshScenario());
        });
      }
    ```
  - **Pas de filtrage par `matchesPartie()` nécessaire ici** : `refreshScenario()` (méthode privée existante, lignes ~247-258 actuelles) appelle déjà `this.scenarios.listAll(this.partieId())` — scopé par la Partie de CE composant ; un déclenchement pour une autre Partie (cas non observé en pratique, cf. Dev Notes Story 18.2/18.3 sur l'hypothèse « une seule Partie active à la fois ») ne produirait qu'un refetch superflu inoffensif, pas un comportement incorrect.

- [x] **Task 5 — `CalendarView` : connexion SSE propre + `effect()` (AC3)**
  - Fichier `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — **contrairement à `ScenarioTimeline`/`SeanceList`**, `CalendarView` est monté sur une route **séparée** (`parties/:id/calendar` ou `parties/:id/guild-calendar`, `apps/web/src/app/app.routes.ts`) — quand elle est affichée, `PartieDetail` n'est PAS monté (navigation vers une autre route). `CalendarView` doit donc gérer sa propre connexion, comme `PartieDetail` l'a fait en Story 18.3.
  - Ajouter les imports `DestroyRef`, `effect`, `untracked` (`@angular/core`) et `RealtimeService`, `partieTopic`, `matchesPartie` :
    ```typescript
    import { Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, effect, inject, input, signal, untracked } from '@angular/core';
    import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
    import { matchesPartie } from '../../../core/scenarios/scenarios.service';
    // ...
    export class CalendarView implements OnInit {
      // ... champs injectés existants
      private readonly realtime = inject(RealtimeService);
      private readonly destroyRef = inject(DestroyRef);
      // ...
    ```
  - Dans `ngOnInit()` (lignes ~172-209 actuelles), à l'intérieur du `if (id) { this.partieId.set(id); ... }` déjà présent, **après** l'assignation `this.partieId.set(id)` (avant ou après les `await` existants, peu importe — la connexion peut s'ouvrir en parallèle du chargement initial) :
    ```typescript
    if (id) {
      this.partieId.set(id);
      this.realtime.connect(partieTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(id)));
      // ... Promise.all([...]) existant, inchangé
    }
    ```
  - Nouveau `constructor()` (le composant n'en a pas actuellement — tout est dans `ngOnInit`) avec l'`effect()` de rafraîchissement :
    ```typescript
    constructor() {
      // Story 19.1 (AC3) : un vote/une clôture/l'ouverture d'un nouveau sondage émettent déjà sur
      // partie:{id} (Story 18.1, PollService/ScenariosService backend) — recharge à la fois les
      // scénarios/séances (ScenariosService, pour activePolls/eligibleSeances) ET les créneaux
      // calculés/heatmap (PollService, non concerné par ScenariosService.changed mais recalculés
      // par la même mutation sous-jacente) : réutilise loadScenarios()/refreshMjPanels() existantes.
      effect(() => {
        const change = this.scenariosSvc.changed();
        const id = this.partieId();
        if (!id || !matchesPartie(change, id)) return;
        untracked(() => {
          void this.loadScenarios(id);
          void this.refreshMjPanels();
        });
      });
    }
    ```
    **Pourquoi `refreshMjPanels()` (nom historique, malgré ce qu'il suggère) et pas une nouvelle méthode** : déjà appelée par `onPanelSaved()`/`onPanelDeleted()` (lignes ~327-339 actuelles) SANS restriction de mode — recharge `availableSlots`/`heatmap` pour la vue courante quel que soit `mode()`. Réutilisée telle quelle, aucune nouvelle méthode de chargement introduite.
    **Pourquoi `matchesPartie(change, id)` avec garde `!id`** : contrairement à `SeanceList`, `CalendarView.partieId` est un `signal<string | null>` pouvant être `null` avant résolution de la route — la garde évite un appel prématuré. `id` est TOUJOURS non-null au moment où `changed()` peut légitimement se déclencher (la connexion SSE n'est ouverte qu'après `this.partieId.set(id)`), mais la garde reste nécessaire pour le premier passage de l'`effect()` (avant `ngOnInit`).
  - **Limitation déjà différée (Story 18.3)** : `id` est lu une seule fois via `route.snapshot`, jamais réactivement — même limitation de réutilisation de route déjà documentée et différée pour `PartieDetail` (`deferred-work.md`, "Deferred from: code review of 18-3..."), non traitée à nouveau ici, aucun parcours de navigation actuel ne la déclenche pour cette route non plus (`parties/:id/calendar` n'a pas de lien direct vers `parties/:id-autre/calendar`).

- [x] **Task 6 — Tests (AC1, AC2, AC3)**
  - **`scenarios.service.spec.ts`** (frontend, `apps/web/src/app/core/scenarios/`) :
    - `notifyRealtimeChanged()` → `changed()` devient `{ partieId: '*' }` (le sentinel — asserter la valeur littérale, ou exposer sa valeur via un export si le test en a besoin ; sinon asserter uniquement via `matchesPartie`).
    - `matchesPartie(null, 'p1')` → `false`.
    - `matchesPartie({ partieId: 'p1' }, 'p1')` → `true`.
    - `matchesPartie({ partieId: 'p2' }, 'p1')` → `false`.
    - `matchesPartie({ partieId: '*' }, 'p1')` (ou en appelant `notifyRealtimeChanged()` puis en lisant `changed()`) → `true`, quel que soit `partieId`.
  - **`realtime.service.spec.ts`** (Story 18.2/18.3) : ajouter un mock `ScenariosService` (`{ notifyRealtimeChanged: vi.fn(), changed: signal(...) }`) au `beforeEach`/`TestBed.configureTestingModule`, à côté du mock `PartiesService` déjà présent. Nouveau test : `'open'`/`'message'` sur un topic `partie:` déclenche **aussi** `scenariosSvc.notifyRealtimeChanged` (pas seulement `partiesSvc.notifyChanged`, déjà testé) — les DEUX handlers du même préfixe sont appelés.
  - **`scenario-timeline.spec.ts`** — nouveau test : `scenariosSvc.changed.set({ partieId: '*' })` (même pattern que le test existant ligne ~383, « une mutation notifiée par `ScenariosService.changed()` recharge bien les données ») → `listAll` rappelé, **y compris pour une Partie différente de `partieId()` du composant** (contrairement au test « Story 17.3 AC1 » existant ligne ~397, qui reste inchangé et continue de vérifier qu'un `partieId` EXACT différent ne recharge PAS).
  - **`seance-list.spec.ts`** — nouveau test : `scenariosSvc.changed` doit exister dans le mock (`signal<{ partieId: string } | null>(null)`, ajouté au `createComponent()` partagé) ; déclencher `.set({ partieId: '*' })` (ou `{ partieId: 'p1' }`) → `scenariosSvc.listAll` rappelé.
  - **`calendar-view.spec.ts`** — ajouter `{ provide: RealtimeService, useValue: { connect: vi.fn(), disconnect: vi.fn() } }` au `createCalendarView()` partagé (mock direct, PAS de stub `EventSource` global nécessaire ici — un seul point de création partagé dans ce fichier, contrairement à `partie-detail.spec.ts`, Story 18.3) ; ajouter `changed: signal<{ partieId: string } | null>(null)` à `makeScenariosService()`. Nouveaux tests :
    - `connect()` appelé avec `partieTopic(opts.partieId)` au montage (si `id` résolu).
    - `disconnect()` appelé au `ngOnDestroy` (`fixture.destroy()`).
    - `scenariosSvc.changed.set({ partieId: '*' })` → `scenariosSvc.listAll` ET `pollSvc.getAvailableSlots`/`getHeatmap` rappelés (`refreshMjPanels`).

- [x] **Task 7 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (849 tests avant cette story, + les nouveaux tests Task 6).
  - **Aucun changement `apps/api`** — story 100% frontend (Task 2 confirme empiriquement l'absence de lacune backend).
  - Aucune migration Prisma, aucun changement de schéma.
  - `git status`/diff en fin de story : `apps/web/src/app/core/scenarios/scenarios.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (+ spec), `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (+ spec), `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (+ spec). **Aucune modification** `apps/web/src/app/core/parties/parties.service.ts`/`partie-detail.ts` (déjà câblés, Story 18.3), `ScenarioEditor`/`ScenarioReadDialog` (câblage + garde de brouillon = Story 19.2).

### Review Findings

- [x] [Review][Patch] `RealtimeService.connect().onSignal` n'isole pas les handlers : si `parties.notifyChanged()` lève, `scenarios.notifyRealtimeChanged()` (même préfixe `'partie:'`) n'est jamais appelé pour cet événement [apps/web/src/app/core/realtime/realtime.service.ts:59-61] — corrigé (try/catch par handler)
- [x] [Review][Defer] Course entre le nouvel `effect()` de `SeanceList` (déclenché par tout `changed()`) et les appels existants `onChoose`/`onClosePoll` à `refreshScenario()` — deux appels concurrents peuvent résoudre dans le désordre [apps/web/src/app/features/scenarios/seance-list/seance-list.ts:60-63] — deferred, même classe de risque déjà acceptée ailleurs dans le projet (NFR1, cf. Story 18.3)
- [x] [Review][Defer] Pattern de test `for (let i=0;i<10;i++) await Promise.resolve()` dupliqué dans 4+ fichiers de specs de cette story au lieu d'un helper partagé — deferred, convention pré-existante du projet, pas introduite par cette story
- [x] [Review][Defer] Mocks `ScenariosService` dans `scenario-editor.spec.ts` patchés ad hoc à 5 emplacements avec des jeux de méthodes légèrement incohérents (pas de factory partagée) [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts] — deferred, hygiène de test mineure, aucun risque fonctionnel

## Dev Notes

### Architecture — première story de l'Epic 19 (`ARCHITECTURE-SPINE.md`, Palier 7)

Epic 18 (Stories 18.1-18.3) a livré le mécanisme générique ET son premier câblage (`PartieDetail`). Cette story câble le DEUXIÈME domaine de service (`ScenariosService`) dans `RealtimeService.handlers`, et prouve que le mécanisme supporte bien PLUSIEURS entrées sous le même préfixe de topic.

**AD-4 (contrat `notifyChanged()`)** : *"Le seul invariant transverse est le contrat public : chaque service concerné expose `notifyChanged(): void`, jamais son mécanisme interne."* — cette story illustre exactement le cas anticipé par l'AD elle-même (§ case 1) : *"ScenariosService a déjà `_changed`... `notifyChanged()` fait `this._changed.update(...)`."* L'AD ne prescrit pas littéralement le NOM de la méthode interne du service — seul le contrat exposé à `RealtimeService` (via `TopicHandler.notifyChanged`, une fermeture) doit être zéro-argument.

**AD-3 (composant ne choisit jamais les services notifiés)** : confirme que `ScenarioTimeline`/`SeanceList` n'ont pas à gérer leur propre `connect()`/`disconnect()` — ils réagissent au signal `ScenariosService.changed`, déjà mis à jour par la connexion active d'un ANCÊTRE (`PartieDetail`), exactement comme `RealtimeService` orchestre déjà la notification sans jamais laisser le composant choisir.

### Pourquoi `ScenarioTimeline`/`SeanceList` n'ouvrent AUCUNE connexion SSE propre (découverte structurelle)

Vérifié empiriquement : `grep` sur `app-scenario-timeline` → seul `partie-detail.html` le rend. `grep` sur `app-seance-list` → seuls `scenario-editor.html`/`scenario-read-dialog.html` le rendent, tous deux ouverts en `MatDialog` **depuis** `ScenarioTimeline` (donc depuis `PartieDetail`). La connexion SSE ouverte par `PartieDetail` (Story 18.3) reste active tant que la page reste montée — dialogue ouvert par-dessus ou pas. `CalendarView`, seule à être montée sur une **route distincte** (`app.routes.ts`), est la seule des trois cibles de cette story à nécessiter sa propre connexion (Task 5).

### Pourquoi le sentinel wildcard, pas un passage de topic/partieId à travers l'interface `TopicHandler`

Alternative envisagée et écartée : élargir `TopicHandler.notifyChanged(): void` en `notifyChanged(topic: string): void` (techniquement non cassant en TS — une fonction zéro-argument reste assignable à un type de fonction à un argument). Écartée car cela violerait AD-7 (*"aucun composant n'interpole `partie:${id}`/`user:${id}` lui-même"*) : un service de domaine (`ScenariosService`) recevant le topic BRUT devrait le PARSER (`topic.replace('partie:', '')`) pour en extraire un `partieId` — connaissance du format de topic qui doit rester exclusive à `RealtimeService`/aux helpers `partieTopic`/`userTopic`. Le sentinel garde `ScenariosService` totalement ignorant du format SSE.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** (265 lignes, Story 17.3) — `_changed`/`changed`/`notifyChanged(partieId)` privé, lignes 21-33 actuelles. 17 sites d'appel inchangés par cette story.
- **`apps/web/src/app/core/realtime/realtime.service.ts`** (Story 18.2/18.3, 78 lignes) — `handlers` avec sa première entrée (`PartiesService`), à étendre Task 2.
- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** (constructeur, lignes 111-137 actuelles, cité intégralement Task 3) — filtre `partieIdChanged`/`change.partieId !== partieId` (Story 17.3, AC1), seule ligne à modifier.
- **`apps/web/src/app/features/scenarios/seance-list/seance-list.ts`** (259 lignes, cité largement) — composant PUREMENT présentationnel (`input`/`output`), `refreshScenario()` privée (lignes 247-258 actuelles) déjà utilisée après `onChoose`/`onClosePoll`. Aucun `effect()`/constructeur existant.
- **`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`** (451 lignes) — `ngOnInit()` (lignes 172-209 actuelles), `loadScenarios()` (lignes 214-220), `refreshMjPanels()` (lignes 341-348) — toutes citées/référencées Task 5. Aucun `effect()`/constructeur/`DestroyRef` existant.
- **`apps/web/src/app/app.routes.ts`** — confirme `parties/:id/calendar` et `parties/:id/guild-calendar` comme routes SÉPARÉES de `parties/:id` (`PartieDetail`), justifiant Task 5.

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis par composant (`createComponent()`/`createCalendarView()` partagés par fichier).
- `calendar-view.spec.ts` : mock direct de `RealtimeService` (pas de stub `EventSource` global) — un seul point de création partagé dans ce fichier, contrairement à `partie-detail.spec.ts` (Story 18.3, ~50 tests scattered nécessitant un stub global).
- Piège déjà documenté (Story 18.2) : `jsdom` n'implémente pas `EventSource` — sans objet, `calendar-view.spec.ts` mocke `RealtimeService` directement donc n'y est pas exposé.

### Previous Story Intelligence (Story 18.3)

- Établi : vérifier empiriquement toute divergence entre epic/architecture et code réel — reproduit ici pour la collision de nom `notifyChanged`, déjà **anticipée** dans les Dev Notes de la Story 18.2 (*"Piège à anticiper pour cette story future... à renommer/fusionner à ce moment-là"*) — résolue ici par un NOM DIFFÉRENT plutôt qu'un renommage, moins invasif.
- Story 18.3 a laissé deux items différés pertinents : réutilisation de route Angular par défaut (repris tel quel pour `CalendarView`, Task 5) ; pas de garde de concurrence sur les rafraîchissements rapprochés (même classe de risque ici, non retraitée, cohérente avec NFR1).
- Convention de tests établie : un test par comportement, réutiliser les patterns déjà en place (`createComponent`/mocks partagés par fichier) plutôt que d'en inventer de nouveaux.

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/core/scenarios/scenarios.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (+ spec), `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (+ spec), `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.
- `RealtimeService.handlers` passe de 1 à 2 entrées (toutes deux au préfixe `'partie:'`).
- `ScenarioEditor`/`ScenarioReadDialog` (câblage + garde de brouillon FR-8) restent hors scope — Story 19.2.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (lignes 187-205 — Story 19.1 complète, AC1-AC3)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4, AD-7 ; Structural Seed — `scenarios.service.ts`/`seance-list.ts`/`calendar-view.ts` listés comme fichiers à modifier pour FR-5/FR-6/FR-7)
- `_bmad-output/implementation-artifacts/18-2-connexion-sse-et-reconnexion-cote-client.md` (Dev Notes : collision de nom anticipée, « à traiter pour une story future »)
- `_bmad-output/implementation-artifacts/18-3-cablage-partiedetail-sur-le-signal-temps-reel.md` (précédent direct pour `connect()`/`disconnect()` via `DestroyRef`, item différé sur la réutilisation de route)
- `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: code review of 18-3...", réutilisation de route — même limitation reconduite pour `CalendarView`)
- Vérifications empiriques effectuées pendant la préparation de cette story : `<app-scenario-timeline>` et `<app-seance-list>` ne sont jamais rendus hors de l'arborescence `PartieDetail` (recherche exhaustive des templates) ; `CalendarView` est la seule cible montée sur une route séparée ; aucun angle mort backend (contrairement à la Story 18.3, `PartiesService.update()`) — les 6 services backend câblés en Story 18.1 couvrent déjà toutes les mutations pertinentes à cette story.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- `docker compose exec web pnpm test` — suite complète relancée après chaque tâche (Tasks 1-5) ; 0 régression à chaque étape, suite finale : 70 fichiers / 860 tests, 0 échec.

### Completion Notes List

- Task 4 (`SeanceList`) a introduit une régression transitive non anticipée par la story : 4 fichiers de spec (`scenario-detail.spec.ts`, `scenario-one-shot-tab.spec.ts`, `scenario-editor.spec.ts`, `scenario-read-dialog.spec.ts`) rendent `<app-seance-list>` transitivement via `ScenarioEditor`/`ScenarioReadDialog` et fournissaient leur propre mock `ScenariosService` sans signal `changed` — le nouveau `constructor()`/`effect()` de `SeanceList` (AC2) levait une erreur `changed is not a function`. Détecté via suite complète (pas seulement les tests ciblés) ; corrigé en ajoutant `changed: signal<{ partieId: string } | null>(null)` aux 11 occurrences de mock affectées (2+1+4+4 respectivement).
- Task 5 (`CalendarView`) : le test « notification `ScenariosService.changed()` recharge scénarios et créneaux/heatmap » nécessitait `fixture.detectChanges()` (et non un simple `await Promise.resolve()`) après `changed.set(...)` pour que l'`effect()` signal-based se déclenche de façon fiable en environnement de test zoneless — pattern déjà établi dans les autres specs de cette story (`scenario-timeline.spec.ts`, `seance-list.spec.ts`).
- Toutes les ACs (1, 2, 3) sont couvertes par des tests dédiés : wildcard sur `ScenarioTimeline` (AC1), effet réactif sur `SeanceList` (AC2), connexion/déconnexion SSE + effet réactif sur `CalendarView` (AC3).

### File List

- `apps/web/src/app/core/scenarios/scenarios.service.ts` (+ spec)
- `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (+ spec)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (+ spec)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (+ spec)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (régression anticipée : mock `ScenariosService` étendu, Task 2)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts` (régression transitive découverte, Task 4)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts` (régression transitive découverte, Task 4)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (régression transitive découverte, Task 4)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (régression transitive découverte, Task 4)

## Change Log

- 2026-07-21 : Implémentation complète de la Story 19.1 (Tasks 1-7) — câblage temps réel de `ScenarioTimeline` (wildcard), `SeanceList` (effet réactif) et `CalendarView` (connexion SSE propre + effet réactif). 860/860 tests passants, 0 changement `apps/api`.
- 2026-07-22 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 1 patch appliqué (isolation d'erreur entre handlers dans `RealtimeService.onSignal` — try/catch par handler, `realtime.service.ts`), 3 items différés (voir deferred-work.md), 14 écartés (dont la crainte d'un wildcard traversant les Parties, réfutée empiriquement : chaque connexion `EventSource` est déjà scopée à une Partie côté serveur). Suite finale : 860/860 tests web, aucune régression. Statut passé à done.
