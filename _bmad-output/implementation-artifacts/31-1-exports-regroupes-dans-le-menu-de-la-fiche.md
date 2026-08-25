---
baseline_commit: da4c778f568e9ffae3daf1578c39a7899dcc10f2
---

# Story 31.1: Exports regroupés dans le menu de la fiche

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que les boutons d'export cessent d'occuper le haut de ma fiche,
so that la vue principale montre mon personnage et non des actions que j'utilise rarement.

---

**Première story de l'épic 31** (Palier 9 — Fiche de personnage). Porte FR-18, seule FR de cette
story — **aucune AD dédiée** : c'est un travail de front pur, gouverné par les conventions déjà
établies (`epics.md:470`).

**Décision déjà tranchée (Q-5, PRD `prd.md:462`)** : le regroupement se fait dans le **menu de la
fiche**, pas dans un panneau séparé ni un onglet. « À rouvrir si le journal devient une destination
à part entière » — ce n'est pas le cas (mise à jour 29.5, cf. Encadré n°1).

---

## Acceptance Criteria

### Les trois AC d'`epics.md:1321-1333`, verbatim

**AC1 — rien en vue principale sur téléphone**
**Given** la fiche d'un personnage
**When** je l'ouvre sur téléphone
**Then** aucune action d'export n'occupe la vue principale

**AC2 — les cinq actions dans le menu**
**Given** le menu de la fiche
**When** je l'ouvre
**Then** j'y trouve les cinq actions : fiche éditable, fiche deux pages, équipement, notes, et
recadrage du portrait pour le PDF

**AC3 — sortie identique**
**Given** je déclenche un export depuis le menu
**When** l'action aboutit
**Then** le fichier produit est identique à celui que produisait l'ancien bouton

### AC ajoutés par cette story

**AC4 — le menu se ferme après une action**
**Given** le menu ouvert
**When** j'active une des cinq actions
**Then** le menu se referme (l'export part en tâche de fond, le recadrage ouvre son propre
dialogue) — jamais les deux surfaces empilées à l'écran

**AC5 — aucune action de plus dans le menu**
**Given** le menu de la fiche
**When** il est rendu
**Then** il ne contient QUE les cinq actions de l'AC2 — ni « Modifier le portrait »
(`editPortrait()`, avatar), ni aucune autre action future non spécifiée par cette story

**AC6 — le recadrage PDF n'apparaît que pour le propriétaire avec un portrait**
**Given** un lecteur qui n'est pas propriétaire de la fiche, OU un personnage sans portrait
**When** le menu est ouvert
**Then** l'entrée « Ajuster le cadrage PDF » n'y figure pas — même garde qu'aujourd'hui
(`isOwner() && c.portraitUrl`)

**AC7 — nom accessible et clavier**
**Given** le déclencheur du menu et le menu lui-même
**When** ils sont rendus
**Then** le déclencheur porte un nom accessible même réduit à un pictogramme (`⋮`/`more_vert`)
**And** le menu se ferme par `Échap` et rend le focus au déclencheur
**And** le focus entre dans le menu à l'ouverture (piège au clavier interdit)

**AC8 — aucun `mat-menu`**
**Given** l'implémentation de ce menu
**When** elle est écrite
**Then** elle n'utilise jamais `MatMenu` — proscrit dans ce projet, verrouillé par test
(`shell.spec.ts:111,114`)

**AC9 — portée close**
**Given** la fin de l'implémentation
**When** `git status` est lu
**Then** aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune migration — travail
100 % `apps/web/`

---

## Tasks / Subtasks

- [x] **Task 0 — Mesurer la baseline AVANT toute modification** (préalable à tout)
  - [x] Working tree propre, `HEAD = da4c778`
  - [x] `docker compose exec web pnpm test` → **reconfirmer** 114 fichiers / 2188 tests
  - [x] `docker compose exec web pnpm lint` → **reconfirmer** 142 erreurs
  - [x] 🚨 **Ne pas recopier ces chiffres : les mesurer.** Ce sont ceux mesurés à la création de
        cette story (2026-08-23) ; s'ils divergent, la mesure fraîche fait foi.

- [x] **Task 1 — Créer le composant de menu réutilisable** (AC2, AC4, AC5, AC6, AC7, AC8)
  - [x] Créer `apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/` — même
        moule que `CalendarDisplayPanel` (36.14) : composant de **rendu pur**, aucun état, aucune
        connaissance de ses deux enveloppes
  - [x] 🚨 **Réutiliser le patron `cdkConnectedOverlay` + `CdkTrapFocus` de `CalendarView`, pas le
        réinventer.** Il vient d'être établi par la story 36.14 et c'est le SEUL patron de menu
        flottant du projet hors `MatDialog` :
        - Menu ancré (ordinateur) : `calendar-view.html:112-135` — `cdkConnectedOverlay`,
          `cdkConnectedOverlayHasBackdrop`, `cdkTrapFocus cdkTrapFocusAutoCapture` sur la surface,
          positions dans une constante `ConnectedPosition[]` dédiée (`calendar-view.ts:145`)
        - Feuille (téléphone) : `calendar-view.html:136-157` — backdrop `aria-hidden`,
          `role="dialog"`, `tabindex="-1"`, `cdkTrapFocus cdkTrapFocusAutoCapture`, même
          `(keydown)` pour Échap
        - Bascule desktop/mobile : `CalendarView.DESKTOP_QUERY = '(min-width: 1024px)'`
          (`calendar-view.ts:228`) via `BreakpointObserver` — **le seuil unique du projet**, ne
          pas en inventer un second (déjà réutilisé par `partie-detail`, `list-control-bar`,
          `CalendarView`)
        - Ouverture/fermeture/clavier : `calendar-view.ts:355-374` (`toggleDisplayPanel`,
          `closeDisplayPanel` qui rend le focus au déclencheur, `onDisplayPanelKeydown` pour
          Échap avec `stopPropagation`)
  - [x] 🚨 **`cdkTrapFocusAutoCapture` gère l'ouverture ET le piège de focus en un seul geste** —
        c'est le correctif que la revue de code de la 36.14 a dû ajouter après coup (focus jamais
        déplacé à l'ouverture, Tab s'échappant vers le fond) ; le poser dès le départ ici évite de
        reproduire ces deux défauts déjà trouvés une fois
  - [x] `aria-haspopup="dialog"` sur le déclencheur (également ajouté en revue de la 36.14 —
        absent à l'origine)
  - [x] Le déclencheur est un bouton icône `more_vert` (Material), jamais du texte — c'est un menu
        contextuel, pas une action nommée en dur dans la vue principale (AC1)

- [x] **Task 2 — Contenu du menu : les cinq actions** (AC2, AC3, AC4, AC5, AC6)
  - [x] Le composant de contenu reçoit en `input()` (avec défauts, jamais `input.required` —
        piège payé quatre fois dans l'épic 36) : `showPdfCrop: boolean` (= `isOwner() &&
        !!c.portraitUrl`, calculé par `CharacterSheet` et transmis, pas recalculé dans le menu)
  - [x] Sorties (`output()`) : un événement par action, ou un seul `actionSelected` typé union —
        au choix, mais dans TOUS les cas le clic doit fermer le menu (AC4) **avant** de déclencher
        l'action (l'export part en tâche de fond, le recadrage ouvre son propre `MatDialog` — les
        deux se marcheraient dessus visuellement si le menu restait ouvert par-dessus)
  - [x] **Aucune logique métier dans le menu** : `exportPdf()`, `exportEquipmentPdf()`,
        `exportNotesPdf()`, `editPdfPortraitCrop()` restent dans `CharacterSheet` (`.ts:551-618`,
        `:656-677`), inchangés — le menu se contente d'émettre l'intention
  - [x] Retirer `.sheet__export-actions`/`.sheet__export-buttons` de `character-sheet.html:36-81`
        et les 4 boutons `mat-stroked-button` qu'ils contenaient, ainsi que le bouton
        `.sheet__pdf-crop-edit-cta` séparé (`:71-80`) — tout entre dans le nouveau menu
  - [x] 🚨 **`.sheet__portrait-edit-cta` (modifier l'AVATAR, `:30-34`) reste À SA PLACE, hors du
        menu** (AC5) — action distincte de l'export PDF, déjà traitée par la story 4.5, aucune AC
        de cette story ne la touche

- [x] **Task 3 — Corriger le trou de thème découvert en écrivant cette story** (AC7, piège n°6 de
      la 36.14 réappliqué)
  - [x] 🚨 **`character.pdf_crop_edit_cta` MANQUE dans le thème `foret-ancienne`**
        (`tones.ts:566-572` — présente dans `grimoire-emeraude:213` et `medieval-steampunk:914`,
        absente ici) : bug PRÉEXISTANT, sans rapport avec cette story, mais qui touche
        directement la clé que cette story déplace dans le menu — à corriger dans le même geste,
        pas à ignorer. Valeur cohérente avec le reste du thème : `'Ajuster le cadrage PDF'` (même
        wording neutre que `grimoire-emeraude`, puisque `portrait_edit_cta` de ce thème est lui
        aussi resté plain — « Recalibrer » est un verbe propre au thème Steampunk uniquement)
  - [x] Ajouter dans **les trois blocs** de `tones.ts` : une clé pour le libellé du déclencheur
        (`character.sheet_menu_trigger_aria`, nom accessible — le bouton n'a pas de texte
        visible, l'icône seule ne suffit jamais comme nom accessible)
  - [x] Étendre le test de complétude de `theme-tone.service.spec.ts` (nouveau describe
        `TONE_MAP — les clés du menu de la fiche (story 31.1)`, tableau `SHEET_MENU_KEYS`) : les
        six clés touchées par cette story (`portrait_edit_cta` n'est PAS de celles-ci, il reste
        hors menu), `toBeTruthy()`, pour chaque thème — même patron que `AGENDA_KEYS`/`DISPLAY_KEYS`

- [x] **Task 4 — Réécrire les tests existants, jamais les supprimer**
  - [x] `character-sheet.spec.ts` interrogeait `.sheet__export-actions button` par index `[0..3]`
        dans ~10 tests : réécrits pour ouvrir le menu D'ABORD (clic sur le déclencheur via le
        helper `openSheetMenu()`), PUIS interroger les boutons À L'INTÉRIEUR du menu
        (`sheetMenuButtons()`) — le sélecteur CSS change, le comportement testé (quel service est
        appelé, avec quels arguments) ne change pas
  - [x] Les 5 tests sur `.sheet__pdf-crop-edit-cta` suivent le même patron : ouvrir le menu avant
        de chercher le bouton (désormais le 5e, index `[4]`)
  - [x] ⚠️ **Un test a changé de vérité, pas été supprimé** : « les 4 boutons d'export sont
        désactivés pendant un export en cours » n'a plus de sens depuis l'AC4 (le menu se ferme
        AVANT que l'export ne parte, il n'y a donc plus de bouton visible à désactiver) — réécrit
        en « un clic ferme le menu immédiatement, avant même que l'export ne résolve »
  - [x] Nouveaux tests ajoutés : AC1 (aucune action visible hors menu fermé), AC4 (menu fermé
        après clic, dans le test d'export réécrit ci-dessus), AC5 (bouton avatar absent du menu),
        AC7 (nom accessible + `aria-haspopup`, Échap ferme + rend le focus), AC8 (aucun
        `mat-menu` dans le DOM)
  - [x] 🚨 **Trouvé en écrivant les tests** : `vi.stubGlobal('URL', { ...URL, ... })`
        (préexistant dans ce fichier) remplaçait la classe `URL` par un objet littéral, perdant
        son constructeur — inoffensif tant qu'aucun test n'ouvrait d'overlay CDK, mais le CDK
        Overlay du nouveau menu en a besoin en interne (`TypeError: URL is not a constructor` dès
        qu'un test appelait `openSheetMenu()`). Corrigé en patchant seulement les deux méthodes
        statiques utilisées (`createObjectURL`/`revokeObjectURL`) sur la vraie classe, restaurées
        en `afterEach`
  - [x] Zoneless : boucle de ticks établie du projet
        (`for (let i=0;i<10;i++){ await Promise.resolve(); fixture.detectChanges(); }`)

- [x] **Task 5 — Vérification visuelle réelle** (non négociable, cf. Testing)
  - [x] Via **Chrome MCP `claude-in-chrome`**, session déjà ouverte par l'utilisateur — jamais le
        navigateur interne
  - [x] Les trois thèmes — Grimoire Émeraude (fenêtre réelle), Forêt Ancienne et Médiéval
        Steampunk (classe de thème appliquée directement pour vérifier les couleurs sans écrire
        une préférence de compte réelle) : le menu adopte correctement la palette des trois
  - [x] Ouvert sur téléphone (largeur réelle 741 px, defaut de l'outillage) : feuille du bas,
        4 actions (pas de recadrage, personnage sans portrait), Échap ferme et rend le focus au
        déclencheur (anneau de focus visible à l'écran)
  - [x] Ouvert « sur ordinateur » (signal `isDesktop` muté côté client pour contourner la limite
        `resize_window`, cf. ci-dessous) : menu ancré sous le déclencheur aligné à droite, focus
        capturé DANS le premier item à l'ouverture (`cdkTrapFocusAutoCapture` confirmé à l'écran),
        Échap ferme et rend le focus au déclencheur
  - [x] Un export réel déclenché (« Exporter en PDF (éditable) ») : le menu se ferme
        IMMÉDIATEMENT au clic (AC4 confirmé à l'écran), aucune erreur console
  - [x] ⚠️ **Non vérifiable à l'œil, consigné plutôt que prétendu** : `resize_window` du
        navigateur piloté change `outerWidth` sans toucher `innerWidth` (confirmé :
        `matchMedia('(min-width:1024px)')` reste `false` à 1400px demandés) — limite déjà
        consignée par la 36.11, contournée ici en mutant directement `isDesktop` du composant
        (lecture seule, même patron que d'autres stories : « muter le signal client via
        `window.ng` »). Le 5e item (recadrage PDF) n'a pas été vu à l'écran faute d'un personnage
        du jeu de données portant un portrait — couvert par les tests unitaires dédiés
        (présence/absence, ouverture du dialogue en mode `rect`). Le nom du fichier téléchargé n'a
        pas pu être inspecté (`chrome://downloads` inaccessible aux outils de navigation pilotée)
        — la génération du nom (`fiche-{nom}-{format}.pdf`) n'a pas été touchée par cette story,
        seul son déclenchement a changé.

---

### Review Findings

- [x] [Review][Patch] La branche feuille mobile n'est exercée par AUCUN test — `createComponent()` a `desktop=true` par défaut, et même le test dédié à l'AC1 (qui nomme explicitement « sur téléphone ») ne passe jamais `desktop=false` [apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts] — **corrigé** : AC1 dupliqué en variante téléphone, + un `describe` dédié (4 tests : rendu, voile, Échap, clic sur action).
- [x] [Review][Patch] Aucune garde de réentrance sur les 4 actions d'export depuis que l'AC4 a retiré l'ancienne garde `[disabled]="exporting()..."` en fermant le menu avant l'appel [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:622-704, sheet-actions-menu/sheet-actions-menu.html] — **corrigé** : garde `exportInFlight()` reprise à l'entrée des 3 méthodes d'export (même condition combinée que l'ancien `[disabled]`).
- [x] [Review][Patch] `aria-haspopup="dialog"` sur le déclencheur sans `role="dialog"`/`aria-modal="true"` sur la surface ancrée (ordinateur) ; la feuille mobile a `role="dialog"` mais pas `aria-modal="true"` [apps/web/src/app/features/characters/character-sheet/character-sheet.html] — **corrigé** : `role="dialog"` + `aria-modal="true"` + `aria-label` posés sur la surface ancrée, `aria-modal="true"` ajouté à la feuille mobile.
- [x] [Review][Patch] La 5e action (recadrage PDF) peut disparaître du menu EN COURS D'OUVERTURE si `showPdfCropInMenu()` bascule à `false` pendant que le menu est ouvert — un clic déjà engagé ne fait plus rien silencieusement, et le focus qui y était n'est jamais redirigé [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:770-774, sheet-actions-menu/sheet-actions-menu.html:16-18] — **corrigé** : filet de sécurité `(focusout)` sur `SheetActionsMenu` qui ramène le focus sur le premier item restant si le focus quitte le menu sans destination.
- [x] [Review][Defer] Pas de `role="menu"`/`menuitem` ni de navigation aux flèches sur le contenu du menu [apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/sheet-actions-menu.html] — deferred, pre-existing (patron identique à `CalendarDisplayPanel`, story 36.14, jamais un vrai menu ARIA — cohérent avec `aria-haspopup="dialog"` déjà posé, pas une régression de cette story)
- [x] [Review][Defer] `z-index: 199`/`200` en dur sans jeton/échelle nommée [apps/web/src/app/features/characters/character-sheet/character-sheet.scss] — deferred, pre-existing (copié verbatim des mêmes valeurs déjà utilisées par `.display-backdrop`/`.display-surface--sheet` du calendrier, story 36.14)
- [x] [Review][Defer] Le déclencheur n'est pas rehaussé au-dessus de son propre voile — un second clic visant le déclencheur pour refermer le menu atterrit en réalité sur le voile, rendant la branche de fermeture du déclencheur inatteignable en pratique (résultat identique, chemin mort) [apps/web/src/app/features/characters/character-sheet/character-sheet.html] — deferred, pre-existing (même relation déclencheur/voile héritée telle quelle du calendrier, 36.14)
- [x] [Review][Defer] Noms de classes CSS globaux et génériques pour les surfaces portées (`sheet-menu-surface`, `sheet-menu-backdrop`) — risque de collision si un futur composant réutilise un nom aussi générique [apps/web/src/app/features/characters/character-sheet/character-sheet.scss] — deferred, pre-existing (même stratégie de nommage que `.display-surface`/`.display-backdrop` du calendrier, motif technique identique : le contenu est porté hors de l'encapsulation de vue)

**Rejetés comme bruit** : `character.sheet_menu_trigger_aria` identique dans les trois thèmes — vérifié conforme à la convention déjà établie (`calendar.display.trigger_aria` est également identique dans les trois thèmes, `tones.ts:344,691,1038`), pas un défaut. · Risque de fuite de tests via `document.querySelectorAll` non scopé — `OverlayContainer` d'Angular CDK implémente `ngOnDestroy`, nettoyé par `TestBed.resetTestingModule()` en `afterEach` ; aucune fragilité observée sur deux exécutions complètes de la suite. · `sheet-actions-menu.spec.ts` sans `TestBed.configureTestingModule` explicite — `ThemeToneService` est `providedIn: 'root'`, résolu sans configuration additionnelle. · Notes d'invérifiabilité de l'Acceptance Auditor (chiffres de baseline, vérification visuelle) — déjà auto-consignées avec ⚠️ dans le Dev Agent Record, pas des défauts.

## Dev Notes

### Encadré n°1 — Pourquoi « menu de la fiche » et pas un panneau séparé

`EXPERIENCE.md:417-423` (contrat d'UX, 2026-08-04) tranche déjà la forme : *« Les cinq actions
d'export […] vivent dans le menu à trois points de l'en-tête de la fiche. Aucune navigation
ajoutée, rien à l'écran au repos. »* Une condition de révision existait (« si le journal devient
une destination à part entière ») — **elle ne s'est pas déclenchée** : la story 29.5 a fait sortir
le journal et l'équipement de la fiche principale vers la **sous-navigation locale**, jamais une
destination globale. Le menu à trois points reste donc la bonne forme, non remise en question.

### Encadré n°2 — Les cinq actions, une seule fois, aucune de plus

| # | Libellé (clé de thème existante) | Méthode `CharacterSheet` inchangée | Garde |
| --- | --- | --- | --- |
| 1 | `character.export_editable_cta` | `exportPdf('editable')` | aucune (tout lecteur) |
| 2 | `character.export_2pages_cta` | `exportPdf('2pages')` | aucune |
| 3 | `character.export_equipment_cta` | `exportEquipmentPdf()` | aucune |
| 4 | `character.export_notes_cta` | `exportNotesPdf()` | aucune |
| 5 | `character.pdf_crop_edit_cta` | `editPdfPortraitCrop()` | `isOwner() && !!c.portraitUrl` (AC6) |

Les quatre exports restent accessibles à **tout lecteur de la fiche** (propriétaire, MJ, et à
partir de la story 31.5 un compagnon) — comportement actuel inchangé, ne pas ajouter de garde
`isOwner()`/`viewerIsMj()` dessus, l'AC3 exige une sortie identique à l'existant.

🚨 **`.sheet__portrait-edit-cta` (« Modifier le portrait », `editPortrait()`) n'est PAS une des
cinq actions** — c'est le portrait de l'AVATAR (story 4.5), pas le recadrage dédié à l'export PDF
(story 4.7, action n°5 ci-dessus). Les deux dialogues (`PortraitCropper`) sont similaires mais
distincts (`shape: 'rect'` + `initialCropData: c.pdfPortraitCropData` uniquement pour le n°5,
`character-sheet.ts:662-670`). Le bouton avatar reste dans l'en-tête, hors du menu (AC5).

### Encadré n°3 — Le patron de menu à réutiliser existe déjà, fini hier

La story 36.14 (`da4c778`, HEAD de cette story) vient de livrer et corriger en revue de code un
patron « déclencheur + menu ancré ordinateur / feuille téléphone » — c'est le **seul** patron de
menu flottant du projet en dehors de `MatDialog` (`MatMenu` proscrit, `MatBottomSheet` inexistant
dans le projet, `shell.spec.ts:111,114`). Deux défauts y ont été trouvés et corrigés en revue :
focus jamais déplacé à l'ouverture, et fermeture intempestive du panneau au franchissement du
seuil desktop/mobile pendant qu'il était ouvert (causée par un handler `(detach)` à ne PAS
reproduire ici — `cdkTrapFocusAutoCapture` suffit pour le focus, aucun handler `(detach)` n'est
nécessaire sur `cdkConnectedOverlay`).

**Ce qui change ici par rapport à `CalendarDisplayPanel`** : le contenu n'est pas une liste de
couches à bascule mais cinq actions ponctuelles qui se ferment elles-mêmes après un clic (AC4) —
plus proche d'un menu d'actions que d'un panneau de réglages. La mécanique d'enveloppe
(overlay/feuille, focus, clavier) reste identique ; seul le contenu diffère.

### Encadré n°4 — Le trou de thème trouvé en préparant cette story

`character.pdf_crop_edit_cta` existe dans `grimoire-emeraude` et `medieval-steampunk` mais **pas**
dans `foret-ancienne` (`tones.ts:566-572`). C'est un bug préexistant, invisible jusqu'ici parce
qu'aucun test de complétude ne couvre cette clé (seul `AGENDA_KEYS` existe, scope calendrier). Le
bouton correspondant s'affiche aujourd'hui avec un texte vide/`undefined` en thème Forêt Ancienne
— exactement le piège n°12 de la 36.9, revenu par une autre porte. À corriger dans cette story
puisqu'elle déplace cette clé précise dans le nouveau menu (Task 3).

### Ce qui est HORS périmètre

- **`character.service.ts`, tout `apps/api/`** : aucun changement, FR-18 est un travail de front
  pur (`epics.md:470` : « Aucune AD dédiée — travail d'UI, gouverné par les conventions »)
- **La story 31.2** (surface de détail) : le menu de cette story N'EST PAS la surface de détail
  panneau latéral/feuille de la 31.2 — ce sont deux mécanismes distincts qui partagent seulement
  le même patron `cdkConnectedOverlay`/bascule desktop-mobile
- **Le bouton avatar `editPortrait()`** : cf. Encadré n°2

### Project Structure Notes

Fichiers **créés** :
```
apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/
  (.ts .html .scss .spec.ts)
```

Fichiers **modifiés** :
```
apps/web/src/app/features/characters/character-sheet/character-sheet.{ts,html,scss,spec.ts}
apps/web/src/app/core/theme/tones.ts
apps/web/src/app/core/theme/theme-tone.service.spec.ts
```

Fichiers **interdits** : tout `apps/api/`, tout `packages/shared/`, toute migration.

Conventions : composant de menu **standalone**, rendu pur (`input()`/`output()`), signals, jamais
`Subject` ; `*.spec.ts` à côté du source ; libellés via `theme.tone()`, jamais en dur.

### Testing

- **Runner** : Vitest 4 via `@angular/build:unit-test`, jsdom. `docker compose exec web pnpm test`
- **Lint** : `docker compose exec web pnpm lint` — objectif **lint = baseline exactement (142)**
- **Tout par Docker** — jamais un outil Node sur l'hôte
- **Zoneless** : boucle de ticks établie du projet, `whenStable()` seul ne suffit pas
- **Baseline à reconfirmer** (HEAD `da4c778`, tree propre) : web **114 fichiers / 2188 tests**,
  **lint 142**
- **Vérification visuelle réelle obligatoire** via Chrome MCP — c'est elle, et non les tests, qui
  a trouvé les deux défauts corrigés en revue de la 36.14 sur ce même patron de menu

### References

- [Source: _bmad-output/planning-artifacts/epics.md:1309-1333] — Epic 31 et les 3 AC verbatim de la 31.1
- [Source: _bmad-output/planning-artifacts/epics.md:210, :291, :470] — FR-18, notes d'implémentation de l'épic (aucune AD dédiée)
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:200-201, :462] — FR-18, Q-5 tranchée (menu de la fiche)
- [Source: architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md:470] — FR-18 sans AD dédiée, travail front gouverné par les conventions
- [Source: ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:417-423] — §4.7 Menu de fiche, la décision de forme et sa condition de révision (non déclenchée)
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.html:14-157] — le patron cdkConnectedOverlay/feuille/CdkTrapFocus à réutiliser (story 36.14)
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:145, :228, :342-378] — positions, seuil desktop, ouverture/fermeture/clavier
- [Source: apps/web/src/app/features/calendar/calendar-display-panel/] — le composant de contenu de rendu pur dont s'inspirer pour la structure (pas le contenu)
- [Source: apps/web/src/app/layout/shell/shell.spec.ts:111, :114] — l'interdiction de MatMenu
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html:5-82] — l'en-tête actuel à restructurer
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:551-618, :656-677] — les quatre méthodes d'export + le recadrage PDF, inchangées
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts:310-462, :637-704] — tests existants à réécrire
- [Source: apps/web/src/app/core/theme/tones.ts:16, :213, :373, :566-572, :720, :914] — les trois blocs de thème, le trou découvert dans `foret-ancienne`
- [Source: apps/web/src/app/core/theme/theme-tone.service.spec.ts:38-74] — patron de test de complétude par thème (`AGENDA_KEYS`) à imiter
- [Source: _bmad-output/implementation-artifacts/36-14-la-barre-repliee-la-legende-et-les-preferences.md — section Review Findings] — les deux défauts déjà trouvés et corrigés sur ce même patron de menu, à ne pas reproduire

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (bmad-dev-story), 2026-08-23

### Debug Log References

- Baseline mesurée avant toute modification (Task 0), arbre propre, `HEAD = da4c778` :
  **114 fichiers / 2188 tests**, **lint 142**. Confirmée exactement.
- Livraison initiale : **115 fichiers / 2203 tests** (+15), **lint 142 = baseline exactement**.
- Post-revue de code (2026-08-24) : **115 fichiers / 2209 tests** (+6), **lint 142 = baseline
  exactement**.
- `docker compose exec web pnpm test` · `docker compose exec web pnpm lint`

### Completion Notes List

**Portée tenue : front pur.** Aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune
migration, aucune dépendance nouvelle (AC9, vérifié par `git status`).

**Revue de code (2026-08-24) : 4 patch appliqués, 4 defer (pré-existants, hérités tels quels du
patron de la 36.14, non introduits par cette story), 4 rejetés comme bruit.** Corrigés : (1)
couverture de test de la branche feuille mobile, absente jusqu'ici — même l'AC1, qui nomme
littéralement « sur téléphone », ne l'exerçait pas ; (2) garde de réentrance `exportInFlight()`
reprise sur les 3 méthodes d'export, retirée sans remplacement quand l'AC4 a fermé le menu avant
l'appel ; (3) sémantique ARIA de dialogue complétée (`role="dialog"`/`aria-modal="true"` sur la
surface ancrée, `aria-modal` sur la feuille) ; (4) filet de sécurité `(focusout)` dans
`SheetActionsMenu` si le 5e item disparaît pendant que le menu est ouvert (portrait/propriétaire
changeant en temps réel) — ramène le focus sur le premier item plutôt que de le laisser filer vers
`<body>`.

**1. Le menu « ⋮ » réutilise tel quel le patron de la 36.14, sans l'adapter.** `CdkConnectedOverlay`
+ `CdkTrapFocus` (`cdkTrapFocusAutoCapture`) pour le menu ancré, feuille montant du bas en dessous
de 1024px (même `BreakpointObserver`/seuil unique du projet), même mécanique
ouverture/fermeture/clavier que `CalendarView` (36.14) — y compris les deux correctifs que sa
revue de code avait dû ajouter après coup (focus à l'ouverture, absence de handler `(detach)`) :
posés ici dès le départ, aucun des deux défauts n'a été reproduit.

**2. Trou de thème préexistant trouvé et corrigé au passage.**
`character.pdf_crop_edit_cta` manquait dans le thème `foret-ancienne` depuis l'origine (présente
dans les deux autres) — le bouton de recadrage PDF s'y affichait avec un texte vide. Sans rapport
avec cette story, mais elle déplace précisément cette clé dans le nouveau menu : corrigée dans le
même geste plutôt qu'ignorée. Un test de complétude dédié (`SHEET_MENU_KEYS`, même patron que
`AGENDA_KEYS`/`DISPLAY_KEYS`) verrouille désormais les six clés du menu dans les trois thèmes.

**3. Trouvé en écrivant les tests : un stub global cassait le nouvel overlay CDK.**
`vi.stubGlobal('URL', { ...URL, ... })` (préexistant dans `character-sheet.spec.ts`, utilisé pour
mocker `createObjectURL`/`revokeObjectURL`) remplaçait la classe `URL` par un objet littéral, sans
constructeur — inoffensif tant qu'aucun test n'ouvrait d'overlay CDK, mais celui-ci en a besoin en
interne (`TypeError: URL is not a constructor` dès qu'un test ouvrait le menu). Corrigé en
patchant seulement les deux méthodes statiques utilisées sur la vraie classe `URL`, restaurées en
`afterEach`.

**4. Un test a changé de vérité, pas été supprimé** (piège n°9 de l'épic 36, réappliqué).
« Les 4 boutons d'export sont désactivés pendant un export en cours » n'a plus de sens depuis
l'AC4 : le menu se ferme désormais AVANT que l'export ne parte, il n'y a donc plus de bouton
visible à désactiver. Réécrit en « un clic ferme le menu immédiatement, avant même que l'export ne
résolve » — même scénario de course (export encore en vol), vérité mise à jour.

**5. Vérifié à l'écran** (Chrome MCP, session de l'utilisateur) : les trois thèmes ; la feuille
mobile (largeur réelle 741 px) avec ses 4 actions (personnage sans portrait) ; le menu ancré
« sur ordinateur » (signal `isDesktop` muté côté client pour contourner la limite `resize_window`
déjà consignée par la 36.11 — `outerWidth` change, `innerWidth` non) avec capture de focus
immédiate dans le premier item ; `Échap` qui ferme et rend le focus au déclencheur dans les deux
branches ; un export réel qui ferme le menu instantanément, sans erreur console.

**6. ❌ Non vérifié à l'écran, consigné.** Le 5e item (recadrage PDF) — aucun personnage du jeu de
données de développement ne porte de portrait ; couvert par 2 tests dédiés (présence/absence,
ouverture du dialogue en mode `rect`). Le nom exact du fichier téléchargé — `chrome://downloads`
n'est pas accessible aux outils de navigation pilotée ; la fonction qui le génère n'a pas été
modifiée par cette story, seul son point de déclenchement a changé.

**7. Comportement réseau inchangé (AC3).** Les quatre méthodes d'export et `editPdfPortraitCrop()`
restent dans `CharacterSheet`, verbatim — le menu ne fait qu'émettre l'intention et se refermer
avant de les appeler.

### File List

**Créés**
- `apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/sheet-actions-menu.ts`
- `apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/sheet-actions-menu.html`
- `apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/sheet-actions-menu.scss`
- `apps/web/src/app/features/characters/character-sheet/sheet-actions-menu/sheet-actions-menu.spec.ts`

**Modifiés**
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/core/theme/theme-tone.service.spec.ts`
