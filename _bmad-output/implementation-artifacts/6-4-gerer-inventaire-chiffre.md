---
baseline_commit: 930db0f163186d81533f2155db2096a5bbe1b1e7
---

# Story 6.4: Gérer son inventaire chiffré

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want ajouter, modifier et retirer des objets de mon inventaire avec leur poids, et voir mon encombrement total,
so that je sais si mon personnage est en surcharge sans recalculer moi-même le poids de mon sac.

## ⚠️ Prérequis : Story 6.3 (déjà `done`)

Cette story réutilise sans modification les patterns posés par la 6.3 dans `CharacterService` (`getOwnCharacterOrThrow`, verrou optimiste `updateMany`/`updatedAt`/409, `resolveOwnerInfo`, `toDto`) et le principe "pas de snapshot pour toute mutation" déjà appliqué à l'inventaire/notes par PRD FR-12. Aucun nouveau modèle Prisma requis — cette story ne touche que `sheetData.equipment.individual` (JSON existant).

## Acceptance Criteria

1. **Given** je suis propriétaire d'un personnage et j'ouvre l'onglet/section Inventaire de sa fiche, **When** la page se charge, **Then** je vois une `EncumbranceBar` (poids total individuel / limite dérivée, toujours affichés en texte) suivie de la liste de mes objets (`InventoryItemRow`, nom + poids). [Source: epics.md Story 6.4 AC1, UX-DR7/UX-DR8]
2. **Given** je remplis le formulaire d'ajout (nom, poids optionnel), **When** je valide sans saisir de poids, **Then** l'objet est ajouté avec un poids de 0, sans bloquer l'ajout ; le champ `addedBy` est forcé à `'player'` côté serveur quoi que j'envoie dans la requête (rejeté 400 si le body contient explicitement `addedBy`, cf. AD-3). [Source: epics.md Story 6.4 AC2, FR-9, AD-3]
3. **Given** le poids total de mon inventaire individuel dépasse ma limite d'encombrement, **When** je consulte l'onglet Inventaire, **Then** `EncumbranceBar` passe en dégradé rouge/ambre avec un label texte "Surchargé" (jamais la couleur seule) — sans jamais bloquer l'ajout d'un nouvel objet. [Source: epics.md Story 6.4 AC3, FR-10, UX-DR7]
4. **Given** je modifie ou retire un objet existant, **When** je confirme le changement, **Then** la mise à jour est appliquée avec verrouillage optimiste (NFR1) et **ne crée pas** d'instantané dans l'historique (cf. FR12). [Source: epics.md Story 6.4 AC4, NFR1, FR-12]
5. **Given** des personnages créés avant ce palier ont un inventaire au format texte libre (`equipment.individual: string[]`), **When** le déploiement de cette story a lieu, **Then** un script de migration one-off convertit chaque entrée existante en `{name, weight: 0, addedBy: 'player'}` **avant** le redémarrage de l'API — jamais de fenêtre où le nouveau code lit l'ancien format. [Source: epics.md Story 6.4 AC5, AD-3]

**Hors scope de cette story** (couvert par la Story 6.6) : édition MJ d'un objet d'inventaire via `FieldEditPencil`/`PATCH /characters/:id/sheet-field` — cette story n'implémente que les 3 endpoints joueur (`POST`/`PATCH`/`DELETE /characters/:id/inventory-items[/:itemId]`). Le badge de provenance "ajouté par le MJ" (`InventoryItemRow`, `addedBy: 'mj'`) doit être **affiché** si la donnée existe déjà (défensif, cohérent avec le type `InventoryItem`), mais aucun chemin d'écriture ne produit `addedBy: 'mj'` dans cette story — normal qu'aucun objet n'ait ce badge tant que la 6.6 n'est pas livrée.

## Tasks / Subtasks

- [x] **Task 1 — Types partagés : `InventoryItem`** (AC: 1, 2, 5)
  - [x] `packages/game-rules/src/ryuutama/types.ts` (UPDATE) : remplacer
    ```ts
    equipment?: { individual: string[]; group: string[] };
    ```
    par
    ```ts
    export interface InventoryItem {
      name: string;
      weight: number;
      addedBy: 'player' | 'mj';
    }
    // ...
    equipment?: { individual: InventoryItem[]; group: string[] };
    ```
    `group` reste `string[]` inchangé (PRD Non-Goals : pas de poids sur l'équipement de groupe en v1). Exporter `InventoryItem` depuis `packages/game-rules/src/index.ts` (`export type { InventoryItem } from './ryuutama/types.ts';`, à ajouter au bloc `export type { RyuutamaSheetData, ... }` existant).
  - [x] `packages/shared/src/index.ts` (UPDATE) : ajouter, à la suite de `CreateLevelUpDto` :
    ```ts
    /** Payload de POST /characters/:id/inventory-items. `addedBy` n'existe pas dans ce type —
     * forcé côté serveur, jamais accepté du client (AD-3). */
    export interface CreateInventoryItemDto {
      name: string;
      weight?: number; // absent → 0 côté serveur
    }
    /** Payload de PATCH /characters/:id/inventory-items/:itemId — partiel, au moins un champ. */
    export interface UpdateInventoryItemDto {
      name?: string;
      weight?: number;
    }
    ```
    Ne **pas** exposer `InventoryItem` (avec `addedBy`) dans `packages/shared` — ce type vit dans `@master-jdr/game-rules` (même règle que `CapabilityType`, cf. Dev Notes Story 6.3 : `packages/shared` ne doit pas dépendre de `packages/game-rules`). Le frontend n'a besoin que des payloads de requête ; pour lire `addedBy` en affichage, il caste `sheetData` en `any` comme le fait déjà `character-sheet.ts` pour `levelUps` (cf. Task 9).

- [x] **Task 2 — Migration one-off `equipment.individual: string[] → InventoryItem[]`** (AC: 5)
  - [x] `apps/api/src/characters/migrate-inventory-format.ts` (NOUVEAU) : fonction pure testable, même pattern que `apps/api/src/prisma/seed-admin.ts` (config/logique séparée du point d'entrée) :
    ```ts
    export interface InventoryMigrationClient {
      character: {
        findMany(args: { select: { id: true; sheetData: true } }): Promise<{ id: string; sheetData: unknown }[]>;
        update(args: { where: { id: string }; data: { sheetData: unknown } }): Promise<unknown>;
      };
    }
    /** Convertit `equipment.individual` de string[] vers InventoryItem[] pour tout personnage qui
     * a encore l'ancien format. Idempotent : ne touche pas un personnage déjà migré (individual
     * déjà composé d'objets). Retourne le nombre de personnages migrés. */
    export async function migrateInventoryFormat(prisma: InventoryMigrationClient): Promise<number> {
      const characters = await prisma.character.findMany({ select: { id: true, sheetData: true } });
      let migrated = 0;
      for (const c of characters) {
        const sheetData = c.sheetData as any;
        const individual = sheetData?.equipment?.individual;
        if (!Array.isArray(individual) || individual.length === 0) continue;
        if (typeof individual[0] !== 'string') continue; // déjà migré ou vide
        const converted = individual.map((name: string) => ({ name, weight: 0, addedBy: 'player' as const }));
        await prisma.character.update({
          where: { id: c.id },
          data: { sheetData: { ...sheetData, equipment: { ...sheetData.equipment, individual: converted } } },
        });
        migrated++;
      }
      return migrated;
    }
    ```
    Détection idempotente sur `typeof individual[0] !== 'string'` (pas un flag séparé) — suffisant car aucun personnage ne peut légitimement avoir un `InventoryItem[]` avant cette story.
  - [x] `apps/api/src/characters/migrate-inventory-format.spec.ts` (NOUVEAU) : personnage avec `individual: string[]` → converti avec `weight: 0`/`addedBy: 'player'` ; personnage déjà au nouveau format → `update` jamais appelé (idempotence) ; personnage avec `individual: []` → ignoré ; `group` non touché.
  - [x] `apps/api/prisma/migrate-inventory-format.ts` (NOUVEAU, point d'entrée exécutable) : même structure que `apps/api/prisma/seed.ts` (connexion `PrismaClient`+`PrismaPg` directe, hors DI Nest) :
    ```ts
    import { PrismaClient } from '@prisma/client';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { migrateInventoryFormat } from '../src/characters/migrate-inventory-format';

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL manquant');
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    migrateInventoryFormat(prisma as any)
      .then((count) => { console.log(`✓ ${count} personnage(s) migré(s) vers InventoryItem[]`); return prisma.$disconnect(); })
      .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
    ```
  - [x] `apps/api/package.json` (UPDATE) : ajouter le script `"migrate:inventory-format": "ts-node prisma/migrate-inventory-format.ts"` à côté de `"seed"`.
  - [x] **Étape de déploiement bloquante** (à documenter dans le PR/commit, pas du code) : `docker compose exec api pnpm migrate:inventory-format` doit tourner **avant** le redémarrage du conteneur `api` sur ce changement — jamais l'inverse (AD-3 : pas de fenêtre à double-format). En dev local, l'exécuter une fois manuellement après avoir tiré cette story.

- [x] **Task 3 — Corriger les 2 lecteurs existants de `equipment.individual` cassés par le changement de type** (AC: 2 — non-régression)
  - [x] `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (UPDATE, ligne ~97) : la création envoie aujourd'hui `equipment: { individual: FIXED_EQUIPMENT.individual, group: FIXED_EQUIPMENT.group }` où `FIXED_EQUIPMENT.individual` est un `string[]` de 5 objets fixes (`equipment-step.ts`) — **cassera la validation/l'affichage de tout nouveau personnage** si non corrigé. Remplacer par :
    ```ts
    equipment: {
      individual: FIXED_EQUIPMENT.individual.map((name) => ({ name, weight: 0, addedBy: 'player' as const })),
      group: FIXED_EQUIPMENT.group,
    },
    ```
    `FIXED_EQUIPMENT`/`EquipmentStep` (affichage de l'étape assistant) restent inchangés — c'est uniquement le payload final envoyé à `POST /parties/:id/characters` qui change de forme.
  - [x] `packages/game-rules/src/ryuutama/pdf-field-map.ts` (UPDATE, ligne ~111 et ~167-168) : `individualEquipment` devient `InventoryItem[]` — `[...individualEquipment, ...groupEquipment].join(', ')` (champ PDF "Notes") produirait `[object Object]` sans correction. Remplacer :
    ```ts
    const individualEquipment = (equipment.individual ?? []).map((item) => item.name);
    ```
    (le reste de la fonction, `[...individualEquipment, ...groupEquipment].join(', ')`, n'a plus besoin de changer — il reçoit déjà des `string[]` après ce fix).
  - [x] `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (UPDATE) : toute fixture `equipment.individual` existante (probablement `string[]`) doit passer à `InventoryItem[]` (`{ name, weight: 0, addedBy: 'player' }`) pour rester représentative du vrai type ; ajouter un cas couvrant le mapping "Notes" avec des objets `InventoryItem`.
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (UPDATE) : fixture `equipment: { individual: [...] }` (ligne ~40, actuellement `string[]`) → `InventoryItem[]`.

- [x] **Task 4 — `CharacterService` : add/update/remove d'un objet d'inventaire** (AC: 2, 3, 4)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter 3 méthodes, toutes **propriétaire seul** (`getOwnCharacterOrThrow`), verrou optimiste (`updateMany`/`updatedAt`/409, AD-9/NFR1), **aucune création de `CharacterSnapshot`** (FR-12 exclut explicitement inventaire/notes — ne pas copier le pattern `$transaction`+snapshot de `applyLevelUp`, ce n'est pas le même cas).
    ```ts
    async addInventoryItem(characterId: string, userId: string, dto: CreateInventoryItemDto): Promise<CharacterDto> {
      const character = await this.getOwnCharacterOrThrow(characterId, userId);
      const sheetData = character.sheetData as unknown as RyuutamaSheetData;
      const equipment = sheetData.equipment ?? { individual: [], group: [] };
      const individual = [...(equipment.individual ?? []), {
        name: dto.name,
        weight: dto.weight ?? 0,
        addedBy: 'player' as const,
      }];
      sheetData.equipment = { ...equipment, individual };
      return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
    }

    async updateInventoryItem(characterId: string, userId: string, itemIndex: number, dto: UpdateInventoryItemDto): Promise<CharacterDto> {
      const character = await this.getOwnCharacterOrThrow(characterId, userId);
      const sheetData = character.sheetData as unknown as RyuutamaSheetData;
      const individual = sheetData.equipment?.individual ?? [];
      const item = individual[itemIndex];
      if (!item) throw new NotFoundException("Objet d'inventaire introuvable");
      const updated = [...individual];
      updated[itemIndex] = {
        ...item,
        name: dto.name ?? item.name,
        weight: dto.weight ?? item.weight,
      };
      sheetData.equipment = { ...sheetData.equipment!, individual: updated };
      return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
    }

    async removeInventoryItem(characterId: string, userId: string, itemIndex: number): Promise<CharacterDto> {
      const character = await this.getOwnCharacterOrThrow(characterId, userId);
      const sheetData = character.sheetData as unknown as RyuutamaSheetData;
      const individual = sheetData.equipment?.individual ?? [];
      if (!individual[itemIndex]) throw new NotFoundException("Objet d'inventaire introuvable");
      const updated = individual.filter((_, i) => i !== itemIndex);
      sheetData.equipment = { ...sheetData.equipment!, individual: updated };
      return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
    }

    /** Écriture verrouillée commune aux 3 mutations d'inventaire — pas de recalcul `computeDerived`
     * (le poids n'entre dans aucune formule de `DerivedStats`, cf. Dev Notes), pas de snapshot. */
    private async writeInventoryChange(characterId: string, expectedUpdatedAt: Date, sheetData: RyuutamaSheetData, userId: string): Promise<CharacterDto> {
      const result = await this.prisma.character.updateMany({
        where: { id: characterId, updatedAt: expectedUpdatedAt },
        data: { sheetData: sheetData as any },
      });
      if (result.count === 0) {
        throw new ConflictException('Le personnage a été modifié entretemps, réessayez.');
      }
      const updated = await this.prisma.character.findUniqueOrThrow({ where: { id: characterId } });
      const owner = await this.resolveOwnerInfo(userId, updated.partieId);
      return toDto(updated, owner.pseudo, owner.isMj);
    }
    ```
    **Décision d'implémentation — adressage par index de tableau** : `InventoryItem` n'a pas de champ `id` persisté (architecture spine confirmée — seulement `{name, weight, addedBy}`), et `equipment.individual` reste un tableau JSON simple sans table relationnelle dédiée (cf. AD-5, qui réserve les modèles Prisma dédiés à Notes/Historique/Distributions, pas à l'inventaire). `itemIndex` = position 0-based dans `equipment.individual` **au moment de la requête** — le frontend réémet toujours l'index affiché après avoir rechargé le `CharacterDto` suite à chaque mutation (jamais d'index mis en cache entre deux mutations), donc pas de dérive silencieuse ; en cas de course (deux onglets), le verrou optimiste sur `updatedAt` rejette (409) plutôt que de modifier/supprimer le mauvais objet.
  - [x] Importer `CreateInventoryItemDto`/`UpdateInventoryItemDto` (type-only, `import type`) depuis `@master-jdr/shared` en haut du fichier, à côté de `CharacterDto`/`CharacterSnapshotDto`.
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE) : nouveau describe `inventoryItems` — ajout avec poids fourni, ajout sans poids → `weight: 0`, `addedBy` toujours `'player'` en sortie même si un `addedBy` est injecté dans le mock DTO (`as any`, prouve que le serveur ignore ce champ), modification (nom seul, poids seul, les deux), suppression, `NotFoundException` si `itemIndex` hors bornes, 409 si `updatedAt` périmé (mock `updateMany` → `{ count: 0 }`), `ForbiddenException` si non-propriétaire, **aucun appel à `characterSnapshot.create`** dans ces 3 flux (assertion explicite `expect(prisma.characterSnapshot.create).not.toHaveBeenCalled()` — régression facile à introduire par copier-coller de `applyLevelUp`).

- [x] **Task 5 — DTOs & endpoints `CharactersController`** (AC: 2, 4)
  - [x] `apps/api/src/characters/dto/create-inventory-item.dto.ts` (NOUVEAU) :
    ```ts
    import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

    export class CreateInventoryItemDto {
      @IsString()
      @IsNotEmpty()
      name!: string;

      @IsOptional()
      @IsNumber()
      @Min(0)
      weight?: number;
    }
    ```
    **Ne pas déclarer `addedBy` sur cette classe.** Le `ValidationPipe` global (`apps/api/src/main.ts`, `whitelist: true, forbidNonWhitelisted: true`) rejette déjà (400) toute requête dont le body contient une propriété non déclarée — c'est ce mécanisme existant, pas un check manuel, qui satisfait AC2 "rejeté 400 si le body contient `addedBy`".
  - [x] `apps/api/src/characters/dto/update-inventory-item.dto.ts` (NOUVEAU) : mêmes champs que `CreateInventoryItemDto` mais `name` optionnel aussi (`@IsOptional() @IsString() @IsNotEmpty() name?: string;`), même garde `addedBy` non déclaré.
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter 3 endpoints, même style que `levelUp`/`history` existants (pas de guard supplémentaire, `AuthenticatedGuard` déjà au niveau du contrôleur) :
    ```ts
    @Post(':id/inventory-items')
    addInventoryItem(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: CreateInventoryItemDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.addInventoryItem(id, user.id, dto);
    }

    @Patch(':id/inventory-items/:itemId')
    updateInventoryItem(
      @Param('id', ParseUUIDPipe) id: string,
      @Param('itemId', ParseIntPipe) itemId: number,
      @Body() dto: UpdateInventoryItemDto,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.updateInventoryItem(id, user.id, itemId, dto);
    }

    @Delete(':id/inventory-items/:itemId')
    removeInventoryItem(
      @Param('id', ParseUUIDPipe) id: string,
      @Param('itemId', ParseIntPipe) itemId: number,
      @CurrentUser() user: AuthUser,
    ) {
      return this.characters.removeInventoryItem(id, user.id, itemId);
    }
    ```
    Importer `ParseIntPipe` (déjà `ParseUUIDPipe` importé) et les 2 nouveaux DTOs.
  - [x] `apps/api/src/characters/characters.controller.spec.ts` (UPDATE, si existant — sinon créer un describe minimal) : vérifie que chaque endpoint délègue au bon service method avec les bons paramètres (pattern déjà établi pour `levelUp`/`history`).

- [x] **Task 6 — Frontend : `character.service.ts`** (AC: 1, 2, 4)
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter 3 méthodes, même pattern HTTP que `levelUp`/`getHistory` :
    ```ts
    addInventoryItem(id: string, dto: CreateInventoryItemDto): Promise<CharacterDto> {
      return firstValueFrom(
        this.http.post<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items`, dto, { withCredentials: true }),
      );
    }

    updateInventoryItem(id: string, itemIndex: number, dto: UpdateInventoryItemDto): Promise<CharacterDto> {
      return firstValueFrom(
        this.http.patch<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items/${itemIndex}`, dto, { withCredentials: true }),
      );
    }

    removeInventoryItem(id: string, itemIndex: number): Promise<CharacterDto> {
      return firstValueFrom(
        this.http.delete<CharacterDto>(`${API_BASE}/characters/${id}/inventory-items/${itemIndex}`, { withCredentials: true }),
      );
    }
    ```
    Importer `CreateInventoryItemDto`/`UpdateInventoryItemDto` (type-only) depuis `@master-jdr/shared`.

- [x] **Task 7 — Frontend : `EncumbranceBar`** (AC: 1, 3)
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Inputs : `totalWeight = input.required<number>()`, `limit = input.required<number>()`. `overLimit = computed(() => totalWeight() > limit())`. Template : label texte `"[poids total] / [limite]"` (`{{ totalWeight() }} / {{ limit() }}`, **toujours affiché en texte**, jamais seulement la barre — AC3/NFR4), track+fill (`height: 8px`, `border-radius: 4px`), `fill` normal = `{colors.gradient-cta}`, `fill-over-limit` (si `overLimit()`) = `linear-gradient(90deg, {colors.status-unavailable}, {colors.status-mixed})` (cf. DESIGN.md §7 EncumbranceBar). Si `overLimit()`, afficher aussi un glyphe d'avertissement + texte "Surchargé" accolé au label (jamais la couleur seule, cf. Accessibility Floor hérité).
  - [x] `encumbrance-bar.spec.ts` (NOUVEAU) : poids sous la limite → pas de classe over-limit, label correct ; poids au-dessus → classe over-limit + texte "Surchargé" présent dans le DOM (pas juste une classe CSS, assertion sur `textContent`).

- [x] **Task 8 — Frontend : `InventoryItemRow`** (AC: 1, 4)
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Inputs : `item = input.required<{ name: string; weight: number; addedBy: string }>()`, `editable = input(false)` (true seulement si propriétaire, cf. Task 9). Outputs : `edit = output<void>()`, `remove = output<void>()`. Template : nom + poids, badge "ajouté par le MJ" visible **seulement si** `item().addedBy === 'mj'` (fond `{colors.accent-2}` 12% opacité, texte plein `{colors.accent-2}` à 14px minimum — cf. DESIGN.md §2, contrainte de contraste), boutons éditer/supprimer visibles seulement si `editable()` (pas de `FieldEditPencil` ici — ce composant MJ est hors scope, cf. "Hors scope" ci-dessus ; utiliser des boutons texte/icône simples cohérents avec le reste de la fiche).
  - [x] `inventory-item-row.spec.ts` (NOUVEAU) : badge provenance visible seulement si `addedBy: 'mj'` ; boutons éditer/supprimer absents si `editable: false` ; clic éditer/supprimer émet les events attendus.

- [x] **Task 9 — Frontend : `InventoryTab` (conteneur)** (AC: 1, 2, 3, 4)
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Input `character = input.required<CharacterDto>()`, `isOwner = input.required<boolean>()`. Output `characterUpdated = output<CharacterDto>()` (même pattern que `LevelUpWizard`/`PortraitCropper` — le parent fait `this.character.set(updated)`).
    - `individual = computed(() => ((this.character().sheetData as any)?.equipment?.individual as { name: string; weight: number; addedBy: string }[] | undefined) ?? [])` — cast `any` nécessaire car `CharacterDto.sheetData` est `SheetData = Record<string, unknown>` côté `packages/shared` (`InventoryItem` n'y est pas exposé, cf. Task 1) ; même stratégie de cast déjà utilisée pour `levelUps` dans `character-sheet.ts`/`capability-label.util.ts`.
    - `totalWeight = computed(() => this.individual().reduce((sum, i) => sum + i.weight, 0))`.
    - Formulaire d'ajout : 2 champs (nom texte, poids nombre optionnel) + bouton "+ Ajouter un objet" — visible seulement si `isOwner()`. Au submit : `characterSvc.addInventoryItem(character().id, { name, weight })`, puis `characterUpdated.emit(updated)`, reset du formulaire.
    - Édition inline (pas de dialog séparé, cohérent avec la simplicité de l'objet à 2 champs) : au clic "éditer" sur une `InventoryItemRow`, afficher les mêmes 2 champs pré-remplis à la place de la ligne ; au clic "supprimer", appeler `removeInventoryItem` directement (pas de confirmation modale — objet trivial à réajouter en cas d'erreur, cohérent avec l'absence de snapshot/undo sur cette feature).
    - Erreur réseau (ajout/édition/suppression, y compris 409) : message inline générique ("L'inventaire n'a pas pu être mis à jour. Réessayez."), même registre que `LevelUpWizard.submitError`.
  - [x] Template : `<app-encumbrance-bar [totalWeight]="totalWeight()" [limit]="character().derived.Encombrement" />` en tête, puis `@for (item of individual(); track $index) { <app-inventory-item-row [item]="item" [editable]="isOwner()" (edit)="..." (remove)="..." /> }`, empty state si `individual().length === 0` (texte simple, pas de composant dédié — cohérent avec les autres sections optionnelles de la fiche qui n'affichent rien plutôt qu'un vrai "empty state" component, cf. Dev Notes Story 6.3 §Paysage/Immunités).
  - [x] `inventory-tab.spec.ts` (NOUVEAU) : rendu liste + `EncumbranceBar` avec le bon total ; formulaire d'ajout absent si `isOwner: false` ; ajout appelle `characterSvc.addInventoryItem` avec le payload attendu et émet `characterUpdated` ; édition appelle `updateInventoryItem` avec le bon `itemIndex` ; suppression appelle `removeInventoryItem` ; erreur réseau affiche le message inline.

- [x] **Task 10 — Intégration `character-sheet.ts`/`.html`** (AC: 1)
  - [x] `character-sheet.html` (UPDATE) : dans la carte "Équipement" existante (lignes ~215-230), **retirer** la boucle `@for (item of eq.individual ?? []; track item)` (cassée par le nouveau type, cf. Task 3 — sans ce retrait, `{{ item }}` sur un objet afficherait `[object Object]`) ; ne garder dans cette carte que `eq.group` (texte libre inchangé, PRD Non-Goals) et le bloc `fetiqueObject`. Ajouter une **nouvelle section** dédiée (même position que la section Historique en bas de fiche, ou en colonne — choix libre du dev tant que cohérent visuellement) :
    ```html
    <section class="sheet__card">
      <h2 class="sheet__card-title">{{ theme.tone()['evolution.inventory_section_title'] }}</h2>
      <app-inventory-tab [character]="c" [isOwner]="isOwner()" (characterUpdated)="character.set($event)" />
    </section>
    ```
    Visible pour **tous** les viewers (propriétaire ET MJ, cohérent avec le reste de la fiche en lecture — seuls les contrôles d'édition internes à `InventoryTab` sont conditionnés à `isOwner()`, pas la section elle-même).
  - [x] `character-sheet.ts` (UPDATE) : importer et déclarer `InventoryTab` dans le tableau `imports` du `@Component`. Aucune nouvelle méthode nécessaire — `characterUpdated` se branche directement sur `character.set($event)` en template (pattern déjà utilisé ailleurs dans ce fichier, ex. `savePortrait`).
  - [x] `equipment` computed existant (ligne ~236-238 de `character-sheet.ts`) : le type `{ individual: string[]; group: string[] }` n'est plus correct pour `individual` — corriger en `{ individual: unknown[]; group: string[] }` ou simplement retirer `individual` du type castée puisque ce computed n'est plus utilisé que pour `group`/`fetiqueObject` après Task 10 (le nouveau `InventoryTab` lit `sheetData.equipment.individual` lui-même via son propre computed, cf. Task 9 — pas de duplication de source).

- [x] **Task 11 — Microcopy** (AC: 1, 2, 3)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : ajouter, dans le même bloc `evolution.*` que les clés Story 6.3 (`evolution.landscape_section_title` et voisines), pour les **3 thèmes** :
    - `evolution.inventory_section_title` (ex. "Inventaire")
    - `evolution.inventory_add_cta` (ex. "+ Ajouter un objet")
    - `evolution.inventory_empty` (ex. "Aucun objet dans l'inventaire pour le moment.")
    - `evolution.inventory_overweight_label` (ex. "Surchargé")
    - `evolution.inventory_error` (ex. "L'inventaire n'a pas pu être mis à jour. Réessayez.")
    Suivre le registre déjà établi par thème (Grimoire Émeraude sobre, Forêt Ancienne organique, Médiéval Steampunk mécanique) — cf. les clés `evolution.*` déjà présentes comme modèle de ton par thème.

- [x] **Task 12 — Tests d'intégration frontend** (AC: 1-4)
  - [x] `character-sheet.spec.ts` (UPDATE) : section Inventaire toujours visible (propriétaire et MJ) ; `InventoryTab` reçoit `isOwner` correctement ; ancienne assertion sur le rendu texte de `eq.individual` (si présente) supprimée/adaptée puisque cette liste ne s'affiche plus dans la carte "Équipement".

## Dev Notes

- **Architecture** : cf. `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md` — AD-3 (`InventoryItem[]`, migration bloquante, `addedBy` jamais lu du client), AD-8 (accès propriétaire seul pour les mutations d'inventaire, même pattern que `getOwnCharacterOrThrow`), AD-9/NFR1 (verrou optimiste généralisé, inventaire explicitement listé), AD-10 (arborescence frontend `inventory-tab/{inventory-tab,encumbrance-bar,inventory-item-row}.ts`).
- **Pourquoi pas de `CharacterSnapshot` ici** : FR-12 (PRD) exclut explicitement l'inventaire et les notes de la création d'instantané ("L'édition de l'inventaire (FR-9) ou des notes personnelles (FR-11) ne crée pas d'instantané"). C'est une différence délibérée avec `applyLevelUp` (Story 6.3) — ne pas copier le pattern `$transaction` + `characterSnapshot.create` de cette dernière, ce serait une violation directe de FR-12.
- **Pourquoi pas de recalcul `computeDerived`** : le poids d'inventaire n'entre dans aucune formule de `DerivedStats` (`PV`, `PE`, `Condition`, `Initiative`, `Encombrement` — cf. `packages/game-rules/src/ryuutama/compute-derived.ts`, inchangé par cette story). `Encombrement` est la **limite** dérivée de VIG+niveaux ; le poids total porté est une donnée séparée comparée à cette limite côté affichage uniquement (`EncumbranceBar`), jamais persistée en base ni recalculée côté serveur.
- **Adressage par index, pas par id** *(⚠️ superseded par la revue de code — voir `## Review Findings` en fin de fichier)* : ce choix d'implémentation initial (aucun champ `id` sur `InventoryItem` dans l'architecture spine) s'est révélé combiner dangereusement avec le pattern de verrou optimiste "relecture fraîche" (`writeInventoryChange`), permettant à un client périmé de modifier/supprimer le mauvais objet sans jamais déclencher de 409. La revue de code a tranché pour un `id` (UUID) stable par objet — l'implémentation finale de cette story utilise donc bien un `id`, pas un index, malgré ce paragraphe qui documente l'intention initiale à titre historique.
- **Deux régressions à corriger, pas seulement le nouveau code** (Task 3) : le changement de type `string[]` → `InventoryItem[]` casse silencieusement deux lecteurs existants qui ne font pas partie du "nouveau" périmètre de cette story — la création de personnage (`character-wizard.ts`) et l'export PDF (`pdf-field-map.ts`, champ "Notes"). Sans ces corrections, tout nouveau personnage créé après cette story aurait un inventaire non conforme au type, et tout export PDF afficherait `[object Object]` dans le champ Notes. Vérifier ces deux points en premier avant de considérer la story terminée.
- **Note mineure, non bloquante** : `getOwnCharacterOrThrow` (privée, `character.service.ts`) a un message d'erreur figé sur le portrait ("Seul le propriétaire du personnage peut modifier son portrait") depuis sa création — déjà réutilisé tel quel par `applyLevelUp` (Story 6.3) sans correction. Cette story la réutilise une 3e fois. Un message générique ("Seul le propriétaire du personnage peut effectuer cette action") serait plus correct, mais ce n'est pas un blocage AC — à corriger seulement si le temps le permet, sans que ce soit une exigence de cette story.
- **`equipment.group` non concerné** : reste `string[]`, aucun poids, aucune mutation via cette story (PRD §5 Non-Goals explicite). Ne pas étendre `InventoryItemRow`/`EncumbranceBar` à `group`.
- **Accessibilité (NFR4)** : `EncumbranceBar` — poids/limite toujours en texte (jamais seulement la barre visuelle), label "Surchargé" + glyphe en plus du dégradé de couleur en cas de dépassement. Badge "ajouté par le MJ" — texte à 14px minimum (pas 9px, cf. DESIGN.md §2 — sinon le ratio de contraste tombe sous 3:1 sur au moins un thème).

### Project Structure Notes

- Nouveaux composants standalone frontend sous `apps/web/src/app/features/characters/character-sheet/inventory-tab/` : `inventory-tab.ts` (conteneur), `encumbrance-bar.ts`, `inventory-item-row.ts` — arborescence imposée par ARCHITECTURE-SPINE.md AD-10 (bloc `apps/web/.../character-sheet/`), à respecter à la lettre (pas de nom de dossier différent).
- Aucune migration Prisma pour cette story (pas de nouveau modèle/colonne) — uniquement un script de migration de **données** (`apps/api/prisma/migrate-inventory-format.ts`), distinct des migrations de schéma (`apps/api/prisma/migrations/`). Ne pas créer de dossier sous `prisma/migrations/` pour ce changement.
- 2 nouveaux DTOs sous `apps/api/src/characters/dto/` : `create-inventory-item.dto.ts`, `update-inventory-item.dto.ts` — même dossier que `create-level-up.dto.ts` (Story 6.3), `portrait-crop-data.dto.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6, Story 6.4 ; FR9-FR10 ; FR Coverage Map]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md#AD-3, AD-8, AD-9, AD-10, Schema Prisma (Character inchangé), routes complémentaires §AD-6]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md#4.3 Inventaire & encombrement, FR-9, FR-10, §5 Non-Goals]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md#7 Components — EncumbranceBar, InventoryItemRow ; §2 Colors (badge provenance, contraste 14px)]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md#4 Component Patterns — Inventaire ; §7 Accessibility Floor ; §8 Key Flows UJ-4]
- [Source: _bmad-output/implementation-artifacts/6-3-monter-de-niveau-et-historique.md — patterns réutilisés (getOwnCharacterOrThrow, verrou optimiste updateMany/409, resolveOwnerInfo/toDto, cast `any` sur sheetData pour données non exposées par `packages/shared`)]
- [Source: apps/api/src/characters/character.service.ts — lu intégralement (patterns updatePortrait/applyLevelUp à répliquer/à ne PAS répliquer selon le cas, cf. Dev Notes)]
- [Source: apps/api/src/characters/characters.controller.ts — pattern d'endpoints existant]
- [Source: apps/api/src/prisma/seed-admin.ts, apps/api/prisma/seed.ts — pattern de script one-off testable (logique pure + point d'entrée `PrismaClient` direct)]
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts, steps/equipment-step/equipment-step.ts — format actuel de `equipment.individual` à la création (FIXED_EQUIPMENT, toujours les mêmes 5 entrées)]
- [Source: packages/game-rules/src/ryuutama/pdf-field-map.ts, types.ts, compute-derived.ts — lus intégralement]
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts, .html — état actuel, lu intégralement (carte "Équipement" à corriger, régression `[object Object]` sinon)]
- [Source: apps/web/src/app/core/characters/character.service.ts — pattern HTTP existant (levelUp/getHistory) à répliquer]
- [Source: apps/web/src/app/core/theme/tones.ts — registre `evolution.*` existant par thème, à étendre]
- [Source: apps/api/src/main.ts — ValidationPipe global (whitelist/forbidNonWhitelisted) déjà en place, exploité pour rejeter `addedBy` sans code de garde manuel]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8)

### Debug Log References

Aucun blocage. Deux ajustements par rapport au plan initial de la story, tous deux documentés inline dans le code :
- `character-wizard.ts` : le binding template `[individual]="sheetData().equipment?.individual ?? []"` cassait la compilation Angular (`InventoryItem[]` non assignable à `string[]` attendu par `EquipmentStep`) — ajout d'un computed `individualEquipmentNames` projetant sur les noms, `EquipmentStep` reste inchangé (`string[]`).
- `--jdr-accent-2-rgb` n'existait dans aucun des 3 thèmes (`apps/web/src/styles.scss`) alors que le badge de provenance MJ (`InventoryItemRow`) en a besoin (`rgba({colors.accent-2}, 0.12)`, cf. DESIGN.md §2) — gap pré-existant du même type que celui comblé par `--jdr-accent-1-rgb` en Story 6.3 ; comblé ici pour les 3 thèmes (valeurs RGB dérivées des hex `--jdr-accent-2` existants).

### Completion Notes List

- Tasks 1-12 complétées intégralement, tous les AC (1-5) couverts.
- Cycle rouge-vert appliqué à chaque task testable : tests écrits en premier (confirmés en échec), puis implémentation minimale, puis suite complète relancée.
- **Régressions Task 3 corrigées et vérifiées** : `character-wizard.ts` (payload de création envoie désormais `InventoryItem[]`), `pdf-field-map.ts` (champ PDF "Notes" projette `.name` avant `.join()`), fixtures `pdf-field-map.spec.ts`/`character-sheet.spec.ts` mises à jour en conséquence.
- **Migration one-off** (`migrateInventoryFormat`) testée unitairement (6 tests : conversion, idempotence, tableau vide, `equipment` absent, mix ancien/nouveau format, `group` non touché) ; script exécutable (`apps/api/prisma/migrate-inventory-format.ts`) et commande pnpm (`migrate:inventory-format`) ajoutés — **non exécutée en dev local dans le cadre de cette session** (aucun personnage de test n'est encore au format `InventoryItem[]` avant cette story ; l'exécuter avant le prochain redémarrage du conteneur `api` en environnement partagé).
- **Adressage par `id` (UUID), pas par index** — révisé suite à la revue de code (cf. `## Review Findings`) : l'adressage par position initial permettait à un client périmé de modifier/supprimer silencieusement le mauvais objet sans jamais déclencher de 409. `InventoryItem.id` (généré via `randomUUID()`) adresse désormais chaque objet de façon stable ; `updateInventoryItem`/`removeInventoryItem` recherchent par `id`, retournent `NotFoundException` si l'objet a été retiré entretemps — jamais une mauvaise cible. Endpoints `PATCH`/`DELETE /inventory-items/:itemId` : `ParseUUIDPipe`.
- **`addedBy` jamais accepté du client** vérifié à deux niveaux : unitairement (le service ignore un `addedBy` injecté dans le DTO mocké) et via un test HTTP réel bout-en-bout (`ValidationPipe` global whitelist+forbidNonWhitelisted → 400 si le body contient `addedBy`).
- **Aucun `CharacterSnapshot` créé** par les 3 mutations d'inventaire — vérifié explicitement par assertion dédiée dans chaque describe (`addInventoryItem`/`updateInventoryItem`/`removeInventoryItem`), pour éviter la régression du copier-coller depuis `applyLevelUp`.
- Suite de tests complète exécutée après implémentation : game-rules 61/61, api 328/328 (dont 17 tests service + 12 tests controller + 6 tests migration dédiés à cette story), web 50 fichiers passés (dont 3 nouveaux composants inventory-tab + character.service + character-sheet + character-wizard).
- `tsc --noEmit` (api et web) : aucune nouvelle erreur introduite par cette story — seules les erreurs résiduelles déjà documentées comme pré-existantes (Story 6.3 Completion Notes : rootDir `packages/*` sous `tsc` brut, fixture `ryuutama-pdf.service.spec.ts` antérieure) subsistent, non liées à ce travail.
- Microcopy `evolution.inventory_*` livrée pour les 3 thèmes (Grimoire Émeraude, Forêt Ancienne, Médiéval Steampunk), registre de ton cohérent avec les clés `evolution.*` existantes de chaque thème.

### File List

**Backend**
- `apps/api/src/characters/character.service.ts` (M) — `addInventoryItem`, `updateInventoryItem`, `removeInventoryItem`, `writeInventoryChange`
- `apps/api/src/characters/character.service.spec.ts` (M) — describe `inventoryItems` (17 tests)
- `apps/api/src/characters/characters.controller.ts` (M) — `POST/PATCH/DELETE :id/inventory-items[/:itemId]`
- `apps/api/src/characters/characters.controller.spec.ts` (M) — délégation + validation HTTP réelle
- `apps/api/src/characters/dto/create-inventory-item.dto.ts` (A)
- `apps/api/src/characters/dto/update-inventory-item.dto.ts` (A)
- `apps/api/src/characters/migrate-inventory-format.ts` (A) — logique testable
- `apps/api/src/characters/migrate-inventory-format.spec.ts` (A) — 6 tests
- `apps/api/prisma/migrate-inventory-format.ts` (A) — point d'entrée exécutable
- `apps/api/package.json` (M) — script `migrate:inventory-format`

**Types partagés**
- `packages/game-rules/src/ryuutama/types.ts` (M) — `InventoryItem`, `equipment.individual: InventoryItem[]`
- `packages/game-rules/src/index.ts` (M) — export `InventoryItem`
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (M) — fix régression (`.name` avant `.join()`)
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (M) — fixtures `InventoryItem[]`
- `packages/shared/src/index.ts` (M) — `CreateInventoryItemDto`, `UpdateInventoryItemDto`

**Frontend**
- `apps/web/src/app/core/characters/character.service.ts` (M) — `addInventoryItem`, `updateInventoryItem`, `removeInventoryItem`
- `apps/web/src/app/core/characters/character.service.spec.ts` (M) — 3 tests
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (M) — fix régression (payload `InventoryItem[]` à la création)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (M) — import `InventoryTab`, type `equipment` corrigé
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (M) — retrait boucle cassée, section Inventaire
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (M) — fixture + 2 tests
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.html` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.html` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.html` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-item-row.spec.ts` (A)
- `apps/web/src/app/core/theme/tones.ts` (M) — clés `evolution.inventory_*`, 3 thèmes
- `apps/web/src/styles.scss` (M) — `--jdr-accent-2-rgb`, 3 thèmes

### Change Log

- 2026-07-11 : Implémentation complète de la Story 6.4 (Incon, dev-story). 731 tests → 917 tests (game-rules 61, api 328, web 50 fichiers). Statut → `review`.

## Review Findings

_Code review 2026-07-11 — 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 decision-needed + 5 patch → tous résolus/appliqués (Incon a tranché la décision en option 2, adressage par `id`). 0 defer, 0 dismissed as noise. Suites vertes après correctifs : game-rules 61/61, api 332/332, web 50/50 fichiers._

### Décision (résolue → option 2, remplacement de l'index par un `id` stable)

- [x] **[Review][Decision → Patch] Le "verrou optimiste" n'empêche pas un client périmé de modifier/supprimer le mauvais objet (adressage par index)** — `writeInventoryChange` relisait `character.updatedAt` fraîchement en base au sein de la même requête, puis l'utilisait comme jeton de comparaison : le verrou ne protégeait que contre une course dans la fenêtre sub-milliseconde de la requête elle-même, jamais contre un client périmé de plusieurs minutes. Combiné à l'adressage par index de tableau, un scénario concret ne déclenchait aucun 409 : Onglet A supprime l'objet 0 (`[A,B] → [B]`) ; Onglet B, resté sur l'ancien affichage, clique "supprimer" sur ce qu'il croit être A (toujours index 0) → le serveur relit l'état courant, le verrou correspond, **200 OK**, et **B est supprimé silencieusement au lieu de A**.
  **Décision Incon : option 2** — remplacer l'adressage par index par un `id` (UUID) stable par objet. `InventoryItem` gagne un champ `id` (généré via `randomUUID()` à l'ajout et par la migration one-off pour les entrées legacy) ; `updateInventoryItem`/`removeInventoryItem` recherchent désormais par `id`, jamais par position ; un objet déjà retiré par une autre requête n'est simplement plus trouvé (`NotFoundException`), jamais une mauvaise cible silencieuse. Endpoints `PATCH`/`DELETE /characters/:id/inventory-items/:itemId` : `itemId` passe de `ParseIntPipe` à `ParseUUIDPipe`. Défense en profondeur ajoutée au passage : `normalizeInventoryIndividual()` convertit toute entrée `string` legacy résiduelle avant lecture/écriture (résout aussi le patch "personnage non migré" ci-dessous, fusionné ici). Tests dédiés : modification/suppression du bon objet parmi plusieurs quel que soit son index, `NotFoundException` si l'objet a été retiré entretemps par une autre requête (jamais de mauvaise cible).

### Patchs (tous appliqués)

- [x] **[Review][Patch] Vider le champ poids en édition inline envoie `NaN`, silencieusement ignoré (ancien poids conservé)** — Fix : `onEditWeightInput()` normalise `NaN → 0` avant d'alimenter le signal `editWeight`, le template appelle cette méthode au lieu de `.set()` direct. Test de régression dédié dans `inventory-tab.spec.ts`. [source: blind+edge — `inventory-tab.html`, `inventory-tab.ts`]
- [x] **[Review][Patch] `addInventoryItem` ne se défend pas contre un personnage non encore migré (`equipment.individual` encore `string[]`)** — **fusionné et résolu avec la décision ci-dessus** (`normalizeInventoryIndividual()`), pas de patch séparé. [source: edge — `character.service.ts`]
- [x] **[Review][Patch] Nom d'objet accepté vide-en-apparence (espaces seuls) et sans limite de longueur côté API** — Fix : `@Transform` (trim serveur) + `@MaxLength(200)` ajoutés sur `CreateInventoryItemDto`/`UpdateInventoryItemDto`. Le trim rend un `@Matches` séparé inutile (`@IsNotEmpty()` rejette déjà la chaîne vide résultante). [source: edge — `create-inventory-item.dto.ts`, `update-inventory-item.dto.ts`]
- [x] **[Review][Patch] `EncumbranceBar` affiche un texte "Surchargé" codé en dur, ignorant la clé de microcopy par thème** — Fix : `EncumbranceBar` injecte désormais `ThemeToneService` et utilise `theme.tone()['evolution.inventory_overweight_label']`. [source: auditor — `encumbrance-bar.html`, `encumbrance-bar.ts`]
- [x] **[Review][Patch] `UpdateInventoryItemDto` n'impose pas "au moins un champ" comme documenté dans la story** — Fix : garde explicite dans `CharactersController.updateInventoryItem` (`BadRequestException` si `name` et `weight` sont tous deux `undefined`), avant délégation au service. [source: auditor — `characters.controller.ts`]
