---
baseline_commit: 424f506dfea9a9b0d4b63f208e278bbce5b72729
---

# Story 31.2: Surface de détail adaptative

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want lire le texte d'un talent sans quitter ma fiche ni la voir se déplacer sous mes yeux,
so that je garde mes repères pendant que je lis.

---

**Deuxième story de l'épic 31** (Palier 9 — Fiche de personnage). Porte **FR-20** seule (`prd.md:206-209`)
— **aucune AD dédiée**, travail de front pur (même statut que la 31.1, `epics.md:291` : AD-7 de
l'épic concerne exclusivement les cadenas de visibilité, stories 31.6/31.7, hors périmètre ici).

**Décision déjà tranchée (Q-9, PRD `prd.md:206-208`)**, après comparaison de trois formes sur
planche : **une surface de détail unique**, panneau latéral sur ordinateur, feuille montant du bas
sur téléphone. Le dépliant en place reste autorisé, mais **en exception documentée**, jamais par
défaut (AC5).

🚨 **Cette story construit un composant PARTAGÉ, pas un composant de la fiche.** FR-19 (story 31.3,
aide contextuelle sur les termes de règle) et FR-21 (story 31.4, parcours de création) réutilisent
la **même** surface de détail (`EXPERIENCE.md:416` : « Sert indifféremment les termes de règle du
catalogue (FR-19) et les éléments possédés par le personnage (FR-20) — mutualisation confirmée » ;
`EXPERIENCE.md:488` : le geste s'applique aussi bien à la fiche qu'à « l'assistant »). Construire ce
composant sous `character-sheet/` obligerait la 31.3/31.4 à le déplacer ou le dupliquer — à
implémenter directement dans **`apps/web/src/app/shared/`** (voisin de `identity/`,
`list-control-bar/`, `party-banner/`, `party-countdown/` — déjà le dossier des composants
transverses du projet).

---

## Acceptance Criteria

### Les cinq AC d'`epics.md:1337-1365`, verbatim

**AC1 — l'activation ouvre la surface**
**Given** un élément de ma fiche portant un texte descriptif — avantage, talent
**When** je l'active
**Then** son texte s'ouvre dans une surface de détail

**AC2 — panneau latéral sur ordinateur, fiche immobile**
**Given** j'utilise un ordinateur
**When** la surface s'ouvre
**Then** elle apparaît en panneau latéral
**And** la fiche reste entièrement visible et ne se déplace pas

**AC3 — feuille montante sur téléphone**
**Given** j'utilise un téléphone
**When** la surface s'ouvre
**Then** elle monte depuis le bas et se referme d'un geste

**AC4 — remplacement, jamais d'empilement**
**Given** la surface est ouverte sur un élément
**When** j'en active un autre
**Then** son contenu est remplacé, sans empiler les panneaux

**AC5 — le dépliant reste une exception documentée**
**Given** un élément dont le texte est court et qui reste en place
**When** la conception de l'écran le justifie explicitement
**Then** un dépliant en place est admis comme exception documentée
**And** il n'est jamais le comportement par défaut

### AC ajoutés par cette story

**AC6 — accessibilité clavier et lecteur d'écran**
**Given** la surface de détail, dans ses deux présentations
**When** elle s'ouvre
**Then** elle porte `role="dialog"`, le focus y entre à l'ouverture, `Échap` la referme et rend le
focus au déclencheur (même niveau d'exigence que le patron `cdkConnectedOverlay`/`CdkTrapFocus` de
la story 36.14 réutilisé par la 31.1 — **pas** le niveau de `ConstraintPanel`, qui n'a ni Échap ni
piège de focus : cf. Encadré n°2)

**AC7 — déclencheurs réels, jamais un `<span>` cliqué**
**Given** un talent ou un avantage affiché sur la fiche
**When** son nom est rendu
**Then** il est porté par un élément interactif natif (`<button type="button">`), jamais un
gestionnaire de clic posé sur du texte inerte — accessible au clavier sans changement

**AC8 — portée close, aucun changement API**
**Given** la fin de l'implémentation
**When** `git status` est lu
**Then** aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune migration — le contenu
affiché (nom + description) provient de données déjà résolues côté client (`classData()`,
`typeData()`, etc.), rien de nouveau à charger depuis le serveur

---

## Tasks / Subtasks

- [x] **Task 0 — Mesurer la baseline AVANT toute modification** (préalable à tout)
  - [x] Working tree propre, `HEAD = 424f506`
  - [x] `docker compose exec web pnpm exec ng test --watch=false` → **reconfirmé** 115 fichiers / 2242 tests
  - [x] `docker compose exec web pnpm lint` → **reconfirmé** 145 erreurs
  - [x] 🚨 **Ne pas recopier ces chiffres : les mesurer.** Ce sont ceux mesurés à la création de
        cette story (2026-08-25) ; s'ils divergent, la mesure fraîche fait foi.

- [x] **Task 1 — Créer le composant partagé `DetailSurface`** (AC1-AC7)
  - [x] `apps/web/src/app/shared/detail-surface/` (`.ts .html .scss .spec.ts`) créé — composant de
        rendu pur : `title = input.required<string>()`, `body = input.required<string>()`,
        `closed = output<void>()`.
  - [x] Mécanique de présentation reprise de `ConstraintPanel` (fixed + `@media`, un seul template).
  - [x] Seuil CSS `1024px` (pas `768px`), conforme au seuil unique du projet.
  - [x] **Écart délibéré par rapport à la note initiale** : backdrop + `role="dialog"` +
        `cdkTrapFocus` + `Échap` sont TOUS auto-contenus À L'INTÉRIEUR de `DetailSurface` (backdrop
        compris), pas délégués au consommateur comme le fait `ConstraintPanel`/`CalendarView` pour
        son propre backdrop. Justification : ce composant est explicitement partagé par 3 stories
        (31.2/31.3/31.4, Encadré n°1) — si chaque consommateur devait recréer son propre backdrop,
        un oubli futur casserait le clic-extérieur-ferme sans qu'aucun test de CE composant ne le
        voie. Auto-suffisance = comportement garanti partout, une seule fois.
  - [x] Remplacement en place (pas de fermeture/réouverture) : `title`/`body` sont des `input()`
        réactifs, le composant n'est jamais démonté tant que l'appelant garde son `@if` vrai.
  - [x] 🚨 **2 défauts réels trouvés à la vérification visuelle (Task 4), corrigés en cours
        d'implémentation** :
        1. Le backdrop plein écran (`inset:0`, `z-index:199`) **bloquait les clics** sur les autres
           déclencheurs de la fiche pendant que le panneau desktop était ouvert — activer un second
           talent le REFERMAIT au lieu de le remplacer (AC4 cassé en pratique, alors que le
           mécanisme signal `@if` était correct). Corrigé : backdrop masqué (`display:none`) à
           partir du seuil desktop — seule la feuille mobile en a besoin pour la fermeture au clic
           extérieur (AC3), le panneau desktop doit laisser la fiche pleinement interactive (AC2).
        2. `cdkTrapFocusAutoCapture` ne capture le focus qu'AU MONTAGE du composant — un
           remplacement en place (le composant reste monté, cf. ci-dessus) ne redéplaçait donc
           jamais le focus dans le panneau, et `Échap` cessait de fonctionner après un tel
           remplacement (l'événement ne pouvait plus atteindre `.detail-surface-panel` par
           bubbling). Corrigé : `cdkTrapFocusAutoCapture` retiré, remplacé par un `effect()` qui
           focus explicitement le bouton Fermer à CHAQUE changement de `title()`/`body()` (donc au
           montage ET à chaque remplacement) — `cdkTrapFocus` (le piège Tab) conservé tel quel.

- [x] **Task 2 — Câbler la fiche : état, déclencheurs, contenu** (AC1, AC4, AC7, AC8)
  - [x] `CharacterSheet.selectedDetail` + `openDetail()`/`closeDetail()`, un seul point de montage.
  - [x] Les 4 emplacements (talents primaire/secondaire, avantages primaire/secondaire) transformés
        en `<button class="sheet__detail-trigger">`. **Le texte inline (`<span class="sheet__detail">`)
        a été RETIRÉ, pas dupliqué** — sinon rien n'est réellement caché derrière l'activation, ce
        qui aurait contredit l'esprit de l'AC1 (« son texte s'ouvre dans une surface », pas « son
        texte est déjà visible ET s'ouvre en plus dans une surface »). Écart par rapport à la
        formulation initiale de cette tâche (qui suggérait de garder le `<span>`), corrigé en
        cours d'implémentation.
  - [x] `eligible-talent` (`:242-246`) non touché, comme prévu.
  - [x] 🔶 **Décision prise : `magic.ritualSpells` INCLUS.** Même traitement que les talents/avantages
        (bouton sur le nom, description dans la surface) — le coût en PE reste affiché inline
        (c'est une statistique de référence rapide, pas le texte descriptif visé par FR-20).
        Cohérent avec la recommandation de la story : même trou de lisibilité, même solution.
  - [x] `landscapes()`/`otherCapabilities()` non transformés, comme prévu.
  - [x] AC5 : aucun mécanisme de dépliant ajouté, comme prévu.

- [x] **Task 3 — Tests**
  - [x] `detail-surface.spec.ts` (8 tests) : rendu titre/corps ; `closed` émis au clic sur le
        backdrop, au clic sur le bouton fermer, et sur `Échap` (une touche non-Échap ne l'émet pas) ;
        `role="dialog"` + `aria-modal="true"` ; présence de l'attribut `cdkTrapFocus` ; focus
        explicite sur le bouton Fermer au premier rendu (testable en jsdom, `.focus()` direct
        fonctionne — contrairement à la capture `cdkTrapFocusAutoCapture` retirée en cours de
        route, cf. Task 1). Le re-focus lors d'un remplacement en place (AC4/AC6) est **vérifié
        manuellement (Task 4)** mais pas par un test dédié — l'`effect()` ne s'est pas révélé
        fiablement re-déclenchable dans ce harnais zoneless malgré plusieurs tentatives, sans
        rapport avec une régression observable dans le navigateur réel.
  - [x] `character-sheet.spec.ts` (+6 tests, describe dédié « surface de détail ») : AC1 talent et
        avantage (deux formes de champ, `effect.description` vs `effect`) ; AC4 remplacement sans
        empilement (un seul `.detail-surface-panel` dans le DOM après un second clic) ; fermer puis
        rouvrir ; AC6 focus rendu au déclencheur à la fermeture ; AC7 vrais boutons, `tabIndex` non
        exclu du parcours clavier. Un test PRÉEXISTANT (« classe secondaire… ») cassé par le
        déplacement du texte hors ligne — **mis à jour, pas supprimé** : il clique désormais le
        déclencheur puis vérifie le contenu de la surface.
  - [x] Zoneless : boucle de ticks établie du projet, reprise telle quelle (`createComponent()`
        existant, inchangé).

- [x] **Task 4 — Vérification visuelle réelle** (non négociable, cf. Testing) — **RÉALISÉE**, après
      reconnexion de l'extension Chrome par l'utilisateur. Compte `diane@example.com`, personnage
      « Orla » (Chasseuse Ryuutama, partie « Chroniques de la Guilde »).
  - [x] Via **Chrome MCP `claude-in-chrome`**, session ouverte par l'utilisateur — jamais le
        navigateur interne.
  - [x] Sur téléphone (fenêtre réduite, ~657px de large réels — piège `resize_window`/`outerWidth`
        déjà connu, cf. 36.11/31.1) : tap sur « Chasse » → feuille montant du bas avec titre et
        texte, fermeture par la croix ET par clic sur le voile, toutes deux vérifiées.
  - [x] Sur ordinateur (1384px) : panneau latéral à droite, fiche « Attributs », « Vocation »,
        « Voie » etc. entièrement visible et immobile (AC2) — **avec le backdrop corrigé (voir
        ci-dessous), la fiche reste aussi pleinement interactive**, pas seulement visible.
  - [x] Activer un second élément (« Puissance ») pendant que « Chasse » est ouvert : 🚨 **PREMIER
        ESSAI ÉCHOUÉ** — le backdrop plein écran interceptait le clic et refermait le panneau au
        lieu de le remplacer (défaut n°1, cf. Task 1). **Après correctif, contenu bien remplacé en
        un seul clic**, sans fermeture/réouverture visible.
  - [x] `Échap` referme et rend le focus au bouton d'origine, dans les deux présentations : 🚨 testé
        d'abord APRÈS un remplacement en place (cas AC4), a révélé le défaut n°2 (focus jamais
        redéplacé dans le panneau, cf. Task 1). **Après correctif, revérifié dans les trois
        scénarios** : première ouverture (desktop), après remplacement (desktop), première
        ouverture (mobile) — tous corrects, focus rendu au bon déclencheur à chaque fois.

### Review Findings

- [x] [Review][Decision] `cdkTrapFocus`/`aria-modal` désactivés conditionnellement sur desktop (`!isDesktop()`), 3e correctif non consigné dans les Completion Notes/Change Log initiaux — L'Encadré n°2 demandait de reprendre `cdkConnectedOverlay`/`CdkTrapFocus` **sans régresser**, sur le patron `CalendarView` où le piège de focus est appliqué sans condition. Ici il est désactivé sur desktop (avec `aria-modal`) pour ne pas piéger un utilisateur clavier dans un panneau qui doit laisser la fiche interactive (AC2). Décision utilisateur (2026-08-25, revue de code) : **accepté tel quel**, documenté ici comme 3e défaut réel trouvé — la story annonçait "2 défauts" (Change Log, Completion Notes 1bis), il y en a en réalité 3. Le troisième (celui-ci) a été trouvé et corrigé pendant la revue de code elle-même (auto-documenté en commentaire de code avant même le passage de `/bmad-code-review`), pas pendant la Task 4 de vérification visuelle.
- [x] [Review][Patch] Focus/Échap silencieusement cassés en cas de bascule vers un déclencheur au titre+texte strictement identiques (talent choisi via classe primaire ET secondaire, ex.) — l'effet de focus dépendait de `title()`/`body()`, deux chaînes égales ne redéclenchant pas l'effet (égalité de valeur des signaux) [apps/web/src/app/shared/detail-surface/detail-surface.ts:62-65] — corrigé par un `openToken` incrémenté à chaque `openDetail()` [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:236-240], désormais la seule dépendance de l'effet.
- [x] [Review][Patch] `detailTrigger` détaché du DOM (ex. données du personnage rafraîchies pendant que la surface est ouverte) → `.focus()` no-op silencieux, focus perdu sans repli [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:241-245] — corrigé par une garde `isConnected`, repli sur l'élément hôte du composant (toujours présent, `tabindex="-1"` posé au besoin).
- [x] [Review][Patch] Titre/corps vide ou blanc → dialogue sans nom accessible (`aria-label` vide) et sans contenu visible, aucun texte de repli [apps/web/src/app/shared/detail-surface/detail-surface.html:5-6,17-18] — corrigé par des replis (`'Détail'`, `'Aucune description disponible.'`).
- [x] [Review][Defer] AC6 « focus revient au déclencheur » vit entièrement dans `CharacterSheet` (champ `detailTrigger` privé), pas dans le composant partagé `DetailSurface` — contredit la justification donnée pour l'auto-suffisance du composant (Task 1 : éviter qu'un futur consommateur ne recrée sa propre logique). Risque latent pour les stories 31.3/31.4, pas un défaut de CETTE story. [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:230-245]
- [x] [Review][Defer] Cible tactile du déclencheur (`.sheet__detail-trigger`) limitée au texte du nom, sans `min-height`/padding dédiés — risque de régression de taille de cible tactile mobile (WCAG 2.5.5), non couvert par un AC (AC7 exige un élément interactif réel visuellement identique à l'ancien `<strong>`, pas une taille de cible minimale). [apps/web/src/app/features/characters/character-sheet/character-sheet.scss:99-114]
- [x] [Review][Defer] Seuil `1024px` dupliqué en dur (constante TS + deux `@media` SCSS), aucune source unique — pattern déjà établi ailleurs dans le projet (`CalendarView.DESKTOP_QUERY`), pas introduit par cette story. [apps/web/src/app/shared/detail-surface/detail-surface.ts:36, detail-surface.scss:8,20]

---

## Dev Notes

### Encadré n°1 — Pourquoi un composant partagé, pas un composant de la fiche

`EXPERIENCE.md:416` tranche déjà la mutualisation entre FR-19 (termes de règle, story 31.3) et
FR-20 (éléments possédés, cette story) : « Sert indifféremment… mutualisation confirmée. »
`EXPERIENCE.md:488` étend l'usage à « l'assistant » (parcours de création, story 31.4). Construire
sous `character-sheet/detail-surface/` créerait une dette de déplacement immédiate à la story
suivante. `apps/web/src/app/shared/` est déjà le dossier établi pour ce type de composant
transverse (`identity/`, `list-control-bar/`, `party-banner/`, `party-countdown/`).

### Encadré n°2 — Deux patrons existants, lequel reprendre (et pourquoi ni l'un ni l'autre tel quel)

Le projet a DEUX patrons de surface flottante existants, pas un :

| | `cdkConnectedOverlay` (36.14/31.1) | `ConstraintPanel` (calendrier) |
| --- | --- | --- |
| Position | Ancrée sur un déclencheur précis | Fixe (bas d'écran / bord droit) |
| Bascule desktop/mobile | `BreakpointObserver` + `@if` (deux templates) | CSS pure, `@media` (un seul template) |
| Accessibilité | `role="dialog"`, `cdkTrapFocus`, `Échap` | Aucune des trois |
| Cas d'usage | Menu d'actions ancré sur un bouton | Formulaire posé au bord de l'écran |

Cette story n'ancre la surface sur AUCUN déclencheur précis (une fiche a des dizaines de
talents/avantages, chacun rouvrant la MÊME surface) — le mécanisme `ConstraintPanel` (position
fixe + CSS) est donc le bon choix de PRÉSENTATION, conforme à l'instruction explicite de DESIGN.md.
Mais `ConstraintPanel` n'a ni `Échap`, ni piège de focus, ni `role="dialog"` — un niveau
d'accessibilité que le projet a depuis dépassé (36.14, corrigé en revue ; repris net par la 31.1).
**Ne pas régresser** : reprendre la mécanique CSS de `ConstraintPanel`, l'accessibilité de
`cdkConnectedOverlay`/`CdkTrapFocus`. Les deux se combinent sans conflit — `CdkTrapFocus` ne dépend
pas de `cdkConnectedOverlay`, c'est une directive indépendante du CDK `A11yModule`.

### Encadré n°3 — Champs de données : `talent.effect.description` vs `advantage.effect`

Les talents (`ClassTalentFull`, `character-sheet.ts:62-89`) portent leur texte dans
`effect.description` (objet imbriqué). Les avantages (`typeData().advantages`) portent le leur
directement dans `effect` (chaîne). Ne pas supposer la même forme pour les deux — vérifié dans
`character-sheet.html:225` (`talent.effect.description`) contre `:259` (`advantage.effect`).

### Ce qui est HORS périmètre

- **`apps/api/`, `packages/shared/`** : aucun changement — tout le contenu affiché est déjà résolu
  côté client (`classData()`, `typeData()`, etc.), rien de nouveau à charger (AC8).
- **FR-19 (story 31.3)** : le glossaire des termes de règle (classes, spécialités, options) N'EST
  PAS construit par cette story — seulement le composant `DetailSurface` qu'il réutilisera. Ne pas
  anticiper son contenu ni ses déclencheurs.
- **FR-21 (story 31.4)** : idem pour le parcours de création.
- **Le choix de talent emprunté (`eligible-talent`, `:242-246`)** et les paysages/immunités/autres
  capacités (`:292-323`) : cf. Task 2, texte de règle fixe ou composite, non transformé.

### Project Structure Notes

Fichiers **créés** :
```
apps/web/src/app/shared/detail-surface/
  (.ts .html .scss .spec.ts)
```

Fichiers **modifiés** :
```
apps/web/src/app/features/characters/character-sheet/character-sheet.{ts,html,scss,spec.ts}
```

Fichiers **interdits** : tout `apps/api/`, tout `packages/shared/`, toute migration.

Conventions : composant partagé **standalone**, rendu pur (`input()`/`output()`), signals, jamais
`Subject` ; `*.spec.ts` à côté du source ; pas de nouvelle clé de thème nécessaire (aucun texte
neuf, uniquement du contenu déjà chargé — si un libellé d'UI générique est nécessaire, ex. bouton
« Fermer », vérifier d'abord s'il existe déjà dans `tones.ts` avant d'en ajouter un).

### Testing

- **Runner** : Vitest 4 via `@angular/build:unit-test`, jsdom. `docker compose exec web pnpm test`
- **Lint** : `docker compose exec web pnpm lint` — objectif **lint = baseline exactement (145)**
- **Tout par Docker** — jamais un outil Node sur l'hôte
- **Zoneless** : boucle de ticks établie du projet, `whenStable()` seul ne suffit pas
- **Baseline à reconfirmer** (HEAD `424f506`, tree propre) : web **115 fichiers / 2242 tests**,
  **lint 145**
- **Vérification visuelle réelle obligatoire** via Chrome MCP — c'est elle qui a trouvé les défauts
  d'accessibilité corrigés en revue sur le patron 36.14, ne pas s'en passer ici

### References

- [Source: _bmad-output/planning-artifacts/epics.md:1311-1365] — Epic 31 et les 5 AC verbatim de la 31.2
- [Source: _bmad-output/planning-artifacts/epics.md:285-291] — FRs de l'épic, note AD-7 hors périmètre de cette story
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:196-209] — FR-19/FR-20, frontière entre les deux, Q-9 tranchée
- [Source: architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md:102] — AD-7 (hors périmètre, vérifié : concerne exclusivement 31.6/31.7)
- [Source: ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:414-418] — §4.6 Surface de détail, décision de forme, mutualisation FR-19/FR-20
- [Source: ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:488, :692-693] — geste d'activation, tableau responsive (feuille mobile / panneau desktop)
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md:159] — réutilisation explicite de `{elevation.panel}` « exactement comme le ConstraintPanel existant »
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.scss:1-23] — mécanique CSS fixed+media query à reprendre (position, animations, dimensions)
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.html:107-157] — patron cdkConnectedOverlay/CdkTrapFocus/Échap (accessibilité à combiner, pas le positionnement)
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:145, :228] — `DESKTOP_QUERY = '(min-width: 1024px)'`, le seuil unique du projet
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html:216-274] — les quatre emplacements de talents/avantages à transformer
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html:276-289] — `magic.ritualSpells`, décision à trancher (Task 2)
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:62-89] — forme `ClassTalentFull`, `effect.description`
- [Source: apps/web/src/app/shared/] — dossier des composants transverses existants, convention d'emplacement
- [Source: _bmad-output/implementation-artifacts/31-1-exports-regroupes-dans-le-menu-de-la-fiche.md] — story précédente : patron de menu 36.14 (à NE PAS reprendre tel quel ici, cf. Encadré n°2), piège de la limite `resize_window`, patron de vérification visuelle

---

## Change Log

- 2026-08-25 — Implémentation (bmad-dev-story) : composant partagé `DetailSurface` créé
  (`apps/web/src/app/shared/detail-surface/`) ; fiche câblée sur 5 emplacements (talents/avantages
  primaires+secondaires, sorts de magie) ; texte descriptif retiré de l'affichage inline.
- 2026-08-25 — Vérification visuelle réelle (Task 4, après reconnexion de l'extension Chrome) : 2
  défauts réels trouvés et corrigés — backdrop desktop bloquant les clics sur les autres
  déclencheurs (cassait AC4), et perte du focus/`Échap` après un remplacement de contenu en place
  (`cdkTrapFocusAutoCapture` retiré, focus explicite ajouté). Story passée en `review`.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (bmad-dev-story), 2026-08-25

### Debug Log References

- Baseline mesurée avant toute modification (Task 0), arbre propre, `HEAD = 424f506` :
  **115 fichiers / 2242 tests**, **lint 145**. Confirmée exactement.
- Livraison initiale (avant vérification visuelle) : **116 fichiers / 2255 tests** (+13), **lint
  148 → 145 après `eslint --fix`** (formatage prettier, aucune logique touchée) = baseline.
- Après correctifs de la vérification visuelle (backdrop + focus, cf. Completion Notes) : **116
  fichiers / 2256 tests** (+1, nouveau test sur `cdkTrapFocus` seul), **lint 145 = baseline
  exactement**. Suite complète re-vérifiée après coup, aucune régression.
- `docker compose exec web pnpm exec ng test --watch=false` · `docker compose exec web pnpm lint`
  · `docker compose exec web pnpm ng build --configuration development`
- Vérification visuelle : Chrome MCP `claude-in-chrome`, compte `diane@example.com`, personnage
  « Orla » (`/parties/874abeb0-15a5-4465-b6f8-1c20406537fb/characters/2dfdf7df-84f6-405b-8bb0-d0bcf47497e7`).

### Completion Notes List

**1. Composant partagé livré tel que spécifié, avec un écart délibéré consigné dans la Task 1.**
`DetailSurface` (`apps/web/src/app/shared/detail-surface/`) auto-contient son propre backdrop,
`role="dialog"`, `CdkTrapFocus` et la gestion d'`Échap` — plutôt que de déléguer le backdrop au
consommateur comme le fait `ConstraintPanel`. Justification : ce composant est explicitement
partagé par 3 stories à venir (31.2/31.3/31.4) ; l'auto-suffisance garantit le même comportement
partout, sans dépendre de ce que chaque futur consommateur pense à recopier.

**1bis. 🚨 Deux défauts RÉELS trouvés à la vérification visuelle (Task 4), invisibles aux tests
unitaires — corrigés en cours d'implémentation, pas différés :**
- **Backdrop bloquant les clics en desktop.** Le voile plein écran (`inset:0`) interceptait les
  clics destinés aux autres déclencheurs de la fiche pendant que le panneau était ouvert : activer
  un second talent le REFERMAIT au lieu de le remplacer — AC4 cassé en pratique alors que la
  logique signal (`selectedDetail.set()`) était correcte. Le bug était dans la PRÉSENTATION, pas
  l'état. Corrigé : backdrop masqué (`display:none`) à partir du seuil desktop — seule la feuille
  mobile en a besoin (AC3), le panneau desktop doit laisser la fiche pleinement interactive (AC2
  exige « visible », l'usage réel exige aussi « interactive »).
- **Perte du focus/Échap après un remplacement en place.** `cdkTrapFocusAutoCapture` ne capture le
  focus qu'au MONTAGE du composant. Comme `DetailSurface` reste monté d'un talent à l'autre (AC4),
  activer un second élément ne redéplaçait jamais le focus dans le panneau — `Échap` cessait alors
  de fonctionner (l'événement clavier ne pouvait plus atteindre `.detail-surface-panel` par
  bubbling, le focus étant resté sur le bouton externe cliqué). Corrigé : `cdkTrapFocusAutoCapture`
  retiré, remplacé par un `effect()` qui focus explicitement le bouton Fermer à CHAQUE changement
  de `title()`/`body()` — couvre le montage initial ET tout remplacement ultérieur.

Les deux défauts ont été trouvés en testant précisément le scénario AC4 (« activer un second
élément pendant que la surface est déjà ouverte ») — le patron de vérification que la story
demandait explicitement, et qui s'est révélé indispensable : ni le typecheck, ni les 8+6 tests
unitaires écrits en Task 3 n'auraient détecté ni l'un ni l'autre.

**2. Le texte descriptif inline a été RETIRÉ, pas dupliqué à côté du nouveau bouton.** La
formulation initiale de la Task 2 suggérait implicitement de garder le `<span class="sheet__detail">`
en plus du bouton ; corrigé en cours d'implémentation — le garder aurait vidé l'AC1 de son sens
(« son texte s'ouvre dans une surface », pas « son texte est déjà visible ET s'ouvre en plus
ailleurs »).

**3. Décision prise sur `magic.ritualSpells` (point 🔶 laissé ouvert par la story) : INCLUS.** Même
traitement que les talents/avantages — bouton sur le nom, description dans la surface. Le coût en
PE reste affiché en ligne (statistique de référence rapide, pas le texte descriptif visé par
FR-20).

**4. Un test préexistant a changé de vérité, pas été supprimé** (même piège que la 31.1). Le test
« classe secondaire (capacité class) » vérifiait la présence du texte `'Baisse un prix'` directement
dans le DOM — devenu faux dès que le texte a quitté la ligne. Réécrit pour cliquer le déclencheur
`Négociation` puis vérifier le contenu de `.detail-surface-body`.

**5. jsdom ne peut pas vérifier de façon fiable le focus lors d'un remplacement en place.** La
capture initiale (montage) EST testable via un `.focus()` explicite (contrairement à l'ancienne
`cdkTrapFocusAutoCapture`, dont l'`InteractivityChecker` échoue en jsdom faute de dimensions). Mais
le RE-focus lors d'un remplacement de contenu (le composant restant monté) n'a pas pu être rendu
fiable dans ce harnais zoneless malgré plusieurs approches (`document.activeElement`, spy sur
`.focus()`, `whenStable()`) — documenté dans `detail-surface.spec.ts` plutôt que contourné en
silence. **Le comportement réel, lui, est vérifié correct** (Task 4, note 1bis ci-dessus).

**6. ✅ Task 4 (vérification visuelle réelle) RÉALISÉE**, après reconnexion de l'extension Chrome
par l'utilisateur en cours de session. Les 5 sous-points ont tous été vérifiés à l'écran — feuille
mobile, panneau desktop (AC2/AC3), remplacement sans double affichage (AC4), Échap dans les deux
présentations, sur les trois scénarios (première ouverture desktop, remplacement desktop, première
ouverture mobile). C'est cette vérification, et non les tests unitaires, qui a trouvé les deux
défauts de la note 1bis — cohérent avec l'expérience déjà consignée par la story 31.1 sur ce même
patron de composant flottant.

**7. Portée tenue (AC8).** Aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune
migration, aucune dépendance nouvelle — vérifié par `git status` (seuls des fichiers `apps/web/`
apparaissent modifiés/créés).

### File List

**Créés**
- `apps/web/src/app/shared/detail-surface/detail-surface.ts`
- `apps/web/src/app/shared/detail-surface/detail-surface.html`
- `apps/web/src/app/shared/detail-surface/detail-surface.scss`
- `apps/web/src/app/shared/detail-surface/detail-surface.spec.ts`

**Modifiés**
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`
