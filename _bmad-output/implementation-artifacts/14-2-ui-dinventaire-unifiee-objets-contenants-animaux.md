---
baseline_commit: b30afac80834185c61935fbfecba7c3365be3669
---

# Story 14.2: UI d'inventaire unifiée (objets, contenants, animaux)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want gérer l'inventaire de mon personnage (ou de celui d'un joueur) depuis une interface unique avec objets, contenants et animaux,
so that je n'aie plus à jongler entre deux blocs incohérents (« Équipement de groupe » texte libre vs « Inventaire » structuré).

## Acceptance Criteria

1. **Given** je consulte l'onglet inventaire d'un personnage **When** la page se charge **Then** je vois trois sections distinctes : objets généraux, contenants, animaux — sans distinction visuelle « groupe vs individuel » héritée de l'ancien modèle.
2. **Given** je suis propriétaire du personnage ou MJ **When** je consulte l'inventaire **Then** je peux ajouter/éditer un objet avec nom, poids, prix (facultatif), effet (facultatif) dans la bonne section.
3. **Given** je suis propriétaire du personnage ou MJ **When** je consulte la section Contenants **Then** je peux ajouter/éditer un contenant avec nom, poids (obligatoire), prix (facultatif), effet (facultatif).
4. **Given** je suis propriétaire du personnage ou MJ **When** je consulte la section Animaux **Then** je peux ajouter/éditer un animal avec nom, prix (facultatif), effet (facultatif) — **jamais** de champ poids affiché ni éditable.
5. **Given** l'ancienne carte « Équipement » du gabarit principal de la fiche (`character-sheet.html`) n'affiche plus que l'objet fétiche depuis la Story 14.1 (la liste `group` est désormais toujours vide, fusionnée dans `individual`) **When** la fiche s'affiche **Then** cette carte ne montre plus de liste vide résiduelle — seul l'objet fétiche (déjà géré ailleurs sur la fiche) reste visible, `InventoryTab` étant désormais la seule source de vérité pour l'équipement.

## Tasks / Subtasks

- [x] **Task 1 — `packages/shared` : DTOs étendus/nouveaux pour le frontend (AC2, AC3, AC4)**
  - Fichier : `packages/shared/src/index.ts`.
  - **`CreateInventoryItemDto`/`UpdateInventoryItemDto`** (lignes 463-472 actuelles) : ajouter `price?: string;` et `effect?: string;` — miroir exact des DTOs `class-validator` déjà étendus côté API par la Story 14.1 (`apps/api/src/characters/dto/create-inventory-item.dto.ts`/`update-inventory-item.dto.ts`), mais ici de simples interfaces TypeScript (pas de décorateurs, `packages/shared` = types uniquement).
  - **Nouveaux `CreateContenantDto`/`UpdateContenantDto`** : même forme qu'`individual` après l'ajout ci-dessus (`name`, `weight` **obligatoire** sur `Create` — la Story 14.1 a corrigé ce point côté API en revue de code, ne pas régresser en le laissant facultatif ici —, `price?`, `effect?`) :
    ```typescript
    export interface CreateContenantDto {
      name: string;
      weight: number;
      price?: string;
      effect?: string;
    }
    export interface UpdateContenantDto {
      name?: string;
      weight?: number;
      price?: string;
      effect?: string;
    }
    ```
  - **Nouveaux `CreateAnimalDto`/`UpdateAnimalDto`** : **jamais de propriété `weight`, même optionnelle** — absence structurelle (miroir exact de `apps/api/src/characters/dto/create-animal.dto.ts`/`update-animal.dto.ts`, Story 14.1, AC4) :
    ```typescript
    export interface CreateAnimalDto {
      name: string;
      price?: string;
      effect?: string;
    }
    export interface UpdateAnimalDto {
      name?: string;
      price?: string;
      effect?: string;
    }
    ```

- [x] **Task 2 — `apps/web/core/characters/character.service.ts` : 6 nouvelles méthodes (AC2, AC3, AC4)**
  - Fichier : `apps/web/src/app/core/characters/character.service.ts` (lignes 168-194 actuelles = `addInventoryItem`/`updateInventoryItem`/`removeInventoryItem`, patron exact à répliquer).
  - Ajouter, en import : `CreateContenantDto`, `UpdateContenantDto`, `CreateAnimalDto`, `UpdateAnimalDto` depuis `@master-jdr/shared` (à côté des imports `CreateInventoryItemDto`/`UpdateInventoryItemDto` déjà présents).
  - 6 nouvelles méthodes, **routes déjà posées côté API par la Story 14.1** (aucun nouveau développement backend) :
    - `addContenant(id, dto: CreateContenantDto): Promise<CharacterDto>` → `POST /characters/:id/contenants`.
    - `updateContenant(id, itemId, dto: UpdateContenantDto): Promise<CharacterDto>` → `PATCH /characters/:id/contenants/:itemId`.
    - `removeContenant(id, itemId): Promise<CharacterDto>` → `DELETE /characters/:id/contenants/:itemId`.
    - `addAnimal(id, dto: CreateAnimalDto): Promise<CharacterDto>` → `POST /characters/:id/animaux`.
    - `updateAnimal(id, itemId, dto: UpdateAnimalDto): Promise<CharacterDto>` → `PATCH /characters/:id/animaux/:itemId`.
    - `removeAnimal(id, itemId): Promise<CharacterDto>` → `DELETE /characters/:id/animaux/:itemId`.
  - Même patron exact que les 3 méthodes existantes : `firstValueFrom(this.http.<verb>(...))`, `withCredentials: true`.

- [x] **Task 3 — `InventoryItemRow` : vue généralisée (AC2, AC3, AC4)**
  - Fichiers : `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts`, `.html` (composant présentationnel pur, réutilisé pour les 3 catégories).
  - `InventoryItemView` (ligne 4-9 actuelle) : rendre `weight` **facultatif** (`weight?: number`) — reste obligatoire en pratique pour `individual`/`contenants`, mais absent pour `animaux` (jamais une valeur `0`/`undefined` fictive, absence structurelle). Ajouter `price?: string`, `effect?: string`.
  - Template (`inventory-item-row.html`, ligne 3 actuelle `<span class="inventory-item-row__weight">{{ item().weight }}</span>`) : n'afficher le poids que `@if (item().weight !== undefined)`. Ajouter, sur le même patron, l'affichage conditionnel de `price`/`effect` s'ils sont renseignés (ex. `@if (item().price) { <span class="inventory-item-row__price">{{ item().price }}</span> }`, idem `effect`).
  - Aucun changement sur `editable`/`removable`/`edit`/`remove` (inputs/outputs déjà génériques, réutilisables tels quels par les 3 catégories).

- [x] **Task 4 — `InventoryTab` : logique des 3 catégories (AC1, AC2, AC3, AC4)**
  - Fichier : `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (171 lignes actuelles, lu intégralement).
  - **⚠️ Piège déjà rencontré 2 fois dans ce projet (Story 12.2, Story 13.1) : ne jamais partager un signal `pending`/erreur/état d'édition entre sections indépendantes.** Les 3 catégories (`individual`, `contenants`, `animaux`) sont des sections indépendantes de la même UI (AC1 : « sans distinction visuelle... » ne signifie pas « état partagé ») — chacune doit avoir son **propre** jeu de signaux (`submitting`/`error`/`editingId`/champs de formulaire), jamais un signal unique réutilisé pour les 3. Dupliquer le pattern 2 fois de plus est le choix délibéré de ce projet (AD-8, déjà appliqué côté backend par la Story 14.1) — ne pas tenter de généraliser en un mécanisme paramétré par catégorie.
  - **`individual` (existant, à étendre)** :
    - `individual` computed (lignes 27-32) : ajouter `price`/`effect` au cast `InventoryItemView[]` (déjà générique après Task 3, aucun changement de logique de lecture).
    - Formulaires d'ajout/édition (`newItemName`/`newItemWeight`, `editName`/`editWeight`, lignes 38-43) : ajouter `newItemPrice`/`newItemEffect` et `editPrice`/`editEffect` (signaux `signal<string | undefined>(undefined)`, même style que `newItemWeight`).
    - `submitAdd()`/`submitEdit()`/`submitMjEdit()`/`submitMjAdd()` (lignes 48-156) : threader `price`/`effect` dans les DTOs envoyés à `characterSvc.addInventoryItem`/`updateInventoryItem`/`setSheetField` (déjà acceptés côté API depuis la Story 14.1, Task 1 de cette story les a rendus disponibles côté types partagés).
  - **`contenants` (nouveau)** : même structure complète que `individual` (computed `contenants` lisant `sheetData.equipment.contenants` avec le même cast `as any` déjà utilisé ligne 29 pour `individual` — `packages/shared`'s `SheetData` reste opaque, cf. Story 14.1 Dev Notes ; formulaires propriétaire/MJ ; `submitAddContenant`/`startEditContenant`/`submitEditContenant`/`submitMjEditContenant`/`submitMjAddContenant`/`removeContenant`), appelant les méthodes `characterSvc.addContenant`/`updateContenant`/`removeContenant`/`setSheetField('equipment.contenants.<index>', ...)` (Task 2). **Poids obligatoire** dans le formulaire d'ajout (contrairement à `individual`, dont le poids reste facultatif — non-régression du gap déjà différé en Story 14.1, cf. `deferred-work.md`) — utiliser un `<input type="number" required>` et bloquer la soumission si vide (`if (!name || weight === undefined) return;`).
  - **`animaux` (nouveau)** : même structure, **sans aucun état ni champ liés au poids** — pas de `newAnimalWeight`/`editAnimalWeight`, aucun paramètre `weight` dans les DTOs envoyés (`CreateAnimalDto`/`UpdateAnimalDto` ne le déclarent pas, Task 1 — le compilateur TypeScript est la garde). `submitAddAnimal`/`startEditAnimal`/`submitEditAnimal`/`submitMjEditAnimal`/`submitMjAddAnimal`/`removeAnimal`, appelant `characterSvc.addAnimal`/`updateAnimal`/`removeAnimal`/`setSheetField('equipment.animaux.<index>', ...)`.
  - **Index MJ** : `submitMjEdit`/`submitMjAdd` existants (lignes 110-156) calculent l'index via `this.individual().findIndex(...)`/`this.individual().length` — répliquer strictement le même calcul d'index sur `this.contenants()`/`this.animaux()` respectivement pour les nouvelles méthodes MJ (jamais mélanger les tableaux des 3 catégories).

- [x] **Task 5 — `inventory-tab.html` : 3 sous-sections (AC1, AC2, AC3, AC4)**
  - Fichier : `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` (90 lignes actuelles).
  - Restructurer en 3 blocs successifs à l'intérieur du même composant (une seule carte « Inventaire » côté `character-sheet.html`, cohérent avec AC1 qui demande 3 *sections*, pas 3 cartes séparées) : **Objets** (structure existante, lignes 1-67, étendue avec les champs prix/effet dans les formulaires — `<input type="text" placeholder="Prix (facultatif)">`/`<input type="text" placeholder="Effet (facultatif)">`, mêmes classes `.inventory-tab__add-form`/`.inventory-tab__mj-add-form`), **Contenants** (même structure, poids `required`), **Animaux** (même structure, **aucun champ poids** dans les formulaires d'ajout/édition).
  - Chaque section a son propre titre (`<h3>Objets</h3>` / `<h3>Contenants</h3>` / `<h3>Animaux</h3>`) — **titres statiques, non pilotés par le thème** (décision de scope : les clés `evolution.inventory_*` existantes dans `tones.ts` restent scopées au titre de carte global déjà en place côté `character-sheet.html`, ne pas en ajouter 12 nouvelles — 3 thèmes × 2 nouvelles catégories × 2 clés min — pour un simple sous-titre de section ; cohérent avec l'esprit AC1 « sans distinction visuelle », pas une exigence de re-thématisation complète).
  - `<app-encumbrance-bar>` (ligne 2 actuelle) : le poids total (`totalWeight()`) doit désormais inclure les poids des **objets ET des contenants** (jamais les animaux, qui n'ont pas de poids) — `totalWeight` computed (Task 4) à étendre : `this.individual().reduce(...) + this.contenants().reduce(...)`.

- [x] **Task 6 — `character-sheet.ts`/`.html` : nettoyage de la carte « Équipement » devenue vide (AC5)**
  - Fichiers : `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (computed `equipment`, lignes 261-265 actuelles), `.html` (section « Équipement », lignes 295-316 actuelles).
  - **Ne pas supprimer l'objet fétiche** (`fetiqueObject`, lignes 267-269 ts / 304-315 html) — seule la liste `eq.group` (toujours vide depuis la migration Story 14.1) est morte. Retirer le computed `equipment` (lignes 261-265) et le bloc `@if (equipment(); as eq) { <ul>...</ul> }` (lignes 297-303 html) ; conserver la `<section class="sheet__card">` elle-même (titre « Équipement » conservé si l'objet fétiche y reste affiché seul) ou la fusionner avec la section adjacente — **décision d'implémentation libre du dev agent**, tant que l'objet fétiche reste éditable par le MJ (`app-field-edit-pencil`) et visible par le propriétaire exactement comme avant, et qu'aucune liste vide résiduelle ne subsiste.

- [x] **Task 7 — Tests**
  - `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.spec.ts` (fixture `makeCharacterWithItems` ligne 7-14 actuelle utilise encore l'ancienne forme `{ individual, group: [] }` — inoffensif car `InventoryTab` ne lit jamais `group`, mais à corriger vers `{ individual, contenants: [], animaux: [] }` pour éviter toute confusion future) :
    - Nouveaux tests miroir de ceux d'`individual` pour `contenants` (rendu, ajout propriétaire avec poids obligatoire, ajout MJ, édition, suppression, poids inclus dans `totalWeight()`) et `animaux` (rendu, ajout/édition/suppression sans jamais de champ poids dans le DOM — assertion explicite `expect(fixture.nativeElement.querySelector('...weight...')).toBeNull()` ou équivalent pour la section Animaux).
    - Test prix/effet : ajouter un objet avec `price`/`effect` renseignés → affichés dans `InventoryItemRow` ; objet sans l'un ou l'autre → aucun élément vide/orphelin dans le DOM.
  - `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.spec.ts` (fichier existant) : nouveaux tests pour `weight` absent (aucun élément de poids rendu) et présence conditionnelle de `price`/`effect`.
  - `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` : adapter les tests existants sur l'ancienne carte « Équipement »/`group` (rechercher `equipment`/`group` dans ce fichier avant de commencer — la Story 6.7/8.x a pu y laisser des fixtures similaires) ; test de non-régression sur l'objet fétiche (affiché + éditable MJ) après le nettoyage de Task 6.
  - `apps/web/src/app/core/characters/character.service.spec.ts` (si ce fichier existe déjà pour les méthodes `individual` — vérifier avant d'écrire, sinon suivre le patron déjà en place dans les specs de service similaires du projet) : 6 nouveaux tests pour `addContenant`/`updateContenant`/`removeContenant`/`addAnimal`/`updateAnimal`/`removeAnimal` (URL appelée, méthode HTTP, `withCredentials`).

- [x] **Task 8 — Validation finale**
  - `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - `docker compose exec web pnpm exec ng build --configuration development` — compilation propre (pas de script `typecheck` dédié côté web, précédent établi Stories 13.x).
  - **Test manuel réel recommandé** (le CLAUDE.md du projet demande de tester en navigateur pour tout changement UI) : ouvrir `localhost:4200`, naviguer vers une fiche de personnage Ryuutama, vérifier que les 3 sections s'affichent, ajouter un objet/contenant/animal avec prix et effet, confirmer l'absence de tout champ poids dans la section Animaux, et confirmer que la carte « Équipement » n'affiche plus de liste vide.
  - Aucune modification backend dans cette story (les 6 routes existent déjà depuis la Story 14.1) — vérifier qu'aucun fichier `apps/api` n'a été touché par erreur.

### Review Findings

- [x] [Review][Patch] Poids du contenant non imposé à l'édition (AC3) — `submitEditContenant()`/`submitMjEditContenant()` n'ont aucune garde `weight === undefined` (contrairement à `submitAddContenant()`/`submitMjAddContenant()`), et `onEditContenantWeightInput()` convertit un champ vidé (`NaN`) en `0` plutôt qu'en `undefined` — un contenant existant peut être édité avec le poids vidé et sauvegardé silencieusement à `0` sans jamais être bloqué [`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` — `submitEditContenant`/`submitMjEditContenant`/`onEditContenantWeightInput`] — corrigé : `onEditContenantWeightInput` renvoie `undefined` (pas `0`) sur `NaN`, garde `weight === undefined` ajoutée aux deux méthodes d'édition ; 2 tests de régression ajoutés
- [x] [Review][Patch] Un contenant de poids `0` (valeur légitime) ne peut jamais être créé via le formulaire d'ajout (AC3) — `newContenantWeight.set($any($event.target).valueAsNumber || undefined)` traite `0` comme faux (`0 || undefined` = `undefined`), déclenchant à tort la garde « poids obligatoire » de `submitAddContenant()`/`submitMjAddContenant()` alors que l'utilisateur a bien saisi une valeur valide [`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` — formulaires d'ajout Contenants, propriétaire et MJ] — corrigé : nouvelle méthode `onNewContenantWeightInput()` (ne coerce que `NaN`, jamais `0`), même patron que `onEditWeightInput`/`onEditContenantWeightInput` ; 1 test de régression ajouté
- [x] [Review][Defer] `item().weight !== undefined` dans `InventoryItemRow` ne couvre pas le cas où l'API renverrait `weight: null` plutôt qu'une absence de clé — afficherait un poids vide pour un animal dans ce cas [`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html`] — deferred, risque faible (le type `Animal` backend n'a structurellement jamais cette clé, jamais observé en pratique)
- [x] [Review][Defer] `price`/`effect` ne sont jamais `.trim()` avant envoi (contrairement à `name`), sur les 3 catégories (objets/contenants/animaux) — une valeur composée uniquement d'espaces serait persistée telle quelle au lieu d'être traitée comme "non renseignée" [`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` — `submitAdd*`/`submitEdit*` des 3 catégories] — deferred, polish mineur, non requis par les AC de cette story
- [x] [Review][Defer] `InventoryItemRow` affiche un badge prix/effet visiblement vide si la valeur est composée uniquement d'espaces (`@if (item().price)` est vrai pour une chaîne non vide même blanche) [`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html`] — deferred, polish mineur, corollaire du point précédent (se résorbe si le trim ci-dessus est fait)

## Dev Notes

### Architecture — aucune décision contraignante spécifique au-delà d'AD-8 (héritée)

- Table de cohérence de la spine (`ARCHITECTURE-SPINE.md` du 2026-07-18) : FR6-FR9 → « `CharacterModule`, `packages/game-rules` — AD-1, AD-2 » — AD-1/AD-2 concernent le stockage JSON et le mapping PDF (backend, déjà traités Story 14.1), **aucune AD ne contraint spécifiquement l'UI** de cette story.
- **AD-8 (héritée, Story 13.1)** : « dupliquer un pattern à quelques endroits coûte moins cher qu'une abstraction pour peu d'usages » — appliquée ici à 3 catégories quasi-identiques (Task 4). Ne pas introduire de composant générique paramétré par catégorie.
- **P1-AD-5 (héritée)** : tout template touché utilise `@if`/`@for`, jamais `*ngIf`/`*ngFor` — déjà respecté dans `inventory-tab.html` actuel, à ne pas régresser.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts`** (171 lignes) — patron complet à répliquer 2 fois (contenants/animaux) : computed de lecture (27-32), formulaires (38-46), `submitAdd`/`submitEdit`/`submitMjEdit`/`submitMjAdd`/`removeItem` (48-170).
- **`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html`** (90 lignes) — structure à répliquer pour les 2 nouvelles sections.
- **`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts`/`.html`** — composant présentationnel à généraliser (Task 3), réutilisé par les 3 catégories.
- **`apps/web/src/app/core/characters/character.service.ts`** (lignes 168-194 pour le patron `individual`, imports en tête de fichier) — 6 nouvelles méthodes à ajouter (Task 2), routes déjà posées côté API.
- **`packages/shared/src/index.ts`** (lignes 356 `SheetData = Record<string, unknown>`, 463-472 DTOs `individual` actuels) — `SheetData` reste opaque, aucune donnée d'équipement typée à ce niveau (cohérent avec Story 14.1) ; seuls les DTOs de payload de mutation sont à étendre/ajouter (Task 1).
- **`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`** (computed `equipment`, lignes 261-265) et **`.html`** (section « Équipement », lignes 295-316) — carte à nettoyer (Task 6), objet fétiche à préserver.
- **`apps/web/src/app/core/theme/tones.ts`** (3 thèmes : `grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`, clés `evolution.inventory_*` lignes ~156-164/319-326/480-487) — clés existantes réutilisées telles quelles pour le titre de carte global, pas de nouvelles clés introduites (décision de scope, Task 5).
- **`_bmad-output/implementation-artifacts/14-1-modele-dinventaire-unifie-backend-validation-et-migration.md`** (Dev Notes + Change Log) — les 6 routes REST `contenants`/`animaux`, les DTOs API (`class-validator`), le type `InventoryItem`/`Contenant`/`Animal` (`packages/game-rules`), et le piège de compilation déjà rencontré (`character-wizard.ts` référençait encore `equipment.group` via `Partial<RyuutamaSheetData>`) — **ce piège est un signal que d'autres fichiers `apps/web` peuvent référencer `RyuutamaSheetData` directement plutôt que via le cast `as any` générique** ; grep `RyuutamaSheetData` dans `apps/web/src` avant de commencer cette story pour confirmer qu'aucun autre point de compilation cassé ne subsiste au-delà de ceux déjà corrigés en 14.1.

### Historique — gaps déjà différés pertinents pour cette story

- `deferred-work.md`, section « code review of 14-1... » : poids `individual` toujours facultatif (pré-existant Story 6.4, non corrigé) — **ne pas reproduire cette limitation pour `contenants`** (Task 4 : poids obligatoire dans le formulaire) ; effacer un `price`/`effect` déjà posé via `null` ne fonctionne pas côté API (`updateInventoryItem`/`updateContenant`/`updateAnimal`) — si l'UI de cette story propose un moyen de vider ces champs, vérifier qu'envoyer une chaîne vide `''` plutôt que `null`/`undefined` produit le comportement attendu (l'API traite `''` comme une valeur définie, pas comme "non fourni").

### Project Structure Notes

- Fichiers modifiés : `packages/shared/src/index.ts` ; `apps/web/src/app/core/characters/character.service.ts` (+ spec si existant) ; `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts`/`.html` (+ spec) ; `inventory-item-row.ts`/`.html` (+ spec) ; `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`/`.html` (+ spec).
- Aucun nouveau fichier attendu (extension de composants existants, pas de nouveau composant top-level — cohérent avec AD-8/Task 4).
- Aucune migration Prisma, aucun nouveau module NestJS, **aucune modification `apps/api`** — toutes les routes/DTOs backend existent déjà depuis la Story 14.1.

### Testing Standards

- Frontend : Vitest, fichiers `*.spec.ts` déjà en place à côté des composants — étendre les fichiers existants.
- Zoneless (pas de `zone.js`) — suivre la convention déjà établie ailleurs dans ce projet si des promesses asynchrones sont impliquées (boucle de `await Promise.resolve()` + `detectChanges()` avant `whenStable()`).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 226-241 — Epic 14 / Story 14.2 complète, FR6/FR7/FR8)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (table de cohérence, FR6-FR9 → AD-1/AD-2 ; AD-8 héritée)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.2 FR-6/FR-7/FR-8 — « L'UI propriétaire et l'UI MJ exposent toutes deux le système unifié, sans distinction visuelle... »)
- `_bmad-output/implementation-artifacts/14-1-modele-dinventaire-unifie-backend-validation-et-migration.md` (story précédente, backend complet consommé ici sans modification)
- `_bmad-output/implementation-artifacts/deferred-work.md` (sections « code review of 14-1... » et « code review of 13-1... » — pièges de signaux partagés entre sections indépendantes, gap poids `individual` facultatif)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Task 1 : `CreateInventoryItemDto`/`UpdateInventoryItemDto` étendus (`price?`/`effect?`) ; nouveaux `CreateContenantDto`/`UpdateContenantDto` (poids obligatoire sur `Create`) et `CreateAnimalDto`/`UpdateAnimalDto` (jamais de `weight`) ajoutés à `packages/shared`.
- Task 2 : 6 nouvelles méthodes ajoutées à `character.service.ts` (web), même patron exact que les 3 méthodes `individual` existantes.
- Task 3 : `InventoryItemView.weight` rendu facultatif, `price`/`effect` ajoutés ; template affiche chaque champ conditionnellement (`@if`).
- Task 4 : `contenants`/`animaux` implémentés avec un jeu de signaux **entièrement indépendant** de `individual` (aucun signal partagé, conformément au piège documenté). Poids obligatoire bloqué côté client pour l'ajout de contenant (`if (!name || weight === undefined) return;`). Aucun signal/paramètre lié au poids pour `animaux`.
- Task 5 : template restructuré en 3 `<section class="inventory-tab__section">` (Objets/Contenants/Animaux) à l'intérieur du même composant `InventoryTab`. Titres statiques (décision de scope documentée dans la story, pas de nouvelles clés de thème). `totalWeight()` étendu pour inclure les contenants.
- Task 6 : carte « Équipement » de `character-sheet.ts`/`.html` nettoyée — computed `equipment` et liste `eq.group` retirés, objet fétiche préservé intact (affichage + édition MJ).
- Task 7 : tests ajoutés — `inventory-tab.spec.ts` (fixture corrigée vers la nouvelle forme + 12 nouveaux tests contenants/animaux, dont un test confirmant l'indépendance des signaux d'erreur entre sections), `inventory-item-row.spec.ts` (+2 tests weight absent / price-effect conditionnels), `character.service.spec.ts` web (+6 tests des nouvelles méthodes), `character-sheet.spec.ts` (1 test existant adapté à la suppression de la liste `group`).
- Task 8 : `ng test --watch=false` → 829/829 (+19 vs avant cette story), `ng build --configuration development` propre, aucun fichier `apps/api` touché (vérifié). **Test manuel réel non exécuté par navigateur automatisé dans cette session** (pas d'outil d'automatisation navigateur invoqué) — seule une vérification HTTP basique (200 sur `localhost:4200`) a été faite ; recommandé d'ouvrir l'app manuellement avant de merger pour confirmer visuellement les 3 sections.

### File List

- `packages/shared/src/index.ts` (modifié — Task 1)
- `apps/web/src/app/core/characters/character.service.ts` (modifié — Task 2)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié — Task 7)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts` (modifié — Task 3)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html` (modifié — Task 3)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.spec.ts` (modifié — Task 7)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (réécrit — Task 4)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` (réécrit — Task 5)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.spec.ts` (modifié — Task 7)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — Task 6)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié — Task 6)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié — Task 7)

## Change Log

- 2026-07-18 : Implémentation complète (Tasks 1-8). Modèle d'inventaire unifié exposé côté UI : 3 sections (Objets/Contenants/Animaux), prix/effet facultatifs sur les 3 catégories, poids obligatoire pour les contenants, jamais de poids pour les animaux. Carte « Équipement » historique nettoyée (objet fétiche préservé). 829/829 tests web, build development propre, aucune régression, aucune modification backend. Statut passé à review.
- 2026-07-18 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 violations d'AC3 confirmées et corrigées (poids contenant non imposé à l'édition ; poids `0` refusé à tort à la création par une coercition `0 || undefined`). 4 items différés (voir `deferred-work.md`). ~20 écartés (dont 2 faux positifs du Blind Hunter dus à une omission accidentelle de fichiers dans son prompt — vérifiés et écartés). 3 nouveaux tests de régression. 832/832 tests web après correction, build development propre, aucune régression. Statut passé à done.
