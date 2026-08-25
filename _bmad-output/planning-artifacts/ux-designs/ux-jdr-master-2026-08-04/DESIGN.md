---
title: jdr-master Design System — Delta Refonte UI & lisibilité de l'état (Palier 9)
status: final
updated: 2026-08-24
themes: [grimoire-emeraude, foret-ancienne, atelier-cuivre]
ui_system: Angular Material 22
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
sources:
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/addendum.md"
  - "_bmad-output/specs/spec-palier9-refonte-ui/SPEC.md"
  - "_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260626/DESIGN.md"
---

# jdr-master — Design System — Delta Palier 9

**Ce document est un delta**, mais d'une nature différente des trois précédents : ceux-ci *étendaient* la base pour une fonctionnalité neuve, celui-ci **revisite de l'existant et amende six décisions de base** — quatre ici, deux dans `EXPERIENCE.md` (architecture de l'information, plancher d'accessibilité). Chaque amendement est signalé comme tel, avec sa raison.

Cadrage du run, posé par l'utilisateur : **la direction artistique est validée, le sujet est la forme et le layout.** Les trois thèmes, la palette de fond et la typographie restent intacts.

En cas de conflit entre ce document et une planche de `.working/`, **ce document gagne**.

---

## 1. Brand & Style

### Amendement 1 — le SVG inline est autorisé

Le principe n°1 de la base (« couleurs + typographie + formes géométriques uniquement — pas de textures bitmap, pas d'images ») est **assoupli** :

> **Autorisé** : la géométrie vectorielle écrite dans le markup (SVG inline, `<defs>`/`<use>`), exprimée en valeurs numériques et modifiable sans outil graphique.
> **Toujours interdit** : tout fichier image bitmap décoratif.

**Raison** : les dents d'engrenage à flancs parallèles sont impossibles à obtenir correctement en CSS pur — un `conic-gradient` produit des dents en parts de tarte, qui s'évasent vers l'extérieur. Le SVG inline reste dans l'esprit du principe (IA-friendly, tout en valeurs numériques) sans en payer la limite.

### Amendement 2 — mobile-first nuancé

La base pose « mobile-first pour les joueurs, le MJ principalement sur desktop ». Le PRD (P-3) pose la parité. **Aucun des deux n'est exact.** Estimation d'usage de l'utilisateur : joueur 60-80 % sur téléphone, MJ ~30 %.

> La parité signifie **« aucune surface cassée sur l'un des deux supports »**, pas « même effort partout ». La cible d'optimisation se décide **surface par surface**.

Réserve consignée : un seul utilisateur réel, test mobile très récent, usage jusqu'ici surtout côté MJ. **Estimation à re-vérifier à l'usage.**

### Amendement 3 — l'image utilisateur s'étend aux parties

Le portrait de personnage était la seule exception bitmap (delta P3). Une seconde s'ajoute : **l'image de couverture de partie**, téléversée par le MJ, avec repli sur la bannière générative tant qu'aucune image n'est fournie. Mécanisme réutilisé : celui des portraits (upload, recadrage, plafond 5 Mo, nettoyage EXIF).

**Raison** : la bannière générative répond au besoin d'ambiance et de repérage, mais l'utilisateur veut pouvoir donner à une partie une identité propre que l'algorithme ne saura jamais deviner. Le repli sur la bannière générative garantit qu'aucune partie n'est jamais nue.

*Point ouvert* : l'image téléversée remplace-t-elle la bannière dans **tous** les modes d'affichage ou seulement en grande carte, et que devient l'animation du thème dans ce cas ?

### Amendement 4 — les couleurs de statut ne dérivent plus des accents

Voir §2. C'est le plus lourd des quatre.

### Renommage du troisième thème

`medieval-steampunk` devient **`atelier-cuivre`**, affiché **« Atelier Cuivré »**.

**Raison** : rien dans ce thème ne relevait du médiéval — ni sa palette cuivre et bronze, ni sa bannière de plan d'atelier, ni son vocabulaire de machines. Le nouveau nom suit le patron des deux autres : un lieu ou un objet, plus une matière ou un qualificatif, et il nomme la couleur dominante réelle du thème (`#cd7f32`) comme *Émeraude* nomme la sienne.

**Conséquence technique, à ne pas manquer** : le slug vit dans le type `Theme`, dans la classe CSS racine (`.theme-steampunk` → `.theme-atelier-cuivre`), dans les clés du registre de thèmes, **et dans les valeurs persistées de `User.theme`** (cf. AD-1 de la spine). Le renommage exige donc une **migration des préférences enregistrées**.

> À faire **dans la story FR-43**, celle qui réorganise le stockage des thèmes en fichiers séparés : le fichier de ce thème y est recréé de toute façon, et la migration s'y range naturellement.

---

## 2. Colors

### Défaut constaté dans la base

Les couleurs de statut y sont déclarées cross-thème **sauf une** : `status-available: var(--accent-1)`, qui suit donc l'accent du thème actif. En Atelier Cuivré, `accent-1` est le cuivre `#cd7f32`, quasi indistinguable de l'ambre `#f0a030` de « ça t'attend ». **Dans ce thème, l'urgence cesse de se distinguer de la normalité.** Ce n'est pas une hypothèse : c'est dans les tokens actuels.

### L'invariant

> Dans un thème donné, les quatre statuts doivent être **distinguables entre eux** *et* **éloignés des deux accents de ce thème**. Les valeurs sont libres de suivre l'univers ; la règle ne l'est pas. Elle vaut pour tout thème futur.

### Les trois palettes de statut

Aucune ne dérive d'un accent. Chacune a été vérifiée contre les deux accents de son thème.

```yaml
# Grimoire Émeraude — « Vitrail »   (accents : #7ec8a4 sauge, #9b6dff lavande)
grimoire-emeraude:
  status-todo:  "#f0a030"   # ambre chandelle — ça t'attend
  status-live:  "#3fd4ff"   # cyan arcanique  — en cours
  status-soon:  "#ff7ad9"   # rose de sort    — à venir
  status-done:  "#5a5a6a"   # cendre          — terminé

# Forêt Ancienne — « Automne »      (accents : #2ecc71 vert, #f0c040 or)
foret-ancienne:
  status-todo:  "#ff8a3d"   # orange d'automne
  status-live:  "#4fd6c1"   # eau claire
  status-soon:  "#6f8fd8"   # bleu brume
  status-done:  "#5f6b60"   # lichen

# Atelier Cuivré — « Signalisation »  (accents : #cd7f32 cuivre, #4a7c59 bronze vert)
atelier-cuivre:
  status-todo:  "#ffd21f"   # jaune d'alerte
  status-live:  "#3fb894"   # vert-de-gris — patine du cuivre oxydé
  status-soon:  "#6f9fd8"   # bleu acier
  status-done:  "#6b6459"   # fonte
```

**Note de conception sur l’Atelier Cuivré** : `status-live` était initialement le bleu vapeur `#35b7c9`. Avec le bleu acier retenu pour `status-soon`, deux bleus voisins (24° d'écart de teinte) devenaient confondables sur fond brun. Le vert-de-gris les sépare franchement **et** reste thématique.

**Le rouge n'est pas réservé.** Aucune des trois palettes de statut ne l'emploie — c'était une contrainte de la phase de choix, pas une règle du système. Il reste donc **disponible dans les trois thèmes** pour ce à quoi il sert bien : une erreur, une action destructive, une indisponibilité de créneau (`{colors.status-unavailable}`, inchangé).

Référence visuelle : [`mockups/palettes-finales.html`](mockups/palettes-finales.html) — les trois palettes avec les accents de leur thème en regard.

### Ce que la couleur dit, et ce qu'elle ne dit pas

Dix états existent (quatre de scénario, six de séance). Ils se partagent **quatre teintes seulement**.

> La couleur ne répond jamais à « qu'est-ce que c'est ? » mais à **« est-ce que ça me concerne maintenant ? »**. L'état précis est toujours porté par le **libellé**.

| Teinte | Signification | États de scénario | États de séance |
| --- | --- | --- | --- |
| `status-todo` | Ça t'attend — une action de ta part | — | À planifier · En vote *(tu n'as pas répondu)* · À débriefer |
| `status-live` | En cours — vivant, rien à faire | Courant | En vote *(tu as répondu)* · Inscriptions ouvertes |
| `status-soon` | À venir — daté, en attente | À venir | Programmée |
| `status-done` | Terminé — consultable, en retrait | Passé | Jouée |

**Le brouillon n'est pas une cinquième couleur** : c'est un **contour tireté**, un traitement de forme. Il ne peut donc jamais être confondu avec un état publié, et reste lisible pour qui distingue mal les couleurs.

### Couleurs d'identité

`{colors.accent-1}` pour le nom de personnage, `{colors.text-muted}` pour le nom de joueur — **jamais seules**, cf. §3 et EXPERIENCE.md.

---

## 3. Typography

Aucun nouveau rôle typographique ni nouvelle échelle. **Un nouvel usage** :

> **Le nom de personnage est en italique, le nom de joueur en romain.** C'est le second signal non chromatique exigé par P-1 lorsque les deux noms se côtoient.

Le libellé relatif d'imminence (« dans 5 jours », « demain soir », « ce soir ») utilise `{typography.text-sm}` ; au palier imminent il passe en poids 600.

---

## 4. Layout & Spacing

Aucun nouveau token. Trois structures nouvelles :

| Structure | Dimension | Note |
| --- | --- | --- |
| Barre de navigation basse (mobile) | ~50 px + zone sûre | 4 destinations ; sur desktop, mêmes entrées en barre haute |
| Bande d'état verticale (carte) | 4 px de large, pleine hauteur | Équivalent exact de la pastille du mode liste |
| Bannière de carte | 78-124 px de haut selon le mode | Grande carte uniquement pour l'animation |

**Densité des trois modes d'affichage** de la liste : grande vignette (~2 éléments par écran mobile), moyen (~4-5), liste (~12).

---

## 5. Elevation & Depth

Aucun nouveau niveau. La surface de détail (§7) réutilise `{elevation.panel}` dans ses deux présentations — feuille montant du bas sur mobile, panneau latéral sur desktop — exactement comme le `ConstraintPanel` existant.

---

## 6. Shapes

Aucun nouveau token de radius. Les vignettes de bannière reprennent `{radius.card}` en grande carte, 8 px en moyen, 6 px en mode liste.

---

## 7. Components

### 7.1 StatusBadge

Badge portant un état. Teinte issue de la palette de statut du thème actif (§2), libellé toujours présent.

```yaml
StatusBadge:
  base:
    font-size:     "var(--text-sm)"
    padding:       "1px 8px"
    border-radius: "var(--radius-badge)"
    border:        "1px solid"
  variants:
    todo:  { color: status-todo,  background: "16% opacity" }
    live:  { color: status-live,  background: "15% opacity" }
    soon:  { color: status-soon,  background: "15% opacity" }
    done:  { color: text-muted,   border-color: status-done, background: "12% opacity" }
    draft: { color: text-muted,   border-style: dashed, background: transparent }
```

**Couleur du texte, deux cas à ne pas laisser au hasard** :
- Badge **plein** (palier imminent) : le texte prend `{colors.primary-bg}` du thème — sombre sur teinte claire. Jamais du blanc : sur `status-soon` clair, le blanc tombe à 2,3-3,2:1.
- Badge **`done`** : le texte prend `{colors.text-muted}`, pas `status-done`. Texte et fond de la même teinte tomberaient à 2,2-2,5:1 en `{typography.text-sm}`.
- **Opacité du fond `done` mesurée et corrigée à 12 %** *(2026-08-24, était 26 %)* : `status-done` est plus clair que la surface dans les trois thèmes — à 26 % le fond remonte vers `text-muted` et le contraste chute (mesuré 3,45:1 Médiéval Steampunk / 4,83:1 Grimoire Émeraude / 4,93:1 Forêt Ancienne, sous ou proche du seuil AA 4,5:1). À 12 %, les trois gagnent ~0,6 point (3,95 / 5,44 / 5,71) sans perdre le caractère « en retrait » du badge.

**Trois paliers d'imminence** — l'imminence est une **intensité**, jamais un état ni une cinquième couleur. La séance garde `status-soon` et le badge se densifie :

| Palier | Quand | Traitement |
| --- | --- | --- |
| Lointain | > 7 jours | Contour seul, fond transparent |
| Proche | 7 à 2 jours | Badge teinté (fond à 15 %) |
| Imminent | Demain et aujourd'hui | Badge **plein**, texte sur fond, poids 600, libellé humain |

Aucun renforcement au-delà d'une semaine. Le signal étant de **forme** (densité de remplissage), il reste conforme à P-1 même sans percevoir la couleur.

### 7.2 StateRail — bande d'état

Bande verticale de 4 px sur le bord gauche d'une carte, teintée par la palette de statut. C'est l'**équivalent exact** de la pastille du mode liste : un seul vocabulaire d'état quel que soit le mode d'affichage.

### 7.3 GeneratedBanner — bannière générative

Bannière calculée à partir d'une **graine dérivée de l'identifiant de la partie**.

> **Règle fondatrice** : « aléatoire » signifie **tiré une fois à la génération**. Une fois générée, la bannière d'une partie est **immuable** — jamais un tirage à chaque affichage.

**Mécanique de la graine** : la graine est **dérivée de l'identifiant de la partie** par une fonction de hachage déterministe, et **jamais persistée** — elle se recalcule à l'identique à chaque rendu, sur n'importe quel appareil. Le générateur pseudo-aléatoire qu'elle amorce doit être **explicite et stable** (pas `Math.random()`), pour qu'une même partie donne toujours exactement la même composition. Le nom de la partie n'entre pas dans la graine : le renommer ne doit pas changer la bannière.

Le style dépend du **thème actif**, pas de la partie : une même partie n'a pas la même bannière en Grimoire Émeraude et en Atelier Cuivré. **Chaque thème a sa personnalité graphique** ; il n'y a délibérément aucune structure commune.

**Trois rendus par thème**, et non deux — la distinction est structurante :

| Mode | Rendu | Dimension |
| --- | --- | --- |
| Grande carte | **Bannière complète**, pleine largeur, animée | 78-124 px de haut |
| Moyen | **Vignette carrée** : la composition recadrée au centre, sans animation | 44 × 44 px, `{radius}` 8 px |
| Liste | **Vignette atténuée + monogramme par-dessus** | 28 × 28 px, `{radius}` 6 px |

À 28 px, ce qui différencie réellement deux parties n'est ni le motif ni la composition, mais le **monogramme** et la **dominante colorée** — d'où le rendu spécifique, jamais une bannière simplement réduite.

**Dérivation du monogramme** : les initiales des deux premiers mots significatifs du nom de la partie, articles exclus, en capitales — « Les Cendres de Kavaan » → `CK`, « Le Convoi du Nord » → `CN`. Un seul mot significatif → ses deux premières lettres.

#### Grimoire Émeraude — ciel et comètes

- Fond : ciel étoilé, densité tirée ; un **halo qui respire** en arrière-plan.
- **1 à 3 comètes** tirées. Chacune porte son **angle**, sa **longueur**, sa **vitesse**, sa **teinte** (vert ou améthyste) et son **sens** de déplacement.
- Construction obligatoire (cf. §8) : queue et tête dans un même repère pivoté ; la tête est centrée sur l'extrémité de la queue.

#### Forêt Ancienne — clairière

- **Toujours** : deux halos qui pulsent en décalé, position et teinte (vert / or) tirées.
- Puis un **tirage exclusif** : soit des **feuilles** qui tombent en tournoyant, soit des **points lumineux** ascendants. **Jamais les deux ensemble.**
- **Bornes de tirage** : 2 halos (toujours), diamètre 56-130 px, décalage de pulsation 0-4 s ; puis 2 à 5 éléments mobiles, taille 3-11 px, dérive latérale ±26 px, décalage de départ 0-6 s.

#### Atelier Cuivré — planche d'atelier

- **La grille de plan technique est une constante du thème**, jamais un élément tiré : toute bannière de ce thème la porte.
- **Un manomètre, toujours présent**, à aiguille oscillante.
- Une **chaîne de N rouages engrenés**, N tiré **entre 2 et 6**, tailles décroissantes, sens et vitesses alternés.
- Techniques de rouage autorisées : **B** (dents droites, 12 dents rectangulaires), **C** (dents trapèze + roue à rayons), **E** (silhouette pleine, un seul tracé, trou en `fill-rule="evenodd"` — d'après la référence fournie par l'utilisateur, `imports/reference-engrenage.html`). **La technique D (tracé technique au contour) est rejetée.**
- Accessoires tirés : rivets, **vapeur** (s'échappant de derrière un rouage ou du bord bas). Le **tuyau est retiré du répertoire**. Le ressort et la bielle sont autorisés mais confinés à des zones sûres.

**Contrainte de composition, dure** :

> Le manomètre a une **zone d'exclusion** : son cercle **plus 8 px de marge sur les quatre côtés**. Aucun rouage, bielle, ressort ou accessoire ne peut y être placé, même partiellement — le test porte sur les boîtes englobantes, pas sur les centres. Corollaire : si le manomètre est à gauche, la chaîne de rouages se déploie à droite, et inversement.

**Bornes de tirage** : manomètre 42-46 px de diamètre, ancré dans l'un des deux coins hauts ; rouages de 18 à 84 px, tailles strictement décroissantes le long de la chaîne ; 0 à 3 rivets ; vapeur présente ou non.

Références visuelles : [`mockups/iteration-6-regles-de-generation.html`](mockups/iteration-6-regles-de-generation.html) (les règles de tirage appliquées, trois graines par thème) et [`mockups/iteration-7-corrections.html`](mockups/iteration-7-corrections.html) (grille constante, zone d'exclusion respectée, sens de comète variable).

### 7.4 Countdown — compte à rebours thématique

Élément de progression qui **réutilise le motif de la bannière de son thème** :

| Thème | Motif |
| --- | --- |
| Forêt Ancienne | Une liane pousse ; les feuilles apparaissent une à une ; le bourgeon doré atteint son cercle |
| Atelier Cuivré | L'aiguille du manomètre monte vers la zone rouge ; la conduite se remplit |
| Grimoire Émeraude | La comète se rapproche de l'étoile et grossit ; l'étoile s'embrase à l'arrivée |

Se remplit sur les **sept derniers jours** uniquement — au-delà, au repos.

> **Il est décoratif et redondant.** Il double le badge et le libellé relatif, il ne porte **jamais** une information qu'eux ne portent pas. Il n'apparaît que sur **un seul élément à la fois** : la prochaine séance.

### 7.5 IdentityLabel

Composant unique par lequel passe **tout** affichage d'un nom d'identité. Voir EXPERIENCE.md pour la règle d'emploi. Porte les icônes `écu` (personnage) et `silhouette` (joueur), en SVG inline.

### 7.6 BottomNav / TopNav

Quatre destinations : **Parties · Personnages · Calendrier · Compte**. Barre basse sur mobile, barre haute sur desktop, mêmes entrées. Icônes SVG inline, libellés toujours présents. L'entrée active est teintée `{colors.accent-1}`.

**Neutre sur les écrans contextualisés** (29.4/29.5, delta) : dès qu'un écran affiche un `ContextualHeader` (§7.6 bis), aucune entrée de `BottomNav`/`TopNav` ne porte la teinte active, y compris celle par laquelle on est arrivé — cf. `EXPERIENCE.md` § Navigation contextuelle locale pour le raisonnement.

### 7.6 bis ContextualHeader

*Ajouté avec la sous-navigation contextuelle (29.4/29.5, delta).* Remplace la zone jusqu'ici vide du bandeau du haut, sur les écrans qui en ont besoin. Trois éléments alignés horizontalement, sur le même fond dégradé que `BottomNav`/`TopNav` (`{colors.surface-bg}` → `{colors.primary-bg}`, 180°) :

- **Wordmark réduit** : le nom de l'app en typographie (dégradé `{colors.gradient-cta}` sur le texte), taille réduite (~0.75× la taille du wordmark plein), cliquable, retour à l'accueil. Jamais un logo graphique — la base interdit toujours l'image de marque (§1).
- **Titre** : le nom de l'écran (nom de partie, de personnage…), poids 600-700, tronqué avec ellipse si trop long.
- **Sous-titre optionnel** : taille ~0.72× le titre, teinte `{colors.text-muted}`, sous le titre. N'apparaît que quand `EXPERIENCE.md` §4.8 le justifie pour l'écran — jamais un slot systématiquement rempli.

Sous ce bandeau, quand l'écran en a une : la **sous-navigation locale**, rangée d'onglets sur `{colors.surface-bg}` (fond distinct du bandeau, dégradé), entrée active teintée `{colors.accent-1}` **et** en gras — même règle de double signal que `BottomNav`/`TopNav`.

### 7.7 ListControlBar

Barre de contrôles de la liste : icônes de mode d'affichage (**jamais les libellés texte** — refus explicite de l'utilisateur), tri, filtres. Recherche **sur desktop uniquement**.

Comportement : **masquage au défilement** (disparaît en descendant, revient en remontant) **+ pastille de résumé** (« Urgent · MJ ✕ ») dès qu'un réglage s'écarte du défaut, **+ révélation par icône**. Les trois patrons cohabitent, retenus ensemble.

### 7.8 DetailSurface

Surface unique et adaptative pour la consultation d'un texte descriptif : **panneau latéral à droite sur desktop, feuille montant du bas sur mobile**. Un seul composant, deux présentations selon la place — même patron que le `ConstraintPanel` existant, donc **aucun concept nouveau**.

Le **dépliant en place** (accordéon poussant le contenu vers le bas) reste un motif **autorisé mais d'exception** : réservé à un texte court sur un élément qui reste en place, et décidé explicitement à la conception de l'écran concerné, jamais par habitude.

### 7.9 CalendarCell — la case de calendrier *(ajouté le 2026-08-17)*

**Structure — trois bandes horizontales.** La case du Mois est divisée en **trois bandes empilées pleine largeur**, une par créneau : matin en haut, après-midi au milieu, soir en bas. La **position verticale porte le moment** — aucune icône, aucune légende n'est requise pour cette information.

| | Hauteur de bande | Texte |
| --- | --- | --- |
| Case large (≥ 100 px) | 20 px | Titre de l'événement, tronqué |
| Case étroite (< 100 px) | 13 px | Aucun — la forme seule subsiste |

Gouttière interne de 2 px entre bandes, rayon 3 px. **Le jour uniforme fusionne ses trois bandes en une seule** : quand les trois créneaux portent le même état sans événement, il n'y a rien à distinguer — et c'est ce qui empêche la grille de devenir bariolée.

Une bande ne superpose jamais deux traitements de fond. **Un seul rang gagne, bande par bande**, selon la préséance d'`EXPERIENCE.md` §4.3 bis ; le rendu ci-dessous en est la traduction visuelle.

| Rang | Fond | Signe de forme | Texte |
| --- | --- | --- | --- |
| Séance confirmée | `status-soon` à 28 %, filet intérieur à 75 % | filet — la seule bande cernée | Titre en gras, puis infos pratiques en `text-muted` |
| Vote en cours | `status-todo` à 16 %, **liseré gauche 3 px** pleine teinte | liseré | Libellé du vote + barre de tendance |
| Mes indisponibilités | `status-unavailable` à 28 % | — | — |
| Mes disponibilités | `accent-1` à 28 % | — | — |
| Personne n'a répondu | **trame diagonale** 45°, `status-unknown` à 40 % | trame | — |

> **Le fond ne porte jamais seul l'information.** Chaque rang au-dessus de « mes disponibilités » ajoute une forme — filet, liseré ou trame — et un texte. Conforme à P-1 et à l'acquis « aucune information par la couleur seule ».

**Piste de participation d'un vote** — hauteur 4 px, rayon 2 px. ⚠️ **Précisé le 2026-08-17, après un défaut de rendu.**

> **La piste entière représente la troupe, pas les répondants.** Sa longueur remplie dit **combien** ont répondu ; les couleurs disent **quoi** ; la part **tramée** dit ce qui manque.

Segments accolés depuis la gauche, largeurs proportionnelles **au nombre total de membres** : `accent-1` pour les oui, `status-todo` pour les peut-être, `status-unavailable` pour les non. Le reste de la piste porte la **trame diagonale de `status-unknown`** — la même que « personne n'a répondu » ailleurs dans le calendrier, donc aucun code nouveau à apprendre.

*Le défaut corrigé : tant que les largeurs étaient proportionnelles aux seuls répondants, « 1 votant sur 4, il a dit oui » et « 4 sur 4 tous oui » produisaient une piste verte pleine identique — un créneau voté par une personne se lisait comme un créneau plébiscité. La formulation écrite ici était déjà juste ; ce sont les planches qui ne la rendaient pas.*

**Compteur en doublure** — « 3/4 », en `text-muted` corps 9,5, affiché dès qu'il y a la place (vue Semaine, rail, Agenda) et abandonné en vue Mois étroite. **Elle demande la légende** : elle code par la proportion, pas par un symbole partagé.

### 7.9 bis GroupGauge — la disponibilité du groupe *(ajouté le 2026-08-17)*

**Canal séparé du fond de bande** : le fond dit *ma* situation, la jauge dit celle du groupe. Les deux ne se disputent jamais la même surface.

| | Spécification |
| --- | --- |
| **Jauge** (joueur, ou MJ > 6 membres) | Bande verticale de 5 px au **bord droit** de la bande, encart de 2 px, rayon 2 px. Remplie **par le bas**, à proportion des membres disponibles, en `color-available` |
| **Tous bloqués** | Jauge **pleine en `color-unavailable`** |
| **Aucun disponible et aucun avis** | Jauge **vide** — *à ne pas confondre avec la précédente* |
| **Pastilles** (MJ, ≤ 6 membres) | Une pastille de 7 px par membre, **ordre fixe de la troupe** : la **position** identifie la personne, la **couleur** son statut (`color-available` / `color-unavailable` / `color-unknown`) |

La bande réserve 11 px de marge droite quand elle porte une jauge. **Les noms vivent dans le rail**, jamais dans la case — même règle que partout : la forme survit à l'étroitesse, le texte se replie.

**Ma propre réponse** est rappelée en toutes lettres, jamais par la seule couleur : « tu as dit oui », en `accent-1`, corps 9.

**Cible de sélection.** Une bande est une cible de glissement à part entière : glisser le long d'une bande sélectionne **ce créneau** sur les jours traversés ; glisser sur le corps de la case sélectionne les **journées entières**. Deux gestes, une seule grille.

Référence visuelle : [`mockups/mois-complet-cinq-traitements.html`](mockups/mois-complet-cinq-traitements.html).

### 7.10 SlotIcon — les icônes de créneau *(ajouté le 2026-08-17)*

**Soleil levant** (matin) · **soleil haut** (après-midi) · **croissant de lune** (soir). SVG inline, 15 × 15 px, `stroke: text-muted`, épaisseur 1,6, extrémités et jonctions arrondies, `aria-label` explicite. Remplacent les libellés « Matin / Après-midi / Soir » en gouttière de la grille Semaine.

**Motif — la levée d'ambiguïté, pas le gain de place** (mesuré à +1,7 px par colonne, négligeable) : l'abréviation « M / AM / S » fait cohabiter trois lectures du même caractère sur un seul écran, `M` valant matin dans la gouttière et mardi **et** mercredi dans l'en-tête des colonnes.

**Portée : la gouttière de la vue Semaine et le rail de détail (§7.10 bis).** La case du Mois n'en porte pas : sa structure à trois bandes (§7.9) dit déjà le créneau par la position, et redoubler l'information par une icône dans 20 px serait du bruit. Dans le rail, l'icône **accompagne le mot** (« Matin ») au lieu de le remplacer : elle y est donc décorative et se marque `aria-hidden`, le nom accessible étant déjà porté par le texte.

### 7.10 bis DetailRail — le rail de détail *(ajouté le 2026-08-17)*

Bande **permanente sous la grille**, en vue Mois comme en vue Semaine, **à toutes les largeurs**. Jamais un panneau à ouvrir : aucun geste ne la commande. Comportement, états et arbitrages : EXPERIENCE.md §6 bis (principe 2) et §9.

| | Spécification |
| --- | --- |
| **Conteneur** | Fond `{colors.surface-container}`, rayon 10 px, bordure 1 px à 12 % de blanc, marge haute 8 px, padding 8 px / 12 px |
| **Libellé du jour** | Corps 11, `{colors.text-muted}`, capitales, interlettrage 0,07 em, marge basse 5 px. En vue Semaine, il nomme **le jour et le créneau touché** — « Jeudi 20 août — soir » |
| **Ligne de créneau** | **Toujours trois**, matin → après-midi → soir. Séparateur haut 1 px à 7 % de blanc, sauf la première |
| **Colonne de créneau** | Largeur fixe 78 px (62 px sous le seuil), `SlotIcon` + libellé, corps 11 (10 sous le seuil). Libellé abrégeable — « Après-m. » |
| **Valeur** | Corps 12,5 (11,5 sous le seuil). Titre en gras ; accessoires — lieu, heure, note — en `{colors.text-muted}` corps 11, repliés en premier quand la place manque |
| **Créneau sans objet** | Son état **écrit en toutes lettres** : « Disponible » en `{colors.color-available}`, « Indisponible » en `{colors.color-unavailable}`, « Rien de prévu » en `{colors.text-muted}` |
| **Ligne activable** | Une ligne portant une séance est un **bouton** : focalisable, atteignable au clavier, survol et focus visibles. Les autres ne le sont pas et ne s'en donnent pas l'air |

> ⚠️ **Deux corrections actées le 2026-08-17.**
> **Le rail ne disparaît plus au-delà de 500 px.** Les planches le faisaient s'effacer en paysage et sur ordinateur ; il y est désormais **la surface la plus riche** — la largeur sert à déplier les accessoires, jamais à retirer la bande.
> **Les trois créneaux sont toujours rendus.** Le rendu mobile de la planche contractuelle en omettait les vides et n'affichait que deux lignes. Un créneau vide dit son état ; il ne se tait pas. « Matin » ne disparaît sous aucune condition.

**Ce que le rail porte, et quand.** Le titre de séance et son créneau dès sa livraison ; les **informations pratiques** (§ FR-50) quand elles existeront ; les **noms du groupe** et leur statut (§7.9 bis) ; le compteur de participation « 3 / 4 » (§7.9). Ces quatre contenus n'arrivent pas ensemble — le conteneur, lui, est stable dès le premier jour.

**Aucune information par la couleur seule** : « Disponible » est un mot avant d'être un vert.

### 7.11 CalendarLegend — la légende *(ajouté le 2026-08-17)*

Panneau **dépliable**, fermé par défaut, groupé en deux blocs : *se passent d'explication* (disponible, indisponible) et *demandent la légende* (séance, vote, tendance, trame). Chaque ligne : pastille 14 × 14 px reproduisant **exactement** le traitement réel de la case, puis le libellé.

> **L'écran doit rester lisible sans elle.** La légende explique un codage ; elle ne le remplace jamais. Une information qui n'existerait que dans la légende est un défaut de conception, pas un cas d'usage de ce composant.

---

## 8. Motion

**Section nouvelle** — la base n'en comportait aucune.

### Les trois règles

1. **`prefers-reduced-motion: reduce` coupe tout.** Sans exception.
2. **Aucune animation ne porte d'information.** Au repos, la composition reste complète et lisible — rien ne manque.
3. **N'animer que `transform` et `opacity`**, que le compositeur graphique traite sans repeindre la page.

### Portée

> L'animation n'existe que sur le **mode grande carte**. Les modes moyen et liste n'en portent **aucune**.

Décidé pour la batterie et pour la distraction : une liste où tout bouge tire l'œil vers le mouvement plutôt que vers l'information — à rebours de l'objectif du palier.

### Animations par thème

| Thème | Animation de bannière |
| --- | --- |
| Forêt Ancienne | Lucioles ascendantes ou feuilles tombantes (selon le tirage) ; halos pulsant en décalé |
| Atelier Cuivré | Rouages engrenés tournant en sens et vitesses alternés ; aiguille du manomètre oscillante ; volutes de vapeur |
| Grimoire Émeraude | Comète(s) traversant en boucle ; étoiles scintillant en décalé ; halo respirant |

### Règle de construction des éléments générés en mouvement

Extraite de **deux défauts successifs** rencontrés dans ce run (tête de comète désalignée de sa queue, puis comète avançant « en crabe ») :

> **Tout élément généré en mouvement dérive son orientation ET sa trajectoire d'un paramètre unique.** Jamais deux valeurs à tenir accordées à la main.

Application concrète : un conteneur pivoté de θ, dans lequel l'animation n'applique qu'un `translateX` **local**. Un seul θ pilote alors l'orientation de la queue, la position de la tête et la direction de vol — la désynchronisation devient impossible, quel que soit le tirage.

Démonstration avant/après : [`mockups/iteration-8-cometes-trajectoire.html`](mockups/iteration-8-cometes-trajectoire.html). Comptes à rebours animés : [`mockups/palettes-3-pistes-et-rebours-animes.html`](mockups/palettes-3-pistes-et-rebours-animes.html).

---

## 9. Do's and Don'ts

**À faire**

- Doubler toute information portée par la couleur d'un second signal : icône, libellé, ou traitement typographique.
- Faire porter l'état précis par le **libellé**, et l'urgence seule par la teinte.
- Vérifier toute nouvelle couleur de statut contre les **deux accents** du thème où elle vivra.
- Dériver orientation et trajectoire d'un **paramètre unique** dans tout élément généré animé.
- Faire passer tout affichage de nom par `IdentityLabel`.

**À ne pas faire**

- Ajouter une cinquième teinte de statut pour un état supplémentaire — le libellé y suffit.
- Faire dériver une couleur de statut d'un accent de thème (c'est le défaut corrigé ici).
- Animer une carte en mode moyen ou liste.
- Confier à une animation une information que le badge ne porte pas.
- Écrire les modes d'affichage en toutes lettres dans la barre de contrôles.
- Placer quoi que ce soit dans la zone d'exclusion du manomètre.
- Réduire une bannière complète en vignette de 28 px : le mode liste a son **propre** rendu (vignette atténuée + monogramme).
