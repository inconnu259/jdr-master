---
story: 4.7
title: "Recadrage dédié du portrait pour l'export PDF"
epic: 4
key: 4-7-recadrage-pdf-dedie
status: done
baseline_commit: "22394abd12d6ba4426860088f5081ee6af9fbba4"
---

# Story 4.7 : Recadrage dédié du portrait pour l'export PDF

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a player,
I want to adjust how my portrait is cropped specifically for the PDF export (a different aspect ratio than the circular avatar),
so that the exported sheet shows exactly the part of my portrait I want, not just an automatic center-fit.

## Acceptance Criteria

**AC1 — Ouverture du recadrage dédié PDF**

Given un personnage avec un portrait existant
When le joueur clique sur "Ajuster le cadrage PDF" depuis sa fiche
Then `PortraitCropper` s'ouvre avec un masque de prévisualisation **rectangulaire** (proportion du cadre PDF réel, cf. Dev Notes — **pas** 90:110) au lieu du masque circulaire habituel, réutilisant la même image source déjà uploadée (aucun nouvel upload requis)

**AC2 — Enregistrement séparé de `pdfPortraitCropData`**

Given le joueur ajuste le zoom/la position dans ce mode rectangulaire
When il valide
Then un nouveau champ `pdfPortraitCropData` (même forme que `portraitCropData` : `scale`/`offsetX`/`offsetY`) est enregistré séparément sur le `Character`, **sans** modifier `portraitCropData` (le recadrage de l'avatar web reste indépendant), et **sans** ré-uploader le fichier image

**AC3 — Application du recadrage dédié dans l'export PDF**

Given un personnage avec `pdfPortraitCropData` renseigné
When son PDF est exporté
Then `RyuutamaPdfService` applique ce recadrage (au lieu du centrage automatique `fitCentered` de la Story 4.6) pour positionner l'image dans le cadre — le calcul traduit `scale`/`offsetX`/`offsetY` en région visible à dessiner, cohérent visuellement avec ce que `PortraitCropper` affiche à l'écran

**AC4 — Pas de régression sans recadrage dédié**

Given un personnage sans `pdfPortraitCropData` (portrait ajouté avant cette story, ou jamais ajusté pour le PDF)
When son PDF est exporté
Then le comportement de la Story 4.6 s'applique tel quel (`fitCentered`, centrage automatique) — aucune régression, dégradation gracieuse

**AC5 — Couverture de tests de la conversion crop → région dessinée**

Given le calcul de conversion `pdfPortraitCropData` (scale/offset) → position/taille de dessin dans le cadre PDF
When cette logique est unit-testée (fonction pure, sur le modèle de `fitCentered`)
Then elle couvre au moins : zoom neutre centré, zoom maximal avec offset aux bornes (±100), offset qui pousserait la région hors de l'image source (clampé, jamais d'erreur)

**Out of Scope :**
- Aperçu live dans la forme exacte du cadre orné de la fiche officielle (juste un rectangle aux bonnes proportions, pas le contour décoratif réel) — différé, pas de story prévue.

**⚠️ Révision de scope actée en cours d'implémentation (tests manuels utilisateur, post-Task 5)** : cette AC prévoyait initialement que le recadrage circulaire existant (`portraitCropData`, avatar web) reste **strictement inchangé** ("son usage existant... doit rester identique en sortie"). Les tests manuels ont révélé que la base `object-fit: cover` (zoom minimum = image toujours zoomée pour remplir le cadre) masquait structurellement le haut/bas de toute photo dont le ratio ne correspond pas au cadre — visible dans les DEUX modes (`circle` et `rect`). Décision utilisateur explicite (confirmée en conversation) : basculer la base sur `object-fit: contain` (image entière visible à `scale=1`) **partout** — `PortraitCropper` (les deux formes), `computePdfCropDraw`, **et `CharacterAvatar`** (le rendu final de l'avatar, pour rester cohérent avec ce que l'outil d'édition montre). Conséquence assumée : les personnages ayant déjà un `portraitCropData` enregistré avant ce changement afficheront leur avatar différemment (lettreboxé au lieu de rogné) — aucune migration de données jugée nécessaire (pas de données de production à ce stade du projet). Voir Change Log pour le détail.

## Tasks / Subtasks

- [x] **Task 1 — Schéma & DTO `pdfPortraitCropData`** (AC: 2, 4)
  - [x] `apps/api/prisma/schema.prisma` : ajouter `pdfPortraitCropData Json?` au modèle `Character` (champ additif, nullable — même pattern que `portraitCropData`)
  - [x] `docker compose exec api pnpm prisma migrate dev --name pdf_portrait_crop_data` puis `pnpm prisma generate`
  - [x] `packages/shared/src/index.ts` : ajouter `pdfPortraitCropData: unknown | null` à `CharacterDto` (additif, même pattern que `portraitCropData`)
  - [x] Réutiliser **tel quel** `PortraitCropDataDto` (`apps/api/src/characters/dto/portrait-crop-data.dto.ts`, déjà `scale`/`offsetX`/`offsetY` avec les mêmes bornes) — ne pas créer de DTO dupliqué, la forme est identique

- [x] **Task 2 — Endpoint API pour enregistrer le recadrage PDF** (AC: 2)
  - [x] `apps/api/src/characters/characters.controller.ts` : nouvelle route `PATCH /characters/:id/pdf-portrait-crop`, body = `PortraitCropDataDto` (JSON direct, pas de `multipart/form-data` — contrairement à `PUT :id/portrait` il n'y a **aucun fichier à uploader** ici, l'image source existe déjà)
  - [x] `CharacterService.updatePdfPortraitCrop(id, userId, cropData)` : accès **propriétaire seul** (même règle que `updatePortrait`/`removePortrait`, cf. `getOwnCharacterOrThrow`), verrou optimiste sur `updatedAt` (même pattern `prisma.character.updateMany({ where: { id, updatedAt }, ... })` + `ConflictException` si `count === 0`, cf. `updatePortrait`) — **pas** de manipulation de fichier disque ici, seulement un `prisma.character.updateMany({ data: { pdfPortraitCropData: cropData } })`
  - [x] Erreur si le personnage n'a pas de `portraitUrl` (rien à recadrer) → `BadRequestException`
  - [x] Tests : `character.service.spec.ts` — succès (propriétaire), `ForbiddenException` (non-propriétaire), `ConflictException` (conflit `updatedAt`), `BadRequestException` (pas de portrait)

- [x] **Task 3 — `PortraitCropper` généralisé (forme rectangulaire)** (AC: 1)
  - [x] `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts` : nouvel `input()` `shape = input<'circle' | 'rect'>('circle')` (défaut = comportement actuel inchangé, cf. Out of Scope — l'usage existant pour l'avatar circulaire ne doit rien changer). Note d'implémentation : `MatDialog.open()` ne peut pas binder un `input()` de composant (seul `MAT_DIALOG_DATA` l'est) — `PortraitCropperData.shape` prime sur l'input via un `effectiveShape` computed quand ouvert en dialogue.
  - [x] `portrait-cropper.scss` : `border-radius: 50%` uniquement si `shape() === 'circle'` (binding `[class.portrait-cropper__preview--rect]` ou équivalent) ; en mode `rect`, dimensionner le conteneur de prévisualisation au ratio réel du cadre PDF (cf. Dev Notes pour les dimensions exactes) au lieu du carré 220×220
  - [x] `portrait-cropper.html` : passer la classe/le binding de forme au conteneur `.portrait-cropper__preview` ; le reste (drag, zoom, clavier) est déjà générique et ne change pas
  - [x] `character-sheet.ts` : nouveau bouton "Ajuster le cadrage PDF" (visible **propriétaire seul**, même garde que `editPortrait()` — `isOwner()` — et seulement si `character().portraitUrl` existe), ouvre `PortraitCropper` avec `[shape]="'rect'"` et les données initiales `pdfPortraitCropData` du personnage (si déjà renseignées) au lieu de repartir de zéro
  - [x] `character.service.ts` (frontend) : nouvelle méthode `patchPdfPortraitCrop(characterId, cropData)` → `PATCH /characters/:id/pdf-portrait-crop`, **sans** `FormData`/fichier (contrairement à `updatePortrait`)
  - [x] Tests : `portrait-cropper.spec.ts` (forme rect appliquée quand `shape='rect'`, comportement circulaire par défaut inchangé, préchargement `initialCropData`), `character-sheet.spec.ts` (bouton visible propriétaire + portrait existant, absent sinon), `character.service.spec.ts` (frontend, nouvel appel HTTP)

- [x] **Task 4 — Conversion crop → dessin PDF + application dans l'export** (AC: 3, 4, 5)
  - [x] `apps/api/src/characters/ryuutama-pdf.service.ts` : nouvelle fonction pure exportée `computePdfCropDraw(imageWidth, imageHeight, frameX, frameY, frameWidth, frameHeight, cropData: { scale, offsetX, offsetY })` — même esprit que `fitCentered` (Story 4.6), testable indépendamment de `pdf-lib`. Doit reproduire visuellement ce que l'utilisateur voit dans `PortraitCropper` (cf. Dev Notes — **base "cover"** du cadre, puis zoom/offset utilisateur, jamais de dépassement hors image source)
  - [x] `embedPortrait(doc, portraitUrl, pdfPortraitCropData)` : si `pdfPortraitCropData` est renseigné, utiliser `computePdfCropDraw` + un **clip path** `pdf-lib` (`pushGraphicsState()`, `rectangle(...)`, `clip()`, `endPath()`, `drawImage(...)`, `popGraphicsState()` — cf. Dev Notes, ces opérateurs bas niveau sont bien exportés par `pdf-lib@1.17.1` dans ce repo, confirmé) ; sinon, comportement 4.6 inchangé (`fitCentered`, pas de clip)
  - [x] `fillCharacterPdf` : passe `character.pdfPortraitCropData` jusqu'à `embedPortrait`
  - [x] Tests : `ryuutama-pdf.service.spec.ts` — nouveaux cas pour `computePdfCropDraw` (zoom neutre, zoom max + offset aux bornes, offset hors bornes clampé) et pour `embedPortrait` avec `pdfPortraitCropData` renseigné/absent/malformé (mock `pdf-lib` étendu avec `pushGraphicsState`/`clip`/`popGraphicsState`)

- [x] **Task 5 — Tests + lint** (AC: 1-5)
  - [x] `pnpm lint --fix` et `pnpm test` passent intégralement dans `api`, `web`, `packages/game-rules` (aucune régression)

### Review Findings

- [x] [Review][Patch] `parsePdfPortraitCropData` ne valide que le *type* (`number`) de `scale`/`offsetX`/`offsetY`, jamais leur plage — un `NaN`/`Infinity`/négatif/hors bornes DTO (ex. donnée legacy corrompue en base) traverse jusqu'à `computePdfCropDraw` et peut produire une géométrie dégénérée passée à `drawImage` [apps/api/src/characters/ryuutama-pdf.service.ts (`parsePdfPortraitCropData`)] — corrigé : validation par plage (`Number.isFinite` + bornes `MIN/MAX_PORTRAIT_SCALE/OFFSET` réutilisées de `PortraitCropDataDto`), 6 nouveaux cas de test (`it.each`).
- [x] [Review][Patch] La séquence de clip path `pdf-lib` (`pushGraphicsState` → `drawImage` → `popGraphicsState`) n'a pas de `try/finally` — si `drawImage` lève après le `pushGraphicsState`, `popGraphicsState()` n'est jamais exécuté, état graphique de la page potentiellement déséquilibré [apps/api/src/characters/ryuutama-pdf.service.ts (`embedPortrait`)] — corrigé : `try/finally` autour de `drawImage`, test dédié (`drawImage` qui lève → `popGraphicsState` quand même appelé).
- [x] [Review][Patch] `RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO` (`packages/shared`) duplique `PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` (`ryuutama-pdf.service.ts`) sous forme de deux littéraux codés en dur indépendamment — seul un commentaire les relie, rien ne garantit qu'ils restent synchronisés si les coordonnées PDF sont un jour re-mesurées [packages/shared/src/index.ts, apps/api/src/characters/ryuutama-pdf.service.ts] — **tentative de fix révertée** : essayé d'importer les constantes depuis `@master-jdr/shared` dans l'API, mais `@master-jdr/shared` est une frontière **types uniquement, effacée au runtime** (CLAUDE.md) — Jest ne transforme pas ce module en dépendance de workspace, un import de valeur casse toute la suite `api` (`SyntaxError: Unexpected token 'export'`, confirmé). Revert vers les littéraux locaux ; la duplication reste assumée et documentée des deux côtés (commentaires croisés), pas de source de vérité unique possible sans construire `@master-jdr/shared` en JS (hors scope).
- [x] [Review][Patch] `PortraitCropper.ngOnInit` applique `initialCropData.scale/offsetX/offsetY` directement aux signaux sans les clamper aux bornes valides (`MIN/MAX_SCALE`, `MIN/MAX_OFFSET`) — une donnée legacy/corrompue casserait le slider ou produirait un recadrage invalide [apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts] — corrigé : `clampScale`/`clampOffset` + garde `Number.isFinite`, 2 nouveaux tests (hors bornes, `NaN`).
- [x] [Review][Patch] Docstring obsolète : `updatePdfPortraitCrop` référence encore "Story 4.6" au lieu de "Story 4.7" [apps/api/src/characters/character.service.ts] — corrigé.
- [x] [Review][Defer] `cropData as any` lors de l'écriture Prisma, verrou optimiste `updatedAt` relu côté serveur dans le même appel (protège seulement contre une course entre les deux requêtes internes, pas contre un aller-retour client périmé), et re-fetch séparé après `updateMany` (fenêtre TOCTOU théorique) — deferred, pre-existing : pattern strictement identique à `updatePortrait`/`removePortrait` (Story 4.5/4.6), pas introduit par cette story [apps/api/src/characters/character.service.ts]
- [x] [Review][Defer] `computePdfCropDraw`/`containScale` non protégé contre une image embarquée de dimensions 0×0 (division par zéro) — deferred, pre-existing : même classe de risque déjà différée pour `fitCentered`/`embedPortrait` lors de la revue de la Story 4.6 (template/image dégénérée extrêmement improbable) [apps/api/src/characters/ryuutama-pdf.service.ts]
- [x] [Review][Defer] Aucune factory de fixture partagée pour `CharacterDto` dans les tests — chaque story ajoutant un champ au DTO (`ownerPseudo`/`ownerIsMj` en 4.6, `pdfPortraitCropData` ici) nécessite l'édition manuelle de ~8 fichiers de spec, sans garde-fou du compilateur — deferred, amélioration de maintenabilité transverse pour une story future [tous les fichiers `*.spec.ts` construisant un `CharacterDto` littéral]
- [x] [Review][Decision→Patch résolu en conversation] La note "Out of Scope" initiale de la story garantissait que le recadrage circulaire existant (avatar web) resterait inchangé ; les tests manuels post-implémentation ont révélé que la base `cover` tronquait structurellement l'image dans les deux modes, et l'utilisateur a explicitement demandé/approuvé en conversation la bascule vers `contain` **y compris pour `CharacterAvatar`** (pour rester cohérent avec l'outil d'édition) — décision déjà actée par l'utilisateur, pas de nouvelle question à trancher ; la note "Out of Scope" du fichier de story a été mise à jour en conséquence pour refléter le scope réel approuvé.

## Dev Notes

### ⚠️ Correction critique par rapport à l'epic (`epics.md` obsolète sur ce point)

`epics.md` §Story 4.7 mentionne une "proportion 90×110" pour le cadre PDF — **ces valeurs sont obsolètes**, héritées d'une estimation initiale de la Story 4.6 jamais vérifiée. Les coordonnées **réellement mesurées et livrées** en Story 4.6 sont dans `apps/api/src/characters/ryuutama-pdf.service.ts` :
```ts
const PORTRAIT_X = 344.87;
const PORTRAIT_Y = 646.92;
const PORTRAIT_WIDTH = 188.18;
const PORTRAIT_HEIGHT = 136.48;
```
Ratio réel ≈ **1.379** (paysage, plus large que haut) — pas 90:110 (portrait, ratio ≈ 0.818). Utiliser `PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` (déjà exportées ou à exporter depuis `ryuutama-pdf.service.ts`) comme source de vérité pour dimensionner le masque de prévisualisation `PortraitCropper` en mode `rect`, jamais les valeurs de l'epic.

**Item déjà déféré lors de la revue de la Story 4.6** (`deferred-work.md`, entrée "4-6-attribution-personnage-pdf") : le README `apps/api/game-systems/ryuutama/assets/README.md` documente encore les anciennes valeurs 451/662/90/110, en contradiction avec le code livré. Cette story touchant à nouveau `embedPortrait`, c'est le bon moment pour corriger ce README au passage (déjà demandé par les Dev Notes de l'epic lui-même : "à déterminer empiriquement [...] puis à documenter dans ce README").

### Le vrai défi technique : `pdf-lib` ne sait pas "cropper" une image

`pdf-lib` (`^1.17.1`, déjà utilisé) n'a **aucune méthode pour dessiner une sous-région d'une image embarquée** — `page.drawImage()` dessine toujours l'image entière, mise à l'échelle dans la boîte `{x, y, width, height}` donnée. Reproduire un recadrage (comme `object-fit: cover` + zoom + pan en CSS côté web) nécessite un **clip path bas niveau** :

```ts
import { pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib';
// ...
page.pushOperators(
  pushGraphicsState(),
  rectangle(frameX, frameY, frameWidth, frameHeight),
  clip(),
  endPath(),
);
page.drawImage(image, { x: drawX, y: drawY, width: drawWidth, height: drawHeight }); // image surdimensionnée, positionnée pour que la zone voulue tombe dans le cadre
page.pushOperators(popGraphicsState());
```
**Confirmé disponible** dans la version installée de ce repo (`pushGraphicsState`, `popGraphicsState`, `rectangle`, `clip` sont bien exportés par le package `pdf-lib` du conteneur `api`). Ne **pas** tenter de recouper les octets de l'image en amont (aucune lib de traitement d'image dans le repo, cf. décision déjà actée en Story 4.5 de ne pas en ajouter) — le clip path est la seule option cohérente avec l'existant.

### Sémantique attendue de `computePdfCropDraw` (à calquer sur `PortraitCropper`)

Le contrat visuel : ce que l'utilisateur voit dans le masque rectangulaire de `PortraitCropper` (`apps/web/.../portrait-cropper.ts`, `transform = translate(offsetX%, offsetY%) scale(scale)` appliqué à une image en `object-fit: cover` du conteneur) doit correspondre **visuellement** à ce qui est dessiné dans le cadre PDF. Approche recommandée pour la fonction pure :
1. `coverScale = max(frameWidth / imageWidth, frameHeight / imageHeight)` (équivalent de `object-fit: cover` — l'image couvre tout le cadre, éventuellement rognée)
2. `totalScale = coverScale * cropData.scale` (le zoom utilisateur, bornes `MIN_PORTRAIT_SCALE`/`MAX_PORTRAIT_SCALE` = 1..3, déjà validées par `PortraitCropDataDto`)
3. `drawWidth = imageWidth * totalScale`, `drawHeight = imageHeight * totalScale`
4. Position de base centrée dans le cadre, puis décalée par `offsetX`/`offsetY` (pourcentages -100..100, déjà bornés par le DTO) — **vérifier empiriquement** le sens et l'ampleur exacts du décalage par rapport au rendu réel de `PortraitCropper` (ouvrir le composant dans le navigateur avec des valeurs connues et comparer visuellement au PDF exporté), plutôt que de supposer une formule sans la valider — même démarche de vérification empirique que les coordonnées `PORTRAIT_X/Y/WIDTH/HEIGHT` en Story 4.6.
5. Clamp : si `totalScale` est au minimum (1× cover) l'image ne peut pas être décalée hors du cadre (elle le couvre tout juste) — aux zooms plus élevés, un `offsetX/offsetY` à ±100 reste dans les bornes déjà validées côté DTO, mais la fonction doit rester **défensive** (jamais de région qui sortirait entièrement de l'image source, jamais de `NaN`/`Infinity`) — c'est précisément l'esprit de l'AC5 (cas "offset qui pousserait hors de l'image, clampé").

### Precedents à réutiliser (ne pas réinventer)

- **`fitCentered`** (`ryuutama-pdf.service.ts`, Story 4.6) : fonction pure de référence pour le style (signature, testabilité indépendante de `pdf-lib`) — `computePdfCropDraw` doit suivre le même style, et rester utilisée telle quelle pour AC4 (pas de `pdfPortraitCropData` → comportement 4.6 inchangé).
- **`PortraitCropDataDto`** (`apps/api/src/characters/dto/portrait-crop-data.dto.ts`) : forme et bornes déjà exactement adaptées à `pdfPortraitCropData` — **ne pas dupliquer**, réutiliser la classe telle quelle pour le nouveau endpoint.
- **Verrou optimiste `updatedAt`** (`CharacterService.updatePortrait`/`removePortrait`, Story 4.5/4.6) : pattern exact à reproduire pour `updatePdfPortraitCrop` (`updateMany` + `count === 0` → `ConflictException`).
- **Accès propriétaire seul** (`getOwnCharacterOrThrow`) : réutiliser tel quel, même règle que les autres mutations de portrait (le MJ reste lecture seule, FR39).
- **`resolveOwnerInfo`** (Story 4.6) : aucun changement nécessaire ici, cette story ne touche pas à l'attribution MJ/joueur.

### Limitation connue déjà actée (Story 4.6, `deferred-work.md`)

`embedPortrait`/`fitCentered` n'ont pas de garde défensive sur `doc.getPages()[0]` (template sans page) ni sur une image embarquée de dimensions 0×0 — risque jugé très faible et différé lors de la revue 4.6. Cette story touchant à nouveau `embedPortrait`, ajouter ces gardes en passant serait une amélioration bienvenue mais **reste hors scope strict** des AC de cette story — à la discrétion du développeur si le temps le permet, ne pas bloquer dessus.

### Project Structure Notes

- Modifie : `apps/api/prisma/schema.prisma` (+ migration), `packages/shared/src/index.ts`, `apps/api/src/characters/characters.controller.ts`, `apps/api/src/characters/character.service.ts` (+ `.spec.ts`), `apps/api/src/characters/ryuutama-pdf.service.ts` (+ `.spec.ts`), `apps/web/src/app/features/characters/portrait-cropper/*`, `apps/web/src/app/features/characters/character-sheet/*`, `apps/web/src/app/core/characters/character.service.ts` (+ `.spec.ts`).
- Aucun nouveau fichier attendu (généralisation de composants/services existants, pas de nouveau composant).
- Migration Prisma requise (contrairement à la Story 4.6) : un nouveau champ DB `pdfPortraitCropData`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.7] — ACs sources (attention à la correction critique ci-dessus sur les proportions du cadre)
- [Source: apps/api/src/characters/ryuutama-pdf.service.ts] — `fitCentered`, `embedPortrait`, constantes `PORTRAIT_X/Y/WIDTH/HEIGHT` réelles à réutiliser
- [Source: apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts] — composant à généraliser (forme circle/rect)
- [Source: apps/api/src/characters/dto/portrait-crop-data.dto.ts] — DTO à réutiliser tel quel pour `pdfPortraitCropData`
- [Source: apps/api/src/characters/character.service.ts] — patterns `updatePortrait`/`removePortrait` (verrou optimiste, accès propriétaire) à reproduire pour `updatePdfPortraitCrop`
- [Source: _bmad-output/implementation-artifacts/4-6-attribution-personnage-pdf.md] — story précédente : mesure empirique des coordonnées PDF, review findings (README obsolète, gardes défensives différées)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 4-6-attribution-personnage-pdf] — items différés pertinents pour cette story

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Completion Notes List

- AC1 satisfait : `PortraitCropper` généralisé via `shape` (`circle`/`rect`), masque rectangulaire au ratio réel du cadre PDF (`RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO`, partagé `@master-jdr/shared`) ; bouton "Ajuster le cadrage PDF" ouvre le dialogue en mode `rect` en réutilisant le portrait déjà uploadé (pas de nouvel upload).
- Point d'implémentation non anticipé par la story : `MatDialog.open()` ne peut pas binder un `input()` de composant (seul `MAT_DIALOG_DATA` est injectable dans un composant instancié dynamiquement) — résolu via `PortraitCropperData.shape` qui prime sur l'`input()` `shape` quand le composant est ouvert en dialogue (`effectiveShape` computed), l'usage direct en template (assistant de création) reste inchangé.
- AC2 satisfait : nouvel endpoint `PATCH /characters/:id/pdf-portrait-crop` (`PortraitCropDataDto` réutilisé tel quel, verrou optimiste `updatedAt`, accès propriétaire seul, `BadRequestException` si aucun portrait) ; `pdfPortraitCropData` enregistré séparément de `portraitCropData`, sans upload de fichier.
- AC3 satisfait : `computePdfCropDraw` (fonction pure) + clip path bas niveau `pdf-lib` (`pushGraphicsState`/`rectangle`/`clip`/`endPath`/`popGraphicsState`, confirmés exportés par `pdf-lib@1.17.1` dans ce repo) — `pdf-lib` ne sachant pas dessiner une sous-région d'image, l'image surdimensionnée est dessinée puis clippée au cadre.
- AC4 satisfait : sans `pdfPortraitCropData`, `embedPortrait` utilise toujours `fitCentered` (Story 4.6), aucun clip path appliqué — testé explicitement (aucune régression).
- AC5 satisfait : `computePdfCropDraw` unit-testé (zoom neutre, zoom max + offset aux bornes, offset hors marge disponible clampé à 0 dans les deux axes) — le clamp est calculé par marge disponible (`(width - frameWidth) / 2`), garantissant que le cadre reste toujours entièrement couvert, jamais de `NaN`/`Infinity`.
- Correction apportée à l'epic source pendant l'implémentation : les proportions du cadre PDF (90×110, mentionnées dans `epics.md`) étaient obsolètes — remplacées par les vraies valeurs mesurées en Story 4.6 (188.18×136.48, ratio paysage) via la constante partagée `RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO`.
- `pnpm lint --fix` et `pnpm test` passent intégralement : `api` 223 tests, `web` 261 tests, `packages/game-rules` 27 tests (aucune régression). Les erreurs `no-unsafe-assignment`/`no-unsafe-member-access` restantes sur `toDto(character: any, ...)` sont un pattern pré-existant (déjà présent avant cette story), une ligne de plus pour `pdfPortraitCropData` ne change pas de catégorie.

### File List

- `apps/api/prisma/schema.prisma` (modifié — `Character.pdfPortraitCropData`)
- `apps/api/prisma/migrations/20260705172003_pdf_portrait_crop_data/migration.sql` (nouveau)
- `packages/shared/src/index.ts` (modifié — `CharacterDto.pdfPortraitCropData`, `RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO`)
- `apps/api/src/characters/character.service.ts` (modifié — `updatePdfPortraitCrop`, `toDto`, refactor `findOne` pour éviter une requête `partie` redondante)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/src/characters/characters.controller.ts` (modifié — `PATCH :id/pdf-portrait-crop`)
- `apps/api/src/characters/characters.controller.spec.ts` (modifié)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (modifié — `computePdfCropDraw`, `embedPortrait` avec clip path)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (modifié)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.ts` (modifié — `shape`, `effectiveShape`, `initialCropData`)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.html` (modifié)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.scss` (modifié)
- `apps/web/src/app/features/characters/portrait-cropper/portrait-cropper.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — `editPdfPortraitCrop`, `savePdfPortraitCrop`)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character.service.ts` (modifié — `patchPdfPortraitCrop`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character.util.spec.ts` (modifié — `CharacterDto` de test enrichi)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.scss` (modifié — `object-fit: contain` pour cohérence avec `PortraitCropper`)
- `apps/web/src/app/core/theme/tones.ts` (modifié — clé `character.pdf_crop_edit_cta` ×3 thèmes)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (modifié — `CharacterDto` de test enrichi)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — `CharacterDto` de test enrichi)

### Change Log

- 2026-07-05 : Implémentation complète de la Story 4.7 (Tasks 1-5).
- 2026-07-05 : Correction de deux bugs signalés par l'utilisateur après implémentation :
  1. **Vignette de recadrage tronquée en haut/bas** (`PortraitCropper`, modes circle et rect) — `.portrait-cropper__preview` est un flex-item d'un conteneur `flex-direction: column` sans `flex-shrink: 0` ; dans une `MatDialog` à hauteur contrainte, flexbox pouvait comprimer le cercle/rectangle en dessous de sa taille prévue (220px), faisant apparaître `object-fit: cover` plus agressif que voulu. Correctif : `flex-shrink: 0` ajouté sur `.portrait-cropper__preview`.
  2. **Résultat PDF ne correspondant pas à l'aperçu web** — `computePdfCropDraw` résolvait `offsetX`/`offsetY` (pourcentages) contre la taille de l'image **après** application du zoom (`width`/`height` mis à l'échelle), alors que la sémantique CSS réelle de `transform: translate(%) scale()` (utilisée par `PortraitCropper`) résout ces pourcentages contre la boîte de layout de l'élément (le cadre, taille fixe), non affectée par le `scale()` du même transform. Un même offset produisait donc un déplacement différent selon le niveau de zoom entre le web et le PDF. Correctif : les pourcentages sont désormais résolus contre `frameWidth`/`frameHeight` (fixes) plutôt que contre `width`/`height` (mis à l'échelle) ; nouveau test de régression ajouté verrouillant ce comportement.
- 2026-07-05 : Après vérification utilisateur, le fix #1 ci-dessus n'était qu'une amélioration partielle — la vraie cause de la troncature était que la base du recadrage (`scale=1`) utilisait `object-fit: cover`/`Math.max` (l'image est zoomée pour **toujours remplir tout le cadre**, masquant structurellement le haut/bas dès que le ratio image ≠ ratio cadre — très visible en mode PDF, cadre large 188×136). Trois changements pour corriger, en gardant la cohérence de bout en bout (l'outil d'édition doit montrer ce que verra le rendu final) :
  1. `computePdfCropDraw` (API) : base changée de `cover` (`Math.max`) à `contain` (`Math.min`) — à `scale=1`, l'image entière est toujours visible, jamais rognée ; zoomer (1-3) permet de resserrer si voulu. Tests mis à jour en conséquence.
  2. `PortraitCropper` (web, les deux modes circle/rect) : `object-fit: cover` → `contain` sur `.portrait-cropper__preview-img`, + un fond en damier sur `.portrait-cropper__preview` pour visualiser clairement les zones hors image (ou une transparence PNG).
  3. **Cohérence avatar** : `CharacterAvatar` (rendu final de l'avatar dans les listes/l'en-tête de fiche, `object-fit: cover` historique) basculé lui aussi en `contain` — sans ce changement, l'aperçu de l'outil d'édition (désormais `contain`) et le rendu final de l'avatar (resté `cover`) auraient interprété différemment les mêmes valeurs `scale`/`offsetX`/`offsetY` stockées, rendant l'édition trompeuse. `PortraitPanel` (image complète non recadrée) et `fitCentered` (repli sans recadrage dédié PDF, Story 4.6) étaient déjà en `contain`/`Math.min` — cette bascule aligne tout le pipeline sur une seule sémantique cohérente.
  - Bouton "Ajuster le cadrage PDF" déplacé sous les boutons d'export PDF (`sheet__export-actions`, restructuré en colonne avec une ligne interne `sheet__export-buttons` pour les deux boutons d'export) plutôt qu'à côté de "Modifier le portrait" — regroupement plus logique demandé par l'utilisateur.
  - Transparence (PNG) : déjà gérée de bout en bout sans changement de code nécessaire — `portraitUrl` stocke les octets sources tels quels (aucun ré-encodage, `portrait-storage.util.ts`), le `<img>` web affiche nativement l'alpha PNG, et `pdf-lib.embedPng()` préserve le canal alpha (SMask) à l'intégration dans le PDF. Non applicable au JPEG (format sans canal alpha) ; le WEBP reste non embarquable dans le PDF (limitation `pdf-lib` déjà documentée en Story 4.6, indépendante de la transparence).
- 2026-07-05 : Code review (`/bmad-code-review`) — 5 patches appliqués :
  1. `parsePdfPortraitCropData` valide désormais la **plage** (`Number.isFinite` + bornes `MIN/MAX_PORTRAIT_SCALE/OFFSET`, réutilisées de `PortraitCropDataDto`) en plus du type — une donnée legacy/corrompue (`NaN`, `Infinity`, hors bornes) dégrade proprement vers `fitCentered` plutôt que de produire une géométrie invalide.
  2. `embedPortrait` : `try/finally` autour de `drawImage` dans la branche clip path — `popGraphicsState()` s'exécute toujours, même si `drawImage` lève.
  3. `PortraitCropper.ngOnInit` clampe désormais `initialCropData` (`clampScale`/`clampOffset` + garde `Number.isFinite`) avant de l'appliquer aux signaux.
  4. Docstring `updatePdfPortraitCrop` corrigée ("Story 4.6" → "Story 4.7").
  5. **Tentative révertée** : essayé de déplacer `PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` vers `@master-jdr/shared` comme source de vérité unique (au lieu de la duplication avec `RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO`) — cassait toute la suite `api` sous Jest (`SyntaxError: Unexpected token 'export'`) car `@master-jdr/shared` est une frontière **types uniquement, effacée au runtime** (CLAUDE.md) : Jest ne transforme pas ce module en dépendance de workspace, donc un import de *valeur* runtime depuis l'API échoue. Reverté vers les littéraux locaux ; la duplication documentée (commentaires croisés) reste la seule option sans construire `@master-jdr/shared` en JS. **Leçon pour les stories futures** : ne jamais importer une valeur runtime (seulement des `type`) depuis `@master-jdr/shared` côté `apps/api`.
  - Suite complète après ces patches : `api` 232 tests, `web` 263 tests, `packages/game-rules` 27 tests (aucune régression).
