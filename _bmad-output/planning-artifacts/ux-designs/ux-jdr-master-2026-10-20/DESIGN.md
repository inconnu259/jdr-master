---
title: "jdr-master Design System — Delta Palier 10.4 Sondage et Destinée dans le calendrier"
status: final
created: 2026-10-20
updated: 2026-10-20
themes: [grimoire-emeraude, foret-ancienne, atelier-cuivre]
ui_system: Angular Material 22
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-08/DESIGN.md"
sources:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-10-19-p10-4/prd.md
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-10-19-p10-4/addendum.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/contrat-ui-calendrier.html
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-20/.memlog.md
# Aucun token de thème ajouté. Tokens component-scoped, qui référencent les tokens existants.
# Valeurs de la planche mockups/proposition-tiroir-destinee-mobile.html ; les spines l'emportent sur elle.
components:
  destiny-sheet:                       # plateau de la destinée, mobile < 768 px (⚠️ §7.1)
    placement: "bas de l'écran, pleine largeur, au-dessus de la grille"
    backgroundColor: "{colors.surface-container-high}"
    rounded: "18px 18px 0 0"
    shadow: "0 -6px 24px rgba(0,0,0,.5)"
    grabber: "40 × 4 px, {colors.outline}, rayon 2 px"
    padding: "8px 14px 14px"
    heightCollapsed: "≈ 120 px (résumé + deux boutons)"
    heightExpanded: "jusqu'à 150 px sous le haut de l'écran ; défilement interne"
    scrim: none                        # non modal : la grille reste utilisable
  destiny-list-sheet:                  # liste des destinées, mobile < 1024 px (⚠️ §7.2)
    inherits: "display-surface--sheet du panneau « Affichage » (P9)"
    scrim: "rgba(0,0,0,.45)"           # modal
    rounded: "18px 18px 0 0"
  destiny-list-menu:                   # liste des destinées, ≥ 1024 px
    inherits: "menu ancré du panneau « Affichage » (overlay CDK)"
  destiny-board:                       # plateau de la destinée, ≥ 768 px (⚠️ §7.1)
    placement: "colonne de droite ; remplace son contenu tant que la Destinée est active"
    widthPartie: "flex 0 0 40 %, min 280 px (colonne MJ existante)"
    widthPersonal: "340 px, min 260 px (colonne joueur / groupe existante)"
    sticky: "top 16 px, max-height 100vh − 48 px, défilement interne"
  destiny-line:                        # ligne de la liste des destinées
    backgroundColor: "{colors.surface-container-highest}"
    rounded: 10px
    padding: "9px 10px"
    groupHeading: "11,5 px, capitales, espacement .04em, {colors.text-muted}"
  candidate-slot-row:                  # créneau candidat dans le plateau
    backgroundColor: "{colors.surface-container-highest}"
    rounded: 10px
    padding: "8px 10px"
    yesBar: "4 px, fond #3a3150, remplissage {colors.status-todo} proportionnel aux oui sur la troupe"
    current: "contour 2 px {colors.accent-1}"
    bestTag: "10,5 px, {colors.accent-1}, texte « meilleur »"
  state-tag:                           # pastille d'état dans la liste des destinées
    rounded: 999px
    typography: "11px"
    padding: "2px 8px"
    todo: "{colors.status-todo} à 18 % de fond, bordure à 50 %"
    answered: "{colors.accent-1} à 15 % de fond, bordure à 45 %"
    organizer: "{colors.accent-2} à 18 % de fond, bordure à 50 %"
    notVoter: "{colors.text-muted}, contour {colors.outline}"
  automate-list-header:                # en-tête repliable des fenêtres de l'automate (⚠️ §7.3)
    kind: "bouton pleine largeur, libellé + compteur + chevron, aria-expanded"
    minHeight: 44px
  automate-card-selected:              # fenêtre de l'automate sélectionnée (⚠️ §7.3)
    border: "2px solid {colors.accent-1}"
    actions: "« Ajouter au vote » bouton plein ; « Masquer » bouton texte"
  automate-card-masked:
    opacity: .55
    action: "« Démasquer » bouton texte"
  propose-dates-action:                # bouton « Proposer des dates » (⚠️ §7.4)
    kind: "mat-stroked-button écrit, ligne .calendar-controls, à la place de l'armement du composer"
    minHeight: 36px
  mode-switch-explained:               # bascule de mode sur deux lignes (⚠️ §7.6)
    inherits: "mode-switch (P10 §7.2), mat-button-toggle-group"
    line1: "nom du thème, 14 px / 500"
    line2: "ligne en clair, 12 px, {colors.text-muted}"
    minHeight: 56px
  nature-option-hint:                  # ligne d'explication sous une nature (§7.6)
    typography: "12px, {colors.text-muted}"
    marginTop: 2px
  rendezvous-picker:                   # choix du rendez-vous à dater (§7.5)
    mobile: "tiroir modal, même patron que destiny-list-sheet"
    desktop: "fenêtre « Votre accord » existante (ConfirmDialog), liste en boutons radio"
---

# jdr-master — Design System — Delta Palier 10.4

**Ce document est un delta** du delta Palier 10 (`ux-jdr-master-2026-10-08/DESIGN.md`), lui-même héritier du delta Palier 9 qui porte le contrat du calendrier. Il n'ajoute **aucun token de thème** : palette, typographie et trois thèmes sont inchangés. Il fixe l'apparence de quatre surfaces neuves (tiroir et plateau de la destinée, liste des destinées, choix du rendez-vous) et de trois retouches d'écrans validés, signalées ⚠️.

En cas de conflit entre ce document et une planche de `mockups/`, **ce document gagne**.

---

## 1. Brand & Style

Inchangé. Le calendrier reste l'outil le plus « fonctionnel » de l'application : les nouvelles surfaces reprennent les patrons qu'il a déjà (tiroir du panneau « Affichage », colonne de droite, fenêtre « Votre accord ») plutôt que d'en inventer.

## 2. Colors

Aucune couleur nouvelle.

- Les créneaux candidats gardent le marquage du vote : fond `{colors.status-todo}` à 16 % et liseré gauche de 3 px (`{components.CalendarCell}`, P9 §7.9).
- La barre de oui du plateau utilise `{colors.status-todo}` ; le créneau courant, `{colors.accent-1}` ; « Organisateur », `{colors.accent-2}`.
- L'estompe de la Destinée reste à `opacity .28`, au jour (Story 36.9). La sélection d'une fenêtre de l'automate réutilise exactement cette estompe (§7.3).
- Aucune information n'est portée par la seule couleur : chaque pastille a son texte, le meilleur créneau son mot « meilleur », le créneau courant son rang « n / N ».

## 3. Typography

Inchangée. Titres de tiroir 15 px / 600 ; sous-titres 12 px `{colors.text-muted}` ; en-têtes de groupe 11,5 px en capitales.

## 4. Layout & Spacing

- **Deux seuils, déjà dans le code** : 768 px pour la mise en page en deux colonnes, 1024 px pour la bascule menu / tiroir du panneau « Affichage ». Le plateau suit **768 px** (c'est une colonne) ; la liste des destinées et le choix du rendez-vous suivent **1024 px** (ce sont des menus). `[ASSUMPTION]`
- **Calendrier personnel ≥ 768 px** : il n'a pas de colonne de droite aujourd'hui. Elle apparaît, en largeur « joueur / groupe » (340 px), **seulement quand la Destinée est active**, et disparaît avec elle. `[ASSUMPTION]`
- **Mobile < 768 px** : la colonne de droite reste empilée sous la grille pour son contenu habituel ; seul le plateau de la destinée passe en tiroir du bas.

## 5. Elevation & Depth

- Le tiroir de la destinée flotte au-dessus de la grille (ombre vers le haut), **sans fond assombri** : la grille reste lisible et touchable.
- La liste des destinées et le choix du rendez-vous sont **modaux** : fond assombri `rgba(0,0,0,.45)`, comme le panneau « Affichage ».

## 6. Shapes

Tiroirs : coins supérieurs 18 px, poignée 40 × 4 px. Lignes et créneaux : 10 px. Pastilles : 999 px.

## 7. Components

### 7.1 ⚠️ DestinySheet / DestinyBoard — le plateau de la destinée

Une seule surface, deux formes : **tiroir** sous 768 px, **colonne de droite** au-delà. Planche : [`mockups/proposition-tiroir-destinee-mobile.html`](mockups/proposition-tiroir-destinee-mobile.html), écrans ② et ③.

- **Replié (mobile, ≈ 120 px)** : nom du vote ; ligne « n / N · date · moment · x oui · échéance » ; pastille d'état ; deux boutons : « Voir les N dates » (déplie) et l'action principale du rôle (« Fixer la date… » pour l'organisateur, rien pour un votant, qui répond sur la grille).
- **Déplié / colonne** : titre, sous-titre (échéance, « plus de vote possible » après l'échéance, « x réponses sur N »), liste de `candidate-slot-row`, ligne « N'ont pas … » (clé existante `poll.missing_prefix`), puis les actions de l'organisateur : « Modifier les dates » (contour) et « Fixer la date… » (plein, `{colors.gradient-cta}`) ; en mode soirée, « Prolonger le vote » s'ajoute.
- Remplace, tant que la Destinée est active, le contenu de la colonne MJ (bloc « qui manque », Du / Au, fenêtres de l'automate).

### 7.2 ⚠️ DestinyList — la liste des destinées

Ouverte par la puce ✦. Planche : écran ①. Tiroir modal sous 1024 px, menu ancré au-delà.

- En-têtes de groupe = **nom de la partie ou du ralliement**, jamais un mot générique.
- `destiny-line` : nom du vote, ligne « Échéance … · N créneaux » (« Échéance passée » le cas échéant), `state-tag` à droite.
- La puce ✦ garde son libellé « ✦ Destinée » au repos et « ✦ Destinée · {nom du vote} » une fois active (36.9) ; elle **ouvre la liste** au lieu de basculer le mode. Quitter le mode passe par une ligne « Quitter la Destinée » en tête de liste quand une destinée est active. `[ASSUMPTION]`

### 7.3 ⚠️ AutomateList — les fenêtres de l'automate

Planche : [`mockups/proposition-colonne-mj-ephemerides.html`](mockups/proposition-colonne-mj-ephemerides.html) (fenêtre sélectionnée ; composer en cours).

- **En-tête repliable** (`automate-list-header`) : « {libellé du thème} · N », chevron. Replié par défaut à la première visite `[ASSUMPTION]`. Les champs Du / Au et « Scruter » vivent **sous** l'en-tête, visibles seulement déplié.
- **Carte sélectionnée** (`automate-card-selected`) : contour `{colors.accent-1}` 2 px ; deux actions écrites. Dans la grille, la bande de la fenêtre prend le même contour, et **tous les autres jours** prennent l'estompe de la Destinée (.28).
- **Carte dans le composer** : elle quitte la liste (PRD FR-2) ; la bande prend le liseré orange tireté « désigné pour le vote » existant (36.10).
- **Fenêtres masquées** : un lien « Afficher les N masquées » en pied de liste ; une carte masquée, à 55 % d'opacité, porte « Démasquer ».

### 7.4 ⚠️ ProposeDatesAction — le bouton « Proposer des dates »

Bouton écrit, contour, dans la ligne `.calendar-controls`, à la place du bouton d'armement du composer (« Inscrire des dates » MJ) et des boutons « Composer les créneaux : {titre} » de l'hôte. Il devient « Modifier les dates » quand la destinée active est un sondage dont on est organisateur. Absent s'il n'y a rien à proposer ni à modifier.

### 7.5 RendezvousPicker — le choix du rendez-vous à dater

Liste groupée par partie (même rendu que `destiny-line`, sans pastille), une ligne par rendez-vous : nom du rendez-vous et, dessous, sa nature (« séance sans date », « soirée sans date »…). Sur ordinateur : la fenêtre « Votre accord » en boutons radio, comme `ComposeConfirmDialog` aujourd'hui. Aucun écran si un seul rendez-vous est possible.

### 7.6 ⚠️ ModeSwitch et nature expliqués — le formulaire de création

La bascule Quête | Ralliement (et ses variantes) passe sur deux lignes : le nom du thème, puis la ligne en clair (« Jeu de rôle », « Soirée entre amis ») en `{colors.text-muted}`. La hauteur minimale passe de 44 à 56 px. Chaque option de nature porte sa ligne d'explication en dessous, même style. Textes : `EXPERIENCE.md` §2.7.

### 7.7 Réutilisés tels quels

`{components.CalendarCell}`, `{components.DetailRail}` (jamais estompé), `app-compose-bar` (cible, compte, Valider / Annuler), la barre de sélection des dispos (36.3, portée Journée · Matin · Après-m. · Soir), `DateFixDialog` (40.6), `ExtendVoteDialog` (40.7), `SealConfirmDialog` (36.12), le sélecteur de réponse de vote.

## 8. Do's and Don'ts

- **Do** garder la grille visible quand le plateau est replié : c'est tout l'intérêt du tiroir.
- **Do** réutiliser l'estompe de la Destinée pour mettre en avant une fenêtre de l'automate : un seul langage visuel pour « regarde ceci ».
- **Don't** estomper le rail de détail, ni retirer les pointeurs ou l'accessibilité d'un jour estompé (36.9).
- **Don't** écrire « partie » ou un mot du JDR dans une surface que le mode soirée affiche ; nommer par le nom propre.
- **Don't** ajouter une couleur pour « meilleur créneau » : le mot suffit.
