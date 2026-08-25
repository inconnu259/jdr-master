---
baseline_commit: a24cc31
---

# Story 11.2: Exporter ses notes en PDF

Status: done

## Story

As a joueur,
I want exporter un PDF pré-rempli de mes notes de personnage,
So that je puisse les imprimer sans ressaisir mon journal.

## Acceptance Criteria

1. **Given** mon personnage a des notes déjà renseignées **When** je déclenche l'export PDF notes **Then** j'obtiens un fichier PDF listant ces notes, sans ressaisie de ma part
2. **Given** je modifie mes notes après un premier export **When** j'exporte à nouveau **Then** le nouveau PDF reflète les notes à jour
3. **Given** je suis le MJ **When** j'exporte les notes d'un personnage joueur de ma Partie **Then** l'export fonctionne pour ce personnage et reflète **exactement ce que le MJ voit déjà à l'écran** (toutes les notes, y compris privées) — **décision utilisateur (2026-07-17)** : rien n'est privé pour le MJ, il doit tout savoir pour gérer la partie ; le PDF n'est pas différencié selon qui l'a généré (le MJ imprime souvent les fiches pour ses joueurs) — cf. décision de confidentialité corrigée ci-dessous

*(Source : epics.md Story 11.2, 2 ACs complétées d'AC3 — `epics.md` ne mentionne pas explicitement l'export MJ pour cette story (contrairement à la Story 11.1/AC3, équipement), mais la route reste ouverte à tout membre viewable par cohérence avec `findOne()`/`export.pdf`/`export-equipment.pdf` existants ; la vraie protection est le filtrage de contenu, pas un refus d'accès à la route — cf. décision d'architecture ci-dessous.)*

## ⚠️ Décision de confidentialité (lire avant d'implémenter — CORRIGÉE en dev-story, 2026-07-17)

**Écart découvert en dev-story par rapport à l'analyse initiale de cette story** (qui affirmait à tort que `getNotes()` filtrait déjà les notes privées pour le MJ) : `CharacterNote.shared` (Story 6.5) distingue une note **privée** (visible du seul propriétaire) d'une note **partagée** (visible de tout membre de la Partie), mais `CharacterService.getNotes(characterId, userId)` **ne filtre PAS pour le MJ** — sa règle réelle (vérifiée par lecture intégrale du code, cf. doc comment de la méthode : « Liste le journal : PROPRIÉTAIRE (tout), MJ (tout), ou tout autre participant... ») est : `sharedOnly = character.userId !== userId`, PUIS `if (sharedOnly && partie.mjId === userId) sharedOnly = false` — **le MJ repasse `sharedOnly` à `false` et reçoit donc TOUTES les notes, privées incluses**, exactement comme le propriétaire. Comportement déjà exploité tel quel par `NotesJournal` en-app (aucun filtrage côté client non plus).

**Décision utilisateur (2026-07-17) : ce comportement est correct et voulu, pour l'export PDF aussi.** Rien n'est privé pour le MJ — il doit tout savoir pour gérer sa Partie et maximiser l'amusement à table. Le PDF exporté ne doit **pas** être différencié selon qui déclenche l'export (le MJ imprime souvent les fiches pour ses joueurs, et une fiche notes incomplète serait gênante à table). **`NotesPdfService`/`exportNotesPdf()` réutilisent donc `getNotes(id, user.id)` tel quel, sans filtrage additionnel** — AC3 est satisfaite automatiquement par le comportement déjà en place, aucun code de confidentialité spécifique à écrire dans cette story.

## Tasks / Subtasks

- [x] **Task 0 — Vérifier les champs AcroForm du template (ne pas deviner)**
  - [x] Le template `apps/api/game-systems/ryuutama/assets/Ryuutama_fiche_de_notes_edit.pdf` existe déjà sur le disque (gitignored, contenu sous droits d'auteur). **Les 42 champs AcroForm ont déjà été extraits et vérifiés** pendant la création de cette story (script `pdf-lib` ponctuel dans le conteneur `api`, `form.getFields()` + `widget.getRectangle()`) — reproduits ci-dessous pour éviter de refaire ce travail, mais **revérifier par une exécution réelle avant de coder** (le fichier a pu changer). Tous les champs sont des `PDFTextField`.
  - [x] Structure du template (1 page, **aucun champ d'en-tête** — ni `joueur` ni `voyageur`, contrairement aux 3 autres templates PDF déjà exploités dans ce projet) : 21 lignes numérotées 0 à 20, chacune avec 2 champs :
    ```
    Note.{N}.0  — colonne étroite (x:54.2, largeur 111.4) — date de l'entrée
    Note.{N}.1  — colonne large   (x:166.7, largeur 373.4) — texte de l'entrée
    (N de 0 à 20, y décroissant de 667.6 à 46.6 — ordre de lecture haut→bas déjà garanti par N croissant)
    ```
  - [x] **Revérifié par exécution réelle le 2026-07-17 (dev-story)** : les 42 champs extraits sont identiques à la liste ci-dessus, 0 écart (0 manquant, 0 en trop).

- [x] **Task 1 — `packages/game-rules/ryuutama` : `mapNotesToPdfFields()`** (AC1, AC2)
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/notes-pdf-field-map.ts` — même convention que `equipment-pdf-field-map.ts`/`homme-dragon-pdf-field-map.ts` (fonction pure, ne charge rien, ne lève jamais, **n'importe jamais `@master-jdr/shared`** — type d'entrée local).
  - [x] Réutiliser `formatDateFr()` — soit en l'important si `homme-dragon-pdf-field-map.ts` l'exporte déjà (vérifier), soit en la dupliquant à l'identique (même commentaire JSDoc, même comportement chaîne vide sur date invalide) si elle est actuellement privée à ce fichier — **ne pas réinventer un format de date différent**, la fiche notes est un document officiel francophone comme les 3 autres (JJ/MM/AAAA, jamais l'ordre ISO — cf. bug déjà corrigé en revue Story 10.5 sur `date_sc_N`).
  - [x] Signature :
    ```typescript
    export interface NotesPdfInput {
      notes: { text: string; createdAt: string }[];  // déjà triées par l'appelant (desc, cf. Task 2)
    }

    export function mapNotesToPdfFields(input: NotesPdfInput): PdfFieldValue[] {
      // ...
    }
    ```
  - [x] Mapping : pour `i` de 0 à 20, `Note.{i}.0` ← `formatDateFr(input.notes[i].createdAt)` si une note existe à cet index, sinon omise (même convention "champ absent si vide" que les autres field-map — vérifier la convention exacte déjà établie dans `equipment-pdf-field-map.ts` pour `!f.value` avant de trancher) ; `Note.{i}.1` ← `input.notes[i].text`. **Si plus de 21 notes**, les entrées au-delà de la 21e sont **omises silencieusement**, aucune erreur (même principe que la troncature à 21 emplacements équipement déjà accepté en revue Story 11.1 — pas un vide/erreur inattendue).
  - [x] Exporter `mapNotesToPdfFields`/`NotesPdfInput` depuis `packages/game-rules/src/index.ts`.
  - [x] Tests TDD (`packages/game-rules/src/__tests__/notes-pdf-field-map.spec.ts`) : notes correctement mappées dans l'ordre reçu (date + texte) ; date formatée en fr-FR (pas ISO) ; plus de 21 notes → excédentaires omises sans erreur ; 0 note → aucun champ `Note.*` renseigné (liste vide) ; date invalide → chaîne vide sur le champ date correspondant (défense de profondeur, cohérent avec `formatDateFr`).

- [x] **Task 2 — Backend : `NotesPdfService`** (AC1, AC2, AC3)
  - [x] Nouveau fichier `apps/api/src/characters/notes-pdf.service.ts` — structure la plus simple des 4 services PDF du projet (pas de portrait, pas de contenu seedé, pas de champ d'en-tête à remplir).
  - [x] Constante `PDF_TEMPLATE_PATH` : `join(process.cwd(), 'game-systems/ryuutama/assets/Ryuutama_fiche_de_notes_edit.pdf')`.
  - [x] Méthode `fillNotesPdf(notes: CharacterNoteDto[]): Promise<Buffer>` — **reçoit déjà la liste de notes filtrée par confidentialité** (résolue par l'appelant via `CharacterService.getNotes()`, cf. décision de confidentialité ci-dessus — ce service ne fait **aucune** vérification d'accès lui-même, il ne fait que mettre en page ce qu'on lui donne) :
    - Trie/passe les notes telles que reçues à `mapNotesToPdfFields({ notes: notes.map(n => ({ text: n.text, createdAt: n.createdAt })) })` — **ne pas re-trier ici** si `getNotes()` retourne déjà l'ordre voulu (vérifier l'`orderBy` de `getNotes()`, déjà `createdAt: 'desc'` au moment de la création de cette story — le plus récent en premier, cohérent avec `NotesJournal` (Story 6.5) qui affiche aussi le plus récent en tête).
    - Remplit chaque champ texte (`form.getTextField(f.field).setText(f.value)` dans un `try/catch` par champ, même message d'erreur pointant vers le README que les 3 autres services PDF, incluant le cas WinAnsi non encodable). **Aucun `form.flatten()`**.
  - [x] Tests TDD (`notes-pdf.service.spec.ts`, mêmes mocks `jest.mock('node:fs/promises', ...)` + `jest.mock('@master-jdr/game-rules', ...)` que les 3 autres services PDF) : template introuvable → erreur explicite ; champs correctement remplis (mock `mapNotesToPdfFields`) ; liste de notes vide → PDF généré sans erreur (aucun champ rempli) ; échec de `setText` sur un champ → erreur explicite pointant vers le README.

- [x] **Task 3 — Route d'export** (AC1, AC2, AC3)
  - [x] Ajouter dans `CharactersController` (`apps/api/src/characters/characters.controller.ts`), juste après `exportEquipmentPdf` existant :
    ```typescript
    @Get(':id/export-notes.pdf')
    async exportNotesPdf(
      @Param('id', ParseUUIDPipe) id: string,
      @CurrentUser() user: AuthUser,
    ): Promise<StreamableFile> {
      const character = await this.characters.findOne(id, user.id);
      if (character.gameSystemId !== RYUUTAMA_ID) {
        throw new BadRequestException(
          `Export PDF non supporté pour le système de jeu "${character.gameSystemId}"`,
        );
      }
      const notes = await this.characters.getNotes(id, user.id);
      const pdfBytes = await this.notesPdf.fillNotesPdf(notes);
      return new StreamableFile(pdfBytes, {
        type: 'application/pdf',
        disposition: `attachment; filename="notes-${id}.pdf"`,
      });
    }
    ```
    **`this.characters.getNotes(id, user.id)` est l'unique source des notes exportées (AC3)** — aucun filtrage additionnel : le MJ reçoit tout (comportement déjà établi de `getNotes()`, décision utilisateur confirmée pour l'export aussi, cf. section dédiée ci-dessus), le joueur non-MJ ne voit que les notes partagées (comportement déjà établi également). **Ne jamais** appeler `notesPdf.fillNotesPdf()` avec une liste construite autrement que via cet appel.
  - [x] Injecter `NotesPdfService` dans `CharactersController` (nouveau provider dans `CharacterModule`, à ajouter à `providers` et au constructeur du controller, à côté de `EquipmentPdfService`).
  - [x] Tests controller : la route délègue à `characters.getNotes()` **puis** `notesPdf.fillNotesPdf()` avec le résultat de `getNotes()` exactement, sans filtrage/transformation intermédiaire (pas un accès direct à Prisma) ; `BadRequestException` si `gameSystemId !== RYUUTAMA_ID` ; **test explicite AC3** — MJ exportant les notes d'un joueur reçoit `fillNotesPdf()` appelé avec la liste complète (privées incluses) telle que retournée par `getNotes()` mocké, jamais un sous-ensemble reconstruit par le controller.

- [x] **Task 4 — Frontend : bouton d'export** (AC1, AC2, AC3)
  - [x] `apps/web/src/app/core/characters/character.service.ts`, ajouter (même pattern `responseType: 'blob'` que `exportEquipmentPdf()`) :
    ```typescript
    exportNotesPdf(id: string): Promise<Blob> {
      return firstValueFrom(
        this.http.get(`${API_BASE}/characters/${id}/export-notes.pdf`, {
          responseType: 'blob',
          withCredentials: true,
        }),
      );
    }
    ```
  - [x] `character-sheet.ts` : ajouter `protected readonly exportingNotes = signal(false);`, `protected readonly exportNotesError = signal<string | null>(null);`, `protected async exportNotesPdf(): Promise<void>` — même pattern exact que `exportEquipmentPdf()` (lien `<a>` + `URL.createObjectURL`). Nom de fichier suggéré : `notes-{safeName}.pdf`.
  - [x] `character-sheet.html` : 4e bouton dans `.sheet__export-buttons`, `[disabled]="exporting() !== null || exportingEquipment() || exportingNotes()"` (**étendre la garde anti-double-clic déjà posée sur les 3 boutons existants en revue de code Story 11.1** — inclure `exportingNotes()` sur les 4 boutons désormais, pas seulement le nouveau), texte via `theme.tone()['character.export_notes_cta']`.
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter la clé `character.export_notes_cta` dans les **3 thèmes** existants (même structure que `character.export_equipment_cta`, Story 11.1).
  - [x] Tests : clic déclenche `characterSvc.exportNotesPdf()` avec le bon `id` ; échec → `exportNotesError()` renseigné ; **les 4 boutons sont bien tous désactivés pendant n'importe quel export en cours** (non-régression de la garde étendue).

- [x] **Task 5 — Validation finale**
  - [x] `docker compose exec api pnpm --filter @master-jdr/game-rules test` — 0 régression + nouveaux tests `mapNotesToPdfFields`.
  - [x] `docker compose exec api pnpm exec jest` — 0 régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - [x] Redémarrage réel du conteneur `api` — `Nest application successfully started`, route `GET /characters/:id/export-notes.pdf` mappée.
  - [x] **Test manuel réel recommandé** (même limitation que Stories 10.5/11.1 : aucun outil de rendu PDF visuel disponible) : déclencher un export réel, relire le PDF produit avec `pdf-lib` pour vérifier les valeurs écrites — en particulier **vérifier concrètement le scénario AC3** (créer une note privée + une note partagée sur un personnage joueur, exporter en tant que MJ, confirmer que les DEUX notes apparaissent dans le PDF résultant — décision utilisateur : rien n'est privé pour le MJ). Documenter le résultat dans les Completion Notes.

### Review Findings

Revue de code adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-07-18. 0 violation d'AC confirmée (Acceptance Auditor : AC3 corrigée respectée, mapping des 42 champs conforme, AD-6 conforme). 1 patch appliqué, 9 items différés, 15 écartés (dont l'essentiel du Blind Hunter, qui n'avait pas accès au projet et a mal jugé plusieurs comportements pré-existants comme nouveaux).

- [x] [Review][Patch][Fixed] `README.md` des assets Ryuutama non étendu avec une section pour `Ryuutama_fiche_de_notes_edit.pdf` — la story elle-même l'exigeait (Dev Notes/References : « à étendre avec la fiche notes une fois cette story implémentée »), et Story 11.1 avait posé le précédent (section dédiée par template). Le message d'erreur de `notes-pdf.service.ts` pointe vers ce README qui ne contenait aucune section pertinente [apps/api/game-systems/ryuutama/assets/README.md]
- [x] [Review][Defer] Aucun `try/catch` autour de `PDFDocument.load()`/`doc.save()` pour un template corrompu [apps/api/src/characters/notes-pdf.service.ts] — même convention (absence de garde) déjà déférée pour `ryuutama-pdf.service.ts`/`equipment-pdf.service.ts`/`homme-dragon.pdf.service.ts`, pas une régression isolée de cette story
- [x] [Review][Defer] Un texte de note contenant un caractère non encodable en WinAnsi (emoji, CJK) fait lever une `Error` brute (pas une `BadRequestException`) — remonte donc en 500 générique plutôt qu'en 400 explicite, alors que la cause réelle est une donnée utilisateur libre, pas un bug serveur [apps/api/src/characters/notes-pdf.service.ts] — même pattern déjà présent dans `equipment-pdf.service.ts`/`homme-dragon.pdf.service.ts` (blind+edge, non introduit par cette story, correction porterait sur les 3 services à la fois)
- [x] [Review][Defer] `MAX_NOTE_ROWS = 21` codé en dur sans assertion runtime le liant au nombre réel de champs du template — une dérive du template ne serait détectée qu'au premier `getTextField` en échec, message générique [packages/game-rules/src/ryuutama/notes-pdf-field-map.ts] — même convention que `OBJECT_SLOTS` (équipement, Story 11.1)
- [x] [Review][Defer] Aucune limite de longueur sur `note.text` avant écriture dans un champ PDF de taille fixe — un texte très long pourrait déborder visuellement du champ [packages/game-rules/src/ryuutama/notes-pdf-field-map.ts] — aucun field-map existant du projet ne cape la longueur non plus, cohérent avec la convention actuelle
- [x] [Review][Defer] Le `catch` frontend de `exportNotesPdf()` ne parse jamais le corps JSON de l'erreur (`responseType: 'blob'`) pour une réponse 4xx (ex. système de jeu non-Ryuutama) — message générique systématique, cause précise perdue [apps/web/.../character-sheet.ts] — même pattern déjà établi pour `exportPdf`/`exportEquipmentPdf`, pas une régression isolée
- [x] [Review][Defer] Cache `templatePromise` : en cas d'échecs concurrents avant résolution du premier rejet, seul le 3e appel obtient une vraie nouvelle tentative — comportement fragile mais non testé pour ce cas d'interleaving [apps/api/src/characters/notes-pdf.service.ts] — même convention que les 3 autres services PDF
- [x] [Review][Defer] `PDF_TEMPLATE_PATH` construit via `join(process.cwd(), ...)` — fragile si le process n'est pas lancé depuis la racine du repo [apps/api/src/characters/notes-pdf.service.ts] — déjà déféré depuis Story 10.5 (`ryuutama-pdf.service.ts`), pas introduit par cette story
- [x] [Review][Defer] Regex de normalisation du nom de fichier téléchargé (`replace(/[^a-z0-9-_]+/gi, '_')`) laisse passer des cas limites (nom tout symboles → `_.pdf`) [apps/web/.../character-sheet.ts] — regex réutilisée telle quelle depuis Story 11.1, déjà déférée là-bas
- [x] [Review][Defer] `formatDateFr()` dupliquée à l'identique entre `homme-dragon-pdf-field-map.ts` et `notes-pdf-field-map.ts` (2e duplication) — DRY mineur, extraction vers un utilitaire partagé à reconsidérer si un 3e consommateur apparaît [packages/game-rules/src/ryuutama/notes-pdf-field-map.ts]
- [x] [Review][Dismiss] « Aucune garde d'autorisation visible dans le diff » — infirmé : `findOne()`/`getNotes()` sont des méthodes pré-existantes, déjà testées ailleurs dans le projet ; le Blind Hunter n'avait par construction aucun accès au projet pour les vérifier
- [x] [Review][Dismiss] `fillNotesPdf()` « fait confiance aveuglément » à la liste de notes sans revérifier `characterId` — même confiance déjà accordée par `EquipmentPdfService` au `CharacterDto` qu'on lui passe, frontière de confiance déjà établie et acceptée dans le projet
- [x] [Review][Dismiss] Absence de test end-to-end vérifiant que `getNotes()` trie bien par date décroissante — hors scope de cette story (comportement pré-existant de `getNotes()`, déjà sous test ailleurs) ; la fonction pure `mapNotesToPdfFields` teste correctement qu'elle respecte l'ordre reçu, ce qui est sa seule responsabilité
- [x] [Review][Dismiss] Troncature silencieuse au-delà de 21 notes sans signal utilisateur — comportement explicitement acté comme hors-scope dans les Dev Notes de la story elle-même (« Pagination/plusieurs pages PDF si plus de 21 notes — troncature silencieuse à 21 »), déjà décidé, pas un gap à reconsidérer
- [x] [Review][Dismiss] Pas d'annulation/timeout de requête pendant un export en cours — même pattern déjà établi pour les 3 autres boutons d'export, pas une régression introduite ici
- [x] [Review][Dismiss] Titre de test AC3 jugé « ne teste pas vraiment le contrôle d'accès, seulement le passe-plat » — méprise sur l'AC3 corrigée : le passe-plat SANS filtrage est exactement le comportement requis (décision utilisateur), le test vérifie précisément cela
- [x] [Review][Dismiss] Message d'erreur `setText()` accusé de « confondre deux causes distinctes » — même convention déjà établie et acceptée pour `equipment-pdf.service.ts`/`homme-dragon.pdf.service.ts`, pas une régression isolée à cette story
- [x] [Review][Dismiss] Deux appels DB séparés (`findOne` puis `getNotes`) sans garde TOCTOU explicite — même pattern que `EquipmentPdfService`/`exportEquipmentPdf()` déjà en place, risque théorique déjà accepté ailleurs

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-6** (`ARCHITECTURE-SPINE.md`, palier 5) : nouvelle capacité d'export sur `CharacterModule` existant, **aucun nouveau modèle de données**. Charge le template déjà présent `Ryuutama_fiche_de_notes_edit.pdf`. Lit `CharacterNote` déjà en base (Story 6.5) — aucune nouvelle table, aucune migration.
- **Décision de confidentialité (cf. section dédiée en tête de fichier)** : `NotesPdfService` reste agnostique de la confidentialité — c'est `CharactersController.exportNotesPdf()` qui doit appeler `CharacterService.getNotes(id, user.id)` (déjà filtrant) avant de passer le résultat au service PDF. **Ne jamais** faire lire les notes directement par `NotesPdfService` via Prisma.
- **Particularité du template** : contrairement aux 3 autres fiches PDF déjà exploitées (fiche complète, équipement, Homme Dragon), celle-ci **n'a aucun champ d'en-tête** (`joueur`/`voyageur` absents) — uniquement les 42 champs `Note.{N}.{0|1}`. Ne pas chercher à écrire un nom de personnage/joueur, ces champs n'existent pas sur ce template.
- **Différence structurelle avec les 3 autres services PDF** : pas de portrait, pas de résolution de contenu seedé, pas de champ d'en-tête, **et une dépendance supplémentaire non présente ailleurs** — la confidentialité par note (`shared`), qui nécessite un appel à `CharacterService.getNotes()` en amont plutôt qu'une simple lecture de `CharacterDto` déjà résolu (contrairement à `EquipmentPdfService`, qui se contente du `CharacterDto` déjà chargé par `findOne()`).

### Champs AcroForm du template (vérifiés via pdf-lib pendant la création de cette story — cf. Task 0 pour la procédure de revérification)

42 champs au total, tous `PDFTextField`, 21 lignes × 2 colonnes (`Note.{0..20}.{0|1}`), aucun champ d'en-tête. Colonne `.0` étroite (111.4pt) = date, colonne `.1` large (373.4pt) = texte de l'entrée. Ordre de lecture haut→bas déjà garanti par l'index `N` croissant (`y` décroissant de 667.6 à 46.6 dans le PDF).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/characters/equipment-pdf.service.ts`** (Story 11.1) — patron le plus proche et le plus récent : `loadTemplate()` (cache + erreur explicite), boucle de remplissage de champs texte uniquement, message d'erreur `setText()` déjà élargi au cas WinAnsi (à reproduire tel quel).
- **`packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts`** — patron direct pour `notes-pdf-field-map.ts` : convention de type d'entrée local, structure `PdfFieldValue[]`, gestion de troncature (`slice`)/champs manquants.
- **`packages/game-rules/src/ryuutama/homme-dragon-pdf-field-map.ts`** (fonction `formatDateFr`, lignes 29-36) — à réutiliser ou dupliquer à l'identique pour le formatage de date fr-FR (cf. Task 1).
- **`apps/api/src/characters/character.service.ts`** (méthode `getNotes`, ligne ~1026) — **lire intégralement avant d'écrire le controller** : confirme le comportement exact de `sharedOnly`/l'`orderBy` actuel (`createdAt: 'desc'` au moment de la création de cette story — à revérifier, pas à supposer figé).
- **`apps/api/src/characters/characters.controller.ts`** (méthodes `exportPdf`/`exportEquipmentPdf`) — patron direct pour la nouvelle route, y compris la garde `gameSystemId !== RYUUTAMA_ID`.
- **`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`** (méthode `exportEquipmentPdf`) et **`character-sheet.html`** (`.sheet__export-buttons`) — patron direct pour le 4e bouton, **y compris le patch de revue Story 11.1** qui a étendu la garde `[disabled]` des boutons existants pour inclure les exports concurrents — reproduire ce même réflexe ici (les 4 boutons doivent se désactiver mutuellement).
- **`apps/web/src/app/core/theme/tones.ts`** (clés `character.export_equipment_cta`, Story 11.1) — patron pour la nouvelle clé de thème.
- **`apps/api/src/characters/character.module.ts`** — ajout du nouveau provider `NotesPdfService`, même schéma que l'ajout d'`EquipmentPdfService` en Story 11.1.

### Hors scope explicite de cette story

- Tri/filtre des notes exportées au-delà de la confidentialité déjà en place (`shared`) — pas de sélection manuelle "quelles notes exporter" demandée par les AC, toutes les notes visibles par l'appelant sont incluses (jusqu'à 21).
- Pagination/plusieurs pages PDF si plus de 21 notes — troncature silencieuse à 21, cohérent avec la limite physique du template et le précédent équipement (Story 11.1).
- Toute modification du modèle `CharacterNote`/de son mécanisme de partage (Story 6.5/8.6) — réutilisé tel quel.

### Project Structure Notes

- Nouveaux fichiers : `apps/api/src/characters/notes-pdf.service.ts` (+ `.spec.ts`), `packages/game-rules/src/ryuutama/notes-pdf-field-map.ts` (+ `__tests__/notes-pdf-field-map.spec.ts`).
- Fichiers modifiés : `packages/game-rules/src/index.ts` (exports), `apps/api/src/characters/characters.controller.ts` (+route), `apps/api/src/characters/characters.controller.spec.ts`, `apps/api/src/characters/character.module.ts` (+provider), `apps/web/src/app/core/characters/character.service.ts` (+méthode), `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`/`.html`/`.spec.ts`, `apps/web/src/app/core/theme/tones.ts`.
- Aucune migration Prisma, aucun nouveau modèle — uniquement du mapping d'affichage sur `CharacterNote` déjà stocké, déjà filtré par `CharacterService.getNotes()` existant.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 238-252, Epic 11 / Story 11.2 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-6, export PDF équipement/notes)
- `apps/api/src/characters/equipment-pdf.service.ts` + `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` (patron direct le plus proche, Story 11.1)
- `apps/api/src/characters/character.service.ts` (`getNotes()` — filtrage de confidentialité déjà en place, **critique pour AC3**)
- `apps/api/game-systems/ryuutama/assets/README.md` (convention de documentation des templates PDF — à étendre avec la fiche notes une fois cette story implémentée)
- `11-1-exporter-son-equipement-en-pdf.md` — intelligence de la story précédente : convention de mock Jest (`jest.mock('@master-jdr/game-rules', ...)` obligatoire), procédure de test manuel réel (script direct hors NestJS pour contourner les décorateurs non transpilables par le loader ESM natif), garde `[disabled]` à étendre à chaque nouveau bouton d'export, `pnpm typecheck` à lancer après tout changement de signature.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Task 0 revérifiée en dev-story : les 42 champs AcroForm sont identiques à ceux extraits pendant la création de la story, aucun écart.
- **Écart critique découvert et corrigé pendant l'implémentation, AVANT d'écrire le controller** (lecture intégrale obligatoire de `character.service.ts::getNotes()` avant de coder, cf. Dev Notes) : l'analyse de création de la story affirmait à tort que `getNotes()` filtrait déjà les notes privées pour le MJ. En réalité `getNotes()` donne au MJ un accès complet (privées incluses), comportement déjà établi et exploité tel quel par `NotesJournal` en-app. Question posée à l'utilisateur avant de continuer (2 options : durcir l'export pour le MJ, ou aligner l'AC3 sur le comportement réel) — **décision utilisateur : aligner l'AC3 sur le comportement réel** (« rien n'est privé pour le MJ, il doit tout savoir pour gérer la partie ; le PDF n'est pas différencié selon qui l'a généré »). AC3, le titre du bloc de décision de confidentialité et les tests associés ont été corrigés en conséquence dans la story. **Aucun filtrage n'a été ajouté au controller** — `exportNotesPdf()` réutilise `getNotes(id, user.id)` tel quel, sans transformation.
- `mapNotesToPdfFields()` implémentée sans jamais importer `@master-jdr/shared` (convention `game-rules` établie Stories 10.5/11.1) — type local `NotesPdfInput` créé à la place. `formatDateFr()` dupliquée à l'identique depuis `homme-dragon-pdf-field-map.ts` (fonction privée non exportée là-bas).
- Garde `[disabled]` étendue aux 4 boutons d'export (`exporting()`/`exportingEquipment()`/`exportingNotes()` combinés sur chacun) — non-régression testée explicitement (les 3 boutons pré-existants se désactivent bien pendant un export notes en cours).
- **Test manuel réel effectué** (pas seulement les tests automatisés, même limitation que Stories 10.5/11.1 : aucun outil de rendu PDF visuel disponible) : script Node ESM exécutant directement `mapNotesToPdfFields()` (réel) + `pdf-lib` (réel) contre le vrai template `Ryuutama_fiche_de_notes_edit.pdf` sur disque (même contournement que Story 11.1 pour les décorateurs `@Injectable()` non transpilables par le loader ESM natif de Node 24). Scénario AC3 vérifié concrètement : une note privée + une note partagée créées, PDF généré (188 118 octets) et relu avec `pdf-lib` — **les deux notes apparaissent** dans le PDF (conforme à la décision utilisateur : rien n'est privé pour le MJ), dates formatées en fr-FR, accents (é, à) correctement rendus. Fichier temporaire supprimé après vérification (aucun résidu dans `git status`).
- Suite finale : 124/124 tests `@master-jdr/game-rules` (dont 5 nouveaux `mapNotesToPdfFields`), 729/729 tests API, `pnpm typecheck` propre, 760/760 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié (route `GET /characters/:id/export-notes.pdf` mappée dans les logs `RouterExplorer`).

### File List

**Nouveaux fichiers**
- `packages/game-rules/src/ryuutama/notes-pdf-field-map.ts`
- `packages/game-rules/src/__tests__/notes-pdf-field-map.spec.ts`
- `apps/api/src/characters/notes-pdf.service.ts`
- `apps/api/src/characters/notes-pdf.service.spec.ts`

**Fichiers modifiés**
- `packages/game-rules/src/index.ts`
- `apps/api/src/characters/characters.controller.ts`
- `apps/api/src/characters/characters.controller.spec.ts`
- `apps/api/src/characters/character.module.ts`
- `apps/web/src/app/core/characters/character.service.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`

## Change Log

- 2026-07-18 : Revue de code (`bmad-code-review`, 3 couches adversariales). 0 violation d'AC (Acceptance Auditor : AC3 corrigée respectée, mapping conforme, AD-6 conforme). 1 patch appliqué (README des assets Ryuutama étendu avec la section `Ryuutama_fiche_de_notes_edit.pdf`, comme l'exigeait la story). 9 items différés (voir `deferred-work.md`), 15 écartés (essentiellement des faux positifs du Blind Hunter, qui n'avait pas accès au projet). Statut passé à `done`.
- 2026-07-18 : Implémentée via `bmad-dev-story`. 6 tasks complétées en TDD, dont un test manuel réel (script exécutant la vraie fonction de mapping + pdf-lib contre le vrai template sur disque, PDF résultant relu pour vérifier les valeurs écrites). **Écart critique corrigé avant d'écrire le controller** : l'AC3 et la décision de confidentialité initiales de la story reposaient sur une lecture erronée de `getNotes()` (supposé filtrer les notes privées pour le MJ, alors qu'il donne un accès complet) — décision utilisateur : aligner l'AC3 sur le comportement réel plutôt que d'ajouter un filtrage spécifique à l'export (rien n'est privé pour le MJ). AC3/section de confidentialité/tests corrigés en conséquence. Suite finale : 124/124 tests game-rules, 729/729 tests API, `pnpm typecheck` propre, 760/760 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié. Statut passé à `review`.
- 2026-07-17 : Story créée via `bmad-create-story` (lecture directe de `equipment-pdf.service.ts`, `homme-dragon-pdf-field-map.ts`, `character.service.ts::getNotes`, `characters.controller.ts`, `character-sheet.ts`/`.html`, `tones.ts`, `character.module.ts`, extraction réelle des 42 champs AcroForm du template `Ryuutama_fiche_de_notes_edit.pdf` via un script `pdf-lib` exécuté dans le conteneur `api`). Point notable découvert : le template n'a **aucun champ d'en-tête** (ni `joueur` ni `voyageur`), seulement 21 lignes de 2 champs (date + texte) — structure plus simple que les 3 autres fiches PDF déjà exploitées. **Décision de confidentialité documentée explicitement** : le service PDF doit recevoir des notes déjà filtrées via `CharacterService.getNotes(id, requestingUserId)` (qui applique déjà `sharedOnly` selon que l'appelant est propriétaire ou non), jamais une lecture directe non filtrée — risque de fuite structurellement identique à celui corrigé en revue de code de la Story 8.6.
