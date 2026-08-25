---
baseline_commit: 8c33120
---

# Story 8.2: Séances multiples et sélection de date via vote existant

Status: done

## Story

As a MJ,
I want ajouter une ou plusieurs séances à un scénario et réutiliser le vote de date existant en linéaire/one-shot,
so that je planifie une campagne qui dépasse une soirée sans réinventer la sélection de date.

## Acceptance Criteria

1. **Given** un scénario existant **When** le MJ appelle `POST /scenarios/:id/seances` **Then** une `Seance` est créée, rattachée au scénario (`scenarioId`), sans plafond sur le nombre total de séances déjà existantes — aucune validation de `dureeSeances` n'est appliquée (le champ reste indicatif, cf. `[ASSUMPTION]`).
2. **Given** une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` **When** le MJ lie un `SessionPoll` existant (créé via l'endpoint de vote déjà livré, Epics 1-3) à une `Seance` via `PATCH /scenarios/seances/:id/poll` **Then** `Seance.pollId` est renseigné (relation 1:1 déjà `@@unique` en base) — le `SessionPoll`/`PollOption`/vote lui-même n'est ni recréé ni modifié par cet appel, seule la relation est posée.
3. **Given** le vote de date existant lié à une `Seance` **When** des joueurs votent via `PollService.castVote` (inchangé) **Then** le comportement déjà livré (Epics 1-3) ne régresse pas — aucun nouveau comportement introduit sur `PollService`/`PollController`, aucune de leurs méthodes n'est modifiée par cette story.
4. **Given** une Partie `CAMPAGNE_EPISODIQUE` **When** le MJ tente `PATCH /scenarios/seances/:id/poll` sur une `Seance` de cette Partie **Then** la requête échoue en `400 Bad Request` — une `Seance` épisodique ne porte **jamais** de relation vers `SessionPoll` (couverte par la Story 8.3 : `Inscription`/`inscriptionMin`/`inscriptionMax` à la place). La création de la `Seance` elle-même (AC1) n'est, elle, pas bloquée par le `kind` — seule la liaison à un poll l'est.
5. **Given** une `Seance` dont le `SessionPoll` lié est encore `OPEN` (vote non tranché, `dateValidee` absente — cf. `[ASSUMPTION]` sur la notion de "séance courante pour le vote") **When** un joueur consulte le scénario correspondant via `ScenarioReadDialog` **Then** la section de vote (réutilisation de `PollResponseComponent`) reste visible et fonctionnelle même si `isRestricted()` masque la description/durée/résumé du scénario (anti-spoil, Story 7.5) — même principe de placement que la section `participants` (Story 8.1), hors du bloc conditionnel anti-spoil.
6. **Given** un scénario dont la durée estimée (`dureeSeances`) dépasse une soirée **When** le MJ consulte sa fiche (`ScenarioEditor`) **Then** un bouton « Ajouter une séance » crée une nouvelle `Seance` rattachée (AC1) ; la sélection de date qui en découle réutilise tel quel `PollCreationComponent`/`PollStatusPanel` (Epics 1-3, aucune modification) — seule la liste des séances d'un scénario (nouveau composant `SeanceList`) est un affichage nouveau. Le bouton est visible indépendamment de `dureeSeances` (cf. `[ASSUMPTION]` — epics.md ne définit aucun seuil numérique vérifiable).
7. **Given** un scénario **When** n'importe quel membre de la Partie consulte `GET /parties/:id/scenarios` (ou toute autre route retournant un `ScenarioDto`) **Then** `ScenarioDto.seances: SeanceDto[]` est **toujours présent** (jamais `undefined`, potentiellement vide) et chaque `SeanceDto` porte `poll?: SessionPollDto` peuplé si `pollId` est renseigné (options + votes inclus, même forme que `GET /parties/:id/poll`).
8. **Given** un utilisateur non-MJ de la Partie **When** il appelle `POST /scenarios/:id/seances` ou `PATCH /scenarios/seances/:id/poll` **Then** la requête échoue en `403 Forbidden` (`PartiesService.getOwned` — actions MJ-only, contrairement à `participate`/AD-9 qui est joueur).

*(Source: epics.md Story 8.2, 6 ACs reformulées en Given/When/Then et complétées de 2 ACs (AC7 forme exacte de `ScenarioDto.seances`/`SeanceDto.poll`, AC8 rejet 403 non-MJ) — même méthode que Stories 8.1/7.6/7.7, pour couvrir explicitement des points d'entrée backend absents du texte epics.md d'origine.)*

## Tasks / Subtasks

- [x] **Task 1 — `packages/shared/src/index.ts` : `SeanceDto` + `ScenarioDto.seances`** (AC7)
  - [x] Ajouter `export interface SeanceDto { id: string; scenarioId: string; poll?: SessionPollDto; compteRendu: string | null; createdAt: string; }` juste après `ScenarioDto` — pas de champ `inscription` (Story 8.3, hors scope ici).
  - [x] Modifier `ScenarioDto` : ajouter `seances: SeanceDto[];` (juste après `closedAt`, avant `participants`) — **non optionnel**, conforme à `ARCHITECTURE-SPINE.md` (`export interface SeanceDto { id, scenarioId, poll?: SessionPollDto, ... }` / `seances: SeanceDto[]` sur `ScenarioDto`, ligne ~311-326). Contrairement à `participants` (optionnel, épisodique uniquement), `seances` est toujours un tableau (potentiellement vide) quel que soit le `kind`.
  - [x] Pas de nouveau DTO de création avec des champs — `POST /scenarios/:id/seances` n'a pas de corps (même pattern que `open`/`markCourant`/`close`, pas de `CreateSeanceDto` avec des propriétés). Ajouter `export interface LinkSeancePollDto { pollId: string; }` pour `PATCH /scenarios/seances/:id/poll`.

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.service.ts` : `addSeance()` + `linkSeancePoll()` + `seances` sur tous les DTO** (AC1, AC2, AC4, AC5, AC7, AC8)
  - [x] `async addSeance(scenarioId: string, mjId: string): Promise<ScenarioDto>` :
    - `findUnique` par `id` → `NotFoundException('Scénario introuvable')` si absent.
    - `const partie = await this.parties.getOwned(scenario.partieId, mjId);` (403 non-MJ, AC8 — **`getOwned`**, pas `getViewable` : contrairement à `participate` (AD-9, action joueur), ajouter une séance est une action MJ, cohérent avec `create()`/`update()`/`open()`/`markCourant()`/`close()` qui utilisent tous `getOwned`).
    - `await this.prisma.seance.create({ data: { scenarioId } });` (AC1, aucune validation de plafond).
    - `const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });`
    - `return toEnrichedDto(this.prisma, updated, partie.kind);`
  - [x] `async linkSeancePoll(seanceId: string, mjId: string, pollId: string): Promise<ScenarioDto>` (AC2, AC4, AC8) :
    - `const seance = await this.prisma.seance.findUnique({ where: { id: seanceId } });` → `NotFoundException('Séance introuvable')` si absent.
    - `const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });`
    - `const partie = await this.parties.getOwned(scenario.partieId, mjId);` (403 non-MJ, AC8).
    - `if (partie.kind === 'CAMPAGNE_EPISODIQUE') throw new BadRequestException('Une séance de campagne épisodique ne peut jamais être liée à un vote de date — utilisez l’inscription à capacité limitée');` (AC4, guillemets français cohérents avec le fichier, message avec apostrophe → guillemets doubles).
    - `const poll = await this.prisma.sessionPoll.findUnique({ where: { id: pollId } });` → `if (!poll || poll.partieId !== scenario.partieId) throw new BadRequestException('Ce vote de date n’appartient pas à cette Partie');` (défense en profondeur — évite qu'un MJ lie le poll d'une autre Partie par erreur/malveillance).
    - `await this.prisma.seance.update({ where: { id: seanceId }, data: { pollId } });` — la contrainte `@@unique` sur `Seance.pollId` empêche déjà qu'un même poll soit lié à deux séances (erreur Prisma `P2002` propagée en 500 si violée — cas non demandé par les ACs, acceptable tel quel, cf. Hors scope).
    - `const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } });`
    - `return toEnrichedDto(this.prisma, updated, partie.kind);`
  - [x] Nouvelle fonction module-level `async function loadSeances(prisma: PrismaService, scenarioId: string): Promise<SeanceDto[]>` :
    - `prisma.seance.findMany({ where: { scenarioId }, orderBy: { createdAt: 'asc' }, include: { poll: { include: { options: { include: { votes: { include: { user: { select: { pseudo: true } } } } } } } } } })`.
    - Mapper chaque `Seance` en `SeanceDto`, avec `poll: seance.poll ? toSessionPollDto(seance.poll) : undefined`.
  - [x] Nouvelle fonction module-level `function toSessionPollDto(poll: any): SessionPollDto` — **mapping dupliqué à l'identique** de la fonction privée `toDto()` de `apps/api/src/poll/poll.service.ts:173-193` (même structure exacte : `id, partieId, status, scenarioRef, expiresAt, chosenDate, chosenSlot, options[{id,date,slot,votes[{userId,pseudo,answer}]}]`). **Ne pas importer/exporter depuis `poll.service.ts`** — celui-ci reste non modifié (AC3, epics.md « réutilisé sans modification »), même précédent que la duplication d'`extractErrorMessage` en Story 8.1 (YAGNI, un seul point de réutilisation supplémentaire ne justifie pas un utilitaire partagé).
  - [x] Étendre `toDto()` : nouveau paramètre `seances?: SeanceDto[]`, ajoute `seances: seances ?? []` **toujours** au retour (non conditionnel, contrairement à `participants` — AC7).
  - [x] Étendre `toEnrichedDto()` : appelle désormais **systématiquement** `loadSeances(prisma, scenario.id)` en plus de `loadParticipants` (si épisodique) — devient le point unique qui peuple `seances` pour toutes les transitions d'état (`update`/`open`/`markCourant`/`close`/`addSeance`/`linkSeancePoll`).
  - [x] `create()` : n'a pas besoin de `seances` peuplé de façon riche (un scénario tout juste créé n'a aucune séance) mais **doit quand même respecter le contrat non-optionnel** — soit appeler `toDto(scenario, undefined, undefined, [])`, soit basculer `create()` sur `toEnrichedDto()` comme les autres méthodes de transition (plus simple et cohérent, `seances` sera `[]` de toute façon car aucune requête Prisma `seance.findMany` ne trouvera de résultat pour un scénario neuf) — **choisir cette seconde option** pour n'avoir qu'un seul chemin de sérialisation à maintenir.
  - [x] `participate()` : actuellement retourne `toDto(updated, partie.kind, await loadParticipants(...))` — étendre pour aussi charger `seances` (soit via `toEnrichedDto` si la signature le permet en réutilisant le `participants` déjà chargé, soit en dupliquant l'appel à `loadSeances`). **Vérifier que `seances` n'est jamais `undefined` sur le DTO retourné par `participate()`**, testé explicitement (cf. Task 2, tests).
  - [x] `listDrafts()`/`findAllForPartie()` : **éviter le N+1** — même stratégie de batching que `participants` (Story 8.1, `findAllForPartie`) : une requête groupée `prisma.seance.findMany({ where: { scenarioId: { in: scenarios.map(s => s.id) } }, include: { poll: {...} } })`, regroupée en `Map<scenarioId, SeanceDto[]>` côté JS, puis `toDto(s, partie.kind, participantsForS, seancesForS)`.
  - [x] `scenarios.service.spec.ts` : nouveaux `describe('addSeance()')` (création réussie, `seance.create` appelé avec le bon `scenarioId`, aucun plafond vérifié en créant 3+ séances dans un test, `ForbiddenException` propagée par `getOwned` si non-MJ) et `describe('linkSeancePoll()')` (liaison réussie linéaire/one-shot ; `BadRequestException` si `CAMPAGNE_EPISODIQUE` ; `BadRequestException` si le poll n'appartient pas à la même Partie ; `NotFoundException` si séance/scénario introuvable ; `ForbiddenException` si non-MJ). Étendre les tests existants (`create`/`update`/`open`/`markCourant`/`close`/`participate`/`findAllForPartie`/`listDrafts`) pour vérifier que `seances` est toujours un tableau (jamais `undefined`) sur le DTO retourné, avec au moins un cas peuplé (séance + poll liés) pour verrouiller la forme exacte de `SeanceDto.poll`.

- [x] **Task 3 — `apps/api/src/scenarios/scenarios.controller.ts` : routes `seances`** (AC1, AC2, AC4, AC7, AC8)
  - [x] `@Post('scenarios/:id/seances') addSeance(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser) { return this.scenarios.addSeance(scenarioId, user.id); }` — même pattern sans corps que `open()`/`markCourant()`/`close()`.
  - [x] `@Patch('scenarios/seances/:id/poll') linkSeancePoll(@Param('id', ParseUUIDPipe) seanceId: string, @CurrentUser() user: AuthUser, @Body() dto: LinkSeancePollDto) { return this.scenarios.linkSeancePoll(seanceId, user.id, dto.pollId); }` — nouveau DTO côté API (`apps/api/src/scenarios/dto/link-seance-poll.dto.ts`, `class LinkSeancePollDto { @IsUUID() pollId!: string; }`, même style `class-validator` que `create-scenario.dto.ts`/`update-scenario.dto.ts`).
  - [x] `scenarios.controller.spec.ts` : ajouter `addSeance: jest.fn()`/`linkSeancePoll: jest.fn()` à `makeScenariosService()`, deux tests de routage standard.

- [x] **Task 4 — `apps/web/src/app/core/scenarios/scenarios.service.ts` : `addSeance()` + `linkSeancePoll()`** (AC1, AC2, AC6)
  - [x] `async addSeance(scenarioId: string): Promise<ScenarioDto>` — copie exacte du pattern `markCourant()`/`close()` : `POST ${API_BASE}/scenarios/${scenarioId}/seances` (corps vide), `this._changed.update((v) => v + 1)`.
  - [x] `async linkSeancePoll(seanceId: string, pollId: string): Promise<ScenarioDto>` — `PATCH ${API_BASE}/scenarios/seances/${seanceId}/poll` avec `{ pollId } satisfies LinkSeancePollDto`, `this._changed.update((v) => v + 1)`.
  - [x] `scenarios.service.spec.ts` : deux tests supplémentaires, même pattern `HttpTestingController` que les mutations existantes.

- [x] **Task 5 — Nouveau composant `SeanceList`** (AC5, AC6 — seul affichage réellement nouveau, epics.md)
  - [x] `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` : `readonly scenario = input.required<ScenarioDto>(); readonly partieId = input.required<string>(); readonly isMj = input(false); readonly members = input<PartieMemberDto[]>([]);` + `readonly seanceLinked = output<ScenarioDto>();` (remonte le `ScenarioDto` mis à jour après `linkSeancePoll`, même mécanisme que `participate`/Story 8.1 — le parent réassigne son signal `scenario`).
    - Pour chaque `seance of scenario().seances` :
      - Si `isMj()` et `!seance.poll` : afficher `<app-poll-creation [partieId]="partieId()" (created)="onPollCreated(seance.id, $event)" />` (réutilisation stricte, aucune prop custom) ; `onPollCreated(seanceId, poll)` appelle `scenariosService.linkSeancePoll(seanceId, poll.id)` puis émet `seanceLinked`.
      - Si `seance.poll` et `isMj()` : `<app-poll-status [poll]="seance.poll" [members]="members()" (chosen)="onChoose(seance.poll.id, $event)" />` (`onChoose` appelle `pollService.choose(partieId(), pollId, { optionId })` — `PollService` déjà injecté/existant, aucune modification) + bouton d'annulation (`pollService.close`), même pattern que `calendar-view.ts:54-57`.
      - Si `seance.poll` et `!isMj()` : `<app-poll-response [partieId]="partieId()" [poll]="seance.poll" (responded)="onPollResponded($event)" />` (AC5 — reste rendu même si le scénario parent est en mode anti-spoil restreint, car placé hors du bloc `isRestricted()` par l'appelant, cf. Task 7).
      - Si épisodique (`isMj()` MJ voit `!seance.poll` mais `partieKind === 'CAMPAGNE_EPISODIQUE'`) : ne pas afficher `<app-poll-creation>` (AC4 — cette story ne câble la liaison poll que pour linéaire/one-shot ; l'UI épisodique d'inscription est Story 8.3, hors scope, cf. Hors scope).
    - `seance-list.html`/`.scss`/`.spec.ts` — tests : rendu MJ sans poll (bouton lancer vote visible via `app-poll-creation`), rendu MJ avec poll (`app-poll-status` + `members`), rendu joueur avec poll (`app-poll-response`), rendu joueur sans poll (rien), épisodique (jamais de `app-poll-creation`/`app-poll-status`/`app-poll-response` — aucun de ces composants ne doit apparaître pour ce `kind`, cf. `[ASSUMPTION]`).
  - [x] `partieKind` déjà transmis à `ScenarioReadDialog`/`ScenarioTimeline` (Story 8.1) — `SeanceList` peut dériver l'exclusion épisodique en recevant `partieKind` en input plutôt que de le déduire de `scenario().participants !== undefined` (plus explicite, éviter la même heuristique fragile déjà notée dans `ScenarioEditor` comme acceptable mais qu'il vaut mieux ne pas dupliquer une troisième fois) — **`[ASSUMPTION]`**, ajouter `readonly partieKind = input.required<PartieKind>();`.

- [x] **Task 6 — `ScenarioEditor` : bouton « Ajouter une séance » + `SeanceList` MJ** (AC6, AC8)
  - [x] `scenario-editor.ts` : `ngOnInit` charge aussi `this.members.set(await this.partiesService.members(this.scenarioInput().partieId));` (`PartiesService` déjà existant côté web, `members()` déjà utilisé ailleurs — cf. `apps/web/src/app/core/parties/parties.service.ts:73`) — **fetch auto-contenu dans `ngOnInit`**, même pattern déjà établi ici pour `characters` (pas de threading depuis un parent, `ScenarioEditor` est utilisé depuis deux points d'entrée différents — `scenario-detail`/`scenario-one-shot-tab` — donc un fetch local est plus robuste qu'un threading dupliqué deux fois).
  - [x] Ajouter `protected async addSeance(): Promise<void> { this.addSeanceError.set(null); try { this.scenario.set(await this.scenarios.addSeance(this.scenario()!.id)); } catch (err) { this.addSeanceError.set(extractErrorMessage(err, 'Impossible d’ajouter une séance.')); } }` + signal `addSeanceError`.
  - [x] `scenario-editor.html` : nouveau bouton `<button mat-button type="button" (click)="addSeance()">Ajouter une séance</button>` (visible en permanence, pas de garde sur `dureeSeances` — cf. `[ASSUMPTION]` AC6) + `@if (addSeanceError())` + `<app-seance-list [scenario]="s" [partieId]="s.partieId" [partieKind]="isEpisodique() ? 'CAMPAGNE_EPISODIQUE' : ...">` — **note** : `ScenarioEditor` ne connaît le `kind` que via l'heuristique `isEpisodique()` existante (présence de `participants`) ; pour `SeanceList.partieKind` (`ONE_SHOT` vs `CAMPAGNE_LINEAIRE` vs `CAMPAGNE_EPISODIQUE`), cette page n'a **pas** le `kind` exact aujourd'hui (seulement le booléen dérivé) — soit élargir `ScenarioDto`/threading pour exposer le vrai `kind` sur le DTO (hors scope si non requis par une AC), soit adapter `SeanceList` pour accepter un simple booléen `isEpisodique` au lieu de `partieKind` complet. **Choisir la seconde option** (plus simple, cohérent avec ce que `ScenarioEditor` sait déjà) — remplacer `partieKind` par `readonly isEpisodique = input.required<boolean>();` dans `SeanceList` (Task 5 à ajuster en conséquence).
  - [x] `scenario-editor.spec.ts` : tests pour le bouton (clic → `scenarios.addSeance` appelé, signal réassigné), affichage de `SeanceList` avec les bonnes props.

- [x] **Task 7 — `ScenarioReadDialog` : vote reachable même masqué** (AC5)
  - [x] `scenario-read-dialog.html` : ajouter, **hors du bloc `@if (isRestricted())`** (au même niveau que la section `participants`, elle-même déjà hors de ce bloc), une section affichant `<app-seance-list [scenario]="scenario()" [partieId]="scenario().partieId" [isMj]="false" [isEpisodique]="isEpisodique()" />` — visible même si `isRestricted()` est vrai (A_VENIR/BROUILLON), garantissant AC5.
  - [x] `scenario-read-dialog.spec.ts` : test explicite — scénario `A_VENIR` (`isRestricted() === true`) avec une séance liée à un poll `OPEN` → `app-poll-response` (via `SeanceList`) reste rendu dans le DOM malgré la description/durée masquées.

### Review Findings

Revue adversariale à 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée sur le diff complet (23 fichiers, 983 lignes) avec la story elle-même comme contexte spec.

**Acceptance Auditor** : les 8 AC et toutes les décisions architecturales (AD-4, P2-AD-2, P1-AD-3, choix `isEpisodique: boolean`) passent sans déviation — confirmé que `apps/api/src/poll/*`/`apps/web/.../poll/*` sont strictement inchangés (`git diff` vide sur ces chemins), que `scenarios.module.ts` n'importe pas `PollModule`, et que tous les chemins de sérialisation (`create`/`update`/`open`/`markCourant`/`close`/`participate`/`addSeance`/`linkSeancePoll`/`listDrafts`/`findAllForPartie`) peuplent `seances` de façon non-optionnelle.

**Blind Hunter + Edge Case Hunter** (convergents) : 3 gardes manquantes identifiées, aucune requise explicitement par les AC mais jugées correctives :
- **Patché** — `SeanceList.onPollCreated()` n'avait aucune garde anti-double-clic (contrairement à `onChoose`/`onClosePoll` dans le même fichier, qui vérifient `pollActionPending()`). Un double-clic envoyait deux `linkSeancePoll()` pour la même séance, le second échouant sur la contrainte `@@unique` de `Seance.pollId` en 500 non géré. Fix : même garde `pollActionPending` ajoutée à `onPollCreated`.
- **Patché** — `linkSeancePoll()` ne vérifiait pas si la `Seance` avait déjà un `pollId` avant d'écraser silencieusement la liaison (orphelinant l'ancien poll sans confirmation). Fix : `if (seance.pollId) throw new BadRequestException(...)`.
- **Patché** — `linkSeancePoll()` ne vérifiait pas `poll.status` avant liaison — un poll déjà `CLOSED`/tranché pouvait être lié, présentant aux joueurs un vote mort comme actif. Fix : `if (poll.status !== 'OPEN') throw new BadRequestException(...)`.

**Différé** (hors scope des AC, edge case à faible risque réel) : `addSeance()` n'a pas de garde sur `scenario.status === 'PASSE'` — une séance peut être ajoutée à un scénario déjà clôturé. Non exigé par AC1, risque pratique faible (action MJ volontaire sur son propre scénario clôturé). Loggé dans `deferred-work.md` si jugé nécessaire ultérieurement.

Tests ajoutés pour verrouiller les 3 correctifs : 2 tests backend (`scenarios.service.spec.ts` — « séance déjà liée », « poll non OPEN ») + 1 test frontend (`seance-list.spec.ts` — anti double-clic). Suite finale : 29 suites/535 tests API (+2), 63 suites/569 tests web (+1), `pnpm typecheck` propre, 0 régression.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-4 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > `Seance` porte une relation optionnelle vers `SessionPoll` (existant, `ONE_SHOT`/`CAMPAGNE_LINEAIRE`) **ou** vers `Inscription[]` (nouveau, `CAMPAGNE_EPISODIQUE`) — jamais les deux peuplés simultanément sur la même séance ; lequel s'applique est déterminé par `Partie.kind`, pas par un champ de choix sur `Seance` lui-même.

  Conséquence directe : `linkSeancePoll()` doit rejeter tout `CAMPAGNE_EPISODIQUE` (AC4) — c'est la **seule** garde nécessaire, `Inscription`/`inscriptionMin`/`inscriptionMax` restent entièrement hors scope de cette story (Story 8.3).

- **P2-AD-2 (héritée, rappel)** :
  > `PollModule`/`SessionPoll` reste le mécanisme de vote de date pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE` — jamais réimplémenté ni étendu pour l'épisodique.

  Conséquence : **aucune ligne de `apps/api/src/poll/poll.service.ts`/`poll.controller.ts`/`apps/web/.../poll/*` n'est modifiée par cette story.** `ScenariosService` lit `SessionPoll`/`PollOption`/`PollVote` directement via Prisma (accès en lecture pour construire `SeanceDto.poll`, ce qui reste conforme à AD-1 — `ScenariosModule` est propriétaire de `Scenario`/`Seance`, pas interdit de lire une table possédée par un autre module pour l'embarquer dans sa propre réponse) et duplique un petit mapper de présentation (`toSessionPollDto`, cf. Task 2) plutôt que d'importer/exporter quoi que ce soit depuis `PollModule` — zéro dépendance nouvelle entre les deux modules, `ScenariosModule` n'importe pas `PollModule` dans `scenarios.module.ts`.

- **P1-AD-3 (rappel, hérité)** : `PartiesService.getOwned`/`getViewable` reste le seul point de vérité d'appartenance/rôle. `addSeance()`/`linkSeancePoll()` utilisent **`getOwned`** (action MJ, comme `create`/`update`/`open`/`markCourant`/`close` — **pas** `getViewable`/AD-9, qui ne s'applique qu'aux actions joueur comme `participate`).

- **`[ASSUMPTION]` — notion de « séance courante pour le vote » (AC5)** : `Seance` n'a **aucun champ `status`** dans le schéma (contrairement à `Scenario.status`) — seulement `pollId`, `inscriptionMin/Max`, `dateValidee`, `compteRendu`, `createdAt`. Le texte epics.md parle d'une « Seance au statut À venir (pas la séance courante d'un scénario multi-séances) » sans qu'aucun champ ne porte ce statut. Cette story n'invente **pas** de nouvel enum/champ (aucune AC ne le demande explicitement, et EXPERIENCE.md n'est pas cité à ce sujet dans epics.md) : `SeanceList` affiche simplement, pour **chaque** `Seance` de la liste, sa section de vote si `seance.poll` existe — peu importe l'ordre/le rang de la séance. La contrainte réelle qui limite à *une* séance en vote actif à la fois vient de `P2-AD-4` (un seul `SessionPoll` `OPEN` par Partie, déjà appliqué par `PollService.create()` existant, non modifié) — pas d'une notion de statut sur `Seance` elle-même. Si un futur retour utilisateur montre que plusieurs séances de la même Partie affichent chacune un poll `CLOSED` différent et prête à confusion, un champ de statut explicite serait à ajouter dans une story ultérieure — hors scope ici.

- **`[ASSUMPTION]` — pas de seuil numérique sur le bouton « Ajouter une séance » (AC6)** : epics.md dit « un scénario dont la durée estimée dépasse une soirée » sans préciser de comparaison exploitable (`dureeSeances > 1` ? `dureeHeures > 4` ?) ni qui la calcule. Le bouton est affiché **inconditionnellement** dans `ScenarioEditor` (MJ) — c'est au MJ de juger si son scénario nécessite plusieurs séances, cohérent avec le fait qu'`aucun plafond n'existe sur le nombre total de séances` (AC1, dit explicitement par epics.md) : il n'y a donc aucune raison de bloquer le bouton pour un scénario "court", le MJ reste seul juge. Documenté ici plutôt que devinée silencieusement en implémentation.

- **`[ASSUMPTION]` — mécanisme de liaison `Seance` ↔ `SessionPoll` (AC2)** : epics.md ne précise pas *comment* la relation `Seance.pollId` est posée (le champ existe déjà en base depuis la migration `scenarios_seances_p4`, mais aucun code ne l'écrit avant cette story). Cette story introduit un endpoint dédié (`PATCH /scenarios/seances/:id/poll`) plutôt que d'étendre `CreatePollDto`/`PollService.create()` avec un `seanceId` optionnel — choix qui **préserve strictement** `PollModule` intact (P2-AD-2, epics.md « réutilisé sans modification ») : le flux frontend est « créer le poll via `PollCreationComponent` existant (inchangé) → recevoir le `SessionPollDto` créé → appeler `linkSeancePoll` avec son `id` » plutôt que de faire porter la logique de liaison par `PollService` lui-même.

- **`[ASSUMPTION]` — `SeanceList.isEpisodique` en booléen plutôt que `partieKind` complet (Task 6)** : `ScenarioEditor` ne reçoit aujourd'hui que le `ScenarioDto` (dont la présence de `participants` sert d'heuristique de `kind` épisodique, cf. Story 8.1 `isEpisodique` existant) — pas le `PartieKind` littéral. Plutôt que d'élargir `ScenarioDto`/le threading pour exposer le `kind` exact à ce composant (non requis par une AC de cette story), `SeanceList` reçoit un booléen `isEpisodique` dérivé par l'appelant, cohérent avec ce que chaque page appelante sait déjà (`ScenarioEditor.isEpisodique()`, `ScenarioReadDialog.isEpisodique()`, tous deux déjà présents depuis Story 8.1).

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/poll/poll.service.ts`** (lu intégralement, **non modifié**) — `create()`/`castVote()`/`choose()`/`close()` restent le seul mécanisme d'écriture sur `SessionPoll`/`PollOption`/`PollVote` ; `toDto()` privé (lignes 173-193) est le modèle exact à dupliquer pour `toSessionPollDto()` côté `ScenariosService`. `POLL_INCLUDE` (lignes 13-17) est le modèle d'`include` Prisma à répliquer pour `loadSeances()`.

**`apps/api/src/poll/poll.controller.ts`** (lu intégralement, **non modifié**) — routes `/parties/:id/poll[/...]` existantes, aucune nouvelle route ajoutée ici ; les nouvelles routes de liaison vivent exclusivement dans `scenarios.controller.ts` (`AD-1`, `ScenariosModule` propriétaire de `Seance`).

**`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`+`.html`** (lu intégralement) — pattern exact à répliquer dans `SeanceList` :
```html
<!-- MJ, sans poll -->
<button mat-flat-button color="primary" (click)="openPollPanel()">Lancer le vote</button>
<!-- MJ, avec poll -->
<app-poll-status [poll]="activePoll()!" [members]="members()" [busy]="pollActionPending()" (chosen)="onChooseDate($event)" />
<!-- MJ, panneau de création (overlay) -->
<app-poll-creation [partieId]="partieId()!" [preselectedSlots]="mjSlots()" (created)="onPollCreated($event)" (cancelled)="closePollPanel()" />
<!-- Joueur, avec poll -->
<app-poll-response [partieId]="partieId()!" [poll]="activePoll()!" (responded)="onPollResponded($event)" />
```
`SeanceList` n'a pas besoin de `preselectedSlots`/`AvailableSlotDto` (non demandé par les ACs, complexité `AvailabilityModule` hors scope) — `<app-poll-creation [partieId]="partieId()" (created)="..." (cancelled)="...">` peut recevoir `preselectedSlots` vide (input déjà optionnel, `input<AvailableSlotDto[]>([])`).

**`apps/web/src/app/core/parties/parties.service.ts:73`** — `members(partieId: string): Promise<PartieMemberDto[]>` déjà existant, à appeler depuis `ScenarioEditor.ngOnInit()` (pattern de fetch auto-contenu déjà établi dans ce même fichier pour `characters`, cf. lignes 95-101 du fichier actuel).

**`apps/api/src/scenarios/scenarios.service.ts`** (lu intégralement) — `toDto()`/`toEnrichedDto()`/`loadParticipants()` (Story 8.1, lignes 385-427) sont le squelette exact à étendre pour `seances` ; `findAllForPartie()` (lignes 193-216) est le modèle de batching à répliquer pour éviter le N+1 sur `Seance`.

### Hors scope explicite de cette story (ne pas implémenter)

- `Inscription`/`inscriptionMin`/`inscriptionMax`, capacité limitée, verrou `SELECT ... FOR UPDATE` — Story 8.3 entièrement.
- Tout champ de statut explicite sur `Seance` (`À venir`/`Courant`/etc.) — cf. `[ASSUMPTION]` ci-dessus, non demandé par les ACs de cette story.
- Toute modification de `PollService`/`PollController`/`apps/web/.../poll/*` — réutilisation strictement en lecture/appel, jamais en modification (P2-AD-2, epics.md).
- `compteRendu` (champ déjà présent en base sur `Seance`, exposé en lecture seule sur `SeanceDto` par cette story mais jamais écrit) — Story 8.4.
- Suppression d'une `Seance` ou d'une liaison `pollId` déjà posée — non demandé par les ACs epics.md, aucune UI/endpoint de retrait dans cette story.
- Validation d'un seuil numérique conditionnant l'affichage du bouton « Ajouter une séance » — cf. `[ASSUMPTION]` AC6, bouton toujours visible.

### Project Structure Notes

- Aucune migration Prisma — `Seance`/`SessionPoll` et leur relation (`Seance.pollId` unique, `SessionPoll.seance` back-relation) existent déjà (migration `scenarios_seances_p4`, confirmé par lecture directe de `schema.prisma:403-416,183-199`).
- Nouveaux fichiers backend : `apps/api/src/scenarios/dto/link-seance-poll.dto.ts` uniquement — pas de `create-seance.dto.ts` avec des propriétés (corps vide, aucun DTO de validation nécessaire pour `POST /scenarios/:id/seances`, même pattern que `open`/`markCourant`/`close`).
- Nouveau fichier frontend : `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (+ `.html`, `.scss`, `.spec.ts`) — seul nouveau composant Angular de cette story, consommé par `ScenarioEditor` (MJ) et `ScenarioReadDialog` (joueur), aucune duplication de logique de vote (délègue entièrement à `PollCreationComponent`/`PollStatusPanel`/`PollResponseComponent` existants).
- `ScenariosModule` (`scenarios.module.ts`) reste inchangé (`imports: [PartiesModule]`) — pas d'ajout de `PollModule` (cf. `[ASSUMPTION]`/AD ci-dessus, accès Prisma direct en lecture seule pour `SeanceDto.poll`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.2] — texte d'origine de la story et 6 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-4, #P2-AD-2, #P1-AD-3] — deux mécanismes de date jamais fusionnés, `PollModule` jamais réimplémenté/étendu, `PartiesService` seul point de vérité.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md] lignes ~306-330 — forme exacte de `SeanceDto`/`ScenarioDto.seances` attendue par le spine.
- [Source: apps/api/prisma/schema.prisma:183-199,403-416] — `SessionPoll`, `PollOption`, `PollVote`, `Seance` déjà présents, relation `Seance.pollId` (`@unique`) déjà en place, aucune migration requise.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `create()`/`update()`/`open()`/`markCourant()`/`close()`/`participate()`/`findAllForPartie()`/`listDrafts()`/`toDto()`/`toEnrichedDto()`/`loadParticipants()` lus intégralement ; patron à étendre pour `addSeance()`/`linkSeancePoll()`/`loadSeances()`/`toSessionPollDto()`.
- [Source: apps/api/src/scenarios/scenarios.controller.ts] — pattern de routes `@Post`/`@Patch` sans et avec corps, à répliquer pour `seances`/`seances/:id/poll`.
- [Source: apps/api/src/poll/poll.service.ts, poll.controller.ts] — lus intégralement, **non modifiés** ; `toDto()` privé (poll.service.ts:173-193) dupliqué à l'identique dans `scenarios.service.ts` (`toSessionPollDto`).
- [Source: apps/api/src/poll/poll.module.ts] — confirmé que `PollModule` n'est importé nulle part par `ScenariosModule` ; ce choix est délibéré (cf. Dev Notes).
- [Source: packages/shared/src/index.ts:98-364] — sections "Palier 4 (suite) : Scénarios" et "Palier 2 : Calendrier de disponibilités" (`SessionPollDto`/`PollOptionDto`/`PollVoteDto`/`DaySlot` déjà existants, réutilisés tels quels dans `SeanceDto.poll`).
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `markCourant()`/`close()`/`participate()`/`_changed.update` à répliquer pour `addSeance`/`linkSeancePoll`.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts, .html] — lus intégralement ; pattern exact MJ (`app-poll-creation`/`app-poll-status`) et joueur (`app-poll-response`) à répliquer dans `SeanceList`, seule référence existante d'intégration de ces trois composants dans une page hôte.
- [Source: apps/web/src/app/features/poll/poll-creation/poll-creation.ts, poll-status/poll-status.ts, poll-response/poll-response.ts] — lus intégralement ; tous trois **inchangés**, consommés tels quels par `SeanceList` (inputs `partieId`/`poll`/`members`/`preselectedSlots`, outputs `created`/`chosen`/`responded`).
- [Source: apps/web/src/app/core/parties/parties.service.ts:73] — `members(partieId)` déjà existant, réutilisé pour peupler `PartieMemberDto[]` côté `ScenarioEditor`.
- [Source: apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, .html] — lus intégralement ; `ngOnInit` (fetch auto-contenu `characters`), `markCourant()`/`close()` (pattern signal réassigné + `extractErrorMessage`) répliqués pour `addSeance()`.
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts, .html] — lus intégralement ; placement de la section `participants` **hors** du bloc `isRestricted()` est le précédent architectural direct pour placer `SeanceList`/le vote au même niveau (AC5).
- [Source: 8-1-participation-scenarios.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, pattern de batching pour éviter le N+1 (`findAllForPartie`), duplication ciblée de petites fonctions plutôt que nouvel utilitaire partagé (YAGNI), `pnpm typecheck` (`apps/api`, `tsc --noEmit -p tsconfig.build.json`) à lancer après implémentation car `ts-jest` ne type-check pas complètement (`isolatedModules`) — **rappel explicite pour cette story**, vu l'ampleur des changements de signature (`toDto`/`toEnrichedDto` avec un paramètre supplémentaire partout).
- [Source: 7-6-passer-scenario-courant.md, 7-7-cloturer-scenario.md] — pattern signal mutable + `extractErrorMessage` pour les CTA de mutation MJ, déjà répliqué trois fois (`markCourant`/`close`/`participate`), même schéma pour `addSeance`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `toDto()`/`toEnrichedDto()` étendus avec un paramètre `seances?: SeanceDto[]` ajouté systématiquement (`seances: seances ?? []`, jamais conditionnel contrairement à `participants`) — répercuté sur `create()`/`update()`/`open()`/`markCourant()` (les deux branches, y compris la branche `CAMPAGNE_LINEAIRE` sous transaction qui appelait encore `toDto()` brut avant cette story)/`close()`/`participate()`/`addSeance()`/`linkSeancePoll()`.
- `listDrafts()`/`findAllForPartie()` : batching `loadSeancesBatch()` (regroupement `Map<scenarioId, SeanceDto[]>`) ajouté en plus du batching `participants` déjà existant (Story 8.1), pour éviter le N+1 sur `Seance`.
- `toSessionPollDto()` duplique à l'identique le mapper privé de `poll.service.ts` (non modifié, non importé) — `PollModule` reste totalement étranger à `ScenariosModule` (P2-AD-2).
- `SeanceList` reçoit `isEpisodique: boolean` (pas `PartieKind` complet) — ajustement décidé dans la story elle-même (Task 6) car `ScenarioEditor` ne connaît que ce booléen dérivé, jamais le `kind` littéral.
- Ripple attendu et géré : `ScenarioDto.seances` passant non-optionnel a cassé la compilation de tous les fixtures `ScenarioDto` littéraux côté web (8 fichiers `.spec.ts`) — `seances: []` ajouté à chacun. `pnpm typecheck` (leçon de Story 8.1 : `ts-jest` ne détecte pas ce type d'erreur cross-fichiers) vérifié propre à chaque étape.
- Suite complète (après implémentation) : 29 suites / 533 tests API (+31 : `addSeance()`/`linkSeancePoll()`/tests de non-régression `seances` sur les méthodes existantes/routage contrôleur), 63 suites / 568 tests web (+13 : service frontend, `SeanceList` (6), `ScenarioEditor` (4), `ScenarioReadDialog` (1 AC5 dédié)). Aucune régression, `pnpm typecheck` propre.

### Completion Notes List

- Backend : `ScenariosService.addSeance()` (MJ, `getOwned`, sans plafond) et `linkSeancePoll()` (MJ, rejette `CAMPAGNE_EPISODIQUE` en 400, vérifie que le poll appartient à la même Partie) — nouvelles routes `POST /scenarios/:id/seances` et `PATCH /scenarios/seances/:id/poll`. `ScenarioDto.seances` désormais toujours peuplé (jamais `undefined`) sur tout endpoint retournant un `ScenarioDto`.
- `PollModule`/`PollService`/`PollController` **non modifiés** — `ScenariosService` lit `SessionPoll` directement via Prisma en lecture seule pour construire `SeanceDto.poll` (mapper dupliqué `toSessionPollDto`).
- Frontend : nouveau composant `SeanceList` (seul affichage réellement nouveau) — délègue entièrement à `PollCreationComponent`/`PollStatusPanel`/`PollResponseComponent` existants (aucune modification). Câblé dans `ScenarioEditor` (MJ, avec bouton « Ajouter une séance » + liste des membres pour `PollStatusPanel`) et `ScenarioReadDialog` (joueur, placé hors du bloc anti-spoil `isRestricted()` pour garantir AC5).
- 8 acceptance criteria couvertes : AC1 (création de séance sans plafond), AC2 (liaison poll↔séance linéaire/one-shot), AC3 (non-régression `PollService`/`PollController`, aucune ligne modifiée), AC4 (rejet 400 épisodique), AC5 (vote accessible malgré l'anti-spoil), AC6 (bouton MJ + `SeanceList`), AC7 (forme exacte de `ScenarioDto.seances`/`SeanceDto.poll`), AC8 (403 non-MJ).
- 533/533 tests API + 568/568 tests web passent, `pnpm typecheck` propre, aucune régression.

### File List

- `packages/shared/src/index.ts` (modifié — `SeanceDto`, `LinkSeancePollDto`, `ScenarioDto.seances`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `addSeance()`, `linkSeancePoll()`, `loadSeances()`/`loadSeancesBatch()`, `toSessionPollDto()`, `toDto()`/`toEnrichedDto()` étendus, `create()`/`listDrafts()`/`findAllForPartie()`/`markCourant()`/`participate()` mis à jour)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — mocks `seance`/`sessionPoll`, `describe('addSeance()')`, `describe('linkSeancePoll()')`, tests de non-régression `seances` sur `open()`/`update()`/`close()`/`markCourant()`)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — routes `POST scenarios/:id/seances`, `PATCH scenarios/seances/:id/poll`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mocks + 2 tests de routage)
- `apps/api/src/scenarios/dto/link-seance-poll.dto.ts` (nouveau)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `addSeance()`, `linkSeancePoll()`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — 2 nouveaux tests)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (nouveau)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.html` (nouveau)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.scss` (nouveau)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — `addSeance()`, `members`, `onSeanceLinked()`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié — bouton « Ajouter une séance », `app-seance-list`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — mocks `PartiesService`/`PollService`, 4 nouveaux tests)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié — `onSeanceLinked()`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié — `app-seance-list` hors du bloc anti-spoil)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — mock `PollService`, 1 nouveau test AC5)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts`, `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts`, `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.spec.ts`, `apps/web/src/app/features/scenarios/scenario-form/scenario-form.spec.ts`, `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts`, `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifiés — fixture `ScenarioDto` mise à jour avec `seances: []`, ripple du champ non-optionnel)

## Change Log

- 2026-07-13 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`/`.module.ts`, `poll.service.ts`/`.controller.ts`/`.module.ts`, `poll-creation.ts`, `poll-status.ts`, `poll-response.ts`, `calendar-view.ts`/`.html`, `scenario-editor.ts`/`.html`, `scenario-read-dialog.ts`/`.html`, `parties.service.ts` (web), `ARCHITECTURE-SPINE.md` AD-4/P2-AD-2/P1-AD-3 et section Types partagés, `schema.prisma`, `packages/shared/src/index.ts`, intelligence Story 8.1 — `Seance`/`SessionPoll`/leur relation existent déjà en base (migration `scenarios_seances_p4`) mais aucun code service/controller/frontend ne pose ni ne lit cette liaison avant cette story ; `PollModule` reste volontairement non importé par `ScenariosModule` et non modifié, conformément à P2-AD-2/epics.md).
- 2026-07-13 : Implémentation complète de la Story 8.2 (`ScenariosService.addSeance()`/`linkSeancePoll()`, `ScenarioDto.seances` toujours peuplé, nouveau composant `SeanceList` réutilisant `PollCreationComponent`/`PollStatusPanel`/`PollResponseComponent` sans modification, câblage `ScenarioEditor`/`ScenarioReadDialog` — 8 ACs couvertes, 533/533 tests API + 568/568 tests web passants, `pnpm typecheck` propre, aucune régression).
- 2026-07-13 : Revue de code adversariale à 3 couches (0 déviation d'AC/architecture, 3 gardes manquantes patchées — anti double-clic `onPollCreated`, anti-écrasement de liaison poll déjà posée, rejet d'un poll non `OPEN` — 1 edge case différée sur `addSeance()`/scénario `PASSE`). Statut passé à `done`. Suite finale : 535/535 tests API, 569/569 tests web, `pnpm typecheck` propre.
