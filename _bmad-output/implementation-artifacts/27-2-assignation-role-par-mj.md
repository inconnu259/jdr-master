---
baseline_commit: 7c1d080ae040e51ed403a16770153d6131158da2
---

# Story 27.2: Assignation d'un rôle par le MJ

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want assigner un rôle de groupe à un personnage de ma Partie,
so that les joueurs sachent qui tient quel rôle sans avoir à le gérer eux-mêmes.

## Contexte

Le catalogue des 4 rôles (`ContentType` `groupRole`, Story 27.1) existe déjà. Cette story ajoute le **stockage relationnel** de l'assignation réelle — contrairement à l'arme précise/personnalisée (`sheetData.weaponId`/`customWeapon`, JSON) ou l'équipement de départ (résolu dans `equipment.individual`), le rôle assigné est une donnée **stable, partagée à l'échelle de la Partie et interrogée** (« ce rôle a-t-il déjà un titulaire ? ») — l'architecture (AD-5) tranche donc pour un nouveau modèle Prisma relationnel `CharacterGroupRole`, jamais du JSON dans `sheetData`.

**Décisions déjà actées par l'architecture (AD-5/AD-6/AD-8, `ARCHITECTURE-SPINE.md`), aucune question ouverte** :
- Nouveau module dédié `apps/api/src/character-roles/` (`CharacterRolesModule`/`Service`/`Controller`) — jamais fondu dans `CharacterModule` (déjà volumineux, portée d'écriture différente : cross-personnage à l'échelle de la Partie, pas propriétaire-ou-MJ sur un personnage donné).
- Écriture (assigner/retirer) = MJ uniquement (`PartiesService.getOwned`) ; lecture = tout membre (`PartiesService.getViewable`) — aucun nouveau guard NestJS, réutilise le pattern déjà établi partout ailleurs (`XpDistributionsService`, `AnnouncementsService`).
- Assigner un `roleKey` déjà tenu par un autre personnage de la Partie → `ConflictException` explicite, **jamais** une éviction silencieuse de l'ancien titulaire. Le MJ doit d'abord le retirer explicitement (endpoint DELETE). C'est un plancher minimal, pas la politique complète de réassignation (Open Question 4 du PRD, encore non tranchée — **hors scope de cette story**, ne pas anticiper un endpoint de « transfert en une action »).
- `CharacterRolesService.assign()` vérifie explicitement que le `characterId` ciblé appartient bien au `partieId` avant toute écriture (jamais une confiance implicite dans l'appelant) — même pattern que `XpDistributionsService.createDistribution()`.
- `CharacterRolesService.assign()`/`unassign()` appelle `this.realtimeEvents.emit(partieTopic(partieId))` en toute fin de méthode réussie — même discipline que tous les services de mutation existants (P7-AD-2/AD-8).

## Acceptance Criteria

1. **Given** un nouveau modèle Prisma `CharacterGroupRole { id, characterId, partieId, roleKey, assignedAt }`, **when** cette story est implémentée, **then** deux contraintes d'unicité sont en place : `[partieId, roleKey]` (un seul titulaire par rôle par Partie) et `[partieId, characterId]` (un personnage ne porte jamais deux rôles à la fois).
2. **Given** un nouveau module dédié `CharacterRolesModule` (`apps/api/src/character-roles/`), **when** le MJ assigne ou retire un rôle, **then** seul le MJ de la Partie peut écrire (`getOwned`) ; tout membre peut lire (`getViewable`) — aucun nouveau guard NestJS.
3. **Given** un `characterId` ciblé, **when** une assignation est demandée, **then** le service vérifie explicitement que ce personnage appartient bien au `partieId` avant toute écriture.
4. **Given** un `roleKey` déjà tenu par un autre personnage, **when** le MJ tente de l'assigner à un second personnage, **then** la requête échoue explicitement (`ConflictException`) — jamais une éviction silencieuse de l'ancien titulaire (le MJ doit d'abord le retirer explicitement).
5. **Given** les endpoints `POST`/`DELETE /parties/:id/characters/:characterId/role` et `GET /parties/:id/character-roles`, **when** une assignation ou un retrait réussit, **then** `CharacterRolesService` appelle `realtimeEvents.emit(partieTopic(partieId))` en fin de méthode, même discipline que les autres services de mutation.

## Tasks / Subtasks

- [x] Task 1 — Modèle Prisma et migration (AC: #1)
  - [x] `apps/api/prisma/schema.prisma` : ajouter le modèle (déjà entièrement spécifié par l'architecture, à copier tel quel) :
    ```prisma
    model CharacterGroupRole {
      id          String    @id @default(uuid())
      characterId String
      character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
      partieId    String
      partie      Partie    @relation(fields: [partieId], references: [id], onDelete: Cascade)
      roleKey     String    // référence ContentEntry (groupRole), jamais une FK stricte (même pattern que Homme Dragon AD-4)
      assignedAt  DateTime  @default(now())

      @@unique([partieId, roleKey])
      @@unique([partieId, characterId])
    }
    ```
  - [x] Ajouter les relations inverses : `Character.groupRoles CharacterGroupRole[]` (dans `model Character`, ligne ~308-310, à côté de `xpDistributionEntries`/`snapshots`/`notes`) et `Partie.characterGroupRoles CharacterGroupRole[]` (dans `model Partie`, ligne ~60-69, à côté de `xpDistributions`/`announcements`).
  - [x] Générer la migration : `docker compose exec api pnpm prisma migrate dev --name character_group_role` (jamais éditer manuellement le SQL généré).
- [x] Task 2 — DTOs partagés (AC: #1)
  - [x] `packages/shared/src/index.ts` : ajouter (même style que `AnnouncementDto`, ligne ~195-201) :
    ```ts
    export interface CharacterGroupRoleDto {
      id: string;
      characterId: string;
      partieId: string;
      roleKey: string;
      assignedAt: string;
    }
    /** Payload d'assignation (POST /parties/:id/characters/:characterId/role). */
    export interface AssignGroupRoleDto {
      roleKey: string;
    }
    ```
- [x] Task 3 — Nouveau module backend `CharacterRolesModule` (AC: #2, #3, #4, #5)
  - [x] `apps/api/src/character-roles/dto/assign-group-role.dto.ts` : `class AssignGroupRoleDto { @IsString() @IsNotEmpty() roleKey!: string; }` (même style `class-validator` que `create-announcement.dto.ts`).
  - [x] `apps/api/src/character-roles/character-roles.service.ts` :
    - Constructeur : `PrismaService`, `PartiesService`, `RealtimeEventsService`, `GameSystemService` (pour valider `roleKey` contre le catalogue `groupRole` seedé — cf. Dev Notes, décision non explicitement couverte par les AC mais cohérente avec la convention établie du projet).
    - `assign(partieId: string, mjId: string, characterId: string, roleKey: string): Promise<CharacterGroupRoleDto>` :
      1. `await this.parties.getOwned(partieId, mjId)` (AC2).
      2. Valider `roleKey` contre `content['groupRole']` (`this.gameSystems.getContent(partie.gameSystemId)`) — `BadRequestException` si clé inconnue du catalogue (même esprit que la validation `buildRyuutamaCatalog()`/`validate()` ailleurs, jamais une clé arbitraire acceptée).
      3. Vérifier que `characterId` appartient à `partieId` (`prisma.character.findUnique({ where: { id: characterId }, select: { partieId: true } })`, comparer — `BadRequestException` sinon, AC3, même pattern que `XpDistributionsService.createDistribution()`).
      4. `prisma.characterGroupRole.create({ data: { characterId, partieId, roleKey } })` dans un `try/catch` ciblé sur `P2002` (Prisma unique constraint) → `ConflictException` (AC4 — couvre **les deux** contraintes d'unicité : `roleKey` déjà tenu par un autre personnage, **et** `characterId` portant déjà un rôle différent, cf. Dev Notes — l'AC4 ne cite explicitement que le premier cas mais le second découle directement du même modèle et de la même philosophie « jamais d'éviction silencieuse »).
      5. `this.realtimeEvents.emit(partieTopic(partieId))` (AC5, après l'écriture réussie, jamais dans un bloc pouvant lever après coup).
      6. Retourner le DTO mappé.
    - `unassign(partieId: string, mjId: string, characterId: string): Promise<void>` :
      1. `await this.parties.getOwned(partieId, mjId)`.
      2. `prisma.characterGroupRole.deleteMany({ where: { partieId, characterId } })` — si `count === 0` → `NotFoundException` (« Aucun rôle assigné à ce personnage » — explicite, jamais un no-op silencieux, cohérent avec la philosophie du module).
      3. `this.realtimeEvents.emit(partieTopic(partieId))` (AC5).
    - `listForPartie(partieId: string, userId: string): Promise<CharacterGroupRoleDto[]>` :
      1. `await this.parties.getViewable(partieId, userId)` (AC2, lecture ouverte à tout membre).
      2. `prisma.characterGroupRole.findMany({ where: { partieId } })`, mappé en DTO.
  - [x] `apps/api/src/character-roles/character-roles.controller.ts` (même pattern `@UseGuards(AuthenticatedGuard)` + `@CurrentUser()` que `XpDistributionsController`) :
    - `@Post('parties/:id/characters/:characterId/role')` → `assign(partieId, user.id, characterId, dto.roleKey)`.
    - `@Delete('parties/:id/characters/:characterId/role')` → `unassign(partieId, user.id, characterId)`.
    - `@Get('parties/:id/character-roles')` → `listForPartie(partieId, user.id)` (route distincte du préfixe `characters/:characterId/role`, donc pas de `@Controller('parties/:id/...')` unique commun aux 3 routes — utiliser `@Controller()` racine et des chemins complets par méthode, ou vérifier si Nest permet 2 préfixes différents sur un même contrôleur ; si non, séparer en 2 `@Controller` dans le même module est acceptable, au choix de l'implémentation).
  - [x] `apps/api/src/character-roles/character-roles.module.ts` : `imports: [PartiesModule]`, `controllers: [...]`, `providers: [CharacterRolesService]` — **ne pas** importer `CharacterModule` (aucun besoin réel : la vérification d'appartenance du personnage se fait par requête Prisma directe, même pattern que `XpDistributionsService`, pas via `CharacterService`) ; `GameSystemModule` doit être importé pour injecter `GameSystemService` (validation du `roleKey`).
  - [x] `apps/api/src/app.module.ts` : enregistrer `CharacterRolesModule` dans les imports (même pattern que `AnnouncementsModule`, dernière ligne du bloc `imports`).
- [x] Task 4 — Tests (AC: #1-#5)
  - [x] `apps/api/src/character-roles/character-roles.service.spec.ts` (nouveau, mocks `PrismaService`/`PartiesService`/`RealtimeEventsService`/`GameSystemService`, même style que `xp-distributions.service.spec.ts`) :
    - `assign()` : MJ + `roleKey` valide + `characterId` de la Partie → `characterGroupRole.create` appelé, DTO retourné, `realtimeEvents.emit` appelé avec `partieTopic(partieId)`.
    - `assign()` : non-MJ → `parties.getOwned` rejette → propagation, aucune écriture.
    - `assign()` : `roleKey` inconnu du catalogue `groupRole` → `BadRequestException`, aucune écriture.
    - `assign()` : `characterId` n'appartenant pas à `partieId` → `BadRequestException`, aucune écriture.
    - `assign()` : `roleKey` déjà tenu par un autre personnage (simuler erreur Prisma `P2002`) → `ConflictException`.
    - `assign()` : `characterId` portant déjà un rôle différent (simuler `P2002` sur la 2e contrainte) → `ConflictException` (même chemin de gestion d'erreur que le cas précédent — un seul `catch` couvre les deux contraintes).
    - `unassign()` : rôle existant → `deleteMany` appelé, `realtimeEvents.emit` appelé.
    - `unassign()` : aucun rôle assigné (`count === 0`) → `NotFoundException`, `realtimeEvents.emit` non appelé.
    - `listForPartie()` : membre (pas MJ) → `getViewable` appelé, liste retournée.
  - [x] `apps/api/src/character-roles/character-roles.controller.spec.ts` (nouveau, même style que `xp-distributions.controller.spec.ts` si présent, sinon calqué sur le pattern controller existant) : vérifie que chaque route délègue au bon appel de service avec les bons paramètres extraits (`@Param`/`@CurrentUser`/`@Body`).
  - [x] Suite complète (`docker compose exec api pnpm test`) — baseline actuelle (post-Story 27.1) : 908 API, aucune régression attendue au-delà des ajouts listés.
  - [x] `docker compose exec api pnpm typecheck` propre.
  - [x] Redémarrage réel du conteneur API vérifié (migration appliquée sans erreur, `Nest application successfully started`, nouvelles routes mappées dans les logs).

### Review Findings

- [x] [Review][Patch] `assign()` ne catch que `P2002` — une violation de FK (`P2003`, personnage supprimé entre la vérification d'appartenance et le `create`) remonte en 500 brut au lieu d'une exception NestJS propre [apps/api/src/character-roles/character-roles.service.ts:565]
- [x] [Review][Patch] Catalogue `groupRole` vide → message d'erreur malformé (« Rôles acceptés : » deux points suivis de rien) au lieu d'un message distinct signalant un catalogue mal configuré [apps/api/src/character-roles/character-roles.service.ts:538]
- [x] [Review][Patch] `listForPartie()` n'a pas de `orderBy` — Postgres ne garantit pas l'ordre d'insertion, la liste peut « sauter » entre deux requêtes identiques [apps/api/src/character-roles/character-roles.service.ts:599]
- [x] [Review][Patch] `AssignGroupRoleDto.roleKey` n'a aucune contrainte de longueur (`@MaxLength`) — une chaîne arbitrairement longue passe la validation DTO avant d'échouer sur la vérification catalogue [apps/api/src/character-roles/dto/assign-group-role.dto.ts]
- [x] [Review][Defer] `unassign()` ne renvoie/ne journalise pas le `roleKey` retiré — aucune trace du titulaire précédent une fois le rôle retiré [apps/api/src/character-roles/character-roles.service.ts:578] — deferred, hors scope explicite de la story (plancher minimal, pas d'historique)
- [x] [Review][Defer] `GameSystemService.getContent()` lève un `NotFoundException` générique (« Système de jeu introuvable ») pour tout `gameSystemId` non-Ryuutama, ce qui produit un message confus sur cet endpoint [apps/api/src/game-systems/game-system.service.ts:213] — deferred, comportement préexistant de `GameSystemService`, non introduit par ce diff
- [x] [Review][Defer] `ARCHITECTURE-SPINE.md` indique encore que `CharacterRolesModule` doit importer `CharacterModule`, alors que la story (Dev Notes) tranche explicitement pour `GameSystemModule` à la place — le diff suit correctement la story, mais le spine est maintenant obsolète sur ce point [_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md] — deferred, documentation à réconcilier séparément

## Dev Notes

- **`roleKey` n'est jamais une clé étrangère stricte vers `ContentEntry`** — même pattern déjà établi pour l'Homme Dragon (AD-4) : une simple colonne `String`, validée applicativement contre le catalogue seedé au moment de l'écriture, jamais une FK Prisma. Ne pas introduire de relation Prisma vers `ContentEntry` ici.
- **La contrainte `[partieId, characterId]` couvre un cas non explicitement énoncé par les AC de l'epic, mais qui en découle directement** : un personnage qui porte déjà un rôle et à qui le MJ tente d'en assigner un second doit échouer avec `ConflictException` (même erreur Prisma `P2002`, même contrainte unique, même philosophie « jamais d'éviction silencieuse » que le cas `roleKey` déjà pris). Un seul `catch` sur le code Prisma `P2002` couvre naturellement les deux contraintes — ne pas écrire deux blocs de gestion d'erreur séparés.
- **Politique de réassignation complète = hors scope** (Open Question 4 du PRD, non tranchée) — ne pas ajouter d'endpoint « transférer un rôle en une seule action » ni de paramètre `force`/`replace`. Le plancher minimal (échec explicite, retrait explicite requis) est la totalité du scope de cette story.
- **`GameSystemModule` doit être importé** dans `CharacterRolesModule` pour injecter `GameSystemService` (validation du `roleKey` contre `content['groupRole']`) — vérifier le nom exact du module exporté (`GameSystemModule`, cf. `app.module.ts` ligne 16) et que `GameSystemService` y est bien `exports`é (vérifier `game-system.module.ts` avant d'écrire l'import, ne pas supposer).
- **Aucun changement frontend dans cette story** — `roster-row.util.ts`/`assignedRoleLabel`/le badge sur l'avatar sont la Story 27.3, strictement hors scope ici. Cette story se limite au backend (modèle + module + endpoints).
- **`GET /parties/:id/character-roles` renvoie la liste complète des assignations de la Partie**, pas un lookup par personnage — nécessaire pour peupler `RosterRow.assignedRoleLabel` en un seul aller-retour (Story 27.3, AD-6), ne pas concevoir un endpoint par personnage à la place.
- **Pattern de vérification d'appartenance déjà établi** (`XpDistributionsService.createDistribution()`, lignes 25-41 de `xp-distributions.service.ts`) : requête Prisma directe (`prisma.character.findUnique`/`findMany`), comparaison manuelle du `partieId` — ne pas passer par `CharacterService` pour cette vérification (pas de dépendance inutile vers `CharacterModule`).

### Project Structure Notes

- Prisma : `apps/api/prisma/schema.prisma` (nouveau modèle `CharacterGroupRole` + 2 relations inverses), nouvelle migration générée (pas de fichier SQL à écrire à la main).
- Partagé : `packages/shared/src/index.ts` (`CharacterGroupRoleDto`, `AssignGroupRoleDto`).
- Backend : nouveau dossier `apps/api/src/character-roles/` (`character-roles.module.ts`, `character-roles.service.ts`, `character-roles.controller.ts`, `dto/assign-group-role.dto.ts`), `apps/api/src/app.module.ts` (enregistrement du module).
- Aucun changement frontend, aucun changement à `packages/game-rules` (le rôle de groupe ne touche jamais `RyuutamaSheetData`).

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 27.2] — Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#AD-5,AD-6,AD-8] — modèle Prisma exact, contrat du module, contrat temps réel (tout est déjà spécifié, ne pas réinventer)
- [Source: apps/api/src/xp-distributions/{xp-distributions.module.ts,.controller.ts,.service.ts}] — pattern de module dédié à suivre à l'identique (vérification d'appartenance directe Prisma, structure du module)
- [Source: apps/api/src/announcements/announcements.service.ts:31-55] — pattern `getOwned()` + `realtimeEvents.emit(partieTopic(...))` en fin de méthode d'écriture
- [Source: apps/api/src/announcements/dto/create-announcement.dto.ts] — pattern DTO `class-validator` à suivre pour `AssignGroupRoleDto`
- [Source: apps/api/prisma/schema.prisma:46-69,290-315] — `model Partie`/`model Character` actuels, emplacement exact des relations inverses à ajouter
- [Source: apps/api/src/parties/parties.service.ts:77-94] — `getOwned()`/`getViewable()` exacts, aucun nouveau guard à créer
- [Source: packages/shared/src/index.ts:195-207] — `AnnouncementDto`/`CreateAnnouncementDto`, pattern à suivre pour les nouvelles DTOs
- [Source: _bmad-output/implementation-artifacts/27-1-catalogue-des-4-roles.md] — story précédente (catalogue `groupRole` déjà seedé, 4 clés : `cartographe`/`chef`/`chroniqueur`/`intendant`), consommé ici pour la validation de `roleKey`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api pnpm prisma migrate dev --name character_group_role` → migration `20260730060331_character_group_role` appliquée avec succès
- `docker compose exec api pnpm prisma generate` → client Prisma régénéré (nécessaire après la migration pour que `prisma.characterGroupRole` soit typé)
- `docker compose exec api npx jest character-roles` → 2 suites, 16/16 passed
- `docker compose exec api pnpm test` → 47 suites, 924/924 passed (baseline 908 + 16 nouveaux)
- `docker compose exec api pnpm typecheck` → clean (`tsc --noEmit -p tsconfig.build.json`)
- `docker compose restart api` → « Nest application successfully started », 3 nouvelles routes mappées (`POST`/`DELETE /parties/:id/characters/:characterId/role`, `GET /parties/:id/character-roles`), « No pending migrations to apply » confirmant la migration déjà en base
- Revue de code du 2026-07-30 (bmad-code-review) : 4 patches appliqués (catch `P2003` en plus de `P2002`, message dédié catalogue `groupRole` vide, `orderBy: assignedAt asc` sur `listForPartie()`, `@MaxLength(100)` sur `AssignGroupRoleDto.roleKey`), 2 nouveaux tests ajoutés — `docker compose exec api pnpm test` → 47 suites, 926/926 passed ; `docker compose exec api pnpm typecheck` → clean

### Completion Notes List

- Modèle Prisma `CharacterGroupRole` ajouté tel que spécifié par l'architecture (AD-5) — deux contraintes d'unicité (`[partieId, roleKey]`, `[partieId, characterId]`), relations inverses sur `Character`/`Partie`. Migration générée et appliquée réellement (pas de SQL manuel).
- Nouveau module `CharacterRolesModule` (`apps/api/src/character-roles/`) suivant exactement le pattern `XpDistributionsModule`/`AnnouncementsModule` — vérification d'appartenance du personnage par requête Prisma directe (pas de dépendance à `CharacterModule`), `GameSystemModule` importé pour valider `roleKey` contre le catalogue `groupRole` (Story 27.1).
- Un seul `catch` sur le code Prisma `P2002` couvre les deux contraintes d'unicité (`roleKey` déjà pris, ou `characterId` portant déjà un rôle) — `ConflictException` explicite dans les deux cas, jamais une éviction silencieuse (AC4 + extension documentée dans le Contexte de la story).
- `unassign()` retourne `NotFoundException` explicite si aucun rôle n'était assigné (`deleteMany` count 0) — jamais un no-op silencieux.
- `realtimeEvents.emit(partieTopic(partieId))` appelé en fin de méthode réussie pour `assign()`/`unassign()` (AC5), jamais pour `listForPartie()` (lecture pure).
- Aucun changement frontend (hors scope, Story 27.3).
- Suite complète verte, aucune régression : 924/924 tests API, typecheck propre, migration + démarrage réel du conteneur vérifiés.

### File List

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260730060331_character_group_role/migration.sql` (généré)
- `packages/shared/src/index.ts`
- `apps/api/src/character-roles/character-roles.module.ts` (nouveau)
- `apps/api/src/character-roles/character-roles.service.ts` (nouveau)
- `apps/api/src/character-roles/character-roles.controller.ts` (nouveau)
- `apps/api/src/character-roles/dto/assign-group-role.dto.ts` (nouveau)
- `apps/api/src/character-roles/character-roles.service.spec.ts` (nouveau)
- `apps/api/src/character-roles/character-roles.controller.spec.ts` (nouveau)
- `apps/api/src/app.module.ts`

## Change Log

- 2026-07-30 — Modèle `CharacterGroupRole` + module `CharacterRolesModule` (assigner/retirer/lister un rôle de groupe, MJ-only en écriture, câblé temps réel) — Story passée en `review`.
