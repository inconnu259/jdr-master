---
baseline_commit: 3b221066cc3339101ea1b3f12bdc678861c5361d
---

# Story 22.1: Réactivité d'OpenPollsService et ModeService au signal temps réel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want que les services partagés qui pilotent l'affichage des sondages ouverts et du mode de l'application se resynchronisent sur un changement touchant une Partie déjà affichée,
so that un sondage ouvert par le MJ soit détecté partout dans l'application, pas seulement en naviguant vers une nouvelle Partie.

## Acceptance Criteria

1. **Given** `OpenPollsService`, aujourd'hui réactif uniquement via un `effect()` sur `playerParties()` **When** un sondage est ouvert par le MJ sur une Partie déjà affichée **Then** il est détecté sans qu'un changement de la liste de Parties du joueur soit nécessaire pour le déclencher.
2. **Given** `ModeService` **When** un événement de changement scopé Partie est reçu **Then** il se resynchronise (`mjParties`/`playerParties` rechargés).
3. **Given** ces deux services, qui n'ont pas de compteur `_changed` équivalent à `ScenariosService` **When** `notifyChanged()` y est implémenté **Then** il déclenche directement leur logique de rafraîchissement existante, sans qu'un signal `_changed` supplémentaire soit requis (contrat public uniforme, mécanisme interne libre).

## Tasks / Subtasks

- [x] **Task 1 — `OpenPollsService` : `notifyChanged()` (AC1, AC3)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/core/poll/open-polls.service.ts` (66 lignes). `refresh()` (méthode **privée** déjà existante) est déjà appelée par un `effect()` du constructeur réagissant à `this.modeSvc.playerParties()` — **AUCUNE nouvelle logique de chargement à écrire**, `refresh()` gère déjà `Promise.allSettled`/le filtrage `hasUnansweredOptions`/le compteur anti-obsolescence `seq`.
  - **`seq` protège déjà contre la concurrence entre deux déclencheurs** (`effect()` existant ET ce nouveau `notifyChanged()`) : chaque appel à `refresh()` incrémente `this.seq`, et la résolution HTTP vérifie `if (seq !== this.seq) return;` avant d'écrire `this.openPolls` — un appel `notifyChanged()` concurrent à l'`effect()` existant ne peut donc jamais laisser une réponse périmée écraser un état plus récent. **Ne pas ajouter de garde supplémentaire**, elle existe déjà et couvre ce cas générique.
  - Ajouter la méthode publique :
    ```typescript
    /** Contrat public AD-4 (zéro argument) — RealtimeService l'appelle sur un événement SSE
     *  partie:{id}. Réutilise directement refresh(), déjà protégé contre la concurrence via `seq`. */
    notifyChanged(): void {
      void this.refresh();
    }
    ```
  - Ne pas toucher `refresh()`/le constructeur/`count`/`openPolls` — inchangés.

- [x] **Task 2 — `ModeService` : `notifyChanged()` (AC2, AC3)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/core/mode/mode.service.ts` (47 lignes). **Divergence constatée avec l'architecture (`ARCHITECTURE-SPINE.md`, AD-4 point 3)** : le document affirme qu'`OpenPollsService`**/`ModeService`** sont « déjà réactifs via un `effect()` interne sur `playerParties()` » — **c'est inexact pour `ModeService`** : cet `effect()` appartient à `OpenPollsService` (qui *observe* `ModeService.playerParties()`, Task 1), pas à `ModeService` lui-même. `ModeService` n'a **aucun** `effect()` interne — seulement deux méthodes publiques déjà existantes, appelées explicitement par d'autres composants selon le contexte (`refreshMjParties()` depuis `PartieDetail`/`PartieForm`/`Shell` ; `refreshPlayerParties()` depuis `Dashboard`/`Join`/`Shell`).
  - **Résolution retenue pour cette story** (généralisation minimale, cohérente avec AD-4 point 1 : un seul point d'entrée `notifyChanged()` qui relance la logique de rafraîchissement existante) : `notifyChanged()` appelle les **deux** méthodes existantes — un événement `partie:{id}` reçu ne permet pas de savoir a priori si la Partie concernée est une Partie maîtrisée ou jouée par l'utilisateur courant, les deux listes doivent donc être resynchronisées :
    ```typescript
    /** Contrat public AD-4 (zéro argument) — RealtimeService l'appelle sur un événement SSE
     *  partie:{id}. Pas d'effect() interne existant (contrairement à ce que suggère
     *  ARCHITECTURE-SPINE.md AD-4 point 3, qui décrit en réalité l'effect() d'OpenPollsService) —
     *  relance directement les deux méthodes de rafraîchissement publiques déjà existantes. */
    notifyChanged(): void {
      void this.refreshMjParties();
      void this.refreshPlayerParties();
    }
    ```
  - Ne pas toucher `refreshMjParties()`/`refreshPlayerParties()`/`setMode()`/`readStoredMode()` — inchangés.

- [x] **Task 3 — `RealtimeService` : deux nouvelles entrées au préfixe `'partie:'` (AC1, AC2)**
  - Fichier `apps/web/src/app/core/realtime/realtime.service.ts` (déjà étendu cinq fois : quatre entrées `'partie:'` + une `'user:'`, Stories 19.1/20.1/20.2/21.1). Injecter les deux nouveaux services et ajouter deux entrées à `handlers` (même préfixe `'partie:'` que `PartiesService`/`ScenariosService`/`CharacterService`/`HommeDragonService`) :
    ```typescript
    import { OpenPollsService } from '../poll/open-polls.service';
    import { ModeService } from '../mode/mode.service';
    // ...
    private readonly openPolls = inject(OpenPollsService);
    private readonly mode = inject(ModeService);

    private readonly handlers: TopicHandler[] = [
      { prefix: 'partie:', notifyChanged: () => this.parties.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.scenarios.notifyRealtimeChanged() },
      { prefix: 'partie:', notifyChanged: () => this.characters.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.hommeDragon.notifyChanged() },
      { prefix: 'user:', notifyChanged: () => this.invitations.notifyChanged() },
      // Story 22.1 : sixième et septième entrées, mêmes préfixe 'partie:' que les quatre premières —
      // aucune adaptation de matchingHandlers()/onSignal() (déjà génériques par préfixe, Story 18.2).
      { prefix: 'partie:', notifyChanged: () => this.openPolls.notifyChanged() },
      { prefix: 'partie:', notifyChanged: () => this.mode.notifyChanged() },
    ];
    ```
  - **Vérifier l'absence de cycle de dépendances avant de committer** : `OpenPollsService` injecte déjà `ModeService`/`ScenariosService`/`AuthService` (aucun d'eux n'injecte `RealtimeService`) ; `ModeService` injecte déjà `PartiesService` (n'injecte pas `RealtimeService` non plus) — vérifié empiriquement, aucun cycle introduit par cette story.
  - Le try/catch par handler (`onSignal`, revue de code Story 19.1) protège déjà ces deux nouvelles entrées sans modification supplémentaire — une exception dans l'un des sept handlers ne bloque jamais les autres.

- [x] **Task 4 — Tests (AC1, AC2, AC3)**
  - **`open-polls.service.spec.ts`** (`apps/web/src/app/core/poll/`) : nouveau test réutilisant le harnais `createHarness()` existant (ligne 73) —
    - `svc.notifyChanged()` appelé après le montage (avec un nouveau retour `listAll` incluant un poll `OPEN` supplémentaire) → `svc.count()`/`svc.openPolls()` reflètent le nouveau retour, **sans** modifier `playerPartiesSignal` (isole AC1 : la détection ne dépend plus uniquement d'un changement de `playerParties()`).
  - **`mode.service.spec.ts`** (`apps/web/src/app/core/mode/`) : le mock `PartiesService` existant (`{ list: () => Promise.resolve(listResult) }`, ligne 12) ne distingue pas `'mj'`/`'player'` — **étendre le mock** pour retourner des valeurs différentes selon l'argument (`list(kind)`) afin de vérifier que les deux méthodes sont bien appelées avec des résultats distincts. Nouveaux tests :
    - `service.notifyChanged()` → `mjParties()` ET `playerParties()` sont tous deux repeuplés (deux appels à `list()`, un par `kind`).
  - **`realtime.service.spec.ts`** (`apps/web/src/app/core/realtime/`) : ajouter des mocks `{ notifyChanged: vi.fn() }` pour `OpenPollsService`/`ModeService` au `beforeEach` (à côté des cinq mocks déjà présents). Nouveaux tests (même style que les entrées précédentes, lignes 144-163) :
    - `'open'` sur `connect(partieTopic('p1'))` déclenche AUSSI `openPollsSvc.notifyChanged()` ET `modeSvc.notifyChanged()` — six/sept handlers au même préfixe.
    - Pas de test `'user:'` négatif spécifique nécessaire (déjà couvert transitivement par le test existant ligne 165-171 qui vérifie que `partiesSvc.notifyChanged` — premier handler `'partie:'` — n'est pas déclenché sur `'user:'` ; ce principe s'étend implicitement).

- [x] **Task 5 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression.
  - Aucune migration Prisma, aucun changement de schéma, **aucune modification côté `apps/api`**.
  - Fichiers modifiés attendus : `apps/web/src/app/core/poll/open-polls.service.ts` (+ spec), `apps/web/src/app/core/mode/mode.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec). **Aucune modification** des composants déjà câblés (`PartieDetail`, `ScenarioTimeline`, `SeanceList`, `CalendarView`, `ScenarioEditor`, `ScenarioReadDialog`, `CharacterSheet`, `HommeDragonSheet`, `Dashboard`, `ScenarioDrafts`, `ScenarioOneShotTab`, `AnnouncementForm`) — ce câblage est **transparent** pour eux : ils continuent d'appeler `RealtimeService.connect()`/`disconnect()` exactement comme avant, `OpenPollsService`/`ModeService` reçoivent désormais leurs notifications via la connexion déjà ouverte par N'IMPORTE LEQUEL de ces composants sur le même topic `partie:{id}` — aucune connexion dédiée à ouvrir pour ces deux services partagés (ils n'ont pas de cycle de vie de composant, `providedIn: 'root'`).

### Review Findings

Revue de code le 2026-07-23 (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 1 patch appliqué, 4 items différés, 7 écartés.

- [x] [Review][Patch] Mock `partiesMock.list` de `mode.service.spec.ts` conservait une branche de repli morte (`listResult`) devenue inatteignable — `list()` n'est plus jamais appelé qu'avec `'mj'`/`'player'` depuis l'extension de ce mock. Corrigé : variable et branche supprimées. [`mode.service.spec.ts`]
- [x] [Review][Defer] Absence d'ordonnancement garanti entre les handlers `OpenPollsService`/`ModeService` sur un même événement SSE — `refresh()` peut lire un `playerParties()` légèrement périmé. Cohérent avec la tolérance NFR1, auto-corrigé au prochain événement. [`realtime.service.ts`, `open-polls.service.ts`] — deferred, cf. `deferred-work.md`
- [x] [Review][Defer] Absence de garde de concurrence/génération sur `ModeService.refreshMjParties()`/`refreshPlayerParties()` — pattern pré-existant, exposition accrue par la fréquence des déclenchements SSE, pas un nouveau bug. [`mode.service.ts`] — deferred, cf. `deferred-work.md`
- [x] [Review][Defer] Amplification de charge (thundering herd) sur de multiples connexions `partie:` simultanées — cohérent avec NFR2/AD-6 déjà actés. [`realtime.service.ts`] — deferred, cf. `deferred-work.md`
- [x] [Review][Defer] Absence de test dédié au chemin `'message'` pour les deux nouveaux handlers — redondant avec le test générique déjà existant prouvant l'équivalence `'open'`/`'message'`. [`realtime.service.spec.ts`] — deferred, convention déjà établie

**Écarté (faux positifs / non pertinents)** : rejets de promesses non gérés sur les appels fire-and-forget (`void this.refresh()`, etc.) — faux positif, les trois méthodes sous-jacentes interceptent déjà toutes leurs erreurs en interne et ne rejettent jamais ; boucle de flush à 10 itérations jugée fragile — convention déjà établie dans tout le projet ; mocks `ModeService` de `partie-detail.spec.ts` qualifiés de « compile-fix-only » — correct mais hors scope (`PartieDetail` ne consomme pas `playerParties`, le correctif ne visait que la résolution DI) ; import de `signal` non vérifiable dans le diff fourni — déjà présent, suite complète passante confirmée ; commentaire sur la protection `seq` sans test dédié à la concurrence — garde pré-existante, hors scope de cette story ; commentaires « archéologiques » Story/AD jugés verbeux — convention déjà établie dans tout le palier ; risque de rejet asynchrone du `void this.refreshMjParties()` contournant l'isolation des handlers — faux positif, mêmes méthodes déjà interceptées en interne.

## Dev Notes

### Aucune infrastructure nouvelle — dernier maillon du câblage transverse

Cette story ne pose rien de nouveau : `RealtimeService`, `partieTopic()`, le préfixe `'partie:'` existent depuis la Story 18.2. Elle ajoute simplement deux entrées supplémentaires au tableau `handlers` déjà étendu quatre fois. C'est la story la plus mécanique du palier — le seul point d'attention réel est la divergence documentée en Task 2.

### Pourquoi `OpenPollsService`/`ModeService` n'ouvrent PAS leur propre connexion SSE

Contrairement à tous les composants câblés jusqu'ici (`PartieDetail`, `ScenarioEditor`, `Dashboard`, etc.), `OpenPollsService` et `ModeService` sont des services `providedIn: 'root'` **sans cycle de vie de composant** — pas de `ngOnInit()`/`DestroyRef` pour ouvrir/fermer une connexion. Leur `notifyChanged()` est appelé par `RealtimeService` **via la connexion déjà ouverte par n'importe quel composant affichant une Partie** (ex. `PartieDetail`), cohérent avec AD-3 : *« Un composant appelle uniquement `connect`/`disconnect` avec un topic ; il ne choisit jamais quels services sont notifiés »*. Concrètement, un badge de sondage ouvert (`OpenPollsService.count()`) se met à jour dès qu'**une** page Partie ouverte ailleurs dans l'app reçoit un événement SSE sur ce topic — pas besoin que l'utilisateur soit lui-même sur cette page.

### Divergence architecture constatée (à ne pas reproduire silencieusement)

`ARCHITECTURE-SPINE.md` (AD-4, point 3) affirme que `ModeService` a « déjà » un `effect()` interne sur `playerParties()` — **vérifié empiriquement faux** : cet `effect()` appartient à `OpenPollsService` (qui observe `ModeService.playerParties()` depuis l'extérieur), `ModeService` lui-même n'a aucune réactivité interne, seulement deux méthodes publiques appelées explicitement ailleurs. La Task 2 documente la résolution retenue (appeler les deux méthodes existantes) directement dans le code, pas seulement ici — un futur lecteur du fichier source ne doit pas avoir à rouvrir cette story pour comprendre pourquoi `notifyChanged()` appelle les deux.

### Testing Standards

- `apps/web` : Vitest + `TestBed`, patterns déjà établis dans les trois fichiers de spec existants.
- `open-polls.service.spec.ts` utilise un harnais composant-hôte (`TestHost`, ligne 68) pour vider la queue d'`effect()` via `fixture.whenStable()` — **réutiliser ce harnais**, ne pas instancier le service hors composant pour les nouveaux tests (l'`effect()` existant du constructeur ne se viderait pas correctement sinon).
- `mode.service.spec.ts` n'a aujourd'hui aucun harnais composant (pas d'`effect()` dans `ModeService`) — `TestBed.inject()` direct suffit, pas de changement de pattern nécessaire.

### Previous Story Intelligence (Stories 19.1-21.3)

- Pattern d'extension de `RealtimeService.handlers` : établi Story 19.1, reproduit à chaque story de câblage — toujours une entrée `{ prefix, notifyChanged }` de plus, jamais de refonte de `matchingHandlers()`/`onSignal()`.
- Contrat AD-4 : chaque service expose `notifyChanged(): void`, mécanisme interne libre — cette story ajoute un **quatrième** cas distinct (après le compteur `_changed` de `ScenariosService`/`CharacterService`/`HommeDragonService`/`InvitationsService`) : relance directe d'une logique de rafraîchissement existante, sans aucun signal `_changed` (exactement l'AD-4 point 3, mais pour de vrai cette fois côté `ModeService`).
- Cette story clôt l'Epic 22 et le Palier 7 entier (FR14 couvert ; FR15, Story 22.2, est purement documentaire — pas de code).

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/core/poll/open-polls.service.ts` (+ spec), `apps/web/src/app/core/mode/mode.service.ts` (+ spec), `apps/web/src/app/core/realtime/realtime.service.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 22.1 complète, lignes 319-337)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4 point 3 — divergence documentée ci-dessus)
- `_bmad-output/implementation-artifacts/19-1-cablage-scenariotimeline-seancelist-et-calendarview.md` (pattern d'extension de `handlers`)
- Vérifications empiriques effectuées pendant la préparation de cette story : `open-polls.service.ts`/`mode.service.ts` n'ont aujourd'hui aucun `notifyChanged()` ; le seul `effect()` sur `playerParties()` appartient à `OpenPollsService`, pas à `ModeService` (contredit `ARCHITECTURE-SPINE.md` AD-4 point 3) ; `refresh()` (`OpenPollsService`) protège déjà contre la concurrence via son compteur `seq` interne ; aucun cycle de dépendances DI entre `RealtimeService`/`OpenPollsService`/`ModeService`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm ng test --watch=false --include='**/open-polls.service.spec.ts'` — 6/6 après Task 1.
- `docker compose exec web pnpm ng test --watch=false --include='**/mode.service.spec.ts'` — 3/3 après Task 2.
- `docker compose exec web pnpm ng test --watch=false --include='**/realtime.service.spec.ts'` — 19/19 après Task 3/4.
- Première exécution de la suite complète : 917/917 tests passants MAIS 68 erreurs non gérées (`TypeError: this.modeSvc.playerParties is not a function`) provenant de `partie-detail.spec.ts` — régression transitive non anticipée par la story (fichier absent du File List prévu). Cause : `PartieDetail` utilise le VRAI `RealtimeService` (jamais mocké, cf. commentaire ligne 32-35 du fichier), qui injecte désormais réellement `OpenPollsService` (Task 3) ; celui-ci injecte à son tour le VRAI `ModeService`... mocké dans ce fichier avec seulement `{ refreshMjParties: vi.fn() }` (3 occurrences), sans `playerParties` — l'`effect()` du constructeur d'`OpenPollsService` (préexistant, Story non liée) plante immédiatement à l'instanciation.
- Corrigé : les 3 mocks `ModeService` de `partie-detail.spec.ts` étendus avec `playerParties: signal([])`. Vérifié qu'aucun autre fichier de spec n'utilise le vrai `RealtimeService` sans le mocker (recherche exhaustive : seuls `realtime.service.spec.ts` et `partie-detail.spec.ts` concernés, tous deux corrigés).
- `docker compose exec web pnpm test` — suite complète finale : 71 fichiers / 917 tests, 0 échec, 0 erreur non gérée.

### Completion Notes List

- Task 1 : `OpenPollsService.notifyChanged()` ajoutée, réutilise directement `refresh()` (déjà protégé contre la concurrence via son compteur `seq` interne, aucune garde supplémentaire nécessaire).
- Task 2 : `ModeService.notifyChanged()` ajoutée — divergence architecture documentée directement dans le code (voir commentaire) : contrairement à ce qu'affirme `ARCHITECTURE-SPINE.md` AD-4 point 3, `ModeService` n'a aucun `effect()` interne (c'est celui d'`OpenPollsService` qui observe `ModeService.playerParties()` de l'extérieur) — `notifyChanged()` relance donc directement les deux méthodes publiques existantes (`refreshMjParties()`/`refreshPlayerParties()`).
- Task 3 : `RealtimeService.handlers` passe de 5 à 7 entrées — les deux nouvelles au préfixe `'partie:'` (comme `PartiesService`/`ScenariosService`/`CharacterService`/`HommeDragonService`). Aucun cycle de dépendances DI introduit (vérifié : ni `OpenPollsService` ni `ModeService` n'injectent `RealtimeService`).
- Task 4 : nouveaux tests pour les trois fichiers, dont un test de non-régression sur `RealtimeService` confirmant que les six/sept handlers du préfixe `'partie:'` se déclenchent tous ensemble sur un même événement `'open'`.
- Task 5 : régression transitive découverte et corrigée dans `partie-detail.spec.ts` (non prévue par la story) — voir Debug Log. Suite complète : 917/917 tests web, 0 régression, 0 erreur non gérée. Aucune modification `apps/api`, aucun composant déjà câblé (`PartieDetail`, `ScenarioTimeline`, etc.) — le câblage de ces deux services partagés est bien transparent pour eux, conforme aux attentes de la story.

### File List

- `apps/web/src/app/core/poll/open-polls.service.ts` (modifié)
- `apps/web/src/app/core/poll/open-polls.service.spec.ts` (modifié)
- `apps/web/src/app/core/mode/mode.service.ts` (modifié)
- `apps/web/src/app/core/mode/mode.service.spec.ts` (modifié)
- `apps/web/src/app/core/realtime/realtime.service.ts` (modifié)
- `apps/web/src/app/core/realtime/realtime.service.spec.ts` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — régression transitive non anticipée par la story, corrigée pendant l'implémentation)

## Change Log

- 2026-07-23 : Implémentation complète de la Story 22.1 (Tasks 1-5) — `notifyChanged()` ajouté sur `OpenPollsService`/`ModeService`, deux nouvelles entrées `'partie:'` dans `RealtimeService.handlers`. Divergence architecture (`ARCHITECTURE-SPINE.md` AD-4 point 3) documentée dans le code. Régression transitive corrigée dans `partie-detail.spec.ts` (mock `ModeService` incomplet). 917/917 tests web, aucune régression. Dernière story de code du Palier 7 (seule 22.2, purement documentaire, reste).
- 2026-07-23 : Revue de code (3 couches adversariales) — 1 patch appliqué (mock mort dans `mode.service.spec.ts`), 4 items différés (voir `deferred-work.md`), 7 écartés. Suite finale : 917/917 tests web. Statut passé à `done`.
