---
baseline_commit: a24cc31
---

# Story 11.1: Exporter son équipement en PDF

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want exporter un PDF pré-rempli de l'équipement de mon personnage,
So that je puisse l'imprimer sans ressaisir mon inventaire.

## Acceptance Criteria

1. **Given** mon personnage a un équipement déjà renseigné sur sa fiche **When** je déclenche l'export PDF équipement **Then** j'obtiens un fichier PDF listant cet équipement, sans ressaisie de ma part
2. **Given** je modifie l'équipement de mon personnage après un premier export **When** j'exporte à nouveau **Then** le nouveau PDF reflète l'équipement à jour
3. **Given** je suis le MJ **When** j'exporte l'équipement d'un personnage joueur de ma Partie **Then** l'export fonctionne pour ce personnage comme s'il était le mien

## Tasks / Subtasks

- [x] **Task 0 — Vérifier les champs AcroForm du template (ne pas deviner)**
  - [x] Le template `apps/api/game-systems/ryuutama/assets/Ryuutama-fiche_equipement_edit.pdf` existe déjà sur le disque (gitignored, contenu sous droits d'auteur — même README que la fiche PJ/Homme Dragon). **Les 94 champs AcroForm ont déjà été extraits et vérifiés** pendant la création de cette story (script `pdf-lib` ponctuel, `form.getFields()` + `widget.getRectangle()`) — reproduits ci-dessous pour éviter de refaire ce travail, mais **revérifier par une exécution réelle avant de coder** (le fichier a pu changer). Tous les champs sont des `PDFTextField` (aucun dropdown/checkbox).
  - [x] Structure du template (1 page, disposition en blocs) :
    ```
    En-tête :
      joueur (pseudo du propriétaire), voyageur (nom du personnage)
      limite_enc (limite d'encombrement), encombrement (poids total actuel), Po (monnaie — sans donnée correspondante)

    Bloc A — 5 lignes, 1 colonne, avec Effets (y: 634.7 → 541.0) :
      ObjetRow1/PrixRow1/EncRow1/EffetsRow1
      ObjetRow2/PrixRow2/EncRow2/EffetsRow2
      ObjetRow3/PrixRow3/EncRow3/EffetsRow3
      ObjetRow4/PrixRow4/EncRow4/EffetsRow4
      ObjetRow5/PrixRow5/EncRow5/EffetsRow5

    Bloc B — 8 lignes × 2 colonnes, SANS Effets (y: 493.8 → 329.0), ordre de lecture gauche→droite puis haut→bas :
      ObjetRow1_2/PrixRow1_2/EncRow1_2   ObjetRow1_3/PrixRow1_3/EncRow1_3
      ObjetRow2_2/PrixRow2_2/EncRow2_2   ObjetRow2_3/PrixRow2_3/EncRow2_3
      ObjetRow3_2/PrixRow3_2/EncRow3_2   ObjetRow3_3/PrixRow3_3/EncRow3_3
      ObjetRow4_2/PrixRow4_2/EncRow4_2   ObjetRow4_3/PrixRow4_3/EncRow4_3
      ObjetRow5_2/PrixRow5_2/EncRow5_2   ObjetRow5_3/PrixRow5_3/EncRow5_3
      ObjetRow6/PrixRow6/EncRow6         ObjetRow6_2/PrixRow6_2/EncRow6_2
      ObjetRow7/PrixRow7/EncRow7         ObjetRow7_2/PrixRow7_2/EncRow7_2
      ObjetRow8/PrixRow8/EncRow8         ObjetRow8_2/PrixRow8_2/EncRow8_2
      (nommage `_2`/`_3` non séquentiel — artefact de l'outil source du PDF, PAS une erreur de lecture. Utiliser la liste ci-dessus telle quelle, ne pas tenter de la déduire par une formule.)

    Bloc « Contenant » — 3 lignes, 1 colonne, avec Effets (y: 239.8 → 192.4) :
      ContenantRow1/PrixRow1_4/EncRow1_4/EffetsRow1_2
      ContenantRow2/PrixRow2_4/EncRow2_4/EffetsRow2_2
      ContenantRow3/PrixRow3_4/EncRow3_4/EffetsRow3_2

    Bloc « Animal » — 3 lignes, 1 colonne, SANS Enc, avec Effets (y: 103.2 → 55.8) :
      AnimalRow1/PrixRow1_5/EffetsRow1_3
      AnimalRow2/PrixRow2_5/EffetsRow2_3
      AnimalRow3/PrixRow3_5/EffetsRow3_3
    ```
  - [x] Revérifié le 2026-07-17 (dev-story) : les 94 champs extraits sont identiques à la liste ci-dessus, 0 écart (0 manquant, 0 en trop).

- [x] **Task 1 — `packages/game-rules/ryuutama` : `mapEquipmentToPdfFields()`** (AC1, AC2)
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` — même convention que `homme-dragon-pdf-field-map.ts` (fonction pure, ne charge rien en interne, ne lève jamais). **N'importe jamais `@master-jdr/shared`** (convention `game-rules` découverte en Story 10.5 : casse la suite `api` avec `SyntaxError: Unexpected token 'export'` — définir un type d'entrée local à ce fichier).
  - [x] Signature :
    ```typescript
    export interface EquipmentPdfInput {
      ownerPseudo: string;
      characterName: string;
      encombrementLimit: number;   // CharacterDto.derived.Encombrement
      equipment: {
        individual: { name: string; weight: number }[];  // sheetData.equipment.individual, projeté
        group: string[];                                  // sheetData.equipment.group
      };
    }

    export function mapEquipmentToPdfFields(input: EquipmentPdfInput): PdfFieldValue[] {
      // ...
    }
    ```
  - [x] Mapping (réutiliser le type `PdfFieldValue` déjà exporté par `pdf-field-map.ts`, tous les champs sont `kind: 'text'`) :
    - `joueur` ← `input.ownerPseudo`
    - `voyageur` ← `input.characterName`
    - `limite_enc` ← `String(input.encombrementLimit)`
    - `encombrement` ← poids total = `input.equipment.individual.reduce((sum, i) => sum + i.weight, 0)` (même calcul que `InventoryTab.totalWeight()` côté web, `apps/web/.../inventory-tab.ts` — ne compte QUE `individual`, jamais `group`, cohérent avec l'existant : `group` n'a pas de poids dans notre modèle)
    - `Po` : **volontairement non mappé** — aucune donnée de monnaie/prix dans `RyuutamaSheetData` (champ légendaire jamais implémenté à un palier antérieur)
    - **Liste combinée des objets** (Bloc A puis Bloc B, 21 emplacements au total, dans cet ordre exact) : concaténer `input.equipment.individual` (dans l'ordre du tableau, `name`+`weight` connus) PUIS `input.equipment.group` (dans l'ordre du tableau, `name` seul, `weight` inconnu → `Enc` laissé vide pour ces entrées). Assigner séquentiellement aux 21 triplets `(Objet, Prix, Enc)` de la Task 0 (Bloc A slots 1-5, puis Bloc B slots 6-21 dans l'ordre listé). `Prix` **toujours vide** (aucune donnée de prix dans le modèle). `Effets` (Bloc A uniquement) **toujours vide** (aucune donnée d'effet). Si plus de 21 objets au total (individual + group), les entrées au-delà de la 21e sont **omises sans erreur** (limite physique du template — même principe que `voyageurs_proteges_1/2`/`historique` sur la fiche Homme Dragon, Story 10.5).
    - **Blocs « Contenant » et « Animal » : volontairement non mappés.** Le template distingue des catégories d'équipement (contenant, monture/animal) que `RyuutamaSheetData.equipment` ne modélise pas (un seul tableau `individual` + un tableau `group`, aucune sous-catégorie) — ne jamais tenter de deviner une catégorie à partir du nom de l'objet. Même principe que les champs "volontairement non couverts" déjà documentés dans `pdf-field-map.ts`/`homme-dragon-pdf-field-map.ts`.
  - [x] Exporter `mapEquipmentToPdfFields`/`EquipmentPdfInput` depuis `packages/game-rules/src/index.ts`.
  - [x] Tests TDD dans un nouveau fichier `packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts` : champs d'en-tête corrects ; `individual` seul rempli dans l'ordre (Objet/Enc), `Prix`/`Effets` toujours vides ; `group` rempli après `individual` (Objet seul, `Enc` vide) ; `encombrement` = somme des poids `individual` uniquement (un item `group` ne doit jamais l'augmenter) ; plus de 21 objets combinés → les excédentaires omis, aucune erreur ; 0 objet → tous les champs Objet/Prix/Enc/Effets absents du résultat (ou valeur vide, à choisir selon la convention déjà établie pour `!f.value` côté service — vérifier `homme-dragon-pdf-field-map.ts` pour la convention exacte avant de trancher).

- [x] **Task 2 — Backend : `EquipmentPdfService`** (AC1, AC2, AC3)
  - [x] Nouveau fichier `apps/api/src/characters/equipment-pdf.service.ts` — structure simplifiée par rapport à `ryuutama-pdf.service.ts` (pas de portrait, pas de résolution de contenu seedé/catalogue — aucune dépendance à `GameSystemService` nécessaire ici, contrairement à `HommeDragonPdfService`).
  - [x] Constante `PDF_TEMPLATE_PATH` : `join(process.cwd(), 'game-systems/ryuutama/assets/Ryuutama-fiche_equipement_edit.pdf')`.
  - [x] Méthode `fillEquipmentPdf(character: CharacterDto): Promise<Buffer>` :
    - Cast `character.sheetData as unknown as RyuutamaSheetData` (même pattern que `ryuutama-pdf.service.ts`).
    - Construit l'`EquipmentPdfInput` : `ownerPseudo: character.ownerPseudo`, `characterName: sheetData.narrative?.name ?? ''`, `encombrementLimit: character.derived.Encombrement`, `equipment: { individual: (sheetData.equipment?.individual ?? []).map(i => ({ name: i.name, weight: i.weight })), group: sheetData.equipment?.group ?? [] }`.
    - Appelle `mapEquipmentToPdfFields(input)`, remplit chaque champ texte (`form.getTextField(f.field).setText(f.value)` dans un `try/catch` par champ, même message d'erreur pointant vers le README que les 2 autres services PDF — **inclure aussi le cas WinAnsi non encodable** dans le message, cf. patch appliqué en revue de code Story 10.5, ne pas répéter l'erreur initiale de cette story-là). **Aucun `form.flatten()`** — un seul format, comme l'export Homme Dragon.
  - [x] Tests TDD (`equipment-pdf.service.spec.ts`, même mock `jest.mock('node:fs/promises', ...)` + `jest.mock('@master-jdr/game-rules', ...)` que `homme-dragon.pdf.service.spec.ts`) : template introuvable → erreur explicite ; champs correctement remplis (mock `mapEquipmentToPdfFields`) ; échec de `setText` sur un champ → erreur explicite pointant vers le README.

- [x] **Task 3 — Route d'export** (AC1, AC2, AC3)
  - [x] Ajouter la route dans `CharactersController` (`apps/api/src/characters/characters.controller.ts`), juste après `exportPdf` existant :
    ```typescript
    @Get(':id/export-equipment.pdf')
    async exportEquipmentPdf(
      @Param('id', ParseUUIDPipe) id: string,
      @CurrentUser() user: AuthUser,
    ): Promise<StreamableFile> {
      const character = await this.characters.findOne(id, user.id);
      if (character.gameSystemId !== RYUUTAMA_ID) {
        throw new BadRequestException(
          `Export PDF non supporté pour le système de jeu "${character.gameSystemId}"`,
        );
      }
      const pdfBytes = await this.equipmentPdf.fillEquipmentPdf(character);
      return new StreamableFile(pdfBytes, {
        type: 'application/pdf',
        disposition: `attachment; filename="equipement-${id}.pdf"`,
      });
    }
    ```
    **Aucune nouvelle règle d'accès à écrire** : `this.characters.findOne()` autorise déjà le propriétaire OU tout membre viewable de la Partie (`getViewable`, cf. `character.service.ts` — ouvert à tout participant depuis la Story 6.5, pas seulement au MJ). AC3 (le MJ exporte l'équipement d'un joueur) est donc satisfaite sans code supplémentaire — vérifier ce comportement par un test controller dédié plutôt que de l'assumer.
  - [x] Injecter `EquipmentPdfService` dans `CharactersController` (nouveau provider dans `CharacterModule`, à ajouter à `providers` ET disponible en constructeur du controller aux côtés de `RyuutamaPdfService`).
  - [x] Tests controller : la route délègue à `equipmentPdf.fillEquipmentPdf()` avec le bon personnage ; `BadRequestException` si `gameSystemId !== RYUUTAMA_ID` (même garde que `exportPdf`) ; accès MJ sur un personnage joueur fonctionne (AC3, `findOne` mocké pour retourner un personnage dont `userId !== user.id`).

- [x] **Task 4 — Frontend : bouton d'export** (AC1, AC2, AC3)
  - [x] `apps/web/src/app/core/characters/character.service.ts`, ajouter (même pattern `responseType: 'blob'` que `exportPdf()` existant) :
    ```typescript
    exportEquipmentPdf(id: string): Promise<Blob> {
      return firstValueFrom(
        this.http.get(`${API_BASE}/characters/${id}/export-equipment.pdf`, {
          responseType: 'blob',
          withCredentials: true,
        }),
      );
    }
    ```
  - [x] `character-sheet.ts` : ajouter `protected readonly exportingEquipment = signal(false);`, `protected readonly exportEquipmentError = signal<string | null>(null);`, `protected async exportEquipmentPdf(): Promise<void>` — même pattern que `exportPdf()` existant (lignes ~296-315 : créer un lien `<a>` avec `URL.createObjectURL(blob)`, cliquer, révoquer l'URL). Nom de fichier suggéré : `equipement-{safeName}.pdf` (même normalisation `replace(/[^a-z0-9-_]+/gi, '_')` déjà utilisée pour `name()`).
  - [x] `character-sheet.html` : 3e bouton dans `.sheet__export-buttons`, aux côtés des 2 boutons d'export existants (« Exporter en PDF (éditable) »/« (2 pages) »), `[disabled]="exporting() !== null || exportingEquipment()"`, texte via `theme.tone()['character.export_equipment_cta']` (cohérent avec les 2 autres boutons de ce composant qui utilisent déjà `theme.tone()` — **ne pas suivre le pattern "texte simple sans thème" de `homme-dragon-sheet.ts`**, ce composant-ci a déjà établi la convention `theme.tone()` pour ses boutons d'export).
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter la clé `character.export_equipment_cta` dans les **3 thèmes** existants (fichier a 3 blocs de tons, cf. les clés `character.export_editable_cta` déjà présentes 3 fois — dupliquer la même structure, un libellé par thème, ex. "Exporter l'équipement en PDF" adapté au ton de chaque thème comme les libellés voisins).
  - [x] Tests : clic déclenche `characterSvc.exportEquipmentPdf()` avec le bon `id` ; échec → `exportEquipmentError()` renseigné.

- [x] **Task 5 — Validation finale**
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 0 régression + nouveaux tests `mapEquipmentToPdfFields`.
  - [x] `docker compose exec api pnpm exec jest` — 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - [x] Redémarrage réel du conteneur `api` — `Nest application successfully started`, route `GET /characters/:id/export-equipment.pdf` mappée.
  - [x] **Test manuel recommandé** (même limitation que Story 10.5 : aucun outil de rendu PDF visuel disponible pendant le développement) : déclencher un vrai export (curl ou app), relire le PDF produit avec `pdf-lib` (`form.getTextField().getText()`) pour vérifier les valeurs réellement écrites — pas seulement les tests automatisés. Documenter le résultat dans les Completion Notes.

### Review Findings

Revue de code adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-07-17. 0 violation d'AC (Acceptance Auditor : mapping des 21 emplacements, calcul `encombrement`, accès MJ AC3, conformité AD-6 tous vérifiés conformes à la story). 2 patches appliqués, 5 items différés, 6 écartés.

- [x] [Review][Patch][Fixed] Les 2 boutons d'export existants (« éditable »/« 2 pages ») ne bloquent pas pendant un export équipement en cours (`exportingEquipment()` absent de leur `[disabled]`) — un utilisateur peut déclencher un export concurrent depuis le même groupe de boutons [apps/web/src/app/features/characters/character-sheet/character-sheet.html:33-48]
- [x] [Review][Patch][Fixed] Interface `ObjectSlot` déclarée mais jamais utilisée (le tableau `OBJECT_SLOTS` est typé en tuples littéraux) — code mort à supprimer [packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts:18-22]
- [x] [Review][Defer] Aucun `try/catch` autour de `PDFDocument.load()`/`doc.save()` pour un template corrompu [apps/api/src/characters/equipment-pdf.service.ts] — même convention (absence de garde) déjà déférée pour `ryuutama-pdf.service.ts`/`homme-dragon.pdf.service.ts` (Stories 4.4/10.5), pas une régression isolée de cette story
- [x] [Review][Defer] `mapEquipmentToPdfFields` ne garde pas contre un `item.weight` non numérique (`NaN`/`undefined` sur donnée legacy malformée) qui se propagerait tel quel dans `encombrement`/`EncRowX` [packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts] — risque théorique de défense en profondeur : `CreateInventoryItemDto`/`UpdateInventoryItemDto` valident déjà `weight` avec `@IsNumber() @Min(0)` à l'écriture, et `normalizeInventoryIndividual` (`character.service.ts`) force `weight: 0` sur les entrées legacy de type `string` — non atteignable via les chemins d'écriture actuels
- [x] [Review][Defer] Le nouveau bouton d'export équipement (comme les 2 boutons existants « éditable »/« 2 pages ») n'est jamais masqué/désactivé pour un personnage d'un autre système de jeu que Ryuutama — échouerait avec un message générique plutôt qu'explicite [apps/web/.../character-sheet.html] — pattern déjà présent avant cette story pour les 2 boutons existants, pas une régression introduite ici
- [x] [Review][Defer] Aucun test n'exerce `mapEquipmentToPdfFields`/`EquipmentPdfService` contre le vrai fichier template sur disque (tous les tests automatisés mockent `pdf-lib`/`fs`) — même limitation que `ryuutama-pdf.service.spec.ts`/`homme-dragon.pdf.service.spec.ts` ; compensée cette story par un test manuel réel documenté dans les Completion Notes (script exécutant la vraie fonction + le vrai template)
- [x] [Review][Defer] Regex de normalisation du nom de fichier téléchargé (`replace(/[^a-z0-9-_]+/gi, '_')`) laisse passer des cas limites (nom tout symboles → `_.pdf`) [apps/web/.../character-sheet.ts] — regex réutilisée telle quelle depuis `exportPdf()` existant, pas introduite par cette story
- [x] [Review][Dismiss] « Faille d'autorisation » suggérée sur la route d'export — infirmée : `PartiesService.getViewable()` lève toujours `ForbiddenException`/`NotFoundException` pour un accès non autorisé, jamais un retour silencieux (vérifié dans `parties.service.ts`)
- [x] [Review][Dismiss] Message d'erreur `setText()` accusé de « confondre deux causes distinctes » — le message couvre déjà explicitement les deux causes (champ introuvable/incompatible OU valeur non encodable WinAnsi), correction déjà appliquée par rapport à la version initiale de la Story 10.5
- [x] [Review][Dismiss] Cache `templatePromise` sans invalidation / re-parsing PDF à chaque requête / génération en mémoire sans limite de taille — architecture déjà en place et acceptée pour les 2 autres services PDF, non modifiée ni aggravée par cette story
- [x] [Review][Dismiss] Troncature silencieuse des objets au-delà de 21 emplacements sans signal à l'utilisateur — comportement voulu et documenté explicitement dans les Dev Notes de la story, confirmé conforme par l'Acceptance Auditor (aucune AC ne l'exige)
- [x] [Review][Dismiss] Test frontend sélectionnant les boutons par index (`buttons[2]`) jugé fragile — pattern déjà utilisé identiquement pour `buttons[0]`/`buttons[1]` avant cette story, pas une régression
- [x] [Review][Dismiss] Absence de test explicite du garde anti double-clic sur le nouveau bouton — comportement standard d'un `[disabled]` Angular (aucun événement `click` n'est dispatché sur un élément désactivé), rien à tester au-delà de ce que le framework garantit déjà

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-6** (`ARCHITECTURE-SPINE.md`) : nouvelle capacité d'export sur `CharacterModule` existant, **aucun nouveau modèle de données**. Charge le template déjà présent `Ryuutama-fiche_equipement_edit.pdf`. Lit `Character.sheetData.equipment` déjà en base — aucune nouvelle table, aucune migration.
- Cette story ne fait AUCUN nouveau calcul métier hors du poids total (somme simple) — tout le reste (`derived.Encombrement`, `ownerPseudo`) est déjà exposé par `CharacterDto` via `CharacterService.findOne()`/`toDto()`.
- **Accès** : `findOne()` (déjà utilisé pour la route `export.pdf` existante) est ouvert à tout membre viewable de la Partie depuis la Story 6.5 (pas seulement propriétaire+MJ) — AC3 (export MJ) est donc déjà couverte par le code existant, ne pas ajouter de garde supplémentaire.
- **Différence structurelle avec les 2 autres services PDF déjà en place** : pas de portrait, pas de résolution de contenu seedé (`GameSystemService.getContent()`) — cette fiche ne référence aucune classe/type/artefact/pouvoir, uniquement des données déjà structurées sur `Character.sheetData.equipment` et `CharacterDto.derived.Encombrement`. `EquipmentPdfService` n'a donc besoin d'aucune dépendance supplémentaire dans `CharacterModule` (pas de `GameSystemModule` déjà importé, réutilisé).

### Champs AcroForm du template (vérifiés via pdf-lib pendant la création de cette story — cf. Task 0 pour la procédure de revérification)

94 champs au total, tous `PDFTextField`. Voir la Task 0 pour la disposition complète en blocs (En-tête, Bloc A 5 lignes avec Effets, Bloc B 16 emplacements sans Effets, Contenant 3 lignes, Animal 3 lignes). Points d'attention :
- Le nommage des champs du Bloc B (`_2`/`_3` non séquentiel selon la ligne) est un artefact de l'outil d'origine du PDF, pas une erreur d'extraction — utiliser la liste énumérée en Task 0 telle quelle.
- `Prix`/`Effets`/blocs Contenant+Animal n'ont **aucune donnée correspondante** dans `RyuutamaSheetData` — volontairement non mappés, ne jamais inventer une valeur.
- `Po` (monnaie) : aucun champ de prix/monnaie n'existe dans le modèle de données Ryuutama à ce jour — laissé vide.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/homme-dragon/homme-dragon.pdf.service.ts`** — patron le plus proche et le plus récent (Story 10.5) : `loadTemplate()` (cache + erreur explicite), boucle de remplissage de champs texte uniquement (pas de dropdown), message d'erreur `setText()` déjà élargi au cas WinAnsi (à reproduire tel quel, ne pas régresser). Plus proche de ce qu'il faut construire ici que `ryuutama-pdf.service.ts` (qui gère en plus portrait/dropdowns/2 formats, non applicables).
- **`packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts`** — patron direct pour `equipment-pdf-field-map.ts` : convention de type d'entrée local (ne jamais importer `@master-jdr/shared`), structure `PdfFieldValue[]`, gestion des troncatures (`slice`) et champs "volontairement non couverts".
- **`apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts`** (méthode `totalWeight` computed, ligne 34) — calcul exact du poids total à reproduire côté `mapEquipmentToPdfFields` (somme de `individual[].weight`, jamais `group`).
- **`apps/api/src/characters/characters.controller.ts`** (méthode `exportPdf`, ligne 64) — patron direct pour la nouvelle route : résolution du personnage via `findOne`, garde de système de jeu, construction du `StreamableFile`.
- **`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`** (méthode `exportPdf`, ligne 296) et **`character-sheet.html`** (lignes 31-49, `.sheet__export-buttons`) — patron direct pour le 3e bouton d'export (mêmes signaux `signal`, même téléchargement de blob).
- **`apps/web/src/app/core/theme/tones.ts`** (clés `character.export_editable_cta`/`character.export_2pages_cta`, 3 occurrences) — patron pour la nouvelle clé de thème, à dupliquer dans les 3 blocs de tons.
- **`packages/game-rules/src/ryuutama/types.ts`** (`RyuutamaSheetData`, `InventoryItem`) — forme exacte de `sheetData.equipment.individual`/`.group` à projeter dans `EquipmentPdfInput`.

### Hors scope explicite de cette story

- Story 11.2 (export PDF des notes de personnage) — story séparée, même épic.
- Blocs « Contenant »/« Animal »/`Po` du template — aucune donnée correspondante dans le modèle actuel, non mappés (cf. Task 1).
- Tout ajout de champ prix/monnaie ou de sous-catégorie d'équipement (contenant, monture) au modèle `RyuutamaSheetData` — hors scope, non demandé par l'épic.

### Project Structure Notes

- Nouveaux fichiers : `apps/api/src/characters/equipment-pdf.service.ts` (+ `.spec.ts`), `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (+ `__tests__/equipment-pdf-field-map.spec.ts`).
- Fichiers modifiés : `packages/game-rules/src/index.ts` (exports), `apps/api/src/characters/characters.controller.ts` (+route), `apps/api/src/characters/characters.controller.spec.ts`, `apps/api/src/characters/character.module.ts` (+provider), `apps/web/src/app/core/characters/character.service.ts` (+méthode), `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`/`.html`/`.spec.ts`, `apps/web/src/app/core/theme/tones.ts`.
- Aucune migration Prisma, aucun nouveau modèle — uniquement du mapping d'affichage sur des données déjà stockées (`Character.sheetData.equipment`, `CharacterDto.derived.Encombrement`, `CharacterDto.ownerPseudo`).

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 214-236, Epic 11 / Story 11.1 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-6, export PDF équipement/notes)
- `apps/api/src/homme-dragon/homme-dragon.pdf.service.ts` + `packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts` (patron direct le plus proche, Story 10.5)
- `apps/api/src/characters/characters.controller.ts` (patron de la route d'export existante)
- `apps/api/src/characters/character.service.ts` (`findOne()` — modèle d'accès déjà ouvert à tout membre, AC3)
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.ts` (calcul `totalWeight`)
- `apps/api/game-systems/ryuutama/assets/README.md` (convention de documentation des templates PDF — à étendre avec la fiche équipement une fois cette story implémentée)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Story créée via `bmad-create-story`. Les 94 champs AcroForm du template `Ryuutama-fiche_equipement_edit.pdf` ont été extraits et leurs coordonnées mesurées via un script `pdf-lib` ponctuel exécuté dans le conteneur `api` (même démarche que les Stories 4.6/10.5) — évite au développeur de deviner les noms de champs ou leur disposition. Point notable découvert : le nommage des champs du bloc à 2 colonnes (`_2`/`_3`) n'est pas séquentiel selon la ligne (artefact de l'outil source du PDF) — liste exhaustive fournie en Task 0 plutôt qu'une formule, pour éviter toute erreur de reconstruction. Autre point : le template distingue 2 catégories d'équipement (Contenant, Animal) que notre modèle de données ne modélise pas — décision actée de les laisser non mappées plutôt que de forcer une correspondance arbitraire.
- Implémentée via `bmad-dev-story` (2026-07-17). Task 0 revérifiée en dev-story : les 94 champs AcroForm sont identiques à ceux extraits pendant la création de la story, 0 écart. 8 tasks complétées en TDD, aucune déviation par rapport à la story.
- `mapEquipmentToPdfFields()` implémentée sans jamais importer `@master-jdr/shared` (convention `game-rules` déjà établie en Story 10.5) — type local `EquipmentPdfInput` créé à la place.
- Accès MJ (AC3) confirmé fonctionner sans code supplémentaire : `CharacterService.findOne()` est déjà ouvert à tout membre viewable de la Partie depuis la Story 6.5 — un test controller dédié (`exportEquipmentPdf() fonctionne pour le MJ exportant un personnage joueur`) le vérifie explicitement plutôt que de se contenter de l'assumer.
- **Test manuel réel effectué** (pas seulement les tests automatisés, même limitation que Story 10.5 : aucun outil de rendu PDF visuel disponible) : script Node ESM exécutant directement `mapEquipmentToPdfFields()` (réel) + `pdf-lib` (réel) contre le vrai template `Ryuutama-fiche_equipement_edit.pdf` sur disque, sans passer par NestJS (les décorateurs `@Injectable()` ne sont pas transpilables par le chargeur ESM natif de Node 24 utilisé pour ce test ponctuel — contournement propre : la logique testée est identique à `EquipmentPdfService.fillEquipmentPdf()`, seule l'enveloppe DI est court-circuitée). PDF réel généré (241 393 octets) puis relu avec `pdf-lib` (`form.getTextField().getText()`) : `joueur`/`voyageur`/`limite_enc`/`encombrement` (=6, somme individual uniquement) corrects, 3 items `individual` mappés dans l'ordre avec leurs poids, 2 items `group` mappés à la suite sans poids, accents (à) correctement rendus, `Po`/`ContenantRow1` bien laissés vides. Fichiers temporaires supprimés du conteneur et de l'hôte après vérification (aucun résidu dans `git status`).
- `apps/api/game-systems/ryuutama/assets/README.md` étendu avec une section dédiée au nouveau template, cohérent avec la convention déjà établie pour les 2 autres templates PDF.
- Suite finale : 119/119 tests `@master-jdr/game-rules` (dont 8 nouveaux `mapEquipmentToPdfFields`), 719/719 tests API, `pnpm typecheck` propre, 757/757 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié (route `GET /characters/:id/export-equipment.pdf` mappée dans les logs `RouterExplorer`).

### File List

**Nouveaux fichiers**
- `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts`
- `packages/game-rules/src/__tests__/equipment-pdf-field-map.spec.ts`
- `apps/api/src/characters/equipment-pdf.service.ts`
- `apps/api/src/characters/equipment-pdf.service.spec.ts`

**Fichiers modifiés**
- `packages/game-rules/src/index.ts`
- `apps/api/src/characters/characters.controller.ts`
- `apps/api/src/characters/characters.controller.spec.ts`
- `apps/api/src/characters/character.module.ts`
- `apps/api/game-systems/ryuutama/assets/README.md`
- `apps/web/src/app/core/characters/character.service.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`

## Change Log

- 2026-07-17 : Revue de code (`bmad-code-review`, 3 couches adversariales). 0 violation d'AC. 2 patches appliqués : garde `exportingEquipment()` ajoutée aux 2 boutons d'export existants (empêche un export concurrent depuis le même groupe de boutons) ; interface morte `ObjectSlot` supprimée de `equipment-pdf-field-map.ts`. 5 items différés (voir `deferred-work.md`), 6 écartés. Suite finale : 119/119 tests game-rules, `pnpm typecheck` propre, 68/68 tests `character-sheet.spec.ts`, aucune régression. Statut passé à `done`.
- 2026-07-17 : Implémentée via `bmad-dev-story`. 5 tasks complétées en TDD, dont un test manuel réel (script exécutant directement la vraie fonction de mapping + pdf-lib contre le vrai template sur disque, PDF résultant relu pour vérifier les valeurs écrites — pas seulement les tests automatisés). Aucune déviation par rapport à la story. Suite finale : 119/119 tests game-rules, 719/719 tests API, `pnpm typecheck` propre, 757/757 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié. Statut passé à `review`.
- 2026-07-17 : Story créée via `bmad-create-story`.
