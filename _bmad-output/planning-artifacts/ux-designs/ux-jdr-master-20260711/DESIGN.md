---
title: jdr-master Design System — Delta Sessions, rapports, événements/missions, annonces MJ (Palier 4)
status: final
updated: 2026-07-11
themes: [grimoire-emeraude, foret-ancienne, medieval-steampunk]
ui_system: Angular Material 22
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260711/prd.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260703/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
---

# jdr-master — Design System — Delta Sessions, rapports, événements/missions, annonces MJ (Palier 4)

**Ce document est un delta**, pas un nouveau système. Il hérite intégralement des 3 thèmes, tokens couleurs/typographie/spacing/radius/élévation de `ux-jdr-master-20260626/DESIGN.md`, du composant Avatar/Portrait (`ux-jdr-master-20260703`), et des patterns fiche/roster/édition MJ (`ux-jdr-master-20260708`) — **aucune nouvelle identité visuelle n'est introduite**. Ce document capture uniquement ce qui est *nouveau* pour ce palier : Scénario (cycle de vie, chronologie), Séances, rétrospective (comptes-rendus + résumé de fin), participation linéaire/épisodique, inscription à capacité limitée, annonces MJ.

En cas de conflit entre ce document et un mock (`mockups/`), **ce document gagne**.

---

## 1. Brand & Style

Identique à `ux-jdr-master-20260626/DESIGN.md` §1 (dark mode obligatoire, couleurs + typographie + formes géométriques uniquement, IA-friendly, switching de thème par classe CSS racine).

**Précision de ce delta** : c'est la première fois que le produit introduit un **cycle de vie d'objet avec anti-spoil** (`Brouillon` → `À venir` → `Courant` → `Passé`) — un statut qui ne se contente pas de changer l'apparence d'un composant (comme les badges de disponibilité hérités) mais qui **conditionne ce qui est rendu visible au joueur ou non**. Ce principe (« l'anti-spoil est un principe de rendu, pas une couleur ») est structurant pour tous les composants de ce delta et doit être respecté par toute extension future du produit qui introduirait du contenu à révéler progressivement.

---

## 2. Colors

Aucun nouveau token de couleur de base. Réutilise `{colors.accent-1}` (état `Courant` — emphase positive, cohérent avec son usage existant), `{colors.text-muted}` + `{colors.status-unknown}` (états `Brouillon`/`À venir` — un anti-spoil se traite visuellement comme un « inconnu », au même titre que `WeekCell`/`DayCell` UNKNOWN existants), `{colors.accent-2}` (actions/liens, ex. lien de scroll, tag « bibliothèque campagne »).

**Nouveau (delta) — usage sémantique de tokens déjà déclarés, aucune nouvelle valeur hex :**
- **Indicateur de remplissage** (inscription à capacité limitée, FR-19) : réutilise directement `{colors.status-unavailable}` (sous le minimum), `{colors.status-mixed}` (entre min et max), `{colors.status-available}` (maximum atteint) — exactement les 3 couleurs sémantiques déjà définies pour `AvailabilityBadge`/`WeekCell`. Validé avec l'utilisateur : « aucune nouvelle couleur, on réutilise ce qui existe déjà ».
- **Statut `Passé`** : `{colors.text-muted}` + `opacity: 0.55` sur la carte — cohérent avec `DayCell.states.past` (`opacity: 0.45`) déjà défini, légèrement moins atténué ici car le contenu (résumé, comptes-rendus) reste la destination principale de clic, pas un simple repère visuel secondaire comme une case de calendrier passée.
- **Statut `À venir`** : bordure en pointillés `{colors.status-unknown}` — réutilise directement le traitement `UNKNOWN` de `AvailabilityBadge` (`border-style: dashed`), cohérent sémantiquement : un scénario à venir est, du point de vue du joueur, une inconnue au même titre qu'une disponibilité non déclarée.
- **Statut `Brouillon`** : même traitement pointillé que `À venir` mais **jamais rendu au joueur** (cf. §7 ScenarioStatusBadge) — la couleur ne le distingue pas d'`À venir` pour un lecteur MJ, seule la visibilité (rendu ou non) fait la différence.

---

## 3. Typography

Aucun nouveau rôle. Réutilise `{typography.text-lg}` pour les titres de scénario (cohérent avec les titres de carte existants), `{typography.text-sm}` pour les dates/métadonnées de timeline et labels de documents, `{typography.text-base}` pour la description et les résumés.

---

## 4. Layout & Spacing

Aucun nouveau token d'espacement. Une nouvelle composition structurelle :

### ScenarioTimeline — responsive, orientation qui change avec le viewport

**Desktop (≥ `{spacing.bp-tablet}`, 768px)** : timeline **horizontale**, défilement propre au composant (`overflow-x: auto`), jamais la page. Molette verticale convertie en défilement horizontal ; glisser-déposer à la souris additionnellement supporté ; fondus visuels aux deux bords signalant qu'il y a du contenu à défiler, sans dépendre d'un texte d'aide seul. Chaque nœud a un en-tête (date + point) de **hauteur fixe** (40px) positionné indépendamment de la carte — la carte peut varier en hauteur (titre long, plusieurs scénarios `Courant` empilés en épisodique) sans jamais désaligner le point sur la ligne. *(Corrige un bug constaté en Discovery : positionner le point par rapport à la carte — hauteur variable — désalignait la ligne dès qu'un titre passait sur deux lignes.)*

**Mobile/petit écran (< 768px)** : bascule sur une timeline **verticale**, page qui défile normalement (aucun scroll interne à chercher). Ligne à gauche (`left: 9px` du conteneur), point par nœud, carte à droite — pattern indépendant du mode desktop (implémentations distinctes, pas une réorientation CSS d'une même grille, pour éviter tout risque de désalignement croisé entre les deux modes).

**Mode épisodique (plusieurs scénarios `Courant` en parallèle)** : les cartes correspondantes s'empilent **verticalement au même point de la ligne** (même position temporelle), jamais une deuxième ligne parallèle — reste lisible jusqu'à 2-3 scénarios ouverts simultanément.

Gutter identique au reste de l'app.

Référence visuelle : `mockups/timeline-A-responsive-20260711.html` (les deux orientations, redimensionnable en direct pour vérifier le seuil 768px, molette/glisser-déposer fonctionnels).

---

## 5. Elevation & Depth

Aucun nouveau niveau. Les cartes de scénario `Courant` réutilisent `{elevation.card}` avec une bordure `{colors.accent-1}` en plus (emphase) ; les cartes `Passé`/`À venir`/`Brouillon` n'ont pas d'élévation propre (visuellement en retrait, cohérent avec leur statut moins actif).

---

## 6. Shapes

Aucun nouveau rayon. `ScenarioCard` et `DocumentRow` réutilisent `{rounded.radius-card}` comme toute carte standard ; les badges de statut réutilisent `{rounded.radius-badge}` (`AvailabilityBadge`).

---

## 7. Components

### ScenarioStatusBadge (nouveau)

```yaml
ScenarioStatusBadge:
  base:
    font-size:      "{typography.text-sm}"  # 11-12px, uppercase, letter-spacing léger
    padding:        "2px 7px"
    border-radius:  "{rounded.radius-badge}"
    border-width:   "1px"

  states:
    BROUILLON:
      # JAMAIS rendu à un joueur, quel que soit le contexte — MJ uniquement (vue dédiée, cf. EXPERIENCE.md §2)
      color:        "{colors.text-muted}"
      border-color: "{colors.border-subtle}"
      border-style: dashed
      background:   transparent

    A_VENIR:
      color:        "#9a9aaa"
      border-color: "{colors.status-unknown}"
      border-style: dashed
      background:   "rgba(58,58,74,0.35)"

    COURANT:
      color:        "{colors.accent-1}"
      border-color: "{colors.accent-1}"
      background:   "rgba({colors.accent-1-rgb}, 0.15)"

    PASSE:
      color:        "{colors.text-muted}"
      border-color: "{colors.border-subtle}"
      background:   "rgba(255,255,255,0.03)"
```

### ScenarioTimeline (nouveau)

```yaml
ScenarioTimeline:
  desktop:  # ≥ {spacing.bp-tablet}
    orientation:    horizontal
    scroll:         "overflow-x: auto sur son propre conteneur ; molette verticale convertie en scrollLeft ; glisser-déposer souris ; fondus {spacing.xl}-large aux deux bords"
    node-head:
      height:       "40px fixe, indépendant de la hauteur de carte"
      date:         "position absolue, top:0, centré"
      dot:          "position absolue, bottom:0, centré, 12px"
    line:
      position:     "top: 34px (centre du point), toute la largeur de la piste"
    node-width:     "200px"
    parallel-nodes:
      # plusieurs scénarios Courant simultanés (épisodique)
      layout:       "cartes empilées verticalement au même point de la ligne"

  mobile:  # < {spacing.bp-tablet}
    orientation:    vertical
    scroll:         "aucun scroll interne — page normale"
    line:
      position:     "left: 9px, verticale, toute la hauteur de la piste"
    dot:
      position:     "left: -28px (dans le gouttière), 12px"

  card:
    reuses:         "{components.ScenarioCard}, densité réduite (titre + badge de statut uniquement, pas de description/documents)"
```

### FillIndicator (nouveau — inscription à capacité limitée, FR-19)

```yaml
FillIndicator:
  track:
    height:         "8px"
    border-radius:  "4px"
    background:     "{colors.status-unknown}"
  fill:
    sous-min:       "{colors.status-unavailable}"
    entre-min-max:  "{colors.status-mixed}"
    au-max:         "{colors.status-available}"
  label:
    format:         "[nb inscrits] / [max] inscrits (min. [min])"
    font-size:      "{typography.text-sm}"
  # Réutilise à l'identique les 3 couleurs sémantiques déjà définies (AvailabilityBadge/WeekCell) —
  # aucune nouvelle valeur, validé explicitement avec l'utilisateur en Discovery.
  # Rappel comportemental (cf. EXPERIENCE.md §4) : cet indicateur n'est JAMAIS une barre de progression
  # qui se remplit vers une action automatique — la validation de la date reste une décision MJ manuelle
  # à tout niveau de remplissage.
```

### ScenarioCard / ScenarioDetail (nouveau)

```yaml
ScenarioCard:
  # utilisé en fiche détail (Courant/Passé) — cf. EXPERIENCE.md §4 pour la composition complète
  sections:
    - header:        "titre + {components.ScenarioStatusBadge} + FieldEditPencil (MJ, si applicable)"
    - description:    "texte libre, {typography.text-base}"
    - documents:      "liste de {components.DocumentRow}, groupés en deux blocs : documents du scénario / bibliothèque de campagne (cf. §4 ci-dessous)"
    - participants:
        reuses:       "{components.CharacterSummaryCard} (existant, ux-jdr-master-20260703) — jamais un badge nom-seul : le composant expose déjà avatar + nom du PERSONNAGE + classe + pseudo du JOUEUR, cliquable"
        # Décision explicite (Discovery) : un simple badge "Arek ⚔️" est ambigu (joueur ou personnage ?)
        # — CharacterSummaryCard existant résout déjà ce problème, pas de nouveau composant à inventer.
    - seance:
        lineaire:     "réutilise {components.PollOption} (vote de date existant, Epics 1-3), sans changement"
        episodique:   "{components.FillIndicator} + 2 CTA MJ : 'Proposer une autre date' (secondaire) / 'Valider cette date' (CTA gradient) — jamais de validation automatique"
    - actions-mj:
        courant:      "'Clôturer le scénario' (CTA gradient en linéaire ; bordure rouge discrète 'btn-danger-outline' en épisodique — action moins fréquente/plus définitive quand plusieurs enquêtes tournent en parallèle)"

DocumentRow:
  layout:           "flex, icône + nom + poids"
  icon:
    size:           "28px"
    background:     "{colors.surface-bg-2}"
    border-radius:  "{rounded.radius-badge}"
  library-tag:
    # visible uniquement sur un document de la bibliothèque de Partie/campagne (jamais anti-spoil, toujours visible)
    text:           "bibliothèque campagne"
    style:          "texte {colors.accent-2}, bordure 1px {colors.accent-2}, {rounded.radius-badge}"
```

### RetrospectivePanel (nouveau — clôture de scénario, FR-15/16)

```yaml
RetrospectivePanel:
  sections:
    - resume-fin:
        reuses:       "FieldEditPencil (MJ, édition possible après clôture, cf. ux-jdr-master-20260708 §7)"
        content:      "texte libre riche (événements marquants, coups d'éclat)"
    - comptes-rendus:
        layout:       "liste, une entrée par séance, bordure gauche 2px {colors.border-subtle}"
        date-label:   "{typography.text-sm} {colors.text-muted}"
    - journal-associe:
        toggle:
          label:      "Association automatique"
          reuses:     "{components.NotesJournal}.share-toggle (switch, ux-jdr-master-20260708 §7), même registre visuel"
          states:
            actif:    "toute entrée déjà partagée (shared:true), datée dans la fenêtre du scénario, apparaît sans action manuelle"
            inactif:  "case à cocher par entrée, sélection manuelle explicite (défaut)"
        entry-row:
          reuses:     "{components.NotesJournal}.entry, densité réduite (pas de re-toggle de partage ici, seulement l'association à la rétrospective)"
    - annonces-liees:
        reuses:       "{components.AnnonceCard} (cf. ci-dessous), filtré au scope du scénario"
```

### AnnonceCard (nouveau — FR-20)

```yaml
AnnonceCard:
  background:       "{colors.surface-bg-2}"
  border:           "1px solid {colors.border-subtle}"
  border-radius:    "{rounded.radius-card}"
  padding:          "{spacing.sm} {spacing.md}"
  scope-label:
    # "Toute la campagne" / "Ce one-shot" / "Ce scénario" — toujours affiché, jamais implicite
    color:          "{colors.accent-2}"
    font-size:      "{typography.text-sm}"
    text-transform: uppercase
  date-label:       "{typography.text-sm} {colors.text-muted}"
```

---

## 8. Do's and Don'ts

- **Do** garder l'en-tête de nœud de `ScenarioTimeline` à hauteur fixe, indépendamment du contenu de la carte — c'est la garantie structurelle contre le désalignement point/ligne constaté en Discovery.
- **Do** traiter l'anti-spoil comme une question de **rendu conditionnel systématique** (jamais un simple `display:none` CSS après coup) pour un scénario `Brouillon`/le contenu masqué d'un `À venir` — la donnée existe toujours dans la réponse API (décision produit 2026-07-12, AD-6), c'est le composant Angular qui ne doit jamais la laisser transiter vers l'affichage — cf. EXPERIENCE.md §7.
- **Do** afficher systématiquement le libellé de portée d'une annonce (`AnnonceCard.scope-label`) — jamais une annonce sans contexte de diffusion visible.
- **Don't** utiliser `{colors.status-available}` (vert) pour suggérer qu'une date de séance épisodique est automatiquement validée — le vert de `FillIndicator` signale seulement « quota atteint », jamais « c'est décidé » (cf. EXPERIENCE.md §5, State Patterns).
- **Don't** réinventer un composant participant — `CharacterSummaryCard` existe déjà et couvre exactement le besoin (nom personnage + classe + pseudo joueur), ne pas repartir sur un badge texte simple.
- **Don't** afficher un scénario `Brouillon` où que ce soit dans une vue joueur, même par erreur de filtre — `Brouillon` et le contenu masqué d'un `À venir` reçoivent la **même** protection : un rendu conditionnel côté Angular, jamais un filtrage serveur (décision produit 2026-07-12, cf. architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md AD-6). Une erreur de filtre frontend expose la donnée pour les deux statuts de la même façon — il n'y a pas de barrière « totale » côté serveur à laquelle se fier pour `Brouillon`.
