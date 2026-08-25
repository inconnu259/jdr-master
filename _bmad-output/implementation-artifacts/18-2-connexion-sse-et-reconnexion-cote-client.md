---
baseline_commit: 6a1ca44faa0375199e360481a987065d00a8e0d5
---

# Story 18.2: Connexion SSE et reconnexion côté client

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que mon navigateur écoute les événements d'une Partie via une connexion SSE qui se rétablit silencieusement en cas de coupure,
so that je n'aie jamais à me soucier de la fiabilité de la connexion ni à voir un message d'erreur pour ça.

## Acceptance Criteria

1. **Given** l'endpoint `GET /parties/:id/events` **When** un client authentifié membre de la Partie ouvre une connexion **Then** il reçoit les événements de cette Partie ; un utilisateur non membre reçoit un refus (même contrôle `getViewable` que le reste de l'API).
2. **Given** la connexion `EventSource` du client **When** elle est instanciée **Then** elle est créée avec `{ withCredentials: true }` (le cookie de session est transmis, y compris en dev cross-origin).
3. **Given** une coupure de connexion (réseau instable, mise en veille) **When** le navigateur reconnecte automatiquement (comportement natif `EventSource`, aucun wrapper de retry custom) **Then** aucun indicateur d'erreur ou de statut de connexion n'est affiché à l'utilisateur.
4. **Given** une connexion qui s'ouvre (connexion initiale ou reconnexion réussie) **When** l'événement `open` se déclenche **Then** un refetch complet des données du topic concerné est déclenché — rattrape tout ce qui aurait pu être manqué pendant la coupure. **De même, chaque événement serveur reçu pendant une connexion stable** (`message`, un par `emit()` côté backend) **déclenche le même refetch** — le rattrapage sur `open` est un filet de sécurité additionnel, pas le seul chemin de notification (FR-3 : « rattrape tout ce qui aurait pu être manqué... pas seulement un rejeu des événements ratés »).
5. **Given** un composant qui quitte la Partie (changement de page, fermeture d'onglet) **When** il est détruit **Then** sa connexion SSE est fermée proprement (`DestroyRef`, côté composant consommateur — hors scope de cette story, cf. Dev Notes), sans laisser de connexion orpheline. Pour cette story : `disconnect(topic)` doit fermer exactement la connexion `EventSource` sous-jacente qu'un `DestroyRef.onDestroy()` appellerait.

## Tasks / Subtasks

- [x] **Task 1 — Endpoint backend `GET /parties/:id/events` (AC1, AC2)**
  - Nouveau fichier `apps/api/src/realtime/realtime.controller.ts` :
    ```typescript
    import { Controller, Get, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
    import type { Observable } from 'rxjs';
    import { map } from 'rxjs/operators';
    import type { AuthUser } from '@master-jdr/shared';
    import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
    import { CurrentUser } from '../common/current-user.decorator';
    import { PartiesService } from '../parties/parties.service';
    import { RealtimeEventsService, partieTopic } from './realtime-events.service';

    @UseGuards(AuthenticatedGuard)
    @Controller()
    export class RealtimeController {
      constructor(
        private readonly parties: PartiesService,
        private readonly realtimeEvents: RealtimeEventsService,
      ) {}

      @Sse('parties/:id/events')
      async partieEvents(
        @Param('id') id: string,
        @CurrentUser() user: AuthUser,
      ): Promise<Observable<MessageEvent>> {
        await this.parties.getViewable(id, user.id); // AD-5 : même contrôle que le reste de l'API — lève 403/404 si non membre
        return this.realtimeEvents
          .subscribe(partieTopic(id))
          .pipe(map(() => ({ data: {} })));
      }
    }
    ```
    **Pourquoi `async ... Promise<Observable<...>>` et pas un `Observable` construit de façon synchrone** : `getViewable()` doit être résolu (et donc pouvoir rejeter en 403/404) **avant** que la connexion SSE ne s'ouvre — NestJS attend la résolution de la Promise avant d'établir le flux `@Sse()`, donc un rejet ici produit une réponse HTTP d'erreur normale (géré par le filtre d'exception global comme n'importe quelle autre route), pas une connexion SSE ouverte puis fermée abruptement.
    **Pourquoi `data: {}`** : NFR1 (« aucune garantie de livraison de type messagerie... un refetch complet... réponse acceptable ») — le payload SSE n'a besoin de porter aucune information, il sert uniquement de signal « quelque chose a changé sur ce topic, refetch ». `RealtimeEventsService.subscribe()` (Story 18.1) reste inchangé, `Observable<{ topic: string }>` — l'adaptation vers `Observable<MessageEvent>` (type NestJS, importé de `@nestjs/common`) se fait ici, dans le controller, pas dans le service (le bus interne reste agnostique du format SSE/HTTP).
  - **`GET /users/me/events` : explicitement HORS SCOPE de cette story** — écart assumé avec le Structural Seed de l'architecture (`ARCHITECTURE-SPINE.md`, Palier 7), qui liste les deux routes dans le même fichier `realtime.controller.ts`. Vérifié dans `epics-palier7.md` : l'Acceptance Criteria de **Story 18.2 ne mentionne que `GET /parties/:id/events`** ; `GET /users/me/events` n'apparaît que dans l'AC de **Story 21.1** (« Canal utilisateur et câblage Dashboard »), qui couvre FR-11. Même méthodologie que Story 18.1 (§ InvitationsService vs InviteLinksService) : le texte normatif de l'Epic Breakdown/FR Coverage Map fait foi sur le Structural Seed, qui n'est qu'illustratif. Ne pas créer cette route maintenant.
  - Enregistrer `RealtimeController` dans `RealtimeModule` (`controllers: [RealtimeController]`) et ajouter `imports: [PartiesModule]` (nouvelle dépendance — `RealtimeModule` n'importait rien jusqu'ici, cf. AD-9 : *"RealtimeModule -.->|AD-5, appel inline| PartiesModule"*). `PartiesModule` exporte déjà `PartiesService` (`apps/api/src/parties/parties.module.ts`, cité intégralement ci-dessous) — aucune circularité (`PartiesModule` n'importe pas `RealtimeModule`).
  - `RealtimeEventsService`/`RealtimeModule` (Story 18.1) restent inchangés — seul un nouveau fichier controller + la mise à jour de `RealtimeModule`.

- [x] **Task 2 — Tests backend (AC1, AC2)**
  - Nouveau `apps/api/src/realtime/realtime.controller.spec.ts`, pattern `Test.createTestingModule({ controllers: [RealtimeController], providers: [...mocks] })` (même style que `announcements.controller.spec.ts`, cité intégralement dans Dev Notes) :
    - Membre/MJ de la Partie → `parties.getViewable` appelé avec `(id, user.id)` ; `realtimeEvents.subscribe` appelé avec `partieTopic(id)` ; un `emit(partieTopic(id))` déclenché côté mock fait bien remonter un `MessageEvent` via l'`Observable` retourné (`firstValueFrom` + collecte manuelle, même pattern que `realtime-events.service.spec.ts` de la Story 18.1).
    - Non-membre → `parties.getViewable` rejette (`ForbiddenException`/`NotFoundException`), propagée par le controller, `realtimeEvents.subscribe` **jamais appelé** (pas de connexion ouverte avant l'échec de l'autorisation).
    - `emit()` sur un **autre** topic (`partie:autre-id`) → aucun `MessageEvent` ne remonte sur l'`Observable` du client abonné à `partieTopic(id)` (AC de la Story 18.1 déjà couvert au niveau du bus, ce test prouve juste que le controller ne casse pas ce filtrage en le traversant).

- [x] **Task 3 — Frontend `RealtimeService` (AC2, AC3, AC4, AC5)**
  - Nouveau fichier `apps/web/src/app/core/realtime/realtime.service.ts` :
    ```typescript
    import { Injectable } from '@angular/core';
    import { API_BASE } from '../api-base';

    export function partieTopic(partieId: string): string {
      return `partie:${partieId}`;
    }

    export function userTopic(userId: string): string {
      return `user:${userId}`;
    }

    export interface TopicHandler {
      readonly prefix: string;
      notifyChanged(): void;
    }

    /** Pure, testable isolément — pas de couplage à Angular/EventSource. */
    export function matchingHandlers(
      handlers: readonly TopicHandler[],
      topic: string,
    ): TopicHandler[] {
      return handlers.filter((h) => topic.startsWith(h.prefix));
    }

    function urlForTopic(topic: string): string {
      if (topic.startsWith('partie:')) {
        return `${API_BASE}/parties/${topic.slice('partie:'.length)}/events`;
      }
      if (topic.startsWith('user:')) {
        return `${API_BASE}/users/me/events`;
      }
      throw new Error(`Topic non reconnu : ${topic}`);
    }

    @Injectable({ providedIn: 'root' })
    export class RealtimeService {
      // Table de correspondance topic-prefix -> services à notifier (AD-3). VIDE à la fin de
      // cette story — aucun composant n'appelle encore connect() (câblage = Story 18.3+). Étendue
      // au fil des stories de câblage suivantes, au fur et à mesure qu'un service de domaine
      // expose son propre notifyChanged() (AD-4). Jamais peuplée depuis l'extérieur : le composant
      // appelant connect()/disconnect() ne choisit jamais quels services sont notifiés (AD-3).
      private readonly handlers: TopicHandler[] = [];

      // Une entrée par connexion active (pas par topic) — deux connect() sur le même topic ouvrent
      // deux EventSource indépendants, jamais partagés/dédupliqués (AD-6, "Prevents" : pas de
      // registre global de connexions actives par topic). disconnect() dépile la plus récente
      // (LIFO) : discipline naturelle pour un dialogue ouvert par-dessus une page déjà connectée
      // sur le même topic (Epic 19, ScenarioEditor/ScenarioReadDialog) — le dialogue se ferme
      // toujours avant la page qui l'a ouvert.
      private readonly connections = new Map<string, EventSource[]>();

      connect(topic: string): void {
        const es = new EventSource(urlForTopic(topic), { withCredentials: true });
        const onSignal = () => {
          for (const h of matchingHandlers(this.handlers, topic)) h.notifyChanged();
        };
        // 'open' : connexion initiale ET chaque reconnexion réussie (AC4, AD-8) — rattrapage.
        // 'message' : un par emit() serveur reçu pendant une connexion stable (AC4) — chemin
        // primaire de notification, pas seulement le rattrapage post-coupure.
        es.addEventListener('open', onSignal);
        es.addEventListener('message', onSignal);
        // Aucun listener 'error' : reconnexion native EventSource, silencieuse (AC3, AD-8) —
        // ajouter un listener ici pour afficher un statut violerait AC3.
        const list = this.connections.get(topic) ?? [];
        list.push(es);
        this.connections.set(topic, list);
      }

      disconnect(topic: string): void {
        const list = this.connections.get(topic);
        if (!list || list.length === 0) return; // no-op défensif — idempotent (cf. Dev Notes)
        const es = list.pop()!;
        es.close();
        if (list.length > 0) this.connections.set(topic, list);
        else this.connections.delete(topic);
      }
    }
    ```
  - **Pourquoi `handlers` reste un tableau vide en sortie de cette story** : `matchingHandlers()` est testée directement (Task 4) avec des données de test littérales — la mécanique de câblage est prouvée fonctionnelle sans dépendre d'aucun service de domaine réel. `ScenariosService`/`PartiesService` (candidats potentiels pour un futur `notifyChanged()`) ne sont PAS modifiés par cette story : `PartieDetail` (Story 18.3, FR-4) ne consomme aujourd'hui **pas** `ScenariosService.changed` (vérifié dans `partie-detail.ts` — son rafraîchissement passe par son propre `refreshPartie()` local, pas par ce signal) ; c'est `ScenarioTimeline` (Story 19.1, FR-5) qui le consomme. Quel service exact recevra la première entrée de `handlers` est une décision qui appartient à Story 18.3 ou 19.1, pas à celle-ci — ne pas anticiper.
  - **Pourquoi `matchingHandlers()` est une fonction pure exportée**, plutôt qu'une méthode privée testée via un contournement `(service as any).handlers` : aucun pattern de ce type (accès à un champ privé depuis un spec) n'existe ailleurs dans `apps/web` (vérifié) — cohérent avec l'absence de ce pattern dans la convention établie du projet.

- [x] **Task 4 — Tests frontend (AC2, AC3, AC4, AC5)**
  - **Piège empirique vérifié** : `jsdom` (version actuelle du projet, `^28.0.0`) **n'implémente pas `EventSource`** (`'EventSource' in window` → `false`, vérifié directement dans le conteneur `web`). Tout test de `RealtimeService` doit fournir un **stub `global.EventSource`** avant d'appeler `connect()`, sinon `new EventSource(...)` lève `EventSource is not defined`.
  - Nouveau `apps/web/src/app/core/realtime/realtime.service.spec.ts` : `TestBed.configureTestingModule({})` + `TestBed.inject(RealtimeService)` (même style que les autres services `core/`, même sans provider à fournir ici — pas de `HttpClient` injecté, contrairement à `ScenariosService`). Stub minimal :
    ```typescript
    class FakeEventSource {
      static instances: FakeEventSource[] = [];
      readonly listeners = new Map<string, (() => void)[]>();
      closed = false;
      constructor(public readonly url: string, public readonly init?: EventSourceInit) {
        FakeEventSource.instances.push(this);
      }
      addEventListener(type: string, cb: () => void): void {
        (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)!).push(cb);
      }
      close(): void {
        this.closed = true;
      }
      emit(type: string): void {
        (this.listeners.get(type) ?? []).forEach((cb) => cb());
      }
    }
    ```
    Tests :
    - `connect(partieTopic('p1'))` → `EventSource` construit avec `url = '${API_BASE}/parties/p1/events'` et `init = { withCredentials: true }` (AC2).
    - `matchingHandlers([{ prefix: 'partie:', notifyChanged }], 'partie:p1')` → retourne le handler ; `matchingHandlers([...], 'user:u1')` avec le même handler → tableau vide (fonction pure, testée directement, sans EventSource).
    - `FakeEventSource.emit('open')` après `connect()` → déclenche le rattrapage attendu (à défaut de handler enregistré en prod, prouver via une instance de `RealtimeService` construite manuellement avec un handler injecté en test — voir note ci-dessous) (AC4).
    - `FakeEventSource.emit('message')` → même comportement que `'open'` (AC4, chemin primaire).
    - Aucun listener `'error'` enregistré (`fakeEs.listeners.get('error')` est `undefined`) — non-régression AC3.
    - `disconnect(topic)` → `fakeEs.closed === true` (AC5).
    - Deux `connect()` successifs sur le **même** topic → deux instances `FakeEventSource` distinctes créées (`FakeEventSource.instances.length === 2`) ; deux `disconnect()` successifs ferment les **deux**, indépendamment (AD-6, non-régression anti-dédup).
    - `disconnect()` sur un topic jamais connecté → ne lève pas, no-op silencieux.
  - **Pour tester le déclenchement effectif de `notifyChanged()` via `matchingHandlers`/`handlers`** sans dépendre d'un vrai service de domaine (qui n'existe pas encore, cf. Task 3) : `matchingHandlers()` étant une fonction pure exportée, il suffit de la tester directement avec des données littérales (pas besoin de la faire passer par une instance de `RealtimeService` réelle) — le test d'intégration `connect()` → `'open'`/`'message'` → notification n'a donc besoin de vérifier que le MÉCANISME D'APPEL (que la boucle sur `matchingHandlers(this.handlers, topic)` s'exécute), pas un vrai `notifyChanged()` métier. Étant donné que `handlers` est un champ privé sans setter public (Task 3), et qu'aucun pattern `(service as any)` n'est utilisé dans ce projet : **accepter que ce chemin bout-en-bout précis (`connect()` → `open`/`message` → `handlers` réellement peuplé → `notifyChanged()` appelé) ne soit prouvé de façon complète qu'à partir de la story qui peuple `handlers` pour la première fois** (Story 18.3 ou 19.1) — cette story-ci prouve `matchingHandlers()` juste (fonction pure) ET que `connect()` déclenche bien `onSignal` sur `'open'`/`'message'` (observable indirectement : espionner `matchingHandlers` via `vi.spyOn` sur le module exporté, ou vérifier qu'aucune exception n'est levée et que le flux s'exécute jusqu'au bout). Ne pas sur-tester un mécanisme qui n'a pas encore de consommateur réel.

- [x] **Task 5 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression (879 tests avant cette story, + les nouveaux tests Task 2).
  - `docker compose exec api pnpm typecheck` — propre.
  - `docker compose exec web pnpm test` — 0 régression, + les nouveaux tests Task 4.
  - Aucune migration Prisma, aucun changement de schéma.
  - `git status`/diff en fin de story : `apps/api/src/realtime/realtime.controller.ts` (+ spec, nouveaux), `apps/api/src/realtime/realtime.module.ts` (modifié — `controllers`/`imports`), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec, nouveaux). **Aucune modification** de `ScenariosService`, `PartiesService`, `PartieDetail`, ou de tout autre composant/service consommateur (câblage = Story 18.3+).

### Review Findings

- [x] [Review][Patch] Absence de préfixe de classe sur `RealtimeController` — commentaire explicatif ajouté [apps/api/src/realtime/realtime.controller.ts]
- [x] [Review][Defer] Pas de re-vérification d'appartenance pendant la durée de vie du flux SSE ouvert [apps/api/src/realtime/realtime.controller.ts] — deferred, risque nul (payload vide, tout refetch réel repasse par getViewable/getOwned)

## Dev Notes

### Architecture — deuxième moitié du bus temps réel (`ARCHITECTURE-SPINE.md`, Palier 7)

Story 18.1 a livré la moitié backend du bus (`RealtimeModule`/`RealtimeEventsService`, émission scopée). Cette story livre le **mécanisme générique de connexion côté client** — l'endpoint SSE authentifié et le service Angular `RealtimeService` (`connect`/`disconnect`, reconnexion, rattrapage). **Aucun composant n'est câblé** (aucun appel réel à `connect()`) — c'est Story 18.3 (`PartieDetail`, FR-4) puis les stories de l'Epic 19+ qui consommeront ce mécanisme.

**AD-5 (sécurité SSE)** : *"`GET /parties/:id/events`... applique le même contrôle d'appartenance que les routes REST existantes — `PartiesService.getViewable(partieId, userId)` avant d'ouvrir le flux SSE. Pas de nouveau guard NestJS dédié."* Cité intégralement à la Task 1.

**AD-6 (pas de déduplication de connexions)** : *"Chaque composant routé... ouvre sa propre connexion `EventSource` au montage et la ferme à la destruction... Deux composants simultanément ouverts sur le même topic... maintiennent chacun leur propre connexion, sans partage."* **Prevents** explicite : *"une couche de partage/déduplication de connexions (registre global de connexions actives par topic)"* — directement pertinent pour la conception de `connections: Map<string, EventSource[]>` (Task 3) : une pile par topic, jamais une seule entrée réutilisée.

**AD-8 (reconnexion native)** : *"Aucun wrapper de reconnexion... `EventSource` reconnecte nativement après coupure... Sur l'événement `open`... `RealtimeService` appelle `notifyChanged()` sur tous les services de domaine mappés à ce topic."*

**AD-3 (API publique fixe)** : *"`connect(topic: string): void` / `disconnect(topic: string): void` — aucune variante n'accepte une liste de services en paramètre... Un composant appelle uniquement `connect`/`disconnect` avec un topic ; il ne choisit jamais quels services sont notifiés."*

### Pourquoi `GET /users/me/events` est hors scope (écart documenté avec le Structural Seed)

Voir Task 1 pour la citation exacte. Résumé : le Structural Seed de l'architecture (illustratif) liste les deux routes dans le même fichier ; le texte normatif (AC de Story 18.2 vs Story 21.1 dans `epics-palier7.md`) les sépare clairement. Même méthodologie de résolution que Story 18.1 (InvitationsService vs InviteLinksService) : le texte normatif fait foi.

### Pourquoi `handlers` reste vide en sortie de cette story (anti pattern "code mort")

Voir Task 3. Ce n'est pas une lacune : c'est une table centrale unique (AD-3, *"câblé une fois dans `RealtimeService` lui-même"*), construite incrémentalement par les stories de câblage suivantes (déjà planifiées, pas hypothétiques — Story 18.3 est la story immédiatement suivante dans ce même epic). `matchingHandlers()` (fonction pure exportée) prouve le mécanisme de correspondance topic-prefix indépendamment de tout consommateur réel.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/realtime/realtime-events.service.ts`** (Story 18.1, 24 lignes, inchangé par cette story) :
  ```typescript
  import { Injectable } from '@nestjs/common';
  import { Subject, Observable } from 'rxjs';
  import { filter } from 'rxjs/operators';

  export function partieTopic(partieId: string): string {
    return `partie:${partieId}`;
  }
  export function userTopic(userId: string): string {
    return `user:${userId}`;
  }

  @Injectable()
  export class RealtimeEventsService {
    private readonly events$ = new Subject<{ topic: string }>();
    emit(topic: string): void {
      this.events$.next({ topic });
    }
    subscribe(topic: string): Observable<{ topic: string }> {
      return this.events$.pipe(filter((e) => e.topic === topic));
    }
  }
  ```
- **`apps/api/src/realtime/realtime.module.ts`** (Story 18.1, à modifier — Task 1) :
  ```typescript
  import { Global, Module } from '@nestjs/common';
  import { RealtimeEventsService } from './realtime-events.service';

  @Global()
  @Module({
    providers: [RealtimeEventsService],
    exports: [RealtimeEventsService],
  })
  export class RealtimeModule {}
  ```
  Devient : ajouter `imports: [PartiesModule]`, `controllers: [RealtimeController]`.
- **`apps/api/src/parties/parties.module.ts`** (9 lignes, cité intégralement) :
  ```typescript
  import { Module } from '@nestjs/common';
  import { AvailabilityModule } from '../availability/availability.module';
  import { PartiesService } from './parties.service';
  import { PartiesController } from './parties.controller';

  @Module({
    imports: [AvailabilityModule],
    controllers: [PartiesController],
    providers: [PartiesService],
    exports: [PartiesService],
  })
  export class PartiesModule {}
  ```
- **`apps/api/src/parties/parties.service.ts`** (`getViewable`, lignes 79-88 actuelles) : *"Récupère une partie visible par l'utilisateur : MJ **ou** membre (sinon 404 / 403)."* — exactement le contrôle requis par AD-5, aucune adaptation nécessaire.
- **`apps/api/src/auth/guards/authenticated.guard.ts`** et **`apps/api/src/common/current-user.decorator.ts`** (cités intégralement, 8 et 10 lignes) — mêmes `AuthenticatedGuard`/`CurrentUser` que tout le reste de l'API, aucun nouveau mécanisme d'auth (AD-5).
- **`apps/api/src/main.ts`** (config session/CORS, lignes 1-58) : confirme `withCredentials: true` nécessaire côté client — cookie de session `httpOnly`/`sameSite: 'lax'`, CORS avec `credentials: true` pour `WEB_ORIGIN` (dev cross-origin `ng serve` → API).
- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** (265 lignes) — **NON modifié par cette story** (cf. "Pourquoi `handlers` reste vide"). Contient déjà un `_changed`/`changed`/`notifyChanged(partieId)` **privé** (Story 17.3) — pertinent seulement pour la story qui câblera `ScenariosService` dans `handlers` (probablement 19.1, pas celle-ci). **Piège à anticiper pour cette story future** (pas celle-ci) : le futur contrat public `notifyChanged(): void` (AD-4, zéro argument) entrerait en collision de nom avec la méthode privée existante `notifyChanged(partieId: string): void` — à renommer/fusionner à ce moment-là, pas maintenant.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** (patch `visibilitychange`, lignes 228-263) — **NON modifié par cette story** (Story 18.3). Confirmé : ne consomme **pas** `ScenariosService.changed` — son rafraîchissement (`refreshPartie()`) est un appel direct à `PartiesService.get()`.
- **`apps/web/src/app/core/api-base.ts`** : `export const API_BASE = 'http://localhost:3000';` — réutilisé tel quel pour construire l'URL de connexion SSE.

### Testing Standards

- `apps/api` : Jest, pattern controller déjà établi (`announcements.controller.spec.ts`, `Test.createTestingModule({ controllers: [...], providers: [mocks] })`) — pas de bootstrap `AppModule` complet (bug préexistant connu, `deferred-work.md`, Story 16.1).
- `apps/web` : Vitest + `TestBed`, même style que les autres services `core/`.
- **`jsdom` (^28.0.0) n'implémente pas `EventSource`** — vérifié empiriquement dans le conteneur `web` (`'EventSource' in window` → `false`). Tout test touchant `RealtimeService.connect()` doit stubber `global.EventSource` (cf. Task 4, `FakeEventSource`) avant l'appel, sinon `ReferenceError: EventSource is not defined`.
- Piège déjà documenté (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier — lancer `pnpm typecheck` après le câblage `RealtimeModule`/`PartiesModule`.

### Previous Story Intelligence (Story 18.1)

- Établi : vérifier empiriquement toute divergence entre epic/architecture et code réel avant d'écrire les tâches (reproduit ici pour `GET /users/me/events`, et pour l'absence de consommation de `ScenariosService.changed` par `PartieDetail`).
- Story 18.1 a laissé `RealtimeEventsService.emit()` propager une exception synchrone d'abonné comme item différé (`deferred-work.md`, "Deferred from: code review of 18-1..."), **pertinent pour cette story** : le controller `@Sse()` de cette story EST le premier abonné réel du bus — si un futur bug fait lever une exception dans le pipeline `subscribe().pipe(map(...))`, elle remonterait dans `emit()` côté appelant (ex. `ScenariosService.create()`), pas seulement dans la réponse SSE. Non traité par cette story (le `map()` ajouté ici — `() => ({ data: {} })` — ne peut structurellement pas lever), mais à garder en tête si un futur payload plus riche est introduit.
- Convention de tests établie (Story 18.1) : un test par site d'émission/comportement, pas de sur-couverture systématique — reproduite ici (Task 2/4 ciblent chaque AC précisément, sans dupliquer les tests déjà écrits pour `RealtimeEventsService` en Story 18.1).

### Project Structure Notes

- Fichiers nouveaux : `apps/api/src/realtime/realtime.controller.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec).
- Fichiers modifiés : `apps/api/src/realtime/realtime.module.ts` (imports/controllers).
- Aucune migration Prisma, aucun changement `ScenariosService`/`PartiesService`/composant frontend existant.
- `GET /users/me/events` explicitement différé à Story 21.1 (cf. Dev Notes).

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (lignes 139-166 — Story 18.2 complète, AC1-AC5 ; lignes 267-286 — Story 21.1, `GET /users/me/events`)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-1, AD-3, AD-5, AD-6, AD-7, AD-8, AD-9 ; Structural Seed ; Stack — version `@nestjs/common` déjà montée en Story 18.1)
- `_bmad-output/implementation-artifacts/18-1-bus-devenements-et-emission-scopee-par-partie-backend.md` (story précédente — bus backend déjà livré, méthodologie de vérification empirique)
- `_bmad-output/implementation-artifacts/deferred-work.md` (section "Deferred from: code review of 18-1...", pertinence directe pour le premier abonné réel du bus)
- [docs.nestjs.com — Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events) (via Context7, vérifié 2026-07-20) : `@Sse()` retourne `Observable<MessageEvent>`, `MessageEvent = { data: string | object; id?; type?; retry? }`, importé de `@nestjs/common`.
- Vérifications empiriques effectuées pendant la préparation de cette story : `jsdom` n'implémente pas `EventSource` (testé directement dans le conteneur `web`) ; `PartieDetail` ne consomme pas `ScenariosService.changed` (lecture directe du code) ; `ScenariosService.notifyChanged(partieId)` existe déjà en privé avec une signature différente du futur contrat public AD-4 (collision de nom à anticiper pour une story future, pas celle-ci) ; aucun pattern `(x as any).champPrivé` dans les specs `apps/web` existants ; `PartiesModule` exporte déjà `PartiesService`, aucune circularité avec `RealtimeModule`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

Implémentée le 2026-07-20 (bmad-dev-story), en TDD (RED → GREEN par task). Backend : nouveau `RealtimeController` (`@Sse('parties/:id/events')`, `AuthenticatedGuard` + `PartiesService.getViewable()` avant ouverture du flux, mappe `RealtimeEventsService.subscribe()` vers `Observable<MessageEvent>` via `.pipe(map(() => ({ data: {} })))`), enregistré dans `RealtimeModule` qui importe désormais `PartiesModule` (première dépendance du module, AD-9). `GET /users/me/events` volontairement non implémenté (hors scope, différé à Story 21.1, cf. Dev Notes). Frontend : nouveau `RealtimeService` (`connect`/`disconnect` avec pile `Map<topic, EventSource[]>` par topic pour supporter des connexions concurrentes indépendantes sans dédup, AD-6 ; `partieTopic`/`userTopic` ; `matchingHandlers()` fonction pure exportée, testée isolément ; table `handlers` volontairement vide, cf. Dev Notes). Écarts découverts et corrigés pendant l'implémentation (non anticipés par la story) : (1) `realtime.module.spec.ts` (Story 18.1) ne compilait plus une fois `PartiesModule` importé — `PrismaService` n'était visible nulle part dans ce graphe de test isolé (`PrismaModule` n'est `@Global()` que dans un vrai bootstrap `AppModule`) ; corrigé en important `PrismaModule` dans le module de test (aucune connexion réelle établie, `.compile()` n'appelle pas `onModuleInit()`) ; (2) même test cassé par un import runtime ESM de `GAME_SYSTEMS` depuis `@master-jdr/shared` remonté transitivement via `PartiesController` → `create-partie.dto.ts` — jamais rencontré avant car aucun autre spec n'importait le vrai `PartiesModule` ; corrigé par `jest.mock('@master-jdr/shared', ...)`, même mécanisme que le piège déjà documenté pour `@master-jdr/game-rules`. Suite finale : 882/882 tests API (+3), `pnpm typecheck` API propre, 846/846 tests web (+12, dont `RealtimeService` et les fonctions pures `partieTopic`/`userTopic`/`matchingHandlers`), aucune régression. Aucune modification de `ScenariosService`, `PartiesService`, ou de tout composant frontend existant, conformément au scope de la story.

### File List

- `apps/api/src/realtime/realtime.controller.ts` (nouveau)
- `apps/api/src/realtime/realtime.controller.spec.ts` (nouveau)
- `apps/api/src/realtime/realtime.module.ts` (modifié — `imports: [PartiesModule]`, `controllers: [RealtimeController]`)
- `apps/api/src/realtime/realtime.module.spec.ts` (modifié — `PrismaModule` importé + `jest.mock('@master-jdr/shared', ...)`, rendus nécessaires par l'ajout de `PartiesModule`)
- `apps/web/src/app/core/realtime/realtime.service.ts` (nouveau)
- `apps/web/src/app/core/realtime/realtime.service.spec.ts` (nouveau)

### Change Log

- 2026-07-20 : Implémentation complète de la story (Tasks 1-5), 882/882 tests API + 846/846 tests web, typecheck API propre, aucune régression.
