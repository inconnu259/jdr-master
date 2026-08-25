---
title: jdr-master Design System — Delta Ryuutama (Palier P3)
status: final
updated: 2026-07-03
themes: [grimoire-emeraude, foret-ancienne, medieval-steampunk]
ui_system: Angular Material 22
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260703/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-20260703/addendum.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-06-27/ARCHITECTURE-SPINE.md"
---

# jdr-master — Design System — Delta Ryuutama (création & fiche de personnage)

**Ce document est un delta**, pas un nouveau système. Il hérite intégralement des 3 thèmes, tokens couleurs/typographie/spacing/radius/élévation et principes visuels de `ux-jdr-master-20260626/DESIGN.md` — **aucune nouvelle identité visuelle n'est introduite**. Ce document capture uniquement ce qui est *nouveau* pour la création/consultation de personnage Ryuutama : un composant Avatar/Portrait, et l'habillage visuel de l'assistant de création et de la fiche.

En cas de conflit entre ce document et un mock (`.working/`), **ce document gagne**.

---

## 1. Brand & Style

Identique à `ux-jdr-master-20260626/DESIGN.md` §1 (dark mode obligatoire, pas d'assets bitmap sauf exception explicite ci-dessous, IA-friendly, mobile-first joueur / desktop-first MJ, switching de thème par classe CSS racine).

**Exception explicite** : le portrait de personnage (composant Avatar, §7) est la **première image bitmap/utilisateur** du produit — jusqu'ici le principe "aucune image, tout en CSS/SVG" était total. Cette exception est scopée strictement au portrait ; elle ne remet pas en cause le principe pour le reste de l'app.

---

## 2. Colors

Aucun nouveau token de couleur. Réutilise tel quel, pour les 3 thèmes : `{colors.accent-1}` / `{colors.accent-2}` (emphase alternée impaire/paire dans les listes de choix de l'assistant), `{colors.surface-bg}` (cartes/panels), `{colors.status-available}` / `{colors.status-unavailable}` (aucun usage direct prévu ce palier — pas de statut de santé/blessure dans le scope P3).

**Nouveau (delta) :** couleur de bordure du cadre Portrait — `{colors.border-subtle}` en état neutre, `{colors.accent-2}` au survol/focus de l'action "Modifier le portrait" (lien texte, pas de nouveau token).

---

## 3. Typography

Aucun nouveau rôle typographique. Réutilise `{typography.text-lg}` pour le nom du personnage, `{typography.text-sm}` pour les labels de stats dérivées (badges PV/PE/Initiative), `{typography.text-2xl}` pour le titre de la fiche.

---

## 4. Layout & Spacing

Aucun nouveau token d'espacement. Le seul ajout structurel est le **layout à colonne latérale de l'assistant desktop** (§7 Components — WizardLayout) : 65% contenu principal / 35% panneau résumé, au lieu du 60/40 du split calendrier MJ existant (proportions légèrement resserrées car le panneau résumé de personnage est plus dense en petits badges que le panneau de résultats du calendrier).

---

## 5. Elevation & Depth

Aucun nouveau niveau d'élévation. Le panneau résumé de l'assistant (WizardSummaryPanel) réutilise `{components.SlotPanel}` tel quel (`--elevation-panel`). Le panneau Portrait complet sur la fiche réutilise l'élévation carte standard (`--elevation-card`).

---

## 6. Shapes

Aucun nouveau rayon. Le cadre du portrait complet (rectangulaire) utilise `{rounded.radius-card}` (10px). Le rond avatar est un cercle parfait (`border-radius: 50%`), pas un token de la échelle existante — cas particulier documenté ici plutôt qu'ajouté à l'échelle de coins.

---

## 7. Components

### Avatar (nouveau)

Cercle 44px (contexte liste/carte) ou 64px (en-tête de fiche). Deux états :
- **Sans portrait** : initiales du personnage (2 lettres, majuscules), fond `{colors.surface-bg}`, texte `{colors.text-primary}`, `{typography.text-lg}` — identique au pattern d'avatar générique déjà utilisé ailleurs dans l'app (menu utilisateur).
- **Avec portrait** : image recadrée/zoomée/repositionnée par l'utilisateur pour centrer le visage, `object-fit: cover`, bordure 1px `{colors.border-subtle}`.

Action "Modifier le portrait" : lien texte `{colors.accent-2}`, `{typography.text-sm}`, positionné à proximité immédiate de l'avatar (jamais superposé dessus).

### PortraitPanel (nouveau)

Carte (`{rounded.radius-card}`, `{elevation.elevation-card}`) affichant l'image complète **non recadrée** du portrait (ratio portrait, plus haute que large), avec légende `{typography.text-sm}` `{colors.text-muted}` ("Portrait complet"). N'apparaît que si un portrait existe — pas de placeholder vide pour cet emplacement (contrairement à l'Avatar qui a toujours un état initiales par défaut).

### WizardLayout (nouveau, desktop ≥1024px)

Réutilise `{components.SlotPanel}` (panneau latéral droit) pour le résumé de fiche en construction, avec la proportion 65/35 (§4). Zone principale = une étape à la fois (`{components.CalendarNav}` réutilisé comme barre de progression : titre = nom de l'étape courante, boutons prev/next 32×32px de part et d'autre, complété par une barre de progression fine sous le titre — segments `{colors.accent-1}` pour les étapes complétées).

### WizardLayout (mobile <768px)

Une étape par écran, pas de panneau latéral. Barre de progression identique en principe (titre = nom de l'étape, ex. "Étape 3/8 · Attributs") mais sans les boutons flèches ronds du desktop — navigation via une barre inférieure fixe (`Précédent` / `Suivant`, boutons pleine largeur partagée, ≥44px de hauteur).

### ChoiceCard (réutilise `{components.PollOption}`)

Grille de cartes cliquables pour les choix de classe/type/arme favorite. États : default / hover / selected (bordure `{colors.accent-2}` + fond légèrement teinté). Aucune modification par rapport à `PollOption` — simple renommage contextuel dans ce document.

### CharacterSummaryCard (réutilise `{components.CreneauCard}`)

Carte de personnage dans l'onglet Personnages (liste) : avatar + nom + classe + badges de stats dérivées (réutilise `{components.AvailabilityBadge}` pour les pills PV/PE/Initiative/Encombrement) + barre de score fine réinterprétée comme barre de Condition (VIG+ESP) plutôt que score de créneau.

---

## 8. Do's and Don'ts

- **Do** garder le portrait strictement optionnel — l'avatar aux initiales doit rester visuellement complet et non "cassé" en son absence.
- **Do** utiliser `object-fit: cover` + bordure subtile pour tout portrait recadré, jamais de déformation (`object-fit: fill`).
- **Don't** dupliquer les tokens de couleur/typo déjà définis dans le spine hérité — toute nouvelle valeur numérique doit être justifiée ici avant d'être utilisée.
- **Don't** introduire de deuxième image bitmap dans le produit sans repasser par ce document — l'exception §1 est strictement scopée au portrait de personnage.
