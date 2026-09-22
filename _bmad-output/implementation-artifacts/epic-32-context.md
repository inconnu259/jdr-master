# Epic 32 Context: Vue de partie et chronologie

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le contenu d'une partie cesse d'être un fouillis : l'onglet Détails juxtapose aujourd'hui la prochaine séance, la distribution d'XP, les fiches et les annonces sans hiérarchie, et Scénario/Chronologie sont jugés illisibles. Cet épic réorganise la vue de partie en séparant l'action immédiate, la consultation et la référence, statue explicitement sur la place des fonctionnalités arrivées au fil des paliers (rôles de groupe, XP, gestion des membres, rappels e-mail), refond la lisibilité des états de scénario et de séance, refond la chronologie pour rendre lisible l'enchaînement des scénarios — sans jamais trahir l'existence d'un brouillon au joueur — et corrige l'autocomplétion des invitations.

## Stories

- Story 32.1 : Autocomplétion des invitations
- Story 32.2 : Réorganisation de la vue de partie
- Story 32.3 : États de scénario et de séance
- Story 32.4 : Refonte de la chronologie

## Requirements & Constraints

- La recherche d'utilisateurs pour l'invitation doit passer d'une égalité stricte à une correspondance partielle sur le pseudo uniquement — jamais sur l'e-mail, jamais un e-mail renvoyé dans les résultats. Une longueur minimale de saisie et un plafond de résultats sont requis mais restent à arrêter au moment de concevoir cet écran (question ouverte, pas encore tranchée).
- L'invitation par e-mail exact doit continuer de fonctionner sans changement.
- La vue de partie doit distinguer visuellement ce qui appelle une action immédiate, ce qui relève de consultation et ce qui relève de référence ; sur mobile, ce qui appelle une action doit être visible sans défilement. Les actions réservées au MJ ne doivent jamais être proposées à un joueur.
- Dix états existent au total (quatre de scénario, six de séance) et doivent se partager seulement quatre teintes ; l'état précis est toujours porté par un libellé, jamais par la seule couleur (règle transverse : la couleur ne dit jamais « qu'est-ce que c'est ? » mais « est-ce que ça me concerne maintenant ? »).
- Deux teintes identiques pour un même état sous-jacent (ex. vote répondu / non répondu) exigent deux libellés distincts.
- Un brouillon de scénario n'est jamais une cinquième couleur : c'est un traitement de forme (contour tireté), pour rester lisible à qui distingue mal les couleurs.
- La chronologie côté joueur doit s'arrêter au dernier scénario publié, sans espace vide, nœud fantôme ni compteur trahissant l'existence d'un brouillon ; le MJ, lui, voit son brouillon distinctement marqué, avec un compteur d'en-tête qui diffère légitimement de celui du joueur.
- Le filtrage anti-spoil est une responsabilité du rendu frontend et n'est jamais redondant avec un filtrage serveur : il n'en existe aucun à retirer.
- `prefers-reduced-motion` doit couper toute animation (badges/compte à rebours) sans qu'aucune information ne disparaisse au repos.

## Technical Decisions

- **Anti-spoil résolu côté client (AD-20).** La vue de partie et la chronologie détiennent déjà toute la charge utile nécessaire : `PollOptionDto.votes` porte le `userId` de tous les votants (permet de savoir si l'utilisateur courant a répondu), et les scénarios brouillons vivent derrière un endpoint MJ dédié (`GET /parties/:id/scenarios/drafts`) distinct de la liste normale. Aucun endpoint serveur de calcul d'état par lecteur n'est à construire. Rappel de fait à ne jamais inverser : `ScenariosService.findAllForPartie` / `GET /parties/:id/scenarios` ne filtre **aucun** statut — renvoie les scénarios `BROUILLON` à tout membre — c'est le rendu frontend qui masque, jamais le serveur.
- **Projection explicite des parties (AD-15).** `PartiesService` ne renvoie plus jamais l'objet Prisma brut ; toute donnée de partie affichée passe par une projection énumérant ses champs.
- **Recherche partielle sur le pseudo, une dérogation serveur actée mais de faible ampleur (D-8/FR-30).** Câblage front déjà existant (`PartiesService.searchUsers()` appelle déjà `GET /users/search`) ; seul le comportement de l'endpoint (égalité stricte → correspondance partielle) et l'ergonomie de saisie restent à livrer.
- **États dépendants du lecteur, condition de révision nommée :** un calcul serveur ne redeviendrait justifié que si l'on voulait un jour masquer l'identité des autres votants — hors périmètre ici (dérogation D-12, actée à ampleur nulle).

## UX & Interaction Patterns

- **`StatusBadge`** : teinte issue de la palette de statut du thème actif, libellé toujours présent. Trois paliers d'imminence pour une séance qui approche — contour seul au-delà de 7 jours, teinté de 7 à 2 jours, plein la veille/le jour même avec libellé humain (« demain soir », « ce soir », jamais « J-1 ») — l'imminence est une intensité de forme, jamais une cinquième couleur, donc lisible sans percevoir la couleur.
- **`StateRail`** : bande verticale de 4 px, équivalent exact de la pastille de la liste des parties — même vocabulaire d'état quel que soit le mode d'affichage.
- Un scénario brouillon ne peut être signalé que par son libellé, jamais par la seule forme d'une bande/pastille trop fine pour porter un contour tireté.
- La refonte de la vue de partie doit statuer explicitement, et par écrit dans l'écran livré, sur la place de chaque fonctionnalité existante (rôles de groupe, distribution d'XP, gestion des membres, rappels e-mail) — aucune ne doit disparaître sans décision documentée.
- Chronologie : chaque nœud ancré sur la ligne, dates affichées, espacement lisible ; état et séances d'un scénario lisibles sans l'ouvrir.

## Cross-Story Dependencies

- **Prérequis dur : story 29.0** (palettes de statut des trois thèmes) doit être livrée avant 32.3 — les quatre teintes distinguables par thème sont un prérequis explicite, pas une supposition.
- Q-14 (longueur minimale de saisie, plafond de résultats pour l'autocomplétion de 32.1) est une question encore ouverte, à trancher à la conception de l'écran d'invitation — pas de valeur imposée par le PRD.
- Rappel transverse du dépôt : toute nouvelle vue affichant des données scopées à une partie (vue de partie, chronologie) doit être évaluée pour un câblage sur le signal `changed`/`notifyChanged()` via `RealtimeService`.
