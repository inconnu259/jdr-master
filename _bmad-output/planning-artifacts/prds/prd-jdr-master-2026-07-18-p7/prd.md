---
title: 'PRD — Palier 7 : Synchronisation client/serveur en temps quasi réel (SSE)'
status: final
created: '2026-07-18'
updated: '2026-07-18'
---

# PRD: Palier 7 — Synchronisation client/serveur en temps quasi réel (SSE)

## 0. Document Purpose

Ce PRD cadre le Palier 7 : éliminer le besoin, pour un joueur ou un MJ, de recharger manuellement une page (F5) pour voir une modification faite par quelqu'un d'autre — un autre membre de la Partie, ou soi-même depuis un autre onglet. Ce n'est **pas** un vrai temps réel bidirectionnel (pas de curseurs live, pas d'édition collaborative) : juste un signal serveur léger qui dit « quelque chose a changé sur la Partie X », et le client déclenche le refetch qu'il sait déjà faire. **Approche tranchée avec l'utilisateur : Server-Sent Events (SSE)**, pas de polling ni de WebSockets.

Contrairement à une simple story de câblage sur 4 pages, ce palier vise un critère **exhaustif** sur un périmètre élargi : une recherche dédiée (cf. §4.2) a été menée pour identifier tous les composants qui chargent leurs données une fois au montage sans jamais se rafraîchir sur un changement externe — au-delà des 4 pages déjà connues du backlog.

**Ordre d'exécution acté avec l'utilisateur (2026-07-18) :** Épic 12 → Palier 6 (dette technique) → **Palier 7 (ce PRD)** → Palier 8 (refonte contenu Ryuutama) → Paliers 9 à 14. Ce palier ne démarre donc qu'une fois le Palier 6 terminé.

## 1. Vision

Le projet a déjà corrigé ce problème plusieurs fois au cas par cas (`PartieDetail.partie` via un écouteur `visibilitychange`, `ScenarioTimeline`/`SeanceList` via des signaux `changed` locaux) — sans jamais de mécanisme systémique. Ce palier introduit ce mécanisme une bonne fois : un événement serveur poussé, scopé par Partie, qui remplace ces patchs ponctuels et couvre aussi les angles morts jamais corrigés (fiche de personnage, dashboard, brouillons de scénario...).

## 2. Target User

Pas de nouveau persona — sert les utilisateurs déjà en place (MJ et joueurs) de façon directe : moins de confusion sur l'état réel d'une partie, moins de « pourquoi je ne vois pas ce que l'autre vient de faire ».

## 3. Glossary

- **Signal `changed`** — mécanisme frontend déjà en place (`ScenariosService`, etc.) : un signal qu'un composant peut écouter pour déclencher son propre refetch. Aujourd'hui déclenché uniquement par une action locale.
- **SSE (Server-Sent Events)** — connexion HTTP longue durée unidirectionnelle serveur→client (`@Sse()` côté NestJS, `EventSource` côté navigateur), permettant au serveur de pousser des événements sans que le client interroge en boucle.
- **Scopé par Partie** — granularité choisie pour les événements poussés : un événement dit « quelque chose a changé sur la Partie X », jamais « telle ressource précise a changé » (pas de canal par scénario/séance/personnage individuel).

## 4. Features

### 4.1 Mécanisme d'émission et de connexion SSE

**Description :** Le cœur technique du palier — rien de tel n'existe encore dans ce projet. Un mécanisme d'émission d'événements côté NestJS, une connexion d'écoute côté Angular, une reconnexion robuste.

**Functional Requirements:**

#### FR-1: Émission d'un événement de changement scopé par Partie

Toute mutation qui modifie l'état visible d'une Partie (scénario, séance, personnage, sondage, invitation, annonce...) déclenche l'émission d'un événement serveur associé à l'identifiant de cette Partie.

**Consequences (testable):**
- Une mutation sur une Partie A ne déclenche jamais d'événement reçu par un client connecté uniquement à la Partie B.
- Le mécanisme d'émission est générique (pas un canal dédié par type de ressource) — cohérent avec la granularité « scopée par Partie » actée avec l'utilisateur.

#### FR-2: Connexion d'écoute côté client

Un client connecté à une page appartenant à une Partie ouvre une connexion SSE écoutant les événements de cette Partie, et la ferme proprement quand il quitte cette Partie (changement de page, fermeture d'onglet).

**Consequences (testable):**
- Aucune connexion SSE ne reste ouverte après que l'utilisateur a quitté toutes les pages de la Partie concernée.
- Un même utilisateur avec plusieurs onglets ouverts sur des Parties différentes maintient une connexion par Partie active, sans interférence entre elles.

#### FR-3: Reconnexion silencieuse avec rattrapage

Une coupure de connexion (réseau instable, mise en veille) est suivie d'une reprise automatique en arrière-plan, sans qu'aucun indicateur de statut ne soit affiché à l'utilisateur.

**Décidé avec l'utilisateur (2026-07-18) :** reconnexion silencieuse, pas de pastille ni de message « connexion perdue ».

**Consequences (testable):**
- À la reconnexion, un refetch complet des données actuellement affichées est déclenché (rattrape tout ce qui aurait pu être manqué pendant la coupure), pas seulement les événements ratés.
- L'utilisateur ne voit jamais d'erreur ni d'interruption visible liée à la seule perte de connexion SSE (les autres fonctionnalités de la page restent utilisables).

**Out of Scope:**
- Pas de mécanisme de rattrapage événement-par-événement (buffer d'événements manqués, `Last-Event-ID`) — le refetch complet à la reconnexion suffit, cohérent avec le principe « juste déclencher le refetch déjà existant ».

### 4.2 Câblage sur les pages et composants concernés

**Description :** Chaque composant identifié (liste ci-dessous, issue du backlog + d'une recherche dédiée dans le code) écoute désormais le signal de changement scopé par Partie, en plus de son mécanisme de refetch existant après action locale.

**Functional Requirements:**

#### FR-4: `PartieDetail`

Se rafraîchit sur événement serveur, en remplacement du patch `visibilitychange` existant (qui ne couvrait que le cas « retour de focus d'onglet », pas un autre onglet resté visible).

**Consequences (testable):**
- Une modification de la Partie par un autre membre est reflétée sans que l'onglet ait besoin de perdre puis regagner le focus.

#### FR-5: `ScenarioTimeline`

Se rafraîchit sur événement serveur (en complément de la réactivité au changement de `partieId` déjà couverte par le Palier 6, FR-3).

**Consequences (testable):**
- Un scénario ajouté, modifié ou clôturé par un autre membre apparaît dans `ScenarioTimeline` sans rechargement de page.

#### FR-6: `SeanceList`

Se rafraîchit sur événement serveur.

**Consequences (testable):**
- Une inscription, désinscription, ou modification de séance faite par un autre membre est reflétée dans `SeanceList` sans rechargement de page.

#### FR-7: `CalendarView`

Se rafraîchit sur événement serveur — corrige le cas où un autre joueur vote ou où le MJ ouvre un sondage pendant que la page reste ouverte ailleurs.

**Consequences (testable):**
- Un vote d'un autre joueur ou l'ouverture d'un nouveau sondage par le MJ est visible dans `CalendarView` sans rechargement de page.

#### FR-8: `ScenarioEditor` / `ScenarioReadDialog`

Se rafraîchissent sur événement serveur **pendant qu'ils restent ouverts**, pas seulement au montage — corrige un angle mort documenté depuis leur correctif initial (staleness du statut de vote).

**Consequences (testable):**
- Un dialogue de lecture/édition de scénario resté ouvert reflète une modification faite ailleurs sans que l'utilisateur ait à le fermer/rouvrir.
- Interaction avec Palier 6 FR-5 (brouillon en cours de saisie) : un champ en cours de frappe n'est jamais écrasé sauf si le serveur a modifié précisément ce champ (règle déjà actée, réutilisée ici telle quelle).

#### FR-9: `CharacterSheet`

Se rafraîchit sur événement serveur — corrige le cas où le MJ distribue de l'XP/valide un passage de niveau pendant qu'un joueur a sa fiche ouverte.

**Consequences (testable):**
- Une distribution d'XP ou un passage de niveau fait par le MJ apparaît sur `CharacterSheet` sans rechargement de page.

#### FR-10: `HommeDragonSheet`

Se rafraîchit sur événement serveur — même classe de correctif que FR-9 : `pendingEveilLevels`/`eveilPowers` chargés une fois au montage, jamais mis à jour si le MJ distribue de l'XP pendant que la fiche reste ouverte.

**Consequences (testable):**
- Un niveau débloquant un pouvoir d'éveil, distribué par le MJ, apparaît sur `HommeDragonSheet` sans rechargement de page.

#### FR-11: `Dashboard` (invitations reçues)

Se rafraîchit sur événement serveur — corrige le cas où une invitation est envoyée ou révoquée par un MJ pendant que le dashboard reste ouvert dans un autre onglet.

**Note :** ce cas est un peu différent des autres (l'événement concerné n'est pas scopé à une Partie existante, puisque l'invitation précède l'appartenance à la Partie) — le mécanisme exact (canal par utilisateur en plus du canal par Partie, ou canal dédié) est laissé à l'architecture (cf. Open Question 1).

**Consequences (testable):**
- Une invitation envoyée ou révoquée par un MJ apparaît/disparaît de la liste des invitations reçues sur `Dashboard` sans rechargement de page — quel que soit le mécanisme de canal retenu en architecture.

**Out of Scope:**
- Le reste du `Dashboard` (liste des Parties du joueur) n'est pas concerné — déjà correctement réactif aujourd'hui, pas un angle mort.

#### FR-12: `ScenarioDrafts` / `ScenarioOneShotTab`

Se rafraîchissent sur événement serveur — corrige le cas où un co-MJ crée, publie ou supprime un brouillon de scénario pendant que la vue reste ouverte ailleurs.

**Consequences (testable):**
- Un brouillon créé, publié ou supprimé par un co-MJ est reflété dans `ScenarioDrafts`/`ScenarioOneShotTab` sans rechargement de page.

#### FR-13: `AnnouncementForm` (liste des scénarios éligibles)

Se rafraîchit sur événement serveur — corrige le cas où un scénario devient `COURANT` (ou change de statut) pendant que le formulaire d'annonce reste ouvert, sans que le sélecteur de scénarios le reflète.

**Consequences (testable):**
- Un changement de statut de scénario fait ailleurs met à jour la liste des scénarios éligibles dans `AnnouncementForm` resté ouvert, sans rechargement de page.

**Out of Scope:**
- `ScenarioDetail` n'est pas une cause racine distincte — simple wrapper routé de `ScenarioEditor` (FR-8), corrigé par transitivité.

`[NOTE FOR PM]` La liste ci-dessus est une photo prise au moment de la rédaction de ce PRD. Du temps peut s'écouler avant l'implémentation (comme observé sur le Palier 6, où de nouveaux items différés sont apparus entre le PRD et le début des stories). **Avant de créer les stories de câblage (§4.2), refaire une passe de détection** (même méthode que la recherche ayant produit cette liste) pour confirmer qu'aucun nouveau composant avec le même problème n'est apparu entre-temps.

### 4.3 Cohérence des services partagés

**Description :** Deux services frontend partagés (`OpenPollsService`, `ModeService`) sont déjà réactifs, mais uniquement au changement de la liste des Parties du joueur (`playerParties`) — pas aux changements internes d'un sondage ou d'une invitation sur une Partie déjà connue. Un gap systémique repéré lors de la recherche du §4.2, distinct des composants un par un.

**Functional Requirements:**

#### FR-14: Réactivité des services partagés au signal de changement

`OpenPollsService` et `ModeService` (ou équivalents) se resynchronisent aussi sur l'événement de changement scopé par Partie, pas uniquement sur un changement de la liste de Parties du joueur.

**Consequences (testable):**
- Un sondage ouvert par le MJ sur une Partie déjà affichée est détecté par `OpenPollsService` sans qu'un changement de la liste de Parties du joueur soit nécessaire pour le déclencher.

### 4.4 Pérennité de la convention SSE au-delà de ce palier

**Description :** Une fois le mécanisme en place, le risque redevient le même que celui qui a motivé ce palier : un nouveau composant ajouté plus tard (Palier 8+) affichant des données scopées à une Partie, sans que personne ne pense à le câbler sur le signal de changement — recréant le même problème de désynchro au fil du temps.

**Functional Requirements:**

#### FR-15: Convention documentée de vérification SSE pour tout nouvel ajout

Une règle de conception est écrite dans un document durable du projet (`CLAUDE.md` et/ou `docs/checklist.md`, à trancher à l'implémentation) : tout nouveau composant/page qui affiche des données scopées à une Partie doit être évalué, au moment de sa création, pour un besoin de câblage sur le signal de changement SSE.

**Consequences (testable):**
- La règle existe, écrite noir sur blanc, dans un document que les paliers suivants (8+) consulteront naturellement (cohérent avec l'usage déjà établi de `CLAUDE.md`/`docs/checklist.md` comme rappels systématiques dans ce projet).
- Ce n'est pas une garde automatisée (pas de lint/CI) — une vérification humaine/agent documentée suffit à ce stade, cohérent avec le contexte hobby.

## 5. Non-Goals (Explicit)

- Aucun temps réel bidirectionnel (pas de curseurs live, pas d'édition collaborative caractère-par-caractère) — seulement un signal « quelque chose a changé, refetch ».
- Aucun WebSocket — SSE tranché avec l'utilisateur, cohérent avec le besoin unidirectionnel serveur→client.
- Aucun mécanisme de rattrapage événement-par-événement (`Last-Event-ID`, buffer) — refetch complet à la reconnexion (cf. FR-3 Out of Scope).
- Aucune préoccupation de montée en charge horizontale (pas de broker Redis/pub-sub inter-instances) — une seule instance NestJS assumée, cohérent avec le contexte hobby.
- Aucune granularité d'événement plus fine que « Partie » (pas de canal par scénario/séance/personnage) — décision actée avec l'utilisateur.
- Le Palier 6 (dette technique) n'est pas repris ici, même si FR-8 s'appuie sur sa décision FR-5 (brouillon en édition concurrente).

## 6. MVP Scope

### 6.1 In Scope
- FR-1 à FR-15 (mécanisme SSE générique + câblage sur 10 composants + cohérence des 2 services partagés + convention documentée pour l'avenir).

### 6.2 Out of Scope for MVP
- Tout ce qui figure en §5 Non-Goals.
- `[NOTE FOR PM]` Comme pour le Palier 6, si un composant supplémentaire avec le même problème est découvert en cours d'implémentation, revenir vers l'utilisateur avant de le traiter hors périmètre ou de le re-différer silencieusement — le critère d'exhaustivité de ce palier porte sur les composants listés en §4.2/§4.3, pas sur « tout ce qui existe dans le code ».

## 7. Success Metrics

Contexte hobby — pas de métriques quantitatives formelles.

- **Succès** : aucune des pages/composants listés en §4.2/§4.3 ne nécessite plus un rechargement manuel (F5) pour refléter, en quelques secondes, un changement fait par un autre membre ou depuis un autre onglet.
- **Contre-mesure** : ne pas transformer ce palier en sur-ingénierie temps réel — pas de latence sub-seconde visée, pas de mécanisme de fiabilité de livraison de niveau messagerie (at-least-once garanti, etc.) ; le refetch complet en cas de doute (reconnexion) est une réponse acceptable et volontairement simple.

## 8. Open Questions

1. **FR-11 (Dashboard/invitations)** : canal d'événement pour un utilisateur pas encore membre d'une Partie (donc hors du scope « par Partie ») — mécanisme exact laissé à l'architecture, à trancher au démarrage de l'implémentation.
2. **Volume de connexions SSE simultanées** : pas de limite ni de comportement dégradé défini si un même utilisateur ouvre un grand nombre d'onglets/Parties simultanément — jugé non pertinent à l'échelle hobby actuelle, à revisiter seulement si l'usage réel le justifie.

## 9. Assumptions Index

- [ASSUMPTION §4.1] Une seule instance NestJS en production (pas de load balancing multi-instance) — pas besoin de broker de messages pour propager les événements entre instances, cohérent avec le déploiement hobby actuel du projet.
- [ASSUMPTION §4.1 FR-2] L'API `EventSource` native du navigateur est suffisante côté client (pas de nouvelle dépendance de librairie SSE) — sa reconnexion automatique native peut être réutilisée ou complétée par un thin wrapper, détail laissé à l'architecture.
