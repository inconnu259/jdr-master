---
baseline_commit: 29e47bed727f7127d3d5f19555c68b5a569fb4c8
---

# Story 23.1: Descriptions sur classes, types et catégories d'armes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want voir une description narrative sur chaque classe, type et catégorie d'arme que je peux choisir,
so that je comprenne le sens de mon choix, pas seulement un nom et des chiffres.

## Acceptance Criteria

1. **Given** le catalogue `classes`/`types` seedé, **when** une entrée est chargée, **then** elle porte un champ `description` non vide, au même niveau de détail que `homme-dragon-artefacts.json`/`eveil-powers.json` (2-3 phrases narratives).
2. **Given** l'assistant de création de personnage, **when** le joueur consulte `ClassStep` ou `TypeStep` (aucun champ `description` n'existe aujourd'hui dans leur modèle de données interne), **then** la description de l'item survolé/sélectionné s'affiche à l'écran.
3. **Given** `WeaponStep` (entièrement réécrit par la Story 25.1 — choix d'une arme précise plutôt que d'une catégorie), **when** cette story (23.1) est implémentée, **then** elle se limite à ajouter des données à `weapon-categories.json` — **aucun câblage d'affichage dans `WeaponStep` ici**, pour éviter de refaire ce travail lors de la réécriture de la Story 25.1 (qui affichera ces données dans sa propre UI).
4. **Given** le catalogue `weaponCategory` seedé (`weapon-categories.json`), **when** une entrée est chargée, **then** elle porte un champ `description` non vide reprenant la note en italique du livre (registre mécanique court, ex. « Distance, mais difficiles à utiliser. Deux mains. ») — un registre volontairement plus court que celui des classes/types (AC1), car il s'agit d'une note d'usage et non d'un texte narratif — **et** un champ `exampleWeapons: string[]` listant les exemples d'armes du livre pour cette catégorie (ex. « Arbalètes », « Arcs courts », « Arcs de chasse »), ajouté en préparation de la Story 25.1 qui l'affichera dans son UI de choix d'arme précise. *(AC ajoutée le 2026-07-25 suite à un retour utilisateur en revue de code — la répartition description/exampleWeapons n'était pas prévue dans la version initiale de cette story.)*

## Tasks / Subtasks

- [x] Task 1 — Ajouter `description` aux 7 entrées de `classes.json` (AC: #1)
  - [x] Éditer `apps/api/game-systems/ryuutama/data/classes.json` (gitignoré — voir Dev Notes, contenu réel requis)
  - [x] Chaque entrée (`artisan`, `chasseur`, `fermier`, `guerisseur`, `marchand`, `menestrel`, `noble`) porte un champ `"description": string` non vide
- [x] Task 2 — Ajouter `description` aux 3 entrées de `types.json` (AC: #1)
  - [x] Éditer `apps/api/game-systems/ryuutama/data/types.json`
  - [x] Chaque entrée (`attaque`, `technique`, `magie`) porte un champ `"description": string` non vide
- [x] Task 3 — Ajouter `description` aux 5 entrées de `weapon-categories.json` (AC: #1, #3)
  - [x] Éditer `apps/api/game-systems/ryuutama/data/weapon-categories.json`
  - [x] Chaque entrée (`arc`, `epee-courte`, `epee-longue`, `hache`, `lance`) porte un champ `"description": string` non vide
  - [x] Ne PAS toucher `weapon-step.ts`/`.html` — hors scope explicite (AC3)
- [x] Task 4 — Afficher la description dans `ClassStep` (AC: #2)
  - [x] `class-step.ts` : ajouter `description: string` à l'interface `ClassData` (ligne 13-18)
  - [x] `class-step.html` : afficher `data.description` dans le bloc `@if (selectedClassData(); as data)` (après le `<h2>`/avant la liste de talents, ou juste sous le titre `Talents de {{ data.label }}` — au choix, tant que c'est visible dès la sélection)
  - [x] `class-step.spec.ts` : ajouter `description` aux fixtures `CLASSES`, ajouter une assertion `expect(fixture.nativeElement.textContent).toContain(...)` sur le texte de description après sélection
- [x] Task 5 — Afficher la description dans `TypeStep` (AC: #2)
  - [x] `type-step.ts` : ajouter `description: string` à l'interface `TypeData` (ligne 12-15)
  - [x] `type-step.html` : afficher `data.description` dans le bloc `@if (selectedTypeData(); as data)`
  - [x] `type-step.spec.ts` : même traitement que Task 4 (fixtures + assertion)

### Review Findings

- [x] [Review][Decision] AC1/AC3 ne reflétaient plus l'implémentation finale de `weapon-categories.json` — **résolu (2026-07-25)** : l'utilisateur a choisi de mettre à jour la story plutôt que de revert le code. Nouvelle AC4 ajoutée documentant explicitement le registre court de `description` pour `weaponCategory` et la clé `exampleWeapons: string[]` ajoutée en préparation de la Story 25.1. AC1/AC3 reformulées en conséquence.
- [x] [Review][Patch] Fixture `magie` sans `description` dans `type-step.spec.ts` alors que `TypeData.description` est non-optionnel [apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts:15]
- [x] [Review][Patch] Fixture `artisan` dans `class-step.spec.ts` reçoit une `description` mais aucune assertion ne vérifie son affichage à l'écran (seule `chasseur` est vérifiée) [apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts:73]
- [x] [Review][Defer] `price`/`encumbrance`/`hands` dans `weapon-categories.json` ne sont lus par aucun code actuel — deferred, pre-existing
- [x] [Review][Defer] Fichiers de contenu Ryuutama non versionnés par Git (NFR4) — dérive possible inter-postes — deferred, pre-existing

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte.** Les fichiers `apps/api/game-systems/ryuutama/data/*.json` sont **gitignorés** (contenu extrait du *Guide du Voyageur*, sous droits d'auteur, NFR4 — cf. `apps/api/game-systems/ryuutama/README.md`). Ils existent déjà sur la machine de dev avec 7 classes / 3 types / 5 catégories d'armes, mais sans champ `description`. Cette story n'ajoute **que** ce champ à des entrées déjà existantes (contrairement à la Story 23.4 qui ajoutera de nouvelles classes). Si le texte narratif officiel n'est pas disponible dans le contexte de la session, **demander à l'utilisateur de le fournir** plutôt que de rédiger un texte inventé — même exigence que Story 10.4 ("6 pouvoirs d'éveil officiels saisis dans eveil-powers.json") et Story 23.4 ("contenu fourni par l'utilisateur pendant cette story").
- **Aucun changement backend.** `GameSystemService`/`CONTENT_TYPES` (`apps/api/src/game-systems/game-system.service.ts:56-86`) lisent déjà `classes.json`/`types.json`/`weapon-categories.json` sans validation de forme au-delà de `key` (voir `seedRyuutama()`, ligne ~110-135) — `data: unknown` côté `ContentEntryDto` (`packages/shared/src/index.ts:599`). Ajouter un champ `description` ne nécessite ni migration, ni changement de DTO, ni changement de route. Redémarrer le conteneur `api` (ou attendre le hot-reload) suffit pour reseeder.
- **Pattern de référence** pour le niveau de détail attendu : `apps/api/game-systems/ryuutama/data/eveil-powers.json` et `homme-dragon-artefacts.json` (2-3 phrases narratives par entrée, cf. Story 10.4/10.2).
- **`WeaponStep` : ne pas toucher.** AC3 est explicite — la Story 25.1 réécrit entièrement ce composant (choix d'une arme précise plutôt que d'une catégorie, cf. Epic 25/AD-2 de la spine Palier 8). Câbler l'affichage ici serait un travail jeté.
- **Pas de nouveau type de contenu.** `class`/`type`/`weaponCategory` sont déjà enregistrés dans `CONTENT_TYPES` — ne pas les dupliquer ni créer un 4e fichier.

### Project Structure Notes

- Fichiers de données : `apps/api/game-systems/ryuutama/data/{classes,types,weapon-categories}.json` (existants, gitignorés — Docker doit voir les changements sans étape de build particulière).
- Composants à modifier : `apps/web/src/app/features/characters/character-wizard/steps/{class-step,type-step}/` (`.ts`, `.html`, `.spec.ts`) — ne pas créer de nouveaux composants, étendre l'existant.
- Aucun fichier de `weapon-step/` à modifier (AC3).

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.1] — user story et Acceptance Criteria
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#AD-1, #P5-AD-4] — catalogue `ContentType`/`ContentEntry` seedé, aucun nouveau mécanisme
- [Source: apps/api/src/game-systems/game-system.service.ts#CONTENT_TYPES] — `class`/`type`/`weaponCategory` déjà enregistrés, aucune validation de forme au-delà de `key`
- [Source: apps/api/game-systems/ryuutama/README.md] — structure actuelle des fichiers JSON (7 classes / 3 types / 5 catégories d'armes)
- [Source: apps/web/.../class-step/class-step.ts, type-step.ts] — `ClassData`/`TypeData` interfaces à étendre avec `description`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- Docker : `docker compose exec web pnpm test` → 72 fichiers / 937 tests, aucune régression.
- Docker : `docker compose exec web pnpm lint` → 127 erreurs pré-existantes hors scope (scenario-editor, seance-list, scenario-drafts, etc.) ; `class-step.spec.ts`/`type-step.spec.ts` corrigés via `eslint --fix` (formatage prettier uniquement).

### Completion Notes List

- Contenu narratif réel fourni par l'utilisateur via `docs/classes.md`, `docs/types.md`, `docs/categories-armes.md` (extraits du Guide du Voyageur) — aucun texte inventé. Descriptions des 7 classes/3 types reprises verbatim du paragraphe d'intro de chaque entrée.
- Retour utilisateur en revue (2026-07-25) sur `weapon-categories.json` : `description` corrigée pour ne porter que la note en italique du livre (ex. "Distance, mais difficiles à utiliser. Deux mains.") ; la liste d'exemples d'armes (ex. "arbalètes, arcs courts, arcs de chasse") extraite dans une nouvelle clé `exampleWeapons: string[]`, plutôt que fusionnée dans `description` comme initialement fait. Au passage, constaté que `price`/`encumbrance`/`hands` (déjà présents dans le fichier avant cette story) ne sont lus par aucun code actuel (`ryuutama-pdf.service.ts` ne consomme que `label`/`touchFormula`/`damageFormula`) — signalé à l'utilisateur, non modifié (hors scope de la 23.1).
- `classes.md` référence 5 classes supplémentaires (Dresseur, Ermite, Météomancien, Navigateur, Professeur) non présentes dans `classes.json` — probablement scope de la Story 23.4, non touchées ici.
- Décision utilisateur documentée : la classe Fermier a un talent *Métier d'appoint* (choix à la création d'un talent d'une autre classe ayant un test, avec malus -1) qui n'a aucun support dans le modèle de données actuel — hors scope de la 23.1 (AC ne couvre que le champ `description`), signalé pour une story future éventuelle.
- Aucun changement backend (confirmé par Dev Notes : `GameSystemService`/`ContentEntryDto` acceptent `data: unknown`, pas de migration/DTO à toucher).

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié — gitignoré)
- `apps/api/game-systems/ryuutama/data/types.json` (modifié — gitignoré)
- `apps/api/game-systems/ryuutama/data/weapon-categories.json` (modifié — gitignoré)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html`
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.html`
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts`

## Change Log

- 2026-07-25 : Implémentée (bmad-dev-story). Description narrative ajoutée aux 7 classes/3 types/5 catégories d'armes (contenu fourni par l'utilisateur depuis `docs/{classes,types,categories-armes}.md`) ; affichage câblé dans `ClassStep`/`TypeStep`. 937/937 tests web, aucune régression. Statut passé à "review".
- 2026-07-25 : Revue de code (bmad-code-review, 3 couches adversariales). AC1/AC3 reformulées + AC4 ajoutée (décision utilisateur) pour documenter la répartition `description`/`exampleWeapons` dans `weapon-categories.json`, ajoutée en cours de revue à la demande de l'utilisateur. 2 patches appliqués (fixture `magie` sans description, assertion manquante sur la description d'Artisan), 2 items différés (voir deferred-work.md), 5 écartés. 937/937 tests web après corrections, aucune régression. Statut passé à "done".
