---
baseline_commit: 976199ec5ecac9805b5e27065abf217f5b4d574b
---

# Story 14.3: Export PDF équipement aligné sur le modèle enrichi

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que mon export PDF équipement affiche mes prix, effets, contenants et animaux,
so that ma fiche imprimée reflète fidèlement mon inventaire complet.

## Acceptance Criteria

1. **Given** un objet d'inventaire général (`equipment.individual`) avec un prix et un effet renseignés **When** j'exporte le PDF équipement **Then** ces valeurs apparaissent dans les colonnes `Prix`/`Effets` du template — jusqu'ici toujours laissées vides.
2. **Given** des contenants et des animaux renseignés sur ma fiche **When** j'exporte le PDF **Then** ils apparaissent dans leurs blocs dédiés du template (`ContenantRow*`/`AnimalRow*`), dans la limite physique de **3 lignes chacun** — au-delà, troncature silencieuse, même convention que les 21 objets généraux (Story 11.1).
3. **Given** un personnage avec jusqu'à 21 objets généraux déjà mappés (Blocs A/B du template) **When** j'exporte après cette évolution **Then** aucune régression sur ce mapping déjà en production (`Objet`/`Enc` inchangés, `Prix` désormais rempli sur les 21 emplacements, `Effets` uniquement sur les 5 premiers — limite physique déjà existante du template, pas une régression).

## Tasks / Subtasks

- [x] **Task 1 — `packages/game-rules` : `equipment-pdf-field-map.ts` réécrit pour le modèle enrichi (AC1, AC2, AC3)**
  - Fichier : `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (103 lignes actuelles, lu intégralement).
  - **Noms de champs AcroForm vérifiés directement via `pdf-lib` sur le vrai template** (94 champs, tous `PDFTextField` — ne jamais deviner, cf. convention Story 11.1 Task 0) :
    - **Bloc Contenant (3 emplacements)** : `['ContenantRow1', 'PrixRow1_4', 'EncRow1_4', 'EffetsRow1_2']`, `['ContenantRow2', 'PrixRow2_4', 'EncRow2_4', 'EffetsRow2_2']`, `['ContenantRow3', 'PrixRow3_4', 'EncRow3_4', 'EffetsRow3_2']` — chaque emplacement a ses 4 champs (Objet/Prix/Enc/Effets), contrairement aux objets généraux où seuls les 5 premiers ont un champ Effets.
    - **Bloc Animal (3 emplacements)** : `['AnimalRow1', 'PrixRow1_5', 'EffetsRow1_3']`, `['AnimalRow2', 'PrixRow2_5', 'EffetsRow2_3']`, `['AnimalRow3', 'PrixRow3_5', 'EffetsRow3_3']` — **aucun champ `Enc*` pour ce bloc dans le template lui-même** (confirme structurellement FR8 : le gabarit PDF officiel n'a jamais eu de colonne encombrement pour les animaux).
    - **`OBJECT_SLOTS` (21 emplacements, inchangé)** : **chacun des 21 a bien un champ `Prix*` propre** (`PrixRow1`...`PrixRow8_2`) — la limitation actuelle qui les laisse tous vides n'est **pas** une contrainte du template, juste l'ancien code qui ne les remplissait pas encore. Seuls les 5 premiers (`EffetsRow1`-`EffetsRow5`, déjà dans `EFFETS_FIELDS`) ont un champ Effets — **ne pas étendre `EFFETS_FIELDS` au-delà de 5**, le template n'a physiquement pas plus de champs Effets pour cette catégorie.
    - Champ `Po` (monnaie) : **reste vide**, aucune donnée de monnaie totale dans le modèle (hors scope explicite PRD §4.2).
  - `EquipmentPdfInput` (lignes 6-14 actuelles) : remplacer `group: string[]` par `contenants`/`animaux`, aligné sur `RyuutamaSheetData.equipment` (Story 14.1/14.2) — **reste un type local dupliqué**, jamais un import direct de `RyuutamaSheetData` (convention déjà en place, commentaire lignes 3-5 à conserver) :
    ```typescript
    export interface EquipmentPdfInput {
      ownerPseudo: string;
      characterName: string;
      encombrementLimit: number;
      equipment: {
        individual: { name: string; weight: number; price?: string; effect?: string }[];
        contenants: { name: string; weight: number; price?: string; effect?: string }[];
        animaux: { name: string; price?: string; effect?: string }[];
      };
    }
    ```
  - `mapEquipmentToPdfFields()` (lignes 72-102 actuelles) réécrite :
    - `encombrement` = somme des poids de `individual` **ET** `contenants` (jamais `animaux`, qui n'ont pas de poids) — même règle que `InventoryTab.totalWeight()` côté web (Story 14.2), à documenter explicitement dans le commentaire de la fonction (l'ancien commentaire « group n'a pas de poids » devient obsolète, `group` n'existe plus).
    - Boucle `OBJECT_SLOTS` (21 emplacements) : `Objet`/`Enc` inchangés ; **`Prix` rempli** depuis `item?.price ?? ''` pour les 21 (au lieu de `''` codé en dur) ; `Effets` (5 premiers uniquement, boucle `EFFETS_FIELDS` existante) rempli depuis `items[i]?.effect ?? ''`.
    - Nouvelle boucle **Contenants** (3 emplacements) : `Objet`=name, `Prix`=price??'', `Enc`=weight, `Effets`=effect??'' — au-delà de 3 contenants, troncature silencieuse (même principe que `OBJECT_SLOTS`).
    - Nouvelle boucle **Animaux** (3 emplacements) : `Objet`=name, `Prix`=price??'', `Effets`=effect??'' — **jamais de champ Enc** (absent du template pour ce bloc, cohérent avec l'absence structurelle de `weight` sur le type `Animal`, Story 14.1) — au-delà de 3 animaux, troncature silencieuse.
    - `Po` : ne jamais pousser ce champ dans le résultat (comportement déjà correct, à préserver — test existant `Po/blocs Contenant et Animal ne sont jamais présents` devra être adapté puisque Contenant/Animal seront désormais bien présents quand des données existent, mais `Po` doit rester absent).

- [x] **Task 2 — `apps/api` : `equipment-pdf.service.ts` — construction du nouvel `EquipmentPdfInput` (AC1, AC2, AC3)**
  - Fichier : `apps/api/src/characters/equipment-pdf.service.ts` (75 lignes actuelles).
  - Retirer le correctif temporaire de la Story 14.1 (`group: []` codé en dur, lignes 31-35 actuelles avec son commentaire "hors scope FR-9, Story 14.3" — cette story EST ce hors-scope, à traiter maintenant).
  - Construire `equipment.individual`/`contenants`/`animaux` directement depuis `sheetData.equipment.{individual,contenants,animaux} ?? []`, en projetant chaque item sur `{ name, weight?, price, effect }` (pour `individual`/`contenants`) ou `{ name, price, effect }` (pour `animaux`, jamais de `weight`) — même style de projection que l'actuel `individual: (sheetData.equipment?.individual ?? []).map((i) => ({ name: i.name, weight: i.weight }))`, étendu avec `price: i.price, effect: i.effect`.

- [x] **Task 3 — Tests**
  - `packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts` (120 lignes actuelles, lu intégralement, `makeInput()` à mettre à jour vers `{ individual: [], contenants: [], animaux: [] }`) :
    - Adapter les tests existants qui utilisaient `group` (ex. « group rempli après individual », lignes 63-78) — supprimer ou reformuler selon la nouvelle forme (`group` n'existe plus, ne pas laisser un test invérifiable).
    - Nouveau test : objet `individual` avec `price`/`effect` → `PrixRowN`/`EffetsRowN` (pour N ≤ 5) remplis ; objet en position 6-21 avec `price` → `PrixRowX` rempli mais aucun champ Effets disponible pour cette position (ne pas chercher à en tester un qui n'existe pas).
    - Nouveau test : jusqu'à 3 contenants → `ContenantRow1-3`/`PrixRow1-3_4`/`EncRow1-3_4`/`EffetsRow1-3_2` remplis correctement ; 4e contenant → silencieusement omis, pas d'erreur.
    - Nouveau test : jusqu'à 3 animaux → `AnimalRow1-3`/`PrixRow1-3_5`/`EffetsRow1-3_3` remplis, **aucun champ Enc** jamais poussé pour un animal (vérifier explicitement l'absence, ex. `expect(fields.some(f => f.field.startsWith('Enc') && ...)).toBe(false)` scoped aux positions animaux) ; 4e animal → omis silencieusement.
    - Adapter le test `Po/blocs Contenant et Animal ne sont jamais présents` (lignes 114-119 actuelles) : `Po` reste absent, mais `ContenantRow1`/`AnimalRow1` seront désormais bien présents dès qu'un contenant/animal existe — séparer en 2 assertions distinctes (`Po` toujours absent ; `ContenantRow1`/`AnimalRow1` absents seulement si `equipment.contenants`/`animaux` vides).
    - Nouveau test : `encombrement` = somme de `individual` + `contenants` (jamais `animaux`).
  - `apps/api/src/characters/equipment-pdf.service.spec.ts` (121 lignes actuelles, lu intégralement) : adapter `makeCharacter()` (ligne 40, `equipment: { individual: [...], group: [] }` → `{ individual: [...], contenants: [], animaux: [] }`) et le test `construit l'EquipmentPdfInput...` (lignes 90-102) pour vérifier que `contenants`/`animaux` (avec `price`/`effect` projetés) sont bien transmis à `mapEquipmentToPdfFields`, plus `group` n'apparaît plus nulle part dans l'objet construit.

- [x] **Task 4 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression.
  - `docker compose exec api pnpm typecheck` — propre (changement de signature de type, cf. mémoire projet `jdr-api-typecheck-gap`).
  - `packages/game-rules` : `pnpm test` — 0 régression.
  - Aucune modification `apps/web` dans cette story (export PDF = endpoint déjà existant `GET /characters/:id/export-equipment.pdf`, aucun nouveau bouton/UI requis — le bouton d'export existe déjà côté `character-sheet.ts`/`.html` depuis Story 11.1).

### Review Findings

- [x] [Review][Patch] `weight` null/NaN/chaîne non gardé de façon cohérente entre les colonnes Enc et le calcul `totalWeight` — risque de "null"/"NaN" affiché dans le PDF, ou concaténation de chaîne silencieuse si `weight` est une chaîne numérique, sur donnée `sheetData` non validée à l'exécution [`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts:95-97,113,128`] — corrigé via `isValidWeight()`/`numericWeightOrZero()`, 2 nouveaux tests de régression
- [x] [Review][Patch] Assertion manquante — `ContenantRow1`/`AnimalRow1` vides quand `contenants`/`animaux` sont vides, requise explicitement par la spec (Task 3) mais jamais réécrite après la suppression de l'ancien test `Po/blocs Contenant et Animal ne sont jamais présents` [`packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts`] — corrigé, assertion réécrite
- [x] [Review][Defer] `totalWeight` sommé sur les tableaux `individual`/`contenants` non tronqués alors que l'affichage est plafonné à 21/3 emplacements — incohérence visuelle possible entre le total affiché et les lignes visibles au-delà de la limite ; comportement préexistant pour `individual` (déjà accepté depuis Story 11.1), étendu à `contenants` par cette story de façon cohérente avec la spec (encombrement = somme réelle, pas seulement ce qui est visible) [`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts:95-97`] — deferred, pre-existing
- [x] [Review][Defer] Donnée `equipment.group` pré-Story 14.1 non migrée (si elle subsiste) désormais silencieusement ignorée sans aucune trace dans le code (le commentaire de la Story 14.1 documentant ce risque a été retiré) — risque informationnel, la migration one-off de la Story 14.1 est censée avoir traité toutes les fiches existantes [`apps/api/src/characters/equipment-pdf.service.ts`] — deferred, pre-existing

## Dev Notes

### Architecture — décision contraignante AD-2 (`ARCHITECTURE-SPINE.md` du 2026-07-18)

- **AD-2 [ADOPTED]** : « `mapEquipmentToPdfFields()` est étendue, pas réécrite [au sens: pas remplacée par un nouveau mécanisme] : les colonnes Prix/Effets déjà présentes dans le template mais non mappées sont branchées sur les nouveaux champs `equipment.individual[].price`/`.effect` ; deux nouvelles fonctions de mapping (ou extensions de la même fonction) couvrent les blocs Contenant (3 lignes) et Animal (3 lignes) du template, avec troncature silencieuse au-delà — même convention que la troncature déjà acceptée en revue de code à 21 objets (Story 11.1), pas une nouvelle décision. » Cette story applique cette AD à la lettre — **ne pas réécrire `mapEquipmentToPdfFields` depuis zéro**, étendre la fonction existante en préservant sa structure (`OBJECT_SLOTS`, boucle, style de construction du tableau `PdfFieldValue[]`).
- **AD-9 (héritée)** : aucun nouveau module NestJS — non déclenché (modification de fichiers existants uniquement).
- **P1-AD-2 (héritée)** : mutations exclusivement en couche Service — non applicable ici (aucune écriture, export en lecture seule).

### Code existant à lire intégralement avant d'écrire le code

- **`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts`** (103 lignes) — fichier cible de Task 1, structure `OBJECT_SLOTS`/`EFFETS_FIELDS`/`mapEquipmentToPdfFields` à étendre, pas remplacer.
- **`apps/api/src/characters/equipment-pdf.service.ts`** (75 lignes) — `fillEquipmentPdf()` (lignes 18-37), construction de l'input à corriger (Task 2) ; reste du fichier (chargement template, remplissage des champs, gestion d'erreurs) **inchangé**.
- **`packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts`** (120 lignes) — tests existants à adapter (Task 3), style `makeInput()`/`field()` à réutiliser.
- **`apps/api/src/characters/equipment-pdf.service.spec.ts`** (121 lignes) — tests existants à adapter (Task 3), mocks `pdf-lib`/`node:fs/promises`/`@master-jdr/game-rules` déjà en place, ne pas les reconstruire.
- **`apps/api/game-systems/ryuutama/assets/README.md`** (section « Ryuutama-fiche_equipement_edit.pdf ») — décrit déjà les blocs Contenant/Animal comme « n'ont aucune donnée correspondante dans le modèle actuel et restent volontairement vides » — **cette phrase devient fausse après cette story**, la mettre à jour pour refléter le nouveau mapping (cf. Task 1, dernière sous-tâche implicite : mise à jour de ce README).
- **`_bmad-output/implementation-artifacts/14-1-modele-dinventaire-unifie-backend-validation-et-migration.md`** (Dev Notes, Completion Notes) — documente précisément pourquoi `equipment-pdf.service.ts` avait été laissé avec `group: []` codé en dur, et que cette story (14.3) est le point de résolution prévu dès le départ.

### Noms de champs AcroForm — vérifiés directement (pas déduits), ne pas re-deviner

Extraits via `pdf-lib` (`form.getFields().map(f => f.getName())`) sur `Ryuutama-fiche_equipement_edit.pdf` réel (94 champs, tous `PDFTextField`) :

```
Contenant : ContenantRow1/PrixRow1_4/EncRow1_4/EffetsRow1_2
            ContenantRow2/PrixRow2_4/EncRow2_4/EffetsRow2_2
            ContenantRow3/PrixRow3_4/EncRow3_4/EffetsRow3_2
Animal :    AnimalRow1/PrixRow1_5/EffetsRow1_3   (aucun champ Enc)
            AnimalRow2/PrixRow2_5/EffetsRow2_3
            AnimalRow3/PrixRow3_5/EffetsRow3_3
Autre :     Po (monnaie, hors scope, reste vide)
```

Les 21 emplacements `OBJECT_SLOTS` existants ont chacun un champ `Prix*` propre (`PrixRow1` à `PrixRow8_2`) — déjà présents dans le tableau `OBJECT_SLOTS` actuel, simplement jamais remplis jusqu'ici (`value: ''` codé en dur). Seuls les 5 premiers (`ObjetRow1`-`ObjetRow5`) ont un champ `Effets*` correspondant (`EFFETS_FIELDS`, déjà limité à 5 dans le code actuel — ne pas l'étendre, le template n'a physiquement pas plus de champs Effets pour les objets généraux).

### Project Structure Notes

- Fichiers modifiés : `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (+ test) ; `apps/api/src/characters/equipment-pdf.service.ts` (+ test) ; `apps/api/game-systems/ryuutama/assets/README.md` (doc).
- Aucun nouveau fichier, aucune nouvelle dépendance, aucune migration Prisma, aucun nouveau module NestJS, aucune modification `apps/web`.

### Testing Standards

- `packages/game-rules` : Vitest, `packages/game-rules/src/__tests__/*.spec.ts` — étendre les fichiers existants.
- `apps/api` : Jest, mocks déjà en place pour `pdf-lib`/`node:fs/promises`/`@master-jdr/game-rules` dans `equipment-pdf.service.spec.ts` — ne pas les dupliquer, étendre les fixtures existantes (`makeCharacter()`).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 242-260 — Epic 14 / Story 14.3 complète, FR9)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-2 — mapping étendu, pas réécrit)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.2 FR-9 — troncature silencieuse 3 lignes contenant/animal, aucune régression sur les 21 emplacements déjà en production)
- `_bmad-output/implementation-artifacts/14-1-modele-dinventaire-unifie-backend-validation-et-migration.md` (origine du correctif temporaire `group: []`, cette story en est la résolution prévue)
- `_bmad-output/implementation-artifacts/14-2-ui-dinventaire-unifiee-objets-contenants-animaux.md` (référence pour la règle `totalWeight()` = individual + contenants, jamais animaux — même règle appliquée ici pour `encombrement`)
- `apps/api/game-systems/ryuutama/assets/README.md` (description du template PDF équipement, section à mettre à jour)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Task 1 : `EquipmentPdfInput` étendu (`contenants`/`animaux` remplacent `group`) ; `OBJECT_SLOTS` remplit désormais `Prix` sur les 21 emplacements et `Effets` sur les 5 premiers depuis les données réelles (`item?.price ?? ''`/`item?.effect ?? ''`) au lieu de `''` codé en dur ; deux nouvelles boucles `CONTENANT_SLOTS`/`ANIMAL_SLOTS` (3 emplacements chacune, noms de champs vérifiés via `pdf-lib`) ajoutées avec troncature silencieuse au-delà de 3 ; `encombrement` recalculé comme somme `individual` + `contenants` (jamais `animaux`). Fonction existante étendue, pas réécrite (AD-2 respectée).
- Task 2 : retiré le hack `group: []` de la Story 14.1 ; `equipment.individual`/`contenants`/`animaux` désormais construits directement depuis `sheetData.equipment.{individual,contenants,animaux}` avec projection `price`/`effect`.
- Task 3 : `equipment-pdf-field-map.spec.ts` réécrit intégralement pour la nouvelle forme (`makeInput()` avec `{individual, contenants, animaux}` ; 12 tests couvrant Prix/Effets sur individual, troncature à 21/3/3, absence de champ Enc pour les animaux, encombrement individual+contenants). `equipment-pdf.service.spec.ts` : `makeCharacter()` et le test de construction de l'input mis à jour pour la nouvelle forme.
- Task 4 : `apps/api` — 41/41 suites, 790/790 tests ; `pnpm typecheck` propre ; `packages/game-rules` — 9/9 suites, 128/128 tests. Aucun fichier `apps/web` touché.
- README (`apps/api/game-systems/ryuutama/assets/README.md`) mis à jour : la phrase indiquant que Contenant/Animal n'ont « aucune donnée correspondante » est corrigée, ces blocs sont désormais alimentés.

### File List

- `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (modifié)
- `packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts` (modifié)
- `apps/api/src/characters/equipment-pdf.service.ts` (modifié)
- `apps/api/src/characters/equipment-pdf.service.spec.ts` (modifié)
- `apps/api/game-systems/ryuutama/assets/README.md` (modifié)

## Change Log

- 2026-07-18 : Implémentation complète (Tasks 1-4). `mapEquipmentToPdfFields()` étendue (pas réécrite, AD-2) : Prix rempli sur les 21 emplacements Objet, Effets sur les 5 premiers, nouveaux blocs Contenant/Animal (3 emplacements chacun, noms AcroForm vérifiés via pdf-lib) avec troncature silencieuse au-delà, aucun champ Enc pour les animaux. Hack `group: []` de la Story 14.1 retiré côté `equipment-pdf.service.ts`. README template mis à jour. 790/790 tests api, 128/128 tests game-rules, typecheck propre, aucune modification `apps/web`. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 patches appliqués : (1) `weight` null/NaN/chaîne mal gardé entre les colonnes Enc et le total `encombrement` — corrigé via `isValidWeight()`/`numericWeightOrZero()`, traité comme absent/zéro plutôt que fuité en `"null"`/`"NaN"`/concaténation silencieuse ; (2) assertion manquante sur `ContenantRow1`/`AnimalRow1` vides quand les catégories sont vides, requise par la spec mais jamais réécrite — réécrite. 2 items différés (voir `deferred-work.md`) : total `encombrement` non plafonné aux lignes visibles (préexistant, étendu à `contenants` de façon cohérente avec la spec) ; donnée `equipment.group` pré-migration potentiellement non tracée. 7 écartés (comportements déjà voulus par la spec ou conventions préexistantes du projet). 5 nouveaux tests de régression. Suite finale : 790/790 tests api, 131/131 tests game-rules, typecheck propre, aucune régression. Statut passé à done.
