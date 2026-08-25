---
baseline_commit: 7715ebb
---

# Story 10.5: Exporter sa fiche en PDF

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want exporter la fiche de mon Homme Dragon en PDF pré-rempli,
So that je puisse jouer à table comme mes joueurs.

## Acceptance Criteria

1. **Given** ma fiche Homme Dragon existe, avec un niveau/PS/historique/artefact déjà déterminés **When** je déclenche l'export PDF **Then** j'obtiens un fichier PDF reflétant l'état courant complet de la fiche (champs narratifs, artefact, niveau, PS, historique)
2. **Given** je modifie un champ de ma fiche (ex. artefact, champs narratifs) après un premier export **When** j'exporte à nouveau **Then** le nouveau PDF reflète les valeurs à jour, pas celles du premier export

## Tasks / Subtasks

- [x] **Task 0 — Vérifier les champs AcroForm du template (ne pas deviner, cf. précédent Story 4.4/4.6)**
  - [x] Le template `apps/api/game-systems/ryuutama/assets/Ryuutama_fiche_homme-dragon_big_edit.pdf` existe déjà sur le disque (gitignored, contenu sous droits d'auteur — même README que la fiche PJ). **Les 63 champs AcroForm ont déjà été extraits et vérifiés** lors de la création de cette story (script `pdf-lib` ponctuel, `form.getFields()` + `widget.getRectangle()`) — reproduits ci-dessous pour éviter de refaire ce travail, mais **revérifier par une exécution réelle avant de coder** (le fichier a pu changer) :
    ```
    Page 0 (fiche principale) :
      nom, couleur, niveau, artefact, inscription, avatar, meneur, cree_le
      souffle_max, souffle_actuel, nombre_souffles, souffle_1..4 (4 champs, non mappés — cf. Task 5)
      eveil_1, eveil_2, eveil_3, eveil_4
    Page 1 (historique/voyageurs) :
      demeure, vocation, apparence_caractere
      monde_protege_1, monde_protege_2, monde_protege_3
      voyageurs_proteges_1, voyageurs_proteges_2
      sc1..sc12, date_sc_1..date_sc_12, voy_sc_1..voy_sc_12 (12 lignes d'historique)
    ```
    Tous les champs sont des `PDFTextField` (aucun dropdown/checkbox sur ce template, contrairement à la fiche PJ) — pas de logique `kind: 'dropdown'` à gérer ici.
  - [x] Si un champ listé ci-dessus n'existe plus, ou si de nouveaux champs apparaissent, **arrêter et documenter l'écart** (même vigilance que Task 0 des Stories 10.1/10.4 pour le contenu de jeu — ici pour la structure du fichier PDF).

- [x] **Task 1 — `packages/game-rules/ryuutama` : `mapHommeDragonToPdfFields()`** (AC1, AC2)
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts` — même convention que `pdf-field-map.ts` du PJ (fonction pure, ne charge rien en interne, ne lève jamais).
  - [x] Signature proposée (adapter aux vrais champs si Task 0 révèle un écart) :
    ```typescript
    import type { HommeDragonDto } from '@master-jdr/shared';
    import type { PdfFieldValue } from './pdf-field-map.ts';

    export interface HommeDragonPdfContent {
      /** Libellé de la race (ex. "Dragon Rouge") — résolu par l'appelant, même RACE_LABELS que le frontend. */
      raceLabel: string;
      /** Pseudo du MJ — remplit "meneur". */
      mjPseudo: string;
      /** key → label du catalogue eveilPower — résout eveil_1..4 sans jamais afficher une clé technique brute. */
      eveilPowerLabels: Record<string, string>;
    }

    export function mapHommeDragonToPdfFields(
      dto: HommeDragonDto,
      content: HommeDragonPdfContent,
    ): PdfFieldValue[] {
      // ...
    }
    ```
  - [x] Mapping champ par champ (tous `kind: 'text'`) :
    - `nom` ← `sheetData.nom`
    - `couleur` ← `content.raceLabel`
    - `niveau` ← `String(derived.level)`
    - `artefact` ← `sheetData.artefact.nom || sheetData.artefact.key` (même fallback que le frontend, jamais la clé technique seule si un nom existe)
    - `inscription` ← `sheetData.artefact.inscription ?? ''`
    - `avatar` ← `sheetData.avatar ?? ''`
    - `meneur` ← `content.mjPseudo`
    - `cree_le` ← `createdAt` formaté (`toLocaleDateString('fr-FR')` ou équivalent — vérifier qu'aucune fonction de formatage de date n'existe déjà dans `packages/game-rules` avant d'en écrire une)
    - `souffle_max` ← `String(derived.PS)`
    - `souffle_actuel` ← même valeur que `souffle_max` (décision de conception : la fiche exportée représente un état de départ « plein », le suivi de dépense en jeu reste manuel à la table, cf. FR7 — aucune donnée de dépense n'existe côté app pour renseigner une valeur différente)
    - `nombre_souffles` ← même valeur que `souffle_max` (champ dupliqué ailleurs sur le template, même donnée)
    - `souffle_1`..`souffle_4` : **volontairement non mappés** (cases de suivi manuel à la table, aucune donnée correspondante dans le modèle — même principe que les champs « volontairement non couverts » documentés dans `pdf-field-map.ts` du PJ)
    - `apparence_caractere` ← concaténation `sheetData.apparence`/`sheetData.caractere` si les deux existent (ex. `"{apparence}\n\n{caractere}"`), un seul si l'autre est absent, chaîne vide si aucun des deux (champ unique sur le template pour les deux données distinctes de notre modèle)
    - `vocation` ← `sheetData.vocation ?? ''`
    - `demeure` ← `sheetData.demeure ?? ''`
    - `monde_protege_1` ← `sheetData.mondesProteges ?? ''` ; `monde_protege_2`/`monde_protege_3` laissés vides (notre modèle a un seul champ texte libre `mondesProteges`, le template prévoit 3 lignes — ne jamais tenter de découper artificiellement une chaîne libre en 3 morceaux)
    - `voyageurs_proteges_1`/`voyageurs_proteges_2` ← les 2 premiers `voyageursProteges[].pseudo` (le template n'a que 2 emplacements ; si plus de 2 voyageurs, les suivants sont omis — pas de troncature à signaler à l'utilisateur, différence assumée entre le nombre réel de membres et l'espace physique du PDF officiel)
    - `eveil_1`/`eveil_2`/`eveil_3`/`eveil_4` ← **mapping par niveau, pas par ordre du tableau** : `eveil_1` = pouvoir choisi pour le niveau 2 (`eveilPowers.find(e => e.level === 2)`), `eveil_2` = niveau 3, `eveil_3` = niveau 4, `eveil_4` = niveau 5 — label résolu via `content.eveilPowerLabels[key]`, jamais la clé brute ; vide si aucun choix fait pour ce niveau. **Ne pas mapper par position dans le tableau `eveilPowers[]`** : la disposition visuelle réelle du template (vérifiée par les coordonnées, Task 0) n'est pas dans l'ordre 1-2-3-4 de haut en bas/gauche à droite, un mapping par index d'insertion produirait un résultat visuellement incohérent si les niveaux sont pourvus dans le désordre (cf. Story 10.4, revue de code : l'API autorise un remplissage hors-ordre).
    - `sc1`..`sc12` (titre), `date_sc_1`..`date_sc_12` (date), `voy_sc_1`..`voy_sc_12` (participants, `join(', ')`) ← `historique[]`, **dans l'ordre chronologique déjà renvoyé par `computeHistorique()`** (le plus ancien en premier, `sc1`). Le template n'a que 12 lignes : si `historique.length > 12`, garder les **12 plus récents** (`historique.slice(-12)`) plutôt que les 12 plus anciens — à table, l'historique récent est plus utile que le tout début de campagne. Lignes 13+ non représentées, aucune erreur.
  - [x] Exporter `mapHommeDragonToPdfFields`/`HommeDragonPdfContent` depuis `packages/game-rules/src/index.ts`.
  - [x] Tests TDD dans un nouveau fichier `packages/game-rules/src/__tests__/homme-dragon-pdf-field-map.spec.ts` : chaque champ mappé correctement (valeurs simples, valeurs vides/optionnelles absentes → chaîne vide), historique > 12 → 12 plus récents gardés, eveilPowers mappé par niveau et non par index (test explicite avec un remplissage hors-ordre : niveau 3 choisi avant niveau 2 → `eveil_1` reflète quand même le niveau 2), voyageursProteges > 2 → seuls les 2 premiers, `souffle_actuel`/`nombre_souffles` égaux à `souffle_max`.

- [x] **Task 2 — Backend : `HommeDragonPdfService`** (AC1, AC2)
  - [x] Nouveau fichier `apps/api/src/homme-dragon/homme-dragon.pdf.service.ts` — même structure que `apps/api/src/characters/ryuutama-pdf.service.ts` (`loadTemplate()` avec cache `templatePromise`, mêmes messages d'erreur pointant vers un README, `PDFDocument.load`/`getForm()`/boucle sur les champs avec `try/catch` par champ).
  - [x] Constante `PDF_TEMPLATE_PATH` : `join(process.cwd(), 'game-systems/ryuutama/assets/Ryuutama_fiche_homme-dragon_big_edit.pdf')`.
  - [x] Méthode `fillHommeDragonPdf(hommeDragon: HommeDragonDto, mjPseudo: string): Promise<Buffer>` :
    - Résout `raceLabel` (même `RACE_LABELS` que le frontend — dupliquer la constante côté API plutôt que de la partager depuis `@master-jdr/shared` runtime, cf. contrainte déjà documentée dans `ryuutama-pdf.service.ts` : ce package est types-only, effacé au runtime).
    - Résout `eveilPowerLabels` via `this.gameSystems.getContent(RYUUTAMA_ID)` → `content['eveilPower']` → map `key → label` (même pattern que `labelMap()` existant dans `ryuutama-pdf.service.ts`, à dupliquer ou factoriser si un import cross-fichier propre existe déjà — sinon dupliquer, ce sont deux services distincts).
    - Appelle `mapHommeDragonToPdfFields(hommeDragon, { raceLabel, mjPseudo, eveilPowerLabels })`, remplit chaque champ texte (`form.getTextField(f.field).setText(f.value)` dans un `try/catch` avec le même message d'erreur pointant vers le README, si un champ est introuvable/incompatible), **aucun `form.flatten()`** (pas de distinction de format `editable`/`2pages` pour cette fiche, contrairement à l'export PJ — un seul format, cf. AC1/AC2 qui ne mentionnent qu'« un fichier PDF »).
  - [x] Ce service n'a besoin d'aucune donnée hors de `HommeDragonDto` + le pseudo du MJ (pas de portrait, pas de contenu de classe/type/arme comme pour le PJ) — pas de dépendance à `PartiesService`/`ScenariosService` ici, uniquement `GameSystemService` (déjà utilisé ailleurs dans `HommeDragonModule`).
  - [x] Tests TDD (`homme-dragon.pdf.service.spec.ts`, même mock `jest.mock('node:fs/promises', ...)` + `jest.mock('@master-jdr/game-rules', ...)` que `ryuutama-pdf.service.spec.ts`) : template introuvable → erreur explicite ; champs correctement remplis (mock `mapHommeDragonToPdfFields`) ; échec de `setText` sur un champ → erreur explicite pointant vers le README, pas un crash silencieux.

- [x] **Task 3 — Route d'export + accès au pseudo du MJ** (AC1, AC2)
  - [x] Ajouter la route dans `HommeDragonController` (`apps/api/src/homme-dragon/homme-dragon.controller.ts`) :
    ```typescript
    @Get('export.pdf')
    async exportPdf(
      @Param('id', ParseUUIDPipe) partieId: string,
      @CurrentUser() user: AuthUser,
    ): Promise<StreamableFile> {
      const hommeDragon = await this.hommeDragon.findOne(partieId, user.id);
      if (!hommeDragon) throw new NotFoundException('Homme Dragon introuvable');
      const mjPseudo = await this.hommeDragon.getOwnerPseudo(hommeDragon.userId);
      const pdfBytes = await this.hommeDragonPdf.fillHommeDragonPdf(hommeDragon, mjPseudo);
      return new StreamableFile(pdfBytes, {
        type: 'application/pdf',
        disposition: `attachment; filename="homme-dragon-${partieId}.pdf"`,
      });
    }
    ```
    Lecture ouverte à tout membre (même garde `findOne()` que le reste du module, NFR1 — un joueur peut donc aussi exporter la fiche de son MJ pour la consulter, cohérent avec la lecture déjà ouverte à tout membre sur `GET /parties/:id/homme-dragon`). **Vérifier auprès de l'utilisateur si l'export doit être restreint au MJ seul** avant de coder cette route si un doute subsiste — l'AC ne le précise pas explicitement (« As a MJ, I want exporter... ») mais aucune AC n'exige un refus pour un joueur, contrairement aux fiches de référence MJ-only de l'Epic 12 (FR12) qui, elles, l'exigent explicitement. Décision par défaut de cette story (à confirmer si besoin en dev-story) : **lecture ouverte à tout membre**, cohérent avec NFR1 et `findOne()`.
  - [x] Pseudo du MJ : `HommeDragonDto` ne renvoie pas le pseudo du propriétaire (`userId` seulement). `hommeDragon.userId` EST le MJ (contrainte unique `[userId, partieId, gameSystemId]`, toujours créé par le MJ via `getOwned` — jamais un joueur). Ajouter `HommeDragonService.getOwnerPseudo(userId: string): Promise<string>` (`this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pseudo: true } })`, retourne `.pseudo`) plutôt que d'injecter `PartiesService`/`Prisma` directement dans le controller — même principe de couche que le reste du module (le controller ne parle jamais à `PrismaService` directement).
  - [x] Injecter `HommeDragonPdfService` dans `HommeDragonController` (nouveau provider dans `HommeDragonModule`).
  - [x] Tests controller : la route délègue à `hommeDragonPdf.fillHommeDragonPdf()` avec la bonne fiche/pseudo ; `NotFoundException` si aucune fiche n'existe encore (jamais un PDF vide).

- [x] **Task 4 — Frontend : bouton d'export** (AC1, AC2)
  - [x] `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts`, ajouter (même pattern `responseType: 'blob'` que `CharacterService.exportPdf()`) :
    ```typescript
    exportPdf(partieId: string): Promise<Blob> {
      return firstValueFrom(
        this.http.get(`${API_BASE}/parties/${partieId}/homme-dragon/export.pdf`, {
          responseType: 'blob',
          withCredentials: true,
        }),
      );
    }
    ```
  - [x] `homme-dragon-sheet.ts` : ajouter `protected readonly exporting = signal(false);`, `protected readonly exportError = signal<string | null>(null);`, `protected async onExportPdf(): Promise<void>` — même pattern que `CharacterSheet.exportPdf()` (créer un lien `<a>` avec `URL.createObjectURL(blob)`, déclencher le clic, révoquer l'URL ensuite). Nom de fichier suggéré : `homme-dragon-{nom-safe}.pdf` (même normalisation `replace(/[^a-z0-9-_]+/gi, '_')` que `CharacterSheet`).
  - [x] `homme-dragon-sheet.html` : bouton dans la branche fiche existante (`@else`), ex. en haut de la section fiche à côté du nom — texte simple « Exporter en PDF » (pas de `theme.tone()` : les autres boutons de ce composant, Modifier/Confirmer/Annuler, ne sont pas non plus thémés, contrairement à `create_cta`).
  - [x] Tests : clic déclenche `hommeDragonSvc.exportPdf()` avec le bon `partieId` ; échec → `exportError()` renseigné.

- [x] **Task 5 — Validation finale**
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 0 régression + nouveaux tests `mapHommeDragonToPdfFields`.
  - [x] `docker compose exec api pnpm exec jest` — 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - [x] Redémarrage réel du conteneur `api` — `Nest application successfully started`, route `GET /parties/:id/homme-dragon/export.pdf` mappée.
  - [x] **Test manuel recommandé** : déclencher un vrai export depuis l'app (ou `curl`) et ouvrir le PDF produit pour vérifier visuellement le positionnement des champs — aucun outil de rendu PDF n'est disponible pendant le développement (même limitation documentée pour la Story 4.6, portrait), donc le mapping champ→valeur est vérifié par les tests, mais **jamais son rendu visuel final** tant que ce test manuel n'a pas été fait. Documenter le résultat dans les Completion Notes.

### Review Findings

Revue de code adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-07-17. 2 violations d'AC confirmées par l'Acceptance Auditor (toutes deux dans `mapHommeDragonToPdfFields`), sinon la déviation « pool commun »/mapping par niveau et les autres décisions de conception sont correctement respectées.

- [x] [Review][Patch] `eveil_N` retombe sur la clé technique brute si un pouvoir choisi n'a plus de libellé dans le catalogue — viole explicitement « jamais la clé brute » du Task 1 (`content.eveilPowerLabels[key] ?? key` devrait être `?? ''`) [packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts]
- [x] [Review][Patch] `cree_le`/`date_sc_N` affichés au format ISO (`AAAA-MM-JJ`) au lieu du format fr-FR explicitement demandé par le Task 1 (`toLocaleDateString('fr-FR')` ou équivalent) [packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts]
- [x] [Review][Patch] Message d'erreur sur échec de `setText()` attribué à tort à « champ introuvable ou incompatible » alors qu'un des cas réels rencontrés en test manuel est un caractère non encodable en WinAnsi (`Error: WinAnsi cannot encode`) — message à élargir pour couvrir les deux causes [apps/api/src/homme-dragon/homme-dragon.pdf.service.ts]
- [x] [Review][Defer] `PDF_TEMPLATE_PATH` construit via `join(process.cwd(), ...)`, fragile si le process n'est pas lancé depuis la racine du repo [apps/api/src/homme-dragon/homme-dragon.pdf.service.ts] — pattern déjà présent depuis `ryuutama-pdf.service.ts` (Story 4.4), pas introduit par cette story
- [x] [Review][Defer] `getOwnerPseudo()` utilise `findUniqueOrThrow` — surfacerait une erreur Prisma brute (pas une `NotFoundException` NestJS) si l'utilisateur MJ était introuvable [apps/api/src/homme-dragon/homme-dragon.service.ts] — non atteignable en pratique (`onDelete: Cascade` sur `HommeDragon.user` garantit qu'un Homme Dragon existant a toujours un MJ existant), à durcir si l'invariant change un jour
- [x] [Review][Defer] La boucle de remplissage de champs s'arrête au premier champ en échec plutôt que de collecter tous les champs incompatibles [apps/api/src/homme-dragon/homme-dragon.pdf.service.ts] — même convention que `ryuutama-pdf.service.ts` (Story 4.4), pas une régression isolée
- [x] [Review][Defer] Aucune validation/`try-catch` autour de `PDFDocument.load()`/`doc.save()` pour un template corrompu — même convention (absence de garde) que `ryuutama-pdf.service.ts` (Story 4.4)
- [x] [Review][Defer] `RACE_LABELS` dupliqué entre `homme-dragon.pdf.service.ts` (API) et `homme-dragon-sheet.ts` (web) — compromis déjà documenté et assumé pour la même raison que `PORTRAIT_X/Y/WIDTH/HEIGHT` (frontière `@master-jdr/shared` types-only, effacée au runtime)
- [x] [Review][Defer] Le `catch` du frontend (`onExportPdf()`) masque la vraie erreur, message générique quel que soit le motif [apps/web/.../homme-dragon-sheet.ts] — cohérent avec le pattern déjà établi pour `createError`/`updateError`/`eveilPowerError` sur ce même composant

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1** (`ARCHITECTURE-SPINE.md`) : nouveau fichier `homme-dragon.pdf.service.ts` dans `apps/api/src/homme-dragon/`, réutilise le pattern `RyuutamaPdfService` déjà en place pour la fiche PJ. Charge le template déjà présent `Ryuutama_fiche_homme-dragon_big_edit.pdf`.
- **AD-3** : `derived`/`historique`/`voyageursProteges`/`eveilPowers`/`pendingEveilLevels` sont déjà calculés par `HommeDragonService.findOne()` (Stories 10.2-10.4) — cette story ne fait AUCUN nouveau calcul métier, uniquement du mapping d'affichage vers des champs PDF à partir du DTO déjà complet.
- **Différence structurelle avec l'export PJ** : pas de portrait (aucun champ image sur ce template, aucun champ `portraitUrl` sur `HommeDragonDto`), pas de distinction de format `editable`/`2pages` (un seul format), pas de contenu de classe/type/arme à résoudre — la seule résolution de contenu nécessaire est le libellé des pouvoirs d'éveil choisis (`eveilPower`, catalogue déjà seedé Story 10.4).
- **Accès** : lecture ouverte à tout membre par défaut (même garde `findOne()`/NFR1 que le reste du module) — cf. Task 3 pour la décision et son alternative si l'utilisateur préfère restreindre au MJ.

### Champs AcroForm du template (vérifiés via pdf-lib pendant la création de cette story — cf. Task 0 pour la procédure de revérification)

63 champs au total, tous `PDFTextField` (aucun dropdown/checkbox, contrairement à la fiche PJ). Liste complète et mapping proposé : voir Task 1. Points d'attention particuliers :
- `eveil_1..4` : disposition visuelle réelle sur le PDF (vérifiée par coordonnées) = `eveil_1`/`eveil_3` sur la même ligne (rangée du haut), `eveil_2`/`eveil_4` sur la ligne du dessous — **numérotation non séquentielle visuellement**. Le mapping retenu (Task 1) est donc **par niveau** (`eveil_N` = niveau `N+1`), pas par position dans le tableau `eveilPowers[]`, pour rester correct indépendamment de cette disposition et de l'ordre réel de remplissage (Story 10.4 autorise un remplissage hors-ordre par API directe).
- `sc1..12`/`date_sc_1..12`/`voy_sc_1..12` : disposition en 2 colonnes × 6 rangées, `sc1` en haut, `sc12` en bas — mapping direct avec `historique[]` dans son ordre chronologique déjà renvoyé (le plus ancien en premier). Seulement 12 emplacements ; au-delà, garder les 12 plus récents (`slice(-12)`).
- `voyageurs_proteges_1/2` : seulement 2 emplacements sur le template, quel que soit le nombre réel de membres de la Partie.
- `monde_protege_1/2/3` : 3 emplacements sur le template pour un seul champ `mondesProteges` (texte libre) côté données — ne jamais découper artificiellement, remplir uniquement le premier.
- `souffle_1..4` : cases de suivi manuel à la table, aucune donnée correspondante — volontairement non mappées (même principe que les champs "non couverts" déjà documentés pour la fiche PJ).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/characters/ryuutama-pdf.service.ts`** — patron direct et complet : `loadTemplate()` (cache + erreur explicite), boucle de remplissage de champs avec `try/catch` par champ, structure générale du service. Ignorer tout ce qui concerne le portrait (`embedPortrait`, `fitCentered`, `computePdfCropDraw`) — non applicable ici (aucun champ image sur ce template).
- **`apps/api/src/characters/characters.controller.ts`** (méthode `exportPdf`) — patron pour la nouvelle route : résolution de la fiche, garde de système de jeu (non nécessaire ici, `HommeDragonModule` est déjà scopé Ryuutama), construction du `StreamableFile`.
- **`packages/game-rules/src/ryuutama/pdf-field-map.ts`** — patron direct pour `homme-dragon-pdf-field-map.ts` : structure `PdfFieldValue`/`RyuutamaPdfContent`, convention de champs "volontairement non couverts" documentée en commentaire.
- **`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`** (méthode `exportPdf`) — patron direct pour `onExportPdf()` côté Homme Dragon (téléchargement du blob, nom de fichier normalisé).
- **`apps/api/src/homme-dragon/homme-dragon.service.ts`** (état actuel post-Story 10.4) — `findOne()`/`buildDto()` : DTO déjà complet (`derived`, `historique`, `voyageursProteges`, `eveilPowers`, `pendingEveilLevels`), rien à recalculer.

### Hors scope explicite de cette story

- Épics 11/12 (export équipement/notes joueur, téléchargement fiches de référence) — stories séparées.
- Tout suivi de dépense/récupération de Points de Souffle en jeu (FR7 : affichage seul) — `souffle_actuel` est pré-rempli égal à `souffle_max` à l'export, jamais une valeur distincte suivie par l'app.

### Project Structure Notes

- Nouveaux fichiers : `apps/api/src/homme-dragon/homme-dragon.pdf.service.ts` (+ `.spec.ts`), `packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts` (+ `__tests__/homme-dragon-pdf-field-map.spec.ts`).
- Aucune migration Prisma, aucun nouveau modèle — uniquement du mapping d'affichage sur des données déjà calculées.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 198-212, Story 10.5 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-1, export PDF Homme Dragon)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (patron direct du service PDF)
- `apps/api/src/characters/characters.controller.ts` (patron de la route d'export)
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (patron direct du mapping de champs)
- `apps/api/game-systems/ryuutama/assets/README.md` (convention de documentation du template PDF — à étendre avec la fiche Homme Dragon une fois cette story implémentée)
- `_bmad-output/implementation-artifacts/10-4-choisir-un-pouvoir-deveil-au-changement-de-niveau.md` (structure de `HommeDragonDto`/`eveilPowers`, décision « pool commun » pertinente pour le mapping `eveil_1..4`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Task 0 revérifiée en dev-story : les 63 champs AcroForm sont identiques à ceux extraits pendant la création de la story, aucun écart.
- `mapHommeDragonToPdfFields()` implémentée sans dépendre de `@master-jdr/shared` — `game-rules` ne l'importe jamais (même convention que `HommeDragonRace`/`HommeDragonSheetData` dans `validate-homme-dragon.ts`) ; type local `HommeDragonPdfInput` créé à la place (écart découvert par `pnpm typecheck`, corrigé avant de continuer).
- `eveil_1..4` mappés par niveau (2/3/4/5), pas par position dans `eveilPowers[]`, conformément à la décision actée à la création de la story.
- `souffle_actuel`/`nombre_souffles` pré-remplis égaux à `souffle_max` (fiche exportée = état de départ plein, aucun suivi de dépense en jeu, FR7). `souffle_1..4` volontairement non mappés.
- `historique` > 12 → 12 plus récents gardés (`slice(-12)`) ; `voyageursProteges` > 2 → seuls les 2 premiers.
- **Test manuel réel effectué** (pas seulement les tests automatisés) : Partie Ryuutama + Homme Dragon créés via l'API (curl, session admin), export PDF déclenché, PDF résultant relu avec `pdf-lib` (`form.getTextField().getText()`) pour vérifier les valeurs réellement écrites dans le fichier — tous les champs simples (nom, couleur, niveau, artefact, inscription, avatar, meneur, cree_le, souffle_max/actuel/nombre_souffles, apparence_caractere, vocation, demeure, monde_protege_1) confirmés corrects, accents (é) correctement rendus. Partie/Homme Dragon de test supprimés après vérification (base de dev nettoyée).
- Piège rencontré pendant le test manuel (pas un bug produit) : ma première tentative de saisie via `curl` a corrompu l'encodage UTF-8 des caractères accentués côté shell (`é` → caractère de remplacement U+FFFD) *avant même d'atteindre l'API* — `pdf-lib` a alors correctement rejeté ce caractère non encodable en WinAnsi (`Error: WinAnsi cannot encode "�"`), confirmant que le service échoue franchement plutôt que de produire un PDF corrompu silencieusement. Corrigé en passant le JSON par fichier (`--data-binary @fichier`) plutôt qu'en argument inline — pas une action de code requise.
- Suite finale : 108/108 tests `@master-jdr/game-rules` (dont 16 nouveaux `mapHommeDragonToPdfFields`), 710/710 tests API, `pnpm typecheck` propre, 755/755 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié (route `GET /parties/:id/homme-dragon/export.pdf` mappée).

### File List

**Nouveaux fichiers**
- `packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts`
- `packages/game-rules/src/__tests__/homme-dragon-pdf-field-map.spec.ts`
- `apps/api/src/homme-dragon/homme-dragon.pdf.service.ts`
- `apps/api/src/homme-dragon/homme-dragon.pdf.service.spec.ts`

**Fichiers modifiés**
- `packages/game-rules/src/index.ts` (exports `mapHommeDragonToPdfFields`/`HommeDragonPdfContent`/`HommeDragonPdfInput`)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (`getOwnerPseudo()`)
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` (mock `prisma.user`, tests `getOwnerPseudo()`)
- `apps/api/src/homme-dragon/homme-dragon.controller.ts` (route `GET export.pdf`, injection `HommeDragonPdfService`)
- `apps/api/src/homme-dragon/homme-dragon.controller.spec.ts` (mock `HommeDragonPdfService`, tests `exportPdf()`)
- `apps/api/src/homme-dragon/homme-dragon.module.ts` (provider `HommeDragonPdfService`)
- `apps/web/src/app/core/homme-dragon/homme-dragon.service.ts` (`exportPdf()`)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.ts` (`onExportPdf()`, signaux `exporting`/`exportError`)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.html` (bouton « Exporter en PDF »)
- `apps/web/src/app/features/homme-dragon/homme-dragon-sheet/homme-dragon-sheet.spec.ts` (mock `exportPdf`, 2 nouveaux tests)

## Change Log

- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales). 2 violations d'AC confirmées et corrigées : `eveil_N` retombait sur la clé technique brute si le catalogue n'avait plus de libellé (corrigé → chaîne vide) ; `cree_le`/`date_sc_N` étaient en format ISO au lieu du format fr-FR explicitement demandé (corrigé, nouvelle fonction `formatDateFr()`). 1 patch supplémentaire : message d'erreur `setText()` élargi pour couvrir aussi les valeurs non encodables en WinAnsi (cause réelle rencontrée en test manuel), pas seulement les champs introuvables. 6 items différés (voir `deferred-work.md`), ~17 écartés. 3 nouveaux tests ajoutés. Suite finale : 111/111 tests game-rules, 710/710 tests API, `pnpm typecheck` propre, 755/755 tests web, aucune régression. Redémarrage réel du conteneur `api` reconfirmé. Statut passé à `done`.
- 2026-07-17 : Implémentée via `bmad-dev-story`. 6 tasks complétées en TDD, dont un test manuel réel (Partie/Homme Dragon créés via API, export déclenché, PDF résultant relu avec pdf-lib pour vérifier les valeurs écrites — pas seulement les tests automatisés). Écart découvert et corrigé pendant l'implémentation : `mapHommeDragonToPdfFields()` ne doit jamais importer `@master-jdr/shared` (convention `game-rules`, détectée par `pnpm typecheck`) — type local `HommeDragonPdfInput` créé à la place. Suite finale : 108/108 tests game-rules, 710/710 tests API, `pnpm typecheck` propre, 755/755 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié. Statut passé à `review`.

- 2026-07-17 : Story créée via `bmad-create-story`. Travail de vérification notable effectué pendant la création (pas seulement de la lecture) : les 63 champs AcroForm du template `Ryuutama_fiche_homme-dragon_big_edit.pdf` ont été extraits et leurs coordonnées mesurées via un script `pdf-lib` ponctuel (même démarche que la vérification de la zone portrait en Story 4.6) — évite au développeur de deviner les noms de champs ou leur disposition. Point notable découvert : la numérotation `eveil_1..4` ne suit pas l'ordre de lecture visuel (1/3 en haut, 2/4 en dessous) — mapping retenu par niveau (`eveil_N` = niveau `N+1`) plutôt que par position dans le tableau, pour rester correct malgré cette disposition et un éventuel remplissage hors-ordre (déjà permis par l'API depuis la revue de code de la Story 10.4). Autre point : le template n'a que 2 emplacements « voyageurs protégés » et 12 lignes d'historique — troncatures documentées explicitement plutôt que découvertes en cours de dev.
