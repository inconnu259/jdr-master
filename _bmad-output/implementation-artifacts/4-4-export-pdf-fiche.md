---
story: 4.4
title: "Export PDF de la fiche"
epic: 4
key: 4-4-export-pdf-fiche
status: done
baseline_commit: "f12adf2"
---

# Story 4.4 : Export PDF de la fiche

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a player,
I want to export my character sheet as a filled official PDF,
so that I can bring a portable copy to the table.

## Acceptance Criteria

**AC1 — Export éditable**

Given un personnage Ryuutama créé
When un joueur clique sur "Exporter en PDF (éditable)" depuis sa fiche
Then `GET /characters/:id/export.pdf?format=editable` remplit les 126 champs AcroForm du fichier "edit" avec les données du personnage (nom, classe, type, talents, attributs, PV/PE/Condition/Initiative, arme favorite, équipement, paysage/climat si renseigné, champs narratifs) **sans aplatir** le formulaire
And le fichier est téléchargé côté navigateur, toujours modifiable dans un lecteur PDF compatible formulaires

**AC2 — Export 2 pages (aplati)**

Given un personnage Ryuutama créé
When un joueur clique sur "Exporter en PDF (2 pages)" depuis sa fiche
Then `GET /characters/:id/export.pdf?format=2pages` remplit le même template puis appelle `form.flatten()` avant de retourner le fichier
And le fichier est téléchargé côté navigateur, non modifiable

**AC3 — Mapping champ testé**

Given le mapping champ personnage → champ PDF (ex. classe Ryuutama → dropdown `Classe 1`, attribut VIG → dropdown `VIG` parmi `4/6/8/10/12`)
When ce mapping est unit-testé
Then chaque champ du `sheetData` a une correspondance explicite et testée vers un nom de champ AcroForm du fichier "edit" — pas de champ orphelin ni de valeur non mappée pour les 7 classes / 3 types / 5 armes du scope de ce palier

**AC4 — Accès MJ**

Given le MJ consulte la fiche d'un de ses joueurs
When il clique sur un des deux boutons d'export
Then le même export fonctionne, sans restriction supplémentaire par rapport à la consultation en lecture seule (même règle d'accès que `GET /characters/:id`, Story 4.1 : propriétaire ou MJ de la partie)

**AC5 — Accès refusé**

Given un utilisateur qui n'est ni propriétaire ni MJ de la partie du personnage
When il appelle `GET /characters/:id/export.pdf` (query param quelconque)
Then la réponse est 403, cohérente avec `findOne` existant (Story 4.1)

**Out of Scope confirmé (ne pas implémenter)** : option d'export "1 page" (format paysage condensé) — différée, cf. décision de scope du PRD ; édition de la fiche ; upload de portrait dans le PDF (le template n'a pas de champ image exploité ce palier — vérifier au moment du mapping, ne pas ajouter de logique image si le champ n'existe pas).

## Tasks / Subtasks

- [x] **Task 0 — Obtenir et placer le template PDF (BLOQUANT, à faire en premier)** (AC: 1, 2, 3)
  - [x] Le fichier `Ryuutama_fiche_de_voyageur_big_edit.pdf` (126 champs AcroForm) n'existe **nulle part dans le repo actuellement** — vérifié par recherche exhaustive avant la rédaction de cette story. Il doit être fourni par l'utilisateur (contenu sous droits d'auteur, comme le seed JSON de la Story 4.1).
  - [x] Créer `apps/api/game-systems/ryuutama/assets/` (nouveau dossier, à ajouter au `.gitignore` — suivre exactement le pattern de `apps/api/game-systems/ryuutama/data/` déjà gitignoré, cf. `.gitignore:33`)
  - [x] Ajouter un `README.md` dans ce dossier documentant le fichier attendu (`Ryuutama_fiche_de_voyageur_big_edit.pdf`), sur le modèle du `README.md` existant dans `apps/api/game-systems/ryuutama/` (Task de la Story 4.1)
  - [x] Écrire un petit script ponctuel (scratchpad, non commité) utilisant `pdf-lib` (`PDFDocument.load(bytes).getForm().getFields()`) pour lister les **vrais noms de champs AcroForm** du PDF une fois fourni — les deux noms connus (`Classe 1`, `VIG`) viennent de l'epic mais la liste complète des 126 champs doit être vérifiée sur le fichier réel avant d'écrire le mapping (Task 2). Ne pas deviner les noms de champs.
  - [x] Si le fichier n'est pas disponible au moment du développement : arrêter cette story et le signaler à l'utilisateur — ne pas construire un mapping sur des noms de champs inventés.

- [x] **Task 1 — Ajouter `pdf-lib` en dépendance** (AC: 1, 2)
  - [x] `apps/api/package.json` : ajouter `pdf-lib` (dernière version stable — vérifier via Context7 avant l'installation, la lib évolue peu mais valider l'API `PDFDocument`/`PDFForm` actuelle)
  - [x] `docker compose exec api pnpm add pdf-lib` (jamais `npm`/`pnpm` hors conteneur, cf. CLAUDE.md)

- [x] **Task 2 — Mapping `sheetData` → champs AcroForm (fonction pure)** (AC: 3)
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/pdf-field-map.ts` : fonction pure `mapToPdfFields(data: RyuutamaSheetData, derived: DerivedStats): Record<string, string>` — **aucune dépendance `pdf-lib`/`fs` ici**, juste la table de correspondance clé métier → nom de champ + valeur formatée (cohérent avec le principe déjà établi pour `computeDerived`/`validate` : fonctions pures, zéro I/O, réutilisables front/back)
  - [x] Couvrir explicitement les 7 classes, 3 types, 5 armes, 4 attributs, `derived` (PV/PE/Condition/Initiative/Encombrement), équipement (individual/group), objet fétiche, tous les champs narratifs
  - [x] Exporter le type depuis `packages/game-rules/src/index.ts` (suivre le pattern d'export existant)
  - [x] Tests unitaires dans `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (suivre le pattern de `compute-derived.spec.ts`/`validate.spec.ts`) : un test par classe/type/arme confirmant qu'aucune valeur du scope ce palier n'est orpheline (satisfait AC3 littéralement)

- [x] **Task 3 — Remplissage PDF côté API (I/O, pdf-lib)** (AC: 1, 2)
  - [x] Nouveau fichier, ex. `apps/api/src/characters/ryuutama-pdf.service.ts` (ou méthode dédiée dans `CharacterService` si tu juges qu'un service séparé est disproportionné — mais garder la responsabilité "lecture fichier + pdf-lib" isolée du reste de `CharacterService`, cf. principe P1-AD-1/AD-2 : un service = une responsabilité claire)
  - [x] Charge le template une fois (`readFile` + cache en mémoire, pas de re-lecture disque à chaque requête — comparable au chargement du seed JSON en Task de la Story 4.1, mais ici lazy au premier appel plutôt qu'au bootstrap puisque le PDF n'est nécessaire qu'à l'export)
  - [x] `fillCharacterPdf(character: CharacterDto, format: 'editable' | '2pages'): Promise<Buffer>` : `PDFDocument.load()`, `form.getTextField(name).setText(value)` / `getDropdown(name).select(value)` selon le type de champ réel (à déterminer via le script de Task 0), appelle `mapToPdfFields()` (Task 2) pour obtenir les valeurs, `form.flatten()` uniquement si `format === '2pages'`, retourne `Buffer.from(await doc.save())`
  - [x] Si le fichier template est absent au runtime (pas seulement au bootstrap comme le seed JSON) : lever une erreur explicite pointant vers le README de Task 0, pas un plantage générique

- [x] **Task 4 — Endpoint `GET /characters/:id/export.pdf`** (AC: 1, 2, 4, 5)
  - [x] Ajouter dans `apps/api/src/characters/characters.controller.ts` (déjà `@UseGuards(AuthenticatedGuard)`, déjà `@Controller('characters')`) : `@Get(':id/export.pdf')`, query param `format` validé (`'editable' | '2pages'`, rejeter toute autre valeur en 400 — utiliser un DTO `class-validator` avec `@IsIn(['editable', '2pages'])`, cohérent avec la convention DTO du repo)
  - [x] Réutilise la même vérification d'accès que `findOne` (propriétaire ou MJ, sinon 403) — **ne duplique pas cette logique**, appelle `CharacterService.findOne(id, userId)` d'abord (lève déjà 403/404) puis passe le `CharacterDto` résultant à `fillCharacterPdf`
  - [x] Retourne le buffer via `StreamableFile` (API Nest 11 standard pour les téléchargements binaires) avec headers `Content-Type: application/pdf` et `Content-Disposition: attachment; filename="..."` — **aucun endpoint de téléchargement de fichier n'existe encore dans ce repo**, pas de pattern existant à suivre ici, first-of-its-kind dans cette codebase

- [x] **Task 5 — Frontend : boutons d'export + téléchargement** (AC: 1, 2)
  - [x] `apps/web/src/app/core/characters/character.service.ts` : ajouter une méthode `exportPdf(id: string, format: 'editable' | '2pages'): Promise<Blob>` utilisant `this.http.get(..., { responseType: 'blob', withCredentials: true })` (suivre le style exact des méthodes existantes du service, juste avec `responseType: 'blob'` en plus — **aucun autre appel `blob` n'existe encore dans ce service**, premier de ce type)
  - [x] Dans `character-sheet.ts`/`.html` (`apps/web/src/app/features/characters/character-sheet/`) : deux boutons dans `.sheet__header` (`MatButtonModule`, suivre l'import déjà présent dans `character-wizard.ts` si `character-sheet.ts` ne l'a pas encore), déclenchent `exportPdf()` puis créent un lien de téléchargement (`URL.createObjectURL(blob)` + `<a download>` synthétique, révoqué après usage)
  - [x] Libellés themés via `ThemeToneService.tone` — ajouter 2 nouvelles clés microcopy (ex. `character.export_editable_cta`, `character.export_2pages_cta`) déclinées dans les 3 thèmes existants (`tones.ts`), suivant exactement le pattern des clés `character.*` déjà introduites en Story 4.2/4.3 (UX-DR19)
  - [x] Gérer l'échec réseau/403 avec un message explicite (signal d'erreur affiché à côté des boutons), pas un plantage silencieux — cohérent avec la gestion d'erreur déjà en place dans `character-sheet.ts` (`loadError`)

- [x] **Task 6 — Tests** (AC: 1-5)
  - [x] Backend : `characters.controller` ou `character.service` — test du 403 (non-membre), test 400 (format invalide), test que `format=2pages` appelle `flatten()` et que `format=editable` ne l'appelle pas (mock `pdf-lib` ou fixture PDF réduite pour ne pas dépendre du vrai template en CI si celui-ci reste gitignoré — **point à trancher en implémentation** : soit un template PDF de test minimal committé dans `apps/api/test/fixtures/` avec quelques champs AcroForm factices, soit un mock complet de `PDFDocument`)
  - [x] Frontend : `character.service.spec.ts` (ajouter `exportPdf()`), `character-sheet.spec.ts` (clic bouton → appel service → déclenchement téléchargement ; échec → message d'erreur affiché)
  - [x] `pnpm lint --fix` et `pnpm test` dans les conteneurs `api` et `web` doivent passer intégralement avant de marquer la story terminée

### Review Findings

- [x] [Review][Patch] Exceptions `pdf-lib` non gérées (champ manquant/type erroné, valeur dropdown hors options) et accès non défendus à `sheetData.attributes`/`equipment` partiel → 500 non gracieux [apps/api/src/characters/ryuutama-pdf.service.ts, packages/game-rules/src/ryuutama/pdf-field-map.ts] — corrigé : garde `attributes ?? {AGI:0,ESP:0,INT:0,VIG:0}` et `equipment.individual/group ?? []` dans `pdf-field-map.ts` ; try/catch autour du remplissage de chaque champ dans `ryuutama-pdf.service.ts` avec message d'erreur explicite pointant vers le README ; tests ajoutés (attributs manquants, équipement partiel)
- [x] [Review][Patch] Aucune vérification de `character.gameSystemId === RYUUTAMA_ID` avant de déléguer à `RyuutamaPdfService` — cassera silencieusement (TypeError) dès qu'un 2e système de jeu existera [apps/api/src/characters/characters.controller.ts] — corrigé : garde ajoutée dans `exportPdf()`, `BadRequestException` explicite si `gameSystemId` ≠ ryuutama, testé
- [x] [Review][Patch] Cache mémoire du template (`templateBytes`) non sûr en concurrence : deux requêtes concurrentes avant la résolution du premier `readFile` déclenchent deux lectures disque [apps/api/src/characters/ryuutama-pdf.service.ts] — corrigé : cache de la `Promise<Buffer>` elle-même plutôt que du buffer résolu, réinitialisée en cas d'échec
- [x] [Review][Patch] Téléchargement frontend : l'ancre synthétique n'est jamais attachée au DOM avant `.click()`, et `URL.revokeObjectURL` est appelé de façon synchrone juste après le clic [apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — corrigé : `appendChild`/`.remove()` autour du clic, `revokeObjectURL` différé via `setTimeout(0)`
- [x] [Review][Patch] Champs `narrative.personality`, stat dérivée `Encombrement` et `specialtyTypeId` (Artisan) silencieusement non mappés/non documentés dans `pdf-field-map.ts`, contrairement à `Condition`/`Paysage climat` [packages/game-rules/src/ryuutama/pdf-field-map.ts] — corrigé : ajoutés au commentaire "champs volontairement non couverts" (aucun champ dédié sur le vrai template, vérifié), tests explicites ajoutés
- [x] [Review][Patch] Le test "400 format invalide" (Task 6) ne valide que le DTO isolément, jamais le pipeline HTTP réel [apps/api/src/characters/characters.controller.spec.ts] — corrigé : suite `supertest` ajoutée avec `ValidationPipe` global réel + `AuthenticatedGuard` mocké, teste 400 (format invalide) et 200 (format valide) via le vrai pipeline HTTP
- [x] [Review][Patch] Nom de fichier de téléchargement frontend construit depuis le nom du personnage non assaini [apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — corrigé : nom assaini via `replace(/[^a-z0-9-_]+/gi, '_')` avant construction du nom de fichier
- [x] [Review][Defer] Le catch générique de `CharacterSheet.exportPdf()` fusionne toutes les causes d'échec (réseau/403/500/template corrompu) en un seul message thématisé — même tradeoff déjà explicitement déféré pour `loadError` en Story 4.3 (seul le 403 est distingué, le reste tombe dans un message générique) — deferred, pre-existing convention [apps/web/src/app/features/characters/character-sheet/character-sheet.ts]
- [x] [Review][Defer] `WEAPON_PDF_OPTION` retourne une chaîne vide silencieuse (sans log) pour toute `weaponCategoryId` future hors des 5 catégories connues — pertinent seulement si de nouvelles catégories d'armes sont ajoutées à un palier ultérieur — deferred, pre-existing scope [packages/game-rules/src/ryuutama/pdf-field-map.ts]
- [x] [Review][Defer] `character.sheetData as unknown as RyuutamaSheetData` (double cast sans validation de forme runtime) — pattern déjà présent dans `character.service.ts` depuis la Story 4.1, pas introduit par cette story — deferred, pre-existing [apps/api/src/characters/ryuutama-pdf.service.ts]
- [x] [Review][Defer] Aucun rate-limiting spécifique à la route d'export PDF au-delà de `AuthenticatedGuard`/throttler global — posture globale déjà actée au niveau du projet (CLAUDE.md), pas une régression de cette story — deferred, pre-existing

## Dev Notes

### Contexte hérité des Stories 4.1/4.2/4.3 (toutes `done`)

- `GET /characters/:id` (`CharacterService.findOne`, `apps/api/src/characters/character.service.ts:66`) fait déjà la vérification d'accès (propriétaire ou MJ, sinon 403/404) — **réutiliser cette méthode telle quelle** pour charger le personnage avant l'export, ne pas dupliquer la logique d'autorisation.
- `RyuutamaSheetData` (`packages/game-rules/src/ryuutama/types.ts`) :
  ```typescript
  interface RyuutamaSheetData {
    classId: string; specialtyTypeId?: string; typeId: string;
    attributes: { AGI: number; ESP: number; INT: number; VIG: number };
    weaponCategoryId: string; fetiqueObject?: string;
    equipment?: { individual: string[]; group: string[] };
    narrative?: { sex?; age?; physicalTraits?; homeTown?; motivation?; name?; personality? };
  }
  ```
- `DerivedStats` : `{ PV, PE, Condition, Initiative, Encombrement }` (déjà stocké sur `Character.derived`, pas besoin de recalculer — `CharacterDto.derived` de `@master-jdr/shared` le contient déjà).
- Clés de contenu seedé (`apps/api/game-systems/ryuutama/data/*.json`) — **les 15 valeurs métier à mapper vers le PDF** :
  - Classes (7) : `artisan, chasseur, fermier, guerisseur, marchand, menestrel, noble`
  - Types (3) : `attaque, technique, magie`
  - Armes (5) : `arc, epee-courte, epee-longue, hache, lance`
- `character-sheet.html` a déjà un `<header class="sheet__header">` avec `CharacterAvatar` + nom + méta (classe · type · Niveau 1 · Ryuutama) — **les Dev Notes de la Story 4.3 avaient explicitement choisi de ne PAS ajouter les boutons d'export en avance** ("ne pas les ajouter, même désactivés"). C'est cette story qui les ajoute maintenant, dans ce même header ou juste en dessous — placement exact laissé à l'implémentation, aucun mock UX ne le spécifie (voir plus bas).

### ⚠️ Blocker potentiel : fichier PDF source absent du repo

Recherche exhaustive effectuée avant la rédaction de cette story : **aucun fichier `.pdf` n'existe nulle part dans le repo actuellement** (`Ryuutama_fiche_de_voyageur_big_edit.pdf` mentionné dans l'epic n'a jamais été committé, cohérent avec le gitignore du contenu sous droits). Contrairement au seed JSON (Story 4.1, texte déjà extrait et committable une fois anonymisé), un PDF avec formulaire AcroForm ne peut pas être "reconstruit" à la main — le fichier binaire réel doit être fourni par l'utilisateur et placé dans `apps/api/game-systems/ryuutama/assets/` (Task 0) avant que le mapping de champs (Task 2) et les tests (Task 6) puissent être finalisés avec les **vrais noms de champs AcroForm**. Ne pas inventer de noms de champs plausibles — vérifier avec `pdf-lib` (`form.getFields().map(f => f.getName())`) une fois le fichier disponible.

### Aucun endpoint de téléchargement binaire n'existe encore dans ce repo

Tous les endpoints existants retournent du JSON. `StreamableFile` (NestJS 11) est l'API standard pour ce cas — vérifier la doc à jour via Context7 avant l'implémentation (signature exacte, gestion des headers `Content-Disposition`) plutôt que de se fier à une version mémorisée potentiellement obsolète. Idem côté frontend : `HttpClient` avec `responseType: 'blob'` n'est utilisé nulle part encore dans `apps/web` — premier de ce type, pas de pattern existant à copier au-delà des conventions générales du service (`API_BASE`, `withCredentials: true`).

### Séparation pure function / I/O (à respecter)

Le principe déjà établi pour `computeDerived()`/`validate()` (Story 4.1, décision d'architecture collective) est : `packages/game-rules` ne contient que des fonctions pures, zéro accès `fs`/réseau. Le mapping `sheetData → { fieldName: value }` (Task 2) respecte ce principe et vit dans `game-rules`. En revanche, la lecture du fichier PDF sur disque et l'appel à `pdf-lib` (I/O, dépendance Node) **doivent rester côté `apps/api`** (Task 3) — ne pas mettre `pdf-lib` en dépendance de `packages/game-rules`.

### État du working tree au démarrage de cette story

Au moment de la création de cette story, la Story 4.3 est marquée `done` dans `sprint-status.yaml` mais **ses fichiers ne sont pas encore commités** (`git status` montre les fichiers de `character-sheet`, `character-avatar`, `character-summary-card`, etc. en `staged`/modifiés au-dessus du commit `f12adf2`). Cette story 4.4 se construit sur cet état du working tree tel quel — ne pas chercher à "réinitialiser" ou committer ce travail avant de commencer, sauf instruction explicite de l'utilisateur.

### Pas de mock UX pour le placement des boutons d'export

`DESIGN.md`/`EXPERIENCE.md` (ux-jdr-master-20260703) ne mentionnent l'export nulle part, et aucun mock (`key-fiche-desktop.html`) n'inclut de bouton d'export — confirmé par recherche exhaustive. Placement laissé à l'implémentation : suivre le style visuel déjà établi (`stat-pill`, `MatButtonModule`, header de fiche) plutôt que d'inventer un nouveau pattern visuel.

### Project Structure Notes

- Nouveau dossier `apps/api/game-systems/ryuutama/assets/` (gitignoré) — pattern identique à `.../data/` déjà en place, ajouter la ligne correspondante dans `.gitignore`.
- Nouveau fichier `packages/game-rules/src/ryuutama/pdf-field-map.ts` + export dans `packages/game-rules/src/index.ts` (suit exactement le pattern `compute-derived.ts`/`validate.ts`).
- Nouveau service API `apps/api/src/characters/ryuutama-pdf.service.ts` (ou méthode ajoutée à `CharacterService`, au choix — mais isoler la logique I/O pdf-lib).
- Modification de `apps/api/src/characters/characters.controller.ts` (nouvelle route), `apps/api/package.json` (dépendance `pdf-lib`), `.gitignore`.
- Modification de `apps/web/src/app/core/characters/character.service.ts` (`exportPdf`), `character-sheet.ts`/`.html`/`.scss`, `apps/web/src/app/core/theme/tones.ts` (2 nouvelles clés microcopy × 3 thèmes).
- Aucune migration Prisma nécessaire (pas de nouveau champ persistant, l'export est calculé à la volée).

### Patterns existants à suivre absolument

| Pattern | Où | À ne pas réinventer |
|---|---|---|
| Vérification d'accès personnage (403 propriétaire/MJ) | `CharacterService.findOne` | Ne pas dupliquer dans le nouvel endpoint export |
| Fonctions pures sans I/O dans `packages/game-rules` | `compute-derived.ts`, `validate.ts` | Le mapping de champs PDF suit le même principe |
| Dossier gitignoré + README pour contenu sous droits | `apps/api/game-systems/ryuutama/data/` + son `README.md` | Même structure pour `assets/` |
| Chargement de seed avec message d'erreur explicite si fichier absent | `game-system.service.ts#seedRyuutama` | Même principe pour le template PDF absent |
| `import type` pour `@master-jdr/shared`/`@master-jdr/game-rules` | tous les fichiers existants | — |
| Tests : `TestBed`/Jest direct, pas de Testing Library | tous les `.spec.ts` du repo | — |
| Microcopy thématisé via `ThemeToneService.tone` | `character.*` clés existantes (Story 4.2/4.3) | 2 nouvelles clés à ajouter, même déclinaison ×3 thèmes |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4 : Export PDF de la fiche] (lignes 1005-1041) — ACs sources, décision de scope (2 formats livrés, "1 page" différé), fichiers sources PDF listés
- [Source: _bmad-output/planning-artifacts/epics.md#FR38] (ligne 64) et [ligne 95, bullet ARCH exportPDF]
- [Source: apps/api/src/characters/character.service.ts#findOne] — logique d'accès à réutiliser
- [Source: apps/api/src/game-systems/game-system.service.ts#seedRyuutama] — pattern gitignore + README + erreur explicite si fichier absent
- [Source: packages/game-rules/src/ryuutama/types.ts] — `RyuutamaSheetData`/`DerivedStats`
- [Source: _bmad-output/implementation-artifacts/4-3-consulter-fiche-personnage.md#Dev Notes Task 5] — décision explicite de ne pas ajouter les boutons d'export en Story 4.3
- [Source: apps/api/game-systems/ryuutama/README.md] — modèle à suivre pour le README du nouveau dossier `assets/`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Le fichier `Ryuutama_fiche_de_voyageur_big_edit.pdf` était déjà présent dans le repo au démarrage de cette session (ajouté par l'utilisateur entre la création de la story et le début du dev), staged par erreur (`git add`) — désinstallé de l'index (`git restore --staged`) et ajouté à `.gitignore` (`apps/api/game-systems/ryuutama/assets/`) avant toute autre action, conformément au Dev Note "contenu sous droits d'auteur, jamais committé".
- Champs AcroForm réels inspectés via un script `pdf-lib` ponctuel exécuté dans le conteneur `api` (`PDFDocument.load` + `form.getFields().map(f => f.getName())`) : **119 champs** au total (pas 126 comme indiqué dans l'epic — écart mineur, sans impact). Script supprimé après inspection, non commité.
- Écart notable vs l'epic : aucun champ `Condition` n'existe sur le template officiel (vérifié exhaustivement sur les 119 champs) — la stat dérivée `Condition` (VIG+ESP) n'est donc pas remplie dans le PDF, documenté explicitement dans `pdf-field-map.ts` et testé (`pdf-field-map.spec.ts`). De même, `RyuutamaSheetData` n'a pas de champ paysage/climat (Story 4.1/4.2 ne l'ont jamais implémenté) — le dropdown `Paysage climat` du PDF reste donc non rempli, cohérent avec "si renseigné" de l'AC1.
- Les dropdowns `Arme Fav` du PDF utilisent des libellés différents de ceux du seed JSON (`"Epées courtes"` vs notre `"Épée courte"`) — mapping explicite ajouté (`WEAPON_PDF_OPTION`) plutôt que de réutiliser le label du contenu.
- `packages/game-rules` étant zéro-I/O par principe (Story 4.1), le contenu résolu (labels de classe/type/arme, talents) est passé en paramètre à `mapToPdfFields()` par l'appelant (`RyuutamaPdfService`, côté `apps/api`), qui le récupère via `GameSystemService.getContent()` déjà existant — pas de duplication de données ni de violation du principe des fonctions pures.
- `pnpm lint` sur `apps/api` remonte ~153 erreurs pré-existantes dans `poll.service.ts`/`character.service.ts` (unsafe `any`, tech debt déjà connue, non touchée par cette story — confirmé via `git status` que ces fichiers n'ont pas été modifiés). Tous les fichiers touchés par cette story passent le lint sans erreur (2 warnings pré-existants du même type, cohérents avec le reste du repo).

### Completion Notes List

- AC1/AC2 satisfaits : `GET /characters/:id/export.pdf?format=editable|2pages` remplit les champs AcroForm du template officiel via `pdf-lib`, flatten uniquement pour `2pages`.
- AC3 satisfait : mapping `sheetData → champs PDF` unit-testé (10 tests), couvre les 7 classes/3 types/5 armes/4 attributs sans valeur orpheline ; la non-couverture de `Condition` (aucun champ correspondant sur le vrai template) est testée explicitement comme comportement voulu, pas un oubli.
- AC4/AC5 satisfaits : l'endpoint réutilise `CharacterService.findOne` (403/404 déjà gérés en Story 4.1), aucune logique d'accès dupliquée.
- Premier endpoint de téléchargement binaire du repo (`StreamableFile`) et premier appel `responseType: 'blob'` côté frontend — pattern documenté dans le code pour les prochaines stories similaires (ex. future Story 4.5 portrait).
- `pnpm lint --fix` et `pnpm test` passent intégralement dans `api`, `web` et `packages/game-rules` (130 + 204 + 22 tests). Les erreurs de lint pré-existantes dans `poll.service.ts`/`character.service.ts` (hors scope, fichiers non touchés) ne bloquent pas cette story.
- **Revue de code (2026-07-04)** : revue adversariale à 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) exécutée sur le diff complet vs `f12adf2`. 7 patches appliqués, 4 items déférés (pre-existing/hors scope), 7 findings écartés comme bruit. Après application : `pnpm test` passe intégralement dans `api` (133 tests), `web` (204 tests) et `packages/game-rules` (26 tests) ; `pnpm lint --fix` propre sur tous les fichiers touchés.

Patches appliqués :
- Exceptions `pdf-lib` non gérées + accès non défendus à `attributes`/`equipment` partiel → gardes ajoutées + try/catch explicite
- Garde `gameSystemId === RYUUTAMA_ID` ajoutée avant délégation à `RyuutamaPdfService`
- Cache du template PDF rendu concurrency-safe (cache de la `Promise`, pas du `Buffer` résolu)
- Téléchargement frontend : ancre attachée au DOM avant clic, `revokeObjectURL` différé
- `personality`/`Encombrement`/`specialtyTypeId` documentés explicitement comme non couverts (aucun champ dédié sur le vrai template) + tests
- Test HTTP réel (`supertest` + `ValidationPipe` global) ajouté pour le 400 format invalide
- Nom de fichier de téléchargement assaini

### File List

- `.gitignore` (modifié — ajout de `apps/api/game-systems/ryuutama/assets/`)
- `apps/api/game-systems/ryuutama/assets/README.md` (nouveau, gitignoré — n'apparaît pas dans `git status`)
- `apps/api/game-systems/ryuutama/assets/Ryuutama_fiche_de_voyageur_big_edit.pdf` (fourni par l'utilisateur, gitignoré — n'apparaît pas dans `git status`)
- `apps/api/package.json` (modifié — dépendance `pdf-lib`)
- `pnpm-lock.yaml` (modifié)
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (nouveau)
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (nouveau)
- `packages/game-rules/src/index.ts` (modifié — export `mapToPdfFields`/`RyuutamaPdfContent`/`PdfFieldValue`)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (nouveau)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (nouveau)
- `apps/api/src/characters/characters.controller.ts` (modifié — endpoint `GET :id/export.pdf`)
- `apps/api/src/characters/characters.controller.spec.ts` (nouveau)
- `apps/api/src/characters/character.module.ts` (modifié — import `GameSystemModule`, provider `RyuutamaPdfService`)
- `apps/api/src/characters/dto/export-character-pdf.dto.ts` (nouveau)
- `apps/api/src/characters/dto/export-character-pdf.dto.spec.ts` (nouveau)
- `apps/web/src/app/core/characters/character.service.ts` (modifié — `exportPdf()`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 3 nouvelles clés `character.export_*` × 3 thèmes)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — boutons d'export)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)

## Change Log

- 2026-07-04 : Implémentation complète de la Story 4.4 (Tasks 0 à 6) — inspection des champs AcroForm réels du template PDF fourni par l'utilisateur, mapping `sheetData → champs PDF` (fonction pure, `packages/game-rules`), `RyuutamaPdfService` (I/O `pdf-lib`, cache mémoire du template), endpoint `GET /characters/:id/export.pdf`, boutons d'export frontend + microcopy thémée, tests (356 tests au total dans les 3 paquets touchés).
