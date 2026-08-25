---
baseline_commit: ea65a4b7ab2b8717602001029106993f11bd1b3f
---

# Story 16.2: Nettoyage des métadonnées EXIF des portraits uploadés

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que mon portrait uploadé ne conserve pas de métadonnées EXIF (position GPS, etc.),
so that je ne diffuse pas involontairement des informations personnelles en partageant une fiche de personnage.

## Acceptance Criteria

1. **Given** un portrait avec des métadonnées EXIF (GPS ou autre) **When** il est uploadé (`CharacterService.updatePortrait()`) **Then** aucune métadonnée EXIF n'est récupérable sur le fichier stocké par l'application (nettoyage via `sharp`).
2. **Given** une photo prise en mode portrait sur mobile, dont l'orientation visuelle correcte dépend du tag EXIF `Orientation` **When** elle est uploadée **Then** l'image stockée reste visuellement orientée correctement (la rotation est appliquée aux pixels avant que le tag ne soit supprimé — ne pas simplement jeter le tag sans en tenir compte).
3. **Given** le flux complet upload/affichage/export PDF de portrait déjà en production (Stories 4.5, 4.6, 4.7) **When** cette story est appliquée **Then** aucune régression : le format de l'image stockée reste identique au format uploadé (JPEG reste JPEG, PNG reste PNG, WEBP reste WEBP), un fichier dont les octets magiques sont valides mais qui n'est pas réellement décodable comme image continue d'être rejeté proprement (`BadRequestException`, pas un crash), le recadrage (`portraitCropData`), l'export PDF et la suppression de portrait restent inchangés.

## Tasks / Subtasks

- [x] **Task 1 — Ajouter `sharp` comme dépendance (AC1)**
  - **Aucune version pinned dans l'architecture** (`ARCHITECTURE-SPINE.md` : "à vérifier dernière version stable au moment de l'implémentation") — **vérifié pendant la préparation de cette story : `sharp@0.35.3` est la dernière version stable**, installée et testée avec succès dans ce conteneur (build Debian bookworm x64, binaire précompilé, aucune compilation native nécessaire).
  - `docker compose exec api pnpm add sharp` dans `apps/api` (scope workspace normal, pas de flag spécial requis — testé, s'installe proprement sans étape de build).
  - Aucune autre dépendance de traitement d'image dans ce projet — `sharp` est un ajout net, pas un remplacement.

- [x] **Task 2 — `stripImageMetadata()` dans `image-mime.util.ts` (AC1, AC2, AC3)**

  **⚠️ Point technique vérifié empiriquement avant l'écriture de cette story (comportement par défaut de `sharp`, confirmé par script réel dans ce conteneur) :**
  - `sharp(buffer).toBuffer()` **sans** `.withMetadata()`/`.keepMetadata()` retire déjà TOUTES les métadonnées (EXIF, ICC, XMP, IPTC) par défaut — c'est le comportement standard de sharp, pas besoin de le forcer explicitement. **Mais** ce même comportement par défaut retire aussi le tag EXIF `Orientation`, qui détermine la rotation visuelle correcte d'une photo prise en mode portrait sur mobile — si on ne fait qu'un `sharp(buffer).toBuffer()` nu, une photo verticale correctement taguée EXIF `Orientation=6` **redeviendrait visuellement mal orientée** après nettoyage (régression UX silencieuse, pas juste une histoire de métadonnées).
  - Solution vérifiée : appeler `.autoOrient()` **avant** `.toBuffer()` — cette méthode applique la rotation dans les pixels eux-mêmes (baked-in) puis retire le tag devenu redondant. Test réel effectué dans ce conteneur : une image 8×4 taguée `Orientation=6` devient bien 4×8 en pixels après `sharp(buf).autoOrient().toBuffer()`, avec `orientation: undefined` dans les métadonnées de sortie et `format: 'jpeg'` préservé (confirme aussi AC3 : pas de conversion de format, l'entrée JPEG reste une sortie JPEG sans appel explicite à `.jpeg()`/`.toFormat()` — `sharp` préserve le format d'entrée par défaut).
  - Fichier : `apps/api/src/characters/image-mime.util.ts` (58 lignes actuelles, aucun import externe — cité intégralement dans les Dev Notes).
  - Ajouter `import sharp from 'sharp';` en tête de fichier.
  - Nouvelle fonction exportée, asynchrone :
    ```typescript
    /**
     * Nettoie les métadonnées EXIF/XMP/IPTC (position GPS notamment) d'une image avant
     * stockage (FR-16). sharp() les retire déjà par défaut au toBuffer() — mais retire aussi
     * le tag EXIF Orientation, qui détermine la rotation visuelle correcte d'une photo prise
     * en mode portrait sur mobile. autoOrient() applique cette rotation dans les pixels AVANT
     * que le tag ne soit supprimé, pour ne pas régresser visuellement les photos EXIF-orientées.
     * Préserve le format d'entrée (JPEG reste JPEG, etc.) — aucun appel à toFormat()/jpeg().
     */
    export async function stripImageMetadata(buffer: Buffer): Promise<Buffer> {
      return sharp(buffer).autoOrient().toBuffer();
    }
    ```
  - **Ne PAS appeler `.withMetadata()`/`.keepMetadata()`** — ce serait l'inverse de l'objectif de cette story (conserverait les métadonnées au lieu de les retirer).

- [x] **Task 3 — Intégration dans `CharacterService.updatePortrait()` (AC1, AC2, AC3)**
  - Fichier : `apps/api/src/characters/character.service.ts` (méthode `updatePortrait()` lignes 322-370 actuelles, citée intégralement dans les Dev Notes).
  - Importer `stripImageMetadata` à côté de `detectImageMime`/`extensionForImageMime` (ligne 46-50 actuelle).
  - Juste après le bloc `if (!mime) { throw ... }` (ligne 330-335 actuelle), **avant** `mkdir(PORTRAITS_DIR, ...)` :
    ```typescript
    let cleanedBuffer: Buffer;
    try {
      cleanedBuffer = await stripImageMetadata(file.buffer);
    } catch {
      throw new BadRequestException(
        "Le fichier fourni n'est pas une image JPEG/PNG/WEBP valide",
      );
    }
    ```
  - **Pourquoi un `try/catch` ici, alors que `detectDocumentMime`/`isStructurallyValidPdf` de la Story 16.1 utilisaient une fonction qui catchait déjà en interne** : contrairement à `isStructurallyValidPdf()` (qui renvoie `boolean`, jamais d'exception), `stripImageMetadata()` renvoie directement le buffer nettoyé ou **lève** si `sharp` ne parvient pas à décoder l'image — **vérifié empiriquement : un buffer qui ne contient que la signature magique JPEG (`FF D8 FF E0 00 10`, sans données d'image réelles derrière — exactement le buffer `JPEG_BUFFER` déjà utilisé dans `character.service.spec.ts`) fait bien lever une exception `sharp`** (`"Input buffer has corrupt header"`), alors qu'aujourd'hui (avant cette story) ce même buffer est accepté sans broncher par `detectImageMime()` (qui ne vérifie que les octets magiques, jamais la décodabilité réelle) et écrit tel quel sur disque. Sans ce `try/catch`, cette story introduirait une régression : un upload qui réussissait avant (magic bytes valides, contenu tronqué/corrompu) planterait désormais avec une exception `sharp` non gérée (500) au lieu du comportement attendu (rejet propre). Réutiliser le **même message d'erreur** que le rejet `detectImageMime` (ligne 332-334 actuelle) — la distinction "signature invalide" vs "signature valide mais indécodable" n'a aucune valeur pour l'utilisateur final.
  - Remplacer `file.buffer` par `cleanedBuffer` dans l'appel `writeFile()` (ligne 339 actuelle : `await writeFile(join(PORTRAITS_DIR, filename), file.buffer);` → `await writeFile(join(PORTRAITS_DIR, filename), cleanedBuffer);`).
  - **Aucune autre méthode de `CharacterService` n'est modifiée** — `getPortraitFile()`, `removePortrait()`, l'export PDF (`ryuutama-pdf.service.ts`/`homme-dragon.pdf.service.ts`) lisent le fichier déjà nettoyé depuis le disque, aucun changement nécessaire côté lecture.

- [x] **Task 4 — Tests (AC1, AC2, AC3)**

  **AC1/AC2/AC3 — `apps/api/src/characters/image-mime.util.spec.ts`** (84 lignes actuelles, cité intégralement dans les Dev Notes) :
  - Importer `sharp` en tête du fichier de test (utilisé pour **générer** les images de test réelles, pas pour mocker — même principe que `document-mime.util.spec.ts` en Story 16.1 : cette fonction teste le comportement réel de `sharp`, un mock invaliderait le test).
  - Nouveau bloc `describe('stripImageMetadata', ...)` avec (valeurs exactes vérifiées empiriquement dans ce conteneur, à reproduire à l'identique dans le test) :
    ```typescript
    it('supprime les métadonnées EXIF (GPS) d\'une image réelle', async () => {
      const withExif = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg()
        .withExif({
          IFD0: { Copyright: 'Test' },
          IFD3: {
            GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 3230/100',
            GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 4366/100',
          },
        })
        .toBuffer();
      const inputMeta = await sharp(withExif).metadata();
      expect(inputMeta.exif).toBeDefined(); // sanity check : l'input a bien des métadonnées

      const cleaned = await stripImageMetadata(withExif);
      const outputMeta = await sharp(cleaned).metadata();
      expect(outputMeta.exif).toBeUndefined();
    });

    it('applique la rotation EXIF aux pixels avant de retirer le tag Orientation (AC2)', async () => {
      const oriented = await sharp({
        create: { width: 8, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const cleaned = await stripImageMetadata(oriented);
      const meta = await sharp(cleaned).metadata();
      expect(meta.width).toBe(4); // dimensions inversées : la rotation 90° a bien été appliquée
      expect(meta.height).toBe(8);
      expect(meta.orientation).toBeUndefined();
    });

    it('préserve le format d\'entrée (JPEG reste JPEG, AC3)', async () => {
      const buf = await sharp({
        create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } },
      }).jpeg().toBuffer();
      const cleaned = await stripImageMetadata(buf);
      const meta = await sharp(cleaned).metadata();
      expect(meta.format).toBe('jpeg');
    });

    it('rejette (lève) un buffer avec une signature magique valide mais un contenu indécodable', async () => {
      const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      await expect(stripImageMetadata(fakeJpeg)).rejects.toThrow();
    });
    ```

  **AC1/AC3 — `apps/api/src/characters/character.service.spec.ts`** (conventions déjà en place — `JPEG_BUFFER` (ligne 51) reste une fausse signature magique de 6 octets, **jamais décodable par un vrai `sharp`**, cf. Task 3) :
  - **`image-mime.util` n'est actuellement PAS mocké dans ce fichier** (`detectImageMime` y tourne réellement, c'est une fonction pure/synchrone sans effet de bord). **`stripImageMetadata` DOIT être mocké** — appeler le vrai `sharp` sur `JPEG_BUFFER` (6 octets, signature seule) ferait échouer les 7 tests `updatePortrait()` existants (vérifié : `sharp` lève bien `"Input buffer has corrupt header"` sur ce buffer). Utiliser un mock **partiel** pour garder `detectImageMime`/`extensionForImageMime`/etc. réels :
    ```typescript
    jest.mock('./image-mime.util', () => ({
      ...jest.requireActual('./image-mime.util'),
      stripImageMetadata: jest.fn(),
    }));
    ```
    Import ensuite `stripImageMetadata` à côté des autres.
  - Dans le `beforeEach` partagé (à localiser — conventions similaires à Story 16.1), ajouter un défaut **passthrough** : `(stripImageMetadata as jest.Mock).mockImplementation((buf) => Promise.resolve(buf));` — ainsi le test existant `expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('fixed-uuid.jpg'), JPEG_BUFFER)` (ligne 536-539 actuelle) **continue de passer sans modification** (le buffer "nettoyé" par défaut est identique au buffer d'entrée dans les tests, cohérent avec le pattern déjà établi en Story 16.1 pour `isStructurallyValidPdf` → `mockResolvedValue(true)`).
  - Nouveau test : `stripImageMetadata` résout un buffer **différent** de `file.buffer` (ex. `Buffer.from('cleaned-bytes')`) → `writeFile` est appelé avec **ce buffer nettoyé**, pas le buffer brut d'origine — preuve que le nettoyage est bien branché sur le chemin d'écriture, pas juste appelé sans effet.
  - Nouveau test : `stripImageMetadata` **rejette** (`mockRejectedValue(new Error('corrupt'))`) → `updatePortrait()` rejette `BadRequestException`, `writeFile` **jamais appelé** (aucune écriture d'un fichier partiellement traité).

- [x] **Task 5 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api.
  - `docker compose exec api pnpm typecheck` — propre.
  - **Aucune migration Prisma.**
  - Redémarrage réel du conteneur `api` (`docker compose restart api`) pour confirmer que `sharp` s'installe/charge proprement (le `Dockerfile` de ce projet doit rebuild l'image si `pnpm add` a modifié `package.json`/le lockfile — vérifier si `docker compose up --build` est nécessaire plutôt qu'un simple `restart`, selon que le `node_modules` est un volume monté ou copié à l'image).
  - Test manuel réel recommandé (cohérent avec la convention établie dans ce palier) : uploader un vrai portrait JPEG contenant des métadonnées EXIF réelles (un smartphone en génère systématiquement) via l'UI, puis vérifier via `exiftool`/`identify -verbose` (si disponible dans le conteneur, sinon un petit script `sharp(...).metadata()` inline comme utilisé pendant la préparation de cette story) que le fichier stocké sur disque (`apps/api/uploads/portraits/<uuid>.jpg` ou équivalent monté) n'a plus d'EXIF. Vérifier aussi qu'une photo verticale reste visuellement bien orientée après upload (pas de rotation intempestive).
  - Aucune modification `apps/web` attendue — à confirmer par `git status`/diff en fin de story.

## Dev Notes

### Architecture — pas de décision numérotée dédiée (`ARCHITECTURE-SPINE.md` Palier 6, 2026-07-18)

Contrairement aux Stories 16.1 (AD-6) et à l'Epic 15 (AD-3/4/5), cette story n'a **pas d'AD numérotée** — seule une entrée dans le tableau "Stack" :

> `sharp` (nettoyage EXIF, AD non numérotée — cf. PRD §4.4 FR-16, détail d'implémentation) | à vérifier dernière version stable au moment de l'implémentation

Et dans le source tree :

> `character.service.ts   # + nettoyage EXIF à l'upload portrait (sharp), + migration equipment (AD-1)`

- **Prevents** (raison du choix `sharp`, implicite dans le PRD §4.4) : implémentation manuelle du parsing EXIF — le PRD est explicite : "[ASSUMPTION §4.4 FR-16] Le nettoyage EXIF passe par une nouvelle dépendance (`sharp`, déjà pressentie dans `deferred-work.md`) — pas d'implémentation manuelle du parsing EXIF."
- **AD-9 hérité** (aucun nouveau module NestJS) : `stripImageMetadata()` vit dans `image-mime.util.ts` déjà existant, aucun nouveau fichier/module créé.
- Cette story est la **dernière de l'Epic 16** — après son implémentation, `epic-16` peut passer à `done` dans `sprint-status.yaml` (aucune autre story `16-*` ne reste en `backlog`).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/characters/image-mime.util.ts`** (58 lignes actuelles, aucun import externe) :
  ```typescript
  export type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

  const MIME_EXTENSION: Record<DetectedImageMime, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  };

  export function detectImageMime(buffer: Buffer): DetectedImageMime | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) {
      return 'image/png';
    }
    if (buffer.length >= 12 && buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    return null;
  }

  export function extensionForImageMime(mime: DetectedImageMime): string { /* ... */ }
  export function mimeForExtension(ext: string): DetectedImageMime | null { /* ... */ }
  export function isValidPortraitFilename(filename: string): boolean { /* ... */ }
  ```
  `detectImageMime()` **n'est pas modifiée** par cette story — reste la première passe rapide et synchrone (signature magique seule). `stripImageMetadata()` est une fonction séparée, asynchrone, appelée uniquement après validation de la signature.
- **`apps/api/src/characters/character.service.ts`** — `updatePortrait()` (lignes 322-370 actuelles) :
  ```typescript
  async updatePortrait(
    id: string, userId: string, file: Express.Multer.File, cropData: PortraitCropDataDto | null,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);

    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException("Le fichier fourni n'est pas une image JPEG/PNG/WEBP valide");
    }
    // ← insertion Task 3 ici

    await mkdir(PORTRAITS_DIR, { recursive: true });
    const filename = `${randomUUID()}${extensionForImageMime(mime)}`;
    await writeFile(join(PORTRAITS_DIR, filename), file.buffer); // ← file.buffer → cleanedBuffer

    try {
      const result = await this.prisma.character.updateMany({
        where: { id, updatedAt: character.updatedAt },
        data: { portraitUrl: `${PORTRAITS_URL_PREFIX}${filename}`, portraitCropData: (cropData ?? null) as any },
      });
      if (result.count === 0) {
        throw new ConflictException('Le personnage a été modifié entretemps, réessayez.');
      }
    } catch (e) {
      await this.unlinkPortraitFile(filename); // nettoyage fichier orphelin, inchangé
      throw e;
    }

    if (character.portraitUrl) {
      await this.deletePortraitFile(character.portraitUrl); // inchangé
    }
    // ...
  }
  ```
  **Le pattern de nettoyage de fichier orphelin (`unlinkPortraitFile` dans le `catch`) reste pertinent et inchangé** — si `stripImageMetadata()` lève, on est encore avant `writeFile()`, donc rien à nettoyer sur disque à ce stade (cohérent avec le comportement actuel pour un mime invalide).
- **`apps/api/src/characters/characters.controller.ts`** (lignes 140-184 actuelles) — route `PUT :id/portrait`, **inchangée par cette story** : `MAX_PORTRAIT_SIZE = 5 * 1024 * 1024` (ligne 52) déjà en place via `FileInterceptor`/`ParseFilePipe`, borne déjà la taille du buffer traité par `sharp` — pas de nouveau risque de DoS introduit (même raisonnement que Story 16.1 AD-6 pour `pdf-lib`).
- **`apps/api/src/characters/portrait-storage.util.ts`** (49 lignes, cité intégralement) — `readPortraitFile()`/`extractPortraitFilename()`, **inchangés** : lisent le fichier déjà nettoyé depuis le disque, aucune dépendance à `sharp` nécessaire côté lecture.
- **`apps/api/src/characters/character.service.spec.ts`** — mocks actuels en tête de fichier (lignes 1-51 actuelles, cités intégralement) : `node:fs/promises` mocké entièrement (`writeFile`/`mkdir`/`unlink`/`readFile`), `node:crypto` partiellement mocké (`randomUUID` fixé à `'fixed-uuid'`), `@master-jdr/game-rules` mocké. `image-mime.util` **n'est actuellement PAS mocké** — à mocker **partiellement** pour cette story (cf. Task 4). `JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])` (ligne 51) — signature magique JPEG seule, 6 octets, **non décodable par un vrai `sharp`** (vérifié empiriquement).

### Project Structure Notes

- Fichiers modifiés : `apps/api/package.json` (+ lockfile, nouvelle dépendance `sharp`) ; `apps/api/src/characters/image-mime.util.ts` ; `apps/api/src/characters/image-mime.util.spec.ts` ; `apps/api/src/characters/character.service.ts` ; `apps/api/src/characters/character.service.spec.ts`.
- Aucun fichier nouveau, aucune migration Prisma, aucune modification `apps/web`, aucun nouveau module NestJS.
- **Nouvelle dépendance** : `sharp@0.35.3` (ou plus récent si une version plus stable est sortie entre-temps — revérifier `npm view sharp version` avant d'installer).

### Testing Standards

- `apps/api` : Jest, conventions déjà en place.
- **Ne pas mocker `sharp`** dans `image-mime.util.spec.ts` (même principe que Story 16.1 pour `pdf-lib`) — cette story teste le comportement réel de la librairie. **Mocker `stripImageMetadata`** (mock partiel de `image-mime.util`, préservant les exports réels existants) dans `character.service.spec.ts`, où `JPEG_BUFFER` n'est pas une image réellement décodable.
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après l'ajout de l'import `sharp`.

### Previous Story Intelligence (Story 16.1)

- Convention établie : citer intégralement le code existant en Dev Notes, vérifier empiriquement toute hypothèse sur le comportement d'une bibliothèque tierce AVANT de rédiger les tâches (l'architecture littérale de Story 16.1 s'était révélée incomplète sur `PDFDocument.load()` ; cette story applique la même rigueur à `sharp` — vérifié : nettoyage EXIF par défaut OK, mais piège sur l'orientation, découvert et documenté avant l'implémentation plutôt qu'après).
- Convention de mock établie : mock par défaut "passthrough"/"succès" dans le `beforeEach` partagé pour ne pas casser les tests de succès existants, nouveaux tests dédiés pour les cas d'échec — reproduite ici à l'identique (`stripImageMetadata` → passthrough par défaut, comme `isStructurallyValidPdf` → `true` par défaut en Story 16.1).
- Story 16.1 a découvert et documenté un problème pré-existant sans rapport (`pnpm test:e2e` cassé sur `AppModule`/`@master-jdr/shared`) — **sans rapport avec cette story**, ne pas y toucher si rencontré à nouveau (déjà tracé dans `deferred-work.md`).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 350-360 — Epic 16 / Story 16.2 complète, FR16)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (ligne 127 — Stack, dépendance `sharp` ; ligne 199 — source tree, `character.service.ts` ciblé explicitement ; ligne 234 — Capability Map FR-16, "détail d'implémentation")
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR-16 — nettoyage EXIF, ligne 296 — assumption `sharp`)
- `_bmad-output/implementation-artifacts/16-1-detection-de-pdf-renforcee-et-en-tete-de-securite-sur-les-documents-de-scenario.md` (story précédente — méthodologie de vérification empirique avant écriture des tâches, convention de mock passthrough par défaut)
- Vérifications empiriques effectuées pendant la préparation de cette story (script `node` inline dans le conteneur `api`, dépendance `sharp` installée temporairement dans un répertoire isolé `/tmp/sharp-test`, non committée) : nettoyage EXIF par défaut confirmé, préservation du format d'entrée confirmée, `autoOrient()` confirmé nécessaire et suffisant pour préserver la rotation visuelle, rejet d'un buffer à signature valide mais indécodable confirmé (message d'erreur `sharp` reproduit dans les Dev Notes de Task 3).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Vérification empirique (préparation de story, `/tmp/sharp-test`, non committée) : `sharp@0.35.3` retire EXIF/ICC/XMP par défaut au `toBuffer()` mais retire aussi le tag `Orientation` sans appliquer la rotation — `.autoOrient()` avant `.toBuffer()` confirmé nécessaire et suffisant (image 8×4 taguée `orientation:6` → 4×8 en sortie, `orientation` absent, format JPEG préservé).
- Validation manuelle réelle (Task 5, `docker compose restart api` puis script `node` inline dans le conteneur) : upload via `PUT /characters/:id/portrait` (auth `alice@example.com`, personnage `d769b7fc-2538-40de-a38e-8673dba04c96`) d'un JPEG 8×4 généré avec EXIF Copyright + GPS + `orientation:6`. Fichier stocké (`apps/api/uploads/portraits/7610845d-c035-4d8e-b5f1-39d14592904b.jpg`) inspecté via `sharp(...).metadata()` : `hasExif:false`, dimensions `4×8` (rotation bien appliquée aux pixels), `format:'jpeg'` préservé — conforme AC1/AC2/AC3.
- `docker compose exec api pnpm test` → 42 suites / 816 tests, 0 échec, 0 régression.
- `docker compose exec api pnpm typecheck` → propre.

### Completion Notes List

- `stripImageMetadata()` ajoutée dans `image-mime.util.ts` (`sharp(buffer).autoOrient().toBuffer()`), branchée dans `CharacterService.updatePortrait()` avec `try/catch` → `BadRequestException` sur échec de décodage, `cleanedBuffer` écrit sur disque à la place de `file.buffer`.
- 4 nouveaux tests réels (non mockés) dans `image-mime.util.spec.ts` : suppression EXIF, rotation EXIF appliquée aux pixels (AC2), préservation du format (AC3), rejet d'un buffer à signature valide mais indécodable.
- `character.service.spec.ts` : mock partiel de `image-mime.util` (passthrough par défaut sur `stripImageMetadata`), 2 nouveaux tests (buffer nettoyé bien écrit sur disque ; rejet → `BadRequestException`, `writeFile` jamais appelé).
- Aucune migration Prisma, aucune modification `apps/web` (confirmé par `git status`).
- Validation manuelle réelle effectuée (upload authentifié, inspection du fichier stocké) — voir Debug Log References.
- Epic 16 est maintenant complet (dernière story) — `sprint-status.yaml` : `16-2` → `review`, `epic-16` sera passé à `done` lors du `code-review`.

### File List

- `apps/api/package.json` (+ `pnpm-lock.yaml`) — ajout dépendance `sharp@0.35.3`
- `apps/api/src/characters/image-mime.util.ts` — ajout `stripImageMetadata()` ; JSDoc complété (revue) sur le comportement première-frame-seule pour une image animée
- `apps/api/src/characters/image-mime.util.spec.ts` — 4 tests réels initiaux + 3 ajoutés en revue (PNG/WEBP format-preservation, pas de tag Orientation)
- `apps/api/src/characters/character.service.ts` — intégration dans `updatePortrait()` ; revue : log de l'erreur `sharp` avant rethrow, constante `INVALID_PORTRAIT_IMAGE_MESSAGE`
- `apps/api/src/characters/character.service.spec.ts` — mock partiel `image-mime.util`, 2 nouveaux tests

### Review Findings

- [x] [Review][Decision] Perte de l'animation sur un portrait WEBP animé uploadé — **Résolu : documenter en commentaire.** `stripImageMetadata()` re-encode via `sharp(buffer).autoOrient().toBuffer()` sans `{ animated: true }`/`{ pages: -1 }` : seule la première frame est conservée après nettoyage (comportement par défaut de sharp). Portraits attendus comme statiques — comportement accepté, mais à documenter explicitement pour un futur lecteur (converti en patch ci-dessous).
- [x] [Review][Patch] Erreur `sharp` avalée sans trace dans `updatePortrait()` [apps/api/src/characters/character.service.ts:337-341] — corrigé : `this.logger.warn(...)` avant de rethrow `BadRequestException`.
- [x] [Review][Patch] Message d'erreur dupliqué en dur (mime invalide vs signature valide mais indécodable) [apps/api/src/characters/character.service.ts:333,340] — corrigé : extrait dans la constante `INVALID_PORTRAIT_IMAGE_MESSAGE`.
- [x] [Review][Patch] Couverture de test AC3 incomplète : seul JPEG est testé pour la préservation de format [apps/api/src/characters/image-mime.util.spec.ts] — corrigé : tests PNG et WEBP ajoutés.
- [x] [Review][Patch] Test manquant : `autoOrient()` sur une image sans tag `Orientation` [apps/api/src/characters/image-mime.util.spec.ts] — corrigé : test ajouté (pass-through vérifié).
- [x] [Review][Patch] Documenter que seule la première frame d'une image animée (WEBP/PNG/GIF-comme-WEBP) est conservée après nettoyage [apps/api/src/characters/image-mime.util.ts:44-53] — corrigé : JSDoc mis à jour.
- [x] [Review][Defer] Pas de timeout sur l'appel `stripImageMetadata()` [apps/api/src/characters/character.service.ts:337] — deferred, hors périmètre de cette story (aucun pattern de timeout par requête établi ailleurs dans le projet ; le buffer d'entrée est déjà borné à 5 Mo par `MAX_PORTRAIT_SIZE` et au nombre de pixels par la limite par défaut de sharp).
- [x] [Review][Defer] `cleanedBuffer` réencodé pourrait théoriquement dépasser `MAX_PORTRAIT_SIZE` (contrôlé seulement sur le buffer brut en amont, pas sur le buffer nettoyé écrit sur disque) [apps/api/src/characters/character.service.ts:343-345] — deferred, aucun chemin d'exploitation concret démontré (la taille de sortie reste bornée indirectement par la limite de pixels de sharp), hors périmètre de cette story centrée sur le nettoyage EXIF.

## Change Log

| Date | Change |
|------|--------|
| 2026-07-19 | Implémentation complète (Tasks 1-5) : `stripImageMetadata()`, intégration `updatePortrait()`, tests unitaires (6 nouveaux), validation manuelle réelle (upload EXIF/GPS, vérification suppression + orientation). Statut → review. |
| 2026-07-19 | Revue de code (3 agents adversariaux) : 1 decision résolue (comportement image animée documenté), 5 patches appliqués (log erreur sharp, constante message d'erreur, 3 tests ajoutés), 2 items déférés (timeout, taille du buffer nettoyé) — voir `deferred-work.md`. 819/819 tests, typecheck propre. Statut → done. Epic 16 complet. |
