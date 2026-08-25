---
baseline_commit: ed9ba08ab43936a6d8dc7efb2a2ade8febece14f
---

# Story 7.2: Documents de scénario et bibliothèque de Partie

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want joindre des documents à un scénario ou à la bibliothèque de ma Partie,
so that mes joueurs disposent des éléments narratifs et des règles maison sans passer par un support externe.

## Acceptance Criteria

1. **Given** je suis MJ d'une Partie **When** j'upload un document (PDF/texte, ≤5 Mo) avec un `scenarioId` **Then** un `ScenarioDocument` est créé rattaché à ce scénario (même pattern multer/disque local que l'upload de portrait, Story 4.5).
2. **Given** un fichier de plus de 5 Mo **When** l'upload est tenté (scénario ou bibliothèque) **Then** la requête est rejetée explicitement (400) — même plafond que le portrait.
3. **Given** je suis MJ d'une Partie **When** j'upload un document sans `scenarioId` **Then** le `ScenarioDocument` a `scenarioId: null` (bibliothèque de Partie/campagne), visible en permanence indépendamment du statut de tout scénario.
4. **Given** un membre quelconque de la Partie **When** il liste les documents d'un scénario via l'API **Then** la réponse contient toujours l'intégralité des documents (scénario + bibliothèque), quel que soit son rôle ou le statut du scénario — l'API ne filtre jamais (AD-6, le filtrage est une responsabilité frontend, couverte par la Story 7.4).
5. **Given** un document de bibliothèque (`scenarioId: null`) **When** il est affiché dans l'UI **Then** il porte le tag « bibliothèque campagne » et n'est jamais masqué par l'anti-spoil (backend : `scenarioId: null` suffit, le rendu du tag est frontend, Story 7.4).
6. **Given** un participant au scénario dont le statut est `COURANT`/`PASSE` **When** il consulte les documents propres au scénario **Then** il peut les consulter et les télécharger.

*(Source: epics.md Story 7.2 — ACs reproduites verbatim, aucune reformulation. AC2 code littéralement "(400)" dans epics.md, mais dans la même phrase renvoie explicitement au plafond du portrait, dont le pattern établi répond 413 — cf. Dev Notes pour la résolution retenue (413) et sa justification.)*

**Exigence croisée héritée de la Story 7.1 (AC5), non répétée dans les ACs ci-dessus mais contraignante :** *"Given un scénario `status: PASSE` / When le MJ tente de modifier `description`/**`documents`** (contenu narratif de base) / Then la requête est rejetée."* — un upload de document **scénario-scopé** sur un scénario `PASSE` doit être rejeté (même `BadRequestException` que 7.1). Un upload de document **bibliothèque** (`scenarioId` absent) n'est jamais concerné (FR-3 : toujours modifiable, indépendant du statut de tout scénario).

## Tasks / Subtasks

- [x] **Task 1 — Extraire `UPLOADS_ROOT` en constante partagée** (prérequis technique)
  - [x] Créer `apps/api/src/common/uploads-root.ts` : `export const UPLOADS_ROOT = join(process.cwd(), 'uploads');`
  - [x] Modifier `apps/api/src/characters/portrait-storage.util.ts` pour importer `UPLOADS_ROOT` depuis ce nouveau fichier commun au lieu de le redéfinir localement (`PORTRAITS_DIR = join(UPLOADS_ROOT, 'portraits')` inchangé). Petit refactor justifié : évite que `ScenariosModule` importe une constante depuis le dossier `characters/` d'un autre domaine.
  - [x] Vérifier `apps/api/src/characters/portrait-storage.util.spec.ts` passe toujours sans modification (le comportement exporté ne change pas, seule l'origine de la constante bouge).

- [x] **Task 2 — `apps/api/src/scenarios/document-mime.util.ts`** (AC1, AC2 — détection type réel, jamais l'extension/Content-Type déclaré)
  - [x] `detectDocumentMime(buffer: Buffer): 'application/pdf' | 'text/plain' | null` : PDF détecté par signature `%PDF-` (`buffer.subarray(0, 5).toString('ascii') === '%PDF-'`) ; texte détecté par heuristique **absence de byte NUL (`0x00`) dans les 8000 premiers octets** (aucune signature magique fiable n'existe pour le texte brut — un fichier binaire mal étiqueté `.txt` contient presque toujours un NUL rapidement, un vrai texte UTF-8/ASCII jamais). `[ASSUMPTION]` heuristique de détection texte, non spécifiée par le PRD/architecture — à documenter dans Dev Agent Record.
  - [x] `extensionForDocumentMime(mime): '.pdf' | '.txt'`, `mimeForExtension(ext): DetectedDocumentMime | null` — même table bidirectionnelle que `image-mime.util.ts`.
  - [x] `isValidDocumentFilename(filename): boolean` — regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|txt)$` (même garde anti path-traversal que `PORTRAIT_FILENAME_RE`).
  - [x] `document-mime.util.spec.ts` : cas PDF valide, texte valide, buffer binaire arbitraire (rejeté), regex de nom de fichier.

- [x] **Task 3 — `apps/api/src/scenarios/document-storage.util.ts`** (AC1, AC2, AC6 — écriture/lecture disque)
  - [x] `DOCUMENTS_DIR = join(UPLOADS_ROOT, 'scenario-documents')`.
  - [x] `writeDocumentFile(buffer, mime): Promise<string>` (filename) — `mkdir(DOCUMENTS_DIR, { recursive: true })`, `randomUUID() + extensionForDocumentMime(mime)`, `writeFile`.
  - [x] `readDocumentFile(filename): Promise<{ buffer: Buffer; mime: DetectedDocumentMime } | null>` — valide `isValidDocumentFilename` avant tout accès disque (même défense en profondeur que `readPortraitFile`), retourne `null` si fichier absent/invalide (jamais de throw ici, le service décide du 404).
  - [x] Pas de fonction de suppression dans cette story — aucune AC ne couvre la suppression d'un document (hors scope, ne pas l'ajouter par anticipation).

- [x] **Task 4 — Types partagés `packages/shared`** (AC3, AC4)
  - [x] Dans `packages/shared/src/index.ts`, après les types `Scenario*` (Story 7.1, ~ligne 131), ajouter : `export interface ScenarioDocumentDto { id: string; partieId: string; scenarioId: string | null; originalName: string; sizeBytes: number; createdAt: string; }`. Pas de `filename` exposé (nom de fichier disque interne, jamais renvoyé au client — seul `id` sert à construire l'URL de téléchargement `GET /documents/:id`).

- [x] **Task 5 — `ScenariosService` : upload/liste/téléchargement** (AC1-AC6)
  - [x] `uploadDocument(partieId: string, mjId: string, file: Express.Multer.File, scenarioId?: string): Promise<ScenarioDocumentDto>` :
    1. `await this.parties.getOwned(partieId, mjId)` (MJ seul, AD-9).
    2. Si `scenarioId` fourni : `prisma.scenario.findUnique({ where: { id: scenarioId } })` → `NotFoundException` si absent ; `BadRequestException` si `scenario.partieId !== partieId` (n'appartient pas à cette Partie) ; si `scenario.status === 'PASSE'` → `BadRequestException` avec un message adapté au contexte upload, ex. `"Un scénario clôturé ne peut plus recevoir de nouveaux documents — seul le résumé de fin (Epic 8) reste éditable"` (même intent/registre que le message de rejet d'édition de la Story 7.1, pas une réutilisation littérale de la chaîne — celle-ci parle d'édition de champs, pas d'upload).
    3. `detectDocumentMime(file.buffer)` → `BadRequestException` si `null` ("Le fichier fourni n'est pas un PDF ou un texte valide").
    4. `writeDocumentFile(file.buffer, mime)` puis `prisma.scenarioDocument.create({ data: { partieId, scenarioId: scenarioId ?? null, filename, originalName: file.originalname, sizeBytes: file.size } })`.
    5. Retourne via `toDocumentDto()`.
  - [x] `listDocuments(scenarioId: string, userId: string): Promise<ScenarioDocumentDto[]>` : charge le `Scenario` (404 si absent), `await this.parties.getViewable(scenario.partieId, userId)` (tout membre, AD-9), puis `prisma.scenarioDocument.findMany({ where: { OR: [{ scenarioId }, { partieId: scenario.partieId, scenarioId: null }] }, orderBy: { createdAt: 'desc' } })` — combine documents du scénario ET bibliothèque de Partie dans la même réponse (AC4). **Aucun filtre sur `scenario.status`** — l'API renvoie toujours tout (AD-6).
  - [x] `listLibraryDocuments(partieId: string, userId: string): Promise<ScenarioDocumentDto[]>` : `await this.parties.getViewable(partieId, userId)`, puis `prisma.scenarioDocument.findMany({ where: { partieId, scenarioId: null }, orderBy: { createdAt: 'desc' } })`. **Nécessaire** : une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` peut n'avoir aucun scénario créé (contrairement à `ONE_SHOT`, AD-7) tout en ayant déjà reçu des documents de bibliothèque (AC3) — sans cette méthode, ces documents seraient injoignables tant qu'aucun scénario n'existe (`listDocuments` exige un `scenarioId`).
  - [x] `getDocumentFile(documentId: string, userId: string): Promise<{ buffer: Buffer; mime: string; originalName: string }>` : charge le `ScenarioDocument` (404 si absent), `await this.parties.getViewable(document.partieId, userId)`, `readDocumentFile(document.filename)` (404 si fichier disque manquant/invalide), retourne buffer + mime + `originalName` pour le header `Content-Disposition`. **Aucun filtre sur le statut du scénario parent** — AD-6 s'applique aussi au téléchargement, y compris pour un scénario `BROUILLON` (cf. Dev Notes AD-6, "y compris le lien de téléchargement" du côté frontend, jamais côté backend).

- [x] **Task 6 — Endpoints contrôleur** (AC1-AC6)
  - [x] Déclarer `const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;` en haut de `scenarios.controller.ts` (même convention que `MAX_PORTRAIT_SIZE` dans `characters.controller.ts`).
  - [x] `POST parties/:id/documents` → `ScenariosController.uploadDocument`, `@Param('id', ParseUUIDPipe) partieId`, `@UseFilters(MulterExceptionFilter)`, `@UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOCUMENT_SIZE } }))`, `@UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: MAX_DOCUMENT_SIZE })], errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE }))`, `@Body('scenarioId') scenarioId: string | undefined` (champ multipart optionnel, pas de DTO class-validator car `multipart/form-data` — cohérent avec `updatePortrait`).
  - [x] `GET scenarios/:id/documents` → `ScenariosController.listDocuments`, `@Param('id', ParseUUIDPipe) scenarioId`.
  - [x] `GET parties/:id/documents` → `ScenariosController.listLibraryDocuments`, `@Param('id', ParseUUIDPipe) partieId` (documents de bibliothèque uniquement — cf. `listLibraryDocuments`, Task 5).
  - [x] `GET documents/:id` → `ScenariosController.downloadDocument`, `@Param('id', ParseUUIDPipe) documentId`, retourne `new StreamableFile(buffer, { type: mime, disposition: 'attachment; filename="' + originalName + '"' })` (attachement, pas d'affichage inline — contrairement au portrait, un document se télécharge).
  - [x] `[ASSUMPTION]` Forme des routes non fixée par les ACs epics (contrairement à la Story 7.1 dont l'AC1 fixait `POST /parties/:id/scenarios` explicitement) — choix : un seul endpoint d'upload `POST /parties/:id/documents` avec `scenarioId` optionnel dans le body multipart, plutôt que deux endpoints séparés, pour éviter la duplication de configuration Multer. Deux endpoints de lecture distincts (`GET scenarios/:id/documents` combiné, `GET parties/:id/documents` bibliothèque seule) pour couvrir le cas d'une Partie sans scénario. Le téléchargement est scopé par `document.partieId` directement (pas par scénario), ce qui gère nativement le cas des documents de bibliothèque. Documenté dans Dev Agent Record si retravaillé.

- [x] **Task 7 — Tests** (AC1-AC6)
  - [x] `document-mime.util.spec.ts` (Task 2).
  - [x] `scenarios.service.spec.ts` (étendre le fichier existant de la Story 7.1) : upload réussi avec `scenarioId` (AC1), upload réussi sans `scenarioId` → `scenarioId: null` (AC3), upload sur un scénario `PASSE` → `BadRequestException`, aucune écriture (exigence croisée 7.1 AC5), upload sur un `scenarioId` n'appartenant pas à la Partie → `BadRequestException`, `listDocuments` combine scénario + bibliothèque (AC4, vérifier la clause `OR` du `where`), `listLibraryDocuments` ne renvoie que les documents `scenarioId: null` d'une Partie sans aucun scénario créé, `listDocuments`/`listLibraryDocuments`/`getDocumentFile` n'appliquent aucune vérification de statut (AC6, teste explicitement qu'un scénario `BROUILLON` ne bloque pas `getDocumentFile` — AD-6).
  - [x] `scenarios.controller.spec.ts` (étendre) : routage des paramètres vers les 4 nouvelles méthodes de service.
  - [x] Test HTTP réel via `supertest` (mirroring `characters.controller.spec.ts` lignes ~395-483, `Test.createTestingModule` + `overrideGuard(AuthenticatedGuard)` + `app.init()`) : upload d'un fichier >5 Mo → 413, `uploadDocument` jamais appelé (AC2) ; upload d'un PDF valide (buffer commençant par `%PDF-`) ≤5 Mo → 200/201, `uploadDocument` appelé.
  - [x] Lancer `docker compose exec api pnpm test` pour valider l'ensemble de la suite API (pas de régression).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1** : `ScenariosModule` reste propriétaire exclusif, y compris de `ScenarioDocument` — pas de nouveau module `DocumentsModule`.
- **AD-6 — le point le plus important de cette story** : `GET scenarios/:id/documents` et `GET documents/:id` renvoient **toujours** le contenu complet (liste + octets du fichier) à tout membre de la Partie (`parties.getViewable`), **quel que soit le statut du scénario** (y compris `BROUILLON`) **ou le rôle de l'appelant**. Aucune donnée n'est retirée côté serveur, fichiers compris — décision explicite du 2026-07-12 (architecture-jdr-master-20260712), étendue spécifiquement aux fichiers pour éviter une protection partielle trompeuse. **Ne pas ajouter de vérification `scenario.status` dans `listDocuments`/`getDocumentFile`** — ce serait une régression par rapport à la décision d'architecture, même si elle semble "plus sûre" à première vue. L'anti-spoil est entièrement un rendu Angular conditionnel, hors scope de cette story (Story 7.4).
- **AD-8** : réutilisation exacte du pattern d'upload de portrait (Story 4.5) — `multer` + `memoryStorage()` + écriture disque locale dans le service (pas dans l'intercepteur), plafond **5 Mo par fichier**. `ScenarioDocument.scenarioId` nullable : `null` = bibliothèque de Partie/campagne (FR-3, toujours visible), renseigné = document propre au scénario (FR-2, anti-spoil frontend cf. AD-6).
- **AD-9** : écriture (upload) = MJ seul (`getOwned`) ; lecture (liste, téléchargement) = tout membre (`getViewable`) — même distinction que partout ailleurs dans ce palier.
- **Modèle Prisma `ScenarioDocument` déjà créé** par la migration `20260712115353_scenarios_seances_p4` de la Story 7.1 — **aucune nouvelle migration Prisma dans cette story**, le schéma existe déjà :
  ```prisma
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
  ```
- **AC2 (413 vs 400)** : l'AC epics dit "rejetée explicitement (400)" mais précise dans la même phrase "même plafond que le portrait" — or le pattern portrait établi (`characters.controller.ts`) répond **413 Payload Too Large** (`errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE` sur le `ParseFilePipe`, plus `MulterExceptionFilter` qui remappe l'erreur Multer elle-même en 413). Résolution retenue : **413**, pour rester rigoureusement cohérent avec "même pattern que le portrait" (la partie la plus précise et vérifiable de l'AC) plutôt qu'avec le code générique "(400)" qui n'est probablement qu'une approximation rédactionnelle côté PM. Documenté ici pour que ce ne soit pas perçu comme un écart non assumé.

### Code existant à répliquer (lu intégralement avant d'écrire le code — ne pas réinventer)

**`apps/api/src/characters/characters.controller.ts`** — endpoint d'upload portrait (verbatim) :
```ts
const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024;

@Put(':id/portrait')
@UseFilters(MulterExceptionFilter)
@UseInterceptors(
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PORTRAIT_SIZE },
  }),
)
async updatePortrait(
  @Param('id', ParseUUIDPipe) id: string,
  @UploadedFile(
    new ParseFilePipe({
      validators: [new MaxFileSizeValidator({ maxSize: MAX_PORTRAIT_SIZE })],
      errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    }),
  )
  file: Express.Multer.File,
  @Body('cropData') cropDataRaw: string | undefined,
  @CurrentUser() user: AuthUser,
) { /* ... */ }
```
Endpoint de téléchargement PDF (pattern `disposition: attachment`, à répliquer pour les documents — contrairement au portrait qui s'affiche inline sans `disposition`) :
```ts
return new StreamableFile(pdfBytes, {
  type: 'application/pdf',
  disposition: `attachment; filename="fiche-${id}-${query.format}.pdf"`,
});
```
Endpoint de téléchargement portrait (inline, PAS le pattern à suivre pour les documents — juste pour comparaison) :
```ts
@Get(':id/portrait')
async getPortrait(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<StreamableFile> {
  const { buffer, mime } = await this.characters.getPortraitFile(id, user.id);
  return new StreamableFile(buffer, { type: mime });
}
```

**`apps/api/src/common/filters/multer-exception.filter.ts`** (existant, réutiliser tel quel, `@UseFilters(MulterExceptionFilter)` sur le nouvel endpoint) :
```ts
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.code === 'LIMIT_FILE_SIZE'
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.BAD_REQUEST;
    response.status(status).json({ statusCode: status, message: exception.message });
  }
}
```

**`apps/api/src/characters/portrait-storage.util.ts`** (code avant Task 1, commentaires JSDoc omis ici pour la lisibilité de cet extrait — **ne pas les supprimer du fichier réel** en faisant le refactor Task 1, seule la provenance de `UPLOADS_ROOT` change) :
```ts
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { isValidPortraitFilename, mimeForExtension, type DetectedImageMime } from './image-mime.util';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads'); // → devient un import depuis common/uploads-root.ts
export const PORTRAITS_DIR = join(UPLOADS_ROOT, 'portraits');
export const PORTRAITS_URL_PREFIX = '/uploads/portraits/';

export function extractPortraitFilename(portraitUrl: string | null): string | null {
  if (!portraitUrl || !portraitUrl.startsWith(PORTRAITS_URL_PREFIX)) return null;
  const filename = portraitUrl.slice(PORTRAITS_URL_PREFIX.length);
  return isValidPortraitFilename(filename) ? filename : null;
}

export async function readPortraitFile(portraitUrl: string | null): Promise<{ buffer: Buffer; mime: DetectedImageMime } | null> {
  const filename = extractPortraitFilename(portraitUrl);
  if (!filename) return null;
  const mime = mimeForExtension(extname(filename));
  if (!mime) return null;
  try {
    const buffer = await readFile(join(PORTRAITS_DIR, filename));
    return { buffer, mime };
  } catch {
    return null;
  }
}
```

**`apps/api/src/characters/image-mime.util.ts`** (full — modèle exact à suivre pour `document-mime.util.ts`, cf. Task 2) :
```ts
export type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MIME_EXTENSION: Record<DetectedImageMime, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function detectImageMime(buffer: Buffer): DetectedImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function extensionForImageMime(mime: DetectedImageMime): string { return MIME_EXTENSION[mime]; }

const EXTENSION_MIME: Record<string, DetectedImageMime> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export function mimeForExtension(ext: string): DetectedImageMime | null { return EXTENSION_MIME[ext.toLowerCase()] ?? null; }

const PORTRAIT_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
export function isValidPortraitFilename(filename: string): boolean { return PORTRAIT_FILENAME_RE.test(filename); }
```

**`apps/api/src/scenarios/scenarios.service.ts`** (état actuel, Story 7.1 + revue — à étendre, ne pas dupliquer les méthodes `create`/`update` existantes) :
```ts
async create(partieId: string, mjId: string, dto: CreateScenarioDto): Promise<ScenarioDto> {
  const partie = await this.parties.getOwned(partieId, mjId);
  if (partie.kind === 'ONE_SHOT') {
    throw new BadRequestException('Une Partie de type ONE_SHOT ne peut pas avoir plusieurs scénarios — son scénario unique est créé automatiquement');
  }
  const scenario = await this.prisma.scenario.create({ data: { partieId, title: dto.title, /* ... */ status: 'BROUILLON' } });
  return toDto(scenario);
}
// update() : cf. Story 7.1, pattern findUnique → 404, getOwned → 403, status PASSE → BadRequestException
function toDto(scenario: any): ScenarioDto { /* ... */ }
```
**Ajouter `toDocumentDto()` en bas du même fichier**, à côté de `toDto()`, même style (mapper manuel, pas de classe).

**`apps/api/src/scenarios/scenarios.controller.ts`** (état actuel, à étendre — `@Controller()` vide, routes en full-path par méthode, garde globale `AuthenticatedGuard`) :
```ts
@UseGuards(AuthenticatedGuard)
@Controller()
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Post('parties/:id/scenarios')
  create(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateScenarioDto) { /* ... */ }

  @Patch('scenarios/:id')
  update(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateScenarioDto) { /* ... */ }

  // Task 6 ajoute ici : uploadDocument, listDocuments, downloadDocument
}
```

**`apps/api/src/parties/parties.service.ts`** — `getOwned`/`getViewable` inchangés depuis Story 7.1, réutiliser tels quels (jamais réimplémenter) :
```ts
async getOwned(id: string, userId: string) {
  const partie = await this.prisma.partie.findUnique({ where: { id } });
  if (!partie) throw new NotFoundException('Partie introuvable');
  if (partie.mjId !== userId) throw new ForbiddenException();
  return partie;
}
async getViewable(id: string, userId: string) {
  const partie = await this.prisma.partie.findUnique({ where: { id } });
  if (!partie) throw new NotFoundException('Partie introuvable');
  if (partie.mjId === userId) return partie;
  const membership = await this.prisma.membership.findUnique({ where: { userId_partieId: { userId, partieId: id } } });
  if (!membership) throw new ForbiddenException();
  return partie;
}
```

### Tests HTTP réels (multer) — pattern à répliquer

`apps/api/src/characters/characters.controller.spec.ts` (lignes ~395-483) monte une vraie app Nest avec le guard mocké, pour exercer le pipeline Multer réel (impossible à tester en pur unit test de contrôleur) :
```ts
const module = await Test.createTestingModule({
  controllers: [CharactersController],
  providers: [{ provide: CharacterService, useValue: characters }, /* ... */],
})
  .overrideGuard(AuthenticatedGuard)
  .useValue({
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<{ user?: unknown }>();
      req.user = { id: 'u1' };
      return true;
    },
  })
  .compile();

app = module.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await app.init();

it('portrait trop volumineux (>5 Mo) → 413 via le pipeline HTTP réel (multer + ParseFilePipe)', async () => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
  await request(app.getHttpServer())
    .put('/characters/11111111-1111-1111-1111-111111111111/portrait')
    .attach('file', oversized, 'portrait.jpg')
    .expect(413);
  expect(characters.updatePortrait).not.toHaveBeenCalled();
});
```
`afterEach(() => app.close())`. Répliquer avec `POST /parties/:id/documents` et un buffer PDF valide (`Buffer.from('%PDF-1.4\n...')`) pour le cas de succès, et un buffer >5 Mo pour le 413.

### Tests unitaires — conventions (identiques à Story 7.1)

Prisma **toujours mocké à la main**, `PartiesService` mocké avec seulement les méthodes utilisées (`getOwned`, `getViewable`). Descriptions de test en français. `expect(prisma.scenarioDocument.create).not.toHaveBeenCalled()` pour prouver l'absence d'écriture sur un chemin de rejet.

### Hors scope explicite de cette story (ne pas implémenter)

- Aucune suppression de document (`DELETE`) — aucune AC ne le couvre.
- Aucun rendu frontend (tag "bibliothèque campagne", masquage anti-spoil des documents dans l'UI) — Story 7.4, uniquement le comportement backend ici (toujours tout renvoyer, cf. AD-6).
- Aucune limite de nombre total de documents par scénario/Partie — seul le plafond par fichier (5 Mo) existe (Deferred, architecture spine).
- Aucune migration Prisma — le modèle `ScenarioDocument` existe déjà depuis la Story 7.1.

### Project Structure Notes

- Nouveaux fichiers dans `apps/api/src/scenarios/` (`document-mime.util.ts`, `document-storage.util.ts`) et `apps/api/src/common/` (`uploads-root.ts`) — aligné avec le source tree de l'architecture et la convention "un module = un dossier".
- Seul écart mineur assumé : extraction de `UPLOADS_ROOT` vers `common/` (Task 1), non explicitement prévue par l'architecture mais nécessaire pour éviter un import direct `scenarios/` → `characters/` juste pour une constante de chemin.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2: Documents de scénario et bibliothèque de Partie] — ACs verbatim.
- [Source: _bmad-output/implementation-artifacts/7-1-creer-editer-scenario.md#Acceptance Criteria AC5] — exigence croisée sur le blocage des documents pour un scénario `PASSE`.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260711/prd.md#FR-2, FR-3] — règles métier documents scénario/bibliothèque.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-6, AD-8, Structural Seed (modèle ScenarioDocument)] — anti-spoil frontend-only, pattern d'upload, schéma déjà créé.
- [Source: apps/api/src/characters/characters.controller.ts] — pattern multer/ParseFilePipe/MulterExceptionFilter à répliquer.
- [Source: apps/api/src/characters/portrait-storage.util.ts, image-mime.util.ts] — pattern stockage disque + détection MIME par octets magiques.
- [Source: apps/api/src/scenarios/scenarios.service.ts, scenarios.controller.ts] — état actuel (Story 7.1) à étendre.

### Review Findings

Revue adversariale parallèle (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 15 findings uniques après dédoublonnage, 0 décision nécessitant l'utilisateur, 4 patchs, 6 différés, 5 rejetés comme bruit/déjà couverts.

- [x] [Review][Patch] `originalName` non échappé dans `Content-Disposition` — injection d'en-tête possible [apps/api/src/scenarios/scenarios.controller.ts, downloadDocument] — `document.originalName` (fourni tel quel par le client à l'upload, `file.originalname`) est interpolé sans échappement dans `disposition: attachment; filename="${originalName}"` ; un nom contenant `"` ou des CR/LF peut casser l'en-tête ou injecter des paramètres additionnels.
- [x] [Review][Patch] `scenarioId` du body multipart jamais validé comme UUID avant Prisma [apps/api/src/scenarios/scenarios.controller.ts, uploadDocument / apps/api/src/scenarios/scenarios.service.ts] — contrairement à `partieId` (path param, `ParseUUIDPipe`), une valeur malformée provoque une erreur Prisma brute non interceptée (500) au lieu d'un 400 propre.
- [x] [Review][Patch] Fichier orphelin sur disque si l'écriture Prisma échoue après `writeDocumentFile` [apps/api/src/scenarios/scenarios.service.ts, uploadDocument] — la story demandait explicitement de répliquer "même pattern multer/disque local que l'upload de portrait", qui inclut un nettoyage du fichier écrit si l'insertion en base échoue (`updatePortrait` catch + `unlinkPortraitFile`) ; ce nettoyage manque ici.
- [x] [Review][Patch] `scenarioId` fourni en chaîne vide traité silencieusement comme absent [apps/api/src/scenarios/scenarios.service.ts, uploadDocument] — `if (scenarioId)` est faux pour `''`, donc un champ multipart `scenarioId=""` bascule silencieusement en upload bibliothèque au lieu d'être rejeté comme valeur malformée.
- [x] [Review][Defer] Détection PDF par simple signature magique `%PDF-`, contournable par un fichier polyglotte [apps/api/src/scenarios/document-mime.util.ts] — déferré : même limitation déjà acceptée dans `image-mime.util.ts` (sniffing par octets magiques, pas de validation structurelle complète) — pas une régression propre à cette story.
- [x] [Review][Defer] Heuristique `text/plain` (absence de NUL) accepte un contenu large (HTML/SVG...) [apps/api/src/scenarios/document-mime.util.ts] — déferré : déjà documenté comme `[ASSUMPTION]` explicite dans la story ; risque atténué par `Content-Disposition: attachment` qui force le téléchargement plutôt qu'un rendu inline dans le navigateur.
- [x] [Review][Defer] Race TOCTOU : le statut `PASSE` est vérifié une fois puis l'écriture a lieu sans re-vérification/transaction [apps/api/src/scenarios/scenarios.service.ts, uploadDocument] — déferré, même raisonnement que la Story 7.1 : aucun autre chemin ne mute `status` avant les Stories 7.5/7.6, qui prévoient déjà un verrou dédié (AD-10).
- [x] [Review][Defer] `toDocumentDto(document: any)` sacrifie la sécurité de type [apps/api/src/scenarios/scenarios.service.ts] — déferré, même pattern déjà accepté pour `toDto()` en Story 7.1.
- [x] [Review][Defer] Absence d'en-tête `X-Content-Type-Options: nosniff` sur le téléchargement [apps/api/src/scenarios/scenarios.controller.ts, downloadDocument] — déferré : durcissement non couvert par une AC/architecture, bénéfice marginal étant donné que `Content-Disposition: attachment` empêche déjà le rendu inline.
- [x] [Review][Defer] Un PDF tronqué (<5 octets) ou précédé d'un BOM tombe dans la branche texte, mal classé silencieusement [apps/api/src/scenarios/document-mime.util.ts] — déferré, même limitation que l'heuristique texte déjà documentée comme `[ASSUMPTION]`.

**Rejetés comme bruit ou déjà couverts (5)** : `readDocumentFile` traite toute erreur disque comme "introuvable" sans logging (identique au pattern déjà établi de `readPortraitFile`) ; double validation de taille Multer (`limits` + `ParseFilePipe`) redondante mais explicitement répliquée depuis le pattern portrait sur instruction de la story ; absence de re-vérification que la Partie existe encore au moment de l'écriture (même limitation que partout ailleurs dans le code base, ex. `ScenariosService.create()`) ; regex de nom de fichier insensible à la casse alors que l'écriture ne génère que du minuscule (chemin de code mort, non atteignable via ce diff) ; reformatage cosmétique des DTOs `create-scenario.dto.ts`/`update-scenario.dto.ts` (sortie de l'auto-formatter du projet, aucun changement fonctionnel).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Refactor `UPLOADS_ROOT` (Task 1) sans régression : `portrait-storage.util.spec.ts` (8/8) toujours vert après extraction vers `common/uploads-root.ts`.
- Aucune migration Prisma nécessaire — le modèle `ScenarioDocument` existait déjà depuis la Story 7.1.
- Test HTTP réel (`supertest`) confirme le pipeline Multer réel : upload >5 Mo → 413, PDF valide ≤5 Mo → 201, conforme à la résolution 413 documentée dans Dev Notes (AC2 codait "(400)" dans epics.md mais le pattern portrait établi répond 413 — choix assumé et déjà tranché dans la story).
- `pnpm lint` : nouvelles occurrences `@typescript-eslint/no-unsafe-*` sur `toDocumentDto(document: any)` — même pattern déjà accepté comme dette pré-existante en Story 7.1 (`toDto(scenario: any)`), pas une régression propre à cette story.
- Suite complète API : 29 suites / 467 tests, tous passants (aucune régression).

### Completion Notes List

- `UPLOADS_ROOT` extrait vers `apps/api/src/common/uploads-root.ts`, réutilisé par `portrait-storage.util.ts` (Story 4.5) et le nouveau `document-storage.util.ts` — évite une dépendance `scenarios/` → `characters/`.
- `document-mime.util.ts` : détection PDF par signature magique `%PDF-`, détection texte par heuristique absence de byte NUL (documentée comme `[ASSUMPTION]`, non spécifiée par le PRD/architecture).
- `ScenariosService` étendu avec 4 méthodes : `uploadDocument` (MJ seul, valide l'appartenance du `scenarioId` à la Partie, rejette sur un scénario `PASSE` — exigence croisée héritée de la Story 7.1 AC5), `listDocuments` (combine scénario + bibliothèque, AC4), `listLibraryDocuments` (bibliothèque seule, comble le vide identifié en revue de story pour les Parties sans scénario créé), `getDocumentFile` (téléchargement, aucun filtre de statut — AD-6).
- 4 nouveaux endpoints : `POST parties/:id/documents`, `GET scenarios/:id/documents`, `GET parties/:id/documents`, `GET documents/:id`.
- 6 acceptance criteria couvertes et testées : AC1 (upload scénario-scopé), AC2 (413 pour >5 Mo, résolution documentée), AC3 (upload bibliothèque `scenarioId: null`), AC4 (liste combinée), AC5 (`scenarioId: null` suffit pour le tag frontend, Story 7.4), AC6 (téléchargement sans filtre de statut, AD-6).
- Hors scope respecté : aucune suppression de document, aucun rendu frontend, aucune migration Prisma.
- 467/467 tests passent (suite API complète), aucune régression.
- Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 0 violation d'AC, 4 patchs appliqués (échappement `originalName` dans `Content-Disposition`, validation UUID de `scenarioId`, nettoyage fichier orphelin sur échec Prisma, rejet explicite d'un `scenarioId` en chaîne vide), 6 items différés documentés dans `deferred-work.md`. 473/473 tests passants après correctifs.

### File List

- `apps/api/src/common/uploads-root.ts` (nouveau)
- `apps/api/src/characters/portrait-storage.util.ts` (modifié — importe `UPLOADS_ROOT` depuis `common/`)
- `apps/api/src/scenarios/document-mime.util.ts` (nouveau)
- `apps/api/src/scenarios/document-mime.util.spec.ts` (nouveau)
- `apps/api/src/scenarios/document-storage.util.ts` (nouveau, modifié en revue — `deleteDocumentFile`)
- `apps/api/src/scenarios/document-storage.util.spec.ts` (nouveau, étendu en revue)
- `packages/shared/src/index.ts` (modifié — `ScenarioDocumentDto`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `uploadDocument`, `listDocuments`, `listLibraryDocuments`, `getDocumentFile`, `toDocumentDto` ; validation UUID + nettoyage fichier orphelin ajoutés en revue)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — tests des 4 nouvelles méthodes, étendu en revue)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — 4 nouveaux endpoints, config Multer ; échappement `originalName` ajouté en revue)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — tests de routage + pipeline HTTP réel multer, étendu en revue)

## Change Log

- 2026-07-12 : Implémentation complète de la Story 7.2 (upload/liste/téléchargement de documents de scénario et bibliothèque de Partie, 6 ACs couvertes par tests, 467/467 tests passants).
- 2026-07-12 : Revue de code — 4 patchs appliqués (sécurité en-tête HTTP, validation UUID, nettoyage fichier orphelin, rejet chaîne vide), 473/473 tests passants après correctifs.
