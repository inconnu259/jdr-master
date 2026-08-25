---
baseline_commit: b387f57d09aadd4e7f302794fa28dd28d2064bb9
---

# Story 7.1: Créer et éditer un scénario

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want créer un scénario avec titre/description/durée et le modifier tant qu'il n'est pas clôturé,
so that je prépare le contenu narratif de ma campagne sans support externe.

## Acceptance Criteria

1. **Given** je suis MJ authentifié d'une Partie **When** je POST `/parties/:id/scenarios` avec `{title, description?, dureeHeures?, dureeSeances?}` **Then** un `Scenario` (`status: BROUILLON`) est créé, rattaché à la Partie.
2. **Given** un utilisateur membre non-MJ de la Partie **When** il tente de créer un scénario **Then** la requête échoue en 403.
3. **Given** une Partie `kind: ONE_SHOT` vient d'être créée **When** `PartiesService.create()` s'exécute **Then** un unique `Scenario` (`status: BROUILLON`) est créé automatiquement dans la même transaction **And** aucune Partie `ONE_SHOT` n'existe jamais sans scénario associé.
4. **Given** un scénario existant dont le statut n'est pas `PASSE` **When** le MJ modifie `title`/`description`/`dureeHeures`/`dureeSeances` (y compris après invitation ou inscription de joueurs) **Then** les champs sont mis à jour immédiatement, sans notification envoyée **And** un joueur voit le contenu à jour à sa prochaine consultation.
5. **Given** un scénario `status: PASSE` **When** le MJ tente de modifier `description`/`documents` (contenu narratif de base) **Then** la requête est rejetée — seul le résumé de fin (Epic 8) reste éditable après clôture.
6. **Given** une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` **When** le MJ crée plusieurs scénarios sans ordre particulier **Then** chacun est créé indépendamment au statut `BROUILLON` par défaut, sans contrainte d'ordre de création.

*(Source: epics.md Story 7.1 — ACs reproduites verbatim, aucune reformulation.)*

## Tasks / Subtasks

- [x] **Task 1 — Migration Prisma `scenarios_seances_p4`** (AC: 1, 3)
  - [x] Dans `apps/api/prisma/schema.prisma`, ajouter l'enum `ScenarioStatus` (`BROUILLON | A_VENIR | COURANT | PASSE`) et les 6 modèles de la Structural Seed de l'architecture (`Scenario`, `Seance`, `Inscription`, `ScenarioParticipant`, `ScenarioDocument`, `Announcement`) — schéma exact fourni en Dev Notes. **Ne créer que le schéma** ; aucune logique service pour `Seance`/`Inscription`/`ScenarioParticipant`/`ScenarioDocument`/`Announcement` n'est implémentée dans cette story (réservé aux Epics 8/9) — ces modèles existent en base par anticipation d'une seule migration groupée pour tout le palier (décision architecture, cf. Dev Notes).
  - [x] Ajouter sur `Partie` **les 3 relations inverses** (juste après `xpDistributions XpDistribution[]`) : `scenarios Scenario[]`, `scenarioDocuments ScenarioDocument[]`, `announcements Announcement[]`. **Les trois sont obligatoires** — `ScenarioDocument.partie` et `Announcement.partie` ont chacun un `@relation` vers `Partie` dans le schéma de la Task 1 ; sans leur relation inverse déclarée côté `Partie`, `prisma migrate dev` échoue en validation ("missing opposite relation field").
  - [x] Ajouter sur `SessionPoll` (modèle existant) la relation inverse `seance Seance?` — `Seance.poll` (`pollId String? @unique`, `@relation(fields: [pollId], references: [id])`) exige une relation opposée sur `SessionPoll`, absente du schéma sinon. Sans cet ajout, même échec de validation Prisma que ci-dessus.
  - [x] Ajouter `journalAutoAssociate Boolean @default(false)` sur `Character` (AD-11 — hors scope fonctionnel de 7.1, mais fait partie de la même migration groupée).
  - [x] Ajouter les relations inverses `inscriptions Inscription[]`/`scenarioParticipations ScenarioParticipant[]` sur `User` (mécanique, cf. architecture note de rétrocompatibilité).
  - [x] Lancer `docker compose exec api pnpm prisma migrate dev --name scenarios_seances_p4` puis `docker compose exec api pnpm prisma generate`. **Si Prisma rejette le schéma pour une relation opposée manquante non listée ci-dessus, l'ajouter au fur et à mesure** — la Structural Seed de l'architecture n'énumère pas exhaustivement toutes les relations inverses requises (2 manques déjà identifiés et corrigés dans cette story ; il peut en rester).

- [x] **Task 2 — Types partagés `packages/shared`** (AC: 1, 4)
  - [x] Dans `packages/shared/src/index.ts`, ajouter (à la suite de `PartieDto`, même convention que `CreatePollDto`) : `ScenarioStatus`, `ScenarioDto` (`description: string | null` — jamais optionnel, toujours présent, cf. AD-6), `CreateScenarioDto`, `UpdateScenarioDto`. Un-commentaire JSDoc une ligne par export, style français existant.

- [x] **Task 3 — Scaffolding `ScenariosModule`** (AC: 1, 2, 4, 5, 6)
  - [x] Créer `apps/api/src/scenarios/` : `scenarios.module.ts` (imports `[PartiesModule]`, exports `[ScenariosService]`), `scenarios.controller.ts`, `scenarios.service.ts`, `dto/create-scenario.dto.ts`, `dto/update-scenario.dto.ts`.
  - [x] Enregistrer `ScenariosModule` dans `AppModule`.

- [x] **Task 4 — `ScenariosService.create`** (AC: 1, 2, 6)
  - [x] `create(partieId: string, mjId: string, dto: CreateScenarioDto)` : appelle `partiesService.getOwned(partieId, mjId)` (403/404 gérés par cette méthode, ne rien réimplémenter), puis `prisma.scenario.create({ data: { partieId, title, description: dto.description ?? null, dureeHeures: dto.dureeHeures ?? null, dureeSeances: dto.dureeSeances ?? null, status: 'BROUILLON' } })`. Retourne via un mapper `toDto()` (pattern déjà en place dans `poll.service.ts`/`xp-distributions.service.ts` — jamais renvoyer l'objet Prisma brut).

- [x] **Task 5 — `ScenariosService.update`** (AC: 4, 5)
  - [x] `update(scenarioId: string, mjId: string, dto: UpdateScenarioDto)` : charge le `Scenario` (404 si absent), appelle `partiesService.getOwned(scenario.partieId, mjId)`, si `scenario.status === 'PASSE'` → `throw new BadRequestException(...)` (voir Dev Notes pour le choix de cette exception plutôt que `ConflictException`), sinon `prisma.scenario.update({ where: { id: scenarioId }, data: { title: dto.title, description: dto.description, dureeHeures: dto.dureeHeures, dureeSeances: dto.dureeSeances } })` — champs seulement s'ils sont fournis (`??` ou construction conditionnelle de l'objet `data`, pas d'écrasement à `undefined`).
  - [x] **Aucune notification n'est déclenchée** — ne pas appeler `EmailService` ni créer de log applicatif pour cette mutation (AC 4, Non-Goal PRD §5).

- [x] **Task 6 — Endpoints contrôleur** (AC: 1, 2, 4, 5)
  - [x] `POST /parties/:id/scenarios` → `ScenariosController.create`, `@UseGuards(AuthenticatedGuard)`, `@Param('id', ParseUUIDPipe) partieId`, `@CurrentUser() user: AuthUser`, `@Body() dto: CreateScenarioDto`.
  - [x] `PATCH /scenarios/:id` → `ScenariosController.update`, mêmes conventions de guard/decorator, `@Param('id', ParseUUIDPipe) scenarioId`, `@Body() dto: UpdateScenarioDto`.
  - [x] **Ne pas** ajouter d'endpoint `GET` dans cette story — la lecture (liste/détail avec anti-spoil) est le périmètre de la Story 7.4, hors scope ici (éviter le scope creep).

- [x] **Task 7 — `PartiesService.create()` : auto-création ONE_SHOT** (AC: 3)
  - [x] Réécrire `create()` (actuellement un simple `prisma.partie.create()`, sans transaction — cf. Dev Notes pour le code actuel) en `async create()` enveloppant dans `this.prisma.$transaction(async (tx) => { const partie = await tx.partie.create({...}); if (dto.kind === 'ONE_SHOT') { await tx.scenario.create({ data: { partieId: partie.id, title: partie.name, status: 'BROUILLON' } }); } return partie; })`.
  - [x] **Important — éviter la dépendance circulaire** : `PartiesModule` ne doit **jamais** importer `ScenariosModule` (c'est l'inverse qui est vrai, cf. architecture). L'auto-création du scénario ONE_SHOT se fait par un appel Prisma direct (`tx.scenario.create`) dans `PartiesService`, **pas** via une injection de `ScenariosService`.
  - [x] `[ASSUMPTION — à décider par le développeur, non tranché par le PRD/UX]` : le titre du scénario auto-créé reprend le nom de la Partie (`partie.name`) comme valeur par défaut, éditable ensuite via `PATCH /scenarios/:id` (Task 5). Aucun mock ni AC ne précise cette valeur initiale — c'est un choix d'implémentation raisonnable, à documenter dans Dev Agent Record si une autre valeur est retenue.

- [x] **Task 8 — Tests** (AC: 1-6)
  - [x] `scenarios.service.spec.ts` : mock `PrismaService` (`{ scenario: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } }`) et `PartiesService` (`{ getOwned: jest.fn() }`), pattern `Test.createTestingModule` (cf. Dev Notes, exemple `xp-distributions.service.spec.ts`). Couvrir : création réussie (AC1), 403 propagé depuis `getOwned` sans appel à `prisma.scenario.create` (AC2, `expect(prisma.scenario.create).not.toHaveBeenCalled()`), édition réussie hors `PASSE` (AC4), édition rejetée si `PASSE` avec assertion `expect(prisma.scenario.update).not.toHaveBeenCalled()` (AC5).
  - [x] `scenarios.controller.spec.ts` : mock du service, vérifie le routage des paramètres (`partieId`/`scenarioId`/`user.id`/`dto`) vers les bonnes méthodes de service — pas de logique métier testée ici (déjà couverte côté service).
  - [x] `parties.service.spec.ts` (fichier existant à étendre) : nouveau test — création d'une Partie `kind: ONE_SHOT` déclenche `tx.scenario.create` avec `status: 'BROUILLON'` ; création d'une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` ne déclenche **aucun** appel à `scenario.create` (AC6 implicite — pas de scénario auto pour les campagnes).
  - [x] Lancer `docker compose exec api pnpm test` pour valider l'ensemble de la suite API (pas de régression).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1** : `ScenariosModule` (`apps/api/src/scenarios/`) est propriétaire exclusif de `Scenario`. Exporte `ScenariosService`.
- **AD-3** : `Scenario` n'a **pas** de verrouillage optimiste `updatedAt` (contrairement à `Character`, P3-AD-9) — MJ seul écrivain, `prisma.scenario.update()` simple. Ne pas ajouter de comparaison `updatedAt` par erreur d'uniformisation.
- **AD-7** : `PartiesService.create()` crée la `Partie` et, si `kind === ONE_SHOT`, son unique `Scenario` (`BROUILLON`) **dans la même transaction**. Aucun état intermédiaire "Partie ONE_SHOT sans scénario". L'ouverture (`BROUILLON→À_VENIR`) reste une action MJ explicite future (Story 7.3), jamais automatique ici.
- **AD-9** : lecture = `parties.getViewable` (non utilisé dans cette story, pas de GET), écriture de contenu = `parties.getOwned` (MJ seul) — jamais un nouveau guard NestJS dédié.
- **Naming** : la nouvelle entité s'appelle **`Seance`** (sans accent), jamais `Session` — collision confirmée avec le modèle Prisma `Session` existant (`@@map("session")`, store `connect-pg-simple`, `apps/api/prisma/schema.prisma` lignes 351-358). Non directement utilisé par 7.1 mais présent dans le schéma ajouté à la Task 1.
- **Erreurs** : `ForbiddenException`/`NotFoundException` via `getOwned` (inchangé). Pour le rejet d'édition d'un scénario `PASSE` (AC5), utiliser **`BadRequestException`** (400), pas `ConflictException` — convention du code existant (`poll.service.ts` rejette une action sur un poll déjà fermé avec `BadRequestException`, jamais `ConflictException`). `ConflictException` (409) est réservé par l'architecture aux cas de concurrence réelle introduits dans les stories suivantes (AD-5 capacité limitée, AD-10 un seul `Courant`) — ne pas l'utiliser ici, ce n'est pas une course concurrente mais une transition de statut invalide.

### Schéma Prisma à ajouter (Task 1 — verbatim architecture spine, migration `scenarios_seances_p4`)

```prisma
enum ScenarioStatus {
  BROUILLON
  A_VENIR
  COURANT
  PASSE
}

model Scenario {
  id           String         @id @default(uuid())
  partieId     String
  partie       Partie         @relation(fields: [partieId], references: [id], onDelete: Cascade)
  title        String
  description  String?
  status       ScenarioStatus @default(BROUILLON)
  dureeHeures  Int?
  dureeSeances Int?
  resumeFin    String?        // rétrospective, FR-15 (Epic 8) — champ créé maintenant, non écrit par 7.1
  createdAt    DateTime       @default(now())
  closedAt     DateTime?

  seances       Seance[]
  documents     ScenarioDocument[]
  participants  ScenarioParticipant[]
  announcements Announcement[]

  @@index([partieId, status])
}

model Seance {
  id             String        @id @default(uuid())
  scenarioId     String
  scenario       Scenario      @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  pollId         String?       @unique
  poll           SessionPoll?  @relation(fields: [pollId], references: [id])
  inscriptionMin Int?
  inscriptionMax Int?
  dateValidee    DateTime?
  compteRendu    String?
  createdAt      DateTime      @default(now())

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

model ScenarioParticipant {
  id         String   @id @default(uuid())
  scenarioId String
  scenario   Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([scenarioId, userId])
}

model ScenarioDocument {
  id           String    @id @default(uuid())
  partieId     String
  partie       Partie    @relation(fields: [partieId], references: [id], onDelete: Cascade)
  scenarioId   String?
  scenario     Scenario? @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  filename     String
  originalName String
  sizeBytes    Int
  createdAt    DateTime  @default(now())

  @@index([partieId])
}

model Announcement {
  id         String    @id @default(uuid())
  partieId   String
  partie     Partie    @relation(fields: [partieId], references: [id], onDelete: Cascade)
  scenarioId String?
  scenario   Scenario? @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  text       String
  createdAt  DateTime  @default(now())

  @@index([partieId, createdAt])
}
```

Sur `Partie` (après `xpDistributions XpDistribution[]`) : **3 relations inverses obligatoires** — `scenarios Scenario[]`, `scenarioDocuments ScenarioDocument[]`, `announcements Announcement[]` (les deux dernières sont omises dans une lecture rapide de la Structural Seed de l'architecture mais requises par Prisma : `ScenarioDocument.partie` et `Announcement.partie` déclarent chacun un `@relation` vers `Partie`).
Sur `SessionPoll` (modèle existant) : ajouter `seance Seance?` — relation opposée à `Seance.poll`, également omise dans la Structural Seed d'architecture, également requise par Prisma.
Sur `Character` (AD-11) : `journalAutoAssociate Boolean @default(false)`.
Sur `User` : relations inverses `inscriptions Inscription[]`, `scenarioParticipations ScenarioParticipant[]` (mécanique).

**Pourquoi toute la migration d'un coup et pas juste `Scenario`** : décision explicite de l'architecture (une seule migration `scenarios_seances_p4` nommée pour tout le palier), cohérente avec la pratique déjà observée aux paliers précédents de ce projet. Point noté comme mineur/non-bloquant lors de la revue de préparation à l'implémentation du 2026-07-12 — ne pas fractionner en plusieurs migrations par story.

### Code existant à lire avant de coder (fichiers UPDATE)

- **`apps/api/prisma/schema.prisma`** — modèle `Partie` (lignes ~41-62, enum `PartieKind`), modèle `Session` existant (lignes 351-358, confirme la collision de nom à éviter), modèle `User` (relations lignes ~15-33).
- **`apps/api/src/parties/parties.service.ts`** — `create()` actuel (pas de transaction) :
  ```ts
  create(mjId: string, dto: CreatePartieDto) {
    return this.prisma.partie.create({
      data: { name: dto.name, kind: dto.kind, gameSystemId: dto.gameSystemId, description: dto.description ?? null, mjId },
    });
  }
  ```
  À transformer en `async create()` avec `$transaction` (Task 7). Aussi `getOwned`/`getViewable` (lignes ~51-68) — réutiliser tel quel, ne jamais réimplémenter la vérification MJ/membre.
- **`apps/api/src/parties/parties.module.ts`** — exporte déjà `PartiesService` ; `ScenariosModule` doit `imports: [PartiesModule]`.

### Pattern de module à répliquer — `apps/api/src/poll/` et `apps/api/src/xp-distributions/`

Module :
```ts
@Module({
  imports: [PartiesModule, CharacterModule], // ScenariosModule: imports: [PartiesModule] seulement
  controllers: [XpDistributionsController],
  providers: [XpDistributionsService],
})
export class XpDistributionsModule {}
```

Contrôleur (guard + current user) :
```ts
@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/xp-distributions')
export class XpDistributionsController {
  constructor(private readonly xpDistributions: XpDistributionsService) {}

  @Post()
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateXpDistributionDto,
  ) {
    return this.xpDistributions.createDistribution(partieId, user.id, dto);
  }
}
```
`AuthenticatedGuard` depuis `../auth/guards/authenticated.guard`, `@CurrentUser()` depuis `../common/current-user.decorator`, type `AuthUser` depuis `@master-jdr/shared`.

Service (transaction + ownership-first, calqué sur `poll.service.ts`) :
```ts
async create(partieId: string, userId: string, dto: CreatePollDto): Promise<SessionPollDto> {
  await this.parties.getOwned(partieId, userId);
  const poll = await this.prisma.$transaction(async (tx) => {
    // ... logique métier ...
    return tx.sessionPoll.create({ data: { /* ... */ }, include: POLL_INCLUDE });
  });
  return toDto(poll);
}
```
Toujours un mapper `toDto()` en bas de fichier service — jamais retourner l'objet Prisma brut au contrôleur.

DTO (`apps/api/src/parties/dto/update-partie.dto.ts`, style à reproduire) :
```ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePartieDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;
  // ...
}
```

### Tests — conventions à suivre exactement

Prisma **toujours mocké à la main** (jamais de vraie base de test) :
```ts
function makePrisma() {
  return { scenario: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
}
function makeParties() {
  return { getOwned: jest.fn() };
}
beforeEach(async () => {
  jest.clearAllMocks();
  prisma = makePrisma();
  parties = makeParties();
  const module = await Test.createTestingModule({
    providers: [
      ScenariosService,
      { provide: PrismaService, useValue: prisma },
      { provide: PartiesService, useValue: parties },
    ],
  }).compile();
  service = module.get(ScenariosService);
});
```
Assertions : `expect(x).rejects.toThrow(ForbiddenException)`, `expect(fn).toHaveBeenCalledWith(expect.objectContaining({...}))`, `expect(prisma.scenario.update).not.toHaveBeenCalled()` pour prouver l'absence d'écriture partielle sur rejet. Descriptions de test en français, phrases décrivant le comportement exact testé.

### Hors scope explicite de cette story (ne pas implémenter)

- Aucun endpoint `GET` (liste/détail scénario) — Story 7.4.
- Aucune logique `Seance`/`Inscription`/`ScenarioParticipant`/`ScenarioDocument`/`Announcement` — Epics 8/9. Le schéma Prisma de ces modèles est créé maintenant (migration groupée) mais reste inerte.
- Aucun upload de document — Story 7.2 (pattern de référence : `apps/api/src/characters/characters.controller.ts` ~ligne 44 `MAX_PORTRAIT_SIZE = 5 * 1024 * 1024`, `apps/api/src/characters/portrait-storage.util.ts` — juste un pointeur, pas à toucher ici).
- Aucune notification/e-mail sur la modification (AC4, Non-Goal PRD §5) — ne pas appeler `EmailService`.

### Project Structure Notes

- Alignement complet avec le source tree de l'architecture (`apps/api/src/scenarios/`, `packages/shared/src/index.ts` fichier plat unique — pas de sous-dossiers par domaine).
- Aucun conflit détecté avec la structure existante. `PartiesModule` reste sans dépendance vers `ScenariosModule` (le sens d'import est unidirectionnel : `ScenariosModule → PartiesModule`) — c'est le point d'attention principal de cette story (Task 7).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1: Créer et éditer un scénario] — ACs verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260711/prd.md#FR-1, FR-4] — règles métier création/édition.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-7, AD-9, Structural Seed] — invariants et schéma Prisma.
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-12.md#Epic Quality Review] — note sur la migration Prisma groupée, déjà validée comme non-bloquante.
- [Source: apps/api/src/parties/parties.service.ts] — `create()`, `getOwned()`, `getViewable()` actuels.
- [Source: apps/api/src/xp-distributions/] — pattern module/controller/service/dto/spec à répliquer.

### Review Findings

Revue adversariale parallèle (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 17 findings uniques après dédoublonnage, 0 décision nécessitant l'utilisateur, 8 patchs, 2 différés, 7 rejetés comme bruit/déjà couverts.

- [x] [Review][Patch] Invariant "un seul scénario pour un ONE_SHOT" non appliqué côté écriture manuelle [apps/api/src/scenarios/scenarios.service.ts:21-40] — corrigé (rejet `BadRequestException` si `partie.kind === 'ONE_SHOT'`) — `ScenariosService.create()` n'exclut pas les Parties `ONE_SHOT` ; un MJ peut créer un 2ᵉ scénario via `POST` alors que FR-1/PRD §9 dit explicitement "pas de gestion multi-scénarios pour ce cas".
- [x] [Review][Patch] Message d'erreur trompeur sur le rejet d'édition d'un scénario `PASSE` [apps/api/src/scenarios/scenarios.service.ts:53-56] — affirme que "le résumé de fin reste éditable" alors qu'aucun champ `resumeFin` n'existe dans `UpdateScenarioDto` et que la story bloque tout le PATCH sur `PASSE` ; formulation à corriger pour ne pas laisser croire que cet endpoint gère `resumeFin` (Epic 8).
- [x] [Review][Patch] `UpdateScenarioDto.title` accepte `null` et contourne la validation [apps/api/src/scenarios/dto/update-scenario.dto.ts:15-18] — `@IsOptional()` de class-validator saute la validation quand la valeur est `null` (pas seulement `undefined`), donc `PATCH { title: null }` passe le DTO puis crash en 500 sur la colonne Prisma `NOT NULL` au lieu d'un 400 propre.
- [x] [Review][Patch] Migration sans backfill pour les Parties `ONE_SHOT` déjà existantes [apps/api/prisma/migrations/20260712115353_scenarios_seances_p4/migration.sql] — les Parties `ONE_SHOT` créées avant cette migration n'obtiennent jamais leur scénario automatique ; ajouter un `INSERT ... SELECT` de rattrapage dans la migration.
- [x] [Review][Patch] `dureeHeures`/`dureeSeances` sans borne supérieure [apps/api/src/scenarios/dto/create-scenario.dto.ts, update-scenario.dto.ts] — `@IsInt() @Min(1)` sans `@Max()` ; une valeur hors plage `INTEGER` Postgres provoque un 500 au lieu d'un 400.
- [x] [Review][Patch] Titre composé uniquement d'espaces accepté [apps/api/src/scenarios/dto/create-scenario.dto.ts, update-scenario.dto.ts] — `@MinLength(1)` ne rejette pas une chaîne du type `"   "`, produisant un scénario au titre visuellement vide.
- [x] [Review][Patch] Placeholder de test mort et immédiatement écrasé [apps/api/src/parties/parties.service.spec.ts:325] — `$transaction: undefined as unknown as jest.Mock,` n'a aucune utilité, la ligne suivante réassigne systématiquement une vraie implémentation ; à supprimer.
- [x] [Review][Patch] Indentation incohérente des nouveaux champs de relation sur `Partie` [apps/api/prisma/schema.prisma:63-65] — `scenarios`/`scenarioDocuments`/`announcements` mal alignés avec les champs voisins (cosmétique, `prisma format` corrige).
- [x] [Review][Defer] `toDto(scenario: any)` sacrifie la sécurité de type [apps/api/src/scenarios/scenarios.service.ts:75] — déferré, pré-existant : réplique exactement le pattern déjà établi dans `poll.service.ts`/`xp-distributions.service.ts`, un correctif isolé à ce seul fichier serait incohérent avec le reste du code base.
- [x] [Review][Defer] Race TOCTOU lecture/écriture du statut dans `update()` [apps/api/src/scenarios/scenarios.service.ts:47-58] — déferré, hors scope 7.1 : aucun autre chemin ne mute `status` tant que les Stories 7.5/7.6 ne sont pas livrées ; l'architecture prévoit déjà `SELECT ... FOR UPDATE` (AD-10) pour ces transitions futures.

**Rejetés comme bruit ou déjà couverts (7)** : dette `Character.journalAutoAssociate`/5 tables spéculatives dans la migration groupée (décision architecture déjà actée et documentée, cf. rapport de readiness) ; PATCH vide accepté en no-op (inoffensif) ; ordre 404-avant-403 dans `update()` (identique au pattern déjà établi par `PartiesService.getOwned`) ; double définition DTO validé (API) vs interface partagée (pattern P1-AD-4 déjà en place partout) ; contrôleur à deux préfixes de route (conforme au source tree explicite de l'architecture, confirmé par l'Acceptance Auditor) ; absence de traduction d'erreur dédiée sur l'échec de `$transaction` (identique au reste du code base, aucun autre module n'en a).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Migration Prisma `20260712115353_scenarios_seances_p4` appliquée du premier coup (les 2 relations inverses manquantes identifiées lors de la revue fraîche de `bmad-create-story` — `Partie.scenarioDocuments`/`Partie.announcements` et `SessionPoll.seance` — avaient déjà été corrigées dans la story avant le début du dev).
- Suite complète API : 25 suites / 412 tests, tous passants après implémentation (aucune régression).
- `pnpm lint` : le pattern `toDto(raw: any)` répliqué depuis `poll.service.ts`/`xp-distributions.service.ts` (convention déjà établie, explicitement demandée par la story) hérite des mêmes erreurs `@typescript-eslint/no-unsafe-*` déjà présentes dans ces fichiers non touchés par cette story (830 erreurs pré-existantes avant cette story, confirmé en comparant les fichiers non modifiés du même lint run). Pas une régression introduite par 7.1 — dette de lint pré-existante et acceptée dans le reste du code base. Les 2 warnings `no-floating-promises` propres au nouveau fichier `scenarios.controller.spec.ts` ont, eux, été corrigés (`await` ajouté).

### Completion Notes List

- Migration Prisma groupée `scenarios_seances_p4` appliquée : enum `ScenarioStatus` + 6 modèles (`Scenario`, `Seance`, `Inscription`, `ScenarioParticipant`, `ScenarioDocument`, `Announcement`) + `Character.journalAutoAssociate` + toutes les relations inverses requises.
- `ScenariosModule` scaffoldé (`apps/api/src/scenarios/`), importe uniquement `PartiesModule` — aucune dépendance circulaire avec `PartiesModule`.
- `ScenariosService.create`/`update` implémentés : ownership systématiquement vérifié via `PartiesService.getOwned` (jamais réimplémenté), `BadRequestException` (400) pour le rejet d'édition d'un scénario `PASSE` (convention alignée sur `poll.service.ts`, pas `ConflictException`).
- `PartiesService.create()` réécrit en transaction Prisma (`$transaction`) : crée la `Partie` puis, si `kind === 'ONE_SHOT'`, son unique `Scenario` `BROUILLON` dans la même transaction (AD-7). Titre du scénario auto-créé = nom de la Partie (assumption documentée dans la story, éditable ensuite via PATCH).
- Types partagés ajoutés dans `packages/shared/src/index.ts` : `ScenarioStatus`, `ScenarioDto`, `CreateScenarioDto`, `UpdateScenarioDto`.
- 6 acceptance criteria couverts et testés : AC1 (création BROUILLON), AC2 (403 non-MJ), AC3 (auto-création ONE_SHOT en transaction), AC4 (édition hors PASSE), AC5 (rejet édition PASSE), AC6 (créations multiples indépendantes).
- Hors scope respecté : aucun endpoint GET, aucune logique Seance/Inscription/ScenarioParticipant/ScenarioDocument/Announcement, aucun appel EmailService.
- 412/412 tests passent (suite API complète), aucune régression.

### File List

- `apps/api/prisma/schema.prisma` (modifié — enum `ScenarioStatus`, 6 nouveaux modèles, relations inverses `Partie`/`SessionPoll`/`User`, `Character.journalAutoAssociate`)
- `apps/api/prisma/migrations/20260712115353_scenarios_seances_p4/migration.sql` (nouveau)
- `packages/shared/src/index.ts` (modifié — `ScenarioStatus`, `ScenarioDto`, `CreateScenarioDto`, `UpdateScenarioDto`)
- `apps/api/src/scenarios/scenarios.module.ts` (nouveau)
- `apps/api/src/scenarios/scenarios.controller.ts` (nouveau)
- `apps/api/src/scenarios/scenarios.service.ts` (nouveau)
- `apps/api/src/scenarios/dto/create-scenario.dto.ts` (nouveau, modifié en revue — bornes `@Max`, rejet titre uniquement espaces)
- `apps/api/src/scenarios/dto/update-scenario.dto.ts` (nouveau, modifié en revue — `@ValidateIf` sur `title`, bornes `@Max`, rejet titre uniquement espaces)
- `apps/api/src/scenarios/dto/create-scenario.dto.spec.ts` (nouveau, ajouté en revue)
- `apps/api/src/scenarios/dto/update-scenario.dto.spec.ts` (nouveau, ajouté en revue)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (nouveau, étendu en revue — tests invariant ONE_SHOT)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (nouveau)
- `apps/api/src/app.module.ts` (modifié — enregistrement `ScenariosModule`)
- `apps/api/src/parties/parties.service.ts` (modifié — `create()` transactionnel + auto-création scénario ONE_SHOT)
- `apps/api/src/parties/parties.service.spec.ts` (modifié — tests AC3, mock `$transaction`/`scenario.create`, nettoyage placeholder de test en revue)

## Change Log

- 2026-07-12 : Implémentation complète de la Story 7.1 (migration Prisma, ScenariosModule, auto-création ONE_SHOT, 6 ACs couvertes par tests, 412/412 tests passants).
- 2026-07-12 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 0 violation d'AC, 8 patchs appliqués (invariant scénario unique ONE_SHOT, message d'erreur corrigé, validation `title:null`/bornes numériques/titre-espaces, backfill migration pour Parties `ONE_SHOT` déjà existantes, nettoyage test), 2 items différés documentés dans `deferred-work.md`. 426/426 tests passants après correctifs.
