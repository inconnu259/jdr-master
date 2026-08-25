---
baseline_commit: a664d6ffd8f1f2f4cc0c878b7d39c38f48cecfa1
---

# Story 6.6: Édition MJ sans contrainte, avec traçabilité

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want corriger n'importe quel champ de la fiche d'un de mes joueurs, y compris son XP, directement depuis l'application,
so that je n'ai plus besoin de modifier la base de données à la main quand une information a été mal saisie.

## Acceptance Criteria

1. **Given** je suis le MJ de la Partie à laquelle un personnage est rattaché, **When** je clique sur le `FieldEditPencil` à côté d'un champ de sa fiche (attribut, objet fétiche, objet d'inventaire, XP), **Then** je peux éditer ce champ précis et le confirmer individuellement, sans "mode édition" global qui déverrouille toute la fiche. [Source: epics.md Story 6.6 AC1, FR-14, DESIGN.md FieldEditPencil]
2. **Given** je confirme une édition de champ (hors XP), **When** la requête `PATCH /characters/:id/sheet-field` est traitée, **Then** `validate(data, 'mj', catalog)` exécute les règles réelles mais ne rejette jamais la requête — un avertissement non bloquant s'affiche si la valeur sort du catalogue seedé (NFR3) — et un `CharacterSnapshot(trigger: 'MJ_EDIT')` est créé immédiatement. [Source: epics.md Story 6.6 AC2, AD-6, AD-7, FR-12]
3. **Given** je tente de modifier `sheetData.levelUps` ou `sheetData.xp` via `PATCH /characters/:id/sheet-field`, **When** la requête est envoyée, **Then** elle est rejetée (400) — ces deux sous-arbres ne sont accessibles que via `PATCH /characters/:id/xp` et l'assistant de montée de niveau (`POST /characters/:id/level-up`). [Source: epics.md Story 6.6 AC3, AD-6]
4. **Given** je modifie directement le champ XP d'un personnage (`PATCH /characters/:id/xp`), **When** la nouvelle valeur franchit un seuil de niveau, **Then** le système applique la même détection qu'une distribution normale (le joueur voit sa `LevelUpBanner` et reçoit l'e-mail) — je ne peux jamais faire sauter un niveau silencieusement sans passer par le flux guidé du joueur. [Source: epics.md Story 6.6 AC4, AD-1, AD-6]
5. **Given** je ne suis ni le MJ de la Partie du personnage, ni un autre rôle autorisé, **When** je tente une édition MJ sur ce personnage (`sheet-field` ou `xp`), **Then** je reçois une erreur 403, y compris si je suis MJ d'une autre Partie. [Source: epics.md Story 6.6 AC5, AD-8]
6. **Given** deux éditions MJ (ou une édition MJ et une autre mutation) arrivent en concurrence sur le même personnage, **When** l'une des deux écrit sur la base d'un `updatedAt` périmé, **Then** elle échoue avec une erreur 409 (verrouillage optimiste, NFR1, AD-9). [Source: epics.md Story 6.6 AC6, AD-9]

**Hors scope de cette story** (cf. PRD §4.6, décisions de cadrage explicites) :
- Interface de diff visuel avant/après l'édition MJ (l'instantané suffit pour la traçabilité en v1).
- Validation partielle par champ différenciée (le MJ édite `sheetData` champ par champ via un mécanisme générique unique, pas des règles par champ).
- Câblage `FieldEditPencil` sur **tous** les champs scalaires de la fiche (`narrative.*`, `classId`, `typeId`, `weaponCategoryId`, `specialtyTypeId`). Cette story livre le mécanisme générique complet (backend `sheet-field` + composant `FieldEditPencil` réutilisable) et le câble sur un jeu représentatif couvrant les 3 catégories citées par l'AC1 (attribut, objet d'inventaire, XP) plus l'objet fétiche — suffisant pour prouver le mécanisme et satisfaire les AC telles qu'écrites. Câbler les champs restants est une extension mécanique identique (même composant, même service, un `path` différent), à traiter en post-scope si besoin réel exprimé.
- Suppression d'un objet d'inventaire par le MJ (DESIGN.md ne mentionne que "ajoute"/"édite n'importe quelle ligne existante" pour le MJ — la suppression reste propriétaire seul, cf. AC déjà couvertes par Story 6.4).

## Dev Notes

### Contexte hérité — ce que cette story NE change PAS

- `CharacterSnapshot.trigger` (enum Prisma `SnapshotTrigger`) contient déjà `LEVEL_UP` **et** `MJ_EDIT` depuis Story 6.3 (`apps/api/prisma/schema.prisma` L.313-316) — **aucune migration Prisma n'est nécessaire pour cette story**, ni pour `CharacterSnapshot` ni pour `Character`. Vérifié en lisant le schéma courant avant d'écrire cette story.
- `HistoryTab` (Story 6.3/6.5) affiche déjà correctement un instantané `MJ_EDIT` : `triggerLabel()` bascule sur `theme.tone()['evolution.mj_edit_trace']` dès que `trigger !== 'LEVEL_UP'`, et `capabilityChoice()` retourne `null` pour ce cas (`apps/web/.../history-tab/history-tab.ts` L.42-51). **Aucune modification de `HistoryTab` requise** — les instantanés créés par cette story y apparaîtront automatiquement, correctement labellisés.
- Le tone `evolution.mj_edit_trace` existe déjà dans les 3 thèmes (`apps/web/src/app/core/theme/tones.ts` L.124, 256, 386). Pas de nouvelle clé à ajouter pour ce libellé précis.
- `CharacterDto.viewerIsMj` (Story 6.5, revue de code) est déjà calculé serveur et exposé — `character-sheet.ts` expose déjà `protected readonly viewerIsMj = computed(() => !this.isOwner() && (this.character()?.viewerIsMj ?? false))` (L.115-117). **Réutiliser directement ce signal** pour gater l'affichage des `FieldEditPencil` — ne pas réinventer une heuristique, ne pas dupliquer le calcul.
- `parties.getOwned(partieId, userId)` lève déjà `ForbiddenException` si l'appelant n'est pas le MJ de cette Partie précise — c'est le seul mécanisme d'accès MJ-only du projet (AD-8, déjà utilisé par `getHistory`, `applyLevelUp` n'en a pas besoin car propriétaire-seul). Réutiliser tel quel pour `setSheetField`/`setXp` — **aucun nouveau guard NestJS**.
- Le pattern verrouillage optimiste + snapshot en **transaction** est déjà établi par `applyLevelUp` (`character.service.ts` L.524-545) : `prisma.$transaction(async (tx) => { updateMany(...); if (count===0) throw ConflictException; tx.characterSnapshot.create(...); })`. Réutiliser ce pattern à l'identique pour `setSheetField` et `setXp` — ni écriture sans snapshot, ni snapshot orphelin si le verrou échoue.

### AD-6 — les deux endpoints XP restent structurellement séparés

`PATCH /characters/:id/xp` (remplacement absolu verrouillé, MJ uniquement) et `PATCH /characters/:id/sheet-field` (patch générique par chemin JSON, MJ uniquement) sont **deux endpoints distincts, jamais fusionnés** — c'est une décision d'architecture délibérée (AD-6) pour éviter qu'un endpoint générique unique inclue `xp` en silence et contourne le flux guidé de montée de niveau. `sheet-field` a un **denylist strict** sur les segments racine `xp` et `levelUps` (400, jamais silencieusement ignoré) — c'est la seule façon de garantir qu'un MJ ne peut pas atteindre `levelUps` via `sheet-field` en contournant les contraintes du `LevelUpWizard` (somme PV+PE=3, plafond d'attribut à 12, capacité cohérente avec `LEVEL_TABLE`).

### AD-1/AD-6 — `setXp` doit déclencher EXACTEMENT la même notification que `applyXpDelta`

`CharacterService.applyXpDelta` (distribution d'XP, Story 6.2) et le nouveau `setXp` (édition MJ directe) doivent tous deux appeler la **même** vérification `pendingLevels(...)` juste après l'écriture et déclencher `EmailService.sendMail('level-up', ...)` de façon identique si elle est non vide (AD-6, "un seul point de déclenchement partagé entre les deux chemins d'écriture, pas deux implémentations séparées"). **Extraire ce bloc en une méthode privée partagée** plutôt que de dupliquer le code — cf. Task 3 pour le refactoring exact d'`applyXpDelta` (comportement inchangé, tests existants doivent continuer à passer sans modification de leurs assertions).

`applyXpDelta` reste un incrément atomique commutatif sans verrou optimiste (AD-1, explicitement exclu d'AD-9) — **ne pas toucher à ce choix**. `setXp` est à l'inverse une écriture absolue verrouillée (lecture-puis-écriture nécessaire car c'est un remplacement, pas un delta) : suit AD-9 comme toute nouvelle mutation de `Character` de ce palier.

### AD-3 — `equipment.individual` via `sheet-field` : `addedBy` et `id` forcés côté serveur

Rappel Story 6.4 : `InventoryItem { id: string; name: string; weight: number; addedBy: 'player' | 'mj' }`. `addedBy` n'est **jamais** lu depuis la valeur envoyée par le client, quel que soit le chemin d'écriture (AD-3) — la route joueur (`POST /inventory-items`) force `'player'`, cette route MJ (`sheet-field` ciblant `equipment.individual`) force `'mj'`.

**Extension nécessaire, propre à cette story** (au-delà du texte littéral d'AD-3, cohérente avec la décision Story 6.4 "`id` stable plutôt que client-supplied version", cf. mémoire projet) : `sheet-field` restreint tout chemin ciblant `equipment.individual` à exactement 3 segments (`equipment.individual.<index>`, jamais un remplacement en bloc du tableau entier) — sinon 400. Sur ce chemin :
- si `<index>` correspond à un objet déjà existant dans le tableau → le serveur **conserve l'`id` existant** de cet objet (jamais celui envoyé par le client) ;
- si `<index>` == longueur actuelle du tableau (ajout d'un nouvel objet, cf. UJ Sylas EXPERIENCE.md §7 "objet narratif reçu hors-jeu") → le serveur **génère un nouvel `id`** via `randomUUID()` (même génération que `addInventoryItem` existant) ;
- si `<index>` > longueur actuelle → 400 ("index hors limites").

Dans tous les cas, `addedBy: 'mj'` est forcé sur la valeur avant écriture, sans jamais faire confiance au contenu envoyé par le client.

### AD-7 — `validate(data, 'mj', catalog)` doit exécuter les règles réelles

Fichier `packages/game-rules/src/ryuutama/validate.ts` (lu intégralement avant d'écrire cette story) — état actuel :

```ts
export function validate(
  data: RyuutamaSheetData,
  mode: 'strict' | 'mj',
  catalog: RyuutamaCatalog,
): ValidationResult {
  if (mode === 'mj') return { valid: true, errors: [] }; // no-op réservé à P4

  const { validClasses, validTypes, validWeapons, attributePatterns } = catalog;
  const errors: ValidationError[] = [];
  // ... 5 règles (classId, typeId, attributes, weaponCategoryId, specialtyTypeId Artisan) ...
  return { valid: errors.length === 0, errors };
}
```

Le `if (mode === 'mj') return ...` court-circuite AVANT que les 5 règles ne s'exécutent — c'est exactement le no-op qu'AD-7 demande de remplacer. **Nouvelle forme** : les 5 règles s'exécutent systématiquement (calcul d'`errors` inconditionnel), seul le `valid` final diffère par mode :

```ts
export function validate(
  data: RyuutamaSheetData,
  mode: 'strict' | 'mj',
  catalog: RyuutamaCatalog,
): ValidationResult {
  const { validClasses, validTypes, validWeapons, attributePatterns } = catalog;
  const errors: ValidationError[] = [];
  // ... les 5 règles existantes, INCHANGÉES, déplacées hors du if ...
  return { valid: mode === 'strict' ? errors.length === 0 : true, errors };
}
```

**Régression connue à corriger dans le même changement** : `packages/game-rules/src/__tests__/validate.spec.ts` L.80-87 teste aujourd'hui `mode "mj" → no-op, toujours valid: true (catalog non requis)` en asserant `expect(result).toEqual({ valid: true, errors: [] })` pour un `sheetData` invalide (`classId: ''`) — ce test **cassera** après le fix (`errors` ne sera plus vide). Le mettre à jour pour refléter le nouveau contrat :

```ts
it('mode "mj" → règles réelles exécutées, mais valid: true même avec des erreurs', () => {
  const result = validate({ ...validSheet(), classId: '' }, 'mj', catalog());
  expect(result.valid).toBe(true);
  expect(result.errors.some((e) => e.field === 'classId')).toBe(true);
});

it('mode "mj" → sheetData valide → valid: true, errors: []', () => {
  const result = validate(validSheet(), 'mj', catalog());
  expect(result).toEqual({ valid: true, errors: [] });
});
```

Le commentaire `catalog non requis` de l'ancien test était trompeur (le catalog était déjà passé mais ignoré par le no-op) — en mode réel, `catalog` est bien requis et utilisé, comme en mode `strict`.

### Frontend — composant `FieldEditPencil` (nouveau, réutilisable)

Spec design (`DESIGN.md` §7, lu intégralement) :

```yaml
FieldEditPencil:
  size:            "22px × 22px"
  shape:           "{rounded.radius-input}"
  border:          "1px solid {colors.border-subtle}"
  icon:            "crayon, {colors.text-muted} par défaut, {colors.accent-2} au hover/focus"
  scope:           "un champ individuel à la fois — jamais un mode 'édition globale' de la fiche"
  save:            "confirmation inline (pas de bouton 'Enregistrer' global de la fiche)"
  trace:           "chaque édition confirmée déclenche un instantané marqué 'modifié par le MJ'"
```

Accessibilité (`EXPERIENCE.md` §8) : `aria-label="Modifier [nom du champ]"` — jamais une icône seule sans label accessible.

`Do` (EXPERIENCE.md §10) : traiter chaque `FieldEditPencil` comme un point d'édition **isolé** — jamais de "mode édition" qui déverrouille toute la fiche d'un coup (risque d'erreur explicitement écarté par l'utilisateur en Discovery).

### Frontend — où le pencil apparaît dans cette story

- 4 attributs (AGI/ESP/INT/VIG) : `character-sheet.html` L.84-90 (`sheet__attr-grid`) — `path` = `attributes.AGI` etc., `type="number"`.
- Objet fétiche : `character-sheet.html` L.224-226 (`sheet__fetish-box`) — `path` = `fetiqueObject`, `type="text"`.
- XP : `character-sheet.html` L.198 (`<span class="stat-pill">XP {{ c.xp }}</span>`) — endpoint **dédié** `setXp`, pas `sheet-field` (AD-6).
- Objets d'inventaire (édition d'une ligne existante + ajout) : `inventory-tab.ts`/`inventory-item-row.ts` — `path` = `equipment.individual.<index>`.

Tous gatés par `viewerIsMj()` (déjà exposé par `CharacterSheet`, cf. section précédente) — **jamais** affichés au propriétaire consultant sa propre fiche, ni à un fellow player non-MJ.

### Previous Story Intelligence (Story 6.5)

- Pattern d'accès à retenir (mémoire projet `jdr-avancement-paliers.md`) : toute nouvelle méthode de service doit choisir consciemment son contrôle d'accès. Ici, `setSheetField`/`setXp` sont MJ-only via `parties.getOwned` — **jamais** `getViewable` (qui autoriserait un fellow player).
- Pattern id stable établi Story 6.4 (revue de code) : ne jamais adresser une entrée de collection par position de tableau côté client sans re-vérification serveur — appliqué ici via le forçage de l'`id` sur `equipment.individual` (cf. AD-3 ci-dessus), pas une simple confiance dans l'index envoyé.
- `character.service.spec.ts` utilise une factory `makePrisma()` avec des mocks `character.updateMany`, `character.findUniqueOrThrow`, `characterSnapshot.create`, `partie.findUnique` déjà en place (réutilisés par les tests `applyLevelUp`) — les nouveaux tests `setSheetField`/`setXp` suivent le même schéma de mock, pas de nouvelle factory à écrire.
- `characters.controller.spec.ts` a déjà un pattern de tests `ValidationPipe` réels (via `Test.createTestingModule` + `app.init()`, pas juste des mocks) pour vérifier les 400 côté DTO (whitelist, champs manquants) — suivre ce même pattern pour `SetSheetFieldDto`/`SetXpDto`.

## Tasks / Subtasks

- [x] **Task 1 — `validate(data, 'mj', catalog)` exécute les règles réelles** (AC: 2)
  - [x] `packages/game-rules/src/ryuutama/validate.ts` (UPDATE) : sortir les 5 règles du `if (mode === 'mj')`, calcul d'`errors` inconditionnel, `valid: mode === 'strict' ? errors.length === 0 : true` en sortie — cf. Dev Notes AD-7 pour le diff exact.
  - [x] `packages/game-rules/src/__tests__/validate.spec.ts` (UPDATE) : remplacer le test L.80-87 par les 2 tests donnés dans Dev Notes AD-7 (mode mj avec erreurs réelles détectées mais `valid: true` ; mode mj avec sheet valide → `{ valid: true, errors: [] }`). Vérifié que les 8 tests `strict` existants passent toujours sans modification (le comportement `strict` est inchangé) — suite complète `game-rules` : 62/62.

- [x] **Task 2 — DTOs et types partagés** (AC: 1, 2, 3, 4)
  - [x] `apps/api/src/characters/dto/set-sheet-field.dto.ts` (NEW) — **2 écarts constatés par rapport au plan initial, découverts en RED/GREEN via le pipeline HTTP réel** : (1) `@IsDefined()` rejette en réalité `null` en plus d'`undefined`, contrairement à l'attente ; (2) une propriété **sans aucun décorateur** `class-validator` est invisible aux métadonnées de validation et se fait supprimer/rejeter par `whitelist: true` du `ValidationPipe` global, même déclarée sur la classe. Solution retenue : `@IsOptional()` sur `value` — inscrit la propriété dans les métadonnées (évite le rejet whitelist) sans imposer aucune contrainte de forme (accepte `null`) :
    ```ts
    import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

    export class SetSheetFieldDto {
      @IsString()
      @IsNotEmpty()
      path!: string;

      @IsOptional()
      value: unknown;
    }
    ```
    `value` accepte n'importe quelle valeur JSON (string/number/object/array/null/absente) — cohérent avec `PATCH /sheet-field { path: string, value: unknown }` (AD-6).
  - [x] `apps/api/src/characters/dto/set-xp.dto.ts` (NEW) :
    ```ts
    import { IsInt, Min } from 'class-validator';

    export class SetXpDto {
      @IsInt()
      @Min(0)
      value!: number;
    }
    ```
  - [x] `packages/shared/src/index.ts` (UPDATE) : ajouter à la suite de `ToggleNoteShareDto` :
    ```ts
    /** Payload de PATCH /characters/:id/sheet-field (AD-6, édition MJ générique). */
    export interface SetSheetFieldDto {
      path: string;
      value: unknown;
    }
    /** Réponse de PATCH /characters/:id/sheet-field : `warnings` = errors[] consultatif de `validate('mj', ...)`, jamais bloquant (AD-7/NFR3). */
    export interface SetSheetFieldResultDto {
      character: CharacterDto;
      warnings: string[];
    }
    /** Payload de PATCH /characters/:id/xp (édition MJ directe, distincte de la distribution d'XP — AD-6). */
    export interface SetXpDto {
      value: number;
    }
    ```

- [x] **Task 3 — Refactoring `applyXpDelta` : extraire `notifyPendingLevelUp`** (AC: 4)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : extraire le bloc de notification (lignes 385-412 actuelles, calcul `pendingLevels` + résolution `owner`/`partie` + `sendMail`) en une méthode privée :
    ```ts
    /**
     * Point de déclenchement UNIQUE de la notification "montée de niveau en attente" (AD-6) —
     * partagé par `applyXpDelta` (distribution) et `setXp` (édition MJ directe) : les deux chemins
     * d'écriture d'XP appellent cette même vérification juste après leur écriture respective,
     * jamais deux implémentations séparées qui pourraient diverger.
     */
    private async notifyPendingLevelUp(updated: {
      id: string;
      xp: number;
      sheetData: unknown;
      userId: string;
      partieId: string;
    }): Promise<void> {
      const sheetData = updated.sheetData as unknown as RyuutamaSheetData & {
        levelUps?: unknown[];
      };
      const pending = pendingLevels(updated.xp, sheetData.levelUps?.length ?? 0);
      if (pending.length === 0) return;

      const [owner, partie] = await Promise.all([
        this.users.findById(updated.userId),
        this.prisma.partie.findUnique({
          where: { id: updated.partieId },
          select: { name: true },
        }),
      ]);
      if (!owner) return;

      const narrative = (sheetData as any)?.narrative as { name?: string } | undefined;
      const characterName = narrative?.name?.trim() || 'Personnage sans nom';
      const link = `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${updated.partieId}/characters/${updated.id}`;

      await this.email.sendMail('level-up', owner.email, {
        characterName,
        partieName: partie?.name ?? '',
        link,
      });
    }
    ```
    `applyXpDelta` devient :
    ```ts
    async applyXpDelta(characterId: string, amount: number): Promise<void> {
      const updated = await this.prisma.character.update({
        where: { id: characterId },
        data: { xp: { increment: amount } },
      });
      await this.notifyPendingLevelUp(updated);
    }
    ```
    Comportement strictement identique — **ne modifier aucune assertion des tests `applyXpDelta()` existants** (`character.service.spec.ts` describe `'applyXpDelta()'`), ils doivent continuer à passer tels quels après ce refactor (ils testent le comportement observable — increment + email — pas la structure interne).

- [x] **Task 4 — `CharacterService.setXp`** (AC: 4, 5, 6)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter, à la suite d'`applyLevelUp` :
    ```ts
    /**
     * Édition MJ directe de l'XP (AD-6, structurellement distincte de `applyXpDelta`) : écriture
     * ABSOLUE verrouillée (AD-1/AD-9 — updateMany sur `updatedAt`, 409 si conflit), contrairement à
     * l'incrément atomique commutatif de la distribution — une lecture-puis-écriture est nécessaire
     * ici car la valeur est un remplacement, pas un delta. Crée immédiatement un
     * `CharacterSnapshot(trigger: 'MJ_EDIT')` et réutilise EXACTEMENT la même détection
     * `notifyPendingLevelUp` qu'`applyXpDelta` (AD-6) : le MJ ne peut jamais faire sauter un
     * niveau silencieusement, le joueur voit toujours sa `LevelUpBanner` et reçoit le même e-mail.
     */
    async setXp(characterId: string, userId: string, value: number): Promise<CharacterDto> {
      const character = await this.prisma.character.findUnique({ where: { id: characterId } });
      if (!character) throw new NotFoundException('Personnage introuvable');
      await this.parties.getOwned(character.partieId, userId);

      const sheetData = character.sheetData as unknown as RyuutamaSheetData;

      await this.prisma.$transaction(async (tx) => {
        const result = await tx.character.updateMany({
          where: { id: characterId, updatedAt: character.updatedAt },
          data: { xp: value },
        });
        if (result.count === 0) {
          throw new ConflictException('Le personnage a été modifié entretemps, réessayez.');
        }
        await tx.characterSnapshot.create({
          data: {
            characterId,
            sheetData: character.sheetData as any,
            derived: character.derived as any,
            level: 1 + (sheetData.levelUps?.length ?? 0),
            trigger: 'MJ_EDIT',
          },
        });
      });

      const updated = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
      await this.notifyPendingLevelUp(updated);

      // viewerIsMj: true littéral — le viewer ICI est nécessairement le MJ (garanti par
      // parties.getOwned ci-dessus), à ne pas confondre avec owner.isMj (le personnage édité
      // appartient à un JOUEUR, pas au MJ appelant).
      const owner = await this.resolveOwnerInfo(updated.userId, updated.partieId);
      return toDto(updated, owner.pseudo, owner.isMj, true);
    }
    ```
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter
    ```ts
    @Patch(':id/xp')
    setXp(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: SetXpDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.setXp(id, user.id, dto.value);
    }
    ```
    Import `SetXpDto` depuis `./dto/set-xp.dto`.
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter
    ```ts
    setXp(id: string, value: number): Promise<CharacterDto> {
      return firstValueFrom(
        this.http.patch<CharacterDto>(`${API_BASE}/characters/${id}/xp`, { value }, {
          withCredentials: true,
        }),
      );
    }
    ```

- [x] **Task 5 — `CharacterService.setSheetField` + utilitaire `setByPath`** (AC: 1, 2, 3, 6)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter, près de `normalizeInventoryIndividual` (fonction module-level, pas une méthode) :
    ```ts
    /**
     * Écrit `value` au chemin pointé par `path` (notation à points, ex. "attributes.VIG" ou
     * "equipment.individual.2") dans `obj`, en créant les structures intermédiaires manquantes
     * (objet ou tableau selon que le segment suivant est numérique). Utilisé exclusivement par
     * `setSheetField` (AD-6) — mécanisme générique volontairement minimal, pas de validation de
     * forme ici (délégué à `validate('mj', ...)`, consultatif, cf. AD-7).
     */
    function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
      const segments = path.split('.');
      let cursor: any = obj;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (cursor[seg] === undefined || cursor[seg] === null) {
          const nextSeg = segments[i + 1];
          cursor[seg] = /^\d+$/.test(nextSeg) ? [] : {};
        }
        cursor = cursor[seg];
      }
      cursor[segments[segments.length - 1]] = value;
    }
    ```
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter, à la suite de `setXp` :
    ```ts
    /**
     * Édition MJ générique d'un champ de `sheetData` (AD-6/AD-7) : accès MJ-only (AD-8), denylist
     * strict sur `xp`/`levelUps` (AD-6 — ces sous-arbres ne sont accessibles que via `setXp`/
     * `applyLevelUp`), `equipment.individual` traité spécialement (AD-3 : `addedBy`/`id` forcés
     * serveur, jamais confiance dans le client). `validate('mj', ...)` reste consultatif (AD-7) —
     * les `warnings` retournés n'empêchent jamais l'écriture. Verrouillage optimiste + snapshot en
     * transaction (AD-9), même pattern qu'`applyLevelUp`.
     */
    async setSheetField(
      characterId: string,
      userId: string,
      dto: SetSheetFieldDto,
    ): Promise<SetSheetFieldResultDto> {
      const segments = dto.path.split('.');
      if (segments[0] === 'xp' || segments[0] === 'levelUps') {
        throw new BadRequestException(
          "Les champs xp et levelUps ne sont pas éditables via ce mécanisme : utilisez PATCH /xp ou POST /level-up",
        );
      }

      const character = await this.prisma.character.findUnique({ where: { id: characterId } });
      if (!character) throw new NotFoundException('Personnage introuvable');
      await this.parties.getOwned(character.partieId, userId);

      const sheetData = character.sheetData as unknown as RyuutamaSheetData;
      let value = dto.value;

      if (segments[0] === 'equipment' && segments[1] === 'individual') {
        if (segments.length !== 3 || !/^\d+$/.test(segments[2])) {
          throw new BadRequestException(
            'Le chemin doit cibler un objet précis : equipment.individual.<index>',
          );
        }
        const index = Number(segments[2]);
        const individual = normalizeInventoryIndividual(sheetData.equipment?.individual);
        if (index > individual.length) {
          throw new BadRequestException('Index hors limites');
        }
        const id = index < individual.length ? individual[index].id : randomUUID();
        value = { ...(value as Record<string, unknown>), id, addedBy: 'mj' as const };
      }

      setByPath(sheetData as unknown as Record<string, unknown>, dto.path, value);
      const derived = computeDerived(sheetData);
      const catalog = await this.buildRyuutamaCatalog(character.gameSystemId);
      const result = validate(sheetData, 'mj', catalog);

      await this.prisma.$transaction(async (tx) => {
        const updateResult = await tx.character.updateMany({
          where: { id: characterId, updatedAt: character.updatedAt },
          data: { sheetData: sheetData as any, derived: derived as any },
        });
        if (updateResult.count === 0) {
          throw new ConflictException('Le personnage a été modifié entretemps, réessayez.');
        }
        await tx.characterSnapshot.create({
          data: {
            characterId,
            sheetData: sheetData as any,
            derived: derived as any,
            level: 1 + (sheetData.levelUps?.length ?? 0),
            trigger: 'MJ_EDIT',
          },
        });
      });

      const updated = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
      const owner = await this.resolveOwnerInfo(updated.userId, updated.partieId);
      return {
        character: toDto(updated, owner.pseudo, owner.isMj, true),
        warnings: result.errors.map((e) => e.message),
      };
    }
    ```
    Import `SetSheetFieldDto`/`SetSheetFieldResultDto` depuis `@master-jdr/shared` (types) et `./dto/set-sheet-field.dto` (classe DTO validée par Nest).
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter
    ```ts
    @Patch(':id/sheet-field')
    setSheetField(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: SetSheetFieldDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.setSheetField(id, user.id, dto);
    }
    ```
    Import `SetSheetFieldDto` depuis `./dto/set-sheet-field.dto`.
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter
    ```ts
    setSheetField(id: string, path: string, value: unknown): Promise<SetSheetFieldResultDto> {
      return firstValueFrom(
        this.http.patch<SetSheetFieldResultDto>(
          `${API_BASE}/characters/${id}/sheet-field`,
          { path, value },
          { withCredentials: true },
        ),
      );
    }
    ```
    Importer `SetSheetFieldResultDto` depuis `@master-jdr/shared`.

- [x] **Task 6 — Tests backend `setSheetField`/`setXp`** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE) : `describe('setXp()', ...)` couvrant : 403 si non-MJ de la Partie (y compris MJ d'une autre Partie — `parties.getOwned` rejette) ; 409 si `updatedAt` périmé (`prisma.character.updateMany` retourne `{ count: 0 }`) ; succès → `updateMany` appelé avec la valeur absolue (pas un increment), `characterSnapshot.create` appelé avec `trigger: 'MJ_EDIT'` et le bon `level` ; franchissement de seuil → `email.sendMail` appelé (réutiliser le mock `pendingLevels` déjà utilisé par les tests `applyXpDelta`) ; pas de franchissement → pas d'e-mail. `describe('setSheetField()', ...)` couvrant : 403 si non-MJ ; 400 si `path` commence par `xp` ou `levelUps` (2 cas séparés) ; 409 sur conflit `updatedAt` ; succès sur un champ simple (ex. `fetiqueObject`) → `warnings: []` si sheet reste valide selon `validate('mj', ...)` (mocker `validate` pour retourner `{ valid: true, errors: [] }`) ; succès avec `warnings` non vides si `validate` mocké retourne des `errors` (vérifier que l'écriture a quand même lieu — jamais bloquant, AD-7) ; `equipment.individual` : ajout (`index === individual.length`) génère un nouvel `id`, édition d'un index existant conserve l'`id` d'origine, `addedBy` forcé à `'mj'` dans les deux cas même si `dto.value.addedBy` envoyé par le "client" du test vaut `'player'` ; `index` hors limites → 400 ; chemin `equipment.individual` sans index (2 segments) → 400.
  - [x] `apps/api/src/characters/characters.controller.spec.ts` (UPDATE) : ajouter `setXp`/`setSheetField` à `makeCharacterService()`, tests de délégation (paramètres transmis tels quels), tests `ValidationPipe` réels : `SetXpDto` rejette une valeur non-entière ou négative (400) ; `SetSheetFieldDto` rejette un body sans `path` ou avec `value` absent (`undefined`) mais accepte `value: null` (400/200 respectivement) ; whitelist rejette un champ supplémentaire non déclaré.

- [x] **Task 7 — Composant `FieldEditPencil` (réutilisable)** (AC: 1)
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts` (NEW) :
    ```ts
    import { Component, input, output, signal } from '@angular/core';
    import { MatButtonModule } from '@angular/material/button';

    @Component({
      selector: 'app-field-edit-pencil',
      standalone: true,
      imports: [MatButtonModule],
      templateUrl: './field-edit-pencil.html',
      styleUrl: './field-edit-pencil.scss',
    })
    export class FieldEditPencil {
      /** Nom du champ pour l'aria-label ("Modifier [label]") — DESIGN.md/EXPERIENCE.md §8. */
      readonly label = input.required<string>();
      readonly value = input.required<string | number>();
      readonly type = input<'text' | 'number'>('text');
      readonly confirm = output<string | number>();

      protected readonly editing = signal(false);
      protected readonly draft = signal<string | number>('');

      protected startEdit(): void {
        this.draft.set(this.value());
        this.editing.set(true);
      }

      protected cancel(): void {
        this.editing.set(false);
      }

      protected onInput(raw: string | number): void {
        this.draft.set(this.type() === 'number' ? Number(raw) : raw);
      }

      protected submit(): void {
        const value = this.draft();
        this.editing.set(false);
        this.confirm.emit(value);
      }
    }
    ```
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.html` (NEW) : scope isolé — état par défaut un simple bouton crayon (`aria-label="Modifier " + label()`, 22×22px, `{colors.text-muted}` par défaut / `{colors.accent-2}` au hover-focus, `1px solid {colors.border-subtle}`, `{rounded.radius-input}`) ; état `editing()` un input inline (`[type]="type()"`) + 2 boutons "Valider"/"Annuler" (confirmation inline, jamais de bouton "Enregistrer" global — DESIGN.md).
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.scss` (NEW) : tokens ci-dessus, cohérents avec les autres composants Story 6.x (`inventory-item-row.scss` comme référence de forme).
  - [x] `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.spec.ts` (NEW) : bouton crayon visible par défaut avec le bon `aria-label` ; clic → passe en mode édition, input pré-rempli avec `value()` ; "Valider" émet `confirm` avec la valeur du draft (cast en `number` si `type="number"`) et repasse en mode lecture ; "Annuler" repasse en mode lecture sans émettre `confirm`, sans avoir modifié `value()` affichée (le composant est contrôlé — pas de mutation locale persistée après annulation).

- [x] **Task 8 — Câblage attributs, objet fétiche, XP** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (UPDATE) : importer `FieldEditPencil`, ajouter au tableau `imports`. Ajouter :
    ```ts
    protected readonly fieldEditWarning = signal<string | null>(null);
    protected readonly fieldEditError = signal<string | null>(null);

    protected async submitFieldEdit(path: string, value: string | number): Promise<void> {
      const c = this.character();
      if (!c) return;
      this.fieldEditError.set(null);
      this.fieldEditWarning.set(null);
      try {
        const result = await this.characterSvc.setSheetField(c.id, path, value);
        this.character.set(result.character);
        if (result.warnings.length > 0) {
          this.fieldEditWarning.set(result.warnings.join(' '));
        }
      } catch {
        this.fieldEditError.set(this.theme.tone()['evolution.mj_edit_error']);
      }
    }

    protected async submitXpEdit(value: string | number): Promise<void> {
      const c = this.character();
      if (!c) return;
      this.fieldEditError.set(null);
      try {
        this.character.set(await this.characterSvc.setXp(c.id, Number(value)));
      } catch {
        this.fieldEditError.set(this.theme.tone()['evolution.mj_edit_error']);
      }
    }
    ```
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (UPDATE) :
    - Bloc attributs (L.84-90, `sheet__attr-grid`) : ajouter, à côté de chaque `sheet__attr-val`, `@if (viewerIsMj()) { <app-field-edit-pencil [label]="attr + ' (' + key + ')'" [value]="attrs[key]" type="number" (confirm)="submitFieldEdit('attributes.' + key, $event)" /> }` (boucler sur les 4 clés `AGI/ESP/INT/VIG` — le template actuel a probablement 4 blocs quasi identiques, un par attribut, cf. lecture du fichier complet en dev-story avant modification).
    - Objet fétiche (L.224-226) : `@if (fetiqueObject() || viewerIsMj()) { <p class="sheet__fetish-box">Objet fétiche : {{ fetiqueObject() }} @if (viewerIsMj()) { <app-field-edit-pencil label="l'objet fétiche" [value]="fetiqueObject() ?? ''" (confirm)="submitFieldEdit('fetiqueObject', $event)" /> } </p> }` — le pencil doit rester accessible même si `fetiqueObject()` est vide (le MJ doit pouvoir en RENSEIGNER un, pas seulement en corriger un existant), donc la garde d'affichage du bloc devient `fetiqueObject() || viewerIsMj()` au lieu de `fetiqueObject()` seul.
    - XP (L.198) : `<span class="stat-pill">XP {{ c.xp }} @if (viewerIsMj()) { <app-field-edit-pencil label="l'XP" [value]="c.xp" type="number" (confirm)="submitXpEdit($event)" /> } </span>`.
    - Afficher `fieldEditWarning()`/`fieldEditError()` en bandeau non bloquant près du haut de la fiche (nouvelle clé de thème, cf. Task 10) — disparaît à la prochaine édition réussie sans warning (déjà géré par le `set(null)` en début de `submitFieldEdit`).
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (UPDATE) : tests `viewerIsMj() === true` → pencils attributs/fétiche/XP visibles, `viewerIsMj() === false` (propriétaire OU fellow player) → absents ; `submitFieldEdit` appelle `characterSvc.setSheetField` avec le bon `path`, met à jour `character()` avec `result.character`, affiche `result.warnings` si non vide ; `submitXpEdit` appelle `characterSvc.setXp`, met à jour `character()` — vérifier qu'un franchissement de niveau simulé (le `CharacterDto` retourné a un `xp` plus élevé) laisse `LevelUpBanner`/`levelForXp` réagir normalement (pas de logique dupliquée ici, `LevelUpBanner` dérive déjà son état de `character().xp`, cf. Story 6.3) ; erreur réseau sur l'un ou l'autre → `fieldEditError()` affiché.

- [x] **Task 9 — Câblage inventaire MJ (édition + ajout)** (AC: 1, 2, 3, 5, 6)
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts` (UPDATE) : séparer les droits d'action — `editable` reste tel quel (déclenche `edit`, utilisé par propriétaire ET MJ) mais ajouter `readonly removable = input(false)` (propriétaire seul — DESIGN.md ne mentionne que "ajoute"/"édite" pour le MJ, jamais "supprime").
    ```ts
    readonly removable = input(false);
    ```
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html` (UPDATE) : le bouton "Supprimer l'objet" (L.9) passe de `@if (editable())` à `@if (removable())`. Le bouton "Modifier" reste sous `@if (editable())`.
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (UPDATE) : ajouter `readonly viewerIsMj = input(false)`. Généraliser `editingId`/`editName`/`editWeight` (déjà génériques, pas de renommage nécessaire) pour être déclenchés soit par le propriétaire (endpoints `updateInventoryItem` existants, inchangés) soit par le MJ. Ajouter :
    ```ts
    protected async submitMjEdit(itemId: string): Promise<void> {
      const name = this.editName().trim();
      if (!name || this.submitting()) return;
      const index = this.individual().findIndex((i) => i.id === itemId);
      if (index === -1) return;
      this.submitting.set(true);
      this.error.set(null);
      try {
        const result = await this.characterSvc.setSheetField(
          this.character().id,
          `equipment.individual.${index}`,
          { name, weight: this.editWeight() ?? 0 },
        );
        this.characterUpdated.emit(result.character);
        this.editingId.set(null);
      } catch {
        this.error.set(this.theme.tone()['evolution.inventory_error']);
      } finally {
        this.submitting.set(false);
      }
    }

    protected async submitMjAdd(): Promise<void> {
      const name = this.newItemName().trim();
      if (!name || this.submitting()) return;
      this.submitting.set(true);
      this.error.set(null);
      try {
        const result = await this.characterSvc.setSheetField(
          this.character().id,
          `equipment.individual.${this.individual().length}`,
          { name, weight: this.newItemWeight() ?? 0 },
        );
        this.characterUpdated.emit(result.character);
        this.newItemName.set('');
        this.newItemWeight.set(undefined);
      } catch {
        this.error.set(this.theme.tone()['evolution.inventory_error']);
      } finally {
        this.submitting.set(false);
      }
    }
    ```
    `submitAdd`/`submitEdit` existants (propriétaire) restent **inchangés** — ce sont deux chemins d'écriture distincts qui convergent seulement sur `characterUpdated.emit(...)`.
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` (UPDATE) :
    - `<app-inventory-item-row [editable]="isOwner() || viewerIsMj()" [removable]="isOwner()" ... />` — le clic "Modifier" reste `startEdit(item)` (générique) ; le bouton "Valider" du formulaire d'édition inline distingue `isOwner() ? submitEdit(item.id) : submitMjEdit(item.id)`.
    - Ajouter un second formulaire d'ajout, visible `@if (viewerIsMj())`, structure identique au formulaire propriétaire (L.41-59) mais `(submit)="submitMjAdd()"`, avec un libellé de bouton dédié (cf. Task 10, `evolution.inventory_mj_add_cta`).
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (UPDATE) : passer `[viewerIsMj]="viewerIsMj()"` à `<app-inventory-tab>`.
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.spec.ts` (UPDATE) : `viewerIsMj: true` → pencil "Modifier" visible sur chaque ligne (mais pas "Supprimer"), formulaire d'ajout MJ visible ; `submitMjEdit` appelle `setSheetField` avec `equipment.individual.<index correct>` ; `submitMjAdd` appelle `setSheetField` avec `equipment.individual.<longueur actuelle>` ; propriétaire (`isOwner: true, viewerIsMj: false`) → comportement inchangé (régression), boutons "Modifier"+"Supprimer" visibles, formulaire d'ajout propriétaire visible, `submitEdit`/`submitAdd` toujours appelés (pas `setSheetField`).
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.spec.ts` (UPDATE) : nouveaux cas `removable: false` → bouton "Supprimer" absent même si `editable: true` ; `removable: true, editable: true` → les deux boutons visibles (régression propriétaire).

- [x] **Task 10 — Thème : nouvelles clés `evolution.*`** (AC: 1, 2)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : ajouter, dans les 3 thèmes (Grimoire Émeraude, Forêt Ancienne, Médiéval Steampunk — mêmes clés, texte adapté au registre de chaque thème comme pour toutes les clés `evolution.*` existantes) :
    ```ts
    'evolution.mj_edit_error': "L'édition n'a pas pu être enregistrée. Réessayez.",
    'evolution.mj_edit_warning_prefix': 'Avertissement : ',
    'evolution.inventory_mj_add_cta': '+ Ajouter un objet (MJ)',
    ```
    (`mj_edit_error` et `inventory_mj_add_cta` textes indicatifs à adapter par thème comme les clés voisines déjà présentes ; `mj_edit_warning_prefix` peut rester identique dans les 3 thèmes si le registre le permet — vérifier cohérence avec les autres préfixes/labels du thème concerné avant de trancher.)

### Review Findings

- [x] [Review][Patch] Index d'inventaire client non revérifié côté serveur (édition MJ concurrente) [apps/api/src/characters/character.service.ts:setSheetField, apps/web/.../inventory-tab.ts:submitMjEdit] — **Décision (Incon, revue du 2026-07-11)** : vérifier l'`id` côté serveur. Le client doit envoyer l'`id` de l'objet visé en plus de l'index (`equipment.individual.<index>`) ; le serveur compare `individual[index]?.id` à cet `id` attendu avant d'écrire, et rejette (400) si l'objet à cet index n'est plus celui visé (item supprimé/déplacé entretemps). Contexte : `submitMjEdit` calcule l'index depuis le cache local du client et l'envoie tel quel — le verrouillage optimiste (`updatedAt`) ne protège que contre une écriture concurrente pendant la transaction, pas contre un index devenu obsolète avant la requête (contredit la note "Previous Story Intelligence" de cette story : "ne jamais adresser une entrée de collection par position de tableau côté client sans re-vérification serveur").

- [x] [Review][Patch] Pollution de prototype via `setByPath` (segments `__proto__`/`constructor`/`prototype` non filtrés) [apps/api/src/characters/character.service.ts:96-112] — `setByPath` ne filtre aucun segment de chemin. Un MJ authentifié peut envoyer `path: "__proto__.polluted"` : `cursor['__proto__']` résout vers `Object.prototype` (pas `undefined`), donc la branche de création de structure est court-circuitée et l'affectation finale écrit directement sur `Object.prototype`, pour tout le process Node — vulnérabilité de pollution de prototype exploitable par n'importe quel MJ, sans lien avec le denylist `xp`/`levelUps` (qui ne filtre que `segments[0]`).
- [x] [Review][Patch] Contournement d'AD-3 via le chemin `equipment` à 1 segment [apps/api/src/characters/character.service.ts:686-706] — le bloc spécial protégeant `equipment.individual.<index>` (forçage `id`/`addedBy`) ne se déclenche que si `segments[1] === 'individual'`. Un `path: "equipment"` (1 segment) contourne entièrement ce bloc et va droit dans `setByPath`, permettant à un MJ de remplacer tout `sheetData.equipment` (y compris le tableau `individual`) par une valeur arbitraire, sans forçage serveur d'`id`/`addedBy` — contredit directement l'AD-3 explicite de cette story ("addedBy forcé... sans jamais faire confiance au contenu envoyé par le client"). Aucun test ne couvre ce chemin à 1 segment.
- [x] [Review][Patch] Index non canonique ("01", "007"...) accepté par la regex mais silencieusement perdu à l'écriture [apps/api/src/characters/character.service.ts:686-706] — `/^\d+$/` matche `"01"`, `Number("01")` donne bien `1` pour les vérifications de bornes, mais `setByPath` utilise le segment de chaîne brut (`"01"`) comme clé, donc `cursor['01'] = value` crée une propriété non-index sur le tableau. `JSON.stringify`/Prisma ne sérialisent que les index numériques canoniques (0,1,2...) — la modification du MJ est silencieusement perdue alors que l'API répond 200 et crée un instantané.
- [x] [Review][Patch] `value` non typé avant `spread` sur `equipment.individual` → items d'inventaire corrompus [apps/api/src/characters/character.service.ts:701-705] — `value = { ...(value as Record<string, unknown>), id, addedBy: 'mj' }` sans vérifier que `dto.value` est bien un objet simple. Une valeur `string`/`number`/`array`/`null` produit un objet malformé (`spread` d'une chaîne = propriétés numérotées par caractère, `spread` de `null`/nombre = `{}`) persisté tel quel — `validate('mj', ...)` est non bloquant donc ne l'empêche pas.
- [x] [Review][Patch] Exception non gérée (500) si un chemin traverse une valeur scalaire existante [apps/api/src/characters/character.service.ts:96-112, 714] — un chemin du type `attributes.VIG.x` fait traverser `setByPath` dans un nombre existant ; en mode strict TypeScript, l'affectation d'une propriété sur un primitif lève une `TypeError` non interceptée → 500 au lieu d'un 400 propre. `computeDerived(sheetData)` (appelé juste après, ligne 714) est également exposé à des données de forme inattendue sans garde.
- [x] [Review][Patch] Denylist `xp`/`levelUps` vérifié avant l'autorisation MJ → 400 au lieu du 403 attendu par l'AC5 [apps/api/src/characters/character.service.ts:673-682] — pour un appelant non-MJ (ou MJ d'une autre Partie) envoyant `path: "xp"` via `sheet-field`, le rejet 400 du denylist intervient avant `parties.getOwned(...)`, donc avant toute vérification d'autorisation — contredit la lettre de l'AC5 ("je tente une édition MJ sur ce personnage (sheet-field ou xp), je reçois une erreur 403"). Confirmé par le test du diff lui-même (`expect(parties.getOwned).not.toHaveBeenCalled()`).
- [x] [Review][Patch] `SetSheetFieldDto.path` sans borne de longueur/segments [apps/api/src/characters/dto/set-sheet-field.dto.ts] — aucun `@MaxLength`/limite de segments ; combiné aux findings ci-dessus, un chemin très long fait construire un nombre non borné de structures imbriquées vides dans `sheetData` avant tout rejet.
- [x] [Review][Patch] `FieldEditPencil.onInput` transforme silencieusement un champ numérique vidé en `0` [apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts] — `Number('')` vaut `0` (pas `NaN`), donc vider le champ puis valider soumet `0` comme si c'était une valeur intentionnelle. Même classe de bug déjà corrigée une fois dans ce projet pour le poids d'objet d'inventaire (`inventory-tab.ts`, `onEditWeightInput`, garde `Number.isNaN`) — à répliquer ici.
- [x] [Review][Patch] `submitMjEdit` : item introuvable (`findIndex === -1`) échoue silencieusement, formulaire reste bloqué ouvert [apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts] — si l'objet a été supprimé entretemps, la méthode retourne sans message d'erreur ni réinitialisation d'`editingId()` : le formulaire d'édition reste affiché indéfiniment sans retour utilisateur.
- [x] [Review][Defer] Pas de rafraîchissement du personnage local après une erreur 409 sur édition de champ [apps/web/.../character-sheet.ts, inventory-tab.ts] — deferred, pre-existing : ce pattern (afficher un message d'erreur générique sans recharger l'état local après un conflit optimiste) est déjà celui utilisé ailleurs dans l'app pour d'autres flux d'écriture ; corriger cela proprement est un changement transverse hors du scope de cette story.

## Dev Agent Record

### Context Reference

- `_bmad-output/planning-artifacts/epics.md` Story 6.6 (source des AC)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md` §4.6, FR-14
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md` AD-1, AD-3, AD-6, AD-7, AD-8, AD-9
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md` §7 FieldEditPencil, InventoryItemRow
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md` §4, §7, §8, §10
- `_bmad-output/implementation-artifacts/6-5-journal-notes-personnelles.md` (story précédente, patterns d'accès/verrouillage/snapshot réutilisés)

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log

- Cette session a repris la story déjà `in-progress` avec les Tasks 1-8 marquées faites (code déjà présent). Vérifié le code existant contre les Dev Notes avant de continuer : conforme.
- Task 9 : `inventory-item-row.ts/html/spec.ts` étaient déjà entièrement câblés (input `removable`, template, tests régression). `inventory-tab.ts` avait déjà `viewerIsMj`, `submitMjEdit`, `submitMjAdd` et le template listant les lignes avec `[editable]`/`[removable]` corrects. Manquant : (1) le second formulaire d'ajout MJ (`.inventory-tab__mj-add-form`) dans `inventory-tab.html`, requis par les tests déjà écrits dans `inventory-tab.spec.ts` ; (2) le binding `[viewerIsMj]="viewerIsMj()"` sur `<app-inventory-tab>` dans `character-sheet.html`. Ajoutés les deux.
- Task 10 : clés `evolution.mj_edit_error`, `evolution.mj_edit_warning_prefix`, `evolution.inventory_mj_add_cta` absentes des 3 thèmes (déjà référencées par `character-sheet.ts`/`inventory-tab.html`). Ajoutées dans `tones.ts`, texte adapté au registre de chaque thème (Grimoire Émeraude neutre, Forêt Ancienne "Guide"/besace, Médiéval Steampunk "composant"/fret).
- Suite complète : web 52/52 fichiers, 430/430 tests ✅ ; api 23/23 suites, 385/385 tests ✅.
- `pnpm lint` (web) : 45 erreurs prettier détectées, dont 14 dans des fichiers non touchés par cette story (dette préexistante : `level-up-wizard.ts/.spec.ts`, `roster-rail.spec.ts`, `history-tab.spec.ts`, `capability-label.util.spec.ts`). Corrigé via `eslint --fix` uniquement les fichiers modifiés par cette story (0 erreur restante sur ces fichiers) ; suite de tests web re-vérifiée après fix (430/430 toujours au vert).
- `pnpm lint` (api) : 804 problèmes preexistants (`@typescript-eslint/no-unsafe-*`), répartis sur des fichiers jamais touchés par cette story (`poll.service.ts`, `xp-distributions.service.ts`) et sur des lignes de `character.service.ts` très en dehors du code ajouté ici — dette systémique du projet (mode strict TS activé globalement à un palier antérieur), non introduite par cette story. Le nouveau code (`setByPath`, `setSheetField`, `setXp`) suit exactement le même style que le reste du fichier (déjà truffé d'accès `any` sur `sheetData`/`Prisma.JsonValue`) — pas de régression, pas de nouvelle divergence de style. Non traité (hors scope, correction massive de dette non demandée).

### Completion Notes

- Story 6.6 complète : mécanisme générique MJ (`PATCH /characters/:id/sheet-field` + `PATCH /characters/:id/xp`) livré et câblé sur le jeu représentatif prévu (attributs, objet fétiche, XP, inventaire individuel — édition + ajout).
- Les 6 AC sont couvertes : édition champ-par-champ isolée (AC1), snapshot `MJ_EDIT` + validation non bloquante (AC2), denylist `xp`/`levelUps` sur `sheet-field` (AC3), notification de montée de niveau partagée entre `applyXpDelta`/`setXp` (AC4), 403 MJ-only via `parties.getOwned` (AC5), 409 verrouillage optimiste (AC6).
- Hors-scope explicitement délimité par la story (diff visuel, validation par champ différenciée, câblage exhaustif de tous les champs scalaires, suppression MJ d'un objet d'inventaire) — non traité, conforme.
- **Revue de code (2026-07-11, 3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor)** : 2 vulnérabilités critiques découvertes et corrigées — pollution de prototype via `setByPath` (segments `__proto__`/`constructor`/`prototype` non filtrés) et contournement d'AD-3 via `path: "equipment"` (1 segment, hors `equipment.individual.<index>`). 8 autres correctifs appliqués : index non canonique silencieusement perdu, `value` non typé avant spread sur `equipment.individual`, exception non gérée (500) sur traversée de scalaire, ordre denylist/autorisation (400 au lieu de 403 pour un non-MJ, AC5), borne de longueur sur `SetSheetFieldDto.path`, coercition silencieuse `Number('') === 0` dans `FieldEditPencil`, `submitMjEdit` bloqué silencieusement si l'item a disparu, et — décision utilisateur — vérification serveur de l'`id` attendu pour l'édition d'un objet d'inventaire par index (le client envoie désormais `id` en plus de l'index, le serveur rejette avec 409 si l'objet a changé entretemps). 1 point différé (rafraîchissement du personnage local après 409, pattern déjà existant ailleurs dans l'app, hors scope). Détail complet dans la section "Review Findings" ci-dessous. Tests : +6 backend (`character.service.spec.ts`), +1 frontend (`field-edit-pencil.spec.ts`) ; suite complète re-vérifiée après application des correctifs : api 391/391 ✅, web 431/431 ✅.

### File List

- `apps/api/src/characters/character.service.ts` (M)
- `apps/api/src/characters/character.service.spec.ts` (M)
- `apps/api/src/characters/characters.controller.ts` (M)
- `apps/api/src/characters/characters.controller.spec.ts` (M)
- `apps/api/src/characters/dto/set-sheet-field.dto.ts` (A)
- `apps/api/src/characters/dto/set-xp.dto.ts` (A)
- `apps/web/src/app/core/characters/character.service.ts` (M)
- `apps/web/src/app/core/theme/tones.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.html` (A)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html` (M)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.spec.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` (M)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.spec.ts` (M)
- `packages/game-rules/src/ryuutama/validate.ts` (M)
- `packages/game-rules/src/__tests__/validate.spec.ts` (M)
- `packages/shared/src/index.ts` (M)

## Change Log

- 2026-07-11 : Story 6.6 complète (Tasks 1-10). Backend `setSheetField`/`setXp` MJ-only avec verrouillage optimiste + snapshot `MJ_EDIT` (AD-6/AD-7/AD-8/AD-9) ; `validate(..., 'mj', ...)` exécute désormais les règles réelles en mode consultatif (AD-7) ; composant `FieldEditPencil` réutilisable câblé sur attributs/objet fétiche/XP/inventaire ; câblage inventaire MJ (édition + ajout, jamais suppression) ; nouvelles clés de thème `evolution.mj_edit_error`/`mj_edit_warning_prefix`/`inventory_mj_add_cta`. Statut → review.
- 2026-07-11 : Revue de code appliquée — durcissement de `setSheetField`/`setByPath` (pollution de prototype, contournement AD-3, index non canonique, type de `value`, gestion d'erreur), vérification serveur de l'id d'inventaire attendu, correction `FieldEditPencil` (champ numérique vidé), correction `submitMjEdit` (item disparu). Statut → done.
