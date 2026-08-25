---
baseline_commit: fbfbe3b4cfd1c31f6bdae0a31ac04a6ec5532c28
---

# Story 6.3: Monter de niveau et consulter l'historique de sa fiche

Status: done

## Story

As a joueur dont le personnage a gagné assez d'XP,
I want être guidé pour appliquer ma montée de niveau quand je le souhaite, et retrouver l'historique de ce qui a changé sur ma fiche,
so that je ne perds jamais mes choix de progression, même si je n'ai pas le temps de m'en occuper tout de suite.

## ⚠️ Prérequis bloquant : Story 6.2

Cette story **construit sur l'infrastructure XP posée par la Story 6.2** (`Character.xp`, `CharacterDto.xp`/`level`, `packages/game-rules/src/ryuutama/leveling.ts` avec `LEVEL_TABLE`/`levelForXp`/`pendingLevels`/`CapabilityType`). **Avant de commencer, vérifier que la Story 6.2 est passée à `done`** (`_bmad-output/implementation-artifacts/sprint-status.yaml`) et que ces éléments existent réellement dans le code (au moment de la création de cette story, ils n'existent pas encore — la 6.2 est seulement `ready-for-dev`). Si la 6.2 n'est pas encore implémentée, l'implémenter d'abord ou signaler le blocage plutôt que de dupliquer `leveling.ts`/le champ `xp`.

## Acceptance Criteria

1. **Given** mon personnage a franchi un seuil de niveau (XP cumulé au-delà du seuil suivant de la table), **When** j'ouvre ma fiche, **Then** une `LevelUpBanner` persistante s'affiche ("Niveau [N] disponible !", clé `evolution.levelup_banner`), sans popup forcée, avec `aria-live="polite"` et un CTA "Level up !" (`evolution.levelup_cta`) ; elle reste affichée tant que je n'ai pas traité ce niveau. [Source: epics.md Story 6.3 AC1, UX-DR5]
2. **Given** je clique sur "Level up !", **When** le `LevelUpWizard` s'ouvre, **Then** je répartis exactement 3 points entre PV et PE via un contrôle +/- (`pv-pe-stepper`, zone tactile 44px/36px), et je choisis la capacité débloquée pour ce niveau (ex. Attribut : `attribute-choice-grid` 4 colonnes, un attribut déjà à 12 est désactivé avec `aria-describedby` tant qu'un autre reste disponible). [Source: epics.md Story 6.3 AC2, UX-DR6]
3. **Given** je valide mes choix pour ce niveau, **When** la montée est appliquée, **Then** `sheetData.levelUps[]` gagne une entrée (`level`, `pvAllocated`, `peAllocated`, `capability`), `derived.PV`/`derived.PE`/`derived.Encombrement` se recalculent en conséquence, un `CharacterSnapshot(trigger: 'LEVEL_UP')` immuable est créé, et si un niveau supplémentaire est déjà franchi, l'assistant le propose immédiatement à la suite (barre de progression multi-segments). [Source: epics.md Story 6.3 AC3, FR5-FR8, AD-2]
4. **Given** je suis le propriétaire du personnage ou le MJ de sa Partie, **When** je consulte l'onglet "Historique" de la fiche (`history-tab`), **Then** je vois la liste chronologique des instantanés (date, déclencheur, note associée si présente) ; aucune action de restauration n'est proposée. [Source: epics.md Story 6.3 AC5, FR13, UX-DR13]
5. **Given** deux requêtes modifient mon personnage en même temps (ex. deux montées de niveau successives envoyées en double), **When** l'une des deux écrit après l'autre sur la base d'un `updatedAt` périmé, **Then** elle échoue avec une erreur 409 plutôt que d'écraser silencieusement les changements de l'autre. [Source: epics.md Story 6.3 AC6, NFR1, AD-9]

**Hors scope de cette story** (couvert par d'autres stories de l'Epic 6) : la notification e-mail `level-up` au moment du franchissement de seuil — c'est `CharacterService.applyXpDelta` (Story 6.2) qui la déclenche, pas cette story ; l'édition MJ directe de l'XP/des champs (`PATCH /characters/:id/xp`, `/sheet-field`) et le déclencheur `MJ_EDIT` de `CharacterSnapshot` (Story 6.6, qui réutilise le même modèle `CharacterSnapshot`/enum `SnapshotTrigger` créés ici) ; l'inventaire (Story 6.4) et le journal de notes (Story 6.5).

## Tasks / Subtasks

- [x] **Task 1 — Schéma Prisma & types partagés** (AC: 3, 4, 5)
  - [x] `apps/api/prisma/schema.prisma` (UPDATE) : ajouter `enum SnapshotTrigger { LEVEL_UP MJ_EDIT }` et `model CharacterSnapshot` exactement comme spécifié dans ARCHITECTURE-SPINE.md §Schema Prisma (`id`, `characterId` + relation `onDelete: Cascade`, `sheetData Json`, `derived Json`, `level Int`, `trigger SnapshotTrigger`, `note String?`, `createdAt`, `@@index([characterId, createdAt])`). **Ne pas ajouter** `CharacterNote`/`XpDistribution`/`XpDistributionEntry` ici — modèles des Stories 6.2/6.5, hors scope de cette story malgré leur présence dans le même bloc Prisma du document d'architecture (schéma final de l'épic entier).
  - [x] Migration : `docker compose exec api pnpm prisma migrate dev --name character_snapshot_leveling` puis `docker compose exec api pnpm prisma generate`. Nom distinct de la migration `xp_distribution` de la Story 6.2 — une migration incrémentale par story (cf. Dev Notes Story 6.2, convention déjà établie).
  - [x] `packages/shared/src/index.ts` (UPDATE) : ajouter `export type SnapshotTrigger = 'LEVEL_UP' | 'MJ_EDIT';`, `CharacterSnapshotDto { id: string; characterId: string; sheetData: SheetData; derived: DerivedStats; level: number; trigger: SnapshotTrigger; note?: string; createdAt: string }`, `CreateLevelUpDto { pvAllocated: number; peAllocated: number; capability: { type: string; params: Record<string, unknown> } }` — copier la forme exacte d'ARCHITECTURE-SPINE.md §Shared Types (le champ `capability.type` est typé `string` côté DTO partagé, pas `CapabilityType` — ce type vit dans `@master-jdr/game-rules`, pas `@master-jdr/shared`, et `packages/shared` ne doit pas dépendre de `packages/game-rules`).

- [x] **Task 2 — `RyuutamaSheetData.levelUps[]` & `computeDerived` (AD-2)** (AC: 3)
  - [x] `packages/game-rules/src/ryuutama/types.ts` (UPDATE) : ajouter à `RyuutamaSheetData` :
    ```ts
    levelUps?: {
      level: number;
      pvAllocated: number;   // 0-3
      peAllocated: number;   // 0-3, pvAllocated+peAllocated === 3
      capability: { type: CapabilityType; params: Record<string, unknown> };
    }[];
    ```
    `CapabilityType` est déjà exporté par `leveling.ts` (Story 6.2) — l'importer, ne pas le redéfinir. Champ optionnel (`?`) : les personnages créés avant ce palier n'ont pas ce champ, `computeDerived` doit gérer `undefined` (traiter comme `[]`).
  - [x] `packages/game-rules/src/ryuutama/compute-derived.ts` (UPDATE) : `PV = VIG×2 + Σ pvAllocated`, `PE = ESP×2 + Σ peAllocated`, `Encombrement = VIG+3 + levelUps.length` (+1 par niveau gagné, cf. PRD FR-8/AD-2) — sommes calculées sur `data.levelUps ?? []`. `Condition`/`Initiative` restent inchangés (aucune règle PRD ne les modifie). **Ne pas** faire de `computeDerived` une fonction qui accepte un second argument — elle reste `(data: RyuutamaSheetData) => DerivedStats`, elle lit `data.levelUps` en interne (cf. AD-2 : signature inchangée, consommée telle quelle par `validate`/`pdf-field-map.ts`/les tests existants).
  - [x] `packages/game-rules/src/__tests__/compute-derived.spec.ts` (UPDATE) : cas sans `levelUps` (comportement actuel inchangé, régression), cas avec 1 entrée (PV/PE/Encombrement +N), cas avec 2 entrées cumulées.

- [x] **Task 3 — `CharacterService.applyLevelUp` (verrouillage optimiste, AD-9)** (AC: 2, 3, 5)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter `async applyLevelUp(characterId: string, userId: string, dto: CreateLevelUpDto): Promise<CharacterDto>` :
    1. `getOwnCharacterOrThrow(characterId, userId)` (méthode privée existante, réutilisée telle quelle — propriétaire seul, pattern déjà utilisé par `updatePortrait`).
    2. Calculer `pending = pendingLevels(character.xp, (sheetData.levelUps ?? []).length)` (import depuis `@master-jdr/game-rules`, déjà exporté Story 6.2). Si `pending.length === 0` → `BadRequestException` (aucun niveau en attente).
    3. **Valider la somme** : `dto.pvAllocated + dto.peAllocated === 3`, chacun `>= 0` — sinon `BadRequestException` (défense en profondeur : le `pv-pe-stepper` frontend empêche déjà de dépasser 3, mais le serveur ne doit jamais faire confiance au client, cf. pattern `sheet-field`/`validate('mj')` déjà appliqué ailleurs).
    4. **Valider la capacité** : si `dto.capability.type === 'attribute'`, `dto.capability.params.attribute` doit être l'un de `AGI|ESP|INT|VIG` et sa valeur actuelle (`sheetData.attributes[attribute]`) doit être `< 12`, sinon `BadRequestException` (plafond niveau 12, cf. PRD addendum.md §Attribut, État "Attribut à 12" du tableau State Patterns EXPERIENCE.md). Pour les autres types (`landscape`/`class`/`immunity`/`type`/`dragon-protection`/`legendary-journey`), valider uniquement que `dto.capability.type` correspond au(x) type(s) attendu(s) pour ce niveau selon `LEVEL_TABLE[level].capabilities` — ne pas valider le contenu exact de `params` (catalogue déporté au frontend/content seed, cf. Task 6, cohérent avec le no-op existant sur les champs narratifs libres).
    5. Appliquer les effets : `sheetData.attributes[attribute] += 2` si capacité Attribut (seule capacité qui modifie `attributes`, cf. addendum.md) ; toutes les capacités (y compris Attribut) sont de toute façon appendues telles quelles à `levelUps[]` pour l'affichage sur la fiche (cf. PRD FR-8 "capacités choisies... enregistrées et affichées").
    6. `sheetData.levelUps = [...(sheetData.levelUps ?? []), { level: pending[0], pvAllocated: dto.pvAllocated, peAllocated: dto.peAllocated, capability: dto.capability }]`.
    7. `derived = computeDerived(sheetData)`.
    8. Écriture verrouillée (AD-9, même pattern que `updatePortrait`) : `prisma.character.updateMany({ where: { id: characterId, updatedAt: character.updatedAt }, data: { sheetData: sheetData as any, derived: derived as any } })` ; `count === 0` → `ConflictException` (409).
    9. Créer `CharacterSnapshot` : `prisma.characterSnapshot.create({ data: { characterId, sheetData: sheetData as any, derived: derived as any, level: pending[0], trigger: 'LEVEL_UP' } })` — **après** l'écriture réussie sur `Character`, jamais avant (pas de snapshot orphelin si le verrou optimiste échoue à l'étape précédente).
    10. Recharger le personnage et retourner `toDto(...)` (même pattern `resolveOwnerInfo` que `updatePortrait`/`removePortrait`).
    11. **Pas d'envoi d'e-mail ici** — le déclencheur `level-up` est sur les écrivains XP (`applyXpDelta`/`setXp`, Stories 6.2/6.6), pas sur l'application du niveau elle-même (cf. AD-6 "Notification e-mail").
  - [x] `toDto()` : aucun changement requis ici (déjà mis à jour par la Story 6.2 pour `xp`/`level`).
  - [x] `apps/api/src/characters/character.service.spec.ts` (UPDATE) : nouveau describe `applyLevelUp` — 400 si aucun niveau en attente, 400 si somme PV+PE ≠ 3, 400 si attribut déjà à 12, succès applique `levelUps[]`/`derived`/crée le snapshot, 409 si `updatedAt` périmé (mock `updateMany` retournant `{ count: 0 }`), erreur si non-propriétaire (`ForbiddenException` via `getOwnCharacterOrThrow`).

- [x] **Task 4 — `CharacterService.getHistory`** (AC: 4)
  - [x] `apps/api/src/characters/character.service.ts` (UPDATE) : ajouter `async getHistory(characterId: string, userId: string): Promise<CharacterSnapshotDto[]>` — accès **propriétaire OU MJ** (même pattern que `findOne`, pas `getOwnCharacterOrThrow` qui est propriétaire-seul ; cf. AD-8 "lectures MJ-ou-propriétaire → même pattern que `findOne`"). `prisma.characterSnapshot.findMany({ where: { characterId }, orderBy: { createdAt: 'desc' } })`, mapper en `CharacterSnapshotDto[]`.
  - [x] Test : 403 si ni propriétaire ni MJ, tri chronologique descendant, mapping correct des champs.

- [x] **Task 5 — Endpoints `CharactersController`** (AC: 2, 3, 4, 5)
  - [x] `apps/api/src/characters/dto/create-level-up.dto.ts` (NOUVEAU) : `class CreateLevelUpDto` avec `@IsInt() @Min(0) @Max(3) pvAllocated: number`, `@IsInt() @Min(0) @Max(3) peAllocated: number`, `@ValidateNested() @Type(() => CapabilityDto) capability: CapabilityDto` (sous-classe `{ @IsString() type: string; @IsObject() params: Record<string, unknown> }`) — suivre le pattern `class-validator` déjà établi (`create-poll.dto.ts`, `create-xp-distribution.dto.ts` de la Story 6.2).
  - [x] `apps/api/src/characters/characters.controller.ts` (UPDATE) : ajouter `@Post(':id/level-up') levelUp(@Param('id', ParseUUIDPipe) id, @Body() dto: CreateLevelUpDto, @CurrentUser() user)` → `this.characters.applyLevelUp(id, user.id, dto)`, et `@Get(':id/history') history(...)` → `this.characters.getHistory(id, user.id)`. Même style que les endpoints existants du fichier (pas de guard supplémentaire, `AuthenticatedGuard` déjà au niveau du contrôleur).

- [x] **Task 6 — Contenu data-driven pour les capacités non-Attribut** (AC: 2)
  - [x] `apps/api/game-systems/ryuutama/data/immunity-states.json` (NOUVEAU) : 6 entrées `{ key, label }` — Blessé, Choc, Empoisonné, Las, Malade, Surexcité (cf. addendum.md §Immunité).
  - [x] `apps/api/game-systems/ryuutama/data/seasons.json` (NOUVEAU) : 4 entrées `{ key, label }` — Printemps, Été, Automne, Hiver (cf. addendum.md §Protection d'un dragon, "le joueur choisit une saison").
  - [x] `apps/api/game-systems/ryuutama/data/landscapes.json` (NOUVEAU) : entrées `{ key, label }` pour les paysages/climats (addendum.md §Paysage : "22 disponibles"). **Le livre de règles Ryuutama n'est pas disponible dans ce dépôt** — lister les paysages/climats canoniques connus (forêt, montagne, désert, plaine, marécage, côte, rivière, toundra, jungle, volcan, etc.) jusqu'à un compte raisonnable ; si 22 exactement ne peuvent pas être sourcés avec certitude, en livrer un sous-ensemble cohérent (≥10) et noter dans `Completion Notes` que la liste est incomplète vis-à-vis de la règle "22 disponibles" — **ne jamais inventer un compte exact non vérifiable pour cocher la case**, un sous-ensemble honnête et extensible (JSON, pas de code en dur) est préférable à une fausse exhaustivité.
  - [x] `apps/api/src/game-systems/game-system.service.ts` (UPDATE) : ajouter 3 entrées à `CONTENT_TYPES` : `{ key: 'immunityState', label: 'État (immunité)', file: 'immunity-states.json' }`, `{ key: 'season', label: 'Saison', file: 'seasons.json' }`, `{ key: 'landscape', label: 'Paysage/climat', file: 'landscapes.json' }`. `class`/`type` (capacités Classe/Type niveaux 5/6+) sont **déjà** seedés (`classes.json`/`types.json`, réutilisés tels quels — pas de nouveau fichier).
  - [x] `apps/api/src/game-systems/game-system.service.spec.ts` (UPDATE) : étendre les assertions de seed avec les 3 nouveaux `CONTENT_TYPES` si le test itère dessus.

- [x] **Task 7 — Frontend : `LevelUpBanner`** (AC: 1)
  - [x] `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Input `character = input.required<CharacterDto>()`. `pendingCount = computed(() => pendingLevelsLocal(character().xp, (character().sheetData as any)?.levelUps?.length ?? 0).length)` — **ne pas importer `@master-jdr/game-rules` côté Angular** (package Node, cf. Dev Notes Story 6.2 — aucun précédent d'import côté `apps/web`) : dupliquer un calcul minimal local à partir de `LEVEL_TABLE`-like seuils (juste les nombres XP, pas la logique de capacités), même stratégie que le calcul d'avertissement de `XpDistributionPanel` (Story 6.2). Output `levelUp = output<void>()` émis au clic sur le CTA. Template : bannière visible seulement si `pendingCount() > 0`, `aria-live="polite"` sur le conteneur, texte `theme.tone()['evolution.levelup_banner']` (remplacer `[N]` par le niveau cible), CTA `theme.tone()['evolution.levelup_cta']`.
  - [x] Styles (DESIGN.md §7 LevelUpBanner) : fond `{colors.gradient-cta}` à 15% d'opacité, bordure `1px solid rgba({colors.accent-1-rgb}, 0.4)`, `border-radius: {rounded.radius-card}`, CTA compact (padding 8px 16px, `min-height: 44px` mobile / `36px` desktop explicite, pas pleine largeur).

- [x] **Task 8 — Frontend : `LevelUpWizard`** (AC: 2, 3)
  - [x] `apps/web/src/app/core/characters/character.service.ts` (UPDATE) : ajouter `levelUp(characterId, dto): Promise<CharacterDto>` (`POST .../level-up`), `getHistory(characterId): Promise<CharacterSnapshotDto[]>` (`GET .../history`) — via `API_BASE`, même pattern que les méthodes existantes de ce fichier.
  - [x] `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.ts` (+ `.html`, `.scss`, NOUVEAU), standalone, ouvert en `MatDialog` (réutiliser le pattern `PortraitCropper`/`dialog.open<...>` déjà dans `character-sheet.ts`). Data d'entrée : `{ character: CharacterDto, content: GameSystemContentDto | null }`. État interne : `pendingLevels` (calcul local, cf. Task 7), `currentIndex` signal (progression multi-segments si plusieurs niveaux — barre de progression réutilisant le pattern segments de `CalendarNav`, cf. DESIGN.md), `pvAllocated`/`peAllocated` signals (somme contrainte à 3 : bouton `+` désactivé sur une colonne si l'autre colonne est déjà à 3, `aria-label` distincts par bouton — cf. DESIGN.md `pv-pe-stepper`), `capabilityType` (dérivé de `LEVEL_TABLE[level].capabilities` — dupliquer localement la liste `{level, capabilities}` sans la logique de calcul XP, même contrainte "pas d'import `@master-jdr/game-rules`" que Task 7), `capabilityParams` (objet libre selon le type choisi).
  - [x] Rendu du choix de capacité selon `capabilityType` :
    - `'attribute'` → `attribute-choice-grid` (grille 4 colonnes AGI/ESP/INT/VIG, `min-height: 44px`/`36px`), désactive la cellule si `character().sheetData.attributes[attr] >= 12` **et** qu'un autre attribut reste disponible (`aria-disabled` + `aria-describedby` pointant vers "Déjà au maximum (12)"), affiche la flèche "valeur → valeur+2" sur sélection.
    - `'landscape'` / `'class'` / `'immunity'` / `'type'` / `'dragon-protection'` → liste/sélecteur simple (`mat-selection-list` ou équivalent) peuplé depuis `content()['landscape'|'class'|'immunityState'|'type'|'season']` (mapping type→clé de contenu, cf. Task 6) — **aucun spec visuel détaillé par DESIGN.md/EXPERIENCE.md pour ce cas** (seule `attribute-choice-grid` est spécifiée en détail) ; réutiliser le style `choice-card`/`ChoiceCard` déjà existant dans `character-wizard/choice-card/` (assistant de création, Story 4.2) pour rester cohérent visuellement plutôt que d'inventer un nouveau pattern.
    - `'legendary-journey'` → pas de choix, texte informatif uniquement (aucun `params`), bouton "Valider" directement actif.
  - [x] Bouton "Valider ce niveau" appelle `characterSvc.levelUp(characterId, { pvAllocated, peAllocated, capability: { type: capabilityType(), params: capabilityParams() } })`. Après succès : si `currentIndex() < pendingLevels().length - 1` (autre niveau déjà franchi), avancer à l'étape suivante (réinitialiser stepper/capacité, réutiliser le personnage mis à jour retourné par l'appel précédent pour recalculer `pendingLevels`) ; sinon fermer le dialog et émettre le personnage mis à jour au parent.
  - [x] `character-sheet.ts` (UPDATE) : ajouter méthode `openLevelUpWizard()` (même garde `dialogOpen` que `editPortrait()`), `afterClosed()` met à jour `this.character.set(updatedCharacter)` si non-null.
  - [x] `character-sheet.html` (UPDATE) : afficher `<app-level-up-banner [character]="c" (levelUp)="openLevelUpWizard()" />` juste sous le `<header>`, visible pour le propriétaire uniquement (`@if (isOwner())`) — c'est le propriétaire qui applique ses propres montées de niveau (FR-6), pas le MJ. Remplacer le texte statique `"Niveau 1"` de la ligne meta (`sheet__meta`, ligne actuelle `character-sheet.html:16`) par `Niveau {{ c.level }}` (champ ajouté par la Story 6.2, dérivé serveur) — **bug de régression sinon** : la fiche afficherait un niveau figé à 1 après cette story alors que `applyLevelUp` fait progresser le vrai niveau.

- [x] **Task 9 — Frontend : `history-tab`** (AC: 4)
  - [x] `apps/web/src/app/features/characters/character-sheet/history-tab/history-tab.ts` (+ `.html`, `.scss`, NOUVEAU), standalone. Input `characterId = input.required<string>()`. Charge `characterSvc.getHistory(characterId())` dans un `effect()` (pattern déjà utilisé pour `loadLinks()`/`loadXpDistributions()`, cf. Story 6.2 Dev Notes) déclenché au montage. Liste chronologique (déjà triée serveur, pas de re-tri) : date (`createdAt`), déclencheur (`trigger === 'LEVEL_UP' ? 'Niveau ' + level : 'Modifié par le MJ'`), note si présente. Pas d'action de restauration (AC4). Empty state si liste vide.
  - [x] `character-sheet.html` (UPDATE) : ajouter une section/onglet "Historique" (`<app-history-tab [characterId]="c.id" />`) visible pour propriétaire **et** MJ (`@if (isOwner() || viewerIsMj())`, cf. AC4 "propriétaire ou MJ") — la fiche actuelle n'a pas de système d'onglets Material (`sheet__body` en 2 colonnes de `<section>`), ajouter cette section en bas de page plutôt que d'introduire un `mat-tab-group` pour une seule nouvelle section (pas de justification à une refonte de layout pour ce seul ajout ; les Stories 6.4/6.5 ajouteront Inventaire/Notes ensuite — si un vrai système d'onglets devient nécessaire à ce moment-là, cf. Dev Notes ci-dessous).

- [x] **Task 10 — Microcopy** (AC: 1, 2)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : `evolution.levelup_banner` et `evolution.levelup_cta` — valeurs **exactes** fournies par EXPERIENCE.md §3 (déjà citées dans les AC). Ajouter (registre libre, suivre le ton déjà établi par thème) : titre du wizard, libellés d'étape, `evolution.levelup_confirm_cta`, libellé "Historique" pour la nouvelle section. Les 3 thèmes exigés à chaque fois.

- [x] **Task 11 — Tests frontend** (AC: 1-5)
  - [x] `level-up-banner.spec.ts` (NOUVEAU) : bannière absente si aucun niveau en attente, visible + `aria-live="polite"` sinon, CTA émet `levelUp`.
  - [x] `level-up-wizard.spec.ts` (NOUVEAU) : stepper PV/PE empêche de dépasser 3 au total, `attribute-choice-grid` désactive un attribut à 12, soumission appelle `characterSvc.levelUp` avec le payload attendu, enchaînement automatique si plusieurs niveaux en attente (barre de progression multi-segments), fermeture après le dernier niveau.
  - [x] `history-tab.spec.ts` (NOUVEAU) : liste vide → empty state ; liste non vide → date/déclencheur/note affichés, triés (confiance dans l'ordre backend).
  - [x] `character-sheet.spec.ts` (UPDATE) : bannière visible propriétaire uniquement si niveau en attente ; section historique visible propriétaire + MJ ; niveau affiché dynamique (`c.level`) au lieu de "Niveau 1" figé.

## Dev Notes

- **Architecture** : cf. `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md` — AD-1 (XP/niveau posés par 6.2, prérequis), AD-2 (`levelUps[]` dans `sheetData`, `computeDerived` reste pur), AD-5 (`CharacterSnapshot` modèle dédié, **créé par cette story** mais réutilisé par la 6.6 pour `MJ_EDIT` — ne pas dupliquer le modèle/l'enum dans la 6.6), AD-6 (`POST /characters/:id/level-up` propriétaire uniquement, séquentiel — **cette story n'implémente ni `PATCH /xp` ni `PATCH /sheet-field`**, réservés à la 6.6 ; email `level-up` **pas** déclenché ici), AD-8 (accès MJ-ou-propriétaire pour l'historique = pattern `findOne`, propriétaire seul pour `level-up` = pattern `getOwnCharacterOrThrow`), AD-9 (verrouillage optimiste `updatedAt` — **appliqué ici**, contrairement à `applyXpDelta` de la 6.2 qui en est explicitement exclu ; ne pas confondre les deux mécanismes).
- **Pourquoi `computeDerived` reste `(data) => DerivedStats`** : AD-2 est explicite — élargir la signature casserait tous les appelants existants (`validate`, `pdf-field-map.ts`, tests). La fonction lit `data.levelUps` en interne, exactement comme elle lit déjà `data.attributes`.
- **Duplication délibérée du calcul de seuils côté client** (`LevelUpBanner`, `LevelUpWizard`) : même contrainte que `XpDistributionPanel` (Story 6.2 Dev Notes) — `packages/game-rules` est un package Node, jamais importé côté `apps/web`. Dupliquer uniquement les nombres bruts (seuils XP, table niveau→capacités), jamais la logique de validation métier (ex. la validation stricte "attribut < 12" reste **côté serveur uniquement**, le frontend ne fait que désactiver visuellement — le serveur revalide de toute façon, cf. Task 3.4).
- **Contenu de capacité non-Attribut, absence de spec UX détaillée** : DESIGN.md ne détaille visuellement que `attribute-choice-grid`. Pour Classe/Type/Immunité/Paysage/Saison (Protection d'un dragon), ce choix d'implémentation (Task 8) réutilise `ChoiceCard` de l'assistant de création (`character-wizard/choice-card/`) plutôt que d'inventer un nouveau pattern visuel — cohérent avec "pas de duplication de token/pattern non justifiée" (DESIGN.md Do's and Don'ts).
- **Paysages incomplets (Task 6)** : le livre de règles Ryuutama n'étant pas disponible dans ce dépôt, la liste exacte des "22 paysages/climats" (PRD §4.2, addendum.md) ne peut pas être garantie exhaustive par ce seul contexte. Livrer un sous-ensemble honnête plutôt qu'une liste inventée pour atteindre le chiffre — signaler l'écart dans `Completion Notes List`, ce n'est **pas bloquant** pour les AC (le mécanisme de choix fonctionne quel que soit le nombre d'entrées seedées).
- **`sheetData.levelUps` optionnel** : tous les personnages créés avant ce palier (Épic 4/5) n'ont pas ce champ — `computeDerived`, `applyLevelUp`, et le frontend doivent tous traiter `undefined`/absent comme `[]`, jamais planter dessus (pattern déjà rencontré Story 6.2 avec `character.xp` potentiellement `undefined` sur de vieux mocks de test).
- **Historique = section, pas onglet Material** (Task 9) : la fiche actuelle (`character-sheet.html`) n'a pas de `mat-tab-group` — ajouter une section supplémentaire est cohérent avec la structure `sheet__body` à 2 colonnes de `<section class="sheet__card">` déjà en place. Si les Stories 6.4 (Inventaire)/6.5 (Notes) qui suivent immédiatement dans le sprint ajoutent chacune une nouvelle zone du même genre, une vraie refonte en onglets deviendra probablement justifiée à ce moment — **ne pas l'anticiper ici** (généricité spéculative pour un besoin qui n'existe pas encore dans cette story seule).
- **Pattern de référence pour les DTOs validés** : `apps/api/src/xp-distributions/dto/create-xp-distribution.dto.ts` (Story 6.2) et `apps/api/src/poll/dto/create-poll.dto.ts` — classe imbriquée `@ValidateNested()` + `@Type()`.
- **Accessibilité (NFR4)** : `pv-pe-stepper` — 4 `aria-label` distincts ("Diminuer/Augmenter PV/PE"), jamais un bouton rond icône-seule sans label. `attribute-choice-grid` — `aria-label` par état (défaut/sélectionné/désactivé) exactement comme spécifié DESIGN.md §7. `LevelUpBanner` — `aria-live="polite"`, jamais `assertive` (ne doit pas interrompre une tâche en cours).

### Project Structure Notes

- Nouveaux composants standalone frontend sous `apps/web/src/app/features/characters/character-sheet/` : `level-up-banner/`, `level-up-wizard/`, `history-tab/` — un fichier `.ts`/`.html`/`.scss` par composant, pas de sous-composants séparés pour `pv-pe-stepper`/`attribute-choice-grid` (rendus inline dans le template de `level-up-wizard`, cf. arborescence ARCHITECTURE-SPINE.md qui ne liste que `level-up-wizard.ts`).
- Migration Prisma unique pour cette story : `character_snapshot_leveling` (scope réduit à l'enum `SnapshotTrigger` + `CharacterSnapshot` — voir Task 1).
- 3 nouveaux fichiers de seed JSON sous `apps/api/game-systems/ryuutama/data/` : `immunity-states.json`, `seasons.json`, `landscapes.json` — `classes.json`/`types.json` existants sont réutilisés tels quels pour les capacités Classe/Type.
- `computeDerived`/`validate` (`packages/game-rules`) modifiés uniquement pour `computeDerived` dans cette story ; `validate` n'est pas touché (aucune règle de création n'est concernée par `levelUps[]`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6, Story 6.3 ; FR5-FR8, FR12-FR13, NFR1 ; FR Coverage Map]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-5, AD-6, AD-8, AD-9, Shared Types, Schema Prisma]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md#4.2 Montée de niveau & capacités, FR-5 à FR-8, FR-12, FR-13]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/addendum.md — détail mécanique de chaque type de capacité]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md#4. Component Patterns (Montée de niveau), #3. Voice and Tone, #5. State Patterns, #7. Accessibility Floor]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md#7. Components — LevelUpBanner, LevelUpWizard]
- [Source: _bmad-output/implementation-artifacts/6-2-distribuer-xp-apres-session.md — infrastructure XP prérequise (leveling.ts, Character.xp, toDto), patterns dupliqués (calcul seuils client, structure DTO validée)]
- [Source: apps/api/src/characters/character.service.ts — lu intégralement (updatePortrait pour le pattern de verrou optimiste à répliquer, getOwnCharacterOrThrow, resolveOwnerInfo)]
- [Source: apps/api/src/characters/characters.controller.ts — pattern d'endpoints existant]
- [Source: apps/api/src/game-systems/game-system.service.ts — pattern CONTENT_TYPES/seed data-driven à étendre]
- [Source: apps/api/game-systems/ryuutama/data/classes.json — format des fichiers de seed existants]
- [Source: packages/game-rules/src/ryuutama/compute-derived.ts, types.ts, validate.ts — lus intégralement]
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts, .html — état actuel, lu intégralement (niveau figé "Niveau 1" à corriger)]
- [Source: apps/web/src/app/features/characters/character-wizard/choice-card/ — pattern réutilisable pour le choix de capacité générique]
- [Source: packages/shared/src/index.ts#CharacterDto]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

Aucun blocage rencontré. Prérequis Story 6.2 vérifié en place avant de commencer (`leveling.ts` avec `LEVEL_TABLE`/`pendingLevels`/`CapabilityType`, `Character.xp`, `CharacterDto.xp`/`level`).

### Completion Notes List

- Toutes les tâches 1-11 complétées, tous les AC couverts.
- **Landscapes incomplets (Task 6, assumé)** : le livre de règles Ryuutama n'étant pas disponible dans ce dépôt, `landscapes.json` livre un sous-ensemble honnête de 12 paysages/climats canoniques (forêt, montagne, désert, plaine, marécage, côte, rivière, toundra, jungle, volcan, prairie, falaise) plutôt que les "22 disponibles" mentionnés par le PRD — non bloquant pour les AC, le mécanisme de choix fonctionne quel que soit le nombre d'entrées seedées.
- Migration Prisma `character_snapshot_leveling` appliquée et `prisma generate` exécuté avec succès (conteneur `api`).
- Tokens CSS `--jdr-accent-1-rgb` (3 thèmes) ajoutés à `apps/web/src/styles.scss` — gap pré-existant signalé par DESIGN.md §2, comblé ici car bloquant pour le style `LevelUpBanner`.
- Pour les capacités non-Attribut couvrant plusieurs types possibles au même niveau (ex. niveau 4 : `attribute` + `immunity`), le `LevelUpWizard` présente un choix de type de capacité avant le sous-formulaire correspondant — DESIGN.md/EXPERIENCE.md ne précisent pas ce cas (un seul type par niveau dans la majorité des cas), décision d'implémentation cohérente avec le modèle serveur (une seule capacité par entrée `levelUps[]`).
- Régression vérifiée : `Character.level`/`Niveau {{ c.level }}` remplace le texte statique "Niveau 1" dans `character-sheet.html`.
- Suite de tests complète exécutée après implémentation : 286/286 (api), 344/344 (web), 45/45 (`@master-jdr/game-rules`) — aucune régression.
- `tsc --noEmit` et `ng build` : les erreurs résiduelles (rootDir `packages/*` sous `tsc` brut, budget de bundle initial dépassé) préexistent sur `master` avant cette story (vérifié par comparaison stash) — non introduites par ce travail.

### File List

**Backend**
- `apps/api/prisma/schema.prisma` (M) — `enum SnapshotTrigger`, `model CharacterSnapshot`, relation `Character.snapshots`
- `apps/api/prisma/migrations/20260709212921_character_snapshot_leveling/migration.sql` (A)
- `packages/shared/src/index.ts` (M) — `SnapshotTrigger`, `CharacterSnapshotDto`, `CreateLevelUpDto`
- `packages/game-rules/src/ryuutama/types.ts` (M) — `RyuutamaSheetData.levelUps[]`
- `packages/game-rules/src/ryuutama/compute-derived.ts` (M) — PV/PE/Encombrement tiennent compte de `levelUps`
- `packages/game-rules/src/__tests__/compute-derived.spec.ts` (M)
- `apps/api/src/characters/character.service.ts` (M) — `applyLevelUp`, `getHistory`
- `apps/api/src/characters/character.service.spec.ts` (M)
- `apps/api/src/characters/characters.controller.ts` (M) — `POST :id/level-up`, `GET :id/history`
- `apps/api/src/characters/dto/create-level-up.dto.ts` (A)
- `apps/api/src/game-systems/game-system.service.ts` (M) — 3 `CONTENT_TYPES` supplémentaires
- `apps/api/game-systems/ryuutama/data/immunity-states.json` (A)
- `apps/api/game-systems/ryuutama/data/seasons.json` (A)
- `apps/api/game-systems/ryuutama/data/landscapes.json` (A)

**Frontend**
- `apps/web/src/app/core/characters/character.service.ts` (M) — `levelUp`, `getHistory`
- `apps/web/src/app/core/theme/tones.ts` (M) — clés `evolution.levelup_*`/`evolution.history_*`/`evolution.mj_edit_trace`, 3 thèmes
- `apps/web/src/styles.scss` (M) — `--jdr-accent-1-rgb` (3 thèmes)
- `apps/web/src/app/features/characters/character-sheet/level-thresholds.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.html` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.html` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/history-tab/history-tab.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/history-tab/history-tab.html` (A)
- `apps/web/src/app/features/characters/character-sheet/history-tab/history-tab.scss` (A)
- `apps/web/src/app/features/characters/character-sheet/history-tab/history-tab.spec.ts` (A)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (M)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (M)

## Review Findings

_Code review 2026-07-10 — 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 decision-needed + 3 patch → tous résolus/appliqués (Incon a tranché les 2 décisions en patch). 4 dismissed as noise. Suites vertes après correctifs : game-rules 61 / api 296 / web 374._

### Décisions requises (résolues → patch, appliquées)

- [x] **[Review][Decision → Patch] Niveaux 4/6/10 : Attribut ET spéciale (pas un choix exclusif)** — Décision Incon : c'est un « ET ». Refonte du modèle `levelUps[].capability` (singulier) → `capabilities[]` (tableau, 2 aux niveaux 4/6/10). Le serveur exige désormais l'ensemble exact des types attendus, applique les deux effets, et le wizard rend les deux sous-formulaires. Impacte `types.ts`, `@master-jdr/shared`, `create-level-up.dto.ts`, `character.service.ts`, `pdf-field-map.ts`, `ryuutama-pdf.service.ts`, `capability-label.util.ts` (aplatissement `FlatCapability`), `history-tab.ts`, `level-up-wizard.ts/.html` + tests. [source: edge]
- [x] **[Review][Decision → Patch] Validation serveur de `params.key` contre le contenu seedé** — Décision Incon : ajouter la validation. `applyLevelUp` charge le contenu du système (`CONTENT_KEY_BY_CAPABILITY`) et rejette (`400`) toute clé absente du seed pour `landscape`/`immunity`/`class`/`type`/`dragon-protection` — parité avec la validation Attribut. [source: blind+edge — `character.service.ts`, `create-level-up.dto.ts`]

### Patchs appliqués

- [x] **[Review][Patch] Écriture Character + snapshot atomiques** — `updateMany` (verrou optimiste) + `characterSnapshot.create` enveloppés dans `prisma.$transaction` : ni niveau appliqué sans snapshot, ni snapshot orphelin sur conflit. [source: blind+edge — `character.service.ts`]
- [x] **[Review][Patch] Barre de progression multi-segments corrigée** — itère désormais sur `progressSteps` (longueur fixe `totalSteps`) et marque `--done` via `i < currentStepNumber() - 1` ; visuel et ARIA cohérents. [source: blind+edge+auditor — `level-up-wizard.html`/`.ts`]
- [x] **[Review][Patch] Région `aria-live` persistante** — conteneur `.level-up-banner-live[aria-live="polite"]` toujours monté (propriétaire) ; seul le texte bascule → annonce fiable de l'apparition. [source: edge — `level-up-banner.html`]

### Écartés (noise / conforme spec / justifié)

- **Encombrement += `levelUps.length`** — conforme à la spec (AD-2 / FR-8, +1 par niveau) ; tests dédiés. Intentionnel.
- **Impasse « 4 attributs à 12 »** — `isAttributeDisabled` autorise la sélection puis le serveur renvoie 400 ; scénario pratiquement inatteignable vu le budget d'attributs (cap niveau 10). Non bloquant.
- **Note de complétion `landscapes` (« 12 »)** — le fichier livré contient en réalité 22 entrées (conforme PRD « 22 disponibles ») ; seule la note est périmée. Livrable OK.
- **`toDto()` redéfinit `level` (potentiel → appliqué)** — contredit le texte littéral de Task 3 (« aucun changement requis ») mais fonctionnellement nécessaire à la cohérence d'AC1 (sinon la fiche affiche N pendant que la bannière propose « Niveau N ») ; doc du type partagé mise à jour. Déviation justifiée, signalée pour information.
