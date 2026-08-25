---
baseline_commit: fd13ffd0fcbb8ab343ed7fbeab6935e47a0943f0
---

# Story 21.1: Canal utilisateur et câblage Dashboard (invitations reçues)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want voir apparaître ou disparaître une invitation reçue sur mon dashboard quand un MJ l'envoie ou la révoque, même si mon dashboard reste ouvert dans un autre onglet,
so that je n'aie pas besoin de recharger la page pour savoir si j'ai été invité.

## Acceptance Criteria

1. **Given** l'endpoint `GET /users/me/events` (distinct de `GET /parties/:id/events`, même `RealtimeEventsService` en interne) **When** un utilisateur authentifié ouvre une connexion **Then** il reçoit les événements de son propre topic utilisateur (`user:{id}`), contrôle d'identité simple (l'utilisateur authentifié = lui-même).
2. **Given** `Dashboard` affiché **When** un MJ envoie ou révoque une invitation ciblant cet utilisateur, pendant que le dashboard reste ouvert dans un autre onglet **Then** la liste des invitations reçues se met à jour sans rechargement de page.
3. **Given** la liste des Parties du joueur sur `Dashboard` **When** ce câblage est implémenté **Then** cette partie du Dashboard n'est pas concernée — elle est déjà correctement réactive aujourd'hui, aucune modification.

## Tasks / Subtasks

- [x] **Task 1 — Backend : endpoint `GET /users/me/events` (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/api/src/realtime/realtime.controller.ts` (32 lignes actuelles) — contient déjà `partieEvents()` (`GET /parties/:id/events`, Story 18.2) et un commentaire de tête qui ANNONCE explicitement cette story : *« ce fichier portera aussi GET /users/me/events (Story 21.1), un préfixe distinct dans le même controller »*. `RealtimeEventsService` (`realtime-events.service.ts`) expose déjà `userTopic(userId)` (fonction pure, déjà exportée et déjà testée — `subscribe(topic)`/`emit(topic)` sont déjà génériques, **AUCUN changement nécessaire dans ce fichier**).
  - Ajouter la nouvelle route dans le controller existant, **sans contrôle d'appartenance supplémentaire** (contrairement à `partieEvents()` qui appelle `getViewable()`) — l'identité de l'utilisateur authentifié EST le contrôle (AC1, AD-7) :
    ```typescript
    import { Controller, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
    import type { Observable } from 'rxjs';
    import { map } from 'rxjs/operators';
    import type { AuthUser } from '@master-jdr/shared';
    import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
    import { CurrentUser } from '../common/current-user.decorator';
    import { PartiesService } from '../parties/parties.service';
    import { RealtimeEventsService, partieTopic, userTopic } from './realtime-events.service';

    @UseGuards(AuthenticatedGuard)
    @Controller()
    export class RealtimeController {
      constructor(
        private readonly parties: PartiesService,
        private readonly realtimeEvents: RealtimeEventsService,
      ) {}

      @Sse('parties/:id/events')
      async partieEvents(/* ... INCHANGÉ ... */): Promise<Observable<MessageEvent>> {
        // ... INCHANGÉ ...
      }

      @Sse('users/me/events')
      userEvents(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
        return this.realtimeEvents.subscribe(userTopic(user.id)).pipe(map(() => ({ data: {} })));
      }
    }
    ```
    Pas de `async`/`Promise` ici (contrairement à `partieEvents`) : aucun appel réseau/DB à attendre avant de s'abonner, contrairement au `getViewable()` de `partieEvents`.
  - **Aucun changement** `apps/api/src/invitations/invitations.service.ts` — émet déjà `this.realtimeEvents.emit(userTopic(inviteeUserId))` sur `create()`/`revoke()` (2 sites déjà présents, vérifié empiriquement, déjà testés dans `invitations.service.spec.ts`). Aucun angle mort backend au-delà de la route elle-même.
  - **Aucun changement** `realtime.module.ts` — `RealtimeController` est déjà déclaré dans ce module, la nouvelle route n'ajoute aucune dépendance.

- [x] **Task 2 — `InvitationsService` (frontend) : introduire `_changed`/`changed`/`notifyChanged()` (AD-4)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/core/invitations/invitations.service.ts` (30 lignes) — pur wrapper HTTP aujourd'hui, AUCUNE réactivité signal, exactement comme `CharacterService`/`HommeDragonService` avant leurs stories respectives (20.1/20.2). **Particularité à NE PAS corriger dans cette story** : ce fichier utilise `const API = 'http://localhost:3000';` en dur, au lieu du pattern `API_BASE` importé de `../api-base` utilisé partout ailleurs — incohérence pré-existante, hors scope (aucune AC ne la mentionne, ne pas la « corriger » silencieusement).
  - **Reproduire exactement** le pattern déjà en place sur `CharacterService`/`HommeDragonService` (Story 20.1/20.2) — un compteur `signal(0)` incrémenté :
    ```typescript
    import { Injectable, inject, signal } from '@angular/core';
    // ...
    export class InvitationsService {
      private readonly http = inject(HttpClient);
      // Story 21.1 : première introduction de ce signal (contrat AD-4, même forme que
      // CharacterService/HommeDragonService/PartiesService — compteur incrémenté, zéro
      // information de Partie/utilisateur à porter).
      private readonly _changed = signal(0);
      readonly changed = this._changed.asReadonly();
      notifyChanged(): void {
        this._changed.update((v) => v + 1);
      }
      // ... méthodes HTTP existantes (listReceived/accept/decline), INCHANGÉES ...
    }
    ```

- [x] **Task 3 — `RealtimeService` (frontend) : première entrée au préfixe `'user:'` (AC1)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (déjà étendu quatre fois au préfixe `'partie:'`, Story 19.1/20.1/20.2). `userTopic(userId)`/`urlForTopic()` (branche `'user:'` → `${API_BASE}/users/me/events`) sont **déjà présents depuis la Story 18.2** — **AUCUN changement structurel nécessaire**, seulement une nouvelle entrée dans `handlers` :
    ```typescript
    import { InvitationsService } from '../invitations/invitations.service';
    // ...
    private readonly invitations = inject(InvitationsService);

    private readonly handlers: TopicHandler[] = [
      { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
      { prefix: 'partie:', notifyChanged: () => this.characters.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.hommeDragon.notifyChanged() },
      // Story 21.1 : première entrée au préfixe 'user:' — matchingHandlers()/onSignal() sont déjà
      // génériques par préfixe (Story 18.2), aucune adaptation nécessaire pour ce nouveau préfixe.
      { prefix: 'user:', notifyChanged: () => this.invitations.notifyChanged() },
    ];
    ```
  - Aucune circularité : `InvitationsService` n'importe pas `RealtimeService`. Le try/catch par handler (revue de code Story 19.1) protège déjà cette entrée sans modification supplémentaire.

- [x] **Task 4 — `Dashboard` : connexion SSE propre (topic utilisateur) + effet réactif (AC2, AC3)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/dashboard/dashboard.ts` (55 lignes). Aucun `effect()`/constructeur/`DestroyRef`/`AuthService`/`RealtimeService` existant. `ngOnInit()` appelle `loadInvitations()` (méthode privée déjà existante, SANS dépendance à un état interne du composant — contrairement à `refreshScenario()`/`refreshCharacter()`/`refreshHommeDragon()` des stories précédentes, elle ne lit AUCUN signal du composant avant de fetcher, seulement `this.invitations.listReceived()`).
  - **`Dashboard` a besoin de sa propre connexion SSE** (comme `CalendarView`/`CharacterSheet`) — route racine (`path: ''`, `app.routes.ts`), jamais embarqué comme enfant d'un autre composant qui maintiendrait déjà une connexion `user:{id}` (les connexions déjà existantes du projet sont TOUTES scopées `partie:{id}`, jamais `user:{id}` — c'est la PREMIÈRE connexion sur ce préfixe dans tout le projet).
  - `AuthService.currentUser()` est **garanti non-null** au montage de `Dashboard` : la route est protégée par `authGuard` (`apps/web/src/app/core/auth/auth.guard.ts`), qui appelle `auth.loadSession()` et bloque la navigation (`redirectTo: '/login'`) tant que `currentUser()` n'est pas peuplé — vérifié empiriquement, aucune garde défensive supplémentaire nécessaire au-delà d'un simple `if (id)` de robustesse TypeScript (le type reste `AuthUser | null`).
  - **Pas de piège de timing `refreshX()`/`ngOnInit()` à gérer ici** (contrairement à `CharacterSheet`/`HommeDragonSheet`, Story 20.1/20.2) : `loadInvitations()` ne lit aucun signal du composant avant de fetcher — elle peut être réutilisée **telle quelle**, à l'identique, par le fetch initial de `ngOnInit()` ET par le déclenchement temps réel, sans risque de course sur un état pas encore peuplé. Le garde `firstRun` reste néanmoins nécessaire, mais uniquement pour éviter un **double appel réseau redondant** au montage (même raison que Story 20.1/20.2 : `InvitationsService` étant `providedIn: 'root'`, son signal `_changed` peut déjà porter une valeur non-nulle avant le montage), pas pour éviter un crash :
    ```typescript
    import { Component, DestroyRef, OnInit, effect, inject, signal, untracked } from '@angular/core';
    // ...
    import { AuthService } from '../../core/auth/auth.service';
    import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';

    export class Dashboard implements OnInit {
      private readonly modeSvc = inject(ModeService);
      private readonly invitations = inject(InvitationsService);
      private readonly openPollsSvc = inject(OpenPollsService);
      protected readonly theme = inject(ThemeToneService);
      private readonly auth = inject(AuthService);
      private readonly realtime = inject(RealtimeService);
      private readonly destroyRef = inject(DestroyRef);
      // ... signaux existants inchangés ...

      constructor() {
        // Story 21.1 (AC2) : réagit au signal générique InvitationsService.changed (RealtimeService).
        // PIÈGE (même classe que Story 20.1/20.2, mais SANS le piège de timing associé) :
        // Dashboard a DÉJÀ un chargement dédié dans ngOnInit(). La première exécution d'un effect()
        // a lieu à la CONSTRUCTION du composant — un garde firstRun neutralise cette première
        // exécution pour éviter un refetch redondant avec celui que ngOnInit() fait juste après.
        let firstRun = true;
        effect(() => {
          this.invitations.changed();
          if (firstRun) {
            firstRun = false;
            return;
          }
          untracked(() => void this.loadInvitations());
        });
      }

      async ngOnInit(): Promise<void> {
        const id = this.auth.currentUser()?.id;
        if (id) {
          this.realtime.connect(userTopic(id));
          this.destroyRef.onDestroy(() => this.realtime.disconnect(userTopic(id)));
        }
        await this.loadInvitations();
      }

      // ... reste INCHANGÉ (accept/decline/loadInvitations) ...
    }
    ```
  - **AC3 confirmée sans modification** : `this.playerParties = this.modeSvc.playerParties` (ligne 27 actuelle) n'est touché nulle part dans cette story — `ModeService` reste hors scope (Story 22.1, FR-14).

- [x] **Task 5 — Tests (AC1, AC2)**
  - **`realtime.controller.spec.ts`** (`apps/api/src/realtime/`) : nouveaux tests pour `userEvents()`, même style que `partieEvents()` (lignes 31-63 actuelles) :
    - `emit(userTopic('u1'))` après connexion sur `userEvents({ id: 'u1' })` → l'`Observable` remonte `{ data: {} }`.
    - `emit(userTopic('autre-utilisateur'))` → aucun `MessageEvent` ne remonte sur le flux de `'u1'` (filtrage par topic traversé sans casse, même style que le test `partieEvents` existant lignes 53-63).
    - Pas de test « non-membre → Forbidden » ici (pas de contrôle d'appartenance à tester, contrairement à `partieEvents` — AC1 le précise explicitement).
  - **`invitations.service.spec.ts`** (backend, `apps/api/src/invitations/`) — **aucun nouveau test requis** : `emit(userTopic(...))` sur `create()`/`revoke()` est déjà couvert (lignes 107 et 169 actuelles, vérifié empiriquement). Ne pas dupliquer.
  - **`invitations.service.spec.ts`** (frontend, `apps/web/src/app/core/invitations/`) — **NOUVEAU FICHIER** (n'existe pas encore, contrairement à `character.service.spec.ts`/`homme-dragon.service.spec.ts` qui préexistaient). Même structure que `character.service.spec.ts` (`HttpTestingController`, `provideHttpClient()`/`provideHttpClientTesting()`) :
    - `listReceived()` → `GET /invitations`, `withCredentials: true`.
    - `accept(id)` → `POST /invitations/:id/accept`.
    - `decline(id)` → `POST /invitations/:id/decline`.
    - `notifyChanged()` incrémente `changed()` — même style que `character.service.spec.ts`/`homme-dragon.service.spec.ts` (Story 20.1/20.2).
    - **Attention** : ce service utilise `const API = 'http://localhost:3000';` en dur (pas `API_BASE` importé de `../api-base`) — utiliser cette même chaîne littérale dans les assertions d'URL du nouveau fichier de test, ne pas importer `API_BASE` par erreur (incohérence pré-existante, non corrigée par cette story, cf. Task 2).
  - **`realtime.service.spec.ts`** (frontend) : ajouter un mock `InvitationsService` (`{ notifyChanged: vi.fn(), changed: signal(0) }`) au `beforeEach`, à côté des mocks `PartiesService`/`ScenariosService`/`CharacterService`/`HommeDragonService` déjà présents. Nouveaux tests :
    - `emit('open')` sur `connect(userTopic('u1'))` déclenche `invitationsSvc.notifyChanged` (PAS les quatre handlers `'partie:'`, préfixe différent).
    - `emit('open')` sur `connect(partieTopic('p1'))` déclenche les quatre handlers `'partie:'` mais PAS `invitationsSvc.notifyChanged` (symétrique du test déjà existant « un topic 'user:' ne déclenche PAS notifyChanged() de PartiesService », lignes ~142-148 actuelles).
  - **`dashboard.spec.ts`** (factory `createFixture()` partagée, ligne 41) — **régression transitive à corriger** : ce fichier ne fournit actuellement AUCUN mock `AuthService`/`RealtimeService` (`Dashboard` ne les injectait pas avant cette story) :
    - Ajouter `{ provide: AuthService, useValue: { currentUser: signal({ id: 'u1' } as AuthUser) } }`.
    - Ajouter `{ provide: RealtimeService, useValue: { connect: vi.fn(), disconnect: vi.fn() } }`, retourné dans l'objet de résultat (`{ fixture, realtimeSvc }` ou équivalent).
    - Ajouter `changed: signal(0)` au mock `InvitationsService` (ligne 55 actuelle).
    - Nouveau test : `connect()` appelé avec `userTopic('u1')` au montage.
    - Nouveau test : `disconnect()` appelé à `fixture.destroy()`.
    - Nouveau test (AC2) : `invitationsSvc.changed.update(v => v+1)` après montage (flush microtasks, pattern déjà établi) → `invitationsSvc.listReceived` rappelé une deuxième fois, `comp.received()` reflète le nouveau retour.
    - Nouveau test (garde `firstRun`) : créer le composant avec `changed: signal(1)` déjà à une valeur non-nulle avant montage → `invitationsSvc.listReceived` n'est appelé qu'**une seule fois**. `Dashboard` ne rend aucun composant enfant réagissant lui-même à `InvitationsService.changed` — un compte exact de `1` est fiable ici.

- [x] **Task 6 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (883 tests avant cette story, Story 20.2, + les nouveaux tests Task 5).
  - `docker compose exec api pnpm test` — 0 régression (suite backend, + les nouveaux tests `realtime.controller.spec.ts`).
  - Aucune migration Prisma, aucun changement de schéma.
  - Fichiers modifiés attendus : `apps/api/src/realtime/realtime.controller.ts` (+ spec), `apps/web/src/app/core/invitations/invitations.service.ts` (+ nouveau spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/dashboard/dashboard.ts` (+ spec). **Aucune modification** `apps/api/src/realtime/realtime-events.service.ts`/`realtime.module.ts` (déjà génériques/complets), `apps/api/src/invitations/invitations.service.ts` (émission déjà en place), `PartiesService`/`ScenariosService`/`CharacterService`/`HommeDragonService` (frontend, déjà complets), `ModeService`/`OpenPollsService` (hors scope, Story 22.1).

## Dev Notes

### Architecture — première story de l'Epic 21 (`ARCHITECTURE-SPINE.md`, Palier 7)

Cette story diffère structurellement des Stories 19.x/20.x : c'est la **première** à toucher le **préfixe de topic `'user:'`** (toujours `'partie:'` jusqu'ici) — cf. **AD-7** : *« Deux formes de topic coexistent : partie:{partieId}... et user:{userId} (FR-11, invitations reçues) »*. La bonne nouvelle : `userTopic()`/`urlForTopic()` (branche `'user:'`) existent déjà des deux côtés (backend `realtime-events.service.ts`, frontend `realtime.service.ts`) depuis la Story 18.2 — cette story n'a **aucune** fondation à poser, seulement à câbler un CINQUIÈME service de domaine (`InvitationsService`) et une PREMIÈRE route backend sur ce préfixe déjà prévu.

### Pourquoi `Dashboard` a besoin de sa propre connexion SSE

`Dashboard` est monté sur la route racine (`path: ''`, `app.routes.ts`) — jamais un enfant d'un autre composant. C'est aussi la toute première connexion du projet sur le préfixe `'user:'` (toutes les connexions existantes, `PartieDetail`/`CalendarView`/`ScenarioEditor`/`CharacterSheet`, sont scopées `'partie:'`) — aucune connexion ancêtre à réutiliser, même en théorie.

### Pourquoi il n'y a PAS de piège de timing ici (contrairement à Story 20.1/20.2)

`loadInvitations()` (méthode privée déjà existante) ne lit AUCUN signal du composant avant de fetcher — elle appelle directement `this.invitations.listReceived()` et écrase `this.received`. Contrairement à `refreshCharacter()`/`refreshHommeDragon()` (qui devaient impérativement rester indépendantes du fetch initial de `ngOnInit()`, sous peine de lire un signal `undefined`/`null` pas encore peuplé), `loadInvitations()` peut être réutilisée **à l'identique** par les DEUX chemins (fetch initial ET déclenchement temps réel) sans aucun risque. Le garde `firstRun` reste nécessaire, mais uniquement pour économiser un appel réseau redondant au montage — pas pour éviter un bug.

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis (`createFixture()` partagée par fichier).
- `apps/api` : Jest, patterns déjà établis (`realtime.controller.spec.ts` existant, même style pour les nouveaux tests `userEvents()`).
- Tests async (fetch simulé, frontend) : flush de microtasks via la boucle déjà établie (`for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`), pas `whenStable()` seul (zoneless, cf. mémoire projet `jdr-zoneless-test-timing`).
- **Nouveau fichier à créer** : `apps/web/src/app/core/invitations/invitations.service.spec.ts` n'existe pas encore — à créer de zéro, pas à étendre (contrairement à toutes les stories précédentes de ce palier).
- **Régression transitive à corriger** : `dashboard.spec.ts` ne mock actuellement ni `AuthService` ni `RealtimeService` — à ajouter avant d'exécuter la suite complète, sinon échec immédiat sur `inject(AuthService)`/`inject(RealtimeService)` non fourni.

### Previous Story Intelligence (Story 19.1/20.1/20.2)

- Établi : vérifier empiriquement toute divergence entre l'hypothèse de câblage et le rendu réel des templates/routes avant de décider si une connexion SSE propre est nécessaire — ici, confirmé sans ambiguïté (route racine, jamais embarqué).
- Story 20.1/20.2 ont établi la convention du garde `firstRun` testé dès l'implémentation initiale (pas seulement en revue) — reproduit ici (Task 5), avec la nuance que le risque évité est purement une économie réseau, pas un bug de timing (cf. Dev Notes ci-dessus).
- Story 19.1 a établi le pattern de régression transitive (composant enfant lisant un nouveau `XService.changed`/injectant un nouveau service casse silencieusement les mocks existants) — anticipé ici pour `dashboard.spec.ts` (absence totale de mock `AuthService`/`RealtimeService` avant cette story).

### Project Structure Notes

- Fichiers modifiés : `apps/api/src/realtime/realtime.controller.ts` (+ spec), `apps/web/src/app/core/invitations/invitations.service.ts` (+ **nouveau** spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/dashboard/dashboard.ts` (+ spec).
- Aucun fichier nouveau côté composant/service applicatif — seul le fichier de test `invitations.service.spec.ts` (frontend) est entièrement nouveau.
- Aucune migration, aucun changement de schéma.
- `RealtimeService.handlers` passe de 4 à 5 entrées — la première au préfixe `'user:'`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 21.1 complète, AC1-AC3, lignes 267-285)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-4 § binds explicite `InvitationsService`, AD-7 — clé de topic généralisée, canal utilisateur)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18-p7/prd.md` (FR-11, §4.2 — note sur le canal utilisateur distinct)
- `_bmad-output/implementation-artifacts/20-2-cablage-hommedragonsheet-sur-le-signal-temps-reel.md` (garde `firstRun`, pattern `_changed`/`changed`/`notifyChanged()` — reproduits ici)
- `_bmad-output/implementation-artifacts/18-2-connexion-sse-et-reconnexion-cote-client.md` (fondations `userTopic()`/`urlForTopic()` déjà posées, des deux côtés, pour ce palier)
- Vérifications empiriques effectuées pendant la préparation de cette story : `apps/api/src/invitations/invitations.service.ts` émet déjà `realtimeEvents.emit(userTopic(...))` sur `create()`/`revoke()` (2 sites, déjà testés) ; `apps/api/src/realtime/realtime.controller.ts` porte déjà un commentaire annonçant cette story ; `userTopic()`/`urlForTopic()` déjà présents des deux côtés depuis la Story 18.2 ; `dashboard.spec.ts` ne mock ni `AuthService` ni `RealtimeService` aujourd'hui ; `apps/web/src/app/core/invitations/invitations.service.ts` n'a aucun fichier de spec associé aujourd'hui.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- `docker compose exec web pnpm test` — suite complète relancée après chaque tâche ; suite finale : 71 fichiers / 893 tests, 0 échec.
- `docker compose exec api pnpm test` — suite complète relancée ; suite finale : 45 suites / 885 tests, 0 échec (un log `ERROR` attendu apparaît dans `poll.controller.spec.ts`, propre à un test qui exerce délibérément un chemin d'échec — le test lui-même passe, non lié à cette story).

### Completion Notes List

- Task 1 : nouvelle route `GET /users/me/events` ajoutée à `RealtimeController` — synchrone (pas de `Promise`), aucun contrôle d'appartenance (l'identité de l'utilisateur authentifié EST le contrôle, AC1). Aucun changement à `realtime-events.service.ts`/`realtime.module.ts`/`invitations.service.ts` (backend) — tous déjà complets/génériques, confirmé empiriquement avant l'implémentation.
- Task 2 : `InvitationsService` (frontend) reçoit `_changed`/`changed`/`notifyChanged()` — copie exacte du pattern `CharacterService`/`HommeDragonService`. L'incohérence pré-existante (`const API = 'http://localhost:3000'` au lieu de `API_BASE`) n'a volontairement PAS été corrigée (hors scope).
- Task 3 : `RealtimeService.handlers` passe de 4 à 5 entrées — la cinquième est la PREMIÈRE au préfixe `'user:'` (toutes les précédentes étaient `'partie:'`). `userTopic()`/`urlForTopic()` existaient déjà depuis la Story 18.2, aucun changement structurel nécessaire.
- Task 4 : `Dashboard` ouvre sa propre connexion SSE (route racine, jamais embarqué) + réagit à `InvitationsService.changed` via un `effect()` gardé par `firstRun`. Contrairement aux Stories 20.1/20.2, `loadInvitations()` ne dépend d'aucun état du composant — réutilisée telle quelle par les deux chemins (fetch initial ET temps réel), sans piège de timing (le garde `firstRun` économise seulement un appel réseau redondant, ne prévient aucun bug).
- Task 5 : nouveau fichier `apps/web/src/app/core/invitations/invitations.service.spec.ts` créé de zéro (n'existait pas avant cette story). Régression transitive anticipée ET corrigée : `dashboard.spec.ts` ne fournissait aucun mock `AuthService`/`RealtimeService` avant cette story — corrigé dans la factory partagée `createFixture()` (désormais retourne `{ fixture, invitationsSvc, realtimeSvc }` au lieu de `fixture` seul ; les 2 tests existants adaptés en conséquence).
- Toutes les ACs (1, 2, 3) sont couvertes par des tests dédiés : route `userEvents()` scopée par utilisateur (AC1, `realtime.controller.spec.ts`) ; cinquième handler `'user:'` isolé des quatre handlers `'partie:'` (AC1, `realtime.service.spec.ts`) ; connexion/déconnexion SSE, rafraîchissement réactif et garde `firstRun` (AC2, `dashboard.spec.ts`) ; AC3 confirmée sans modification (`playerParties` intact).

### File List

- `apps/api/src/realtime/realtime.controller.ts` (+ spec)
- `apps/web/src/app/core/invitations/invitations.service.ts` (+ **nouveau** spec)
- `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec)
- `apps/web/src/app/features/dashboard/dashboard.ts` (+ spec)

## Change Log

- 2026-07-22 : Implémentation complète de la Story 21.1 (Tasks 1-6) — nouvelle route backend `GET /users/me/events`, introduction de l'infrastructure réactive `InvitationsService` (`_changed`/`changed`/`notifyChanged()`), cinquième entrée `RealtimeService.handlers` (première au préfixe `'user:'`), câblage temps réel de `Dashboard` (connexion SSE propre + effet réactif gardé par `firstRun`). 893/893 tests web + 885/885 tests API passants. Première story de l'Epic 21.

### Review Findings

Revue adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor) menée le 2026-07-23 sur `git diff fd13ffd..HEAD`. Acceptance Auditor : 0 violation (diff conforme aux AC1-AC3 et aux 6 tasks de la story). 0 decision-needed, 0 patch, 3 defer, 9 findings écartés (patterns pré-existants/hors scope explicite, cf. détail dans les transcripts de revue).

- [x] [Review][Defer] Lecture unique et non réactive de `auth.currentUser()?.id` au montage de `Dashboard` [apps/web/src/app/features/dashboard/dashboard.ts:56] — deferred, pre-existing pattern. `ngOnInit()` lit `currentUser()?.id` une seule fois, synchrone, pas dans un `effect()`. Si le garde `authGuard` (qui bloque la navigation tant que `loadSession()` n'a pas peuplé `currentUser()`, vérifié empiriquement par la story) venait à changer ou à être contourné par une future route, la connexion temps réel ne s'activerait jamais, silencieusement, pour toute la durée de vie du composant, sans aucun test couvrant ce cas. Aucune régression de cette story : c'est la première fois que le projet ouvre une connexion scopée `user:`, donc aucun précédent à comparer, mais le choix (dépendre d'une garantie externe plutôt que de rendre la lecture réactive) est cohérent avec l'analyse explicite des Dev Notes de la story.
- [x] [Review][Defer] Rattrapage `'open'` (SSE) déclenche un double fetch non séquencé au montage/reconnexion [apps/web/src/app/core/realtime/realtime.service.ts:83, apps/web/src/app/features/dashboard/dashboard.ts:60] — deferred, pre-existing. `connect()` déclenche `notifyChanged()` sur `'open'` (connexion initiale ET chaque reconnexion, AD-8, documenté) qui course avec l'appel explicite `loadInvitations()` de `ngOnInit()`, sans `AbortController`/jeton de séquence — la réponse la plus lente écrase l'autre. Comportement identique et déjà accepté pour les 4 handlers `'partie:'` existants depuis la Story 18.3 ; `GET /invitations` étant idempotent, le pire cas est un affichage transitoirement périmé, jamais une corruption, cohérent avec la tolérance déjà actée (NFR1, cf. defer similaire sur la Story 18.3/`PartieDetail.refreshPartie()`).
- [x] [Review][Defer] `loadInvitations()` vide la liste sur toute erreur réseau, chemin désormais emprunté plus souvent [apps/web/src/app/features/dashboard/dashboard.ts:75] — deferred, pre-existing. Le catch-all existant (`this.received.set([])`) est maintenant aussi déclenché par chaque signal temps réel (mount, reconnexion, changement réel), donc un simple aléa réseau transitoire peut vider une liste d'invitations pourtant déjà chargée avec succès, sans distinction UI entre « aucune invitation » et « dernier rafraîchissement en échec ». Contrat pré-existant de la méthode, non modifié par cette story, hors scope des AC.
