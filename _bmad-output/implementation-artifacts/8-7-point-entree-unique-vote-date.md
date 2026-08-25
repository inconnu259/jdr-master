---
baseline_commit: aa102ce
---

# Story 8.7: Point d'entrée unique pour la sélection de date de séance

Status: done

## Story

As a MJ,
I want lancer un vote de date depuis le calendrier ou depuis un scénario via un seul flux cohérent, avec la séance concernée toujours explicite,
So that je ne duplique jamais la création de vote et je sais toujours à quelle séance un vote donné se rapporte.

## ⚠️ Décision d'architecture à trancher avant implémentation (lire en premier)

`epics.md` (AC5 ci-dessous) demande littéralement d'ajouter un `seanceId` obligatoire à `CreatePollDto` et de faire écrire `Seance.pollId` dès la création du poll. **Ceci entre en tension directe avec deux invariants déjà actés** :

- **AD-1** (`ARCHITECTURE-SPINE.md`) : `ScenariosModule` est propriétaire exclusif de `Scenario`/`Seance` — un autre module qui écrirait `Seance.pollId` directement violerait cette règle.
- **P2-AD-2** (hérité Palier 2) : `PollModule`/`SessionPoll` reste le mécanisme de vote, **jamais réimplémenté ni étendu** pour connaître autre chose que `partieId` — lui faire connaître `Seance` l'engagerait sur une dépendance qu'il n'a jamais eue, et casserait `CreatePollDto` pour **tous les appelants existants** (Epics 1-3 : `PollCreationComponent`, `calendar-view`, tous leurs specs).

**Approche retenue (recommandée, à valider avant de coder)** : au lieu d'étendre `CreatePollDto`/`PollModule`, **`ScenariosModule` importe `PollModule`** (nouvel import, comme il importe déjà — ou importera après Story 8.6 — `CharacterModule`) et expose une **nouvelle méthode d'orchestration** `ScenariosService.createSeancePoll(seanceId, mjId, options)` qui : (1) valide la séance/le `kind` (même garde que l'actuel `linkSeancePoll`), (2) appelle `PollService.create(partieId, mjId, { options })` **tel quel, sans modification de son contrat**, (3) pose `Seance.pollId` juste après (même effet que l'actuel `linkSeancePoll`, mais dans le même appel réseau, plus de round-trip séparé côté frontend). `CreatePollDto` ne change pas, `scenarioRef` reste un champ mort mais non retiré (retrait = migration + nettoyage large, hors bénéfice réel). Cette approche satisfait l'intention de l'AC (« un seul flux, séance toujours explicite, plus d'étape de liaison a posteriori côté utilisateur ») sans casser AD-1/P2-AD-2 ni la suite de tests existante des Epics 1-3.

**Non-atomicité acceptée** : l'appel à `PollService.create()` puis la pose de `Seance.pollId` restent deux écritures séparées (pas de transaction Prisma unique traversant les deux modules) — un crash entre les deux laisserait un `SessionPoll` orphelin (créé mais jamais lié). Risque accepté, cohérent avec des séquences non-atomiques déjà en production dans ce palier (`PollService.choose()` fait `sessionPoll.update` puis `partie.update` sans transaction, cf. `deferred-work.md` 3-6).

**Si le dev agent ou une revue ultérieure préfère l'approche littérale de l'AC** (`seanceId` sur `CreatePollDto`, `PollModule` écrit `Seance.pollId`), c'est un choix valide mais **plus invasif** (migration du contrat `PollModule`, ré-écriture de `poll.service.spec.ts`/`poll-creation.spec.ts`/`calendar-view.spec.ts`/`poll.controller.spec.ts`) — à ne prendre qu'après confirmation explicite, pas par défaut.

## Acceptance Criteria

1. **Given** une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` **When** le MJ lance un vote de date depuis le calendrier (`CalendarView`, mode MJ) pour une séance donnée **Then** il doit obligatoirement sélectionner une `Seance` existante avant de pouvoir soumettre le formulaire — le `SessionPoll` créé est lié à `Seance.pollId` **dans le même appel**, sans étape de liaison manuelle a posteriori côté utilisateur (`linkSeancePoll` en tant qu'action utilisateur séparée disparaît, remplacé par `createSeancePoll`, cf. décision d'architecture ci-dessus).
2. **Given** le MJ consulte `SeanceList` (fiche scénario) pour une séance sans vote **When** il clique « Lancer le vote » **Then** il est amené sur la page calendrier (mode MJ) avec cette séance déjà pré-sélectionnée/verrouillée dans le sélecteur — **un seul flux d'implémentation** (`PollCreationComponent`, inchangé dans sa logique de sélection de créneaux), jamais deux composants de création parallèles.
3. **Given** `SeanceList` **Then** elle n'embarque plus de panneau de création de vote dupliqué (l'actuel `<app-poll-creation>` inline disparaît de ce fichier) — uniquement un bouton/lien vers le calendrier (séance pré-remplie via un paramètre de route) et l'état du vote une fois qu'il existe (ouvert / date retenue / clôturé sans date), **inchangé** par rapport à l'affichage actuel.
4. **Given** une `Seance` épisodique avec capacité déjà définie (non validée) **When** le MJ souhaite proposer une vraie date (au lieu de l'instant du clic actuel) **Then** il choisit une date parmi les créneaux calculés (`AvailableSlotDto`, même source que le linéaire, déjà chargée par `SeanceList.ngOnInit`) — `validerDate()` reçoit désormais cette date choisie explicitement, jamais `new Date()` (l'instant du clic).
5. **Given** un scénario avec plusieurs `Seance` **When** le MJ tente de supprimer une séance **Then** la suppression réussit sauf pour la toute première séance du scénario (un scénario a toujours au moins une séance) — supprime aussi ses `Inscription` (cascade DB déjà en place) et sa liaison `pollId` (le `SessionPoll` lié n'est pas supprimé, seule la `Seance` l'est).
6. **Given** une `Seance` épisodique avec capacité déjà définie (non validée) **When** le MJ souhaite ajuster min/max **Then** l'UI permet de rouvrir et modifier ces valeurs (le backend `setSeanceCapacity()` l'autorise déjà sans garde depuis la Story 8.3, seule l'UI manque à ce jour — le formulaire actuel ne s'affiche que si `!seance.inscription`, jamais une fois la capacité posée).
7. **Given** `ScenarioTimeline` **When** un scénario a une ou plusieurs séances **Then** ses séances (et leur date une fois connue — `poll.chosenDate` ou `inscription.dateValidee`) sont visibles sur la carte du scénario dans la chronologie, pas seulement le scénario lui-même — **le défaut visuel global de `ScenarioTimeline`** (ronds d'accroche, espacement ligne/rectangles, non-conformité au mockup `DESIGN.md`) reste **explicitement hors scope**, tracké séparément dans `docs/backlog.md` Palier 6 (refonte UI).
8. **Given** un vote scellé/clôturé ou une capacité validée depuis n'importe quelle page (calendrier ou scénario) **When** l'autre page est ensuite consultée (navigation, pas un onglet déjà ouvert en parallèle) **Then** l'état affiché reflète le changement — satisfait par le re-fetch déjà systématique à l'entrée de chaque composant (`ngOnInit`/`listAll`), **pas** un objectif de synchronisation temps réel entre onglets simultanément ouverts (hors scope, aucune infrastructure websocket dans ce projet).

*(Source : epics.md Story 8.7, 9 ACs « ébauche » reformulées/consolidées en 8 ACs Given/When/Then définitives — AC « CreatePollDto porte un seanceId obligatoire » remplacée par l'approche d'orchestration décrite ci-dessus (AC1), qui satisfait la même intention sans le risque architectural. Contexte : née d'un retour utilisateur en usage réel (pas une lacune de conception initiale) — deux points d'entrée de vote indépendants découverts après la Story 8.2, élargie après les Stories 8.3/8.2 pour couvrir 4 besoins complémentaires détectés à l'usage (cf. `deferred-work.md` section « Différé — élargissement de Story 8-7 »).)*

## Tasks / Subtasks

- [x] **Task 1 — Backend : `ScenariosModule` importe `PollModule`, nouvelle méthode d'orchestration** (AC1)
  - [x] `apps/api/src/poll/poll.module.ts` : ajouter `exports: [PollService]` — **actuellement absent** (vérifié par lecture directe, le module n'exporte rien), bloquant pour tout import cross-module.
  - [x] `apps/api/src/scenarios/scenarios.module.ts` : ajouter `PollModule` à `imports` (à côté de `PartiesModule`, et `CharacterModule` si la Story 8.6 est déjà passée avant celle-ci).
  - [x] `ScenariosService` : injecter `private readonly pollService: PollService` au constructeur.
  - [x] Nouvelle méthode `async createSeancePoll(seanceId: string, mjId: string, options: { date: string; slot: DaySlot }[]): Promise<ScenarioDto>` — reprend intégralement la garde existante de `linkSeancePoll` (séance introuvable → 404, `getOwned`, rejet `CAMPAGNE_EPISODIQUE`, rejet si `seance.pollId` déjà posé), puis :
    - `const poll = await this.pollService.create(scenario.partieId, mjId, { options });`
    - `await this.prisma.seance.update({ where: { id: seanceId }, data: { pollId: poll.id } });`
    - Retourne `toEnrichedDto(...)` comme les autres mutations de `Seance`.
  - [x] **Retirer `linkSeancePoll()`** (méthode + route `PATCH scenarios/seances/:id/poll` + `LinkSeancePollDto`) — remplacée intégralement par `createSeancePoll`, plus aucun appelant ne doit créer un poll puis le lier en deux temps.
  - [x] `scenarios.service.spec.ts` : nouveau `describe('createSeancePoll()')` — création+liaison réussie (linéaire/one-shot), rejet `CAMPAGNE_EPISODIQUE`, rejet si `pollId` déjà posé, rejet `404`/`403` (mêmes cas que l'ancien `linkSeancePoll`, migrés) ; retirer les tests de l'ancien `linkSeancePoll`.

- [x] **Task 2 — Backend : route + DTO** (AC1)
  - [x] `scenarios.controller.ts` : remplacer la route `@Patch('scenarios/seances/:id/poll')` (ancienne `linkSeancePoll`) par `@Post('scenarios/seances/:id/poll') createSeancePoll(@Param('id', ParseUUIDPipe) seanceId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateSeancePollDto) { return this.scenarios.createSeancePoll(seanceId, user.id, dto.options); }` — **même chemin d'URL**, verbe HTTP changé (`POST` au lieu de `PATCH`, sémantiquement plus correct pour une création).
  - [x] Nouveau fichier `apps/api/src/scenarios/dto/create-seance-poll.dto.ts` — **copie exacte** de la validation `options` déjà présente dans `apps/api/src/poll/dto/create-poll.dto.ts` (`PollOptionInput`, `@ArrayMinSize(2)`/`@ArrayMaxSize(40)`), sans `scenarioRef` (non pertinent ici, la séance est déjà l'identifiant explicite via l'URL).
  - [x] Supprimer `apps/api/src/scenarios/dto/link-seance-poll.dto.ts` (`LinkSeancePollDto`, devenu inutile).
  - [x] `scenarios.controller.spec.ts` : remplacer le test de routage `linkSeancePoll` par un test `createSeancePoll` équivalent.

- [x] **Task 3 — Backend : suppression d'une séance** (AC5)
  - [x] `packages/shared` : pas de nouveau DTO nécessaire (route sans corps, même style que `open`/`markCourant`/`close`).
  - [x] `ScenariosService.deleteSeance(seanceId: string, mjId: string): Promise<ScenarioDto>` :
    - `findUnique` la séance → 404 si absente.
    - `getOwned` sur la Partie du scénario parent.
    - **Garde « toujours au moins une séance »** : charger `prisma.seance.findMany({ where: { scenarioId: seance.scenarioId }, orderBy: { createdAt: 'asc' }, take: 1 })` — si l'`id` de la première séance (par `createdAt` croissant) correspond à `seanceId`, rejet `400` (« La première séance d'un scénario ne peut pas être supprimée »).
    - `await this.prisma.seance.delete({ where: { id: seanceId } });` — `Inscription.onDelete: Cascade` (déjà en place, schema.prisma) supprime automatiquement les inscriptions liées ; le `SessionPoll` lié (si `pollId` posé) **n'est pas supprimé** (cycle de vie indépendant, P2-AD-2), seule la ligne `Seance` disparaît, la FK `Seance.pollId` disparaît avec elle sans action supplémentaire.
    - Retourne `toEnrichedDto(...)` du scénario parent.
  - [x] `@Delete('scenarios/seances/:id') deleteSeance(...)` dans le controller.
  - [x] `scenarios.service.spec.ts` : suppression réussie d'une séance non-première (avec et sans `Inscription`/`pollId` associés) ; rejet `400` sur la première séance (créer 2 séances, tenter de supprimer celle avec le `createdAt` le plus ancien) ; `404`/`403` standards.

- [x] **Task 4 — Backend : date réelle pour `validerDate()` épisodique** (AC4)
  - [x] `apps/api/src/scenarios/scenarios.service.ts::validerDate` — actuellement pose `dateValidee: new Date()` (l'instant du clic, cf. `deferred-work.md`) : changer la signature en `validerDate(seanceId: string, mjId: string, date: string): Promise<ScenarioDto>`, valider `date` (format ISO, `class-validator @IsDateString` sur le nouveau DTO) et écrire `dateValidee: new Date(date)` au lieu de `new Date()`. **Aucune garde de cohérence supplémentaire requise** (la date choisie peut être n'importe laquelle des créneaux calculés, ou même hors liste — non demandé par l'AC de restreindre aux seuls créneaux proposés, cohérent avec le style permissif déjà établi pour ce module).
  - [x] Nouveau DTO `apps/api/src/scenarios/dto/valider-date.dto.ts` : `class ValiderDateDto { @IsDateString() date!: string; }`.
  - [x] `@Patch('scenarios/seances/:id/valider-date') validerDate(@Param('id', ParseUUIDPipe) seanceId: string, @CurrentUser() user: AuthUser, @Body() dto: ValiderDateDto)` — même route, corps désormais requis (`{ date }`).
  - [x] `scenarios.service.spec.ts` : mettre à jour les tests existants de `validerDate()` pour passer une date explicite au lieu de vérifier `new Date()` ; ajouter un test confirmant que `dateValidee` reflète exactement la date fournie (pas l'heure d'exécution du test).

- [x] **Task 5 — Backend : édition min/max déjà défini** (AC6)
  - [x] **Aucun changement backend** — `setSeanceCapacity()` (Story 8.3) accepte déjà d'être rappelée sans garde de statut, `[ASSUMPTION]` déjà documentée dans la Story 8.3. Seule l'UI (Task 7) manque.

- [x] **Task 6 — Frontend : retrait du panneau de vote dupliqué dans `SeanceList`, navigation vers le calendrier** (AC2, AC3)
  - [x] `apps/web/src/app/features/scenarios/seance-list/seance-list.html` : retirer le bloc `@if (openPanelSeanceId() === seance.id) { <app-poll-creation ... /> } @else { <button (click)="openPollPanel(seance.id)">Lancer le vote</button> }` — remplacer par un unique `<button (click)="goToCalendarForSeance(seance.id)">Lancer le vote</button>` (visible seulement si `!seance.poll`, comme aujourd'hui).
  - [x] `seance-list.ts` : retirer `openPanelSeanceId`/`openPollPanel`/`closePollPanel`/`onPollCreated`/l'import `PollCreationComponent` (plus utilisés ici) ; ajouter `protected goToCalendarForSeance(seanceId: string): void { this.router.navigate(['/parties', this.partieId(), 'calendar'], { queryParams: { mode: 'mj', seanceId } }); }` (injecter `Router`) — **vérifier le chemin de route réel du calendrier MJ** (`partie-detail`/routes existantes) avant d'écrire cette navigation, ne pas deviner l'URL.
  - [x] `seance-list.spec.ts` : remplacer les tests de l'ancien flux (`onPollCreated`, panneau inline) par un test de navigation (`router.navigate` appelé avec les bons `queryParams`).

- [x] **Task 7 — Frontend : `CalendarView` — pré-sélection de séance, `PollCreationComponent` orchestré via `ScenariosService`** (AC1, AC2)
  - [x] `calendar-view.ts::ngOnInit` : lire `this.route.snapshot.queryParamMap.get('seanceId')` — si présent, stocker dans un signal `protected readonly lockedSeanceId = signal<string | null>(null)` et ouvrir automatiquement `pollPanelOpen` (le MJ arrive directement sur le formulaire de création, pas besoin de re-cliquer).
  - [x] `PollCreationComponent` : ajouter un input optionnel `readonly seanceId = input<string | undefined>();` — dans `onSubmit()`, si `seanceId()` est défini, appeler `scenariosService.createSeancePoll(seanceId(), { options })` (nouvelle méthode frontend, Task 8) **au lieu de** `pollSvc.createPoll(partieId(), { options, scenarioRef })` ; **retirer le champ `scenarioRef`** du template (`poll-creation.html`) et de `onSubmit()` dans tous les cas (mort, jamais exploité, cf. décision d'architecture) — remplacé par la sélection de séance en amont (verrouillée, jamais un texte libre saisi par l'utilisateur).
  - [x] `calendar-view.html` : passer `[seanceId]="lockedSeanceId()"` à `<app-poll-creation>` ; afficher un indicateur visuel simple (ex. « Vote pour : Séance liée à [titre du scénario] » — nécessite de charger le scénario/titre correspondant à `lockedSeanceId`, via un nouvel appel léger si besoin, ou simplement afficher l'ID si le titre n'est pas trivialement disponible — **au choix de l'implémentation**, non structurant) confirmant au MJ que la séance est bien verrouillée.
  - [x] `poll-creation.spec.ts` : tests existants (sans `seanceId`) inchangés ; nouveaux tests avec `seanceId` fourni — `onSubmit()` appelle `scenariosService.createSeancePoll` et non `pollSvc.createPoll`, absence du champ `scenarioRef` dans le DOM.
  - [x] `calendar-view.spec.ts` : nouveau test — `?seanceId=xxx` dans l'URL ouvre `pollPanelOpen` automatiquement et transmet `lockedSeanceId` à `PollCreationComponent`.

- [x] **Task 8 — Frontend : `ScenariosService`/`scenarios.service.ts` — nouvelles méthodes** (AC1, AC4, AC5, AC6)
  - [x] `createSeancePoll(seanceId: string, options: { date: string; slot: DaySlot }[]): Promise<ScenarioDto>` — `POST ${API_BASE}/scenarios/seances/${seanceId}/poll`, même pattern `_changed.update` que les autres mutations ; **retirer** `linkSeancePoll()` (méthode frontend devenue inutile, plus aucun appelant après Task 6).
  - [x] `deleteSeance(seanceId: string): Promise<ScenarioDto>` — `DELETE ${API_BASE}/scenarios/seances/${seanceId}`.
  - [x] `validerDate(seanceId: string, date: string): Promise<ScenarioDto>` — signature étendue (actuellement sans corps), `PATCH` avec `{ date } satisfies ValiderDateDto`.
  - [x] `scenarios.service.spec.ts` (core) : mettre à jour le test existant de `validerDate` (corps désormais requis) ; ajouter des tests standards pour `createSeancePoll`/`deleteSeance`.

- [x] **Task 9 — Frontend : `SeanceList` — proposer une vraie date (épisodique), éditer min/max, supprimer une séance** (AC4, AC5, AC6)
  - [x] **Date réelle épisodique (AC4)** : dans la branche `isEpisodique()` de `seance-list.html`, remplacer le bouton « Valider cette date » (actuellement sans sélection) par une liste de créneaux calculés (réutiliser `availableSlots()`, déjà chargée par `ngOnInit` pour le linéaire — vérifier qu'elle se charge aussi en contexte épisodique, sinon étendre la garde `if (!this.isMj())` de `ngOnInit`) : chaque créneau cliquable appelle `onValiderDate(seance.id, slot.date)` (signature étendue, Task 8) au lieu de l'appel sans argument actuel. Garder « Proposer une autre date » tel quel (crée une nouvelle `Seance` vierge, `[ASSUMPTION]` déjà actée Story 8.3).
  - [x] **Éditer min/max déjà défini (AC6)** : ajouter un bouton « Modifier la capacité » visible quand `seance.inscription && !seance.inscription.dateValidee` (capacité déjà définie, pas encore validée) — au clic, réaffiche le même formulaire `capacity-form` (Task existant Story 8.3) pré-rempli avec `seance.inscription.min`/`seance.inscription.max`, soumission via le même `onSetCapacity` déjà en place (aucune garde backend à ajouter, cf. Task 5).
  - [x] **Supprimer une séance (AC5)** : bouton « Supprimer cette séance » (icône ou texte, au choix), visible pour le MJ sur toute séance **sauf** la première de la liste (`i > 0` dans le `@for` déjà indexé) — appelle `deleteSeance(seance.id)` (Task 8), confirmation avant suppression recommandée (`window.confirm` ou dialogue Material, au choix de l'implémentation — non structurant) pour éviter un clic accidentel destructeur.
  - [x] `seance-list.spec.ts` : nouveaux tests pour les 3 comportements ci-dessus (créneaux cliquables épisodiques, bouton modifier capacité apparaît/pré-remplit, bouton supprimer absent sur la 1ère séance/présent sur les suivantes, appel service correct).

- [x] **Task 10 — Frontend : `ScenarioTimeline` affiche les séances** (AC7)
  - [x] `scenario-timeline.html` : sous `<span class="title">{{ scenario.title }}</span>` dans chaque `.card`, ajouter une liste compacte des séances du scénario (`scenario.seances`) — pour chacune, afficher sa date résolue si connue (`seance.poll?.chosenDate ?? seance.inscription?.dateValidee ?? 'Date à définir'`) ou un texte neutre sinon. **Pas de refonte visuelle** du composant (cf. AC7, hors scope explicite) — simple ajout de contenu dans la structure de carte existante.
  - [x] `scenario-timeline.spec.ts` : test confirmant que les séances (et leur date une fois connue) apparaissent dans le DOM de chaque carte.

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-14 sur `git diff HEAD` (24 fichiers, 24 vs baseline `aa102ce`).

- [x] [Review][Patch] AC1 pas réellement appliqué : le bouton « Lancer un vote » du calendrier reste accessible sans `seanceId` (flux Partie générique, `pollPanelOpen()` non conditionné à `isMjMode()`/sélection de séance) — contredit le texte littéral de l'AC1. **Décision utilisateur (2026-07-14) : à corriger** — plus aucun vote de date ne doit pouvoir être créé sans séance sélectionnée, y compris depuis le calendrier. **Appliqué** : bouton « Lancer un vote » retiré de `CalendarView` (le seul point d'entrée est désormais `SeanceList` → « Lancer le vote » → `?seanceId=`), `PollCreationComponent.seanceId` rendu `input.required<string>()`, branche `pollSvc.createPoll()` sans séance supprimée.
- [x] [Review][Defer] `createSeancePoll()` effectue 2 écritures non-atomiques (`pollService.create()` puis `seance.update()`) — confirmé indépendamment par 2 reviewers (poll orphelin en cas d'échec partiel, double poll en cas de double-soumission concurrente). **Décision utilisateur (2026-07-14) : risque accepté tel quel**, cohérent avec l'`[ASSUMPTION]` déjà documentée dans le code (Option A, écritures séparées par construction) — deferred
- [x] [Review][Patch] `deleteSeance()` autorise la suppression d'une séance dont `dateValidee` est déjà posée (roster figé/session confirmée). **Décision utilisateur (2026-07-14) : autorisé**, mais avec une confirmation renforcée spécifique (« Cette séance a une date validée — supprimer quand même ? ») plutôt que le `window.confirm()` générique. **Appliqué** : `SeanceList.onDeleteSeance()` détecte `seance.inscription?.dateValidee ?? seance.poll?.chosenDate` et affiche un message de confirmation dédié.
- [x] [Review][Defer] Le champ libre « Nom de la séance » (`scenarioRef`) a été entièrement retiré de `PollCreationComponent`, y compris pour le flux **sans** séance — dépassait le périmètre de l'AC1/AC2. **Décision utilisateur (2026-07-14) : suppression confirmée**, ce n'est pas une régression — superseded par l'affichage structuré scénario/séance prévu dans la Story 8-8 — deferred
- [x] [Review][Patch] Tie-breaker manquant sur `deleteSeance()`/première-séance : `orderBy: { createdAt: 'asc' }` sans clé secondaire — deux séances au même `createdAt` rendent la « première séance » non déterministe (UI et backend utilisent tous deux cet ordre, donc cohérents entre eux sauf sur cette égalité). [apps/api/src/scenarios/scenarios.service.ts:440-444] **Appliqué** : `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`.
- [x] [Review][Patch] `deleteSeance()` n'a aucune garde sur le statut du scénario — une séance d'un scénario `PASSE` (clôturé) peut être supprimée silencieusement. [apps/api/src/scenarios/scenarios.service.ts:430-457] **Appliqué** : rejet 400 si `scenario.status === 'PASSE'`.
- [x] [Review][Patch] `CalendarView.ngOnInit()` lit `?seanceId=` sans le conditionner à la présence de `id` (route `:id`) — peut ouvrir `pollPanelOpen`/`lockedSeanceId` avec `partieId()` vide, alors que `[partieId]="partieId()!"` fait un non-null assertion sur cette valeur. [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:121-125] **Appliqué** : guard `if (seanceIdParam && id && this.isMjMode())`.
- [x] [Review][Patch] `CalendarView.ngOnInit()` lit `?seanceId=` sans le conditionner à `isMjMode()` — le panneau de création de vote (MJ-only) devient visible pour un joueur via une URL forgée sur `guild-calendar`/`profile/calendar` (le backend bloque bien l'écriture via `getOwned`, mais l'exposition UI/le panneau restent visibles). [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:121-125] **Appliqué** : même guard que ci-dessus.
- [x] [Review][Patch] `PollCreationComponent.onSubmit()` : l'erreur « Vote créé mais introuvable dans la séance retournée » (poll créé mais désynchronisé) est capturée par le même catch générique qu'une panne réseau — le MJ voit le même toast et peut relancer une soumission, créant un doublon. [apps/web/src/app/features/poll/poll-creation/poll-creation.ts] **Appliqué** : message distinct pour ce cas précis, n'invite plus à réessayer aveuglément.
- [x] [Review][Patch] Aucun bouton « Annuler » pour sortir du mode « Modifier la capacité » sans soumettre — seule la soumission réussie referme le formulaire. [apps/web/src/app/features/scenarios/seance-list/seance-list.html] **Appliqué** : bouton « Annuler » ajouté (visible quand une capacité existe déjà).
- [x] [Review][Defer] `SeancePollOptionInput` duplique intégralement la validation de `PollOptionInput` (mêmes bornes `ArrayMinSize(2)`/`ArrayMaxSize(40)` copiées-collées) — conséquence acceptée du choix d'architecture Option A (P2-AD-2 : `PollModule` doit rester générique), déjà discuté avant l'implémentation. [apps/api/src/scenarios/dto/create-seance-poll.dto.ts] — deferred, pre-existing trade-off de l'architecture Option A validée par l'utilisateur
- [x] [Review][Defer] `window.confirm()` sur la suppression de séance n'indique pas le nombre d'inscriptions/votes perdus — amélioration UX, pas un défaut de correction. [apps/web/src/app/features/scenarios/seance-list/seance-list.html] — deferred, polish UX non bloquant

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **Décision d'architecture centrale : cf. section dédiée en tête de ce fichier** (orchestration `ScenariosService.createSeancePoll` plutôt qu'extension de `CreatePollDto`/`PollModule`) — **à ne pas contourner sans revalidation**, c'est le choix qui préserve AD-1/P2-AD-2.
- **AD-1 (rappel)** : `ScenariosModule` reste propriétaire exclusif de `Scenario`/`Seance`, y compris pour la suppression (Task 3) — jamais un accès direct à `Seance` depuis `PollModule` ou `AnnouncementsModule`.
- **P2-AD-2 (rappel)** : `PollModule`/`SessionPoll` reste un mécanisme de vote générique par Partie, sans connaissance de `Scenario`/`Seance` — `CreatePollDto` ne change **pas** dans cette story (cf. décision d'architecture).
- **AD-4 (rappel)** : une `Seance` épisodique ne touche jamais `SessionPoll`/`PollModule` — la « date réelle » de Task 4/9 reste un simple champ `dateValidee` sur `Seance`, jamais un `SessionPoll` créé pour l'épisodique. Les créneaux calculés (`AvailableSlotDto`) sont réutilisés en **lecture seule** comme source d'inspiration pour le MJ, jamais transformés en `SessionPoll`.
- **AD-5 (rappel)** : aucune régression sur le verrou `SELECT ... FOR UPDATE` déjà en place pour `inscrire()` — Task 3 (suppression de séance) ne touche pas ce mécanisme, `Inscription` est simplement cascadée à la suppression de sa `Seance` parente.

- **`[ASSUMPTION]` — non-atomicité `createSeancePoll` (cf. section d'architecture)** : deux écritures séparées (`PollService.create()` puis `prisma.seance.update`), pas de transaction Prisma unique traversant les deux services. Risque accepté (poll orphelin sur crash exact entre les deux lignes), cohérent avec plusieurs séquences non-atomiques déjà en production dans ce palier.
- **`[ASSUMPTION]` — retrait complet de `linkSeancePoll`/`LinkSeancePollDto` plutôt que dépréciation** : aucun appelant connu n'a besoin de lier un `SessionPoll` **déjà existant et non créé pour cette séance** à une `Seance` — le seul usage réel était « créer puis lier immédiatement », remplacé par `createSeancePoll`. Si un besoin de liaison a posteriori émergeait, ce serait un cas nouveau non couvert par les AC actuelles.
- **`[ASSUMPTION]` — `validerDate()` accepte n'importe quelle date, pas seulement un créneau calculé proposé** : cohérent avec le style permissif déjà établi (`setSeanceCapacity` sans garde, Story 8.3) — le MJ reste souverain, aucune validation de cohérence entre `date` et `availableSlots()` n'est demandée par l'AC.
- **`[ASSUMPTION]` — confirmation avant suppression de séance côté UI** : non spécifiée par les AC, mais une action destructive sans confirmation serait incohérente avec le reste du produit (aucun autre bouton de suppression n'existe encore dans ce module pour comparaison) — `window.confirm` minimal acceptable, un dialogue Material plus poli si le temps le permet, non structurant.
- **Convention de texte : pas de `ThemeToneService`** (rappel, hérité de Stories 8.3-8.6) — cohérence locale maintenue.

### Code existant à répliquer / modifier (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** (lu intégralement, état post-8.6) :
- `linkSeancePoll()` (lignes ~404-441) : squelette exact des gardes à répliquer dans `createSeancePoll` (introuvable/403/`CAMPAGNE_EPISODIQUE`/déjà lié), puis à **retirer** une fois `createSeancePoll` en place.
- `validerDate()` (section épisodique, Story 8.3) : signature à étendre avec `date: string`, remplacer `new Date()` par `new Date(date)`.
- `toEnrichedDto`/`loadSeances`/`toSeanceDto` : **aucune modification structurelle nécessaire** pour Task 3/4 (les champs existent déjà) ; Task 7 lit `poll?.chosenDate`/`inscription?.dateValidee` déjà résolus par `toSeanceDto`, pas de nouvelle requête.

**`apps/api/src/poll/poll.service.ts`/`poll.module.ts`/`poll.controller.ts`** (lus intégralement) — **contrat inchangé** dans cette story (cf. décision d'architecture) : `PollService.create(partieId, userId, dto)` reste appelé tel quel depuis `ScenariosService.createSeancePoll`. Seul `poll.module.ts` change (`exports: [PollService]` manquant à ajouter).

**`apps/web/src/app/features/scenarios/seance-list/seance-list.ts`+`.html`** (lu intégralement, état post-8.6) : structure `@for (seance of scenario().seances; ...; let i = $index)` déjà indexée (`i` déjà utilisé pour « Séance {{ i+1 }} ») — réutiliser cet index pour la garde « pas de suppression sur `i === 0` » (Task 9). Panneau `<app-poll-creation>` inline (lignes ~106-118 de `seance-list.html`) à retirer entièrement (Task 6).

**`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`+`.html`** (lu intégralement) : `pollPanelOpen`/`activePoll`/`onPollCreated(poll)` déjà en place pour le flux **sans séance** (vote de Partie générique, toujours valide et conservé — cette story n'en change pas le comportement par défaut, elle ajoute un mode « verrouillé sur une séance » en plus). `route.snapshot.queryParamMap` déjà utilisé pour `from`/`to` (fenêtre de planification, Story 2.5) — même pattern à réutiliser pour lire `seanceId`/`mode`.

**`apps/web/src/app/features/poll/poll-creation/poll-creation.ts`+`.html`** (lu intégralement) : `scenarioRef` (champ texte libre, ligne 44/166) est le champ « jamais exploité » cité par `epics.md` — à retirer entièrement (Task 7), remplacé par l'input `seanceId` verrouillé en amont. **Ce composant est partagé par `SeanceList` (retiré, Task 6) et `CalendarView` (conservé, Task 7)** — après cette story, seul `CalendarView` l'utilise encore.

**`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html`** (lu intégralement, 56 lignes) — structure de carte simple (`title` + `ScenarioStatusBadge`), point d'insertion direct pour la liste de séances (Task 10), sans toucher à la logique de scroll/drag/orientation desktop-mobile (hors scope, AC7).

### Hors scope explicite de cette story (ne pas implémenter)

- Refonte visuelle de `ScenarioTimeline` (ronds d'accroche, espacement, conformité au mockup `DESIGN.md`) — trackée séparément dans `docs/backlog.md` Palier 6 (AC7).
- Synchronisation temps réel entre onglets/sessions simultanément ouverts (websocket ou polling) — AC8 satisfaite par le re-fetch déjà systématique à la navigation, pas un objectif de push serveur→client.
- Extension littérale de `CreatePollDto`/`PollModule` (cf. décision d'architecture) — approche alternative documentée mais non retenue par défaut.
- Toute modification du calcul `getAvailableSlots`/`AvailableSlotDto` lui-même (Epic 2) — réutilisé tel quel en lecture seule.
- Limitation du choix de `validerDate()` aux seuls créneaux calculés proposés — le MJ peut saisir/choisir une date hors liste si l'UI le permet (non demandé par les AC de l'en empêcher).
- Historique des séances supprimées (audit trail) — suppression définitive, pas de soft-delete demandé.

### Project Structure Notes

- Aucune migration Prisma — tous les champs utilisés (`Seance.pollId`, `Inscription` cascade, `Seance.dateValidee`) existent déjà depuis `scenarios_seances_p4`.
- Fichiers supprimés : `apps/api/src/scenarios/dto/link-seance-poll.dto.ts`.
- Nouveaux fichiers backend : `apps/api/src/scenarios/dto/create-seance-poll.dto.ts`, `apps/api/src/scenarios/dto/valider-date.dto.ts`.
- `apps/api/src/poll/poll.module.ts` modifié (ajout `exports: [PollService]`) ; `apps/api/src/scenarios/scenarios.module.ts` modifié (ajout import `PollModule`).
- Aucun nouveau composant frontend — modifications de fichiers existants uniquement (`seance-list`, `calendar-view`, `poll-creation`, `scenario-timeline`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.7] — texte d'origine (ébauche), 9 ACs consolidées en 8.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Différé — élargissement de Story 8-7] — historique complet des 4 élargissements demandés par l'utilisateur en usage réel (2026-07-14).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-1, #AD-4, #P2-AD-2] — invariants motivant la décision d'architecture centrale de cette story.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `linkSeancePoll()`/`validerDate()` lus intégralement, squelettes à étendre/retirer.
- [Source: apps/api/src/poll/poll.service.ts, .module.ts, .controller.ts] — contrat `PollService.create()` inchangé ; `exports: [PollService]` manquant, à ajouter.
- [Source: apps/web/src/app/features/scenarios/seance-list/seance-list.ts, .html] — état post-8.6, panneau de vote inline à retirer, structure indexée réutilisée pour la garde de suppression.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts, .html] — flux de création de vote existant (sans séance), pattern `queryParamMap` déjà en place (Story 2.5) à réutiliser pour `seanceId`.
- [Source: apps/web/src/app/features/poll/poll-creation/poll-creation.ts, .html] — `scenarioRef` mort à retirer, composant partagé entre les deux points d'entrée.
- [Source: apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html] — structure de carte, point d'insertion pour l'affichage des séances.
- [Source: 8-6-association-journal-retrospective.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, `pnpm typecheck` à lancer après tout changement de signature, pattern de revue adversariale à 3 couches post-implémentation. **Si la Story 8.6 n'est pas encore implémentée**, `ScenariosModule` n'importera pas encore `CharacterModule` au moment de démarrer 8.7 — sans incidence, les deux imports (`CharacterModule`, `PollModule`) sont indépendants l'un de l'autre.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Aucun blocage. Décision d'architecture centrale (orchestration `ScenariosService.createSeancePoll` plutôt que l'extension littérale de `CreatePollDto`/`PollModule`) confirmée avec l'utilisateur après explication détaillée des deux options avant de démarrer l'implémentation (cf. story, section dédiée). TDD red-green systématique par task.

### Completion Notes List

- Task 1 : `PollModule` exporte désormais `PollService` ; `ScenariosModule` importe `PollModule` ; `ScenariosService.createSeancePoll()` orchestre `PollService.create()` (contrat inchangé) puis `prisma.seance.update({ pollId })` dans le même appel réseau ; `linkSeancePoll()` retiré intégralement. 122/122 tests `scenarios.service.spec.ts` verts.
- Task 2 : route `POST scenarios/seances/:id/poll` (verbe changé de PATCH à POST, sémantiquement plus correct) + `CreateSeancePollDto` (copie de la validation `PollOptionInput`) ; `LinkSeancePollDto` supprimé. 23/23 tests `scenarios.controller.spec.ts` verts.
- Task 3 : `ScenariosService.deleteSeance()` — garde « première séance jamais supprimable » via `findMany(take:1, orderBy: createdAt asc)`, `Inscription` cascadée (déjà en base), `SessionPoll` lié non supprimé (cycle de vie indépendant, P2-AD-2). Route `DELETE scenarios/seances/:id`.
- Task 4 : `validerDate(seanceId, mjId, date)` — `dateValidee: new Date(date)` au lieu de `new Date()` ; nouveau `ValiderDateDto` (`@IsDateString`).
- Task 5 : confirmé par lecture directe — `setSeanceCapacity()` n'a aucune garde bloquant un rappel, aucun changement backend nécessaire.
- Task 6 : `SeanceList` — panneau `<app-poll-creation>` inline retiré, remplacé par `goToCalendarForSeance()` (navigation vers `/parties/:id/calendar` avec `seanceId` en queryParam, route MJ confirmée par lecture de `app.routes.ts` avant d'écrire la navigation, `withComponentInputBinding()` déjà actif pour le mode MJ via `route.data`).
- Task 7 : `CalendarView` lit `?seanceId=` dans `ngOnInit`, ouvre `pollPanelOpen` automatiquement, transmet `lockedSeanceId` à `PollCreationComponent` (nouvel input `seanceId`). `onSubmit()` bifurque vers `scenariosService.createSeancePoll()` si `seanceId()` défini (extrait le `SessionPollDto` retourné depuis le `ScenarioDto`), sinon `pollSvc.createPoll()` inchangé. Champ `scenarioRef` retiré du template (mort, jamais exploité).
- Task 8 : `createSeancePoll()`/`deleteSeance()`/`validerDate(seanceId, date)` ajoutés à `ScenariosService` (web) ; `LinkSeancePollDto` remplacé par `CreateSeancePollDto`/`ValiderDateDto` dans `packages/shared`.
- Task 9 : `SeanceList` épisodique — créneaux calculés (`availableSlots()`) rendus comme boutons cliquables appelant `onValiderDate(seance.id, slot.date)` (AC4) ; bouton « Modifier la capacité » réaffiche le formulaire pré-rempli via `editingCapacitySeanceId` (AC6) ; bouton « Supprimer cette séance » visible pour le MJ sauf sur la première séance (`i > 0`), `window.confirm` avant suppression (AC5).
- Task 10 : `ScenarioTimeline` affiche la liste des séances (date résolue via `poll.chosenDate ?? inscription.dateValidee`, ou « Date à définir ») sur chaque carte, desktop et mobile — aucune refonte visuelle (hors scope explicite AC7).
- Suite finale (avant revue) : 611/611 tests API (+9 nets : createSeancePoll/deleteSeance ajoutés, linkSeancePoll retiré), 661/661 tests web (+16), `pnpm typecheck` (API) propre, aucune régression.
- Aucun item différé identifié pour cette story initialement — scope entièrement couvert par les 8 ACs.
- **Revue de code (2026-07-14)** : 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor) + retour utilisateur additionnel en marge de la revue. 4 décisions tranchées (AC1 corrigé, non-atomicité acceptée, suppression à date validée autorisée avec confirmation renforcée, retrait de `scenarioRef` confirmé) + 8 patches appliqués (voir `### Review Findings`) : suppression du flux « vote sans séance » (bouton retiré de `CalendarView`, `PollCreationComponent.seanceId` devenu `input.required`), confirmation renforcée à la suppression d'une séance à date validée, tie-breaker `id` sur `deleteSeance()`, garde `scenario.status === 'PASSE'` sur `deleteSeance()`, garde `id`/`isMjMode()` sur la lecture de `?seanceId=` dans `CalendarView`, message d'erreur distinct pour le cas de désynchronisation dans `PollCreationComponent`, bouton « Annuler » sur l'édition de capacité. Scope hors-périmètre du retour utilisateur (vote multi-dates pour l'épisodique, refonte de la vue Oracle multi-votes, bouton « supprimer la date validée ») élargi en nouvelle **Story 8-8** (`epics.md`, `sprint-status.yaml`), à faire juste après.
- Suite finale (après revue) : 613/613 tests API (+2 : garde PASSE, tie-breaker), 667/667 tests web (+6 : guards CalendarView, message désync, confirmation renforcée, bouton Annuler), `pnpm typecheck` (API) propre, aucune régression.

### File List

- `apps/api/src/poll/poll.module.ts` (modifié — `exports: [PollService]`)
- `apps/api/src/scenarios/scenarios.module.ts` (modifié — import `PollModule`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `createSeancePoll()`, `deleteSeance()`, `validerDate(date)` ; `linkSeancePoll()` retiré)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — tests migrés/ajoutés)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — routes `createSeancePoll`/`deleteSeance`/`validerDate`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — tests de routage)
- `apps/api/src/scenarios/dto/create-seance-poll.dto.ts` (nouveau)
- `apps/api/src/scenarios/dto/valider-date.dto.ts` (nouveau)
- `apps/api/src/scenarios/dto/link-seance-poll.dto.ts` (supprimé)
- `packages/shared/src/index.ts` (modifié — `CreateSeancePollDto`, `ValiderDateDto` remplacent `LinkSeancePollDto`)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `createSeancePoll()`, `deleteSeance()`, `validerDate(date)`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (modifié — retrait panneau vote, navigation calendrier, créneaux épisodiques, édition capacité, suppression séance)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.html` (modifié)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (modifié — `lockedSeanceId`, lecture `?seanceId=`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (modifié)
- `apps/web/src/app/features/poll/poll-creation/poll-creation.ts` (modifié — input `seanceId`, orchestration `ScenariosService`, retrait `scenarioRef`)
- `apps/web/src/app/features/poll/poll-creation/poll-creation.html` (modifié)
- `apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — `seanceDateLabel()`)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html` (modifié)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié)

## Change Log

- 2026-07-14 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`/`.module.ts`, `poll.service.ts`/`.controller.ts`/`.module.ts`, `seance-list.ts`/`.html`, `calendar-view.ts`/`.html`, `poll-creation.ts`/`.html`, `scenario-timeline.html`, `packages/shared/src/index.ts`, `ARCHITECTURE-SPINE.md` AD-1/AD-4/P2-AD-2, `deferred-work.md` section élargissement 8-7). **Décision d'architecture majeure documentée** : orchestration via une nouvelle méthode `ScenariosService.createSeancePoll` plutôt que l'extension littérale de `CreatePollDto`/`PollModule` demandée par le texte `epics.md`, pour préserver AD-1 (Scenarios propriétaire exclusif de Seance) et P2-AD-2 (PollModule generique, jamais étendu) sans casser le contrat déjà consommé par toute la suite de tests des Epics 1-3. Découverte : `PollModule` n'exporte actuellement aucun provider (`exports` absent), bloquant pour tout import cross-module — à corriger en premier lieu (Task 1).
- 2026-07-14 : Implémentation complète (bmad-dev-story). Décision d'architecture confirmée avec l'utilisateur après explication détaillée des deux options. 10 tasks, TDD red-green par task. 611/611 tests API + 661/661 tests web, `pnpm typecheck` propre, aucune régression. Status → `review`.
- 2026-07-14 : Revue de code (bmad-code-review, 3 couches adversariales) + retour utilisateur additionnel. 4 décisions tranchées, 8 patches appliqués (voir Completion Notes/Review Findings). Scope hors-périmètre élargi en nouvelle Story 8-8 (`epics.md`/`sprint-status.yaml`). 613/613 tests API + 667/667 tests web, `pnpm typecheck` propre. Status → `done`.
