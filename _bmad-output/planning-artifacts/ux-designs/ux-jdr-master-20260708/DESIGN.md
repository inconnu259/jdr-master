---
title: jdr-master Design System — Delta Évolution du personnage (Palier 3)
status: final
updated: 2026-07-10
themes: [grimoire-emeraude, foret-ancienne, medieval-steampunk]
ui_system: Angular Material 22
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/DESIGN.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/addendum.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-06-27/ARCHITECTURE-SPINE.md"
---

# jdr-master — Design System — Delta Évolution du personnage (XP, niveau, inventaire, notes, édition MJ)

**Ce document est un delta**, pas un nouveau système. Il hérite intégralement des 3 thèmes, tokens couleurs/typographie/spacing/radius/élévation de `ux-jdr-master-20260626/DESIGN.md`, ainsi que du composant Avatar/Portrait et des patterns de fiche introduits par `ux-jdr-master-20260703/DESIGN.md` — **aucune nouvelle identité visuelle n'est introduite**. Ce document capture uniquement ce qui est *nouveau* pour ce palier : la restructuration de la page détail de Partie, la distribution d'XP, la montée de niveau, l'inventaire chiffré, le journal de notes, et l'édition MJ champ-par-champ.

En cas de conflit entre ce document et un mock (`mockups/`), **ce document gagne**.

---

## 1. Brand & Style

Identique à `ux-jdr-master-20260626/DESIGN.md` §1 et `ux-jdr-master-20260703/DESIGN.md` §1 (dark mode obligatoire, CSS/SVG uniquement sauf portrait, IA-friendly, switching de thème par classe CSS racine).

**Précision de ce delta** : le principe "mobile-first pour les joueurs / desktop-first pour le MJ" (hérité §1 du spine de base) devient structurant pour ce palier — c'est la première fois qu'une même surface (page détail de Partie) a une **information architecture différente selon le rôle**, pas seulement une densité différente. Voir EXPERIENCE.md §2.

---

## 2. Colors

Aucun nouveau token de couleur de base. Réutilise `{colors.accent-1}` (positif : PV/PE gagnés, capacité débloquée, XP suggéré), `{colors.accent-2}` (action : CTA "Level up !", sélection), `{colors.status-unavailable}` (encombrement dépassé — réutilisation sémantique directe, pas un nouveau rouge), `{colors.status-mixed}` (bonus XP individuel — ambre, cohérent avec son usage existant pour signaler un cas "à part").

**Nouveau (delta) — usage sémantique, pas de nouvelle valeur hex :**
- **Badge "ajouté par le MJ"** (objets d'inventaire, capacités éditées) : fond `{colors.accent-2}` à 12% d'opacité, texte plein `{colors.accent-2}` **relevé à 14px minimum** (pas 9px comme dans le premier jet du mock `.working/`) — à cette taille le texte franchit le seuil "large text" (≥14px bold ou ≥18px), ce qui ramène le ratio de contraste de `{colors.accent-2}` sur son fond teinté au-dessus de 3:1 sur les 3 thèmes (vérifié à l'oeil sur Grimoire ~4.4:1 et Steampunk ~3.2:1, tous deux conformes au seuil "large text" mais pas au seuil "texte standard" 4.5:1 — d'où l'obligation de la taille relevée plutôt qu'une nouvelle couleur).
- **Encart "rappel des règles"** (distribution XP) : fond `{colors.accent-1}` à 6% d'opacité, bordure 1px `{colors.accent-1}` à 25% d'opacité, texte `{colors.text-primary}` légèrement éclairci — un registre "info calme", plus discret que le CTA gradient, jamais utilisé pour une action cliquable.

**Tokens RGB manquants (gap hérité, comblé ici)** : `{colors.accent-1-rgb}`/`{colors.accent-2-rgb}` sont utilisés par les composants `rgba(...)` de ce document (RulesReminder, LevelUpBanner) mais n'étaient déclarés nulle part dans la chaîne héritée (`ux-jdr-master-20260626/DESIGN.md` ne définit que `--accent-1`/`--accent-2`, pas leur variante RGB, alors que des composants hérités les consomment déjà). Ce delta déclare la valeur manquante pour ne pas casser l'implémentation :
```css
:root, .theme-grimoire   { --accent-1-rgb: 126,200,164; --accent-2-rgb: 155,109,255; }
.theme-foret              { --accent-1-rgb: 46,204,113;  --accent-2-rgb: 240,192,64;  }
.theme-steampunk          { --accent-1-rgb: 205,127,50;  --accent-2-rgb: 74,124,89;   }
```
*(À faire remonter dans le spine de base — c'est un gap pré-existant, pas spécifique à ce delta, mais il devient bloquant dès l'implémentation de `RulesReminder`/`LevelUpBanner`.)*

---

## 3. Typography

Aucun nouveau rôle. Réutilise `{typography.text-2xl}` pour le montant d'XP suggéré (emphase chiffrée forte, même traitement que les gros nombres de score ailleurs dans l'app), `{typography.text-sm}` pour les hints de règles et labels de champs, `{typography.text-lg}` pour les noms de personnage et titres de panneau.

---

## 4. Layout & Spacing

Aucun nouveau token d'espacement. Deux nouvelles compositions structurelles :

### RosterRail (desktop, page détail de Partie)

Remplace l'ancien onglet "Personnages" comme point d'accès permanent à la troupe. Panneau latéral gauche, **deux états** :
- **Replié (défaut)** : `64px` de large, icônes/avatars seuls, aligné verticalement, `{spacing.sm}` de gap.
- **Déplié** : `260px` de large (même largeur que le panneau résumé de l'assistant de création, cohérence avec `WizardLayout`), transition `{motion.duration.short}` sur `width`, déclenchée par clic (pas hover — évite les ouvertures accidentelles au survol en traversant l'écran). Respecte `prefers-reduced-motion` (transition supprimée, changement d'état instantané) — *gap pré-existant dans le spine hérité (aucune règle `prefers-reduced-motion` définie dans `ux-jdr-master-20260626`/`20260703` malgré des transitions déjà en place sur BottomSheet/SlotPanel) ; ce delta applique la règle localement à sa propre transition et signale le gap pour correction en amont.*

Contenu identique dans les deux états, densité différente. `border-right: 1px solid {colors.border-subtle}`, pas d'élévation propre (fait partie du châssis de page, pas un panneau flottant).

### Contenu principal (page détail de Partie)

Occupe le reste de la largeur disponible (`flex: 1`), plus de contrainte de largeur artificielle héritée de l'ancien layout à onglet unique. Gutter identique au reste de l'app (`{spacing.xl}` desktop, `{spacing.base}` mobile).

---

## 5. Elevation & Depth

Aucun nouveau niveau. Le RosterRail (replié ou déplié) n'a pas d'élévation propre — il fait partie du châssis, comme la barre de navigation globale. Les panneaux de distribution d'XP et de montée de niveau réutilisent `{elevation.panel}` (même traitement que `SlotPanel`).

---

## 6. Shapes

Aucun nouveau rayon. Les avatars du RosterRail et de la RosterStrip mobile réutilisent le cercle parfait déjà défini pour l'Avatar (`ux-jdr-master-20260703/DESIGN.md` §7). Les rangées d'inventaire et d'items de troupe utilisent `{rounded.radius-card}` comme toute carte standard.

---

## 7. Components

### RosterRail (nouveau, desktop)

```yaml
RosterRail:
  width-collapsed: "64px"
  width-expanded:  "260px"
  padding:         "{spacing.base} 0"
  border-right:    "1px solid {colors.border-subtle}"
  transition:      "width {motion.duration.short} ease"

  avatar-item:
    size:          "38px"   # satisfait le seuil desktop 36px (RosterRail est desktop-only, cf. DESIGN.md §1 — pas le seuil mobile 44px)
    shape:         "circle"
    mj-indicator:  "box-shadow: 0 0 0 2px {colors.accent-2} + badge texte 'MJ' (8px, {colors.accent-2} sur fond {colors.surface-bg}, coin bas-droit de l'avatar)"   # anneau + texte : la couleur seule ne suffit pas à distinguer le MJ (cf. accessibilité)
    aria-label:    "\"[Nom] — MJ\" ou \"[Nom] — [Personnage], niveau [N]\" selon le rôle du participant"

  invite-slot:
    # dernier item de la liste, visible uniquement s'il reste une place libre
    shape:         "circle, border dashed 1.5px {colors.border-subtle}"
    icon:          "+"
    visibility:    "conditionnelle (place libre restante)"
    aria-label:    "\"Inviter un participant\""

  expanded-row:
    reuses:        "CreneauCard (ux-jdr-master-20260703 §7), densité réduite"
    shows:         "avatar + nom + [personnage · niveau]"
```

### RosterStrip (nouveau, mobile — MJ uniquement)

```yaml
RosterStrip:
  layout:          "flex, scroll horizontal, gap {spacing.sm}"
  padding:         "{spacing.md} {spacing.base}"
  border-bottom:   "1px solid {colors.border-subtle}"
  item:
    shape:         "pill, border-radius: 20px"
    background:    "{colors.surface-bg}"
    avatar-size:   "26px visuel, zone tactile 44px (padding invisible autour de la pill — la pill entière est la cible de tap, pas juste l'avatar)"
    aria-label:    "\"[Nom] — [Personnage], niveau [N]\" (ou \"[Nom] — MJ\")"
  invite-pill:
    shape:         "circle dashed, 32px visuel, zone tactile 44px (même logique de padding invisible)"
    aria-label:    "\"Inviter un participant\""
```

**Ne s'affiche pas côté joueur** — cf. EXPERIENCE.md §2 (IA différenciée par rôle).

### RulesReminder (nouveau)

```yaml
RulesReminder:
  background:      "rgba({colors.accent-1-rgb}, 0.06)"
  border:          "1px solid rgba({colors.accent-1-rgb}, 0.25)"
  border-radius:   "{rounded.radius-input}"
  padding:         "{spacing.md} {spacing.base}"
  font-size:       "{typography.text-sm}"
  # registre "info calme" — jamais interactif, jamais un CTA
```

### XpDistributionPanel (nouveau)

```yaml
XpDistributionPanel:
  # réutilise SlotPanel (desktop) / BottomSheet (mobile) comme conteneur
  sections:
    - RulesReminder
    - calcul-assisté: "3 champs en ligne (desktop) / empilés (mobile), lecture seule, valeur = résultat calculé"
    - montant-suggéré: "bandeau emphase, {typography.text-2xl}, bordure {colors.accent-2}"
    - liste-joueurs: "une ligne par joueur : checkbox inclusion, avatar, nom + XP actuel, bonus (lien texte {colors.status-mixed} si actif), montant éditable"
    - note-optionnelle: "input texte libre"
    - warning-inline: "si un joueur franchit un seuil, phrase {typography.text-sm} {colors.text-muted} sous le CTA — jamais bloquant"
  cta:
    reuses:        "{components.CreneauCard}.cta (gradient, pleine largeur)"
```

### LevelUpBanner (nouveau)

```yaml
LevelUpBanner:
  background:      "{colors.gradient-cta} à 15% d'opacité (fond teinté, pas plein)"
  border:          "1px solid rgba({colors.accent-1-rgb}, 0.4)"
  border-radius:   "{rounded.radius-card}"
  padding:         "{spacing.base} {spacing.base}"
  persistence:     "reste affiché tant que le niveau franchi n'est pas appliqué — jamais de dismiss silencieux"
  cta:
    label:         "Level up !"
    size:          "compact (padding 8px 16px, min-height 44px mobile / 36px desktop explicite — pas seulement le padding, pour garantir la conformité quelle que soit la ligne de base de la police ; pas la pleine largeur, ce n'est pas l'action unique de l'écran)"
```

### LevelUpWizard (nouveau)

```yaml
LevelUpWizard:
  # même conteneur panel que XpDistributionPanel ; step-progress uniquement si >1 niveau franchi d'un coup
  step-progress:
    reuses:        "segments de {components.CalendarNav} progress-bar, réinterprétés en points/segments par niveau"
  pv-pe-stepper:
    layout:        "2 colonnes égales, boutons ronds -/+ 28px visuel, zone tactile 44px mobile / 36px desktop (padding invisible autour du bouton — c'est le contrôle principal de cette étape, pas une action secondaire comme FieldEditPencil)"
    constraint:    "somme exactement 3 points, bouton + désactivé sur une colonne si l'autre est déjà à 3"
    aria-label:    "\"Diminuer PV\" / \"Augmenter PV\" / \"Diminuer PE\" / \"Augmenter PE\""
  attribute-choice-grid:
    layout:        "grille 4 colonnes (AGI/ESP/INT/VIG), cellule min-height 44px mobile / 36px desktop"
    states:
      default:     "border {colors.border-subtle}"
      selected:    "border {colors.accent-1}, fond teinté, flèche 'valeur → valeur+2'"
      disabled:    "opacity 0.35, uniquement si attribut à 12 ET un autre choix reste disponible ; aria-disabled + aria-describedby pointant vers le texte 'Déjà au maximum (12)'"
    aria-label:    "\"[Attribut] : [valeur actuelle]\" par défaut, \"[Attribut] : [valeur] → [valeur+2], sélectionné\" si sélectionné, \"[Attribut] : déjà au maximum (12)\" si désactivé"
  capability-choice-grid:
    # Update (post-final) — capacités data-driven à liste longue (paysage/climat jusqu'à 22
    # options, classe/immunité/saison), remplace le rendu ChoiceCard vertical non borné.
    layout:        "grille 2 colonnes mobile / 3 colonnes desktop, cellule min-height 44px mobile / 36px desktop (même seuil que attribute-choice-grid)"
    container:     "max-height: 50vh, overflow-y: auto — la popup LevelUpWizard ne dépasse jamais la hauteur d'écran quel que soit le nombre d'options (22 paysages/climats en pire cas)"
    states:
      default:     "border {colors.border-subtle}, réutilise {components.ChoiceCard} (character-wizard)"
      selected:    "border {colors.accent-1}, fond teinté — identique à l'état sélectionné de ChoiceCard"
    aria-label:    "\"[Label]\" par défaut, \"[Label], sélectionné\" si sélectionné — pattern hérité, pas de plafond/désactivation ici (contrairement à attribute-choice-grid, aucune de ces capacités n'a de limite atteignable)"
```

### EncumbranceBar (nouveau)

```yaml
EncumbranceBar:
  track:
    height:        "8px"
    border-radius: "4px"
    background:    "{colors.border-subtle}"
  fill:
    background:    "{colors.gradient-cta}"
  fill-over-limit:
    background:    "linear-gradient(90deg, {colors.status-unavailable}, {colors.status-mixed})"
  label:
    format:        "[poids total] / [limite]"
    font-size:     "{typography.text-sm}"
  over-limit-flag:
    # accompagne le dégradé — la comparaison numérique seule est un signal trop faible (cf. accessibilité)
    icon:          "glyphe d'avertissement, {colors.status-unavailable}"
    text:          "\"Surchargé\" accolé au label, pas seulement le changement de couleur du remplissage"
```

### FieldEditPencil (nouveau — MJ uniquement)

```yaml
FieldEditPencil:
  size:            "22px × 22px"
  shape:           "{rounded.radius-input}"
  border:          "1px solid {colors.border-subtle}"
  icon:            "crayon, {colors.text-muted} par défaut, {colors.accent-2} au hover/focus"
  scope:           "un champ individuel à la fois — jamais un mode 'édition globale' de la fiche"
  save:            "confirmation inline (pas de bouton 'Enregistrer' global de la fiche)"
  trace:           "chaque édition confirmée déclenche un instantané marqué 'modifié par le MJ' (cf. EXPERIENCE.md §4)"
```

### InventoryItemRow (nouveau)

```yaml
InventoryItemRow:
  layout:          "flex, {spacing.sm} gap"
  background:      "{colors.surface-bg}"
  border-radius:   "{rounded.radius-card}"
  padding:         "{spacing.sm} {spacing.md}"
  source-badge:
    # visible uniquement si l'objet a été ajouté par le MJ plutôt que par le joueur
    text:          "ajouté par le MJ"
    style:         "cf. §2 Colors, badge provenance"
  trailing:
    "FieldEditPencil (MJ) — absent côté joueur pour ses propres objets (il édite via le formulaire d'ajout/suppression standard, pas le crayon MJ)"
```

### NotesJournal (nouveau)

```yaml
NotesJournal:
  layout:          "liste chronologique inversée (plus récent en premier)"
  entry:
    background:    "{colors.surface-bg}"
    border-radius: "{rounded.radius-card}"
    padding:       "{spacing.base}"
    date-label:    "{typography.text-sm} {colors.text-muted}"
    share-toggle:
      label:       "Partager avec le groupe"
      size:        "44px mobile / 36px desktop (icône + libellé texte, toute la ligne cliquable, pas juste l'icône)"
      states:
        private:   "icône verrou, {colors.text-muted}"
        shared:    "icône verrou ouvert, {colors.accent-1}"
      scope:       "par entrée, jamais un réglage global de la note"
  new-entry-cta:
    reuses:        "{components.CreneauCard}.cta, style secondaire (bordure, pas de gradient — action fréquente, pas un moment fort)"
```

---

## 8. Do's and Don'ts

- **Do** garder le RosterRail replié par défaut sur desktop — le déploiement est une action volontaire de l'utilisateur, jamais un état de démarrage.
- **Do** traiter chaque `FieldEditPencil` comme un point d'édition isolé — jamais de "mode édition" qui déverrouille toute la fiche d'un coup (risque d'erreur explicitement écarté par l'utilisateur en Discovery).
- **Do** garder `LevelUpBanner` non bloquante et persistante — jamais de modale qui force une décision immédiate.
- **Don't** réutiliser `{colors.status-unavailable}` (rouge) pour autre chose qu'un dépassement réel de limite (encombrement) — pas de rouge "décoratif" pour attirer l'attention sur l'XP ou le niveau.
- **Don't** dupliquer un token déjà défini dans le spine hérité ou le delta P3 (`ux-jdr-master-20260703`) — toute nouvelle valeur numérique de ce document doit être justifiée ici avant d'être utilisée.
- **Don't** afficher la `RosterStrip` mobile côté joueur — c'est un composant MJ uniquement (cf. EXPERIENCE.md §2).
- **Don't** rendre une liste de choix à cardinalité variable (`capability-choice-grid`) sans hauteur bornée + scroll interne — constaté en usage réel : une liste de 22 options (paysage/climat) fait déborder la popup `LevelUpWizard` hors de l'écran, rendant la validation impossible (post-final, cf. memlog).
