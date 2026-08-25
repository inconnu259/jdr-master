---
baseline_commit: 751cf8c80c36ccb6c2788986989b979df5da4346
---

# Story 20.2: Câblage HommeDragonSheet sur le signal temps réel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que ma fiche Homme Dragon reflète un pouvoir d'éveil débloqué par une distribution d'XP faite par le MJ pendant que j'ai la fiche ouverte,
so that je n'aie pas besoin de recharger la page pour voir ma progression.

## Acceptance Criteria

1. **Given** `HommeDragonSheet` affiché, avec `pendingEveilLevels`/`eveilPowers` chargés une fois au montage **When** le MJ distribue de l'XP débloquant un niveau pendant que la fiche reste ouverte **Then** la fiche se met à jour sans rechargement de page.
2. **Given** `HommeDragonService` (frontend), aujourd'hui un pur wrapper HTTP sans signal `changed` **When** ce câblage est implémenté **Then** un signal `_changed` (privé) et une méthode publique `notifyChanged(): void` y sont introduits pour la première fois, même forme que `CharacterService` (Story 20.1).

## Tasks / Subtasks

- [x] **Task 1 — `HommeDragonService` (frontend) : introduire `_changed`/`changed`/`notifyChanged()` (AC2)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (58 lignes) — pur wrapper HTTP aujourd'hui, AUCUNE réactivité signal, exactement comme `CharacterService` avant la Story 20.1.
  - **Reproduire exactement** le pattern déjà en place sur `PartiesService`/`CharacterService` (Story 20.1) — un compteur `signal(0)` incrémenté :
    ```typescript
    import { Injectable, inject, signal } from '@angular/core';
    // ...
    export class HommeDragonService {
      private readonly http = inject(HttpClient);
      private readonly _changed = signal(0);
      readonly changed = this._changed.asReadonly();
      notifyChanged(): void {
        this._changed.update((v) => v + 1);
      }
      // ... méthodes HTTP existantes, INCHANGÉES ...
    }
    ```
  - **Aucun changement backend** — `apps/api/src/homme-dragon/homme-dragon.service.ts` émet déjà `this.realtimeEvents.emit(partieTopic(...))` sur les mutations pertinentes depuis la Story 18.1 (vérifié empiriquement, 3 sites d'appel `realtimeEvents.emit` déjà présents, dont `chooseEveilPower()`). Aucun angle mort backend pour cette story.

- [x] **Task 2 — `RealtimeService` : quatrième entrée dans `handlers` (AC1)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (déjà étendu deux fois, Story 19.1 puis 20.1) — injecter `HommeDragonService` et ajouter une **quatrième** entrée au **même préfixe** `'partie:'` :
    ```typescript
    import { HommeDragonService } from '../homme-dragon/homme-dragon.service';
    // ...
    private readonly hommeDragon = inject(HommeDragonService);

    private readonly handlers: TopicHandler[] = [
      { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
      { prefix: 'partie:', notifyChanged: () => this.characters.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.hommeDragon.notifyChanged() },
    ];
    ```
  - Aucune circularité : `HommeDragonService` n'importe pas `RealtimeService`. Le try/catch par handler (revue de code Story 19.1) protège déjà cette quatrième entrée sans modification supplémentaire.

- [x] **Task 3 — `HommeDragonSheet` : effet réactif, AUCUNE connexion SSE propre (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (227 lignes). Aucun `effect()`/constructeur existant. `ngOnInit()` (lignes 84-103 actuelles) résout `this.partieId()` (`@Input() required`, pas un paramètre de route) et fetch en parallèle le Homme Dragon (`findOne()`) et le contenu du système de jeu (catalogues d'artefacts/pouvoirs d'éveil, statiques — jamais rafraîchis par cette story, seul `hommeDragon` lui-même change).
  - **`HommeDragonSheet` N'A PAS besoin de sa propre connexion SSE** (contrairement à `CharacterSheet`, Story 20.1) — vérifié empiriquement (`grep` exhaustif sur `app-homme-dragon-sheet`/`HommeDragonSheet`) : ce composant n'est **JAMAIS routé séparément**, il est **toujours embarqué directement dans `PartieDetail`** (`partie-detail.html` ligne 328 : `<app-homme-dragon-sheet [partieId]="p.id" [partieName]="p.name" />`, onglet "Homme Dragon", pas de route dédiée — son propre commentaire de tête le confirme : *« embarqué directement (pas de route dédiée) »*). `PartieDetail` maintient déjà sa propre connexion SSE (Story 18.3) tant que la page reste montée — même raisonnement que `SeanceList`/`ScenarioTimeline` (Story 19.1) : réutiliser le signal `HommeDragonService.changed` déjà tenu à jour par la connexion active d'un ancêtre, sans en ouvrir une seconde.
  - Ajouter un constructeur avec le garde `firstRun` (même piège que `CharacterSheet`, Story 20.1 : `ngOnInit()` a déjà son propre fetch initial dédié) :
    ```typescript
    import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
    // ...
    export class HommeDragonSheet implements OnInit {
      readonly partieId = input.required<string>();
      readonly partieName = input.required<string>();

      private readonly hommeDragonSvc = inject(HommeDragonService);
      private readonly characterSvc = inject(CharacterService);
      protected readonly theme = inject(ThemeToneService);
      // ... signaux existants inchangés ...

      constructor() {
        // Story 20.2 (AC1) : réagit au signal générique HommeDragonService.changed (RealtimeService).
        // PIÈGE (même classe que CharacterSheet, Story 20.1) : HommeDragonSheet a DÉJÀ un
        // chargement dédié dans ngOnInit() (fetch au montage). La première exécution d'un effect()
        // a lieu à la CONSTRUCTION du composant — si `changed()` porte déjà une valeur (mutation
        // locale antérieure dans la même session applicative, HommeDragonService étant
        // `providedIn: 'root'`), cette première exécution déclencherait un refetch REDONDANT avec
        // celui que ngOnInit() fait juste après. Le flag `firstRun` neutralise uniquement cette
        // toute première exécution.
        let firstRun = true;
        effect(() => {
          this.hommeDragonSvc.changed();
          if (firstRun) {
            firstRun = false;
            return;
          }
          untracked(() => void this.refreshHommeDragon());
        });
      }

      // Utilisée UNIQUEMENT par l'effect() ci-dessus — PAS par le fetch initial de ngOnInit(), qui
      // reste ciblé par this.partieId() (jamais par une valeur dérivée de this.hommeDragon(), pas
      // encore garantie peuplée au moment où ngOnInit() s'exécute, même piège de timing que
      // Story 20.1). `hommeDragon() === undefined` signifie « chargement initial en cours » —
      // distinct de `null` (« pas encore créé », un état stable, pas un signe qu'il faille attendre).
      private async refreshHommeDragon(): Promise<void> {
        if (this.hommeDragon() === undefined) return;
        try {
          this.hommeDragon.set(await this.hommeDragonSvc.findOne(this.partieId()));
        } catch {
          // non-bloquant — la fiche affichée reste telle quelle si le rafraîchissement échoue
        }
      }

      async ngOnInit(): Promise<void> {
        // ... INCHANGÉ (fetch hommeDragon + contenu en parallèle) ...
      }
    }
    ```
  - **Pas de garde `matchesPartie()` nécessaire ici** (même raisonnement que `CharacterSheet`, Story 20.1) : `HommeDragonService.notifyChanged()` suit le contrat AD-4 zéro-argument le plus simple. La connexion SSE de l'ancêtre `PartieDetail` étant déjà scopée à sa propre Partie côté serveur, un événement reçu concerne nécessairement CETTE Partie — donc CE `HommeDragonSheet` (un seul par Partie, AD-7 de la Story 10.1).
  - **Aucune garde de brouillon nécessaire** : `HommeDragonSheet` n'a pas de champ de saisie continue synchronisé depuis un `@Input()`/signal parent pendant la frappe — le formulaire de création (`nom`/`apparence`/`caractere`/etc.) n'est peuplé qu'une fois (`mondesProteges` pré-rempli avec `partieName()` uniquement quand `hommeDragon === null`, jamais resynchronisé ensuite) et le formulaire d'édition d'artefact (`editingArtefact`/`editArtefactKey`) est ouvert/fermé explicitement par l'utilisateur (`openArtefactEdit()`), pas continuellement synchronisé. Un refetch pendant l'édition d'artefact ouverte n'écrase que l'affichage de la fiche en arrière-plan, pas le `<select>` d'édition en cours (état local `editArtefactKey`, jamais réinitialisé par un changement de `hommeDragon()`).

- [x] **Task 4 — Tests (AC1, AC2)**
  - **`homme-dragon.service.spec.ts`** (`apps/web/src/app/core/homme-dragon/`) : nouveau test `notifyChanged()` incrémente `changed()` — même style que le test équivalent de `character.service.spec.ts` (Story 20.1).
  - **`realtime.service.spec.ts`** : ajouter un mock `HommeDragonService` (`{ notifyChanged: vi.fn(), changed: signal(0) }`) au `beforeEach`/`TestBed.configureTestingModule`, à côté des mocks `PartiesService`/`ScenariosService`/`CharacterService` déjà présents. Nouveau test : `'open'`/`'message'` sur un topic `partie:` déclenche **aussi** `hommeDragonSvc.notifyChanged` (les QUATRE handlers du même préfixe sont appelés).
  - **`homme-dragon-sheet.spec.ts`** (factory `createComponent()` partagée, ligne 68) :
    - Ajouter `changed: signal(0)` à `makeHommeDragonService()`.
    - Nouveau test (AC1) : `hommeDragonSvc.changed.update(v => v+1)` après le montage initial (flush microtasks, `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`, pattern déjà établi) → `hommeDragonSvc.findOne` rappelé une deuxième fois (mocker un retour différent au deuxième appel — ex. `pendingEveilLevels` mis à jour — pour distinguer du fetch initial et vérifier que `comp.hommeDragon()` reflète la nouvelle valeur).
    - Nouveau test (garde `firstRun`) : créer le composant avec `changed: signal(1)` déjà à une valeur non-nulle avant le montage initial → `hommeDragonSvc.findOne` n'est appelé **qu'une seule fois** (le fetch de `ngOnInit()`). `HommeDragonSheet` ne rend aucun composant enfant réagissant lui-même à `HommeDragonService.changed` — un compte exact de `1` est fiable ici (même situation que `CharacterSheet`, Story 20.1, contrairement à `ScenarioEditor`/`SeanceList`, Story 19.2).
    - Nouveau test (garde de timing) : `hommeDragonSvc.findOne` contrôlé par une promesse manuelle (pattern déjà établi Story 20.1, `character-sheet.spec.ts`) — déclencher `changed.update(...)` AVANT que le fetch initial n'ait résolu (`hommeDragon()` encore `undefined`) → ne plante pas (garde `if (this.hommeDragon() === undefined) return`).
  - **`partie-detail.spec.ts`** — régression transitive anticipée (même piège que Story 19.1/19.2) : `HommeDragonSheet` est rendu transitivement (au moins un test clique sur l'onglet "Homme Dragon", ligne ~962 actuelle) via un mock `HommeDragonService` qui ne fournit PAS `changed` (2 occurrences actuelles, lignes ~227 et ~1181 : `{ findOne: vi.fn()..., create: vi.fn(), update: vi.fn() }`) — sans ce champ, le nouvel `effect()` du constructeur lèverait `changed is not a function`. Ajouter `changed: signal(0)` aux 2 occurrences.

- [x] **Task 5 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (877 tests avant cette story, Story 20.1, + les nouveaux tests Task 4).
  - **Aucun changement `apps/api`** — story 100% frontend (Task 1 confirme empiriquement l'absence de lacune backend).
  - Aucune migration Prisma, aucun changement de schéma.
  - Fichiers modifiés attendus : `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (+ spec), `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (régression transitive, mock `HommeDragonService` étendu). **Aucune modification** `PartiesService`/`ScenariosService`/`CharacterService` (déjà complets), aucune modification `apps/api`, aucune modification `partie-detail.ts` lui-même (seul son fichier de spec est touché).

### Review Findings

- [x] [Review][Patch] Aucun test ne vérifie qu'un échec de `findOne()` à l'intérieur de `refreshHommeDragon()` est bien absorbé sans planter ni laisser le composant dans un état incohérent — le commentaire « non-bloquant » n'est pas vérifié [apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts] — corrigé (1 nouveau test)
- [x] [Review][Defer] Absence de garde de concurrence si plusieurs notifications `changed()` se chevauchent avec un `refreshHommeDragon()` déjà en vol, ou avec une mutation locale (`onSubmit`/`onArtefactSubmit`/`onChooseEveilPower`) qui vient d'écrire `this.hommeDragon` — dernière réponse résolue gagne, pas de jeton de requête [apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts] — deferred, même classe de risque déjà acceptée ailleurs dans le projet (NFR1, Story 18.3/19.1/19.2/20.1)
- [x] [Review][Defer] `HommeDragonService.notifyChanged()` ne porte aucune information de Partie — tout événement temps réel déclenche un refetch sur chaque `HommeDragonSheet` monté, pertinent ou non [apps/web/src/app/core/homme-dragon/homme-dragon.service.ts] — deferred, même caractéristique architecturale déjà documentée et acceptée pour `CharacterService` (Story 20.1) et `ScenariosService` (Story 17.3)

## Dev Notes

### Architecture — dernière story de l'Epic 20 (`ARCHITECTURE-SPINE.md`, Palier 7)

Cette story câble le QUATRIÈME service de domaine (`HommeDragonService`) dans `RealtimeService.handlers`, et introduit son infrastructure réactive de la même forme que `CharacterService` (Story 20.1) — exactement le cas anticipé par **AD-4** (§ case 2, qui cite explicitement `CharacterService`/`HommeDragonService` ensemble). Aucune collision de nom à résoudre (ardoise vierge, comme `CharacterService`). Cette story clôt l'Epic 20 (FR9-FR10 du PRD Palier 7).

### Pourquoi `HommeDragonSheet` N'A PAS besoin de sa propre connexion SSE (contrairement à `CharacterSheet`, Story 20.1)

Différence architecturale clé avec la story précédente : `CharacterSheet` est routé séparément (`parties/:id/characters/:characterId`), jamais un enfant de `PartieDetail`. `HommeDragonSheet` est l'INVERSE — vérifié empiriquement (`grep` exhaustif sur `app-homme-dragon-sheet`/`HommeDragonSheet`, comme pour toutes les stories précédentes de ce palier) : ce composant n'a AUCUNE route dédiée, il est embarqué directement dans `partie-detail.html` (onglet "Homme Dragon", même schéma que `ScenarioOneShotTab`, confirmé par son propre commentaire de tête depuis la Story 10.1). Il réutilise donc la connexion déjà active de `PartieDetail` (Story 18.3), exactement comme `SeanceList`/`ScenarioTimeline` (Story 19.1) — **pas** de `RealtimeService.connect()`/`disconnect()` à ajouter ici.

### Piège de timing (rappel, même classe que Story 20.1)

`refreshHommeDragon()` (nouveau, utilisé UNIQUEMENT par l'`effect()` temps réel) garde `if (this.hommeDragon() === undefined) return`. Cette garde est sûre car un événement temps réel ne peut survenir qu'après le montage complet du composant — le fetch INITIAL de `ngOnInit()` reste indépendant, ciblé par `this.partieId()` (jamais par une valeur dérivée de `this.hommeDragon()`). Nuance propre à ce composant : `hommeDragon()` a TROIS états possibles (`undefined` = chargement, `null` = pas encore créé, `HommeDragonDto` = fiche existante) — la garde ne doit filtrer QUE l'état `undefined` (chargement), pas `null` (état stable légitime, un realtime refresh dessus est un no-op inoffensif via `findOne()` qui renverra à nouveau `null`).

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis (`createComponent()` partagée par fichier, factory unique ici — pas de configurations isolées à corriger comme en Story 20.1).
- Tests async (fetch simulé) : flush de microtasks via la boucle déjà établie (`for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`), pas `whenStable()` seul (zoneless, cf. mémoire projet `jdr-zoneless-test-timing`).
- **Régression transitive à corriger** : `partie-detail.spec.ts` mock `HommeDragonService` à 2 endroits sans `changed` — corriger AVANT d'exécuter la suite complète, sinon échec immédiat sur le test existant qui clique sur l'onglet "Homme Dragon".

### Previous Story Intelligence (Story 19.1/20.1)

- Établi : vérifier empiriquement toute divergence entre l'hypothèse de câblage et le rendu réel des templates (`grep` exhaustif sur le sélecteur du composant) avant de décider si une connexion SSE propre est nécessaire — ici, la vérification aboutit à la conclusion INVERSE de la Story 20.1 (pas de connexion propre), preuve que cette vérification empirique doit être refaite à chaque nouvelle story, jamais supposée par analogie avec la précédente.
- Story 20.1 (revue de code) a confirmé que le garde `firstRun` doit être testé dès l'implémentation initiale avec un cas où `changed()` porte déjà une valeur au montage, ET avec un cas où l'effet se déclenche avant que le fetch initial n'ait résolu — les deux tests sont inclus dès le Task 4 de cette story, pas différés à une revue.
- Story 19.1 a établi le pattern de régression transitive : tout composant enfant qui commence à lire `XService.changed` casse silencieusement les mocks existants dans les fichiers de specs qui le rendent sans fournir ce champ — recherché et anticipé ici pour `partie-detail.spec.ts` dès la rédaction de cette story, pas découvert pendant l'implémentation.

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (+ spec), `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (régression transitive, spec seulement).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.
- `RealtimeService.handlers` passe de 3 à 4 entrées (toutes au préfixe `'partie:'`).
- Dernière story de l'Epic 20 — epic complet après cette story (FR9-FR10 du Palier 7).

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 20.2 complète, AC1-AC2, lignes 247-261)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4 § case 2, AD-9)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18-p7/prd.md` (FR-10, §4.2)
- `_bmad-output/implementation-artifacts/20-1-cablage-charactersheet-sur-le-signal-temps-reel.md` (pattern `_changed`/`changed`/`notifyChanged()`, piège de timing `refreshX()`, garde `firstRun` — reproduits ici tels quels)
- `_bmad-output/implementation-artifacts/19-1-cablage-scenariotimeline-seancelist-et-calendarview.md` (pattern « pas de connexion SSE propre, réutilise l'ancêtre » — `SeanceList`, réutilisé ici pour `HommeDragonSheet`)
- Vérifications empiriques effectuées pendant la préparation de cette story : `apps/api/src/homme-dragon/homme-dragon.service.ts` émet déjà `realtimeEvents.emit(partieTopic(...))` sur 3 sites (Story 18.1), aucun angle mort backend ; `<app-homme-dragon-sheet>`/`HommeDragonSheet` n'est référencé que dans `partie-detail.html`/`partie-detail.ts`/`partie-detail.spec.ts` (jamais de route dédiée, jamais un `Router.navigate()` séparé) ; `partie-detail.spec.ts` mock `HommeDragonService` à 2 endroits sans `changed`, cassant potentiellement le test existant "onglet Homme Dragon" sans correction préalable.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- `docker compose exec web pnpm test` — suite complète relancée après chaque tâche ; suite finale : 70 fichiers / 882 tests, 0 échec.

### Completion Notes List

- Task 1 : `HommeDragonService` reçoit `_changed`/`changed`/`notifyChanged()` — copie exacte du pattern `CharacterService`/`PartiesService` (compteur `signal(0)`), aucune collision de nom (ardoise vierge, comme `CharacterService`).
- Task 2 : `RealtimeService.handlers` passe de 3 à 4 entrées, toutes au préfixe `'partie:'`. L'isolation d'erreur par handler (patch de revue Story 19.1) protège nativement cette quatrième entrée.
- Task 3 : `HommeDragonSheet` réagit à `HommeDragonService.changed` via un `effect()` gardé par un flag `firstRun` local (même pattern que Story 20.1) — **aucune connexion SSE propre** n'a été ajoutée, contrairement à `CharacterSheet` (Story 20.1) : vérifié empiriquement (`grep` exhaustif) que `HommeDragonSheet` n'est jamais routé séparément, toujours embarqué dans `PartieDetail`, qui maintient déjà sa propre connexion. `refreshHommeDragon()` reste indépendant du fetch initial de `ngOnInit()` (ciblé par `this.partieId()`), avec une garde `if (this.hommeDragon() === undefined) return` qui filtre uniquement l'état « chargement en cours », pas l'état stable `null` (« pas encore créé »).
- Task 4 : régression transitive anticipée ET corrigée — `partie-detail.spec.ts` mock `HommeDragonService` à 2 endroits sans `changed` (le test « onglet Homme Dragon » rend transitivement `HommeDragonSheet`) ; corrigé aux 2 occurrences. Une troisième construction manuelle du mock (test « échec de findOne()/getGameSystemContent() ») découverte dans `homme-dragon-sheet.spec.ts` lui-même (hors périmètre initial de la story, TypeScript l'a signalée immédiatement à la compilation) — corrigée également.
- Toutes les ACs (1, 2) sont couvertes par des tests dédiés : `notifyChanged()` incrémente `changed()` (AC2, `homme-dragon.service.spec.ts`) ; quatrième handler notifié sur `'open'`/`'message'` (`realtime.service.spec.ts`) ; rafraîchissement réactif, garde `firstRun` et garde de timing (`if (hommeDragon() === undefined) return`) (AC1, `homme-dragon-sheet.spec.ts`).

### File List

- `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (+ spec)
- `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (+ spec)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (régression transitive découverte, mock `HommeDragonService` étendu, 2 occurrences)

## Change Log

- 2026-07-22 : Implémentation complète de la Story 20.2 (Tasks 1-5) — introduction de l'infrastructure réactive `HommeDragonService` (`_changed`/`changed`/`notifyChanged()`), quatrième entrée `RealtimeService.handlers`, câblage temps réel de `HommeDragonSheet` (aucune connexion SSE propre, réutilise celle de `PartieDetail`). 882/882 tests passants, 0 changement `apps/api`. Dernière story de l'Epic 20 — epic désormais complet (FR9-FR10 du Palier 7 couverts).
- 2026-07-22 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 violation d'AC (Acceptance Auditor). 1 patch appliqué (test d'un `findOne()` rejeté pendant `refreshHommeDragon()`, absorbé sans planter), 2 items différés (voir deferred-work.md), 10 écartés. Suite finale : 883/883 tests web, aucune régression. Statut passé à done.
