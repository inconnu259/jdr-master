---
baseline_commit: 2b245feae1cbbadb822da89e75db3ef70679d770
---

# Story 6.7: Champs narratifs et arme de prédilection éditables

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want pouvoir éditer les champs narratifs de ma fiche (sexe, âge, traits physiques, ville natale, motivation, personnalité) et, pour le MJ, l'arme de prédilection d'un personnage de sa Partie,
so that je peux compléter/corriger ces informations après la création du personnage sans devoir passer par la base de données, et sans être bloqué par une saisie initiale incomplète ou erronée.

## Contexte

Née d'un retour utilisateur après la revue de code de la Story 6.6 (2026-07-11) : deux limitations identifiées dans le mécanisme d'édition générique livré par 6.6.

1. **Notes narratives non éditables, ni par le MJ ni par le joueur.** Story 6.6 a livré le mécanisme générique `FieldEditPencil`/`PATCH /characters/:id/sheet-field` mais ne l'a câblé, côté MJ, que sur un jeu représentatif (attributs, objet fétiche, XP, inventaire) — les champs `narrative.*` en étaient explicitement exclus (« hors scope » de 6.6, prévu comme extension mécanique post-scope si besoin réel exprimé). Le PRD (`prd.md` L.226) liste pourtant explicitement les « notes narratives » parmi les champs que le MJ doit pouvoir corriger via FR14. Ce besoin est maintenant confirmé.
2. **Le joueur lui-même ne peut pas éditer ses propres champs narratifs après création.** Ce n'est PAS un simple oubli de câblage MJ : aucune Feature Requirement existante (FR9/FR11/FR14) ne couvre l'édition narrative par le propriétaire. C'est une extension de périmètre fonctionnel nouvelle, nécessitant un chemin d'accès et d'écriture différent (propriétaire-seul, pas MJ-seul).
3. **Arme de prédilection (`weaponCategoryId`) non éditable par le MJ.** Même situation que les champs narratifs côté MJ — champ scalaire simple, non câblé en 6.6, extension mécanique identique.

**Explicitement HORS scope de cette story** (demande utilisateur du 2026-07-11, à traiter comme item de backlog Epic 6 séparé, pas ici) : fusion d'`equipment.group` (texte libre) et `equipment.individual` (`InventoryItem[]`) en un seul système d'inventaire, avec sélection depuis une liste couplée nom/poids. Ce changement touche le modèle de données (`RyuutamaSheetData.equipment`), les deux UI d'inventaire (MJ et propriétaire) et probablement une migration Prisma — à cadrer dans une story dédiée future, pas comme extension mineure.

## Acceptance Criteria

1. **Given** je suis le MJ de la Partie à laquelle un personnage est rattaché, **When** je clique sur le `FieldEditPencil` à côté de l'un des 6 champs narratifs affichés (Sexe, Âge, Traits physiques, Village natal, Motivation, Personnalité) ou de l'Arme de prédilection, **Then** je peux l'éditer et le confirmer individuellement — même mécanisme que les champs déjà câblés en Story 6.6 (`PATCH /characters/:id/sheet-field`, `CharacterSnapshot(trigger: 'MJ_EDIT')`, validation `'mj'` non bloquante). [Extension de Story 6.6 AC1/AC2, FR14]
2. **Given** je suis le propriétaire du personnage (pas nécessairement MJ), **When** je clique sur le `FieldEditPencil` à côté de l'un des 6 champs narratifs sur ma propre fiche, **Then** je peux l'éditer et le confirmer individuellement, via un chemin d'écriture dédié propriétaire-seul (PAS `sheet-field`, qui reste MJ-only) — aucun `CharacterSnapshot` n'est créé (cohérent avec FR9/FR11 : l'édition de l'inventaire et des notes personnelles ne crée pas d'instantané).
3. **Given** je consulte la fiche d'un personnage qui n'est ni la mienne ni celui d'un joueur de ma Partie (ni propriétaire, ni MJ de la Partie), **When** j'observe la fiche ou tente une requête directe sur les nouveaux endpoints, **Then** aucun `FieldEditPencil` narratif/arme ne s'affiche et toute tentative d'écriture est rejetée en 403.
4. **Given** deux écritures concurrentes arrivent sur le même personnage (édition narrative propriétaire + édition MJ, ou deux éditions narratives), **When** l'une des deux écrit sur la base d'un `updatedAt` périmé, **Then** elle échoue avec une erreur 409 (verrouillage optimiste, NFR1/AD-9 — même pattern que toute mutation `Character` de ce palier).
5. **Given** le MJ édite l'Arme de prédilection avec une valeur hors du catalogue seedé (`weaponCategoryId` ne correspondant à aucune entrée de contenu), **When** la requête est traitée, **Then** l'écriture est acceptée (jamais bloquante, AD-7/NFR3) et un avertissement non bloquant s'affiche — même comportement que `classId`/`typeId` déjà couverts par Story 6.6.
6. **Given** je suis le propriétaire, **When** je vide un champ narratif texte via son `FieldEditPencil` et confirme, **Then** le champ est enregistré vide (le champ redevient optionnel, cohérent avec le typage `narrative?.sex?: string` etc.) — pas de valeur fantôme conservée côté serveur.
7. **Given** je suis le MJ, **When** j'ouvre le `FieldEditPencil` de l'Arme de prédilection, **Then** je peux soit choisir une arme parmi celles du catalogue seedé (liste déroulante), soit taper une valeur libre non listée (cf. AC5 — jamais bloquant) — un seul champ combiné, pas deux contrôles séparés. [Décision utilisateur du 2026-07-11 : combobox `<input list>`/`<datalist>`, pas un `<select>` strict]

## Tasks / Subtasks

- [x] **Task 1 — Backend : DTO et méthode propriétaire `updateNarrativeField`** (AC: 2, 3, 4, 6)
  - [x] `apps/api/src/characters/dto/update-narrative-field.dto.ts` (NEW) — même pattern que `SetSheetFieldDto` (cf. Story 6.6, `value` en `@IsOptional()` pour accepter `null`/vider un champ) mais **`field` restreint aux 6 clés autorisées** via `@IsIn([...])`, PAS un `path` libre (contrairement à `sheet-field`, MJ-only) :
    ```ts
    import { IsIn, IsOptional, IsString } from 'class-validator';

    const NARRATIVE_FIELDS = ['sex', 'age', 'physicalTraits', 'homeTown', 'motivation', 'personality'] as const;

    export class UpdateNarrativeFieldDto {
      @IsString()
      @IsIn(NARRATIVE_FIELDS)
      field!: (typeof NARRATIVE_FIELDS)[number];

      @IsOptional()
      value: unknown;
    }
    ```
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter, à la suite de `removeInventoryItem`/avant `writeInventoryChange` (ou après, peu importe l'ordre — regrouper avec les mutations propriétaire-seul) :
    ```ts
    /**
     * Édition propriétaire-seul d'un champ narratif (Story 6.7, extension hors FR14 — le MJ édite
     * via `sheet-field`, cf. setSheetField ; ceci est un chemin séparé pour le propriétaire).
     * `field` restreint aux 6 clés `narrative.*` affichées sur la fiche (denylist implicite via
     * whitelist DTO — jamais un path libre côté propriétaire). Pas de `computeDerived` (narratif
     * n'entre dans aucun calcul), pas de `CharacterSnapshot` (cohérent avec FR9/FR11 : édition
     * propriétaire de contenu non structurel = pas d'instantané). Verrouillage optimiste réutilisé
     * via `writeInventoryChange` (générique malgré son nom — écrit `sheetData` verrouillé, sans
     * snapshot ni recalcul, exactement ce qu'il faut ici).
     */
    async updateNarrativeField(
      characterId: string,
      userId: string,
      dto: UpdateNarrativeFieldDto,
    ): Promise<CharacterDto> {
      const character = await this.getOwnCharacterOrThrow(characterId, userId);
      const sheetData = character.sheetData as unknown as RyuutamaSheetData;
      sheetData.narrative = { ...sheetData.narrative, [dto.field]: dto.value };
      return this.writeInventoryChange(
        characterId,
        character.updatedAt,
        sheetData,
        userId,
      );
    }
    ```
    Import `UpdateNarrativeFieldDto` depuis `./dto/update-narrative-field.dto`.
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter
    ```ts
    @Patch(':id/narrative-field')
    updateNarrativeField(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: UpdateNarrativeFieldDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.updateNarrativeField(id, user.id, dto);
    }
    ```
    Import `UpdateNarrativeFieldDto` depuis `./dto/update-narrative-field.dto`. Vérifier que `getOwnCharacterOrThrow` lève bien `ForbiddenException` pour un non-propriétaire (comportement déjà établi, réutilisé tel quel — pas de nouveau guard).
  - [x] `packages/shared/src/index.ts` (UPDATE) : ajouter à la suite des types `SetSheetFieldDto`/`SetSheetFieldResultDto` (Story 6.6) :
    ```ts
    /** Payload de PATCH /characters/:id/narrative-field (Story 6.7, édition propriétaire-seul). */
    export interface UpdateNarrativeFieldDto {
      field: 'sex' | 'age' | 'physicalTraits' | 'homeTown' | 'motivation' | 'personality';
      value: unknown;
    }
    ```
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter
    ```ts
    updateNarrativeField(id: string, field: string, value: unknown): Promise<CharacterDto> {
      return firstValueFrom(
        this.http.patch<CharacterDto>(
          `${API_BASE}/characters/${id}/narrative-field`,
          { field, value },
          { withCredentials: true },
        ),
      );
    }
    ```

- [x] **Task 2 — Tests backend `updateNarrativeField`** (AC: 2, 3, 4, 6)
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE) : `describe('updateNarrativeField()', ...)` couvrant, sur le même modèle que `describe('updateInventoryItem()', ...)`/`describe('addNote()', ...)` déjà présents dans ce fichier : non-propriétaire (y compris MJ de la Partie — ce chemin est PROPRIÉTAIRE SEUL, pas MJ) → `ForbiddenException`, aucune écriture ; succès sur un champ (ex. `motivation`) → `sheetData.narrative.motivation` mis à jour, `characterSnapshot.create` **jamais appelé** ; `value: null` ou `value: ''` → le champ est bien vidé côté écriture (pas de valeur fantôme) ; 409 si `updatedAt` périmé ; champ narratif non listé dans `narrative` existant (ex. premier `sex` jamais renseigné, `sheetData.narrative` initialement `undefined`) → pas de crash, `narrative` créé avec juste ce champ.
  - [x] `apps/api/src/characters/characters.controller.spec.ts` (UPDATE) : test `ValidationPipe` réel — `UpdateNarrativeFieldDto` rejette un `field` hors de la liste autorisée (ex. `field: 'xp'` ou `field: 'classId'` → 400, prouvant que ce chemin ne peut PAS être détourné vers un champ structurel) ; whitelist rejette un champ supplémentaire non déclaré ; test de délégation (paramètres transmis tels quels à `characters.updateNarrativeField`).

- [x] **Task 3 — `FieldEditPencil` : support combobox (options catalogue + saisie libre)** (AC: 7)
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts` (UPDATE) : ajouter un input optionnel `options` — quand fourni et non vide, le champ devient une combobox HTML native (`<input list="...">` + `<datalist>`) au lieu d'un simple `<input>` : l'utilisateur peut choisir une valeur listée OU taper n'importe quelle valeur libre (AC7 — jamais un `<select>` strict, qui bloquerait la saisie libre nécessaire à AC5).
    ```ts
    export interface FieldEditPencilOption {
      key: string;
      label: string;
    }

    let nextDatalistId = 0;

    @Component({ /* ... inchangé ... */ })
    export class FieldEditPencil {
      // ... champs existants inchangés (label, value, type, confirm, editing, draft) ...

      /** Suggestions catalogue optionnelles (ex. armes seedées) — combobox, jamais un select strict (AC7). */
      readonly options = input<FieldEditPencilOption[]>([]);
      protected readonly datalistId = `field-edit-pencil-datalist-${nextDatalistId++}`;

      // ... startEdit/cancel/onInput/submit inchangés ...
    }
    ```
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.html` (UPDATE) : dans l'état `editing()`, ajouter `[attr.list]="options().length ? datalistId : null"` sur l'`<input>` existant, et juste après :
    ```html
    @if (options().length) {
      <datalist [id]="datalistId">
        @for (opt of options(); track opt.key) {
          <option [value]="opt.key">{{ opt.label }}</option>
        }
      </datalist>
    }
    ```
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.spec.ts` (UPDATE) : nouveau test — `options` fourni → l'`<input>` a un attribut `list` pointant vers un `<datalist>` contenant une `<option>` par entrée, avec la bonne `value` (`key`) ; `options` non fourni (défaut `[]`) → pas d'attribut `list`, pas de `<datalist>` (régression, comportement des champs texte/nombre existants inchangé — attributs, fétiche, XP, narratif).

- [x] **Task 4 — Frontend : câblage MJ des champs narratifs et de l'arme (mécanisme existant)** (AC: 1, 3, 4, 5, 7)
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (UPDATE) : ajouter, à la suite de `weaponData` (L.137-143), un computed pour les options du catalogue d'armes :
    ```ts
    protected readonly weaponOptions = computed<FieldEditPencilOption[]>(() =>
      (this.content()?.['weaponCategory'] ?? []).map((entry) => ({
        key: entry.key,
        label: (entry.data as WeaponData).label,
      })),
    );
    ```
    Importer `FieldEditPencilOption` depuis `./field-edit-pencil/field-edit-pencil`.
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (UPDATE) :
    - Bloc "Arme de prédilection" (L.252-263) : ajouter, dans `sheet__weapon-row` (ou dans un état par défaut si `weaponData()` est `null` — le MJ doit pouvoir RENSEIGNER une arme même si `weaponCategoryId` initial ne résout à aucune entrée de contenu, cf. même logique que `fetiqueObject() || viewerIsMj()` en Story 6.6), `[options]="weaponOptions()"` sur les deux pencils (combobox, AC7) :
      ```html
      @if (weaponData(); as weapon) {
        <div class="sheet__weapon-row">
          <span class="sheet__weapon-name">{{ weapon.label }}</span>
          <div class="sheet__pill-grid">
            <span class="stat-pill">Toucher {{ weapon.touchFormula }}</span>
            <span class="stat-pill">Dégâts {{ weapon.damageFormula }}</span>
          </div>
          @if (viewerIsMj()) {
            <app-field-edit-pencil
              label="l'arme de prédilection"
              [value]="sheetData()['weaponCategoryId'] ?? ''"
              [options]="weaponOptions()"
              (confirm)="submitFieldEdit('weaponCategoryId', $event)"
            />
          }
        </div>
      } @else if (viewerIsMj()) {
        <app-field-edit-pencil
          label="l'arme de prédilection"
          value=""
          [options]="weaponOptions()"
          (confirm)="submitFieldEdit('weaponCategoryId', $event)"
        />
      }
      ```
      `sheetData()['weaponCategoryId']` — même pattern d'accès brut que `classId`/`typeId` déjà utilisé dans ce fichier (`character-sheet.ts` L.125/141, computed `sheetData`), pas `c.sheetData.weaponCategoryId`.
    - Bloc "Notes narratives" (L.298-336) : pour chacun des 6 champs, ajouter un `FieldEditPencil` (sans `options` — pas de catalogue pour les champs narratifs, texte libre simple) visible si `viewerIsMj() || isOwner()`, ET afficher le bloc même si la valeur est vide dès lors que l'un de ces deux est vrai (même logique que `fetiqueObject() || viewerIsMj()`) :
      ```html
      @if (narrative().sex || viewerIsMj() || isOwner()) {
        <div class="sheet__narrative-field">
          <span class="sheet__narrative-label">Sexe</span>
          <span class="sheet__narrative-value">{{ narrative().sex }}</span>
          @if (viewerIsMj()) {
            <app-field-edit-pencil label="le sexe" [value]="narrative().sex ?? ''" (confirm)="submitFieldEdit('narrative.sex', $event)" />
          } @else if (isOwner()) {
            <app-field-edit-pencil label="le sexe" [value]="narrative().sex ?? ''" (confirm)="submitNarrativeFieldEdit('sex', $event)" />
          }
        </div>
      }
      ```
      Répéter pour `age`/`physicalTraits`/`homeTown`/`motivation`/`personality` (mêmes labels que les `sheet__narrative-label` déjà affichés : "Âge", "Traits physiques", "Village natal", "Motivation", "Personnalité"). **Ne pas dupliquer en un helper générique Angular pour ce diff** (le template actuel a 6 blocs déjà quasi identiques ligne à ligne — rester cohérent avec le style existant du fichier, pas de sur-ingénierie).
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (UPDATE) : ajouter
    ```ts
    protected async submitNarrativeFieldEdit(field: string, value: string | number): Promise<void> {
      const c = this.character();
      if (!c) return;
      this.fieldEditError.set(null);
      try {
        this.character.set(await this.characterSvc.updateNarrativeField(c.id, field, value));
      } catch {
        this.fieldEditError.set(this.theme.tone()['evolution.narrative_edit_error']);
      }
    }
    ```
    Réutiliser le signal `fieldEditError` déjà présent (Story 6.6) — pas de nouveau signal dédié, cohérent avec `submitXpEdit` qui réutilise déjà ce même signal pour un chemin d'écriture différent.
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (UPDATE) : `viewerIsMj(): true` → pencils narratifs + arme visibles, appellent `setSheetField` avec les bons `path` (`narrative.sex`, `weaponCategoryId`, etc.) ; `isOwner(): true, viewerIsMj(): false` → pencils narratifs visibles (mais PAS le pencil arme, MJ-only per AC1/user request), `submitNarrativeFieldEdit` appelle `characterSvc.updateNarrativeField` (pas `setSheetField`) ; ni propriétaire ni MJ → aucun pencil narratif/arme visible (AC3) ; erreur réseau sur `updateNarrativeField` → `fieldEditError()` affiché.

- [x] **Task 5 — Thème : nouvelle clé `evolution.narrative_edit_error`** (AC: 2)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : ajouter, à la suite de `evolution.mj_edit_error`/`mj_edit_warning_prefix`/`inventory_mj_add_cta` (Story 6.6) dans les 3 thèmes, texte adapté au registre de chaque thème comme les clés voisines :
    ```ts
    'evolution.narrative_edit_error': "La modification n'a pas pu être enregistrée. Réessayez.",
    ```

## Dev Notes

### Ce que cette story NE change PAS

- Le mécanisme MJ `setSheetField`/`FieldEditPencil` livré et durci en Story 6.6 (denylist `xp`/`levelUps`, protection pollution de prototype, guard `equipment` strict, etc.) — cette story se contente d'y **câbler deux champs supplémentaires côté UI** (`weaponCategoryId`, `narrative.*`), aucune modification du backend `setSheetField`/`setByPath` n'est nécessaire : ces chemins ne sont ni dans le denylist `xp`/`levelUps` ni dans le cas spécial `equipment`, donc déjà acceptés tels quels par le mécanisme générique existant.
- `validate('mj', ...)` (AD-7) : `weaponCategoryId` hors catalogue produit déjà un `ValidationError` non bloquant via la règle existante (`validate.ts` L.55-58, vérifiée dans Story 6.6) — rien à changer côté `packages/game-rules`.
- `HistoryTab` : les instantanés `MJ_EDIT` créés par l'édition MJ de ces nouveaux champs s'affichent automatiquement, comme tout autre champ (Story 6.3/6.6). Les écritures propriétaire (`updateNarrativeField`) ne créent PAS de snapshot, donc n'apparaissent PAS dans l'historique — cohérent avec le comportement déjà établi pour l'inventaire/les notes (FR9/FR11).

### Pourquoi une combobox HTML native (`<input list>`/`<datalist>`) et pas un `<select>` ni un composant tiers

Décision utilisateur du 2026-07-11 (AC7) : l'arme de prédilection doit être choisissable dans le catalogue **ou** saisie librement. Un `<select>` strict interdirait la saisie libre (contredit AC5, déjà couvert par Story 6.6 pour `classId`) ; un composant de recherche/autocomplete personnalisé serait disproportionné pour un besoin aussi simple. `<input list="...">` + `<datalist>` est nativement supporté par tous les navigateurs cibles, ne demande aucune dépendance, et reste un `<input type="text">` ordinaire pour tout le reste du composant (le `type()` du `FieldEditPencil` reste inchangé — la combobox est une variante du type `text`, jamais du type `number`). L'input `options` est optionnel et vide par défaut : tous les usages existants de `FieldEditPencil` (attributs, XP, objet fétiche, Story 6.6) restent inchangés, sans `<datalist>`.

### Pourquoi deux chemins d'écriture séparés (MJ vs propriétaire) et pas un seul généralisé

Généraliser `setSheetField` pour accepter propriétaire OU MJ aurait été plus court à écrire, mais aurait ouvert la porte à un joueur éditant n'importe quel `path` de sa propre fiche (attributs, classe, XP via un chemin détourné, etc.) — `setSheetField` n'a **aucune** whitelist de chemins autorisés pour le MJ (c'est voulu, AD-6/AD-7 : le MJ est un rôle de confiance qui peut tout corriger). Le propriétaire n'a PAS ce même niveau de confiance — FR9 (inventaire) et FR11 (notes) montrent déjà que chaque capacité d'écriture propriétaire passe par un endpoint dédié avec un contrat étroit, jamais un mécanisme générique. `UpdateNarrativeFieldDto` avec `@IsIn([...6 clés...])` suit ce même principe : le propriétaire ne peut structurellement PAS atteindre autre chose que ces 6 clés, quelle que soit la requête envoyée.

### Previous Story Intelligence (Story 6.6)

- Pattern d'accès à retenir : `getOwnCharacterOrThrow` (propriétaire-seul, lève `ForbiddenException` sinon) est déjà utilisé par `updateInventoryItem`/`removeInventoryItem`/`addNote` — réutiliser tel quel pour `updateNarrativeField`, **ne pas réutiliser `parties.getOwned`** (qui est le contrôle MJ-only utilisé par `setSheetField`/`setXp`).
- `writeInventoryChange` (private, `character.service.ts` L.926-946) est déjà une écriture verrouillée générique sans `computeDerived` ni snapshot — directement réutilisable pour `updateNarrativeField` sans dupliquer la logique de verrouillage optimiste.
- Revue de code Story 6.6 (2026-07-11) a durci `setByPath`/`setSheetField` contre : pollution de prototype (segments `__proto__`/`constructor`/`prototype`), contournement du guard `equipment` via un path à 1 segment, index non canonique, `value` non typée. Ces durcissements sont dans `setSheetField`/`setByPath` — `updateNarrativeField` (nouveau chemin, écriture directe `sheetData.narrative = {...}` sans passer par `setByPath`) n'a pas besoin des mêmes protections car `field` est une whitelist DTO stricte (`@IsIn`), pas un chemin arbitraire — mais rester vigilant si ce pattern est un jour généralisé à un `path` libre.
- Pattern de test déjà établi : `character.service.spec.ts` a une factory `makePrisma()` réutilisée par tous les tests de mutation (`updateMany`, `findUniqueOrThrow`, `characterSnapshot.create`) — suivre le même schéma de mock que `describe('updateInventoryItem()', ...)` pour les nouveaux tests, pas de nouvelle factory.

### Project Structure Notes

- Aucun nouveau fichier composant/module — extension de fichiers existants (`character-sheet.ts/html/spec.ts`, `character.service.ts` des deux côtés, `tones.ts`, `packages/shared/src/index.ts`) plus 1 nouveau DTO backend (`update-narrative-field.dto.ts`, même dossier que `set-sheet-field.dto.ts`/`set-xp.dto.ts`).
- Pas de migration Prisma : `narrative` et `weaponCategoryId` existent déjà dans `RyuutamaSheetData` (JSON `sheetData`), aucune colonne/table nouvelle.

### References

- `_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md` L.226 (FR14, "notes narratives" explicitement citées comme champ MJ-éditable)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md` AD-3, AD-6, AD-7, AD-8, AD-9
- `_bmad-output/implementation-artifacts/6-6-edition-mj-sans-contrainte.md` (mécanisme `setSheetField`/`FieldEditPencil` réutilisé, section Review Findings pour le contexte des durcissements récents)
- `packages/game-rules/src/ryuutama/types.ts` L.17-33 (`RyuutamaSheetData.narrative`/`weaponCategoryId`)
- `apps/api/src/characters/character.service.ts` L.868-946 (`updateInventoryItem`/`writeInventoryChange`, pattern réutilisé)

### Review Findings

- [x] [Review][Patch] `value` omis (pas envoyé du tout) sur `PATCH /narrative-field` produit un comportement non testé et non documenté [apps/api/src/characters/dto/update-narrative-field.dto.ts, apps/api/src/characters/character.service.ts:updateNarrativeField] — `dto.value` vaut alors `undefined`, `narrative[field] = undefined` fait disparaître la clé à la sérialisation JSON (résultat équivalent à `value: null`, déjà testé), mais ce cas précis (`value` absent du body, par opposition à `value: null` explicite) n'a pas de test dédié malgré un comportement distinct au niveau du contrat HTTP. Ajouter un test couvrant explicitement ce cas pour documenter/figer le comportement.
- [x] [Review][Patch] Bloc "arme de prédilection" dupliqué en 2 instances de `FieldEditPencil` quasi identiques [apps/web/src/app/features/characters/character-sheet/character-sheet.html] — un bloc à l'intérieur de `@if (weaponData(); as weapon)`, un autre dans `@else if (viewerIsMj())`, ne différant que par la source de `[value]`. Simplifiable en un seul pencil placé hors de la branche conditionnelle, avec `[value]="sheetData()['weaponCategoryId'] ?? ''"` dans tous les cas (les stats de l'arme restent, elles, conditionnées à `weaponData()`).
- [x] [Review][Defer] Message d'erreur générique sur `submitNarrativeFieldEdit` (pas de distinction 409/réseau, pas de log) [apps/web/.../character-sheet.ts] — deferred, pre-existing : même pattern déjà utilisé par `submitFieldEdit`/`submitXpEdit` (Story 6.6) et déjà noté comme limite connue lors de la revue de la Story 6.6 (rafraîchissement après 409). Corriger ce pattern transversalement est hors scope de cette story.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Task 1 : ajout de `updateNarrativeField` en réutilisant `getOwnCharacterOrThrow` (propriétaire-seul) et le helper privé `writeInventoryChange` (verrouillage optimiste, sans `computeDerived` ni snapshot), exactement comme prévu par les Dev Notes. Aucune surprise par rapport au plan.
- Task 4 : `[value]="sheetData()['weaponCategoryId'] ?? ''"` a nécessité un cast `$any(...)` dans le template (`sheetData()` retourne `Record<string, unknown>`, incompatible avec l'`input` typé `string | number` de `FieldEditPencil` sans cast) — pattern déjà utilisé ailleurs dans ce même fichier (`$any(c.portraitCropData)`).
- Task 4 : mise à jour de deux tests préexistants devenus obsolètes avec le nouveau comportement (pas une régression, un changement de contrat intentionnel de la story) : le test « pencils MJ » comptait 6 pencils, passé à 13 (arme + 6 narratifs ajoutés) ; le test « propriétaire → aucun pencil MJ visible » est devenu « propriétaire → seuls les 6 pencils narratifs visibles » (AC2 rend le propriétaire éditeur de ses propres champs narratifs, ce qui n'existait pas avant cette story) ; le test « affiche les notes narratives renseignées uniquement » a été scindé en deux (lecture seule pour un fellow player vs propriétaire qui voit désormais aussi les champs vides pour pouvoir les renseigner, AC2/AC6).
- Suite complète : web 52/52 fichiers, 440/440 tests ✅ ; api 23/23 suites, 401/401 tests ✅.
- Lint : `eslint --fix` scopé aux fichiers touchés par cette story uniquement (pas de `pnpm lint` global, leçon retenue de la revue de code Story 6.6 qui avait reformaté des fichiers hors-scope) — 0 erreur restante sur les fichiers de cette story après fix ; suites de tests re-vérifiées après fix (toujours au vert).

### Completion Notes List

- Story 6.7 complète : mécanisme `FieldEditPencil`/`sheet-field` étendu aux champs narratifs (MJ) et arme de prédilection (MJ), plus nouveau chemin d'écriture propriétaire-seul (`PATCH /characters/:id/narrative-field`) pour que le joueur édite ses propres champs narratifs.
- Les 7 AC sont couvertes : édition MJ narratif+arme via le mécanisme existant (AC1), édition propriétaire narratif sans snapshot (AC2), 403 pour tiers (AC3), 409 verrouillage optimiste (AC4), avertissement non bloquant si arme hors catalogue (AC5), vidage propre d'un champ narratif (AC6), combobox catalogue+saisie libre pour l'arme (AC7).
- Hors-scope explicitement délimité par la story (fusion equipment/besace) — non traité, noté séparément en backlog (`deferred-work.md`).

### File List

- `apps/api/src/characters/character.service.ts` (M)
- `apps/api/src/characters/character.service.spec.ts` (M)
- `apps/api/src/characters/characters.controller.ts` (M)
- `apps/api/src/characters/characters.controller.spec.ts` (M)
- `apps/api/src/characters/dto/update-narrative-field.dto.ts` (A)
- `apps/web/src/app/core/characters/character.service.ts` (M)
- `apps/web/src/app/core/theme/tones.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.html` (M)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.spec.ts` (M)
- `packages/shared/src/index.ts` (M)

## Change Log

- 2026-07-11 : Story 6.7 complète (Tasks 1-5). Backend `updateNarrativeField` propriétaire-seul (nouveau chemin séparé de `setSheetField` MJ-only) ; `FieldEditPencil` étendu avec un input `options` optionnel pour une combobox HTML native (`<input list>`/`<datalist>`) ; câblage MJ des 6 champs narratifs + arme de prédilection via le mécanisme `sheet-field` existant ; câblage propriétaire des 6 champs narratifs via le nouveau endpoint dédié. Statut → review.
- 2026-07-11 : Revue de code appliquée — ajout d'un test couvrant `value` omis du body (`PATCH /narrative-field`) et simplification du bloc "arme de prédilection" (un seul `FieldEditPencil` au lieu de deux instances dupliquées). Statut → done.
