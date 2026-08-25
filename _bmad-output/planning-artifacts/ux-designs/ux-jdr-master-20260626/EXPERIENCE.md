---
title: jdr-master Experience Spec — Palier 2 Calendrier
status: final
updated: 2026-06-27
design_ref: DESIGN.md
---

# jdr-master — Experience Specification

Palier 2 : Calendrier de disponibilités. Ce fichier décrit le comportement, les flux et les règles d'expérience utilisateur. Les tokens visuels (couleurs, typographie, espacements, composants) sont définis dans `DESIGN.md` — ce fichier les référence sans les dupliquer.

---

## 1. Foundation

### Form-factors

| Contexte | Form-factor | Résolution cible | Orientation |
|----------|-------------|-----------------|-------------|
| Joueur mobile | Smartphone | 360–430 px largeur | Portrait (prioritaire) + paysage |
| MJ desktop | Desktop / laptop | 1280 px+ | Paysage |
| Joueur tablette | Tablette | 768–1024 px | Portrait ou paysage |

La conception est **mobile-first pour les joueurs** (déclaration de contraintes, réponse au vote) et **desktop-first pour le MJ** (vue analytique "Trouver une date", split-layout).

### UI System

Angular Material 22 dans sa configuration dark-mode uniquement. Tokens sémantiques et composants référencés dans `{DESIGN.md}`. Aucune valeur hex n'est définie ici — toutes les couleurs sont des références de token (`{colors.accent-1}`, `{colors.surface-2}`, etc.).

### Breakpoints

| Nom | Largeur | Comportement clé |
|-----|---------|-----------------|
| `mobile` | < 768 px | Bottom-sheet, calendrier scrollable horizontal, panel résultats = écran séparé |
| `desktop` | ≥ 768 px | Panel droit sticky, popup = panel latéral 320 px, split layout MJ 60/40 |

Le breakpoint principal est **768 px**. Un seul breakpoint suffit pour le palier 2.

### Rôles utilisateurs

**Joueur**
- Déclare ses contraintes de disponibilité (calendrier personnel).
- Répond aux votes de date lancés par le MJ.
- Voit le badge "vote en attente" sur son dashboard.
- Accès mobile en priorité, mais l'expérience desktop doit être fonctionnelle.

**MJ (Game Master / Maître du Jeu)**
- Consulte les créneaux calculés pour la partie (vue "Trouver une date").
- Lance un vote de date.
- Consulte le widget "prochaine date" sur la page détail de la partie.
- Déclare également ses propres contraintes (il est aussi un participant).
- Accès principalement desktop.

---

## 2. Information Architecture

### Les 5 surfaces

| # | Surface | Rôle principal | Accès |
|---|---------|----------------|-------|
| 1 | **Calendrier personnel** | Déclarer ses contraintes de disponibilité | Joueur + MJ |
| 2 | **Vue MJ "Trouver une date"** | Voir les créneaux calculés, choisir un créneau | MJ uniquement |
| 3 | **Vote** | Lancer (MJ) et répondre (joueurs) à un vote de date | MJ + joueurs |
| 4 | **Dashboard joueur** | Vue d'ensemble + badge si vote en attente | Joueur |
| 5 | **Widget page détail partie** | Affiche la prochaine date + accès rapide "Trouver une date" | MJ |

### Hiérarchie de navigation

```
App
├── Dashboard (joueur)
│   ├── Badge vote en attente → Vote
│   └── Lien "Mon calendrier" → Calendrier personnel
├── Mes parties
│   └── [Partie]
│       ├── Détail partie
│       │   └── Widget "Prochaine date" + bouton → Vue MJ "Trouver une date"
│       ├── Calendrier personnel (contexte partie ou global)
│       └── Vote (création MJ / réponse joueurs)
└── Mon profil / Paramètres
```

### Qui accède à quoi

| Surface | Joueur | MJ |
|---------|--------|-----|
| Calendrier personnel | Lire + écrire (ses propres contraintes) | Lire + écrire (ses propres contraintes) |
| Vue "Trouver une date" | Non | Oui |
| Vote — création | Non | Oui |
| Vote — réponse | Oui | Oui (en tant que participant) |
| Dashboard joueur | Oui | Non (le MJ a son propre dashboard) |
| Widget page détail partie | Non (lecture seule de la date) | Oui (actions) |

---

## 3. Voice and Tone

### Registre

L'interface parle comme un conteur de JDR : absurde, légèrement épique, jamais condescendant. Le ton renforce l'appartenance à une guilde d'aventuriers. Les termes techniques (disponibilité, contrainte, vote) sont remplacés par des métaphores médiévales-fantasy, mais toujours compréhensibles au premier coup d'œil.

### Règles

1. **Métaphore cohérente** : la guilde, les corbeaux/pigeons voyageurs pour les notifications, le conseil pour le vote, l'aventure pour la session de jeu.
2. **Jamais bloquant** : l'humour ne doit pas obscurcir l'action à effectuer. Le CTA reste clair même si le texte d'accompagnement est fantaisiste.
3. **Personnages nommés** : les joueurs sont désignés par leur nom de personnage + emoji de classe, jamais par leur identifiant technique.
4. **Ton d'alerte** : même pour les messages d'erreur, rester dans l'univers, mais rendre la gravité lisible (ne pas rendre une erreur critique amusante au point de la minimiser).
5. **Consistance des emojis** : emoji de classe attribué par rôle dans la partie (voir tableau ci-dessous), pas par utilisateur global.

### Emojis par classe de personnage

| Classe | Emoji | Exemple de badge |
|--------|-------|-----------------|
| Guerrier / Barbare | ⚔️ / 🪓 | "Arek ⚔️ confirme" |
| Elfe / Rôdeur | 🧝 | "Lyra 🧝 hésite (comme toujours)" |
| Nain | 🪓 | "Borin 🪓 présent" |
| Mage | 🧙 | "Zara 🧙 consulte les étoiles" |
| Voleur / Roublard | 🗡️ | "Pip 🗡️ se faufile dans les créneaux" |
| Sans classe définie | ⚠️ | "Mira ⚠️ le pigeon n'est pas rentré" |

La classe est celle du personnage dans la partie concernée, pas une propriété du compte.

### Microcopy par contexte

**CTA principaux**
- Lancer un vote : "Convoquer le conseil" / "Lancer le vote du conseil"
- Sauvegarder une contrainte : "Sauvegarder la contrainte"
- Répondre à un vote : "Répondre à l'appel du conseil"
- Confirmer une date : "Sceller ce créneau"
- Envoyer une relance de vote : "Envoyer un corbeau ?"

**Empty states**
- Aucune contrainte déclarée : "Votre parchemin de disponibilités est vierge — les corbeaux ne savent pas où vous trouver."
- Aucun créneau commun calculé : "Aucun créneau commun… la quête est difficile, héros."
- Vote en attente sans réponses : "Le conseil attend les réponses de la guilde. Le silence règne dans la salle."
- Aucune partie active : "Aucune aventure en cours. Recrutez vos compagnons !"

**États de succès**
- Contrainte sauvegardée : "La contrainte a été gravée dans le grimoire."
- Vote envoyé : "Le pigeon voyageur a livré sa réponse."
- Date confirmée : "Le destin de la guilde est scellé : [date]."

**Erreurs**
- Erreur réseau : "Le corbeau s'est perdu en chemin. Vérifiez votre connexion et réessayez."
- Conflit de dates : "Ce créneau est déjà revendiqué par un autre serment."
- Formulaire incomplet : "Le grimoire est incomplet — renseignez [champ manquant]."
- Expiration passée : "Cette contrainte a expiré avant d'être renouvelée."

**Alertes**
- Expiration imminente (≤ 7 jours) : "Vos contraintes expirent bientôt — les reconduire ?"
- Vote sans réponse d'un joueur : "La guilde s'impatiente. [Prénom] n'a pas encore répondu."
- Prochaine date proche (≤ 48 h) : "L'aventure commence dans moins de 2 jours. Préparez vos dés !"

**Labels de sections**
- Créneaux calculés : "Prochaines fenêtres d'aventure"
- Contraintes actives : "Déclarations actives de la guilde"
- Statuts de réponse au vote : badges nominatifs (voir tableau emojis)

### Tonalité par thème

Chaque thème visuel porte sa propre personnalité de langage. Le mécanisme d'implémentation est un `ThemeToneService` (Angular signal) qui expose un objet microcopy indexé par clé, sélectionné selon le thème actif. Les clés sont identiques entre thèmes — seules les valeurs changent. ~25-30 clés.

#### Grimoire Émeraude — Magie, bibliothèque, sorts, parchemins

| Clé | Valeur |
|-----|--------|
| cta.find_date | "Consulter l'oracle des créneaux" |
| cta.launch_vote | "Convoquer le conseil des anciens" |
| cta.save_constraint | "Inscrire dans le grimoire" |
| cta.send_reminder | "Envoyer un sort de rappel ?" |
| section.slots | "Prochaines fenêtres d'aventure" |
| section.constraints | "Parchemins de disponibilités" |
| empty.no_slots | "L'oracle ne voit aucun créneau commun… la quête est difficile, héros." |
| empty.no_constraints | "Votre grimoire est vierge. Les sorts d'indisponibilité n'ont pas encore été lancés." |
| success.constraint_saved | "La contrainte a été gravée dans le grimoire." |
| success.vote_sent | "Le parchemin du conseil a été scellé et envoyé." |
| alert.expiring_soon | "Vos sorts expirent bientôt — les renouveler ?" |
| alert.missing_player | "[Prénom] n'a pas encore consulté le grimoire du conseil." |
| status.unavailable_label | "Sort d'indisponibilité actif" |
| status.unknown_label | "Hors de portée du sort de divination" |

#### Forêt Ancienne — Nature, elfes, druides, saisons

| Clé | Valeur |
|-----|--------|
| cta.find_date | "Lire les signes de la forêt" |
| cta.launch_vote | "Réunir le cercle sous le Grand Chêne" |
| cta.save_constraint | "Marquer le territoire" |
| cta.send_reminder | "Envoyer un écureuil messager ?" |
| section.slots | "Alignements des étoiles" |
| section.constraints | "Territoires déclarés" |
| empty.no_slots | "La forêt est silencieuse — aucun alignement favorable cette saison." |
| empty.no_constraints | "Aucune empreinte dans la forêt. La clairière est libre, mais pour combien de temps ?" |
| success.constraint_saved | "Ton territoire a été gravé dans l'écorce de l'Arbre-Mémoire." |
| success.vote_sent | "L'écureuil a livré le message au cercle." |
| alert.expiring_soon | "Les marques s'effacent — les renouveler avant la prochaine lune ?" |
| alert.missing_player | "[Prénom] n'a pas encore répondu à l'appel de la forêt." |
| status.unavailable_label | "Territoire occupé" |
| status.unknown_label | "Zone inexplorée" |

#### Médiéval Steampunk — Engrenages, vapeur, automates, registres

| Clé | Valeur |
|-----|--------|
| cta.find_date | "Interroger l'automate de planification" |
| cta.launch_vote | "Émettre un décret de vote" |
| cta.save_constraint | "Encoder dans le registre de vapeur" |
| cta.send_reminder | "Envoyer un pneumatique à [Prénom] ?" |
| section.slots | "Fenêtres d'opération calculées" |
| section.constraints | "Registre des contraintes mécaniques" |
| empty.no_slots | "L'automate ne détecte aucune fenêtre d'opération commune. Révisez les registres." |
| empty.no_constraints | "Le registre de vapeur est vide. Aucune contrainte n'a été encodée." |
| success.constraint_saved | "Contrainte encodée et verrouillée dans le registre de vapeur." |
| success.vote_sent | "Le pneumatique a été expédié à l'ensemble de la guilde." |
| alert.expiring_soon | "Les données du registre expirent — les reconduire avant arrêt de la machine ?" |
| alert.missing_player | "Piston en attente : [Prénom] n'a pas encore transmis sa réponse." |
| status.unavailable_label | "Piston bloqué — indisponible" |
| status.unknown_label | "Signal non reçu — hors réseau pneumatique" |

**Règle d'implémentation :** le thème et la tonalité sont couplés — changer le thème change automatiquement la tonalité. L'utilisateur ne choisit pas la tonalité indépendamment du thème.

---

## 4. Component Patterns

Chaque pattern décrit le **comportement** et les **états**. Les styles visuels (tokens, élévations, couleurs) sont dans `{DESIGN.md}` — références `{components.*}`.

### 4.1 CalendarMonthView

**Structure**
Grille 7 colonnes × N semaines. Chaque case = un jour du mois.

**Anatomie d'une case**
- En-tête : numéro du jour.
- Corps : 3 segments colorés en bas de la case, de gauche à droite : **Matin | Après-midi | Soirée**.
- Les segments n'ont pas de label textuel visible (économie d'espace) — l'information est portée par la couleur et l'aria-label.

**États des segments**

| État | Signification | Token couleur | Aria-label pattern |
|------|--------------|---------------|-------------------|
| AVAILABLE | Dispo explicite ou inféré (période couverte, aucune contrainte) | `{colors.available}` | "[Slot] : disponible" |
| UNAVAILABLE | Indisponibilité déclarée | `{colors.unavailable}` | "[Slot] : indisponible" |
| UNKNOWN | Hors période couverte | `{colors.unknown}` | "[Slot] : non renseigné" |
| MIXED | FULL_DAY avec ≥ 1 slot en conflit | Ambre — `{colors.mixed}` | "[Slot] : mixte" |

**États de la case entière**
- Neutre : aucun segment actif (UNKNOWN par défaut).
- Focus (clavier/souris survol) : bordure mise en avant — `{components.DayCell.focus}`.
- Sélectionnée (panel ouvert) : fond légèrement différencié — `{components.DayCell.selected}`.
- Aujourd'hui : indicateur visuel — `{components.DayCell.today}`.

**Interaction**
- **Tap / clic** sur une case → ouvre le panel de déclaration de contrainte (ConstraintPanel mobile, ConstraintSidePanel desktop) pré-rempli avec la date de la case.
- Si un slot spécifique était hovered/focused au moment du tap, le panel s'ouvre sur ce slot.
- Pas de bouton "+ Ajouter" séparé.
- Navigation clavier : flèches pour déplacer le focus entre les cases, Entrée/Espace pour ouvrir le panel.

**Swipe mobile**
- Swipe horizontal gauche/droite → mois précédent / suivant.
- Swipe vertical : scroll natif de la page (ne pas intercepter).

---

### 4.2 CalendarWeekView

**Structure**
Grille : colonnes = jours de la semaine (7), lignes = 3 slots (Matin | Après-midi | Soirée).

**Anatomie d'une cellule**
- Label de slot en en-tête de ligne (ex : "Matin").
- Fond coloré selon l'état (même palette que CalendarMonthView).
- Taille minimale : touch target ≥ 44 × 44 px sur mobile.

**États des cellules**
Mêmes états que les segments du CalendarMonthView : AVAILABLE, UNAVAILABLE, UNKNOWN, MIXED.

**Interaction**
- **Tap / clic** sur une cellule → ouvre le panel de déclaration de contrainte, pré-rempli avec jour + slot.
- Navigation clavier : Tab pour parcourir les cellules, Entrée/Espace pour ouvrir le panel.

**Swipe mobile**
- Swipe horizontal → semaine précédente / suivante.

**En-têtes de colonnes**
Format court : "Lun 30", "Mar 1", etc. Le jour courant est mis en évidence — `{components.WeekHeader.today}`.

---

### 4.3 ConstraintPanel (Bottom-Sheet Mobile)

**Déclencheur**
Tap sur une case (CalendarMonthView) ou une cellule (CalendarWeekView) sur mobile (< 768 px).

**Composant Angular Material**
`MatBottomSheet`. Hauteur initiale : 60 % de la hauteur de l'écran. Draggable vers le haut (hauteur max 90 %) ou vers le bas (dismiss).

**Contenu**

```
Titre        : "Jeudi 3 juillet — Soirée"  ← jour + slot de la cellule cliquée
────────────────────────────────────────────
Toggle       : [Indisponible ●] / [Disponible ○]

Type         : ◉ Ce jour uniquement
               ○ Récurrent (ce slot chaque semaine)
               ○ Plage de dates

── Si "Récurrent" sélectionné ──
             Répéter chaque [Jeudi] · Soirée
             jusqu'au [date picker]

── Si "Plage de dates" sélectionnée ──
             Du [date picker] au [date picker]
             · [Matin | AM | Soirée | Journée entière]

Expiration   : [date picker]
               Défaut : +6 mois pour récurrent
               Défaut : date de fin pour ponctuel
────────────────────────────────────────────
[Annuler]                   [Sauvegarder la contrainte]
```

**Validation**
- Le bouton "Sauvegarder" est désactivé tant que les champs obligatoires ne sont pas remplis.
- Champ expiration : toujours obligatoire. Si l'utilisateur efface la valeur, un message d'erreur inline s'affiche : "Le grimoire est incomplet — renseignez la date d'expiration."
- Pour "Récurrent" : la date "jusqu'au" est obligatoire.
- Pour "Plage" : les deux bornes sont obligatoires.

**Transitions**
- Ouverture : slide-up depuis le bas, durée `{motion.duration.medium}`, easing `{motion.easing.standard}`.
- Fermeture (bouton Annuler ou swipe down) : slide-down, même durée.
- Fermeture (succès "Sauvegarder") : slide-down + toast de succès ("La contrainte a été gravée dans le grimoire.").

**Focus**
À l'ouverture, le focus se place sur le Toggle. Ordre de focus : Toggle → Type → champs conditionnels → Expiration → Annuler → Sauvegarder.

---

### 4.4 ConstraintSidePanel (Desktop)

**Déclencheur**
Clic sur une case ou cellule du calendrier sur desktop (≥ 768 px).

**Comportement**
Panel latéral droit de **320 px**, apparaît par slide depuis la droite. Il est positionné de façon à ne **pas couvrir** le ResultsPanel (panneau "Créneaux calculés" — voir layout MJ). Si le ResultsPanel est présent, le ConstraintSidePanel s'insère entre le calendrier et le ResultsPanel, ou se superpose partiellement au calendrier (jamais au panneau de résultats).

**Contenu**
Identique au ConstraintPanel (mêmes champs), adapté à la densité desktop (espacements `{spacing.desktop.*}`).

**Slide behavior**
- Ouverture : `transform: translateX(320px)` → `translateX(0)`, durée `{motion.duration.short}`.
- Fermeture : `translateX(0)` → `translateX(320px)`.
- Le calendrier se rétrécit ou reste fixe selon la place disponible (pas de reflow brutal).

**Co-existence avec ResultsPanel**
- Le ResultsPanel reste toujours visible.
- Le ConstraintSidePanel ne doit jamais le masquer.
- Si la fenêtre est trop étroite (< 1100 px), le ConstraintSidePanel peut se superposer légèrement au calendrier (côté gauche).

**Fermeture**
- Bouton "Annuler" dans le panel.
- Clic en dehors du panel (sur le calendrier ou une zone neutre).
- Touche Échap.
- Succès de sauvegarde.

---

### 4.5 CreneauCard

**Contexte**
Utilisée dans le ResultsPanel (vue MJ "Trouver une date") pour afficher chaque créneau calculé.

**Structure d'une carte**

```
┌──────────────────────────────────────────┐
│  Titre : Jeudi 3 juillet · Soirée        │
│  Statuts joueurs :                       │
│    Arek ⚔️ Disponible                   │
│    Lyra 🧝 Inconnu                      │
│    Borin 🪓 Indisponible                │
│    Mira ⚠️ Non renseigné               │
│                                          │
│  Score global : ██████░░░░ 3/5          │
│                                          │
│  [Lancer le vote du conseil]             │
└──────────────────────────────────────────┘
```

**Statuts joueurs dans la carte**

| Statut | Affichage | Couleur |
|--------|-----------|---------|
| AVAILABLE | "Disponible" | `{colors.available}` |
| UNAVAILABLE | "Indisponible" | `{colors.unavailable}` |
| UNKNOWN | "Non renseigné" | `{colors.unknown}` |

**Score global**
Barre de progression (0 → nombre total de joueurs). Calculé côté serveur, affiché tel quel.

**Actions MJ**
- "Lancer le vote du conseil" → déclenche le PollFlow.
- Si un vote est déjà en cours pour ce créneau : afficher le statut du vote à la place du bouton.

**États de la carte**
- Défaut : fond `{components.CreneauCard.default}`.
- Meilleur créneau (score max) : mise en avant visuelle — `{components.CreneauCard.best}`.
- Vote en cours : indicateur de statut.
- Date confirmée : badge "Scellé" — `{components.CreneauCard.confirmed}`.

---

### 4.6 PollFlow

Le PollFlow couvre trois phases : création (MJ), réponse (joueurs), résultat.

**Phase 1 — Création (MJ)**

Déclenchée depuis le bouton "Lancer le vote du conseil" dans une CreneauCard.

Contenu du formulaire de création :
- Créneau proposé : pré-rempli (affiché en lecture seule).
- Participants à notifier : liste des joueurs de la partie, tous cochés par défaut.
- Message optionnel du MJ : champ texte libre ("Le message du héraut").
- Date limite de réponse : date picker, défaut J+3.

CTA : "Convoquer le conseil".

**Phase 2 — Réponse (joueurs)**

Déclenchée par notification (badge dashboard ou message externe). Le joueur arrive sur l'écran de vote.

Contenu :
- Créneau proposé affiché.
- Choix : ◉ Présent / ○ Absent / ○ Peut-être.
- Commentaire optionnel.

CTA : "Répondre à l'appel du conseil".

Succès : "Le pigeon voyageur a livré sa réponse."

**Phase 3 — Résultat**

Accessible depuis la CreneauCard ou la page vote.

Affichage des statuts :
- Badge par joueur (voir tableau emojis + ton).
- Récapitulatif : N présents, N absents, N hésitants.

Action MJ si majorité favorable : "Sceller ce créneau" → confirme la date.

---

## 5. State Patterns

### États globaux

**Loading**
- Skeleton screens pour le calendrier (cases grises animées).
- Skeleton pour les CreneauCards (lignes grises).
- Aucun spinner plein-écran bloquant.
- Durée max d'attente affichée : si > 3 s, message discret : "La guilde compile les parchemins…"

**Empty — aucune contrainte déclarée**
Affiché sur le calendrier si aucune déclaration active pour l'utilisateur.
Illustration + texte : "Votre parchemin de disponibilités est vierge — les corbeaux ne savent pas où vous trouver."
CTA : "Déclarer mes disponibilités" (ouvre directement le ConstraintPanel/SidePanel sur la date du jour).

**Empty — aucun créneau calculé**
Affiché dans le ResultsPanel si aucun créneau commun n'est trouvé.
Texte : "Aucun créneau commun… la quête est difficile, héros."
Suggestion : "Élargissez la plage de recherche ou attendez de nouvelles déclarations."

**Error**
- Erreur réseau / serveur : toast + message dans la zone concernée.
- Message : "Le corbeau s'est perdu en chemin. Vérifiez votre connexion et réessayez."
- Bouton retry visible.
- Erreurs fatales (session expirée) : redirection vers la page de connexion avec message explicatif.

**Expiration imminente**
Condition : ≥ 1 contrainte active expire dans ≤ 7 jours.
Bannière persistante (non dismissable sans action) en haut du calendrier personnel :
"Vos contraintes expirent bientôt — les reconduire ?"
CTA inline : "Renouveler" → ouvre le ConstraintPanel/SidePanel sur la contrainte concernée.

---

## 6. Interaction Primitives

### Tap sur cellule calendrier

1. L'utilisateur appuie sur une case (vue mois) ou une cellule (vue semaine).
2. Feedback haptic sur mobile (si API disponible) : vibration légère.
3. La case passe à l'état `selected` visuellement.
4. Le panel de déclaration s'ouvre (bottom-sheet mobile, side panel desktop).
5. Si un panel était déjà ouvert sur une autre date, il se ferme d'abord (transition out), puis le nouveau s'ouvre (transition in). Pas de double-ouverture simultanée.

### Swipe vue mois / semaine

- Swipe horizontal (≥ 40 px de déplacement) → changer de mois / semaine.
- Pendant le swipe : l'affichage suit le doigt (rubber-band effect) avant de snapper.
- Si swipe < 40 px : annulé, retour position initiale.
- Swipe vertical : transmis au scroll natif de la page sans interférence.

### Slide panel (ConstraintSidePanel)

- Le panel slide depuis la droite lors de l'ouverture et repart vers la droite à la fermeture.
- Transition : `{motion.duration.short}`, easing `{motion.easing.standard}`.
- Pendant la transition d'ouverture, le calendrier est non-interactif (pointer-events: none).
- Après la fin de la transition, le focus est transféré dans le panel.

### Toggle indispo / dispo

- Composant : `MatSlideToggle` ou toggle custom conforme `{components.AvailabilityToggle}`.
- État OFF (gauche) = Indisponible — couleur `{colors.unavailable}`.
- État ON (droite) = Disponible — couleur `{colors.available}`.
- Le changement de valeur déclenche immédiatement la mise à jour du preview dans la vue calendrier (optimistic UI), avec rollback si la sauvegarde échoue.
- Accessible au clavier : espace pour basculer, labels aria explicites.

---

## 7. Accessibility Floor

### Touch targets

- Cellules du CalendarWeekView (mobile) : **minimum 44 × 44 px**. Si la grille est trop dense, utiliser le scroll horizontal plutôt que de réduire les cellules.
- Cases du CalendarMonthView (mobile) : minimum 44 px de hauteur par case.
- Boutons et CTA : minimum 44 × 44 px sur mobile, 36 × 36 px desktop.
- Les 3 segments de la vue mois ne sont pas des cibles de tap indépendantes — la cible est la case entière. Les segments sont purement indicatifs.

### Aria-labels calendrier

**Vue mois — segments**
Chaque segment porte un `aria-label` : `"[Nom du slot] : [état]"`.
Exemples : `"Matin : disponible"`, `"Après-midi : indisponible"`, `"Soirée : non renseigné"`.

**Case du jour**
`aria-label` complet de la case : `"[Jour semaine] [numéro] [mois] — Matin : [état], Après-midi : [état], Soirée : [état]"`.
Exemple : `"Jeudi 3 juillet — Matin : disponible, Après-midi : indisponible, Soirée : non renseigné"`.

**Vue semaine — cellules**
`aria-label` : `"[Nom du slot], [Jour semaine] [numéro] : [état]"`.
Exemple : `"Soirée, Jeudi 3 : disponible"`.

### Ordre de focus — ConstraintPanel / ConstraintSidePanel

À l'ouverture du panel :
1. Titre du panel (focus, non-interactif, role="heading").
2. Toggle Indisponible / Disponible.
3. Radio "Type" (Ce jour / Récurrent / Plage).
4. Champs conditionnels (date pickers, selon le type sélectionné).
5. Champ Expiration.
6. Bouton "Annuler".
7. Bouton "Sauvegarder la contrainte".

À la fermeture du panel, le focus retourne sur la case/cellule qui avait déclenché l'ouverture.

### Contraste

- Texte principal sur fond : ratio ≥ **4.5:1** (WCAG AA).
- Texte secondaire (labels de slots, dates grises) : ratio ≥ **3:1** (WCAG AA Large).
- Les couleurs d'état (AVAILABLE, UNAVAILABLE, UNKNOWN, MIXED) ne sont **pas** l'unique vecteur d'information : chaque état a aussi un aria-label et, dans les contextes textuels, un libellé.
- Dark mode uniquement pour ce palier — pas de mode clair.

### Navigation clavier

- Le calendrier est navigable aux flèches directionnelles (grid pattern ARIA).
- Tab ne parcourt pas chaque cellule du calendrier (trop de stops) — Tab saute de header en header, puis entre dans la grille avec les flèches.
- Le PollFlow (formulaire de vote) suit l'ordre DOM naturel.

---

## 8. Key Flows

### Flow 1 — Arek déclare ses indispos (joueur mobile)

**Protagoniste** : Arek, guerrier de 35 ans, joue au JDR depuis 10 ans. Il consulte l'app le dimanche soir depuis son téléphone, souvent avant de dormir.

**Contexte** : Arek sait qu'il ne sera pas disponible les mercredis soirs pendant 2 mois à cause d'un cours de sport. Il veut le déclarer une bonne fois pour toutes.

1. Arek ouvre l'app → dashboard joueur. Il voit "Aucun vote en attente". Il tape sur "Mon calendrier".
2. La vue CalendarMonthView s'affiche. Il voit ses cases presque toutes grises (UNKNOWN — pas encore déclaré).
3. Il repère un mercredi, tape dessus. La bottom-sheet s'ouvre depuis le bas : "Mercredi 2 juillet — (aucun slot sélectionné)".
4. Il voit le toggle sur "Indisponible". C'est ce qu'il veut. Il sélectionne le slot "Soirée" dans la plage horaire (ou il a tapé sur la case entière — il précise "Soirée" dans le panel).
5. Il sélectionne le type "Récurrent (ce slot chaque semaine)". Le champ "Répéter chaque [Mercredi] · Soirée jusqu'au [date picker]" apparaît.
6. Il choisit la date de fin : 31 août. Le champ Expiration se remplit automatiquement avec la même date.
7. Il tape "Sauvegarder la contrainte". La bottom-sheet se ferme. Un toast s'affiche : "La contrainte a été gravée dans le grimoire."
8. Sur le calendrier, les mercredis soirs jusqu'au 31 août passent au rouge (UNAVAILABLE) dans le segment "Soirée".

**Points critiques d'expérience**
- L'absence de bouton "+ Ajouter" séparé force Arek à comprendre que la cellule est le point d'entrée. La cellule doit être suffisamment grande et son caractère interactif suffisamment évident (curseur pointer sur desktop, feedback au tap sur mobile).
- Le remplissage automatique de l'expiration pour le récurrent évite une erreur fréquente.

---

### Flow 2 — Lyra répond au vote (joueur mobile)

**Protagoniste** : Lyra, elfe hésitante (🧝), joue dans le groupe d'Arek. Elle reçoit une notification.

**Contexte** : Le MJ vient de lancer un vote pour le "Samedi 12 juillet · Soirée". Lyra doit répondre.

1. Lyra ouvre l'app → dashboard joueur. Elle voit un badge rouge : "1 vote en attente".
2. Elle tape sur le badge. Elle arrive sur l'écran de vote : "Samedi 12 juillet · Soirée — Le conseil vous convoque."
3. Le créneau est affiché avec les réponses déjà reçues : "Arek ⚔️ Présent", "Borin 🪓 Présent", "Mira ⚠️ Non répondu".
4. Elle voit les options : ◉ Présent / ○ Absent / ○ Peut-être. Par défaut : rien de sélectionné.
5. Elle hésite (comme toujours), choisit "Peut-être". Elle ajoute un commentaire : "Je vais essayer mais le pigeon est incertain."
6. Elle tape "Répondre à l'appel du conseil".
7. Confirmation : "Le pigeon voyageur a livré sa réponse." Son badge disparaît.
8. La CreneauCard se met à jour pour le MJ : "Lyra 🧝 hésite (comme toujours)".

**Points critiques d'expérience**
- Le badge doit être visible dès l'ouverture de l'app, sans scroll.
- La réponse doit être rapide (≤ 3 taps depuis le dashboard). Pas de création de compte ou connexion intermédiaire si Lyra est déjà connectée.
- Le "Peut-être" doit être un choix de premier ordre, pas un sous-menu.

---

### Flow 3 — Le MJ trouve une date (desktop)

**Protagoniste** : Le MJ, qui prépare sa prochaine session. Il est sur son ordinateur, a du temps.

**Contexte** : Tous les joueurs ont (plus ou moins) déclaré leurs contraintes. Le MJ veut trouver le meilleur créneau pour la prochaine session.

1. Le MJ ouvre la page détail de la partie. Il voit le widget "Prochaine date" en haut : "Aucune date confirmée. Trouver un créneau →".
2. Il clique "Trouver une date". La vue MJ s'ouvre : split layout 60/40. Gauche = CalendarWeekView de la semaine en cours. Droite = ResultsPanel "Prochaines fenêtres d'aventure".
3. Le ResultsPanel affiche déjà les créneaux calculés (chargés à l'ouverture). Il voit 3 CreneauCards triées par score décroissant.
4. Le meilleur créneau : "Samedi 12 juillet · Soirée — Arek ⚔️ Disponible, Lyra 🧝 Inconnu, Borin 🪓 Disponible, Mira ⚠️ Non renseigné. Score : 2/4."
5. Le MJ clique sur une case du calendrier (Samedi 12 · Soirée) pour voir les détails de disponibilité. Le ConstraintSidePanel s'ouvre à 320 px depuis la droite, **entre** le calendrier et le ResultsPanel. Il voit les contraintes de chaque joueur pour ce slot.
6. Il referme le ConstraintSidePanel (clic en dehors). Il revient sur la CreneauCard "Samedi 12 juillet · Soirée".
7. Il clique "Lancer le vote du conseil". Le formulaire de création de vote s'ouvre (en modale ou dans un panel) : créneau pré-rempli, tous les joueurs cochés.
8. Il ajoute un message : "Préparez vos sorts, aventuriers." Il valide "Convoquer le conseil".
9. Les joueurs reçoivent une notification. Le MJ voit la CreneauCard passer en mode "Vote en cours".
10. Quand tous les joueurs ont répondu (ou à la date limite), le MJ revient. Les statuts sont affichés. Score final : 3 présents, 1 "peut-être".
11. Il clique "Sceller ce créneau". La date est confirmée. Le widget de la page partie se met à jour : "Prochaine session : Samedi 12 juillet · Soirée."

**Points critiques d'expérience**
- Le split layout doit rester cohérent pendant toutes les interactions (ouverture/fermeture du ConstraintSidePanel, scroll du calendrier, mise à jour du ResultsPanel).
- Le ResultsPanel est toujours visible — c'est la colonne vertébrale de la surface MJ.
- Les mises à jour du ResultsPanel (nouvelles réponses au vote) sont automatiques (polling ou WebSocket) — le MJ ne doit pas recharger la page.

---

## 9. Responsive & Platform

### Delta mobile vs desktop par surface

#### Surface 1 — Calendrier personnel

| Aspect | Mobile (< 768 px) | Desktop (≥ 768 px) |
|--------|------------------|-------------------|
| Vue par défaut | Semaine (plus lisible) | Mois ou semaine (choix utilisateur) |
| Panel de déclaration | Bottom-sheet (`MatBottomSheet`) | Panel latéral 320 px (slide depuis droite) |
| Navigation entre périodes | Swipe horizontal | Boutons flèche ou clic |
| Vue mois | Accessible via bouton toggle | Accessible via toggle ou par défaut |
| Touch targets cellules | ≥ 44 px hauteur | Standard Material (36 px) |
| Scroll | Vertical pour la page, horizontal pour les semaines | Scroll page uniquement |

#### Surface 2 — Vue MJ "Trouver une date"

| Aspect | Mobile (< 768 px) | Desktop (≥ 768 px) |
|--------|------------------|-------------------|
| Layout | Empilement vertical : calendrier puis bouton "Voir les créneaux" | Split 60/40 : calendrier + ResultsPanel |
| ResultsPanel | Écran séparé accessible via bouton | Sticky, toujours visible |
| ConstraintPanel | Bottom-sheet | ConstraintSidePanel 320 px |
| Accès | Non recommandé (surface MJ) mais fonctionnel | Optimal |

#### Surface 3 — Vote

| Aspect | Mobile (< 768 px) | Desktop (≥ 768 px) |
|--------|------------------|-------------------|
| Écran de réponse | Plein écran | Centré, largeur max 480 px |
| Résultats du vote | Liste verticale simple | Grille si > 4 joueurs |
| Notifications | Badge app prominent | Badge + bannière optionnelle |

#### Surface 4 — Dashboard joueur

| Aspect | Mobile (< 768 px) | Desktop (≥ 768 px) |
|--------|------------------|-------------------|
| Badge vote | Affiché en haut, tap direct | Affiché en sidebar ou header |
| Accès calendrier | Lien prominent | Lien dans la navigation |

#### Surface 5 — Widget page détail partie

| Aspect | Mobile (< 768 px) | Desktop (≥ 768 px) |
|--------|------------------|-------------------|
| Widget | Compact, 1 ligne "Prochaine date + bouton" | Carte étendue avec détails |
| Bouton "Trouver une date" | Visible mais contexte MJ (peut être masqué si joueur) | Prominent |

### Comportement du ConstraintSidePanel sur tablette (768–1024 px)

À 768–1024 px, le split layout MJ peut être trop serré. Le ConstraintSidePanel peut se comporter comme une drawer (superposition partielle) plutôt qu'un panel inline, selon la place disponible. Le ResultsPanel reste toujours accessible (pas masqué entièrement).

---

*Fin du document EXPERIENCE.md — Palier 2 Calendrier de disponibilités.*
*Référence design : `DESIGN.md` — Référence produit : `docs/spec.md` — Backlog : `docs/backlog.md`*
