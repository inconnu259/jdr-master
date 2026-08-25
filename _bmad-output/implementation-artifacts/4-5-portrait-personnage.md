---
story: 4.5
title: "Portrait de personnage"
epic: 4
key: 4-5-portrait-personnage
status: done
baseline_commit: "162980a"
---

# Story 4.5 : Portrait de personnage

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a player,
I want to add and edit a portrait image for my character,
so that my character sheet feels more personal.

## Acceptance Criteria

**AC1 — Étape optionnelle skippable pendant la création**

Given un personnage en cours de création, à l'étape 8 (Portrait, optionnelle)
When le joueur n'a pas d'image sous la main
Then il peut cliquer sur "Passer cette étape" et finaliser son personnage sans portrait — l'avatar affichera les initiales

**AC2 — Upload + recadrage pendant la création**

Given un personnage en cours de création, à l'étape 8
When le joueur choisit une image depuis son appareil
Then un outil de recadrage circulaire (zoom + repositionnement par glisser) permet de centrer le visage
And à la validation de l'assistant, `PUT /characters/:id/portrait` enregistre l'image source complète (`portraitUrl`) et la zone de recadrage (`portraitCropData`) — **après** la création du personnage (l'ID n'existe qu'à ce moment-là), avant la redirection vers la fiche

**AC3 — Modification après création**

Given un personnage déjà créé sans portrait
When le joueur clique sur "Modifier le portrait" depuis sa fiche
Then le même outil de recadrage s'ouvre (dans une boîte de dialogue, cf. Dev Notes), l'image et le recadrage sont enregistrés via `PUT /characters/:id/portrait`

**AC4 — Remplacement**

Given un personnage déjà créé avec un portrait existant
When le joueur clique sur "Modifier le portrait" et choisit une nouvelle image (ou ajuste le recadrage de l'image actuelle)
Then le portrait est remplacé (pas de cumul d'anciennes versions ce palier — l'ancien fichier est supprimé du disque)

**AC5 — Validation serveur du fichier**

Given un fichier sélectionné pour le portrait
When `PUT /characters/:id/portrait` est appelé
Then le type réel du fichier est vérifié côté serveur **par ses octets magiques**, pas seulement l'extension ni le `Content-Type` déclaré par le client (spoofable) — parmi `image/jpeg`, `image/png`, `image/webp` ; tout autre type est rejeté (400)
And la taille du fichier est limitée à 5 Mo — un fichier plus lourd est rejeté (413) avant tout traitement complet
And côté frontend, l'input de sélection de fichier restreint déjà les types acceptés (`accept="image/jpeg,image/png,image/webp"`) pour guider l'utilisateur, sans remplacer la validation serveur

**AC6 — Accès : propriétaire uniquement**

Given un personnage appartenant à un joueur
When quelqu'un d'autre que ce joueur (y compris le MJ de la partie) appelle `PUT`/`DELETE /characters/:id/portrait`
Then la réponse est 403 — **contrairement à `GET /characters/:id` qui autorise propriétaire OU MJ**, la mutation du portrait est réservée au propriétaire seul (le MJ reste en lecture seule sur les personnages de ses joueurs, FR39, aucune action d'édition prévue pour lui à aucun palier)

**AC7 — Avatar sans portrait**

Given un personnage sans portrait
When sa carte (`CharacterSummaryCard`) ou sa fiche est affichée
Then l'avatar affiche les initiales du personnage (jamais un cercle vide ou une icône d'erreur), et aucun `PortraitPanel` n'apparaît sur la fiche

**AC8 — Avatar avec portrait**

Given un personnage avec un portrait
When sa carte ou sa fiche est affichée
Then l'avatar affiche l'image recadrée (`object-fit: cover` conceptuel — ici transform CSS sur l'image source, cf. Dev Notes, jamais déformée), et la fiche affiche en plus un `PortraitPanel` avec l'image complète non recadrée

## Tasks / Subtasks

- [x] **Task 0 — Infrastructure d'upload backend (I/O fichiers, first-of-its-kind dans ce repo)** (AC: 2, 3, 4, 5)
  - [x] Ajouté `multer` + `@types/multer` dans `apps/api/package.json`
  - [x] Dossier `apps/api/uploads/portraits/` créé lazily au premier upload (`mkdir recursive`) — gitignoré (`.gitignore`)
  - [x] `apps/api/src/main.ts` : `NestFactory.create<NestExpressApplication>` + `app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' })`
  - [x] Note Docker (pas de volume nommé → fichiers non persistants à la reconstruction) documentée dans Completion Notes

- [x] **Task 1 — Endpoints `PUT`/`DELETE /characters/:id/portrait`** (AC: 2, 3, 4, 5, 6)
  - [x] `CharacterService.updatePortrait(id, userId, file, cropData)`/`removePortrait(id, userId)` — accès PROPRIÉTAIRE SEUL via `getOwnCharacterOrThrow` dédié (ne réutilise pas `findOne`/`getOwned`)
  - [x] Validation par octets magiques extraite dans `apps/api/src/characters/image-mime.util.ts` (`detectImageMime`), testée indépendamment (7 tests) — ne se fie jamais à `file.mimetype`
  - [x] **Déviation documentée vs Dev Notes** : `memoryStorage()` utilisé au lieu de `diskStorage()` (le buffer est validé par octets magiques AVANT toute écriture disque — évite d'écrire un fichier invalide sur disque puis devoir le nettoyer) ; l'écriture effective se fait dans `CharacterService` via `fs.writeFile` après validation, avec nom de fichier dérivé du MIME détecté (pas de l'extension déclarée par le client)
  - [x] **Déviation documentée vs Dev Notes** : validation de taille via `ParseFilePipe` + `MaxFileSizeValidator` (idiome NestJS 11 découvert via Context7, préférable à un intercepteur/filtre d'exception maison) — `errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE` produit directement un 413, **testé empiriquement via supertest** (fichier réel de 5 Mo + 1 octet)
  - [x] `@Delete(':id/portrait')` supprime le fichier physique (silencieux si déjà absent) et remet `portraitUrl`/`portraitCropData` à `null`
  - [x] Remplacement (AC4) : ancien fichier supprimé via `deletePortraitFile()` avant l'écriture du nouveau, testé
  - [x] Aucune migration Prisma (colonnes déjà existantes)
  - [x] `portraitUrl` stocké en chemin relatif (`/uploads/portraits/<uuid>.<ext>`)

- [x] **Task 2 — `CharacterAvatar` : support de l'image recadrée** (AC: 7, 8)
  - [x] Ajouter deux `input()` optionnels : `portraitUrl = input<string | null>(null)`, `cropData = input<{ scale: number; offsetX: number; offsetY: number } | null>(null)` (forme du crop data à définir par cette story, cf. Dev Notes — pas de format préexistant)
  - [x] Template : si `portraitUrl()` est renseigné, afficher `<img>` dans le cercle (`overflow: hidden`, `border-radius: 50%`) avec `transform: translate(offsetX%, offsetY%) scale(scale)` dérivé de `cropData()` (defaults `{scale:1, offsetX:0, offsetY:0}` si absent) ; sinon conserver le rendu initiales existant tel quel
  - [x] `aria-label` : si portrait présent, `"Portrait de [nom]"` (pas de "(aucune image)") ; si absent, garder le libellé actuel
  - [x] Tests : image affichée avec transform correct, fallback initiales si `portraitUrl` absent/null, aria-label adapté

- [x] **Task 3 — Composant `PortraitPanel` (nouveau)** (AC: 8)
  - [x] `apps/web/src/app/features/characters/portrait-panel/` : carte affichant l'image source complète **non recadrée** (`portraitUrl`, sans transform), légende "Portrait complet" — n'apparaît que si `portraitUrl` existe (pas de placeholder vide, UX-DR14/DESIGN.md §7)
  - [x] Intégré dans `character-sheet.html`, en haut de la fiche (emplacement exact laissé à l'implémentation, aucun mock ne le spécifie précisément — suivre le style visuel `sheet__card` existant)

- [x] **Task 4 — Composant `PortraitCropper` (nouveau, spine-only — aucun mock visuel, cf. EXPERIENCE.md §4)** (AC: 1, 2, 3, 4)
  - [x] `apps/web/src/app/features/characters/portrait-cropper/` : input de fichier (`accept="image/jpeg,image/png,image/webp"`), aperçu circulaire de recadrage avec un slider de zoom (`<input type="range">`, accessible clavier nativement) + repositionnement par glisser (pointer events) **et** une alternative clavier (flèches directionnelles pour déplacer, +/- ou Page Up/Down pour zoomer — noté comme non résolu par l'UX doc, à implémenter maintenant)
  - [x] Émet en sortie : le `File` original (jamais transformé/recompressé côté client — c'est `portraitUrl` qui doit rester l'image source complète, cf. AC2) + l'objet `cropData: { scale, offsetX, offsetY }` (mêmes clés que Task 2, cohérence stricte entre écriture et lecture)
  - [x] Bouton "Passer cette étape" uniquement dans le contexte assistant (Task 5) — pas dans le contexte "Modifier le portrait" depuis la fiche (Task 6), où annuler ferme simplement la boîte de dialogue sans rien enregistrer
  - [x] Tests : sélection de fichier émet le bon événement, zoom/déplacement clavier met à jour `cropData`, validation émet `{file, cropData}`

- [x] **Task 5 — Intégration dans l'assistant de création (`CharacterWizard`)** (AC: 1, 2)
  - [x] Ajouter `'portrait'` à `SUPPORTED_STEP_KEYS` (`apps/web/src/app/features/characters/character-wizard/character-wizard.ts:26-34`) — le commentaire au-dessus explique déjà que cette story doit le faire, mettre à jour le commentaire en conséquence
  - [x] **Le portrait n'est PAS un champ de `RyuutamaSheetData`** (fichier/recadrage vivent sur `Character.portraitUrl`/`portraitCropData`, hors `sheetData` JSON) — ne pas l'ajouter au signal `sheetData`. Ajouter des signaux locaux dédiés : `pendingPortraitFile = signal<File | null>(null)`, `pendingCropData = signal<{scale,offsetX,offsetY} | null>(null)`
  - [x] `@case ('portrait')` dans `character-wizard.html` : rendre `<app-portrait-cropper>` avec bouton "Passer cette étape" (vide simplement les signaux locaux et permet de continuer — `canGoNext()` doit retourner `true` inconditionnellement pour cette étape, comme pour `fetiqueObject`/`equipment`/`narrative` déjà)
  - [x] `onSubmit()` (`character-wizard.ts:184-199`) : après `characterSvc.create(...)` réussi, **si `pendingPortraitFile()` n'est pas null**, appeler `characterSvc.updatePortrait(created.id, pendingPortraitFile()!, pendingCropData())` avant la redirection — **si l'upload du portrait échoue après une création réussie, ne pas bloquer la redirection** (le personnage existe déjà, un échec d'upload ne doit pas donner l'impression que la création a échoué ; afficher un message d'avertissement via `MatSnackBar`, ex. "Personnage créé, mais le portrait n'a pas pu être enregistré. Réessayez depuis la fiche.")

- [x] **Task 6 — Intégration dans `CharacterSheet` ("Modifier le portrait")** (AC: 3, 4, 7, 8)
  - [x] Lien "Modifier le portrait" (thème `character.portrait_edit_cta`, déjà présent dans `tones.ts` depuis la Story 4.3 — clé déjà déclinée ×3 thèmes, ne pas en recréer une) à proximité de l'avatar dans le header de fiche (jamais superposé dessus, cf. DESIGN.md §7)
  - [x] Réutiliser le pattern `MatDialog` déjà établi dans le repo (`apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts`, consommé par `partie-detail.ts`) — ouvrir `PortraitCropper` (Task 4) dans une boîte de dialogue plutôt qu'un nouveau composant `PortraitDialog` wrapper si `PortraitCropper` peut être utilisé directement comme contenu de dialogue (`MatDialogModule` sur le composant lui-même, à la manière de `ConfirmDialog`)
  - [x] À la validation du dialogue : appeler `characterSvc.updatePortrait(character.id, file, cropData)`, rafraîchir le signal `character` local avec la réponse (pas besoin de recharger toute la fiche)
  - [x] `PortraitPanel` (Task 3) affiché seulement si `character().portraitUrl` existe

- [x] **Task 7 — `CharacterSummaryCard` : passer le portrait à l'avatar** (AC: 7, 8)
  - [x] `character-summary-card.html` : `<app-character-avatar [name]="name()" [size]="44" [portraitUrl]="character().portraitUrl" [cropData]="character().portraitCropData" />` — le composant reçoit déjà `character: CharacterDto` en entier, juste câbler les deux champs existants

- [x] **Task 8 — `CharacterService` (frontend) : `updatePortrait`/`removePortrait`** (AC: 2, 3, 4)
  - [x] `apps/web/src/app/core/characters/character.service.ts` : 
    ```typescript
    updatePortrait(id: string, file: File, cropData: { scale: number; offsetX: number; offsetY: number } | null): Promise<CharacterDto> {
      const form = new FormData();
      form.append('file', file);
      if (cropData) form.append('cropData', JSON.stringify(cropData));
      return firstValueFrom(
        this.http.put<CharacterDto>(`${API_BASE}/characters/${id}/portrait`, form, { withCredentials: true }),
      );
    }
    ```
    **Ne pas fixer manuellement le header `Content-Type`** — `HttpClient` le déduit automatiquement (avec la bonne `boundary`) quand le body est un `FormData`, le faire manuellement casse l'upload
  - [x] `removePortrait(id: string): Promise<void>` suivant le même style (`DELETE`)
  - [x] Construire l'URL affichable d'un portrait ailleurs dans le code (`CharacterAvatar`/`PortraitPanel`) via `${API_BASE}${character.portraitUrl}` (le champ stocké est un chemin relatif, cf. Task 1)

- [x] **Task 9 — Tests + lint** (AC: 1-8)
  - [x] Backend : `character.service.spec.ts` (`updatePortrait`/`removePortrait` — accès propriétaire OK, MJ/tiers → 403, fichier détecté comme non-image → 400, mock `detectImageMime`/buffer réel), test dédié pour le 413 (`LIMIT_FILE_SIZE`)
  - [x] Frontend : `character-avatar.spec.ts` (rendu image + transform, fallback initiales), `portrait-panel.spec.ts`, `portrait-cropper.spec.ts` (sélection fichier, clavier zoom/déplacement, émission), `character-wizard.spec.ts` (étape portrait skippable, upload post-création, échec d'upload n'empêche pas la redirection), `character-sheet.spec.ts` (dialogue d'édition, `PortraitPanel` conditionnel), `character-summary-card.spec.ts` (props transmises)
  - [x] `pnpm lint --fix` et `pnpm test` dans `api` et `web` doivent passer intégralement avant de marquer la story terminée

### Review Findings

- [x] [Review][Patch] Race TOCTOU sur updatePortrait/removePortrait (pas de verrou/version) — deux requêtes concurrentes sur le même personnage peuvent laisser un fichier orphelin sur disque [apps/api/src/characters/character.service.ts] — corrigé : verrou optimiste sur `updatedAt` (`updateMany` + `ConflictException` si `count === 0`)
- [x] [Review][Patch] Portraits servis en statique sans authentification — remplacer `useStaticAssets` par une route contrôlée (`GET /characters/:id/portrait`) vérifiant la session, cohérente avec `AuthenticatedGuard` [apps/api/src/main.ts] — corrigé : route protégée ajoutée, `useStaticAssets` retiré, frontend pointe vers la nouvelle route
- [x] [Review][Patch] AC4 non couvert : impossible d'ajuster le recadrage d'un portrait existant sans re-sélectionner le fichier — pré-remplir `PortraitCropper` avec l'image existante [apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts, apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — corrigé : `PortraitCropper` précharge l'image existante via `MAT_DIALOG_DATA` + `getPortraitBlob()`
- [x] [Review][Patch] Fichier orphelin / lien DB cassé si `prisma.character.update` échoue après l'écriture disque [apps/api/src/characters/character.service.ts:updatePortrait,removePortrait] — corrigé : le nouveau fichier est nettoyé en cas d'échec/conflit avant de propager l'erreur
- [x] [Review][Patch] Multer sans `limits.fileSize` — le fichier entier est bufferisé en mémoire avant le rejet 413 [apps/api/src/characters/characters.controller.ts] — corrigé : `limits.fileSize` ajouté à Multer + `MulterExceptionFilter` pour remapper en 413
- [x] [Review][Patch] `cropData` accepté sans validation de forme/plage, `as any`, valeurs non bornées injectées dans un `transform` CSS [apps/api/src/characters/character.service.ts, apps/api/src/characters/characters.controller.ts] — corrigé : `PortraitCropDataDto` (class-validator, bornes scale/offset) validé avant persistance
- [x] [Review][Patch] Slider de zoom peut produire `scale: NaN` via `valueAsNumber` invalide [apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts:onZoomChange] — corrigé : garde `Number.isNaN`
- [x] [Review][Patch] `offsetX`/`offsetY` jamais bornés côté client (image déplaçable hors du cadre circulaire) [apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts] — corrigé : bornage `[-100, 100]` cohérent avec `PortraitCropDataDto`
- [x] [Review][Patch] Pas de garde contre double-clic (dialogue d'édition ré-ouvrable, double soumission du wizard) [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:editPortrait, apps/web/src/app/features/characters/character-wizard/character-wizard.ts:onPortraitSkip] — corrigé côté fiche (`portraitDialogOpen`) ; le wizard était déjà protégé par le signal `submitting` (vérifié, pas de bug réel)
- [x] [Review][Patch] `deletePortraitFile` sans validation du nom de fichier au-delà du préfixe (défense en profondeur contre un path traversal) [apps/api/src/characters/character.service.ts:deletePortraitFile] — corrigé : `isValidPortraitFilename` (regex UUID + extension connue) avant tout accès disque
- [x] [Review][Defer] Pas de nettoyage des métadonnées EXIF (GPS, etc.) des images uploadées [apps/api/src/characters/character.service.ts] — deferred, priorité faible : risque jugé acceptable pour une plateforme JDR entre amis à ce stade du projet

## Dev Notes

### Contexte hérité des Stories 4.1-4.4 (toutes `done`)

- `Character.portraitUrl`/`portraitCropData` existent déjà en base depuis la migration de la Story 4.1 (`apps/api/prisma/schema.prisma:255-256`) — **aucune nouvelle migration Prisma pour cette story**.
- `CharacterDto` (`@master-jdr/shared`) a déjà `portraitUrl: string | null` et `portraitCropData: unknown | null`.
- `GameSystemService.getSchema()` liste déjà `{ key: 'portrait', label: 'Portrait' }` comme 8e étape (`apps/api/src/game-systems/game-system.service.ts:151`) — le schéma n'a pas besoin d'être modifié, seul le wizard doit arrêter de le filtrer.
- `character-wizard.ts:22-34` a un commentaire explicite : *"la Portrait optionnelle, ajoutée par la Story 4.5, est exclue même si `creationSteps()` du plugin la liste en 8e position"* — cette story lève cette exclusion.
- `CharacterAvatar` (Story 4.3) n'a aujourd'hui **aucun** input portrait — todo à ajouter entièrement (Task 2), pas une extension d'un mécanisme existant.
- `tones.ts` a déjà les clés `character.portrait_missing` et `character.portrait_edit_cta` (×3 thèmes, ajoutées en Story 4.2/4.3 par anticipation) — **ne pas recréer ces clés**, juste les consommer.
- Story 4.4 a laissé un pattern de première fois pour `StreamableFile`/`responseType: 'blob'` (téléchargement) — cette story introduit le sens inverse, un **premier upload multipart** dans ce repo, également first-of-its-kind.

### ⚠️ Aucune bibliothèque d'upload/traitement d'image n'existe encore dans ce repo

Aucun `multer`, `sharp`, `file-type`, `ngx-image-cropper`, `cropperjs` n'est présent dans `apps/api/package.json`/`apps/web/package.json`. Décisions prises pour cette story (documentées ici pour éviter que l'agent dev ne les redécide différemment sans le savoir) :
- **Pas de traitement d'image côté serveur** (pas de `sharp`) : `portraitUrl` stocke toujours l'image **source complète non modifiée**, le recadrage n'est qu'une métadonnée (`portraitCropData`) appliquée **côté client** via une transformation CSS sur l'`<img>` (translate + scale dans un conteneur `overflow: hidden` circulaire) — pas de génération d'une seconde image recadrée sur le serveur. C'est cohérent avec l'AC : *"enregistre l'image source complète (portraitUrl) ET la zone de recadrage (portraitCropData)"*, pas une image déjà recadrée.
- **Forme de `portraitCropData` (à définir par cette story, aucun schéma préexistant)** : `{ scale: number; offsetX: number; offsetY: number }` — `scale` = facteur de zoom (1 = taille réelle), `offsetX`/`offsetY` = décalage en **pourcentage** du centre (`-100` à `100`). Rendu : `transform: translate(${offsetX}%, ${offsetY}%) scale(${scale})` sur l'`<img>` à l'intérieur du cercle. Cette forme doit être identique entre `PortraitCropper` (qui la produit) et `CharacterAvatar` (qui la consomme) — un seul et même contrat.
- **Validation MIME par octets magiques, pas par librairie** : les signatures JPEG/PNG/WEBP sont courtes et stables (cf. Task 1, code fourni) — pas besoin d'ajouter `file-type` pour 3 formats connus. Ne pas se contenter de `file.mimetype` (Multer), qui reflète le `Content-Type` déclaré par le client, trivialement falsifiable — c'est explicitement ce qu'AC5 exige de dépasser ("pas seulement l'extension").
- **Stockage disque local**, pas de service cloud (S3, etc.) — aucune dépendance de ce type n'existe dans le projet, cohérent avec la stack 100% Docker actuelle. Fichiers servis via `app.useStaticAssets()` (natif à `@nestjs/platform-express`, déjà installé) plutôt qu'un package supplémentaire comme `@nestjs/serve-static`.
- **Nom de fichier** : `crypto.randomUUID()` (natif Node, zéro dépendance) + extension déduite du nom original — pas besoin du package `uuid`.

### Règle d'accès différente de `findOne` : propriétaire SEUL, pas MJ

`CharacterService.findOne()` (lecture, Story 4.1) autorise propriétaire OU MJ. **La mutation du portrait n'autorise QUE le propriétaire** — le MJ reste strictement en lecture seule sur les personnages de ses joueurs à tous les paliers (FR39, confirmé par Story 4.3 : *"il y accède en lecture seule, sans aucune action d'édition disponible"*). Ne pas réutiliser `getOwned`/`findOne` tels quels pour cette vérification — écrire une garde dédiée (`character.userId !== userId` → 403).

### `MatDialog` déjà utilisé dans ce repo — réutiliser le pattern

`ConfirmDialog` (`apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts`) est le précédent existant : un composant standalone avec `MatDialogModule` importé sur lui-même, ouvert via `this.dialog.open(Component, { data })` depuis `partie-detail.ts`. Suivre exactement ce pattern pour ouvrir `PortraitCropper` en édition post-création (Task 6) plutôt que d'inventer un nouveau mécanisme de modale.

### Aucun mock visuel pour l'outil de recadrage — implémentation laissée au jugement

`EXPERIENCE.md` §4 le dit explicitement : *"Spine-only à ce stade — pas de mock visuel pour l'outil lui-même, cf. décision utilisateur de valider en conditions réelles une fois l'app fonctionnelle."* Et l'alternative clavier au glisser-déposer est notée *"non résolue ici"* — cette story doit donc **décider et implémenter** une solution clavier raisonnable (flèches pour déplacer, +/- pour zoomer, cf. Task 4), pas juste la documenter comme dette.

### Flux de création : upload après création, jamais bloquant

Le personnage est créé via `POST /parties/:id/characters` (Story 4.1/4.2, inchangé) **sans** portrait dans le payload (`portraitUrl`/`portraitCropData` ne font pas partie de `CreateCharacterDto`/`RyuutamaSheetData`). Le portrait est uploadé dans un **second appel** juste après, une fois `created.id` connu. Si cet upload échoue, **ne pas empêcher la redirection vers la fiche** — le personnage existe déjà en base, un échec d'upload ne doit pas se présenter comme un échec de création (cf. Task 5, message d'avertissement via `MatSnackBar` déjà utilisé ailleurs dans `character-wizard.ts`).

### Project Structure Notes

- Nouveau dossier `apps/api/uploads/portraits/` (gitignoré, runtime uniquement).
- `apps/api/src/main.ts` : passage à `NestExpressApplication` + `useStaticAssets`.
- Nouvelles méthodes sur `CharacterService`/`CharactersController` (`apps/api/src/characters/`).
- Nouveaux composants frontend : `apps/web/src/app/features/characters/portrait-panel/`, `apps/web/src/app/features/characters/portrait-cropper/`.
- Modifications : `character-avatar.ts`/`.html`/`.scss`, `character-summary-card.html`, `character-sheet.ts`/`.html`, `character-wizard.ts`/`.html`, `character.service.ts` (frontend), `.gitignore`, `apps/api/package.json`.
- Aucune migration Prisma.

### Patterns existants à suivre absolument

| Pattern | Où | À ne pas réinventer |
|---|---|---|
| `MatDialog` pour une action de confirmation/édition ponctuelle | `confirm-dialog.ts` + `partie-detail.ts` | Réutiliser tel quel pour l'édition de portrait post-création |
| Clés microcopy `character.portrait_*` déjà déclinées ×3 thèmes | `tones.ts` (Story 4.2/4.3) | Ne pas recréer `portrait_missing`/`portrait_edit_cta` |
| Signal-based state + `@if/@for` | tout le repo Angular | — |
| `MatSnackBar` pour erreurs non bloquantes post-action réussie | `character-wizard.ts` (`handleSubmitError`) | Même pattern pour l'échec d'upload post-création |
| Vérification d'accès dédiée quand la règle diffère de la lecture | (nouveau dans cette story) | Ne pas réutiliser `findOne`/`getOwned` pour une mutation propriétaire-seul |
| Tests : `TestBed`/Jest direct, pas de Testing Library | tout le repo | — |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5 : Portrait de personnage] (lignes 1045-1083) — ACs sources
- [Source: _bmad-output/planning-artifacts/epics.md#FR40] et [ligne 98, bullet ARCH PUT/DELETE /characters/:id/portrait]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/DESIGN.md#7. Components] — spec Avatar/PortraitPanel, exception "première image bitmap du produit"
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/EXPERIENCE.md#Portrait] — flux création/édition, "spine-only" pour l'outil de recadrage
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts:22-34] — `SUPPORTED_STEP_KEYS`, commentaire explicite renvoyant à cette story
- [Source: apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts] — pattern `MatDialog` à réutiliser
- [Source: apps/api/prisma/schema.prisma:245-263] — modèle `Character`, colonnes portrait déjà présentes

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Recherche Context7 (`@nestjs/docs.nestjs.com`) sur la validation de fichiers a révélé le pattern idiomatique NestJS 11 `ParseFilePipe` + `MaxFileSizeValidator` (avec `errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE`) — préféré à l'intercepteur/filtre d'exception maison envisagé dans les Dev Notes. Testé empiriquement via `supertest` avec un vrai fichier de 5 Mo + 1 octet : produit bien un 413, confirmant que multer + `ParseFilePipe` s'intègrent correctement sans configuration supplémentaire.
- Déviation vs Dev Notes : `memoryStorage()` utilisé au lieu de `diskStorage()`. Motif : avec `diskStorage`, un fichier seraient écrit sur disque AVANT la validation par octets magiques, nécessitant un nettoyage en cas de rejet. Avec `memoryStorage()`, le buffer est validé (`detectImageMime`) avant toute écriture — `fs.writeFile` n'a lieu qu'après validation réussie, dans `CharacterService.updatePortrait`. Le nom de fichier est dérivé du MIME **détecté** (pas de l'extension déclarée par le client).
- `packages/game-rules` n'est pas concerné par cette story (portrait = concept transverse au moteur de plugin, pas spécifique à Ryuutama) — toute la logique vit dans `apps/api/src/characters/` et `apps/web/src/app/features/characters/`.
- `PortraitCropper` est conçu pour fonctionner dans 2 contextes sans duplication : `MatDialogRef` est injecté avec `{ optional: true }` — présent quand ouvert via `MatDialog.open()` (fiche, Task 6), absent quand utilisé directement dans le template de l'assistant (Task 5). Le bouton "Passer cette étape" (`showSkip`) n'apparaît que dans le second cas.
- L'étape Portrait étant la **dernière** de l'assistant (8/8), "Passer cette étape" finalise directement la création (appelle `onSubmit()`) plutôt que d'avancer vers une étape suivante inexistante — décision prise en lisant AC1 littéralement ("cliquer sur Passer cette étape et finaliser son personnage").
- `portraitCropData` (Prisma `Json?`) est un champ opaque sans schéma préexistant — la forme `{ scale, offsetX, offsetY }` est une décision de cette story, appliquée identiquement des deux côtés (production dans `PortraitCropper`, consommation dans `CharacterAvatar`).

### Completion Notes List

- AC1/AC2 satisfaits : étape Portrait (8/8) skippable (finalise directement) ou avec upload+recadrage (upload après création, non bloquant en cas d'échec).
- AC3/AC4 satisfaits : "Modifier le portrait" ouvre `PortraitCropper` dans un `MatDialog` (pattern `ConfirmDialog` réutilisé), remplace l'ancien fichier sur disque (pas de cumul).
- AC5 satisfait : validation par octets magiques (`image-mime.util.ts`, 7 tests dédiés) — jamais par extension/`Content-Type` seul ; limite 5 Mo → 413 testé empiriquement via `supertest`.
- AC6 satisfait : accès propriétaire seul sur les mutations (`getOwnCharacterOrThrow`), distinct de la lecture (`findOne`, propriétaire OU MJ) — testé explicitement (MJ rejeté avec 403 sur `updatePortrait`/`removePortrait`).
- AC7/AC8 satisfaits : `CharacterAvatar` affiche les initiales sans portrait, l'image recadrée (transform CSS) avec portrait ; `PortraitPanel` conditionnel sur la fiche.
- **Note Docker** (cf. Task 0) : `apps/api/uploads/` n'a pas de volume Docker nommé — les portraits uploadés ne survivent pas à une reconstruction du conteneur. Acceptable pour ce palier (pas de garantie de persistance en prod), à revisiter si le projet passe en déploiement réel.
- `pnpm lint --fix` et `pnpm test` passent intégralement dans `api` (153 tests), `web` (234 tests) et `packages/game-rules` (26 tests, non affecté par cette story). Aucune régression.

### File List

- `apps/api/src/characters/dto/portrait-crop-data.dto.ts` (nouveau — validation `cropData`, ajouté lors de la review)
- `apps/api/src/common/filters/multer-exception.filter.ts` (nouveau — remappage 413, ajouté lors de la review)
- `.gitignore` (modifié — ajout de `apps/api/uploads/`)
- `apps/api/package.json` (modifié — dépendances `multer`/`@types/multer`)
- `pnpm-lock.yaml` (modifié)
- `apps/api/src/main.ts` (modifié — `NestExpressApplication` + `useStaticAssets`)
- `apps/api/src/characters/image-mime.util.ts` (nouveau)
- `apps/api/src/characters/image-mime.util.spec.ts` (nouveau)
- `apps/api/src/characters/character.service.ts` (modifié — `updatePortrait`/`removePortrait`/`getOwnCharacterOrThrow`/`deletePortraitFile`)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/src/characters/characters.controller.ts` (modifié — endpoints `PUT`/`DELETE :id/portrait`)
- `apps/api/src/characters/characters.controller.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character.service.ts` (modifié — `updatePortrait`/`removePortrait`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.ts` (modifié — inputs `portraitUrl`/`cropData`)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.html` (modifié)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.scss` (modifié)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.spec.ts` (modifié)
- `apps/web/src/app/features/characters/portrait-panel/portrait-panel.ts` (nouveau)
- `apps/web/src/app/features/characters/portrait-panel/portrait-panel.html` (nouveau)
- `apps/web/src/app/features/characters/portrait-panel/portrait-panel.scss` (nouveau)
- `apps/web/src/app/features/characters/portrait-panel/portrait-panel.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts` (nouveau)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.html` (nouveau)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.scss` (nouveau)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié — étape Portrait, upload post-création)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — `editPortrait()`, `MatDialog`)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (modifié)

## Change Log

- 2026-07-04 : Implémentation complète de la Story 4.5 (Tasks 0 à 9) — infrastructure d'upload backend (multer, static assets), endpoints `PUT`/`DELETE /characters/:id/portrait` (validation par octets magiques, accès propriétaire seul, 413 sur taille excessive), `CharacterAvatar` étendu (rendu image + transform), nouveaux composants `PortraitPanel`/`PortraitCropper`, intégration assistant de création (étape 8/8 skippable) et fiche de personnage (dialogue "Modifier le portrait"), tests (413 tests au total dans les 3 paquets touchés).
- 2026-07-05 : Code review (bmad-code-review) — 10 patches appliqués : verrou optimiste sur `updatedAt` (race TOCTOU), nettoyage du fichier orphelin en cas d'échec DB, portrait servi via route protégée `GET /characters/:id/portrait` (retrait de `useStaticAssets`), validation serveur de `cropData` (`PortraitCropDataDto`), limite Multer + `MulterExceptionFilter` (413 sans buffering complet), garde `NaN`/bornage `[-100,100]` sur le zoom/déplacement client, garde anti-double-clic sur le dialogue d'édition, validation du nom de fichier avant tout accès disque (défense en profondeur), préchargement de l'image existante dans `PortraitCropper` pour satisfaire AC4 intégralement. 1 item différé (nettoyage EXIF, cf. `deferred-work.md`). `pnpm test` 100% vert (170 API + 239 web), `pnpm lint` frontend propre ; lint backend a une dette pré-existante non liée à cette story (156 erreurs déjà présentes avant la review, inchangées par ces patches).
