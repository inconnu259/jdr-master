---
baseline_commit: 4c98c54
---

# Story 10.2: Consulter historique et voyageurs protégés

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want voir automatiquement l'historique des scénarios joués et la liste des voyageurs protégés sur la fiche de mon Homme Dragon,
So that je n'aie jamais à les ressaisir manuellement.

## Acceptance Criteria

1. **Given** ma Partie a des scénarios au statut `Passé` et des membres actifs **When** j'ouvre la fiche de mon Homme Dragon **Then** je vois la liste des voyageurs protégés correspondant aux membres actuels de la Partie **And** je vois un historique listant chaque scénario `Passé` avec son titre, sa date et ses personnages participants
2. **Given** aucun scénario de ma Partie n'est encore `Passé` **When** j'ouvre la fiche **Then** l'historique est vide, sans erreur
3. **Given** un scénario de ma Partie est au statut `Brouillon`, `À venir` ou `Courant` **When** je consulte l'historique de mon Homme Dragon **Then** ce scénario n'y apparaît jamais
4. **Given** un membre rejoint ou quitte ma Partie, ou un nouveau scénario passe `Passé` **When** je rouvre la fiche de mon Homme Dragon **Then** voyageurs protégés et historique reflètent l'état à jour, sans action de ma part

## Tasks / Subtasks

- [x] **Task 1 — Décision d'implémentation : `participants` = pseudos, pas noms de personnage** (bloquant pour Task 2/3, lire avant de coder)
  - [ ] La spine (`ARCHITECTURE-SPINE.md` AD-3) type `historique` comme `{ scenarioTitle: string, date: string, participants: string[] }[]` — un simple tableau de `string`, et ne déclare **aucune** dépendance de `HommeDragonModule` vers `CharacterModule` (seulement `PartiesModule`/`ScenariosModule`). L'AC parle de « personnages participants » dans son libellé français, mais **ne pas** en déduire qu'il faut résoudre des noms de personnage (`sheetData.narrative.name`) — cela demanderait d'importer `CharacterModule` dans `HommeDragonModule`, que la spine exclut explicitement. Utiliser le **pseudo utilisateur** (déjà disponible via `ScenariosService.findAllForPartie()`/`PartiesService.listMembers()`, aucune nouvelle dépendance de module).
  - [ ] Si ce choix s'avère décevant à l'usage (le MJ veut voir « Ignis a participé » plutôt que « alice a participé »), c'est un raffinement pour une story ultérieure — pas cette story.

- [x] **Task 2 — Types partagés (`packages/shared/src/index.ts`)** (AC1) — `voyageursProteges`/`historique` ajoutés à `HommeDragonDto`.
  - [ ] Étendre l'interface `HommeDragonDto` existante (section `// ─── Epic 10 : Homme Dragon (MJ) ──`) avec les 2 nouveaux champs, **non optionnels** (toujours calculés, jamais `undefined`) :
    ```typescript
    export interface HommeDragonDto {
      id: string;
      userId: string;
      partieId: string;
      gameSystemId: string;
      sheetData: HommeDragonSheetData;
      createdAt: string;
      updatedAt: string;
      /** Membres actuels de la Partie (hors MJ) — calculé à la lecture, jamais stocké (AD-3, Story 10.2). */
      voyageursProteges: { userId: string; pseudo: string }[];
      /** Scénarios `PASSE` de la Partie — calculé à la lecture, jamais stocké (AD-3, Story 10.2). */
      historique: { scenarioTitle: string; date: string; participants: string[] }[];
    }
    ```
  - [ ] **Ne pas** ajouter `derived` (niveau/PS) ici — Story 10.3, hors scope.

- [x] **Task 3 — `HommeDragonModule` importe `ScenariosModule`** (AC1)
  - [ ] Dans `apps/api/src/homme-dragon/homme-dragon.module.ts`, ajouter `ScenariosModule` aux `imports` (retirer le commentaire de Story 10.1 qui différait cet import — il devient pertinent ici) :
    ```typescript
    imports: [PartiesModule, GameSystemModule, ScenariosModule],
    ```
  - [ ] Import à sens unique (`HommeDragonModule → ScenariosModule`) — `ScenariosModule` n'a besoin de rien en retour, aucun `forwardRef` requis (même situation que `AnnouncementsModule → ScenariosModule`, Story 9.1 — contrairement au cycle `ScenariosModule ↔ PollModule` de la Story 8.8).

- [x] **Task 4 — `HommeDragonService` : calcul de `voyageursProteges`/`historique`** (AC1, AC2, AC3, AC4) — `buildDto()` remplace `toDto()`, utilisé par `create()`/`update()`/`findOne()`. 8 nouveaux tests.
  - [ ] TDD : étendre `homme-dragon.service.spec.ts` d'abord (voir Task 5 pour la stratégie de mock à adopter dans **tous** les tests existants, pas seulement les nouveaux).
  - [ ] Injecter `ScenariosService` dans le constructeur (à la suite de `gameSystems`).
  - [ ] Remplacer la fonction `toDto()` (module-level, synchrone) par une méthode privée **asynchrone** `buildDto(hommeDragon, partieId, userId)`, appelée par les 3 méthodes publiques (`create`, `update`, `findOne`) — **AD-3 : « calculé à la lecture » s'applique à toute réponse contenant l'état de la fiche, pas seulement à `findOne()`** ; ne pas laisser `create()`/`update()` renvoyer un `HommeDragonDto` avec `voyageursProteges: []`/`historique: []` figés alors que `findOne()` renverrait les vraies valeurs — ce serait une incohérence de shape selon l'endpoint appelé :
    ```typescript
    private async buildDto(hommeDragon: any, partieId: string, userId: string): Promise<HommeDragonDto> {
      const [voyageursProteges, historique] = await Promise.all([
        this.computeVoyageursProteges(partieId, userId),
        this.computeHistorique(partieId, userId),
      ]);
      return {
        id: hommeDragon.id,
        userId: hommeDragon.userId,
        partieId: hommeDragon.partieId,
        gameSystemId: hommeDragon.gameSystemId,
        sheetData: hommeDragon.sheetData,
        createdAt: hommeDragon.createdAt.toISOString(),
        updatedAt: hommeDragon.updatedAt.toISOString(),
        voyageursProteges,
        historique,
      };
    }

    private async computeVoyageursProteges(
      partieId: string,
      userId: string,
    ): Promise<{ userId: string; pseudo: string }[]> {
      const members = await this.parties.listMembers(partieId, userId);
      return members.map((m) => ({ userId: m.userId, pseudo: m.pseudo }));
    }

    private async computeHistorique(
      partieId: string,
      userId: string,
    ): Promise<{ scenarioTitle: string; date: string; participants: string[] }[]> {
      const scenarios = await this.scenarios.findAllForPartie(partieId, userId);
      const voyageurs = await this.computeVoyageursProteges(partieId, userId);
      return scenarios
        .filter((s) => s.status === 'PASSE' && s.closedAt !== null)
        .map((s) => ({
          scenarioTitle: s.title,
          date: s.closedAt as string,
          // AD-4 (Story 8.1) : ScenarioDto.participants n'est peuplé QUE pour CAMPAGNE_EPISODIQUE.
          // Pour ONE_SHOT/CAMPAGNE_LINEAIRE (undefined), tous les membres actuels sont réputés
          // avoir participé — c'est le sens même de ces deux kinds (pas d'inscription individuelle).
          participants: s.participants?.map((p) => p.pseudo) ?? voyageurs.map((v) => v.pseudo),
        }));
    }
    ```
    **Décisions figées dans ce code, ne pas dévier sans relire Task 1/les Dev Notes** :
    - `date` = `scenario.closedAt` (toujours non-null pour un statut `PASSE` — posé atomiquement dans le même `updateMany` que le changement de statut, cf. `ScenariosService` ligne ~368 `data: { status: 'PASSE', closedAt: new Date() }`). Le filtre `s.closedAt !== null` est une garde de typage défensive (le type `ScenarioDto.closedAt` est `string | null`), pas une situation censée se produire en pratique.
    - Aucune re-vérification d'accès nécessaire dans `computeVoyageursProteges`/`computeHistorique` : `parties.listMembers()`/`scenarios.findAllForPartie()` font chacun leur propre `getViewable(partieId, userId)` en interne — appeler `create()`/`update()` (déjà passés par `getOwned`) puis ces méthodes (qui refont un `getViewable`) est redondant mais inoffensif (même utilisateur, garantie plus large déjà satisfaite). Ne pas essayer d'optimiser en supprimant ce double-check — la duplication est le prix normal de la réutilisation de méthodes publiques déjà testées, pas une erreur.
  - [ ] Remplacer les 3 appels à l'ancien `toDto(hommeDragon)` (dans `create()`, `update()`, `findOne()`) par `await this.buildDto(hommeDragon, partieId, userId)`.
  - [ ] Tests (nouveaux, en plus de ceux listés en Task 5) :
    - AC1 : `findOne()` avec 2 membres + 1 scénario `PASSE` → `voyageursProteges` contient les 2 pseudos, `historique` contient 1 entrée avec le bon titre/date/participants.
    - AC2 : aucun scénario `PASSE` → `historique: []`, pas d'exception.
    - AC3 : scénarios `BROUILLON`/`A_VENIR`/`COURANT` mélangés avec un `PASSE` → seul le `PASSE` apparaît dans `historique`.
    - Partie `CAMPAGNE_EPISODIQUE` avec un scénario `PASSE` dont `participants` est peuplé (2 sur 5 membres) → `historique[0].participants` ne contient que ces 2 pseudos, pas les 5 membres.
    - Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` (participants `undefined` sur le DTO) → `historique[0].participants` contient **tous** les membres actuels (fallback).
    - `create()` et `update()` retournent aussi `voyageursProteges`/`historique` peuplés (pas juste `findOne()`) — au moins 1 test par méthode.

- [x] **Task 5 — Mettre à jour les mocks des tests existants** (non-régression) — 21 tests Story 10.1 inchangés, tous verts (29/29 au total dans les 2 fichiers de spec).
  - [ ] `homme-dragon.service.spec.ts` : ajouter `ScenariosService` (mock `{ findAllForPartie: jest.fn() }`) au module de test, et étendre `makePartiesService()`/le mock `PartiesService` avec `listMembers: jest.fn()`.
  - [ ] Dans le `beforeEach`, poser des valeurs par défaut neutres pour ne **pas** casser les 15 tests `create()`/`update()`/`findOne()` déjà existants (Story 10.1) qui n'assertent pas sur `voyageursProteges`/`historique` : `parties.listMembers.mockResolvedValue([])`, `scenarios.findAllForPartie.mockResolvedValue([])`. Vérifier après coup que ces 15 tests passent toujours sans modification de leurs assertions (ils devraient — `buildDto` ajoute des champs, ne change aucun champ déjà testé).
  - [ ] `homme-dragon.controller.spec.ts` : aucun changement nécessaire (le controller délègue tel quel, ne connaît pas la forme du DTO).

- [x] **Task 6 — Frontend : afficher voyageurs protégés + historique sur `HommeDragonSheet`** (AC1, AC2, AC3, AC4) — 14/14 tests verts (5 nouveaux + fixtures `makeDto()` étendues dans les 2 specs concernés).
  - [ ] TDD : étendre `homme-dragon-sheet.spec.ts` d'abord.
  - [ ] Dans `homme-dragon-sheet.html`, à la suite des champs narratifs déjà affichés dans la branche fiche existante (`@else` après `hommeDragon() === null`), ajouter 2 sections :
    ```html
    <section class="homme-dragon-sheet__voyageurs">
      <h4>Voyageurs protégés</h4>
      @if (hommeDragon()!.voyageursProteges.length === 0) {
        <p class="muted">Aucun voyageur pour l'instant.</p>
      } @else {
        <ul>
          @for (v of hommeDragon()!.voyageursProteges; track v.userId) {
            <li>{{ v.pseudo }}</li>
          }
        </ul>
      }
    </section>

    <section class="homme-dragon-sheet__historique">
      <h4>Historique</h4>
      @if (hommeDragon()!.historique.length === 0) {
        <p class="muted">Aucun scénario joué pour l'instant.</p>
      } @else {
        <ul>
          @for (h of hommeDragon()!.historique; track h.scenarioTitle + h.date) {
            <li>{{ h.scenarioTitle }} — {{ h.date | date: 'longDate' }} — {{ h.participants.join(', ') }}</li>
          }
        </ul>
      }
    </section>
    ```
    Pattern d'état vide identique au reste de l'app (`<p class="muted">`, cf. `partie-detail.html` `.no_description`/`.no_session`). `DatePipe` déjà utilisé ailleurs (`partie-detail.ts` l'importe) — à ajouter aux `imports` du `@Component` de `HommeDragonSheet` (actuellement `[FormsModule, MatButtonModule]`).
  - [ ] `track h.scenarioTitle + h.date` : pas d'`id` unique disponible sur une entrée d'historique (ce n'est pas une entité en base, cf. AD-3) — combinaison titre+date suffisamment stable pour cette liste en lecture seule, jamais réordonnée par l'utilisateur.
  - [ ] Tests : fiche avec 2 voyageurs + 1 entrée d'historique → les deux sections affichent le bon contenu ; `voyageursProteges: []` → message d'état vide, pas de liste ; `historique: []` → message d'état vide, pas de liste (AC2) ; mettre à jour le fixture `makeDto()` du spec existant pour inclure `voyageursProteges`/`historique` (sinon TypeScript refuse de compiler faute de ces champs désormais non optionnels sur `HommeDragonDto`).

- [x] **Task 7 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 681/681, 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 744/744, 0 régression.
  - [x] Redémarrage réel du conteneur `api` (`docker compose up -d --build api`) — `Nest application successfully started`, `HommeDragonController` mappé, aucune erreur de résolution DI malgré le nouvel import `ScenariosModule`.

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-17 sur `git diff HEAD` (8 fichiers, baseline `4c98c54`). Acceptance Auditor : 0 violation d'AC, les 4 ACs sont correctement implémentées — en particulier AC4 confirme que le fallback « tous les membres actuels » pour ONE_SHOT/CAMPAGNE_LINEAIRE est le comportement **voulu**, pas un bug (l'AC exige explicitement que l'historique reflète l'état à jour de la composition de la Partie, pas un instantané figé au moment du scénario).

- [x] [Review][Decision] `create()`/`update()` échouent désormais en 500 si le calcul post-écriture de `voyageursProteges`/`historique` (dans `buildDto()`) lève une exception transitoire — la fiche est déjà écrite en base à ce stade, mais le client reçoit une erreur au lieu de la confirmation. **Décision utilisateur (2026-07-17) : option 1, comportement conservé tel quel** — échec loud, cohérent avec le reste du module qui ne masque jamais d'erreur ; le seul déclencheur réaliste est une erreur transitoire d'infra (le contrôle d'accès a déjà réussi juste avant dans la même requête), jugé trop rare pour justifier la complexité d'une dégradation gracieuse. Aucune modification de code. [apps/api/src/homme-dragon/homme-dragon.service.ts]
- [x] [Review][Patch] `computeHistorique()` rappelle `computeVoyageursProteges()` en interne alors que `buildDto()` a déjà calculé ce même résultat en parallèle via `Promise.all` — double aller-retour `PartiesService.listMembers()`/Prisma inutile, **et** risque de divergence si un membre rejoint/quitte la Partie entre les deux appels non coordonnés (les deux valeurs dans la même réponse pourraient refléter des instantanés de composition différents). Signalé indépendamment par 3 sources (Blind Hunter, Edge Case Hunter, Acceptance Auditor). **Corrigé** : `voyageursProteges` calculé une seule fois dans `buildDto()`, passé en paramètre à `computeHistorique()` (plus d'appel interne, plus de `Promise.all` — séquentiel mais cohérent, un seul instantané partagé). 29/29 tests `homme-dragon` verts, 681/681 API, `pnpm typecheck` propre. [apps/api/src/homme-dragon/homme-dragon.service.ts]
- [x] [Review][Defer] `track h.scenarioTitle + h.date` (trackBy Angular du template historique) pourrait collisionner si deux scénarios distincts partageaient exactement le même titre et le même timestamp de clôture à la milliseconde près — extrêmement improbable en pratique (deux `close()` distincts, jamais simultanés), mais la seule vraie correction serait d'exposer un identifiant stable dans `historique[]` (changement de forme du DTO, décision de scope, pas un patch ponctuel). [apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html] — deferred, collision quasi impossible en pratique, corriger proprement nécessite d'étendre le DTO
- [x] [Review][Defer] Aucune pagination/limite sur `historique` — pour une campagne très longue (dizaines de scénarios `PASSE`), la liste grossit sans borne. Cohérent avec le reste de l'app (aucune liste n'est paginée ailleurs — `XpHistory`, `CharacterSnapshot`, etc.), pas un écart introduit par cette story. [apps/api/src/homme-dragon/homme-dragon.service.ts] — deferred, cohérent avec le pattern déjà établi partout ailleurs dans l'app, aucun besoin concret identifié

**Écarté (bruit/faux positifs)** : fallback « tous les membres actuels » pour ONE_SHOT/CAMPAGNE_LINEAIRE qualifié d'« historiquement inexact » par le Blind Hunter — **faux positif**, c'est le comportement explicitement exigé par AC4 (reflet dynamique de l'état actuel, pas un instantané figé), confirmé par l'Acceptance Auditor ; `date: s.closedAt as string` jugé non sûr — **faux positif**, `ScenarioDto.closedAt` est déjà une string ISO (`toEnrichedDto` appelle `.toISOString()` avant que le DTO ne quitte `ScenariosService`), l'assertion de type est une limitation TypeScript après un `.filter()` non narrowing, pas un bug runtime ; latence ajoutée sur `create()`/`update()` — décision d'architecture **explicitement actée** (AD-3, « calculé à la lecture » s'applique à toute réponse) ; absence d'exclusion du MJ dans `voyageursProteges` — **faux positif**, `Membership` ne contient structurellement jamais le MJ (`Partie.mjId`, pas une ligne `Membership`) ; portée d'autorisation de `findAllForPartie` non vérifiée — déjà sûre, seuls les scénarios `PASSE` sont exposés ici (aucune restriction anti-spoil ne s'applique à du contenu déjà joué, AD-6) ; types inline dupliqués (`{userId,pseudo}`/`{scenarioTitle,date,participants}`) plutôt qu'un type nommé partagé — cohérent avec le style déjà établi (`HommeDragonSheetData` et consorts ne sont pas systématiquement extraits ailleurs) ; `hommeDragon: any` conservé dans `buildDto()` — pattern préexistant déjà accepté (`toDto(character: any)` dans `character.service.ts`, écarté pour la même raison en revue de la Story 9.1) ; absence de garde défensive frontend si `voyageursProteges`/`historique` sont absents d'une réponse API — spéculatif, aucun chemin réaliste dans cette app (pas de service worker/cache offline) ; logique de branchement non testée — **faux positif**, le Blind Hunter n'avait pas accès aux fichiers de test (explicitement exclus du prompt pour rester concis) : 8 nouveaux tests backend + 5 frontend couvrent précisément ces branches ; absence de `forwardRef` non démontrée — vérifiée factuellement lors du redémarrage réel du conteneur (Task 7) : le graphe DI se résout sans erreur.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-3** (`ARCHITECTURE-SPINE.md`, `architecture-jdr-master-2026-07-15`) : `voyageursProteges`/`historique` sont **calculés à la lecture**, jamais stockés — aucune migration Prisma dans cette story, aucune colonne ajoutée au modèle `HommeDragon`. Les deux champs sont assemblés par `HommeDragonService`, qui dépend de `ScenariosService`/`PartiesService` en lecture seule (`HommeDragonModule` importe `ScenariosModule`, import à sens unique).
- **`participants: string[]`** (pas d'objet structuré) — décision de la spine, cf. Task 1. Ne pas résoudre de noms de personnage (nécessiterait `CharacterModule`, hors dépendances déclarées).
- **NFR1** (déjà appliqué depuis la Story 10.1) : lecture ouverte à tout membre — inchangé, `findOne()` garde son accès `getViewable`.
- Cette story **n'ajoute aucune route** — `voyageursProteges`/`historique` voyagent dans le `HommeDragonDto` déjà renvoyé par les 3 routes existantes (`POST`/`GET`/`PATCH /parties/:id/homme-dragon`).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/homme-dragon/homme-dragon.service.ts`** (état actuel post-Story 10.1 + revue de code) — `create()`/`update()`/`findOne()` et le `toDto()` module-level à remplacer par `buildDto()` (Task 4).
- **`apps/api/src/scenarios/scenarios.service.ts`** — `findAllForPartie(partieId, userId)` (méthode publique déjà exportée, utilisée par le frontend via `ScenariosService.listAll()`) : retourne `ScenarioDto[]` avec `status`/`closedAt`/`title`/`participants` déjà correctement peuplés selon le `kind` de la Partie (AD-4, Story 8.1) — **ne pas réinventer** cette logique de filtrage par kind, la réutiliser telle quelle. Voir aussi la ligne ~368 pour la garantie `closedAt` toujours posé avec `status: 'PASSE'`.
- **`apps/api/src/parties/parties.service.ts`** — `listMembers(partieId, userId)` : retourne les membres (hors MJ, jamais un `Membership` pour lui) avec pseudo — exactement ce que `voyageursProteges` doit contenir.
- **`apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts`/`.html`** (état actuel post-Story 10.1 + revue de code) — la branche fiche existante (`@else` après le formulaire de création) est l'endroit où ajouter les 2 nouvelles sections ; ne pas toucher au formulaire de création ni à l'édition d'artefact.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** — import `DatePipe` déjà présent, patron direct pour l'ajouter à `HommeDragonSheet`.

### Hors scope explicite de cette story (Stories 10.3-10.5)

- Niveau/PS calculés (FR5/FR7), `computeHommeDragonDerived()`, champ `derived` sur `HommeDragonDto` — Story 10.3.
- Invitation à choisir un pouvoir d'éveil (FR6) — Story 10.4.
- Export PDF (FR8) — Story 10.5.
- Résolution de noms de personnage pour `participants` (cf. Task 1) — pas planifiée, à réévaluer seulement si un besoin concret émerge.

### Project Structure Notes

- Aucun nouveau dossier — cette story modifie exclusivement des fichiers déjà créés par la Story 10.1 (`homme-dragon.module.ts`, `homme-dragon.service.ts`, `homme-dragon-sheet.ts`/`.html`) plus `packages/shared/src/index.ts`.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 128-151, Story 10.2 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-3, section « Types partagés »)
- `_bmad-output/implementation-artifacts/10-1-creer-sa-fiche-homme-dragon.md` (story précédente — module/service/composant existants, patterns établis, revue de code déjà appliquée)
- `apps/api/src/scenarios/scenarios.service.ts` (`findAllForPartie`, AD-4 Story 8.1 sur `participants`)
- `apps/api/src/parties/parties.service.ts` (`listMembers`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

- Aucun piège majeur. Deux fixtures `makeDto()` (`apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` et `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts`) ne compilaient plus une fois `voyageursProteges`/`historique` rendus non optionnels sur `HommeDragonDto` — corrigées en ajoutant des tableaux vides par défaut, repérées immédiatement par l'erreur `tsc` d'esbuild lors du premier `ng test` (RED phase de Task 6).
- `ScenariosService` injectée dans les tests du service backend déclenche le même piège ESM déjà documenté (`@master-jdr/game-rules` transitif via `CharacterService`) — déjà couvert par le `jest.mock` posé en Story 10.1, aucune modification nécessaire.

### Completion Notes List

- Task 1 : décision actée — `historique[].participants` = pseudos utilisateur, pas de noms de personnage (pas de dépendance vers `CharacterModule`).
- Task 2 : `HommeDragonDto` étendu (`voyageursProteges`, `historique`, tous deux non optionnels).
- Task 3 : `HommeDragonModule` importe désormais `ScenariosModule` (import à sens unique, aucun `forwardRef`).
- Task 4 : `HommeDragonService.buildDto()` remplace l'ancien `toDto()` module-level — appelé par `create()`/`update()`/`findOne()`, calcule `voyageursProteges` (`PartiesService.listMembers()`) et `historique` (`ScenariosService.findAllForPartie()`, filtré `PASSE`, fallback participants = tous les membres pour ONE_SHOT/CAMPAGNE_LINEAIRE). 8 nouveaux tests.
- Task 5 : mocks `parties.listMembers`/`scenarios.findAllForPartie` ajoutés avec valeurs neutres par défaut — les 21 tests Story 10.1 passent sans modification de leurs assertions.
- Task 6 : sections « Voyageurs protégés »/« Historique » ajoutées à `HommeDragonSheet` (`DatePipe` importé), états vides gérés (AC2). 5 nouveaux tests + 2 fixtures `makeDto()` étendues.
- Task 7 : 681/681 tests API + 744/744 tests web + `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié (`HommeDragonController` mappé, aucune erreur DI malgré le nouvel import `ScenariosModule`).

### File List

**Fichiers modifiés** (aucun nouveau fichier — cette story étend exclusivement les fichiers créés par la Story 10.1)
- `packages/shared/src/index.ts` (`HommeDragonDto` étendu)
- `apps/api/src/homme-dragon/homme-dragon.module.ts` (import `ScenariosModule`)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (`buildDto()`/`computeVoyageursProteges()`/`computeHistorique()`)
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` (mocks `ScenariosService`/`listMembers` + 8 nouveaux tests)
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` (fixture `makeDto()` étendue)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (import `DatePipe`)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html` (sections voyageurs/historique)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` (fixture étendue + 5 nouveaux tests)

## Change Log

- 2026-07-17 : Story créée via `bmad-create-story` (lecture directe de `homme-dragon.service.ts`/`.module.ts`/`homme-dragon-sheet.ts`/`.html` post-Story 10.1 + revue de code, `scenarios.service.ts` (`findAllForPartie`, garantie `closedAt`), `parties.service.ts` (`listMembers`), `packages/shared/src/index.ts` (`HommeDragonDto`/`ScenarioDto`), `epics-palier5.md` Story 10.2, `ARCHITECTURE-SPINE.md` AD-3). Décision de conception documentée en Task 1 : `historique[].participants` = pseudos utilisateur (type `string[]` déclaré par la spine), pas des noms de personnage — résoudre des noms aurait nécessité d'importer `CharacterModule` dans `HommeDragonModule`, que la spine ne déclare pas. Réutilisation intégrale de `ScenariosService.findAllForPartie()` (déjà correct par `kind` de Partie, AD-4 Story 8.1) et `PartiesService.listMembers()` — aucune nouvelle méthode de service à créer côté `ScenariosService`/`PartiesService`, uniquement `HommeDragonService.buildDto()`/`computeVoyageursProteges()`/`computeHistorique()` nouveaux. `create()`/`update()`/`findOne()` renvoient désormais tous les 3 un DTO avec `voyageursProteges`/`historique` peuplés (pas seulement `findOne()`), pour une forme de réponse cohérente quel que soit l'endpoint appelé.
- 2026-07-17 : Implémentation complète (bmad-dev-story). 7 tasks en TDD red-green. `HommeDragonDto` étendu, `HommeDragonModule` importe `ScenariosModule`, `HommeDragonService.buildDto()` calcule `voyageursProteges`/`historique` à la lecture pour les 3 méthodes publiques, sections frontend ajoutées avec états vides gérés. 681/681 tests API + 744/744 tests web, `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié (aucune erreur DI). Statut → `review`.
- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales sur `git diff HEAD`). Acceptance Auditor : 0 violation d'AC — en particulier confirme que le fallback « tous les membres actuels » pour ONE_SHOT/CAMPAGNE_LINEAIRE (initialement suspecté par le Blind Hunter) est le comportement voulu par AC4, pas un bug. 1 Decision tranchée par l'utilisateur : `create()`/`update()` conservent leur comportement d'échec loud si le calcul post-écriture échoue (déclencheur réaliste jugé trop rare — erreur transitoire d'infra uniquement — pour justifier une dégradation gracieuse). 1 Patch appliqué : `computeHistorique()` ne rappelle plus `computeVoyageursProteges()` en interne (double requête Prisma + risque de divergence entre les deux champs), réutilise désormais l'instantané déjà calculé par `buildDto()`. 2 items différés (trackBy Angular théoriquement collisionnable ; absence de pagination sur `historique`, cohérente avec le reste de l'app). 10 items écartés comme bruit/faux positifs. Suite finale : 681/681 tests API, `pnpm typecheck` propre. Statut → `done`.
