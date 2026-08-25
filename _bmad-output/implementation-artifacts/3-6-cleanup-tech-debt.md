---
baseline_commit: "864f7809cb5d752557dc4c6b2956e85d5a3da351"
---

# Story 3.6 : Tech debt & bugfixes Epic 3 (defers groupés)

Status: done

## Story

As the dev team,
We want to address all deferred findings from Epic 3 (stories 3-1 à 3-5) that can be implemented now,
So that le module de vote de date est robuste et cohérent avant d'attaquer le prochain palier.

Items explicitement **exclus** de cette story car bloqués sur un travail futur non encore planifié (voir `deferred-work.md`) :
- Suppression de compte MJ → désactivation de partie (`status: DISABLED`) : nécessite un futur epic "Gestion des comptes".
- MJ supprimé silencieusement exclu des participants (review 2-2) : même cause racine que le point précédent.
- Signal partagé `activePoll` entre flux joueur/MJ dans `CalendarView` (review 3-4) : nécessite une investigation architecturale dédiée.
- Incohérence de type Date (UTC/local) entre vue semaine et vue mois (review 1-8) : nécessite un refactor des vues calendrier.

## Acceptance Criteria

**AC1** — Given un poll déjà `CLOSED`, When le MJ appelle `close()` dessus à nouveau, Then l'API répond `400 BadRequestException` au lieu de ré-écrire silencieusement le même état.

**AC2** — Given la création d'un poll qui doit fermer un poll `OPEN` existant (règle AD-4) puis créer le nouveau, When deux requêtes de création concurrentes arrivent, Then les opérations findFirst/updateMany/create s'exécutent dans une transaction Prisma atomique (`$transaction`), éliminant la fenêtre de race entre la fermeture de l'ancien poll et la création du nouveau.

**AC3** — Given un payload `CreatePollDto` contenant deux options avec la même paire `(date, slot)`, When le MJ soumet la création du poll, Then l'API rejette la requête avec une erreur de validation explicite au lieu de créer des options dupliquées.

**AC4** — Given le composant `PollCreationComponent`, When on inspecte `isValid` et `totalSelected`, Then ce sont des `computed()` Angular (pas des getters simples), cohérent avec le reste de la codebase signals.

**AC5** — Given `PollCreationComponent.checkedSlots`, When l'utilisateur coche/décoche des créneaux pré-sélectionnés après un changement de la liste `preselectedSlots` (ex. `loadMoreSlots()`), Then l'identité du créneau coché est basée sur `(date, slot)` et non sur un index de tableau fragile.

**AC6** — Given un membre qui a déjà répondu à toutes les options d'un poll `OPEN` de l'une de ses parties, When il consulte le dashboard, Then cette partie n'est plus comptée dans le badge "vote(s) en attente" (le badge ne compte que les polls où l'utilisateur courant a encore au moins une option sans réponse).

**AC7** — Given une option de poll avec 0 vote, When le MJ clique sur "Sceller ce créneau" pour cette option, Then le dialogue de confirmation affiche un avertissement explicite indiquant qu'aucun membre n'a voté pour cette date.

**AC8** — Given `PollStatusPanel.isAllYes(opt)`, When le poll est `CLOSED`, Then la méthode retourne `false` (elle ne doit pas continuer à mettre en avant visuellement une option "tout le monde a dit oui" une fois le vote clôturé).

**AC9** — Given les specs `auth.service.spec.ts`, `parties.service.spec.ts` et `poll.service.spec.ts`, When on inspecte les assertions `http.expectOne(...)`, Then elles utilisent la constante partagée `API_BASE` au lieu de la chaîne littérale `'http://localhost:3000'`.

## Tasks / Subtasks

### Backend

- [x] **Task 1 — AC1 : `close()` rejette un poll déjà fermé**
  - Fichier : `apps/api/src/poll/poll.service.ts` (méthode `close`, lignes 92-100)
  - Avant :
    ```ts
    async close(partieId: string, pollId: string, userId: string): Promise<void> {
      await this.parties.getOwned(partieId, userId);
      const poll = await this.prisma.sessionPoll.findUnique({ where: { id: pollId } });
      if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
      await this.prisma.sessionPoll.update({
        where: { id: pollId },
        data: { status: 'CLOSED' },
      });
    }
    ```
  - Après :
    ```ts
    async close(partieId: string, pollId: string, userId: string): Promise<void> {
      await this.parties.getOwned(partieId, userId);
      const poll = await this.prisma.sessionPoll.findUnique({ where: { id: pollId } });
      if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
      if (poll.status !== 'OPEN') throw new BadRequestException('Le poll est déjà fermé');
      await this.prisma.sessionPoll.update({
        where: { id: pollId },
        data: { status: 'CLOSED' },
      });
    }
    ```
  - Test : `apps/api/src/poll/poll.service.spec.ts` — cas "close() sur un poll déjà CLOSED lève BadRequestException".

- [x] **Task 2 — AC2 : `create()` atomique via `$transaction`**
  - Fichier : `apps/api/src/poll/poll.service.ts` (méthode `create`, lignes 20-47)
  - Remplacer les 3 appels séparés (`findFirst` → `updateMany` → `create`) par `this.prisma.$transaction(async (tx) => { ... })`, en utilisant `tx` à la place de `this.prisma` à l'intérieur du callback pour les 3 opérations. Conserver le comportement identique (fermer le poll OPEN existant s'il y en a un, puis créer le nouveau avec `POLL_INCLUDE`).
  - Test : vérifier que le test existant "AD-4 : ferme le poll OPEN existant" passe toujours ; pas de nouveau test nécessaire si le mock Prisma existant supporte `$transaction` (sinon ajouter un mock minimal `$transaction: (fn) => fn(prismaMock)`).

- [x] **Task 3 — AC3 : validation des doublons `(date, slot)`**
  - Fichiers : `apps/api/src/poll/dto/create-poll.dto.ts`, `apps/api/src/poll/poll.service.ts`
  - Ajouter un validateur custom `class-validator` (`@ValidateIf` + méthode statique, ou un décorateur `@Validate(NoDuplicateOptions)`) sur `CreatePollDto.options`, ou plus simplement une vérification explicite en début de `create()` :
    ```ts
    const seen = new Set<string>();
    for (const o of dto.options) {
      const key = `${o.date}|${o.slot}`;
      if (seen.has(key)) throw new BadRequestException('Options dupliquées (même date et créneau)');
      seen.add(key);
    }
    ```
    Préférer cette approche service-level (plus simple, cohérente avec les autres validations métier déjà faites dans `PollService`, ex. AD-4).
  - Test : `apps/api/src/poll/poll.service.spec.ts` — cas "create() avec deux options (date,slot) identiques lève BadRequestException".

### Frontend

- [x] **Task 4 — AC4 : `isValid`/`totalSelected` en `computed()`**
  - Fichier : `apps/web/src/app/features/poll/poll-creation/poll-creation.ts` (lignes 61-67)
  - Avant :
    ```ts
    protected get totalSelected(): number {
      return this.checkedSlots().size + this.customSlots().filter(c => c.date).length;
    }

    protected get isValid(): boolean {
      return this.totalSelected >= 2 && this.totalSelected <= 40;
    }
    ```
  - Après :
    ```ts
    protected readonly totalSelected = computed(() =>
      this.checkedSlots().size + this.customSlots().filter(c => c.date).length,
    );

    protected readonly isValid = computed(() =>
      this.totalSelected() >= 2 && this.totalSelected() <= 40,
    );
    ```
  - Mettre à jour tous les appels côté template (`poll-creation.html`) et code (`this.totalSelected` → `this.totalSelected()`, `this.isValid` → `this.isValid()`).
  - Test : `poll-creation.spec.ts` existant doit continuer à passer sans modification de logique (juste vérifier les invocations en tant que fonctions si le test accède directement à ces membres).

- [x] **Task 5 — AC5 : `checkedSlots` par identité de créneau**
  - Fichier : `apps/web/src/app/features/poll/poll-creation/poll-creation.ts`
  - Remplacer `signal<Set<number>>` par `signal<Set<string>>` où la clé est `` `${date}|${slot}` ``. Adapter `toggleSlot`, `onSubmit` (construction de `options` depuis `checkedSlots()`) et le template (`poll-creation.html`, boucle `@for` sur `visiblePreselected()`) pour utiliser cette clé au lieu de l'index.
  - Test : `poll-creation.spec.ts` — ajouter un cas "un créneau coché reste coché après `loadMoreSlots()` même si la liste affichée change d'ordre/longueur".

- [x] **Task 6 — AC6 : badge dashboard ne compte que les polls avec réponse en attente pour l'utilisateur courant**
  - Fichier : `apps/web/src/app/core/poll/open-polls.service.ts`
  - Injecter `AuthService`. Dans `refresh()`, ne conserver dans `map` que les polls où `poll.options.some(opt => !opt.votes.some(v => v.userId === currentUserId))` (utiliser un helper dans `poll.util.ts` si pertinent, ex. `hasUnansweredOptions(poll, userId)`).
  - Test : `open-polls.service.spec.ts` — ajouter un cas "count() exclut une partie dont le poll OPEN a déjà été entièrement répondu par l'utilisateur courant".

- [x] **Task 7 — AC7 : avertissement 0-vote sur "Sceller ce créneau"**
  - Fichier : `apps/web/src/app/features/poll/poll-status/poll-status.ts` (méthode `onChooseClick`)
  - Dans le message du dialogue de confirmation, ajouter une clause quand `opt.votes.length === 0`, ex. :
    ```ts
    const warning = opt.votes.length === 0 ? ' ⚠️ Aucun membre n\'a voté pour cette date.' : '';
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        message: `Confirmer ${this.formatDate(opt.date)} — ${SLOT_LABELS[opt.slot]} comme date de la prochaine séance ?${warning}`,
        confirmLabel: this.theme.tone()['cta.choose_date'],
      },
    });
    ```
  - Test : `poll-status.spec.ts` — cas "onChooseClick sur une option à 0 vote inclut l'avertissement dans le message du dialogue".

- [x] **Task 8 — AC8 : `isAllYes()` false si le poll est fermé**
  - Fichier : `apps/web/src/app/features/poll/poll-status/poll-status.ts`
  - `isAllYes` est une méthode d'instance sans accès direct à `poll()` dans sa signature actuelle (`isAllYes(opt: PollOptionDto)`) — lui faire lire `this.poll().status` :
    ```ts
    protected isAllYes(opt: PollOptionDto): boolean {
      return this.poll().status === 'OPEN' && opt.votes.length > 0 && opt.votes.every(v => v.answer === 'YES');
    }
    ```
  - Test : `poll-status.spec.ts` — cas "isAllYes retourne false si le poll est CLOSED même si tous les votes sont YES".

- [x] **Task 9 — AC9 : `API_BASE` dans les specs au lieu de l'URL en dur**
  - Fichiers : `apps/web/src/app/core/auth/auth.service.spec.ts`, `apps/web/src/app/core/parties/parties.service.spec.ts`, `apps/web/src/app/core/poll/poll.service.spec.ts`
  - Importer `API_BASE` depuis `../api-base` et remplacer chaque `'http://localhost:3000/...'` par `` `${API_BASE}/...` ``.
  - Aucun nouveau test nécessaire — les specs existantes valident déjà le comportement, seule la constante change.

## Dev Notes

### Ce qui NE doit PAS changer

- Le chargement inconditionnel de `activePoll` dans `CalendarView.ngOnInit()` (mode personnel ET mode MJ) : c'était initialement suspecté comme un bug potentiel (guard manquant en mode personnel), mais vérifié faux-positif — `activePoll` est bien utilisé en mode personnel pour `<app-poll-response>` (`calendar-view.html` ligne 92-95). Ne pas ajouter de garde.
- `PollResponseComponent.onConfirm()` : le check `isClosed()` en tête de fonction est suffisant côté UX ; le serveur (`PollService.castVote`) revalide déjà `poll.status !== 'OPEN'` et rejette avec `BadRequestException` — pas de re-check supplémentaire à ajouter.
- L'`effect()` de `PollResponseComponent` qui resynchronise `pendingAnswers` uniquement sur changement de `currentUser()` (avec lecture `untracked` de `poll()`) : comportement documenté et déjà commenté intentionnellement dans le code (ligne 43-48). Le risque théorique de non-resynchronisation sur remplacement d'instance de poll est jugé trop marginal/spéculatif pour ce lot.
- `OpenPollsService.refresh()` : l'absorption silencieuse des échecs `getCurrentPoll` via `Promise.allSettled` est cohérente avec le pattern déjà utilisé pour `loadHeatmap` (`calendar-view.ts` ligne 268-272, commentaire "non-bloquant"). Ne pas ajouter de log/erreur.
- La fusion des deux requêtes DB dans `getAvailableSlots` (`findUnique(partie)` + `resolveParticipants`) : optimisation identifiée mais nécessite un refactor de `resolveParticipants` (partagé avec `getHeatmap`) — hors scope de ce lot, à traiter séparément si le besoin de perf se confirme.
- Les items suivants du même deferred-work.md, déjà résolus par la story `2-7-cleanup-tech-debt` — **ne pas les retraiter** : weeks max réduit à 16 (`@Max(16)` dans `get-available-slots.dto.ts`, confirmé présent), `DEFAULT_WEEKS` extraite dans le contrôleur (confirmé présent, `parties.controller.ts:21`), weekday lowercase (AC7 de 2-7), pattern `effect()` pour `loadLinks()` (déjà en place dans `partie-detail.ts:75-77`), UTC-midnight calendar-month-view (Q8 de 2-7).
- `PollCreationComponent.mjSlots` (pagination/virtual scroll), `/guild-calendar` accessible par URL directe, `scenarioRef` en champ non-signal : items jugés de valeur trop faible/subjective pour ce lot, laissés en `deferred-work.md` sans priorité fixée.

### Contexte

- Toutes les stories Epic 3 (3-1 à 3-5) sont `done`. `epic-3.status` repasse à `in-progress` pour la durée de cette story, puis redevient `done` une fois celle-ci terminée.
- Baseline : commit `864f7809cb5d752557dc4c6b2956e85d5a3da351` (dernier commit avant cette story).
- Suivre le pattern établi par `2-7-cleanup-tech-debt.md` : tâches groupées backend d'abord, puis frontend, chaque tâche = 1 AC = 1 test minimum.

## Dev Agent Record

### Debug Log

- Le mock Prisma des tests `poll.service.spec.ts` (API) ne fournissait pas `$transaction` ; ajouté `prisma.$transaction = jest.fn((fn) => fn(prisma))` pour que le callback de la Task 2 s'exécute avec le même mock en guise de `tx`, sans changer le comportement des tests existants (`findFirst`/`updateMany`/`create` restent sur le même objet).
- `docker compose exec api pnpm lint` (avec `--fix`) a reformaté des fichiers non liés à cette story (`availability.service.spec.ts`, `get-available-slots.dto.ts`, `parties.controller.ts`, `poll.controller.ts`, `parties.service.ts`, `parties.service.spec.ts`) — confirmé via `git stash` + lint sur baseline que ces ~74 erreurs `no-unsafe-*` sont des erreurs de lint préexistantes et généralisées à tout le projet (non liées à cette story). Ces fichiers ont été explicitement exclus du diff final (`git checkout --`) pour garder le changement scopé aux 9 AC de la story ; le lint reste dans le même état global qu'avant (aucune nouvelle catégorie d'erreur introduite par le code de cette story, seul `tx: any` dans le callback `$transaction` suit le même pattern `any` déjà utilisé partout ailleurs dans les mocks Prisma du projet).
- Pas de script `lint` configuré côté `apps/web` — vérification limitée aux tests Vitest pour le frontend.

### Completion Notes List

- **Task 1 (AC1)** : `close()` lève désormais `BadRequestException` si le poll n'est pas `OPEN`. 2 tests ajoutés.
- **Task 2 (AC2)** : `create()` enveloppe `findFirst`/`updateMany`/`create` dans `this.prisma.$transaction(...)`. 1 test ajouté (vérifie l'appel à `$transaction`) ; les 2 tests `create()` existants passent sans modification de leurs assertions.
- **Task 3 (AC3)** : validation service-level des doublons `(date, slot)` en tête de `create()`, avant l'appel à `$transaction`. 1 test ajouté.
- **Task 4 (AC4)** : `isValid`/`totalSelected` convertis de getters en `computed()`. Template et tests mis à jour pour les appeler comme des fonctions (`isValid()`, `totalSelected()`).
- **Task 5 (AC5)** : `checkedSlots` stocke désormais des clés `` `${date}|${slot}` `` au lieu d'indices ; `toggleSlot`/`isSlotChecked` résolvent l'identité via `visiblePreselected()[index]`. 1 test ajouté démontrant la robustesse à une réorganisation de la liste (scénario où l'ancien code indexé aurait affiché le mauvais créneau comme coché).
- **Task 6 (AC6)** : ajout de `hasUnansweredOptions(poll, userId)` dans `poll.util.ts` ; `OpenPollsService` injecte désormais `AuthService` et filtre `openPolls` sur les polls où l'utilisateur courant a encore au moins une option sans réponse. 2 tests ajoutés (1 dans `poll.util.spec.ts`, 1 dans `open-polls.service.spec.ts`) ; le harnais de test a été étendu pour fournir un mock `AuthService` et les fixtures `makePoll()` incluent désormais une option par défaut, pour ne pas casser les 3 tests existants qui dépendaient implicitement du comptage précédent (poll avec `options: []` aurait été exclu à tort par le nouveau filtre).
- **Task 7 (AC7)** : `onChooseClick` ajoute un avertissement au message du dialogue de confirmation quand `opt.votes.length === 0`. 2 tests ajoutés (présence et absence de l'avertissement).
- **Task 8 (AC8)** : `isAllYes()` retourne désormais `false` si `poll().status !== 'OPEN'`. 1 test ajouté.
- **Task 9 (AC9)** : `auth.service.spec.ts`/`parties.service.spec.ts` importent `API_BASE as API` (alias pour minimiser le diff) ; `poll.service.spec.ts` (web) importe `API_BASE` et l'utilise directement dans des template strings. Aucun nouveau test — comportement inchangé, seule la source de l'URL change.
- Aucune des 4 exclusions listées dans "Ce qui NE doit PAS changer" n'a été implémentée, conformément au scope de la story.
- Suite complète : 108 tests API (2 nouveaux : Task 1) + 6 tests API poll.service (2 nouveaux : Task 2/3), 125 tests web (6 nouveaux : Tasks 5, 6×2, 7×2, 8), 0 régression sur les 2 suites.

### File List

| Fichier | Statut |
|---|---|
| `apps/api/src/poll/poll.service.ts` | UPDATE |
| `apps/api/src/poll/poll.service.spec.ts` | UPDATE |
| `apps/web/src/app/core/poll/open-polls.service.ts` | UPDATE |
| `apps/web/src/app/core/poll/open-polls.service.spec.ts` | UPDATE |
| `apps/web/src/app/core/poll/poll.util.ts` | UPDATE |
| `apps/web/src/app/core/poll/poll.util.spec.ts` | UPDATE |
| `apps/web/src/app/core/poll/poll.service.spec.ts` | UPDATE |
| `apps/web/src/app/core/auth/auth.service.spec.ts` | UPDATE |
| `apps/web/src/app/core/parties/parties.service.spec.ts` | UPDATE |
| `apps/web/src/app/features/poll/poll-creation/poll-creation.ts` | UPDATE |
| `apps/web/src/app/features/poll/poll-creation/poll-creation.html` | UPDATE |
| `apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts` | UPDATE |
| `apps/web/src/app/features/poll/poll-status/poll-status.ts` | UPDATE |
| `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts` | UPDATE |

### Review Findings

Revue effectuée sur `git diff HEAD` complet (story 3-6 + ajout ESLint web + correctif a11y clavier calendrier), 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor : **aucune violation des 9 AC**, "Ce qui NE doit PAS changer" intact.

- [x] [Review][Patch] `hasUnansweredOptions` traite un poll à 0 option comme "entièrement répondu" (silencieusement exclu du badge) — garde manquante [apps/web/src/app/core/poll/poll.util.ts]
- [x] [Review][Patch] Créneau pré-sélectionné coché + créneau personnalisé identique (même date/slot) → doublon envoyé au backend, rejeté par la validation AC3 avec un message générique et déroutant [apps/web/src/app/features/poll/poll-creation/poll-creation.ts:onSubmit]
- [x] [Review][Patch] `'@typescript-eslint/no-explicit-any': 'off'` dans la nouvelle config ESLint web, sans commentaire expliquant le choix (cohérence avec `apps/api`) [apps/web/eslint.config.js]
- [x] [Review][Patch] `packageManager: "pnpm"` perdu lors de la fusion des deux blocs `cli` dupliqués dans `angular.json` (dead code avant la fusion — dup JSON key — mais autant le restaurer explicitement) [apps/web/angular.json]
- [x] [Review][Defer] `create()` empêche la race fermeture+création d'un même MJ (AD-4) mais pas deux `create()` concurrents sous isolation READ COMMITTED (chacun peut ne pas voir le poll OPEN de l'autre avant commit) — hors scope de l'AC2 tel que spécifié, nécessiterait SERIALIZABLE ou une contrainte unique [apps/api/src/poll/poll.service.ts] — deferred, pre-existing pattern élargi par la story mais pas introduit par elle
- [x] [Review][Defer] `choose()` effectue `sessionPoll.update` puis `partie.update` sans transaction (incohérent avec l'atomicité ajoutée à `create()` par cette story) — code non touché par cette story (guard déjà présent avant), donc pré-existant [apps/api/src/poll/poll.service.ts] — deferred, pre-existing
- [x] [Review][Defer] Message d'avertissement 0-vote dans `onChooseClick` codé en dur au lieu de passer par `theme.tone()` comme le reste du composant — implémentation conforme au snippet suggéré par la spec elle-même (Task 7), mais mériterait une harmonisation future [apps/web/src/app/features/poll/poll-status/poll-status.ts] — deferred, spec-directed

**Dismissed as noise (11)** : "diff incomplet" (Blind Hunter a listé des fichiers absents du `git status` actuel — vérifié faux, ces fichiers sont déjà dans HEAD) ; `toDto(poll: any)` "régression" du retrait du commentaire eslint-disable (faux — la règle `no-explicit-any` est déjà globalement désactivée côté API, confirmé par `pnpm lint`) ; `isAllYes` template non vérifiable (le template n'est pas dans le diff, donc pas de risque introduit) ; absence de test prouvant que les segments cliquables du calendrier sont inatteignables au clavier (valeur faible, rien à régresser vu qu'aucun tabindex n'a jamais été ajouté) ; `dto.options`/`o.date` non gardés dans la validation des doublons (déjà validés en amont par `class-validator` : `@ArrayMinSize(2)` et `@IsDateString()` sur `CreatePollDto`) ; `authSvc.currentUser()` undefined contourne le filtre `OpenPollsService` (comportement intentionnel — ne pas masquer un vote potentiellement en attente tant que l'utilisateur n'est pas résolu) ; `toggleSlot`/`isSlotChecked` sur index obsolète (déjà gardé via `if (!slot) return`) ; 2 findings Edge Case Hunter conclus eux-mêmes "aucun problème identifié" ; nuance Acceptance Auditor sur la couverture du test AC2 (conforme à la propre recommandation de la spec).

## Change Log

- 2026-07-02 : Story créée depuis `deferred-work.md` — items groupés et vérifiés contre l'état actuel du code (plusieurs items initialement suspectés se sont révélés déjà résolus par 2-7 ou faux-positifs, voir "Ce qui NE doit PAS changer"). Décisions de scope confirmées par l'utilisateur.
- 2026-07-02 : Implémentation complète des 9 AC (Tasks 1-9). 108 tests API (0 régression), 125 tests web (0 régression), 12 tests ajoutés au total. Statut → `review`.
- 2026-07-03 : Revue de code (3 couches). 0 decision-needed, 4 patch, 3 defer, 11 dismissed. Aucune violation des AC.
- 2026-07-03 : 4 patches appliqués (garde `hasUnansweredOptions` sur poll vide, déduplication créneau perso/pré-sélectionné avant envoi, commentaire justificatif `no-explicit-any`, restauration `packageManager: pnpm` dans angular.json). 131 tests web (2 nouveaux) + 108 tests API, 0 régression. Statut → `done`.
