---
baseline_commit: 9878018
---

# Story 10.4: Choisir un pouvoir d'éveil au changement de niveau

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want être invité à choisir un pouvoir d'éveil quand mon Homme Dragon change de niveau,
So that sa progression narrative reste sous mon contrôle.

## Acceptance Criteria

1. **Given** mon Homme Dragon vient de franchir un seuil de niveau depuis ma dernière consultation **When** j'ouvre la fiche **Then** je suis invité à choisir un pouvoir d'éveil parmi ceux débloqués à ce niveau
2. **Given** j'ai déjà choisi un pouvoir d'éveil pour un niveau donné **When** je consulte à nouveau la fiche **Then** ce choix n'est pas re-proposé et reste visible sur la fiche
3. **Given** plusieurs seuils de niveau ont été franchis depuis ma dernière consultation (je n'ai pas rouvert la fiche depuis longtemps) **When** j'ouvre la fiche **Then** un choix de pouvoir d'éveil m'est proposé pour chaque niveau intermédiaire non encore pourvu, pas seulement pour le niveau final atteint

## Tasks / Subtasks

- [x] **Task 0 — Contenu de jeu : les pouvoirs d'éveil (niveaux 2 à 5)** (bloquant pour Task 3, lire avant de coder)
  - [x] **Ne pas inventer de noms/effets de pouvoirs d'éveil.** Même règle que Task 0 de la Story 10.1 (artefacts) : ce projet seed du contenu Ryuutama **officiel**, jamais improvisé. Contrairement aux 12 artefacts (3 par race), la spine (`ARCHITECTURE-SPINE.md` AD-4) type les pouvoirs d'éveil comme `{ key, label, levelUnlocked: 2|3|4|5 }` — **sans champ `race`** : ce sont donc, sauf indication contraire de l'utilisateur, des pouvoirs communs à toutes les races (à confirmer explicitement, ne pas supposer). Si cette donnée n'est pas disponible dans la session, **demander la source à l'utilisateur** (nombre de pouvoirs par niveau, noms, effets) avant d'écrire `eveil-powers.json` — ne jamais committer un placeholder présenté comme du contenu officiel.
  - [x] Une fois la donnée obtenue, créer `apps/api/game-systems/ryuutama/data/eveil-powers.json`, format `{ key, label, levelUnlocked, description }` (même extension `description` que `homme-dragon-artefacts.json`, Story 10.1 — préparé pour une future popup d'aide). Un niveau peut débloquer **1 ou plusieurs** pouvoirs au choix (le MJ n'en choisit qu'un seul par niveau, AC1) — vérifier auprès de l'utilisateur combien de pouvoirs sont proposés par niveau.

- [x] **Task 1 — `packages/game-rules/ryuutama` : `pendingEveilLevels()`** (AC1, AC2, AC3)
  - [x] TDD : étendre `packages/game-rules/src/__tests__/homme-dragon-derived.spec.ts` (même fichier que `levelForScenariosPasse`/`computeHommeDragonDerived`, Story 10.3 — cohérent, toute la logique de progression de l'Homme Dragon vit dans `homme-dragon-derived.ts`).
  - [x] Ajouter dans `packages/game-rules/src/ryuutama/homme-dragon-derived.ts` :
    ```typescript
    /**
     * Niveaux 2 à `currentLevel` pour lesquels aucun pouvoir d'éveil n'a encore été choisi
     * (`appliedLevels`) — un niveau peut débloquer un choix, jamais le niveau 1 (point de départ,
     * pas un changement de niveau). Contrairement à `pendingLevels()` du PJ (indexé sur la longueur
     * du tableau `levelUps[]`), ici chaque niveau est vérifié par appartenance explicite à
     * `appliedLevels` — plus sûr si un niveau était un jour appliqué hors ordre (ne devrait jamais
     * arriver via l'API, mais ne dépend pas de cette invariante pour rester correct).
     */
    export function pendingEveilLevels(currentLevel: number, appliedLevels: number[]): number[] {
      const pending: number[] = [];
      for (let level = 2; level <= currentLevel; level++) {
        if (!appliedLevels.includes(level)) pending.push(level);
      }
      return pending;
    }
    ```
  - [x] Exporter `pendingEveilLevels` depuis `packages/game-rules/src/index.ts`, à la suite des exports `homme-dragon-derived.ts` existants.
  - [x] Tests : `currentLevel=1, appliedLevels=[]` → `[]` (AC — niveau 1 ne débloque jamais de choix) ; `currentLevel=3, appliedLevels=[]` → `[2,3]` (AC3 — plusieurs seuils franchis d'un coup) ; `currentLevel=3, appliedLevels=[2]` → `[3]` (AC2 — un choix déjà fait n'est pas re-proposé) ; `currentLevel=5, appliedLevels=[2,3,4,5]` → `[]` (tout pourvu) ; `currentLevel=2, appliedLevels=[2]` → `[]`.

- [x] **Task 2 — Types partagés (`packages/shared/src/index.ts`)** (AC1, AC2, AC3)
  - [x] Étendre `HommeDragonSheetData` (persisté, contrairement à `derived`/`historique`/`voyageursProteges` qui sont calculés à la lecture — un choix de pouvoir d'éveil est une **décision du MJ**, pas une valeur dérivable, elle doit être stockée comme `artefact`/`nom` etc.) :
    ```typescript
    export interface HommeDragonSheetData {
      // ... champs existants (race, artefact, nom, apparence, ...) inchangés ...
      /** Pouvoirs d'éveil choisis, un par niveau franchi (2-5) — jamais recalculé, c'est un choix
       * du MJ (Story 10.4). Absent sur les fiches créées avant cette story. */
      eveilPowers?: { level: number; key: string }[];
    }
    ```
  - [x] Étendre `HommeDragonDto` avec la forme normalisée (toujours un tableau, jamais `undefined` — même traitement que `voyageursProteges`) **et** le calcul dérivé `pendingEveilLevels` :
    ```typescript
    export interface HommeDragonDto {
      // ... champs existants (..., derived) inchangés ...
      /** Miroir de `sheetData.eveilPowers`, toujours un tableau (jamais `undefined`). */
      eveilPowers: { level: number; key: string }[];
      /** Niveaux 2-5 en attente d'un choix de pouvoir d'éveil — calculé à la lecture (AD-3),
       * jamais stocké. Vide si aucun choix n'est en attente. */
      pendingEveilLevels: number[];
    }
    ```
  - [x] Ajouter le DTO d'entrée pour la nouvelle route :
    ```typescript
    /** Payload de choix d'un pouvoir d'éveil (POST /parties/:id/homme-dragon/eveil-power). */
    export interface ChooseEveilPowerDto {
      level: number;
      key: string;
    }
    ```

- [x] **Task 3 — Seed `eveilPower` (`GameSystemService`)** (AC1)
  - [x] Dans `apps/api/src/game-systems/game-system.service.ts`, ajouter une entrée à `CONTENT_TYPES` (mécanisme générique déjà en place, aucune autre modification requise, même schéma que Story 10.1/`hommeDragonArtefact`) :
    ```typescript
    { key: 'eveilPower', label: "Pouvoir d'éveil", file: 'eveil-powers.json' },
    ```

- [x] **Task 4 — Backend : `HommeDragonService.chooseEveilPower()` + route** (AC1, AC2, AC3)
  - [x] TDD : étendre `homme-dragon.service.spec.ts`/`homme-dragon.controller.spec.ts` d'abord.
  - [x] Créer `apps/api/src/homme-dragon/dto/choose-eveil-power.dto.ts` :
    ```typescript
    import { IsIn, IsNotEmpty, IsString } from 'class-validator';

    const EVEIL_LEVELS = [2, 3, 4, 5] as const;

    export class ChooseEveilPowerDto {
      @IsIn(EVEIL_LEVELS)
      level!: (typeof EVEIL_LEVELS)[number];

      @IsString()
      @IsNotEmpty()
      key!: string;
    }
    ```
  - [x] Dans `HommeDragonService` (`apps/api/src/homme-dragon/homme-dragon.service.ts`), ajouter :
    ```typescript
    async chooseEveilPower(
      partieId: string,
      userId: string,
      dto: ChooseEveilPowerDto,
    ): Promise<HommeDragonDto> {
      const partie = await this.parties.getOwned(partieId, userId); // MJ seul, AC — même garde que create()/update()
      if (partie.gameSystemId !== RYUUTAMA_ID) {
        throw new BadRequestException(`L'Homme Dragon n'existe que pour Ryuutama, pas pour "${partie.gameSystemId}"`);
      }

      const existing = await this.prisma.hommeDragon.findUnique({
        where: { userId_partieId_gameSystemId: { userId, partieId, gameSystemId: RYUUTAMA_ID } },
      });
      if (!existing) throw new NotFoundException('Homme Dragon introuvable');

      const sheetData = existing.sheetData as any;
      const appliedLevels: { level: number; key: string }[] = sheetData.eveilPowers ?? [];

      // Même calcul que buildDto() (niveau depuis historique.length) — dupliqué ici plutôt que
      // factorisé car chooseEveilPower() n'a pas besoin du reste du DTO (voyageursProteges,
      // historique complet) avant d'avoir validé la requête ; buildDto() est appelé à la toute fin
      // pour construire la réponse, une fois l'écriture faite.
      const voyageurs = await this.computeVoyageursProteges(partieId, userId);
      const historique = await this.computeHistorique(partieId, userId, voyageurs);
      const level = levelForScenariosPasse(historique.length);

      const pending = pendingEveilLevels(level, appliedLevels.map((e) => e.level));
      if (!pending.includes(dto.level)) {
        throw new BadRequestException("Ce niveau n'est pas en attente d'un choix de pouvoir d'éveil");
      }

      const catalog = await this.buildEveilPowerCatalog(partie.gameSystemId);
      const entry = catalog.find((e) => e.key === dto.key);
      if (!entry || entry.levelUnlocked !== dto.level) {
        throw new BadRequestException("Pouvoir d'éveil invalide pour ce niveau");
      }

      sheetData.eveilPowers = [...appliedLevels, { level: dto.level, key: dto.key }];
      const updated = await this.prisma.hommeDragon.update({
        where: { userId_partieId_gameSystemId: { userId, partieId, gameSystemId: RYUUTAMA_ID } },
        data: { sheetData: sheetData as any },
      });
      return this.buildDto(updated, partieId, userId);
    }

    private async buildEveilPowerCatalog(
      gameSystemId: string,
    ): Promise<{ key: string; levelUnlocked: number }[]> {
      const content = await this.gameSystems.getContent(gameSystemId);
      return (content['eveilPower'] ?? []).map((entry) => ({
        key: entry.key,
        levelUnlocked: (entry.data as { levelUnlocked?: number })?.levelUnlocked ?? 0,
      }));
    }
    ```
    Importer `pendingEveilLevels` depuis `@master-jdr/game-rules` (à la suite de `levelForScenariosPasse`/`computeHommeDragonDerived` déjà importés).
  - [x] Étendre `buildDto()` pour inclure `eveilPowers`/`pendingEveilLevels` dans **toute** réponse (`create`/`update`/`findOne`/`chooseEveilPower`, même principe AD-3 que `voyageursProteges`/`historique`/`derived`) :
    ```typescript
    // Après le calcul de `level`/`PS` existant :
    const eveilPowers = ((hommeDragon.sheetData as any).eveilPowers ?? []) as { level: number; key: string }[];
    const pending = pendingEveilLevels(level, eveilPowers.map((e) => e.level));
    return {
      // ... champs existants ...
      derived: { level, PS },
      eveilPowers,
      pendingEveilLevels: pending,
    };
    ```
  - [x] Ajouter la route dans `HommeDragonController` (`apps/api/src/homme-dragon/homme-dragon.controller.ts`) :
    ```typescript
    @Post('eveil-power')
    chooseEveilPower(
      @Param('id', ParseUUIDPipe) partieId: string,
      @CurrentUser() user: AuthUser,
      @Body() dto: ChooseEveilPowerDto,
    ) {
      return this.hommeDragon.chooseEveilPower(partieId, user.id, dto);
    }
    ```
  - [x] Tests service (`chooseEveilPower`) :
    - Niveau en attente + clé valide du bon niveau → choix enregistré, `sheetData.eveilPowers` contient la nouvelle entrée, aucune entrée précédente écrasée (append, pas remplacement).
    - Niveau **pas** en attente (déjà pourvu, ou au-delà du niveau actuel) → `BadRequestException`, aucune écriture (AC2).
    - Clé de pouvoir n'appartenant pas au niveau demandé (`levelUnlocked` différent) → `BadRequestException`, aucune écriture.
    - Clé inconnue du catalogue → `BadRequestException`, aucune écriture.
    - Non-MJ → `ForbiddenException` propagée par `getOwned`, aucune écriture.
    - Aucun Homme Dragon existant → `NotFoundException`.
    - Partie basculée hors Ryuutama → `BadRequestException`, aucune écriture (même garde que `update()`).
  - [x] Tests `buildDto` (via `findOne()`/`create()`/`update()`) :
    - AC1 : Homme Dragon qui vient de passer niveau 2 (1 scénario Passé), aucun `eveilPowers` en sheetData → `pendingEveilLevels: [2]`.
    - AC2 : `eveilPowers: [{level:2, key:'x'}]` en sheetData, niveau actuel 2 → `pendingEveilLevels: []`, `eveilPowers` reflète le choix stocké.
    - AC3 : niveau actuel 5 (12 scénarios Passé), aucun `eveilPowers` en sheetData → `pendingEveilLevels: [2,3,4,5]` (tous les seuils intermédiaires, pas seulement 5).
  - [x] Tests controller : la nouvelle route délègue correctement à `chooseEveilPower()` avec `partieId`/`user.id`/`dto`.

- [x] **Task 5 — Mettre à jour les fixtures des tests existants** (non-régression)
  - [x] `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` et `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` : `makeDto()` doit inclure `eveilPowers: []` et `pendingEveilLevels: []` par défaut (même piège de compilation que `voyageursProteges`/`historique`/`derived` aux Stories 10.2/10.3).
  - [x] `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` : vérifier que les tests existants (Stories 10.1-10.3) passent sans modification — `sheetData.eveilPowers` étant `undefined` par défaut sur les fixtures `makeHommeDragon()` existantes, `buildDto()` doit gérer ce cas via `?? []` (déjà prévu dans le code de Task 4) sans lever.

- [x] **Task 6 — Frontend : prompt de choix + affichage des pouvoirs choisis sur `HommeDragonSheet`** (AC1, AC2, AC3)
  - [x] TDD : étendre `homme-dragon-sheet.spec.ts` d'abord.
  - [x] Ajouter `chooseEveilPower(partieId, dto): Promise<HommeDragonDto>` à `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (même style `HttpClient`/`API_BASE`/`firstValueFrom` que `create`/`update`) :
    ```typescript
    chooseEveilPower(partieId: string, dto: ChooseEveilPowerDto): Promise<HommeDragonDto> {
      return firstValueFrom(
        this.http.post<HommeDragonDto>(`${API_BASE}/parties/${partieId}/homme-dragon/eveil-power`, dto, {
          withCredentials: true,
        }),
      );
    }
    ```
  - [x] Dans `homme-dragon-sheet.ts`, ajouter :
    - `protected readonly eveilPowerCatalog = signal<ContentEntryDto[]>([]);` — chargé dans `ngOnInit()` depuis le même appel `getGameSystemContent('ryuutama')` déjà fait pour `artefactCatalog` (`content['eveilPower'] ?? []`), pas de requête HTTP supplémentaire.
    - `protected readonly currentPendingLevel = computed(() => this.hommeDragon()?.pendingEveilLevels[0] ?? null);` — **un seul niveau à la fois** (le plus bas en attente), même esprit que le `LevelUpBanner`/`LevelUpWizard` du PJ qui traite un niveau à la fois même si plusieurs sont en attente (AC3 : après un choix, le niveau suivant apparaît naturellement au prochain rendu, pas besoin de tout proposer d'un coup).
    - `protected readonly eveilPowersForCurrentLevel = computed(() => this.eveilPowerCatalog().filter(e => (e.data as {levelUnlocked?: number}).levelUnlocked === this.currentPendingLevel()));`
    - `protected readonly selectedEveilPowerKey = signal<string | null>(null);`
    - `protected readonly choosingEveilPower = signal(false);`
    - `protected readonly eveilPowerError = signal<string | null>(null);`
    - `protected async onChooseEveilPower(): Promise<void>` : garde `!this.selectedEveilPowerKey() || !this.currentPendingLevel() || this.choosingEveilPower()`, appelle `hommeDragonSvc.chooseEveilPower(partieId(), { level: this.currentPendingLevel()!, key: this.selectedEveilPowerKey()! })`, met à jour `hommeDragon.set(...)`, réinitialise `selectedEveilPowerKey`, gère l'erreur (`try/catch` + `eveilPowerError`, pattern déjà établi dans ce composant pour `createError`/`updateError`).
  - [x] Dans `homme-dragon-sheet.html`, dans la branche fiche existante (`@else`), ajouter **avant** la section niveau/PS (le prompt doit être visible en premier, c'est l'action prioritaire) :
    ```html
    @if (currentPendingLevel()) {
      <section class="homme-dragon-sheet__eveil-prompt">
        <p>Niveau {{ currentPendingLevel() }} atteint — choisissez un pouvoir d'éveil :</p>
        <select [ngModel]="selectedEveilPowerKey()" name="eveilPower" (ngModelChange)="selectedEveilPowerKey.set($event)">
          <option [ngValue]="null" disabled>—</option>
          @for (p of eveilPowersForCurrentLevel(); track p.key) {
            <option [ngValue]="p.key">{{ $any(p.data).label }}</option>
          }
        </select>
        <button mat-flat-button color="primary" type="button" [disabled]="!selectedEveilPowerKey() || choosingEveilPower()" (click)="onChooseEveilPower()">
          Confirmer
        </button>
        @if (eveilPowerError()) {
          <p class="error">{{ eveilPowerError() }}</p>
        }
      </section>
    }

    @if (hommeDragon()!.eveilPowers.length > 0) {
      <section class="homme-dragon-sheet__eveil-powers">
        <h4>Pouvoirs d'éveil</h4>
        <ul>
          @for (ep of hommeDragon()!.eveilPowers; track ep.level) {
            <li>Niveau {{ ep.level }} : {{ eveilPowerLabel(ep.key) }}</li>
          }
        </ul>
      </section>
    }
    ```
    `eveilPowerLabel(key)` : méthode protégée qui résout le libellé depuis `eveilPowerCatalog()` (même pattern que `raceLabel()` déjà existant) — ne jamais afficher la clé technique brute.
  - [x] Tests : `pendingEveilLevels: [2]` + catalogue avec 1+ pouvoir `levelUnlocked: 2` → prompt affiché, sélecteur peuplé des seuls pouvoirs de ce niveau ; `pendingEveilLevels: []` → aucun prompt (AC2) ; confirmation appelle `chooseEveilPower()` avec le bon `level`/`key`, met à jour la fiche affichée ; `eveilPowers` non vide → liste affichée avec les libellés résolus, pas les clés ; échec de `chooseEveilPower()` → `eveilPowerError()` renseigné, formulaire non cassé (même pattern que `createError`/`updateError`).

- [x] **Task 7 — Validation finale**
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 0 régression + nouveaux tests `pendingEveilLevels` verts.
  - [x] `docker compose exec api pnpm exec jest` — 0 régression (689 tests existants + nouveaux).
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression (746 tests existants + nouveaux).
  - [x] Redémarrage réel du conteneur `api` (`docker compose up -d --build api`) — `Nest application successfully started`, `HommeDragonController` mappé avec la nouvelle route `POST /parties/:id/homme-dragon/eveil-power`, seed `eveilPower` chargé sans erreur (même vigilance que Task 0/4 de la Story 10.1 : une erreur de parsing JSON ferait échouer tout le bootstrap, pas seulement cette fonctionnalité).

### Review Findings

Revue de code adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-07-17. Aucune violation d'AC confirmée par l'Acceptance Auditor — la déviation « pool commun » est appliquée de façon cohérente sur les 4 couches touchées.

- [x] [Review][Patch] Race condition sans verrou optimiste sur `chooseEveilPower()` (lecture-modification-écriture non protégée, un double-clic ou deux requêtes concurrentes peuvent s'écraser mutuellement) [apps/api/src/homme-dragon/homme-dragon.service.ts:143-197]
- [x] [Review][Patch] `chooseEveilPower()` mute l'objet `sheetData` renvoyé par Prisma en place au lieu de le copier d'abord (contrairement à `update()` qui spread dans un nouvel objet) [apps/api/src/homme-dragon/homme-dragon.service.ts]
- [x] [Review][Patch] `$any(p.data).label` dans le `<select>` du prompt d'éveil n'a aucun fallback si `label` est absent, contrairement à `eveilPowerLabel()` qui retombe sur la clé brute [apps/web/.../homme-dragon-sheet.html]
- [x] [Review][Patch] Aucun état vide géré si `pendingEveilLevels` est non vide mais `eveilPowersForCurrentLevel()` (pool restant moins déjà choisis) est vide — le prompt afficherait un select inutilisable sans message (non atteignable aujourd'hui avec 6 pouvoirs pour 4 niveaux max, mais piège latent si le catalogue rétrécit) [apps/web/.../homme-dragon-sheet.html]
- [x] [Review][Patch] Aucun test frontend ne parcourt le scénario AC3 multi-niveaux (choisir niveau 2 → le prompt avance automatiquement au niveau 3) — seuls des scénarios à un seul niveau sont testés [apps/web/.../homme-dragon-sheet.spec.ts]
- [x] [Review][Patch] Le texte du prompt (« Niveau X atteint — choisissez... ») laisse penser que les pouvoirs listés sont propres à ce niveau, alors que le select liste tout le pool commun restant (déviation actée) — pourrait induire le MJ en erreur [apps/web/.../homme-dragon-sheet.html]
- [x] [Review][Defer] `sheetData` typé `any` dans tout `HommeDragonService` [apps/api/src/homme-dragon/homme-dragon.service.ts] — déjà présent depuis la Story 10.1, pas introduit par cette story
- [x] [Review][Defer] `computeVoyageursProteges`/`computeHistorique` recalculés deux fois par appel `chooseEveilPower()` (une fois pour la validation, une fois de plus dans `buildDto()`) [apps/api/src/homme-dragon/homme-dragon.service.ts] — inefficacité réelle mais mineure, action MJ rare (au plus 4 fois par Partie)
- [x] [Review][Defer] Le `catch` générique de `onChooseEveilPower()` masque la vraie erreur (message générique quel que soit le motif) [apps/web/.../homme-dragon-sheet.ts] — cohérent avec le pattern déjà établi pour `createError`/`updateError` sur ce composant
- [x] [Review][Defer] Constantes de seuils de niveau dupliquées (`HOMME_DRAGON_LEVEL_THRESHOLDS` dans game-rules, `EVEIL_LEVELS` dans le DTO API, réimplémentation dans le mock Jest) [apps/api/src/homme-dragon/dto/choose-eveil-power.dto.ts] — DRY mineur, cohérent avec le découplage API/game-rules déjà pratiqué ailleurs

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-4** (`ARCHITECTURE-SPINE.md`) : catalogue `eveilPower` via `ContentType`/`ContentEntry`, format minimal `{ key, label, levelUnlocked: 2|3|4|5 }` — jamais codé en dur, même mécanisme que `hommeDragonArtefact` (Story 10.1).
- **Différence structurelle avec AD-3** : `voyageursProteges`/`historique`/`derived` sont calculés à la lecture (jamais stockés). `eveilPowers` est l'**inverse** : c'est une **décision du MJ**, elle doit être **persistée** dans `HommeDragon.sheetData.eveilPowers` — jamais recalculée. Seul `pendingEveilLevels` (la liste des niveaux **encore** en attente) est calculé à la lecture, à partir de `level` (déjà calculé, Story 10.3) et de `sheetData.eveilPowers` (persisté). Ne pas confondre les deux mécaniques en essayant de stocker `pendingEveilLevels` ou de recalculer `eveilPowers`.
- **Accès** : écriture (`chooseEveilPower`) = MJ seul via `parties.getOwned` — même garde que `create()`/`update()`, aucun guard NestJS dédié.
- **AC3 (plusieurs seuils franchis)** : le backend calcule et renvoie **tous** les niveaux en attente (`pendingEveilLevels`), mais le frontend n'en propose **qu'un seul à la fois** (`pendingEveilLevels[0]`) — décision de conception explicite pour cette story (cf. Task 6), cohérente avec le `LevelUpBanner`/`LevelUpWizard` du PJ qui traite aussi un niveau à la fois. Après un choix, `pendingEveilLevels` se raccourcit dans la réponse et le prompt suivant apparaît automatiquement au prochain rendu — pas de logique de « file d'attente » côté frontend à construire.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/homme-dragon/homme-dragon.service.ts`** (état actuel post-Story 10.3) — `buildDto()`/`buildArtefactCatalog()` : patron direct pour `buildEveilPowerCatalog()` ; `create()`/`update()`/`findOne()` : patron pour les gardes (`getOwned`/`getViewable`, garde Ryuutama, `NotFoundException`).
- **`apps/api/src/characters/character.service.ts`** — `applyLevelUp()` (recherche « pendingLevels », « LEVEL_TABLE ») : précédent le plus proche pour un mécanisme « choix débloqué par un changement de niveau, validé contre un catalogue, append-only dans `sheetData` » — **mais plus simple ici** (un seul pouvoir par niveau, pas d'allocation de points PV/PE, pas de `CharacterSnapshot` équivalent à créer).
- **`packages/game-rules/src/ryuutama/leveling.ts`** — `pendingLevels(xp, appliedCount)` : précédent direct pour `pendingEveilLevels()`, mais indexé différemment (cf. Task 1 — appartenance explicite au tableau plutôt qu'un index de longueur).
- **`apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts`/`.html`** (état actuel post-Story 10.3) — sections niveau/PS/voyageurs/historique déjà présentes dans la branche fiche existante ; le prompt de choix de pouvoir d'éveil s'ajoute dans la même branche, avant la section niveau/PS.
- **`apps/web/src/app/features/characters/character-sheet/level-up-banner/`** (si présent) — précédent pour l'UX « bandeau d'invitation suite à un changement de niveau », à consulter pour le ton/l'esprit, pas nécessairement pour copier la structure (l'Homme Dragon n'a pas de wizard multi-étapes, un simple select + bouton suffit ici).

### Hors scope explicite de cette story (Story 10.5)

- Export PDF (FR8), inclusion des pouvoirs d'éveil choisis dans le PDF — Story 10.5.
- Aucun effet mécanique des pouvoirs d'éveil choisis (pas de bonus de règle appliqué automatiquement ailleurs dans l'app) — l'app enregistre le choix narratif, ne simule pas les règles de jeu associées (cohérent avec le reste du palier : PS affichés mais jamais suivis en jeu).

### Project Structure Notes

- Un seul nouveau fichier de DTO (`apps/api/src/homme-dragon/dto/choose-eveil-power.dto.ts`) + le seed JSON (`apps/api/game-systems/ryuutama/data/eveil-powers.json`, gitignored comme `homme-dragon-artefacts.json`) — tout le reste modifie des fichiers déjà créés par les Stories 10.1-10.3.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 178-196, Story 10.4 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-4, catalogue `eveilPower`)
- `_bmad-output/implementation-artifacts/10-1-creer-sa-fiche-homme-dragon.md` (Task 0 — précédent direct pour la gestion du contenu de jeu manquant)
- `_bmad-output/implementation-artifacts/10-3-voir-son-niveau-et-ses-points-de-souffle-progresser-automatiquement.md` (`levelForScenariosPasse`/`computeHommeDragonDerived`, `buildDto()` actuel)
- `apps/api/src/characters/character.service.ts` (`applyLevelUp`, `pendingLevels`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- **Décision utilisateur majeure (déviation du Dev Notes original)** : le contenu officiel des pouvoirs d'éveil fourni par l'utilisateur (`Eveil|PS|Effet`) n'a **pas** de colonne « niveau de déblocage » — la colonne `PS` est un coût d'usage en jeu, pas un niveau. AD-4/Task 0-6 supposaient un format `{ key, label, levelUnlocked: 2|3|4|5 }`. Après clarification, l'utilisateur a tranché : **pool commun à toutes les races**, tous les pouvoirs disponibles dès le niveau 2, choix libre à chaque niveau franchi (pas de filtre par niveau). Conséquences sur l'implémentation :
  - `eveil-powers.json` : format `{ key, label, ps, description }`, sans `levelUnlocked`.
  - `chooseEveilPower()` : valide que `dto.level` est en attente (`pendingEveilLevels`) ET que `dto.key` existe dans le catalogue ET n'a **jamais** été choisi auparavant (pool commun — un pouvoir n'est utilisable qu'une fois, quel que soit le niveau).
  - Frontend `eveilPowersForCurrentLevel` : filtre le catalogue sur « non encore choisi », pas sur « levelUnlocked === niveau courant ».
  - `pendingEveilLevels()` (game-rules) reste inchangée : elle calcule les niveaux (2-5) sans choix, indépendamment de quel pouvoir a été choisi pour chacun.
- 6 pouvoirs d'éveil saisis (contenu officiel Ryuutama fourni par l'utilisateur) : Escorte du dragon, Couche du dragon, Cadeau du dragon, Rugissement du dragon, Protection du dragon, Attaque du dragon.
- TDD respecté à chaque étage : `pendingEveilLevels()` (game-rules, 5 nouveaux tests), `chooseEveilPower()`/`buildDto()` (API, 11 nouveaux tests service + 1 controller), frontend (5 nouveaux tests sheet + 1 service).
- Suites finales : 92/92 tests `@master-jdr/game-rules`, 701/701 tests API (`pnpm exec jest`), `pnpm typecheck` API propre, 752/752 tests web (`ng test --watch=false`), aucune régression.
- Redémarrage réel du conteneur `api` (`docker compose up -d --build api`) : `Nest application successfully started`, route `POST /parties/:id/homme-dragon/eveil-power` mappée, seed `eveilPower` chargé sans erreur.
- Point relevé (hors scope de cette story, signalé à l'utilisateur) : le code de la Story 10.3 (déjà marquée `done`, `derived`/niveau/PS) était présent dans le working tree mais jamais commité au moment de démarrer cette story — aucune action prise, signalé pour information.

### File List

**Nouveaux fichiers**
- `apps/api/game-systems/ryuutama/data/eveil-powers.json` (gitignored, contenu officiel Ryuutama)
- `apps/api/src/homme-dragon/dto/choose-eveil-power.dto.ts`

**Fichiers modifiés**
- `packages/game-rules/src/ryuutama/homme-dragon-derived.ts` (`pendingEveilLevels()`)
- `packages/game-rules/src/__tests__/homme-dragon-derived.spec.ts` (5 nouveaux tests)
- `packages/game-rules/src/index.ts` (export `pendingEveilLevels`)
- `packages/shared/src/index.ts` (`HommeDragonSheetData.eveilPowers`, `HommeDragonDto.eveilPowers`/`pendingEveilLevels`, `ChooseEveilPowerDto`)
- `apps/api/src/game-systems/game-system.service.ts` (`CONTENT_TYPES` + entrée `eveilPower`)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (`chooseEveilPower()`, `buildEveilPowerCatalogKeys()`, `buildDto()` étendu)
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` (mock `pendingEveilLevels`, catalogue `eveilPower`, 11 nouveaux tests)
- `apps/api/src/homme-dragon/homme-dragon.controller.ts` (route `POST eveil-power`)
- `apps/api/src/homme-dragon/homme-dragon.controller.spec.ts` (1 nouveau test)
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (`chooseEveilPower()`)
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` (fixture étendue, 1 nouveau test)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (prompt + affichage pouvoirs choisis)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html` (section prompt + liste pouvoirs choisis)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` (fixture étendue, 5 nouveaux tests)

## Change Log

- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales). 0 violation d'AC. 6 patches appliqués : verrou de ligne `SELECT ... FOR UPDATE` + transaction sur `chooseEveilPower()` (race condition), copie de `sheetData` au lieu d'une mutation en place, `eveilPowerLabel()` réutilisé dans le template (fallback clé manquante), état vide géré si le pool de pouvoirs s'épuise, nouveau test frontend du scénario AC3 multi-niveaux, texte du prompt clarifié (pool commun, pas de filtrage par niveau). 4 items différés (voir `deferred-work.md`), 9 écartés. Suite finale : 92/92 tests game-rules, 702/702 tests API, `pnpm typecheck` propre, 753/753 tests web, aucune régression. Redémarrage réel du conteneur `api` reconfirmé. Statut passé à `done`.
- 2026-07-17 : Implémentée via `bmad-dev-story`. Déviation majeure actée avec l'utilisateur avant codage : le catalogue `eveilPower` est un pool commun à toutes les races (pas de `levelUnlocked` par pouvoir, contrairement à l'hypothèse AD-4/Dev Notes) — un pouvoir choisi n'est jamais réutilisable, quel que soit le niveau. 6 pouvoirs d'éveil officiels saisis. 8 tasks complétées en TDD (92/92 tests game-rules, 701/701 tests API, 752/752 tests web, `pnpm typecheck` propre), aucune régression. Redémarrage réel du conteneur `api` vérifié (route mappée, seed chargé). Statut passé à `review`.
- 2026-07-17 : Story créée via `bmad-create-story` (lecture directe de `homme-dragon.service.ts`/`.controller.ts` post-Story 10.3, `character.service.ts` (`applyLevelUp`/`pendingLevels`, précédent le plus proche), `packages/game-rules/src/ryuutama/{homme-dragon-derived,leveling}.ts`, `packages/shared/src/index.ts` (`HommeDragonDto`/`HommeDragonSheetData`), `homme-dragon-sheet.ts`/`.html` post-Story 10.3, `epics-palier5.md` Story 10.4, `ARCHITECTURE-SPINE.md` AD-4). Points notables : (1) les pouvoirs d'éveil (contenu de jeu officiel Ryuutama) sont absents du dépôt — Task 0 documente explicitement de ne jamais les inventer et de demander la source à l'utilisateur, même traitement que les artefacts en Story 10.1 ; (2) contrairement à `voyageursProteges`/`historique`/`derived` (calculés à la lecture, jamais stockés, AD-3), `eveilPowers` est une décision du MJ qui doit être **persistée** dans `sheetData` — seule la liste des niveaux *en attente* (`pendingEveilLevels`) est calculée à la lecture ; (3) le frontend ne propose qu'un seul niveau en attente à la fois même si plusieurs seuils sont franchis (AC3), décision de conception explicite cohérente avec le `LevelUpBanner` du PJ.
