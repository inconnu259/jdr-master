---
baseline_commit: 7346d19
---

# Story 10.1: Créer sa fiche Homme Dragon

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want créer la fiche de mon Homme Dragon pour ma Partie Ryuutama,
So that mon propre personnage existe dans l'outil, prêt à évoluer avec ma campagne.

## Acceptance Criteria

1. **Given** je suis le MJ d'une Partie Ryuutama sans Homme Dragon existant **When** je crée mon Homme Dragon en choisissant une race (Dragon Vert/Bleu/Rouge/Noir), un artefact parmi les 3 propres à cette race, et en renseignant les champs narratifs (nom obligatoire ; apparence, caractère, vocation, demeure, avatar, mondes protégés optionnels) **Then** la fiche est créée et rattachée à mon compte et à ma Partie **And** seuls les 3 artefacts de la race choisie m'étaient proposés **And** le champ « mondes protégés » était pré-rempli avec le titre de ma Partie/one-shot, modifiable avant validation
2. **Given** j'ai déjà un Homme Dragon sur cette Partie **When** je tente d'en créer un second **Then** la création est rejetée
3. **Given** je suis un joueur (non-MJ) de la Partie **When** je tente de créer ou modifier l'Homme Dragon de cette Partie **Then** l'action est refusée
4. **Given** mon Homme Dragon existe déjà, avec un artefact choisi **When** je change d'artefact (nom et inscription personnalisés inclus) à tout moment **Then** le changement est accepté sans blocage technique (la règle « jamais en cours de scénario » reste une convention de table) **And** aucun historique des artefacts précédents n'est conservé

## Tasks / Subtasks

- [x] **Task 0 — Contenu de jeu : les 12 artefacts Homme Dragon (3 par race)** (bloquant pour Task 3/AC1)
  - [x] Contenu officiel fourni par l'utilisateur (2026-07-16), pas de placeholder. `apps/api/game-systems/ryuutama/data/homme-dragon-artefacts.json` créé : 12 entrées `{ key, label, race, description }` — `description` ajouté au-delà du format minimal `{ key, label, race }` de la spine (à la demande explicite de l'utilisateur : « L'idée, c'est qu'on donne une description lors du choix de l'artefact » — préparé pour une future popup d'aide, cf. Dev Notes).
  - [x] **Pas** de `eveil-powers.json` ni de `ContentType` `eveilPower` — hors scope (Story 10.4).

- [x] **Task 1 — Modèle de données `HommeDragon` (migration Prisma)** (AC1, AC2)
  - [x] Ajouter à `apps/api/prisma/schema.prisma`, à la suite du modèle `Character` (avant `XpDistribution`), exactement le modèle défini par la spine (AD-1/AD-3, aucune colonne `derived`) :
    ```prisma
    model HommeDragon {
      id           String     @id @default(uuid())
      userId       String
      user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
      partieId     String
      partie       Partie     @relation(fields: [partieId], references: [id], onDelete: Cascade)
      gameSystemId String
      gameSystem   GameSystem @relation(fields: [gameSystemId], references: [id])
      sheetData    Json
      createdAt    DateTime   @default(now())
      updatedAt    DateTime   @updatedAt

      @@unique([userId, partieId, gameSystemId])
      @@index([partieId])
      @@index([userId])
    }
    ```
  - [x] Ajouter les relations inverses mécaniques : `User.hommeDragons HommeDragon[]`, `Partie.hommeDragons HommeDragon[]`, `GameSystem.hommeDragons HommeDragon[]`.
  - [x] **Pas de colonne `derived`** (AD-3, contrainte structurelle non négociable — niveau/PS seront calculés à la lecture par les Stories 10.3+, jamais persistés). Ne pas anticiper les champs `voyageursProteges`/`historique` non plus : ils n'existent que dans la réponse HTTP (Story 10.2), jamais en base.
  - [x] `docker compose exec api pnpm prisma migrate dev --name homme_dragon` puis `pnpm prisma generate`. Migration `20260716211609_homme_dragon` appliquée.

- [x] **Task 2 — Types partagés (`packages/shared/src/index.ts`)** (AC1, AC4) — DTO création/update implémentés à plat (`type` sur `HommeDragonSheetData`), pas enveloppés dans `sheetData` (harmonisé avec le DTO backend `class-validator`, Task 5).
  - [ ] Ajouter une nouvelle section `// ─── Epic 10 : Homme Dragon (MJ) ──` (suite de la section Epic 9). Le DTO complet `HommeDragonDto` de la spine inclut `derived`/`voyageursProteges`/`historique` (Stories 10.2/10.3) — **ne pas les ajouter dans cette story**, seulement la forme minimale exploitée par 10.1 :
    ```typescript
    export type HommeDragonRace = 'DRAGON_VERT' | 'DRAGON_BLEU' | 'DRAGON_ROUGE' | 'DRAGON_NOIR';

    export interface HommeDragonSheetData {
      race: HommeDragonRace;
      artefact: { key: string; nom?: string; inscription?: string };
      nom: string;
      apparence?: string;
      caractere?: string;
      vocation?: string;
      demeure?: string;
      avatar?: string;
      mondesProteges?: string;
    }

    export interface HommeDragonDto {
      id: string;
      userId: string;
      partieId: string;
      gameSystemId: string;
      sheetData: HommeDragonSheetData;
      createdAt: string;
      updatedAt: string;
    }

    /** Payload de création (POST /parties/:id/homme-dragon). */
    export interface CreateHommeDragonDto {
      sheetData: HommeDragonSheetData;
    }

    /** Payload de mise à jour (PATCH /parties/:id/homme-dragon) — race jamais éditable après création. */
    export interface UpdateHommeDragonDto {
      artefact?: { key: string; nom?: string; inscription?: string };
      nom?: string;
      apparence?: string;
      caractere?: string;
      vocation?: string;
      demeure?: string;
      avatar?: string;
      mondesProteges?: string;
    }
    ```
  - [ ] Ces types seront étendus par 10.2 (`derived`, `voyageursProteges`, `historique` ajoutés à `HommeDragonDto`) — ne pas les préfigurer ici en champs optionnels vides, ce serait un DTO mensonger tant que le calcul n'existe pas.

- [x] **Task 3 — `validateHommeDragon()` dans `packages/game-rules/ryuutama`** (AC1, AD-4) — type miroir local `HommeDragonSheetData`/`HommeDragonRace` dans `validate-homme-dragon.ts` (pas d'import `@master-jdr/shared`, ce package n'en dépend pas). 10 tests, vitest vert.
  - [ ] TDD : `packages/game-rules/src/ryuutama/validate-homme-dragon.spec.ts` d'abord.
  - [ ] Créer `packages/game-rules/src/ryuutama/validate-homme-dragon.ts`, même convention que `validate.ts` (fonction pure, ne lève jamais) :
    ```typescript
    import type { HommeDragonSheetData } from '@master-jdr/shared'; // ou type miroir local si l'import cross-package pose problème — cf. Dev Notes
    import type { ValidationError, ValidationResult } from './types.ts';

    export interface HommeDragonArtefactCatalogEntry {
      key: string;
      race: string;
    }

    export function validateHommeDragon(
      data: HommeDragonSheetData,
      catalog: HommeDragonArtefactCatalogEntry[],
    ): ValidationResult {
      const errors: ValidationError[] = [];
      if (!data.nom?.trim()) {
        errors.push({ field: 'nom', message: 'Le nom est obligatoire' });
      }
      const validRaces = ['DRAGON_VERT', 'DRAGON_BLEU', 'DRAGON_ROUGE', 'DRAGON_NOIR'];
      if (!data.race || !validRaces.includes(data.race)) {
        errors.push({ field: 'race', message: `Race invalide. Races acceptées : ${validRaces.join(', ')}` });
      }
      const entry = catalog.find((e) => e.key === data.artefact?.key);
      if (!data.artefact?.key || !entry || entry.race !== data.race) {
        errors.push({
          field: 'artefact.key',
          message: "L'artefact choisi doit appartenir à la race sélectionnée",
        });
      }
      return { valid: errors.length === 0, errors };
    }
    ```
    **Attention import cross-package** : `packages/shared` est une frontière *types uniquement, effacée au runtime* (cf. `RyuutamaPdfService`, commentaire `PORTRAIT_X`/`PORTRAIT_Y` — un import de **valeur** runtime depuis `@master-jdr/shared` casse la suite `api`, `SyntaxError: Unexpected token 'export'`). Un `import type` pur (comme ici) est sans risque runtime, **mais** vérifier que `packages/game-rules` n'a pas de dépendance `@master-jdr/shared` existante dans son `package.json`/`tsconfig` avant de l'ajouter — si absente, préférer un type miroir local dans `types.ts` (`RyuutamaCatalog` fait déjà ainsi, jamais d'import de `@master-jdr/shared`) plutôt que d'introduire une dépendance inter-package inédite pour ce module.
  - [ ] Exporter `validateHommeDragon` (+ types) depuis `packages/game-rules/src/index.ts`, à la suite des exports Ryuutama existants.
  - [ ] Tests : nom vide → erreur ; race absente/invalide → erreur ; artefact dont la race ne correspond pas à `data.race` → erreur ; artefact valide de la bonne race + nom rempli → `valid: true`.

- [x] **Task 4 — Seed `hommeDragonArtefact` (`GameSystemService`)** (AC1, AD-4) — entrée ajoutée à `CONTENT_TYPES`. `seedRyuutama()` (upsert générique) gère la nouvelle entrée sans modification supplémentaire — aucun test unitaire existant pour `seedRyuutama()`/`CONTENT_TYPES` (non testé unitairement ailleurs dans le fichier, seul `getContent()` avec Prisma mocké l'est) ; vérification déférée au redémarrage réel (Task 10). Pas de `eveilPower` (hors scope, cf. Task 0).

- [x] **Task 5 — `HommeDragonModule` (backend)** (AC1, AC2, AC3, AC4) — 15 tests service + 3 tests controller, tous verts. Suite API complète 670/670, `pnpm typecheck` propre.
  - [ ] TDD : `homme-dragon.service.spec.ts` puis `homme-dragon.controller.spec.ts` avant l'implémentation.
  - [ ] Créer `apps/api/src/homme-dragon/dto/create-homme-dragon.dto.ts` (`class-validator`, nested object pour `artefact` — cf. `PortraitCropDataDto`/`SetSheetFieldDto` pour le style) :
    ```typescript
    import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
    import { Type } from 'class-transformer';

    const RACES = ['DRAGON_VERT', 'DRAGON_BLEU', 'DRAGON_ROUGE', 'DRAGON_NOIR'] as const;

    class ArtefactDto {
      @IsString()
      @IsNotEmpty()
      key!: string;

      @IsOptional()
      @IsString()
      nom?: string;

      @IsOptional()
      @IsString()
      inscription?: string;
    }

    export class CreateHommeDragonDto {
      @IsIn(RACES)
      race!: (typeof RACES)[number];

      @ValidateNested()
      @Type(() => ArtefactDto)
      @IsObject()
      artefact!: ArtefactDto;

      @IsString()
      @IsNotEmpty()
      nom!: string;

      @IsOptional() @IsString() apparence?: string;
      @IsOptional() @IsString() caractere?: string;
      @IsOptional() @IsString() vocation?: string;
      @IsOptional() @IsString() demeure?: string;
      @IsOptional() @IsString() avatar?: string;
      @IsOptional() @IsString() mondesProteges?: string;
    }
    ```
  - [ ] Créer `apps/api/src/homme-dragon/dto/update-homme-dragon.dto.ts` — mêmes champs que `CreateHommeDragonDto` **sauf `race`** (immuable après création, AC4 ne porte que sur l'artefact/narratifs), tous `@IsOptional()`.
  - [ ] Créer `apps/api/src/homme-dragon/homme-dragon.service.ts` :
    - Constructeur injecte `PrismaService`, `PartiesService`, `GameSystemService`.
    - `async create(partieId: string, userId: string, dto: CreateHommeDragonDto): Promise<HommeDragonDto>` :
      1. `const partie = await this.parties.getOwned(partieId, userId)` (AD-9/AC3 : écriture MJ-only, 403 propagé pour un non-MJ — même pattern que `AnnouncementsService.create`).
      2. Vérifier `partie.gameSystemId === RYUUTAMA_ID` (import depuis `../game-systems/supported-game-systems`, même garde que `CharacterService.create` avec `SUPPORTED_GAME_SYSTEMS.includes(...)`) → `BadRequestException` sinon. L'Homme Dragon n'existe que pour Ryuutama (AD-1/AD-5) — sans cette garde, une Partie d'un autre système (aucun aujourd'hui, mais `PartieKind`/`gameSystemId` sont génériques) pourrait silencieusement se retrouver avec un Homme Dragon.
      3. Charger le catalogue `hommeDragonArtefact` via `this.gameSystems.getContent(partie.gameSystemId)['hommeDragonArtefact']`, mapper en `{ key, race }[]` (le `data` de chaque `ContentEntry` porte `race`, cf. Task 0/4).
      4. `validateHommeDragon(sheetData, catalog)` (Task 3) — si invalide, `BadRequestException(result.errors)`.
      5. `sheetData.mondesProteges` : si non fourni par le DTO, pré-remplir avec `partie.name` (AC1 — « pré-rempli avec le titre de ma Partie/one-shot, modifiable avant validation » ; le pré-remplissage réel a lieu **côté frontend** au chargement du formulaire pour que le MJ puisse l'éditer *avant* validation — le service applique le même fallback en défense de profondeur si le champ arrive vide malgré tout).
      6. `this.prisma.hommeDragon.create({ data: { userId, partieId, gameSystemId: partie.gameSystemId, sheetData } })`, `catch (P2002) → ConflictException('Vous avez déjà un Homme Dragon sur cette Partie')` (AC2 — même pattern que `CharacterService.create`).
    - `async update(partieId: string, userId: string, dto: UpdateHommeDragonDto): Promise<HommeDragonDto>` (AC4) :
      1. `await this.parties.getOwned(partieId, userId)`.
      2. `const existing = await this.prisma.hommeDragon.findUnique({ where: { userId_partieId_gameSystemId: { userId, partieId, gameSystemId: RYUUTAMA_ID } } })` → 404 si absent.
      3. Fusionner `dto` dans `existing.sheetData` (`race` jamais touché, non présent dans `UpdateHommeDragonDto`).
      4. Si `dto.artefact` fourni : revalider via `validateHommeDragon()` (même catalogue) — un changement d'artefact vers une clé de la mauvaise race doit être rejeté au même titre qu'à la création.
      5. `this.prisma.hommeDragon.update(...)` — **AD-2 : pas de verrou optimiste** (`update()` simple, pas `updateMany`+`updatedAt`), MJ seul écrivain, aucune concurrence à gérer — diverger volontairement du pattern `Character` (AD-9) serait une sur-ingénierie ici.
    - `async findOne(partieId: string, userId: string): Promise<HommeDragonDto | null>` (nécessaire pour que le frontend sache s'il doit afficher le formulaire de création ou la fiche) :
      1. `await this.parties.getViewable(partieId, userId)` (lecture ouverte à tout membre, NFR1).
      2. `return this.prisma.hommeDragon.findUnique({ where: { userId_partieId_gameSystemId: { userId: <MJ de la Partie>, partieId, gameSystemId: RYUUTAMA_ID } } })` mappé en DTO, `null` si absent — **jamais** de 404 sur ce cas (absent = « pas encore créé », état normal, pas une erreur). `userId` cible ici est toujours le MJ de la Partie (`partie.mjId`), pas le `userId` courant — un joueur qui consulte doit voir le Homme Dragon *du MJ*, pas chercher le sien (il n'en a pas).
    - `toDto()` local, même style que `toDto` dans `character.service.ts`/`announcements.service.ts`.
  - [ ] Créer `apps/api/src/homme-dragon/homme-dragon.controller.ts` :
    ```typescript
    @UseGuards(AuthenticatedGuard)
    @Controller('parties/:id/homme-dragon')
    export class HommeDragonController {
      constructor(private readonly hommeDragon: HommeDragonService) {}

      @Post()
      create(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateHommeDragonDto) {
        return this.hommeDragon.create(partieId, user.id, dto);
      }

      @Get()
      findOne(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) {
        return this.hommeDragon.findOne(partieId, user.id);
      }

      @Patch()
      update(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateHommeDragonDto) {
        return this.hommeDragon.update(partieId, user.id, dto);
      }
    }
    ```
  - [ ] Créer `apps/api/src/homme-dragon/homme-dragon.module.ts` :
    ```typescript
    @Module({
      // AD-1 : import PartiesModule seul pour cette story (accès/rôle). L'import ScenariosModule
      // (lecture seule, pour historique/niveau) est différé aux Stories 10.2/10.3 — ne pas
      // l'ajouter par anticipation, ce module n'en a aucun usage tant que ces stories n'existent pas.
      imports: [PartiesModule, GameSystemModule],
      controllers: [HommeDragonController],
      providers: [HommeDragonService],
      exports: [HommeDragonService],
    })
    export class HommeDragonModule {}
    ```
  - [ ] Enregistrer `HommeDragonModule` dans `apps/api/src/app.module.ts`, à côté de `CharacterModule`.
  - [ ] Tests service : AC1 (création réussie, `mondesProteges` fallback si vide, seuls les artefacts de la race choisie acceptés) ; AC2 (2e création → `ConflictException`, aucune écriture) ; AC3 (non-MJ → `ForbiddenException` propagée par `getOwned`, `create`/`update`) ; AC4 (changement d'artefact accepté, aucun historique conservé — un seul enregistrement `HommeDragon` par `[userId, partieId, gameSystemId]`, écrasement en place) ; `update` sur artefact de la mauvaise race → rejeté ; `findOne` sans Homme Dragon existant → `null`, pas d'exception.
  - [ ] Tests controller : les 3 routes délèguent correctement au service avec `partieId`/`user.id`/`dto`.

- [x] **Task 6 — Microcopy (3 thèmes)** (AC1) — 4 clés × 3 thèmes ajoutées (`homme-dragon.create_cta`/`race_label`/`artefact_label`/`created_notice`). `create_cta` réutilisé comme libellé du bouton de soumission du formulaire (pas un toggle — l'onglet lui-même révèle directement le formulaire, cf. correction Task 9).
  - [ ] Dans `apps/web/src/app/core/theme/tones.ts`, ajouter pour chacun des 3 thèmes, dans le registre déjà établi (cf. `character.create_cta` : *Grimoire* « Créer un voyageur », *Forêt* « Éveiller un compagnon de route », *Steampunk* — vérifier son équivalent existant avant d'inventer) :
    - `homme-dragon.create_cta` — CTA d'ouverture du formulaire de création (ex. Grimoire : `'Créer mon Homme Dragon'` ou équivalent thématique).
    - `homme-dragon.race_label` / `homme-dragon.artefact_label` — libellés de section du formulaire.
    - `homme-dragon.created_notice` — confirmation après création.
  - [ ] Ne pas ajouter de clés pour historique/niveau/PS/pouvoir d'éveil/export PDF ici (Stories 10.2-10.5).

- [x] **Task 7 — Service Angular (`core/homme-dragon`)** (AC1, AC4) — 3 tests verts.
  - [ ] Créer `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts`, même style que `apps/web/src/app/core/announcements/announcements.service.ts` (`HttpClient`, `API_BASE`, `withCredentials: true`, `firstValueFrom`) :
    ```typescript
    @Injectable({ providedIn: 'root' })
    export class HommeDragonService {
      private readonly http = inject(HttpClient);

      findOne(partieId: string): Promise<HommeDragonDto | null> {
        return firstValueFrom(
          this.http.get<HommeDragonDto | null>(`${API_BASE}/parties/${partieId}/homme-dragon`, { withCredentials: true }),
        );
      }

      create(partieId: string, dto: CreateHommeDragonDto): Promise<HommeDragonDto> {
        return firstValueFrom(
          this.http.post<HommeDragonDto>(`${API_BASE}/parties/${partieId}/homme-dragon`, dto, { withCredentials: true }),
        );
      }

      update(partieId: string, dto: UpdateHommeDragonDto): Promise<HommeDragonDto> {
        return firstValueFrom(
          this.http.patch<HommeDragonDto>(`${API_BASE}/parties/${partieId}/homme-dragon`, dto, { withCredentials: true }),
        );
      }
    }
    ```

- [x] **Task 8 — `HommeDragonSheet` (composant, création + affichage minimal)** (AC1, AC3, AC4) — 9 tests verts. `partieName = input.required<string>()` ajouté (pas dans le plan initial) pour le pré-remplissage `mondesProteges` côté frontend, sans requête `PartiesService.get()` supplémentaire — `PartieDetail` a déjà `p.name` disponible (Task 9).
  - [ ] TDD : `homme-dragon-sheet.spec.ts` d'abord.
  - [ ] Créer `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (+ `.html`), composant **embarqué directement dans un onglet de `PartieDetail`** (Task 9) — **pas de route dédiée** (contrairement à `CharacterSheet`/`character-wizard`) : un seul Homme Dragon existe par Partie, même situation que `ScenarioOneShotTab`/`ScenarioDrafts`, déjà embarqués tels quels dans un `mat-tab` sans navigation. `input.required<string>() partieId`, même convention que `ScenarioOneShotTab`.
    - Au chargement (`ngOnInit`/effect) : `HommeDragonService.findOne(partieId)`.
      - Si `null` (le MJ qui voit cet onglet est nécessairement le MJ, cf. Task 9 — la garde d'accès à l'onglet dispense d'un second check de rôle ici) → affiche le formulaire de création (race → filtre le catalogue `hommeDragonArtefact` chargé via `CharacterService.getGameSystemContent()` existant côté web, réutilisé tel quel — pas de nouvel endpoint de contenu) ; champ `mondesProteges` **pré-rempli avec `partie.name`** au chargement du formulaire (AC1 — c'est ici, côté frontend, que le pré-remplissage éditable a lieu, cf. Dev Notes Task 5).
      - Si non `null` → affiche la fiche (champs narratifs, race, artefact) ; bouton d'édition de l'artefact (nom/inscription/choix parmi les 3 de la race déjà fixée) réutilisant `HommeDragonService.update()` (AC4).
    - Historique/voyageurs protégés/niveau/PS/pouvoir d'éveil/bouton export PDF : **pas dans cette story** — sections ajoutées par 10.2-10.5 au même fichier (cf. `ARCHITECTURE-SPINE.md`, Source tree : un seul `homme-dragon-sheet.ts` pour tout le palier).
  - [ ] Tests : formulaire de création affiché quand `findOne()` renvoie `null` ; artefacts proposés filtrés à la race sélectionnée (AC1) ; `mondesProteges` pré-rempli avec le nom de la Partie mais éditable ; soumission valide appelle `create()` ; création rejetée (409) affiche une erreur, ne casse pas le formulaire ; fiche existante affichée quand `findOne()` renvoie un `HommeDragonDto` ; changement d'artefact via `update()`.

- [x] **Task 9 — Intégration dans `PartieDetail` : nouvel onglet « Homme Dragon »** (AC1, AC3) — 3 nouveaux tests + 43/43 tests `partie-detail.spec.ts` verts (0 régression). `HommeDragonService` mocké ajouté à `createFixture`.
  - [ ] Lire intégralement `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`/`.html` avant modification (déjà lus dans cette session : `isMj` déjà calculé ; onglets conditionnels existants `@if (isMj() && p.kind === 'ONE_SHOT')`/`@if (p.kind !== 'ONE_SHOT')` pour Scénario/Scénarios/Chronologie — patron direct à suivre, jamais de nouvelle route pour un onglet).
  - [ ] Ajouter un `mat-tab label="Homme Dragon"`, **MJ uniquement et uniquement si `p.gameSystemId === RYUUTAMA_ID`** (le concept n'existe que pour Ryuutama, AD-1/AD-5 — pas de registre de plugin générique, cf. spine Deferred ; garde future-proof même si un seul système existe aujourd'hui, cohérent avec `SUPPORTED_GAME_SYSTEMS` ailleurs dans le code) :
    ```html
    @if (isMj() && p.gameSystemId === 'ryuutama') {
      <mat-tab label="Homme Dragon">
        <app-homme-dragon-sheet [partieId]="p.id" />
      </mat-tab>
    }
    ```
    Positionné à la suite de l'onglet « Invitations », avant les onglets Scénario(s)/Chronologie (ordre indicatif — pas de contrainte fonctionnelle sur la position exacte, `mat-tab-group` reste navigable par label).
  - [ ] **Correction UX (retour utilisateur)** : PRD UJ-1 (« le MJ ouvre l'onglet Homme Dragon ») décrit explicitement un **onglet**, pas un panneau repliable dans l'onglet Détails (contrairement à `xp-section`/`announcement-section`) — ne pas reproduire ce pattern ici. La création n'est **jamais** déclenchée depuis `PartieForm`/à la création de la Partie (aucun équivalent du scénario auto-créé pour `ONE_SHOT`, `PartiesService.create` inchangé) : le MJ ouvre l'onglet quand il le souhaite, le formulaire de création n'apparaît que si `HommeDragonSheet` constate l'absence de fiche.
  - [ ] Tests `partie-detail.spec.ts` : onglet visible pour le MJ d'une Partie Ryuutama ; absent pour un joueur ; absent si `gameSystemId` n'est pas Ryuutama.

- [x] **Task 10 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 670/670, 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 738/738, 0 régression.
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 72/72 (vitest), 0 régression.
  - [x] Redémarrage réel (`docker compose up -d --build api`) : `Nest application successfully started`, `HommeDragonController {/parties/:id/homme-dragon}` mappé (POST/GET/PATCH), aucune erreur dans les logs, seed `hommeDragonArtefact` chargé sans incident.

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-17 sur `git diff HEAD` (24 fichiers, baseline `7346d19`). Acceptance Auditor : 0 violation d'AC, les 4 ACs sont correctement implémentées.

- [x] [Review][Patch] `update()` ne revalide `nom` que si `dto.artefact` est fourni — un `PATCH { nom: '' }` ou `{ nom: '   ' }` sans `artefact` contourne la règle « nom obligatoire » (AC1) et écrase le nom avec une valeur vide, confirmé par le test existant `'champs narratifs seuls (sans artefact) → aucune revalidation'` qui documente explicitement l'absence d'appel à `validateHommeDragon`. **Corrigé** : `update()` appelle désormais systématiquement `validateHommeDragon()`, avec ou sans `artefact` dans le DTO. Testé (nom vidé → `BadRequestException`). [apps/api/src/homme-dragon/homme-dragon.service.ts, `.spec.ts`]
- [x] [Review][Patch] `update()` écrase silencieusement `artefact.nom`/`artefact.inscription` à chaque changement d'artefact — le merge est un spread au niveau racine (`{ ...existing.sheetData, ...dto }`), donc `dto.artefact` (envoyé par `HommeDragonSheet.onArtefactSubmit()` comme `{ key }` seul, sans `nom`/`inscription`) remplace tout l'objet `artefact` existant au lieu de le fusionner. Un MJ qui a personnalisé le nom/l'inscription de son artefact les perd dès qu'il change d'artefact ou republie via ce chemin. **Corrigé** : `sheetData.artefact` fusionne désormais `{ ...existingSheetData.artefact, ...dto.artefact }` avant validation/écriture. Testé. [apps/api/src/homme-dragon/homme-dragon.service.ts, `.spec.ts`]
- [x] [Review][Patch] `update()`/`findOne()` ne revérifient jamais `partie.gameSystemId === RYUUTAMA_ID` (contrairement à `create()`) — confirmé réellement atteignable : `UpdatePartieDto.gameSystemId` est éditable (`@IsIn(GAME_SYSTEM_IDS)`, 4 systèmes déclarés dans `GAME_SYSTEMS`), donc un MJ peut faire basculer sa Partie hors Ryuutama via `PATCH /parties/:id` après avoir créé son Homme Dragon, laissant une fiche orpheline toujours éditable/lisible via l'API (même si l'onglet frontend disparaît). **Corrigé** : `update()` lève `BadRequestException` si `partie.gameSystemId !== RYUUTAMA_ID` (même garde que `create()`) ; `findOne()` renvoie `null` dans ce cas (cohérent avec « jamais un 404, état normal »). Testé (2 tests). [apps/api/src/homme-dragon/homme-dragon.service.ts, `.spec.ts`]
- [x] [Review][Patch] Aucune borne `@MaxLength` sur les champs texte libre (`nom`, `apparence`, `caractere`, `vocation`, `demeure`, `avatar`, `mondesProteges`, `artefact.nom`, `artefact.inscription`) des deux DTOs — incohérent avec le reste du projet (ex. `CreateAnnouncementDto.text` a `@MaxLength(5000)`, `UpdatePartieDto.description` a `@MaxLength(2000)`). **Corrigé** : `@MaxLength(120)` sur `nom`, `@MaxLength(200)` sur `artefact.nom`/`artefact.inscription`, `@MaxLength(5000)` sur les champs narratifs longs (mêmes bornes que les conventions déjà établies ailleurs dans le projet). [apps/api/src/homme-dragon/dto/create-homme-dragon.dto.ts, dto/update-homme-dragon.dto.ts]
- [x] [Review][Patch] `HommeDragonSheet.ngOnInit()` confond « erreur réseau/serveur » et « pas encore créé » — le `catch` force `hommeDragon.set(null)`, qui affiche le formulaire de création (avec un bandeau d'erreur) au lieu d'un état « échec du chargement, réessayer » distinct. Un MJ qui a déjà une fiche mais subit une erreur transitoire verrait le formulaire de création plutôt qu'un message clair. **Corrigé** : le `catch` ne force plus `hommeDragon` à `null` (reste `undefined`) ; le template affiche le message d'erreur en priorité (`@if (loadError()) {...} @else if (hommeDragon() === undefined) {...}`), jamais le formulaire de création tant que l'état réel n'est pas connu. Testé. [apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts, `.html`, `.spec.ts`]
- [x] [Review][Patch] `justCreated()` n'est jamais remis à `false` — le bandeau de confirmation « Votre Homme Dragon a pris vie » reste affiché indéfiniment après une création, y compris après un changement d'artefact ultérieur dans la même session de composant. **Corrigé** : `openArtefactEdit()` referme désormais le bandeau (`justCreated.set(false)`). Testé. [apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts, `.spec.ts`]
- [x] [Review][Defer] L'énumération des 4 races est dupliquée 3 fois sans source commune : `RACES`/`(typeof RACES)[number]` (DTO backend), `HommeDragonRace`/`VALID_RACES` (`packages/game-rules`, miroir local volontaire — cf. Dev Notes Task 3, ne jamais importer `@master-jdr/shared` en valeur runtime), `HommeDragonRace`/`RACE_LABELS` (composant Angular). Résoudre proprement nécessiterait de trancher une source de vérité inter-packages, hors scope d'un patch ponctuel. [apps/api/src/homme-dragon/dto/create-homme-dragon.dto.ts, packages/game-rules/src/ryuutama/validate-homme-dragon.ts, apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts] — deferred, refactor inter-package hors scope d'un patch, aucun bug fonctionnel actuel
- [x] [Review][Defer] Aucun moyen de corriger une race choisie par erreur ou de supprimer sa fiche (race explicitement immuable après création, aucune route `DELETE`) — non exigé par les AC1-AC4, candidat pour une story dédiée si le besoin se confirme à l'usage. [apps/api/src/homme-dragon/homme-dragon.controller.ts] — deferred, hors scope des AC de cette story, pas de demande utilisateur confirmée

**Écarté (bruit/faux positifs)** : `findOne()` ne scope pas sur l'utilisateur courant mais sur `partie.mjId` (tout membre peut lire la fiche du MJ) — comportement **voulu et documenté** (NFR1, Dev Notes « Accès : lecture = `parties.getViewable`, tout membre ») ; protection mass-assignment absente localement — **faux positif**, `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` déjà configuré globalement dans `main.ts` ; absence de verrou optimiste sur `update()` — décision d'architecture **explicitement actée** (AD-2, MJ seul écrivain, sur-ingénierie sinon) ; `@@index([userId])` jugé redondant avec l'index composite unique — **cohérent avec le pattern déjà établi** sur `Character` et les autres modèles du schéma (index séparé + contrainte unique, pas une erreur propre à ce diff) ; `GET` renvoie `200` + `null` plutôt que `404` pour « pas encore créé » — **comportement voulu et documenté** (Dev Notes Task 5 : « jamais un 404 sur ce cas, état normal ») ; chaîne `'ryuutama'` répétée côté frontend sans constante partagée — cohérent avec l'absence préexistante de toute constante de système de jeu côté web ailleurs dans le code (pas une régression introduite ici) ; message d'erreur interpolant `gameSystemId` brut — donnée non sensible (simple slug), chemin difensif pour un cas qui n'est pas encore atteignable en pratique.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1** (`ARCHITECTURE-SPINE.md`, `architecture-jdr-master-2026-07-15`) : `HommeDragonModule` **nouveau module dédié** (`apps/api/src/homme-dragon/`), **jamais fondu dans `CharacterModule`** — le personnage MJ est structurellement différent d'un `Character` (pas d'attributs PV/PE/Condition/Initiative/Encombrement, pas de classe/espèce, pas de `derived` persisté). Ne pas être tenté de réutiliser `CharacterService`/le modèle `Character` avec un discriminant `role` — la spine l'exclut explicitement (« Prevents » AD-1).
- **AD-2** : `HommeDragon` — **pas de verrouillage optimiste**, MJ seul écrivain. `update()` est un `prisma.hommeDragon.update()` simple, jamais un `updateMany` comparé sur `updatedAt` (contrairement à `CharacterService.updatePortrait`/`applyLevelUp`, où MJ et joueur écrivent concurremment). Ne pas copier le pattern `updateMany`+`ConflictException` de `character.service.ts` ici — ce serait de la sur-ingénierie pour un profil d'écriture qui ne le justifie pas.
- **AD-3** : le modèle `HommeDragon` **n'a pas de colonne `derived`** — contrainte structurelle non négociable (Task 1). Niveau/PS/historique/voyageurs protégés seront calculés à la lecture par les Stories 10.2/10.3, jamais dans cette story.
- **AD-4** : catalogue `hommeDragonArtefact` via `ContentType`/`ContentEntry` (mécanisme déjà en place, Task 4), jamais codé en dur. Validation référentielle de `sheetData.artefact.key` via `validateHommeDragon()` (Task 3), fonction pure dans `packages/game-rules/ryuutama` — **seul point de validation serveur**, jamais dupliqué côté frontend au-delà d'un filtrage d'affichage des options valides (le frontend filtre le `<select>` par race choisie, mais le serveur revalide toujours en écriture).
- **Accès** (Consistency Conventions) : lecture = `parties.getViewable` (tout membre) ; écriture MJ = `parties.getOwned` — jamais un guard NestJS dédié. `HommeDragon` n'a aucun besoin d'anti-spoil : rien de ce que cette story expose ne référence du contenu non joué.

### Modèle de données — nouvelle migration requise (contrairement à `Announcement`/Story 9.1)

Contrairement à `Announcement`/`ScenarioParticipant` (déjà en base par anticipation lors d'une migration précédente), **`HommeDragon` n'existe pas encore dans `schema.prisma`** — cette story doit créer le modèle ET lancer `prisma migrate dev` (Task 1). Vérifié par grep sur `schema.prisma` (46 modèles listés, aucun `HommeDragon`).

### Contenu de jeu manquant — action requise avant Task 3/4/5

Les 12 artefacts (3 par race) ne figurent dans aucun fichier du dépôt (vérifié : aucune occurrence de « artefact »/« Dragon Vert » dans `docs/` ou `apps/api/game-systems/`). Contrairement aux classes/armes du PJ (`classes.json`, `weapon-categories.json`, déjà seedées avec du contenu réel du supplément Ryuutama), cette donnée doit être obtenue **avant** d'écrire le fichier JSON — cf. Task 0. Ne jamais inventer de noms d'artefacts « pour faire avancer » la story : ce serait du contenu de jeu incorrect présenté comme officiel, dans un projet qui prend cette distinction au sérieux (cf. `docs/backlog.md` : « Ajout des classes et textes manquants au contenu Ryuutama seedé » est un item de backlog séparé, précisément parce que le contenu de jeu est traité comme une source de vérité à ne pas improviser).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/announcements/`** (service/controller/module) — précédent le plus proche pour un nouveau module MJ-only avec `getOwned`/`getViewable`, import à sens unique de `PartiesModule` (ici : + `GameSystemModule`, pas `ScenariosModule`).
- **`apps/api/src/characters/character.service.ts`** — `create()` (catalogue construit depuis `GameSystemService.getContent()`, `validate()`, `ConflictException` sur `P2002`) et `toDto()` : patron direct pour `HommeDragonService.create()`/`toDto()`. **Ne pas** copier `updateMany`+verrou optimiste (AD-2 diverge, cf. ci-dessus).
- **`apps/api/src/game-systems/game-system.service.ts`** — `CONTENT_TYPES`/`seedRyuutama()` : ajout d'une entrée suffit (Task 4), aucune autre modification requise.
- **`packages/game-rules/src/ryuutama/validate.ts`/`types.ts`** — patron direct pour `validateHommeDragon()` (Task 3) : fonction pure, `ValidationResult`/`ValidationError` déjà partagés, ne jamais lever.
- **`apps/web/src/app/features/scenarios/scenario-one-shot-tab/`** — précédent direct pour un composant embarqué tel quel dans un `mat-tab` conditionnel de `PartieDetail` (pas de route dédiée) : même schéma pour `HommeDragonSheet`, à ajouter à l'array `imports` du `@Component` de `PartieDetail`.
- **`apps/web/src/app/features/characters/character-sheet/`** — référence pour l'affichage d'une fiche existante (champs narratifs, données structurées), utile pour la structure du template, mais **pas** pour le mécanisme de montage (celui-ci est routé, `HommeDragonSheet` ne l'est pas).
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** — `isMj` déjà calculé (computed sur `partie().mjId === auth.currentUser().id`) ; onglets conditionnels existants (`@if (isMj() && p.kind === 'ONE_SHOT')` etc.) — patron direct pour le nouvel onglet Homme Dragon.
- **`apps/web/src/app/core/theme/tones.ts`** — `character.create_cta` déjà présent (3 thèmes) : registre de vocabulaire à respecter pour les nouvelles clés `homme-dragon.*` (Task 6).
- **`apps/api/src/characters/dto/portrait-crop-data.dto.ts`** — patron pour un DTO avec objet imbriqué validé (`ArtefactDto` imbriqué dans `CreateHommeDragonDto`, Task 5).

### Hors scope explicite de cette story (Stories 10.2-10.5)

- Historique des scénarios `PASSE` et voyageurs protégés (FR4) — Story 10.2.
- Niveau/PS calculés (FR5/FR7), `computeHommeDragonDerived()` — Story 10.3. `findOne()` de cette story **ne retourne aucun champ dérivé**.
- Invitation à choisir un pouvoir d'éveil (FR6), `ContentType` `eveilPower` — Story 10.4.
- Export PDF (FR8), `homme-dragon.pdf.service.ts` — Story 10.5.
- Import de `ScenariosModule` dans `HommeDragonModule` — n'a aucun usage avant 10.2/10.3, ne pas l'ajouter par anticipation.

### Project Structure Notes

- `apps/api/src/homme-dragon/` et `apps/web/src/app/{core,features}/homme-dragon/` sont de nouveaux dossiers, alignés avec le `Source tree (ajouts)` de `ARCHITECTURE-SPINE.md` (`architecture-jdr-master-2026-07-15`).
- `packages/shared/src/index.ts` : nouvelle section en fin de fichier, à la suite de la section Epic 9 — cohérent avec l'organisation par palier déjà en place.
- `packages/game-rules/src/index.ts` : ajouter les nouveaux exports à la suite des exports Ryuutama existants.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 97-127, Story 10.1 complète + FR1-FR3)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-1 à AD-4, Structural Seed, Consistency Conventions)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-15/prd.md` (§4.1 FR-1 à FR-3, §9 Assumptions Index)
- `apps/api/prisma/schema.prisma` (modèles `Character`/`GameSystem`/`ContentType`/`ContentEntry`/`Partie` — précédents directs, aucun modèle `HommeDragon` existant)
- `apps/api/src/announcements/` (module de référence le plus proche, Story 9.1)
- `apps/api/src/characters/character.service.ts`, `apps/api/src/game-systems/game-system.service.ts`, `packages/game-rules/src/ryuutama/validate.ts`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

- Contenu de jeu (Task 0) : le PRD ne donnait que les 3 artefacts du Dragon Rouge (exemple UJ-1), pas les 12. Demandé et obtenu de l'utilisateur en conversation (2026-07-16) : 12 artefacts complets (3 par race) avec description/effet. Stockés avec un champ `description` supplémentaire (au-delà du format minimal `{key,label,race}` de la spine), à la demande explicite de l'utilisateur pour préparer une future popup d'aide.
- Correction UX en cours de session (avant dev) : le plan initial de la story (Task 9) intégrait l'accès Homme Dragon comme panneau repliable dans l'onglet Détails (calqué sur le pattern Annonces/xp-section). Corrigé sur retour utilisateur avant implémentation : le PRD (UJ-1) décrit explicitement un **onglet dédié** — remplacé par un nouvel onglet `mat-tab` conditionnel (`isMj() && p.gameSystemId === 'ryuutama'`), même schéma que `ScenarioOneShotTab`/`ScenarioDrafts` (contenu embarqué directement, pas de route dédiée).
- `CreateHommeDragonDto`/`UpdateHommeDragonDto` initialement esquissés sous deux formes différentes entre Task 2 (shared, enveloppé dans `sheetData`) et Task 5 (backend `class-validator`, à plat) — harmonisés sur la forme à plat avant implémentation.
- Timing zoneless (composants `HommeDragonSheet`/onglet `PartieDetail`) : `whenStable()` seul ne suffisait pas pour l'`ngOnInit` async (`Promise.all([findOne, getGameSystemContent])) — boucle de ticks déjà établie (`for (10) { await Promise.resolve(); detectChanges() }`) requise, cf. mémoire d'équipe.
- Aucun autre piège majeur : `jest.mock('@master-jdr/game-rules', ...)` appliqué d'emblée dans les specs backend touchant `HommeDragonService` (importe `validateHommeDragon`), évitant le piège ESM déjà documenté.

### Completion Notes List

- Task 0 : 12 artefacts officiels (contenu utilisateur, pas de placeholder) → `homme-dragon-artefacts.json`.
- Task 1 : modèle `HommeDragon` ajouté à `schema.prisma` (AD-1/AD-3 : pas de colonne `derived`, pas de verrou optimiste). Migration `20260716211609_homme_dragon` appliquée.
- Task 2 : `HommeDragonDto`/`HommeDragonSheetData`/`CreateHommeDragonDto`/`UpdateHommeDragonDto` ajoutés à `packages/shared` (forme à plat, sans `derived`/`historique`/`voyageursProteges` — Stories 10.2/10.3).
- Task 3 : `validateHommeDragon()` (type miroir local, pas d'import `@master-jdr/shared` runtime) — 10 tests vitest.
- Task 4 : `hommeDragonArtefact` ajouté à `CONTENT_TYPES` de `GameSystemService`.
- Task 5 : `HommeDragonModule` (create/update/findOne, AD-1/AD-2 pas de verrou optimiste, garde `partie.gameSystemId === RYUUTAMA_ID`) — 15 tests service + 3 tests controller.
- Task 6 : 4 clés microcopy × 3 thèmes (`homme-dragon.create_cta`/`race_label`/`artefact_label`/`created_notice`).
- Task 7 : `HommeDragonService` (web) — 3 tests.
- Task 8 : `HommeDragonSheet` (création + affichage + édition d'artefact, pas de route dédiée) — 9 tests. `partieName` ajouté en input (pré-remplissage `mondesProteges` côté frontend).
- Task 9 : nouvel onglet « Homme Dragon » dans `PartieDetail` (MJ + Ryuutama uniquement) — 3 tests + 43/43 suite existante.
- Task 10 : 670/670 tests API + 738/738 tests web + 72/72 vitest `game-rules`, `pnpm typecheck` API propre, redémarrage réel du conteneur `api` vérifié (routes `HommeDragonController` mappées, `Nest application successfully started`, seed `hommeDragonArtefact` chargé sans erreur).

### File List

**Nouveaux fichiers**
- `apps/api/game-systems/ryuutama/data/homme-dragon-artefacts.json`
- `apps/api/prisma/migrations/20260716211609_homme_dragon/migration.sql`
- `packages/game-rules/src/ryuutama/validate-homme-dragon.ts`
- `packages/game-rules/src/__tests__/validate-homme-dragon.spec.ts`
- `apps/api/src/homme-dragon/dto/create-homme-dragon.dto.ts`
- `apps/api/src/homme-dragon/dto/update-homme-dragon.dto.ts`
- `apps/api/src/homme-dragon/homme-dragon.service.ts`
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts`
- `apps/api/src/homme-dragon/homme-dragon.controller.ts`
- `apps/api/src/homme-dragon/homme-dragon.controller.spec.ts`
- `apps/api/src/homme-dragon/homme-dragon.module.ts`
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts`
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.spec.ts`
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts`
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html`
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts`

**Fichiers modifiés**
- `apps/api/prisma/schema.prisma` (modèle `HommeDragon` + relations inverses `User`/`Partie`/`GameSystem`)
- `apps/api/src/game-systems/game-system.service.ts` (`hommeDragonArtefact` dans `CONTENT_TYPES`)
- `apps/api/src/app.module.ts` (`HommeDragonModule` enregistré)
- `packages/game-rules/src/index.ts` (exports `validateHommeDragon` + types)
- `packages/shared/src/index.ts` (section Epic 10)
- `apps/web/src/app/core/theme/tones.ts` (4 clés `homme-dragon.*` × 3 thèmes)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (import `HommeDragonSheet`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (onglet « Homme Dragon »)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (`HommeDragonService` mocké + 3 tests)

## Change Log

- 2026-07-16 : Story créée via `bmad-create-story` (lecture directe de `character.service.ts`/`characters.controller.ts`/`character.module.ts`, `announcements.service.ts`/`.controller.ts`/`.module.ts`, `game-system.service.ts`/`.module.ts`, `parties.service.ts`, `packages/game-rules/src/ryuutama/{validate,compute-derived,leveling,types}.ts`, `schema.prisma` (46 modèles, aucun `HommeDragon`), `partie-detail.ts`/`.html`, `app.routes.ts`, `tones.ts`, `packages/shared/src/index.ts`, `epics-palier5.md`, `ARCHITECTURE-SPINE.md` 2026-07-15, `prd.md` 2026-07-15). Points notables : (1) contrairement à `Announcement`/Story 9.1, `HommeDragon` n'existe pas encore en base — migration Prisma requise dans cette story ; (2) les 12 artefacts Homme Dragon (contenu de jeu officiel Ryuutama) sont absents du dépôt — Task 0 documente explicitement de ne jamais les inventer et de demander la source à l'utilisateur avant d'écrire le seed ; (3) périmètre volontairement limité à FR1-FR3 (création + changement d'artefact) — niveau/PS/historique/pouvoir d'éveil/export PDF sont FR4-FR8, explicitement Stories 10.2-10.5, pas dupliqués ici.
- 2026-07-16 : Correction UX pré-implémentation (retour utilisateur) : Task 9 remaniée d'un panneau repliable (pattern Annonces) vers un onglet dédié `mat-tab`, conforme au PRD (UJ-1 : « le MJ ouvre l'onglet Homme Dragon »).
- 2026-07-16 : Implémentation complète (bmad-dev-story). Contenu des 12 artefacts fourni par l'utilisateur en cours de session (Task 0, aucun placeholder). 10 tasks en TDD red-green : migration Prisma (`HommeDragon`, AD-1/AD-3), types partagés, `validateHommeDragon()` (`packages/game-rules`), seed `hommeDragonArtefact`, `HommeDragonModule` backend (create/update/findOne, AD-2 sans verrou optimiste), microcopy 3 thèmes, service Angular, `HommeDragonSheet` (formulaire de création + fiche + édition d'artefact, embarqué dans un nouvel onglet `PartieDetail` MJ+Ryuutama uniquement, pas de route dédiée). 670/670 tests API + 738/738 tests web + 72/72 vitest `game-rules`, `pnpm typecheck` API propre, redémarrage réel du conteneur `api` vérifié (routes mappées, aucune erreur de bootstrap/seed). Statut → `review`.
- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor — sur `git diff HEAD`). Acceptance Auditor : 0 violation d'AC. 0 decision-needed (les 2 points ambigus — protection mass-assignment, mutabilité de `gameSystemId` — vérifiés directement dans le code plutôt que soumis à l'utilisateur). 6 patches appliqués : `update()` revalide systématiquement (nom obligatoire re-vérifié même sans changement d'artefact) ; fusion (au lieu d'écrasement) de `artefact.nom`/`inscription` lors d'un changement d'artefact ; `update()`/`findOne()` regagnent la garde `partie.gameSystemId === RYUUTAMA_ID` déjà présente sur `create()` (mutabilité de `gameSystemId` confirmée via `UpdatePartieDto`) ; `@MaxLength` ajouté sur tous les champs texte libre des 2 DTOs ; le frontend ne confond plus « erreur de chargement » et « pas encore créée » ; le bandeau de confirmation se referme désormais à la première interaction suivante. 2 items différés (énumération des races dupliquée 3× sans source commune inter-packages ; aucun moyen de corriger une race/supprimer une fiche — tous deux hors scope des AC1-AC4). 7 items écartés comme bruit (accès lecture par tout membre voulu par NFR1 ; protection mass-assignment déjà globale ; absence de verrou optimiste actée par AD-2 ; index Prisma cohérent avec le pattern existant ; `GET`+`null` voulu ; chaîne `'ryuutama'` cohérente avec l'absence préexistante de constante FE ; message d'erreur non sensible). Suite finale : 674/674 tests API, 740/740 tests web, `pnpm typecheck` propre. Statut → `done`.
