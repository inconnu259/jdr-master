---
baseline_commit: 34bec58
---

# Story 8.8: Vote de date pour l'épisodique et refonte de la vue Oracle multi-votes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want proposer plusieurs dates au vote pour une séance de campagne épisodique (comme pour le linéaire/one-shot), pouvoir réinitialiser une date déjà validée pour relancer un vote, et voir clairement sur la vue Oracle à quel scénario/séance se rapporte chaque vote en cours même quand plusieurs tournent en parallèle,
So that je ne suis plus obligé de valider une date à l'aveugle pour l'épisodique, je peux corriger une erreur de planification sans naviguer ailleurs, et je ne mélange plus mes votes entre plusieurs séances.

## Décisions d'architecture (tranchées le 2026-07-14, avant implémentation)

### Décision 1 — Vote multi-dates pour l'épisodique, `validerDate()` retirée

Pour l'épisodique, remplacer la validation directe d'une date (`ScenariosService.validerDate`, MJ seul, aucun vote) par un **vrai vote multi-dates** réutilisant `SessionPoll`/`PollModule` — le même mécanisme que le linéaire/one-shot. Ceci **révise l'invariant AD-4** actuel (`ARCHITECTURE-SPINE.md`) : *« `Seance` porte une relation optionnelle vers `SessionPoll` **ou** vers `Inscription[]` — jamais les deux… lequel s'applique est déterminé par `Partie.kind` »*.

- `CAMPAGNE_EPISODIQUE` : `Seance.pollId` **devient utilisable** (vote pour choisir la date) **ET** `Seance.inscriptionMin/Max`/`Inscription[]` restent utilisés (capacité limitée) — **les deux coexistent désormais sur la même séance épisodique**, contrairement à l'ancien texte d'AD-4. Le vote sert à choisir *quand*, l'inscription sert à choisir *qui*.
- `ScenariosService.createSeancePoll()` (Story 8.7) **retire son rejet `CAMPAGNE_EPISODIQUE`** (actuellement `scenarios.service.ts:490-494`) et l'applique aussi à ce kind.
- `ScenariosService.validerDate()` **est retirée entièrement** (méthode, route, DTO, tests, call sites frontend) — le vote devient l'unique chemin pour poser une date, cohérent avec le « point d'entrée unique » de la Story 8.7. **Nuance validée par l'utilisateur** : un futur raccourci « une seule date possible, validée sans vote » pourra être réintroduit plus tard comme fonctionnalité à part entière (pas dans cette story — noté dans `deferred-work.md` pour référence future, ne pas anticiper son design ici).

### Décision 2 — Un seul vote actif **par séance** (pas par Partie), `nextSessionDate`/`nextSessionSlot` recalculés dynamiquement

`PollService.create()` (actuel, `poll.service.ts:43-53`) ferme **automatiquement tout `SessionPoll` `OPEN` existant de la Partie** avant d'en créer un nouveau (« un seul `SessionPoll` OPEN par Partie », invariant référencé dans `ARCHITECTURE-SPINE.md` AD-5 comme *« même stratégie que P2-AD-4 »*). **Ce comportement contredit le modèle métier réel** : une Partie peut avoir plusieurs Scénarios, chacun découpé en plusieurs Séances (une Séance = un moment de jeu physique/unitaire, un Scénario peut s'étaler sur plusieurs Séances espacées dans le temps) — **la règle correcte est un seul vote actif par Séance, pas par Partie**. Plusieurs Séances de la même Partie peuvent donc légitimement avoir chacune leur vote ouvert en parallèle.

**Décision (option « corrigée en profondeur » retenue)** :

- `PollService.create()` : retirer la fermeture auto de l'existant — un `SessionPoll` `OPEN` par `Seance` (déjà garanti par la garde `seance.pollId` existante de `createSeancePoll()`, Story 8.7 : « déjà liée à un vote de date » → 400), plusieurs `OPEN` simultanés par Partie deviennent normaux.
- `Partie.nextSessionDate`/`nextSessionSlot` (pilotent le bandeau « Prochaine séance » sur `PartieDetail` et les e-mails de rappel 24h, `NotificationsService`) sont **recalculés dynamiquement** comme la date la plus proche dans le futur parmi toutes les Séances actives de la Partie (`poll.chosenDate ?? inscription.dateValidee`, la même logique de résolution déjà utilisée par `ScenarioTimeline`/`SeanceList` depuis la Story 8.7) — recalcul déclenché à chaque événement qui peut faire changer cette date la plus proche (`choose()`, réinitialisation de date, suppression de séance).
- Ceci touche `NotificationsService`/`PartiesService` (Palier 4 e-mail) — **dans le périmètre de cette story**, contrairement à ce qui avait été envisagé initialement (patch minimal écarté par l'utilisateur).

## Acceptance Criteria

1. **Given** une Partie `CAMPAGNE_EPISODIQUE` et une `Seance` avec capacité définie (`inscriptionMax` non nul) **When** le MJ veut proposer une date aux joueurs **Then** il lance un vote multi-dates (`ScenariosService.createSeancePoll`, Story 8.7, désormais ouvert à ce kind) parmi les créneaux calculés — la validation directe MJ-seule d'une date unique disparaît du flux principal.
2. **Given** un vote en cours pour une séance épisodique **When** les joueurs votent et le MJ clôture/choisit une date (`chooseDate`, mécanisme `SessionPoll` inchangé) **Then** `Seance.poll.chosenDate` reflète la date choisie, affichée par `SeanceList` (déjà prêt depuis 8.7 — `seance.poll?.chosenDate`) — l'inscription (`Inscription[]`) reste indépendante et continue de gérer qui participe.
3. **Given** un vote multi-dates en cours pour une séance (tout type de Partie) **When** le MJ veut ajouter une date candidate supplémentaire **Then** cela ajoute une option au vote existant — **jamais** de nouvelle `Seance` créée pour ce geste (bug actuel : `onProposerAutreDate()` appelle `addSeance()`, Story 8.2, `[ASSUMPTION]` Story 8.3 obsolète après cette story).
4. **Given** une `Seance` avec une date déjà validée/choisie (`inscription.dateValidee` ou `poll.chosenDate`), quel que soit le type de partie **When** le MJ veut changer de plan **Then** un bouton permet de réinitialiser cette date (retire `dateValidee`, et/ou permet de relancer un nouveau vote sur la séance si l'ancien poll est clôturé) — confirmation avant réinitialisation (cohérent avec Story 8.7, AC5/patch revue : confirmation renforcée sur action destructive touchant une date déjà validée).
5. **Given** `SeanceList`, quel que soit le type de partie **When** le MJ veut planifier une date pour une séance sans vote en cours (`!seance.poll`) **Then** le bouton existant (« Lancer le vote », Story 8.7 AC2/AC3, `goToCalendarForSeance`) devient disponible aussi pour l'épisodique — même flux, un seul point d'entrée pour tous les types de partie.
6. **Given** la vue Oracle/calendrier (`CalendarView`) ouverte depuis une autre page (fiche de partie, scénario) **When** le MJ a terminé de gérer les votes **Then** un bouton retour/fermer contextuel le ramène vers cette page d'origine (route mémorisée à l'ouverture, ex. `document.referrer` interne ou paramètre de retour explicite).
7. **Given** plusieurs votes de date actifs simultanément dans une même Partie (plusieurs scénarios et/ou séances en cours de planification) **When** le MJ consulte la vue Oracle/calendrier **Then** chaque vote actif s'affiche séparément, étiqueté par son scénario (et sa séance si le scénario en a plusieurs) — remplace le signal `activePoll` unique actuel (`CalendarView.activePoll`) qui ne charge qu'« un » poll (`PollService.getCurrentPoll`) et se referme entièrement dès qu'une sélection est faite sur l'un d'eux.
8. **Given** un joueur (vue non-MJ, `guild-calendar`/`profile/calendar`) **When** plusieurs votes sont actifs sur la Partie **Then** il voit et peut répondre à chacun séparément (même refonte multi-votes appliquée côté lecture/vote joueur, pas seulement côté MJ).
9. **Given** la vue Oracle/calendrier (MJ) **When** aucun vote n'est encore lancé pour une séance éligible (scénario non `PASSE`, aucun `poll` déjà lié, aucune date déjà validée) **Then** une liste déroulante permet de sélectionner cette séance — étiquetée par son scénario **et** son numéro de séance, sans ambiguïté — pour lancer un vote directement depuis l'Oracle, sans repasser par `SeanceList`. *(Ajoutée le 2026-07-14, retour utilisateur post-implémentation initiale de cette story.)*

## Tasks / Subtasks

- [x] **Task 1 — Retirer `validerDate()`** (AC1 — Décision 1)
  - [x] Supprimer `ScenariosService.validerDate()`, sa route (`PATCH scenarios/seances/:id/valider-date`), son DTO (`ValiderDateDto`, `apps/api/src/scenarios/dto/valider-date.dto.ts`), tous les tests associés (backend), et tous les call sites frontend (`ScenariosService.validerDate` (web), `SeanceList.onValiderDate`, les créneaux cliquables `availableSlots()` de la branche épisodique). En pratique, la suppression du call site a nécessité d'unifier tout de suite la branche MJ épisodique de `SeanceList` avec la branche linéaire (CTA « Lancer le vote », mêmes composants `PollStatusPanel`/`PollResponseComponent` réutilisés) et de retirer le bouton « Proposer une autre date » (bug `addSeance`, confirmé par l'utilisateur : redondant avec les créneaux personnalisés déjà supportés par `PollCreationComponent`) — anticipe une partie du périmètre de la Task 5, qui se concentrera sur le bouton « Réinitialiser la date ».
  - [x] `packages/shared/src/index.ts` : retirer `ValiderDateDto`.

- [x] **Task 2 — Backend : ouvrir `createSeancePoll` à l'épisodique, gérer la coexistence poll+inscription** (AC1, AC2)
  - [x] `scenarios.service.ts` : retirer le rejet `CAMPAGNE_EPISODIQUE` de `createSeancePoll()` (lignes ~490-494).
  - [x] Vérifier `toSeanceDto()`/`SEANCE_INCLUDE` : `poll` et `inscription` sont déjà indépendamment peuplés sur le même `SeanceDto` (aucune modification structurelle nécessaire — vérifié par test explicite, les deux coexistent bien).
  - [x] **Gap critique découvert en analyse** : `inscrire()`/`desinscrire()` (`scenarios.service.ts`) figent le roster en vérifiant `seance.dateValidee` (champ `Seance` brut) — champ que `validerDate()` était seule à écrire. Une fois `validerDate()` retirée (Task 1), plus rien n'écrit ce champ pour l'épisodique : le roster ne se figerait **jamais**, régression silencieuse de l'AC6/AC4 de la Story 8.3. **Corrigé** : le check de gel lit désormais `seance.poll?.chosenDate ?? seance.dateValidee` (le second terme reste pour compatibilité avec d'éventuelles données existantes) — `poll` chargé via `include: { poll: true }` dans `inscrire()`/`desinscrire()`.
  - [x] `scenarios.service.spec.ts` : nouveau test `createSeancePoll()` sur `CAMPAGNE_EPISODIQUE` → succès (au lieu du rejet actuel), assertion sur la coexistence `poll`+`inscription` dans le DTO retourné ; nouveaux tests `inscrire()`/`desinscrire()` rejetés une fois `poll.chosenDate` posé (pas seulement `dateValidee`).

- [x] **Task 3 — Backend : un seul vote actif par Séance (pas par Partie) + recalcul dynamique de `nextSessionDate`/`nextSessionSlot`** (AC7, AC8 — Décision 2)
  - [x] `poll.service.ts` : retirer le bloc `if (existing) { updateMany CLOSED }` dans `create()` (lignes ~44-53) — la garde « déjà liée à un vote » de `createSeancePoll()` (Story 8.7) suffit à garantir un seul poll actif par Séance.
  - [x] `poll.service.spec.ts` : retirer/adapter le test `create() avec poll OPEN existant → ferme l'existant puis crée` (ligne 89) — nouveau comportement : plusieurs polls restent `OPEN` simultanément sur la même Partie (un par Séance).
  - [x] Nouveau helper `ScenariosService.recalculateNextSession(partieId)` (pas `PartiesService` — AD-1 réserve la lecture de `Seance` à `ScenariosService`) : calcule la date la plus proche dans le futur parmi toutes les Séances actives d'une Partie (`poll.chosenDate ?? dateValidee`), écrit `Partie.nextSessionDate`/`nextSessionSlot` directement (réutilise le pattern déjà établi par `PollService.choose()` pour `reminderSentAt`).
  - [x] **Décision d'implémentation** (non prévue explicitement par la story, requise pour éviter que `PollService` connaisse `Scenario`/`Seance`, P2-AD-2) : `PollService.choose()` reste inchangé ; c'est `PollController.choose()` qui orchestre l'appel à `ScenariosService.recalculateNextSession()` après `PollService.choose()`, via `forwardRef()` (cycle `ScenariosModule` ↔ `PollModule`, déjà existant dans un sens depuis la Story 8.7 pour `createSeancePoll()`). Vérifié : `Nest application successfully started` au redémarrage réel du conteneur, la résolution DI circulaire fonctionne.
  - [x] Recalcul déclenché aussi par `resetSeanceDate` (Task 4) et `deleteSeance` (appel ajouté).
  - [x] Tests `poll.service.spec.ts`/`poll.controller.spec.ts`/`scenarios.service.spec.ts` : 2 Séances avec vote actif → choisir la date de l'une ne ferme pas l'autre ; `nextSessionDate` reflète toujours la plus proche des deux après chaque changement ; `reminderSentAt` non réinitialisé si date/créneau inchangés.

- [x] **Task 4 — Backend + Frontend : réinitialiser une date validée** (AC4)
  - [x] Nouvelle méthode `ScenariosService.resetSeanceDate(seanceId, mjId)` : détache le poll de la séance (`Seance.pollId = null` — ne supprime PAS le `SessionPoll` lui-même, cycle de vie indépendant, P2-AD-2, même pattern que `deleteSeance` Story 8.7) et retire `Seance.dateValidee` (compatibilité), permettant de rappeler `createSeancePoll()` ensuite. Garde MJ-only (`getOwned`), garde `scenario.status !== 'PASSE'`. Déclenche le recalcul de `nextSessionDate`/`nextSessionSlot` (Task 3).
  - [x] Route `PATCH scenarios/seances/:id/reset-date`, sans body/DTO.
  - [x] Tests `scenarios.service.spec.ts`/`scenarios.controller.spec.ts`.
  - [x] Frontend (anticipé, nécessaire pour boucler la fonctionnalité) : `ScenariosService.resetSeanceDate()` (web), bouton « Réinitialiser la date » dans `SeanceList` pour les deux branches (linéaire et épisodique, tout `PartieKind`), confirmation avant réinitialisation, tests `scenarios.service.spec.ts`/`seance-list.spec.ts`.

- [x] **Task 5 — Frontend : `SeanceList` — un seul CTA « Lancer le vote » pour tous les types de partie** (AC1, AC3, AC5)
  - [x] Retirer la branche épisodique spécifique (créneaux cliquables → `onValiderDate`, bouton « Proposer une autre date » → `onProposerAutreDate`/`addSeance`) — remplacé par le même bloc que linéaire/one-shot (`!seance.poll` → bouton « Lancer le vote » → `goToCalendarForSeance`), réutilisé pour tous les `PartieKind`. **Réalisé dès la Task 1** (retrait obligatoire du call site `validerDate` a nécessité l'unification immédiate, cf. note Task 1) ; bouton « Proposer une autre date » retiré définitivement (décision utilisateur : redondant avec les créneaux personnalisés déjà supportés par `PollCreationComponent`, pas de remplacement par une capacité « ajouter une option à un vote ouvert »).
  - [x] Ajouter bouton « Réinitialiser la date » quand `seance.inscription?.dateValidee` ou `seance.poll?.chosenDate` est posé (AC4), avec confirmation. **Réalisé Task 4.**
  - [x] `seance-list.spec.ts` : réécrire les tests épisodiques du flux de date (créneaux cliquables/proposer une autre date deviennent obsolètes), ajouter tests du CTA unifié + réinitialisation.

- [x] **Task 6 — Frontend : `CalendarView` — vue Oracle multi-votes (MJ)** (AC6, AC7)
  - [x] Remplacé `activePoll` (signal unique, `PollService.getCurrentPoll`) par `activePolls` — liste dérivée de `ScenariosService.listAll(partieId)` (déjà utilisé ailleurs, ex. `ScenarioTimeline`) : toutes les `seances[]` dont `poll.status === 'OPEN'`, étiquetées par scénario (+ numéro de séance si le scénario en a plusieurs).
  - [x] `@for` sur cette liste, un `<app-poll-status>`/`<app-poll-response>` par entrée (composants déjà génériques par poll, aucune modification requise) — chaque `(chosen)`/`onClosePoll` cible précisément le `pollId` de son entrée, sans fermer les autres.
  - [x] Bouton retour/fermer contextuel (AC6) : implémenté via `Location.back()` (Angular `@angular/common`) plutôt qu'un query param `from=` explicite — décision d'implémentation : aucune page tierce ne peut ouvrir l'Oracle autrement que par lien direct depuis `PartieDetail` ou `SeanceList.goToCalendarForSeance`, l'historique de navigation suffit et évite de dupliquer un mécanisme de routage déjà fourni par le navigateur.
  - [x] `calendar-view.spec.ts` : tests multi-poll (2 votes actifs simultanés, choisir l'un ne ferme pas l'autre, poll CLOSED exclu de la liste), test du bouton retour.

- [x] **Task 7 — Frontend : `CalendarView` — vue Oracle multi-votes (joueur)** (AC8)
  - [x] Même refonte côté `!isMjMode()` (`guild-slots-panel`) : liste de polls actifs au lieu d'un seul, un `<app-poll-response>` par entrée, étiqueté comme côté MJ. **Réalisé en même temps que la Task 6** (même signal `activePolls`/`loadActivePolls()` partagé entre les deux vues, aucune duplication de logique).
  - [x] `calendar-view.spec.ts` : tests équivalents côté joueur (`onPollResponded` met à jour l'entrée concernée sans refetch).

- [x] **Task 9 — Frontend : `CalendarView` — sélecteur de séance pour lancer un vote directement depuis l'Oracle** (AC9)
  - [x] Refactor `CalendarView` : `loadActivePolls()` remplacé par `loadScenarios(partieId)` qui peuple un signal `scenarios = signal<ScenarioDto[]>([])` ; `activePolls` devenu un `computed()` dérivé de ce signal — une seule source de vérité, `eligibleSeances` calculé de la même façon. `onPollResponded()` patche désormais `scenarios` (pas `activePolls`, devenu read-only).
  - [x] Nouveau `computed()` `eligibleSeances` : pour chaque `scenario` avec `status !== 'PASSE'`, chaque `seance` sans `poll` (aucun poll lié, `OPEN` ou `CLOSED`) et sans `inscription?.dateValidee` (héritage) → `{ scenario, seance, seanceIndex }`.
  - [x] UI (MJ uniquement, `mj-results-panel`) : liste déroulante (`<select class="new-vote-form__select">`) listant `eligibleSeances()`, option étiquetée `{{ scenario.title }} — Séance {{ seanceIndex }}` (toujours les deux informations, sans condition sur le nombre de séances — zéro ambiguïté, demande explicite de l'utilisateur) + bouton « Lancer le vote » (`startVoteFor(seanceId)`) qui réutilise le flux existant (`lockedSeanceId`/`pollPanelOpen`, `PollCreationComponent`) — aucun nouveau composant, aucune nouvelle route backend. N'apparaît que si `eligibleSeances().length > 0`.
  - [x] `calendar-view.spec.ts` : tests `eligibleSeances` (exclut `PASSE`, exclut séance avec poll déjà lié quel que soit son statut, exclut date déjà validée héritée), test de sélection → ouverture du panneau verrouillé sur la bonne séance, test du câblage template → `startVoteFor()`.

- [x] **Task 8 — Suite de tests complète + typecheck**
  - [x] `docker compose exec api pnpm exec jest` (régression complète API) — 625/625.
  - [x] `docker compose exec web pnpm test` (régression complète web) — 693/693 (après Task 9).
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] Redémarrage réel du conteneur `api` vérifié (`Nest application successfully started`) — confirme que le cycle `ScenariosModule` ↔ `PollModule` via `forwardRef()` (Task 3) se résout correctement à l'exécution, pas seulement dans les tests unitaires mockés.

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-14 sur `git diff HEAD` (21 fichiers, baseline `34bec58`).

- [x] [Review][Decision] Poll orphelin et injoignable après `resetSeanceDate()`/`deleteSeance()`/clôture sans date : `resetSeanceDate()` détache `Seance.pollId` sans vérifier si le poll est encore `OPEN` (le vote continue d'exister, mais disparaît de tout l'UI — `activePolls`/`SeanceList` ne dérivent plus que de `seance.poll`) ; `deleteSeance()` supprime la Séance en laissant le poll lié orphelin, plus jamais atteignable ; et un poll `CLOSED` sans `chosenDate` (aucun consensus) n'a **aucun** bouton « Réinitialiser la date » (visible seulement si `chosenDate`/`dateValidee` est posé) — la séance reste bloquée indéfiniment. Confirmé indépendamment par 2 reviewers. **Décision utilisateur (2026-07-14) : le `SessionPoll` lié est désormais supprimé** (pas seulement détaché) par `resetSeanceDate()` et `deleteSeance()` — sans séance, un vote de date n'a plus de sens. Le bouton « Réinitialiser la date » est aussi désormais visible pour un poll `CLOSED` sans `chosenDate`. [apps/api/src/scenarios/scenarios.service.ts, apps/web/src/app/features/scenarios/seance-list/seance-list.html]
- [x] [Review][Decision] `PollController.create()` (route générique `POST /parties/:id/poll`) n'est plus protégée par la fermeture auto de l'existant (retirée en Décision 2) — appelée directement (hors `ScenariosService.createSeancePoll()`), elle peut désormais créer un nombre illimité de `SessionPoll` orphelins jamais liés à une Séance, invisibles et jamais nettoyés. Confirmé indépendamment par 2 reviewers. Aucun appelant frontend actuel (le flux `PollCreationComponent` sans séance a été retiré en 8.7/8.8), mais la route reste ouverte au niveau API. **Décision utilisateur (2026-07-14) : la route générique `POST /parties/:id/poll` est retirée** — un vote de date exige désormais toujours un lien vers une Séance, via `ScenariosService.createSeancePoll()` uniquement. `PollService.create()` (méthode interne, pas la route HTTP) reste inchangée. [apps/api/src/poll/poll.controller.ts, apps/web/src/app/core/poll/poll.service.ts]
- [x] [Review][Decision] `PollService.getCurrentPoll()`/`findOpen()` (hypothèse « un seul poll par Partie », jamais migrée) restent utilisées par 3 call sites non touchés par cette story : `partie-detail.ts` (bandeau « prochaine séance »), `open-polls.service.ts` (badge de notification « votes à répondre »), et surtout `poll-response.ts` (`onConfirm()`, L118) — **confirmé par lecture directe** : après avoir voté sur un poll précis dans la nouvelle boucle multi-poll de `CalendarView`, le composant refait un `getCurrentPoll()` (poll arbitraire, `findFirst`) au lieu de rafraîchir *ce* poll précis, puis émet `(responded)` avec ce mauvais poll — l'entrée réellement votée n'est jamais rafraîchie dans l'UI (retour du bug « rien ne se passe après avoir voté », déjà corrigé une fois pour le cas single-poll, réintroduit pour le cas multi-poll). **Décision utilisateur (2026-07-14) : corrigé** — `partie-detail.ts` et `open-polls.service.ts` agrègent désormais tous les polls `OPEN` d'une Partie via `ScenariosService.listAll()` (plus plusieurs votes de date peuvent coexister sur une même Partie, un par Séance) ; `poll-response.ts` (déjà patché plus haut) n'en dépendait déjà plus. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts, apps/web/src/app/core/poll/open-polls.service.ts]
- [x] [Review][Patch] `createSeancePoll()` n'a aucune garde sur `scenario.status === 'PASSE'` — devenu atteignable pour l'épisodique depuis le retrait du rejet `CAMPAGNE_EPISODIQUE` (Décision 1), un vote peut être ouvert sur un scénario clôturé alors que `deleteSeance()`/`resetSeanceDate()` bloquent déjà ce cas. [apps/api/src/scenarios/scenarios.service.ts]
- [x] [Review][Patch] `PollResponseComponent.onConfirm()` — voir la Décision ci-dessus (poll-response.ts, L118) : remplacer le refetch `getCurrentPoll()` par une mise à jour locale optimiste du poll précis (`this.poll()` + votes qu'on vient de caster), émise via `(responded)`, sans dépendre d'un endpoint single-poll. [apps/web/src/app/features/poll/poll-response/poll-response.ts]
- [x] [Review][Patch] `inscrire()` — TOCTOU entre le check `seance.poll?.chosenDate` hors transaction et l'écriture sous verrou `FOR UPDATE` : un joueur peut s'inscrire juste après que le MJ ait clôturé/choisi la date, entre les deux étapes. Re-vérifier `chosenDate` sous le verrou, dans la transaction. [apps/api/src/scenarios/scenarios.service.ts]
- [x] [Review][Patch] `PollController.choose()` — si `recalculateNextSession()` échoue après que `choose()` a déjà committé, le client reçoit une 500 alors que le vote est bien enregistré côté serveur ; un retry échouera ensuite pour une raison différente (poll déjà clôturé). Capturer l'erreur de `recalculateNextSession()` séparément (log, ne pas faire échouer la requête). [apps/api/src/poll/poll.controller.ts]
- [x] [Review][Defer] `recalculateNextSession()` sans transaction/verrou — deux appels concurrents (ex. `choose()` sur deux polls différents de la même Partie) peuvent se chevaucher en écriture, dernier gagnant. Même classe de risque que la non-atomicité déjà acceptée de `createSeancePoll()` (Story 8.7, décision utilisateur) — cohérent avec le style de ce module. [apps/api/src/scenarios/scenarios.service.ts] — deferred, même risque déjà accepté ailleurs dans ce module
- [x] [Review][Defer] Dépendance circulaire de modules (`forwardRef()` dans les deux sens, `ScenariosModule` ↔ `PollModule`) — odeur architecturale, mais fonctionnellement vérifiée (redémarrage réel du conteneur réussi, Task 8). Pas de régression concrète, juste un couplage à surveiller. — deferred, vérifié fonctionnel, pas de bug concret
- [x] [Review][Defer] `CalendarView.goBack()` — `Location.back()` ne fait rien si l'Oracle est ouvert depuis un nouvel onglet/lien direct sans historique de navigation préalable. Cas limite rare (l'Oracle n'est normalement atteint que via un lien interne). [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — deferred, cas limite rare, pas de blocage réel (l'utilisateur peut naviguer via le menu)
- [x] [Review][Defer] AC3 (« ajouter une option à un vote déjà ouvert ») n'a qu'une implémentation négative (bug de création de Séance retiré) — décision utilisateur déjà actée durant l'implémentation (Task 1) : redondant avec les créneaux personnalisés de `PollCreationComponent` à la création du vote. — deferred, décision utilisateur déjà actée durant l'implémentation

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1 (rappel)** : `ScenariosModule` reste propriétaire exclusif de `Scenario`/`Seance` — cette story ne change aucun accès direct depuis `PollModule`, seulement l'orchestration déjà en place côté `ScenariosService` (Story 8.7).
- **AD-4 (RÉVISÉ par Décision 1)** : jusqu'ici *« jamais les deux [SessionPoll et Inscription] peuplés simultanément »* — cette story lève cette exclusivité pour `CAMPAGNE_EPISODIQUE` uniquement. `ONE_SHOT`/`CAMPAGNE_LINEAIRE` ne changent pas (jamais d'`Inscription`, aucun changement de comportement).
- **P2-AD-2 (rappel, inchangé)** : `PollModule`/`SessionPoll`/`CreatePollDto` restent génériques, sans connaissance de `Scenario`/`Seance` — cette story ne les modifie pas structurellement (seul le comportement de fermeture auto change, Task 3, indépendant de toute connaissance de Seance).
- **Invariant « un seul `SessionPoll` OPEN par Partie » (RÉVISÉ par Décision 2)** : jusqu'ici implicite dans `PollService.create()` — cette story le retire. Vérifier qu'aucun autre endroit du code ne s'appuie dessus avant de le retirer (recherche `findFirst.*status.*OPEN` dans `poll.service.ts` — un seul point trouvé lors de l'analyse de cette story, `findOpen()`, qui devient un helper legacy non utilisé par le nouveau flux Oracle multi-poll mais pas nécessairement à supprimer si un appelant existant en dépend encore — vérifier avant suppression).
- **AD-9 (rappel)** : écriture MJ-only (`getOwned`) pour toute nouvelle méthode (`resetSeanceDate`).

### Code existant à répliquer / modifier (à lire intégralement avant d'écrire le code — état au 2026-07-14, post-Story 8.7 + sa revue)

**`apps/api/src/scenarios/scenarios.service.ts`** :
- `createSeancePoll()` (~L476-515) : le rejet `CAMPAGNE_EPISODIQUE` (~L490-494) est le seul obstacle empêchant AC1 — vérifier aussi que `toEnrichedDto`/`toSeanceDto` gèrent bien le cas `poll` + `inscription` tous deux non-null (a priori oui, ce sont deux blocs indépendants dans `toSeanceDto`, L846-868).
- `validerDate()` (~L648-685) : **à retirer entièrement** (Task 1) — avant suppression, noter la garde `inscriptionMax == null` (bug trouvé en revue 8.7) qui n'a pas d'équivalent dans `createSeancePoll()` : vérifier si une garde similaire est nécessaire côté vote (probablement pas, `createSeancePoll` ne dépend pas de la capacité).
- `inscrire()`/`desinscrire()` (~L560-639) : check de gel `if (seance.dateValidee)` — **à étendre** en `if (seance.poll?.chosenDate ?? seance.dateValidee)` (Task 2, gap critique). `SEANCE_INCLUDE` a déjà `poll: { include: { options: ... } } }` — `findUnique` dans `inscrire`/`desinscrire` n'inclut actuellement PAS `poll` (à ajouter `include: { poll: true }` ou requête séparée).
- `deleteSeance()` (~L432-465) : pattern de garde à répliquer pour `resetSeanceDate` (introuvable/403/scénario `PASSE`) ; vérifier si la suppression d'une séance dont la date était la plus proche doit aussi déclencher le recalcul de `nextSessionDate` (Task 3).

**`apps/api/src/poll/poll.service.ts`** (lu intégralement) :
- `create()` (~L26-70) : le bloc `if (existing) {...}` (~L44-53) est la fermeture auto à retirer (Task 3). Le reste de la méthode (dédoublonnage d'options, transaction Prisma) reste inchangé.
- `findOpen()` (~L72-82) : `findFirst` — un seul poll par Partie, incompatible avec plusieurs `OPEN` simultanés. Probablement plus appelé par le nouveau flux frontend (Task 6 utilise `ScenariosService.listAll` à la place), mais **ne pas le supprimer sans vérifier tous les appelants** (recherche `getCurrentPoll` côté frontend — actuellement `CalendarView` seul, remplacé par cette story).
- `choose()` (~L115-155) : écrit directement `option.date`/`option.slot` dans `Partie.nextSessionDate`/`nextSessionSlot` sans notion d'autres séances — **à remplacer par le recalcul dynamique** (Task 3, nouveau helper), pas par une écriture directe du poll qu'on vient de choisir.

**`apps/web/src/app/features/scenarios/seance-list/seance-list.ts`+`.html`** (lu intégralement, état post-8.7+revue) : branche `isEpisodique()` (html ~L22-134) contient toute la logique à remplacer par Task 5 — créneaux cliquables (~L65-80), `onProposerAutreDate`/`addSeance` (~L217-232 du `.ts`), à comparer avec la branche linéaire (~L135-188 du `.html`, déjà le comportement cible).

**`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`+`.html`** (lu intégralement, état post-8.7+revue) : `activePoll`/`pollPanelOpen`/`lockedSeanceId` sont le point d'entrée actuel à refondre (Task 6/7). `mj-results-panel` (html ~L46-88) et `guild-slots-panel` (html ~L90-126) sont les deux blocs à transformer en listes. `PollStatusPanel`/`PollResponseComponent` (déjà `input.required<SessionPollDto>()`, génériques par poll, **aucune modification de ces deux composants nécessaire** — seule la boucle appelante change).

**`apps/api/prisma/schema.prisma`** : `Seance.pollId String? @unique` + `Inscription[]` déjà tous deux présents sur le modèle `Seance` (aucune migration Prisma nécessaire pour Décision 1 — la contrainte « jamais les deux » était purement applicative, dans `ScenariosService`, pas en base). `Partie.nextSessionDate`/`nextSessionSlot` existent déjà (aucune migration pour Décision 2 non plus — recalcul applicatif, pas un nouveau champ).

### Hors scope explicite de cette story (ne pas implémenter)

- Toute modification de `PollController`/`ChooseDateDto`/`CastVoteDto` — le contrat de vote lui-même (options, votes, choix) ne change pas, seul le nombre de polls simultanés change.
- Refonte visuelle de `ScenarioTimeline` (hors scope, déjà noté Story 8.7, tracké `docs/backlog.md` Palier 6).
- Historique/audit des dates réinitialisées (AC4) — réinitialisation simple, pas de trace conservée.
- Raccourci « une seule date possible, validée sans vote » pour l'épisodique — évoqué par l'utilisateur comme idée future, explicitement pas dans cette story (noté dans `deferred-work.md`).

### Project Structure Notes

- Aucune migration Prisma requise (cf. ci-dessus).
- Fichiers backend probablement modifiés : `scenarios.service.ts`, `scenarios.service.spec.ts`, `scenarios.controller.ts`, `scenarios.controller.spec.ts`, `poll.service.ts`, `poll.service.spec.ts` ; supprimé : `dto/valider-date.dto.ts`.
- Fichiers frontend probablement modifiés : `seance-list.ts`/`.html`/`.spec.ts`, `calendar-view.ts`/`.html`/`.spec.ts`, `core/scenarios/scenarios.service.ts` (nouvelle méthode `resetSeanceDate`, retrait de `validerDate`).
- Aucun nouveau composant Angular — `PollStatusPanel`/`PollResponseComponent` sont réutilisés tels quels.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.8] — texte d'origine (ébauche), créé à partir du retour utilisateur post-revue Story 8.7.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from: code review of 8-7-point-entree-unique-vote-date] — historique complet du retour utilisateur motivant cette story.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-1, #AD-4, #AD-5, #P2-AD-2] — invariants révisés/impactés par cette story ; AD-5 mentionne « P2-AD-4 (un seul SessionPoll OPEN par Partie) » sans section dédiée — invariant retrouvé en lisant `poll.service.ts` directement (Décision 2).
- [Source: apps/api/src/scenarios/scenarios.service.ts] — lu intégralement (état post-8.7+revue de code), `createSeancePoll`/`validerDate`/`deleteSeance`/`inscrire`/`desinscrire` analysés en détail. Le gap de gel du roster (Task 2) a été trouvé en tracant manuellement l'effet du retrait de `validerDate()` sur `inscrire()`/`desinscrire()` — non visible dans le texte `epics.md` d'origine.
- [Source: apps/api/src/poll/poll.service.ts, .controller.ts] — lus intégralement, fermeture auto de l'OPEN existant identifiée comme bloquant central (Décision 2), écriture directe de `nextSessionDate` dans `choose()` identifiée comme à remplacer par un recalcul dynamique.
- [Source: apps/api/src/poll/poll.service.spec.ts#L89] — test explicite du comportement à faire évoluer.
- [Source: apps/api/prisma/schema.prisma#SessionPoll, #Seance, #Partie] — confirmé : aucune contrainte DB sur l'unicité « un seul OPEN par Partie », purement applicative ; `nextSessionDate`/`nextSessionSlot` déjà des champs existants sur `Partie`.
- [Source: apps/web/src/app/features/scenarios/seance-list/seance-list.ts, .html] — état post-8.7+revue, branche épisodique à unifier avec la branche linéaire.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts, .html] — état post-8.7+revue, `activePoll` unique à transformer en liste.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts#L206-217, apps/api/src/notifications/notifications.service.ts#L51,77-78] — consommateurs de `Partie.nextSessionDate`/`nextSessionSlot` à valider après le recalcul dynamique (Task 3) : le bandeau « Prochaine séance » et l'e-mail de rappel 24h doivent continuer de fonctionner sans changement de leur propre code, seule la source de la donnée change.
- [Source: apps/web/src/app/features/poll/poll-status/poll-status.ts, apps/web/src/app/features/poll/poll-response/poll-response.ts] — confirmés déjà génériques par poll (`input.required<SessionPollDto>()`), réutilisables sans modification dans une boucle `@for`.
- [Source: apps/web/src/app/core/poll/poll.service.ts] — `chooseDate`/`closePoll`/`castVote` prennent déjà un `pollId` explicite (pas de dépendance à "le" poll courant) — seuls `createPoll`/`getCurrentPoll` supposent l'unicité, `getCurrentPoll` remplacé par Task 6/7.
- [Source: 8-7-point-entree-unique-vote-date.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, pattern de revue adversariale 3 couches, `pnpm typecheck` après tout changement de signature, décision d'architecture centrale à trancher AVANT d'écrire du code (même pattern reproduit ici avec 2 décisions).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

Aucun blocage. Décision d'implémentation non prévue explicitement par la story (Task 3) : orchestration de `ScenariosService.recalculateNextSession()` depuis `PollController.choose()` (pas `PollService`, pour préserver P2-AD-2) via `forwardRef()` — cycle `ScenariosModule` ↔ `PollModule`, déjà existant dans un sens depuis la Story 8.7. Vérifié par redémarrage réel du conteneur `api` (`Nest application successfully started`), pas seulement par les tests unitaires mockés (qui ne peuvent pas détecter une erreur de résolution DI circulaire).

### Completion Notes List

- Story créée par lecture intégrale de `scenarios.service.ts`, `poll.service.ts`/`.controller.ts`, `seance-list.ts`/`.html`, `calendar-view.ts`/`.html`, `poll-status.ts`, `poll-response.ts`, `poll.service.ts` (web), `schema.prisma` (SessionPoll/Seance/Partie), `ARCHITECTURE-SPINE.md` (AD-1, AD-4, AD-5, P2-AD-2), `deferred-work.md`.
- 2 décisions d'architecture tranchées avec l'utilisateur avant `dev-story` (cf. section dédiée en tête de fichier) : (1) `validerDate()` retirée entièrement, le vote devient l'unique chemin pour poser une date en épisodique ; (2) un seul vote actif **par Séance** (pas par Partie) — retrait de la fermeture auto de `PollService.create()`, `Partie.nextSessionDate`/`nextSessionSlot` recalculés dynamiquement comme la date la plus proche parmi toutes les séances actives (option « corrigée en profondeur », touche `NotificationsService`).
- Gap critique trouvé en analyse (pas visible dans le texte `epics.md` d'origine) : `inscrire()`/`desinscrire()` figent le roster via `Seance.dateValidee`, champ écrit uniquement par `validerDate()` — son retrait sans correction aurait cassé silencieusement le gel du roster en épisodique. Ajouté au scope (Task 2) : lire aussi `poll.chosenDate`.
- Idée future notée par l'utilisateur (raccourci « date unique validée sans vote ») explicitement exclue du scope, tracée dans `deferred-work.md`.
- Task 1 : retrait de `validerDate()` a nécessité l'unification immédiate de la branche MJ épisodique de `SeanceList` avec la branche linéaire (CTA « Lancer le vote » commun) — anticipe une partie de la Task 5. Bouton « Proposer une autre date » retiré définitivement (confirmé par l'utilisateur : `PollCreationComponent` supporte déjà l'ajout de créneaux personnalisés à la création du vote, pas besoin d'une capacité « ajouter une option à un vote déjà ouvert »).
- Task 2 : `createSeancePoll()` ouvert à `CAMPAGNE_EPISODIQUE` ; `inscrire()`/`desinscrire()` étendus pour lire `seance.poll?.chosenDate` en plus de `seance.dateValidee`.
- Task 3 : `PollService.create()` ne ferme plus l'`OPEN` existant. Nouveau `ScenariosService.recalculateNextSession(partieId)`, orchestré depuis `PollController.choose()` via `forwardRef()` (`ScenariosModule` ↔ `PollModule`). Déclenché aussi par `deleteSeance()` et `resetSeanceDate()`.
- Task 4 : `ScenariosService.resetSeanceDate()` (détache `Seance.pollId`, retire `dateValidee`, recalcule `nextSessionDate`) + route + service web + bouton « Réinitialiser la date » dans `SeanceList` (branches linéaire et épisodique).
- Task 5 : confirmé complété par les Tasks 1/4 (CTA unifié + bouton réinitialisation), pas de travail additionnel.
- Task 6/7 : `CalendarView.activePolls` (liste de `{ scenario, seance, seanceIndex, poll }`, un par vote `OPEN`) remplace le signal `activePoll` unique, alimenté par `ScenariosService.listAll()`. Réalisés ensemble (MJ + joueur partagent le même signal/chargement). Bouton retour via `Location.back()`.
- Task 9 (ajoutée le 2026-07-14, retour utilisateur post-implémentation) : sélecteur de séance directement dans l'Oracle. Refactor `activePolls` en `computed()` dérivé d'un nouveau signal `scenarios` (source unique de vérité, `onPollResponded()` patche `scenarios` plutôt qu'un signal `activePolls` devenu read-only). Nouveau `computed()` `eligibleSeances` (scénario non `PASSE`, aucun poll lié, aucune date déjà validée) + `<select>` + `startVoteFor(seanceId)` qui réutilise entièrement le flux `lockedSeanceId`/`pollPanelOpen`/`PollCreationComponent` déjà en place — aucun nouveau composant, aucune route backend.
- Task 8 (rejouée après Task 9) : 625/625 tests API, 693/693 tests web, `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié sans erreur de résolution DI circulaire.

### File List

- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `createSeancePoll()` ouvert à l'épisodique, `inscrire()`/`desinscrire()` étendus, nouveau `recalculateNextSession()`, nouveau `resetSeanceDate()`, `validerDate()` retiré)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — tests migrés/ajoutés)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `reset-date` ajoutée, route `valider-date` retirée)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié)
- `apps/api/src/scenarios/scenarios.module.ts` (modifié — `forwardRef(() => PollModule)`)
- `apps/api/src/scenarios/dto/valider-date.dto.ts` (supprimé)
- `apps/api/src/poll/poll.service.ts` (modifié — retrait de la fermeture auto de l'`OPEN` existant)
- `apps/api/src/poll/poll.service.spec.ts` (modifié)
- `apps/api/src/poll/poll.controller.ts` (modifié — injection `ScenariosService` via `forwardRef`, orchestration `recalculateNextSession()` après `choose()`)
- `apps/api/src/poll/poll.controller.spec.ts` (nouveau)
- `apps/api/src/poll/poll.module.ts` (modifié — `forwardRef(() => ScenariosModule)`)
- `packages/shared/src/index.ts` (modifié — `ValiderDateDto` retiré)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `resetSeanceDate()` ajouté, `validerDate()` retiré)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (modifié — branche épisodique unifiée avec la branche linéaire, `onResetSeanceDate()` ajouté, `onValiderDate()`/`onProposerAutreDate()` retirés)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.html` (modifié)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (modifié — `activePolls`/`eligibleSeances` (computed) remplacent `activePoll`, `loadScenarios()`, `startVoteFor()`, `goBack()` via `Location`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` (modifié — `.oracle-back-btn`, `.poll-entry`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (modifié)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié, revue de code — `deleteSeance()`/`resetSeanceDate()` suppriment désormais le `SessionPoll` lié au lieu de le laisser orphelin ; `createSeancePoll()` : garde `scenario.status === 'PASSE'` ; `inscrire()` : re-vérifie `poll?.chosenDate` sous le verrou `FOR UPDATE`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié, revue de code — tests ajoutés/réécrits pour les 3 fixes ci-dessus)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.html` (modifié, revue de code — bouton « Réinitialiser la date » visible même pour un poll `CLOSED` sans `chosenDate`, branches linéaire et épisodique)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.spec.ts` (modifié, revue de code)
- `apps/api/src/poll/poll.controller.ts` (modifié, revue de code — route générique `POST /parties/:id/poll` retirée, `recalculateNextSession()` encapsulé dans un try/catch loggé après `choose()`)
- `apps/api/src/poll/poll.controller.spec.ts` (modifié, revue de code)
- `apps/web/src/app/core/poll/poll.service.ts` (modifié, revue de code — `createPoll()` retiré)
- `apps/web/src/app/core/poll/poll.service.spec.ts` (modifié, revue de code)
- `apps/web/src/app/features/poll/poll-response/poll-response.ts` (modifié, revue de code — `onConfirm()` émet une mise à jour locale du poll précis au lieu d'un `getCurrentPoll()` arbitraire)
- `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts` (modifié, revue de code)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié, revue de code — `activePolls` (liste) via `ScenariosService.listAll()` remplace `activePoll` unique via `PollService.getCurrentPoll()`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié, revue de code)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié, revue de code)
- `apps/web/src/app/core/poll/open-polls.service.ts` (modifié, revue de code — agrège tous les polls `OPEN` d'une Partie via `ScenariosService.listAll()`, notifie si au moins un a une option non répondue)
- `apps/web/src/app/core/poll/open-polls.service.spec.ts` (modifié, revue de code)

## Change Log

- 2026-07-14 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`, `poll.service.ts`/`.controller.ts`/`.module.ts`, `seance-list.ts`/`.html`, `calendar-view.ts`/`.html`, `poll-status.ts`, `poll-response.ts`, `poll.service.ts` (web), `schema.prisma`, `ARCHITECTURE-SPINE.md`). 2 décisions d'architecture tranchées avec l'utilisateur avant `dev-story` : (1) `validerDate()` retirée, le vote devient l'unique chemin pour poser une date en épisodique ; (2) un seul vote actif par Séance (pas par Partie), `nextSessionDate`/`nextSessionSlot` recalculés dynamiquement. Gap critique trouvé et ajouté au scope : gel du roster (`inscrire`/`desinscrire`) dépendait exclusivement du champ que `validerDate()` retirée aurait laissé mort.
- 2026-07-14 : Implémentation complète (bmad-dev-story). 8 tasks, TDD red-green par task. Décision d'implémentation non prévue par la story : orchestration de `recalculateNextSession()` depuis `PollController` (pas `PollService`, P2-AD-2) via `forwardRef()` entre `ScenariosModule` et `PollModule`. 625/625 tests API + 684/684 tests web, `pnpm typecheck` propre, redémarrage réel du conteneur `api` vérifié. Status → `review`.
- 2026-07-14 : Retour utilisateur post-implémentation — ajout de l'AC9/Task 9 (sélecteur de séance dans l'Oracle pour lancer un vote sans repasser par `SeanceList`, séances passées/déjà votées/déjà datées exclues). Implémentée en réutilisant entièrement le flux existant (`lockedSeanceId`/`PollCreationComponent`), aucune nouvelle route backend. 625/625 tests API + 693/693 tests web, `pnpm typecheck` propre. Status → `review`.
- 2026-07-14 : Revue de code (`bmad-code-review`, 3 couches adversariales sur `git diff HEAD`). 3 Decisions tranchées par l'utilisateur : (1) `resetSeanceDate()`/`deleteSeance()` suppriment désormais le `SessionPoll` lié (plus d'orphelin) et le bouton « Réinitialiser la date » reste accessible même sans consensus ; (2) route générique `POST /parties/:id/poll` retirée — un vote de date exige toujours un lien vers une Séance ; (3) `partie-detail.ts` et `open-polls.service.ts` migrés de `PollService.getCurrentPoll()` (hypothèse un seul poll par Partie) vers `ScenariosService.listAll()` (agrégation de tous les polls `OPEN`). 5 Patches appliqués : garde `PASSE` sur `createSeancePoll()`, refetch corrigé de `PollResponseComponent.onConfirm()`, TOCTOU `inscrire()` re-vérifié sous verrou, `recalculateNextSession()` après `choose()` capturé (log, pas d'échec HTTP). 3 items Defer (risque déjà accepté ailleurs, cas limite rare, décision utilisateur déjà actée). 630/630 tests API + 697/697 tests web, `pnpm typecheck` API propre. Status → `done`.
