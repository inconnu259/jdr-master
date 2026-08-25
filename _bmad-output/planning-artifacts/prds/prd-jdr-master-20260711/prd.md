---
title: "PRD — Palier 4 : Sessions, rapports, événements/missions, annonces MJ (finalisation)"
status: final
created: 2026-07-11
updated: 2026-07-11
scope: personal / scope-1
---

# PRD — Palier 4 : Sessions, rapports, événements/missions, annonces MJ (finalisation)

## 0. Document Purpose

Ce PRD couvre la finalisation du Palier 4 (`docs/backlog.md`) — la partie encore non livrée : Scénario (unité de contenu narratif), Séance(s), rapports/résumés, chronologie de campagne, et annonces MJ. Le calendrier de disponibilités, la recherche de date et le vote de date (Epics 1-3) ainsi que l'infra e-mail/notifications (Epic 5) sont déjà livrés et réutilisés tels quels ici, sans être redéfinis — voir le Glossaire. Le flow « agence » complet (Conte de Minuit, 2ᵉ système) est explicitement hors scope et déplacé au Palier 8 ; ce PRD pose cependant l'infrastructure `campagne_épisodique` (déjà modélisée en base, `PartieKind.CAMPAGNE_EPISODIQUE`) que ce futur palier réutilisera.

## 1. Vision

Depuis les paliers précédents, une Partie n'est qu'un conteneur : un MJ, des joueurs, des personnages, un calendrier de disponibilités. Il n'existe encore aucune notion de **scénario** ni de **séance** — le contenu narratif (ce qu'on va jouer, ce qui s'est passé) vit entièrement en dehors de l'application. Ce palier donne corps au récit : le MJ crée un scénario (description, éléments/documents destinés aux joueurs), le fait vivre au fil des séances jouées, puis le clôture avec un résumé qui reste consultable — et les joueurs, de leur côté, suivent une chronologie qui distingue clairement ce qui est joué, ce qui est en préparation, et ce qui reste encore à découvrir (anti-spoil). Une campagne devient un enchaînement de scénarios ; un one-shot en est le cas particulier à un seul scénario — un seul modèle pour les deux.

## 2. Target User

### 2.1 Jobs To Be Done

- En tant que MJ, je veux créer un scénario avec sa description et les documents/éléments que je veux transmettre aux joueurs, sans passer par un support externe (Discord, Google Docs...).
- En tant que MJ, je veux enchaîner les scénarios d'une campagne sans devoir tous les préparer à l'avance, et sans exposer leur contenu aux joueurs avant l'heure.
- En tant que MJ, je veux clore un scénario avec un résumé qui reste une trace durable de ce qui s'est passé à la table.
- En tant que MJ d'une campagne à gros vivier de joueurs (façon « agence »), je veux voir en un coup d'œil si assez de joueurs se sont inscrits sur une date proposée pour décider de la valider, sans devoir attendre ou compter tout le monde à la main.
- En tant que MJ, je veux diffuser une annonce à la bonne audience (toute la campagne, un one-shot, un scénario précis) sans polluer les joueurs non concernés.
- En tant que joueur, je veux savoir ce qui m'attend (titre, date) sans me faire spoiler le contenu d'un scénario à venir.
- En tant que joueur absent d'une séance, je veux pouvoir lire ce qui s'y est passé pour ne pas décrocher de la campagne.
- En tant que joueur, je veux pouvoir associer mon journal personnel (existant) à la rétrospective d'un scénario terminé, si je souhaite le partager.

### 2.2 Non-Users (v1)

- Personne en dehors du petit groupe d'amis actuel — pas de scénario multi-tables/multi-MJ à grande échelle (cf. Non-Goals).
- Le flow « agence » complet (annonce d'enquête → opt-in → équipe constituée, spécifique à Conte de Minuit) n'est pas livré ici — seule l'infrastructure de séance à capacité limitée l'est (cf. FR-19, réutilisée telle quelle au Palier 8).

### 2.3 Key User Journeys

*Périmètre hobby — UJ formulées en une phrase (JTBD reformulé), pas de flow détaillé.*

- **UJ-1.** Le MJ crée un scénario one-shot (description, durée estimée, documents/éléments narratifs à destination des joueurs), invite ses joueurs (réutilise l'invitation existante), puis retouche la description après coup sans que ça pose problème. Il indique ses disponibilités, attend celles des joueurs, propose plusieurs dates. La séance se joue (hors app). À la fin, il rédige le résumé (événements marquants, coups d'éclat des joueurs) et clôture le scénario.
- **UJ-2.** Un joueur reçoit une invitation, lit la description du one-shot (ou de la campagne), crée son personnage, indique ses disponibilités et vote pour une date. Après la séance, il rédige une entrée de journal personnel et la rend visible à tout le groupe.
- **UJ-3.** Dans une campagne linéaire, un joueur consulte la vue chronologique : il revoit le résumé d'un scénario passé, voit qui participe au scénario courant, et aperçoit le titre + la date proposée d'un scénario à venir — sans rien de plus.
- **UJ-4.** Dans une campagne épisodique (façon « agence »), le MJ propose une date de séance pour 4 à 6 joueurs ; les joueurs intéressés s'inscrivent ; l'inscription se ferme automatiquement dès que 6 sont atteints, mais c'est le MJ qui décide, quand il le souhaite, de valider cette date (même avec moins de 6 inscrits) — un indicateur couleur l'aide à voir d'un coup d'œil où en est le remplissage.

## 3. Glossaire

- **Partie** — Modèle existant (`Partie`), `kind` ∈ `ONE_SHOT | CAMPAGNE_LINEAIRE | CAMPAGNE_EPISODIQUE` (déjà en base). Ce PRD ne modifie pas ce modèle, il l'exploite.
- **Scénario** — *Nouveau.* Unité de contenu narratif : un one-shot = un scénario unique ; une campagne = un enchaînement de scénarios. Porte une description, une durée estimée (heures ou nombre de séances), des documents/éléments narratifs, et un statut de cycle de vie (cf. Séance/Statut ci-dessous).
- **Statut de scénario** — *Nouveau.* `Brouillon` (créé par le MJ, entièrement invisible aux joueurs — permet de préparer un scénario dont l'ouverture dépend de l'issue d'un autre) → `À venir` (ouvert au vote/à l'inscription de date, anti-spoil : titre + date seulement, cf. FR-6) → `Courant` (contenu complet visible aux participants) → `Passé` (clôturé par le MJ, cf. FR-10). En `CAMPAGNE_LINEAIRE`, un seul scénario `Courant` à la fois ; en `CAMPAGNE_EPISODIQUE`, plusieurs scénarios peuvent être `Courant` (ouverts en parallèle) simultanément (cf. FR-8).
- **Séance** — *Nouveau.* Une soirée de jeu concrète, rattachée à un scénario. Un scénario a une ou plusieurs séances (plusieurs si sa durée estimée dépasse une soirée). Réutilise le mécanisme de vote de date existant (Epics 1-3) pour la sélection de sa date, sauf en campagne épisodique (cf. FR-19).
- **Compte-rendu de séance** — *Nouveau.* Résumé court rédigé à l'issue d'une séance individuelle (utile si un scénario s'étale sur plusieurs séances, pour que les absents d'une séance donnée s'y retrouvent).
- **Résumé de fin de scénario (rétrospective)** — *Nouveau.* Fiche plus riche rédigée par le MJ à la clôture d'un scénario (événements marquants, coups d'éclat des joueurs), à laquelle les joueurs peuvent associer tout ou partie de leur journal personnel (existant, Story 6.5).
- **Bibliothèque de documents** — *Nouveau.* Documents/éléments (PDF, texte) mis à disposition des joueurs par le MJ, à deux niveaux : par scénario (masqués tant que le scénario n'est pas `Courant`, anti-spoil) ou par Partie/campagne (toujours visibles — règles maison, lore général).
- **Inscription à capacité limitée** — *Nouveau, campagne épisodique uniquement.* Mécanisme de sélection de date alternatif au vote existant : le MJ propose une date pour une fourchette de joueurs (min-max) ; les joueurs s'inscrivent ; l'inscription se ferme automatiquement dès que le maximum est atteint, mais la date n'est validée que par une action manuelle du MJ, jamais automatiquement (cf. FR-19).
- **Annonce** — *Nouveau.* Message publié par le MJ, diffusé à une audience choisie : toute la Partie/campagne, un one-shot, ou un scénario précis.
- **Journal personnel** — Modèle existant (`CharacterNote`, Story 6.5) : entrées datées, visibles par le MJ, partageables individuellement avec le groupe. Réutilisé sans modification ; ce palier ajoute uniquement un point d'association configurable depuis la rétrospective d'un scénario (cf. FR-16).
- **Invitation / Disponibilité / Vote de date** — Modèles existants (Epics 1-3), réutilisés sans modification pour le cas `ONE_SHOT`/`CAMPAGNE_LINEAIRE`.

## 4. Features

### 4.1 Scénario — création et contenu

**Description :** Le scénario est l'unité de base de tout ce palier — un one-shot en est un cas particulier à un seul scénario. Réalise UJ-1 (première partie).

#### FR-1 : Créer un scénario

Le MJ d'une Partie peut créer un scénario, avec une description et une durée estimée optionnelle (en heures, ou en nombre de séances prévues).

**Conséquences (testables) :**
- Réservé au MJ de la Partie (403 pour tout autre rôle).
- `[ASSUMPTION]` Pour une Partie `ONE_SHOT`, un unique scénario est créé automatiquement (ou à la création de la Partie) — pas de gestion multi-scénarios pour ce cas. *(cf. §9 Assumptions Index — à confirmer en UX)*
- Pour une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`, le MJ peut créer les scénarios au fil de l'eau ou plusieurs à l'avance (au statut `Brouillon` par défaut, cf. FR-5), sans contrainte d'ordre de création — seul l'ordre d'affichage (chronologique) est géré par le système (cf. FR-8).

#### FR-2 : Joindre des documents/éléments à un scénario

Le MJ peut joindre des documents ou éléments narratifs (PDF, texte) à un scénario, destinés aux joueurs participants.

**Conséquences (testables) :**
- Les documents d'un scénario ne sont visibles/téléchargeables par les joueurs que lorsque le scénario est `Courant` ou `Passé` (jamais `Brouillon` ni `À venir`, cf. FR-5/FR-6).
- Un joueur participant peut consulter/télécharger les documents du scénario auquel il participe.

#### FR-3 : Bibliothèque de documents au niveau de la Partie/campagne

Le MJ peut également joindre des documents au niveau de la Partie/campagne (règles maison, lore général), distincts des documents par scénario.

**Conséquences (testables) :**
- Ces documents sont visibles par tout membre de la Partie en permanence, indépendamment du statut des scénarios (pas soumis à l'anti-spoil).

#### FR-4 : Modifier un scénario après création

Le MJ peut modifier la description et les éléments d'un scénario à tout moment tant qu'il n'est pas `Passé`, y compris après que des joueurs ont été invités ou se sont inscrits.

**Conséquences (testables) :**
- Aucune notification automatique n'est requise lors d'une modification (hors scope MVP, cf. Non-Goals) — le joueur voit le contenu à jour à sa prochaine consultation.

### 4.2 Cycle de vie et chronologie

**Description :** Distingue ce qui est en préparation privée, ce qui est joué, en cours, et à venir — avec anti-spoil. Réalise UJ-3.

#### FR-5 : Brouillon — préparation invisible aux joueurs

Le MJ peut créer un scénario au statut `Brouillon`, entièrement invisible aux joueurs (ni titre, ni date), pour le préparer à l'avance — y compris quand son ouverture dépend de l'issue d'un autre scénario encore en cours.

**Conséquences (testables) :**
- Un scénario `Brouillon` n'apparaît dans aucune vue joueur (chronologie, annonces, etc.) — seul le MJ le voit, dans une vue dédiée.
- Aucune dépendance formelle n'est modélisée entre scénarios (pas de graphe de dépendances) — le MJ gère l'enchaînement manuellement en choisissant quand ouvrir chaque `Brouillon` (cf. FR-7).

#### FR-6 : Anti-spoil sur les scénarios à venir

Un scénario au statut `À venir` n'affiche aux joueurs que son titre et sa (ses) date(s) proposée(s) — jamais sa description, ses documents, ni sa liste de participants détaillée.

**Conséquences (testables) :**
- Un joueur peut néanmoins voter/s'inscrire sur la date d'un scénario `À venir` (cf. FR-12) sans en connaître le contenu.
- Le MJ, lui, voit toujours le contenu complet quel que soit le statut.

#### FR-7 : Ouvrir un scénario (Brouillon → À venir)

Le MJ ouvre un scénario `Brouillon`, qui passe alors au statut `À venir` et devient visible des joueurs selon les règles d'anti-spoil (FR-6).

**Conséquences (testables) :**
- L'ouverture est une action manuelle et explicite du MJ, à tout moment de son choix — aucune ouverture automatique déclenchée par la clôture d'un autre scénario.

#### FR-8 : Vue chronologique d'une campagne

Les membres d'une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` consultent une vue listant les scénarios `Passés`, `Courant(s)`, et `À venir`, dans l'ordre chronologique (les `Brouillon` en sont exclus, cf. FR-5).

**Conséquences (testables) :**
- Cliquer sur un scénario `Passé` ouvre sa description complète, son résumé de fin (FR-15), et ses comptes-rendus de séance (FR-14).
- Cliquer sur un scénario `Courant` affiche ses participants, ses documents, et l'état de sélection de sa/ses date(s) de séance.
- Cliquer sur un scénario `À venir` n'affiche que ce qui est autorisé par FR-6.
- En `CAMPAGNE_EPISODIQUE`, la vue peut afficher plusieurs scénarios `Courant` simultanément, listés côte à côte plutôt qu'un "scénario en cours" unique (cf. FR-9).

#### FR-9 : Un seul scénario courant à la fois (linéaire) / plusieurs en parallèle (épisodique)

Une Partie `CAMPAGNE_LINEAIRE` a au plus un scénario `Courant` simultanément ; le passage au scénario suivant se fait par clôture du précédent (FR-10). Une Partie `CAMPAGNE_EPISODIQUE` peut avoir plusieurs scénarios `Courant` en parallèle (plusieurs enquêtes ouvertes en même temps, cf. FR-17).

**Conséquences (testables) :**
- En `CAMPAGNE_LINEAIRE`, ouvrir un deuxième scénario alors qu'un autre est déjà `Courant` échoue (message explicite au MJ).
- En `CAMPAGNE_EPISODIQUE`, cette contrainte ne s'applique pas — plusieurs `À venir`/`Courant` coexistent librement.

#### FR-10 : Clôturer un scénario

Le MJ peut clôturer (« fermer ») un scénario `Courant` dès qu'il souhaite y mettre fin.

**Conséquences (testables) :**
- Le scénario passe au statut `Passé`, devient consultable en lecture complète par tous les membres (levée de l'anti-spoil). En `CAMPAGNE_LINEAIRE`, le scénario suivant (s'il existe, `Brouillon` ou `À venir`) peut alors être ouvert/marqué `Courant`.
- Le MJ peut toujours corriger le résumé de fin (FR-15) après clôture — le contenu narratif de base (description/documents), lui, reste figé.

### 4.3 Séances et sélection de date

**Description :** Un scénario peut nécessiter plusieurs soirées de jeu. Réalise UJ-1 (deuxième partie), UJ-4.

#### FR-11 : Un scénario peut comporter plusieurs séances

Si la durée estimée d'un scénario dépasse une soirée, il peut être joué sur plusieurs séances successives, chacune avec sa propre date.

**Conséquences (testables) :**
- Le nombre de séances n'est pas plafonné a priori ; le MJ ajoute une nouvelle séance à un scénario existant à la demande.

#### FR-12 : Sélection de date via le vote existant (linéaire/one-shot)

Pour une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, la date d'une séance se sélectionne via le mécanisme de disponibilités/vote existant (Epics 1-3), réutilisé sans modification.

**Conséquences (testables) :**
- Aucune régression sur le comportement déjà livré du vote de date — ce FR documente la réutilisation, il n'introduit pas de nouveau comportement.

#### FR-13 : Sélection de date en avance sur plusieurs séances futures

Le MJ peut lancer la sélection de date sur une séance `À venir` (pas uniquement la séance `Courante`), pour planifier plusieurs séances d'avance.

**Conséquences (testables) :**
- Le vote de date d'une séance `À venir` reste accessible aux joueurs même si le contenu narratif du scénario correspondant reste masqué (cf. FR-6).

#### FR-14 : Compte-rendu de séance

À l'issue d'une séance individuelle, un compte-rendu court peut être rédigé, résumant ce qui s'y est passé.

**Conséquences (testables) :**
- Rédigé par le MJ (le joueur n'a pas cette capacité en v1, cf. Non-Goals).
- Visible par tous les membres de la Partie, y compris les absents de cette séance précise.

### 4.4 Rétrospective de fin de scénario

**Description :** Trace durable de ce qui s'est passé, enrichie par les joueurs. Réalise UJ-1 (fin), UJ-2 (fin).

#### FR-15 : Résumé de fin de scénario par le MJ

À la clôture d'un scénario (FR-10), le MJ rédige un résumé plus riche que les comptes-rendus de séance : événements marquants, coups d'éclat des joueurs.

**Conséquences (testables) :**
- Ce résumé est visible par tous les membres de la Partie dès la clôture.
- Éditable après coup (cf. FR-10).

#### FR-16 : Association du journal personnel à la rétrospective — configurable

Un joueur peut associer tout ou partie de son journal personnel (existant, Story 6.5) à la rétrospective d'un scénario auquel il a participé. Ce comportement est **configurable** : le joueur choisit, par défaut, quelles entrées associer explicitement (une par une) ; il peut aussi activer un réglage d'association automatique, qui rattache alors à la rétrospective toute entrée déjà partagée (`shared: true`) et datée dans la fenêtre du scénario, sans action manuelle supplémentaire.

**Conséquences (testables) :**
- Association manuelle (par défaut) : le joueur sélectionne explicitement, entrée par entrée, ce qui apparaît dans la rétrospective — aucune entrée n'y figure sans son choix actif.
- Réglage « association automatique » activé : toute entrée `shared: true` datée pendant la fenêtre du scénario apparaît automatiquement, sans étape supplémentaire ; le joueur peut désactiver le réglage à tout moment (les entrées déjà associées manuellement ne sont pas affectées par le changement de réglage).
- `[ASSUMPTION]` Le réglage d'association automatique est un booléen par joueur (pas par scénario ni par entrée). *(cf. §9 Assumptions Index — à confirmer en UX si le besoin réel diffère)*

### 4.5 Participation aux scénarios

**Description :** Diffère entre campagne linéaire (tous jouent) et campagne épisodique (sous-ensemble variable). Réalise UJ-4.

#### FR-17 : Participation implicite (linéaire/one-shot)

Pour une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, tous les membres de la Partie participent à chaque scénario — pas de sélection individuelle.

**Conséquences (testables) :**
- La liste de participants d'un scénario `CAMPAGNE_LINEAIRE` reflète toujours l'intégralité des `Membership` actifs de la Partie.

#### FR-18 : Choix individuel du scénario (campagne épisodique)

Pour une Partie `CAMPAGNE_EPISODIQUE`, chaque joueur choisit individuellement les scénarios (enquêtes) auxquels il souhaite participer, parmi le vivier de membres de la Partie.

**Conséquences (testables) :**
- Un membre de la Partie peut ignorer un scénario sans que cela affecte son statut de membre.
- Plusieurs scénarios `CAMPAGNE_EPISODIQUE` peuvent être `Courant` en parallèle (cf. FR-9).

#### FR-19 : Inscription à capacité limitée — validation manuelle par le MJ (campagne épisodique)

Pour une séance d'un scénario `CAMPAGNE_EPISODIQUE`, le MJ propose une date pour une fourchette de joueurs (min-max, ex. 4 à 6). Les joueurs intéressés s'inscrivent librement ; **l'inscription se ferme automatiquement dès que le nombre maximum est atteint** (hard cap — aucun joueur supplémentaire ne peut s'inscrire au-delà). En revanche, **c'est toujours le MJ qui valide (ou non) la date manuellement**, quel que soit le nombre d'inscrits au moment de sa décision — le système ne verrouille/valide jamais une date automatiquement, même une fois le minimum atteint. Le MJ peut valider en dessous du minimum proposé (c'est son choix), ou au contraire chercher une autre date si le nombre d'inscrits lui semble insuffisant.

**Conséquences (testables) :**
- Distinct du vote de date existant (FR-12) — mécanisme dédié, propre à `CAMPAGNE_EPISODIQUE`.
- Un joueur ne peut pas s'inscrire une fois le maximum atteint (l'inscription est refusée, message explicite).
- Aucune validation ni verrouillage automatique de la date, à aucun seuil — seule une action explicite du MJ valide la date.
- Un indicateur visuel (code couleur) reflète l'état de remplissage par rapport au min/max proposé (ex. sous le minimum / entre min et max / au maximum), pour aider le MJ à décider rapidement sans devoir compter manuellement — palette exacte à trancher en UX.

### 4.6 Annonces MJ

**Description :** Diffusion d'information à une audience choisie. Réalise JTBD dédié.

#### FR-20 : Publier une annonce

Le MJ peut publier une annonce (texte libre), visible par l'audience de son choix : toute la Partie/campagne, un one-shot, ou un scénario précis.

**Conséquences (testables) :**
- Une annonce scopée à un scénario n'est visible que par les participants de ce scénario (respecte l'anti-spoil : un joueur non participant à un scénario `CAMPAGNE_EPISODIQUE` ne voit pas ses annonces).
- Les annonces sont listées par ordre chronologique (les plus récentes en premier), consultables depuis la page de la Partie.

## 5. Non-Goals (Explicit)

- Le flow « agence » complet (annonce d'enquête pilotée par un module dédié, mécaniques Conte de Minuit) — Palier 8. Seule l'inscription à capacité limitée (FR-19) est livrée ici, comme brique réutilisable.
- Pas de notification e-mail automatique sur la modification d'un scénario ou la publication d'une annonce en v1 — consultation in-app uniquement (l'infra e-mail existante, Epic 5, reste dédiée aux rappels de séance déjà livrés).
- Pas de frise chronologique graphique/visuelle — la chronologie (FR-8) est une liste, pas une timeline illustrée.
- Pas d'entité "Événement" libre indépendante d'un scénario — la chronologie ne couvre que les scénarios eux-mêmes (et leurs séances/résumés), pas des entrées libres hors-scénario.
- Pas de compte-rendu de séance rédigé par un joueur (FR-14 MJ-only en v1) — un joueur peut en revanche toujours tenir son propre journal personnel (existant) et le partager.
- Pas de graphe de dépendances formel entre scénarios — le MJ gère l'enchaînement `Brouillon`→`À venir` manuellement (cf. FR-5/FR-7), aucune règle automatique du type "scénario B ne s'ouvre que si A est clôturé avec tel résultat".
- `[ASSUMPTION]` Pas de limite stricte de taille/format sur les documents joints en v1 — borne provisoire retenue : même plafond que l'upload de portrait existant (5 Mo, Story 4.5), à confirmer/ajuster en architecture. *(cf. §9 Assumptions Index)*
- Pas de suppression d'un scénario clôturé — historique en lecture seule, cohérent avec le choix déjà fait pour l'historique de personnage (Palier 3).
- Pas de gestion de conflits d'agenda entre plusieurs Parties — la disponibilité déclarée reste globale par utilisateur (déjà le cas, Epic 1).

## 6. MVP Scope

### 6.1 In Scope
- Création/édition de scénario (description, durée estimée, documents par scénario et par Partie).
- Statut `Brouillon` (préparation invisible) → `À venir` (anti-spoil, titre + date) → `Courant` → `Passé`, avec ouverture manuelle par le MJ.
- Vue chronologique (passés / courant(s) / à venir), plusieurs scénarios `Courant` simultanés en campagne épisodique.
- Séances multiples par scénario, sélection de date réutilisant le vote existant (linéaire/one-shot).
- Compte-rendu de séance (MJ) + résumé de fin de scénario (MJ) + association configurable du journal personnel partagé.
- Participation implicite (linéaire) vs choix individuel (épisodique).
- Inscription à capacité limitée avec validation manuelle du MJ + indicateur visuel de remplissage, pour les séances épisodiques.
- Annonces MJ à granularité variable (Partie / one-shot / scénario).

### 6.2 Out of Scope pour MVP

*Correspond exactement à la liste des Non-Goals (§5) — voir §5 pour le détail et la justification de chaque point, non répété ici. `[NOTE FOR PM]` marque les deux points explicitement rattachés à un palier futur nommé (candidats naturels à revisiter avant ce palier) ; les autres points de §5 sont des choix de scope settled, sans échéance de reconsidération prévue.*

- Flow « agence » complet — Palier 8. [NOTE FOR PM]
- Notifications e-mail sur modification de scénario / publication d'annonce. [NOTE FOR PM]

## 7. Success Metrics

*Périmètre hobby — un critère de succès simple suffit.*

- **Succès** : le MJ prépare et lance un scénario sans quitter l'application (plus de Discord/Google Docs pour la description et les documents) ; un joueur absent d'une séance comprend ce qui s'est passé en lisant le compte-rendu, sans devoir demander autour de lui ; le MJ d'une campagne épisodique voit en un coup d'œil si une date proposée a assez d'inscrits, sans compter à la main.
- **Contre-métrique** : l'anti-spoil ne doit jamais laisser fuiter le contenu d'un scénario `Brouillon` ou `À venir`, même partiellement (description, documents, participants détaillés) — un seul oubli suffirait à gâcher la surprise pour tout le groupe.

## 8. Open Questions

*Les 3 questions ouvertes de la version précédente de ce PRD ont été résolues avec l'utilisateur (cf. §3 Glossaire, FR-5/FR-7/FR-9, FR-16, FR-19) — aucune question bloquante ne reste à ce stade.*

1. Palette exacte de l'indicateur couleur (FR-19) et détail visuel de la vue "plusieurs scénarios courants" (FR-8, campagne épisodique) — à trancher en phase `bmad-ux`, pas structurant pour l'architecture/les epics.

## 9. Assumptions Index

- §4.1 (FR-1) — Pour `ONE_SHOT`, le scénario unique est créé automatiquement à la création de la Partie (pas d'étape manuelle séparée) : **assumption, à confirmer en UX**.
- §4.4 (FR-16) — Le réglage d'association automatique est un booléen par joueur (pas par scénario ni par entrée) : **assumption, à confirmer en UX si le besoin réel diffère**.
- §5 — Les documents joints suivent le même pattern de stockage que le portrait de personnage (upload local, plafond provisoire 5 Mo, Story 4.5) : **assumption, à confirmer/ajuster en architecture**.
