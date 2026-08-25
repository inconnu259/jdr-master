---
baseline_commit: 51124d6
---

# Story 8.1: Participation aux scénarios

Status: done

## Story

As a joueur,
I want que ma participation à un scénario soit automatique en campagne linéaire ou choisie individuellement en campagne épisodique,
so that je participe à ce qui me concerne sans démarche inutile, ou je choisis librement mes enquêtes.

## Acceptance Criteria

1. **Given** une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` **When** un membre consulte la liste de participants d'un scénario **Then** elle reflète toujours l'intégralité des `Membership` actifs de la Partie (+ le MJ) — aucun `ScenarioParticipant` n'est jamais créé ni lu pour ce `kind`. **Déjà satisfait par le code existant** (`PartiesService.listMembers`/`GET /parties/:id/members`, consommé par `RosterRail`/`RosterStrip` sur la page Partie — Story 6.1) — vérification de non-régression uniquement, aucune modification de `ScenarioDto`/`ScenariosService` requise pour ce cas (cf. Dev Notes).
2. **Given** une Partie `CAMPAGNE_EPISODIQUE` **When** un joueur (membre ou MJ, cf. AD-9) appelle `POST /scenarios/:id/participate` **Then** un `ScenarioParticipant` (`scenarioId`, `userId`, `@@unique([scenarioId, userId])`) est créé — idempotent : un second appel du même joueur sur le même scénario ne crée pas de doublon ni n'échoue (`upsert`), la requête reste MJ+joueur (pas de restriction `getOwned`, tout membre viewable).
3. **Given** une Partie `CAMPAGNE_EPISODIQUE` **When** un joueur ignore un scénario (n'appelle jamais `participate`) **Then** aucun `ScenarioParticipant` n'est créé pour lui et son `Membership` (statut de membre de la Partie) n'est pas affecté — comportement garanti par construction : `participate()` ne touche jamais `Membership`.
4. **Given** une Partie `CAMPAGNE_EPISODIQUE` avec plusieurs scénarios `COURANT` en parallèle **When** un joueur appelle `participate` sur plusieurs d'entre eux **Then** aucune contrainte d'exclusivité ne l'en empêche — chaque appel crée sa propre ligne `ScenarioParticipant` (contrainte unique seulement sur `(scenarioId, userId)`, jamais sur `userId` seul).
5. **Given** un utilisateur non membre de la Partie (ni MJ, ni `Membership`) **When** il appelle `POST /scenarios/:id/participate` **Then** la requête échoue en `403 Forbidden` (`parties.getViewable`, même garde que les autres lectures/actions joueur — AD-9).
6. **Given** une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` **When** `POST /scenarios/:id/participate` est appelé malgré tout (contournement API direct) **Then** la requête échoue en `400 Bad Request` — la participation individuelle explicite n'a de sens que pour `CAMPAGNE_EPISODIQUE` (AD-4) ; aucun `ScenarioParticipant` n'est jamais créé pour les deux autres `kind`, même par appel direct.
7. **Given** un scénario `CAMPAGNE_EPISODIQUE` **When** n'importe quel membre de la Partie consulte `GET /parties/:id/scenarios` **Then** chaque `ScenarioDto` porte un champ `participants: { userId, pseudo }[]` reflétant les `ScenarioParticipant` actuels du scénario (pseudo résolu via `User`) ; pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, ce champ est `undefined` (jamais peuplé, cf. AC1/AD-4).
8. **Given** un scénario `CAMPAGNE_EPISODIQUE` sur la fiche joueur (`ScenarioReadDialog`) **When** le joueur ne participe pas encore (son `userId` absent de `scenario.participants`) **Then** un bouton « Participer à cette enquête » est visible (jamais pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, où la participation reste implicite et sans bouton) ; une fois cliqué, le joueur apparaît dans la liste des participants (rendue via `CharacterSummaryCard` pour chaque participant ayant un personnage dans la Partie) **sans rechargement de page** — le signal local du dialogue est réassigné avec le `ScenarioDto` retourné par `POST .../participate`, même mécanisme que `markCourant`/`close` (Story 7.6/7.7). Le bouton disparaît immédiatement après un appel réussi (le joueur est maintenant dans `participants`).

*(Source: epics.md Story 8.1, 6 ACs reformulées en Given/When/Then et complétées de 2 ACs (AC6 rejet 400 hors-épisodique, AC7 forme exacte du champ `participants` sur `ScenarioDto`) pour couvrir explicitement des points d'entrée backend absents du texte epics.md d'origine — même méthode que Stories 7.6/7.7.)*

## Tasks / Subtasks

- [x] **Task 1 — `packages/shared/src/index.ts` : `ScenarioDto.participants`** (AC7)
  - [x] Ajouter `participants?: { userId: string; pseudo: string }[];` à `ScenarioDto` (juste après `closedAt`) — optionnel, jamais peuplé pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE` (AC1/AC7), toujours un tableau (potentiellement vide) pour `CAMPAGNE_EPISODIQUE`. `import type` uniquement côté `apps/api`/`apps/web` (P1-AD-4), aucun changement à la convention.

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.service.ts` : `participate()` + `participants` sur les DTO** (AC2-AC7)
  - [x] `async participate(scenarioId: string, userId: string): Promise<ScenarioDto>` :
    - `findUnique` par `id` → `NotFoundException('Scénario introuvable')` si absent (même message que le reste du fichier).
    - `const partie = await this.parties.getViewable(scenario.partieId, userId);` (403 non-membre, AC5 — **pas** `getOwned`, action joueur AD-9).
    - `if (partie.kind !== 'CAMPAGNE_EPISODIQUE') throw new BadRequestException("La participation individuelle n'est disponible que pour les campagnes épisodiques");` (AC6, guillemets doubles — convention déjà utilisée pour les messages contenant une apostrophe, ex. `scenarios.service.ts:111,124`).
    - `await this.prisma.scenarioParticipant.upsert({ where: { scenarioId_userId: { scenarioId, userId } }, create: { scenarioId, userId }, update: {} });` — `upsert` plutôt que `create` : idempotence explicite (AC2, un second clic ne doit jamais lever de `P2002`/contrainte unique).
    - `const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });`
    - `return toDto(updated, partie.kind, await loadParticipants(this.prisma, scenarioId));`
  - [x] Nouvelle fonction module-level `async function loadParticipants(prisma: PrismaService, scenarioId: string): Promise<{ userId: string; pseudo: string }[]>` — `prisma.scenarioParticipant.findMany({ where: { scenarioId }, include: { user: { select: { pseudo: true } } } })`, mappé en `{ userId, pseudo }[]`.
  - [x] Ajouter `PartieKind` à l'import type existant en tête de fichier (`import type { PartieKind, ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';`).
  - [x] `toDto()` : signature étendue `function toDto(scenario: any, partieKind?: PartieKind, participants?: { userId: string; pseudo: string }[]): ScenarioDto` — ajoute `...(partieKind === 'CAMPAGNE_EPISODIQUE' && { participants: participants ?? [] })` au retour (spread conditionnel, cohérent avec le style déjà utilisé dans `update()`). Les appels existants (`create`/`update`/`open`/`markCourant`/`close`/`listDrafts`) qui n'ont pas besoin d'exposer `participants` continuent d'appeler `toDto(scenario)` sans 2ᵉ/3ᵉ argument — le champ reste `undefined`, **aucune régression** (le champ est optionnel côté `ScenarioDto`).
  - [x] `findAllForPartie()` : modifier pour peupler `participants` quand `partie.kind === 'CAMPAGNE_EPISODIQUE'` (AC7) — récupérer `const partie = await this.parties.getViewable(partieId, userId);` (déjà appelé, capturer la valeur de retour au lieu de l'ignorer), puis si `partie.kind === 'CAMPAGNE_EPISODIQUE'` : une requête groupée `prisma.scenarioParticipant.findMany({ where: { scenarioId: { in: scenarios.map((s) => s.id) } }, include: { user: { select: { pseudo: true } } } })`, regroupée en `Map<scenarioId, {userId,pseudo}[]>` (JS, pas de `groupBy` Prisma nécessaire — volume faible, cohérent avec le reste du module qui n'utilise pas d'agrégation SQL), puis `scenarios.map((s) => toDto(s, partie.kind, byScenario.get(s.id) ?? []))`. Pour les autres `kind`, garder `scenarios.map((s) => toDto(s, partie.kind))` (pas de requête `ScenarioParticipant` inutile — AC1, jamais lu pour ce `kind`).
  - [x] `scenarios.service.spec.ts` : nouveau `describe('participate()')` — création réussie (`CAMPAGNE_EPISODIQUE`, `scenarioParticipant.upsert` appelé avec les bons `where`/`create`) ; second appel du même joueur → `upsert` toujours appelé (pas de branche `create` séparée à mocker deux fois, vérifier absence d'exception) ; `ONE_SHOT`/`CAMPAGNE_LINEAIRE` (`it.each`) → `BadRequestException`, `scenarioParticipant.upsert` jamais appelé ; non-membre → `ForbiddenException` propagée par `getViewable`, aucune écriture Prisma après ; scénario introuvable → `NotFoundException`. Nouveau test dans `describe('findAllForPartie()')` (ou nouveau describe) : `CAMPAGNE_EPISODIQUE` avec 2 scénarios et des `ScenarioParticipant` variés → chaque `ScenarioDto.participants` contient exactement les bons `{userId,pseudo}` ; `CAMPAGNE_LINEAIRE`/`ONE_SHOT` → `participants` est `undefined` sur tous les DTO retournés, et `scenarioParticipant.findMany` n'est jamais appelé (assertion explicite, verrouille AC1/AD-4).

- [x] **Task 3 — `apps/api/src/scenarios/scenarios.controller.ts` : route `participate`** (AC2, AC5, AC6)
  - [x] `@Post('scenarios/:id/participate') participate(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser) { return this.scenarios.participate(scenarioId, user.id); }` — même pattern que `open()`/`markCourant()`/`close()` (pas de `@Body()`, aucun payload).
  - [x] `scenarios.controller.spec.ts` : ajouter `participate: jest.fn()` à `makeScenariosService()`, test de routage standard (`controller.participate('s1', user)` → `scenarios.participate` appelé avec `'s1', 'user1'`).

- [x] **Task 4 — `apps/web/src/app/core/scenarios/scenarios.service.ts` : `participate()`** (AC2, AC8)
  - [x] `async participate(scenarioId: string): Promise<ScenarioDto>` — copie exacte du pattern `markCourant()`/`close()` : `firstValueFrom(this.http.post<ScenarioDto>(\`${API_BASE}/scenarios/${scenarioId}/participate\`, {}, { withCredentials: true }))`, puis `this._changed.update((v) => v + 1)` avant de retourner (cohérence — `ScenarioTimeline` recharge sans F5 dans les autres onglets/composants).
  - [x] `scenarios.service.spec.ts` : un test supplémentaire, même pattern `HttpTestingController` que `markCourant`/`close` (vérifie la requête `POST .../participate`, corps vide).

- [x] **Task 5 — Threading de `partieKind` et `characters` vers `ScenarioReadDialog`** (AC8, plomberie requise pour rendre le bouton/la liste atteignables)
  - [x] `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` : ajouter `readonly partieKind = input.required<PartieKind>();` et `readonly characters = input<CharacterDto[]>([]);` (import `type { CharacterDto, PartieKind, ScenarioDto }` en tête). Dans `openDetail()`, la branche `dialog.open(...)` passe désormais `data: { scenario, partieKind: this.partieKind(), characters: this.characters() }`.
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (ligne ~211) : `<app-scenario-timeline [partieId]="p.id" [isMj]="isMj()" [partieKind]="p.kind" [characters]="characters()" />` — `characters` (signal déjà chargé, `partie-detail.ts:104`) et `p.kind` (déjà sur `PartieDto`) existent déjà, aucun nouveau chargement de données requis côté `partie-detail`.
  - [x] `scenario-timeline.spec.ts` : fournir `partieKind`/`characters` (valeurs par défaut `'ONE_SHOT'`/`[]`) dans le setup existant pour ne pas casser les tests actuels (input requis) ; un test vérifie que `dialog.open` reçoit bien `partieKind`/`characters` dans `data`.

- [x] **Task 6 — CTA « Participer à cette enquête » + liste des participants dans `ScenarioReadDialog`** (AC8)
  - [x] `scenario-read-dialog.ts` : étendre `ScenarioReadDialogData` avec `partieKind: PartieKind; characters: CharacterDto[]`. Remplacer `protected readonly scenario = computed(...)` par `protected readonly scenario = signal<ScenarioDto>(this.data.scenario);` (mutable, même bascule que `scenario-editor.ts` pour `markCourant`/`close`). Ajouter :
    - `protected readonly currentUserId = inject(AuthService).currentUser()?.id;`
    - `protected readonly isEpisodique = computed(() => this.data.partieKind === 'CAMPAGNE_EPISODIQUE');`
    - `protected readonly isParticipating = computed(() => (this.scenario().participants ?? []).some((p) => p.userId === this.currentUserId));`
    - `protected readonly participantCharacters = computed(() => { const ids = new Set((this.scenario().participants ?? []).map((p) => p.userId)); return this.data.characters.filter((c) => ids.has(c.userId)); });`
    - `protected readonly participantError = signal<string | null>(null);`
    - `protected async participate(): Promise<void> { this.participantError.set(null); try { this.scenario.set(await this.scenarios.participate(this.scenario().id)); } catch (err) { this.participantError.set(extractErrorMessage(err, 'Impossible de participer à ce scénario.')); } }` — injecter `ScenariosService`.
    - `extractErrorMessage` **n'est pas exporté** — `scenario-editor.ts:12` la définit en fonction module-level privée (non partagée). Dupliquer la même fonction (3 lignes, `HttpErrorResponse` + `err.error?.message`) en tête de `scenario-read-dialog.ts`, à l'identique — c'est le pattern déjà établi dans le codebase (aucun utilitaire partagé n'existe pour ça à ce jour), ne pas créer de nouveau fichier util pour une seule réutilisation supplémentaire (YAGNI, hors scope de cette story).
  - [x] `scenario-read-dialog.html` : dans `mat-dialog-content`, après le bloc `@if (isPasse())`, ajouter (visible seulement `@if (isEpisodique())`) :
    ```html
    @if (isEpisodique()) {
      <section class="participants">
        <h3>Participants</h3>
        @if (participantCharacters().length > 0) {
          @for (c of participantCharacters(); track c.id) {
            <app-character-summary-card [character]="c" />
          }
        }
        @if (!isParticipating()) {
          <button mat-button type="button" (click)="participate()">Participer à cette enquête</button>
        }
        @if (participantError()) {
          <p class="error">{{ participantError() }}</p>
        }
      </section>
    }
    ```
    Ajouter `CharacterSummaryCard` aux `imports` du composant.
  - [x] `scenario-read-dialog.spec.ts` : `ONE_SHOT`/`CAMPAGNE_LINEAIRE` → section `participants`/bouton absents (vérifier `isEpisodique()` false) ; `CAMPAGNE_EPISODIQUE`, utilisateur non participant → bouton visible, clic → `scenariosService.participate` appelé, `scenario()` réassigné avec le DTO retourné (`participants` incluant le nouvel utilisateur), bouton disparaît (`isParticipating()` devient `true`) sans rechargement ; échec (mock rejeté) → `participantError()` affiche le message serveur, `scenario()` inchangé ; un participant sans personnage dans `characters` n'affiche aucune `CharacterSummaryCard` pour lui (liste filtrée par `userId`, pas d'entrée fantôme).

### Review Findings

- [x] [Review][Patch] `currentUserId` capturé une seule fois à l'injection (`inject(AuthService).currentUser()?.id`) au lieu d'un `computed()` réactif — si le signal `AuthService.currentUser()` change après la construction du composant (ex. session restaurée en asynchrone après ouverture du dialogue), `currentUserId` reste figé sur `undefined`/une ancienne valeur et `isParticipating()` compare contre un identifiant obsolète [apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts:23] — **corrigé** : `currentUserId` est désormais `computed(() => this.auth.currentUser()?.id)`, réactif au signal. 13/13 tests `scenario-read-dialog.spec.ts` passants.
- [x] [Review][Defer] Aucun garde anti-double-clic / état de chargement sur le CTA « Participer à cette enquête » [apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts:59] — deferred, pre-existing (même limitation déjà différée pour les CTA « Marquer comme Courant »/« Clôturer le scénario », Stories 7.6/7.7 — un double-clic est idempotent côté backend via `upsert`, juste un appel réseau redondant)
- [x] [Review][Defer] `participantError` n'est jamais réinitialisée lors d'un rechargement externe du scénario [apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts:57] — deferred, pre-existing (même limitation déjà différée pour `markCourantError`/`closeError`, Stories 7.6/7.7)

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-4 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > `ScenarioParticipant` n'est **jamais** peuplé/lu pour une Partie `ONE_SHOT`/`CAMPAGNE_LINEAIRE` — sa liste de participants est toujours dérivée en direct de `PartiesService`/`Membership` (implicite = tous les membres). `ScenarioParticipant` n'existe que pour `CAMPAGNE_EPISODIQUE` (choix individuel explicite, FR-18).

  Conséquence directe : **AC1 ne demande aucun code nouveau** — `GET /parties/:id/members` (existant, `PartiesService.listMembers`) et `RosterRail`/`RosterStrip` (existants, Story 6.1) couvrent déjà l'affichage "participants = tous les membres" pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`. Ne pas créer de deuxième chemin de lecture qui dupliquerait cette logique dans `ScenariosModule`.

- **AD-9 (verbatim, rappel)** :
  > Actions joueur (voter, s'inscrire à une séance, choisir un scénario épisodique — FR-18) = tout membre participant, pas de restriction MJ, vérifiée via appartenance simple (pas un troisième pattern — réutilise la vérification de `Membership` déjà faite par `PartiesService`).

  `participate()` utilise **`getViewable`, jamais `getOwned`** — le MJ peut aussi appeler cet endpoint sans erreur logique (il est toujours "viewable" sur sa propre Partie), même si l'UI ne lui présente jamais le bouton (le MJ ne consulte pas `ScenarioReadDialog` pour `COURANT`/`A_VENIR`/`BROUILLON`, cf. `ScenarioTimeline.openDetail()`, Story 7.6/7.7 — seul `PASSE` l'y amène, où participer n'a plus de sens mais n'est pas explicitement bloqué par cette story, cf. Hors scope).

- **P1-AD-3 (rappel, hérité)** : `PartiesService.getOwned`/`getViewable` reste le seul point de vérité d'appartenance/rôle — aucun nouveau guard NestJS, `participate()` suit ce pattern à l'identique.

- **`[ASSUMPTION]` — rejet `400` hors `CAMPAGNE_EPISODIQUE` (AC6)** : le texte epics.md ne définit un comportement que pour `CAMPAGNE_EPISODIQUE` (AC2-AC4) ; il ne dit rien du comportement de `participate` sur `ONE_SHOT`/`CAMPAGNE_LINEAIRE`. Cette story choisit un rejet explicite `BadRequestException` (cohérent avec le style déjà établi par `create()` qui rejette la création de scénario supplémentaire sur `ONE_SHOT`, et par `update()`/`uploadDocument()` qui rejettent les écritures sur `PASSE`) plutôt qu'un no-op silencieux — un no-op masquerait un bug frontend (bouton affiché par erreur pour le mauvais `kind`) au lieu de le signaler.

- **`[ASSUMPTION]` — idempotence via `upsert` (AC2)** : le texte epics.md dit seulement "un `ScenarioParticipant` ... est créé", sans préciser le comportement d'un second appel du même joueur (double-clic réseau lent, ou clic répété si le premier appel échoue silencieusement côté réseau). Le pattern `create()` simple lèverait une erreur Prisma `P2002` (contrainte unique) non gérée, qui remonterait en `500` — mauvaise UX pour un cas plausible (pas une race concurrente comme AD-5, juste un rejeu). `upsert` avec `update: {}` est la solution la plus simple qui rend l'opération idempotente sans branche supplémentaire ; cohérent avec l'esprit "pas de sur-ingénierie" d'AD-3.

- **`[ASSUMPTION]` — visibilité du bouton indépendante du statut anti-spoil (AC8)** : le texte epics.md ne restreint le bouton « Participer à cette enquête » à aucun `ScenarioStatus` précis (contrairement à `markCourant`/`close`, qui sont strictement conditionnés par `status`). Cette story affiche le bouton dès que `partieKind === 'CAMPAGNE_EPISODIQUE'`, y compris pour un scénario `A_VENIR` (`isRestricted() === true`, titre seul visible) — participer à une enquête ne révèle aucun contenu protégé par l'anti-spoil (AD-6 porte sur description/documents/participants, pas sur l'acte de rejoindre), donc rien n'empêche un joueur de s'inscrire avant l'ouverture complète du contenu. `BROUILLON` n'atteint de toute façon jamais `ScenarioReadDialog` côté joueur (filtré par `ScenarioTimeline`, AD-6). Backend ne valide aucune contrainte de statut sur `participate()` (aucune AC epics.md ne le demande) — seule la contrainte de `kind` (AC6) est appliquée.

- **`[ASSUMPTION]` — `CharacterSummaryCard` filtré par personnage possédé, pas par participant brut (AC8)** : le texte epics.md mentionne `CharacterSummaryCard` sans préciser le mapping exact `ScenarioParticipant` → `CharacterDto`. Comme `CharacterDto.userId` identifie déjà le propriétaire (pattern existant, `partie-detail.ts:122` `characters().filter((c) => c.userId === userId)`), cette story applique le même filtre : la liste affichée est `characters` (déjà chargés par `partie-detail`, un seul fetch, threadé en `input`) filtrés sur les `userId` présents dans `scenario.participants`. Un participant sans personnage encore créé dans la Partie n'affiche simplement aucune carte (pas de fallback pseudo-texte dans le rendu — accepté comme edge case mineur, aucune AC epics.md ne l'exige explicitement ; le pseudo reste disponible dans `scenario.participants[].pseudo` si un futur ajustement veut l'exploiter).

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** — pattern `updateMany`/retour DTO déjà établi par `close()` (Story 7.7) — **non réutilisé tel quel ici** (pas de transition de statut concurrente à protéger, juste une création idempotente), mais le style `findUnique` → `getViewable`/`getOwned` → validation → écriture → `toDto(...)` reste la structure de référence pour `participate()`.

**`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** — `markCourant()`/`close()` (lignes ~126-140), pattern exact à répliquer pour `participate()` dans `ScenarioReadDialog` (signal réassigné avec le DTO retourné, erreur via `extractErrorMessage`) :
```ts
protected async markCourant(): Promise<void> {
  const s = this.scenario();
  if (!s || s.status !== 'A_VENIR') return;
  this.markCourantError.set(null);
  try {
    this.scenario.set(await this.scenarios.markCourant(s.id));
  } catch (err) {
    this.markCourantError.set(extractErrorMessage(err, 'Impossible de marquer ce scénario comme Courant.'));
  }
}
```

**`apps/web/src/app/features/parties/roster-rail/roster-rail.ts`** — pattern déjà établi pour associer `CharacterDto[]` à des `userId` (`buildRosterRows`, filtre `characters().filter((c) => c.userId === userId)` dans `partie-detail.ts:122`) — même filtre à répliquer pour `participantCharacters` dans `ScenarioReadDialog`, pas de nouvelle abstraction.

**`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** — `openDetail()` actuel (post-Story 7.7), branche `dialog.open` à étendre avec les nouvelles données :
```ts
this.dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, {
  data: { scenario },
});
```
devient `data: { scenario, partieKind: this.partieKind(), characters: this.characters() }`.

### Hors scope explicite de cette story (ne pas implémenter)

- Toute UI/logique de `Seance`/`Inscription`/vote de date — Epic 8, Stories 8.2/8.3.
- Tout blocage backend de `participate()` selon le statut du scénario (`BROUILLON`/`A_VENIR`/`PASSE`) — aucune AC epics.md ne le demande ; seule la contrainte de `kind` (AC6) est appliquée (cf. `[ASSUMPTION]` ci-dessus).
- Retrait/« dé-participation » (`DELETE` sur `ScenarioParticipant`) — non demandé par les ACs epics.md (« il peut être participant de plusieurs scénarios simultanément » ne mentionne aucun mécanisme de retrait) ; le bouton n'a qu'un sens (rejoindre), jamais de bascule bidirectionnelle dans cette story.
- Fallback d'affichage pseudo-texte pour un participant sans personnage (cf. `[ASSUMPTION]` `CharacterSummaryCard`).
- Compte-rendu de séance, résumé de fin, association journal — Stories 8.4/8.5/8.6.

### Project Structure Notes

- Aucun nouveau fichier backend — cette story modifie exclusivement `scenarios.service.ts`/`.spec.ts` et `scenarios.controller.ts`/`.spec.ts` (déjà créés par les Stories 7.1/7.4/7.5/7.6/7.7). Aucune nouvelle DTO (`participate` n'a pas de corps de requête).
- Aucune migration Prisma — `ScenarioParticipant` existe déjà dans `schema.prisma` (migration `scenarios_seances_p4`, confirmé par lecture directe, ligne 432-440) avec `@@unique([scenarioId, userId])` déjà en place.
- Frontend : un seul champ ajouté à `ScenarioDto` (`packages/shared`), un nouveau signal côté `scenarios.service.ts`, extension de `ScenarioReadDialogData`/`ScenarioTimeline` (inputs supplémentaires threadés depuis `partie-detail.ts`, données déjà chargées côté parent — aucun nouveau service HTTP frontend créé au-delà de la méthode `participate()`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1] — texte d'origine de la story et 6 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-4, #AD-9, #P1-AD-3] — mécanisme de participation épisodique jamais fusionné avec `Membership`, accès joueur via appartenance simple, `PartiesService` seul point de vérité.
- [Source: apps/api/prisma/schema.prisma:37-41,77-86,380-399,432-440] — `PartieKind`, `Membership`, `Scenario`, `ScenarioParticipant` déjà présents, aucune migration requise.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `create()`/`update()`/`open()`/`markCourant()`/`close()`/`findAllForPartie()`/`toDto()` lus intégralement ; `getOwned`/`getViewable` déjà le seul pattern d'accès utilisé.
- [Source: apps/api/src/scenarios/scenarios.controller.ts] — pattern de route `@Patch('scenarios/:id/<action>')` sans corps à répliquer pour `@Post('scenarios/:id/participate')`.
- [Source: apps/api/src/parties/parties.service.ts:68-96] — `getOwned`/`getViewable`/`listMembers` lus intégralement ; `listMembers` déjà suffisant pour AC1 (aucune modification).
- [Source: packages/shared/src/index.ts:98-141] — section "Palier 4 (suite) : Scénarios", `ScenarioDto`/`PartieKind` existants, aucun autre type partagé requis.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `markCourant()`/`close()`/`_changed.update` à répliquer pour `participate`.
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts, .html] — état actuel lu intégralement (`isRestricted`/`isPasse`, `scenario` actuellement un `computed` immuable) — bascule requise en `signal` mutable pour AC8.
- [Source: apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts, .html] — `openDetail()` lu intégralement ; seule la branche `dialog.open(...)` change (data enrichie), aucune autre logique de routage modifiée.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts:100-122, .html:211] — `characters` (signal déjà chargé) et `partie().kind` déjà disponibles côté parent, à threader en inputs sans nouveau chargement de données.
- [Source: apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts] — composant existant réutilisé tel quel (`character: CharacterDto` en input), aucune modification.
- [Source: apps/web/src/app/features/parties/roster-rail/roster-rail.ts] — pattern de filtrage `characters` par `userId` déjà établi, répliqué pour `participantCharacters`.
- [Source: apps/web/src/app/core/auth/auth.service.ts] — `AuthService.currentUser()` signal déjà utilisé ailleurs (`partie-detail.ts:117,121`) pour dériver l'identité du viewer côté frontend.
- [Source: 7-6-passer-scenario-courant.md, 7-7-cloturer-scenario.md] — intelligence des stories précédentes : convention `[ASSUMPTION]` pour les décisions non figées par epics.md, pattern signal mutable + `extractErrorMessage` pour les CTA de mutation, décision de threading de données parent→enfant plutôt que duplication de fetch.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `participate()` réutilise `upsert` (pas `create`) pour garantir l'idempotence AC2 sans branche supplémentaire — un second appel du même joueur sur le même scénario est un no-op silencieux côté DB (`update: {}`), jamais une erreur `P2002`.
- `toDto()` étendu avec deux paramètres optionnels (`partieKind`, `participants`) plutôt qu'un objet de config — cohérent avec le style existant, tous les appels préexistants (`create`/`update`/`open`/`markCourant`/`close`/`listDrafts`) continuent d'appeler `toDto(scenario)` sans régression (le champ `participants` reste `undefined` par défaut, optionnel dans `ScenarioDto`).
- `findAllForPartie()` : une seule requête groupée `scenarioParticipant.findMany({ scenarioId: { in: [...] } })` pour tous les scénarios d'une Partie épisodique, regroupée en `Map` côté JS — évite le N+1, cohérent avec l'absence d'agrégation SQL ailleurs dans ce module.
- `ScenarioReadDialog.scenario` basculé de `computed(...)` immuable à `signal<ScenarioDto>(...)` mutable — même bascule que `scenario-editor.ts` pour `markCourant`/`close` (Story 7.6/7.7), nécessaire pour réassigner le DTO retourné par `participate()` sans rechargement de page.
- `extractErrorMessage` dupliquée dans `scenario-read-dialog.ts` (fonction privée non exportée depuis `scenario-editor.ts`) — pattern déjà établi dans le codebase, pas de nouvel utilitaire partagé créé pour une seule réutilisation supplémentaire (YAGNI).
- Threading `partieKind`/`characters` : `partie-detail.ts` possédait déjà le signal `characters` et `partie().kind` — aucun nouveau chargement de données, seulement deux inputs supplémentaires sur `ScenarioTimeline` et l'extension de `ScenarioReadDialogData`.
- Suite complète (après implémentation) : 29 suites / 518 tests API (+10 : 5 `participate()` + 2 `findAllForPartie()` AC7 + 1 routage contrôleur), 61 suites / 543 tests web (+11 : 1 `scenarios.service` `participate` + 6 `scenario-read-dialog` participation + 1 `scenario-timeline` data threading + comptage net). Aucune régression.

### Completion Notes List

- Backend : `ScenariosService.participate(scenarioId, userId)` (nouvel endpoint `POST /scenarios/:id/participate`) — MJ+joueur (`getViewable`), réservé `CAMPAGNE_EPISODIQUE` (400 sinon), `upsert` idempotent sur `ScenarioParticipant`. `toDto()`/`findAllForPartie()` étendus pour peupler `participants: { userId, pseudo }[]` uniquement pour `CAMPAGNE_EPISODIQUE` (jamais pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, AD-4).
- Frontend service : `ScenariosService.participate(scenarioId)` — même convention que `markCourant()`/`close()` (`_changed` incrémenté).
- `ScenarioTimeline` : nouveaux inputs `partieKind`/`characters` threadés depuis `partie-detail.ts` (données déjà chargées côté parent, aucun nouveau fetch), transmis à `ScenarioReadDialog` via `data`.
- `ScenarioReadDialog` : nouveau CTA « Participer à cette enquête » + liste de `CharacterSummaryCard` des participants, visible uniquement pour `CAMPAGNE_EPISODIQUE`, indépendamment du statut anti-spoil (rejoindre ne révèle aucun contenu protégé, AD-6). Signal `scenario` mutable pour mise à jour réactive sans rechargement.
- AC1 (participants = tous les membres pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`) confirmée déjà satisfaite par le code existant (`PartiesService.listMembers`/`RosterRail`, Story 6.1) — aucun code ajouté, non-régression uniquement.
- 8 acceptance criteria couvertes : AC1 (non-régression), AC2 (création idempotente), AC3 (Membership non affecté par construction), AC4 (pas d'exclusivité, contrainte unique sur (scenarioId,userId) seulement), AC5 (403 non-membre), AC6 (400 hors-épisodique), AC7 (champ `participants` sur `ScenarioDto`), AC8 (CTA + liste réactive).
- 518/518 tests API + 543/543 tests web passent, aucune régression.

### File List

- `packages/shared/src/index.ts` (modifié — `ScenarioDto.participants`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `participate()`, `loadParticipants()`, `toDto()` étendu, `findAllForPartie()` étendu)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — `describe('participate()')`, tests `findAllForPartie()` AC7, mock `scenarioParticipant`)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `POST scenarios/:id/participate`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mock `participate` ajouté, 1 nouveau test de routage)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `participate()`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — 1 nouveau test)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — inputs `partieKind`/`characters`, `openDetail()` étendu)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié — setup + assertions `dialog.open` mis à jour)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — `[partieKind]`/`[characters]` sur `app-scenario-timeline`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié — `ScenarioReadDialogData` étendue, CTA `participate()`, signal mutable)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié — section participants conditionnelle)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — setup avec `ScenariosService`/`AuthService` mockés, 6 nouveaux tests)

## Change Log

- 2026-07-13 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`, `scenario-read-dialog.ts`/`.html`, `scenario-timeline.ts`/`.html`, `partie-detail.ts`/`.html`, `roster-rail.ts`, `character-summary-card.ts`, `ARCHITECTURE-SPINE.md` AD-4/AD-9, `schema.prisma`, `packages/shared/src/index.ts`, intelligence Stories 7.6/7.7 — premier travail réellement neuf de l'Epic 8 : `ScenarioParticipant` existe déjà en base (migration `scenarios_seances_p4`) mais aucun code service/controller/frontend ne le lit ni ne l'écrit avant cette story).
- 2026-07-13 : Implémentation complète de la Story 8.1 (`ScenariosService.participate()` avec `upsert` idempotent, route `POST /scenarios/:id/participate`, service frontend `participate`, threading `partieKind`/`characters` `ScenarioTimeline`→`ScenarioReadDialog`, CTA « Participer à cette enquête » + liste de participants — 8 ACs couvertes dont AC1 vérifiée en non-régression, 518/518 tests API + 543/543 tests web passants, aucune régression).
