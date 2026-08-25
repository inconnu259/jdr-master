---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18-p7/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md
---

# jdr-master — Epic Breakdown — Palier 7 : Synchronisation client/serveur en temps quasi réel (SSE)

## Overview

Ce document décompose les 15 exigences fonctionnelles du PRD Palier 7 (`prd-jdr-master-2026-07-18-p7`) et les 10 décisions d'architecture de sa spine (`architecture-jdr-master-2026-07-18-p7`) en epics et stories implémentables. Palier de mécanisme transverse — un bus d'événements SSE générique (scopé par Partie ou par utilisateur) éliminant le besoin de rechargement manuel, câblé sur 10 composants et 2 services partagés. Ne démarre qu'une fois le Palier 6 terminé (ordre acté avec l'utilisateur).

## Requirements Inventory

### Functional Requirements

FR1: Toute mutation qui modifie l'état visible d'une Partie (scénario, séance, personnage, sondage, invitation, annonce...) déclenche l'émission d'un événement serveur associé à l'identifiant de cette Partie — mécanisme d'émission générique, pas un canal dédié par type de ressource.

FR2: Un client connecté à une page appartenant à une Partie ouvre une connexion SSE écoutant les événements de cette Partie, et la ferme proprement en quittant cette Partie (changement de page, fermeture d'onglet) — plusieurs onglets sur des Parties différentes maintiennent chacun leur propre connexion active, sans interférence.

FR3: Une coupure de connexion (réseau instable, mise en veille) est suivie d'une reprise automatique silencieuse (aucun indicateur affiché), avec un refetch complet des données affichées à la reconnexion — rattrape tout ce qui aurait pu être manqué, pas seulement un rejeu des événements ratés.

FR4: `PartieDetail` se rafraîchit sur événement serveur, en remplacement du patch `visibilitychange` existant (qui ne couvrait que le retour de focus d'onglet).

FR5: `ScenarioTimeline` se rafraîchit sur événement serveur, en complément de la réactivité au changement de `partieId` déjà couverte par le Palier 6 (FR3).

FR6: `SeanceList` se rafraîchit sur événement serveur — une inscription, désinscription ou modification de séance faite par un autre membre est reflétée sans rechargement de page.

FR7: `CalendarView` se rafraîchit sur événement serveur — corrige le cas où un autre joueur vote ou où le MJ ouvre un sondage pendant que la page reste ouverte ailleurs.

FR8: `ScenarioEditor`/`ScenarioReadDialog` se rafraîchissent sur événement serveur **pendant qu'ils restent ouverts**, pas seulement au montage — sans jamais écraser un champ en cours de frappe, sauf si le serveur a modifié précisément ce champ (règle Palier 6 FR-5, réutilisée telle quelle).

FR9: `CharacterSheet` se rafraîchit sur événement serveur — corrige le cas où le MJ distribue de l'XP/valide un passage de niveau pendant qu'un joueur a sa fiche ouverte.

FR10: `HommeDragonSheet` se rafraîchit sur événement serveur — même classe de correctif que FR9 : `pendingEveilLevels`/`eveilPowers` jamais mis à jour si le MJ distribue de l'XP pendant que la fiche reste ouverte.

FR11: `Dashboard` (invitations reçues) se rafraîchit sur événement serveur — corrige le cas où une invitation est envoyée/révoquée par un MJ pendant que le dashboard reste ouvert ailleurs. Cas particulier : canal scopé par utilisateur, pas par Partie (l'invitation précède l'appartenance). Le reste du Dashboard (liste des Parties) n'est pas concerné, déjà réactif.

FR12: `ScenarioDrafts`/`ScenarioOneShotTab` se rafraîchissent sur événement serveur — corrige le cas où un co-MJ crée, publie ou supprime un brouillon de scénario pendant que la vue reste ouverte ailleurs.

FR13: `AnnouncementForm` (liste des scénarios éligibles) se rafraîchit sur événement serveur — corrige le cas où un scénario change de statut pendant que le formulaire reste ouvert. `ScenarioDetail` n'est pas une cause racine distincte (wrapper de `ScenarioEditor`, FR8).

FR14: `OpenPollsService` et `ModeService` se resynchronisent aussi sur l'événement de changement scopé par Partie, pas uniquement sur un changement de la liste de Parties du joueur (`playerParties`) — gap systémique distinct du câblage composant par composant.

FR15: Une convention est documentée (`CLAUDE.md` et/ou `docs/checklist.md`) : tout nouveau composant/page affichant des données scopées à une Partie doit être évalué pour un besoin de câblage SSE — pas de garde automatisée, vérification humaine/agent documentée.

### NonFunctional Requirements

NFR1: Aucune latence sub-seconde visée, aucune garantie de livraison de type messagerie (at-least-once) — un refetch complet en quelques secondes après un changement est une réponse acceptable, y compris en cas de doute (reconnexion).

NFR2: Aucune préoccupation de montée en charge horizontale — une seule instance NestJS assumée (pas de broker Redis/pub-sub inter-instances), cohérent avec le déploiement hobby actuel.

NFR3: Toute route SSE applique le même contrôle d'appartenance/autorisation que les routes REST équivalentes (`getViewable`/`getOwned`, ou identité de l'utilisateur authentifié pour le canal utilisateur) — aucun nouveau mécanisme d'autorisation.

NFR4: Le mécanisme générique de refetch ne doit jamais contourner une règle produit déjà actée ailleurs — en particulier la non-écrasement d'un brouillon en cours de saisie (Palier 6 FR-5, applicable à FR8 de ce palier).

### Additional Requirements

- Nouveau module NestJS unique pour ce palier : `RealtimeModule` (`apps/api/src/realtime/`), marqué `@Global()`, exportant `RealtimeEventsService` — tout autre module l'injecte sans le réimporter (AD-9).
- Bus interne : `RealtimeEventsService` construit sur un `Subject` RxJS unique, filtré par clé de topic opaque (`partie:{id}` / `user:{id}`) — aucune nouvelle dépendance (`@nestjs/event-emitter` explicitement écarté) (AD-1, AD-7).
- Construction du topic exclusivement via des helpers partagés `partieTopic(id)`/`userTopic(id)` (backend et frontend) — jamais d'interpolation ad hoc dans un composant (AD-7).
- Émission (`emit(topic)`) toujours après résolution complète de l'écriture — jamais à l'intérieur d'un callback `prisma.$transaction(...)` (AD-2). Concerne `poll.service.ts`, `scenarios.service.ts`, `character.service.ts`, `homme-dragon.service.ts`, `invite-links.service.ts`.
- Endpoint `GET /parties/:id/events` et `GET /users/me/events` (même service interne, deux contrôles d'accès distincts) — cf. AD-5, AD-7.
- Nouveau `RealtimeService` frontend (`apps/web/src/app/core/realtime/`) : API publique fixe `connect(topic): void`/`disconnect(topic): void`, tableau de correspondance topic→services interne et unique, jamais passé par l'appelant (AD-3). Instancie `EventSource` avec `{ withCredentials: true }` (auth par cookie de session) (AD-5).
- Chaque service consommé expose un contrat public `notifyChanged(): void` — mécanisme interne libre (signal `_changed` existant pour `ScenariosService` ; signal `_changed` **nouvellement introduit** pour `CharacterService`/`HommeDragonService`, purs wrappers HTTP à ce jour ; déclenchement direct de la logique de rafraîchissement existante pour `OpenPollsService`/`ModeService`, sans compteur `_changed` équivalent) (AD-4).
- Aucun wrapper de reconnexion (`reconnecting-eventsource` écarté) — comportement natif du navigateur ; sur l'événement `open` (connexion initiale et reconnexion), `RealtimeService` appelle `notifyChanged()` sur tous les services mappés au topic (AD-8).
- Dépendance à monter avant l'implémentation : `@nestjs/common` (et packages `@nestjs/*` associés) vers `>=11.1.28` — corrige un teardown d'Observable SSE à la déconnexion client pertinent pour AD-6.
- Aucune modification de schéma Prisma pour ce palier.

### UX Design Requirements

Aucune — pas de document UX pour ce palier (aucune nouvelle capacité produit visible, cf. PRD §2 Target User ; mécanisme transverse de rafraîchissement, pas de nouvelle UI).

### FR Coverage Map

FR1: Epic 18 - Mécanisme d'émission scopée par Partie
FR2: Epic 18 - Connexion d'écoute côté client
FR3: Epic 18 - Reconnexion silencieuse avec rattrapage
FR4: Epic 18 - Câblage PartieDetail (premier résultat démontrable)
FR5: Epic 19 - Câblage ScenarioTimeline
FR6: Epic 19 - Câblage SeanceList
FR7: Epic 19 - Câblage CalendarView
FR8: Epic 19 - Câblage ScenarioEditor/ScenarioReadDialog (avec garde brouillon)
FR9: Epic 20 - Câblage CharacterSheet
FR10: Epic 20 - Câblage HommeDragonSheet
FR11: Epic 21 - Câblage Dashboard (invitations, canal utilisateur)
FR12: Epic 21 - Câblage ScenarioDrafts/ScenarioOneShotTab
FR13: Epic 21 - Câblage AnnouncementForm
FR14: Epic 22 - Réactivité OpenPollsService/ModeService
FR15: Epic 22 - Convention documentée pour l'avenir

## Epic List

### Epic 18: Fondation temps réel + Partie en direct
En tant que joueur ou MJ, je vois les changements faits par un autre membre sur la page d'une Partie sans avoir à recharger la page. Pose le mécanisme SSE générique (bus d'événements, connexion, reconnexion) et livre son premier résultat démontrable en le câblant sur `PartieDetail`, en remplacement du patch `visibilitychange` existant.
**FRs covered:** FR1, FR2, FR3, FR4

### Epic 19: Scénarios, séances et calendrier en direct
En tant que joueur ou MJ, les listes de scénarios, de séances et le calendrier de disponibilités restent à jour sans rechargement, y compris pour un dialogue de scénario resté ouvert — sans jamais perdre une saisie en cours.
**FRs covered:** FR5, FR6, FR7, FR8

### Epic 20: Fiches de personnage en direct
En tant que joueur, je vois apparaître une distribution d'XP ou un passage de niveau (y compris un pouvoir d'éveil Homme Dragon) fait par le MJ sans recharger ma fiche.
**FRs covered:** FR9, FR10

### Epic 21: Dashboard, brouillons et annonces en direct
En tant que joueur ou MJ, je vois apparaître une invitation reçue, un brouillon de scénario créé par un co-MJ, ou un scénario nouvellement éligible dans un formulaire d'annonce resté ouvert — sans recharger la page.
**FRs covered:** FR11, FR12, FR13

### Epic 22: Cohérence des services partagés et pérennité de la convention
En tant que joueur, je vois un sondage ouvert par le MJ détecté par les services partagés de l'application (pas seulement sur les pages déjà câblées) ; et l'équipe dispose d'une règle documentée pour ne pas recréer ce problème de désynchro sur les futurs paliers.
**FRs covered:** FR14, FR15

## Epic 18: Fondation temps réel + Partie en direct

En tant que joueur ou MJ, je vois les changements faits par un autre membre sur la page d'une Partie sans avoir à recharger la page. Pose le mécanisme SSE générique (bus d'événements, connexion, reconnexion) et livre son premier résultat démontrable en le câblant sur `PartieDetail`, en remplacement du patch `visibilitychange` existant.

### Story 18.1: Bus d'événements et émission scopée par Partie (backend)

As a joueur ou MJ,
I want que toute mutation touchant une Partie (scénario, séance, personnage, sondage, invitation, annonce...) déclenche un signal serveur associé à cette Partie,
So that le mécanisme de rafraîchissement en direct ait une source d'événements fiable à écouter.

**Acceptance Criteria:**

**Given** une mutation est effectuée sur une Partie A (ex. `ScenariosService`, `PollService`, `CharacterService`)
**When** l'écriture est complètement résolue (jamais depuis l'intérieur d'un callback `prisma.$transaction`)
**Then** un événement est émis, associé exclusivement au topic de la Partie A

**Given** un client est abonné uniquement au topic de la Partie B
**When** une mutation survient sur la Partie A
**Then** ce client ne reçoit aucun événement

**Given** le nouveau `RealtimeModule` (`apps/api/src/realtime/`)
**When** un autre module (`ScenariosModule`, `PollModule`, `CharacterModule`, etc.) a besoin d'émettre un événement
**Then** il injecte `RealtimeEventsService` sans le réimporter (module marqué `@Global()`)

### Story 18.2: Connexion SSE et reconnexion côté client

As a joueur ou MJ,
I want que mon navigateur écoute les événements d'une Partie via une connexion SSE qui se rétablit silencieusement en cas de coupure,
So that je n'ai jamais à me soucier de la fiabilité de la connexion ni à voir un message d'erreur pour ça.

**Acceptance Criteria:**

**Given** l'endpoint `GET /parties/:id/events`
**When** un client authentifié membre de la Partie ouvre une connexion
**Then** il reçoit les événements de cette Partie ; un utilisateur non membre reçoit un refus (même contrôle `getViewable`/`getOwned` que le reste de l'API)

**Given** la connexion `EventSource` du client
**When** elle est instanciée
**Then** elle est créée avec `{ withCredentials: true }` (le cookie de session est transmis, y compris en dev cross-origin)

**Given** une coupure de connexion (réseau instable, mise en veille)
**When** le navigateur reconnecte automatiquement (comportement natif `EventSource`, aucun wrapper de retry custom)
**Then** aucun indicateur d'erreur ou de statut de connexion n'est affiché à l'utilisateur

**Given** une connexion qui s'ouvre (connexion initiale ou reconnexion réussie)
**When** l'événement `open` se déclenche
**Then** un refetch complet des données du topic concerné est déclenché — rattrape tout ce qui aurait pu être manqué pendant la coupure

**Given** un composant qui quitte la Partie (changement de page, fermeture d'onglet)
**When** il est détruit
**Then** sa connexion SSE est fermée proprement (`DestroyRef`), sans laisser de connexion orpheline

### Story 18.3: Câblage PartieDetail sur le signal temps réel

As a joueur ou MJ,
I want que la page de détail d'une Partie reflète une modification faite par un autre membre sans que j'aie besoin de changer d'onglet puis d'y revenir,
So that je vois toujours l'état réel de la Partie.

**Acceptance Criteria:**

**Given** `PartieDetail` affiché sur une Partie
**When** un autre membre modifie la Partie (ex. édition via `/parties/:id/edit` dans un autre onglet)
**Then** la page se met à jour automatiquement, sans que l'onglet ait besoin de perdre puis regagner le focus

**Given** le patch `visibilitychange` actuellement en place sur `PartieDetail`
**When** le câblage SSE est en place
**Then** ce patch est retiré (remplacé, pas cumulé) — un seul mécanisme de rafraîchissement pour ce composant

## Epic 19: Scénarios, séances et calendrier en direct

En tant que joueur ou MJ, les listes de scénarios, de séances et le calendrier de disponibilités restent à jour sans rechargement, y compris pour un dialogue de scénario resté ouvert — sans jamais perdre une saisie en cours.

### Story 19.1: Câblage ScenarioTimeline, SeanceList et CalendarView

As a joueur ou MJ,
I want que la chronologie des scénarios, la liste des séances et le calendrier de disponibilités reflètent les changements faits par un autre membre,
So that je n'aie jamais besoin de recharger la page pour voir une inscription, un vote, ou un nouveau scénario.

**Acceptance Criteria:**

**Given** `ScenarioTimeline` affiché sur une Partie
**When** un scénario est ajouté, modifié ou clôturé par un autre membre
**Then** il apparaît/se met à jour dans la timeline sans rechargement de page (en complément de la réactivité déjà existante au changement de `partieId`, Palier 6 FR-3)

**Given** `SeanceList` affiché
**When** une inscription, désinscription ou modification de séance est faite par un autre membre
**Then** elle est reflétée sans rechargement de page

**Given** `CalendarView` affiché
**When** un autre joueur vote ou le MJ ouvre un nouveau sondage
**Then** le changement est visible sans rechargement de page

### Story 19.2: Câblage ScenarioEditor et ScenarioReadDialog avec garde du brouillon

As a MJ ou joueur,
I want que le dialogue d'édition ou de lecture d'un scénario resté ouvert reflète une modification faite ailleurs, sans jamais perdre ce que je suis en train de taper,
So that je n'aie plus besoin de fermer puis rouvrir le dialogue pour voir un changement, et que je ne perde jamais ma saisie en cours.

**Acceptance Criteria:**

**Given** `ScenarioEditor` ou `ScenarioReadDialog` resté ouvert
**When** une modification est faite ailleurs sur ce scénario
**Then** le dialogue se met à jour sans que l'utilisateur ait à le fermer/rouvrir

**Given** un champ en cours de saisie (ex. `descriptionDraft`) dans `ScenarioEditor`
**When** un événement de changement est reçu pendant la frappe, et que le serveur n'a pas modifié précisément ce champ
**Then** la saisie en cours est conservée, jamais écrasée

**Given** le même champ en cours de saisie
**When** le serveur a modifié précisément ce champ (autre utilisateur ayant écrit dans la même zone)
**Then** la valeur serveur rechargée remplace le brouillon local (règle déjà actée au Palier 6 FR-5, réutilisée telle quelle — pas une nouvelle décision de comportement)

## Epic 20: Fiches de personnage en direct

En tant que joueur, je vois apparaître une distribution d'XP ou un passage de niveau (y compris un pouvoir d'éveil Homme Dragon) fait par le MJ sans recharger ma fiche.

### Story 20.1: Câblage CharacterSheet sur le signal temps réel

As a joueur,
I want que ma fiche de personnage reflète une distribution d'XP ou un passage de niveau fait par le MJ pendant que j'ai la fiche ouverte,
So that je n'aie pas besoin de recharger la page pour voir ma progression.

**Acceptance Criteria:**

**Given** `CharacterSheet` affiché
**When** le MJ distribue de l'XP ou valide un passage de niveau pendant que la fiche reste ouverte
**Then** la fiche se met à jour sans rechargement de page

**Given** `CharacterService` (frontend), aujourd'hui un pur wrapper HTTP sans signal `changed`
**When** ce câblage est implémenté
**Then** un signal `_changed` (privé) et une méthode publique `notifyChanged()` y sont introduits pour la première fois — nouvelle infrastructure réactive, cohérente avec le contrat déjà en place sur `ScenariosService`

### Story 20.2: Câblage HommeDragonSheet sur le signal temps réel

As a joueur,
I want que ma fiche Homme Dragon reflète un pouvoir d'éveil débloqué par une distribution d'XP faite par le MJ pendant que j'ai la fiche ouverte,
So that je n'aie pas besoin de recharger la page pour voir ma progression.

**Acceptance Criteria:**

**Given** `HommeDragonSheet` affiché, avec `pendingEveilLevels`/`eveilPowers` chargés une fois au montage
**When** le MJ distribue de l'XP débloquant un niveau pendant que la fiche reste ouverte
**Then** la fiche se met à jour sans rechargement de page

**Given** `HommeDragonService` (frontend), aujourd'hui un pur wrapper HTTP sans signal `changed`
**When** ce câblage est implémenté
**Then** un signal `_changed` (privé) et une méthode publique `notifyChanged()` y sont introduits pour la première fois, même forme que `CharacterService` (Story 20.1)

## Epic 21: Dashboard, brouillons et annonces en direct

En tant que joueur ou MJ, je vois apparaître une invitation reçue, un brouillon de scénario créé par un co-MJ, ou un scénario nouvellement éligible dans un formulaire d'annonce resté ouvert — sans recharger la page.

### Story 21.1: Canal utilisateur et câblage Dashboard (invitations reçues)

As a joueur,
I want voir apparaître ou disparaître une invitation reçue sur mon dashboard quand un MJ l'envoie ou la révoque, même si mon dashboard reste ouvert dans un autre onglet,
So that je n'aie pas besoin de recharger la page pour savoir si j'ai été invité.

**Acceptance Criteria:**

**Given** l'endpoint `GET /users/me/events` (distinct de `GET /parties/:id/events`, même `RealtimeEventsService` en interne)
**When** un utilisateur authentifié ouvre une connexion
**Then** il reçoit les événements de son propre topic utilisateur (`user:{id}`), contrôle d'identité simple (l'utilisateur authentifié = lui-même)

**Given** `Dashboard` affiché
**When** un MJ envoie ou révoque une invitation ciblant cet utilisateur, pendant que le dashboard reste ouvert dans un autre onglet
**Then** la liste des invitations reçues se met à jour sans rechargement de page

**Given** la liste des Parties du joueur sur `Dashboard`
**When** ce câblage est implémenté
**Then** cette partie du Dashboard n'est pas concernée — elle est déjà correctement réactive aujourd'hui, aucune modification

### Story 21.2: Câblage ScenarioDrafts et ScenarioOneShotTab

As a MJ,
I want voir les brouillons de scénario créés, publiés ou supprimés par un co-MJ, même si ma vue reste ouverte ailleurs,
So that je ne travaille jamais sur une liste de brouillons obsolète.

**Acceptance Criteria:**

**Given** `ScenarioDrafts` ou `ScenarioOneShotTab` affiché
**When** un co-MJ crée, publie ou supprime un brouillon de scénario
**Then** la vue se met à jour sans rechargement de page

### Story 21.3: Câblage AnnouncementForm (scénarios éligibles)

As a MJ,
I want que la liste des scénarios proposés dans le formulaire d'annonce reflète un changement de statut de scénario fait ailleurs,
So that je ne rédige jamais une annonce en référençant un scénario qui n'est plus dans le bon état.

**Acceptance Criteria:**

**Given** `AnnouncementForm` ouvert, avec sa liste de scénarios éligibles
**When** un scénario devient `COURANT` (ou change de statut) pendant que le formulaire reste ouvert
**Then** le sélecteur de scénarios se met à jour sans rechargement de page

**Given** `ScenarioDetail`
**When** ce câblage est implémenté ailleurs (Epic 19, `ScenarioEditor`)
**Then** aucune modification distincte n'est nécessaire sur `ScenarioDetail` — simple wrapper routé, corrigé par transitivité

## Epic 22: Cohérence des services partagés et pérennité de la convention

En tant que joueur, je vois un sondage ouvert par le MJ détecté par les services partagés de l'application (pas seulement sur les pages déjà câblées) ; et l'équipe dispose d'une règle documentée pour ne pas recréer ce problème de désynchro sur les futurs paliers.

### Story 22.1: Réactivité d'OpenPollsService et ModeService au signal temps réel

As a joueur ou MJ,
I want que les services partagés qui pilotent l'affichage des sondages ouverts et du mode de l'application se resynchronisent sur un changement touchant une Partie déjà affichée,
So that un sondage ouvert par le MJ soit détecté partout dans l'application, pas seulement en naviguant vers une nouvelle Partie.

**Acceptance Criteria:**

**Given** `OpenPollsService`, aujourd'hui réactif uniquement via un `effect()` sur `playerParties()`
**When** un sondage est ouvert par le MJ sur une Partie déjà affichée
**Then** il est détecté sans qu'un changement de la liste de Parties du joueur soit nécessaire pour le déclencher

**Given** `ModeService`, même mécanisme de réactivité limité
**When** un événement de changement scopé Partie est reçu
**Then** il se resynchronise de la même façon

**Given** ces deux services, qui n'ont pas de compteur `_changed` équivalent à `ScenariosService`
**When** `notifyChanged()` y est implémenté
**Then** il déclenche directement leur logique de rafraîchissement existante, sans qu'un signal `_changed` supplémentaire soit requis (contrat public uniforme, mécanisme interne libre)

### Story 22.2: Convention documentée de vérification SSE pour tout nouvel ajout

As a future contributeur (humain ou agent) du projet,
I want qu'une règle explicite rappelle d'évaluer le besoin de câblage SSE pour tout nouveau composant affichant des données scopées à une Partie,
So that le même problème de désynchro ne se recrée pas silencieusement aux paliers suivants.

**Acceptance Criteria:**

**Given** `CLAUDE.md` et/ou `docs/checklist.md`
**When** cette story est terminée
**Then** une règle est écrite noir sur blanc : tout nouveau composant/page affichant des données scopées à une Partie doit être évalué pour un besoin de câblage sur le signal de changement SSE

**Given** cette règle
**When** elle est ajoutée
**Then** ce n'est pas une garde automatisée (pas de lint/CI) — une vérification humaine/agent documentée suffit, cohérent avec le contexte hobby
