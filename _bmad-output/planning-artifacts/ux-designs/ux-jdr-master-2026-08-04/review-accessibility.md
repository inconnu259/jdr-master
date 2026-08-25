---
title: Revue accessibilité — spines UX Palier 9 (DESIGN.md + EXPERIENCE.md)
status: review
date: 2026-08-05
reviewer: relecteur accessibilité (BMad)
scope: >
  Vérification que les décisions du palier ne créent pas d'exclusion évitable.
  Cadré par P-2 du PRD : « accessibilité = vigilance, pas conformité ».
  Ce n'est PAS un audit WCAG et aucun seuil chiffré n'est réclamé comme critère d'acceptation.
sources:
  - "./DESIGN.md"
  - "./EXPERIENCE.md"
  - "../ux-jdr-master-20260626/EXPERIENCE.md §7 (Accessibility Floor de la base)"
---

# Revue accessibilité — Palier 9

## Verdict

Le palier est **globalement solide et va dans le bon sens** : le remplacement de `status-available: var(--accent-1)` par trois palettes vérifiées corrige un vrai défaut d'exclusion, le brouillon-en-contour-tireté et l'imminence-en-densité sont deux bonnes décisions non chromatiques, et la règle de mouvement est propre. Mais **la promesse « rien ne repose sur la couleur seule » n'est pas tenue en trois endroits identifiables**, et l'invariant de palette du §2 n'a manifestement été vérifié qu'en vision normale : trois collisions apparaissent en deutéranopie/protanopie, dont une entre deux statuts du même thème.

Aucune des corrections proposées ci-dessous ne demande d'audit, de seuil chiffré ni de reprise rétroactive. Ce sont des **précisions de spec**, à faire une fois, avant l'écriture des stories.

---

## 0. Méthode et limites

- **Contraste** : formule de luminance relative WCAG 2.x, calculée sur les valeurs exactes des spines. Les seuils (4.5:1 / 3:1) sont cités **comme repères de lecture**, pas comme critères d'acceptation — c'est la lecture compatible avec P-2 : un ratio sert à *situer* un choix, pas à le valider.
- **Daltonismes** : simulation Viénot-Brettel-Mollon 1999 (matrices sur RGB linéaire) pour protanopie, deutéranopie, tritanopie ; comparaison par ΔE CIE76 en L\*a\*b\*. Repère d'usage : **ΔE < 25 = risque réel de confusion** à petite taille, ΔE < 15 = confusion quasi certaine. La simulation modélise les dichromatismes complets ; les anomalies partielles (plus fréquentes) sont moins sévères.
- **Non vérifié** : la valeur du token `{colors.text-muted}` (base, non lue dans ce run) — elle porte le badge Brouillon *et* le nom de joueur d'`IdentityLabel`. À contrôler une fois, cf. §A.4.
- Les planches `.working/` et `mockups/` n'ont pas été ouvertes (consigne de run). La revue porte sur les **décisions écrites**, qui font foi en cas de conflit.

---

## A. Contraste

### A.1 Les 12 couleurs de statut sur le fond de leur thème

Ratios calculés sur `primary-bg` puis `surface-bg`.

| Thème | Statut | Hex | / primary | / surface | Lecture |
| --- | --- | --- | --- | --- | --- |
| Émeraude | todo | `#f0a030` | 9.13 | 8.32 | confortable |
| Émeraude | live | `#3fd4ff` | 11.28 | 10.28 | confortable |
| Émeraude | soon | `#ff7ad9` | 8.44 | 7.69 | confortable |
| Émeraude | **done** | `#5a5a6a` | **2.90** | **2.64** | **sous 3:1** |
| Forêt | todo | `#ff8a3d` | 8.27 | 7.62 | confortable |
| Forêt | live | `#4fd6c1` | 10.82 | 9.97 | confortable |
| Forêt | soon | `#6f8fd8` | 6.09 | 5.61 | correct |
| Forêt | **done** | `#5f6b60` | **3.47** | **3.20** | limite |
| Steampunk | todo | `#ffd21f` | 12.92 | 11.98 | confortable |
| Steampunk | live | `#3fb894` | 7.57 | 7.03 | confortable |
| Steampunk | soon | `#6f9fd8` | 6.80 | 6.31 | correct |
| Steampunk | **done** | `#6b6459` | **3.20** | **2.97** | limite / sous 3:1 |

**Onze sur douze sont larges.** Le seul point est `status-done`, dans les trois thèmes.

### A.2 Le vrai problème n'est pas la couleur nue, c'est le badge teinté

Le `StatusBadge` pose le texte **de la couleur du statut** sur un fond **de la même couleur à 15-26 %**. Ce fond remonte la luminance et écrase le contraste du texte :

| Thème | Statut | Texte / fond du badge | Fond du badge / surface |
| --- | --- | --- | --- |
| Émeraude | todo | 6.25 | 1.33 |
| Émeraude | live | 7.59 | 1.35 |
| Émeraude | soon | 5.95 | 1.29 |
| Émeraude | **done** (26 %) | **2.16** | 1.23 |
| Forêt | todo | 5.87 | 1.30 |
| Forêt | live | 7.30 | 1.37 |
| Forêt | soon | 4.56 | 1.23 |
| Forêt | **done** (26 %) | **2.49** | 1.28 |
| Steampunk | todo | 8.07 | 1.49 |
| Steampunk | live | 5.55 | 1.27 |
| Steampunk | soon | 5.03 | 1.25 |
| Steampunk | **done** (26 %) | **2.34** | 1.27 |

`status-done` en badge tombe à **2.2–2.5:1 en `text-sm`** (~13 px). C'est en dessous de ce qui reste lisible pour la plupart des presbytes, et le badge *done* est justement celui qu'on lit en consultation d'archive, souvent le soir, souvent sur téléphone en luminosité basse.

C'est un **choix de design assumé** (« terminé — consultable, en retrait ») et il ne faut pas le renverser : la mise en retrait est utile. Mais « en retrait » et « illisible » ne sont pas la même chose.

> **Correction proposée (peu coûteuse)** : pour la variante `done` uniquement, **découpler la couleur du texte de la couleur du fond** — garder le fond cendre à 26 % et écrire le libellé en `{colors.text-secondary}` plutôt qu'en `status-done`. La hiérarchie visuelle est conservée (le badge reste le plus terne des cinq), la lisibilité remonte franchement, et aucune palette n'est touchée.

### A.3 Le badge plein du palier « imminent » n'a pas de couleur de texte

`StatusBadge` §7.1 : au palier imminent, « badge **plein**, texte sur fond ». **La couleur de ce texte n'est écrite nulle part.** Or l'imminence porte `status-soon`, et les trois valeurs de `soon` sont des couleurs claires :

| Thème | `soon` | texte blanc | texte noir |
| --- | --- | --- | --- |
| Émeraude | `#ff7ad9` | **2.32** | 9.04 |
| Forêt | `#6f8fd8` | **3.18** | 6.60 |
| Steampunk | `#6f9fd8` | **2.75** | 7.63 |

Le réflexe d'implémentation en thème sombre est d'écrire en blanc — ce qui donne **2.3 à 3.2:1 sur le seul badge que le palier veut rendre impossible à manquer**. C'est un ratage évitable d'une ligne de spec.

> **À écrire** : le texte du badge plein est **sombre** — `{colors.primary-bg}` du thème, ou un noir dédié. Formulation utile : *« badge plein = inversion : fond opaque de la teinte de statut, texte en couleur de fond du thème. »*

### A.4 Deux points à contrôler une fois

- **Badge Brouillon** : `color: text-muted` + contour tireté + fond transparent. Si `text-muted` est un gris faible sur `surface-bg`, le badge brouillon est à la fois le moins contrasté **et** celui dont l'information (« ce que tes joueurs ne voient pas ») est la plus lourde de conséquences pour le MJ. Le tireté ne compense pas un texte trop pâle.
- **`IdentityLabel`, nom de joueur** : même token `text-muted`. Il est déjà secondaire par la position, l'italique/romain et l'icône — il n'a pas besoin d'être *aussi* le plus pâle. Trois signaux de mise en retrait cumulés, c'est un de trop.

---

## B. Distinguabilité pour les daltonismes

L'invariant du §2 est bon (« distinguables entre eux **et** éloignés des deux accents »). Le problème est qu'il **n'a été appliqué qu'en vision normale** : la note de conception sur le Steampunk raisonne en écart de teinte (« 24° d'écart »), ce qui est exactement le raisonnement qui ne survit pas à un dichromatisme.

ΔE, vision normale puis simulée. Les paires à risque uniquement (ΔE < 25 quelque part) :

| Thème | Paire | normale | deutan | protan | tritan |
| --- | --- | --- | --- | --- | --- |
| Émeraude | **live / soon** (cyan / rose) | 87.3 | **18.1** | **23.4** | 82.0 |
| Émeraude | soon / accent-1 (rose / sauge) | 99.6 | **30.4** | 57.6 | 80.8 |
| Forêt | **todo / accent-2** (orange / or) | 36.8 | **10.4** | **21.3** | 31.1 |
| Forêt | todo / accent-1 (orange / vert) | 101.8 | 33.7 | **15.6** | 95.0 |
| Forêt | accent-1 / accent-2 | 72.9 | 40.6 | **22.7** | 71.6 |
| Steampunk | **done / accent-2** (fonte / bronze vert) | 27.1 | **6.0** | **12.9** | **23.6** |
| Steampunk | **live / done** (vert-de-gris / fonte) | 49.6 | **23.1** | 29.7 | 46.0 |
| Steampunk | live / accent-2 (vert-de-gris / bronze) | 26.7 | **20.2** | **21.7** | 26.4 |
| Steampunk | accent-1 / accent-2 (cuivre / bronze) | 63.6 | 46.7 | 29.2 | 63.9 |

**Trois constats, par gravité :**

1. **Émeraude — `live` contre `soon` s'effondre** (ΔE 18 deutan, 23 protan). C'est une collision **statut contre statut**, la seule du lot, et elle porte sur « En cours » vs « À venir » — deux états qui cohabitent en permanence dans la même liste, souvent sur deux cartes voisines. Le cyan `#3fd4ff` et le rose `#ff7ad9` ont des luminances presque identiques et leur opposition tient entièrement sur l'axe rouge-vert. Pour un deutéranope, ce sont **deux bleus pâles**.
   → **Ceci contredit directement l'invariant écrit au §2.** Correction : écarter les deux en luminance (assombrir `soon` ou éclaircir `live`), ou déplacer `soon` vers un violet nettement plus sombre. La bonne nouvelle : dans la liste, `live` et `soon` tombent aussi sous des intertitres différents — voir §C.2, c'est ce filet qu'il faut sécuriser.

2. **Steampunk — `done` contre `accent-2` disparaît** (ΔE 6.0 deutan, 12.9 protan, 23.6 tritan : confondu dans **les trois** dichromatismes). Fonte `#6b6459` et bronze vert `#4a7c59` sont la même couleur pour un daltonien. `live` contre `accent-2` est également faible (ΔE ~20-22). L'invariant « éloignés des deux accents » n'est donc pas tenu dans ce thème, et il ne l'est pas non plus en vision normale pour `live`/`accent-2` (ΔE 26.7, déjà juste). Conséquence concrète : un élément décoratif bronze et une bande d'état « terminé » se ressemblent.

3. **Forêt — `todo` contre `accent-2` disparaît** (ΔE 10.4 deutan, 21.3 protan). Orange d'automne `#ff8a3d` et or `#f0c040` sont déjà proches en vision normale (ΔE 36.8) et fusionnent en deutéranopie. Or `todo` est **la couleur de l'urgence** — celle qui doit ressortir. Elle se confond avec l'accent décoratif du thème, exactement le défaut que l'amendement 4 corrigeait pour le Steampunk. **Le défaut a été corrigé dans le thème où il avait été repéré, pas dans celui où il n'avait pas été cherché.**

> **Recommandation transverse, dans l'esprit de P-2** : ne pas exiger de seuil, mais **compléter la règle d'invariant** d'une ligne :
> *« Vérification faite en vision normale **et** en simulation deutéranope — c'est la plus fréquente et la plus sévère pour les couples chaud/chaud et vert/gris. »*
> C'est une **règle de conception, appliquée une fois par palette**, pas un critère d'acceptation par story. Coût : une passe de vérification quand on crée un thème. Compatible avec P-2, qui refuse les audits rétroactifs, pas la vigilance en amont.

**Ce qui tient très bien** : toutes les paires todo/soon, todo/done, soon/done restent > 35 partout, dans les trois thèmes et les trois dichromatismes. La structure « un chaud pour l'urgence, un froid pour l'attente, un gris pour le fini » est robuste. Le problème n'est pas l'architecture de la palette, ce sont trois valeurs.

---

## C. Redondance du signal

La promesse est écrite deux fois (`DESIGN.md` §9, `EXPERIENCE.md` §7) : *« aucune information n'est portée par la couleur seule »*. Elle est tenue pour l'imminence (densité de remplissage — vraiment bien vu), pour le brouillon (contour tireté) et pour l'identité (italique + icône). **Elle ne l'est pas dans les trois cas suivants.**

### C.1 « En vote » — le même libellé pour deux couleurs (le plus grave)

`DESIGN.md` §2 place le même état dans deux lignes du tableau :

- `status-todo` — En vote *(tu n'as pas répondu)*
- `status-live` — En vote *(tu as répondu)*

Et `EXPERIENCE.md` §5 le confirme : *« la même séance, deux badges selon qui la regarde »*.

Si le libellé du badge est « En vote » dans les deux cas, alors **la seule différence entre « tu dois agir » et « c'est fait » est la teinte**. C'est précisément le cas d'usage central du palier (« est-ce que ça me concerne maintenant ? »), et c'est le seul endroit du système où deux états portent le même mot. Pour un deutéranope en thème Émeraude, où `todo` ambre et `live` cyan sont heureusement très éloignés, ça passe ; mais le principe, lui, est cassé partout.

Le §3 d'`EXPERIENCE.md` donne pourtant la solution : *« les libellés d'état sont des mots, pas des codes »*, avec l'exemple « **Réponds au vote** ». Il suffit de l'imposer.

> **À écrire** : *« Deux états dépendants du lecteur ne partagent jamais le même libellé. « En vote » se dit **« Réponds au vote »** quand le lecteur n'a pas répondu et **« Vote en cours »** quand il a répondu. La couleur double le libellé, elle ne le remplace jamais. »*
>
> La même vérification est due pour tout futur état lecteur-dépendant : la règle du §5 (« calculé côté serveur, par lecteur ») doit inclure **le libellé**, pas seulement la teinte.

### C.2 Le mode liste porte l'état par la pastille seule

`EXPERIENCE.md` §4.1 :

| Mode | Contenu |
| --- | --- |
| Grande vignette | … signaux **en toutes lettres** |
| Moyen | … signaux **en toutes lettres** |
| **Liste** | **Pastille d'état**, vignette, nom, **compte de signaux** |

En mode liste — celui qui affiche **~12 éléments par écran**, donc celui où l'on balaie le plus vite — l'état n'est plus écrit : il est réduit à une pastille colorée et à un nombre. **Ce mode est la seule surface du palier où l'information est effectivement portée par la couleur seule.**

Deux filets existent, tous deux incomplets :

- **Le regroupement par urgence** (« Ça t'attend / En cours / Terminées ») redonne l'information par la position. Mais (a) il ne couvre pas `soon` — « À venir » n'a pas d'intertitre dans la liste des trois donnée au §4.1 ; et (b) la barre de contrôles propose un **tri**, et rien ne dit ce que deviennent les intertitres quand on trie par nom ou par date. Si le tri les supprime, le filet disparaît avec eux.
- **Le compte de signaux** dit *combien*, jamais *quoi*.

> **À trancher explicitement** : soit la pastille du mode liste reçoit un second signal de forme (pastille pleine / creuse / tiretée selon la famille d'état), soit **les intertitres de regroupement sont déclarés permanents en mode liste, quel que soit le tri** — auquel cas il faut ajouter « À venir » à la liste des intertitres. La seconde option est la moins chère et la plus cohérente avec « l'écran a déjà fait le tri ».
>
> Dans tous les cas : `aria-label` complet sur la ligne, incluant l'état en toutes lettres. Un lecteur d'écran ne voit ni pastille ni intertitre visuel.

### C.3 Le brouillon n'a pas d'équivalent dans le vocabulaire pastille / rail

`DESIGN.md` §2 : *« le brouillon n'est pas une cinquième couleur : c'est un contour tireté »*. Excellent — pour le **badge**.

Mais §7.2 pose que le `StateRail` (bande de 4 px) est *« l'équivalent exact de la pastille du mode liste »*, et §4.1 que c'est un *« seul vocabulaire d'état quel que soit le mode d'affichage »*. Or **un tireté n'est pas représentable dans une bande de 4 px de large**, ni dans une pastille de quelques pixels. Le brouillon n'a donc **aucune représentation** dans le vocabulaire rail/pastille — ce qui casse la promesse d'équivalence exacte entre les trois modes, et laisse au développeur le choix d'improviser (le plus probable : une teinte de plus, exactement ce que le §9 interdit).

> **À écrire** : la forme que prend le brouillon dans le rail et dans la pastille. Un rail **segmenté** (tirets verticaux de 4 px) est l'équivalent formel direct du contour tireté et se lit encore à 4 px. À défaut, poser que **le mode liste et le mode moyen affichent le brouillon par un libellé, jamais par le rail seul**.

### C.4 L'entrée de navigation active est signalée par la teinte seule

`DESIGN.md` §7.6 : *« L'entrée active est teintée `{colors.accent-1}`. »* C'est le seul traitement mentionné. Les libellés sont bien toujours présents (bon point), mais ils sont présents sur **les quatre** entrées — ils ne disent donc pas laquelle est active. « Où suis-je ? » repose sur une différence de couleur entre quatre étiquettes identiques par ailleurs.

C'est mineur en gravité (on peut souvent le déduire du contenu de l'écran), mais c'est gratuit à corriger et ça figure au premier écran de l'application.

> **À écrire** : l'entrée active cumule **teinte + icône pleine (vs contour) + poids 600**, et porte `aria-current="page"`. Trois signaux dont deux non chromatiques, pour zéro coût.

### C.5 Les icônes de la barre de contrôles sont hors du champ de la règle aria

`EXPERIENCE.md` §7 : *« Les icônes **d'identité et de navigation** portent toujours un libellé ou un `aria-label` explicite. »*

La liste omet exactement le composant où le texte a été **explicitement refusé par l'utilisateur** : la `ListControlBar`, dont §7.7 dit « icônes de mode d'affichage, **jamais les libellés texte** ». C'est le seul endroit du système où une commande n'a aucun texte visible — et c'est le seul endroit que la règle d'accessibilité ne couvre pas. L'omission est probablement involontaire, mais elle laisse la porte grande ouverte à trois boutons sans nom accessible.

Le refus du libellé visible est parfaitement légitime et n'est pas remis en cause ici : un nom accessible et une infobulle ne sont pas un libellé à l'écran.

> **À écrire** : étendre la règle — *« Toute commande sans libellé visible (barre de contrôles, menu ⋮, actions d'en-tête) porte un `aria-label` explicite et une infobulle au survol sur desktop. Le groupe de modes d'affichage est un groupe de boutons à état : `aria-pressed` / `role="radiogroup"`, et l'état actif est signalé autrement que par la teinte. »*

---

## D. Mouvement

**Les trois règles du §8 sont bonnes et se suffisent.** `prefers-reduced-motion` qui coupe tout sans exception, aucune information portée par une animation, et une composition complète au repos : c'est le bon niveau d'exigence, et le Flow 4 va jusqu'à en faire la démonstration (« pour qui a coupé les animations, le badge plein et le libellé disent exactement la même chose »). Le `Countdown` déclaré *décoratif et redondant*, limité à un seul élément à la fois, est irréprochable. Restreindre l'animation au seul mode grande carte est également une bonne décision, y compris pour les troubles de l'attention.

**Deux trous, tous deux de rédaction :**

### D.1 La « Portée » du §8 est factuellement fausse, et laisse des transitions sans règle

> *« L'animation n'existe que sur le mode grande carte. Les modes moyen et liste n'en portent aucune. »*

Or les spines décrivent au moins trois autres mouvements :

- le **masquage au défilement** de la barre de contrôles (`EXPERIENCE.md` §4.2, §6) — actif dans **tous** les modes ;
- la **feuille montant du bas** / le **panneau latéral** de `DetailSurface` (§7.8), dont §5 dit qu'il reprend le patron du `ConstraintPanel`, lequel a une transition explicite dans la base ;
- le `Countdown`, qui vit sur la vue de partie et non sur une carte.

Lue littéralement, la règle de portée dit que ces transitions n'existent pas — donc rien ne les régit. Comme la règle 1 dit « coupe **tout**, sans exception », l'implémentation correcte existe, mais elle repose sur une contradiction interne que quelqu'un finira par arbitrer dans le mauvais sens.

> **Correction** : reformuler en *« Les **animations décoratives** (bannières, compte à rebours) n'existent que sur le mode grande carte. Les **transitions fonctionnelles** (feuille de détail, masquage de la barre, changement de mode) existent partout et sont soumises aux trois règles ci-dessus — en `reduced-motion`, l'état final est appliqué instantanément, jamais supprimé. »*

### D.2 Le masquage au défilement n'est pas qu'une animation

Le comportement retire des commandes de l'écran en réaction au geste de lecture. Pour un utilisateur qui défile par petits à-coups (tremblement, navigation au doigt sur un grand écran), la barre peut clignoter entrée/sortie ; et couper les animations ne change rien au fait que **les commandes disparaissent**. Le palier a heureusement retenu la **révélation par icône** en plus, ce qui garantit un chemin de retour — c'est ce qui sauve le motif.

> **À écrire, une ligne** : *« Sous `prefers-reduced-motion`, la barre de contrôles ne se masque pas au défilement : elle reste en place. »* Le masquage est un gain de densité, pas une fonction ; le supprimer pour qui a demandé moins de mouvement ne coûte rien. Et : la pastille de résumé et l'icône de révélation **ne se masquent jamais** — elles sont le chemin de retour.

Rien d'autre à signaler : aucune animation du palier ne clignote, ne défile automatiquement, ni ne dépasse les seuils de photosensibilité. Les volutes, comètes et rouages sont lents et en boucle.

---

## E. La tension déclarée en §7 — la formulation est bonne, mais incomplète

Rappel de la formulation proposée :

> *« Le plancher existant est un acquis à ne pas régresser — ce qui est déjà à 44 px le reste — mais il cesse d'être un critère d'acceptation à décliner dans chaque story. »*

**Le principe est le bon**, et l'arbitrage proposé est raisonnable : il honore P-2 (pas de seuil en critère d'acceptation, pas d'audit rétroactif) sans jeter le travail déjà fait. Je ne demande pas de le renverser. **Deux amendements**, en revanche :

### E.1 « Ne pas régresser » ne dit rien des surfaces neuves — c'est-à-dire de tout ce palier

Le plancher de la base est **entièrement écrit pour le calendrier** : cellules de `CalendarWeekView`, cases de `CalendarMonthView`, ordre de focus du `ConstraintPanel`, `aria-label` des segments. Une règle de non-régression protège donc… le calendrier.

Or ce palier crée une barre de navigation basse, une barre de contrôles en icônes, trois modes de carte, une surface de détail et une grille de saisie par glissement. **Aucune de ces surfaces n'a d'acquis à ne pas régresser** : elles n'existaient pas. Formulée telle quelle, la règle laisse exactement le neuf sans repère — l'inverse de l'intention.

> **Amendement proposé** :
> *« Le plancher chiffré de la base cesse d'être un critère d'acceptation. Il devient une **valeur de conception par défaut** : on dessine à 44 px de cible tactile et on choisit des couleurs franches parce que c'est le défaut du système, pas parce qu'une story l'exige. Une surface peut s'en écarter sciemment, sans justification formelle. Ce qui est en revanche **vérifié à la conception** (une fois, pas par story) : chaque nouvelle palette de statut passée en simulation deutéranope, et chaque information portée par la couleur doublée d'un second signal. »*
>
> Différence de fond : on déplace le plancher de « critère de recette » vers « défaut de dessin ». C'est exactement la définition de *vigilance plutôt que conformité*, et ça couvre le neuf comme l'ancien.

### E.2 Le mot « réécrit » risque de faire disparaître les acquis clavier de la base

L'en-tête d'`EXPERIENCE.md` (ligne 19) annonce que le document **réécrit** le plancher d'accessibilité. La section §7 qui le remplace tient en cinq puces — toutes portant sur la couleur et le mouvement. **Ni la navigation clavier, ni l'ordre de focus, ni les `aria-label` du calendrier n'y figurent.** Lu strictement, le delta supprime donc les règles de focus du `ConstraintPanel` et le patron de grille ARIA du calendrier, qui sont pourtant les seules choses du plancher de base que P-2 ne remet **pas** en cause (P-2 retire les seuils chiffrés ; un ordre de focus n'est pas un seuil).

C'est certainement involontaire — `DESIGN.md` §7.8 dit d'ailleurs que `DetailSurface` reprend le patron du `ConstraintPanel`, ce qui suppose que ses règles de focus survivent.

> **Correction, un mot** : remplacer *« réécrit »* par *« **amende** le plancher d'accessibilité »*, et ajouter une puce :
> *« Les règles non chiffrées de la base restent en vigueur : ordre de focus à l'ouverture d'un panneau et retour du focus à la fermeture (`DetailSurface` en hérite), navigation du calendrier aux flèches, `aria-label` d'état des cellules. »*

---

## F. Cibles tactiles et gestes

### F.1 Le glissement de sélection — le seul point où le palier peut vraiment exclure quelqu'un

`EXPERIENCE.md` §4.4 et §6 font du glissement le geste de déclaration en masse : *« lundi soir → jeudi soir en un geste »*, et §4.4 pose que la vue Semaine **« devient l'outil de déclaration en masse »*, ce qui répond « frontalement à FR-32 ».

Trois choses ne sont pas écrites, et les trois comptent :

1. **Le glissement est-il le seul chemin ?** Rien ne dit que le **tap sur une cellule unique** reste disponible en vue Semaine. Si le glissement devient le chemin unique, la déclaration en masse est fermée à qui a un tremblement, une mobilité réduite d'un doigt, un stylet capacitif imprécis, ou navigue au clavier. Un glissement précis maintenu sur quatre cellules d'une « grille resserrée » est un geste exigeant.
   → **À écrire** : *« Le glissement est un accélérateur, jamais le seul chemin. Le tap cellule par cellule reste disponible partout où le glissement l'est. »* C'est probablement déjà l'intention — il faut juste que ce soit dit, parce que « devient l'outil de déclaration en masse » se lit aussi comme un remplacement.

2. **Le conflit glissement / défilement vertical.** §6 proscrit le balayage horizontal (bonne décision, bien motivée), mais une grille Semaine sur mobile défile verticalement **et** se sélectionne par glissement vertical. La désambiguïsation habituelle est l'**appui long puis glissement** — or un appui long est une contrainte de **temporisation**, qui exclut à son tour (tremblement, lenteur motrice) et n'est mentionnée nulle part.
   → **À trancher explicitement**, et si la réponse est l'appui long : *« toute interaction dépendante d'une durée a un chemin alternatif sans contrainte de temps »* (ici : le tap simple, cf. point 1). Alternative plus sûre : un **mode « sélection » explicite** activé par un bouton, dans lequel le glissement est sans ambiguïté et le défilement se fait à deux doigts.

3. **Aucun équivalent clavier.** La base donne la navigation aux flèches dans la grille, mais rien pour une **plage**. `Maj + flèches` pour étendre une sélection, `Espace` pour valider, coûte peu et ouvre la fonction phare du palier au clavier et aux dispositifs de commande alternatifs. À défaut, l'accepter explicitement comme limite connue plutôt que par omission.

**Un point positif à souligner** : la décision de §4.4 — *« glissement à la journée entière en vue Mois, parce que les segments de ~15 px ne sont pas attrapables au doigt »* — est exactement le bon raisonnement, et il est déjà celui de la base (« les 3 segments ne sont pas des cibles de tap indépendantes »). C'est de la vigilance appliquée sans qu'on ait eu à la réclamer.

### F.2 Barre de navigation basse

`~50 px + zone sûre`, 4 destinations, icône **et** libellé. Sur un écran de 375 px, chaque destination fait ~93 px de large : la cible est confortable en largeur. En hauteur, 50 px pour une icône **plus** un libellé laisse une icône de ~20 px et un texte de ~10 px — la **cible** reste à 50 px (toute la zone doit être cliquable, pas seulement l'icône), donc l'accès est bon, mais le **libellé** sera très petit. Il ne porte aucune information seule (l'icône le double), donc ce n'est pas bloquant.

Deux points à écrire :

- **La zone sûre est bien mentionnée** — bon réflexe, c'est ce qui évite le classique conflit avec la barre gestuelle iOS. À conserver tel quel.
- **Collision avec la feuille de détail et avec la grille Semaine** : la feuille montant du bas (`DetailSurface`) et la barre basse occupent la même zone. Rien ne dit laquelle passe devant, ni si la barre reste atteignable quand la feuille est ouverte. Plus embêtant : le bas de l'écran est aussi là où **se termine un glissement de sélection** sur la grille Semaine — relâcher son doigt sur la barre de navigation en croyant terminer une sélection ferait changer d'écran et perdre la saisie.
  → **À écrire** : *« Pendant un glissement de sélection, la barre de navigation basse est inerte. La feuille de détail passe au-dessus de la barre et rend celle-ci inactive tant qu'elle est ouverte. »*

### F.3 Barre de contrôles en icônes seules

Le refus des libellés texte est un choix assumé de l'utilisateur et n'a pas à être discuté. Deux conséquences à traiter, déjà couvertes en §C.5 (nom accessible) et §C.4 (état actif non chromatique). J'ajoute :

- **Taille de cible** : trois à cinq icônes dans une barre également porteuse du tri, des filtres et de la pastille de résumé — sur 375 px de large, la tentation de resserrer sera forte. C'est la surface du palier la plus exposée au grignotage de cible. C'est un endroit où la « valeur de conception par défaut » du §E.1 mérite d'être rappelée dans la story.
- **Découvrabilité** : une icône seule et sans libellé pour « mode moyen » vs « mode liste » n'est pas devinable au premier usage. Ce n'est pas un problème d'accessibilité au sens strict (aucune exclusion), mais l'infobulle desktop et le nom accessible sont, là, le seul texte qui existe.

### F.4 Mode liste, ~12 éléments par écran

Sur un écran de ~812 px moins la barre basse (~85 px avec la zone sûre), l'en-tête et la barre de contrôles, il reste ~600 px pour 12 lignes, soit **~50 px par ligne** — au-dessus de 44 px, à condition que **la ligne entière** soit la cible de tap, et non la seule vignette de 28 px. À écrire explicitement, parce que la vignette est l'élément qui « a l'air » cliquable.

Si la ligne porte des actions secondaires (le « compte de signaux » est-il tapable ?), deux cibles se disputent 50 px de haut. Le plus sûr : **une seule cible par ligne en mode liste**, les actions secondaires vivant dans les modes plus aérés.

---

## G. Récapitulatif classé par gravité

| # | Constat | Où | Gravité | Coût de correction |
| --- | --- | --- | --- | --- |
| 1 | « En vote » : même libellé pour `todo` et `live` → la distinction « à faire / fait » repose sur la couleur seule | `DESIGN.md` §2, `EXPERIENCE.md` §5 | **Haute** | Une phrase de spec |
| 2 | Mode liste : état porté par la pastille seule ; intertitres incomplets (`soon` manquant) et de survie inconnue au tri | `EXPERIENCE.md` §4.1, §4.2 | **Haute** | Une décision + une ligne |
| 3 | Palettes non vérifiées en dichromatisme : Émeraude `live`/`soon` ΔE 18 ; Forêt `todo`/accent-or ΔE 10 ; Steampunk `done`/accent-bronze ΔE 6 | `DESIGN.md` §2 | **Haute** | 2-3 valeurs hex + une ligne d'invariant |
| 4 | Glissement de sélection : chemin de repli (tap, clavier) non garanti ; conflit défilement non tranché | `EXPERIENCE.md` §4.4, §6 | **Haute** | Deux phrases de spec |
| 5 | Badge plein du palier imminent : couleur du texte non spécifiée → blanc par défaut = 2.3–3.2:1 | `DESIGN.md` §7.1 | **Moyenne** | Une ligne |
| 6 | Badge `done` : texte à 2.2–2.5:1 sur son propre fond teinté | `DESIGN.md` §7.1 | **Moyenne** | Découpler la couleur du texte |
| 7 | Icônes de la barre de contrôles hors du champ de la règle `aria-label` ; état actif de la nav = teinte seule | `EXPERIENCE.md` §7, `DESIGN.md` §7.6-7.7 | **Moyenne** | Étendre la règle |
| 8 | Le brouillon n'a pas d'équivalent dans le vocabulaire rail / pastille | `DESIGN.md` §2, §7.2 | **Moyenne** | Définir la forme |
| 9 | §8 « Portée » factuellement fausse → transitions fonctionnelles sans règle ; masquage de la barre sous `reduced-motion` | `DESIGN.md` §8, `EXPERIENCE.md` §4.2 | **Moyenne** | Reformuler + une ligne |
| 10 | §7 dit « réécrit » → perte formelle des règles clavier/focus/aria de la base | `EXPERIENCE.md` l.19, §7 | **Moyenne** | Un mot + une puce |
| 11 | Barre basse : collision avec la feuille de détail et avec la fin d'un glissement | `DESIGN.md` §4, §7.8 | Basse | Une ligne |
| 12 | Cible de tap du mode liste : la ligne entière, pas la vignette | `EXPERIENCE.md` §4.1 | Basse | Une ligne |
| 13 | `text-muted` non vérifié (badge Brouillon, nom de joueur : trois signaux de retrait cumulés) | `DESIGN.md` §2, §7.1 | Basse | Un contrôle |

---

## H. Ce que cette revue ne demande pas

Pour lever toute ambiguïté avec P-2 :

- **Aucun seuil chiffré n'est proposé comme critère d'acceptation.** Les ratios de la §A servent à situer des choix, pas à recaler des stories.
- **Aucun audit rétroactif** n'est demandé sur l'existant : les points 1 à 13 portent tous sur des décisions de **ce** palier, pas encore écrites en code.
- **Aucune conformité WCAG** n'est réclamée, ni AA, ni A. Les repères 4.5:1 / 3:1 et ΔE 25 sont cités comme outils de lecture.
- **Le refus des libellés texte dans la barre de contrôles n'est pas contesté**, ni le parti pris de mettre `done` en retrait, ni le choix des trois univers chromatiques.

Ce qui **est** demandé tient en trois gestes, tous réalisables avant l'écriture des stories : **écrire trois phrases manquantes** (libellé du vote, texte du badge plein, repli du glissement), **corriger deux ou trois valeurs hexadécimales**, et **trancher un point** (mode liste : intertitres permanents ou pastille de forme). C'est de la vigilance, pas de la conformité — exactement ce que P-2 appelle.
