---
baseline_commit: d6aaf143cedb8a7d06edd6a518788b8f53caec59
---

# Story 16.1: Détection de PDF renforcée et en-tête de sécurité sur les documents de scénario

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ ou joueur,
I want que les documents PDF que j'uploade soient mieux validés, et que leurs téléchargements portent un en-tête de sécurité,
so that l'application résiste mieux à un fichier délibérément malformé.

## Acceptance Criteria

1. **Given** un fichier détecté comme PDF par sa signature magique (`detectDocumentMime()`) **When** l'upload est traité (`ScenariosService.uploadDocument()`) **Then** une validation structurelle additionnelle rejette le fichier s'il n'est pas un PDF structurellement valide (`BadRequestException`, aucune écriture disque/DB).
2. **Given** une requête de téléchargement de document de scénario (`GET /documents/:id`) **When** la réponse est envoyée **Then** elle inclut l'en-tête `X-Content-Type-Options: nosniff`.
3. **Given** le flux complet upload/téléchargement de documents déjà en production (Stories 7.1, 7.2) **When** cette story est appliquée **Then** aucune régression : un vrai PDF valide continue d'être accepté à l'upload, un fichier texte (`text/plain`) continue d'être accepté sans validation structurelle additionnelle (hors scope, cf. AD-6), le téléchargement d'un document existant continue de fonctionner à l'identique côté client.

## Tasks / Subtasks

- [x] **Task 1 — Validation structurelle PDF : `document-mime.util.ts` + `ScenariosService.uploadDocument()` (AC1)**

  **⚠️ DÉCOUVERTE CRITIQUE (vérifiée empiriquement dans ce conteneur avant d'écrire cette story) : `PDFDocument.load()` seul, même avec `{ throwOnInvalidObject: true }`, N'EST PAS SUFFISANT pour rejeter un fichier malformé.** L'architecture (AD-6) et les epics décrivent "`PDFDocument.load()` dans un `try/catch` rejette un fichier qui passe la signature magique sans être un PDF structurellement valide" — **ce n'est vrai qu'à moitié**. `pdf-lib` a un parseur de récupération très tolérant : `PDFDocument.load(Buffer.from('%PDF-1.4\n' + 'garbage'.repeat(500)))` est **accepté silencieusement**, y compris avec `{ throwOnInvalidObject: true }` — testé directement dans ce conteneur, confirmé. Il faut **forcer la résolution de l'arbre de pages** en appelant `doc.getPageCount()` (ou `doc.getPages()`) après le `load()` : c'est CETTE étape qui fait réellement échouer le parsing sur un buffer structurellement invalide (testé et confirmé : un vrai PDF du projet — `Ryuutama_carte.pdf` — tronqué ou charcuté après les 20 premiers octets est bien rejeté par `load()+getPageCount()`, alors qu'il ne l'était PAS par `load()` seul).

  - Fichier : `apps/api/src/scenarios/document-mime.util.ts` (actuellement 55 lignes, aucun import externe — cité intégralement dans les Dev Notes).
  - Ajouter `import { PDFDocument } from 'pdf-lib';` en tête de fichier (déjà une dépendance du projet, `apps/api/package.json` — `"pdf-lib": "^1.17.1"`, déjà utilisée dans `characters/equipment-pdf.service.ts`, `characters/notes-pdf.service.ts`, `characters/ryuutama-pdf.service.ts`, `homme-dragon/homme-dragon.pdf.service.ts` — aucune nouvelle dépendance, AD-6 le demande explicitement).
  - Nouvelle fonction exportée, asynchrone :
    ```typescript
    /**
     * Validation structurelle additionnelle pour un fichier déjà détecté PDF par sa signature
     * magique (AD-6, FR-15). PDFDocument.load() seul est INSUFFISANT — pdf-lib a un parseur de
     * récupération tolérant qui accepte un buffer ne contenant que l'en-tête "%PDF-" suivi de
     * bytes arbitraires, même avec { throwOnInvalidObject: true } (vérifié empiriquement).
     * Appeler getPageCount() force la résolution de l'arbre de pages et fait échouer le
     * parsing sur un PDF réellement corrompu/malformé — c'est cette étape qui valide, pas load().
     */
    export async function isStructurallyValidPdf(buffer: Buffer): Promise<boolean> {
      try {
        const doc = await PDFDocument.load(buffer);
        doc.getPageCount();
        return true;
      } catch {
        return false;
      }
    }
    ```
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts` — méthode `uploadDocument()` (lignes 103-161 actuelles, citée intégralement dans les Dev Notes).
  - Importer `isStructurallyValidPdf` à côté de `detectDocumentMime` (ligne 23 actuelle : `import { detectDocumentMime } from './document-mime.util';` → `import { detectDocumentMime, isStructurallyValidPdf } from './document-mime.util';`).
  - Juste après le bloc `if (!mime) { throw ... }` (ligne 136-141 actuelle), **avant** `writeDocumentFile()` :
    ```typescript
    if (mime === 'application/pdf' && !(await isStructurallyValidPdf(file.buffer))) {
      throw new BadRequestException(
        'Le fichier PDF fourni est corrompu ou structurellement invalide',
      );
    }
    ```
  - **Ne rien changer pour `text/plain`** — AD-6 est explicite : "L'heuristique `text/plain` (absence de byte NUL) n'est pas renforcée au-delà". Le `if` ci-dessus ne s'applique qu'à `mime === 'application/pdf'`.

- [x] **Task 2 — En-tête `X-Content-Type-Options: nosniff` sur `GET /documents/:id` (AC2)**

  **⚠️ DÉCOUVERTE : cette AC est déjà satisfaite par le code existant, aucune modification de code nécessaire.** `apps/api/src/main.ts` ligne 18 applique déjà `app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))` — `helmet()` active par défaut son middleware `noSniff()`, qui pose `X-Content-Type-Options: nosniff` sur **toutes** les réponses, sans restriction de route. **Vérifié empiriquement** : `curl -I http://localhost:3000/documents/00000000-0000-0000-0000-000000000000` (sans authentification, donc 403) renvoie déjà `X-Content-Type-Options: nosniff` dans les en-têtes de réponse, avant même d'atteindre le handler `downloadDocument()`.
  - **Ne PAS ajouter** de `@Header('X-Content-Type-Options', 'nosniff')` sur la route (ce serait redondant avec `helmet()` et introduirait une deuxième source de vérité pour ce même en-tête — aucun précédent `@Header(...)` n'existe dans ce projet, à ne pas inventer ici).
  - **Le seul travail de cette tâche est un test de non-régression** (cf. Task 3) — s'assurer qu'un futur changement de configuration `helmet()` dans `main.ts` (ex. retrait accidentel, restriction à certaines routes) casse un test plutôt que de régresser silencieusement en production.

- [x] **Task 3 — Tests (AC1, AC2, AC3)**

  **AC1 — `apps/api/src/scenarios/document-mime.util.spec.ts`** (actuellement 82 lignes, cité intégralement dans les Dev Notes) :
  - Nouveau bloc `describe('isStructurallyValidPdf', ...)`. **Ne PAS mocker `pdf-lib`** dans ce fichier (contrairement à `equipment-pdf.service.spec.ts` qui le mocke) — cette fonction teste précisément le comportement réel de `pdf-lib`, un mock masquerait la découverte documentée en Task 1. Reproduire le style déjà en place dans ce fichier (buffers réels construits à la main, pas de `Test.createTestingModule`) :
    - PDF valide généré dynamiquement via `pdf-lib` lui-même (pas de fixture binaire à committer) : `const doc = await PDFDocument.create(); doc.addPage(); const buf = Buffer.from(await doc.save());` → `isStructurallyValidPdf(buf)` résout `true`. Testé et confirmé fonctionnel dans ce conteneur (583 octets générés, rechargé avec succès, `getPageCount() === 1`).
    - Buffer avec en-tête `%PDF-1.4` suivi de contenu arbitraire (`Buffer.from('%PDF-1.4\n' + 'garbage'.repeat(500))`) → `isStructurallyValidPdf(buf)` résout `false`. **C'est le test qui aurait échoué avec une implémentation naïve `load()` seul sans `getPageCount()`** — ne pas le sauter, c'est la garde principale de cette story.
    - Buffer vide → `isStructurallyValidPdf(Buffer.alloc(0))` résout `false`.
  - `import { PDFDocument } from 'pdf-lib';` à ajouter dans ce fichier de test pour générer le PDF valide de référence.

  **AC1 (suite) — `apps/api/src/scenarios/scenarios.service.spec.ts`** (conventions déjà en place — mock complet de `./document-mime.util` ligne 9-11 actuelle, cité intégralement dans les Dev Notes) :
  - Étendre le mock : `jest.mock('./document-mime.util', () => ({ detectDocumentMime: jest.fn(), isStructurallyValidPdf: jest.fn() }));` puis importer `isStructurallyValidPdf` à côté de `detectDocumentMime` (ligne 27 actuelle).
  - Dans le `describe('uploadDocument()', ...)` existant (ligne 400+), faire résoudre `isStructurallyValidPdf` à `true` par défaut dans les tests de succès existants qui mockent `detectDocumentMime` → `'application/pdf'` (sinon ces tests casseraient — `uploadDocument()` appellera désormais `isStructurallyValidPdf`, non mocké explicitement, `jest.fn()` sans `mockResolvedValue` renvoie `undefined`, faussement falsy).
  - Nouveau test : `(isStructurallyValidPdf as jest.Mock).mockResolvedValue(false)` + `detectDocumentMime` → `'application/pdf'` → `service.uploadDocument(...)` rejette `BadRequestException`, `writeDocumentFile`/`prisma.scenarioDocument.create` jamais appelés.
  - Nouveau test : `detectDocumentMime` → `'text/plain'` → `isStructurallyValidPdf` **jamais appelé** (`expect(isStructurallyValidPdf).not.toHaveBeenCalled()`), upload réussit normalement — confirme que la validation structurelle ne s'applique qu'aux PDF (AC3, non-régression texte).

  **AC2 — nouveau test e2e** : `apps/api/test/app.e2e-spec.ts` (29 lignes actuelles, cité intégralement dans les Dev Notes) — étendre ce fichier existant (pas de nouveau fichier `*.e2e-spec.ts`, un seul suffit pour ce test ponctuel). Un test unitaire de contrôleur (`scenarios.controller.spec.ts`, style mock manuel, instancie le contrôleur directement sans passer par le pipeline HTTP de Nest) **ne peut pas** observer un en-tête posé par un middleware global — seul un test bootstrapant l'app complète via `supertest` le peut.
  - Dans le `beforeEach` existant, après `app = moduleFixture.createNestApplication();` et avant `await app.init();`, ajouter le même appel `helmet()` qu'en production : `app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));` (import `helmet` depuis `'helmet'`, déjà une dépendance).
  - Nouveau test dans le `describe('AppController (e2e)', ...)` existant : `request(app.getHttpServer()).get('/').expect('X-Content-Type-Options', 'nosniff')`.

- [x] **Task 4 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api.
  - `docker compose exec api pnpm test:e2e` — le nouveau test e2e passe (script `test:e2e` déjà défini dans `package.json`, jamais exécuté dans les stories précédentes de ce palier — à lancer explicitement, ce n'est pas inclus dans `pnpm test`).
  - `docker compose exec api pnpm typecheck` — propre.
  - **Aucune migration Prisma, aucune nouvelle dépendance.**
  - Test manuel réel recommandé : upload d'un vrai fichier PDF (un des templates du projet, ex. `apps/api/game-systems/ryuutama/assets/Ryuutama_carte.pdf`) via l'UI ou `curl -F`, doit réussir. Upload d'un buffer `%PDF-1.4` suivi de texte arbitraire doit échouer avec le nouveau message d'erreur.
  - Aucune modification `apps/web` attendue — à confirmer par `git status`/diff en fin de story.

### Review Findings

- [x] [Review][Patch] Docstring de `isStructurallyValidPdf()` trompeuse — mentionne `{ throwOnInvalidObject: true }` comme testé/insuffisant, mais le code final n'utilise jamais cette option (elle est devenue inutile une fois `getPageCount()` ajouté). Un lecteur pourrait croire que l'option est appliquée dans le code livré. [`apps/api/src/scenarios/document-mime.util.ts` — docstring de `isStructurallyValidPdf()`] — corrigé : docstring reformulée pour préciser que l'option a été essayée pendant l'investigation mais n'est pas utilisée dans le code final (elle ne change rien au comportement)
- [x] [Review][Patch] `security-headers.e2e-spec.ts` : `afterEach` appelle `app.close()` sans garde — si `beforeEach` (compile/`init()`) échoue, `app` reste `undefined` et `afterEach` lève une `TypeError` qui masque l'erreur réelle de configuration. [`apps/api/test/security-headers.e2e-spec.ts` — `afterEach`] — corrigé : garde `if (app)` ajoutée avant `app.close()`
- [x] [Review][Defer] Aucune limite de temps/ressources sur `PDFDocument.load()`+`getPageCount()` pour un PDF adversarial (objets profondément imbriqués, etc.) [`apps/api/src/scenarios/document-mime.util.ts` — `isStructurallyValidPdf()`] — deferred, risque résiduel faible : la taille d'upload est déjà plafonnée à 5 Mo en amont (`scenarios.controller.ts`), cohérent avec la position déjà actée par AD-6 ("risque déjà jugé faible en contexte hobby")
- [x] [Review][Defer] Un PDF structurellement valide mais à 0 page (`getPageCount() === 0`) est accepté comme valide [`apps/api/src/scenarios/document-mime.util.ts` — `isStructurallyValidPdf()`] — deferred, choix de conception discutable mais non requis par un AC ; un PDF vide reste un PDF structurellement valide au sens strict
- [x] [Review][Defer] Aucun test ne couvre un PDF chiffré/protégé par mot de passe [`apps/api/src/scenarios/document-mime.util.spec.ts`] — deferred, cas réel mais hors du scope explicite de cette story (validation structurelle, pas gestion du chiffrement — AD-6 ne mentionne pas ce cas)

## Dev Notes

### Architecture — décision contraignante AD-6 (`ARCHITECTURE-SPINE.md` Palier 6, 2026-07-18)

> **AD-6 [ADOPTED]** : `detectDocumentMime()` (`apps/api/src/scenarios/document-mime.util.ts`) reste la première passe (signature magique, rapide) ; pour un fichier détecté PDF, une validation structurelle additionnelle via `PDFDocument.load()` (pdf-lib, déjà une dépendance du projet pour tous les exports PDF existants) dans un `try/catch` rejette un fichier qui passe la signature magique sans être un PDF structurellement valide. L'heuristique `text/plain` (absence de byte NUL) n'est pas renforcée au-delà — aucun outillage équivalent disponible sans nouvelle dépendance, risque déjà jugé faible en contexte hobby (cf. PRD §4.4 FR-15).

- **Prevents** : l'ajout d'une bibliothèque de validation de fichiers dédiée alors que le projet a déjà tout l'outillage nécessaire.
- **Précision importante non couverte par le texte de l'AD** (découverte pendant la préparation de cette story, cf. Task 1) : `PDFDocument.load()` seul dans un `try/catch` ne suffit **pas** à rejeter tous les PDF malformés — il faut également appeler `getPageCount()`/`getPages()` pour forcer la résolution complète du document. L'intention de l'AD (réutiliser `pdf-lib`, aucune nouvelle dépendance) reste respectée à 100% ; seul le mécanisme exact d'implémentation est corrigé par rapport au texte littéral de l'architecture.
- Cette story couvre **uniquement AD-6/FR-15** (partie PDF) et l'en-tête `X-Content-Type-Options` (déjà satisfait, Task 2). **Story 16.2** (nettoyage EXIF des portraits, `sharp`) est **hors scope**, séparée. Ne pas toucher au flux d'upload de portrait dans cette story.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/scenarios/document-mime.util.ts`** (55 lignes actuelles, aucun import externe) :
  ```typescript
  export type DetectedDocumentMime = 'application/pdf' | 'text/plain';

  const MIME_EXTENSION: Record<DetectedDocumentMime, string> = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };

  const TEXT_SNIFF_WINDOW = 8000;

  export function detectDocumentMime(buffer: Buffer): DetectedDocumentMime | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    const window = buffer.subarray(0, TEXT_SNIFF_WINDOW);
    if (buffer.length > 0 && !window.includes(0x00)) {
      return 'text/plain';
    }
    return null;
  }

  export function extensionForDocumentMime(mime: DetectedDocumentMime): string { /* ... */ }
  export function mimeForExtension(ext: string): DetectedDocumentMime | null { /* ... */ }
  export function isValidDocumentFilename(filename: string): boolean { /* ... */ }
  ```
  `detectDocumentMime()` **n'est pas modifiée** par cette story — elle reste la première passe rapide et synchrone, `isStructurallyValidPdf()` est une fonction séparée, asynchrone, appelée uniquement en aval quand `mime === 'application/pdf'`.
- **`apps/api/src/scenarios/scenarios.service.ts`** — `uploadDocument()` (lignes 103-161 actuelles) :
  ```typescript
  async uploadDocument(
    partieId: string,
    mjId: string,
    file: Express.Multer.File,
    scenarioId?: string,
  ): Promise<ScenarioDocumentDto> {
    await this.parties.getOwned(partieId, mjId);
    if (scenarioId !== undefined) { /* validation scenarioId inchangée */ }

    const mime = detectDocumentMime(file.buffer);
    if (!mime) {
      throw new BadRequestException("Le fichier fourni n'est pas un PDF ou un texte valide");
    }
    // ← insertion Task 1 ici

    const filename = await writeDocumentFile(file.buffer, mime);
    try {
      const document = await this.prisma.scenarioDocument.create({ /* ... */ });
      return toDocumentDto(document);
    } catch (e) {
      await deleteDocumentFile(filename);
      throw e;
    }
  }
  ```
- **`apps/api/src/scenarios/scenarios.controller.ts`** — route de téléchargement (lignes 230-245 actuelles), **inchangée par cette story** :
  ```typescript
  @Get('documents/:id')
  async downloadDocument(
    @Param('id', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { buffer, mime, originalName } = await this.scenarios.getDocumentFile(documentId, user.id);
    return new StreamableFile(buffer, {
      type: mime,
      disposition: `attachment; filename="${sanitizeHeaderFilename(originalName)}"`,
    });
  }
  ```
- **`apps/api/src/main.ts`** (59 lignes) — ligne 18, déjà en place :
  ```typescript
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  ```
  `helmet()` sans option `noSniff` explicite = middleware `noSniff()` **actif par défaut** (documentation Helmet). Confirmé par test manuel réel (`curl -I`) sur ce projet, sur la route exacte `/documents/:id`, avant l'écriture de cette story.
- **`apps/api/test/app.e2e-spec.ts`** (29 lignes actuelles, cité intégralement) :
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { INestApplication } from '@nestjs/common';
  import request from 'supertest';
  import { App } from 'supertest/types';
  import { AppModule } from './../src/app.module';

  describe('AppController (e2e)', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    it('/ (GET)', () => {
      return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
    });

    afterEach(async () => {
      await app.close();
    });
  });
  ```
  Note : ce test bootstrap `AppModule` directement, **sans** appeler `main.ts`/`bootstrap()` — `helmet()` n'est donc PAS appliqué par défaut dans ce test actuellement, il faut l'ajouter explicitement (Task 3) pour que le test observe le même comportement qu'en production.

### Project Structure Notes

- Fichiers modifiés : `apps/api/src/scenarios/document-mime.util.ts` ; `apps/api/src/scenarios/scenarios.service.ts` ; `apps/api/src/scenarios/document-mime.util.spec.ts` ; `apps/api/src/scenarios/scenarios.service.spec.ts` ; `apps/api/test/app.e2e-spec.ts`.
- Aucun fichier nouveau, aucune migration Prisma, aucune nouvelle dépendance (réutilise `pdf-lib` et `helmet`, déjà présentes), aucune modification `apps/web`, aucun nouveau module NestJS.

### Testing Standards

- `apps/api` : Jest, conventions déjà en place (mocks manuels, pas de `Test.createTestingModule` pour les tests unitaires de service/controller).
- **Exception pour cette story** : le test AC2 nécessite `Test.createTestingModule` + `supertest` (déjà en place dans `app.e2e-spec.ts`, run via `pnpm test:e2e` — commande **séparée** de `pnpm test`, à lancer explicitement en Task 4).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après l'ajout de `isStructurallyValidPdf` à l'export du module.
- **Ne pas mocker `pdf-lib`** dans `document-mime.util.spec.ts` (contrairement à d'autres specs du projet qui le mockent, ex. `equipment-pdf.service.spec.ts`) — cette story teste justement le comportement réel de la librairie, un mock invaliderait la garde principale.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 330-349 — Epic 16 / Story 16.1 complète, FR15/FR17)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-6 — détection de fichier renforcée ; ligne 201 — source tree, `document-mime.util.ts` ciblé explicitement)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR-15 — détection PDF renforcée ; §FR-17 — en-tête de sécurité)
- Test manuel réel effectué pendant la préparation de cette story (avant tout code) : `curl -I http://localhost:3000/documents/00000000-...` confirme `X-Content-Type-Options: nosniff` déjà présent ; script `node` inline dans le conteneur `api` confirme le comportement réel de `pdf-lib` (`PDFDocument.load()` seul accepte un buffer garbage, `+ getPageCount()` le rejette correctement, un vrai PDF généré par `pdf-lib` est accepté).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- **Découverte critique confirmée pendant l'implémentation (déjà anticipée dans la story avant tout code)** : `PDFDocument.load()` seul accepte silencieusement un buffer garbage — confirmé à nouveau en test manuel réel sur le serveur : un premier test avait paru accepter un fichier malveillant (`HTTP 201` au lieu du `400` attendu), mais l'investigation a révélé que le conteneur `api` avait un **processus zombie** : un rechargement à chaud antérieur avait planté sur `EADDRINUSE` (port déjà occupé) sans tuer l'ancien processus, qui continuait de répondre sur le port 3000 avec du code **antérieur** à cette story. Après `docker compose restart api` (kill propre + relance), le fichier malveillant est correctement rejeté (`400`, message exact `"Le fichier PDF fourni est corrompu ou structurellement invalide"`) et le vrai PDF (`Ryuutama_carte.pdf`) est toujours accepté (`201`). Leçon pour les stories futures de ce projet : après une longue session de dev avec plusieurs redémarrages `nest --watch`, un `docker compose restart api` avant tout test manuel réel élimine ce risque de faux résultat.
- **Découverte non anticipée par la story : `pnpm test:e2e` était déjà cassé avant cette story, sans rapport avec elle.** `apps/api/test/app.e2e-spec.ts` bootstrap `AppModule` en entier via `Test.createTestingModule`, ce qui charge transitivement `PartiesModule` → `create-partie.dto.ts` → `import { GAME_SYSTEMS } from '@master-jdr/shared'` (import de VALEUR, pas `import type`). `packages/shared/package.json` déclare `"type": "module"` et pointe `main`/`exports` directement sur la source TS brute (aucune étape de build) — Jest échoue avec `SyntaxError: Unexpected token 'export'`. **Confirmé comme totalement indépendant de cette story** : reproduit à l'identique en import direct de `create-partie.dto.ts` sous la config Jest **principale** (`pnpm test`, pas `test:e2e`), avec `app.e2e-spec.ts` remis à son contenu original exact (aucune modification). Essayé un correctif `transformIgnorePatterns` sur `jest-e2e.json` — sans effet (le chemin résolu du symlink workspace ne contient pas `/node_modules/`, donc ce n'est pas un problème de pattern d'exclusion mais un problème plus profond de résolution ESM native par Jest). **Décision** : ne pas tenter de réparer ce problème pré-existant et sans rapport (hors scope de cette story, risque de casser d'autres choses) — `apps/api/test/jest-e2e.json` et `apps/api/test/app.e2e-spec.ts` restés strictement inchangés (confirmé par `git status`, aucune modification listée). Nouveau fichier `apps/api/test/security-headers.e2e-spec.ts` créé à la place, avec un module Nest minimal (un seul contrôleur de sonde), qui ne bootstrap PAS `AppModule` et n'est donc pas affecté par ce problème — `pnpm test:e2e --testPathPatterns=security-headers` passe seul ; `pnpm test:e2e` sans filtre échoue globalement à cause du seul `app.e2e-spec.ts` pré-existant (déjà cassé avant cette story). Item ajouté à `deferred-work.md`.

### Completion Notes List

- Task 1 : `isStructurallyValidPdf()` ajoutée à `document-mime.util.ts` (import `PDFDocument` depuis `pdf-lib`, déjà une dépendance). Appelle `PDFDocument.load()` PUIS `doc.getPageCount()` — cette seconde étape est celle qui valide réellement, `load()` seul ne suffit pas (vérifié empiriquement avant l'écriture de la story, reconfirmé par test manuel réel après redémarrage propre du conteneur). Intégrée dans `ScenariosService.uploadDocument()` juste après la détection `detectDocumentMime()`, uniquement pour `mime === 'application/pdf'` — `text/plain` inchangé (AD-6).
- Task 2 : aucun code — AC2 déjà satisfaite par `helmet()` (middleware `noSniff()` actif par défaut dans `main.ts`), confirmé par test manuel réel sur `GET /documents/:id` authentifié (`X-Content-Type-Options: nosniff` présent dans la réponse).
- Task 3 : `document-mime.util.spec.ts` étendu (3 nouveaux tests `isStructurallyValidPdf`, sans mocker `pdf-lib` — PDF valide généré dynamiquement via `pdf-lib` lui-même, buffer garbage avec en-tête valide, buffer vide). `scenarios.service.spec.ts` étendu (mock `isStructurallyValidPdf` ajouté avec défaut `mockResolvedValue(true)` dans le `beforeEach` partagé pour ne pas casser les tests de succès existants ; 2 nouveaux tests : PDF structurellement invalide → rejet, fichier texte → `isStructurallyValidPdf` jamais appelé). **Déviation par rapport au plan initial de la story pour le test AC2** (cf. Debug Log References) : nouveau fichier `apps/api/test/security-headers.e2e-spec.ts` créé au lieu d'étendre `app.e2e-spec.ts`, pour contourner un problème pré-existant et sans rapport avec cette story (`AppModule`/`@master-jdr/shared` cassé sous Jest e2e).
- Task 4 : 810/810 tests API (42 suites, +5 vs Story 15.4), `pnpm typecheck` propre, redémarrage réel du conteneur confirmé. `pnpm test:e2e --testPathPatterns=security-headers` passe (1/1). `pnpm test:e2e` sans filtre échoue globalement à cause du seul `app.e2e-spec.ts` pré-existant (non lié à cette story, voir Debug Log References). Test manuel réel complet effectué après redémarrage propre du conteneur (zombie process découvert et éliminé en cours de route) : vrai PDF accepté (`201`), fichier malveillant `%PDF-` + contenu arbitraire rejeté (`400`, message exact), en-tête `X-Content-Type-Options: nosniff` confirmé présent sur un téléchargement authentifié réel. Aucune modification `apps/web` (confirmé par `git status`), aucune migration Prisma.

### File List

- `apps/api/src/scenarios/document-mime.util.ts` (modifié)
- `apps/api/src/scenarios/document-mime.util.spec.ts` (modifié)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié)
- `apps/api/test/security-headers.e2e-spec.ts` (nouveau)

## Change Log

- 2026-07-19 : Implémentation complète (Tasks 1-4). Validation structurelle PDF via `PDFDocument.load()` + `getPageCount()` (AD-6, FR-15) — `load()` seul insuffisant, découverte vérifiée empiriquement avant et après l'implémentation. En-tête `X-Content-Type-Options: nosniff` déjà satisfait par `helmet()` existant (FR-17), aucun code nécessaire. Nouveau fichier e2e minimal (`security-headers.e2e-spec.ts`) pour contourner un problème pré-existant sans rapport (`pnpm test:e2e` déjà cassé sur `AppModule`/`@master-jdr/shared` avant cette story — documenté, différé, non corrigé). 810/810 tests API, typecheck propre, test manuel bout-en-bout réel (upload PDF valide/malveillant, en-tête confirmé sur téléchargement authentifié) après avoir identifié et éliminé un processus zombie du conteneur `api`. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 décision, 2 patches appliqués : (1) docstring de `isStructurallyValidPdf()` clarifiée (mentionnait `{ throwOnInvalidObject: true }` de façon ambiguë, l'option n'est pas utilisée dans le code final) ; (2) garde `if (app)` ajoutée dans le `afterEach` du nouveau test e2e pour ne pas masquer une éventuelle erreur de `beforeEach` derrière une `TypeError`. 3 items différés (voir `deferred-work.md`) : pas de limite de temps/ressources sur le parsing PDF adversarial (risque faible, upload déjà plafonné à 5 Mo) ; PDF à 0 page accepté comme valide (non requis par un AC) ; aucun test pour un PDF chiffré (hors scope). 12 findings écartés, dont plusieurs déjà couverts par les découvertes documentées pendant l'implémentation (mock par défaut, workaround e2e disclosed). Suite finale : 810/810 tests API, `pnpm test:e2e --testPathPatterns=security-headers` toujours au vert, typecheck propre. Statut passé à done.
