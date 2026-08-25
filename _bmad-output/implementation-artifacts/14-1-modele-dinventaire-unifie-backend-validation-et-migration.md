---
baseline_commit: fffdfba9a0aeeaa696554f890d31ea0950ecdbce
---

# Story 14.1: Modèle d'inventaire unifié — backend, validation et migration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que mon inventaire (objets, contenants, animaux) soit stocké dans un modèle unique cohérent avec la vraie fiche PDF officielle,
so that mes anciens objets ne soient jamais perdus quand la structure évolue.

## Acceptance Criteria

1. **Given** un personnage existant avec des objets `individual` (avec poids) et `group` (texte libre, sans poids) **When** la migration de données s'exécute (script ponctuel au déploiement) **Then** tous les objets sont conservés dans la liste unifiée `individual`, les anciennes entrées `group` reçoivent un poids par défaut de `0`, prix et effet démarrent vides pour tous — et les catégories `contenants`/`animaux` (nouvelles, inexistantes avant ce palier) sont initialisées à des listes vides.
2. **Given** un objet d'inventaire général (`equipment.individual`) **When** il est créé ou modifié (via l'API) **Then** il porte un nom, un poids (obligatoire), un prix (facultatif) et un effet (facultatif) — un objet sans prix ni effet est accepté sans erreur.
3. **Given** un contenant (`equipment.contenants`) **When** il est créé via l'API **Then** il porte un nom, un prix facultatif, un poids obligatoire et un effet facultatif — catégorie structurellement distincte des objets généraux (jamais fusionnée).
4. **Given** un animal (`equipment.animaux`) **When** il est créé via l'API **Then** il porte un nom, un prix facultatif et un effet facultatif — **jamais** de champ poids, ni dans le type TypeScript, ni dans le DTO, ni accepté silencieusement via `setSheetField` (MJ).

## Tasks / Subtasks

- [x] **Task 1 — `packages/game-rules` : type `RyuutamaSheetData.equipment` étendu (AC1, AC2, AC3, AC4)**
  - Fichier : `packages/game-rules/src/ryuutama/types.ts`.
  - **Déviation assumée par rapport au seed TypeScript de `ARCHITECTURE-SPINE.md`** : le seed propose de nommer le type `EquipmentItem` et de dériver `contenants`/`animaux` via `Omit<EquipmentItem, ...>`, mais **sans** `id`/`addedBy` — deux champs pourtant **load-bearing** dans le code actuel (`id` : adressage stable d'un objet, jamais par index — décision actée en revue de code Story 6.4, cf. `character.service.ts:880-884` ; `addedBy: 'player' | 'mj'` : distingue provenance joueur/MJ, forcé côté serveur, jamais lu depuis le client). Le seed de la spine est indicatif sur la forme des données (prix/effet/catégories), pas normatif sur l'identité/la provenance — **conserver `id`/`addedBy` dans les 3 catégories**.
  - **Ne pas renommer `InventoryItem` en `EquipmentItem`** — pur churn sans bénéfice fonctionnel : les DTOs (`CreateInventoryItemDto`), les routes REST (`:id/inventory-items`), le service (`addInventoryItem`), le composant Angular (`InventoryTab`) portent tous déjà ce nom, avant même cette story. AD-1 (architecture) porte sur le stockage JSON-vs-relationnel, pas sur la nomenclature des identifiants. Garder `InventoryItem`.
  - Nouveau type unifié :
    ```typescript
    export interface InventoryItem {
      id: string;
      name: string;
      weight: number;
      price?: string;   // texte libre (ex. "3 po") — aucun type monétaire structuré
      effect?: string;
      addedBy: 'player' | 'mj';
    }

    /** Même forme que InventoryItem (poids obligatoire) — catégorie structurellement séparée (FR7). */
    export type Contenant = InventoryItem;

    /** Jamais de poids (FR8) — absence structurelle du champ, pas juste optionnel/undefined. */
    export type Animal = Omit<InventoryItem, 'weight'>;
    ```
  - `RyuutamaSheetData.equipment` (ligne 24 actuelle) devient :
    ```typescript
    equipment?: { individual: InventoryItem[]; contenants: Contenant[]; animaux: Animal[] };
    ```
    **Supprimer `group: string[]`** — n'existe plus dans le type (les anciennes entrées `group` sont fusionnées dans `individual` par la migration, Task 5).
  - **Non-régression consciente** : `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (`EquipmentPdfInput`, un type **local, dupliqué**, jamais un import direct de `RyuutamaSheetData` — cf. commentaire ligne 3-5 du fichier) référence encore `individual: {name,weight}[]` + `group: string[]` — **ne pas y toucher dans cette story**, `mapEquipmentToPdfFields`/`EquipmentPdfInput` et `apps/api/src/characters/equipment-pdf.service.ts` (qui construit cet input) sont explicitement hors scope (FR-9 = Story 14.3). Le champ `group` y reste un type mort après cette story (plus aucune donnée réelle ne le peuple), sans casser la compilation (types locaux indépendants) — traité par la Story 14.3.

- [x] **Task 2 — `packages/game-rules` : `validate()` inchangé, décision de scope documentée (AC2, AC3, AC4)**
  - Fichier : `packages/game-rules/src/ryuutama/validate.ts` (72 lignes, lu intégralement).
  - **Constat** : `validate()` ne contient **aujourd'hui aucune règle touchant `equipment`** (5 règles : classe, type, attributs, arme, sous-choix Artisan — rien sur l'inventaire). Les AC2-AC4 (« un objet sans prix ni effet est accepté ») sont donc **déjà satisfaites par construction**, sans aucune modification requise : rien ne valide `equipment` aujourd'hui, rien ne le validera après cette story.
  - **Décision de scope actée** (résolue sans besoin de trancher avec l'utilisateur — le périmètre de `validate()` est sans ambiguïté à la lecture du fichier) : ne **pas** ajouter de nouvelles règles de validation d'équipement dans `validate()`. Ce fichier valide les règles RPG structurantes (classe/type/attributs/arme), jamais la forme des champs libres (narratif, notes, inventaire) — ces derniers sont validés à la frontière API par `class-validator` (Task 3), cohérent avec la convention déjà établie pour `CreateInventoryItemDto` (`@IsString`/`@MaxLength`, pas de règle dans `validate()`).
  - Aucun code à modifier pour cette tâche — seulement confirmer par un test que `validate()` reste `valid: true` avec un `equipment` contenant les 3 nouvelles catégories peuplées de champs `price`/`effect` absents.

- [x] **Task 3 — `apps/api` : DTOs — `individual` étendu, nouveaux DTOs `contenants`/`animaux` (AC2, AC3, AC4)**
  - Fichiers : `apps/api/src/characters/dto/create-inventory-item.dto.ts`, `update-inventory-item.dto.ts` (existants, à étendre) + 4 nouveaux fichiers `create-contenant.dto.ts`, `update-contenant.dto.ts`, `create-animal.dto.ts`, `update-animal.dto.ts`.
  - `CreateInventoryItemDto`/`UpdateInventoryItemDto` : ajouter `price?: string` (`@IsOptional() @IsString() @Transform(trim) @MaxLength(50)`) et `effect?: string` (`@IsOptional() @IsString() @Transform(trim) @MaxLength(300)`) — mêmes décorateurs `@Transform`/`@IsNotEmpty` que `name` pour `price`/`effect` **sauf** `@IsNotEmpty` (facultatifs, une chaîne vide après trim doit être acceptée comme "non renseigné", pas rejetée).
  - `CreateContenantDto`/`UpdateContenantDto` : **structure identique** à `CreateInventoryItemDto`/`UpdateInventoryItemDto` après l'ajout ci-dessus (`name`, `weight`, `price?`, `effect?`) — dupliquer plutôt que réutiliser un DTO générique paramétré par catégorie (cohérent avec AD-8 déjà établi dans ce projet : dupliquer un pattern à quelques endroits coûte moins cher qu'une abstraction pour ~2 usages).
  - `CreateAnimalDto`/`UpdateAnimalDto` : **mêmes champs SANS `weight`** — `name` (requis à la création, `@IsString @IsNotEmpty @MaxLength(200)`), `price?`, `effect?` (mêmes règles que ci-dessus). Ne jamais déclarer de propriété `weight` sur ces DTOs, même optionnelle — l'absence structurelle est la garde (AC4).

- [x] **Task 4 — `apps/api` : `character.service.ts` — méthodes CRUD `contenants`/`animaux` + extension `individual` (AC2, AC3, AC4)**
  - Fichier : `apps/api/src/characters/character.service.ts` (lu intégralement, 968+ lignes).
  - **Helper de normalisation généralisé** : `normalizeInventoryIndividual` (lignes 81-89) protège contre un tableau mixte `string | InventoryItem` hérité de l'ancienne migration Story 6.4 — **cette garde ne s'applique qu'à `individual`** (seule catégorie qui a pu contenir des `string` legacy). `contenants`/`animaux` sont des catégories **nouvelles** (n'existent dans aucun personnage avant la migration Task 5) : pas besoin d'un normalizer équivalent, une garde `?? []` simple suffit (`sheetData.equipment?.contenants ?? []`).
  - `addInventoryItem`/`updateInventoryItem`/`removeInventoryItem` (lignes 853-938) : aucune signature ne change ; passer `dto.price`/`dto.effect` (désormais présents sur les DTOs étendus) dans la construction de l'objet, comme `name`/`weight` le sont déjà.
  - **Nouvelles méthodes, répliquant exactement le pattern `addInventoryItem`/`updateInventoryItem`/`removeInventoryItem`** (même accès propriétaire-seul via `getOwnCharacterOrThrow`, même verrou optimiste via `writeInventoryChange`, aucun `CharacterSnapshot`) :
    - `addContenant(characterId, userId, dto: CreateContenantDto)`, `updateContenant(characterId, userId, itemId, dto: UpdateContenantDto)`, `removeContenant(characterId, userId, itemId)` — opèrent sur `sheetData.equipment.contenants`, `addedBy` forcé `'player'`.
    - `addAnimal(characterId, userId, dto: CreateAnimalDto)`, `updateAnimal(characterId, userId, itemId, dto: UpdateAnimalDto)`, `removeAnimal(characterId, userId, itemId)` — opèrent sur `sheetData.equipment.animaux`, `addedBy` forcé `'player'`, **aucune référence à `weight` nulle part dans ces 3 méthodes**.
  - `setSheetField` (lignes 706-812) : le bloc `if (segments[0] === 'equipment')` (lignes 729-772) ne gère aujourd'hui que `equipment.individual.<index>`. L'étendre pour accepter aussi `equipment.contenants.<index>` et `equipment.animaux.<index>` (même validation de forme de chemin — `segments.length === 3`, index numérique), même garde de conflit optimiste par `id` (lignes 751-765), `addedBy` forcé `'mj'`. **Garde spécifique `animaux`** : après avoir construit `value` (ligne 766-770), si `segments[1] === 'animaux'`, supprimer explicitement toute clé `weight` du `value` reçu avant l'écriture (`delete (value as Record<string, unknown>)['weight'];` ou équivalent) — empêche un MJ malveillant/erroné d'injecter un poids sur un animal via ce chemin générique, cohérent avec AC4 (« jamais... accepté silencieusement via `setSheetField` »).

- [x] **Task 5 — `apps/api` : `characters.controller.ts` — routes `contenants`/`animaux` (AC3, AC4)**
  - Fichier : `apps/api/src/characters/characters.controller.ts` (`@Controller('characters')`, garde de classe `@UseGuards(AuthenticatedGuard)` déjà en place, lignes 216-247 = routes `inventory-items` existantes).
  - Ajouter, en suivant **exactement** le patron des 3 routes `inventory-items` (mêmes décorateurs `@Post`/`@Patch`/`@Delete`, `@Param('id', ParseUUIDPipe)`, `@CurrentUser()`, même garde `BadRequestException` sur `PATCH` si ni `name` ni `weight`/`price`/`effet` fourni — adapter la garde `PATCH` de `updateInventoryItem`, ligne 232-236, à chaque nouvelle route pour vérifier qu'au moins un champ pertinent est fourni) :
    - `POST /characters/:id/contenants` → `CreateContenantDto` → `characters.addContenant(id, user.id, dto)`.
    - `PATCH /characters/:id/contenants/:itemId` → `UpdateContenantDto` → `characters.updateContenant(id, user.id, itemId, dto)`.
    - `DELETE /characters/:id/contenants/:itemId` → `characters.removeContenant(id, user.id, itemId)`.
    - `POST /characters/:id/animaux` → `CreateAnimalDto` → `characters.addAnimal(id, user.id, dto)`.
    - `PATCH /characters/:id/animaux/:itemId` → `UpdateAnimalDto` → `characters.updateAnimal(id, user.id, itemId, dto)`.
    - `DELETE /characters/:id/animaux/:itemId` → `characters.removeAnimal(id, user.id, itemId)`.

- [x] **Task 6 — `apps/api` : migration one-off `migrate-equipment-unify` (AC1)**
  - Fichiers : `apps/api/src/characters/migrate-equipment-unify.ts` (logique pure, testable) + `apps/api/prisma/migrate-equipment-unify.ts` (point d'entrée exécutable) — **suivre exactement le patron à 2 fichiers de `migrate-inventory-format.ts`/`prisma/migrate-inventory-format.ts`** (précédent direct, Story 6.4, lu intégralement) : la logique pure prend un client minimal typé (`{ character: { findMany, update } }`), le point d'entrée instancie `PrismaClient`/`PrismaPg` depuis `DATABASE_URL`, exécute, logue le compte, `$disconnect()`, `process.exit(1)` en cas d'erreur.
  - Nouveau script npm dans `apps/api/package.json` (à côté de `"migrate:inventory-format"`, ligne 24) : `"migrate:equipment-unify": "ts-node prisma/migrate-equipment-unify.ts"`.
  - **Algorithme** (par personnage, lu via `findMany({ select: { id: true, sheetData: true } })`, comme le précédent) :
    1. **Critère d'idempotence** : si `sheetData.equipment?.contenants` est déjà un tableau (présent), le personnage est considéré déjà migré → ignorer (pas d'`update`). Contrairement à la migration Story 6.4 (qui testait `typeof individual[0] !== 'string'`), cette migration ajoute des clés qui n'existaient jamais avant elle (`contenants`/`animaux`) — leur présence est un marqueur de migration fiable et suffisant.
    2. Si `sheetData.equipment` est totalement absent : toujours écrire `equipment: { individual: [], contenants: [], animaux: [] }` (personnage sans inventaire du tout — normaliser quand même pour que le code aval n'ait jamais à gérer un `equipment` complètement `undefined`).
    3. Sinon (equipment présent, pas encore migré) : construire le nouveau `individual` = `normalizeInventoryIndividual(equipment.individual)` (réutiliser la fonction déjà exportée/exportable de `character.service.ts`, ou dupliquer sa logique si l'import cross-fichier n'est pas déjà exporté — vérifier avant d'exporter un nouveau symbole) **concaténé avec** les anciennes entrées `equipment.group` converties : `(equipment.group ?? []).map((name) => ({ id: randomUUID(), name, weight: 0, addedBy: 'player' as const }))`. `contenants: []`, `animaux: []`. Supprimer la clé `group` du nouvel objet `equipment` écrit (ne pas la laisser traîner, vide ou non — le type ne la déclare plus, Task 1).
    4. Écrire via `prisma.character.update({ where: { id }, data: { sheetData: { ...sheetData, equipment: <nouveau> } } })` — **ne jamais** passer par `updateMany`+`updatedAt` (verrou optimiste) ici : c'est un script one-off exécuté hors trafic applicatif, avant le redémarrage de l'API sur ce changement (même commentaire que le précédent, `prisma/migrate-inventory-format.ts` lignes 5-9 — "Doit tourner AVANT le redémarrage de l'API... jamais de fenêtre à double-format").
  - **Ordre de déploiement** (à documenter dans le commentaire du script, comme le précédent) : exécuter `pnpm migrate:equipment-unify` avant tout redémarrage de l'API portant le nouveau type `RyuutamaSheetData` (Task 1) — sinon une lecture avec l'ancien code sur les nouvelles données, ou l'inverse, produirait un état incohérent.

- [x] **Task 7 — Tests**
  - `packages/game-rules` : nouveau/étendu `validate.spec.ts` — test confirmant qu'un `sheetData` avec `equipment.individual`/`contenants`/`animaux` sans `price`/`effect` reste `valid: true` (Task 2). Types `Contenant`/`Animal`/`InventoryItem` étendu testés par la compilation elle-même (pas de test runtime dédié requis pour un type).
  - `apps/api` : `character.service.spec.ts` (fichier lourdement référencé, ~26 occurrences d'`equipment`/`individual`/`group` à adapter à la nouvelle forme — piège mémorisé : les specs touchant `ScenariosService`/`CharacterService` nécessitent `jest.mock('@master-jdr/game-rules', ...)` sinon `ts-jest` échoue avec une erreur trompeuse `"Unexpected token export"`, cf. mémoire projet).
    - Adapter toutes les fixtures existantes (`equipment: { individual: [...], group: [...] }`) vers la nouvelle forme (`{ individual: [...], contenants: [...], animaux: [...] }`) — retirer `group` des fixtures, migrer son contenu vers `individual` là où le test en dépend.
    - Nouveaux tests miroir de ceux d'`addInventoryItem`/`updateInventoryItem`/`removeInventoryItem` pour `addContenant`/`updateContenant`/`removeContenant` et `addAnimal`/`updateAnimal`/`removeAnimal` (accès propriétaire-seul, verrou optimiste, `addedBy` forcé `'player'`).
    - Nouveau test `setSheetField` : `equipment.animaux.<index>` avec un `value` contenant une clé `weight` injectée → l'objet persisté ne porte **jamais** cette clé (garde Task 4).
    - Nouveau test `setSheetField` : `equipment.contenants.<index>` — même patron que le test existant `equipment.individual` (lignes 1205-1235 actuelles), `addedBy` forcé `'mj'`.
  - `apps/api` : `migrate-equipment-unify.spec.ts` (nouveau, même style que `migrate-inventory-format.spec.ts`, lu intégralement) — couvrir : fusion `group`→`individual` avec poids `0`/`addedBy: 'player'` ; `individual` existant préservé intact (poids conservé) ; `contenants`/`animaux` initialisés à `[]` ; idempotence (personnage déjà migré, présence de `contenants` → aucun `update` appelé) ; `equipment` totalement absent → normalisé sans crash ; plusieurs personnages, seuls les non-migrés sont mis à jour.

- [x] **Task 8 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression.
  - `docker compose exec api pnpm typecheck` (ou équivalent déjà établi côté API — contrairement à `apps/web`, `apps/api` a un script `typecheck` dédié, cf. mémoire projet `jdr-api-typecheck-gap` : `ts-jest` ne type-check pas cross-file en isolatedModules, **toujours** lancer `pnpm typecheck` après un changement de signature comme celui-ci).
  - `packages/game-rules` : `pnpm test` (workspace game-rules) — 0 régression.
  - Aucune modification frontend (`apps/web`) dans cette story — **incohérence transitoire assumée et documentée, pas à corriger ici** : après cette story, `character-sheet.html:295-303` (carte « Équipement » du gabarit principal, lecture de `sheetData['equipment']` castée en `{ group: string[] }`) affichera une liste vide pour tout personnage migré (la donnée a été déplacée dans `individual`) ; `character-wizard.ts:104` continuera de POSTer un `equipment.group` (ignoré par le nouveau type mais accepté sans erreur — `CreateCharacterDto.sheetData` est un `Record<string,unknown>` non typé à la frontière). Ces deux points sont résolus par la Story 14.2 (UI unifiée), qui doit suivre immédiatement — aucune migration Prisma de schéma, seul `sheetData: Json` est concerné (AD-1).

### Review Findings

- [x] [Review][Patch] `CreateContenantDto.weight` est facultatif (`@IsOptional()`) alors qu'AC3 exige un poids **obligatoire** pour un contenant, symétrique à `individual` — un `POST /characters/:id/contenants` avec `{ name: 'Sac' }` seul est accepté sans erreur, contrairement à l'AC [`apps/api/src/characters/dto/create-contenant.dto.ts`] — corrigé : `weight` rendu obligatoire (`@IsNumber() @Min(0) weight!: number;`), `character.service.ts#addContenant` simplifié en conséquence
- [x] [Review][Patch] Le critère d'idempotence de la migration ne vérifie que la présence de `contenants` (tableau), jamais `animaux` — un enregistrement avec `contenants: []` mais `animaux` manquant/corrompu serait à tort considéré comme déjà migré et ignoré [`apps/api/src/characters/migrate-equipment-unify.ts` — `migrateEquipmentUnify`] — corrigé : le critère vérifie désormais `Array.isArray(equipment.contenants) && Array.isArray(equipment.animaux)`

- [x] [Review][Patch — hors findings initiaux, découvert en vérifiant l'app réelle] **Build web cassé** : `character-wizard.ts`/`.html` référençaient encore `equipment.group` (type importé directement de `@master-jdr/game-rules` via `Partial<RyuutamaSheetData>`, pas seulement à la frontière API non typée comme supposé dans les Dev Notes de cette story) — `ng serve` échouait à générer un bundle, page blanche en usage réel signalée par l'utilisateur. Corrigé : les 9 anciens objets `FIXED_EQUIPMENT.group` sont désormais fusionnés dans `individual` (poids `0`), même sémantique que la migration backend ; `contenants`/`animaux` initialisés à `[]` ; affichage du wizard inchangé (`EquipmentStep` retombe sur ses propres valeurs par défaut, plus besoin de binding depuis `sheetData`) [`apps/web/src/app/features/characters/character-wizard/character-wizard.ts`, `.html`]
- [x] [Review][Defer] `CreateInventoryItemDto.weight` reste facultatif malgré AC2 (« poids obligatoire ») — comportement hérité de la Story 6.4, non introduit par cette story ; le changer serait une décision de compatibilité ascendante hors du scope explicite de cette story (DTOs déjà en production, personnages existants créés sans poids) [`apps/api/src/characters/dto/create-inventory-item.dto.ts`] — deferred, pre-existing
- [x] [Review][Defer] Envoyer `price: null`/`effect: null` sur `update*` (individual/contenant/animal) ne vide pas le champ (`dto.price ?? updated[index].price` conserve l'ancienne valeur si `null`) — aucun mécanisme pour effacer un prix/effet une fois posé, alors que rien dans les AC ne l'exige explicitement [`apps/api/src/characters/character.service.ts` — `updateInventoryItem`/`updateContenant`/`updateAnimal`] — deferred, non requis par les AC de cette story
- [x] [Review][Defer] La migration plante si `equipment.group` existe mais n'est pas un tableau (donnée legacy corrompue) — `(equipment.group ?? []).map(...)` suppose implicitement un tableau [`apps/api/src/characters/migrate-equipment-unify.ts`] — deferred, risque faible (aucune donnée de ce type observée dans ce projet hobby)
- [x] [Review][Defer] Aucun test ne vérifie qu'un `itemId` valide mais appartenant à une **autre** catégorie (ex. un id `animaux` passé à `updateContenant`) échoue pour la bonne raison — le comportement est déjà correct (`NotFoundException` via `findIndex` qui ne trouve rien), seule l'assertion explicite manque [`apps/api/src/characters/character.service.spec.ts`] — deferred, comportement déjà correct, gap de test mineur

## Dev Notes

### Architecture — décision contraignante AD-1 (`ARCHITECTURE-SPINE.md` du 2026-07-18)

- **AD-1 [ADOPTED]** : l'inventaire reste un champ JSON dans `Character.sheetData` (colonne `Json`, Prisma) — **aucune migration de schéma Prisma dans cette story**, seule la forme TypeScript (`RyuutamaSheetData.equipment`) et sa validation changent. Transformation des données existantes via **script ponctuel exécuté une fois au déploiement**, jamais en lazy-transform à la lecture (règle explicite de l'AD, motivée par le risque de deux formats coexistant indéfiniment si le transform n'a lieu qu'à la lecture).
- **AD-9 (héritée)** : aucun nouveau module NestJS — tout vit dans `CharacterModule` déjà existant.
- **P1-AD-2 (héritée)** : mutations exclusivement en couche Service — aucune écriture Prisma directe dans `characters.controller.ts`.
- Le seed TypeScript de la spine (`### Forme TypeScript étendue`) est **indicatif sur la forme des données** (catégories, prix/effet optionnels, poids obligatoire pour contenants/absent pour animaux) mais **pas normatif sur les noms d'identifiants** (`EquipmentItem` vs `InventoryItem`) ni sur la présence d'`id`/`addedBy` (absents du seed, mais requis par du code déjà en production, cf. Task 1) — déviation assumée et documentée, pas une lecture erronée du seed.

### Code existant à lire intégralement avant d'écrire le code

- **`packages/game-rules/src/ryuutama/types.ts`** (78 lignes) — `InventoryItem` (10-15), `RyuutamaSheetData.equipment` (24), cible de Task 1.
- **`packages/game-rules/src/ryuutama/validate.ts`** (72 lignes, fichier entier) — confirme l'absence de toute règle `equipment` (Task 2).
- **`apps/api/src/characters/character.service.ts`** (968+ lignes) — `normalizeInventoryIndividual`/`InventoryItemEntry` (77-89), `setByPath` (104-133, mécanisme générique de `setSheetField`, ne pas y toucher), `setSheetField` (706-812, bloc `equipment` 729-772 à étendre), `addInventoryItem`/`updateInventoryItem`/`removeInventoryItem`/`writeInventoryChange` (846-980, patron à répliquer pour `contenants`/`animaux`).
- **`apps/api/src/characters/characters.controller.ts`** (nom réel du fichier — **pas** `character.controller.ts`, singulier, qui n'existe pas) — routes `inventory-items` (216-247), garde de classe `@UseGuards(AuthenticatedGuard)` (50-52), patron `ParseUUIDPipe`/`@CurrentUser()` à répliquer (Task 5).
- **`apps/api/src/characters/dto/create-inventory-item.dto.ts`**, **`update-inventory-item.dto.ts`** — patron exact de décorateurs `class-validator` à étendre/dupliquer (Task 3).
- **`apps/api/src/characters/migrate-inventory-format.ts`** (51 lignes) **et** **`apps/api/prisma/migrate-inventory-format.ts`** (27 lignes) — patron à 2 fichiers **exact** à répliquer pour la nouvelle migration (Task 6) : logique pure testable côté `src/`, point d'entrée exécutable côté `prisma/`, script `pnpm migrate:*` dans `package.json`.
- **`apps/api/src/characters/migrate-inventory-format.spec.ts`** (137 lignes, fichier entier) — style de test à répliquer pour `migrate-equipment-unify.spec.ts` (Task 7) : `jest.mock('node:crypto', ...)` pour un `randomUUID` déterministe, client Prisma minimal mocké.
- **`apps/api/prisma/schema.prisma`** (modèle `Character`, ~272-297) — confirme `sheetData Json` sans validation de schéma, `updatedAt` = champ de verrou optimiste déjà utilisé partout (`updateMany({ where: { id, updatedAt } })`).
- **`apps/api/src/characters/equipment-pdf.service.ts`** et **`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts`** — **à NE PAS modifier** dans cette story (FR-9 = Story 14.3), mais à lire pour comprendre pourquoi leur type `EquipmentPdfInput` local (dupliqué, jamais importé de `RyuutamaSheetData`) continuera de fonctionner sans changement immédiat malgré la Task 1 (frontières de types indépendantes, cf. commentaire du fichier lignes 3-5).

### Frontend — hors scope explicite, mais impact à connaître

- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts`/`.html` ne lisent/écrivent **que** `equipment.individual` aujourd'hui — jamais `group`. Cette story n'y touche pas ; consommera transparemment les objets migrés dès que Story 14.2 sera livrée (les DTOs `price`/`effect` seront déjà là niveau API, pas encore affichés/éditables niveau UI).
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts:263-265` et `.html:295-303` (carte « Équipement » du gabarit principal, hors `InventoryTab`) et `apps/web/src/app/features/characters/character-wizard/character-wizard.ts:104` + `steps/equipment-step/` (assistant de création, `FIXED_EQUIPMENT.group` fixe à 9 entrées, jamais éditable par l'utilisateur) sont les 2 seuls consommateurs vivants de `equipment.group` — tous deux non touchés par cette story (Task 8 documente l'incohérence transitoire assumée).
- `packages/shared/src/index.ts` : `SheetData = Record<string, unknown>` (opaque à la frontière partagée) — aucune modification requise dans `packages/shared`, la forme concrète `RyuutamaSheetData` ne vit que dans `@master-jdr/game-rules`.

### Project Structure Notes

- Fichiers modifiés : `packages/game-rules/src/ryuutama/types.ts` (+ tests) ; `apps/api/src/characters/character.service.ts`, `characters.controller.ts`, `dto/create-inventory-item.dto.ts`, `dto/update-inventory-item.dto.ts` (+ tests).
- Nouveaux fichiers : `apps/api/src/characters/dto/create-contenant.dto.ts`, `update-contenant.dto.ts`, `create-animal.dto.ts`, `update-animal.dto.ts` ; `apps/api/src/characters/migrate-equipment-unify.ts` (+ `.spec.ts`) ; `apps/api/prisma/migrate-equipment-unify.ts`.
- Nouvelle entrée `package.json` (`apps/api`) : script `migrate:equipment-unify`.
- Aucune migration Prisma de schéma (AD-1), aucun nouveau module NestJS (AD-9), aucune modification `apps/web`/`packages/shared`.

### Testing Standards

- `apps/api` : Jest, `ts-jest`, fichiers `*.spec.ts` déjà en place — **piège mémorisé** : toute spec touchant transitivement `CharacterService`/`@master-jdr/game-rules` nécessite `jest.mock('@master-jdr/game-rules', ...)`, sinon erreur trompeuse `"Unexpected token export"` (ESM). `character.service.spec.ts` en dépend déjà — vérifier que le mock existant reste cohérent après l'ajout des 6 nouvelles méthodes.
- `apps/api` a un script `pnpm typecheck` dédié (contrairement à `apps/web`) — **toujours le lancer** après ce changement de signature de type partagé (`InventoryItem`/`RyuutamaSheetData.equipment`), `ts-jest` seul ne type-check pas cross-file (isolatedModules).
- `packages/game-rules` : Jest (workspace séparé) — `pnpm test` depuis `packages/game-rules` ou via le script racine.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 198-224 — Epic 14 / Story 14.1 complète, FR6/FR7/FR8)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-1, Structural Seed — modèle Prisma inchangé, forme TypeScript étendue)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.2 FR-6/FR-7/FR-8, §9 Assumptions Index — migration automatique au déploiement, sans action utilisateur)
- `apps/api/src/characters/migrate-inventory-format.ts` + `apps/api/prisma/migrate-inventory-format.ts` + `.spec.ts` (précédent direct, patron à répliquer intégralement pour Task 6)
- `_bmad-output/implementation-artifacts/deferred-work.md` (note historique, Story 6.7 : « fusion equipment.group/equipment.individual... » déjà identifiée comme item de backlog séparé — traitée maintenant par cette story)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Task 1 : type `InventoryItem` étendu (`price?`/`effect?`), `Contenant = InventoryItem`, `Animal = Omit<InventoryItem, 'weight'>`. `id`/`addedBy` conservés (déviation assumée du seed de la spine, documentée dans la story). `InventoryItem` non renommé en `EquipmentItem`.
- Task 2 : confirmé — `validate()` non modifié, test ajouté prouvant `valid: true` avec les 3 catégories sans `price`/`effect`.
- Task 3 : `CreateInventoryItemDto`/`UpdateInventoryItemDto` étendus (`price` maxLength 50, `effect` maxLength 300). 4 nouveaux DTOs `Create/UpdateContenantDto` (identiques à individual) et `Create/UpdateAnimalDto` (jamais de `weight`).
- Task 4 : `addContenant`/`updateContenant`/`removeContenant` et `addAnimal`/`updateAnimal`/`removeAnimal` ajoutés à `character.service.ts`, répliquant exactement le pattern `*InventoryItem`. `setSheetField` généralisé aux 3 catégories (`equipment.<individual|contenants|animaux>.<index>`), garde `delete value.weight` ajoutée pour `animaux`.
- Task 5 : 6 nouvelles routes dans `characters.controller.ts` (`POST/PATCH/DELETE :id/contenants[/:itemId]` et `:id/animaux[/:itemId]`), même patron que `inventory-items`. Garde `PATCH` de `updateInventoryItem` étendue à `price`/`effect`.
- Task 6 : `migrate-equipment-unify.ts` (logique pure, dupliquant volontairement `normalizeInventoryIndividual` plutôt que d'importer `character.service.ts` — **déviation documentée** : importer le service complet charge ses dépendances NestJS/argon2, incompatibles hors contexte d'application, échec Jest constaté à l'implémentation, cf. Piège ci-dessous) + point d'entrée `prisma/migrate-equipment-unify.ts` + script `migrate:equipment-unify`.
- Task 7 : `validate.spec.ts` (+1 test), `character.service.spec.ts` (fixtures adaptées, +17 tests contenants/animaux/setSheetField), `characters.controller.spec.ts` (+9 tests de délégation, non prévus explicitement par la story mais ajoutés pour couvrir le câblage des 6 nouvelles routes), `migrate-equipment-unify.spec.ts` (nouveau, 6 tests).
- **Découverte non anticipée par la story, corrigée pour préserver la compilation** (« le système doit rester fonctionnel de bout en bout ») : `packages/game-rules/src/ryuutama/pdf-field-map.ts` (mapping PDF de la fiche personnage **principale**, distinct de `equipment-pdf-field-map.ts` déjà identifié comme hors scope) lisait aussi `equipment.group` pour composer le champ texte « Notes » — non repéré lors de la recherche initiale (fichier non grep-é explicitement). Corrigé minimalement : `groupEquipment` retiré, `individualEquipment` seul alimente désormais « Notes » (les anciennes entrées `group`, une fois migrées dans `individual`, y apparaissent déjà — aucune perte fonctionnelle). 2 tests existants de `pdf-field-map.spec.ts` adaptés en conséquence.
- `apps/api/src/characters/equipment-pdf.service.ts` (explicitement hors scope FR-9/Story 14.3 mais cassé à la compilation par le nouveau type) : correctif minimal, `group: []` codé en dur en attendant le remapping complet de la Story 14.3 — aucune perte de données (les anciennes entrées group sont déjà comptées via `individual`).
- **Piège rencontré** : importer `normalizeInventoryIndividual` exporté depuis `character.service.ts` dans le script de migration faisait échouer Jest (`argon2` natif non chargeable hors contexte Nest, via la chaîne `character.service.ts → users.service.ts → argon2`). Résolu en dupliquant la petite fonction de normalisation directement dans `migrate-equipment-unify.ts` — cohérent avec le choix déjà fait par le précédent `migrate-inventory-format.ts` (Story 6.4), qui n'importe rien non plus de `character.service.ts`.
- Validation finale : 790/790 tests API (dont 161 pour `character.service.spec.ts`, 66 pour `characters.controller.spec.ts`, 6 pour la migration), `pnpm typecheck` API propre, 125/125 tests `game-rules`. Aucune régression. Aucune modification `apps/web`/`packages/shared` (incohérence transitoire assumée, résolue par la Story 14.2).

### File List

- `packages/game-rules/src/ryuutama/types.ts` (modifié — Task 1)
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (modifié — correctif de compilation non anticipé, cf. Completion Notes)
- `packages/game-rules/src/__tests__/validate.spec.ts` (modifié — Task 2, test)
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (modifié — 2 tests adaptés au nouveau type)
- `apps/api/src/characters/dto/create-inventory-item.dto.ts` (modifié — Task 3)
- `apps/api/src/characters/dto/update-inventory-item.dto.ts` (modifié — Task 3)
- `apps/api/src/characters/dto/create-contenant.dto.ts` (nouveau — Task 3)
- `apps/api/src/characters/dto/update-contenant.dto.ts` (nouveau — Task 3)
- `apps/api/src/characters/dto/create-animal.dto.ts` (nouveau — Task 3)
- `apps/api/src/characters/dto/update-animal.dto.ts` (nouveau — Task 3)
- `apps/api/src/characters/character.service.ts` (modifié — Task 4)
- `apps/api/src/characters/character.service.spec.ts` (modifié — Task 7)
- `apps/api/src/characters/characters.controller.ts` (modifié — Task 5)
- `apps/api/src/characters/characters.controller.spec.ts` (modifié — Task 7, tests de délégation)
- `apps/api/src/characters/equipment-pdf.service.ts` (modifié — correctif de compilation minimal, hors scope FR-9)
- `apps/api/src/characters/migrate-equipment-unify.ts` (nouveau — Task 6)
- `apps/api/src/characters/migrate-equipment-unify.spec.ts` (nouveau — Task 7)
- `apps/api/prisma/migrate-equipment-unify.ts` (nouveau — Task 6)
- `apps/api/package.json` (modifié — script `migrate:equipment-unify`)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié — revue de code, correctif build cassé)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (modifié — revue de code, correctif build cassé)

## Change Log

- 2026-07-18 : Implémentation complète (Tasks 1-8). Modèle d'inventaire unifié (`individual`/`contenants`/`animaux`), validation inchangée (décision documentée), 6 nouvelles routes REST, migration one-off `migrate-equipment-unify`. 2 fichiers PDF hors scope (FR-9/Story 14.3) corrigés a minima pour rester compilables (découverte non anticipée par la story). 790/790 tests API, 125/125 tests game-rules, typecheck propre, aucune régression. Aucune modification `apps/web` (Story 14.2 à suivre). Statut passé à review.
- 2026-07-18 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 violations d'AC confirmées et corrigées (poids `contenants` non obligatoire — AC3 ; idempotence migration incomplète, `animaux` non vérifié). 4 items différés (voir `deferred-work.md`). ~19 écartés. **Signalement utilisateur pendant la revue** : app web cassée en usage réel (page blanche, `NS_ERROR_NET_EMPTY_RESPONSE`) — root cause investiguée et corrigée : `character-wizard.ts` référençait encore `equipment.group` via `Partial<RyuutamaSheetData>` importé directement de `@master-jdr/game-rules`, cassant la compilation Angular (pas seulement une incohérence runtime différée comme supposé initialement dans les Dev Notes). Build web reconstruit avec succès après correctif. 790/790 tests API, 125/125 game-rules, 810/810 web, typecheck propre, aucune régression. Statut passé à done.
