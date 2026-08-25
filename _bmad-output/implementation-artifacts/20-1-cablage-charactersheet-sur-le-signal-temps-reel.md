---
baseline_commit: 751cf8c80c36ccb6c2788986989b979df5da4346
---

# Story 20.1: Câblage CharacterSheet sur le signal temps réel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que ma fiche de personnage reflète une distribution d'XP ou un passage de niveau fait par le MJ pendant que j'ai la fiche ouverte,
so that je n'aie pas besoin de recharger la page pour voir ma progression.

## Acceptance Criteria

1. **Given** `CharacterSheet` affiché **When** le MJ distribue de l'XP ou valide un passage de niveau pendant que la fiche reste ouverte **Then** la fiche se met à jour sans rechargement de page.
2. **Given** `CharacterService` (frontend), aujourd'hui un pur wrapper HTTP sans signal `changed` **When** ce câblage est implémenté **Then** un signal `_changed` (privé) et une méthode publique `notifyChanged(): void` y sont introduits pour la première fois — nouvelle infrastructure réactive, cohérente avec le contrat déjà en place sur `PartiesService`/`ScenariosService`.

## Tasks / Subtasks

- [x] **Task 1 — `CharacterService` (frontend) : introduire `_changed`/`changed`/`notifyChanged()` (AC2)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/core/characters/character.service.ts` (331 lignes) — pur wrapper HTTP aujourd'hui, AUCUNE réactivité signal (contrairement à `ScenariosService`/`PartiesService`). Pas de collision de nom à résoudre ici (contrairement à la Story 19.1 sur `ScenariosService`, qui avait déjà 17 sites `notifyChanged(partieId)` privés) — c'est une ardoise vierge.
  - **Reproduire exactement** le pattern déjà en place sur `PartiesService` (`apps/web/src/app/core/parties/parties.service.ts` lignes 38-42, Story 18.3) — un compteur `signal(0)` incrémenté, PAS le pattern `{partieId}`/wildcard de `ScenariosService` (celui-ci existe uniquement pour résoudre la collision de nom propre à ce service, non pertinente ici) :
    ```typescript
    import { Injectable, inject, signal } from '@angular/core';
    // ...
    export class CharacterService {
      private readonly http = inject(HttpClient);
      private readonly _changed = signal(0);
      readonly changed = this._changed.asReadonly();
      notifyChanged(): void {
        this._changed.update((v) => v + 1);
      }
      // ... méthodes HTTP existantes, INCHANGÉES ...
    }
    ```
  - **Aucun changement backend** — `apps/api/src/characters/character.service.ts` émet déjà `this.realtimeEvents.emit(partieTopic(...))` sur toutes les mutations pertinentes depuis la Story 18.1 (vérifié empiriquement, 13 sites d'appel `realtimeEvents.emit` déjà présents, notamment `levelUp()`/toute mutation modifiant `xp`). Aucun angle mort backend pour cette story, contrairement à la Story 18.3 (`PartiesService.update()` avait dû être corrigée à l'époque).

- [x] **Task 2 — `RealtimeService` : troisième entrée dans `handlers` (AC1)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (déjà étendu une première fois en Story 19.1) — injecter `CharacterService` et ajouter une **troisième** entrée au **même préfixe** `'partie:'` :
    ```typescript
    import { CharacterService } from '../characters/character.service';
    // ...
    private readonly characters = inject(CharacterService);

    private readonly handlers: TopicHandler[] = [
      { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
      { prefix: 'partie:', notifyChanged: () => this.characters.notifyChanged() },
    ];
    ```
  - Aucune circularité : `CharacterService` n'importe pas `RealtimeService`. Le try/catch par handler ajouté en revue de code de la Story 19.1 (isolation d'erreur dans `onSignal`) protège déjà cette troisième entrée sans modification supplémentaire.

- [x] **Task 3 — `CharacterSheet` : connexion SSE propre + effet réactif (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (492 lignes). Aucun `effect()`/constructeur/`DestroyRef` existant. `ngOnInit()` (lignes 269-292 actuelles) résout `characterId` depuis `route.snapshot.paramMap.get('characterId')`, fetch le personnage puis le contenu du système de jeu.
  - **`CharacterSheet` a besoin de sa propre connexion SSE** (comme `CalendarView`, Story 19.1, et `ScenarioEditor` pour son cas `ScenarioDetail`, Story 19.2) — vérifié : la route `parties/:id/characters/:characterId` (`app.routes.ts`) est une route **séparée**, jamais un enfant de `PartieDetail`. Contrairement à `ScenarioTimeline`/`SeanceList`, `CharacterSheet` n'a donc AUCUNE connexion ancêtre à réutiliser.
  - Le paramètre de route `:id` (partieId) est disponible dès `ngOnInit()`, tout comme `:characterId` — pas besoin d'attendre la résolution du personnage pour ouvrir la connexion :
    ```typescript
    import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
    // ...
    import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';

    export class CharacterSheet implements OnInit {
      private readonly route = inject(ActivatedRoute);
      private readonly characterSvc = inject(CharacterService);
      private readonly dialog = inject(MatDialog);
      private readonly auth = inject(AuthService);
      protected readonly theme = inject(ThemeToneService);
      private readonly realtime = inject(RealtimeService);
      private readonly destroyRef = inject(DestroyRef);
      // ... signaux existants inchangés ...

      constructor() {
        // Story 20.1 (AC1) : réagit au signal générique CharacterService.changed (RealtimeService).
        // PIÈGE (même classe que ScenarioEditor, Story 19.2 Task 1) : CharacterSheet a DÉJÀ un
        // chargement dédié dans ngOnInit() (fetch au montage). La première exécution d'un effect()
        // a lieu à la CONSTRUCTION du composant — si `changed()` porte déjà une valeur (mutation
        // locale antérieure dans la même session applicative, CharacterService étant
        // `providedIn: 'root'`), cette première exécution déclencherait un refetch REDONDANT avec
        // celui que ngOnInit() fait juste après. Le flag `firstRun` neutralise uniquement cette
        // toute première exécution (même pattern que Story 19.2, `firstRun` local au constructeur,
        // pas un signal).
        let firstRun = true;
        effect(() => {
          this.characterSvc.changed();
          if (firstRun) {
            firstRun = false;
            return;
          }
          untracked(() => void this.refreshCharacter());
        });
      }

      // Utilisée UNIQUEMENT par l'effect() ci-dessus — PAS par le fetch initial de ngOnInit(), qui
      // reste ciblé par le paramètre de route characterId (jamais par this.character(), pas encore
      // garanti peuplé au moment où ngOnInit() s'exécute, même piège de timing que Story 19.2).
      private async refreshCharacter(): Promise<void> {
        const c = this.character();
        if (!c) return;
        try {
          this.character.set(await this.characterSvc.get(c.id));
        } catch {
          // non-bloquant — la fiche affichée reste telle quelle si le rafraîchissement échoue
        }
      }

      async ngOnInit(): Promise<void> {
        const partieId = this.route.snapshot.paramMap.get('id');
        if (partieId) {
          this.realtime.connect(partieTopic(partieId));
          this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(partieId)));
        }
        const characterId = this.route.snapshot.paramMap.get('characterId');
        // ... reste de ngOnInit() INCHANGÉ (fetch personnage + contenu) ...
      }
    }
    ```
  - **Pas de garde `matchesPartie()` nécessaire ici** (contrairement à `ScenariosService`) : `CharacterService.notifyChanged()` suit le contrat AD-4 zéro-argument le plus simple (pattern `PartiesService`, pas de sentinel wildcard) — aucune information de Partie à filtrer côté client. La connexion SSE elle-même (`connect(partieTopic(partieId))`) est déjà scopée côté serveur à cette seule Partie (vérifié empiriquement en Story 19.1 : chaque `EventSource` ne reçoit que les événements de la Partie sur laquelle elle est connectée) — un événement reçu par CETTE connexion concerne nécessairement CETTE fiche. Limitation résiduelle déjà acceptée ailleurs dans le projet (cf. `deferred-work.md`, Story 17.3) : si l'utilisateur a simultanément deux onglets ouverts sur des Parties différentes, une mutation locale dans l'un peut déclencher un refetch superflu (mais inoffensif) dans l'autre — hors scope de cette story.
  - **Pas de garde de brouillon (Palier 6 FR-5) nécessaire ici** : contrairement à `ScenarioEditor` (Story 19.2), `CharacterSheet` ne maintient aucun signal de brouillon parent-level pour ses champs éditables — `FieldEditPencil` (composant enfant réutilisé pour l'édition de champs) maintient son propre état local `editing`/`draft`, capturé UNIQUEMENT à l'ouverture de l'édition (`startEdit()`) et jamais resynchronisé depuis l'`@Input() value` pendant la frappe (vérifié : `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts`, lignes 29-35). Un refetch du personnage parent ne peut donc PAS écraser une saisie en cours dans `FieldEditPencil` — ce n'est structurellement pas possible, pas une garde à ajouter.

- [x] **Task 4 — Tests (AC1, AC2)**
  - **`character.service.spec.ts`** (`apps/web/src/app/core/characters/`) : nouveau test `notifyChanged()` incrémente `changed()` — même style que les tests équivalents de `parties.service.spec.ts` pour `notifyChanged()`.
  - **`realtime.service.spec.ts`** : ajouter un mock `CharacterService` (`{ notifyChanged: vi.fn(), changed: signal(0) }`) au `beforeEach`/`TestBed.configureTestingModule`, à côté des mocks `PartiesService`/`ScenariosService` déjà présents. Nouveau test : `'open'`/`'message'` sur un topic `partie:` déclenche **aussi** `charactersSvc.notifyChanged` (les TROIS handlers du même préfixe sont appelés).
  - **`character-sheet.spec.ts`** (factory `createComponent()` partagée, ligne 81) :
    - **Mettre à jour le mock `ActivatedRoute`** (ligne 99 actuelle : `{ snapshot: { paramMap: { get: () => characterId } } }`) — ce mock ignore la clé demandée et retourne toujours `characterId`, quelle que soit la clé interrogée. Le remplacer par un mock distinguant `'id'` (partieId) de `'characterId'` :
      ```typescript
      { provide: ActivatedRoute, useValue: {
        snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'p1' : characterId) } },
      } },
      ```
    - Ajouter un mock `RealtimeService` (`{ connect: vi.fn(), disconnect: vi.fn() }`) au provider de `createComponent()`, retourné dans l'objet de résultat (même style que Story 19.1/19.2).
    - Ajouter `changed: signal(0)` à `defaultSvc()`/`makeCharacterService()`.
    - Nouveau test : `connect()` appelé avec `partieTopic('p1')` au montage (`ngOnInit`).
    - Nouveau test : `disconnect()` appelé à `fixture.destroy()`.
    - Nouveau test (AC1) : `characterSvc.changed.set(...)` (ou `.update(v => v+1)`) après le montage initial (flush microtasks, `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`, pattern déjà établi) → `characterSvc.get` rappelé une deuxième fois (mocker un retour différent au deuxième appel — ex. `xp` mis à jour — pour distinguer du fetch initial et vérifier que `comp.character()` reflète la nouvelle valeur).
    - Nouveau test (garde `firstRun`) : créer le composant avec `changed: signal(0)` déjà à une valeur non-nulle avant le montage initial (ex. `changed: signal(1)` au lieu de `signal(0)` dans le mock) → `characterSvc.get` n'est appelé **qu'une seule fois** (le fetch de `ngOnInit()`), preuve que la première exécution de l'`effect()` a bien été neutralisée. **Contrairement à Story 19.2** (`ScenarioEditor`/`ScenarioReadDialog` rendent `SeanceList`, qui contamine le comptage brut), `CharacterSheet` ne rend aucun composant enfant réagissant lui aussi à `CharacterService.changed` — un compte exact de `1` est donc fiable ici, pas seulement une assertion sur les données.

- [x] **Task 5 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (870 tests avant cette story, Story 19.2, + les nouveaux tests Task 4).
  - **Aucun changement `apps/api`** — story 100% frontend (Task 1 confirme empiriquement l'absence de lacune backend, contrairement à la Story 18.3).
  - Aucune migration Prisma, aucun changement de schéma.
  - Fichiers modifiés attendus : `apps/web/src/app/core/characters/character.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (+ spec). **Aucune modification** `PartiesService`/`ScenariosService` (Story 18.3/19.1, déjà complets), aucune modification `apps/api` (émission déjà en place depuis la Story 18.1). `CharacterSheet` n'est rendu que sur sa propre route (vérifié empiriquement, `grep` exhaustif sur `app-character-sheet`/`CharacterSheet` — `PartieDetail` ne fait que naviguer vers cette route via `Router.navigate()`, ne l'embarque jamais) : aucune régression transitive à anticiper dans d'autres fichiers de specs, contrairement à la Story 19.2 (`ScenarioEditor` rendu dans `scenario-detail.spec.ts`/`scenario-one-shot-tab.spec.ts`).

### Review Findings

- [x] [Review][Patch] La garde `if (!c) return` de `refreshCharacter()` n'est exercée par aucun test — un événement `changed()` survenant avant que le fetch initial de `ngOnInit()` n'ait résolu (`this.character()` encore `null`) n'est jamais simulé, alors que le garde existe précisément pour ce cas [apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts] — corrigé (1 nouveau test)
- [x] [Review][Defer] `CharacterService.notifyChanged()` ne porte aucune information de Partie/personnage — toute mutation déclenche un refetch sur CHAQUE `CharacterSheet` monté, pertinent ou non [apps/web/src/app/core/characters/character.service.ts] — deferred, même caractéristique architecturale déjà documentée et acceptée (cf. Dev Notes de cette story et `deferred-work.md`, Story 17.3)
- [x] [Review][Defer] Absence de garde de concurrence si plusieurs notifications `changed()` se chevauchent avec un `refreshCharacter()` déjà en vol (course, dernière réponse gagne) [apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — deferred, même classe de risque déjà acceptée ailleurs (NFR1, Story 18.3/19.1/19.2)
- [x] [Review][Defer] La connexion SSE et la garde de rafraîchissement sont capturées une seule fois au `ngOnInit()` depuis les paramètres de route — une réutilisation d'instance de composant à travers une navigation vers une autre Partie/personnage laisserait la connexion périmée [apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — deferred, même limitation « réutilisation de route » déjà différée pour `PartieDetail`/`CalendarView` (Story 18.3/19.1), non atteignable via les parcours de navigation actuels

## Dev Notes

### Architecture — première story de l'Epic 20 (`ARCHITECTURE-SPINE.md`, Palier 7)

Cette story câble le TROISIÈME service de domaine (`CharacterService`) dans `RealtimeService.handlers`, et introduit pour la première fois son infrastructure réactive (`_changed`/`changed`/`notifyChanged()`) — exactement le cas anticipé par **AD-4** (§ case 2) : *« CharacterService/HommeDragonService (frontend) sont aujourd'hui de purs wrappers HTTP, sans aucun signal changed — ce palier y introduit ce signal pour la première fois... même forme que (1) une fois ajoutée »*. Contrairement à `ScenariosService` (Story 19.1), il n'y a ICI aucune collision de nom à résoudre : le contrat public `notifyChanged(): void` peut être ajouté littéralement, sans sentinel wildcard — reproduire le pattern `PartiesService` (compteur `signal(0)`), pas celui de `ScenariosService`.

### Pourquoi `CharacterSheet` a besoin de sa propre connexion SSE

Vérifié empiriquement (même méthode que Story 19.1/19.2) : `grep` exhaustif sur `app-character-sheet`/`CharacterSheet` → seul `app.routes.ts` (route `parties/:id/characters/:characterId`, séparée de `parties/:id`) et `partie-detail.ts` (`openCharacterSheet()`, une simple navigation via `Router`, PAS un embarquement de composant) y font référence. `CharacterSheet` n'est donc JAMAIS un enfant de `PartieDetail` — il doit ouvrir sa propre connexion (`connect()`/`disconnect()` via `DestroyRef`, comme `CalendarView` en Story 19.1), aucune connexion ancêtre à réutiliser.

### Pourquoi aucune garde `matchesPartie()` n'est nécessaire ici

Contrairement à `ScenariosService` (Story 19.1), `CharacterService.notifyChanged()` ne porte aucune information de Partie — c'est le contrat AD-4 le plus simple (zéro argument, pas de sentinel). La connexion SSE de `CharacterSheet` étant déjà scopée à sa propre Partie côté serveur (topic `partie:{id}`), un événement reçu par CETTE connexion concerne nécessairement CETTE Partie. La seule imprécision résiduelle (un signal `changed` global déclenché par une mutation locale dans un AUTRE onglet sur une AUTRE Partie) est une limitation déjà connue et acceptée du système (cf. `deferred-work.md`, section Story 17.3 : *« chaque ScenarioTimeline monté réévalue son effect() à chaque mutation, quelle que soit la Partie concernée »*) — même classe de risque, non retraitée ici, hors scope.

### Pourquoi aucune garde de brouillon (Palier 6 FR-5) n'est nécessaire ici

Contrairement à `ScenarioEditor` (Story 19.2, `descriptionDraft`/`resumeFinDraft` en signaux au niveau du composant PARENT, synchronisés depuis l'input via `effect()`), `CharacterSheet` délègue toute édition de champ à `FieldEditPencil` (composant enfant), qui maintient son PROPRE état local `editing`/`draft` — capturé une seule fois à `startEdit()`, jamais resynchronisé depuis son `@Input() value` pendant que l'utilisateur tape. Un refetch du personnage parent change uniquement la valeur de cet `@Input()`, sans jamais toucher l'état interne `editing`/`draft` de l'enfant. Aucune saisie en cours ne peut donc être écrasée — pas une garde à ajouter, une propriété structurelle déjà vraie du composant.

### Piège de timing (rappel, même classe que Story 19.2)

`refreshCharacter()` (nouveau, utilisé UNIQUEMENT par l'`effect()` temps réel) garde `if (!this.character()) return`. Cette garde est sûre car un événement temps réel ne peut survenir qu'après le montage complet du composant — mais le fetch INITIAL de `ngOnInit()` reste volontairement ciblé par le paramètre de route `characterId` (jamais par `this.character()`, qui pourrait ne pas encore être peuplé au moment exact où `ngOnInit()` s'exécute, les `effect()` Angular ne s'exécutant pas synchronément à la construction du composant). Contrairement à `ScenarioEditor`, il n'y a ici AUCUNE logique de fusion (`applyScenario()`) à partager entre les deux chemins — `refreshCharacter()` n'est donc utilisée que par un seul appelant, plus simple qu'en Story 19.2.

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis (`createComponent()` partagée par fichier).
- Tests async (fetch simulé) : flush de microtasks via la boucle déjà établie (`for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`), pas `whenStable()` seul (zoneless, cf. mémoire projet `jdr-zoneless-test-timing`).
- **Mock `ActivatedRoute` à corriger** avant d'ajouter les nouveaux tests : le mock actuel (`{ get: () => characterId }`) ignore la clé demandée — nécessaire de le distinguer par clé (`'id'` vs `'characterId'`) pour que `connect(partieTopic(partieId))` soit testable avec une valeur significative.
- **Contrairement à la Story 19.2** : `CharacterSheet` ne rend aucun composant enfant (type `SeanceList`) réagissant lui-même à `CharacterService.changed` — un test asserting un compte EXACT d'appels à `characterSvc.get` (ex. garde `firstRun`) est donc fiable ici, pas contaminé par un chemin de refetch indépendant d'un enfant.

### Previous Story Intelligence (Story 19.1/19.2)

- Établi : vérifier empiriquement toute divergence entre l'hypothèse de câblage et le rendu réel des templates (`grep` exhaustif sur le sélecteur du composant) avant de décider si une connexion SSE propre est nécessaire — reproduit ici pour `CharacterSheet`.
- Story 19.2 (revue de code) a révélé un vrai bug de timing (garde `if (!current) return` appliquée à tort au fetch initial d'un composant, sautant silencieusement le chargement) — évité ici dès la conception : `refreshCharacter()` n'est utilisée QUE par l'effect() temps réel, jamais par `ngOnInit()`.
- Story 19.2 (revue de code) a aussi révélé que le garde `firstRun` n'était testé par aucun cas où `changed()` porte déjà une valeur au montage — cette story doit inclure ce test dès l'implémentation initiale (Task 4), pas seulement après une revue.
- Le patch de revue de code 19.1 (isolation d'erreur entre handlers dans `RealtimeService.onSignal`, try/catch par handler) protège déjà nativement la nouvelle troisième entrée ajoutée ici — aucune modification supplémentaire nécessaire.

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/core/characters/character.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.
- `RealtimeService.handlers` passe de 2 à 3 entrées (toutes au préfixe `'partie:'`).
- `HommeDragonSheet`/`HommeDragonService` restent hors scope — Story 20.2 (même forme, à répéter).

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 20.1 complète, AC1-AC2, lignes 231-245)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4 § case 2, AD-9)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18-p7/prd.md` (FR-9, §4.2)
- `_bmad-output/implementation-artifacts/19-1-cablage-scenariotimeline-seancelist-et-calendarview.md` (mécanisme de câblage `RealtimeService.handlers` réutilisé, patch try/catch par handler)
- `_bmad-output/implementation-artifacts/19-2-cablage-scenarioeditor-et-scenarioreaddialog-avec-garde-du-brouillon.md` (piège de timing `refreshX()`/fetch initial, garde `firstRun` — leçons directement appliquées ici)
- `_bmad-output/implementation-artifacts/18-3-cablage-partiedetail-sur-le-signal-temps-reel.md` (pattern `_changed`/`changed`/`notifyChanged()` de `PartiesService`, reproduit ici tel quel)
- Vérifications empiriques effectuées pendant la préparation de cette story : `apps/api/src/characters/character.service.ts` émet déjà `realtimeEvents.emit(partieTopic(...))` sur 13 sites (Story 18.1), aucun angle mort backend ; `<app-character-sheet>`/`CharacterSheet` n'est référencé que par sa propre route et par une navigation `Router` depuis `PartieDetail` (jamais embarqué comme enfant) ; `FieldEditPencil` maintient son état d'édition localement, jamais resynchronisé depuis son `@Input()` pendant la frappe.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- `docker compose exec web pnpm test` — suite complète relancée après chaque tâche ; suite finale : 70 fichiers / 876 tests, 0 échec.

### Completion Notes List

- Task 1 : `CharacterService` reçoit `_changed`/`changed`/`notifyChanged()` — copie exacte du pattern `PartiesService` (compteur `signal(0)`), aucune collision de nom à résoudre (contrairement à `ScenariosService`, Story 19.1).
- Task 2 : `RealtimeService.handlers` passe de 2 à 3 entrées, toutes au préfixe `'partie:'`. L'isolation d'erreur par handler (patch de revue Story 19.1) protège nativement cette troisième entrée.
- Task 3 : `CharacterSheet` ouvre sa propre connexion SSE dans `ngOnInit()` (via le paramètre de route `:id`) et réagit à `CharacterService.changed` via un `effect()` gardé par un flag `firstRun` local (même pattern que Story 19.2) — le fetch initial de `ngOnInit()` reste volontairement indépendant de `refreshCharacter()` (ciblé par `characterId` du paramètre de route, jamais par `this.character()`), évitant le piège de timing découvert en revue de la Story 19.2. Aucune garde `matchesPartie()` ni garde de brouillon nécessaire (raisons documentées dans les Dev Notes de la story, confirmées par la revue de préparation).
- Task 4 : régression transitive anticipée — 2 configurations `TestBed` isolées dans `character-sheet.spec.ts` (ne passant pas par la factory partagée) ne fournissaient pas de mock `RealtimeService` ; corrigées. Le mock `ActivatedRoute` de la factory partagée a été corrigé pour distinguer la clé `'id'` (partieId) de `'characterId'` (il retournait auparavant `characterId` quelle que soit la clé demandée). Le test de garde `firstRun` utilise un compte exact d'appels à `characterSvc.get` (fiable ici : `CharacterSheet` ne rend aucun enfant réagissant lui-même à `CharacterService.changed`, contrairement à `SeanceList` dans la Story 19.2).
- Toutes les ACs (1, 2) sont couvertes par des tests dédiés : `notifyChanged()` incrémente `changed()` (AC2, `character.service.spec.ts`) ; troisième handler notifié sur `'open'`/`'message'` (`realtime.service.spec.ts`) ; connexion/déconnexion SSE, rafraîchissement réactif et garde `firstRun` (AC1, `character-sheet.spec.ts`).

### File List

- `apps/web/src/app/core/characters/character.service.ts` (+ spec)
- `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (+ spec)

## Change Log

- 2026-07-22 : Implémentation complète de la Story 20.1 (Tasks 1-5) — introduction de l'infrastructure réactive `CharacterService` (`_changed`/`changed`/`notifyChanged()`), troisième entrée `RealtimeService.handlers`, câblage temps réel de `CharacterSheet` (connexion SSE propre + effet réactif gardé par `firstRun`). 876/876 tests passants, 0 changement `apps/api`. Première story de l'Epic 20.
- 2026-07-22 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 1 patch appliqué (test de la garde `if (!c) return` de `refreshCharacter()` pour un `changed()` survenant avant la résolution du fetch initial), 3 items différés (voir deferred-work.md), 9 écartés. Suite finale : 877/877 tests web, aucune régression. Statut passé à done.
