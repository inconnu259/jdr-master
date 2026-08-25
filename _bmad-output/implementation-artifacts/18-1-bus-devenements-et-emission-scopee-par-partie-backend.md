---
baseline_commit: 659286c52227eb95a0f7ce718c07a5c1827a27ec
---

# Story 18.1: Bus d'événements et émission scopée par Partie (backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que toute mutation touchant une Partie (scénario, séance, personnage, sondage, invitation, annonce...) déclenche un signal serveur associé à cette Partie,
so that le mécanisme de rafraîchissement en direct ait une source d'événements fiable à écouter.

## Acceptance Criteria

1. **Given** une mutation est effectuée sur une Partie A (ex. `ScenariosService`, `PollService`, `CharacterService`) **When** l'écriture est complètement résolue (jamais depuis l'intérieur d'un callback `prisma.$transaction`) **Then** un événement est émis, associé exclusivement au topic de la Partie A.
2. **Given** un client est abonné uniquement au topic de la Partie B **When** une mutation survient sur la Partie A **Then** ce client ne reçoit aucun événement.
3. **Given** le nouveau `RealtimeModule` (`apps/api/src/realtime/`) **When** un autre module (`ScenariosModule`, `PollModule`, `CharacterModule`, etc.) a besoin d'émettre un événement **Then** il injecte `RealtimeEventsService` sans le réimporter (module marqué `@Global()`).

## Tasks / Subtasks

- [x] **Task 1 — Monter `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express` vers `>=11.1.28`**
  - Version actuellement installée vérifiée : `11.1.27` (`docker compose exec api pnpm ls @nestjs/common`). Requis par l'architecture (`ARCHITECTURE-SPINE.md` Palier 7, section Stack) : *"À monter vers `>=11.1.28` (sortie 2026-07-08) avant l'implémentation — corrige le teardown de l'Observable SSE producteur à la déconnexion client en présence d'un interceptor (PR #17239), directement pertinent pour AD-6."* `apps/api/package.json` a `"@nestjs/common": "^11.0.1"` — la plage semver autorise déjà `>=11.1.28`, seul un `pnpm update` est nécessaire, pas un changement de `package.json`.
  - `docker compose exec api pnpm update @nestjs/common @nestjs/core @nestjs/platform-express` (et tout autre package `@nestjs/*` dont la mise à jour est tirée par celle-ci) — vérifier `pnpm ls @nestjs/common` après coup (`>=11.1.28`).
  - **Bien que cette story (18.1) n'implémente pas encore l'endpoint `@Sse()` lui-même (ça sera Story 18.2)**, monter la dépendance maintenant évite que 18.2 découvre le teardown buggé après coup — cohérent avec la note "à monter avant l'implémentation" de l'architecture (palier entier, pas juste 18.2).
  - `docker compose exec api pnpm test` — 0 régression suite à la mise à jour (833 tests avant cette story).

- [x] **Task 2 — Nouveau module `RealtimeModule` (AC1, AC2, AC3)**
  - Nouveau dossier `apps/api/src/realtime/`, 2 fichiers :
    - `realtime-events.service.ts` :
      ```typescript
      import { Injectable } from '@nestjs/common';
      import { Subject, Observable } from 'rxjs';
      import { filter, map } from 'rxjs/operators';

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
      **Pourquoi `partieTopic`/`userTopic` sont des fonctions exportées au niveau module, pas des méthodes statiques de la classe** — AD-7 (`ARCHITECTURE-SPINE.md` Palier 7) : *"Construction du topic : deux fonctions utilitaires partagées, `partieTopic(id: string)`/`userTopic(id: string)`, exportées une seule fois (`RealtimeEventsService` côté backend, `RealtimeService` côté frontend) — aucun composant n'interpole `partie:${id}`/`user:${id}` lui-même."* Tout service qui a besoin d'un topic importe `partieTopic`/`userTopic` depuis ce fichier — jamais une interpolation de chaîne locale.
      **Pourquoi `subscribe()` retourne `Observable<{ topic: string }>` et pas `Observable<MessageEvent>`** — le typage `MessageEvent`/le formatage SSE final est un souci de **Story 18.2** (`@Sse()` controller), pas de celle-ci ; AC1/AC2 de cette story ne portent que sur le mécanisme d'émission/filtrage interne, testable directement contre `RealtimeEventsService`, indépendamment de tout endpoint HTTP.
    - `realtime.module.ts` :
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
      **Précédent exact à reproduire** — `apps/api/src/prisma/prisma.module.ts` (cité intégralement, seul autre module `@Global()` du projet) :
      ```typescript
      import { Global, Module } from '@nestjs/common';
      import { PrismaService } from './prisma.service';

      @Global()
      @Module({
        providers: [PrismaService],
        exports: [PrismaService],
      })
      export class PrismaModule {}
      ```
  - Enregistrer `RealtimeModule` dans `apps/api/src/app.module.ts` (import ajouté à la liste `imports`, à côté de `PrismaModule` — même statut de module transverse). **Un module `@Global()` doit tout de même être importé UNE fois dans `AppModule`** pour être instancié — ensuite, tout autre module (`ScenariosModule`, `PollModule`, etc.) peut injecter `RealtimeEventsService` dans ses services **sans jamais importer `RealtimeModule` lui-même** (c'est exactement AC3).
  - Ce module n'a aucune dépendance à `PrismaService` (P1-AD-1 hérité, cf. Architecture — Inherited Invariants) — cohérent, `RealtimeEventsService` ne touche jamais la base de données.

- [x] **Task 3 — Câblage `emit()` dans `ScenariosService` (AC1, AC2)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`. Constructeur actuel (à modifier, ajouter `private readonly realtimeEvents: RealtimeEventsService`) :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
      private readonly characters: CharacterService,
      private readonly pollService: PollService,
    ) {}
    ```
    Ajouter l'import : `import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';`
  - **16 sites d'appel** (15 méthodes, `markCourant` en a 2 — un par branche de retour). Pour chacun, insérer `this.realtimeEvents.emit(partieTopic(<partieId>));` **juste avant le `return`, après que toutes les écritures de la méthode soient résolues** (jamais à l'intérieur d'un callback `$transaction`). Tableau exact (vérifié empiriquement, lignes actuelles avant cette story — revérifier après la Task 1, la mise à jour de dépendance ne devrait pas déplacer ces lignes mais un décalage mineur est possible) :

    | Méthode | Lignes | Variable `partieId` à utiliser | `$transaction` |
    |---|---|---|---|
    | `create` | 43-73 | `partieId` (paramètre direct) | non |
    | `update` | 75-105 | `scenario.partieId` | non |
    | `uploadDocument` | 107-170 | `partieId` (paramètre direct) | non |
    | `open` | 283-302 | `scenario.partieId` | non |
    | `markCourant` (branche `CAMPAGNE_LINEAIRE`, sous `$transaction`) | 321-344 | `partie.id` | oui (321-343) — emit **après** la ligne 343, pas dedans |
    | `markCourant` (branche non-transactionnelle) | 347-359 | `partie.id` | non |
    | `close` | 365-391 | `partie.id` | non |
    | `participate` | 395-418 | `partie.id` (via `getViewable`) | non |
    | `addSeance` | 422-441 | `partie.id` | non |
    | `deleteSeance` | 495-538 | `scenario.partieId` (via `resolveScenarioOrThrow`) | non |
    | `createSeancePoll` | 551-593 | `scenario.partieId` | non |
    | `resetSeanceDate` | 601-632 | `scenario.partieId` | non |
    | `setSeanceCapacity` | 638-679 | `scenario.partieId` | non |
    | `inscrire` | 683-753 | `scenario.partieId` (via `resolveScenarioOrThrow`) | oui (719-747) — emit **après** la ligne 747 |
    | `desinscrire` | 759-786 | `scenario.partieId` | non |
    | `setCompteRendu` | 791-815 | `scenario.partieId` | non |
    | `setResumeFin` | 821-844 | `scenario.partieId` | non |

  - **`recalculateNextSession` (lignes 453-485) n'émet PAS directement** — décision explicite de conception (voir Dev Notes, "Pourquoi `recalculateNextSession` n'émet pas lui-même") : cette méthode est appelée en interne par `deleteSeance` (ligne 532) et `resetSeanceDate` (ligne 626), qui émettent déjà chacune à leur propre fin — la faire émettre en plus créerait un double-emit inutile pour ces 2 appelants sans bénéfice (le topic est identique).
  - `createSeancePoll` appelle `pollService.create(...)` (lignes 580-582) qui, après la Task 4, émettra lui-même pour le même `partieId` — **double-emit accepté, pas de dédoublonnage** (cohérent avec NFR1 : "aucune garantie de livraison de type messagerie... un refetch complet... réponse acceptable", et avec l'esprit AD-6/AD-8 de ce palier — accepter la simplicité plutôt qu'une dédup pour un problème non observé à l'échelle hobby).

- [x] **Task 4 — Câblage `emit()` dans `PollService` (AC1, AC2)**
  - Fichier : `apps/api/src/poll/poll.service.ts`. Constructeur actuel :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
    ) {}
    ```
    Ajouter `private readonly realtimeEvents: RealtimeEventsService` + import (même chemin que Task 3).
  - **4 méthodes, `partieId` toujours un paramètre direct** :

    | Méthode | Lignes | `$transaction` |
    |---|---|---|
    | `create` | 26-64 | oui (43-62) — emit après la ligne 62 |
    | `castVote` | 78-107 | non |
    | `choose` | 109-149 | non — 2 écritures séquentielles (`sessionPoll.update` 128-135, `partie.update` 141-148) : emit après les DEUX, à la toute fin (après ligne 148) |
    | `close` | 151-164 | non |

- [x] **Task 5 — Câblage `emit()` dans `CharacterService` (AC1, AC2)**
  - Fichier : `apps/api/src/characters/character.service.ts` (1494 lignes — ne PAS le relire intégralement, se fier au tableau ci-dessous, vérifié empiriquement méthode par méthode). Constructeur actuel :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
      private readonly users: UsersService,
      private readonly gameSystems: GameSystemService,
      private readonly email: EmailService,
    ) {}
    ```
    Ajouter `private readonly realtimeEvents: RealtimeEventsService` + import.
  - **13 sites d'appel distincts** (22 méthodes publiques, mais 10 d'entre elles passent par un helper privé commun — voir ci-dessous) :

    | Méthode / site d'émission | Lignes | Variable `partieId` | `$transaction` |
    |---|---|---|---|
    | `create` | 155-198 | `partieId` (paramètre direct) | non |
    | `updatePortrait` | 326-381 | `updated.partieId` | non |
    | `removePortrait` | 383-405 | `updated.partieId` | non |
    | `updatePdfPortraitCrop` | 411-438 | `updated.partieId` | non |
    | `applyXpDelta` | 469-475 | `updated.partieId` (déjà porté par le retour de `prisma.character.update`, juste à lire) | non |
    | `applyLevelUp` | 525-656 | `updated.partieId` | oui (630-649) — emit après la ligne 649 |
    | `setXp` | 667-711 | `updated.partieId` | oui (680-699) — emit après la ligne 699 |
    | `setSheetField` | 721-834 | `updated.partieId` | oui (805-824) — emit après la ligne 824 |
    | **`writeInventoryChange`** (helper privé, lignes 1172-1192) | `updated.partieId` (ligne ~1190, déjà lu) | non |
    | `addNote` | 1203-1213 | **absent actuellement — capturer `const character = await this.getOwnCharacterOrThrow(...)` au lieu de jeter le retour (ligne 1208), puis `character.partieId`** | non |
    | `toggleNoteShare` | 1221-1239 | **absent actuellement — même correction que `addNote` (ligne 1227)** | non |
    | `setJournalAutoAssociate` | 1247-1259 | `updated.partieId` (déjà lu ligne 1257) | non |
    | `setNoteScenario` | 1274-1318 | `character.partieId` (déjà capturé ligne 1280) | non |

  - **`writeInventoryChange` (Task-clé, économie d'effort)** : ce helper privé est appelé par **10 méthodes publiques** (`addInventoryItem`, `updateInventoryItem`, `removeInventoryItem`, `addContenant`, `updateContenant`, `removeContenant`, `addAnimal`, `updateAnimal`, `removeAnimal`, `updateNarrativeField`) — **un seul `emit()` dans `writeInventoryChange` lui-même couvre les 10 appelants**, pas besoin de dupliquer l'appel dans chacune des 10 méthodes publiques. Fichier cité (lignes 1172-1192 actuelles) :
    ```typescript
    private async writeInventoryChange(
      characterId: string,
      expectedUpdatedAt: Date,
      sheetData: RyuutamaSheetData,
      userId: string,
    ): Promise<CharacterDto> {
      const result = await this.prisma.character.updateMany({
        where: { id: characterId, updatedAt: expectedUpdatedAt },
        data: { sheetData: sheetData as any },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
      const updated = await this.prisma.character.findUniqueOrThrow({
        where: { id: characterId },
      });
      const owner = await this.resolveOwnerInfo(userId, updated.partieId);
      // ← insérer this.realtimeEvents.emit(partieTopic(updated.partieId)); ici, avant le return
      return toDto(updated, owner.pseudo, owner.isMj, owner.isMj);
    }
    ```

- [x] **Task 6 — Câblage `emit()` dans `HommeDragonService` (AC1, AC2)**
  - Fichier : `apps/api/src/homme-dragon/homme-dragon.service.ts`. Constructeur actuel :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
      private readonly gameSystems: GameSystemService,
      private readonly scenarios: ScenariosService,
    ) {}
    ```
    Ajouter `private readonly realtimeEvents: RealtimeEventsService` + import.
  - **3 méthodes, `partieId` toujours un paramètre direct** :

    | Méthode | Lignes | `$transaction` |
    |---|---|---|
    | `create` | 35-74 | non |
    | `update` | 83-135 | non |
    | `chooseEveilPower` | 151-215 | oui (172-213) — emit après la ligne 213, avant `return this.buildDto(updated, partieId, userId);` (ligne 214) |

- [x] **Task 7 — Câblage `emit()` dans `InvitationsService` (AC1, AC2)**
  - **⚠️ Correction par rapport à la source tree de l'architecture** : `ARCHITECTURE-SPINE.md` (Palier 7, Structural Seed) liste `invitations/invite-links.service.ts` comme fichier à modifier, mais **AD-2 elle-même** (la règle qui gouverne cette Task) dit explicitement dans son "Binds" : *"FR-1 (toutes les méthodes de mutation à travers `ScenariosService`, `PollService`, `CharacterService`, `HommeDragonService`, `InvitationsService`, `AnnouncementsService`)"* — `InvitationsService`, pas `InviteLinksService`. Vérifié dans le code : `InvitationsService.invite()`/`revoke()` (modèle `Invitation`, ciblé par un `inviteeUserId` connu) sont ce que FR-11 (Epic 21, futur) attend réellement pour le Dashboard "invitations reçues" — `InviteLinksService` (modèle `InviteLink`, liens partageables/e-mail) n'a pas de consommateur temps réel identifié par aucun FR de ce palier. **Cette story câble `InvitationsService` uniquement, PAS `InviteLinksService`** — écart de la source tree assumé et documenté, cohérent avec le texte normatif d'AD-2.
  - Fichier : `apps/api/src/invitations/invitations.service.ts`. Constructeur actuel :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
      private readonly inviteLinks: InviteLinksService,
      private readonly email: EmailService,
    ) {}
    ```
    Ajouter `private readonly realtimeEvents: RealtimeEventsService` + import.
  - **Topic utilisateur, pas Partie** — AD-7 : FR-11 cible le Dashboard du destinataire, canal `user:{userId}`, pas `partie:{partieId}`. Importer aussi `userTopic` depuis le même fichier.
  - **2 méthodes seulement** (portée strictement liée à FR-11 : "une invitation est envoyée/révoquée" — `accept()`/`decline()` ne sont pas dans le scope de cette story, cf. Dev Notes) :
    - `invite()` (lignes 24-49) — après `this.prisma.invitation.upsert(...)` (44-48), avant le `return` implicite : `this.realtimeEvents.emit(userTopic(inviteeUserId));` (`inviteeUserId` est un paramètre direct de la méthode).
    - `revoke()` (lignes 108-121) — après `this.prisma.invitation.update(...)` (116-119), avant `return { ok: true };` : `this.realtimeEvents.emit(userTopic(inv.inviteeUserId));` (`inv` déjà résolu ligne 109-112, porte `inviteeUserId`).
  - **`accept()`, `decline()`, `inviteByEmail()` : explicitement hors scope de cette story** — `accept()`/`decline()` sont des actions que l'utilisateur effectue sur lui-même (aucun bénéfice de notification temps réel vers soi-même dans le cadre des FR de ce palier) ; `inviteByEmail()` délègue à `invite()` (déjà couvert) ou à `InviteLinksService.findOrCreateForEmail()` (hors scope, cf. ci-dessus) selon que l'e-mail correspond à un compte existant.

- [x] **Task 8 — Câblage `emit()` dans `AnnouncementsService` (AC1, AC2)**
  - Fichier : `apps/api/src/announcements/announcements.service.ts` (63 lignes, cité intégralement) — une seule méthode de mutation, `create()` (lignes 26-49), `partieId` en paramètre direct, aucun `$transaction`.
  - Constructeur actuel :
    ```typescript
    constructor(
      private readonly prisma: PrismaService,
      private readonly parties: PartiesService,
      private readonly scenarios: ScenariosService,
    ) {}
    ```
    Ajouter `private readonly realtimeEvents: RealtimeEventsService` + import. Insérer `this.realtimeEvents.emit(partieTopic(partieId));` après `const announcement = await this.prisma.announcement.create(...)` (lignes 40-46), avant `return toDto(announcement);` (ligne 48).

- [x] **Task 9 — Tests (AC1, AC2, AC3)**

  **`apps/api/src/realtime/realtime-events.service.spec.ts`** (nouveau fichier) — teste directement AC1/AC2 sans dépendre d'aucun autre service :
  - `emit(topicA)` puis un abonné à `topicA` (`service.subscribe('partie:p1').subscribe(...)`) reçoit l'événement.
  - `emit(topicA)` puis un abonné à `topicB` ne reçoit **rien** (AC2 — utiliser un timeout court ou `firstValueFrom` avec `take(1)` + un flag booléen jamais mis à `true`, pattern RxJS déjà présent ailleurs dans ce projet si applicable, sinon un simple `jest.fn()` passé à `.subscribe()` et `expect(spy).not.toHaveBeenCalled()` après l'émission).
  - `partieTopic('p1')` retourne `'partie:p1'` ; `userTopic('u1')` retourne `'user:u1'` (tests triviaux, mais verrouillent le format contre une régression future).
  - Plusieurs `emit()` sur des topics différents → seul l'abonné du bon topic reçoit chaque événement (pas de fuite croisée), cf. AC2.

  **Pour chacun des 6 fichiers de service modifiés (Tasks 3-8)** : ajouter le mock `realtimeEvents = { emit: jest.fn() }` au `providers`/factory du fichier de test existant (convention déjà établie : mocks manuels, `Test.createTestingModule` ou factory `makeXxx()` selon le fichier). **Ne pas tester chacun des 39 sites d'appel individuellement** — économie d'effort cohérente avec la convention déjà établie en Story 17.2 (`resolveScenarioOrThrow` testé via 2 appelants représentatifs, pas les 7) :
  - `scenarios.service.spec.ts` : 1 test par méthode publique listée dans la Task 3 (16 tests, `markCourant` compte pour 2) — asserter `expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'))` (ou l'ID de Partie pertinent au test existant) sur le succès de chaque méthode ; **1 test dédié confirmant que `deleteSeance()`/`resetSeanceDate()` n'appellent PAS `emit` directement mais que le mécanisme reste correct via `recalculateNextSession`** (documente la décision de la Task 3, évite qu'un futur lecteur pense à un oubli).
  - `poll.service.spec.ts` : 4 tests (un par méthode).
  - `character.service.spec.ts` : 12 tests (13 sites moins `writeInventoryChange` testé une seule fois via **un seul** de ses 10 appelants représentatifs, ex. `addInventoryItem` — pas les 9 autres, mécanisme partagé déjà prouvé).
  - `homme-dragon.service.spec.ts` : 3 tests.
  - `invitations.service.spec.ts` : 2 tests (`invite`, `revoke`), asserter `userTopic(inviteeUserId)` (pas `partieTopic`).
  - `announcements.service.spec.ts` : 1 test.
  - **Chaque test de méthode utilisant `$transaction`** (`markCourant` branche linéaire, `PollService.create`, `applyLevelUp`, `setXp`, `setSheetField`, `chooseEveilPower`, `ScenariosService.inscrire`) doit vérifier explicitement que `emit` est appelé **après** la résolution du mock de `$transaction` (ex. `expect(realtimeEvents.emit).toHaveBeenCalled()` combiné à l'assertion déjà existante sur le résultat retourné — pas besoin d'un mécanisme de vérification d'ordre plus complexe, l'insertion du code elle-même garantit l'ordre si le code est écrit correctement après le `await this.prisma.$transaction(...)`).

  **AC3** — nouveau test d'intégration minimal `apps/api/src/realtime/realtime.module.spec.ts` (ou ajouté à un test existant du bootstrap de `AppModule` si un tel test existe déjà — vérifier) : instancier un `Test.createTestingModule({ imports: [RealtimeModule] })`, résoudre `RealtimeEventsService` sans jamais l'avoir listé dans un `providers` local — confirme que `@Global()` fonctionne comme attendu. **Si un test complet de bootstrap `AppModule` s'avère disproportionné (le projet a un bug préexistant connu sur le bootstrap complet d'`AppModule` sous Jest, cf. `deferred-work.md`, Story 16.1)**, un test unitaire simple prouvant que le module exporte bien `RealtimeEventsService` suffit — ne pas tenter de contourner le bug préexistant `AppModule`/`@master-jdr/shared` documenté dans `deferred-work.md`, hors scope de cette story.

- [x] **Task 10 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite (833 tests avant cette story, + les nouveaux tests de la Task 9).
  - `docker compose exec api pnpm typecheck` — propre.
  - **Aucune migration Prisma** (aucun changement de schéma — confirmé par l'architecture : "Aucune modification de schéma Prisma pour ce palier").
  - `git status`/diff en fin de story : `apps/api/package.json` + lockfile (Task 1), 2 nouveaux fichiers `apps/api/src/realtime/` + leurs specs, 6 fichiers de service modifiés + leurs specs, `apps/api/src/app.module.ts`. **Aucune modification `apps/web`** (le câblage frontend est Story 18.2/18.3).

### Review Findings

- [x] [Review][Patch] `emit()` sauté si un effet de bord après l'écriture réussie lève une exception (`create`/`applyXpDelta`/`setXp` de `CharacterService`) [apps/api/src/characters/character.service.ts]
- [x] [Review][Patch] Le test AC3 (`realtime.module.spec.ts`) ne prouve pas réellement le comportement `@Global()` [apps/api/src/realtime/realtime.module.spec.ts]
- [x] [Review][Defer] `RealtimeEventsService.emit()` propage une exception synchrone d'abonné, ce qui pourrait avorter une mutation déjà committée une fois un vrai consommateur (SSE, Story 18.2) branché [apps/api/src/realtime/realtime-events.service.ts] — deferred, pre-existing

## Dev Notes

### Architecture — nouveau module transverse, palier entier (`ARCHITECTURE-SPINE.md`, Palier 7)

Ce palier introduit **un seul élément structurellement nouveau** : *"un bus d'événements interne scopé par clé de topic (`partie:{id}` / `user:{id}`), exposé côté client via `@Sse()`... et consommé côté navigateur via `EventSource`... Ce bus ne remplace pas le paradigme signal-driven déjà en place côté Angular — il l'étend."* Story 18.1 = uniquement la moitié backend de ce mécanisme (bus + émission) — la connexion SSE/`EventSource` (Story 18.2) et le câblage frontend (Story 18.3+) sont **hors scope**.

**AD-1 (bus = `Subject` RxJS, pas de nouvelle dépendance)** : *"`RealtimeEventsService`... expose une méthode `emit(topic: string)` et une méthode `subscribe(topic: string): Observable<MessageEvent>` construites sur un unique `Subject<{ topic: string }>` interne, filtré par égalité de `topic`... RxJS est déjà une dépendance transitive de NestJS — aucun ajout de package."* (Le type de retour `Observable<MessageEvent>` cité dans l'AD anticipe l'usage SSE de la Story 18.2 — cette story garde `Observable<{ topic: string }>`, plus simple, adapté par 18.2 le moment venu.)

**AD-2 (émission = appel explicite en fin de méthode, jamais dans `$transaction`)** — citée en quasi-intégralité car c'est la règle centrale de cette story : *"Chaque méthode de mutation concernée appelle explicitement `this.realtimeEvents.emit(topic)` après la résolution complète de l'écriture — jamais à l'intérieur du callback d'un `prisma.$transaction(...)`. Revue adversariale (2026-07-18) : émettre depuis l'intérieur du callback de transaction notifierait les clients avant que l'écriture soit réellement commitée, recréant exactement la race de refetch-obsolète que ce palier doit éliminer."*

**AD-9 (module unique `@Global()`)** : *"Nouveau `RealtimeModule`... marqué `@Global()` et exportant `RealtimeEventsService` — tout autre module l'injecte sans le réimporter."* Précédent direct dans le code : `PrismaModule` (seul autre module `@Global()` du projet, cité intégralement en Task 2).

### Pourquoi `recalculateNextSession` n'émet pas lui-même (décision de conception documentée)

`ScenariosService.recalculateNextSession()` (lignes 453-485) écrit `Partie.nextSessionDate`/`nextSessionSlot` — c'est techniquement une mutation. Mais elle est **toujours** appelée en toute fin de `deleteSeance()` (ligne 532) et `resetSeanceDate()` (ligne 626), qui émettront déjà chacune leur propre événement (Task 3) pour le **même** `partieId`. La faire émettre en plus créerait un double-emit systématique sans bénéfice (aucun client ne reçoit d'information supplémentaire — même topic, même Partie). Décision : `recalculateNextSession` n'émet jamais directement ; ses 2 appelants couvrent déjà le besoin via leur propre émission de fin de méthode.

### Pourquoi `InvitationsService` (pas `InviteLinksService`) — écart documenté avec la source tree

Voir Task 7 pour la citation exacte d'AD-2 vs la source tree — l'AD (règle normative) et le Structural Seed (illustration indicative) divergent sur ce point précis ; l'AD fait foi. Vérifié dans le code (`apps/api/src/invitations/invitations.service.ts` et `invite-links.service.ts`, tous deux cités intégralement ci-dessous) que `InvitationsService.invite()`/`revoke()` sont le mécanisme qui alimente réellement `Dashboard` → "invitations reçues" (FR-11, Epic 21) — pas `InviteLinksService`.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/prisma/prisma.module.ts`** (9 lignes) — cité en intégralité à la Task 2, précédent exact pour `RealtimeModule`.
- **`apps/api/src/app.module.ts`** (cité en intégralité) :
  ```typescript
  import { Module } from '@nestjs/common';
  import { APP_GUARD } from '@nestjs/core';
  import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
  import { ScheduleModule } from '@nestjs/schedule';
  import { AppController } from './app.controller';
  import { AppService } from './app.service';
  import { PrismaModule } from './prisma/prisma.module';
  import { HealthModule } from './health/health.module';
  import { UsersModule } from './users/users.module';
  import { AuthModule } from './auth/auth.module';
  import { PartiesModule } from './parties/parties.module';
  import { InvitationsModule } from './invitations/invitations.module';
  import { AvailabilityModule } from './availability/availability.module';
  import { PollModule } from './poll/poll.module';
  import { GameSystemModule } from './game-systems/game-system.module';
  import { CharacterModule } from './characters/character.module';
  import { HommeDragonModule } from './homme-dragon/homme-dragon.module';
  import { XpDistributionsModule } from './xp-distributions/xp-distributions.module';
  import { EmailModule } from './email/email.module';
  import { NotificationsModule } from './notifications/notifications.module';
  import { ScenariosModule } from './scenarios/scenarios.module';
  import { AnnouncementsModule } from './announcements/announcements.module';

  @Module({
    imports: [
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
      ScheduleModule.forRoot(),
      PrismaModule,
      HealthModule,
      UsersModule,
      AuthModule,
      PartiesModule,
      InvitationsModule,
      AvailabilityModule,
      PollModule,
      GameSystemModule,
      CharacterModule,
      HommeDragonModule,
      XpDistributionsModule,
      EmailModule,
      NotificationsModule,
      ScenariosModule,
      AnnouncementsModule,
    ],
    controllers: [AppController],
    providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  export class AppModule {}
  ```
  Ajouter `RealtimeModule` à la liste `imports` (à côté de `PrismaModule`) + son import en tête de fichier.
- **`apps/api/src/invitations/invitations.service.ts`** (171 lignes, cité en intégralité) — voir Task 7 pour les 2 méthodes ciblées (`invite`, lignes 24-49 ; `revoke`, lignes 108-121). Fichier complet déjà entièrement transcrit dans les notes de préparation de cette story — reste identique à l'implémentation, seuls 2 emit() à insérer.
- **`apps/api/src/invitations/invite-links.service.ts`** (185 lignes) — **non modifié par cette story** (cf. Task 7), cité seulement pour confirmer l'absence de lien avec FR-11.
- **`apps/api/src/announcements/announcements.service.ts`** (63 lignes, cité en intégralité à la Task 8).
- Constructeurs actuels de `ScenariosService`, `PollService`, `CharacterService`, `HommeDragonService`, `InvitationsService` cités intégralement dans chaque Task correspondante (3-8) — vérifiés empiriquement pendant la préparation de cette story, pas une supposition.

### Testing Standards

- `apps/api` : Jest, conventions déjà en place (mocks manuels, `Test.createTestingModule` selon le fichier).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après l'ajout du paramètre `realtimeEvents` à 6 constructeurs.
- Économie de tests déjà établie en Story 17.2 (`resolveScenarioOrThrow` testé via 2 appelants représentatifs sur 7) — reproduite ici pour `writeInventoryChange` (1 appelant représentatif sur 10) et pour la couverture Prisma-transaction-ordering (assertion sur l'appel `emit`, pas un mécanisme de vérification d'ordre séparé).
- **Ne pas tenter de réparer** le bootstrap `AppModule` cassé sous Jest (`pnpm test:e2e`, documenté dans `deferred-work.md` depuis Story 16.1) — sans rapport avec cette story, contourner comme les stories précédentes l'ont fait (test minimal ciblé, pas de bootstrap complet).

### Previous Story Intelligence (Story 17.3, dernière de l'Epic 17)

- Convention établie : vérifier empiriquement toute divergence entre le texte de l'epic/architecture et le code réel avant d'écrire les tâches (reproduit ici pour `InvitationsService` vs `InviteLinksService`, et pour la version exacte de `@nestjs/common` installée).
- Story 17.3 a laissé 2 items mineurs dans `deferred-work.md` (signal encore global au niveau de l'effet Angular, fragilité théorique de coalescing) — **explicitement pertinents pour ce palier** : ces items concernent `ScenariosService._changed` (frontend), directement lié au mécanisme temps réel que ce palier construit. À garder en tête pour les stories 18.2/18.3, pas à corriger dans cette story (backend uniquement).
- Epic 17 est maintenant complet. Cette story démarre l'Epic 18 (palier 7), un chantier neuf de plus grande ampleur — première story qui introduit un nouveau module NestJS depuis plusieurs paliers.

### Project Structure Notes

- Fichiers modifiés : `apps/api/package.json` (+ lockfile, Task 1), `apps/api/src/app.module.ts`, `apps/api/src/scenarios/scenarios.service.ts` (+ spec), `apps/api/src/poll/poll.service.ts` (+ spec), `apps/api/src/characters/character.service.ts` (+ spec), `apps/api/src/homme-dragon/homme-dragon.service.ts` (+ spec), `apps/api/src/invitations/invitations.service.ts` (+ spec), `apps/api/src/announcements/announcements.service.ts` (+ spec).
- Fichiers nouveaux : `apps/api/src/realtime/realtime-events.service.ts`, `apps/api/src/realtime/realtime-events.service.spec.ts`, `apps/api/src/realtime/realtime.module.ts`, `apps/api/src/realtime/realtime.module.spec.ts` (ou équivalent, cf. Task 9).
- Aucune migration Prisma, aucune modification `apps/web`, **un seul** nouveau module NestJS (`RealtimeModule`, cohérent avec AD-9 : "unique nouveau module de ce palier").

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (lignes 8-137 — Overview, FR Coverage Map, Epic 18 complet, Story 18.1 lignes 119-137)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-1, AD-2, AD-9 principalement ; Stack pour la version `@nestjs/common` ; Structural Seed pour l'arborescence cible)
- `_bmad-output/implementation-artifacts/17-3-portee-du-signal-de-changement-scenario-et-index-de-dedoublonnage-des-invitations.md` (story précédente — méthodologie de vérification empirique, items déférés pertinents pour la suite de ce palier)
- Vérifications empiriques effectuées pendant la préparation de cette story : version exacte de `@nestjs/common` installée (`11.1.27`, confirmée via `pnpm ls`) ; recherche exhaustive (2 agents de recherche en parallèle + lecture directe) de TOUTES les méthodes de mutation des 6 fichiers de service concernés, avec numéros de ligne exacts, présence/absence de `partieId` en scope, et usage de `$transaction` ; précédent `@Global()` unique du projet (`PrismaModule`) ; divergence AD-2 vs Structural Seed sur `InvitationsService`/`InviteLinksService` résolue par lecture directe du code des deux services.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

Implémentée le 2026-07-20 (bmad-dev-story, reprise d'une session précédente qui avait déjà posé les Tasks 1-2 et une partie des tests RED de la Task 3). `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express` montés en `>=11.1.28` (aucun changement `package.json`, la plage semver `^11.0.1` couvrait déjà la cible — seul un `pnpm update` était nécessaire). Nouveau `RealtimeModule` (`@Global()`, précédent exact `PrismaModule`) exportant `RealtimeEventsService` (`Subject<{ topic: string }>` RxJS, filtré par égalité de topic, fonctions `partieTopic`/`userTopic` exportées au niveau module). `emit()` câblé en fin de méthode (jamais dans un callback `$transaction`) sur les 6 services de mutation : `ScenariosService` (16 sites, dont `markCourant`×2 ; `recalculateNextSession` n'émet jamais directement, ses 2 appelants `deleteSeance`/`resetSeanceDate` émettent chacun de leur côté — décision de conception documentée dans la story), `PollService` (4 méthodes), `CharacterService` (13 sites dont `writeInventoryChange`, helper partagé par 10 méthodes publiques d'inventaire — un seul `emit()` y couvre les 10 appelants ; `addNote`/`toggleNoteShare` ne capturaient pas `partieId` avant cette story, corrigé en conservant le retour de `getOwnCharacterOrThrow`), `HommeDragonService` (3 méthodes), `InvitationsService` (`invite`/`revoke` uniquement, topic `userTopic`, pas `partieTopic` — conforme à AD-2/AD-7, écart documenté avec la source tree de l'architecture qui citait à tort `InviteLinksService`), `AnnouncementsService` (`create` seul). Tests ajoutés pour chaque site d'émission (assertion `emit` appelé avec le bon topic), plus un test dédié confirmant que `recalculateNextSession()` n'émet jamais directement. Suite finale : 879/879 tests API (0 régression sur les 833 tests pré-existants), `pnpm typecheck` propre, redémarrage réel du conteneur `api` confirmé (`Nest application successfully started`, toutes les routes mappées).

### File List

- `apps/api/package.json` (+ `pnpm-lock.yaml`) — mise à jour `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express`
- `apps/api/src/app.module.ts` — import `RealtimeModule`
- `apps/api/src/realtime/realtime-events.service.ts` (nouveau)
- `apps/api/src/realtime/realtime-events.service.spec.ts` (nouveau)
- `apps/api/src/realtime/realtime.module.ts` (nouveau)
- `apps/api/src/realtime/realtime.module.spec.ts` (nouveau)
- `apps/api/src/scenarios/scenarios.service.ts` (+ `scenarios.service.spec.ts`)
- `apps/api/src/poll/poll.service.ts` (+ `poll.service.spec.ts`)
- `apps/api/src/characters/character.service.ts` (+ `character.service.spec.ts`)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (+ `homme-dragon.service.spec.ts`)
- `apps/api/src/invitations/invitations.service.ts` (+ `invitations.service.spec.ts`)
- `apps/api/src/announcements/announcements.service.ts` (+ `announcements.service.spec.ts`)

### Change Log

- 2026-07-20 : Implémentation complète de la story (Tasks 1-10), 879/879 tests API, typecheck propre, redémarrage conteneur confirmé.
