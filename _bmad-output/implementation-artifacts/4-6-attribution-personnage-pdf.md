---
story: 4.6
title: "Attribution du personnage — distinction MJ/joueur et enrichissement de l'export PDF"
epic: 4
key: 4-6-attribution-personnage-pdf
status: done
baseline_commit: "22394ab"
---

# Story 4.6 : Attribution du personnage — distinction MJ/joueur et enrichissement de l'export PDF

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want to see at a glance which characters belong to me versus my players, and which player owns each one,
so that I can navigate a party's character list without confusion, and my players' exported PDF sheets are properly attributed with the player's name and portrait.

## Acceptance Criteria

**AC1 — Distinction MJ/joueur dans l'onglet "Personnages"**

Given le MJ d'une partie consultant l'onglet "Personnages"
When la liste des personnages s'affiche
Then chaque `CharacterSummaryCard` distingue visuellement les personnages du MJ (ex. badge "Vous"/MJ) de ceux de ses joueurs, et affiche le pseudo du joueur propriétaire pour ces derniers

**AC2 — Distinction MJ/joueur sur la fiche personnage**

Given le MJ consultant la fiche d'un personnage
When la fiche s'affiche
Then la même distinction MJ/joueur et le pseudo du propriétaire sont visibles sur l'en-tête de la fiche (à proximité du nom du personnage, sans s'y substituer)

**AC3 — Aucun changement côté joueur**

Given un joueur consultant l'onglet "Personnages" ou sa propre fiche
When la liste/fiche s'affiche
Then rien de nouveau n'apparaît — il ne voit jamais que ses propres personnages (`findByPartie` filtre déjà ainsi, Story 4.1), cette story n'ajoute aucune UI pour lui

**AC4 — Champ "Joueur" rempli dans l'export PDF**

Given un personnage exporté en PDF (éditable ou 2 pages)
When l'export est généré
Then le champ AcroForm "Joueur" du template officiel est rempli avec le pseudo du propriétaire du personnage (le MJ inclus, s'il exporte son propre personnage)

**AC5 — Portrait intégré dans l'export PDF**

Given un personnage avec un portrait existant, exporté en PDF
When l'export est généré
Then l'image de portrait est dessinée dans la zone dédiée du template (en haut de page, au-dessus du champ "Joueur", à droite du titre "Fiche de voyageur, créé le...")

**AC6 — Pas de portrait → zone PDF vide**

Given un personnage sans portrait, exporté en PDF
When l'export est généré
Then la zone dédiée reste vide (pas d'image placeholder — cohérent avec le comportement déjà établi pour `PortraitPanel` côté web)

**AC7 — Couverture de tests**

Given le mapping "Joueur" → pseudo et la logique d'intégration du portrait
When ces logiques sont unit-testées
Then `mapToPdfFields`/`RyuutamaPdfContent` couvrent le nouveau champ "Joueur" (`packages/game-rules`), et `RyuutamaPdfService` couvre l'intégration d'image (mock `pdf-lib`, conventions déjà établies dans `ryuutama-pdf.service.spec.ts`)

**Out of Scope :**
- Le recadrage circulaire du portrait n'est **pas** reproduit sur l'image PDF (rectangulaire par nature) — un recentrage approximatif via `portraitCropData` (zoom/offset) est acceptable, sans découpe circulaire.
- L'option d'export PDF "1 page" reste hors scope (déjà différée par la Story 4.4).
- **Ne pas confondre avec "Homme-Dragon"** : le PRD (F4, Non-Goals) exclut explicitement la création du "personnage du MJ (homme-dragon)" — un concept de règles Ryuutama distinct (un type de personnage narratif propre au guide officiel). Cette story ne touche **pas** à ça : il s'agit uniquement d'attribution UI/PDF générique ("à qui appartient ce `Character` existant") — le MJ peut très bien posséder un `Character` Ryuutama standard (aucune règle actuelle ne l'empêche), et cette story se contente de l'identifier comme tel dans l'UI/le PDF.

## Tasks / Subtasks

- [x] **Task 1 — Exposer le pseudo du propriétaire sur `CharacterDto`** (AC: 1, 2, 4)
  - [x] `packages/shared` : ajouter `ownerPseudo: string` à `CharacterDto` (champ additif, non-breaking — même pattern que l'ajout de `portraitUrl`/`portraitCropData` en Story 4.1/4.5)
  - [x] `apps/api/src/characters/character.service.ts` :
    - `toDto` (fonction autonome en bas de fichier, pas une méthode de classe — appelée `toDto(character)`/`characters.map(toDto)`) doit maintenant recevoir le pseudo en paramètre — changer sa signature en `toDto(character, ownerPseudo: string)` et mettre à jour tous les call sites (`findOne`, `findByPartie`, et tout autre endroit qui l'appelle)
    - `findOne(id, userId)` : après avoir chargé `character`, résoudre le pseudo de `character.userId` via `UsersService.findById` (déjà existant) et le passer à `toDto`
    - `findByPartie(partieId, userId)` : **ne pas faire de requête N+1**. Après avoir chargé les `characters`, extraire les `userId` distincts (`[...new Set(characters.map(c => c.userId))]`), un seul `prisma.user.findMany({ where: { id: { in: [...] } }, select: { id: true, pseudo: true } })`, construire une `Map<userId, pseudo>`, puis mapper chaque `character` via `toDto(c, pseudoMap.get(c.userId)!)`. **Précédent exact à suivre** : `PartiesService.resolveParticipants()` (`apps/api/src/parties/parties.service.ts:107-133`) fait déjà ce pattern (fetch MJ + memberships en un `Promise.all`, `select` minimal `{id, pseudo}` sans jamais charger le hash de mot de passe).
    - `CharacterService` doit injecter `UsersService` (nouveau constructeur param) — **`CharacterModule` doit importer `UsersModule`** (`apps/api/src/characters/character.module.ts:10` — actuellement `imports: [PartiesModule, GameSystemModule]`, ajouter `UsersModule`).
  - [x] Tests : `character.service.spec.ts` — `findOne` retourne `ownerPseudo` correct ; `findByPartie` avec plusieurs personnages de propriétaires différents ne fait **qu'un seul** appel `prisma.user.findMany` (pas N appels), retourne le bon pseudo par personnage.

- [x] **Task 2 — `CharacterSummaryCard` : badge MJ/joueur + pseudo** (AC: 1, 3)
  - [x] `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` : un seul `input()` optionnel nécessaire : `showOwnerInfo = input(false)` (n'affiche le badge/pseudo que si le **viewer** est le MJ — jamais pour un joueur, cf. AC3). Pas besoin d'un `isCharacterMj` séparé : `character().ownerIsMj`/`character().ownerPseudo` sont déjà sur le DTO (Task 1), lus directement dans le template.
  - [x] Template : si `showOwnerInfo()`, afficher le badge thématisé `character.owner_badge_mj` (nouvelle clé ajoutée dans `tones.ts`, ×3 thèmes) si `character().ownerIsMj`, sinon le pseudo (`character().ownerPseudo`) — à proximité du nom, sans le remplacer
  - [x] Tests : badge MJ si `ownerIsMj=true` + `showOwnerInfo=true`, pseudo affiché si `ownerIsMj=false` + `showOwnerInfo=true`, rien affiché si `showOwnerInfo=false`

- [x] **Task 3 — Câblage dans `PartieDetail` (onglet Personnages)** (AC: 1, 3)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` : passer `[showOwnerInfo]="isMj()"` (le signal `isMj` existait déjà) à `<app-character-summary-card>`. Pas de calcul `isCharacterMj` côté front nécessaire (déjà sur le DTO via Task 1/2).
  - [x] `character.ownerPseudo`/`ownerIsMj` déjà sur le DTO (Task 1) — aucun lookup supplémentaire côté front
  - [x] Tests : `partie-detail.spec.ts` — MJ voit le pseudo du joueur propriétaire ; joueur ne voit aucun badge

- [x] **Task 4 — `CharacterSheet` : même distinction sur l'en-tête de fiche** (AC: 2, 3)
  - [x] `ownerIsMj: boolean` déjà ajouté à `CharacterDto` en Task 1 (calculé côté serveur) — pas de calcul dupliqué côté front.
  - [x] `character-sheet.ts` : nouveau computed `viewerIsMj = computed(() => !!this.character() && !this.isOwner())` — le raccourci "accès en lecture réussi + non-propriétaire ⇒ viewer est le MJ" est valide (Story 4.1) et évite un appel réseau supplémentaire. Note : sur cette vue, la branche "badge MJ" de `c.ownerIsMj` est en pratique inatteignable (si le MJ consulte son propre personnage, `isOwner()` est vrai en premier, donc `viewerIsMj()` est faux) — testé explicitement pour documenter ce comportement.
  - [x] Tests : `character-sheet.spec.ts` — pseudo visible pour le MJ consultant un personnage d'un joueur, absent pour le propriétaire, badge MJ jamais affiché sur cette vue (cas MJ+propriétaire)

- [x] **Task 5 — Champ PDF "Joueur"** (AC: 4, 7)
  - [x] `packages/game-rules/src/ryuutama/pdf-field-map.ts` : `ownerPseudo: string` ajouté à `RyuutamaPdfContent`, `{ field: 'Joueur', value: content.ownerPseudo, kind: 'text' }` ajouté aux `PdfFieldValue[]`, "Joueur" retiré du JSDoc des champs non couverts
  - [x] `apps/api/src/characters/ryuutama-pdf.service.ts` : `resolveContent(sheetData, ownerPseudo)` — signature étendue, `character.ownerPseudo` (déjà résolu via Task 1) passé directement, aucune requête supplémentaire
  - [x] Tests : nouveau cas dans `pdf-field-map.spec.ts` ; `ryuutama-pdf.service.spec.ts` vérifie que `mapToPdfFields` reçoit bien `ownerPseudo`

- [x] **Task 6 — Portrait intégré au PDF** (AC: 5, 6, 7)
  - [x] Extraction de `apps/api/src/characters/portrait-storage.util.ts` (`extractPortraitFilename`, `readPortraitFile`, `PORTRAITS_DIR`/`PORTRAITS_URL_PREFIX`) réutilisé par `CharacterService.getPortraitFile` (refactorisé, simplifié) ET `RyuutamaPdfService` — zéro duplication de la validation de nom de fichier
  - [x] `RyuutamaPdfService.embedPortrait()` : `doc.embedJpg`/`embedPng` selon le mime réel (jamais l'extension), `page.drawImage()` sur la page 1 aux coordonnées mesurées (voir `assets/README.md`, nouvelle section "Zone du portrait") — **coordonnées déduites des champs AcroForm voisins via `page.getRectangle()`, vérifiées fonctionnellement (XObject `/Image` bien présent dans le PDF généré) mais pas par rendu visuel** (aucun visualiseur PDF disponible)
  - [x] WEBP confirmé non supporté par pdf-lib 1.17.1 (`embedJpg`/`embedPng` seulement, pas de `embedWebp`) — zone laissée vide avec avertissement loggé, pas un crash
  - [x] **Bug découvert et corrigé pendant les tests manuels réels (pas seulement mockés)** : un fichier passant la validation par octets magiques à l'upload (Story 4.5, vérification minimale) peut néanmoins être rejeté par le parseur strict de `pdf-lib` (`embedJpg`/`embedPng` peuvent lever, ex. `RangeError`/`Invalid JPEG` sur un fichier tronqué) — sans `try/catch`, ceci faisait échouer **tout** l'export PDF (500) pour un simple problème de portrait. Corrigé : dégradation gracieuse (log + zone vide), export PDF jamais bloqué par un portrait corrompu.
  - [x] Tests : `ryuutama-pdf.service.spec.ts` (mock `pdf-lib` étendu avec `getPages`/`drawImage`/`embedJpg`/`embedPng`) couvrant JPEG, PNG, WEBP (skip), URL invalide, et échec d'embed (dégradation gracieuse) ; nouveau `portrait-storage.util.spec.ts`. **Vérifié aussi en conditions réelles** (sans mocks) : export PDF complet généré avec un vrai JPEG intégré (XObject `/Image` confirmé présent dans le fichier produit) et champ "Joueur" rempli.

### Review Findings

- [x] [Review][Patch] `resolveOwnerInfo()` refait une requête `partie.findUnique` dans `findOne()` alors que `parties.getOwned()` a déjà chargé/validé la même partie pour un viewer non-propriétaire ; en plus, aucune des deux requêtes du `Promise.all` n'a de gestion d'erreur dédiée (contrairement à la dégradation gracieuse appliquée ailleurs dans le même fichier, ex. `readPortraitFile`) [apps/api/src/characters/character.service.ts:94-102, 236-249] — corrigé : `findOne()` réutilise directement le `mjId` retourné par `getOwned()` pour un viewer non-propriétaire, plus de requête `partie.findUnique` redondante.
- [x] [Review][Patch] Aucun test n'asserte `ownerPseudo`/`ownerIsMj` sur le résultat de `updatePortrait()`/`removePortrait()`, bien que ces deux méthodes appellent désormais `resolveOwnerInfo()` [apps/api/src/characters/character.service.spec.ts (describe `updatePortrait()`/`removePortrait()`)] — corrigé : test dédié ajouté dans chaque describe.
- [x] [Review][Patch] Le test du badge MJ dans `character-summary-card.spec.ts` n'asserte que `not.toBe('le-mj')` et un texte non vide, jamais la vraie valeur attendue — un tone key cassé ou mal interpolé passerait quand même [apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts] — corrigé : assertion sur l'ensemble des valeurs réelles possibles (`Maître`/`Guide`/`Ingénieur`, une par thème).
- [x] [Review][Patch] `viewerIsMj` (`character-sheet.ts`) est calculé par exclusion (`!isOwner()`) plutôt qu'en vérifiant réellement `partie.mjId` — si `auth.currentUser()` devient `null`/`undefined` (session invalidée) pendant que `character()` reste chargé, `isOwner()` devient faux et `viewerIsMj()` devient vrai, affichant le badge/pseudo MJ à un viewer non authentifié ; incohérent avec `partie-detail.ts` qui utilise directement un signal `isMj()` basé sur `mjId` [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:85-94] — corrigé : `viewerIsMj` exige désormais `!!this.auth.currentUser()`.
- [x] [Review][Patch] Titre de test trompeur dans `character-sheet.spec.ts` : intitulé "badge MJ thématisé, pas le pseudo" mais le test asserte en réalité qu'aucun badge n'est affiché du tout (cas MJ+propriétaire, branche volontairement inatteignable) [apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts] — corrigé : titre renommé pour refléter l'assertion réelle.
- [x] [Review][Defer] `embedPortrait()` (`doc.getPages()[0]` sans garde d'existence) et `fitCentered()` (division par zéro possible si une image embarquée rapporte une largeur/hauteur de 0) n'ont pas de garde défensive ; les coordonnées `PORTRAIT_X/Y/WIDTH/HEIGHT` codées en dur n'ont pas de test d'intégration contre un rendu PDF réel — deferred, pre-existing (risque très faible : template statique embarqué + image dégénérée mais valide extrêmement improbable) [apps/api/src/characters/ryuutama-pdf.service.ts:29-32, 159-168]
- [x] [Review][Defer] Le README `apps/api/game-systems/ryuutama/assets/README.md` documente des coordonnées de zone portrait obsolètes (451/662/90/110) qui contredisent les constantes réellement livrées dans le code (344.87/646.92/188.18/136.48) — deferred, pre-existing (fichier non suivi par git/gitignoré comme le template PDF, hors scope du diff revu, mais à corriger localement) [apps/api/game-systems/ryuutama/assets/README.md]

- [x] **Task 7 — Tests + lint** (AC: 1-7)
  - [x] `pnpm lint --fix` et `pnpm test` passent intégralement dans `api` (203 tests), `web` (252 tests), `packages/game-rules` (27 tests). Lint : aucune nouvelle catégorie d'erreur introduite dans les fichiers touchés (les erreurs `no-unsafe-assignment` restantes sur `expect.any(...)` sont un pattern déjà pré-existant partout dans le repo, cf. `availability.service.spec.ts`).

## Dev Notes

### Contexte hérité (Stories 4.1-4.5, toutes `done`)

- `CharacterDto` (`@master-jdr/shared`) a aujourd'hui : `id, userId, partieId, gameSystemId, sheetData, derived, portraitUrl, portraitCropData, createdAt, updatedAt`. Ajouter `ownerPseudo: string` et `ownerIsMj: boolean` est **additif** — aucun consommateur existant ne casse (même précédent que l'ajout de `portraitUrl`/`portraitCropData` en 4.1, jamais retiré depuis).
- `CharacterService` (`apps/api/src/characters/character.service.ts`) n'injecte aujourd'hui que `PrismaService` et `PartiesService` — **`UsersService` doit être ajouté** comme nouvelle dépendance (constructeur + `CharacterModule.imports`).
- Le champ AcroForm "Joueur" existe réellement sur le template PDF officiel (`Ryuutama_fiche_de_voyageur_big_edit.pdf`) — c'est un champ **texte simple** (`kind: 'text'`), pas un dropdown. Il a été **volontairement laissé non mappé** par la Story 4.4 (aucune donnée pseudo disponible à ce moment-là) — cf. le commentaire JSDoc de `mapToPdfFields` dans `packages/game-rules/src/ryuutama/pdf-field-map.ts` qui liste "Joueur" parmi les champs non couverts.
- **La zone portrait du PDF n'est PAS un champ AcroForm** — c'est une zone visuelle vide sur le template, jamais documentée avec des coordonnées. Contrairement au remplissage de champs (`form.getTextField(...).setText(...)`), l'intégration d'image se fait par dessin direct sur la page (`page.drawImage()`), positionnement en dur par coordonnées x/y — fragile si le template change, mais c'est la seule option pdf-lib pour une zone non-field.
- `RyuutamaPdfService.fillCharacterPdf()` (`apps/api/src/characters/ryuutama-pdf.service.ts`) charge déjà le template une seule fois (`templatePromise`, mis en cache) — ne pas dupliquer ce chargement pour le portrait, c'est le même `PDFDocument` déjà chargé dans la même méthode.
- Pattern de résolution de pseudo en lot **déjà établi** dans le codebase, à suivre à l'identique : `PartiesService.resolveParticipants()` (`apps/api/src/parties/parties.service.ts:107-133`) — `Promise.all` + `select: { id, pseudo }` minimal, jamais le hash de mot de passe ni l'email dans ce genre de résolution d'affichage.
- `partie-detail.ts` a déjà un signal `isMj = computed(() => this.partie()?.mjId === this.auth.currentUser()?.id)` — précédent direct pour la logique "viewer est-il le MJ".
- `character-sheet.ts` a déjà (Story 4.5 review) un `isOwner = computed(() => !!this.character() && this.character()?.userId === this.auth.currentUser()?.id)` utilisé pour conditionner le bouton "Modifier le portrait" — **ne pas confondre** avec le nouveau besoin de cette story (savoir si le **personnage affiché** appartient au MJ, et si le **viewer** est le MJ) : ce sont deux axes différents (propriétaire du personnage vs. rôle du viewer).

### Limitation connue à vérifier avant implémentation (Task 6)

`pdf-lib` (`^1.17.1` dans `apps/api/package.json`) supporte nativement `embedJpg`/`embedPng` pour l'intégration d'image dans un PDF ; il n'y a **pas de méthode `embedWebp`** dans l'API pdf-lib 1.x. Les portraits JPEG/PNG sont le cas majoritaire, mais `detectImageMime` (`image-mime.util.ts`) accepte aussi WEBP pour l'upload web (Story 4.5) — confirmer ce point précis via Context7 avant de coder (versions/API pouvant évoluer), mais s'attendre à devoir gérer ce cas : documenter la limitation (portrait WEBP visible sur le web, absent du PDF pour ce palier) plutôt que de crasher l'export.

### Disponibilité du template PDF (asset gitignoré)

Le fichier `Ryuutama_fiche_de_voyageur_big_edit.pdf` (`apps/api/game-systems/ryuutama/assets/`) est gitignoré (contenu sous droits, cf. Story 4.4) — il doit déjà être présent localement dans cet environnement de dev (Story 4.4 et 4.5 en dépendent déjà pour fonctionner ; `RyuutamaPdfService` échoue explicitement avec un message pointant vers le README s'il est absent). Pour mesurer les coordonnées de la zone portrait (Task 6), ouvrir ce fichier localement (lecteur PDF ou `page.getSize()` via un script ts-node ponctuel) — si le fichier est absent, se référer à `apps/api/game-systems/ryuutama/assets/README.md` pour la procédure d'obtention, ne pas bloquer la story pour autant : à défaut, implémenter Task 6 avec des coordonnées placeholder clairement documentées comme non-vérifiées, à corriger dès que le fichier est disponible.

### Project Structure Notes

- Modifie : `packages/shared` (types), `packages/game-rules/src/ryuutama/pdf-field-map.ts`, `apps/api/src/characters/character.service.ts` (+ `.spec.ts`), `apps/api/src/characters/character.module.ts`, `apps/api/src/characters/ryuutama-pdf.service.ts` (+ `.spec.ts`), `apps/web/src/app/features/characters/character-summary-card/*`, `apps/web/src/app/features/characters/character-sheet/*`, `apps/web/src/app/features/parties/partie-detail/*`.
- Nouveau (probable) : `apps/api/src/characters/portrait-storage.util.ts` (extraction de la résolution de chemin de fichier partagée entre `CharacterService` et `RyuutamaPdfService`, cf. Task 6).
- Aucune migration Prisma (aucun nouveau champ DB — `ownerPseudo`/`ownerIsMj` sont calculés à la volée dans `toDto`, jamais stockés).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.6] — ACs sources (ajoutées dans cette session)
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260703/prd.md#FR-4.3, Non-Goals] — accès MJ en lecture seule (FR39), clarification "Homme-Dragon" hors scope
- [Source: apps/api/src/parties/parties.service.ts:107-133] — pattern `resolveParticipants` (résolution de pseudo en lot)
- [Source: apps/api/src/characters/character.service.ts] — `findOne`/`findByPartie`/`toDto` à modifier
- [Source: apps/api/src/characters/ryuutama-pdf.service.ts] — `fillCharacterPdf`/`resolveContent` à modifier
- [Source: packages/game-rules/src/ryuutama/pdf-field-map.ts:39] — commentaire JSDoc listant "Joueur" comme non couvert (à corriger)
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts] — signal `isMj` existant, `characters()`/`members()` déjà chargés
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — `isOwner` existant (Story 4.5 review), ne pas confondre avec le nouveau besoin
- [Source: _bmad-output/implementation-artifacts/4-5-portrait-personnage.md] — story précédente, patterns portrait/validation de fichier réutilisables (Task 6)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Bug réel découvert pendant les tests manuels (hors mocks) : `doc.embedJpg`/`embedPng` de `pdf-lib` peuvent lever une exception (`RangeError`, `Invalid JPEG`) sur un fichier qui a pourtant passé la validation par octets magiques à l'upload (Story 4.5, vérification minimale sur les premiers octets seulement) — sans garde, ceci faisait échouer tout l'export PDF (500) pour un simple problème d'intégration du portrait. Corrigé par un `try/catch` dédié dans `embedPortrait()` : dégradation gracieuse (log + zone vide), jamais de blocage de l'export.
- Les coordonnées de la zone portrait sur le template PDF ont été mesurées empiriquement via `page.getRectangle()` de `pdf-lib` sur les champs AcroForm voisins (`Joueur`, `créé le`, `Homme dragon`) — le fichier PDF réel est bien présent dans cet environnement de dev (contrairement à l'hypothèse initiale de la story), ce qui a permis une mesure précise plutôt que des valeurs totalement devinées. Documenté dans `apps/api/game-systems/ryuutama/assets/README.md`.
- Vérifié en conditions réelles (sans mocks, via l'API HTTP réelle) : création de personnage → upload d'un vrai portrait JPEG → export PDF → confirmation que le champ "Joueur" est rempli et qu'un XObject `/Image` est bien présent dans le PDF généré (recherche directe dans les ressources de la page via `pdf-lib`).
- `ownerIsMj` a été ajouté au DTO dès la Task 1 (en même temps que `ownerPseudo`) plutôt qu'en Task 4 comme suggéré dans la story initiale — plus cohérent de résoudre les deux ensemble côté serveur (même requête `resolveOwnerInfo`/lot `findByPartie`), la Task 4 a été ajustée en conséquence sans redondance.

### Completion Notes List

- AC1/AC2 satisfaits : badge MJ thématisé ou pseudo du joueur propriétaire affiché dans `CharacterSummaryCard` (liste) et sur l'en-tête de `CharacterSheet`, visible uniquement pour le viewer MJ (`showOwnerInfo`/`viewerIsMj`).
- AC3 satisfait : aucun changement visible côté joueur — `showOwnerInfo` toujours `false` pour un viewer non-MJ, testé explicitement.
- AC4 satisfait : champ AcroForm "Joueur" rempli avec `ownerPseudo` (résolu côté serveur, zéro requête additionnelle au moment du remplissage PDF).
- AC5 satisfait : portrait dessiné sur la page 1 du PDF aux coordonnées mesurées empiriquement (JPEG/PNG). WEBP non supporté par `pdf-lib` 1.17.1 — documenté, dégrade proprement (zone vide) plutôt que de crasher.
- AC6 satisfait : aucun portrait → zone laissée vide, aucun placeholder.
- AC7 satisfait : couverture de tests sur les 3 packages (`pdf-field-map.spec.ts`, `ryuutama-pdf.service.spec.ts`, `character.service.spec.ts`, tests frontend), y compris les cas de dégradation gracieuse (portrait corrompu, URL invalide, format non supporté).
- Refactor : extraction de `portrait-storage.util.ts` partagé entre `CharacterService` et `RyuutamaPdfService` — élimine la duplication de la validation de nom de fichier (défense path traversal) qui existait implicitement dans le plan initial.
- `pnpm lint --fix` et `pnpm test` passent intégralement dans `api` (203 tests), `web` (252 tests), `packages/game-rules` (27 tests). Aucune régression détectée.

### File List

- `packages/shared/src/index.ts` (modifié — `CharacterDto.ownerPseudo`/`ownerIsMj`)
- `apps/api/src/characters/character.service.ts` (modifié — `resolveOwnerInfo`, `findOne`/`findByPartie`/`create`/`updatePortrait`/`removePortrait` enrichis, refactor vers `portrait-storage.util.ts`)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/src/characters/character.module.ts` (modifié — import `UsersModule`)
- `apps/api/src/characters/portrait-storage.util.ts` (nouveau)
- `apps/api/src/characters/portrait-storage.util.spec.ts` (nouveau)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (modifié — `embedPortrait()`, `resolveContent(sheetData, ownerPseudo)`)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (modifié)
- `apps/api/game-systems/ryuutama/assets/README.md` (modifié — coordonnées zone portrait)
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (modifié — champ "Joueur")
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (modifié)
- `apps/web/src/app/core/theme/tones.ts` (modifié — clé `character.owner_badge_mj` ×3 thèmes)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.scss` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — `viewerIsMj`)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié — `CharacterDto` de test enrichi)
- `apps/web/src/app/core/characters/character.util.spec.ts` (modifié — `makeCharacter()` enrichi)
