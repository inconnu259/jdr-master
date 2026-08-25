---
baseline_commit: 373acf8c4c7b4eb59099a9ff35491a901cb49a01
---

# Story 29.7: Signalétique d'état des parties

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want voir sur chaque partie ce qui réclame une action de ma part,
so that j'ouvre l'application et sache immédiatement quoi faire.

## Contexte

**Septième story de l'épic 29**, consomme directement le champ `PartieDto.status` livré par la story 29.6 (`done`) sans le modifier. Story la plus dense de l'épic : elle introduit un nouvel endpoint agrégé (`GET /me/party-signals`), un nouveau type union fermée à 10 valeurs, et — point le plus délicat — **doit auditer et compléter l'émission temps réel de quasi toutes les mutations existantes qui affectent un signal** (création de personnage, d'Homme Dragon, changement de statut de scénario, vote, compte-rendu…), qui aujourd'hui n'émettent que `partie:{id}`, jamais `user:{id}` par membre (voir Task 4, découverte faite pendant la préparation de cette story).

**Hors périmètre explicite** (cf. epics.md, stories suivantes du même épic) :
- Filtres/tris/favoris sur les listes — **story 29.8**.
- Bannière générative de partie — **story 29.10**.
- Le champ `role`/`status` lui-même — déjà livré par **story 29.6**, cette story ne fait que le consommer et le republier dans `PartySignalsDto` (AD-3 l'exige explicitement, ce n'est pas une duplication accidentelle).

## Acceptance Criteria

1. **Given** j'ai plusieurs parties, **When** la liste se charge, **Then** un seul appel renvoie les signaux de toutes mes parties, **and** aucun appel supplémentaire n'est émis par partie affichée.
2. **Given** les signaux renvoyés, **When** ils sont sérialisés, **Then** chacun est un code appartenant à une union fermée déclarée dans le paquet partagé, **and** une partie sans signal porte un tableau vide, jamais une entrée absente.
3. **Given** une partie réclamant plusieurs actions, **When** sa carte s'affiche, **Then** au plus deux badges sont visibles, **and** le reste est résumé par un compteur.
4. **Given** mon rôle sur une partie et son statut, **When** ils s'affichent, **Then** ils proviennent du serveur, **and** aucun écran ne les recalcule.
5. **Given** une partie terminée, **When** ses signaux sont calculés, **Then** elle ne porte aucun signal d'action, **and** seuls subsistent les signaux de fin, tels qu'un compte-rendu manquant.
6. **Given** une mutation qui modifie un signal, **When** elle aboutit, **Then** elle émet l'événement de la partie **et** celui de chaque membre concerné, **and** l'écran de liste n'écoute que le canal personnel de l'utilisateur.
7. **Given** l'union fermée des codes de signal, **When** elle est déclarée, **Then** elle porte les dix signaux : personnage à créer, vote en cours sans ma réponse, compte-rendu non rédigé, Homme Dragon à créer, aucun membre invité, aucun scénario en cours, aucune date ni vote, rapport de fin manquant, prochaine séance connue, partie terminée, **and** aucun de ces dix n'est absent au motif qu'il serait rare.
8. **Given** plusieurs signaux coexistent sur une même partie, **When** la teinte de la carte est choisie, **Then** elle est celle du signal le plus prioritaire, dans cet ordre : ce qui bloque le démarrage, puis ce qui a une échéance, puis ce qui est en retard, **and** une partie terminée reste en teinte « terminé » même si un rapport de fin manque.
9. **Given** le mode d'affichage liste, **When** une partie y est rendue, **Then** la pastille d'état n'est jamais seule, **and** elle est doublée du libellé du signal dominant.
10. **Given** la liste des parties, **When** elle regroupe ses éléments, **Then** quatre intertitres existent : ce qui t'attend, en cours, à venir, terminées.

## Tasks / Subtasks

### Backend — types partagés, dérivation, endpoint

- [x] Task 1 — Paquet partagé : `PartySignalCode` et `PartySignalsDto` (AC: #2, #4, #7)
  - [x] `packages/shared/src/index.ts`, à côté de `PartieStatus` : déclarer l'union fermée à 10 valeurs. Noms de code **proposés** (transcription directe de la formulation exacte de l'AC7/FR-12 — à confirmer/ajuster en implémentation, aucun AC ne fige la casse ou l'orthographe exacte du code) :
    ```ts
    export type PartySignalCode =
      | 'PERSONNAGE_A_CREER'
      | 'VOTE_EN_COURS_SANS_REPONSE'
      | 'COMPTE_RENDU_NON_REDIGE'
      | 'HOMME_DRAGON_A_CREER'
      | 'AUCUN_MEMBRE_INVITE'
      | 'AUCUN_SCENARIO_EN_COURS'
      | 'AUCUNE_DATE_NI_VOTE'
      | 'RAPPORT_FIN_MANQUANT'
      | 'PROCHAINE_SEANCE_CONNUE'
      | 'PARTIE_TERMINEE';
    ```
  - [x] `PartySignalsDto` — **forme contraignante, imposée telle quelle par AD-3** (pas une proposition) :
    ```ts
    export interface PartySignalsDto {
      role: 'mj' | 'player';
      status: PartieStatus;
      signals: PartySignalCode[];
    }
    ```
  - [x] `role`/`status` sont dupliqués depuis `PartieDto` — **volontairement**, pas un oubli à corriger : AD-3 l'exige explicitement pour que l'écran de liste n'ait besoin d'aucun autre appel.

- [x] Task 2 — `PartySignalsService` (nouveau) : dérivation par requêtes groupées (AC: #1, #2, #5, #7)
  - [x] `apps/api/src/parties/party-signals.service.ts` — méthode publique `getSignals(userId: string): Promise<Record<string, PartySignalsDto>>`. Point de départ : réutiliser `PartiesService.listForUser()` (×2, `mj` et `player`) pour obtenir la liste des parties + leur `role`/`status` déjà projetés (AD-8/AD-15, story 29.6) — **ne jamais redériver `status` ici**, c'est un champ déjà correct.
  - [x] **Scoping par rôle, strict** : un signal marqué « (joueur uniquement) » ci-dessous n'est jamais calculé/inclus pour une partie où l'utilisateur est MJ (`role: 'mj'`), et inversement pour « (MJ) ». Séparer explicitement `mjPartieIds`/`playerPartieIds` (issus des deux appels `listForUser('mj')`/`listForUser('player')`) avant de lancer les requêtes groupées — ne jamais calculer un signal MJ sur l'ensemble complet des parties de l'utilisateur puis filtrer après coup, au risque d'une fuite si le filtre est oublié.
  - [x] **Lecture en lot obligatoire (AD-3)** — un seul aller-retour par table concernée, jamais une requête par partie dans une boucle `.map()`. Pour chaque signal, dériver depuis une requête groupée sur l'ensemble des `partieId` de l'utilisateur :
    - `PERSONNAGE_A_CREER` (joueur uniquement) : `prisma.character.findMany({ where: { userId, partieId: { in: partieIds } }, select: { partieId: true } })` → partie sans personnage pour cet utilisateur = signal actif. Même patron de lot que `CharacterService.findMine()` (`apps/api/src/characters/character.service.ts:444-471`), qui résout déjà les Parties d'un utilisateur sans N+1 — s'en inspirer directement.
    - `VOTE_EN_COURS_SANS_REPONSE` (joueur) : nécessite les `SessionPoll` `OPEN` de chaque scénario de chaque partie **et** si l'utilisateur a répondu à toutes leurs options (même logique que `hasUnansweredOptions()`, `apps/web/src/app/core/poll/poll.util.ts` — équivalent serveur à écrire ou logique à porter). Requête groupée sur `PollOption`/`PollVote` par `partieId` via la chaîne `Scenario → Seance → SessionPoll`.
    - `COMPTE_RENDU_NON_REDIGE` : `Seance.compteRendu` null sur une séance déjà passée/validée (`dateValidee` renseignée ou `pollId` avec `chosenDate`) — **décision à trancher en implémentation** : ce signal est-il MJ-only (c'est le MJ qui rédige, `Seance.compteRendu`) ou visible aussi du joueur en lecture informative ? FR-12 le liste « côté joueur », l'AC7 ne le qualifie pas par rôle — documenter le choix retenu dans Completion Notes plutôt que de trancher silencieusement.
    - `HOMME_DRAGON_A_CREER` (MJ uniquement, Epic 10) : `prisma.hommeDragon.findMany({ where: { userId, partieId: { in: mjPartieIds } } })` → partie MJ sans `HommeDragon` = signal actif.
    - `AUCUN_MEMBRE_INVITE` (MJ) : `prisma.membership.groupBy({ by: ['partieId'], where: { partieId: { in: mjPartieIds } }, _count: { _all: true } })` → partie absente du résultat (ou compte 0, cf. Task note sur `groupBy` en Story 29.6) = aucun membre. **Lecture proposée du texte FR-12** : « aucun membre invité » = aucun `Membership` (personne n'a encore rejoint), pas l'absence d'une invitation en attente — à confirmer, aucune AC ne distingue les deux lectures.
    - `AUCUN_SCENARIO_EN_COURS` (MJ) : `prisma.scenario.groupBy({ by: ['partieId', 'status'], where: { partieId: { in: mjPartieIds }, status: 'COURANT' } })` → absence de scénario `COURANT` pour cette partie.
    - `AUCUNE_DATE_NI_VOTE` : `Partie.nextSessionDate` null **et** aucun `SessionPoll` `OPEN` rattaché — combine le champ déjà persisté (AD-3 : « le signal "prochaine séance" lit `Partie.nextSessionDate`/`nextSessionSlot`, déjà persistés — il n'est jamais recalculé depuis les séances ») et le résultat de la requête groupée `SessionPoll` déjà faite pour `VOTE_EN_COURS_SANS_REPONSE`.
    - `RAPPORT_FIN_MANQUANT` (MJ) : `Scenario.resumeFin` null sur un scénario `status: 'PASSE'` — requête groupée `scenario.findMany({ where: { partieId: { in: mjPartieIds }, status: 'PASSE', resumeFin: null } })`.
    - `PROCHAINE_SEANCE_CONNUE` : signal **informatif**, pas une alerte — actif si `Partie.nextSessionDate` non nul (déjà disponible depuis `listForUser`, aucune requête supplémentaire).
    - `PARTIE_TERMINEE` : actif si `status === 'TERMINEE'` (déjà disponible depuis `listForUser`).
  - [x] **AC5, règle stricte à appliquer en dernier** : si `status === 'TERMINEE'`, retirer tous les signaux d'action de la liste calculée ci-dessus et ne garder que les signaux de fin (`COMPTE_RENDU_NON_REDIGE`, `RAPPORT_FIN_MANQUANT`, `PARTIE_TERMINEE`) — une partie clôturée ne porte jamais `AUCUN_MEMBRE_INVITE`/`AUCUN_SCENARIO_EN_COURS`/etc., même si la condition serait techniquement vraie.
  - [x] Une partie sans aucun signal actif porte `signals: []` — jamais une entrée absente de la carte retournée (AC2).

- [x] Task 3 — Contrôleur : `GET /me/party-signals` (AC: #1)
  - [x] `apps/api/src/parties/my-party-signals.controller.ts` (nouveau fichier, **même patron que `MyCharactersController`**, `apps/api/src/characters/my-characters.controller.ts:1-21` — `@Controller('me/party-signals')`, contrôleur dédié plutôt qu'une route ajoutée à `PartiesController` `@Controller('parties')`, pour la même raison documentée dans ce fichier de référence : éviter toute collision de route `:id`) :
    ```ts
    @UseGuards(AuthenticatedGuard)
    @Controller('me/party-signals')
    export class MyPartySignalsController {
      constructor(private readonly signals: PartySignalsService) {}

      @Get()
      getMine(@CurrentUser() user: AuthUser) {
        return this.signals.getSignals(user.id);
      }
    }
    ```
  - [x] `apps/api/src/parties/parties.module.ts` : ajouter `PartySignalsService` aux `providers`, `MyPartySignalsController` aux `controllers`.

- [x] Task 4 — **Audit et complément de l'émission temps réel (AD-14) sur les mutations existantes qui affectent un signal** (AC: #6)
  - [x] **Constat fait pendant la préparation de cette story, à vérifier en tout premier lieu** : `character.service.ts`, `homme-dragon.service.ts`, `scenarios.service.ts` et `poll.service.ts` n'émettent aujourd'hui **que** `partieTopic(...)` sur leurs mutations — aucune n'émet `userTopic(...)` par membre. Seule `PartiesService` (story 29.6 : `close()`/`reopen()`/`removeMember()`) le fait déjà, via un helper privé `emitPartieAndMembersSafe()` (`apps/api/src/parties/parties.service.ts`, ajouté en revue de code 29.6 — try/catch + `Logger.warn`, pour ne jamais faire échouer une mutation déjà committée à cause d'un souci d'émission).
  - [x] Rendre ce helper **réutilisable par les autres services** : exposer une méthode publique sur `PartiesService` (ex. `notifyPartieSignalsChanged(partieId: string, mjId: string): Promise<void>`, enveloppant le helper privé existant) — **tous les services concernés injectent déjà `PartiesService`** (`character.service.ts:31/156`, `homme-dragon.service.ts:21/34`, `scenarios.service.ts:19/42`, `poll.service.ts:7/31` — vérifié, aucune nouvelle dépendance de module à ajouter).
  - [x] Appeler cette méthode, **en plus** de l'émission `partieTopic` existante (jamais en remplacement), après chaque mutation qui change un des 10 signaux :
    - `character.service.ts` : création de personnage (`PERSONNAGE_A_CREER`).
    - `homme-dragon.service.ts` : création (`HOMME_DRAGON_A_CREER`).
    - `scenarios.service.ts` : passage à `COURANT` (`AUCUN_SCENARIO_EN_COURS`), clôture/`resumeFin` (`RAPPORT_FIN_MANQUANT`), `setCompteRendu()` (`COMPTE_RENDU_NON_REDIGE`).
    - `poll.service.ts` : création de vote, vote d'une option, clôture (`VOTE_EN_COURS_SANS_REPONSE`, `AUCUNE_DATE_NI_VOTE`).
    - `parties.service.ts` : `removeMember()`/ajout de membre (rejoindre via `InviteLink`/`Invitation`) pour `AUCUN_MEMBRE_INVITE` — vérifié : `InvitationsService.accept()`/`InviteLinksService.join()` n'émettaient jamais d'événement pour le MJ, même traitement appliqué.
  - [x] **Ne pas** élargir ce traitement à des mutations qui ne touchent aucun des 10 signaux (ex. édition du portrait, changement de thème) — hors périmètre, ne pas sur-corriger.

### Frontend — service, badges, teinte, intertitres

- [x] Task 5 — `PartySignalsService` (front, nouveau) (AC: #1, #4, #6)
  - [x] `apps/web/src/app/core/parties/party-signals.service.ts` : un signal `Map<string, PartySignalsDto>` (clé `partieId`), rempli par un seul appel `GET /me/party-signals`, exposé en lecture. `notifyChanged()` public (contrat AD-4/AD-14, même patron que `MyPartiesService.notifyChanged()`).
  - [x] `apps/web/src/app/core/realtime/realtime.service.ts` : ajouter une entrée `{ prefix: 'user:', notifyChanged: () => this.partySignals.notifyChanged() }` à la table `handlers` (ligne ~83-94) — **jamais** `'partie:'` (AD-14 : « la liste écoute `user:` seul, jamais N canaux de partie »).
  - [x] **Ne rien recalculer côté client** : `role`/`status` viennent tels quels du DTO (AC4) ; les 10 signaux viennent tels quels du DTO — la seule logique client tolérée est la **priorisation d'affichage** (Task 6) et le **regroupement en intertitres** (Task 8), toutes deux des fonctions pures du tableau `signals[]` déjà reçu, jamais une redérivation depuis d'autres champs.

- [x] Task 6 — Badges de signal + teinte prioritaire sur les cartes (AC: #3, #8, #9)
  - [x] Table de priorité déclarée une fois (ex. `apps/web/src/app/core/parties/party-signal-priority.ts`), fonction pure `dominantSignal(signals: PartySignalCode[]): PartySignalCode | null` : ordonne selon AC8 (« ce qui bloque le démarrage » > « ce qui a une échéance » > « ce qui est en retard »). **Décision à trancher en implémentation** : l'AC8 énonce 3 catégories, pas un ordre total sur les 10 codes — construire un mapping explicite code → catégorie, documenté et justifié dans Completion Notes (aucune AC ne fournit cette table).
  - [x] Sur `Dashboard`/liste de parties (`apps/web/src/app/features/dashboard/dashboard.html`, déjà porteur de `.tile--closed`/`.status-indicator` depuis la Story 29.6, patron à réutiliser) : au plus **2 badges visibles** (icône + libellé, jamais la couleur seule — règle spine ligne 252, déjà appliquée en 29.0/29.6), le reste résumé par un compteur (« +N »). Teinte de la carte = celle du signal dominant (`dominantSignal()`).
  - [x] AC8, cas particulier explicite : une partie `TERMINEE` reste en teinte « terminé » **même si** `RAPPORT_FIN_MANQUANT` est aussi présent — `PARTIE_TERMINEE` prime toujours dans la table de priorité, quel que soit l'autre signal coexistant.
  - [x] Nouvelles clés de thème (×3, `apps/web/src/app/core/theme/tones.ts`) : un libellé court par code de signal (10 clés) + un gabarit de compteur (ex. `partie.signal_more_count` → « +{n} »).

- [x] Task 7 — Quatre intertitres de liste (AC: #10)
  - [x] Regroupement client (fonction pure, pas un nouvel appel réseau) des parties déjà chargées (`MyPartiesService`) + leurs signaux (`PartySignalsService`) en 4 groupes : **ce qui t'attend** (signaux d'action non-fin présents), **en cours** (`status === 'EN_COURS'`, aucun signal d'action), **à venir** (`status === 'A_VENIR'`), **terminées** (`status === 'TERMINEE'`). **Décision à trancher en implémentation** : l'ordre de priorité exact entre « a un signal d'action » et « statut EN_COURS/A_VENIR » quand les deux s'appliquent (ex. une partie `A_VENIR` avec `AUCUN_MEMBRE_INVITE` va dans quel groupe ?) — non spécifié par l'AC, documenter le choix retenu.
  - [x] Nouvelles clés de thème (×3) pour les 4 intertitres.
  - [x] Hors périmètre explicite (cf. Contexte) : pas de nouveau mode d'affichage, pas de filtre/tri — seulement le regroupement visuel par intertitre sur la vue liste existante.

### Tests

- [x] Task 8 — Backend : `party-signals.service.spec.ts` (nouveau) (AC: #1, #2, #5, #7)
  - [x] Un test par signal : condition qui l'active, condition qui ne l'active pas.
  - [x] Une partie sans aucun signal → `signals: []` (jamais une entrée absente de la carte).
  - [x] Une partie `TERMINEE` avec des conditions qui activeraient normalement `AUCUN_SCENARIO_EN_COURS`/`AUCUN_MEMBRE_INVITE`/etc. → ces signaux sont bien absents, seuls les signaux de fin subsistent (AC5).
  - [x] Lecture en lot : chaque requête groupée (`character.findMany`, `hommeDragon.findMany`, `membership.groupBy`, `scenario.groupBy`/`findMany`, requêtes de vote) est appelée **une seule fois** pour N parties — même style de test que Story 29.6 (`parties.service.spec.ts`, test « appelé une seule fois pour N parties »).

- [x] Task 9 — Backend : `my-party-signals.controller.spec.ts` (nouveau) (AC: #1)
  - [x] Un test de routage : `getMine()` route `user.id` vers `PartySignalsService.getSignals` — même patron que `parties.controller.spec.ts` (Story 29.6).

- [x] Task 10 — Backend : mise à jour des specs des 4 services touchés par Task 4 (AC: #6)
  - [x] `character.service.spec.ts`, `homme-dragon.service.spec.ts`, `scenarios.service.spec.ts`, `poll.service.spec.ts` : un test par mutation modifiée — vérifie l'appel à `PartiesService.notifyPartieSignalsChanged(partieId, mjId)` **en plus** de l'émission `partieTopic` déjà testée (ne pas retirer les assertions existantes).

- [x] Task 11 — Frontend : `party-signals.service.spec.ts` (nouveau) (AC: #1, #4, #6)
  - [x] Un seul appel HTTP au montage, `notifyChanged()` déclenche un refetch, `role`/`status`/`signals` ressortent tels quels du DTO (aucune transformation).

- [x] Task 12 — Frontend : `party-signal-priority.spec.ts` (nouveau) (AC: #8)
  - [x] `dominantSignal()` : cas à un seul signal, plusieurs signaux concurrents, `PARTIE_TERMINEE` toujours dominant.

- [x] Task 13 — Frontend : `dashboard.spec.ts` (AC: #3, #9, #10)
  - [x] Une partie avec 3+ signaux → 2 badges visibles + compteur « +N ».
  - [x] Une pastille de statut n'est jamais seule (icône + libellé, jamais la couleur seule).
  - [x] Les 4 intertitres apparaissent, chaque partie dans le bon groupe.

### Review Findings

- [x] [Review][Patch] AC8 — la teinte de carte ne distinguait que 2 états (`todo`/repos), pas les 3 catégories de priorité — décision utilisateur : implémenter littéralement les 3 catégories. Contrainte découverte en implémentant : la palette `--jdr-status-*` (Story 29.0) est un invariant documenté « complet » à 4 teintes (todo/live/soon/done, colorimétrie validée sur les 3 thèmes) — ajouter une 5ᵉ teinte dédiée aurait cassé cet invariant sans passage par `bmad-ux`. Décision retenue (2ᵉ question posée à l'utilisateur) : réutiliser les 4 teintes existantes plutôt qu'en ajouter une — `dominantCategory()` (nouveau, `party-signal-priority.ts`) classe chaque code en `blocking`/`deadline`/`overdue`/`informative` ; `dashboard.ts` mappe `blocking` → `todo` (ambre, le plus urgent), `deadline`/`overdue` → `soon` (partagée, faute de teinte dédiée). Résultat : 2 nuances distinguées sur les 3 catégories de l'AC, sans improviser de nouvelle couleur. Tests ajoutés : `party-signal-priority.spec.ts` (`dominantCategory`, 6 cas), `dashboard.spec.ts` (`RAPPORT_FIN_MANQUANT` → `tile--soon`, jamais `tile--awaiting`). [apps/web/src/app/core/parties/party-signal-priority.ts, apps/web/src/app/features/dashboard/dashboard.ts]

- [x] [Review][Patch] Role-scoping implicite des signaux de fin de partie — `apps/api/src/parties/party-signals.service.ts`, branche `TERMINEE` : `COMPTE_RENDU_NON_REDIGE`/`RAPPORT_FIN_MANQUANT` n'étaient MJ-only que parce que les requêtes Prisma en amont (`scenario.findMany`/`seance.findMany`) étaient filtrées sur `mjPartieIds` — la branche `TERMINEE` elle-même ne vérifiait pas `role`. Garde explicite `role === 'mj'` ajoutée sur les deux signaux, pour empêcher toute fuite silencieuse si ces requêtes étaient un jour élargies à `allPartieIds`. Test ajouté : `party-signals.service.spec.ts` (partie TERMINEE en rôle player, requêtes simulées comme si elles incluaient la partie à tort → aucun signal de fin ne fuite).

- [x] [Review][Defer] `PartiesService.remove()` (suppression définitive d'une partie) n'émet aucun événement temps réel [apps/api/src/parties/parties.service.ts:282] — deferred, pre-existing (méthode non touchée par cette story, hors périmètre explicite de la Task 4 qui ne liste que close()/reopen()/removeMember())

- [x] [Review][Defer] `Partie.nextSessionDate` n'est jamais effacé après la date passée, désynchronisant `PROCHAINE_SEANCE_CONNUE`/`AUCUNE_DATE_NI_VOTE` [apps/api/src/parties/party-signals.service.ts:942,951] — deferred, pre-existing (comportement du champ déjà persisté, AD-3 interdit explicitement de le recalculer ; aucune story n'a encore traité l'effacement post-date)

- [x] [Review][Defer] Collision silencieuse MJ/joueur dans la carte retournée par `getSignals()` si un utilisateur était un jour membre ET MJ de la même partie [apps/api/src/parties/party-signals.service.ts:955-969] — deferred, pre-existing (repose sur un invariant applicatif maintenu ailleurs — un seul MJ par partie —, non vérifié par ce service ; durcissement défensif, aucun bug vivant constaté)

- [x] [Review][Defer] Teinte/badges transitoires incorrects avant la résolution du premier appel `GET /me/party-signals` [apps/web/src/app/core/parties/party-signals.service.ts:29-30, dashboard.ts tiles computed] — deferred, pre-existing (Map de signaux vide par défaut au montage — motif déjà partagé par d'autres écrans à état asynchrone, pas introduit spécifiquement par cette story)

- [x] [Review][Defer] `sortByPriority()` trie un code de signal absent de `PRIORITY_ORDER` en tête de liste (`indexOf` retourne -1) [apps/web/src/app/core/parties/party-signal-priority.ts:41] — deferred, pre-existing risk (aucun bug vivant : les 10 codes actuels sont tous couverts par `PRIORITY_ORDER` ; piège pour une future extension de l'union, pas un défaut de cette story)

- [x] [Review][Defer] `InviteLinksService.join()` fait confiance au typage élargi de `consumeLink()` (`partie.mjId`) sans garde runtime si la relation `partie` était absente [apps/api/src/invitations/invite-links.service.ts:100-108] — deferred, pre-existing (dépend de l'intégrité référentielle déjà garantie par le schéma Prisma ; aucun scénario de reproduction identifié)

## Dev Notes

### Ce qui doit continuer de fonctionner

- `PartiesService.listForUser()`, `findOneDto()`, `close()`/`reopen()` (Story 29.6) — **inchangés**, seulement lus/réutilisés par `PartySignalsService` (Task 2).
- `OpenPollsService` (front, `apps/web/src/app/core/poll/open-polls.service.ts`) — alimente aujourd'hui le badge « vote en attente » du Dashboard via un **fan-out par Partie** (`Promise.allSettled(parties.map((p) => this.fetchOne(p.id)))`, ligne 84). C'est exactement le motif qu'AD-3 interdit d'introduire pour les nouveaux signaux — **mais ce service existant n'est pas dans le périmètre de cette story** (aucune AC ne demande son retrait). **Décision à trancher en implémentation** : le nouveau signal `VOTE_EN_COURS_SANS_REPONSE` de `PartySignalsDto` fait-il doublon avec le badge existant, et si oui `OpenPollsService`/son usage dans `dashboard.html` sont-ils retirés au profit du nouveau signal, ou les deux coexistent-ils temporairement ? Documenter le choix retenu dans Completion Notes — ne pas supprimer silencieusement un service existant sans décision explicite.
- Le câblage temps réel déjà en place (`partieTopic` sur les 4 services de Task 4) — **jamais retiré**, seulement complété par la nouvelle émission `userTopic` par membre.
- `resolveParticipants()` (privé, `PartiesService`) — réutilisé tel quel par le nouveau helper public, pas de réécriture.

### Hors périmètre (réservé à 29.8/29.10 ou ultérieur)

- Filtres, tris, favoris — story 29.8.
- Bannière générative / image de couverture de partie — story 29.10.
- Nouveaux modes d'affichage (grille/liste compacte) — story 29.9.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Casse/orthographe exacte des 10 codes `PartySignalCode`** — proposition faite en Task 1, transcription directe du texte de l'AC7, à ajuster librement.
- **`COMPTE_RENDU_NON_REDIGE` : MJ-only ou visible du joueur aussi** — FR-12 le liste côté joueur, l'AC7 ne qualifie aucun des 10 codes par rôle.
- **« aucun membre invité » : absence de `Membership`, ou absence d'invitation en attente** — lecture retenue en Task 2 : absence de `Membership` (personne n'a rejoint), à confirmer.
- **Table de correspondance code → catégorie de priorité** (AC8 : « bloque le démarrage » / « échéance » / « en retard ») — l'AC énonce 3 catégories, pas un ordre total sur les 10 codes ; construire et documenter la table.
- **Ordre de priorité entre « a un signal d'action » et le statut `EN_COURS`/`A_VENIR`** pour le regroupement en 4 intertitres (Task 7) — non spécifié par l'AC10.
- **Coexistence ou remplacement d'`OpenPollsService`** par le nouveau signal `VOTE_EN_COURS_SANS_REPONSE` — voir « Ce qui doit continuer de fonctionner » ci-dessus.

### Project Structure Notes

- **Backend nouveaux** : `apps/api/src/parties/party-signals.service.ts`, `apps/api/src/parties/my-party-signals.controller.ts`, `apps/api/src/parties/party-signals.service.spec.ts`, `apps/api/src/parties/my-party-signals.controller.spec.ts`.
- **Backend modifiés** : `apps/api/src/parties/parties.module.ts` (+ provider/controller), `apps/api/src/parties/parties.service.ts` (+ méthode publique `notifyPartieSignalsChanged`), `apps/api/src/characters/character.service.ts`, `apps/api/src/homme-dragon/homme-dragon.service.ts`, `apps/api/src/scenarios/scenarios.service.ts`, `apps/api/src/poll/poll.service.ts` (+ appel à la nouvelle méthode sur les mutations listées Task 4), + leurs `*.spec.ts` respectifs.
- **Shared modifié** : `packages/shared/src/index.ts` (`PartySignalCode`, `PartySignalsDto`).
- **Frontend nouveaux** : `apps/web/src/app/core/parties/party-signals.service.ts` (+ spec), `apps/web/src/app/core/parties/party-signal-priority.ts` (+ spec).
- **Frontend modifiés** : `apps/web/src/app/core/realtime/realtime.service.ts` (+ entrée `user:` dans `handlers`), `apps/web/src/app/features/dashboard/dashboard.html`/`.scss`/`.ts` (+ spec — badges, teinte, intertitres), `apps/web/src/app/core/theme/tones.ts` (10 clés de signal + compteur + 4 intertitres, ×3 thèmes).
- **Non touchés** : `PartiesService.close()`/`reopen()`/`listForUser()` (29.6, lus tels quels), `MyPartiesService` (liste des parties elle-même inchangée, seulement enrichie côté affichage par les signaux).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.7] — Story, Acceptance Criteria (reprises telles quelles).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-12] — Signalétique d'état : répartition des signaux par rôle (joueur/MJ), exigence non fonctionnelle « un seul appel, jamais un appel par partie » (Q-11 tranché à l'architecture).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-44] — Rappel : clôture explicite (Story 29.6, `done`), condition FR-3/FR-10/FR-12.
- [Source: ARCHITECTURE-SPINE.md#AD-3] — Règle canonique complète : `GET /me/party-signals`, forme exacte de `PartySignalsDto`, union fermée `PartySignalCode`, tableau vide jamais absent, aucun signal d'action sur une partie clôturée, signal « prochaine séance » lu depuis les champs déjà persistés.
- [Source: ARCHITECTURE-SPINE.md#AD-4] — `/me` = convention de routage : `GET /me/party-signals` vit dans `PartiesModule`, jamais un module `account` fourre-tout.
- [Source: ARCHITECTURE-SPINE.md#AD-8] — Statut de partie déjà dérivé et projeté (Story 29.6) — source de `PartySignalsDto.status`, jamais redérivé ici.
- [Source: ARCHITECTURE-SPINE.md#AD-14] — Double émission temps réel obligatoire pour toute mutation modifiant un signal de FR-12 ; front : `PartySignalsService` s'abonne au préfixe `user:` **seul**, jamais `partie:`.
- [Source: ARCHITECTURE-SPINE.md#AD-15] — `PartiesService` projette explicitement (`toPartieDto`), pattern à réutiliser pour la nouvelle projection.
- [Source: ARCHITECTURE-SPINE.md, ligne 252 « Signalétique d'état »] — Tout état encodé par la couleur est doublé d'un second signal non chromatique — déjà appliqué en 29.0/29.6, à reconduire sur les nouveaux badges.
- [Source: ARCHITECTURE-SPINE.md, Source tree ajouts] — `party-signals.service.ts` (nouveau, backend ET front), emplacement exact confirmé dans l'arborescence cible de l'architecture.
- [Source: apps/api/src/characters/my-characters.controller.ts] — Patron de contrôleur dédié `/me/...` à reproduire pour `MyPartySignalsController` (évite toute collision de route avec `PartiesController` `@Controller('parties')`).
- [Source: apps/api/src/characters/character.service.ts:444-471] — `findMine()`, patron de résolution en lot (pas de N+1) pour dériver `PERSONNAGE_A_CREER` par lot de `partieId`.
- [Source: apps/api/src/parties/parties.service.ts] — `emitPartieAndMembersSafe()`/`resolveParticipants()` (Story 29.6, revue de code) : helper déjà écrit, try/catch + `Logger.warn`, à exposer publiquement (Task 4) plutôt qu'à dupliquer.
- [Source: apps/api/src/characters/character.service.ts, apps/api/src/homme-dragon/homme-dragon.service.ts, apps/api/src/scenarios/scenarios.service.ts, apps/api/src/poll/poll.service.ts] — Vérifié pendant la préparation de cette story : ces 4 services injectent déjà `PartiesService` mais n'émettent que `partieTopic(...)`, jamais `userTopic(...)` — gap réel à combler (Task 4), pas une supposition.
- [Source: apps/web/src/app/core/realtime/realtime.service.ts:83-94] — Table `handlers` topic → service, patron exact pour l'entrée `PartySignalsService` (préfixe `user:`, même ligne que `myParties`).
- [Source: apps/web/src/app/core/poll/open-polls.service.ts] — Service existant à examiner (Task Dev Notes, décision à trancher) : fan-out par Partie pour le badge « vote en attente », motif qu'AD-3 proscrit pour tout nouveau signal.
- [Source: apps/web/src/app/features/dashboard/dashboard.html, .scss] — `.tile--closed`/`.status-indicator` (Story 29.6) : patron de doublement non chromatique à reconduire pour les badges de signal.
- [Source: apps/api/prisma/schema.prisma] — `Scenario.status/resumeFin`, `Seance.compteRendu/dateValidee/pollId`, `SessionPoll.status/chosenDate`, `Membership`, `HommeDragon`, `Character` : modèles source des 10 signaux, aucun nouveau modèle requis (dérivation pure, cf. AD-3).
- [Source: _bmad-output/implementation-artifacts/29-6-cloture-explicite-dune-partie.md] — Story précédente : conventions de Dev Notes/Completion Notes à reproduire (documenter les décisions non tranchées par les ACs plutôt que de les deviner silencieusement) ; patron de tests `close()`/`reopen()` à reproduire pour `party-signals.service.spec.ts`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Suite API complète (`docker compose exec api pnpm test`) : 54/54 suites, 1062/1062 tests verts.
- `docker compose exec api pnpm typecheck` : propre.
- Suite web complète (`docker compose exec web pnpm test`) : 86/86 fichiers, 1178/1178 tests verts.
- Lint (API + web) sur les fichiers touchés par cette story : propre — seules erreurs restantes pré-existantes (bruit `@typescript-eslint/no-unsafe-*` sur mocks Prisma `any`-typés, formatage `matchingHandlers()` dans `realtime.service.ts` non touché par cette story), confirmé par lecture du diff avant d'écarter chaque finding.
- `docker compose exec web pnpm build` : échoue uniquement sur le budget de bundle initial pré-existant (1.22 MB vs budget 1.00 MB), même point d'échec que dans les stories 29.4/29.5/29.6 — sans lien avec cette story.

### Completion Notes List

- Story créée le 2026-08-10 (bmad-create-story). Découverte notable pendant la préparation : `character.service.ts`/`homme-dragon.service.ts`/`scenarios.service.ts`/`poll.service.ts` n'émettent aujourd'hui que `partieTopic(...)`, jamais `userTopic(...)` par membre — seule `PartiesService` (Story 29.6) le fait. C'est un gap réel d'AD-14 à combler par cette story (Task 4), pas un simple ajout de nouvelle fonctionnalité par-dessus un câblage déjà complet.
- Story volontairement dense (13 tâches, 6 décisions à trancher explicitement documentées) — reflète la taille réelle de l'AC list dans `epics.md` (10 ACs, 10 codes de signal). Aucune tentative de découpage supplémentaire : `epics.md` fait autorité et ne scinde pas cette story.
- Implémentée le 2026-08-10 (bmad-dev-story), TDD sur chaque tâche. **Décisions retenues, documentées ici comme demandé par les Dev Notes** :
  - **Casse des codes `PartySignalCode`** : conservée telle que proposée dans la story (`PERSONNAGE_A_CREER`, etc.) — transcription directe de l'AC7.
  - **`COMPTE_RENDU_NON_REDIGE` : MJ-only.** C'est le MJ qui rédige `Seance.compteRendu` (patron déjà établi Story 8.4) ; la requête groupée qui le dérive est scopée à `mjPartieIds` uniquement, jamais calculée pour un rôle joueur.
  - **« aucun membre invité » = absence de `Membership`** (personne n'a rejoint), pas l'absence d'invitation en attente — lecture retenue telle que proposée dans Task 2, `membership.groupBy()` sur les parties MJ.
  - **Table de priorité (AC8)** : ordre total explicite dans `party-signal-priority.ts` — `PARTIE_TERMINEE` toujours en tête (hors catégorie), puis « bloque le démarrage » (`AUCUN_MEMBRE_INVITE`/`PERSONNAGE_A_CREER`/`HOMME_DRAGON_A_CREER`/`AUCUN_SCENARIO_EN_COURS`/`AUCUNE_DATE_NI_VOTE`), puis « échéance » (`VOTE_EN_COURS_SANS_REPONSE`), puis « en retard » (`RAPPORT_FIN_MANQUANT`/`COMPTE_RENDU_NON_REDIGE`), et enfin `PROCHAINE_SEANCE_CONNUE` (purement informatif, jamais dominant si un autre signal coexiste).
  - **Regroupement en 4 intertitres (AC10)** : une partie non terminée avec au moins un signal actionnable (tout sauf `PROCHAINE_SEANCE_CONNUE`/`PARTIE_TERMINEE`) va dans « ce qui t'attend », quel que soit son statut `EN_COURS`/`A_VENIR` — sinon elle se range par statut. Une partie `TERMINEE` va toujours dans « terminées », cohérent avec AC5 (elle ne porte plus de signal d'action, seulement des signaux de fin).
  - **`OpenPollsService` conservé tel quel, coexiste avec le nouveau signal `VOTE_EN_COURS_SANS_REPONSE`.** Aucune AC ne demande son retrait ; le remplacer aurait été un changement de périmètre non demandé. Le badge « vote en attente » existant (fan-out par Partie, motif qu'AD-3 proscrit pour du code neuf) reste en l'état — noté comme dette pré-existante non résolue par cette story dans `deferred-work.md`.
- **Gap AD-14 comblé au-delà de la liste initiale de Task 4** : en auditant `InvitationsService.accept()`/`InviteLinksService.join()` (demandé explicitement par la story), un troisième point a été trouvé et corrigé : `PartiesService.removeMember()` n'émettait pas non plus `userTopic(mjId)` — retirer le dernier membre d'une partie doit faire réapparaître `AUCUN_MEMBRE_INVITE` pour le MJ. Corrigé avec le même helper `emitPartieAndMembersSafe()`.
- **Écart mineur assumé, non traité** : `AuthService.register()` (inscription avec lien d'invitation) appelle aussi `InviteLinksService.consumeLink()` mais n'a jamais été explicitement listé par la story (seuls `InvitationsService.accept()`/`InviteLinksService.join()` le sont) — le MJ ne reçoit donc pas encore `userTopic` dans ce cas précis (auto-inscription via lien). Nécessiterait d'injecter `PartiesService` dans `AuthService`, hors périmètre de cette story ; noté dans `deferred-work.md`.
- Type de retour de `InviteLinksService.consumeLink()` élargi (`InviteLink & { partie: { mjId: string } }`) pour exposer `partie.mjId` à `join()` — la requête Prisma sous-jacente incluait déjà `partie: { select: { mjId: true } }`, seul le type TypeScript ne le reflétait pas.
- **Correctifs post-revue (2e passe `/bmad-code-review`, 2026-08-10)** — 3 patches confirmés + 1 constat utilisateur supplémentaire :
  1. **Double émission `partieTopic` corrigée.** `notifyPartieSignalsChanged()` appelait `emitPartieAndMembersSafe()`, qui réémet `partie:{id}` — or les ~11 points d'appel (`character.service.ts`, `homme-dragon.service.ts`, `scenarios.service.ts`, `poll.service.ts`, `invitations.service.ts`, `invite-links.service.ts`, `removeMember()`) l'émettaient déjà eux-mêmes juste avant. Ajout de `emitMembersOnly()`/`emitMembersOnlySafe()` (userTopic seul, jamais partieTopic) utilisés par `notifyPartieSignalsChanged()`/`removeMember()` ; `close()`/`reopen()` (Story 29.6) conservent `emitPartieAndMembersSafe()`, seuls appelants sans émission manuelle préalable.
  2. **AC9 : `.tile--live`/`.tile--soon` sans aucun signal affichaient la couleur seule.** Une partie EN_COURS/A_VENIR sans signal actionnable ni `PROCHAINE_SEANCE_CONNUE` ne rendait aucun badge — seule la bordure colorée restait, violant AC9/P-1. Ajout d'un `.status-indicator` de repli (icône + libellé « En cours »/« À venir », thémé) affiché uniquement quand `visibleSignals.length === 0`. `.tile--awaiting` n'a pas ce besoin : elle n'existe que si un signal actionnable est présent, donc au moins un badge est déjà visible.
  3. **Commentaire JSDoc `TileTint` erroné corrigé** — décrivait un cas `null` impossible à atteindre (`tiles()` calcule toujours une valeur).
  4. **Doublon `PARTIE_TERMINEE` + badges non différenciés (constat utilisateur).** Une partie terminée affichait deux fois l'information « terminée » (`.status-indicator` **et** un badge `PARTIE_TERMINEE`) ; corrigé en excluant `PARTIE_TERMINEE` des `visibleSignals`/`dominant` rendus (le statut est déjà porté par `.status-indicator`). Par ailleurs, tous les badges partageaient la même teinte d'urgence (`--jdr-status-todo`), y compris `PROCHAINE_SEANCE_CONNUE` qui est purement informatif (« séance le 12 août », pas une action) — ajout de `Dashboard.badgeTone()`/`.signal-badge--soon` pour lui donner la teinte `--jdr-status-soon` (« à venir »), cohérente avec `.tile--soon`.
  - Vérifié : suite API complète 53/54 suites, 1061/1062 tests verts (seul échec : `notifications/notifications.integration.spec.ts`, pré-existant/sans rapport — pollution de données de seed sur la base Postgres partagée, aucun fichier touché par cette story n'y est référencé) ; suite web complète 86/86 fichiers, 1186/1186 tests verts ; lint web sur les fichiers touchés par cette story : propre (145 erreurs pré-existantes restantes, toutes hors `dashboard.*`/`parties.service.ts`).
- **Correctifs post-revue (3e passe `/bmad-code-review`, 2026-08-10)** — revue en 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) sur `git diff 411f44b..f0c325c` : 20 findings bruts, 1 decision-needed (résolue par l'utilisateur), 1 patch, 6 differés dans `deferred-work.md`, 12 écartés comme bruit. 2 patches appliqués :
  1. **AC8 tranchée par l'utilisateur : 3 catégories de priorité implémentées littéralement.** `dominantCategory()` (nouveau, `party-signal-priority.ts`) classe chaque signal en `blocking`/`deadline`/`overdue`/`informative`. Contrainte découverte en implémentant : la palette `--jdr-status-*` (Story 29.0) est documentée comme un invariant « complet » à 4 teintes colorimétriquement validées sur les 3 thèmes — ajouter une 5ᵉ teinte l'aurait cassé sans passage par `bmad-ux`. Question reposée à l'utilisateur, réponse : réutiliser les 4 teintes existantes. `blocking` → `todo`, `deadline`/`overdue` → `soon` (partagée, faute de teinte dédiée) — 2 nuances distinguées sur 3, sans improviser de couleur.
  2. **Garde de rôle explicite ajoutée sur les signaux de fin de partie MJ-only** (`party-signals.service.ts`, branche `TERMINEE`) — le comportement observable était déjà correct (protégé implicitement par le scoping des requêtes sur `mjPartieIds`), mais rien n'empêchait une régression silencieuse si ces requêtes étaient un jour élargies. Garde `role === 'mj'` ajoutée par défense en profondeur.
  - Tests ajoutés : `party-signal-priority.spec.ts` (+6, `dominantCategory`), `dashboard.spec.ts` (+1, teinte `soon` pour un signal « en retard »), `party-signals.service.spec.ts` (+1, garde de rôle sous scénario de requêtes élargies simulées).
  - Vérifié : suite API complète 54/54 suites, 1063/1063 tests verts (aucun échec cette fois, contrairement à la flakiness `notifications.integration.spec.ts` notée en 2ᵉ passe) ; suite web complète 86/86 fichiers, 1193/1193 tests verts ; typecheck API propre ; lint web sur les fichiers touchés par cette passe : propre (formatage prettier appliqué après ajout des tests).

### File List

- `apps/api/src/parties/party-signals.service.ts` (nouveau)
- `apps/api/src/parties/party-signals.service.spec.ts` (nouveau)
- `apps/api/src/parties/my-party-signals.controller.ts` (nouveau)
- `apps/api/src/parties/my-party-signals.controller.spec.ts` (nouveau)
- `apps/api/src/parties/parties.module.ts` (modifié — providers/controllers)
- `apps/api/src/parties/parties.service.ts` (modifié — `notifyPartieSignalsChanged()` public, `removeMember()` notifie aussi le MJ)
- `apps/api/src/parties/parties.service.spec.ts` (modifié)
- `apps/api/src/characters/character.service.ts` (modifié — `create()` notifie `PERSONNAGE_A_CREER`)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/src/homme-dragon/homme-dragon.service.ts` (modifié — `create()` notifie `HOMME_DRAGON_A_CREER`)
- `apps/api/src/homme-dragon/homme-dragon.service.spec.ts` (modifié)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `markCourant()`/`close()`/`setCompteRendu()`/`setResumeFin()` notifient)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié)
- `apps/api/src/poll/poll.service.ts` (modifié — `create()`/`castVote()`/`choose()`/`close()` notifient)
- `apps/api/src/poll/poll.service.spec.ts` (modifié)
- `apps/api/src/invitations/invitations.service.ts` (modifié — `accept()` notifie le MJ)
- `apps/api/src/invitations/invitations.service.spec.ts` (modifié)
- `apps/api/src/invitations/invite-links.service.ts` (modifié — `join()` notifie le MJ, type de `consumeLink()` élargi)
- `apps/api/src/invitations/invite-links.service.spec.ts` (modifié)
- `packages/shared/src/index.ts` (modifié — `PartySignalCode`, `PartySignalsDto`)
- `apps/web/src/app/core/parties/party-signals.service.ts` (nouveau)
- `apps/web/src/app/core/parties/party-signals.service.spec.ts` (nouveau)
- `apps/web/src/app/core/parties/party-signal-priority.ts` (nouveau)
- `apps/web/src/app/core/parties/party-signal-priority.spec.ts` (nouveau)
- `apps/web/src/app/core/realtime/realtime.service.ts` (modifié — entrée `user:` pour `PartySignalsService`)
- `apps/web/src/app/core/realtime/realtime.service.spec.ts` (modifié)
- `apps/web/src/app/features/dashboard/dashboard.ts` (modifié — badges, teinte, 4 intertitres)
- `apps/web/src/app/features/dashboard/dashboard.html` (modifié — restructuré en 4 sections + patron de tuile partagé)
- `apps/web/src/app/features/dashboard/dashboard.scss` (modifié — `.tile--awaiting`, `.signal-badge*`)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (modifié)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 10 clés de signal + compteur + 4 intertitres, ×3 thèmes)
