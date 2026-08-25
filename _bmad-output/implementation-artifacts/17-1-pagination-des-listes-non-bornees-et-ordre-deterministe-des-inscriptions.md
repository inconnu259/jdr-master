---
baseline_commit: 85b12715e20b4966563a7828a7031cdc274c56ca
---

# Story 17.1: Pagination des listes non bornées et ordre déterministe des inscriptions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du projet,
I want que les listes qui grossissent (historique XP, scénarios d'une Partie, inscrits à une séance) restent bornées et prévisibles,
so that l'application reste stable à mesure que le volume de données augmente.

## Acceptance Criteria

1. **Given** `GET /parties/:id/xp-distributions` ou `GET /parties/:id/scenarios` **When** la liste sous-jacente dépasse un volume raisonnable **Then** l'endpoint supporte une pagination/limite explicite (`skip`/`take` Prisma), sans charger l'intégralité en une seule réponse non bornée.
2. **Given** `Seance.inscriptions` **When** la liste des inscrits est renvoyée **Then** l'ordre est déterministe (ex. par date d'inscription) — deux chargements successifs donnent le même ordre.

## Tasks / Subtasks

- [x] **Task 1 — DTO de pagination partagé (AC1)**
  - Nouveau fichier `apps/api/src/common/dto/pagination-query.dto.ts` (pas un nouveau module NestJS — AD-9 concerne les modules avec controller/service/providers, pas un simple DTO partagé ; `common/` existe déjà et contient des utilitaires transverses).
  - Suit exactement le pattern déjà en place dans `apps/api/src/parties/dto/get-available-slots.dto.ts` (cité intégralement ci-dessous en Dev Notes) : `class-validator` + `class-transformer`, validé par le `ValidationPipe` global déjà configuré (`whitelist: true, forbidNonWhitelisted: true, transform: true`, `apps/api/src/main.ts:44-49`).
    ```typescript
    import { Type } from 'class-transformer';
    import { IsInt, IsOptional, Max, Min } from 'class-validator';

    export class PaginationQueryDto {
      @IsOptional()
      @Type(() => Number)
      @IsInt()
      @Min(0)
      skip?: number;

      @IsOptional()
      @Type(() => Number)
      @IsInt()
      @Min(1)
      @Max(100)
      take?: number;
    }
    ```
  - **[ASSUMPTION] Cap `@Max(100)` sur `take`** : ni le PRD ni la spine ne fixent de valeur — 100 est un choix raisonnable pour ce projet (volume de données hobby, cohérent avec `@Max(16)` déjà choisi arbitrairement pour `weeks` dans `GetAvailableSlotsDto`). Ajustable sans risque si le mainteneur préfère une autre valeur.

- [x] **Task 2 — Pagination de `XpDistributionsService.listForPartie()` (AC1)**
  - Fichier : `apps/api/src/xp-distributions/xp-distributions.service.ts` (117 lignes actuelles, cité intégralement en Dev Notes). Méthode actuelle (lignes 90-101) :
    ```typescript
    async listForPartie(partieId: string, mjId: string): Promise<XpDistributionDto[]> {
      await this.parties.getOwned(partieId, mjId);
      const distributions = await this.prisma.xpDistribution.findMany({
        where: { partieId },
        orderBy: { createdAt: 'desc' },
        include: { entries: true },
      });
      return distributions.map(toDto);
    }
    ```
  - **⚠️ Décision d'architecture explicite — pagination additive, réponse HTTP inchangée** : le frontend (`apps/web/src/app/core/parties/parties.service.ts:137-143`, méthode `listXpDistributions()`) appelle cet endpoint et type la réponse `Promise<XpDistributionDto[]>` — un **tableau brut**, consommé directement dans un signal (`partie-detail.ts:439`, `xpDistributions = signal<XpDistributionDto[]>([])`). **Ne PAS envelopper la réponse dans `{ data, total }`** — ça casserait silencieusement ce consommateur (et tout composant similaire) sans qu'aucun test TypeScript ne le détecte forcément à la compilation si le typage n'est pas strictement vérifié bout en bout. AC1 dit "l'endpoint **supporte** une pagination" (capacité), pas "applique toujours une limite implicite" — cohérent avec la note de l'epic ("aucun changement visible pour l'utilisateur final") et l'annotation du source tree de la spine qui ne liste **aucun fichier frontend** pour FR-18. Donc : `skip`/`take` sont des **query params optionnels** ; si absents, `skip`/`take` valent `undefined`, Prisma les traite comme "pas de limite" (comportement 100% inchangé pour tous les appelants existants).
  - Signature modifiée :
    ```typescript
    async listForPartie(
      partieId: string,
      mjId: string,
      pagination?: { skip?: number; take?: number },
    ): Promise<XpDistributionDto[]> {
      await this.parties.getOwned(partieId, mjId);
      const distributions = await this.prisma.xpDistribution.findMany({
        where: { partieId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { entries: true },
        skip: pagination?.skip,
        take: pagination?.take,
      });
      return distributions.map(toDto);
    }
    ```
  - **Pourquoi `orderBy` devient un tableau `[{ createdAt: 'desc' }, { id: 'desc' }]` (et pas juste `{ createdAt: 'desc' }` inchangé)** : piège classique de la pagination `skip`/`take` — si deux lignes partagent exactement le même `createdAt` (précision milliseconde, pas exclu sur des créations rapprochées), un tri sur `createdAt` seul ne garantit pas un ordre stable entre deux pages consécutives (une ligne peut apparaître deux fois ou jamais selon l'ordre physique non garanti retourné par Postgres à égalité de clé de tri). `id` (UUID) comme tie-breaker secondaire élimine l'ambiguïté. **Ce pattern est déjà établi dans ce projet** — voir `ScenariosService.deleteSeance()` (`apps/api/src/scenarios/scenarios.service.ts:503`) : `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`. Story 17.1 applique la même rigueur, pas une nouvelle convention.

- [x] **Task 3 — Pagination de `ScenariosService.findAllForPartie()` (AC1)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`. Méthode actuelle (lignes 219-231, commentaire existant cité intégralement) :
    ```typescript
    // AD-6 : aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur. Lecture
    // ouverte à tout membre (getViewable), pas MJ-only comme listDrafts. Tri chronologique croissant
    // (passé → futur) pour alimenter la timeline joueur (Story 7.5).
    async findAllForPartie(partieId: string, userId: string): Promise<ScenarioDto[]> {
      const partie = await this.parties.getViewable(partieId, userId);
      const scenarios = await this.prisma.scenario.findMany({
        where: { partieId },
        orderBy: { createdAt: 'asc' },
      });
      const scenarioIds = scenarios.map((s) => s.id);
      const seancesByScenario = await loadSeancesBatch(this.prisma, scenarioIds);
      // ... (suite inchangée par cette story, cf. Dev Notes)
    ```
  - **Même raisonnement qu'à la Task 2** : `apps/web/src/app/core/scenarios/scenarios.service.ts:56-62` (`listAll()`) type la réponse `Promise<ScenarioDto[]>` (tableau brut), consommé dans `scenario-timeline.ts:155`, `calendar-view.ts:216`, `partie-detail.ts:419`. Pagination additive uniquement — mêmes query params optionnels `skip`/`take`, comportement par défaut inchangé.
  - Modification :
    ```typescript
    async findAllForPartie(
      partieId: string,
      userId: string,
      pagination?: { skip?: number; take?: number },
    ): Promise<ScenarioDto[]> {
      const partie = await this.parties.getViewable(partieId, userId);
      const scenarios = await this.prisma.scenario.findMany({
        where: { partieId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: pagination?.skip,
        take: pagination?.take,
      });
      const scenarioIds = scenarios.map((s) => s.id);
      // ... suite strictement inchangée
    ```
  - **Ne toucher STRICTEMENT que ces 2 lignes** (`orderBy` + ajout `skip`/`take`) dans le corps de la méthode — tout le reste (agrégation `seancesByScenario`, branchement `partie.kind !== 'CAMPAGNE_EPISODIQUE'`, `loadRetrospectiveNotes`, etc.) reste identique. `listDrafts()` (méthode voisine, lignes 203-217) n'est **pas concernée** par cette story (pas dans l'AC, pas dans la spine).

- [x] **Task 4 — Query params sur les 2 controllers (AC1)**
  - Fichier : `apps/api/src/xp-distributions/xp-distributions.controller.ts` (37 lignes actuelles, cité intégralement) — méthode `list()` (lignes 30-36) :
    ```typescript
    @Get()
    list(
      @Param('id', ParseUUIDPipe) partieId: string,
      @CurrentUser() user: AuthUser,
      @Query() pagination: PaginationQueryDto,
    ) {
      return this.xpDistributions.listForPartie(partieId, user.id, pagination);
    }
    ```
    Ajouter les imports : `Query` depuis `@nestjs/common` (pas encore importé dans ce fichier — vérifier la liste d'imports existante ligne 1-9), `PaginationQueryDto` depuis `../common/dto/pagination-query.dto`.
  - Fichier : `apps/api/src/scenarios/scenarios.controller.ts` — méthode `findAll()` (lignes 70-76) :
    ```typescript
    @Get('parties/:id/scenarios')
    findAll(
      @Param('id', ParseUUIDPipe) partieId: string,
      @CurrentUser() user: AuthUser,
      @Query() pagination: PaginationQueryDto,
    ) {
      return this.scenarios.findAllForPartie(partieId, user.id, pagination);
    }
    ```
    `Query` déjà potentiellement absent des imports de ce fichier (vérifier lignes 1-18) — même import `PaginationQueryDto` à ajouter. `ScenariosController` a `@Controller()` (racine vide) — chaque méthode porte son chemin complet, ne pas confondre avec un préfixe de classe.
  - **`forbidNonWhitelisted: true` (ValidationPipe global) signifie qu'un query param NON déclaré dans `PaginationQueryDto` sera rejeté (400)** — donc `PaginationQueryDto` doit rester exactement `{ skip?, take? }`, rien de plus, pour ne pas piéger un futur appelant qui enverrait un paramètre legacy inattendu.

- [x] **Task 5 — Ordre déterministe de `Seance.inscriptions` (AC2)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts` — constante `SEANCE_INCLUDE` (lignes 905-914, citée intégralement) :
    ```typescript
    const SEANCE_INCLUDE = {
      poll: {
        include: {
          options: {
            include: { votes: { include: { user: { select: { pseudo: true } } } } },
          },
        },
      },
      inscriptions: { include: { user: { select: { pseudo: true } } } },
    } as const;
    ```
  - **Bug actuel** : la relation `inscriptions` n'a **aucun `orderBy`** — Prisma/Postgres ne garantit pas d'ordre stable entre deux exécutions de la même requête sans tri explicite (contrairement à ce qu'on pourrait supposer de l'ordre d'insertion sur un heap scan). Le modèle `Inscription` (`apps/api/prisma/schema.prisma:462-471`) a un champ `createdAt DateTime @default(now())`, exactement ce qu'il faut.
  - Fix (ajouter `orderBy`, même pattern de tie-breaker qu'aux Tasks 2-3) :
    ```typescript
    inscriptions: {
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { user: { select: { pseudo: true } } },
    },
    ```
  - `SEANCE_INCLUDE` n'est utilisée qu'à un seul endroit (`loadSeancesBatch()`, ligne 969 — fonction module-privée non exportée, appelée par `listDrafts()` et `findAllForPartie()` entre autres). Aucun autre fichier à modifier pour cet AC.
  - **Ne pas toucher `toSeanceDto()`** (lignes 938-960) — le mapping `inscrits: (seance.inscriptions ?? []).map(...)` reste identique, il reflète simplement l'ordre désormais garanti par la requête en amont.

- [x] **Task 6 — Tests (AC1, AC2)**

  **`apps/api/src/xp-distributions/xp-distributions.service.spec.ts`** (219 lignes actuelles, cité intégralement en Dev Notes) :
  - **Test existant à mettre à jour** (`describe('listForPartie()')`, test `'trie par createdAt desc (délégué à Prisma orderBy)'`, lignes 205-217) — l'assertion `orderBy: { createdAt: 'desc' }` devient `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`. C'est un changement intentionnel de comportement (Task 2), pas une régression à corriger autrement — mettre à jour l'assertion, ne pas contourner.
  - Nouveaux tests dans le même `describe('listForPartie()')` :
    - `skip`/`take` fournis → transmis tels quels à `prisma.xpDistribution.findMany` (`expect(prisma.xpDistribution.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }))`).
    - `skip`/`take` absents (appel `service.listForPartie('p1', 'mj1')` sans 3ᵉ argument) → `prisma.xpDistribution.findMany` appelé avec `skip: undefined, take: undefined` (comportement par défaut inchangé, aucune limite appliquée).

  **`apps/api/src/scenarios/scenarios.service.spec.ts`** (fichier volumineux, ~2700+ lignes — ne PAS le relire intégralement, seules les sections citées ci-dessous sont pertinentes) :
  - **Test existant à mettre à jour** (`describe('findAllForPartie()')`, test `'lecture ouverte à tout membre (getViewable, pas getOwned), tri chronologique croissant (AC1)'`, lignes 757-770) — l'assertion `expect(prisma.scenario.findMany).toHaveBeenCalledWith({ where: { partieId: 'p1' }, orderBy: { createdAt: 'asc' } })` est un objet **littéral exact** (pas `expect.objectContaining`) : elle échouera dès que `skip`/`take` sont ajoutés à l'appel réel, même à `undefined` — il faut soit y ajouter `skip: undefined, take: undefined` explicitement, soit passer l'assertion en `expect.objectContaining({ where: { partieId: 'p1' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })`. Choisir `objectContaining` (plus robuste, cohérent avec le style déjà utilisé ailleurs dans ce même fichier, ex. ligne 741 utilise un objet exact mais d'autres tests du fichier utilisent `objectContaining` — préférer `objectContaining` ici pour éviter de re-casser ce test à la moindre évolution future de l'appel).
  - Nouveaux tests dans le même `describe('findAllForPartie()')` : mêmes 2 cas que Task 2 (skip/take transmis ; absents → undefined).
  - **Nouveau test pour AC2** — dans `describe('findAllForPartie()')` (ou un nouveau `describe` dédié si plus lisible) : appeler `service.findAllForPartie('p1', 'u1')` et vérifier que `prisma.scenario.findMany` déclenche bien `loadSeancesBatch()` avec le bon `include` — plus directement, comme `SEANCE_INCLUDE` n'est pas exportée, le test le plus simple et le plus robuste est d'asserter sur l'appel `prisma.seance.findMany` (mock `prisma.seance.findMany.mockResolvedValue([])`, puis `expect(prisma.seance.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ inscriptions: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) }) }))`) — vérifie directement le fix de la Task 5 sans dépendre du comportement de tri réel de Prisma (impossible à tester en unitaire avec un mock).

  **`apps/api/src/xp-distributions/xp-distributions.controller.spec.ts` et `apps/api/src/scenarios/scenarios.controller.spec.ts`** (vérifier s'ils existent et testent déjà `list()`/`findAll()` — si oui, ajouter un test minimal confirmant que `pagination` (objet `{ skip, take }` du `@Query()`) est bien transmis tel quel au service ; si l'un de ces fichiers n'existe pas ou ne teste pas encore ces méthodes, ne pas en faire une exigence bloquante de cette story — les tests service-level (Task 6 ci-dessus) couvrent déjà le comportement métier).

- [x] **Task 7 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api (819 tests avant cette story).
  - `docker compose exec api pnpm typecheck` — propre.
  - **Aucune migration Prisma** (aucun changement de schéma dans cette story — la pagination et le tri sont purement applicatifs).
  - `git status`/diff en fin de story pour confirmer : aucune modification `apps/web` (pagination additive, comportement par défaut inchangé pour tous les appelants frontend existants).

## Dev Notes

### Architecture — Consistency Conventions + source tree (`ARCHITECTURE-SPINE.md`, Palier 6)

- **Convention pagination (ligne 118)** : `| Pagination | skip/take Prisma (offset/limit) pour toute liste non bornée — pas de curseur, cohérent avec le volume de données de ce projet |` — confirme `skip`/`take`, pas de pagination par curseur.
- **Source tree (lignes 202-203)** : `scenarios.service.ts # + garde findUniqueOrThrow (FR-23), + orderBy inscriptions (FR-20), + pagination findAllForPartie (FR-18), + garde statut séance (FR-21)` — confirme que `findAllForPartie` (pas `listDrafts`) est la cible FR-18 côté scénarios, et que FR-20 (inscriptions) vit dans le même fichier. **FR-21/FR-23 (garde statut séance, référence orpheline) ne font PAS partie de cette story — ce sont les AC de Story 17.2**, ne pas les implémenter ici (scope strict).
- **AD-9 (aucun nouveau module NestJS)** : le nouveau fichier `common/dto/pagination-query.dto.ts` de la Task 1 n'est PAS un module — c'est un DTO partagé dans le dossier `common/` déjà existant (qui contient déjà `current-user.decorator.ts`, `filters/multer-exception.filter.ts`). Cohérent avec AD-9.
- **Aucune décision d'architecture numérotée dédiée à FR-18/FR-20** au-delà de la Consistency Convention pagination et du source tree ci-dessus — aucune AD-N spécifique à consulter.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/xp-distributions/xp-distributions.service.ts`** (117 lignes) — voir Task 2 pour la méthode `listForPartie()` citée intégralement. Le reste du fichier (`createDistribution()`, lignes 18-88) **n'est pas touché par cette story**.
- **`apps/api/src/xp-distributions/xp-distributions.controller.ts`** (37 lignes) — cité intégralement ci-dessus (Task 4). Import actuel : `Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards` — `Query` à ajouter.
- **`apps/api/src/scenarios/scenarios.service.ts`** — fichier volumineux (~1000+ lignes). Sections pertinentes déjà citées intégralement : `findAllForPartie()` (lignes 219-231+, corps complet à Task 3), `SEANCE_INCLUDE`/`toSeanceDto()`/`loadSeancesBatch()` (lignes 905-978, citées intégralement à Task 5). **Ne pas lire/modifier le reste du fichier** (mutations séance, gestion documents, etc. — hors scope).
- **`apps/api/src/scenarios/scenarios.controller.ts`** — méthodes `findAll()` (lignes 70-76, citée à Task 4) et `create()`/`update()`/`listDrafts()` (lignes 44-68, contexte seulement, non modifiées). `@Controller()` racine vide, chaque route porte son chemin complet.
- **`apps/api/src/parties/dto/get-available-slots.dto.ts`** (pattern DTO de référence, cité intégralement à Task 1) :
  ```typescript
  import { Type } from 'class-transformer';
  import { IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

  export class GetAvailableSlotsDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(16)
    weeks?: number;
    // ... (from/to non pertinents pour cette story, pattern @IsOptional + @Type(() => Number) est ce qui compte)
  }
  ```
- **`apps/api/src/main.ts:42-49`** — `ValidationPipe` global déjà configuré, cité intégralement :
  ```typescript
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  ```
- **`apps/api/prisma/schema.prisma`** — modèles pertinents cités intégralement :
  ```prisma
  model XpDistribution {
    id        String                @id @default(uuid())
    partieId  String
    partie    Partie                @relation(fields: [partieId], references: [id], onDelete: Cascade)
    mjId      String
    mj        User                  @relation("XpDistributionMj", fields: [mjId], references: [id], onDelete: Cascade)
    note      String?
    createdAt DateTime              @default(now())
    entries   XpDistributionEntry[]

    @@index([partieId, createdAt])
  }

  model Scenario {
    id           String         @id @default(uuid())
    partieId     String
    partie       Partie         @relation(fields: [partieId], references: [id], onDelete: Cascade)
    title        String
    // ... (champs non pertinents omis)
    createdAt    DateTime       @default(now())
    seances        Seance[]
    // ...
    @@index([partieId, status])
  }

  model Seance {
    id             String       @id @default(uuid())
    scenarioId     String
    scenario       Scenario     @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
    pollId         String?      @unique
    poll           SessionPoll? @relation(fields: [pollId], references: [id])
    inscriptionMin Int?
    inscriptionMax Int?
    dateValidee    DateTime?
    compteRendu    String?
    createdAt      DateTime     @default(now())
    inscriptions Inscription[]
  }

  model Inscription {
    id        String   @id @default(uuid())
    seanceId  String
    seance    Seance   @relation(fields: [seanceId], references: [id], onDelete: Cascade)
    userId    String
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    createdAt DateTime @default(now())

    @@unique([seanceId, userId])
  }
  ```
  Les index `@@index([partieId, createdAt])` (XpDistribution) et `@@index([partieId, status])` (Scenario) existent déjà — **aucun nouvel index Prisma requis pour cette story** (contrairement à FR-24/Story 17.3, hors scope ici). `Inscription` n'a pas d'index dédié mais le volume par séance est structurellement petit (`inscriptionMax`, capacité limitée) — non nécessaire.

### Pattern de tie-breaker déterministe déjà établi dans ce projet

`ScenariosService.deleteSeance()` (`scenarios.service.ts:501-504`) utilise déjà exactement le pattern requis par cette story :
```typescript
const [firstSeance] = await this.prisma.seance.findMany({
  where: { scenarioId: seance.scenarioId },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  take: 1,
});
```
Un test dédié existant (`scenarios.service.spec.ts`, describe `deleteSeance()`, test `'détection de la première séance : tie-breaker id sur createdAt égal (revue de code)'`) documente explicitement pourquoi ce pattern existe — cette story l'étend à `findAllForPartie`, `listForPartie` (xp-distributions) et `SEANCE_INCLUDE.inscriptions`, elle n'invente rien de nouveau.

### Frontend — vérifié, aucune modification requise

Consommateurs actuels des 2 endpoints paginés (tous typent la réponse comme un tableau brut, pas une enveloppe `{data, total}`) :
- `apps/web/src/app/core/parties/parties.service.ts:137-143` (`listXpDistributions`) → `apps/web/src/app/features/parties/partie-detail/partie-detail.ts:439`
- `apps/web/src/app/core/scenarios/scenarios.service.ts:56-62` (`listAll`) → `scenario-timeline.ts:155`, `calendar-view.ts:216`, `partie-detail.ts:419`

Aucun de ces appels ne passe actuellement de query params — avec la pagination additive de cette story (Tasks 2-4), leur comportement est **strictement inchangé**. Confirmé par grep exhaustif, pas une supposition.

### Testing Standards

- `apps/api` : Jest, conventions déjà en place (mocks manuels `PrismaService`/`PartiesService`, `Test.createTestingModule`).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après toute modification de signature (`listForPartie`, `findAllForPartie` gagnent un 3ᵉ paramètre optionnel).
- **Ne pas modifier `scenarios.service.spec.ts` au-delà des sections explicitement citées** (Task 6) — fichier partagé par de nombreuses autres stories/describe blocks non liés à celle-ci.

### Project Structure Notes

- Fichiers modifiés : `apps/api/src/xp-distributions/xp-distributions.service.ts`, `apps/api/src/xp-distributions/xp-distributions.controller.ts`, `apps/api/src/xp-distributions/xp-distributions.service.spec.ts`, `apps/api/src/scenarios/scenarios.service.ts`, `apps/api/src/scenarios/scenarios.controller.ts`, `apps/api/src/scenarios/scenarios.service.spec.ts`.
- Fichier nouveau : `apps/api/src/common/dto/pagination-query.dto.ts`.
- Aucune migration Prisma, aucune modification `apps/web`, aucun nouveau module NestJS.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 368-382 — Epic 17 / Story 17.1 complète, FR18/FR20 ; ligne 118 Consistency Conventions pagination)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (ligne 118 — Consistency Conventions pagination ; lignes 202-203 — source tree `scenarios.service.ts` ; ligne 235 — Capability Map FR-18 à FR-24)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR18, FR20)
- Vérifications empiriques effectuées pendant la préparation de cette story (lecture directe du code, pas de supposition) : routes/méthodes/lignes exactes des 2 endpoints ciblés, absence d'`orderBy` sur `SEANCE_INCLUDE.inscriptions`, pattern DTO de pagination déjà établi (`GetAvailableSlotsDto`), pattern tie-breaker déjà établi (`deleteSeance`), consommateurs frontend confirmés par grep (tableaux bruts, aucun query param envoyé actuellement).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story / bmad-dev-story)

### Debug Log References

- Typecheck a échoué après l'ajout de `orderBy` sur `SEANCE_INCLUDE.inscriptions` : le `as const` englobant tout `SEANCE_INCLUDE` transformait le tableau `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]` en tuple `readonly`, incompatible avec le type mutable `Prisma.InscriptionOrderByWithRelationInput[]` attendu par le client Prisma généré. Corrigé en typant explicitement ce tableau via une assertion `as Prisma.InscriptionOrderByWithRelationInput[]` (import `type { Prisma } from '@prisma/client'` ajouté), qui prévaut sur le `as const` englobant pour cette seule expression — le reste de `SEANCE_INCLUDE` garde son `as const` d'origine, aucune autre régression de typage.

### Completion Notes List

- `PaginationQueryDto` (`skip`/`take` optionnels, `class-validator`) créée dans `common/dto/`, réutilisée par les 2 controllers concernés — pattern identique à `GetAvailableSlotsDto` déjà en place.
- `XpDistributionsService.listForPartie()` et `ScenariosService.findAllForPartie()` acceptent un 3ᵉ paramètre optionnel `{ skip?, take? }`, transmis tel quel à Prisma. Absent → `undefined`/`undefined`, comportement 100% inchangé (vérifié par test dédié + confirmé par grep des 4 sites d'appel frontend, aucun ne passe de query params).
- `orderBy` des 3 requêtes concernées (xp-distributions, scenarios, inscriptions) passé d'un tri simple à un tri composite `[{ createdAt }, { id }]` — tie-breaker déterministe, réutilisant un pattern déjà établi dans ce fichier (`deleteSeance()`).
- `SEANCE_INCLUDE.inscriptions` gagne un `orderBy` explicite (absent avant cette story — bug réel corrigé, pas juste un renforcement).
- 819 → 825 tests (6 nouveaux : 3 sur `xp-distributions.service.spec.ts`, 3 sur `scenarios.service.spec.ts`, dont le test dédié AC2 sur `SEANCE_INCLUDE.inscriptions`), + 1 test controller mis à jour et 1 nouveau sur `scenarios.controller.spec.ts` pour le pass-through `skip`/`take`. Suite complète : 825/825, typecheck propre.
- Aucune modification `apps/web`, aucune migration Prisma — confirmé par `git status` en fin de story.
- Revue de code (3 agents adversariaux) : 1 patch appliqué (`skip` plafonné à `@Max(100_000)`, symétrique à `take`), 2 items mineurs déférés dans `deferred-work.md` (index composite manquant, `skip` sans `take` non borné). Une allégation de l'Acceptance Auditor (incohérence apparente sur l'`orderBy` de `xp-distributions`) vérifiée et infirmée — erreur de transcription en construisant le prompt de revue, pas un défaut réel (confirmé via `git diff HEAD` frais + test dédié déjà passant).

### File List

- `apps/api/src/common/dto/pagination-query.dto.ts` (nouveau)
- `apps/api/src/xp-distributions/xp-distributions.service.ts`
- `apps/api/src/xp-distributions/xp-distributions.controller.ts`
- `apps/api/src/xp-distributions/xp-distributions.service.spec.ts`
- `apps/api/src/scenarios/scenarios.service.ts`
- `apps/api/src/scenarios/scenarios.controller.ts`
- `apps/api/src/scenarios/scenarios.service.spec.ts`
- `apps/api/src/scenarios/scenarios.controller.spec.ts`

### Review Findings

- [x] [Review][Patch] `skip` n'a aucune borne supérieure (contrairement à `take`, plafonné à `@Max(100)`) [apps/api/src/common/dto/pagination-query.dto.ts:5-9] — corrigé : `@Max(100_000)` ajouté sur `skip`.
- [x] [Review][Defer] Aucun index composite `(partieId, createdAt, id)` n'accompagne le nouveau tri `[{ createdAt }, { id }]` [apps/api/src/scenarios/scenarios.service.ts, apps/api/src/xp-distributions/xp-distributions.service.ts] — deferred, ajouter un index nécessiterait une migration Prisma explicitement hors périmètre de cette story (validation finale : "Aucune migration Prisma"). Risque résiduel faible : les requêtes sont déjà filtrées par `partieId` en amont (index existants `@@index([partieId, createdAt])`/`@@index([partieId, status])`), tri sur un sous-ensemble déjà réduit, cohérent avec le volume de données hobby de ce projet.
- [x] [Review][Defer] `skip` fourni sans `take` renvoie toutes les lignes restantes après l'offset (non borné) [apps/api/src/scenarios/scenarios.service.ts, apps/api/src/xp-distributions/xp-distributions.service.ts] — deferred, ne viole pas AC1 à la lettre (la capacité de pagination bornée existe bien via `take` seul), comportement identique au cas "aucun paramètre" déjà accepté intentionnellement par la story (pagination additive). Amélioration possible dans une story future si un besoin réel émerge.

## Change Log

| Date | Change |
|------|--------|
| 2026-07-19 | Implémentation complète (Tasks 1-7) : DTO de pagination partagé, `skip`/`take` additifs sur `listForPartie()`/`findAllForPartie()`, tri composite déterministe (tie-breaker `id`) sur les 3 requêtes concernées, fix du tri manquant sur `Seance.inscriptions` (AC2). 6 tests service ajoutés + 1 controller ajouté/1 mis à jour. 825/825 tests, typecheck propre. Statut → review. |
| 2026-07-19 | Revue de code (3 agents adversariaux) : 1 patch appliqué (`skip` plafonné), 2 items déférés (index composite, `skip` sans `take` non borné) — voir `deferred-work.md`. 825/825 tests, typecheck propre. Statut → done. |
