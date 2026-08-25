---
baseline_commit: 59afec2ce82db0c11f4ba5175dc280de13177d80
---

# Story 25.1: Choix d'une arme précise rattachée à une catégorie

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want choisir une arme précise (dague, arbalète...) plutôt qu'une catégorie abstraite,
so that mon choix reflète vraiment les règles du livre — la catégorie continue de déterminer mes formules de combat.

## Contexte

Aujourd'hui, `RyuutamaSheetData.weaponCategoryId` stocke directement une **catégorie** (`arc`, `epee-courte`, `epee-longue`, `hache`, `lance`) — le joueur choisit une famille d'armes abstraite, jamais une arme précise. Le catalogue `weaponCategory` (`weapon-categories.json`, seedé Story 23.1) a pourtant déjà un champ `exampleWeapons` par catégorie (ex. `arc: ["Arbalètes", "Arcs courts", "Arcs de chasse"]`) — transcription exacte de `docs/categories-armes.md` (les listes « etc. » du livre). Cette story transforme ces exemples en un vrai catalogue d'armes sélectionnables individuellement (`weaponItem`), tout en préservant les formules de combat qui restent portées par la catégorie.

**Cette story est déjà entièrement spécifiée dans l'epic** (contrairement aux stories précédentes 23.7-23.9/24.1 qui avaient des décisions ouvertes) — les noms de fonction, de champ et la liste exacte des 4 consommateurs à mettre à jour sont donnés. Aucune décision de conception supplémentaire n'a été nécessaire pendant `create-story`.

## Acceptance Criteria

1. **Given** le catalogue `weapon-categories.json` existant (arc, épée courte, épée longue, hache, lance), enrichi d'une description par la Story 23.1, **when** ce palier est implémenté, **then** un nouveau `ContentType` `weaponItem` est seedé (`weapon-items.json`), chaque entrée portant `{ key, label, categoryId }` ; `WeaponStep` (entièrement réécrit ici) affiche la description de la catégorie résolue en plus de celle de l'arme précise choisie, et gagne une liste non-exhaustive d'armes types par catégorie.
2. **Given** `RyuutamaSheetData.weaponCategoryId`, **when** cette story est complétée, **then** ce champ est remplacé par `weaponId: string` (référence une entrée `weaponItem`) — la catégorie n'est plus jamais stockée directement.
3. **Given** un personnage avec un `weaponId` choisi, **when** ses formules de touche/dégâts/encombrement sont calculées, **then** elles sont dérivées à la lecture via `resolveWeaponCategory(weaponId, catalog)` (nouvelle fonction pure, `packages/game-rules`), jamais stockées en double.
4. **Given** les 4 consommateurs existants de `weaponCategoryId` (vérifiés brownfield), **when** cette story est complétée, **then** ils lisent tous `weaponId` : `pdf-field-map.ts` (`weaponPdfOption`), `character-sheet.ts` (affichage fiche), `GameSystemService.getSchema()` (clé d'étape), `character-wizard.ts` (`SUPPORTED_STEP_KEYS`/`FIELD_TO_STEP_KEY`).
5. **Given** `RyuutamaCatalog.validWeaponItems`, **when** `validate()` vérifie une fiche, **then** cette liste est une projection du catalogue `weaponItem` complet (`entries.map(e => e.key)`), jamais reconstruite séparément de la liste utilisée par `resolveWeaponCategory`.
6. **Given** aucune migration prévue pour les personnages existants (décision produit), **when** ce palier est déployé, **then** `seed-demo.ts` est mis à jour pour refléter le nouveau modèle — pas de script de migration one-off, reset de la base de dev attendu.
7. **Given** la sélection d'arme favorite en création de personnage, **when** le joueur atteint cette étape, **then** il choisit d'abord une **catégorie** parmi les 6 (Arc, Épée courte, Épée longue, Hache, Lance, Mains nues) puis, sauf pour Mains nues, une **arme précise** dans cette catégorie — la catégorie continue seule de déterminer les formules de combat. (Correction post-implémentation initiale : la V1 de `WeaponStep` proposait à tort une liste plate des 15 armes sans étape de catégorie — cf. Change Log.)
8. **Given** `docs/categories-armes.md` (catégorie « Mains nues », Toucher VIG+AGI, Dégâts VIG-2/VIG-1* pour une arme improvisée), **when** le catalogue `weaponCategory` est seedé, **then** une 6e catégorie `mains-nues` existe, avec un unique `weaponItem` `{ key: 'mains-nues', label: 'Mains nues', categoryId: 'mains-nues' }` auto-assigné dès que la catégorie est choisie (pas de choix d'arme précise pour cette catégorie).

## Tasks / Subtasks

- [x] Task 1 — Nouveau catalogue `weaponItem` (AC: #1)
  - [x] Créer `apps/api/game-systems/ryuutama/data/weapon-items.json` (gitignoré, comme tous les autres fichiers de contenu Ryuutama) — 15 entrées `{ key, label, categoryId }`, dérivées **sans invention** des `exampleWeapons` déjà seedés dans `weapon-categories.json` (eux-mêmes transcrits mot pour mot de `docs/categories-armes.md`, Story 23.1) :
    - `categoryId: "arc"` → `arbalete`/Arbalète, `arc-court`/Arc court, `arc-de-chasse`/Arc de chasse
    - `categoryId: "epee-courte"` → `dague`/Dague, `poignard`/Poignard, `wakizashi`/Wakizashi
    - `categoryId: "epee-longue"` → `epee-large`/Épée large, `katana`/Katana, `rapiere`/Rapière
    - `categoryId: "hache"` → `hache-de-bataille`/Hache de bataille, `hache-de-bucheron`/Hache de bûcheron
    - `categoryId: "lance"` → `epieu`/Épieu, `hallebarde`/Hallebarde, `lance`/Lance, `trident`/Trident
    - **Note de conception (à documenter, pas une invention de contenu) :** les libellés sont singularisés (« Dague » plutôt que le pluriel collectif « Dagues » de `exampleWeapons`) car chaque entrée nomme désormais l'arme précise **d'un seul personnage**, pas une catégorie d'objets — même transformation grammaticale mécanique que le reste de l'app (ex. singulier partout dans les champs narratifs), aucun nom n'est changé ou inventé.
    - La clé `weaponItem` `"lance"` coexiste sans collision avec la clé `weaponCategory` `"lance"` : ce sont deux `ContentType` différents (`content['weaponItem']` vs `content['weaponCategory']`), résolus indépendamment.
  - [x] `apps/api/src/game-systems/game-system.service.ts` : ajouter `{ key: 'weaponItem', label: 'Arme', file: 'weapon-items.json' }` à `CONTENT_TYPES`.
- [x] Task 2 — `packages/game-rules` : champ, catalogue, fonction de résolution (AC: #2, #3, #5)
  - [x] `packages/game-rules/src/ryuutama/types.ts` : `RyuutamaSheetData.weaponCategoryId: string` → `weaponId: string`. `RyuutamaCatalog.validWeapons: string[]` → `validWeaponItems: string[]` (renommage, pas un ajout — un seul champ, jamais les deux en même temps).
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/resolve-weapon-category.ts` (même convention que `compute-derived.ts`/`leveling.ts` — un fichier dédié par fonction pure) :
    ```ts
    export interface WeaponItemEntry { key: string; label: string; categoryId: string; }
    export interface WeaponCategoryEntry { key: string; label: string; touchFormula: string; damageFormula: string; }
    export interface WeaponResolutionCatalog {
      weaponItems: WeaponItemEntry[];
      weaponCategories: WeaponCategoryEntry[];
    }
    export interface ResolvedWeapon {
      weaponLabel: string;
      categoryId: string;
      categoryLabel: string;
      touchFormula: string;
      damageFormula: string;
    }
    export function resolveWeaponCategory(weaponId: string, catalog: WeaponResolutionCatalog): ResolvedWeapon | null {
      const item = catalog.weaponItems.find((w) => w.key === weaponId);
      if (!item) return null;
      const category = catalog.weaponCategories.find((c) => c.key === item.categoryId);
      if (!category) return null;
      return { weaponLabel: item.label, categoryId: category.key, categoryLabel: category.label, touchFormula: category.touchFormula, damageFormula: category.damageFormula };
    }
    ```
    **`WeaponResolutionCatalog` est un type distinct de `RyuutamaCatalog`** (pas une extension) : `RyuutamaCatalog` reste la projection minimale utilisée par `validate()` (juste des clés valides, cf. convention déjà établie pour `requiredChoicesByClass`/`validSeasons`) ; `WeaponResolutionCatalog` porte les données riches (labels, formules) nécessaires à la résolution d'affichage — deux besoins différents, ne pas les fusionner.
  - [x] Exporter `resolveWeaponCategory` et les 4 types depuis `packages/game-rules/src/index.ts` (même pattern que `computeDerived`/`RyuutamaCatalog`).
  - [x] `packages/game-rules/src/ryuutama/validate.ts`, Règle 4 : `data.weaponCategoryId`/`validWeapons` → `data.weaponId`/`catalog.validWeaponItems`. Message d'erreur adapté ("Arme invalide" plutôt que "Arme favorite invalide" — à ajuster si besoin, sens inchangé).
- [x] Task 3 — Backend : catalogue de validation et export PDF (AC: #4, #5)
  - [x] `apps/api/src/characters/character.service.ts` (`buildRyuutamaCatalog()`) : `validWeapons: keysOf('weaponCategory')` → `validWeaponItems: keysOf('weaponItem')`.
  - [x] `apps/api/src/characters/ryuutama-pdf.service.ts` : remplacer la résolution directe `content['weaponCategory']?.find(w => w.key === sheetData.weaponCategoryId)` par un appel à `resolveWeaponCategory(sheetData.weaponId, { weaponItems: content['weaponItem'] ?? [], weaponCategories: content['weaponCategory'] ?? [] })` (mapper chaque `ContentEntryDto` vers `{ key: entry.key, ...(entry.data as {...}) }` avant l'appel). `weaponLabel`/`weaponTouchFormula`/`weaponDamageFormula` du `RyuutamaPdfContent` construit viennent désormais de `ResolvedWeapon` (`weaponLabel`/`touchFormula`/`damageFormula`) ; ajouter un nouveau champ `weaponCategoryId: string` à `RyuutamaPdfContent` (= `ResolvedWeapon.categoryId`), résolu une fois ici et transmis tel quel.
  - [x] `packages/game-rules/src/ryuutama/pdf-field-map.ts` : `weaponPdfOption(data.weaponCategoryId)` → `weaponPdfOption(content.weaponCategoryId)` (la fonction `weaponPdfOption` elle-même, son mapping `WEAPON_PDF_OPTION`, et son repli `console.warn` restent inchangés — seule la source de la donnée change, la table de correspondance catégorie→libellé PDF n'a pas besoin d'évoluer).
- [x] Task 4 — Frontend : `WeaponStep` réécrit (AC: #1, #3)
  - [x] Remplacer l'input `weapons: input.required<ContentEntryDto[]>()` (liste de catégories) par `weaponItems: input.required<ContentEntryDto[]>()` et `weaponCategories: input.required<ContentEntryDto[]>()` (les deux catalogues nécessaires à la résolution).
  - [x] Nouvel output `weaponIdChange: output<string>()` (remplace `weaponCategoryIdChange`).
  - [x] UI : liste plate de `ChoiceCard` (réutiliser `ChoiceCard`/`RadioGroupNavDirective`, même pattern que `ClassStep`/`TypeStep`/`MagicStep`) — une carte par arme précise (15 au total), `label` = nom de l'arme, `detail` = libellé de catégorie + formules résolues via `resolveWeaponCategory(item.key, { weaponItems, weaponCategories })` (importé depuis `@master-jdr/game-rules`, pas réimplémenté localement).
  - [x] Sous la sélection : afficher la description complète de la catégorie résolue (`weaponCategory.description`, déjà seedée Story 23.1) en plus du nom de l'arme précise choisie (AC1 — "affiche la description de la catégorie résolue en plus de celle de l'arme précise choisie").
- [x] Task 5 — Câbler `character-wizard.ts`/`.html` (AC: #4)
  - [x] Renommer le computed `weapons` en deux computeds : `weaponItems = computed(() => this.content()?.['weaponItem'] ?? [])` et `weaponCategories = computed(() => this.content()?.['weaponCategory'] ?? [])`.
  - [x] `SUPPORTED_STEP_KEYS` : `'weaponCategoryId'` → `'weaponId'`.
  - [x] `FIELD_TO_STEP_KEY` : `weaponCategoryId: 'weaponCategoryId'` → `weaponId: 'weaponId'`.
  - [x] `canGoNext()` : `case 'weaponCategoryId': return !!data.weaponCategoryId;` → `case 'weaponId': return !!data.weaponId;`.
  - [x] `character-wizard.html` : `@case ('weaponCategoryId')` → `@case ('weaponId')` ; `<app-weapon-step [weaponItems]="weaponItems()" [weaponCategories]="weaponCategories()" [weaponId]="sheetData().weaponId" (weaponIdChange)="updateSheetData({ weaponId: $event })" />`.
  - [x] `apps/api/src/game-systems/game-system.service.ts::getSchema()` : `sheetSchema.weaponCategoryId` → `sheetSchema.weaponId` ; `creationSteps` : `{ key: 'weaponCategoryId', label: 'Arme favorite' }` → `{ key: 'weaponId', label: 'Arme favorite' }` (le libellé affiché ne change pas, seule la clé technique).
- [x] Task 6 — Câbler `CharacterSheet` (AC: #4)
  - [x] `weaponData` computed : résoudre via `resolveWeaponCategory(sheetData()['weaponId'], { weaponItems, weaponCategories })` (mêmes catalogues que Task 3/4) plutôt que `findContentEntry` direct sur `weaponCategory`.
  - [x] `weaponOptions` (combobox MJ `FieldEditPencil`) : lister les entrées `weaponItem` (15 armes précises) plutôt que les 5 catégories.
  - [x] `character-sheet.html` : `weapon.label` → `weapon.weaponLabel` (nouvelle forme `ResolvedWeapon`), `submitFieldEdit('weaponCategoryId', $event)` → `submitFieldEdit('weaponId', $event)`, `sheetData()['weaponCategoryId']` → `sheetData()['weaponId']`.
- [x] Task 7 — `seed-demo.ts` (AC: #6)
  - [x] Interface locale `RyuutamaSheetData.weaponCategoryId` → `weaponId`, `makeSheetData(..., weaponCategoryId, ...)` → `makeSheetData(..., weaponId, ...)`.
  - [x] Chaque appel `makeSheetData(...)` existant (8 appels) : remplacer la clé de catégorie (`'arc'`, `'epee-courte'`, `'epee-longue'`) par une clé `weaponId` précise et cohérente de la même catégorie (ex. `'arc'` → `'arc-de-chasse'`, `'epee-courte'` → `'dague'`, `'epee-longue'` → `'epee-large'`) — pas de migration one-off, reset de la base de dev attendu (AC6).
- [x] Task 8 — Tests et suite complète (AC: #1-#6)
  - [x] `validate.spec.ts` : Règle 4 adaptée à `weaponId`/`validWeaponItems` (renommage des tests existants, pas de nouvelle règle).
  - [x] Nouveau `resolve-weapon-category.spec.ts` (`packages/game-rules/src/__tests__/`) : résolution réussie (arme + catégorie trouvées), `weaponId` inconnu → `null`, `categoryId` de l'item ne correspondant à aucune catégorie du catalogue → `null` (cas défensif, contenu incohérent).
  - [x] `pdf-field-map.spec.ts` : test "mappe chacune des 5 armes vers son option PDF exacte" adapté — `content.weaponCategoryId` fait désormais varier la valeur (au lieu de `data.weaponCategoryId`), `data.weaponId` peut rester une valeur fixe quelconque (le mapping ne lit plus `data.weaponCategoryId`).
  - [x] `ryuutama-pdf.service.spec.ts` : vérifier l'appel à `resolveWeaponCategory` avec les bons catalogues construits depuis `content['weaponItem']`/`content['weaponCategory']`.
  - [x] `weapon-step.spec.ts` : réécriture complète cohérente avec le nouveau composant (15 cartes, détail résolu par catégorie, sélection émet `weaponIdChange`).
  - [x] `character-wizard.spec.ts` : renommage des références `weaponCategoryId`/`weapons()` → `weaponId`/`weaponItems()`+`weaponCategories()`, `canGoNext()` sur la nouvelle clé d'étape `weaponId`.
  - [x] `character-sheet.spec.ts` : `weaponData()` résolu via le nouveau modèle (nom d'arme précis affiché, pas seulement la catégorie), combobox MJ sur `weaponId`.
  - [x] Suite complète (`docker compose exec api pnpm test`, `docker compose exec web pnpm test`, `packages/game-rules` dédié) — baseline actuelle (post-revue Story 24.1) : 899/899 API, 986/986 web, 153/153 game-rules, aucune régression attendue au-delà des renommages de tests explicitement listés ci-dessus.
  - [x] `docker compose exec api pnpm typecheck` propre.
- [x] Task 9 — Correction post-implémentation : sélection en 2 étapes + catégorie Mains nues (AC: #7, #8)
  - [x] `weapon-categories.json` : 6e catégorie `mains-nues` ajoutée (`touchFormula: "VIG+AGI"`, `damageFormula: "VIG-2"`, `price: 0`, `encumbrance: 0`, `hands: 2`, description mentionnant l'exception "arme improvisée" du livre sans l'implémenter comme un choix séparé).
  - [x] `weapon-items.json` : 16e entrée `{ key: 'mains-nues', label: 'Mains nues', categoryId: 'mains-nues' }`.
  - [x] `WeaponStep` réécrit une seconde fois : étape 1 (`categoryOptions`, 6 `ChoiceCard`) → étape 2 (`itemOptions`, filtrée par `categoryId` de la catégorie choisie, masquée pour `mains-nues`). Choisir `mains-nues` auto-émet son unique `weaponItem` (pas d'étape 2). Changer de catégorie après avoir déjà choisi une arme précise réinitialise le choix (`weaponIdChange.emit(null)`) — la sortie devient `output<string | null>()`.
  - [x] `character-wizard.ts`/`.html` : nouvelle méthode `onWeaponIdChange(weaponId: string | null)` (même pattern que `onAttributesChange`) remplace le binding direct `updateSheetData({ weaponId: $event })` — nécessaire pour effacer proprement `weaponId` du `sheetData` quand `WeaponStep` émet `null`.
  - [x] `weapon-step.spec.ts` : réécriture complète (6 tests) — étape 1 affiche description + étape 2 filtrée, sélection d'arme précise émet `weaponIdChange`, Mains nues saute l'étape 2 et auto-assigne, changement de catégorie émet `null`, resynchronisation de la catégorie depuis `weaponId` au retour en arrière, aucune catégorie sélectionnée → aucun détail.
  - [x] Suite complète re-vérifiée verte : 899/899 API, 990/990 web (+2 vs baseline précédente), 156/156 game-rules. Typecheck API propre.

## Dev Notes

- **Cette story est la première de l'Epic 25 (Refonte du choix d'arme) à être entièrement spécifiée dans l'epic** — noms de fonction/fichier/champ déjà actés, aucune question ouverte à trancher avec l'utilisateur pendant `create-story` (contrairement à 23.7/23.8/23.9/24.1). Suivre les Tasks au pied de la lettre plutôt que réinterpréter.
- **`resolveWeaponCategory` prend un catalogue dédié (`WeaponResolutionCatalog`), PAS `RyuutamaCatalog`** — ne pas confondre les deux. `RyuutamaCatalog.validWeaponItems` (Task 2/5) reste une simple liste de clés pour `validate()` (cohérent avec `validClasses`/`validSeasons`/`requiredChoicesByClass` — convention établie tout au long de l'Epic 23/24 : projection minimale, jamais le contenu riche). `WeaponResolutionCatalog` est un type séparé, construit à la demande par chaque consommateur (`ryuutama-pdf.service.ts`, `character-sheet.ts`, `WeaponStep`) depuis les `ContentEntryDto[]` bruts qu'il a déjà sous la main — pas de nouvelle abstraction partagée pour cette construction (2-3 lignes de `.map()` à chaque site d'appel, pas assez pour justifier un helper).
- **Les 15 armes précises viennent intégralement de `exampleWeapons` déjà seedé (Story 23.1), lui-même transcrit de `docs/categories-armes.md`** — ne pas en ajouter ni en retirer. La seule décision de cette story (documentée, pas une invention de contenu) est la **singularisation** des libellés (« Dague » plutôt que « Dagues ») puisqu'une entrée `weaponItem` nomme l'arme d'**un** personnage, pas une catégorie d'objets.
- **`exampleWeapons` sur `weapon-categories.json` n'est PAS retiré par cette story** — il devient partiellement redondant avec `weaponItem` (même information, portée différemment), mais son retrait n'est demandé par aucune AC — scope creep à éviter, à reconsidérer dans une story ultérieure si besoin.
- **`content.weaponCategoryId` (nouveau champ sur `RyuutamaPdfContent`, Task 3) est résolu UNE FOIS dans `ryuutama-pdf.service.ts`** via `resolveWeaponCategory(...).categoryId` — `pdf-field-map.ts` ne doit jamais recevoir `weaponId` ni re-résoudre quoi que ce soit lui-même ; il reste une fonction de formatage pur, cohérent avec son rôle actuel (`weaponLabel`/`weaponTouchFormula`/`weaponDamageFormula` sont déjà pré-résolus de la même façon aujourd'hui).
- **`WEAPON_PDF_OPTION` (mapping catégorie → libellé PDF, `pdf-field-map.ts`) reste indexé par `categoryId`, inchangé** — seule sa source d'alimentation change (`content.weaponCategoryId` au lieu de `data.weaponCategoryId`), pas ses clés ni ses valeurs.
- **Aucune migration pour les personnages existants (AC6, décision produit déjà actée)** — un personnage créé avant cette story avec `sheetData.weaponCategoryId: "arc"` aura un `weaponId` absent après ce palier ; `resolveWeaponCategory(undefined, ...)` retournera `null` (aucune arme trouvée), dégradation cohérente avec le reste de la fiche (`weaponData()` actuel retourne déjà `null` si la clé ne résout à rien). Le seed de dev est reset (`prisma migrate reset` + `seed:demo`), pas de script one-off à écrire.
- **`RyuutamaSheetData.weaponId` reste `string` obligatoire** (pas optionnel), même contrat que l'actuel `weaponCategoryId` — Règle 4 de `validate()` continue de le rejeter si absent/invalide.

### Project Structure Notes

- Données : `apps/api/game-systems/ryuutama/data/weapon-items.json` (nouveau, gitignoré), `weapon-categories.json` (inchangé).
- `packages/game-rules/src/ryuutama/types.ts` (`RyuutamaSheetData.weaponId`, `RyuutamaCatalog.validWeaponItems`), nouveau `resolve-weapon-category.ts`, `validate.ts` (Règle 4 adaptée), `pdf-field-map.ts` (`weaponPdfOption` source changée), `index.ts` (nouveaux exports).
- Backend : `apps/api/src/game-systems/game-system.service.ts` (`CONTENT_TYPES`, `getSchema()`), `apps/api/src/characters/character.service.ts` (`buildRyuutamaCatalog()`), `apps/api/src/characters/ryuutama-pdf.service.ts` (résolution `RyuutamaPdfContent`), `apps/api/prisma/seed-demo.ts`.
- Frontend : `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/{weapon-step.ts,.html,.scss,.spec.ts}` (réécriture), `character-wizard.ts`/`.html`, `character-sheet.ts`/`.html`.
- Aucune migration Prisma (tout vit dans `sheetData: Json`).

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 25.1] — Acceptance Criteria d'origine, déjà techniquement précis (noms de fonction/fichier actés)
- [Source: docs/categories-armes.md] — texte réel des 5 catégories et de leurs armes types (« etc. »), déjà transcrit dans `exampleWeapons` (Story 23.1)
- [Source: apps/api/game-systems/ryuutama/data/weapon-categories.json] — catalogue actuel (5 catégories, `exampleWeapons`/`touchFormula`/`damageFormula`/`price`/`encumbrance`/`hands`/`description`)
- [Source: apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.ts,.html] — composant actuel à réécrire entièrement (pattern `ChoiceCard`/`RadioGroupNavDirective` à conserver)
- [Source: apps/api/src/characters/ryuutama-pdf.service.ts:396-438] — résolution actuelle `weaponEntry`/`weaponData` (par catégorie) à remplacer par `resolveWeaponCategory`
- [Source: packages/game-rules/src/ryuutama/pdf-field-map.ts:8-26,171-184] — `WEAPON_PDF_OPTION`/`weaponPdfOption()`, source à changer (`content.weaponCategoryId` au lieu de `data.weaponCategoryId`), le mapping lui-même inchangé
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:110-114,213-219,244-249] — `WeaponData`/`weaponData`/`weaponOptions` actuels à adapter
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts:38-47,80-81,219-221,264-265] — `SUPPORTED_STEP_KEYS`/`FIELD_TO_STEP_KEY`/`weapons` computed/`canGoNext()` à renommer
- [Source: apps/api/src/game-systems/game-system.service.ts:62-98,230-254] — `CONTENT_TYPES` (nouvelle entrée `weaponItem`), `getSchema()` (`sheetSchema`/`creationSteps`)
- [Source: apps/api/src/characters/character.service.ts:214-258] — `buildRyuutamaCatalog()`, pattern `keysOf()` déjà établi pour les autres catalogues de validation
- [Source: apps/api/prisma/seed-demo.ts:13-99,162-479] — 8 appels `makeSheetData(...)` avec une clé de catégorie à remplacer par une clé `weaponId` précise
- [Source: _bmad-output/implementation-artifacts/24-1-trois-profils-dattributs-disponibles.md] — story précédente, pattern de revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) à anticiper : tester explicitement les renommages de champs dans tous les consommateurs listés, pas seulement une partie

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api pnpm typecheck` → clean (`tsc --noEmit -p tsconfig.build.json`)
- `docker compose exec api pnpm test` → 45 suites, 899/899 passed
- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` → 10 suites, 156/156 passed (baseline 153 + 3 new `resolve-weapon-category.spec.ts` tests)
- `docker compose exec web pnpm test` → 73 suites, 988/988 passed (baseline 986 + 2 net new from weapon-step/character-sheet spec additions)
- Post-correction (Task 9, sélection 2 étapes + Mains nues) : `docker compose exec web pnpm test` → 990/990 passed ; `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` → 156/156 passed ; `docker compose exec api pnpm test` → 899/899 passed ; `docker compose exec api pnpm typecheck` → clean
- Post-revue de code (3 patches appliqués) : `docker compose exec api pnpm typecheck` → clean ; `docker compose exec api pnpm test` → 900/900 passed (+1 nouveau test de câblage PDF) ; `docker compose exec web pnpm test` → 990/990 passed ; `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` → 156/156 passed

### Completion Notes List

- Nouveau `ContentType` `weaponItem` (15 armes précises, dérivées sans invention des `exampleWeapons` déjà seedés en Story 23.1 — seule liberté prise : singularisation des libellés, documentée).
- `resolveWeaponCategory()` ajouté à `packages/game-rules` avec un type dédié `WeaponResolutionCatalog`, volontairement distinct de `RyuutamaCatalog` (qui reste la simple projection de clés utilisée par `validate()`), pour préserver la convention établie aux Epics 23/24.
- Les 4 consommateurs de l'ancien `weaponCategoryId` (PDF, fiche, schéma, wizard) migrés vers `weaponId` + résolution à la lecture ; aucune donnée dupliquée stockée.
- `seed-demo.ts` mis à jour (8 personnages) vers des `weaponId` précis et cohérents avec leur catégorie d'origine — aucune migration one-off écrite, conformément à la décision produit (AC6).
- Suite complète verte sans régression au-delà des renommages de tests explicitement prévus par la story (Task 8).
- **Correction post-implémentation (Task 9)** : la V1 de `WeaponStep` proposait à tort une liste plate des 15 armes précises, sans étape de choix de catégorie — contraire à l'intention réelle (choisir la catégorie d'abord, comme le livre, puis l'arme précise dans cette catégorie). Réécrit en composant à 2 étapes. Ajout au passage de la 6e catégorie « Mains nues » (`docs/categories-armes.md`), absente du catalogue initial malgré sa présence dans le livre — modélisée comme un `weaponItem` unique auto-assigné (décision utilisateur), pas de cas particulier dans `resolveWeaponCategory`/`validate()`.

### File List

- `apps/api/game-systems/ryuutama/data/weapon-items.json` (nouveau, +1 entrée `mains-nues` en Task 9)
- `apps/api/game-systems/ryuutama/data/weapon-categories.json` (+1 catégorie `mains-nues`, Task 9 ; description simplifiée en revue de code)
- `apps/api/src/game-systems/game-system.service.ts`
- `packages/game-rules/src/ryuutama/types.ts`
- `packages/game-rules/src/ryuutama/resolve-weapon-category.ts` (nouveau ; +`WeaponItemContentData`/`WeaponCategoryContentData` en revue de code)
- `packages/game-rules/src/ryuutama/validate.ts`
- `packages/game-rules/src/ryuutama/pdf-field-map.ts`
- `packages/game-rules/src/index.ts`
- `packages/game-rules/src/__tests__/resolve-weapon-category.spec.ts` (nouveau)
- `packages/game-rules/src/__tests__/compute-derived.spec.ts`
- `packages/game-rules/src/__tests__/validate.spec.ts`
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts`
- `apps/api/src/characters/character.service.ts`
- `apps/api/src/characters/character.service.spec.ts`
- `apps/api/src/characters/ryuutama-pdf.service.ts`
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts`
- `apps/api/prisma/seed-demo.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.html`
- `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.scss`
- `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.spec.ts`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`

## Change Log

- 2026-07-27 — Implémentation complète de la refonte du choix d'arme (weaponItem + resolveWeaponCategory) — Story passée en `review`.
- 2026-07-27 — Correction post-implémentation (Task 9, AC7/AC8) : l'utilisateur signale que `WeaponStep` aurait dû proposer une sélection en 2 étapes (catégorie d'abord, puis arme précise dans cette catégorie), pas une liste plate des 15 armes. Ajout de la 6e catégorie « Mains nues » (absente du seed initial malgré sa présence dans `docs/categories-armes.md`), modélisée comme `weaponItem` unique auto-assigné. `WeaponStep` réécrit, suite complète re-vérifiée verte.
- 2026-07-27 — Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) : 1 decision (export PDF Mains nues, laissé tel quel), 3 patches appliqués (description Mains nues simplifiée, test de câblage PDF ajouté, types `WeaponItemContentData`/`WeaponCategoryContentData` factorisés), 2 items différés, ~13 dismissed comme bruit. Suite complète re-vérifiée verte : 900/900 API, 990/990 web, 156/156 game-rules. Story passée en `done`.

### Review Findings

- [x] [Review][Decision] Export PDF sans option pour « Mains nues » — **résolu, laissé tel quel** : `WEAPON_PDF_OPTION` (`packages/game-rules/src/ryuutama/pdf-field-map.ts:8-14`) ne référence que les 5 catégories originales ; un personnage ayant choisi Mains nues déclenche `weaponPdfOption()` → `console.warn` + champ "Arme Fav" vide dans le PDF exporté. Décision utilisateur : comportement accepté tel quel, fidèle à la limite physique du template PDF officiel (aucune case "Mains nues" n'existe sur le vrai PDF) — aucun changement de code.
- [x] [Review][Patch] Description « Mains nues » promet une mécanique non implémentée [apps/api/game-systems/ryuutama/data/weapon-categories.json:60] — **corrigé** : la mention "(Dégâts VIG-1 au lieu de VIG-2 pour une arme improvisée.)" retirée (aucun code n'a jamais calculé VIG-1, pas d'item "arme improvisée" distinct de "Mains nues" dans le modèle de données).
- [x] [Review][Patch] `ryuutama-pdf.service.spec.ts` ne vérifiait jamais le câblage `resolveWeaponCategory` → `RyuutamaPdfContent` — **corrigé** : nouveau test asserte `mapToPdfFields` appelé avec `weaponLabel`/`weaponTouchFormula`/`weaponDamageFormula`/`weaponCategoryId` correctement dérivés (`arc-de-chasse` → `Arc de chasse`/`AGI+INT-2`/`AGI`/`arc`).
- [x] [Review][Patch] Interfaces `WeaponItemData`/`WeaponCategoryData` redéclarées à l'identique dans 3 fichiers — **corrigé** : nouveaux types partagés `WeaponItemContentData`/`WeaponCategoryContentData` exportés depuis `packages/game-rules/src/ryuutama/resolve-weapon-category.ts` (dérivés via `Omit<..., 'key'>` de `WeaponItemEntry`/`WeaponCategoryEntry`), réutilisés dans `character-sheet.ts`, `weapon-step.ts` (étendu avec `description`) et `ryuutama-pdf.service.ts` — les 3 interfaces locales dupliquées supprimées.
- [x] [Review][Defer] Effet de resynchronisation `hasSyncedFromInput` peut manquer un `weaponId` arrivant après le catalogue [apps/web/.../weapon-step.ts:90-107] — deferred, pre-existing (reproduit fidèlement le pattern déjà établi par `AttributesStep`, Story 24.1 ; risque théorique, le catalogue et le personnage se chargent ensemble en pratique dans ce wizard).
- [x] [Review][Defer] `NO_ITEM_CHOICE_CATEGORY = 'mains-nues'` est une constante en dur, pas dérivée des données [apps/web/.../weapon-step.ts] — deferred, pre-existing design choice (confirmé explicitement par l'utilisateur via AskUserQuestion : "weaponItem unique auto-sélectionné"). À généraliser si une 2e catégorie sans arme précise apparaît un jour.

Dismissed as noise (~13) : absence de migration pour les personnages existants (décision produit déjà actée, AC6) ; `resolveWeaponCategory` silencieux sur `weaponId` inconnu vs `categoryId` orphelin (cohérent avec les autres fonctions pures de `game-rules`, aucune n'a d'effet de bord) ; fichiers de données gitignorés dépendant d'une cohérence manuelle (pattern préexistant depuis la Story 23.1) ; `WeaponResolutionCatalog`/`RyuutamaCatalog` sans builder partagé (décision déjà actée dans les Dev Notes de cette story) ; `canGoNext()`/`setSheetField` sans vérification d'appartenance au catalogue pour `weaponId` (cohérent avec tous les autres champs de l'assistant, non spécifique à cette story) ; incohérence d'indentation mineure dans `validate.spec.ts` (cosmétique) ; absence de test croisé entre `seed-demo.ts` et le catalogue (effort disproportionné pour un script de seed de dev) ; et ~6 autres observations de style/robustesse théorique sans scénario réel identifié.
