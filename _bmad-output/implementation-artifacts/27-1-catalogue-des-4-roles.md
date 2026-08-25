---
baseline_commit: 7c1d080ae040e51ed403a16770153d6131158da2
---

# Story 27.1: Catalogue des 4 rôles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want un catalogue des 4 rôles de groupe (cartographe, chef, chroniqueur, intendant),
so that je puisse ensuite les assigner aux personnages de ma Partie.

## Contexte

Premier palier de l'Epic 27 (Rôles de groupe) : cette story ne pose que le **catalogue de contenu**, rien de plus. Aucune mécanique d'assignation (Story 27.2), aucun affichage (Story 27.3) — juste un nouveau `ContentType` `groupRole` seedé avec exactement 4 entrées, même mécanisme que tous les catalogues Ryuutama existants (`weaponCategory`, `season`, `landscape`...).

**Contenu réel du livre fourni par l'utilisateur** (le dépôt n'avait, avant cette story, aucune transcription `docs/*.md` pour les rôles de groupe — à la différence des classes/types/armes/équipement/sorts) et transcrit dans `docs/roles-groupe.md`, nouveau fichier, même convention que `docs/classes.md`/`docs/equipement.md`.

## Acceptance Criteria

1. **Given** le mécanisme `CONTENT_TYPES`/`GameSystemService.seedRyuutama()`, **when** ce palier est implémenté, **then** un nouveau `ContentType` `groupRole` est seedé depuis `group-roles.json`, exactement 4 entrées (cartographe, chef, chroniqueur, intendant), chacune avec une description.
2. **Given** cette contrainte de nombre, **when** le contenu est seedé, **then** elle est assurée par la discipline d'auteur du contenu (comme « exactement 3 talents par classe »), pas par une garde runtime.

## Tasks / Subtasks

- [x] Task 1 — Transcription du contenu (AC: #1)
  - [x] `docs/roles-groupe.md` (déjà créé avant cette story, à partir du texte fourni par l'utilisateur — retranscription fidèle, aucune invention) : les 4 rôles (Cartographe, Chef, Chroniqueur, Intendant), chacun avec son texte descriptif complet du livre.
  - [x] `apps/api/game-systems/ryuutama/data/group-roles.json` (nouveau, gitignoré comme tout le contenu Ryuutama) : exactement 4 entrées `{ key, label, description }`, `description` = texte intégral transcrit de `docs/roles-groupe.md` pour chaque rôle (aucune coupe, aucune reformulation) :
    - `cartographe` / « Cartographe »
    - `chef` / « Chef »
    - `chroniqueur` / « Chroniqueur »
    - `intendant` / « Intendant »
- [x] Task 2 — Enregistrement du `ContentType` (AC: #1, #2)
  - [x] `apps/api/src/game-systems/game-system.service.ts` : ajouter `{ key: 'groupRole', label: 'Rôle de groupe', file: 'group-roles.json' }` à `CONTENT_TYPES` (même pattern que les entrées existantes, ex. `weaponCategory`/`season`) — aucune garde runtime sur le nombre d'entrées (AC2, la contrainte « exactement 4 » reste une discipline d'auteur du fichier JSON, pas du code).
  - [x] Aucun autre changement backend : pas de nouvelle route, pas de DTO, pas de modification de `getSchema()`/`creationSteps` (ce catalogue n'est lié à aucune étape de l'assistant de création de personnage — il sera consommé par l'assignation MJ, Story 27.2, hors scope ici).
- [x] Task 3 — Tests (AC: #1, #2)
  - [x] Aucun test unitaire dédié au fichier JSON lui-même n'existe dans ce codebase pour les catalogues similaires (`weapon-categories.json`, `seasons.json` n'ont pas de test dédié à leur contenu) — cohérent, ne pas en ajouter un ici non plus.
  - [x] Vérifié que `apps/api/src/game-systems/game-system.service.spec.ts` ne fait aucune assertion sur la liste exacte/la longueur de `CONTENT_TYPES` — suite passée sans modification nécessaire à ce fichier de test.
  - [x] Suite complète (`docker compose exec api pnpm test`) — 908/908 passed, aucune régression.
  - [x] `docker compose exec api pnpm typecheck` propre.
  - [x] Redémarrage réel du conteneur API vérifié (`docker compose restart api` + logs, « Nest application successfully started ») ; contenu re-vérifié directement en base (`psql`) : 4 entrées `groupRole` (cartographe/chef/chroniqueur/intendant) avec leurs labels corrects.

## Dev Notes

- **Story volontairement minimale** — c'est la première des 4 stories de l'Epic 27 ; elle ne fait QUE poser le catalogue de contenu. Ne pas anticiper l'assignation (modèle Prisma `CharacterGroupRole`, module `CharacterRolesModule`, endpoints `POST`/`DELETE .../role`) ni l'affichage (`RosterRow.assignedRoleLabel`) — ce sont les Stories 27.2 et 27.3, pas celle-ci. Toute tentation d'anticiper ces mécanismes ici est du scope creep.
- **Contrainte « exactement 4 »** : comme documenté par l'AC2 et déjà pratiqué pour « exactement 3 talents par classe » (Epic 23), cette contrainte n'est **jamais** vérifiée par du code — uniquement par la discipline de contenu du fichier JSON. Ne pas ajouter de garde `if (entries.length !== 4) throw ...` dans `seedRyuutama()` ou ailleurs : ce serait au-delà du scope de l'AC et introduirait un couplage non demandé.
- **`docs/roles-groupe.md` déjà créé** avant le lancement de `dev-story` (texte fourni directement par l'utilisateur en réponse à une clarification pendant `create-story`, faute de transcription existante dans `docs/`) — le développeur n'a plus qu'à copier le texte déjà présent dans ce fichier vers `group-roles.json`, aucune nouvelle recherche de contenu nécessaire.
- **Pas de lien avec l'assistant de création de personnage** — contrairement à `weaponCategory`/`weaponItem`/`spell` qui sont sélectionnés PAR le joueur à la création, `groupRole` est un catalogue de référence consulté PAR LE MJ lors de l'assignation (Story 27.2, hors scope). Ne touche donc jamais `character-wizard.ts`/`GameSystemService.getSchema().creationSteps`.

### Project Structure Notes

- Données : `docs/roles-groupe.md` (déjà créé), `apps/api/game-systems/ryuutama/data/group-roles.json` (nouveau, gitignoré).
- Backend : `apps/api/src/game-systems/game-system.service.ts` (`CONTENT_TYPES` uniquement).
- Aucun changement frontend, aucune migration Prisma pour cette story (le modèle relationnel `CharacterGroupRole` arrive en Story 27.2).

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 27.1] — Acceptance Criteria d'origine
- [Source: docs/roles-groupe.md] — texte réel des 4 rôles, transcrit depuis le *Guide du Voyageur* (fourni par l'utilisateur pendant `create-story`, aucune source `docs/*.md` préexistante pour ce contenu)
- [Source: apps/api/src/game-systems/game-system.service.ts:62-105] — `CONTENT_TYPES` (pattern d'entrée à suivre), `seedRyuutama()` (mécanisme de seed, aucune modification requise au-delà de l'entrée `CONTENT_TYPES`)
- [Source: apps/api/game-systems/ryuutama/data/seasons.json] — exemple de catalogue minimal `{ key, label }`, à étendre ici avec `description`
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md] — AD-5 (rôle de groupe = futur modèle relationnel, Story 27.2, PAS cette story), AD-8 (câblage temps réel, Story 27.3, PAS cette story)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api pnpm test` → 45 suites, 908/908 passed (aucun test nouveau requis, aucune régression)
- `docker compose exec api pnpm typecheck` → clean (`tsc --noEmit -p tsconfig.build.json`)
- `docker compose restart api` → « Nest application successfully started » (après un premier restart qui a affiché une erreur TS obsolète du watcher `nest start --watch`, résolue au second restart — non liée à cette story, `pnpm typecheck` était déjà propre entre-temps)
- `docker compose exec db psql -U jdr -d jdr -c "SELECT ce.key, ce.data->>'label' ... WHERE ct.key = 'groupRole'"` → 4 lignes (cartographe/chef/chroniqueur/intendant), confirmant le seed réel en base

### Completion Notes List

- `docs/roles-groupe.md` créé pendant `create-story` à partir du texte du livre fourni directement par l'utilisateur (aucune transcription `docs/*.md` préexistante pour ce contenu, à la différence des classes/types/armes/équipement/sorts).
- `group-roles.json` : 4 entrées `{ key, label, description }`, texte intégral transcrit sans coupe ni reformulation. Contrainte « exactement 4 » assurée par discipline d'auteur (AC2), aucune garde runtime ajoutée.
- `CONTENT_TYPES` (`game-system.service.ts`) : une seule entrée ajoutée, aucun autre changement backend (pas de route, pas de DTO, pas de lien avec l'assistant de création — ce catalogue est un catalogue de référence pour l'assignation MJ, Story 27.2, hors scope ici).
- Story volontairement minimale, conforme au scope de l'AC : aucune anticipation du modèle `CharacterGroupRole`/`CharacterRolesModule` (Story 27.2) ni de l'affichage badge (Story 27.3).
- Suite complète verte, aucune régression : 908/908 tests API, typecheck propre, seed vérifié réellement en base.

### File List

- `docs/roles-groupe.md` (nouveau)
- `apps/api/game-systems/ryuutama/data/group-roles.json` (nouveau)
- `apps/api/src/game-systems/game-system.service.ts`

## Change Log

- 2026-07-30 — Catalogue `groupRole` (4 entrées) seedé depuis `group-roles.json`, contenu réel du livre transcrit dans `docs/roles-groupe.md` — Story passée en `review`.
- 2026-07-30 — Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) : fidélité de transcription confirmée mot pour mot par l'Acceptance Auditor. 1 patch appliqué (case à cocher Task 1 oubliée), 1 item différé (validation générique du seed, pré-existante, voir `deferred-work.md`), ~6 écartés. Statut passé à `done`.

### Review Findings

- [x] [Review][Patch] Case à cocher « Task 1 » (parente) restée `[ ]` alors que ses 2 sous-tâches sont `[x]` et le travail réellement fait [_bmad-output/implementation-artifacts/27-1-catalogue-des-4-roles.md:30] — **corrigé**, oubli de bookkeeping lors de `dev-story`, aucun impact code.
- [x] [Review][Defer] `seedRyuutama()` ne valide que `entry.key` (non-vide) — ni `label`/`description` (type/non-vide), ni les doublons de clé au sein d'un même fichier de contenu [apps/api/src/game-systems/game-system.service.ts:142-159] — deferred, pre-existing (mécanisme de seed générique partagé par les 13 `ContentType` déjà en place, aucun n'a cette validation ; pas spécifique à cette story qui n'ajoute que 4 clés vérifiées uniques en base). À traiter dans une future story de durcissement du seed, pas ici.

Dismissed as noise (~6) : absence de test dédié à l'entrée `groupRole` (cohérent avec la convention déjà établie — aucun catalogue similaire, `weapon-categories.json`/`seasons.json` compris, n'a de test dédié à son contenu) ; clés en français jugées « incohérentes avec une convention anglaise » — fausse prémisse du reviewer (sa propre paraphrase anglaise dans le prompt de revue, alors que tous les catalogues Ryuutama existants utilisent déjà des clés françaises : `classId`, `typeId`, `weaponCategory`, etc.) ; « contradiction gitignored vs fichier neuf » — artefact de la préparation du diff de revue (`git diff --no-index` pour montrer le contenu de fichiers gitignorés à des fins de revue, confirmé réellement gitignoré via `git check-ignore -v`), aucun problème réel ; ordre alphabétique non documenté (cosmétique, 4 entrées) ; forme des descriptions jugée incohérente (certaines ont une phrase de conseil « Privilégiez... », d'autres non) — fidélité de transcription déjà vérifiée mot pour mot par l'Acceptance Auditor, c'est le texte du livre lui-même, pas une incohérence d'auteur à corriger.
