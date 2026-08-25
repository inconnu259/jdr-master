---
baseline_commit: 3bb8f35
---

# Story 29.12: Image de couverture de partie

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want donner à ma partie une image qui lui ressemble,
so that son identité ne dépende pas seulement de ce que l'algorithme a tiré.

## Acceptance Criteria

1. **Given** je suis MJ d'une partie, **When** je dépose une image de couverture, **Then** elle est enregistrée et devient l'identité visuelle de la partie.
2. **Given** une partie porte une image, **When** elle s'affiche, **Then** l'image remplace la bannière générée dans tous les modes d'affichage, **and** l'animation du thème ne l'accompagne pas.
3. **Given** je retire l'image, **When** je valide, **Then** la bannière générée reprend sa place.
4. **Given** je suis joueur et non MJ de cette partie, **When** je tente de déposer une image, **Then** l'action est refusée.
5. **Given** un dépôt d'image, de portrait ou de couverture, **When** il est traité, **Then** il passe par l'utilitaire partagé : validation du type par octets magiques, nettoyage des métadonnées EXIF, gardes contre la traversée de chemin.
6. **Given** le plafond de taille, **When** il est appliqué au contrôleur de couverture, **Then** il y est redéclaré — il n'est pas factorisable dans l'utilitaire.
7. **Given** le refactor de l'utilitaire est terminé, **When** la suite de tests s'exécute, **Then** le service d'export PDF et le mock du test de personnage ont été mis à jour, **and** aucun test ne passe silencieusement à côté de son sujet.
8. **Given** une image de couverture, **When** elle est servie au navigateur, **Then** c'est par un endpoint sous garde, jamais en fichier statique.
9. **Given** une liste de parties en grande vignette sur téléphone, chacune portant une image de couverture, **When** la liste se charge, **Then** ce ne sont pas les fichiers d'origine qui sont transférés, **and** l'image servie est dimensionnée pour le mode d'affichage demandé, **and** le poids total reste sans rapport avec N fois le plafond de dépôt.

## 🚨 Cette story est d'abord un REFACTOR de sécurité, ensuite une fonctionnalité

AC5 et AC7 ne sont pas de l'hygiène de code : **la validation MIME par octets magiques et le nettoyage EXIF sont des mécanismes de sécurité**. AD-17 est explicite sur le risque : *« des chemins d'upload maintenus en parallèle dont un seul bénéficierait d'un durcissement futur […] les dupliquer garantit qu'ils divergeront, et le Palier 16 a montré que ce durcissement arrive par vagues »*.

**Il existe déjà trois chemins d'upload**, et le troisième ne doit surtout pas naître par copie du premier :

| Chemin | Où | État |
| --- | --- | --- |
| Portraits de personnage | `characters/image-mime.util.ts` + `portrait-storage.util.ts` + écriture disque **enfouie dans `character.service.ts`** | À **extraire** |
| Documents de scénario | `scenarios/document-storage.util.ts` | Existant, hors périmètre |
| **Couvertures de partie** | à créer | **Doit consommer l'utilitaire extrait** |

**L'ordre de travail n'est pas négociable : extraire d'abord, construire ensuite.** Écrire le contrôleur de couverture avant l'extraction, c'est créer le quatrième chemin parallèle que cette story existe pour empêcher.

### Ce qui s'extrait, ce qui se redéclare, ce qui reste (AD-17, verbatim)

- **Extrait** : validation MIME par octets magiques, nettoyage EXIF (`sharp().autoOrient()`), gardes anti-traversée de chemin — aujourd'hui **codées en dur pour les portraits** (`PORTRAIT_FILENAME_RE`, préfixe `/uploads/portraits/`), à **paramétrer par domaine** — et **l'écriture disque**, aujourd'hui dans `character.service.ts` alors que `portrait-storage.util.ts` ne fait que lire.
- **Redéclaré, jamais factorisé** : le plafond de 5 Mo. Il vit dans des **décorateurs de contrôleur** (`FileInterceptor.limits`, `MaxFileSizeValidator`, `MulterExceptionFilter`) — la double garde est à **rejouer** sur le contrôleur de couverture. AC6 le dit ; ne pas essayer d'être malin.
- **Reste au personnage** : le verrou optimiste `updatedAt` et l'émission SSE qui entourent l'écriture du portrait ne suivent **pas** dans l'utilitaire.

### 🔥 Deux consommateurs qui casseront SILENCIEUSEMENT (AC7)

1. **`ryuutama-pdf.service.ts:30`** importe `readPortraitFile` depuis `./portrait-storage.util`. Un déplacement non répercuté casse l'export PDF — bruyamment à la compilation, donc peu risqué.
2. **`character.service.spec.ts:48`** fait `jest.mock('./image-mime.util', () => ({ … }))`. **C'est celui-là le danger** : si le chemin change, le mock ne s'applique plus à rien, **le test continue de passer**, et il teste désormais le vrai `sharp` au lieu du double. AD-17 le nomme explicitement (« devient inopérant sans bruit »). AC7 exige : *« aucun test ne passe silencieusement à côté de son sujet »* — c'est-à-dire qu'après le refactor, **il faut prouver que le mock mocke encore**.

## Contexte

**Douzième story de l'épic 29.** Elle livre la moitié « téléversée » de CAP-20, dont la Story 29.10 a livré la moitié « générée ». Elle porte aussi **le seul changement de schéma de tout le bloc 29.10-29.12** : `Partie.coverImageUrl`.

**Ce que les stories 29.10/29.11 ont posé et qui vous concerne directement :**
- `PartyBanner` (`apps/web/src/app/shared/party-banner/`) rend la composition générée dans trois modes, pilotés par les classes d'hôte `party-banner-host--large|medium|compact`. **C'est le seul point de rendu** — AD-19 en fait un invariant.
- **Les animations sont scopées sous `:host(.party-banner-host--large)`** dans `party-banner.scss`. AD-19 impose que *« l'animation du thème n'accompagne que la bannière générée, jamais une image téléversée »* (AC2, seconde clause) : avec une image, il ne doit **rien** rester d'animé. Le plus simple et le plus sûr : ne pas rendre la composition du tout, donc rien à couper.
- `bannerParams()` reste **strictement intouché**. La bannière générée doit réapparaître à l'identique au retrait de l'image (AC3) : toucher au flux de tirage la changerait.
- Le composant `PartyCountdown` et la signalétique d'état ne sont pas concernés.

**Ce qui existe déjà côté serveur, et qu'il faut lire avant d'écrire :**
- `characters.controller.ts:131-191` — le patron **complet** d'un endpoint d'image : `GET` renvoyant un `StreamableFile` typé, `PUT` avec `@UseFilters(MulterExceptionFilter)` + `FileInterceptor(memoryStorage, limits)` + `ParseFilePipe(MaxFileSizeValidator, errorHttpStatusCode: 413)`, `DELETE`. **À reproduire, pas à réinventer.**
- `character.service.ts:527-572` — `updatePortrait()` : détection MIME → nettoyage EXIF → `mkdir` → `writeFile` sous un nom `randomUUID()` → écriture DB → **nettoyage du fichier orphelin si la DB échoue**. Ce dernier point est un vrai apprentissage : le reproduire.
- `common/uploads-root.ts` (`UPLOADS_ROOT`), `common/filters/multer-exception.filter.ts` — déjà partagés, à réutiliser tels quels.
- `PartiesService.getOwned()` (ligne 199) et `getViewable()` (ligne 207) — **les gardes existent déjà**. AD-17 : écriture réservée au MJ via `getOwned`, lecture ouverte à tout membre via `getViewable`. Aucune garde à écrire, seulement à appeler (AC4).

## Acceptance Criteria — traduction en invariants testables

| AC | Invariant vérifiable |
| --- | --- |
| 4 | Un joueur non-MJ reçoit un refus sur `PUT` **et** sur `DELETE` — testé sur les deux verbes, pas seulement l'upload. |
| 5 | `git grep` : **une seule** implémentation de la détection par octets magiques et du `autoOrient()` dans `apps/api/src`. Le service de couverture n'appelle jamais `sharp` directement pour ces deux tâches. |
| 6 | Le contrôleur de couverture déclare son plafond **deux fois** (interceptor + pipe) et monte `MulterExceptionFilter`. Un fichier de 6 Mo → 413, pas 500. |
| 7 | Après refactor, un test prouve que le double de `image-mime.util` est **effectivement appliqué** (p. ex. un mime rejeté par le mock l'est bien par le service). |
| 8 | Aucune entrée statique n'est ajoutée dans `main.ts`. L'image passe par un contrôleur portant la garde d'authentification. |
| 9 | Une réponse pour `mode=compact` pèse **au moins un ordre de grandeur** de moins que le fichier déposé. Le `mode` est validé contre une **union fermée** — jamais une largeur arbitraire venue du client. |

## Tasks / Subtasks

### Refactor de sécurité — À FAIRE EN PREMIER (AC5, AC7)

- [x] Task 1 — Extraire l'utilitaire d'upload partagé (AC: #5)
  - [x] Créé `apps/api/src/common/image-upload.util.ts` — chemin imposé par le Structural Seed.
  - [x] Fonctions déplacées **sans réécriture** : `detectImageMime()`, `stripImageMetadata()`, `extensionForImageMime()`, `mimeForExtension()`.
  - [x] **Paramétré par domaine** : `PORTRAIT_FILENAME_RE` généralisée en `isValidUploadFilename()` (même motif `<uuid v4>.<ext connue>`), `extractUploadFilename(fileUrl, urlPrefix)` prend le préfixe en paramètre.
  - [x] Écriture disque remontée : `writeUploadFile(dir, buffer, mime)` (mkdir + randomUUID + writeFile), `unlinkUploadFile(dir, filename)`.
  - [x] **Décision tranchée** : `characters/image-mime.util.ts` et `portrait-storage.util.ts` **supprimés**, tous les sites d'appel mis à jour (recommandation de la story retenue — un ré-export aurait laissé deux chemins d'import vivants, exactement l'ambiguïté qu'AD-17 combat).

- [x] Task 2 — Répercuter sur les consommateurs, en prouvant que rien ne casse en silence (AC: #5, #7)
  - [x] `ryuutama-pdf.service.ts:30` — importe désormais `readPortraitFile` depuis `./character.service` (le wrapper domaine portrait vit maintenant là, la lecture disque générique dans `common/image-upload.util.ts`).
  - [x] `character.service.ts` — consomme l'utilitaire extrait (`writeUploadFile`/`unlinkUploadFile`/`extractUploadFilename`). Verrou optimiste `updatedAt`, émission SSE, nettoyage du fichier orphelin sur échec DB : **inchangés**.
  - [x] `character.service.spec.ts:48` — `jest.mock('../common/image-upload.util', ...)` pointe sur le nouveau chemin. **Test ajouté** (« AC7 : le jest.mock de stripImageMetadata cible bien le module courant ») : valeur mockée volontairement impossible à produire par un vrai `sharp()` sur `JPEG_BUFFER`, prouvant que le double est bien appliqué.
  - [x] Suite API **complète** relancée après cette tâche : **53/53 suites, 1094/1094 tests verts**, `pnpm typecheck` propre.

### Backend — la couverture

- [x] Task 3 — Schéma et projection (AC: #1, #2, #3)
  - [x] `schema.prisma`, modèle `Partie` — `coverImageUrl String?` ajouté. `null` = bannière générée. Aucun autre champ.
  - [x] Migration `20260812214714_partie_cover_image` créée et appliquée, `prisma generate` exécuté, conteneur `api` redémarré réellement (`Nest application successfully started` confirmé).
  - [x] Projection : `PartieDto.coverImageVersion: string | null` (décision retenue, cf. Décisions) — dérivé de `coverImageUrl` via `coverImageVersion()` dans `parties.service.ts`, jamais le chemin de stockage.

- [x] Task 4 — `PartyCoverController` (AC: #1, #3, #4, #6, #8)
  - [x] `apps/api/src/parties/party-cover.controller.ts` créé, enregistré dans `PartiesModule`.
  - [x] `PUT`/`DELETE /parties/:id/cover` — MJ seul via `PartiesService.getOwned()` (appelé à l'intérieur de `setCoverImage()`/`removeCoverImage()`).
  - [x] `GET /parties/:id/cover` — `getViewable()`, `StreamableFile` typé, `mode` validé par `GetCoverDto` (`@IsIn(LIST_VIEW_MODES)`). Aucun ajout dans `main.ts`.
  - [x] Plafond redéclaré deux fois (`FileInterceptor.limits` + `ParseFilePipe(MaxFileSizeValidator)`), `MulterExceptionFilter` monté — `MAX_COVER_SIZE` propre au contrôleur, jamais importé de `characters.controller.ts`.
  - [x] Détection MIME → nettoyage EXIF → écriture disque (3 dérivées) → mise à jour DB, nettoyage des fichiers orphelins si une étape échoue après coup. Remplacement : les 3 anciennes dérivées supprimées.
  - [x] Émission temps réel : `emitPartieAndMembersSafe()` appelée après dépôt et après retrait (patron `close()`/`reopen()` — `partieTopic` n'était pas déjà émis ailleurs pour cette mutation).

- [x] Task 5 — Dérivées dimensionnées (AC: #9)
  - [x] `mode` validé contre l'union fermée `LIST_VIEW_MODES` via `GetCoverDto`.
  - [x] Dimensions : `large` 640×248, `medium` 88×88, `compact` 56×56 (320×124/44×44/28×28 ×2, densité d'écran fixée côté serveur).
  - [x] `sharp` déjà présent, aucune installation.
  - [x] `Cache-Control: public, max-age=31536000, immutable` + `ETag` dérivé du jeton de version sur `GET`.
  - [x] Cache-busting : jeton de version (`coverImageVersion`, le stem UUID) passé par le front en paramètre de requête — le serveur ne le valide pas, il sert uniquement à faire varier l'URL côté navigateur.
  - [x] Recadrage centré (`fit: 'cover', position: 'centre'`) — pas de déformation.
  - [x] **Dérivées en WebP**, décision déjà actée par la story et retenue telle quelle. **Gain mesuré** (script jetable, image de test 1600×1200 bruitée en JPEG qualité 85, ~1,37 Mo) : dérivée `large` (640×248) → **65 Ko (≈21×** plus léger que l'original) ; dérivée `compact` (56×56) → quelques centaines d'octets. Un bruit aléatoire compresse artificiellement mieux qu'une vraie photo (moins de cohérence spatiale) ; une photo réelle donnera un ratio plus modeste mais dans le même ordre de grandeur — largement suffisant pour AC9 (« poids total sans rapport avec N fois le plafond de 5 Mo »).

### Frontend

- [x] Task 6 — `PartyBanner` : l'image l'emporte dans les trois modes (AC: #2, #3)
  - [x] Entrée `coverImageVersion: string | null`. Non-null : rend `<img class="party-banner">` (source = `GET /parties/:id/cover?mode=…&v=…`) **au lieu de** la composition générée.
  - [x] La composition n'est **jamais rendue** quand une image est présente (branche `@if` exclusive) — garantit AC2 seconde clause sans désactiver quoi que ce soit.
  - [x] `aria-hidden="true"`, `alt=""` sur l'`<img>`.
  - [x] Retrait vérifié par test : `coverImageVersion` repassé à `null` fait réapparaître la composition SVG (bannerParams() non touché).
  - [x] Repli si le fichier a disparu : `(error)="onCoverImageError()"` sur l'`<img>` bascule un signal `coverImageFailed`, réinitialisé par un `effect()` à chaque changement de `coverImageVersion` (permet de retenter après un remplacement).
  - [x] `party-banner.util.ts` : non modifié.

- [x] Task 7 — Écran MJ : déposer et retirer (AC: #1, #3, #4)
  - [x] Section couverture ajoutée à `partie-form.html`/`.ts` (écran d'édition existant), visible uniquement en édition (`editId()` posé — aucun identifiant à cibler à la création). Aucun nouvel écran créé.
  - [x] Dépôt/retrait indépendants du formulaire réactif (`onCoverFileSelected()`/`removeCoverImage()`), pas de recadrage client (décision : recadrage centré automatique côté serveur, cf. Task 5/Décisions) — pas de réutilisation de `PortraitCropper`, dont le rôle (recadrage manuel) ne s'applique pas ici.
  - [x] `PartiesService` (front) étendu (`setCoverImage()`/`removeCoverImage()`, `FormData` + `PUT`/`DELETE`). La garde serveur (`getOwned()`) reste la vraie garde AC4 ; aucun masquage de rôle ajouté côté client au-delà de la condition d'édition déjà existante.

### Tests

- [x] Task 8 — Refactor : non-régression et preuve que les mocks mockent (AC: #5, #7)
  - [x] Suite API complète verte après la Task 2 (53/53 suites, 1094/1094 tests), avant toute ligne de couverture.
  - [x] Test dédié ajouté (`character.service.spec.ts`, cf. Task 2) prouvant que le double de `stripImageMetadata` est effectivement appliqué après déplacement.
  - [x] Export PDF : `ryuutama-pdf.service.spec.ts` (describe « intégration du portrait ») reste vert — commentaire de référence au chemin périmé corrigé au passage.

- [x] Task 9 — `party-cover.controller.spec.ts` : gardes et plafond (AC: #4, #6, #8)
  - [x] Joueur non-MJ → 403 sur `PUT` et sur `DELETE` (service mocké reflétant `getOwned()`).
  - [x] Non-membre → 403 sur `GET` (service mocké reflétant `getViewable()`).
  - [x] Fichier de 6 Mo → 413 via le pipeline HTTP réel, service jamais appelé.
  - [x] Fichier non-image (`Content-Type: image/png` mais octets invalides) → 400.
  - [x] `mode` hors union → 400 côté `ValidationPipe`, service jamais appelé. `coverImageUrl` corrompu en base (service renvoyant `null`) → 404, jamais un accès disque non gardé côté contrôleur. 9/9 tests verts.

- [x] Task 10 — Service : cycle de vie de l'image (AC: #1, #3, #9)
  - [x] Dépôt → `coverImageUrl` renseigné en DB, 3 dérivées écrites (`writeFile` × 3, une par mode).
  - [x] Redimensionnement : dimensions distinctes par mode vérifiées (640×248/88×88/56×56, jamais une largeur unique).
  - [x] Remplacement → les 3 anciennes dérivées supprimées (`unlink` × 3), pas laissées orphelines.
  - [x] Retrait → `coverImageUrl` remis à `null`, les 3 dérivées supprimées.
  - [x] Échec DB après écriture disque → les 3 dérivées fraîchement écrites nettoyées, erreur propagée.
  - [x] `mode` hors union → rejeté par `GetCoverDto` (testé côté contrôleur, Task 9) — au niveau service, le type `ListViewMode` l'empêche à la compilation.
  - [x] Dérivée `compact` significativement plus légère : mesure manuelle (cf. Task 5) — assertion automatisée portée sur le mécanisme (dimensions de redimensionnement correctes par mode), la mesure d'octets réelle nécessitant un vrai `sharp()` non mocké.
  - [x] `coverImageUrl` renseigné mais fichier absent du disque → `null`, jamais une exception (CAP-20).
  - [x] Dépôt et retrait émettent chacun `partieTopic`/`userTopic`. 20/20 tests dédiés verts (91/91 pour tout `parties.service.spec.ts`).
  - [x] Le jeton de version change après un remplacement (`coverImageVersion()` dérivé du nouveau `stem` à chaque dépôt — vérifié par le test AC1 « dépôt »).

- [x] Task 11 — `party-banner.spec.ts` : l'image l'emporte (AC: #2, #3)
  - [x] Avec couverture → `<img>` rendu, aucune composition SVG, dans les trois modes.
  - [x] Sans couverture → composition générée inchangée.
  - [x] Source de l'image : `mode` courant + jeton de version tous deux vérifiés.
  - [x] Échec de chargement → repli sur la bannière générée ; un nouveau jeton de version après échec retente le chargement (test dédié).
  - [x] `aria-hidden="true"`/`alt=""` vérifiés.
  - [x] Non-régression capitale confirmée : tests grand/moyen caractère par caractère toujours verts (67/67 tests `party-banner*`). Câblage `Dashboard`→`PartyBanner` vérifié par un test dédié dans `dashboard.spec.ts`. `partie-form.spec.ts` étendu (11 tests) pour le dépôt/retrait écran MJ.

### Review Findings

_Revue de code (bmad-code-review, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `3bb8f35`), 2026-08-13._

- [x] [Review][Patch] `Cache-Control: immutable` fuyait sur les réponses 404 [apps/api/src/parties/party-cover.controller.ts] — posé via `@Header()` (décorateur de méthode), il s'appliquait aussi quand `getCoverFile()` retourne `null` (fichier disparu du disque, cas prévu par CAP-20) et la `NotFoundException` qui suit. Un navigateur/CDN honorant l'en-tête mémoriserait ce 404 pendant un an, masquant une restauration ultérieure du fichier au même chemin. Corrigé : `@Header()` retiré, `res.set('Cache-Control', ...)` déplacé dans la seule branche de succès (après confirmation que `file` n'est pas `null`). Test dédié ajouté.
- [x] [Review][Patch] `coverStem()` dupliquait exactement la logique de `coverImageVersion()` (extraction + validation du stem via `extractUploadFilename`) [apps/api/src/parties/parties.service.ts] — deux implémentations indépendantes de la même règle d'extraction, risque de dérive si le format d'URL change. Corrigé : `coverStem()` délègue maintenant à `coverImageVersion()`.
- [x] [Review][Patch] Calcul mort dans `getCoverFile()` [apps/api/src/parties/parties.service.ts] — `mimeForExtension(COVER_DERIVATIVE_EXT)` était appelé puis son résultat ignoré (le code retournait la constante `COVER_DERIVATIVE_MIME` à la place), pour une garde défensive que le commentaire lui-même qualifiait d'impossible à déclencher. Supprimé (import `mimeForExtension` retiré au passage).
- [x] [Review][Patch] Aucune garde anti-double-clic sur le dépôt/retrait de couverture côté front [apps/web/src/app/features/parties/partie-form/partie-form.ts] — `[disabled]="coverSaving()"` a un délai de peinture ; un second déclenchement avant ce délai enverrait deux requêtes concurrentes pour la même partie côté serveur (où aucun verrou optimiste n'existe, `Partie` n'ayant pas de champ `updatedAt`), risquant d'orpheliner les dérivées de la requête perdante. Corrigé : `if (this.coverSaving()) return;` ajouté en tête des deux handlers, même patron que d'autres gardes anti-double-clic déjà établies dans le projet. 2 tests dédiés ajoutés.
- [x] [Review][Patch] Indentation incohérente (4 espaces au lieu de 2) sur la ligne `coverImageVersion: null,` dans deux fixtures de test [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts, scenario-read-dialog.spec.ts] — corrigé.

- [x] [Review][Defer] Course concurrente sur deux dépôts simultanés pour la même partie [apps/api/src/parties/parties.service.ts, `setCoverImage()`] — sans verrou optimiste (`Partie` n'a pas de champ `updatedAt`, contrairement à `Character`), la requête dont l'`update()` « perd » la course laisse ses 3 dérivées fraîchement écrites orphelines sur disque. Correction propre nécessiterait un changement de schéma hors périmètre de cette story ; la garde anti-double-clic front (patch ci-dessus) referme le déclencheur le plus probable. [apps/api/src/parties/parties.service.ts]
- [x] [Review][Defer] Course lecture/écriture sur les dérivées de couverture — un `GET` lisant un fichier dérivé au moment exact où un `PUT` concurrent supprime les anciennes dérivées peut essuyer un `ENOENT` transitoire. Inhérent au stockage fichier sans coordination transactionnelle, même classe de risque déjà acceptée ailleurs dans le projet pour les fichiers de portrait. [apps/api/src/parties/parties.service.ts]
- [x] [Review][Defer] `sharp().resize()` sans `withoutEnlargement: true` — une image source plus petite que la dérivée cible est agrandie de force, dégradant silencieusement la qualité. Risque faible (erreur utilisateur : déposer une image minuscule), pas un défaut de sécurité/correction. [apps/api/src/parties/parties.service.ts, `setCoverImage()`]
- [x] [Review][Defer] Erreurs d'infrastructure (permissions disque, espace disque, ligne DB supprimée entre deux requêtes) remontent en 400 générique « image invalide » plutôt qu'en 500/404 différencié — même patron déjà établi pour l'échec de décodage EXIF du portrait, pas une régression propre à cette story. [apps/api/src/parties/parties.service.ts]
- [x] [Review][Defer] Aucun indicateur de chargement visible pendant le dépôt (seul l'état désactivé) — le traitement (nettoyage EXIF + 3 redimensionnements serveur) peut prendre plusieurs secondes sur une connexion lente sans retour visuel. Polish UX, pas un défaut fonctionnel. [apps/web/src/app/features/parties/partie-form/partie-form.html]
- [x] [Review][Defer] Aucune validation cliente (taille/type) avant l'envoi réseau — un fichier surdimensionné transite intégralement avant d'être rejeté par le serveur (413). Le dépôt de portrait a la même lacune ; convention déjà établie. [apps/web/src/app/features/parties/partie-form/partie-form.ts]
- [x] [Review][Defer] `sharp(...).webp()` appelé sans paramètre de qualité explicite — dépend du défaut de la bibliothèque ; une future mise à jour de `sharp` pourrait changer silencieusement le poids/la qualité des dérivées stockées. [apps/api/src/parties/parties.service.ts, `setCoverImage()`]

- [x] [Review][Dismiss] Recadrage centré sans contrôle du MJ sur le cadrage pour un ratio arbitraire — déjà explicitement hors périmètre par décision de la story elle-même (« un recadrage choisi par le MJ serait une story à part »).
- [x] [Review][Dismiss] `GetCoverDto` importe `LIST_VIEW_MODES` en valeur d'exécution (pas `import type`) — écart apparent à la convention « types partagés toujours en import type », mais motif identique déjà toléré dans le projet pour `GAME_SYSTEMS`/`THEMES` (validation `@IsIn` exige une valeur runtime), pas une déviation nouvelle.
- [x] [Review][Dismiss] Libellés de la section couverture codés en dur plutôt que via `theme.tone()` — cohérent avec la convention déjà mixte de ce même formulaire (la plupart des libellés de champs sont déjà en dur, seuls le titre et le bouton principal passent par `tone()`).
- [x] [Review][Dismiss] Aucune confirmation avant le retrait de l'image de couverture — décision produit/UX, pas un défaut de code ; aucun précédent dans le projet n'exige de confirmation pour une action réversible par redépôt.
- [x] [Review][Dismiss] `findUniqueOrThrow()` (dans `setCoverImage()`/`removeCoverImage()`) non couvert par le même nettoyage que `update()` — vérifié non fondé : au moment où `findUniqueOrThrow()` s'exécute, la mise à jour DB a déjà réussi et référence déjà les bons fichiers ; un échec à cet endroit n'affecte que la réponse HTTP, jamais la cohérence disque/DB.
- [x] [Review][Dismiss] L'`effect()` de réinitialisation de `coverImageFailed` (`PartyBanner`) ne dépend pas de `mode()` — vérifié non exploitable : chaque mode est un bloc `@if` distinct qui détruit/recrée le composant, `mode` n'est jamais réaffecté dynamiquement sur une instance vivante dans ce projet.

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Construire la couverture avant d'extraire l'utilitaire.** C'est la seule erreur qui invalide la story entière : elle crée le quatrième chemin d'upload parallèle qu'AD-17 existe pour empêcher. L'ordre des tâches n'est pas indicatif.
2. **Le `jest.mock` qui devient inopérant sans bruit.** Nommé par AD-17 **et** par AC7. Après déplacement, un mock mal ciblé laisse le test vert tout en testant le vrai `sharp`. Prouver qu'il mocke encore, par un test qui échouerait sinon.
3. **Factoriser le plafond de 5 Mo.** AC6 l'interdit explicitement : il vit dans des décorateurs de contrôleur, il se redéclare. Le « factoriser » dans l'utilitaire le rendrait inopérant (les décorateurs sont évalués à la déclaration de la classe).
4. **Servir l'image en statique** parce que c'est plus simple. AC8 l'interdit, `main.ts` ne sert **aucun** upload en statique, et c'est un choix de sécurité déjà acté pour les portraits.
5. **Accepter une largeur du client.** AC9 dit « dimensionnée pour le mode d'affichage demandé » — le **mode**, pas la dimension. Une largeur arbitraire est un vecteur de déni de service par redimensionnement.
6. **Toucher à `bannerParams()`.** AC3 exige que la bannière générée reprenne sa place **à l'identique** au retrait de l'image. La dérogation accordée à la Story 29.11 est close.
7. **Laisser tourner l'animation sous l'image.** AD-19 : *« l'animation du thème n'accompagne que la bannière générée »*. Ne pas rendre la composition, plutôt que la masquer.
8. **La clé du 3ᵉ thème reste `medieval-steampunk`** (renommage = Story 35.1). Sans objet ici, mais si vous touchez au thème, ne renommez rien.
9. **Mettre en cache sans jeton de version.** AC9 réclame des en-têtes de cache ; l'URL d'une couverture est stable. Les deux ensemble, sans cache-busting, font qu'un remplacement d'image n'apparaît jamais à l'écran — alors que la base, le disque et les tests serveur sont tous corrects. C'est la panne la plus coûteuse à diagnostiquer de cette story, et elle se prévient par un seul champ (cf. Décisions).
10. **Oublier l'émission temps réel.** Les autres membres verraient l'ancienne identité visuelle jusqu'à un rechargement complet. AD-14 et le code de `PartiesService` fournissent déjà le mécanisme.

### Ce qui doit continuer de fonctionner

- **Tout le chemin portrait** : upload, recadrage (`portraitCropData`), lecture, export PDF, verrou optimiste `updatedAt`, émission SSE, nettoyage du fichier orphelin. Le refactor déplace du code, il n'en change pas le comportement — et c'est un chemin **de sécurité**, donc à traiter comme tel.
- **Les documents de scénario** (`scenarios/document-storage.util.ts`) : hors périmètre, à ne pas migrer au passage. AD-17 les mentionne comme troisième chemin existant, sans demander leur unification ici.
- **Les Stories 29.10/29.11** : `bannerParams()` intouché, les trois rendus, l'égalité stricte des compositions grand/moyen, la portée de l'animation, le compte à rebours.
- **Suites de référence à l'ouverture** (baseline `3bb8f35`) : Web **94 fichiers / 1377 tests**, API 54 suites / ~1097 tests. Le build web échoue déjà sur le seul budget de bundle initial (**1,28 Mo**), dépassement pré-existant depuis la Story 29.4 — mesurer l'écart avant/après plutôt que l'affirmer.

### Hors périmètre

- **Refonte des écrans de création/édition de partie** — Story 29.14, dont le périmètre doit encore être arrêté avec l'utilisateur. N'ajouter ici que le point de dépôt, au minimum viable.
- **Politique de rétention des images remplacées ou supprimées** — question ouverte identique à celle des portraits, que l'architecture demande de traiter **une fois, pour les deux**, pas à moitié ici (`ARCHITECTURE-SPINE.md`, Open Questions).
- **Unification du chemin des documents de scénario** avec l'utilitaire extrait.
- **Recadrage par mode** (l'équivalent de `portraitCropData` pour la couverture) — `ARCHITECTURE-SPINE.md` le laisse ouvert : *« reste la question produit du recadrage par mode »*. Recadrage centré automatique ici ; un recadrage choisi par le MJ serait une story à part.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Forme de la projection dans `PartieDto`** — un booléen `hasCoverImage`, ou l'URL comme le fait `CharacterDto.portraitUrl` ? Recommandation : **ni l'un ni l'autre, un jeton de version** `coverImageVersion: string | null`.
  - Un chemin de stockage n'apporte rien : l'endpoint est construit depuis l'`id` de la partie (`CharacterAvatar.absolutePortraitUrl` le fait déjà ainsi, `character-avatar.ts:40-44`) et exposer le chemin élargit la surface pour rien.
  - Mais **un booléen ne suffit pas**, et c'est le piège n°9 ci-dessous : l'AC9 impose des en-têtes de cache, or l'URL d'une couverture est stable (`/parties/:id/cover?mode=…`). Après un remplacement, le navigateur resservirait l'ancienne image depuis son cache, et l'AC1 (« elle devient l'identité visuelle de la partie ») serait fausse à l'écran alors que tout est correct en base.
  - Un jeton qui **change à chaque dépôt** — l'identifiant du fichier écrit, qui est déjà un `randomUUID()` neuf à chaque upload — sert à la fois d'indicateur de présence (`null` = pas d'image) et de paramètre de cache-busting. Un seul champ, deux besoins, aucune fuite de chemin.
- **Dérivées : pré-générées au dépôt, ou redimensionnées à la volée ?** Recommandation : **pré-générées** (trois fichiers écrits une fois). Redimensionner à la volée coûte du CPU à chaque requête, × douze tuiles × chaque chargement de liste. Contrepartie assumée : suppression et remplacement doivent traiter les trois fichiers.
- **Facteur de densité d'écran** — servir 2× les dimensions logiques pour rester net sur mobile ? Recommandation : oui, en le figeant côté serveur (les dimensions restent une union fermée), plutôt qu'en acceptant un `dpr` du client.
- **Sort du monogramme en mode liste quand une image est présente.** AD-19 dit « l'image l'emporte dans tous les modes ». Le monogramme existait pour distinguer deux parties à 28 px — rôle que l'image remplit mieux. Recommandation : image seule, sans monogramme. À documenter dans tous les cas.
- **Ré-export ou suppression** des anciens `characters/image-mime.util.ts` / `portrait-storage.util.ts` après extraction. Recommandation : **suppression et mise à jour des sites d'appel** — un ré-export laisse deux chemins d'import vivants, ce qui est exactement le genre d'ambiguïté qu'AD-17 combat.
- ~~Format de sortie des dérivées~~ — **tranché avec l'utilisateur le 2026-08-12 : WebP.** Cf. Task 5, la règle y est posée.

### Notes de plateforme

- **`sharp` ^0.35.3 et `multer` ^2.2.0 sont déjà installés** (`apps/api/package.json`) — aucune dépendance à ajouter, aucune approbation à demander. `sharp` sert déjà au nettoyage EXIF ; `resize()` vient de la même API.
- **NestJS 11, Prisma 7.8** — `@nestjs/platform-express`, `FileInterceptor`, `StreamableFile`, `ParseFilePipe` déjà en usage dans `characters.controller.ts`.
- **Tests API : Jest 30 + Supertest.** Piège documenté du projet : **`ts-jest` ne type-vérifie pas d'un fichier à l'autre** (`isolatedModules`) — après un changement de signature, lancer `pnpm typecheck` en plus des tests, sinon une rupture cross-fichier passe inaperçue. Cette story déplace des exports : le risque est maximal.
- **Tests web : Vitest 4, jsdom, zoneless.** `ng test` type-vérifie les specs : toute fixture `PartieDto` incomplète casse la compilation de la suite entière. Ajouter un champ à `PartieDto` **cassera des fixtures** — c'est arrivé aux Stories 29.8, 29.9 et 29.10 (jusqu'à 62 tests d'un coup). Les corriger toutes, ne pas en oublier une.
- **Exécution** : tout par Docker. `docker exec jdr-master-api-1 sh -c "npx jest …"` et `docker exec jdr-master-web-1 sh -c "npx ng test --watch=false"`. Un `pnpm install` sur l'hôte échoue en EACCES pendant que les conteneurs tournent. Après une migration Prisma, **redémarrer réellement le conteneur `api`** et le vérifier dans les logs.

### Intelligence des stories précédentes (29.10, 29.11)

- **Patron de vérification visuelle sans identifiants** : une spec temporaire rend le vrai composant et écrit une page HTML autonome, puis est supprimée (et retirée de l'index git). Réutilisable ici pour comparer image et bannière générée côte à côte dans les trois modes.
- **Deux `transform` sur un même élément s'écrasent** — piège rencontré deux fois en 29.11. Sans objet pour une `<img>`, mais le réflexe vaut.
- **Les revues de 29.10 et 29.11 ont trouvé des cas d'usage manqués, pas des bugs de code** : `visibleSignals` plafonné à deux, dates passées jamais purgées, mode moyen partageant un bloc avec le grand. Le pendant ici : **que se passe-t-il si le fichier référencé par `coverImageUrl` a disparu du disque ?** Le rendu doit retomber sur la bannière générée, jamais afficher une image cassée.
- **Ce que jsdom ne voit pas doit être signalé comme non vérifié** plutôt que présenté comme validé.

### Project Structure Notes

- **Backend nouveaux** : `apps/api/src/common/image-upload.util.ts` (**chemin imposé**), `apps/api/src/parties/party-cover.controller.ts` (**chemin imposé**) + leurs specs, et la migration Prisma.
- **Backend modifiés** : `apps/api/prisma/schema.prisma` (+ `Partie.coverImageUrl`), `apps/api/src/parties/parties.service.ts` (projection + cycle de vie de l'image), `apps/api/src/parties/parties.module.ts` (déclaration du contrôleur), `apps/api/src/characters/character.service.ts` + `.spec.ts`, `apps/api/src/characters/ryuutama-pdf.service.ts`, et les deux utilitaires portrait (déplacés ou ré-exportés).
- **Shared modifié** : `packages/shared/src/index.ts` (`PartieDto` + présence de couverture).
- **Frontend modifiés** : `apps/web/src/app/shared/party-banner/party-banner.ts`/`.html`/`.spec.ts`, le point de dépôt sur l'écran d'édition de partie, et **toute fixture `PartieDto`** cassée par le nouveau champ.
- **Non touchés** : `party-banner.util.ts` (invariant, cf. piège n°6), `party-countdown*`, `party-signals*`, `party-sort.ts`, `scenarios/document-storage.util.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.12] — Story et Acceptance Criteria, repris verbatim.
- [Source: _bmad-output/specs/spec-palier9-refonte-ui/SPEC.md#CAP-20] — *« Aucune partie n'est jamais nue : sans image téléversée, la bannière générée tient le rôle. »*
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-47, #D-11] — Image de couverture déposée par le MJ, repli sur la bannière générée ; mécanisme réutilisé : celui des portraits (upload, plafond 5 Mo, nettoyage EXIF).
- [Source: ARCHITECTURE-SPINE.md#AD-17] — **Règle canonique complète** : ce qui s'extrait, ce qui se redéclare, ce qui reste au personnage, les deux consommateurs à mettre à jour sous peine de casse silencieuse, l'hébergement dans `PartiesModule`, les gardes `getOwned`/`getViewable`, et l'interdiction du service statique.
- [Source: ARCHITECTURE-SPINE.md#AD-19] — *« Si `Partie.coverImageUrl` est renseigné, l'image l'emporte dans tous les modes d'affichage […] l'animation du thème n'accompagne que la bannière générée, jamais une image téléversée. »* Et : *« Seule l'image de couverture est persistée — c'est une donnée, pas un dérivé. »*
- [Source: ARCHITECTURE-SPINE.md, Structural Seed] — `Partie.coverImageUrl String?`, `common/image-upload.util.ts`, `parties/party-cover.controller.ts` : chemins et formes imposés.
- [Source: ARCHITECTURE-SPINE.md, Open Questions] — Rétention des images remplacées, et recadrage par mode : explicitement laissés ouverts, donc hors périmètre.
- [Source: apps/api/src/characters/image-mime.util.ts] — Le code à extraire : détection par octets magiques (3 formats), `stripImageMetadata()` et sa justification d'`autoOrient()`, `PORTRAIT_FILENAME_RE`.
- [Source: apps/api/src/characters/portrait-storage.util.ts] — Lecture et garde de nom de fichier ; `readPortraitFile()` importé par le PDF.
- [Source: apps/api/src/characters/character.service.ts:527-572] — `updatePortrait()` : la séquence complète, **et le nettoyage du fichier orphelin sur échec DB**, à reproduire.
- [Source: apps/api/src/characters/characters.controller.ts:131-191] — Le patron d'endpoint d'image à reproduire : `StreamableFile`, double garde de plafond, `MulterExceptionFilter`.
- [Source: apps/api/src/characters/character.service.spec.ts:48] — Le `jest.mock('./image-mime.util')` qui devient inopérant sans bruit (AC7).
- [Source: apps/api/src/parties/parties.service.ts:199,207] — `getOwned()` / `getViewable()` : les gardes existent, il suffit de les appeler (AC4).
- [Source: apps/api/src/common/filters/multer-exception.filter.ts, apps/api/src/common/uploads-root.ts] — Déjà partagés, à réutiliser tels quels.
- [Source: apps/web/src/app/shared/party-banner/party-banner.ts, .html, .scss] (Stories 29.10/29.11) — Classes d'hôte par mode, portée de l'animation, composition à ne pas rendre quand une image est présente.
- [Source: _bmad-output/implementation-artifacts/29-11-animation-des-bannieres-et-compte-a-rebours.md] — Story précédente : patron de planche de contrôle, pièges de `transform`, suites de référence, contrat resserré du compte à rebours.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-12 (bmad-create-story). Vérifications faites avant écriture, par lecture directe du code :
  - **`sharp` ^0.35.3 est déjà une dépendance de l'API** — l'AC9 (dérivées dimensionnées), qui aurait pu passer pour un blocage nécessitant une approbation de dépendance, ne l'est pas. `sharp` sert déjà au nettoyage EXIF ; `resize()` vient de la même API. Consigné pour éviter un HALT injustifié.
  - **Les trois chemins d'upload existants ont été localisés** (`characters/image-mime.util.ts` + `portrait-storage.util.ts` + écriture enfouie dans `character.service.ts:549`, `scenarios/document-storage.util.ts`, et la couverture à créer). L'ordre de travail « extraire d'abord » est posé en tête de story, avec la raison : c'est un refactor de **sécurité**, pas d'hygiène.
  - **Les deux consommateurs fragiles ont été vérifiés ligne à ligne** : `ryuutama-pdf.service.ts:30` (casse bruyante, faible risque) et `character.service.spec.ts:48` (**casse silencieuse**, risque réel). AC7 traduite en exigence exécutable : après le refactor, un test doit **prouver** que le double est encore appliqué.
  - **Les gardes existent déjà** : `PartiesService.getOwned()`/`getViewable()` (lignes 199 et 207). Aucune garde à écrire pour l'AC4, seulement à appeler — ce qui évite qu'une soit réinventée avec une faille.
  - **Le commentaire « JAMAIS incluse dans `PartieDto` » du Structural Seed porte sur `sheetVisibility`, pas sur `coverImageUrl`** — vérifié par lecture du bloc complet. La couverture doit bien être projetée, sous une forme à trancher (booléen recommandé).
  - **`PartieDto` compte aujourd'hui 13 champs et est utilisé dans de nombreuses fixtures de test web.** Ajouter un champ a cassé jusqu'à 62 tests d'un coup en Story 29.10 — signalé en notes de plateforme.
  - **Le piège rencontré par les revues de 29.10 et 29.11 a été transposé** : ces revues ont trouvé des **cas d'usage manqués**, pas des bugs. Le pendant ici est nommé explicitement — un `coverImageUrl` pointant sur un fichier disparu doit retomber sur la bannière générée, jamais afficher une image cassée.

- **Implémentée le 2026-08-12/13 (bmad-dev-story), 11 tâches en TDD.** Suite finale : API **54/54 suites, 1120/1120 tests** (baseline : 54/54, 1097/1097 — +23 tests), typecheck propre ; Web **94/94 fichiers, 1389/1389 tests** (baseline : 94/94, 1377/1377 — +12 tests). Lint propre sur tous les fichiers touchés (warnings `no-unsafe-*` sur les mocks Prisma/`app.getHttpServer()` typés `any` : convention déjà établie dans tout le projet, non introduite ici). Aucun changement backend hors ce qui était prévu.

- **Tasks 1-2 — refactor de sécurité, fait en premier comme l'exigeait la story.** `characters/image-mime.util.ts` et `portrait-storage.util.ts` **supprimés** (décision « suppression, pas ré-export » retenue telle que recommandée) — leurs fonctions déplacées telles quelles dans `apps/api/src/common/image-upload.util.ts`, paramétré par domaine (`extractUploadFilename(fileUrl, urlPrefix)` plutôt qu'un préfixe portrait en dur), écriture disque remontée (`writeUploadFile`/`unlinkUploadFile`). `character.service.ts` consomme l'utilitaire extrait ; `readPortraitFile()`/`extractPortraitFilename()` (wrappers du domaine portrait, dossier/préfixe compris) y restent, `ryuutama-pdf.service.ts` les importe désormais depuis `./character.service`. Piège AC7 traité explicitement : `jest.mock('../common/image-upload.util', …)` mis à jour, **et** un test dédié ajouté qui échouerait si ce mock redevenait inopérant (valeur mockée volontairement impossible à produire par un vrai `sharp()` sur le buffer de test). Suite API complète revérifiée verte avant d'écrire la moindre ligne de couverture, comme demandé.

- **Task 3 — schéma et projection.** `Partie.coverImageUrl String?` seul champ ajouté (migration `20260812214714_partie_cover_image`, conteneur `api` redémarré et vérifié). **Décision tranchée** (recommandation retenue) : `PartieDto.coverImageVersion: string | null` — le stem UUID de `coverImageUrl` sans extension, dérivé à la lecture (`coverImageVersion()` dans `parties.service.ts`), jamais le chemin de stockage. `null` = pas de couverture.

- **Tasks 4-5 — `PartyCoverController` et dérivées.** Contrôleur créé dans `PartiesModule`, patron de `characters.controller.ts` reproduit à l'identique (double garde de plafond, `MulterExceptionFilter`, `StreamableFile`). `PartiesService` étendu de `setCoverImage()`/`removeCoverImage()`/`getCoverFile()` — cycle de vie complet (détection MIME → nettoyage EXIF → 3 dérivées redimensionnées → écriture DB, nettoyage des fichiers orphelins à chaque point d'échec possible, suppression des 3 anciennes dérivées au remplacement). **Décisions tranchées** : dérivées **pré-générées** (pas à la volée), **WebP** quel que soit le format d'entrée (mesure manuelle : dérivée `large` 640×248 ≈ 21× plus légère qu'un JPEG source simulé de 1,37 Mo), **facteur ×2** de densité d'écran fixé côté serveur sur les dimensions de `PartyBanner` (640×248/88×88/56×56), recadrage centré (`fit: 'cover'`). Cache-busting par jeton de version en paramètre de requête (`v=`), non validé côté serveur — c'est l'URL elle-même qui change, le serveur sert simplement ce qui est demandé par `mode`.

- **Tasks 6-7 — frontend.** `PartyBanner` gagne l'entrée `coverImageVersion` : composition générée jamais rendue si une couverture est présente (garantit AC2 sans désactiver d'animation), repli sur la composition générée si le chargement de l'`<img>` échoue (`(error)`, signal réinitialisé par un `effect()` à chaque changement de version pour permettre un nouvel essai après remplacement). `Dashboard` câblé sur les 3 appels du composant. Écran MJ : section ajoutée à `partie-form.html`/`.ts` (édition seulement), dépôt/retrait indépendants du formulaire réactif principal, **pas** de réutilisation de `PortraitCropper` (recadrage automatique côté serveur, décision actée en Task 5 — aucune donnée de recadrage à transmettre, contrairement au portrait).

- **Non vérifié visuellement** : l'application exige une session authentifiée. Les compositions/le câblage sont verrouillés par les tests (structure DOM, attributs, appels de service), mais le rendu réel de l'image recadrée dans les trois modes reste à valider à l'œil.

- **Build web** : échoue toujours **uniquement** sur le budget de bundle initial, dépassement pré-existant depuis la Story 29.4 — mesuré : **1,28 Mo avant, 1,29 Mo après**, écart modeste cohérent avec l'ajout d'une entrée/d'un `<img>` conditionnel à `PartyBanner` et d'une section au formulaire d'édition (pas de nouvelle dépendance).

- **Revue de code (bmad-code-review, 2026-08-13, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `3bb8f35`)** : 0 decision-needed, 5 patches appliqués — fuite du `Cache-Control` immuable sur les réponses 404 (scénario CAP-20 fichier disparu du disque, corrigé en déplaçant l'en-tête dans la seule branche de succès), déduplication de `coverStem()`/`coverImageVersion()`, calcul mort supprimé dans `getCoverFile()`, garde anti-double-clic ajoutée sur le dépôt/retrait de couverture (absence de verrou optimiste côté serveur, `Partie` n'ayant pas de champ `updatedAt`), indentation corrigée dans deux fixtures. 7 items différés dans `deferred-work.md` (course concurrente sur double dépôt simultané — limitation de schéma documentée, course lecture/écriture sur les dérivées, absence de `withoutEnlargement`, erreurs d'infrastructure remontées en 400 générique, absence d'indicateur de chargement, absence de validation cliente avant envoi, qualité WebP non explicitée). 6 constats écartés comme bruit après vérification (recadrage centré déjà hors périmètre par décision de la story, import runtime de `LIST_VIEW_MODES` déjà toléré ailleurs, libellés en dur cohérents avec la convention mixte du formulaire, absence de confirmation au retrait jugée non requise, `findUniqueOrThrow()` non couvert par le nettoyage vérifié sans impact réel, `effect()` de `PartyBanner` non dépendant de `mode()` vérifié non exploitable dans ce projet). Suite finale revérifiée : API 54/54 suites (1121/1121 tests), Web 94/94 fichiers (1391/1391 tests), lint et typecheck propres. Statut passé à done.

### File List

**Backend — nouveaux**
- `apps/api/src/common/image-upload.util.ts` (utilitaire d'upload partagé, AD-17)
- `apps/api/src/common/image-upload.util.spec.ts`
- `apps/api/src/parties/party-cover.controller.ts` (chemin imposé par le Structural Seed)
- `apps/api/src/parties/party-cover.controller.spec.ts` (9 tests)
- `apps/api/src/parties/dto/get-cover.dto.ts`
- `apps/api/prisma/migrations/20260812214714_partie_cover_image/`

**Backend — supprimés**
- `apps/api/src/characters/image-mime.util.ts` (déplacé dans `common/image-upload.util.ts`)
- `apps/api/src/characters/image-mime.util.spec.ts` (porté dans `common/image-upload.util.spec.ts`)
- `apps/api/src/characters/portrait-storage.util.ts` (fonctions réparties entre `common/image-upload.util.ts` et `character.service.ts`)
- `apps/api/src/characters/portrait-storage.util.spec.ts` (couverture reportée)

**Backend — modifiés**
- `apps/api/prisma/schema.prisma` (+ `Partie.coverImageUrl`)
- `apps/api/src/characters/character.service.ts` (consomme l'utilitaire extrait ; porte désormais `PORTRAITS_DIR`/`PORTRAITS_URL_PREFIX`/`extractPortraitFilename()`/`readPortraitFile()`)
- `apps/api/src/characters/character.service.spec.ts` (`jest.mock` retargeté + test AC7 dédié)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (import de `readPortraitFile` mis à jour)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (commentaire de référence corrigé)
- `apps/api/src/parties/parties.service.ts` (+ `coverImageVersion()`, `setCoverImage()`, `removeCoverImage()`, `getCoverFile()`)
- `apps/api/src/parties/parties.service.spec.ts` (fixtures étendues + 20 tests dédiés)
- `apps/api/src/parties/parties.module.ts` (déclaration de `PartyCoverController`)

**Shared modifié**
- `packages/shared/src/index.ts` (`PartieDto.coverImageVersion`)

**Frontend — nouveaux**
- (aucun fichier nouveau — extension de composants/services existants)

**Frontend — modifiés**
- `apps/web/src/app/shared/party-banner/party-banner.ts`/`.html`/`.scss`/`.spec.ts` (entrée `coverImageVersion`, repli sur échec de chargement)
- `apps/web/src/app/features/dashboard/dashboard.html`/`.spec.ts` (câblage des 3 appels de `PartyBanner`)
- `apps/web/src/app/features/parties/partie-form/partie-form.ts`/`.html`/`.scss`/`.spec.ts` (dépôt/retrait de couverture)
- `apps/web/src/app/core/parties/parties.service.ts` (`setCoverImage()`/`removeCoverImage()`)
- Fixtures `PartieDto` cassées par le nouveau champ : `apps/web/src/app/core/parties/parties.service.spec.ts`, `apps/web/src/app/core/parties/party-sort.spec.ts`, `apps/web/src/app/core/poll/open-polls.service.spec.ts`, `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`, `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts` (déjà listé ci-dessus), `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts`, `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts`

## Change Log

- 2026-08-13 — Story 29.12 implémentée (bmad-dev-story). Refactor de sécurité AD-17 (utilitaire d'upload partagé extrait des portraits, `common/image-upload.util.ts`) suivi de la fonctionnalité : image de couverture de partie déposée/retirée par le MJ, 3 dérivées WebP pré-générées par mode d'affichage, servies par un endpoint sous garde avec cache-busting par jeton de version, l'image l'emportant sur la bannière générée dans les trois modes sans jamais en accompagner l'animation. API 54/54 suites (1120/1120 tests), Web 94/94 fichiers (1389/1389 tests), lint et typecheck propres. Vérification visuelle en attente.
