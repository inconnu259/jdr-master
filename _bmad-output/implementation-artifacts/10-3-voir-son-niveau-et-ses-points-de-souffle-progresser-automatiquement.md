---
baseline_commit: 9878018
---

# Story 10.3: Voir son niveau et ses Points de Souffle progresser automatiquement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want que le niveau et les Points de Souffle de mon Homme Dragon progressent automatiquement avec les scénarios joués,
So that je n'aie jamais à recalculer ces valeurs à la main.

## Acceptance Criteria

1. **Given** ma Partie compte 0 scénario `Passé` **When** je consulte la fiche de mon Homme Dragon **Then** le niveau affiché est 1 et les PS affichés sont 3
2. **Given** ma Partie compte 1, 3, 7 ou 12 scénarios `Passé` **When** je consulte la fiche **Then** le niveau affiché est respectivement 2, 3, 4 ou 5 **And** les PS affichés sont respectivement 3, 5, 5 et 10 (5 aux niveaux 3 et 4, 10 au niveau 5)
3. **Given** un nouveau scénario de ma Partie passe au statut `Passé` **When** je rouvre la fiche de mon Homme Dragon **Then** le niveau et les PS sont recalculés sans action de ma part
4. **Given** je consulte la fiche de mon Homme Dragon **When** j'observe les champs niveau/PS **Then** aucune action de l'interface ne permet de forcer une valeur différente de celle calculée

## Tasks / Subtasks

- [x] **Task 1 — `packages/game-rules/ryuutama` : seuils de niveau + `computeHommeDragonDerived()`** (AC1, AC2, AC3) — 15 tests vitest verts.
  - [ ] TDD : `packages/game-rules/src/__tests__/homme-dragon-derived.spec.ts` d'abord (vitest, même convention que `leveling.spec.ts`/`validate-homme-dragon.spec.ts` — fichier dans `src/__tests__/`, pas à côté du source).
  - [ ] Créer `packages/game-rules/src/ryuutama/homme-dragon-derived.ts` — **table de seuils dédiée, distincte de `LEVEL_TABLE` du PJ** (`leveling.ts`, seuils en XP) : celle de l'Homme Dragon est indexée sur un **nombre de scénarios `PASSE`**, pas de l'XP.
    ```typescript
    export const HOMME_DRAGON_LEVEL_THRESHOLDS: { level: number; scenariosPasse: number }[] = [
      { level: 2, scenariosPasse: 1 },
      { level: 3, scenariosPasse: 3 },
      { level: 4, scenariosPasse: 7 },
      { level: 5, scenariosPasse: 12 },
    ];

    /** Niveau 1 si en dessous du premier seuil (1 scénario Passé) — même convention que `levelForXp`. */
    export function levelForScenariosPasse(count: number): number {
      let level = 1;
      for (const entry of HOMME_DRAGON_LEVEL_THRESHOLDS) {
        if (count >= entry.scenariosPasse) level = entry.level;
      }
      return level;
    }

    export interface HommeDragonDerivedStats {
      PS: number;
    }

    /** Fonction pure, ne lève jamais — même convention que `computeDerived()` du PJ. PS : 3 aux
     * niveaux 1-2, 5 aux niveaux 3-4, 10 au niveau 5 (AC2). */
    export function computeHommeDragonDerived(level: number): HommeDragonDerivedStats {
      if (level <= 2) return { PS: 3 };
      if (level <= 4) return { PS: 5 };
      return { PS: 10 };
    }
    ```
    **Ne pas** réutiliser/étendre `LEVEL_TABLE`/`levelForXp` de `leveling.ts` — ce sont deux mécaniques de progression totalement différentes (XP du PJ vs comptage de scénarios de l'Homme Dragon), la spine exige explicitement une table **dédiée** (AD-3).
  - [ ] Exporter `levelForScenariosPasse`, `computeHommeDragonDerived`, `HOMME_DRAGON_LEVEL_THRESHOLDS` (+ type `HommeDragonDerivedStats`) depuis `packages/game-rules/src/index.ts`, à la suite des exports Ryuutama existants.
  - [ ] Tests (table de vérité complète, cf. AC1/AC2) :
    - `levelForScenariosPasse(0)` → 1
    - `levelForScenariosPasse(1)` → 2, `levelForScenariosPasse(2)` → 2 (pas encore 3)
    - `levelForScenariosPasse(3)` → 3, `levelForScenariosPasse(6)` → 3
    - `levelForScenariosPasse(7)` → 4, `levelForScenariosPasse(11)` → 4
    - `levelForScenariosPasse(12)` → 5, `levelForScenariosPasse(50)` → 5 (plafond)
    - `computeHommeDragonDerived(1)` → `{ PS: 3 }`, `computeHommeDragonDerived(2)` → `{ PS: 3 }`
    - `computeHommeDragonDerived(3)` → `{ PS: 5 }`, `computeHommeDragonDerived(4)` → `{ PS: 5 }`
    - `computeHommeDragonDerived(5)` → `{ PS: 10 }`
    - ne lève jamais, même avec un `count`/`level` négatif ou 0 (défense de profondeur, pas un cas attendu en pratique — `historique.length` ne peut être négatif).

- [x] **Task 2 — Types partagés (`packages/shared/src/index.ts`)** (AC1, AC2) — `derived: { level, PS }` ajouté à `HommeDragonDto`.
  - [ ] Étendre `HommeDragonDto` avec le champ `derived`, **non optionnel** (toujours calculé, jamais `undefined` — même traitement que `voyageursProteges`/`historique`, Story 10.2) :
    ```typescript
    export interface HommeDragonDto {
      // ... champs existants (id, userId, partieId, gameSystemId, sheetData, createdAt, updatedAt,
      // voyageursProteges, historique) inchangés ...
      /** Niveau (1-5) et Points de Souffle max — calculés à la lecture depuis le nombre de scénarios
       * `PASSE`, jamais stockés (AD-3, Story 10.3). */
      derived: { level: number; PS: number };
    }
    ```

- [x] **Task 3 — `HommeDragonService.buildDto()` : calcul de `derived`** (AC1, AC2, AC3, AC4) — 8 nouveaux tests (table de vérité complète). `jest.mock('@master-jdr/game-rules')` étendu avec de vraies réimplémentations de `levelForScenariosPasse`/`computeHommeDragonDerived` (fonctions pures triviales) plutôt que des `jest.fn()` opaques.
  - [ ] TDD : étendre `homme-dragon.service.spec.ts` d'abord.
  - [ ] Dans `buildDto()` (`apps/api/src/homme-dragon/homme-dragon.service.ts`), calculer `derived` à partir de la **longueur de `historique`** déjà calculée juste avant — `historique` est déjà filtré `status === 'PASSE' && closedAt !== null` (Story 10.2), donc `historique.length` **est** le nombre de scénarios `Passé` recherché : aucune requête Prisma supplémentaire, aucune nouvelle dépendance de service.
    ```typescript
    import { computeHommeDragonDerived, levelForScenariosPasse, validateHommeDragon, type HommeDragonArtefactCatalogEntry } from '@master-jdr/game-rules';

    // Dans buildDto(), après le calcul de `historique` :
    const level = levelForScenariosPasse(historique.length);
    const derived = computeHommeDragonDerived(level);
    return {
      // ... champs existants ...
      voyageursProteges,
      historique,
      derived: { level, PS: derived.PS },
    };
    ```
    **Ne pas** ajouter de paramètre `scenariosPasseCount` séparé ni refaire une requête `findAllForPartie` — ce serait dupliquer un calcul déjà fait pour `historique` dans le même `buildDto()` (même esprit que la revue de code Story 10.2 qui a éliminé le double appel `computeVoyageursProteges`).
  - [ ] **AC4 (aucun forçage possible)** : `derived` n'apparaît dans **aucun** DTO d'entrée (`CreateHommeDragonDto`/`UpdateHommeDragonDto`) — vérifier qu'aucun champ `derived`/`level`/`PS` n'existe sur ces deux types (c'est déjà le cas, ne pas en ajouter). La seule garantie requise par cette story est l'absence d'un chemin d'écriture, pas une validation supplémentaire à coder.
  - [ ] Tests :
    - AC1 : `historique: []` (0 scénario `PASSE`) → `derived: { level: 1, PS: 3 }`.
    - AC2 : mocker `scenarios.findAllForPartie` pour renvoyer respectivement 1, 3, 7 et 12 scénarios `PASSE` (+ `closedAt` non-null sur chacun) → `derived` vaut respectivement `{level:2,PS:3}`, `{level:3,PS:5}`, `{level:4,PS:5}`, `{level:5,PS:10}` (4 tests, table de vérité complète de l'AC).
    - AC3 : `create()`/`update()` retournent aussi `derived` peuplé (pas seulement `findOne()`) — au moins 1 test par méthode, même pattern que Story 10.2 pour `voyageursProteges`/`historique`.
    - Un scénario `BROUILLON`/`A_VENIR`/`COURANT` mélangé à des `PASSE` ne doit **pas** compter dans `historique.length`/`derived` — déjà garanti par le filtre existant de `computeHistorique` (Story 10.2), un test de non-régression suffit (pas de nouvelle logique de filtrage à écrire).

- [x] **Task 4 — Mettre à jour les fixtures des tests existants** (non-régression) — `derived: { level: 1, PS: 3 }` ajouté aux 2 `makeDto()`.
  - [ ] `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` et `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` : `makeDto()` doit désormais inclure `derived: { level: 1, PS: 3 }` par défaut (sinon `HommeDragonDto` non satisfait, échec de compilation `tsc`/esbuild — même piège déjà rencontré en Story 10.2 avec `voyageursProteges`/`historique`).
  - [ ] `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` : vérifier qu'aucune assertion `toEqual` sur l'objet complet ne casse (les tests existants n'assertent que des champs précis via `expect(result.xxx)`, pas d'objet entier — à confirmer en lançant la suite, pas de changement de mock attendu au-delà de ce qui est déjà en place pour `historique`).

- [x] **Task 5 — Frontend : afficher niveau + PS sur `HommeDragonSheet`** (AC1, AC2, AC3, AC4) — 16/16 tests verts (2 nouveaux + fixtures étendues).
  - [ ] TDD : étendre `homme-dragon-sheet.spec.ts` d'abord.
  - [ ] Dans `homme-dragon-sheet.html`, à la suite des sections « Voyageurs protégés »/« Historique » (Story 10.2), ajouter un affichage **lecture seule** (AC4 — aucun input, aucun bouton associé) :
    ```html
    <section class="homme-dragon-sheet__derived">
      <p>Niveau : {{ hommeDragon()!.derived.level }}</p>
      <p>Points de Souffle : {{ hommeDragon()!.derived.PS }}</p>
    </section>
    ```
    Aucun signal, aucun `computed()` côté frontend pour ces valeurs — elles arrivent déjà calculées dans le DTO (`hommeDragon()!.derived`), afficher tel quel suffit. Ne pas dupliquer `levelForScenariosPasse`/`computeHommeDragonDerived` côté client : la seule source de vérité est la réponse API (cohérent avec AD-3/AD-4 déjà établis en Story 10.1/10.2 — le frontend ne recalcule jamais une valeur dérivée).
  - [ ] Tests : fiche avec `derived: { level: 3, PS: 5 }` → affiche « Niveau : 3 » et « Points de Souffle : 5 » ; aucun élément interactif (input/select/button) dans la section `.homme-dragon-sheet__derived` (AC4 — un test DOM simple suffit : `querySelectorAll('input, select, button')` dans le scope de cette section doit être vide).

- [x] **Task 6 — Validation finale**
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 87/87, 0 régression.
  - [x] `docker compose exec api pnpm exec jest` — 689/689, 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 746/746, 0 régression.
  - [x] Redémarrage réel du conteneur `api` — `Nest application successfully started`, aucune erreur.

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-17 sur `git diff HEAD` (9 fichiers, baseline `9878018`). **Revue propre** : 0 decision-needed, 0 patch, 0 defer. Edge Case Hunter : aucun chemin non géré trouvé (`[]`). Acceptance Auditor : 0 violation d'AC — les 4 ACs et toutes les contraintes de conception (table dédiée, `historique.length` réutilisé sans requête supplémentaire, `derived` peuplé par les 3 méthodes, absence structurelle de champ d'entrée pour AC4) sont vérifiées correctes.

**Écarté (bruit/faux positifs)**, Blind Hunter (12 points, tous écartés) : commentaire « niveau 1 si en dessous du premier seuil (1 scénario Passé) » jugé trompeur — **faux positif**, reproduit mot pour mot la convention déjà établie pour `levelForXp()` (`leveling.ts`), comportement vérifié correct par 15 tests incluant les valeurs limites (1, 2, 3, 6, 7, 11, 12) ; absence de garde sur un `count`/`level` négatif ou hors bornes — spéculatif, `historique.length` est un `Array.length` (toujours ≥ 0 par construction JS) et `level` provient exclusivement de `levelForScenariosPasse()` (retourne toujours 1-5) ; constantes PS « magiques » (3/5/10) plutôt qu'une table de données — choix de style conforme au code de la story lui-même, aucun impact fonctionnel ; absence de tests visibles — faux positif, l'agent n'avait pas accès aux fichiers de test (explicitement omis du prompt pour rester concis), 25 nouveaux tests couvrent exactement les cas cités ; assertions `hommeDragon()!` non-null qui « prolifèrent » — pattern déjà établi dans ce même template depuis les Stories 10.1/10.2, pas introduit par ce diff ; `HommeDragonDto.derived` non optionnel risquant une « incompatibilité de cache » — même classe de préoccupation spéculative déjà écartée dans les revues 10.1/10.2 (rien n'est jamais persisté/mis en cache pour ce DTO) ; `level`/`PS` typés `number` plutôt qu'union littérale `1|2|3|4|5` — cohérent avec `Character.level` ailleurs dans le projet, jamais typé en union non plus ; couplage implicite `historique.length` ↔ filtre PASSE jugé fragile — déjà documenté explicitement par un commentaire au point d'appel, mitigation suffisante ; absence de contrôle d'accès visible autour de `derived` — déjà géré en amont par `getOwned`/`getViewable` (confirmé par l'Acceptance Auditor) ; `HOMME_DRAGON_LEVEL_THRESHOLDS` non `readonly`/gelé — cohérent avec `LEVEL_TABLE` du PJ, jamais gelée non plus (même style déjà établi) ; absence d'état de chargement/erreur dédié à la section niveau/PS — déjà couvert par le garde `@if/@else if/@else` englobant de tout le bloc fiche (même garantie que pour les sections voyageurs/historique).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-3** (`ARCHITECTURE-SPINE.md`, `architecture-jdr-master-2026-07-15`) : `derived` (niveau/PS) est **calculé à la lecture**, jamais stocké — aucune migration Prisma, aucune colonne `derived` sur le modèle `HommeDragon` (rappel de contrainte déjà posé en Story 10.1, toujours valable). Table de seuils **dédiée** (`HOMME_DRAGON_LEVEL_THRESHOLDS`), distincte de `LEVEL_TABLE` du PJ (seuils en XP, mécanique différente).
- Le niveau de l'Homme Dragon est fonction du **nombre de scénarios `PASSE` de la Partie**, jamais de l'XP (qui n'a aucun sens pour l'Homme Dragon — ce n'est pas un personnage joueur).
- **Aucune nouvelle route, aucune nouvelle dépendance de module** — `derived` se calcule à partir de `historique.length` déjà disponible dans `buildDto()` (Story 10.2), zéro requête supplémentaire.
- **AC4** : le seul mécanisme garantissant qu'aucune valeur ne peut être forcée est l'**absence de champ `derived`/`level`/`PS` sur les DTO d'entrée** (`CreateHommeDragonDto`/`UpdateHommeDragonDto`) — ne pas ajouter de validation redondante, l'absence structurelle suffit (même logique que `derived` sur `Character` sub-jacent, jamais éditable directement).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/homme-dragon/homme-dragon.service.ts`** (état actuel post-Story 10.2 + revue de code) — `buildDto()` calcule déjà `voyageursProteges`/`historique` ; `derived` s'ajoute au même endroit, dérivé de `historique.length`.
- **`packages/game-rules/src/ryuutama/leveling.ts`** — patron direct pour la convention de nommage/structure (`LEVEL_TABLE`/`levelForXp`), mais **mécanique différente** à ne pas réutiliser telle quelle (cf. Dev Notes ci-dessus).
- **`packages/game-rules/src/ryuutama/compute-derived.ts`** — patron pour une fonction `computeXxxDerived()` pure, ne lève jamais.
- **`apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html`** (état actuel post-Story 10.2) — sections « Voyageurs protégés »/« Historique » déjà présentes dans la branche fiche existante, à la suite desquelles ajouter la section niveau/PS.

### Hors scope explicite de cette story (Stories 10.4-10.5)

- Invitation à choisir un pouvoir d'éveil au changement de niveau (FR6), `ContentType` `eveilPower` — Story 10.4. Cette story (10.3) affiche le niveau, elle ne déclenche **aucune** invitation/action au franchissement d'un seuil.
- Export PDF (FR8) — Story 10.5.
- Aucun suivi de dépense/récupération de PS en jeu — explicitement hors scope de tout le palier (FR7, PRD §4.1 : « affichage seul, aucun suivi de dépense/récupération en jeu dans l'app »).

### Project Structure Notes

- Un seul nouveau fichier (`packages/game-rules/src/ryuutama/homme-dragon-derived.ts` + son spec) — tout le reste modifie des fichiers déjà créés par les Stories 10.1/10.2.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 153-177, Story 10.3 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-3, « Points de Souffle », section « Structural Seed » — `packages/game-rules/src/ryuutama/homme-dragon-derived.ts` explicitement listé dans le Source tree)
- `_bmad-output/implementation-artifacts/10-2-consulter-historique-et-voyageurs-proteges.md` (story précédente — `buildDto()`/`computeHistorique()` existants, patterns établis, revue de code déjà appliquée)
- `packages/game-rules/src/ryuutama/leveling.ts`/`compute-derived.ts` (patrons de fonctions pures)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

- `jest.mock('@master-jdr/game-rules', ...)` dans `homme-dragon.service.spec.ts` ne couvrait que `validateHommeDragon` — l'ajout de `levelForScenariosPasse`/`computeHommeDragonDerived` au mock a d'abord causé `TypeError: ... is not a function` (le mock manuel remplace tout le module, pas seulement les exports non listés). Corrigé en réimplémentant ces 2 fonctions pures (triviales) directement dans le factory du mock plutôt que des `jest.fn()` opaques — nécessaire car les tests Story 10.3 vérifient une vraie table de vérité niveau/PS, pas juste un appel.
- `makeScenarioDto()` était définie localement dans le describe block Story 10.2 — remontée au niveau module pour être réutilisable par le nouveau describe block Story 10.3 (`derived (niveau/PS)`).

### Completion Notes List

- Task 1 : `levelForScenariosPasse()`/`computeHommeDragonDerived()` (`packages/game-rules/src/ryuutama/homme-dragon-derived.ts`), table de seuils dédiée distincte de `LEVEL_TABLE` du PJ. 15 tests vitest (table de vérité complète).
- Task 2 : `HommeDragonDto.derived: { level, PS }` ajouté (non optionnel).
- Task 3 : `HommeDragonService.buildDto()` calcule `derived` depuis `historique.length` (déjà filtré `PASSE` par la Story 10.2) — aucune requête Prisma supplémentaire. 8 nouveaux tests.
- Task 4 : fixtures `makeDto()` (2 fichiers web) étendues avec `derived: { level: 1, PS: 3 }` par défaut.
- Task 5 : section « Niveau »/« Points de Souffle » ajoutée à `HommeDragonSheet`, lecture seule (AC4 — aucun élément interactif). 2 nouveaux tests.
- Task 6 : 87/87 tests `game-rules` + 689/689 tests API + 746/746 tests web, `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié.

### File List

**Nouveaux fichiers**
- `packages/game-rules/src/ryuutama/homme-dragon-derived.ts`
- `packages/game-rules/src/__tests__/homme-dragon-derived.spec.ts`

**Fichiers modifiés**
- `packages/game-rules/src/index.ts` (exports `levelForScenariosPasse`/`computeHommeDragonDerived`/`HOMME_DRAGON_LEVEL_THRESHOLDS`/`HommeDragonDerivedStats`)
- `packages/shared/src/index.ts` (`HommeDragonDto.derived` ajouté)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (`buildDto()` calcule `derived`)
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` (mock étendu, `makeScenarioDto` remontée au niveau module, 8 nouveaux tests)
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts` (fixture étendue)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html` (section niveau/PS)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` (fixture étendue + 2 nouveaux tests)

## Change Log

- 2026-07-17 : Story créée via `bmad-create-story` (lecture directe de `homme-dragon.service.ts` post-Story 10.2 + revue de code, `packages/game-rules/src/index.ts`/`leveling.ts`/`compute-derived.ts`, `packages/shared/src/index.ts` (`HommeDragonDto`), `homme-dragon-sheet.html` post-Story 10.2, `epics-palier5.md` Story 10.3, `ARCHITECTURE-SPINE.md` AD-3). Décision de conception : `derived` calculé depuis `historique.length` déjà disponible dans `buildDto()` (Story 10.2) — aucune requête Prisma supplémentaire, aucune nouvelle dépendance de module. Table de seuils de niveau dédiée à l'Homme Dragon (indexée sur le nombre de scénarios `PASSE`), explicitement distincte de `LEVEL_TABLE` du PJ (indexée sur l'XP) — deux mécaniques de progression non liées. AC4 (aucun forçage) garanti structurellement par l'absence de champ `derived` sur les DTO d'entrée, pas par une validation additionnelle.
- 2026-07-17 : Implémentation complète (bmad-dev-story). 6 tasks en TDD red-green. `computeHommeDragonDerived()`/`levelForScenariosPasse()` (`packages/game-rules`), `HommeDragonDto.derived` étendu, `HommeDragonService.buildDto()` dérive `derived` de `historique.length` (0 requête supplémentaire), section niveau/PS lecture seule ajoutée à `HommeDragonSheet`. 87/87 tests `game-rules` + 689/689 tests API + 746/746 tests web, `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié. Statut → `review`.
- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales sur `git diff HEAD`). Revue propre : 0 decision-needed, 0 patch, 0 defer. Edge Case Hunter : aucun chemin non géré. Acceptance Auditor : 0 violation d'AC. Les 12 points soulevés par le Blind Hunter ont tous été écartés comme bruit/faux positifs (conventions déjà établies ailleurs dans le projet — types `number` non-union, tables non `readonly`, assertions `!` déjà présentes — ou malentendus factuels sur le commentaire de seuil, qui reproduit la convention déjà utilisée pour `levelForXp()`). Aucune modification de code. Statut → `done`.
