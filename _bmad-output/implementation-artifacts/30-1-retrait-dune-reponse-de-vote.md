---
baseline_commit: c711fa6
---

# Story 30.1 : Retrait d'une réponse de vote

Status: done

Epic : 30 — Calendrier
Porte : FR-35 · AD-10 (`ARCHITECTURE-SPINE.md:128-132`)

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want retirer ma réponse à un vote de date, et pas seulement la changer,
So that je puisse redevenir « sans réponse » quand je ne sais plus.

## Contexte

Première story de l'épic 30 (Calendrier). Contrairement aux stories 30.2 à 30.6 (batch d'écriture, sélection par glissement, couches, endpoint calendrier unique), celle-ci ne touche à aucune des grosses briques du palier — elle ferme un trou précis et déjà entièrement spécifié par la spine : **AD-10** dicte le contrat exact (route, sémantique, contrainte d'unicité) mot pour mot. Il n'y a pas de décision d'architecture à prendre ici, seulement à l'appliquer.

**Ce qui existe déjà et qu'il faut lire avant d'écrire :**
- `PollService`/`PollController` (`apps/api/src/poll/`) — le service de vote complet : `create()`, `findOpen()`, `castVote()`, `choose()`, `close()`. Patron à reproduire pour la nouvelle méthode `withdrawVote()`.
- `SessionPoll`/`PollOption`/`PollVote` (`apps/api/prisma/schema.prisma:263-303`) — `PollVote` porte `@@unique([optionId, userId])`. Il n'existe **aucune valeur `VoteAnswer` vide** : « n'a pas répondu » = absence de ligne `PollVote`, jamais une ligne à réponse vide.
- `PollResponseComponent` (`apps/web/src/app/features/poll/poll-response/`) — le composant joueur qui affiche YES/NO/MAYBE par option. **Aucune affordance de retrait n'existe aujourd'hui** — une fois une réponse choisie, il n'y a aucun moyen de revenir à « pas de réponse ».
- `poll.util.ts` (`apps/web/src/app/core/poll/poll.util.ts`) — `hasUnansweredOptions()`/`getMissingVoters()`/`getMissingVotersForOption()` traitent déjà « pas de réponse » comme absence de ligne dans `opt.votes` — **aucune modification nécessaire ici**, la suppression de la ligne suffit à ce que ces fonctions redonnent le bon résultat.

## Acceptance Criteria

Repris verbatim d'`epics.md#Story 30.1`.

1. **Given** j'ai répondu sur un créneau d'un vote en cours
   **When** je retire ma réponse
   **Then** ma réponse sur ce créneau disparaît

2. **Given** j'ai retiré ma réponse
   **When** l'agrégation du créneau est recalculée
   **Then** je suis compté comme n'ayant pas répondu, exactement comme avant mon premier vote

3. **Given** je tente de retirer la réponse d'un autre membre
   **When** j'émets la demande
   **Then** elle est refusée

4. **Given** le vote comporte plusieurs créneaux
   **When** je retire ma réponse sur l'un d'eux
   **Then** mes réponses sur les autres créneaux sont intactes

5. **Given** l'action de clôture d'un sondage par le MJ
   **When** elle s'exécute
   **Then** elle reste inchangée et distincte du retrait d'une réponse

## Tasks / Subtasks

### Backend

- [x] **Task 1 — `PollService.withdrawVote()`** (AC: #1, #2, #3, #4, #5)
  - [x] Signature : `withdrawVote(partieId: string, pollId: string, optionId: string, userId: string): Promise<void>`.
  - [x] Garde d'appartenance/statut identique à `castVote()` : `getViewable(partieId, userId)` (membre, pas MJ-only — n'importe quel membre retire SA propre réponse), puis vérifier que le poll existe, appartient à `partieId`, et est `OPEN` (`BadRequestException` sinon, même message que `castVote`).
  - [x] Vérifier que l'option existe et appartient à ce `pollId` (même garde que `castVote()`, `BadRequestException` sinon).
  - [x] Suppression : `prisma.pollVote.deleteMany({ where: { optionId, userId } })` — **jamais `delete()`** avec la clé composite `optionId_userId`, qui lève `P2025` si la ligne n'existe pas (double retrait, ou retrait sans avoir jamais voté). `deleteMany` est idempotent par construction — mêmes garanties que `removeFavorite()` (`apps/api/src/account/account.service.ts:94-103`, commenté explicitement `« Idempotent par nature (deleteMany ne lève jamais si 0 ligne) »`).
  - [x] AC3 est satisfait **par construction**, pas par une vérification explicite : `userId` vient uniquement de `@CurrentUser()` (jamais du corps de la requête ni de l'URL), donc le `where` du `deleteMany` ne peut jamais cibler que la ligne du membre authentifié — aucun champ « target user » n'existe dans la route. Ne pas ajouter de vérification `if (vote.userId !== callerId)` : il n'y a rien à comparer, la clé de suppression est déjà scopée à l'appelant.
  - [x] Émission temps réel (AD-14) — même paire que `castVote()` (`poll.service.ts:120-123`) : `realtimeEvents.emit(partieTopic(partieId))` puis `await parties.notifyPartieSignalsChanged(partieId, partie.mjId)` (`partie` = valeur retournée par `getViewable()`). Un retrait peut faire réapparaître le signal `VOTE_EN_COURS_SANS_REPONSE` pour ce membre — même raisonnement que le vote initial, ne pas l'omettre.

- [x] **Task 2 — Route `DELETE /parties/:id/poll/:pollId/vote/:optionId`** (AC: #1, #3, #5)
  - [x] Ajouter dans `PollController`, groupée logiquement après `castVote()` (`@Post(':pollId/vote')`).
  - [x] `@Delete(':pollId/vote/:optionId')`, params `id`/`pollId`/`optionId` en `ParseUUIDPipe`, `@CurrentUser()` pour l'id de l'appelant — même patron exact que `castVote()`.
  - [x] **Piège de nommage explicite (AD-10)** : cette route est distincte de `DELETE /parties/:id/poll/:pollId` (`close()`, déjà existante) qui, malgré son verbe HTTP, ne supprime rien — elle passe le poll d'`OPEN` à `CLOSED`. NestJS distingue les deux par le nombre de segments (`:pollId` seul vs `:pollId/vote/:optionId`), donc pas de collision de routing, mais **ne pas confondre les deux `close()`/`withdrawVote()` en les fusionnant ou en réutilisant l'un pour l'autre** — AC5 l'exige explicitement.
  - [x] Aucun DTO de corps de requête nécessaire — `optionId` voyage dans l'URL, pas dans un body (cohérent avec `ChooseDateDto` qui, lui, en a besoin car `choose()` ne prend pas l'option dans l'URL — ne pas copier ce patron ici).

- [x] **Task 3 — Tests backend** (AC: #1 à #5)
  - [x] `poll.service.spec.ts` — étendre `makePrisma()` avec `pollVote: { upsert: jest.fn(), deleteMany: jest.fn() }`.
  - [x] AC1 : `withdrawVote()` appelle `pollVote.deleteMany({ where: { optionId, userId } })` avec les bons ids.
  - [x] AC2 : pas de recalcul serveur à tester spécifiquement — `SessionPollDto.options[].votes` ne contient plus la ligne après suppression, ce qui EST le recalcul (aucune agrégation cachée à invalider). Un test d'intégration `castVote()` puis `withdrawVote()` puis relecture du poll (`findOpen()`) confirmant l'absence de la ligne couvre AC1+AC2 ensemble.
  - [x] AC3 : test dédié — deux retraits par deux `userId` différents sur le même `optionId` n'affectent jamais le `where` de l'autre (assertion sur les arguments exacts de `deleteMany` à chaque appel, jamais un `userId` autre que celui de l'appelant).
  - [x] AC4 : un poll à 2+ options, retrait sur une seule → assert `deleteMany` appelé avec le `optionId` visé uniquement, jamais les autres.
  - [x] AC5 : `close()` reste inchangé — aucun test existant de `close()` ne doit casser ; ajouter si absent un test confirmant que `withdrawVote()` et `close()` restent deux méthodes indépendantes (aucun appel croisé).
  - [x] Retrait sur un poll `CLOSED` → `BadRequestException`, même message que `castVote()`.
  - [x] Retrait idempotent : appeler deux fois de suite ne lève jamais (contrairement à ce que lèverait `delete()` avec la clé composite).
  - [x] Retrait sans avoir jamais voté (aucune ligne à supprimer) → résout normalement, aucune exception (même garantie que `removeFavorite()`).
  - [x] Émission temps réel : `realtimeEvents.emit(partieTopic(...))` **et** `parties.notifyPartieSignalsChanged(...)` appelés, même patron que les tests existants de `castVote()` (`poll.service.spec.ts:177-216`).
  - [x] `poll.controller.spec.ts` — test de routage pur : la nouvelle méthode du contrôleur transmet `partieId`/`pollId`/`optionId`/`user.id` à `PollService.withdrawVote()`, patron identique aux tests `castVote()` existants (`poll.controller.spec.ts:90-99`).

### Frontend

- [x] **Task 4 — `PollService.withdrawVote()` (web)** (AC: #1)
  - [x] `apps/web/src/app/core/poll/poll.service.ts` : `withdrawVote(partieId: string, pollId: string, optionId: string): Promise<void>` → `DELETE ${API_BASE}/parties/${partieId}/poll/${pollId}/vote/${optionId}`, `withCredentials: true` — même forme que `closePoll()` (`poll.service.ts:53-59`).

- [x] **Task 5 — Affordance de retrait dans `PollResponseComponent`** (AC: #1, #4)
  - [x] **Décision retenue : action immédiate** (appel API dès le clic, comme `removeFavorite()`/`removeCoverImage()`), conforme à la recommandation.
  - [x] Bouton « Retirer » (`.poll-response__withdraw`, thématisé `cta.withdraw_vote`), visible uniquement quand `getAnswer(opt.id) !== null` — jamais affiché sur une option sans réponse.
  - [x] Au clic : appelle `PollService.withdrawVote()`, puis retire l'entrée de `pendingAnswers` localement (`m.delete(optionId)`) — pas de refetch complet du poll (même raisonnement que `onConfirm()`).
  - [x] Émet `responded` avec le poll mis à jour localement (ligne retirée de `opt.votes` pour l'utilisateur courant), même mécanique de mise à jour optimiste que `onConfirm()`.
  - [x] Désactivé si `isClosed()`, `saving()`, ou retrait déjà en cours pour cette option (`withdrawingOptionIds`, garde anti-double-clic dédiée).
  - [x] Gestion d'échec : un retrait qui échoue laisse `pendingAnswers` intact (rien n'est retiré localement avant confirmation du succès serveur) ; message dédié `poll.withdraw_error` distinct de `error()` du lot `onConfirm()`.

- [x] **Task 6 — Tests frontend** (AC: #1 à #5)
  - [x] `poll-response.spec.ts` étendu : bouton de retrait absent tant qu'aucune réponse n'existe pour l'option ; présent une fois une réponse chargée/choisie ; clic appelle `PollService.withdrawVote()` avec les bons ids ; après succès, `pendingAnswers` ne contient plus l'option et le bouton disparaît ; `responded` émis avec le poll localement mis à jour ; sans effet si `isClosed()` ; échec laisse la réponse affichée telle quelle.
  - [x] Non-régression : suite complète web verte (96/96 fichiers, 1483/1483 tests) — `poll-status.spec.ts`/`poll-creation.spec.ts` inchangés et verts (AC5 côté front : aucun changement au flux de clôture MJ).

### Review Findings

- [x] [Review][Patch] Le bouton de retrait apparaît pour une sélection locale non encore confirmée (clic YES/NO/MAYBE sans avoir cliqué « Confirmer »), pas seulement pour une réponse déjà enregistrée côté serveur — viole AC1 (« j'ai répondu ») et l'esprit de la décision « nouvelle UI, pas une réinterprétation des boutons existants ». `getAnswer(opt.id) !== null` (qui lit `pendingAnswers`) ne distingue pas « confirmé côté serveur » de « choisi localement, pas encore envoyé », ni de « envoyé mais en échec (`failedOptionIds`) ». [apps/web/src/app/features/poll/poll-response/poll-response.ts/.html] — **Corrigé** : nouveau signal `confirmedOptionIds`, peuplé à l'initialisation (résolution `currentUser`) et mis à jour après chaque `onConfirm()`/`withdraw()` réussi ; le bouton de retrait teste désormais `confirmedOptionIds().has(opt.id)`.
- [x] [Review][Patch] `withdraw()` ne vérifie pas `withdrawingOptionIds().has(optionId)` à l'entrée — seul le binding `[disabled]` du template protège contre un double-clic, avec un délai de peinture avant qu'Angular ne le désactive réellement. Même piège que celui déjà documenté ailleurs dans le projet pour `coverSaving()`. [apps/web/src/app/features/poll/poll-response/poll-response.ts, `withdraw()`] — **Corrigé** : garde ajoutée en tête de `withdraw()`.
- [x] [Review][Patch] `onConfirm()` ne tient pas compte d'un retrait en cours sur la même option — un clic sur YES/NO/MAYBE puis sur « Confirmer » pendant qu'un retrait est en vol sur la même option peut faire arriver les deux requêtes dans le désordre, laissant l'état final incohérent. [apps/web/src/app/features/poll/poll-response/poll-response.ts, `onConfirm()`] — **Corrigé** : `onConfirm()` exclut désormais du lot toute option présente dans `withdrawingOptionIds()` ; les boutons YES/NO/MAYBE du template sont aussi désactivés pour ces options.
- [x] [Review][Defer] Un retrait sur une option jamais votée (no-op, `deleteMany` supprime 0 ligne) déclenche quand même l'émission temps réel et `notifyPartieSignalsChanged()` [apps/api/src/poll/poll.service.ts, `withdrawVote()`] — deferred, gaspillage mineur, `castVote()` a la même absence de diff avant émission
- [x] [Review][Defer] L'échec d'un retrait ne distingue pas la cause (403 non-membre / 400 poll fermé / réseau) — un seul message générique `poll.withdraw_error` [apps/web/src/app/features/poll/poll-response/poll-response.ts, `withdraw()`] — deferred, `onConfirm()` a la même granularité grossière (distingue seulement par compteur, pas par code HTTP)
- [x] [Review][Defer] L'échec d'un retrait s'affiche dans le message générique du pied de page (`error()`), pas à côté de l'option concernée comme le fait `failedOptionIds`/`⚠` pour un échec de vote — deferred, incohérence UX mineure entre les deux mécanismes de retour d'erreur
- [x] [Review][Defer] Aucune annonce `aria-busy`/lecteur d'écran pendant qu'un retrait est en cours — seul le `[disabled]` visuel change [apps/web/src/app/features/poll/poll-response/poll-response.html] — deferred, polish accessibilité, pas bloquant
- [x] [Review][Defer] Si le parent remplace l'objet `poll()` par un autre poll pendant qu'un retrait est en vol, la mise à jour optimiste locale pourrait patcher le mauvais poll [apps/web/src/app/features/poll/poll-response/poll-response.ts, `withdraw()`] — deferred, scénario étroit (plusieurs polls OPEN en parallèle sur une même Partie, Story 8.8 Décision 2), nécessite de vérifier si `@for`/`track` recrée une instance du composant plutôt que de réassigner l'input avant d'investir dans un correctif

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Ne jamais utiliser `pollVote.delete()` avec la clé composite `optionId_userId`.** Elle lève `P2025` (`Record to delete does not exist`) si la ligne n'existe pas déjà — ce qui arrive systématiquement au second retrait, ou à un retrait sans avoir jamais voté. `deleteMany({ where: { optionId, userId } })` est la forme idempotente à utiliser, patron déjà établi par `removeFavorite()` (`apps/api/src/account/account.service.ts:94-103`).
2. **Ne pas confondre les deux routes `DELETE`.** `DELETE /parties/:id/poll/:pollId` (existante, `close()`) ferme le poll et ne supprime aucune ligne. `DELETE /parties/:id/poll/:pollId/vote/:optionId` (nouvelle) supprime une ligne `PollVote` et ne touche jamais au statut du poll. AC5 exige explicitement qu'elles restent indépendantes.
3. **Ne pas élargir `VoteAnswer`.** AD-10 l'interdit explicitement — c'est précisément ce que la décision d'architecture prévient (« deux représentations de "n'a pas répondu" »). L'enum reste `YES | NO | MAYBE`, aucune valeur `NONE`/vide n'est ajoutée.
4. **AC3 ne se code pas par une vérification explicite `userId === vote.userId`.** Il n'existe structurellement aucun moyen de cibler la réponse d'un autre membre : `userId` vient uniquement de la session (`@CurrentUser()`), jamais de l'URL ni du corps. Chercher à écrire un test qui « essaie » de retirer la réponse d'un autre membre via l'API revient à constater qu'aucun paramètre ne permet même de le tenter — le test pertinent est l'isolation (deux retraits par deux utilisateurs ne se marchent jamais dessus), pas un rejet explicite.
5. **`poll.util.ts` n'a besoin d'aucune modification.** `hasUnansweredOptions()`/`getMissingVoters()`/`getMissingVotersForOption()` itèrent déjà sur `opt.votes` — une ligne supprimée y redevient automatiquement « pas de réponse ». Ne pas ajouter de cas spécial « retiré » distinct de « jamais répondu » : AC2 exige explicitement qu'ils soient indiscernables.
6. **Le composant frontend n'a aujourd'hui aucune affordance de retrait — c'est la partie manquante, pas une extension d'un bouton existant.** Ne pas essayer de réinterpréter un des trois boutons YES/NO/MAYBE existants en bouton d'effacement (ex. re-cliquer sur la réponse active) sans en discuter — l'AC ne demande pas ce mécanisme, et il complexifierait `getAnswer()`/`setAnswer()` qui aujourd'hui ne connaissent qu'un seul type de valeur (`VoteAnswer`, jamais `null` en sortie de `setAnswer`).

### Ce qui doit continuer de fonctionner

- `PollService.create()`/`findOpen()`/`castVote()`/`choose()`/`close()` — aucune modification à leur comportement existant.
- `PollController` — les quatre routes existantes (`GET`, `POST .../vote`, `PATCH .../choose`, `DELETE :pollId`) inchangées.
- `PollResponseComponent` — le flux existant de vote (choix YES/NO/MAYBE puis confirmation groupée via `onConfirm()`) continue de fonctionner à l'identique ; le retrait est une action **additionnelle**, pas un remplacement.
- `poll.util.ts`, `PollStatusPanel` (vue MJ) — aucune modification requise ; ces vues dérivent déjà correctement de l'absence de ligne `PollVote`.

### Hors périmètre

- Toute modification de `VoteAnswer` (AD-10 l'interdit).
- Le reste de l'épic 30 (batch d'écriture de disponibilités, sélection par glissement, couches de calendrier, endpoint calendrier unique, vue Agenda) — stories 30.2 à 30.6, indépendantes de celle-ci.
- Modification du modèle Prisma — aucun champ ajouté ni retiré, `PollVote` reste tel quel.

### Notes de plateforme

- **API : Jest 30 + ts-jest.** Aucun nouvel import runtime de `@master-jdr/shared` introduit par cette story — le correctif de configuration `ts-jest` (Story 29.14, `apps/api/package.json`, override `tsconfig.module: commonjs`) reste en place et n'a pas besoin d'être retouché.
- **Web : Vitest 4, zoneless.** Aucun nouveau champ ajouté à `SessionPollDto`/`PollOptionDto`/`PollVoteDto` — aucune fixture existante à réparer.
- **Exécution** : tout par Docker (`docker compose exec api pnpm test`, `docker compose exec web pnpm exec ng test --watch=false`).

### Project Structure Notes

- **Backend modifiés** : `apps/api/src/poll/poll.service.ts` (+`withdrawVote()`), `apps/api/src/poll/poll.controller.ts` (+1 route), `apps/api/src/poll/poll.service.spec.ts`, `apps/api/src/poll/poll.controller.spec.ts`.
- **Frontend modifiés** : `apps/web/src/app/core/poll/poll.service.ts` (+`withdrawVote()`), `apps/web/src/app/features/poll/poll-response/poll-response.ts`/`.html` (+ affordance de retrait), specs correspondantes.
- **Non touchés** : `packages/shared/src/index.ts` (aucun nouveau type nécessaire — pas de DTO de corps de requête), `apps/api/prisma/schema.prisma` (aucune migration), `poll.util.ts`, `PollStatusPanel`, `poll-creation.*`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.1] — Story et Acceptance Criteria, repris verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md:283-284] — FR-35 : « Un joueur peut revenir sur sa réponse et la retirer, pas seulement la modifier. » Une seule phrase, tout le détail opérationnel vit dans AD-10.
- [Source: ARCHITECTURE-SPINE.md#AD-10] — Contrat exact : suppression de la ligne `PollVote`, route `DELETE /parties/:id/poll/:pollId/vote/:optionId`, réservé à l'auteur du vote, distinct du `DELETE /parties/:id/poll/:pollId` existant (`close()`), `VoteAnswer` inchangé.
- [Source: ARCHITECTURE-SPINE.md:428] — Carte des fichiers : `poll.controller.ts # + DELETE /parties/:id/poll/:pollId/vote/:optionId (AD-10)`.
- [Source: ARCHITECTURE-SPINE.md:475] — Table de traçabilité : `FR-35 (retrait de vote) | DELETE …/poll/:pollId/vote | AD-10`.
- [Source: apps/api/prisma/schema.prisma:263-303] — `SessionPoll`/`PollOption`/`PollVote`, contrainte `@@unique([optionId, userId])`, enum `VoteAnswer: YES|NO|MAYBE`.
- [Source: apps/api/src/poll/poll.service.ts:91-124] — `castVote()` : patron exact de garde (`getViewable` + statut `OPEN` + validité de l'option) et d'émission temps réel à reproduire pour `withdrawVote()`.
- [Source: apps/api/src/poll/poll.service.ts:172-189] — `close()` : à ne PAS confondre avec le nouveau retrait (AC5).
- [Source: apps/api/src/poll/poll.controller.ts:50-58] — `castVote()` (contrôleur) : patron exact de routage à reproduire.
- [Source: apps/api/src/account/account.service.ts:94-103] — `removeFavorite()` : patron exact de suppression idempotente via `deleteMany`, à reproduire pour `withdrawVote()`.
- [Source: apps/api/src/poll/poll.service.spec.ts:15-99] — Conventions de test établies : `makePrisma()`/`makePartiesService()`/`makeRealtimeEvents()`, structure des tests d'émission temps réel (lignes 177-216) à reproduire.
- [Source: apps/api/src/poll/poll.controller.spec.ts:90-99] — Patron de test de routage pur pour `castVote()`, à reproduire pour la nouvelle route.
- [Source: apps/web/src/app/core/poll/poll.service.ts:53-59] — `closePoll()` : patron exact d'appel `DELETE` à reproduire côté web pour `withdrawVote()`.
- [Source: apps/web/src/app/features/poll/poll-response/poll-response.ts] — `pendingAnswers`/`setAnswer()`/`onConfirm()` : état existant à étendre, PAS à réécrire. Commentaire lignes 117-122 (Story 8.8, Décision 2) explique pourquoi la mise à jour reste optimiste/locale plutôt qu'un refetch.
- [Source: apps/web/src/app/core/poll/poll.util.ts] — `hasUnansweredOptions()`/`getMissingVoters()`/`getMissingVotersForOption()` : déjà corrects vis-à-vis d'une ligne supprimée, aucune modification nécessaire (piège #5).
- [Source: packages/shared/src/index.ts:527-573] — `SessionPollDto`/`PollOptionDto`/`PollVoteDto`/`CastVoteDto`/`ChooseDateDto` : formes existantes, aucun nouveau type nécessaire pour cette story (`optionId` voyage dans l'URL, pas dans un DTO de corps).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-14 (bmad-create-story). Recherche exhaustive menée via subagent Explore sur le système de vote existant (schéma Prisma, `PollService`/`PollController`, tests établis, UI `PollResponseComponent`, PRD §4.7, `ARCHITECTURE-SPINE.md`), puis chaque citation vérifiée directement (lecture des fichiers réels) avant d'être reprise dans cette story — le contrat est entièrement spécifié par AD-10, aucune ambiguïté d'architecture à trancher en implémentation. Seule décision laissée ouverte : action de retrait immédiate (recommandée, patron `removeFavorite()`) vs intégrée au flux différé `pendingAnswers`/`onConfirm()` — à documenter dans Completion Notes si le choix retenu diffère de la recommandation.

- Implémentée le 2026-08-14 (bmad-dev-story), 6 tâches en TDD (red-green à chaque étape). Backend : `PollService.withdrawVote()` en miroir exact de `castVote()` (garde `getViewable()` + statut `OPEN` + validité de l'option), suppression via `pollVote.deleteMany({ where: { optionId, userId } })` (jamais `delete()` avec la clé composite — idempotent, patron `removeFavorite()`), route `DELETE /parties/:id/poll/:pollId/vote/:optionId` distincte de `close()`. AC3 (isolation entre membres) satisfait par construction — `userId` vient uniquement de `@CurrentUser()`, aucun paramètre ne permet de cibler la réponse d'un autre membre ; testé par isolation (deux retraits par deux utilisateurs, jamais de fuite de `where`) plutôt que par une vérification explicite absente du code. Émission temps réel identique à `castVote()` (`partieTopic` + `notifyPartieSignalsChanged(partieId, partie.mjId)`, signal `VOTE_EN_COURS_SANS_REPONSE`).
  Frontend : **décision retenue conforme à la recommandation** — action immédiate au clic (patron `removeFavorite()`/`removeCoverImage()`), pas d'intégration au lot différé `onConfirm()`. Bouton « Retirer » thématisé (×3 thèmes : `cta.withdraw_vote`, `success.vote_withdrawn`, `poll.withdraw_error`), visible uniquement quand une réponse existe déjà pour l'option (`getAnswer(opt.id) !== null`). Garde anti-double-clic dédiée par option (`withdrawingOptionIds`, un `Set<string>` plutôt qu'un booléen global — deux retraits sur deux options différentes ne se bloquent pas mutuellement). Mise à jour optimiste locale du poll émis via `responded`, sans refetch (même raisonnement que `onConfirm()`, Story 8.8 Décision 2). `poll.util.ts` non modifié, comme prévu — l'absence de ligne `PollVote` suffit à ce que `hasUnansweredOptions()`/`getMissingVoters()` redonnent le bon résultat après un retrait.
  Suite finale : API 54/54 suites (1169/1169 tests, +11 vs baseline), typecheck propre ; Web 96/96 fichiers (1483/1483 tests, +14 vs baseline), lint propre sur tous les fichiers touchés (erreurs `no-unsafe-*` préexistantes dans `toDto()`, non introduites par cette story).

- Revue de code du 2026-08-14 : 3 patches appliqués (cf. Review Findings). Le bouton de retrait dépendait de `pendingAnswers` (mélange sélection locale/serveur/échec) ; nouveau signal `confirmedOptionIds`, dérivé du même effect d'initialisation et mis à jour après chaque succès de `onConfirm()`/`withdraw()`, sert désormais seul de condition d'affichage — sans changer le comportement de `pendingAnswers` (toujours utilisé pour le lot différé). `withdraw()` gagne une garde `withdrawingOptionIds().has(optionId)` en tête, même patron que la garde déjà en place côté template. `onConfirm()` exclut du lot toute option en cours de retrait ; les boutons YES/NO/MAYBE sont aussi désactivés pour cette option (cohérent avec la désactivation déjà appliquée au bouton de retrait lui-même). 6 nouveaux tests (20/20 dans `poll-response.spec.ts`) ; suite web complète re-vérifiée : 96/96 fichiers, 1489/1489 tests (+6 vs avant patches), lint et typecheck propres sur les fichiers touchés.

### File List

**Backend — modifiés**
- `apps/api/src/poll/poll.service.ts` (+ `withdrawVote()`)
- `apps/api/src/poll/poll.controller.ts` (+ route `DELETE :pollId/vote/:optionId`)
- `apps/api/src/poll/poll.service.spec.ts` (+ 10 tests)
- `apps/api/src/poll/poll.controller.spec.ts` (+ 1 test)

**Frontend — modifiés**
- `apps/web/src/app/core/poll/poll.service.ts` (+ `withdrawVote()`)
- `apps/web/src/app/core/poll/poll.service.spec.ts` (+ 1 test)
- `apps/web/src/app/features/poll/poll-response/poll-response.ts` (+ `withdraw()`, `withdrawingOptionIds`, `confirmedOptionIds` — revue de code)
- `apps/web/src/app/features/poll/poll-response/poll-response.html` (+ bouton de retrait conditionnel, condition sur `confirmedOptionIds` — revue de code)
- `apps/web/src/app/features/poll/poll-response/poll-response.scss` (+ style `__withdraw`)
- `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts` (+ 7 tests, + 6 tests revue de code)
- `apps/web/src/app/core/theme/tones.ts` (+ 3 clés × 3 thèmes : `cta.withdraw_vote`, `success.vote_withdrawn`, `poll.withdraw_error`)

**Non touchés, délibérément** : `packages/shared/src/index.ts` (aucun DTO nécessaire), `apps/api/prisma/schema.prisma`, `apps/web/src/app/core/poll/poll.util.ts`, `PollStatusPanel`, `poll-creation.*`.

### Change Log

- 2026-08-14 — Revue de code (bmad-code-review) : 3 patches appliqués sur `PollResponseComponent` (visibilité du bouton de retrait basée sur `confirmedOptionIds` plutôt que `pendingAnswers`, garde anti-double-clic dans `withdraw()`, exclusion des options en cours de retrait dans `onConfirm()`). Web 1489 tests (+6), lint et typecheck propres.
- 2026-08-14 — Story implémentée (bmad-dev-story), 6 tâches, TDD. `PollService.withdrawVote()` (API + web) supprimant la ligne `PollVote` de l'appelant via `deleteMany` idempotent, route `DELETE /parties/:id/poll/:pollId/vote/:optionId` distincte de `close()` (AD-10), bouton de retrait immédiat dans `PollResponseComponent`. API 1169 tests, web 1483 tests, typecheck et lint propres. Statut → `review`.
- 2026-08-14 — Story créée (bmad-create-story). Contrat entièrement spécifié par AD-10 de la spine ; aucune décision d'architecture à trancher, seule décision UI laissée ouverte (retrait immédiat vs différé).
