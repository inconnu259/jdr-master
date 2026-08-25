# Revue « grille de qualité » — spines UX Palier 9

- **Objet** : `DESIGN.md` + `EXPERIENCE.md` (delta Palier 9)
- **Référence de décisions** : `.memlog.md` (110 entrées)
- **Contrat produit** : `_bmad-output/specs/spec-palier9-refonte-ui/SPEC.md`
- **Date** : 2026-08-05
- **Verdict** : les deux spines sont fidèles au memlog sur la **direction artistique et les règles de fond** (palettes, génération, animation, identité, couches), mais ils ne sont **pas encore implémentables en l'état** : trois contradictions/lacunes bloquantes sur la carte de partie, et trois obligations contractuelles du memlog (conséquences de procédure) non remontées.

---

## 1. Complétude — ce qui manque nommément

### 1.1 Bloquant : la conséquence de procédure (memlog entrée 36, rappelée en 18) est absente des deux spines

Le memlog l'inscrit deux fois, explicitement pour le finalize :

> « CONSEQUENCE DE PROCEDURE a traiter au finalize : les MODES D'AFFICHAGE sont un ajout de perimetre absent du PRD 2026-08-01 et du SPEC palier9 (le tri et les filtres, eux, sont couverts par FR-10). A repercuter en amont (PRD + re-derivation du SPEC) avant le decoupage en epics, sinon les stories seront ecrites sur un contrat qui ne les contient pas. Plus la persistance de 2 preferences supplementaires (mode d'affichage, tri par defaut) au titre de AD-1. »

Or `DESIGN.md` §4/§7.7 et `EXPERIENCE.md` §4.1/§4.2 posent les trois modes d'affichage comme acquis, **sans aucune mention** du fait qu'ils sortent du contrat. Un lecteur des spines croira que le SPEC les couvre. Vérification faite : le SPEC ne parle nulle part de modes d'affichage (CAP-4 ne mentionne que filtre/tri), et les deux préférences supplémentaires (mode par défaut, tri par défaut) ne figurent ni dans CAP-1 ni dans la liste des dix dérogations. **À remonter avant le découpage en epics.**

### 1.2 Bloquant : la 11e dérogation serveur n'est pas actée comme telle

Memlog 19 et 109 : l'image de couverture téléversée est une **dérogation serveur candidate, la 11e, absente des dix actées du PRD, à acter explicitement au titre de P-5** (champ + endpoint + stockage). `DESIGN.md` Amendement 3 la présente comme une simple décision de design (« Mécanisme réutilisé : celui des portraits »), sans dire qu'elle ajoute une dérogation ni qu'elle doit être actée.

C'est frontalement en tension avec la contrainte du SPEC : *« Rien de silencieux côté serveur. […] dix dérogations sont recensées et actées […]. Toute évolution serveur découverte en cours d'implémentation est remontée et discutée avant d'être codée, jamais décidée en chemin. »* En l'état, les spines créent exactement la situation que cette contrainte interdit.

### 1.3 Majeur : la réserve d'échelle consignée par l'agent n'est pas reportée

Memlog 29 (donnée d'échelle : 0 partie aujourd'hui, 2 à 4 en simultané visées) puis 33 :

> « (override) ECHELLE — decision utilisateur CONTRE ma recommandation, prise en connaissance de cause apres deux mises en garde […] : on construit TOUT maintenant […]. Ma reserve reste consignee ici, elle n'a plus a etre rediscutee. »

L'asymétrie est frappante : la réserve sur la pondération mobile/desktop (memlog 10) **est** consignée, deux fois (DESIGN Amendement 2, EXPERIENCE §1, point ouvert 4). Celle sur l'échelle ne l'est nulle part. Un override pris contre recommandation, avec réserve explicitement consignée, doit survivre à la distillation — sinon la trace de la mise en garde disparaît, y compris vis-à-vis du **signal d'échec** du SPEC (« si la refonte ajoute des écrans et des options sans réduire le nombre de gestes […] le palier a manqué sa cible »), qui vise précisément ce risque.

### 1.4 Majeur : la signalétique CAP-5 n'est pas déclinée

CAP-5 énumère dix signaux nommés (joueur : personnage à créer, prochaine séance, vote en cours, compte-rendu manquant ; MJ : Homme Dragon à créer, aucun membre, aucun scénario, aucune date, aucun vote, rapport de fin manquant). Les spines parlent de « signaux en toutes lettres » (EXPERIENCE §4.1) et en citent deux dans le Flow 1, mais **aucun mapping signal → teinte**, aucun **ordre de priorité**, aucun **plafond de badges par carte**, aucune règle pour le « compte de signaux » du mode liste. C'est la surface centrale du palier ; elle n'est pas spécifiée.

### 1.5 Majeur : l'état « partie terminée » manque au vocabulaire d'état

Les dix états couvrent le scénario et la séance. Or CAP-5 crée un état **de partie** (« Le MJ peut déclarer sa partie terminée […] une partie terminée est visuellement en retrait et reste consultable ») et CAP-1 en fait une préférence (« masquage des parties terminées »). `EXPERIENCE.md` §4.1 mentionne un intertitre « Terminées » mais rien sur la mise en retrait, ni sur l'articulation avec le masquage préférentiel, ni sur le badge correspondant.

Corollaire : le regroupement par urgence est donné avec **trois** intertitres (« Ça t'attend », « En cours », « Terminées ») alors que la palette porte **quatre** teintes. Où atterrissent les parties dont la prochaine séance est `status-soon` (« À venir ») ? Non tranché.

### 1.6 Mineur — autres écarts au memlog

| Élément du memlog | Statut dans les spines |
| --- | --- |
| 93 — le compte à rebours n'apparaît que sur la prochaine séance, **et nommément sur trois surfaces** (vue de partie, agenda, carte de partie en grande vignette) | DESIGN §7.4 garde la règle mais **supprime l'énumération des trois surfaces** — le développeur ne sait plus où il apparaît |
| 101/102 — palette universelle de repli nommée par l'utilisateur (Ambre chandelle · Sauge vive · Ciel d'aube · Cendre) + deux points de vigilance marqués **[A ARBITRER]** | **Absente des deux spines et de la liste des points ouverts.** Défendable (l'entrée 104 acte les palettes thématiques, rendant le repli sans objet), mais un `[A ARBITRER]` jamais résolu explicitement disparaît en silence |
| 20 et 28 — deux `[ASSUMPTION]` « constat à valider » (Motif ne survit pas à 28 px ; à 28 px seuls monogramme + dominante différencient) | L'entrée 28 est reprise dans DESIGN §7.3 **comme un fait établi**, plus comme une hypothèse. Acceptable : l'entrée 34 la transforme en décision utilisateur validée |
| 12 — « distinguer une partie d'une autre d'un coup d'œil » et « signal visuel pour repérer les parties qui demandent une action » | Couverts (bannière générative, StateRail, regroupement par urgence) |
| 45 — le ressort/piston « à contraindre à des zones sûres », risque signalé par l'utilisateur | Repris mot pour mot (« zones sûres ») **sans jamais définir ce qu'est une zone sûre** — cf. §4 |
| CAP-4 — favoris « mises en avant » | Mentionnés seulement comme contenu de l'écran Compte (EXPERIENCE §2). **Aucun traitement visuel du favori sur la carte** |

### 1.7 Mineur : aucune déclaration de périmètre

Le memlog borne explicitement le run (entrée 8, récapitulé en 108). Les spines n'ont **aucune section « ce que ce delta ne traite pas »**. Résultat : rien ne signale au lecteur que CAP-2, CAP-3, CAP-6, CAP-10, CAP-11, CAP-12, CAP-13, CAP-15, CAP-16 et CAP-17 restent à concevoir dans leur chantier. Le document se lit comme exhaustif alors qu'il est volontairement partiel.

---

## 2. Répartition visuel / comportement

La séparation est **globalement juste** (`IdentityLabel` en §7.5 renvoie explicitement le comportement à EXPERIENCE — bon réflexe, à généraliser). Quatre inversions ou duplications :

| Endroit | Nature | Gravité |
| --- | --- | --- |
| `DESIGN.md` §7.7 ListControlBar — masquage au défilement, pastille de résumé, révélation par icône | **Comportement pur**, entièrement redit en `EXPERIENCE.md` §4.2. Deux sources pour une même règle = divergence garantie à la première retouche | Moyenne |
| `DESIGN.md` §7.8 — règle d'emploi du dépliant (exception, texte court, décision explicite) | Comportement, redit en `EXPERIENCE.md` §4.6 | Moyenne |
| `DESIGN.md` §7.4 — « se remplit sur les sept derniers jours », « un seul élément à la fois » | Règle d'apparition (comportement) placée en DESIGN, **et absente d'EXPERIENCE** : ici ce n'est pas une duplication mais une inversion franche. Le compte à rebours n'a aucune existence dans EXPERIENCE (ni §4, ni §5), il n'apparaît que dans le Flow 4 | Moyenne |
| `EXPERIENCE.md` §4.1 (densités ~2 / ~4-5 / ~12, vignette 44 px, 28 px) et §7 (invariant de palette) | Valeurs **visuelles** en EXPERIENCE, déjà en DESIGN §4 et §2 | Faible (renvois explicites, acceptables) |

Sens inverse, correctement traité : la règle de construction des éléments animés (DESIGN §8) est bien du visuel/technique et sa place est bonne ; la règle d'emploi d'`IdentityLabel` est bien en EXPERIENCE §4.5.

---

## 3. Contradictions

### 3.1 Bloquante — trois descriptions incompatibles du mode « moyen »

| Source | Ce que porte le mode moyen |
| --- | --- |
| `DESIGN.md` §7.3 | « **la bannière complète** en modes grande carte **et moyen** » |
| `DESIGN.md` §4 | « Bannière de carte — **78-124 px** de haut selon le mode » |
| `DESIGN.md` §6 | « Les **vignettes** de bannière reprennent `{radius.card}` en grande carte, **8 px en moyen**, 6 px en mode liste » |
| `EXPERIENCE.md` §4.1 | « Moyen — **Vignette 44 px**, nom, rôle, signaux en toutes lettres » |

Bannière pleine largeur de ~78 px, ou vignette carrée de 44 px ? Les deux lectures sont défendables et mutuellement exclusives. À trancher avant toute story sur la liste des parties. (Le memlog n'aide pas : l'entrée 34 ne spécifie que « deux rendus par thème », grand/moyen contre liste.)

### 3.2 Majeure — recherche desktop-only contre CAP-8

- Spines : « Recherche **sur desktop uniquement** » (DESIGN §7.7, EXPERIENCE §4.2, §9), et « la liste des personnages réutilise **exactement** la grammaire de la liste des parties » (EXPERIENCE §2).
- SPEC CAP-8 : « L'utilisateur consulte, **avec recherche**, la liste de tous ses personnages toutes parties confondues. »

CAP-8 devient donc non tenu sur mobile — c'est-à-dire, selon la pondération d'usage posée par les spines eux-mêmes, sur le support de 60-80 % de l'usage joueur, pour la capability dont l'intention est précisément « retrouver un personnage précis sans se rappeler dans quelle partie ». Le memlog (entrée 23) ne pose « desktop uniquement » que pour la liste des **parties** ; l'extension à la liste des personnages est une conséquence non voulue de la règle de réutilisation.

### 3.3 Mineure — attribution du refus du rouge

DESIGN §2 : « **Aucun rouge en Forêt ni en Steampunk (refus utilisateur)** ». Le memlog ne contient pas de refus formulé : l'entrée 95 pose la question (« un rouge peut se lire comme une ERREUR »), l'entrée 103 constate que les palettes produites n'en comportent pas, l'entrée 104 acte. La conclusion est bonne, l'attribution est plus ferme que la trace.

### 3.4 Point de vigilance — renommage de tokens non explicité

DESIGN §2 constate que la base déclare `status-available: var(--accent-1)` et introduit quatre noms nouveaux (`status-todo` / `live` / `soon` / `done`). **Aucune table de correspondance ancien → nouveau**, aucune consigne de migration des usages existants. Un développeur ne sait pas s'il renomme les tokens de la base ou s'il en ajoute quatre à côté.

---

## 4. Implémentabilité — où manque une valeur

Ce qui est **suffisant** : les 12 hex de statut avec leurs accents de contrôle (§2), les trois paliers d'imminence avec leurs seuils en jours, N ∈ [2,6] rouages, 1 à 3 comètes, StateRail 4 px, radius 8/6 px, densités par mode, `prefers-reduced-motion`, la règle du paramètre unique (§8).

Ce qui **oblige à deviner** :

| # | Manque | Où | Conséquence |
| --- | --- | --- | --- |
| 1 | **Algorithme de graine** : « graine dérivée de l'identifiant de la partie » — quelle fonction de hachage, quel PRNG, la graine est-elle **persistée** ou recalculée à chaque rendu ? | DESIGN §7.3 | La règle fondatrice d'immuabilité n'est **pas vérifiable** sans cela : deux implémentations divergentes produisent deux bannières pour la même partie |
| 2 | **Bornes de tirage Forêt Ancienne** : « nombre, position de départ, dérive latérale et décalage tirés » — aucun intervalle, là où Steampunk (2-6) et Grimoire (1-3) en ont un | DESIGN §7.3 | Rendu non reproductible |
| 3 | **Zone d'exclusion du manomètre** : contrainte « dure » sans **aucune dimension** ni géométrie (rayon ? marge ? fraction de la bannière ?) | DESIGN §7.3, §9 | Contrainte invérifiable, alors qu'elle est présentée comme dure |
| 4 | **« Zones sûres » du ressort et de la bielle** : jamais définies | DESIGN §7.3 | Idem |
| 5 | **Monogramme** : règle de dérivation absente (initiale seule ? deux lettres ? mots ignorés ? casse ?) | DESIGN §7.3, EXPERIENCE §4.1 | Élément désigné comme *le* différenciateur à 28 px, non spécifié |
| 6 | **« Vignette atténuée »** : aucune valeur d'atténuation (opacité ? assombrissement ? flou ?) | DESIGN §7.3 | Idem |
| 7 | **Teintes de comète** « vert ou améthyste » : pas de hex, et ambiguïté avec l'accent lavande `#9b6dff` — exactement la collision dénoncée en §2 | DESIGN §7.3 | Risque de reproduire le défaut corrigé |
| 8 | **Opacités de fond du StatusBadge** : `16%` pour todo contre `15%` pour live/soon, `26%` pour done — écart de 1 % non motivé, et la forme `"16% opacity"` ne dit pas **de quelle couleur** (présumément la teinte de statut) | DESIGN §7.1 | Bruit ; à normaliser en `color-mix()` ou en valeur rgba explicite |
| 9 | **Liste des tris et des filtres** : le SPEC CAP-4 exige rôle/date/nom/type/statut, le memlog 18 dit favoris/urgent/alphabétique/date de création/prochaine séance + filtre MJ/joueur. Les spines écrivent seulement « tri, filtres (rôle, statut) » | DESIGN §7.7, EXPERIENCE §4.2 | Trois listes différentes, aucune faisant autorité |
| 10 | **Seuil du masquage au défilement** : distance ou vélocité déclenchant la disparition et le retour | DESIGN §7.7 | Comportement très sensible au réglage, laissé à l'improvisation |
| 11 | **Durées d'animation** : aucune (rotation des rouages, boucle de comète, pulsation des halos, oscillation de l'aiguille) — seules les planches les portent, or « ce document gagne » sur les planches | DESIGN §8 | Le document qui fait autorité ne porte pas les valeurs |
| 12 | **Compte à rebours** : aucune dimension, aucun placement, aucune courbe de progression | DESIGN §7.4 | |
| 13 | **BottomNav** : « ~50 px + zone sûre » — approximation, et les quatre icônes ne sont pas nommées | DESIGN §7.6 | |
| 14 | **DetailSurface** : aucune largeur de panneau desktop, aucune hauteur/point d'accroche de la feuille mobile | DESIGN §7.8 | |
| 15 | **Noms de composants** : `StatusBadge`, `StateRail`, `GeneratedBanner`, `Countdown`, `IdentityLabel`, `BottomNav`/`TopNav`, `ListControlBar`, `DetailSurface` sont nommés — bon point. Mais aucun n'est rattaché à un sélecteur Angular ni à un emplacement de dossier | DESIGN §7 | Faible : relève de l'architecture, pas de l'UX |

---

## 5. Points ouverts

Les quatre points ouverts d'`EXPERIENCE.md` §10 sont **bien tenus comme ouverts**, non tranchés en douce :

| # | Source memlog | Fidélité |
| --- | --- | --- |
| 1 — plancher d'accessibilité | **Aucune entrée memlog.** Tension déduite entre la base et P-2 du SPEC | Ajout légitime et bien posé (« ce document ne tranche pas », lecture probable explicitée, échéance donnée). À signaler comme n'ayant pas de trace amont |
| 2 — image de couverture dans tous les modes | 109 | Fidèle, y compris la sous-question sur l'animation |
| 3 — technique de rouage D | 44 (« à reconfirmer si l'utilisateur visait autre chose ») | Fidèle, et **bien géré** : le memlog se contredit lui-même (38 valide D, 44 le rejette), les spines retiennent la décision la plus récente et signalent la réversibilité |
| 4 — pondération d'usage | 10, 33 | Fidèle |

**Questions du memlog correctement refermées** (vérifié une à une) : 25 (masquage des barres → trois patrons retenus ensemble, et le balayage horizontal explicitement proscrit en EXPERIENCE §6), 62 (arbitrage Q-6 → trois vues), 95 (le rouge hors Émeraude → aucun rouge en Forêt ni Steampunk).

**Manquent à la liste des points ouverts** : les trois obligations de §1.1, §1.2 et §1.5 ci-dessus, plus le `[A ARBITRER]` de l'entrée 102.

---

## 6. Les quatre amendements de la base

| # | Objet | Raison explicitée ? | Verdict |
| --- | --- | --- | --- |
| 1 | SVG inline autorisé | **Oui**, et bien : impossibilité d'obtenir des dents à flancs parallèles en CSS pur (le `conic-gradient` produit des parts de tarte). Frontière neuve posée nettement (vectoriel en markup autorisé / bitmap décoratif toujours interdit) | Conforme |
| 2 | Mobile-first nuancé | **Oui** : ni la base ni P-3 du PRD ne sont exacts, chiffres d'usage donnés, réserve consignée | Conforme, exemplaire |
| 3 | L'image utilisateur s'étend aux parties | **Non.** Le texte décrit *ce que* l'amendement change et *quel mécanisme* est réutilisé, mais ne dit jamais **pourquoi** l'exception bitmap s'élargit (mémoire : besoin de distinguer une partie d'un coup d'œil, entrée 12, et choix utilisateur explicite, entrée 109). Aucune ligne « **Raison** », contrairement aux amendements 1 et 2 | **À compléter** — et à croiser avec §1.2 (dérogation serveur non actée) |
| 4 | Les couleurs de statut ne dérivent plus des accents | **Oui, mais par renvoi** : l'amendement est un pointeur d'une ligne vers §2. La raison y est excellente et documentée (collision cuivre `#cd7f32` / ambre `#f0a030`, « ce n'est pas une hypothèse : c'est dans les tokens actuels ») | Acceptable ; une phrase de raison sur place ferait tenir la liste des quatre debout seule |

**Remarque de comptage** : `EXPERIENCE.md` §introduction annonce **réécrire deux sections de la base** (architecture de l'information, plancher d'accessibilité). Ce sont deux amendements de plus, non étiquetés comme tels. Le lecteur qui a retenu « quatre amendements » de DESIGN les manquera. Il y en a **six** au total sur les deux documents.

---

## 7. Récapitulatif des actions

**Bloquant avant écriture des stories**

1. Trancher le rendu du mode « moyen » (§3.1) et aligner DESIGN §4, §6, §7.3 et EXPERIENCE §4.1.
2. Décliner les dix signaux de CAP-5 : teinte, priorité, plafond par carte, comportement du compte en mode liste (§1.4).
3. Ajouter l'état de partie « terminée » au vocabulaire d'état, et le quatrième intertitre de regroupement ou la règle qui l'évite (§1.5).
4. Remonter la conséquence de procédure des modes d'affichage vers le PRD et re-dériver le SPEC (§1.1).
5. Acter l'image de couverture comme 11e dérogation serveur au titre de P-5, avant tout code (§1.2).

**À corriger dans les spines**

6. Consigner la réserve d'échelle (§1.3).
7. Résoudre la contradiction recherche mobile / CAP-8 (§3.2).
8. Combler les valeurs manquantes 1 à 8 du tableau §4 — au minimum l'algorithme de graine, les bornes Forêt, la géométrie de la zone d'exclusion et la règle du monogramme.
9. Dédupliquer les comportements logés dans DESIGN §7.7 et §7.8 ; rapatrier les règles d'apparition du compte à rebours dans EXPERIENCE (§2).
10. Ajouter une ligne « Raison » à l'Amendement 3 et une phrase autoportante à l'Amendement 4 (§6).
11. Ajouter une déclaration de périmètre listant les capabilities non traitées par ce delta (§1.7).
12. Fournir la table de correspondance des tokens de statut ancien → nouveau (§3.4).
