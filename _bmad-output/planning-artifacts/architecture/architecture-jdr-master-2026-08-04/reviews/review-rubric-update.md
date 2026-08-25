# Revue « grille de qualité » — mise à jour du 2026-08-05 (AD-16 à AD-20)

**Périmètre** : les cinq AD neuves (AD-16 à AD-20), l'amendement en place d'AD-1, et leur cohabitation
avec AD-1 à AD-15, les invariants hérités (P1, P5, P6, P7, P8) et les 21 capacités du SPEC.
Lus : `ARCHITECTURE-SPINE.md`, `.memlog.md` (71 lignes, 64 entrées utiles), `SPEC.md` (CAP-1 à CAP-21).

## Verdict

Quatre des cinq AD neuves fixent de vrais points de divergence, mais deux d'entre elles entrent en
collision frontale avec des AD déjà posées — AD-18 contredit AD-9 sur le calendrier personnel et
franchit la frontière de module qu'AD-4 existe pour tenir, AD-20 se superpose à AD-3 sur le même
signal de CAP-5 — pendant qu'AD-19 et l'amendement d'AD-1 laissent sans point d'application unique
les deux choses qui divergeront réellement (la dérivation de bannière, le vocabulaire des modes de liste).

## Test de non-décoration (deux stories construites indépendamment)

| AD | Divergence réelle ? | Verdict |
| --- | --- | --- |
| AD-16 | Faible — AD-1 tranchait déjà « multi-valué → relationnel », l'AD le dit elle-même | Utile pour nommer le modèle, mais son vrai contenu n'est pas dans « Prevents » (cf. Mineur 3) |
| AD-17 | Oui — deux chemins d'upload, dont un seul durci | Porteuse, la meilleure des cinq |
| AD-18 | Oui — N appels par couche contre un | Porteuse, mais mal bornée (cf. Critique 1 et 3) |
| AD-19 | Oui, mais pas celle qu'elle nomme | La divergence coûteuse n'est pas la persistance, c'est la duplication de l'algorithme (cf. Majeur 1) |
| AD-20 | Oui — endpoint dédié contre dérivation client | Porteuse, mais empiète sur AD-3 (cf. Critique 2) |

---

## Critique

### C-1 — AD-18 contredit textuellement AD-9 sur le calendrier personnel

AD-9 écrit : « Dans le **calendrier personnel**, les séances de l'utilisateur s'affichent explicitement
et légendées : ce sont ses propres parties. » AD-18 écrit, pour ce même calendrier personnel :
« La contrainte de non-fuite d'AD-9 s'y applique intégralement : une séance d'une autre partie n'y
apparaît que comme indisponibilité, sans identité de partie. »

Prises au mot, les deux règles s'excluent : AD-18 interdit précisément ce qu'AD-9 autorise et ce que
CAP-19 exige (« ses séances confirmées » est une couche nommée du calendrier). La lecture charitable
est qu'AD-18 vise les séances d'*autres utilisateurs*, mais dans un calendrier personnel il n'y en a
pas — la phrase n'a alors aucun référent. Deux stories divergeront sans se contredire l'une l'autre :
l'une affiche « Séance — La Route de Kanan, 14h », l'autre affiche « Indisponible ». Il faut dire
explicitement que la règle de non-fuite d'AD-9 gouverne le calendrier **de partie** et que le
calendrier personnel expose l'identité des parties **dont l'utilisateur est membre**, sans exception.

### C-2 — AD-20 et AD-3 revendiquent le même état, pour la même capacité

AD-3 : les signaux sont « calculés serveur », `PartySignalCode` est une union fermée, « aucun écran
ne les recalcule ». FR-12/CAP-5 comptent « vote en cours » parmi ces signaux. AD-20 : les états qui
dépendent du lecteur — « Réponds au vote » contre « Vote en cours » — sont « résolus par le client ».
AD-20 binde CAP-5, c'est-à-dire la capacité d'AD-3.

Rien ne dit qui l'emporte sur la carte de partie. Une story mettra `VOTE_A_REPONDRE` dans l'union
fermée (l'endpoint est sous `/me`, le serveur connaît le lecteur et peut trancher) ; une autre
émettra `VOTE_EN_COURS` et laissera le front raffiner — deux signalétiques également conformes, et
un badge qui change de sens selon l'écran, soit exactement ce qu'AD-3 prévient. Il faut une phrase de
partage : ce qui entre dans `PartySignalCode` est calculé serveur ; AD-20 ne s'applique qu'aux états
**hors** de cette union (vue de partie, chronologie).

### C-3 — AD-18 crée le module fourre-tout qu'AD-4 interdit nommément

AD-4 : « `/me` est une **convention de routage**, jamais une frontière de module […] Les autres routes
`/me` vivent dans le module propriétaire de la donnée », et son « Prevents » vise « un module qui
absorberait progressivement toute lecture scopée à l'utilisateur — y compris l'agrégation de parties —
et se mettrait à dupliquer la logique d'appartenance de `PartiesService` ».

Le *Source tree* introduit `apps/api/src/calendar/me-calendar.controller.ts`, un module qui ne possède
aucune des données qu'il sert (séances, sondages, inscriptions) et qui devra résoudre l'appartenance
pour toutes les parties de l'utilisateur. C'est la description littérale du « Prevents » d'AD-4.
Soit l'endpoint vit dans le module propriétaire dominant (les séances, donc `PartiesModule`), soit
AD-4 gagne une exemption d'agrégation **écrite**, bornée à la lecture et interdisant toute
réimplémentation d'appartenance hors `PartiesService.getViewable` (P1-AD-3).

---

## Majeur

### M-1 — AD-19 protège contre la mauvaise divergence

La règle interdit de persister graine, paramètres et rendu. Mais le critère de succès de CAP-20 est
« une partie présente **toujours la même bannière**, sur tous les appareils » : ce qui peut le briser
n'est pas une persistance intempestive, c'est **deux implémentations** de la dérivation
identifiant → bannière (carte de liste, en-tête de partie, vignette compacte de CAP-18), écrites par
deux stories. AD-12 et AD-17 ont su formuler cette contrainte (« un composant partagé unique »,
« un seul utilitaire ») ; AD-19 ne la formule pas. `party-banner.util.ts` n'apparaît que dans le
*Source tree*, qui n'est pas normatif. Il manque : point de dérivation unique, et statut de la
déclinaison par thème (CAP-20 : « déclinée selon le thème actif ») vis-à-vis d'AD-13.

### M-2 — `listViewMode` / `listSort` : deux `String` libres, sans union fermée ni portée

AD-1 amendé ajoute deux scalaires, `@default("medium")` et `@default("urgency")`. Trois silences :
(a) aucune union fermée déclarée dans `@master-jdr/shared`, alors qu'AD-13 l'exige pour les thèmes et
AD-3 pour les codes de signal, pour le même motif — deux stories écriront `compact`/`card` contre
`list`/`grid`, et la validation API se réécrira à côté ; (b) `"urgency"` ne figure dans aucun des
critères de tri de CAP-4 (rôle, date, nom, type, statut) ; (c) CAP-18 dit que « les mêmes contrôles
servent la liste des parties **comme** la vue mes personnages » — une paire unique partagée par deux
listes dont les critères de tri diffèrent, ou une paire par liste, n'est pas tranché.

### M-3 — Le renommage `medieval-steampunk` → `atelier-cuivre` (CAP-17) est invisible dans la spine

CAP-17 exige que « les préférences de thème déjà enregistrées survivent au renommage ». `User.theme`
est une colonne `String` libre (AD-1) contenant l'ancienne clé. AD-13 ne mentionne ni le renommage ni
la reprise des valeurs stockées, et le *Source tree* liste toujours `medieval-steampunk.ts`. Trois
stories, trois réponses possibles : migration SQL, remappage à la lecture, ou rien — la troisième
faisant perdre son thème à l'utilisateur, soit précisément le scénario qu'AD-13 a été écrite pour
empêcher. À noter aussi : le tri du fichier de type de référence n'est pas concerné, seul l'est le
contenu persisté.

### M-4 — `coverImageUrl` échappe à l'énumération d'AD-15

AD-15 impose une projection explicite pour toute sortie de `PartiesService`. `Partie.coverImageUrl`
est ajouté au modèle par AD-17, mais aucune AD ne dit s'il entre dans `PartieDto`. Or CAP-20 le rend
nécessaire dès la liste. Sans mention, une story l'ajoute à la projection, une autre crée une lecture
dédiée par partie — ce dernier chemin ramenant le fan-out qu'AD-3 interdit sur l'écran même où il a
déjà coûté deux bugs. Une ligne dans AD-15 ou AD-17 suffit.

### M-5 — Dimension silencieuse : l'écriture en masse des disponibilités (CAP-14)

CAP-14 est la seule capacité dont l'énoncé décrit un geste produisant N écritures : « déclarer quatre
créneaux consécutifs en un geste », avec un glissement pouvant couvrir « plusieurs jours et créneaux ».
Aucune AD ne dit si cela se traduit par N appels ou par une écriture groupée — et la seconde option est
une évolution serveur, donc soumise à la contrainte « rien de silencieux côté serveur » et absente de
D-1 à D-13. C'est la seule surface du palier où deux stories peuvent diverger sur un *volume d'appels*
sans qu'aucune règle ne les départage, alors que le palier a fait de ce motif son invariant phare
(AD-3, AD-18). À trancher, ou à inscrire au Deferred avec sa condition.

---

## Mineur

### m-1 — Le Deferred a pris du retard sur le SPEC

Q-15 (l'image de couverture remplace-t-elle la bannière dans **tous** les modes d'affichage ? que
devient l'animation ?), Q-16 (statut du plancher d'accessibilité) et Q-17 (plafond de badges par carte
et ordre de priorité entre signaux concurrents) sont ouvertes dans le SPEC et **absentes** du Deferred.
Q-15 et Q-17 sont divergentes au sens de la grille : Q-15 croise CAP-18 et AD-19, Q-17 croise
directement l'union fermée d'AD-3. Symétriquement, Q-6 (« sort de la vue semaine ») est encore listée
au Deferred alors que CAP-14 et CAP-19 l'ont tranchée (saisie en masse ; une des trois présentations) —
entrée périmée à retirer.

### m-2 — Le *Source tree* est mal formé

Sous `calendar/`, on trouve `me-calendar.controller.ts` puis `parties.controller.ts` et
`parties.service.ts`, qui appartiennent manifestement à `parties/` (le bloc `parties/` juste au-dessus
n'en contient que `party-signals.service.ts` et `party-cover.controller.ts`). Un implémenteur lisant
littéralement placera les modifications de `PartiesController` dans le module calendrier.

### m-3 — AD-16 ne met pas dans « Prevents » ce qui la rend utile

Son « Prevents » vise une troisième forme de stockage — que la règle d'AD-1 exclut déjà, comme l'AD le
reconnaît. Ce qu'AD-16 apporte vraiment et qui n'y figure pas : (a) **l'absence de ligne vaut couche
éteinte**, contre une ligne portant `enabled Boolean` — deux stories peuvent diverger là-dessus, avec
des conséquences opposées sur la lecture du défaut ; (b) le **statut des bascules temporaires** de
CAP-19 (« les bascules en cours de visite sont temporaires ») — rien n'interdit à une story d'écrire
en base à chaque clic de couche, ce qui détruit à la fois le sens du défaut et l'écran « votre
affichage s'écarte du défaut, rétablir ? » ; (c) l'**espace de nommage de `layerKey`** — la couche
« disponibilité agrégée du groupe » est MJ-et-dans-une-partie, alors que `UserCalendarLayer` est global
au compte et qu'AD-18 sert un calendrier hors contexte de partie.

### m-4 — AD-17 laisse deux points normatifs dans un commentaire de *Source tree*

L'autorisation (« MJ seul ») et la nature de l'exposition de l'image (URL servie, chemin de stockage)
n'apparaissent que dans les commentaires du *Source tree*, non dans la Rule. Le reste de l'AD est net
et le refactor obligatoire est bien posé.

### m-5 — Référence périmée dans le SPEC

`SPEC.md` (Constraints, dernière puce) renvoie encore à « `ARCHITECTURE-SPINE.md` (AD-1 à AD-15) ».
À porter à AD-20 lors de la prochaine passe sur le SPEC — signalé ici, non modifié.

---

## Couverture des 21 capacités

Couvertes et gouvernées : CAP-1 à CAP-17 (inchangées, revues la veille), CAP-18 (AD-1 amendé, sous
réserve M-2), CAP-19 (AD-16 + AD-18, sous réserve C-1, C-3, m-3), CAP-20 (AD-17 + AD-19, sous réserve
M-1, M-4), CAP-21 (front pur, sans invariant de divergence — jugement partagé : quatre destinations
fixées par le SPEC, rien à arbitrer côté structure).

Deux angles morts de couverture, déjà comptés plus haut : le renommage de thème de CAP-17 (M-3) et
l'écriture groupée de CAP-14 (M-5). La table *Capability → Architecture Map* reste indexée par FR :
pour un lecteur venant du SPEC, un index CAP → AD manque, mais c'est un confort, pas un invariant.
