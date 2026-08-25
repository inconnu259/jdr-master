---
baseline_commit: 8820539cfe6ae44bd0bfda5f1fe9888d571f3732
---

# Story 18.3: Câblage PartieDetail sur le signal temps réel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que la page de détail d'une Partie reflète une modification faite par un autre membre sans que j'aie besoin de changer d'onglet puis d'y revenir,
so that je vois toujours l'état réel de la Partie.

## Acceptance Criteria

1. **Given** `PartieDetail` affiché sur une Partie **When** un autre membre modifie la Partie (ex. édition via `/parties/:id/edit` dans un autre onglet) **Then** la page se met à jour automatiquement, sans que l'onglet ait besoin de perdre puis regagner le focus.
2. **Given** le patch `visibilitychange` actuellement en place sur `PartieDetail` **When** le câblage SSE est en place **Then** ce patch est retiré (remplacé, pas cumulé) — un seul mécanisme de rafraîchissement pour ce composant.

## Tasks / Subtasks

- [x] **Task 1 — Lacune découverte : `PartiesService.update()` (backend) n'émet aucun événement temps réel (AC1)**
  - **Vérifié empiriquement** : `apps/api/src/parties/parties.service.ts` — `update()` (lignes 115-118 actuelles) ne contient aucun appel `realtimeEvents.emit()`. La Story 18.1 a câblé 6 services (`ScenariosService`, `PollService`, `CharacterService`, `HommeDragonService`, `InvitationsService`, `AnnouncementsService`) mais **jamais `PartiesService`** — absent du Structural Seed de l'architecture ET de la table de tâches de la Story 18.1. Sans ce câblage, l'exemple littéral de l'AC1 de cette story (« édition via `/parties/:id/edit` dans un autre onglet ») ne peut **structurellement pas** fonctionner, quel que soit le soin apporté au câblage frontend — aucune autre story du breakdown (Epic 18-22) ne couvre ce point. Écart résolu ici, dans le périmètre normatif de cette story (même méthodologie que Story 18.1 §InvitationsService/InviteLinksService et Story 18.2 §GET /users/me/events : le texte de l'AC fait foi).
  - Fichier `apps/api/src/parties/parties.service.ts` — ajouter au constructeur `private readonly realtimeEvents: RealtimeEventsService`, importer `{ RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service'`.
  - `update()` devient :
    ```typescript
    async update(id: string, userId: string, dto: UpdatePartieDto) {
      await this.getOwned(id, userId);
      const updated = await this.prisma.partie.update({ where: { id }, data: { ...dto } });
      this.realtimeEvents.emit(partieTopic(id));
      return updated;
    }
    ```
  - **`create()`/`remove()`/`removeMember()` : explicitement HORS SCOPE** — `create()` n'a pas de spectateur existant (Partie inexistante avant), `remove()`/`removeMember()` ne sont mentionnés par aucun AC de cette story (seule l'édition l'est). Ne pas les câbler — décision de scope assumée, à reconsidérer seulement si un besoin explicite émerge (noter dans Dev Notes).
  - `PartiesModule` **n'a pas besoin d'importer `RealtimeModule`** — `RealtimeEventsService` est déjà injectable partout via `@Global()` (Story 18.1). Aucune modification de `parties.module.ts`.

- [x] **Task 2 — Test backend (AC1)**
  - `apps/api/src/parties/parties.service.spec.ts` : le constructeur `new PartiesService(prisma, avail)` (ligne 86 actuelle, **seul site d'instanciation dans ce fichier**, vérifié) devient `new PartiesService(prisma, avail, realtimeEvents)` — ajouter `realtimeEvents = { emit: jest.fn() }` au `beforeEach`.
  - **Aucun test `update()` n'existe actuellement dans ce fichier** (vérifié — seuls `create`/`getAvailableSlots` sont couverts) : ajouter un test minimal couvrant à la fois le comportement existant et le nouvel emit :
    ```typescript
    it('update() émet un événement temps réel scopé sur la Partie (Story 18.3, AC1)', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie);
      prisma.partie.update.mockResolvedValue({ ...partie, name: 'Nouveau nom' });
      await service.update('p1', 'mj1', { name: 'Nouveau nom' });
      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });
    ```
    (`getOwned()` interne lit `prisma.partie.findUnique` — déjà mocké dans `beforeEach` pour les tests existants, vérifier la valeur de retour utilisée par les tests voisins avant d'écrire celui-ci.)

- [x] **Task 3 — Frontend `PartiesService` : contrat `notifyChanged()` (AD-4) (AC1)**
  - Fichier `apps/web/src/app/core/parties/parties.service.ts` — **aucun signal `changed`/`notifyChanged` n'existe actuellement** (vérifié, contrairement à `ScenariosService` qui l'a depuis la Story 17.3) : première introduction, pas une extension. Ajouter :
    ```typescript
    import { Injectable, inject, signal } from '@angular/core';
    // ...
    export class PartiesService {
      private readonly http = inject(HttpClient);

      // AD-4 : contrat public générique, zéro argument. Compteur simple (pas de scoping par
      // partieId comme ScenariosService/Story 17.3) — inutile ici : RealtimeService ne notifie ce
      // service que pour le topic `partie:{id}` sur lequel PartieDetail s'est explicitement
      // connecté (Story 18.2, un seul PartieDetail monté à la fois par instance d'app), donc tout
      // appel de notifyChanged() concerne nécessairement LA Partie actuellement affichée.
      private readonly _changed = signal(0);
      readonly changed = this._changed.asReadonly();
      notifyChanged(): void {
        this._changed.update((v) => v + 1);
      }

      // ... méthodes existantes inchangées (list/get/create/update/remove/...)
    }
    ```
  - **Ne PAS faire appeler `notifyChanged()` par `update()`/les autres méthodes de mutation locales de ce service** — contrairement à `ScenariosService` (qui notifie après CHAQUE mutation locale réussie, pattern pré-existant à ce palier, pour synchroniser d'autres composants de la MÊME instance d'app). Aucun autre composant ne consomme aujourd'hui un signal de changement de `PartiesService` en local — seul le déclenchement **distant** (SSE, Task 4) a besoin de ce contrat pour cette story. Ajouter cet appel local serait une extension non demandée par l'AC.

- [x] **Task 4 — Frontend `RealtimeService` : première entrée réelle dans `handlers` (AD-3, AD-4) (AC1)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (Story 18.2) — `handlers` était volontairement vide en sortie de la Story 18.2, avec la note explicite *"étendue au fil des stories de câblage suivantes"*. Cette story la peuple pour la première fois :
    ```typescript
    import { Injectable, inject } from '@angular/core';
    import { API_BASE } from '../api-base';
    import { PartiesService } from '../parties/parties.service';
    // ... (partieTopic/userTopic/TopicHandler/matchingHandlers/urlForTopic inchangés)

    @Injectable({ providedIn: 'root' })
    export class RealtimeService {
      private readonly parties = inject(PartiesService);

      // Table de correspondance topic-prefix -> services à notifier (AD-3), câblée ici, dans
      // RealtimeService lui-même (jamais par le composant appelant connect()/disconnect()) —
      // première entrée réelle (Story 18.3) ; étendue par les prochaines stories de câblage
      // (Epic 19+) au fur et à mesure qu'un service de domaine expose son propre notifyChanged().
      private readonly handlers: TopicHandler[] = [
        { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      ];

      private readonly connections = new Map<string, EventSource[]>();
      // ... connect()/disconnect() inchangés (déclarés APRÈS handlers/parties — l'ordre de
      // déclaration des champs de classe compte : handlers référence this.parties, qui doit donc
      // être initialisé avant dans le corps de la classe)
    }
    ```
  - **Régression anticipée sur `realtime.service.spec.ts` (Story 18.2)** : `RealtimeService` injecte désormais `PartiesService` (qui injecte elle-même `HttpClient`). Le `beforeEach` actuel (`TestBed.configureTestingModule({})`) ne fournit ni l'un ni l'autre — `TestBed.inject(RealtimeService)` échouera (`NullInjectorError: No provider for HttpClient`). Corriger en fournissant un mock direct de `PartiesService`, pas du vrai `HttpClient` (ce test ne porte pas sur les appels HTTP) :
    ```typescript
    TestBed.configureTestingModule({
      providers: [
        { provide: PartiesService, useValue: { notifyChanged: vi.fn(), changed: signal(0) } },
      ],
    });
    ```

- [x] **Task 5 — Frontend `PartieDetail` : remplacement du patch `visibilitychange` (AC1, AC2)**
  - Fichier `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` — lire intégralement le constructeur (lignes ~228-263 actuelles) avant modification. Ajouter les imports : `RealtimeService`, `partieTopic` depuis `'../../../core/realtime/realtime.service'` (même profondeur relative que `PartiesService`, déjà importé juste au-dessus). Ajouter le champ injecté `private readonly realtime = inject(RealtimeService);` (à côté des autres `inject(...)` de la classe, ligne ~103-111 actuelles).
  - Dans le constructeur, **remplacer intégralement** le bloc `visibilitychange` (lignes ~242-254 actuelles, cité en Dev Notes) par :
    ```typescript
    // Story 18.3 : remplace le patch visibilitychange (retour de focus d'onglet, bug-fix
    // 2026-07-17, AC2 — un seul mécanisme de rafraîchissement pour ce composant) par le signal
    // temps réel SSE. `id` vient du snapshot de route (identique à ngOnInit) — connexion ouverte
    // une seule fois au montage, jamais recréée en cours de vie du composant (cette page n'a pas
    // de stratégie de réutilisation de route — un changement de :id détruit/recrée le composant).
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.realtime.connect(partieTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(id)));
    }
    effect(() => {
      this.parties.changed();
      untracked(() => void this.refreshPartie());
    });
    ```
    (`effect`/`untracked` déjà importés depuis `@angular/core`, réutilisés par les 3 autres `effect()` du même constructeur — aucun nouvel import Angular nécessaire.) `refreshPartie()` (méthode existante, inchangée) garde son unique garde `if (!id) return` sur `this.partie()?.id` — au premier passage de l'`effect()` (avant que `ngOnInit` ait peuplé `partie`), c'est un no-op silencieux, comportement voulu.

- [x] **Task 6 — Tests frontend (AC1, AC2)**
  - **`parties.service.spec.ts`** (`apps/web/src/app/core/parties/`) : nouveau test `notifyChanged()` incrémente `changed()` — pattern trivial, pas besoin de `HttpTestingController` pour celui-ci.
  - **`realtime.service.spec.ts`** (Story 18.2) : nouveau test prouvant le chemin bout-en-bout désormais complet (impossible à prouver en Story 18.2, `handlers` était vide) — `connect(partieTopic('p1'))` puis `FakeEventSource.instances[0].emit('open')` (ou `'message'`) → `partiesServiceMock.notifyChanged` a été appelé. Remplace/complète les tests existants qui se contentaient de vérifier « aucune exception levée ».
  - **`partie-detail.spec.ts`** — fichier volumineux (1168 lignes actuelles), **lire intégralement la structure avant modification** (3 configurations `TestBed` distinctes : la fabrique partagée `createFixture()`/`makePartiesService()` lignes ~105-201, un bloc autonome ligne ~451-473, et le bloc `visibilitychange` ligne ~1091-1168 à réécrire) :
    1. **Stub global `EventSource`** — ajouter en tête de fichier (hors de tout `describe`, s'applique à tous les tests) un `FakeEventSource` minimal (même forme qu'en Story 18.2, réutilisable tel quel) assigné à `globalThis.EventSource` dans un `beforeEach` de premier niveau. **Pourquoi global et pas un mock `RealtimeService` par test** : `RealtimeService` est `providedIn: 'root'`, non explicitement fourni par aucune des ~50 configurations `TestBed` existantes de ce fichier — Angular l'auto-construit réellement partout. Le stubber une fois au niveau fichier évite de toucher les 3 configurations individuellement pour un mécanisme dont le comportement réel (SSE) n'est pas la préoccupation des ~50 autres tests déjà présents dans ce fichier.
    2. **`makePartiesService()`** (fabrique partagée, ligne ~105) : ajouter `changed: signal(0), notifyChanged: vi.fn()` à l'objet retourné — couvre automatiquement `createFixture()` et le bloc autonome ligne ~458 (qui la réutilise déjà).
    3. **Remplacer le describe `'PartieDetail — rechargement au retour de focus (bug-fix hors story, 2026-07-17)'`** (ligne ~1091-1168, cité intégralement en Dev Notes) — son objet `partiesSvc` inline (pas la fabrique partagée) et son déclenchement `document.dispatchEvent(new Event('visibilitychange'))` n'ont plus lieu d'être. Nouveau test équivalent, même structure (Partie éditée « ailleurs », `gameSystemId` change, l'onglet Homme Dragon apparaît), mais déclenché par le signal temps réel :
       ```typescript
       // Récupérer le mock PartiesService construit pour ce test (changed + notifyChanged, cf. Task 3)
       // puis, au lieu de dispatcher 'visibilitychange' :
       partiesSvc.get.mockResolvedValueOnce(updated); // 2e appel à get() lira la version à jour
       partiesSvc.notifyChanged(); // déclenche directement l'effect() de PartieDetail
       // ... mêmes assertions qu'avant (get appelé 2 fois, onglet Homme Dragon apparu)
       ```
       Puisque `RealtimeService` est réel dans ces tests (stub global `EventSource`, pas de mock du service lui-même), le chemin complet SSE → `RealtimeService` → `PartiesService.notifyChanged()` → `PartieDetail.effect()` fonctionne nativement sans setup supplémentaire — mais pour ce test précis, appeler `partiesSvc.notifyChanged()` directement (plutôt que de simuler un événement `EventSource` réel) suffit et reste plus direct/lisible : c'est exactement le même signal que `RealtimeService` déclencherait.

- [x] **Task 7 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression (882 tests avant cette story, + le nouveau test Task 2).
  - `docker compose exec api pnpm typecheck` — propre.
  - `docker compose exec web pnpm test` — 0 régression (846 tests avant cette story, + les nouveaux tests Task 6).
  - Aucune migration Prisma, aucun changement de schéma.
  - `git status`/diff en fin de story : `apps/api/src/parties/parties.service.ts` (+ spec), `apps/web/src/app/core/parties/parties.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (+ spec). **Aucune modification** `apps/api/src/parties/parties.module.ts` (aucun nouvel import nécessaire, cf. Task 1), ni d'aucun autre composant/service (`ScenarioTimeline`, `CharacterService`, etc. — câblage futur, Epic 19+).

### Review Findings

- [x] [Review][Patch] Commentaire factuellement faux sur la non-réutilisation de route [apps/web/src/app/features/parties/partie-detail/partie-detail.ts]
- [x] [Review][Patch] Le test AC1 ne faisait pas transiter un vrai événement SSE — renforcé pour exercer la chaîne complète [apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts]
- [x] [Review][Defer] Réutilisation de route Angular par défaut non gérée (au-delà du SSE) — la page entière resterait périmée, pas seulement la connexion SSE [apps/web/src/app/features/parties/partie-detail/partie-detail.ts] — deferred, pre-existing, aucun parcours de navigation actuel ne le déclenche
- [x] [Review][Defer] Pas de garde de concurrence si deux événements SSE arrivent rapprochés (réponses HTTP pouvant résoudre dans le désordre) [apps/web/src/app/features/parties/partie-detail/partie-detail.ts] — deferred, auto-corrigé au prochain événement, cohérent avec NFR1

## Dev Notes

### Architecture — troisième et dernière story de l'Epic 18 (`ARCHITECTURE-SPINE.md`, Palier 7)

Stories 18.1 (bus backend) et 18.2 (connexion SSE générique côté client) ont livré le mécanisme. Cette story livre son **premier résultat démontrable** (FR-4) : `PartieDetail` cesse d'utiliser le patch `visibilitychange` et utilise le signal temps réel. C'est aussi la **première story qui peuple `RealtimeService.handlers`** (vide depuis la Story 18.2) — précédent direct pour les stories de câblage suivantes (Epic 19+).

**AD-3 (câblage centralisé, jamais par le composant appelant)** : *"Un composant appelle uniquement `connect`/`disconnect` avec un topic ; il ne choisit jamais quels services sont notifiés."* — confirme que `PartieDetail` ne reçoit aucun callback direct de `RealtimeService` ; toute la logique de notification passe par `PartiesService.changed`, exactement comme `ScenarioTimeline` consomme `ScenariosService.changed` depuis la Story 17.3 (précédent direct, même structure : `effect()` + `untracked()` dans le constructeur).

**AD-4 (contrat `notifyChanged()`, mécanisme interne libre)** : *"chaque service concerné expose `notifyChanged(): void`... Vérifié brownfield : le code existant présente trois cas distincts, chacun implémente `notifyChanged()` différemment en interne."* `PartiesService` introduit ici un **quatrième cas** (pas dans le Structural Seed d'origine) : un compteur simple `signal(0)`, sans scoping par `partieId` — justifié en Task 3 (un seul `PartieDetail` monté à la fois par instance d'app, établi en Dev Notes Story 18.2).

### Pourquoi `PartiesService.update()` (backend) était un angle mort (écart documenté)

Voir Task 1. Le Structural Seed de l'architecture (Palier 7) liste 6 services à câbler en Story 18.1 (`scenarios/scenarios.service.ts`, `poll/poll.service.ts`, `characters/character.service.ts`, `homme-dragon/homme-dragon.service.ts`, `invitations/invite-links.service.ts`) — **`parties/parties.service.ts` n'y figure jamais**, alors que c'est exactement le service dont la mutation est citée en exemple par l'AC1 de cette story (« édition via `/parties/:id/edit` »). Ni AD-2 (qui liste les mêmes fichiers) ni aucune autre story du breakdown (Epic 19-22) ne couvre ce point. Résolu dans le périmètre de cette story, cohérent avec la méthodologie déjà appliquée aux écarts similaires des Stories 18.1/18.2 : le texte normatif de l'AC fait foi sur le Structural Seed, illustratif.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/parties/parties.service.ts`** (`update()`, lignes 115-118 actuelles) — cité en Task 1.
- **`apps/api/src/parties/parties.service.spec.ts`** — constructeur `new PartiesService(prisma, avail)` ligne 86, **seul site**. Aucun test `update()` existant (vérifié).
- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** (lignes 21-33 actuelles) — précédent exact pour la forme `_changed`/`changed`/`notifyChanged` (bien que `PartiesService` s'en écarte volontairement sur le scoping par `partieId`, cf. Task 3).
- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** (lignes 111-127 actuelles) — précédent exact pour le pattern `effect()` + `untracked()` consommant un signal `changed` externe, reproduit à l'identique (en plus simple, sans filtrage par `partieId`) en Task 5.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** (constructeur complet, lignes 228-263 actuelles ; `ngOnInit`, lignes 308-321 ; `refreshPartie()`, lignes 256-263) — cité intégralement en Task 5.
- **`apps/web/src/app/core/realtime/realtime.service.ts`** (Story 18.2, fichier complet 74 lignes) — cité intégralement en Task 4.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`** (1168 lignes actuelles) — `makePartiesService()` (fabrique partagée, lignes 105-124), `createFixture()` (lignes 137-201), describe `'PartieDetail — rechargement au retour de focus'` (lignes 1091-1168, à remplacer intégralement, cité en Task 6).
- **`apps/web/src/app/core/parties/parties.service.spec.ts`** (60 lignes, cité en Task 6) — aucun test `update()` existant non plus côté frontend (hors scope, `update()` frontend lui-même n'est pas modifié par cette story, cf. Task 3).

### Testing Standards

- `apps/api` : Jest, constructeur direct (`new PartiesService(...)`, pas de `Test.createTestingModule`) — pattern déjà en place dans ce fichier, à préserver.
- `apps/web` : Vitest + `TestBed`.
- Piège déjà documenté (Story 18.2) : `jsdom` (^28.0.0) n'implémente pas `EventSource` — stub global nécessaire dans `partie-detail.spec.ts` (Task 6), même mécanisme (`FakeEventSource`) que `realtime.service.spec.ts`.
- Piège déjà documenté (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier — lancer `pnpm typecheck` après l'ajout du paramètre `realtimeEvents` au constructeur de `PartiesService` (backend).

### Previous Story Intelligence (Story 18.2)

- Établi : vérifier empiriquement toute divergence entre epic/architecture et code réel avant d'écrire les tâches — reproduit ici pour l'angle mort `PartiesService.update()` (backend) et pour l'absence de `changed`/`notifyChanged` sur `PartiesService` (frontend).
- Story 18.2 a laissé `handlers` volontairement vide avec la note : *"Quel service exact recevra la première entrée de `handlers` est une décision qui appartient à Story 18.3 ou 19.1, pas à celle-ci"* — cette story tranche : c'est `PartiesService`, pas `ScenariosService` (qui reste pour une story Epic 19 future, `ScenarioTimeline` n'étant pas dans le scope FR-4).
- Story 18.2 a différé (`deferred-work.md`) l'absence de re-vérification d'appartenance pendant la durée de vie d'un flux SSE ouvert — non pertinent pour cette story (aucune nouvelle route SSE, réutilise l'endpoint existant).
- Convention de tests établie : un test par comportement, pas de sur-couverture — reproduite ici.

### Project Structure Notes

- Fichiers modifiés : `apps/api/src/parties/parties.service.ts` (+ spec), `apps/web/src/app/core/parties/parties.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (+ spec).
- Aucun fichier nouveau, aucune migration Prisma, aucune modification `parties.module.ts`.
- `RealtimeService.handlers` passe de 0 à 1 entrée — première extension du mécanisme posé en Story 18.2.
- Dernière story de l'Epic 18 — une fois `done`, l'epic est complet (FR1-FR4 couverts) ; l'Epic 19 (backlog) prend le relais pour `ScenarioTimeline`/`SeanceList`/`CalendarView`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (lignes 167-181 — Story 18.3 complète, AC1-AC2)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-2, AD-3, AD-4, AD-9 ; Structural Seed — composants FR-4 à FR-13)
- `_bmad-output/implementation-artifacts/18-1-bus-devenements-et-emission-scopee-par-partie-backend.md` (méthodologie de résolution des écarts Structural Seed vs texte normatif)
- `_bmad-output/implementation-artifacts/18-2-connexion-sse-et-reconnexion-cote-client.md` (Dev Notes : « quel service recevra la première entrée de `handlers` » — tranché par cette story)
- Vérifications empiriques effectuées pendant la préparation de cette story : `PartiesService.update()` (backend) n'émet aucun événement (lecture directe du code, absent des Tasks 3-8 de la Story 18.1) ; `PartiesService` (frontend) n'a aucun signal `changed`/`notifyChanged` existant ; `PartieDetail` ne consomme aujourd'hui aucun signal de service partagé pour son propre rafraîchissement (seulement `visibilitychange`) ; un seul site d'instanciation `new PartiesService(...)` dans `parties.service.spec.ts` (backend) ; 3 configurations `TestBed` distinctes dans `partie-detail.spec.ts`, dont une seule (`createFixture`) couvre la majorité des ~50 tests existants.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

Implémentée le 2026-07-20 (bmad-dev-story), en TDD (RED → GREEN par task), dernière story de l'Epic 18 (FR1-FR4 désormais tous couverts). Lacune non anticipée par l'architecture découverte et corrigée dans le scope normatif de cette story : `PartiesService.update()` (backend) n'émettait aucun événement temps réel (absent des Tasks 3-8 de la Story 18.1) — sans ce câblage, l'AC1 (édition d'une Partie dans un autre onglet) ne pouvait structurellement pas fonctionner. Frontend : `PartiesService` reçoit son premier signal `changed`/`notifyChanged()` (compteur simple, sans scoping par `partieId` — un seul `PartieDetail` monté à la fois par instance d'app) ; `RealtimeService.handlers` (vide depuis la Story 18.2) reçoit sa première entrée réelle (`partie:` → `PartiesService.notifyChanged()`) ; `PartieDetail` remplace intégralement son patch `visibilitychange` par `RealtimeService.connect()`/`disconnect()` (via `DestroyRef`) et un `effect()` sur `PartiesService.changed`, même pattern que `ScenarioTimeline`/`ScenariosService.changed` (Story 17.3). Régression anticipée et corrigée : `realtime.service.spec.ts` (Story 18.2) cassé par l'injection de `PartiesService` dans `RealtimeService` — corrigé par un mock direct (pas de vrai `HttpClient`). `partie-detail.spec.ts` (1168 lignes, ~50 tests) : stub global `EventSource` ajouté une seule fois en tête de fichier (piège jsdom déjà documenté Story 18.2) plutôt que de modifier chacune des 3 configurations `TestBed` individuellement ; le describe `visibilitychange` remplacé par un describe `signal temps réel`, avec un test supplémentaire (AC2) prouvant explicitement que l'ancien patch est bien retiré (un dispatch manuel de `visibilitychange` ne déclenche plus aucun rechargement). Suite finale : 883/883 tests API (+1), `pnpm typecheck` API propre, 849/849 tests web (+3 nets : 1 `parties.service.spec.ts`, 3 `realtime.service.spec.ts` remplaçant 2 tests plus faibles, 2 `partie-detail.spec.ts` remplaçant 1 test), aucune régression.

### File List

- `apps/api/src/parties/parties.service.ts` (modifié — `update()` émet `partieTopic(id)`)
- `apps/api/src/parties/parties.service.spec.ts` (modifié)
- `apps/web/src/app/core/parties/parties.service.ts` (modifié — `changed`/`notifyChanged()`)
- `apps/web/src/app/core/parties/parties.service.spec.ts` (modifié)
- `apps/web/src/app/core/realtime/realtime.service.ts` (modifié — `handlers` peuplé, injecte `PartiesService`)
- `apps/web/src/app/core/realtime/realtime.service.spec.ts` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — remplace `visibilitychange` par SSE)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié)

### Change Log

- 2026-07-20 : Implémentation complète de la story (Tasks 1-7), 883/883 tests API + 849/849 tests web, typecheck API propre, aucune régression. Dernière story de l'Epic 18 (Fondation temps réel + Partie en direct) — epic complet.
