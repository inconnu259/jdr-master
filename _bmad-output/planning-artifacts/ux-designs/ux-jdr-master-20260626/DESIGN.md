---
title: jdr-master Design System
status: final
updated: 2026-06-27
themes: [grimoire-emeraude, foret-ancienne, medieval-steampunk]
ui_system: Angular Material 22
---

# jdr-master — Design System

Document de référence pour les développeurs Angular. Toutes les valeurs sont implémentables via des CSS custom properties (`var(--token)`). Aucun asset bitmap, aucune police distante.

---

## 1. Brand & Style

### Identité visuelle

- **Nom temporaire** : jdr-master (sujet à changement — ne pas graver dans les assets)
- **Pas de logo** : le nom seul en typographie fait office de marque, stylisé via les accents de couleur
- **Dark mode obligatoire** : les trois thèmes sont exclusivement dark ; ne jamais exposer de fond clair

### Ton éditorial

Léger, humoristique, absurde JDR. La microcopy remplace les formulations génériques par des références fantasy/médiévales cohérentes avec l'univers JDR.

| Contexte | Formule générique | Formule JDR-master |
|---|---|---|
| CTA principal | "Envoyer" | "Convoquer le conseil" |
| Vote | "Voter" | "Lancer le vote du conseil" |
| Notification envoyée | "Message envoyé" | "Le pigeon voyageur a livré sa réponse" |
| Invite | "Inviter" | "Envoyer un corbeau ?" |
| Empty state calendrier | "Aucun créneau disponible" | "Aucun créneau commun… la quête est difficile, héros" |
| Section prochains créneaux | "Prochains créneaux" | "Prochaines fenêtres d'aventure" |
| Badge joueur hésitant | "Hésitant" | "Lyra 🧝 hésite (comme toujours)" |
| Badge joueur confirmé | "Confirmé" | "Arek ⚔️ confirme" |

### Principes visuels

1. **Couleurs + typographie + formes géométriques uniquement** — pas de textures bitmap, pas d'images, pas d'icônes complexes. Les ornements (thème Steampunk) sont réalisés en CSS pur via pseudo-éléments.
2. **IA-friendly** : le design doit rester entièrement gérable et modifiable par une IA sans accès à des outils graphiques. Tout est exprimé en valeurs numériques, hexadécimales et règles CSS.
3. **Mobile-first pour les joueurs** : les vues de disponibilité et de vote sont optimisées pour le mobile. Le MJ utilise principalement le desktop (vue split).
4. **Switching de thème** : les trois thèmes sont activés via une classe CSS racine (`.theme-grimoire`, `.theme-foret`, `.theme-steampunk`) qui redéfinit les custom properties. Angular Material 22 est configuré en mode CSS variables.

---

## 2. Colors

### Tokens par thème

Chaque thème redéfinit les mêmes tokens. Les composants n'utilisent jamais de couleur hardcodée — uniquement `var(--token)`.

```yaml
# Thème : Grimoire Émeraude (défaut — classe .theme-grimoire)
grimoire-emeraude:
  primary-bg:        "#0d0a14"   # fond page / body
  surface-bg:        "#1a1428"   # fond carte, panel, bottom sheet
  accent-1:          "#7ec8a4"   # vert sauge — dispo, emphase paire
  accent-2:          "#9b6dff"   # violet lavande — action, emphase impaire
  gradient-cta:      "linear-gradient(135deg, #7ec8a4, #9b6dff)"
  text-primary:      "#e8e8f0"   # texte principal
  text-muted:        "#7a7a8a"   # labels secondaires, hints

# Thème : Forêt Ancienne (classe .theme-foret)
foret-ancienne:
  primary-bg:        "#080f0a"
  surface-bg:        "#0f1a10"
  accent-1:          "#2ecc71"   # vert émeraude
  accent-2:          "#f0c040"   # or doux
  gradient-cta:      "linear-gradient(135deg, #2ecc71, #f0c040)"
  text-primary:      "#e8f0ea"
  text-muted:        "#6a806e"

# Thème : Médiéval Steampunk (classe .theme-steampunk)
medieval-steampunk:
  primary-bg:        "#1a1008"
  surface-bg:        "#241808"
  accent-1:          "#cd7f32"   # cuivre / laiton
  accent-2:          "#4a7c59"   # vert bronze patiné
  gradient-cta:      "linear-gradient(135deg, #cd7f32, #4a7c59)"
  text-primary:      "#e8dcc8"   # ivoire
  text-muted:        "#8a7a5a"
```

### Couleurs sémantiques cross-thème (identiques dans les 3 thèmes)

Ces valeurs ne varient pas selon le thème — elles sont déclarées une seule fois au niveau `:root`.

```yaml
cross-theme:
  status-available:   "var(--accent-1)"   # réutilise l'accent-1 du thème actif
  status-unavailable: "#e05252"            # rouge — jamais remplacé
  status-unknown:     "#3a3a4a"            # gris foncé — fond pointillé
  status-mixed:       "#f0a030"            # ambre — FULL_DAY avec conflit de slots
  border-subtle:      "rgba(255,255,255,0.06)"
  overlay:            "rgba(0,0,0,0.55)"
```

### Mapping CSS custom properties

```css
/* Déclaration dans :root ou .theme-grimoire */
:root, .theme-grimoire {
  --primary-bg:        #0d0a14;
  --surface-bg:        #1a1428;
  --accent-1:          #7ec8a4;
  --accent-2:          #9b6dff;
  --gradient-cta:      linear-gradient(135deg, #7ec8a4, #9b6dff);
  --text-primary:      #e8e8f0;
  --text-muted:        #7a7a8a;
  --status-available:  var(--accent-1);
  --status-unavailable:#e05252;
  --status-unknown:    #3a3a4a;
  --status-mixed:      #f0a030;
  --border-subtle:     rgba(255,255,255,0.06);
  --overlay:           rgba(0,0,0,0.55);
}
```

---

## 3. Typography

### Font stack

Aucune police distante. Uniquement des polices système.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

Pour les titres et éléments à fort caractère (thème Steampunk : optionnel, même stack) :

```css
font-family: Georgia, "Times New Roman", serif; /* Steampunk uniquement, titres section */
```

### Scale typographique

| Token | Taille | Line-height | Poids | Usage |
|---|---|---|---|---|
| `--text-sm` | 12px | 1.4 | 400 | Labels, hints, microcopy secondaire |
| `--text-base` | 14px | 1.5 | 400 | Corps de texte, contenu général |
| `--text-lg` | 16px | 1.5 | 500 | Titres de carte, noms de joueurs |
| `--text-xl` | 20px | 1.3 | 600 | Titres de section (ex: "Prochaines fenêtres d'aventure") |
| `--text-2xl` | 26px | 1.2 | 700 | Titres de page, header principal |

### Règles d'emphase (alterner les accents)

Pour mettre en valeur plusieurs éléments dans un même contexte (liste de joueurs, légende), alterner `--accent-1` et `--accent-2` afin d'éviter la monotonie visuelle.

```css
/* Exemple : liste de badges joueurs */
.player-badge:nth-child(odd)  { color: var(--accent-1); border-color: var(--accent-1); }
.player-badge:nth-child(even) { color: var(--accent-2); border-color: var(--accent-2); }
```

Ne jamais utiliser `--accent-1` et `--accent-2` simultanément sur le même élément (sauf gradient CTA).

---

## 4. Layout & Spacing

### Scale d'espacement

```yaml
spacing:
  xs:  4px    # gap entre badges, padding interne minimal
  sm:  8px    # padding interne carte compacte, gap items liste
  md:  12px   # padding badge, gap section
  base:16px   # padding carte standard, margin section
  lg:  24px   # padding panel, margin entre sections majeures
  xl:  32px   # padding page (gutter), margin entre blocs principaux
```

### Grille desktop — vue calendrier (MJ)

Vue split : le calendrier occupe 60% de la largeur, le panel de détail (SlotPanel) occupe 40%.

```
┌────────────────────────────────────────┬────────────────────────┐
│  Calendrier mensuel / hebdo   (60%)    │  SlotPanel détail (40%)│
│  CalendarNav + grille de jours         │  Créneaux, votes, CTA  │
└────────────────────────────────────────┴────────────────────────┘
```

- Breakpoint split : ≥ 1024px → layout 60/40 (`display: flex`, pas de grid)
- < 1024px : vue colonne unique, SlotPanel devient BottomSheet
- Gutter page : `padding: 0 var(--space-xl)` (32px) sur desktop, `padding: 0 var(--space-base)` (16px) sur mobile

### Breakpoints

| Token | Valeur | Usage |
|---|---|---|
| `--bp-mobile` | 480px | Compact mobile |
| `--bp-tablet` | 768px | Passage à layout élargi |
| `--bp-desktop` | 1024px | Activation du split 60/40 |

---

## 5. Elevation & Depth

Pas d'élévations colorées (pas de Material default). Utiliser uniquement des `box-shadow` sombres pour un rendu discret cohérent avec le dark mode.

```yaml
elevation:
  surface:  "0 1px 3px rgba(0,0,0,0.4)"                  # éléments plats (inputs, badges)
  card:     "0 4px 12px rgba(0,0,0,0.5)"                  # cartes, tuiles jour
  modal:    "0 8px 32px rgba(0,0,0,0.7)"                  # dialogs, modales
  panel:    "0 0 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)"  # SlotPanel, BottomSheet
```

Règle : chaque niveau doit être perceptible sur `--primary-bg`. Ne pas cumuler deux niveaux d'élévation sur un même conteneur.

---

## 6. Shapes

### Tokens radius

```yaml
radius:
  card:         "10px"   # DayCell, CreneauCard, SlotPanel, BottomSheet
  badge:        "6px"    # AvailabilityBadge, tags statut
  input:        "4px"    # champs de formulaire (Angular Material override)
  button:       "8px"    # boutons standard
  button-cta:   "10px"   # bouton gradient CTA principal
  panel:        "12px"   # SlotPanel (coin haut-gauche uniquement en desktop split)
  chip:         "4px"    # chips Angular Material
```

### Ornements Steampunk (thème uniquement)

Dans le thème `.theme-steampunk`, les cartes affichent des coins stylisés via pseudo-éléments :

```css
.theme-steampunk .card::before,
.theme-steampunk .card::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: var(--accent-1);  /* cuivre */
  border-style: solid;
}
.theme-steampunk .card::before {
  top: 6px; left: 6px;
  border-width: 2px 0 0 2px;
}
.theme-steampunk .card::after {
  bottom: 6px; right: 6px;
  border-width: 0 2px 2px 0;
}
```

Les titres de section reçoivent une double-bordure :

```css
.theme-steampunk .section-title {
  border-bottom: 2px solid var(--accent-1);
  box-shadow: 0 2px 0 0 var(--accent-2);
  padding-bottom: var(--space-xs);
}
```

---

## 7. Components

### 7.1 AvailabilityBadge

Badge inline indiquant le statut de disponibilité d'un joueur ou d'un créneau.

```yaml
AvailabilityBadge:
  base:
    font-size:      "var(--text-sm)"        # 12px
    font-weight:    500
    padding:        "2px 8px"
    border-radius:  "var(--radius-badge)"   # 6px
    border-width:   "1px"
    border-style:   solid
    display:        inline-flex
    align-items:    center
    gap:            "4px"

  states:
    AVAILABLE:
      background:   "rgba(var(--accent-1-rgb), 0.15)"
      color:        "var(--accent-1)"
      border-color: "var(--accent-1)"

    UNAVAILABLE:
      background:   "rgba(224, 82, 82, 0.15)"
      color:        "#e05252"
      border-color: "#e05252"

    UNKNOWN:
      background:   "rgba(58, 58, 74, 0.4)"
      color:        "#888899"
      border-color: "#3a3a4a"
      border-style: dashed    # fond pointillé simulé via border dashed

    MIXED:
      background:   "rgba(240, 160, 48, 0.15)"
      color:        "#f0a030"
      border-color: "#f0a030"

  microcopy-examples:
    - "Arek ⚔️ confirme"
    - "Lyra 🧝 hésite (comme toujours)"
    - "3/5 disponibles"
    - "Créneau FULL — 2 conflits"
```

### 7.2 DayCell (vue mensuelle)

Tuile représentant un jour dans la grille mensuelle. Divisée en 3 segments verticaux (Matin / Après-midi / Soir).

```yaml
DayCell:
  size:
    min-width:    "48px"
    min-height:   "64px"
    mobile:       "40px × 56px"   # compact
  border-radius:  "var(--radius-card)"   # 10px
  background:     "var(--surface-bg)"
  elevation:      "var(--elevation-card)"
  padding:        "var(--space-xs)"      # 4px

  header:
    font-size:    "var(--text-sm)"
    color:        "var(--text-muted)"
    text-align:   center

  segments:
    count:        3               # Matin | Après-midi | Soir
    layout:       "flex column"
    gap:          "2px"
    height-each:  "calc((100% - header) / 3)"

    segment-colors:
      AVAILABLE:   "var(--accent-1)"       # bande colorée pleine à 40% opacité + point accent
      UNAVAILABLE: "#e05252"
      UNKNOWN:     "#3a3a4a"               # fond + tiret gris
      MIXED:       "#f0a030"

  states:
    today:
      border: "1px solid var(--accent-1)"
    selected:
      outline: "2px solid var(--accent-2)"
      outline-offset: "2px"
    past:
      opacity: 0.45
```

### 7.3 WeekCell (vue hebdomadaire)

Ligne représentant un créneau horaire dans la grille semaine.

```yaml
WeekCell:
  layout:       "grid 7 colonnes égales"
  row-height:   "36px"          # desktop ; 28px mobile
  font-size:    "var(--text-sm)"

  cell:
    border-radius:  "4px"
    margin:         "1px"
    transition:     "background 0.15s ease"

  fill-by-status:
    AVAILABLE:    "rgba(var(--accent-1-rgb), 0.35)"
    UNAVAILABLE:  "rgba(224, 82, 82, 0.35)"
    UNKNOWN:      "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(58,58,74,0.3) 3px, rgba(58,58,74,0.3) 6px)"
    MIXED:        "rgba(240, 160, 48, 0.35)"

  hover:
    brightness:   1.2
    cursor:       pointer
```

### 7.4 SlotPanel (desktop — colonne droite 40%)

Panel latéral affiché à droite du calendrier sur desktop (≥ 1024px). Affiche le détail d'un jour ou créneau sélectionné.

```yaml
SlotPanel:
  width:            "40%"
  min-width:        "320px"
  height:           "100vh"      # sticky, scroll interne
  background:       "var(--surface-bg)"
  border-left:      "1px solid var(--border-subtle)"
  border-radius:    "var(--radius-panel) 0 0 var(--radius-panel)"   # 12px côté gauche
  elevation:        "var(--elevation-panel)"
  padding:          "var(--space-lg)"   # 24px
  overflow-y:       auto

  header:
    font-size:      "var(--text-xl)"
    color:          "var(--accent-1)"
    margin-bottom:  "var(--space-base)"

  cta-zone:
    position:       sticky
    bottom:         0
    background:     "linear-gradient(to top, var(--surface-bg) 80%, transparent)"
    padding-top:    "var(--space-md)"
```

### 7.5 BottomSheet (mobile)

Équivalent mobile du SlotPanel. Remonte du bas de l'écran lors de la sélection d'un jour.

```yaml
BottomSheet:
  position:         fixed
  bottom:           0
  left:             0
  right:            0
  max-height:       "70vh"
  background:       "var(--surface-bg)"
  border-radius:    "var(--radius-panel) var(--radius-panel) 0 0"   # coins hauts arrondis
  elevation:        "var(--elevation-modal)"
  padding:          "var(--space-base) var(--space-base) var(--space-xl)"
  overflow-y:       auto

  handle:
    width:          "40px"
    height:         "4px"
    background:     "var(--text-muted)"
    border-radius:  "2px"
    margin:         "var(--space-sm) auto var(--space-base)"

  backdrop:
    background:     "var(--overlay)"
    position:       fixed
    inset:          0
    z-index:        below BottomSheet

  animation:
    enter:          "translateY(100%) → translateY(0), duration 250ms ease-out"
    leave:          "translateY(0) → translateY(100%), duration 200ms ease-in"
```

### 7.6 CalendarNav

Barre de navigation entre mois/semaines, en haut du calendrier.

```yaml
CalendarNav:
  layout:           "flex, space-between, align-center"
  padding:          "var(--space-sm) 0"
  border-bottom:    "1px solid var(--border-subtle)"
  margin-bottom:    "var(--space-base)"

  title:
    font-size:      "var(--text-lg)"
    font-weight:    600
    color:          "var(--text-primary)"

  buttons-prev-next:
    size:           "32px × 32px"
    border-radius:  "var(--radius-button)"
    background:     "rgba(255,255,255,0.05)"
    color:          "var(--accent-1)"
    border:         "1px solid var(--border-subtle)"
    hover-bg:       "rgba(var(--accent-1-rgb), 0.15)"

  view-toggle:
    # Switcher Mois / Semaine
    font-size:      "var(--text-sm)"
    active-color:   "var(--accent-2)"
    inactive-color: "var(--text-muted)"
```

### 7.7 CreneauCard

Carte représentant un créneau de jeu candidat (dans SlotPanel / BottomSheet).

```yaml
CreneauCard:
  background:       "var(--surface-bg)"
  border:           "1px solid var(--border-subtle)"
  border-radius:    "var(--radius-card)"    # 10px
  elevation:        "var(--elevation-card)"
  padding:          "var(--space-base)"
  margin-bottom:    "var(--space-sm)"

  date-label:
    font-size:      "var(--text-base)"
    font-weight:    600
    color:          "var(--accent-1)"

  slots-summary:
    font-size:      "var(--text-sm)"
    color:          "var(--text-muted)"

  player-badges:
    layout:         "flex, wrap, gap: var(--space-xs)"
    margin-top:     "var(--space-sm)"

  score-indicator:
    # Barre de score horizontal (nb joueurs dispo / total)
    height:         "4px"
    border-radius:  "2px"
    background:     "var(--status-unknown)"
    fill:           "var(--accent-1)"
    margin-top:     "var(--space-sm)"

  cta:
    # Bouton "Convoquer le conseil" ou "Lancer le vote"
    background:     "var(--gradient-cta)"
    color:          "#ffffff"
    font-weight:    600
    font-size:      "var(--text-base)"
    border-radius:  "var(--radius-button-cta)"   # 10px
    padding:        "10px var(--space-base)"
    border:         none
    width:          "100%"
    margin-top:     "var(--space-md)"
```

### 7.8 PollOption

Option de vote dans un sondage de créneau (interface joueur).

```yaml
PollOption:
  # Chaque option = un créneau candidat sur lequel le joueur vote
  layout:           "flex, align-center, space-between"
  background:       "var(--surface-bg)"
  border:           "1px solid var(--border-subtle)"
  border-radius:    "var(--radius-card)"
  padding:          "var(--space-sm) var(--space-base)"
  margin-bottom:    "var(--space-xs)"
  cursor:           pointer
  transition:       "border-color 0.15s, background 0.15s"

  states:
    default:
      border-color: "var(--border-subtle)"
    hover:
      border-color: "var(--accent-1)"
      background:   "rgba(var(--accent-1-rgb), 0.07)"
    selected-yes:
      border-color: "var(--accent-1)"
      background:   "rgba(var(--accent-1-rgb), 0.15)"
      icon-color:   "var(--accent-1)"
    selected-no:
      border-color: "#e05252"
      background:   "rgba(224, 82, 82, 0.1)"
      icon-color:   "#e05252"
    selected-maybe:
      border-color: "#f0a030"
      background:   "rgba(240, 160, 48, 0.1)"
      icon-color:   "#f0a030"

  date-label:
    font-size:      "var(--text-base)"
    font-weight:    500
    color:          "var(--text-primary)"

  vote-count:
    font-size:      "var(--text-sm)"
    color:          "var(--text-muted)"

  vote-buttons:
    # Trois boutons icône : Oui / Peut-être / Non
    size:           "28px × 28px"
    border-radius:  "50%"
    gap:            "var(--space-xs)"
```

---

## 8. Do's and Don'ts

### Do

1. **Alterner les couleurs d'accent sur les emphases** — dans une liste de badges joueurs ou de créneaux, utiliser `--accent-1` (impairs) et `--accent-2` (pairs) pour créer un rythme visuel sans surcharger.

2. **Utiliser `var(--status-*)` pour toutes les couleurs sémantiques** — ne jamais écrire `#7ec8a4` directement dans un composant de statut ; passer par le token `--status-available` qui pointe vers `--accent-1`, ce qui garantit la cohérence thème.

3. **Placer le bouton CTA dans une sticky zone** — sur mobile (BottomSheet) comme sur desktop (SlotPanel), le CTA "Convoquer le conseil" doit rester visible sans scroll, dans une zone avec gradient de fondu.

4. **Appliquer la microcopy JDR dès les empty states** — un calendrier sans créneau commun affiche toujours "Aucun créneau commun… la quête est difficile, héros", jamais un message générique.

5. **Garder les ornements Steampunk en CSS pur** — les coins de carte et doubles bordures sont produits par `::before`/`::after`. Ne jamais introduire de SVG ou d'image pour ces ornements, au risque de casser la maintenabilité IA.

6. **Respecter les niveaux d'élévation** — une carte (`--elevation-card`) ne doit pas contenir un enfant avec `--elevation-modal`. L'élévation croît vers l'avant-plan, elle ne se cumule pas.

### Don't

1. **Ne pas utiliser `--accent-1` pour signifier un état négatif** — `--accent-1` est réservé aux états positifs (AVAILABLE, succès, CTA). Les états négatifs utilisent toujours `#e05252` (`--status-unavailable`), même si une teinte verte serait "plus belle" dans un thème donné.

2. **Ne pas afficher de fond clair** — aucun composant ne doit avoir un fond blanc ou proche du blanc, même en hover ou focus. Les surfaces claires sont simulées par une opacité réduite de blanc sur `--surface-bg`.

3. **Ne pas hardcoder les couleurs hexadécimales dans les composants Angular** — toute couleur dans un template ou fichier `.scss` de composant doit passer par un token CSS (`var(--...)`). Les valeurs hex de ce document sont la source de vérité des tokens, pas des valeurs à copier-coller.

4. **Ne pas utiliser simultanément `--accent-1` et `--accent-2` sur un seul élément** — sauf pour le gradient CTA (`--gradient-cta`), les deux accents ne se mélangent jamais sur un même texte ou fond.
