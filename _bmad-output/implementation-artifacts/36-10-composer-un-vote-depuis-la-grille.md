---
baseline_commit: 7812482
baseline_note: "Arbre de travail PROPRE au démarrage (git status vide). HEAD = 7812482 « feat: le mode destinee et le panneau reduit a qui manque » (story 36.9)."
---

# Story 36.10 : Composer un vote depuis la grille

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · porte **FR-52** (avec la 36.9) [Source: epics.md:1908] · classée **« Serveur (D-16) + front »** par `epics.md:1926`.

> **C'est la seconde story serveur de l'épic, et l'une des deux raisons pour lesquelles `/security-review` n'y est pas optionnel** (`epics.md:335`). Elle ouvre le **premier chemin d'écriture destructrice de données d'autrui** du calendrier : retirer une option d'un vote ouvert **supprime les réponses que d'autres membres y ont posées**. Tout le reste de la story découle de cette phrase.

---

## 🚨 Encadré n°1 — LE PIÈGE CENTRAL : ON NE PEUT PAS CRÉER UN VOTE « TOUT SEUL »

Lire ceci avant toute autre chose. L'AC4 dit « un vote inexistant … le vote est créé ». **Il n'existe aucune route qui crée un `SessionPoll` nu**, et c'est délibéré :

```ts
// apps/api/src/poll/poll.controller.ts:37-41
// Story 8.8 (Décision 2, revue de code) : la route générique de création de poll est retirée —
// sans la fermeture auto de l'existant, un appel direct pouvait créer un nombre illimité de
// SessionPoll orphelins, jamais liés à une Séance, invisibles et jamais nettoyés.
```

**Un vote de date exige TOUJOURS un lien vers une `Seance`.** Le seul chemin est `POST /scenarios/seances/:id/poll` → `ScenariosService.createSeancePoll()` (`scenarios.service.ts:605`), qui appelle `PollService.create()` puis pose `Seance.pollId`.

🚨 **Conséquence dure : ne PAS rouvrir `POST /parties/:id/poll`.** Ni « juste pour cette story », ni « en interne ». La composition d'un **nouveau** vote doit désigner une séance — c'est la seule question que l'écran doit encore poser au MJ (AC11, et la décision D-1 ci-dessous).

---

## 🚨 Encadré n°2 — ⚠️ CE QUE LA PLANCHE MONTRE, ET L'ÉCART ASSUMÉ

`contrat-ui-calendrier.html:376` place « Ajouter des dates » **dans la barre de sélection** (`selbar`), à côté de « Sceller ce créneau », en mode Destinée.

⚠️ **Cette story place l'armement AILLEURS, et il faut le savoir avant d'écrire une ligne.** Motif, vérifié dans le code :

1. `SelectionBar` **n'existe à l'écran que lorsqu'une sélection existe** (rendue sous `@if` dans `calendar-month-view.html` / `calendar-week-view.html`). Or l'AC1 exige d'armer la composition **sans sélection préalable** — sinon le premier geste du MJ serait de déclarer sa propre disponibilité, ce que la composition doit précisément remplacer.
2. `SelectionBar` est un composant de **rendu pur** rendu par les vues enfants ; y faire descendre l'état MJ, le vote courant et le nombre de votants recréerait le couplage que la 36.7 a démonté.
3. La 36.9 a déjà tranché la règle générale : **un mode s'arme depuis un contrôle hors panneau, et se voit tant qu'il est actif** (`EXPERIENCE.md:198`, AC5 de la 36.9, `destiny-control` frère de la bande de couches).

**Décision** : le bouton « Ajouter des dates » est rendu dans la **bande de contrôles** (`.calendar-controls`), **frère** de `<app-destiny-control>`, sous garde MJ + contexte de partie. La **barre de composition** (AC1) est un **nouveau composant persistant**, rendu par `CalendarView`, distinct de `SelectionBar`.

**Ce qui reste conforme à la planche** : le bouton porte le libellé exact « Ajouter des dates », il n'apparaît **que** pour un MJ, et la composition passe par la sélection sur grille — c'est-à-dire tout ce que l'annotation `contrat-ui-calendrier.html:414` promet en supprimant « Planifier un vote pour : ».

---

## 🚨 Encadré n°3 — LE MODE RÉASSIGNE LE TAP. C'est le SEUL de l'application

`EXPERIENCE.md:538` (principe 4) et `EXPERIENCE.md:597` (collision 5) sont formels :

> **4.** *Un seul mode réassigne le tap : la composition d'un vote* (MJ). Il est armé explicitement, porte une barre persistante, se quitte par `Échap` ou *Annuler*, et **se signale visuellement pendant toute sa durée**.
>
> **Collision 5** — Tap en mode composition : prétendants *Ajouter l'option* · *Répondre* · *Sélectionner* → retenu : **Ajouter / retirer**.

🚨 **Le contraste avec la 36.9 est le cœur de la story.** La Destinée ne change **que l'affichage** (son AC3 l'exige mot pour mot). La composition, elle, change **ce que fait le doigt**. Les deux modes peuvent être actifs en même temps. **Ce sont deux états indépendants ; ne pas les fusionner, ne pas faire dépendre l'un de l'autre au-delà de ce que dit la décision D-1.**

Pendant la composition, dans les deux grilles, un tap sur un créneau **ne doit plus** :

| Ce qui doit être neutralisé | Où c'est câblé aujourd'hui |
| --- | --- |
| Armer / basculer une sélection | `calendar-month-view.ts:488` (`selectedCells().length > 0 → toggleCell`), `:518` (`armSelection`) |
| Ouvrir le sélecteur de réponse de vote | `calendar-month-view.ts:495-498` (`voteOptionActivated`) |
| Ouvrir le scénario d'une séance | chemin `scenarioActivated` (36.1) |
| Ouvrir `ConstraintPanel` | déjà retiré du tap par la 36.3 (AC1) — rien à faire, mais ne pas le réintroduire |

En revanche le **rail continue de suivre** (`slotSelected` → `onSlotSelected`, principe 2 : « le rail suit, il ne se commande pas »). Le neutraliser priverait le MJ de la lecture longue au moment précis où il compose.

---

## 🚨 Encadré n°4 — L'ÉCRITURE EST DESTRUCTRICE. La forme de l'endpoint n'est pas un détail

`PollVote` est en cascade sur `PollOption` :

```prisma
// apps/api/prisma/schema.prisma:309-320
model PollVote {
  optionId String
  option   PollOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  @@unique([optionId, userId])
}
```

**Supprimer une `PollOption` supprime silencieusement, en base, les `PollVote` de tous les membres qui l'avaient choisie.** C'est ce que Q-22 autorise explicitement — *« permis même si des membres ont voté, avec avertissement préalable nommant le nombre de votants ; les réponses de l'option retirée sont supprimées, celles des autres créneaux intactes »* (`prd.md:479`) — et c'est ce que l'AC6/AC7 encadrent.

🚨 **D'où l'invariant d'implémentation le plus important de la story : une option CONSERVÉE garde son `id`.** La tentation naturelle — « je supprime toutes les options et je recrée le jeu validé » — est **interdite** : elle passerait tous les tests d'affichage et **détruirait toutes les réponses de tout le monde à chaque ajout d'une seule date**. L'AC5 (« les réponses portées par les options conservées sont intactes ») est exactement le verrou contre ce défaut.

**La réconciliation se fait sur la clé métier `date|slot`**, celle qui sert déjà de clé de dédoublonnage dans `PollService.create()` (`poll.service.ts:38-46`) :

- présente avant **et** après → **on n'y touche pas** (ni `update`, ni `delete`) ;
- absente avant, présente après → `create` ;
- présente avant, absente après → `delete` (la cascade emporte ses `PollVote`, et **elles seules**).

---

## 🚨 Encadré n°5 — CE QUE CETTE STORY NE LIVRE PAS, MALGRÉ LA PLANCHE

- ❌ **« Sceller ce créneau » depuis la barre de sélection.** La planche le dessine (`contrat-ui-calendrier.html:376`) et `EXPERIENCE.md:577` le décrit, mais **aucun AC de la 36.10 ne le demande**. La 36.9 l'a laissé en dette écrite (`deferred-work.md`, entrée du 2026-08-22) en posant explicitement la question « l'attacher à la 36.10 ? ». **Réponse de cette story : non, sauf instruction de l'utilisateur** — voir la question n°2. Le scellement reste atteignable depuis la fiche de scénario (`seance-list`, `PollStatusPanel` complet).
- ❌ **Le mode Destinée n'est pas modifié.** Ni son estompe, ni sa navigation, ni le panneau réduit.
- ❌ **La vue Agenda ne compose pas.** L'AC parle de la **grille** ; « Lancer un vote depuis l'Agenda » est la 36.12 (`EXPERIENCE.md:583`), bloquée par Q-25.
- ❌ **Aucune migration Prisma.** `PollOption` et `PollVote` existent tels quels. Si vous écrivez une migration, vous vous êtes trompé de chemin.

---

## 🚨 Encadré n°6 — CE QUI EXISTE DÉJÀ ET NE DOIT PAS ÊTRE RÉÉCRIT

| Besoin | Ce qui le sert déjà | Fichier |
| --- | --- | --- |
| Créer un vote lié à une séance | `ScenariosService.createSeancePoll()` + `POST /scenarios/seances/:id/poll` | `apps/api/src/scenarios/scenarios.service.ts:605` |
| Appel client de création | `ScenariosService.createSeancePoll(seanceId, options)` (web) | `apps/web/src/app/core/scenarios/scenarios.service.ts:164` |
| Séances éligibles à un nouveau vote | `eligibleSeances()` (scénario non `PASSE`, aucun `poll`, aucune `dateValidee`) | `calendar-view.ts:260-273` |
| Votes ouverts nommés | `activePolls()` (partie) / `destinyPolls()` (les deux contextes) | `calendar-view.ts:243`, `:593` |
| Le vote courant du mode Destinée | `destinyPollId()` / `destinyPoll()` | `calendar-view.ts:576`, `:607` |
| Validation d'options (2..40, date ISO, slot) | `PollOptionInput` de `CreatePollDto` | `apps/api/src/poll/dto/create-poll.dto.ts` |
| Dédoublonnage `date` + `slot` | boucle `seen` de `PollService.create()` | `poll.service.ts:38-46` |
| Autorisation MJ | `parties.getOwned(partieId, userId)` | utilisé par `create` / `choose` / `close` |
| Clé de cellule et lot de créneaux | `selection.utils.ts` (`SelectedCell`, `buildBatchItems`) | `apps/web/src/app/features/calendar/selection.utils.ts` |
| Dialogue de confirmation | patron `ConflictDialog` (`MatDialog`) | `apps/web/src/app/features/calendar/conflict-dialog/` |
| Émission SSE après mutation de vote | `realtimeEvents.emit(partieTopic(id))` **+** `parties.notifyPartieSignalsChanged(id, mjId)` | `poll.service.ts` (les cinq mutations) |

---

## Story

As a MJ,
I want désigner les créneaux d'un vote sur le calendrier,
so that je cesse de saisir des dates dans un formulaire séparé.

---

## Acceptance Criteria

Les neuf premiers sont ceux d'`epics.md:2327-2374`, **verbatim**. Les suivants comblent des trous de spécification, chacun avec son motif.

### AC1 — Le mode s'arme et se signale (epics.md, verbatim)

**Given** je suis MJ et je choisis d'ajouter des dates
**When** le mode de composition s'arme
**Then** il se signale visuellement pendant toute sa durée
**And** une barre persistante permet de valider ou d'annuler

### AC2 — Le tap ajoute ou retire, sans rien écrire (verbatim)

**Given** le mode de composition actif
**When** je tape un créneau
**Then** il est ajouté aux options, ou retiré s'il y était déjà
**And** rien n'est enregistré avant validation

### AC3 — Échap et Annuler ne modifient rien (verbatim)

**Given** le mode actif
**When** je presse `Échap` ou j'annule
**Then** aucune option n'est modifiée

### AC4 — Création (verbatim)

**Given** un vote inexistant
**When** je valide une composition
**Then** le vote est créé avec les créneaux désignés

### AC5 — Mutation d'un vote ouvert, sans perte (verbatim)

**Given** un vote déjà ouvert
**When** je valide un ajout ou un retrait d'options
**Then** ses options sont modifiées
**And** les réponses portées par les options conservées sont intactes

### AC6 — Avertissement AVANT, chiffré (verbatim)

**Given** une option sur laquelle des membres ont voté
**When** je demande son retrait
**Then** l'écran m'avertit **avant**, en nommant le nombre de votants concernés
**And** je peux renoncer

### AC7 — Le retrait confirmé est chirurgical (verbatim)

**Given** un retrait confirmé
**When** il s'exécute
**Then** les réponses portées par cette option sont supprimées
**And** celles des autres créneaux sont intactes

### AC8 — Refus pour un non-MJ (verbatim)

**Given** un membre qui n'est pas MJ
**When** il tente de composer un vote
**Then** la demande est refusée

### AC9 — Le sélecteur quitte l'Oracle (verbatim)

**Given** le sélecteur « Planifier un vote pour : »
**When** cette story est livrée
**Then** il est retiré de l'Oracle

### AC10 — 🚨 Le mode n'existe qu'en contexte de partie, côté MJ

**Given** le calendrier personnel (`/profile/calendar`, `partieId()` absent) ou un membre non-MJ
**When** l'écran est rendu
**Then** **aucun** point d'entrée de composition n'est rendu
**And** aucun état de composition ne peut être armé

*Motif : `createSeancePoll` et l'écriture d'options exigent un `partieId` et `getOwned`. Le calendrier personnel agrège des votes de **plusieurs parties** (36.9, note de sécurité) — y armer une composition n'aurait pas de cible. La garde est **structurelle**, pas cosmétique : le bouton n'existe pas, la fonction refuse.*

### AC11 — 🚨 Le vote créé est TOUJOURS lié à une séance

**Given** une composition validée alors qu'aucun vote n'est en cours d'édition
**When** l'enregistrement s'exécute
**Then** il passe par `POST /scenarios/seances/:id/poll`, sur une séance **désignée par le MJ**
**And** aucun `SessionPoll` sans `Seance.pollId` n'est créé, par aucun chemin
**And** si aucune séance éligible n'existe, la création n'est pas proposée, et l'écran le **dit** au lieu d'échouer

*Motif : encadré n°1. L'invariant de la 8.7 / 8.8 tient, et cette story ne le rouvre pas.*

### AC12 — 🚨 Pendant la composition, aucun autre geste ne s'exécute

**Given** le mode de composition actif
**When** je tape une bande, une cellule, une bande portant une séance ou une option de vote
**Then** **seule** la bascule d'option s'exécute
**And** aucune sélection n'est armée, aucun sélecteur de réponse ne s'ouvre, aucun scénario ne s'ouvre
**And** le rail continue de suivre le jour touché

*Motif : `EXPERIENCE.md:538` principe 4 et collision 5. Le rail est exclu de la neutralisation par le principe 2 (« le rail suit, il ne se commande pas »).*

### AC13 — 🚨 La composition part de l'état réel du vote

**Given** le mode armé sur un vote ouvert
**When** la barre s'affiche
**Then** les créneaux **déjà options de ce vote** sont montrés comme composés
**And** un créneau composé se distingue d'un créneau sélectionné et d'un créneau simplement porteur d'une option

*Motif : sans état de départ, « retiré s'il y était déjà » (AC2) n'a pas de référent, et le MJ ne pourrait que **rajouter**. C'est aussi ce qui rend l'AC5 observable à l'écran.*

### AC14 — 🚨 Les bornes serveur, et le refus propre

**Given** une demande de mutation d'options
**When** le serveur la traite
**Then** elle est refusée si l'appelant n'est pas le MJ de la partie (AC8), si le vote est introuvable ou n'appartient pas à la partie, s'il n'est **pas** `OPEN`, si deux options portent la même paire `date` + `slot`, ou si le nombre d'options sort de **2..40**
**And** aucune écriture partielle ne subsiste après un refus

*Motif : bornes reprises telles quelles de `CreatePollDto` (`ArrayMinSize(2)`, `ArrayMaxSize(40)`) — un vote à une seule option n'est pas un vote, et la charge doit rester bornée. `status !== 'OPEN'` reprend la garde de `castVote` / `withdrawVote` / `choose` / `close`.*

### AC15 — 🚨 Écriture atomique, puis temps réel

**Given** une mutation d'options validée
**When** elle s'exécute
**Then** créations et suppressions sont appliquées dans **une seule transaction**
**And** `partieTopic(partieId)` est émis
**And** `notifyPartieSignalsChanged(partieId, mjId)` est appelé **en plus**, jamais en remplacement

*Motif : `AD-14` / story 29.7. Ajouter une option fait **réapparaître** le signal `VOTE_EN_COURS_SANS_REPONSE` pour les membres qui avaient tout répondu ; en retirer une peut le **faire disparaître**. C'est exactement le raisonnement écrit dans `poll.service.ts` pour `castVote()` et `withdrawVote()`.*

### AC16 — 🚨 Le mode est annonçable

**Given** le mode de composition actif
**When** un lecteur d'écran parcourt l'écran
**Then** l'état de composition est annoncé, ainsi que le nombre de créneaux composés
**And** un créneau composé porte son état en toutes lettres, jamais par la seule couleur
**And** l'avertissement de l'AC6 est un dialogue accessible, dont le texte nomme le nombre de votants

*Motif : `P-1` du contrat d'UI (« jamais la couleur seule »), déjà appliqué par `SelectionBar` (`aria-pressed` + forme du bouton) et par la 36.2 (`bandAriaLabel`).*

### AC17 — 🚨 Aucune option sur une date passée

**Given** le mode actif
**When** je tape un créneau antérieur à aujourd'hui, ou hors du mois affiché
**Then** rien n'est composé

*Motif : garde déjà en place pour la sélection (`calendar-month-view.ts:461-470`) ; la composition doit la partager, pas la contourner.*

---

## Tasks / Subtasks

### 0. Baseline (obligatoire, avant toute modification)

- [x] `git status` doit être **propre** (il l'était à la rédaction, HEAD = `7812482`). S'il ne l'est pas, **s'arrêter et le dire** — ne rien réinitialiser.
- [x] Mesurer et consigner : `docker compose exec api pnpm test`, `docker compose exec api pnpm typecheck`, `docker compose exec api pnpm lint`, `docker compose exec web pnpm test`, `docker compose exec web pnpm lint`.
- [x] Repères attendus (à **reconfirmer**, ce sont ceux consignés par la 36.9) : **API 60 suites / 1303 tests**, typecheck propre ; **web 109 fichiers / 1960 tests**, **lint 143 problèmes** (baseline connue, non nulle) ; `pnpm build` web échoue sur un **budget de bundle pré-existant** — ce n'est pas une régression.

### 1. Le contrat partagé (AC14)

- [x] `packages/shared/src/index.ts` : ajouter `SetPollOptionsDto { options: { date: string; slot: DaySlot }[] }`, documenté — **jeu déclaratif complet**, pas un delta ; la réconciliation se fait sur `date` + `slot`, et une option conservée **garde son `id`**.
- [x] 🚨 Après toute modification de `packages/shared`, `docker compose exec api pnpm typecheck` est **obligatoire** : `ts-jest` ne type-vérifie pas en cross-file (`isolatedModules`), c'est le piège qui a coûté une reprise à la 36.5.

### 2. `PollService.setOptions()` (AC5, AC7, AC14, AC15)

- [x] `apps/api/src/poll/dto/set-poll-options.dto.ts` : copie de `PollOptionInput` (`@IsDateString`, `@IsEnum([...])`), `@ArrayMinSize(2)`, `@ArrayMaxSize(40)`, `@ValidateNested({ each: true })`, `@Type(() => …)`. Commenter la copie, comme le fait `create-seance-poll.dto.ts`.
- [x] `PollService.setOptions(partieId, pollId, userId, dto): Promise<SessionPollDto>` :
  - [x] `await this.parties.getOwned(partieId, userId)` — **MJ seul** (AC8) ;
  - [x] charger le poll avec `POLL_INCLUDE` ; refuser si absent / `partieId` différent (`NotFoundException`) / `status !== 'OPEN'` (`BadRequestException`) ;
  - [x] dédoublonner `date` + `slot` par la **même boucle `seen`** que `create()` (AC14) ;
  - [x] 🚨 **réconcilier, ne pas remplacer** (encadré n°4) : clé `${date.toISOString()}|${slot}`, `toCreate` / `toDeleteIds` / **conservées intouchées** ;
  - [x] une seule `prisma.$transaction` : `pollOption.deleteMany({ where: { id: { in: toDeleteIds } } })` puis la création des nouvelles — puis relire avec `POLL_INCLUDE` ;
  - [x] `realtimeEvents.emit(partieTopic(partieId))` **et** `await this.parties.notifyPartieSignalsChanged(partieId, userId)` (AC15) ;
  - [x] retourner `toDto(poll, await countParticipants(this.prisma, partieId))`.

### 3. La route (AC8, AC14)

- [x] `PollController` : `@Put(':pollId/options')` → `setOptions`, `@Param('id' | 'pollId', ParseUUIDPipe)`, `@CurrentUser()`, `@Body() dto: SetPollOptionsDto`.
- [x] **PUT et non PATCH**, avec le commentaire qui le dit : le corps décrit **l'état complet** du jeu d'options, pas une modification partielle. Ne **pas** réutiliser `:pollId/choose` ni `:pollId`.
- [x] 🚨 Ne **pas** rouvrir `POST /parties/:id/poll` (encadré n°1). Laisser le commentaire de la 8.8 en place.

### 4. Le service client web (AC4, AC5)

- [x] `apps/web/src/app/core/poll/poll.service.ts` : `setPollOptions(partieId, pollId, dto): Promise<SessionPollDto>` (`http.put`, `withCredentials: true`), aligné sur `castVote` / `chooseDate`.
- [x] **Création** : réutiliser `ScenariosService.createSeancePoll(seanceId, options)` tel quel (`core/scenarios/scenarios.service.ts:164`) — il appelle déjà `notifyChanged(partieId)`. **Aucun nouveau chemin de création.**

### 5. L'état de composition dans `CalendarView` (AC1, AC2, AC3, AC10, AC13)

- [x] `composing = signal(false)`, `composeTarget = signal<{ kind: 'poll'; pollId: string } | { kind: 'new' } | null>(null)`, `composedCells = signal<SelectedCell[]>([])`.
- [x] `startCompose()` : garde `isMjMode() && partieId() !== null` (AC10) ; si `destinyPoll()` désigne un vote ouvert **de cette partie**, cibler ce vote et **initialiser `composedCells` avec ses options actuelles** (AC13) ; sinon cibler `{ kind: 'new' }` avec un jeu vide.
- [x] `toggleComposedCell(date, slot)` : bascule pure, **aucun appel réseau** (AC2).
- [x] `cancelCompose()` : vide l'état, **aucune écriture** (AC3).
- [x] Effet de robustesse (patron 36.7 `closePicker()` / 36.9 fin de mode) : **si le vote ciblé disparaît, la composition s'annule** sans rien écrire. ⚠️ La 36.9 a dû ajouter une garde `partieId()` parce qu'en contexte personnel « absent de la liste » ne veut pas dire « clos » ; ici le mode n'existe **pas** hors contexte de partie (AC10), donc la garde est triviale — **la documenter plutôt que la recopier aveuglément**.

### 6. La validation, et l'avertissement (AC4, AC5, AC6, AC7, AC11)

- [x] `confirmCompose()` :
  - [x] calculer les options **retirées** par rapport à l'état de départ, et pour chacune le **nombre de votants** — lu sur les données déjà chargées (`activePolls()` → `poll.options[].votes.length`), **aucun appel réseau pour compter** ;
  - [x] si ce total est > 0 → **dialogue de confirmation AVANT tout appel** (AC6), texte nommant le nombre de votants et le nombre de créneaux concernés ; « Renoncer » revient au mode de composition **sans rien perdre** ;
  - [x] cible `poll` → `pollSvc.setPollOptions(...)`, puis `loadScenarios(partieId)` et `scenariosSvc.notifyChanged(partieId)` comme le fait déjà `onPollCreated()` ;
  - [x] cible `new` → **demander la séance** parmi `eligibleSeances()`, puis `scenariosSvc.createSeancePoll(seanceId, options)` (AC11) ; si `eligibleSeances()` est vide, **le dire** et ne pas proposer la validation ;
  - [x] garde `pollActionPending()` pendant l'appel (patron existant), et message d'erreur lisible en cas d'échec — **le mode ne se ferme pas sur une erreur**, sinon la composition est perdue.

### 7. La barre de composition et le point d'entrée (AC1, AC9, AC16)

- [x] Nouveau composant `features/calendar/compose-bar/` (`.ts` / `.html` / `.scss` / `.spec.ts`), **rendu pur** : entrées `count`, `targetLabel`, `busy` ; sorties `confirmed`, `cancelled`. `role="toolbar"`, `aria-label`, région `aria-live` annonçant le nombre composé (AC16).
- [x] Bouton « Ajouter des dates » dans `.calendar-controls`, **frère** de `<app-destiny-control>` (encadré n°2), sous `@if (isMjMode() && partieId())`.
- [x] Signalement du mode pendant toute sa durée (AC1) : classe sur `.calendar-page` **plus** la barre visible. **Pas** une simple couleur (AC16).
- [x] 🚨 **AC9 — retirer le bloc `new-vote-form`** de `calendar-view.html:104-129` (le `<label>`, le `<select #seanceSelect>`, le bouton « Lancer le vote »). Retirer **aussi** `startVoteFor()` et `noop()` de `calendar-view.ts:883-891` s'ils ne servent plus, et leurs tests — patron de la 36.9, qui a supprimé `onChooseDate()` avec le panneau qui l'appelait plutôt que de laisser du code mort.
- [x] ⚠️ **`eligibleSeances()` ne disparaît PAS** : la tâche 6 en a besoin pour la cible `new`. Ne pas le supprimer avec le sélecteur.
- [x] ⚠️ `lockedSeanceId` / `pollPanelOpen` / `<app-poll-creation>` (`calendar-view.html:253-262`) restent : ils portent l'arrivée depuis `SeanceList` via `?seanceId=` (story 8.7). **Ne pas les retirer.**

### 8. Le tap réassigné dans les deux grilles (AC2, AC12, AC13, AC17)

- [x] `CalendarMonthView` et `CalendarWeekView` : nouvelles entrées `composing = input(false)` et `composedKeys = input<ReadonlySet<string> | null>(null)`, nouvelle sortie `composeToggled`.
- [x] 🚨 **Entrées requises, ou à défaut explicite `null` / `false`** — jamais optionnelles « pour éviter de réparer des fixtures » (piège n°18 de la 36.9, déjà payé par `membersCount`, `partieId`, `group`, `destinyDates`).
- [x] Dans `onCellClick` : garde de date passée / hors mois **d'abord** (AC17), `slotSelected.emit` **conservé** (le rail suit, AC12), puis **si `composing()` → `composeToggled.emit({ date, slot })` et `return`** — avant la bascule de sélection, avant `voteOptionActivated`.
- [x] Neutraliser aussi les chemins clavier et gestuels qui armeraient une sélection (`onCellKeySelect`, appui maintenu, glissement) pendant la composition.
- [x] `(keydown.escape)` (`calendar-month-view.html:45` et `:198`, idem semaine) : en composition, **annuler la composition** et non la sélection (AC3). Un seul `Échap`, une seule signification à un instant donné.
- [x] Rendu d'un créneau composé : classe dédiée, **distincte** de `.selected` et du rendu d'une option de vote (AC13), plus l'état en toutes lettres dans le nom accessible de la bande — étendre `bandAriaLabel()`, ne pas créer un second chemin d'étiquetage (AC16).
- [x] 🚨 **Ne pas ajouter de nœud DOM** dans `.day-cell` / `.slot-cell` / `.band` pour porter l'état composé : le hit-test du glissement ne remonterait plus (piège n°7 de la 36.9).

### 9. Tests — API

- [x] `poll.service.spec.ts` (patron `makePrisma()` existant — **ajouter `pollOption.findMany` / `deleteMany` / `createMany`** au mock) :
  - [x] MJ requis : `getOwned` rejette → la mutation rejette (AC8) ;
  - [x] poll inconnu / d'une autre partie → `NotFoundException` ; poll `CLOSED` → `BadRequestException` (AC14) ;
  - [x] doublons `date` + `slot` → `BadRequestException` ; 1 option → refus ; 41 options → refus (AC14) ;
  - [x] 🚨 **le test qui compte** : jeu de départ `{A, B}`, jeu validé `{A, C}` ⇒ la suppression porte **l'id de B et lui seul**, la création porte **C seul**, et **aucune écriture ne cible A** (AC5, AC7) ;
  - [x] `emit(partieTopic)` **et** `notifyPartieSignalsChanged` appelés tous les deux (AC15) ;
  - [x] la mutation s'exécute dans `$transaction` (AC15).
- [x] `poll.controller.spec.ts` : la route délègue avec les bons paramètres.
- [x] ⚠️ Vérifier qu'aucun test existant n'assertait sur l'**absence** d'une route `options`.

### 10. Tests — Web

- [x] `compose-bar.spec.ts` : rendu, compteur, `aria-live`, émission des deux sorties.
- [x] `calendar-view.spec.ts` :
  - [x] AC10 — aucun bouton « Ajouter des dates » en contexte personnel, ni pour `mode='personal'` ;
  - [x] AC13 — armé sur un vote ouvert, l'état de départ **contient ses options** ;
  - [x] AC2 — deux bascules successives sur le même créneau reviennent à l'état de départ, **et aucun appel HTTP n'est parti** ;
  - [x] AC3 — `Échap` puis *Annuler* : `setPollOptions` et `createSeancePoll` **jamais appelés** ;
  - [x] AC6 — retirer une option votée ouvre le dialogue **avant** l'appel ; renoncer ⇒ **zéro appel** et l'état de composition **intact** ;
  - [x] AC4 / AC11 — cible `new` ⇒ `createSeancePoll(seanceId, options)` appelé, `setPollOptions` jamais ;
  - [x] AC11 — `eligibleSeances()` vide ⇒ la validation d'une création n'est pas offerte ;
  - [x] AC9 — le sélecteur « Planifier un vote pour : » n'est plus rendu.
- [x] `calendar-month-view.spec.ts` / `calendar-week-view.spec.ts` :
  - [x] AC12 — en composition, un tap sur une bande portant un vote **n'émet pas** `voteOptionActivated` et **n'arme pas** de sélection, mais émet `composeToggled` **et** `slotSelected` ;
  - [x] AC17 — un tap sur une date passée n'émet **rien** ;
  - [x] AC3 — `Échap` en composition remonte l'annulation de composition ;
  - [x] AC13 / AC16 — un créneau composé porte sa classe **et** son état dans `bandAriaLabel()`.
- [x] ⚠️ **Zoneless** : pas de zone.js, `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone — reprendre la **boucle de ticks** déjà établie dans `calendar-view.spec.ts`.

### 11. 🚨 Vérification visuelle réelle (obligatoire)

**Cinq stories d'affilée de cet épic ont vu la vérification à l'œil trouver ce qu'aucun test ne voyait** (36.9 : l'écran entièrement estompé, le mode qui mourait tout seul ; 36.5 : trois défauts de troncature). Ne pas la sauter.

- [x] Via **claude-in-chrome** (session de test déjà connectée — jamais le navigateur interne).
- [x] Armer la composition sur un vote ouvert : les options existantes sont-elles **visiblement** composées, et distinctes d'une sélection ?
- [x] Composer, valider, **relire** : les réponses des options conservées sont-elles toujours là ?
- [ ] ❌ Déclencher l'avertissement de l'AC6 et **lire le chiffre annoncé** — **NON FAIT**, voir les notes de complétion : le seul vote MJ atteignable porte 0 réponse, et en fabriquer une aurait écrit dans les données de l'utilisateur.
- [x] Vérifier le signalement du mode **en largeur téléphone** — c'est là que les surfaces se replient (`calendar-month-view.scss:270` sous 712 px, `calendar-detail-rail.scss:153` sous 768 px : les deux se taisent en même temps, défaut trouvé par la 36.5).
- [x] ⚠️ **Contrainte connue du jeu de données** : le compte de test est « Voyageur » (joueur) sur ses parties, et la 36.9 n'a **pas** pu voir le panneau MJ à l'œil pour cette raison. **Si un compte MJ avec vote ouvert n'est pas atteignable, le DIRE explicitement** au lieu de prétendre avoir vérifié — et **ne pas écrire en base** pour s'en fabriquer un (la 36.5 l'a fait via `psql` et les valeurs de démonstration **y sont toujours**).

### Review Findings

- [x] [Review][Decision→Patch] La clé de réconciliation de `setOptions()` n'était pas littéralement la même que celle de dédoublonnage de `create()`, contrairement à ce qu'affirmaient le commentaire (`poll.service.ts:353-356`) et les Dev Notes de l'encadré n°4 — `create()` déduplique sur la chaîne brute reçue (`` `${o.date}|${o.slot}` ``), `setOptions()` comparait sur `optionKey(date, slot)` normalisée (`date.toISOString()`). **Traité — décision utilisateur : harmoniser `create()`.** `create()` déduplique désormais via la même fonction `optionKey()` (déclaration hoistée, `poll.service.ts`), qui documente désormais explicitement être partagée par les deux méthodes. Nouveau test de régression : `poll.service.spec.ts`, « create() — deux options représentant le MÊME instant sous des formats différents → BadRequestException », qui aurait échoué sur l'ancien code. API 60/1317 (+1), typecheck propre.

- [x] [Review][Patch] Champ mort `composeInitialKeys` dans `CalendarView` [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — **traité** : champ retiré (déclaration + les deux affectations dans `startCompose()`/`cancelCompose()`). Le calcul réel des options retirées continue de se faire depuis `composedPollEntry()` (état courant de `activePolls()`), qui était déjà la source effective.

- [x] [Review][Patch] Fenêtre TOCTOU sur le chiffre de l'avertissement AC6 [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts, `confirmCompose()`] — **traité** : `voterCount` est revérifié juste avant l'appel réseau réel (après résolution du dialogue, avant `pollActionPending.set(true)`). S'il a augmenté par rapport à ce que le MJ a vu et confirmé, l'écriture n'a pas lieu et un message invite à revalider — jamais d'écriture silencieuse sur un consentement obsolète.

- [x] [Review][Patch] Absence de garde nulle après la relecture post-transaction [apps/api/src/poll/poll.service.ts, `setOptions()`] — **traité** : `if (!updated) throw new NotFoundException(...)` ajouté juste après la relecture, symétrique de la garde de la lecture initiale.

Post-review : API 60/1317 tests (baseline 1316, +1), typecheck propre ; web 110/2001 tests (baseline identique), typecheck propre.

### 12. Clôture

- [x] `docker compose exec api pnpm test`, `pnpm typecheck`, `pnpm lint` ; `docker compose exec web pnpm test`, `pnpm lint` — comparer à la baseline de la tâche 0.
- [x] Mettre à jour `deferred-work.md` (au minimum : le sort de « Sceller ce créneau », encadré n°5).
- [x] 🚨 Rappeler à l'utilisateur : **`/security-review` est NON OPTIONNEL sur cet épic** et il est **en dette depuis la 36.4**. Cette story est celle qui le justifie le plus — première écriture destructrice de données d'autrui.

---

## Hors périmètre

- Le scellement depuis la barre de sélection (encadré n°5, question n°2).
- « Lancer un vote depuis l'Agenda » → story 36.12, bloquée par Q-25.
- Toute modification du mode Destinée (36.9) ou du panneau « qui manque ».
- La refonte de l'Agenda (36.11), la barre repliée / la légende / les préférences (36.14).
- `PollStatusPanel` et `PollResponse` sur la fiche de scénario (`seance-list`, `scenario-read-dialog`) — intacts.
- Toute migration Prisma.
- La dette « le MJ ne figure jamais parmi les manquants ».

---

## Ce qui doit continuer de fonctionner

- **`SeanceList` → « Lancer le vote »** et l'arrivée `?seanceId=` sur le calendrier (`lockedSeanceId`, `PollCreationComponent`) — story 8.7, **non touchés**.
- **Répondre à un vote / retirer sa réponse** depuis la grille (36.7), **hors** composition.
- **Le mode Destinée** (36.9) : estompe, navigation `‹ n / N ›`, panneau « qui manque ».
- **La sélection et la déclaration** (36.3) : glissement, appui maintenu, portée, `Autre…`, `Entrée` / `Échap` — **hors** composition.
- **Le rail** (36.1) : il suit le dernier toucher, **y compris pendant la composition**.
- **La résolution de conflits** sur l'écriture groupée (36.4), **jamais** croisée avec la composition — ce sont deux écritures différentes.
- **Le scellement** depuis la fiche de scénario.
- **Les cinq chemins de vote existants** : créer (via séance), voter, retirer sa réponse, sceller, clore. Cette story en ajoute un **sixième**, elle n'en modifie aucun.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Rouvrir `POST /parties/:id/poll`** ou créer un poll sans séance (encadré n°1). Le commentaire de la 8.8 dit pourquoi ; il est encore là.
2. **Supprimer toutes les options et les recréer** (encadré n°4). Passe les tests d'affichage, **détruit toutes les réponses de tout le monde**. L'AC5 est le verrou ; écrire son test **avant** le code.
3. **Compter les votants après l'appel** au lieu d'avant (AC6). L'avertissement doit précéder l'écriture, pas la commenter.
4. **Oublier `notifyPartieSignalsChanged`** (AC15). Les cinq mutations existantes l'appellent toutes, **en plus** de `partieTopic`, jamais en remplacement.
5. **Laisser un chemin de composition en contexte personnel** (AC10). `partieId()` y est `null` : l'appel partirait sur `undefined` ou, pire, sur la mauvaise partie — le calendrier personnel agrège des votes de **plusieurs** parties.
6. **Fusionner composition et Destinée.** Deux états, deux durées de vie. La Destinée ne réassigne **aucun** geste ; la composition les réassigne **tous**.
7. **Neutraliser le rail** pendant la composition (AC12). Principe 2 : le rail suit, il ne se commande pas.
8. **Réutiliser `SelectionBar`** pour la barre de composition (encadré n°2) : elle n'existe qu'avec une sélection, et l'AC1 exige une barre **persistante**.
9. **Faire de `Échap` un geste ambigu** : en composition il annule la composition, point. Deux significations simultanées = collision non arbitrée.
10. **Ajouter un nœud dans la case** pour marquer un créneau composé — casse le hit-test du glissement, et **aucun test ne le verra** (piège n°7 de la 36.9).
11. **Rendre `composing` / `composedKeys` optionnels** dans les vues pour éviter de réparer des fixtures (piège n°18 de la 36.9).
12. **Supprimer `eligibleSeances()`** avec le sélecteur de l'AC9 : la création en a besoin.
13. **Supprimer `lockedSeanceId` / `<app-poll-creation>`** : c'est l'arrivée depuis `SeanceList`, pas le sélecteur visé par l'AC9.
14. **Écrire une migration Prisma.** Rien ne change dans le schéma.
15. **Oublier `pnpm typecheck` API après avoir touché `packages/shared`** — `ts-jest` ne type-vérifie pas en cross-file ; piège rencontré tel quel par la 36.5.
16. **Composer sur une date passée** (AC17) en court-circuitant la garde existante de `onCellClick`.
17. **Fermer le mode sur une erreur réseau** : la composition du MJ est perdue et il doit tout refaire.
18. **Poser une clé de ton dans un seul thème** : les trois, toujours (piège n°12 de la 36.9).
19. **Écrire en base de développement** pour se fabriquer un cas de test (fait par la 36.5, valeurs **toujours présentes**).

### Décisions arrêtées par cette story

- **D-1 — La séance se désigne à la VALIDATION, pas avant.** Le sélecteur de l'Oracle disparaît (AC9), mais l'invariant « un vote appartient à une séance » (encadré n°1) reste. La séance est donc demandée **au moment de valider une composition neuve**, pas au moment d'armer. Le premier geste redevient « désigner des créneaux sur la grille », ce que FR-52 demande, sans créer de `SessionPoll` orphelin. *(Question n°1 à l'utilisateur.)*
- **L'endpoint est déclaratif** : `PUT /parties/:id/poll/:pollId/options`, corps = **le jeu complet** d'options voulu. Un delta `{ add, remove }` obligerait le client à connaître les `id` d'options et à gérer un état intermédiaire ; le jeu complet est exactement ce que la grille produit.
- **La réconciliation se fait sur `date` + `slot`**, la clé métier qui sert déjà de clé de dédoublonnage dans `create()`. **Une option conservée garde son `id`.**
- **Les bornes 2..40 sont reprises telles quelles** de `CreatePollDto` — pas de troisième vocabulaire de validation pour la même notion.
- **La composition est réservée au contexte de partie, MJ** (AC10), garde structurelle.
- **Le comptage des votants de l'avertissement est purement client**, lu sur des données déjà chargées (`activePolls()`), sans appel réseau.
- **Le bouton « Ajouter des dates » vit dans la bande de contrôles**, frère de la Destinée — ⚠️ écart assumé avec `contrat-ui-calendrier.html:376`, motivé à l'encadré n°2, **à répercuter par `bmad-ux`**.
- **`startVoteFor()` / `noop()` sont supprimés avec le sélecteur**, pas laissés en code mort (patron 36.9).

### Décisions laissées à l'implémentation

- **Où le MJ désigne la séance** à la validation d'une création : dialogue `MatDialog` ou `select` intégré à la barre de composition. *Recommandation : dialogue — la barre doit rester lisible en largeur téléphone, et le choix est ponctuel.*
- **Représentation de `composedCells`** : `SelectedCell[]` (réutilise `selection.utils.ts`) ou `ReadonlySet<string>` de clés. *Recommandation : `SelectedCell[]` dans `CalendarView` — c'est la forme que le DTO attend — et un `ReadonlySet<string>` dérivé pour ce qui descend dans les vues, comme `destinyDates()`.*
- **Le traitement visuel exact** d'un créneau composé (`aria-pressed` + forme, jamais la couleur seule). *À régler à l'œil, thème par thème (tâche 11).*
- **Le libellé exact** de la barre et du dialogue d'avertissement, et l'éventuelle clé de ton associée.
- **Création des nouvelles options** : `createMany` ou `create` en boucle dans la transaction.

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4.0.8, TypeScript 6.0.2. `@if` / `@for`, signals, `input()` / `output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **API** : NestJS 11.1, Prisma 7.8 (générateur `prisma-client-js` legacy), TypeScript 5.7, Jest 30. `class-validator` sur **tous** les DTO.
- **Aucune dépendance nouvelle. Aucune migration.**
- **Exécution : tout par Docker** — `docker compose exec api pnpm <…>` / `docker compose exec web pnpm <…>`. Jamais d'outil Node sur l'hôte.
- **Context7 (MCP)** avant d'écrire du code framework-spécifique — en particulier pour la forme de `$transaction` et de `deleteMany` en Prisma 7.
- `packages/shared` **est** modifié ⇒ `pnpm typecheck` API **et** web sont exigés.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : câblage nouveau REQUIS côté serveur, aucun côté client.**

- La mutation d'options **change ce que voient tous les membres** de la partie : nouvelle option = nouveau créneau proposé dans leur grille ; option retirée = réponse disparue. Elle doit donc émettre `partieTopic(partieId)` **et** appeler `notifyPartieSignalsChanged(partieId, mjId)` (AC15), exactement comme les cinq mutations existantes de `poll.service.ts`.
- **Le signal métier concerné est `VOTE_EN_COURS_SANS_REPONSE`** (story 29.7, `AD-14`) : ajouter une option le fait **réapparaître** chez les membres qui avaient tout répondu ; en retirer une peut le faire **disparaître**. C'est le raisonnement déjà écrit pour `castVote()` et `withdrawVote()`.
- Côté client, `scenariosSvc.changed()` recharge déjà les scénarios (donc `activePolls()`) dans `CalendarView` (`:729`) — **rien à câbler de plus**. Après une écriture locale, appeler `loadScenarios()` / `notifyChanged()` comme le fait `onPollCreated()`.
- Écarts SSE existants inchangés : `heatmap` et `GET /me/calendar` non câblés (`deferred-work.md`).
[Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`), **en dette depuis la 36.4**, et **cette story est celle qui le motive**.

- **Autorisation** : `parties.getOwned(partieId, userId)` sur la mutation d'options — MJ seul (AC8). `createSeancePoll()` porte déjà sa propre garde `getOwned`, plus le refus d'un scénario `PASSE` et d'une séance déjà liée.
- **Écriture destructrice de données d'autrui** : retirer une option supprime les `PollVote` d'autres membres par cascade (encadré n°4). C'est **autorisé par Q-22** (`prd.md:479`), sous avertissement chiffré préalable. **Toute perte au-delà des options explicitement retirées est un défaut de sécurité, pas un défaut d'affichage.**
- **`pollId` vient de l'URL** : vérifier systématiquement que le poll appartient bien à `partieId` (patron déjà appliqué par `castVote`, `withdrawVote`, `choose`, `close`) — sans quoi un MJ pourrait muter le vote d'une **autre** partie en forgeant un `pollId`. `ParseUUIDPipe` sur les deux paramètres.
- **Charge bornée** : `ArrayMaxSize(40)` empêche un corps arbitrairement long ; le dédoublonnage empêche 40 options identiques.
- **XSS** : aucune donnée textuelle libre n'entre ici — seulement des dates et un enum de créneau. Les libellés rendus (titre de scénario, noms) le sont par interpolation, **jamais `[innerHTML]`**.
- **Aucune donnée nouvelle n'est exposée** : la barre et le dialogue lisent `activePolls()`, déjà chargé, déjà rendu et déjà gardé par `@if (isMjMode())`.

### Dette refermée par cette story

- **Le sélecteur « Planifier un vote pour : »** — un formulaire séparé à côté d'un calendrier qui montrait déjà les dates (`prd.md:340`, motif de FR-52).
- **La mutation des options d'un vote ouvert n'existait pas** (`addendum.md:98` : « c'est le seul manque »). **D-16 est refermée.**

### Dette explicitement NON refermée

- ⚠️ **« Sceller ce créneau » depuis la barre de sélection** (encadré n°5) — reste sans story porteuse ; le calendrier n'a toujours **aucun** chemin de scellement depuis la 36.9.
- **Le MJ ne figure jamais parmi les manquants.**
- Les entrées existantes de `deferred-work.md` : `heatmap` sans SSE, `GET /me/calendar` sans SSE, liste Agenda non bornée, `seance.findMany` non borné, `.seance-dot`, « Soirée » / « Soir », arrondi des trois segments de piste, budget de bundle web.
- ⚠️ **Les valeurs de démonstration écrites en base de développement par la 36.5** (séance du 3 septembre) sont **toujours présentes**.
- ⚠️ **La vérification visuelle du panneau réduit de la 36.9** reste due (aucun compte MJ avec vote ouvert dans le jeu de données).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md:2327-2374`] — les neuf AC, verbatim.
- [Source: `_bmad-output/planning-artifacts/epics.md:1926, 335`] — portée « Serveur (D-16) + front », `/security-review` non optionnel.
- [Source: `prds/prd-jdr-master-2026-08-01/prd.md:336-340`] — FR-52 · [`:433`] — D-16 · [`:479`] — Q-22, la règle de retrait.
- [Source: `prds/prd-jdr-master-2026-08-01/addendum.md:98`] — « c'est le seul manque ».
- [Source: `ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:538, 576, 597`] — principe 4, déclencheur, collision 5.
- [Source: `ux-designs/…/mockups/contrat-ui-calendrier.html:376, 414`] — « Ajouter des dates », disparition du sélecteur.
- [Source: `apps/api/src/poll/poll.controller.ts:37-41`] — pourquoi la création générique est fermée.
- [Source: `apps/api/src/poll/poll.service.ts:38-46, 60-75`] — dédoublonnage, patron SSE.
- [Source: `apps/api/src/scenarios/scenarios.service.ts:605-648`] — `createSeancePoll`.
- [Source: `apps/api/prisma/schema.prisma:299-320`] — cascade `PollOption` → `PollVote`.
- [Source: `apps/web/.../calendar-view.ts:243-273, 576-680, 883-891`] — `activePolls`, `eligibleSeances`, Destinée, `startVoteFor`.
- [Source: `apps/web/.../calendar-view.html:104-129`] — le bloc à retirer (AC9).
- [Source: `apps/web/.../calendar-month-view.ts:460-520`] — `onCellClick`, gardes de date, `voteOptionActivated`.
- [Source: `_bmad-output/implementation-artifacts/36-9-le-mode-destinee-et-le-panneau-reduit-a-qui-manque.md`] — pièges, patrons de mode, discipline de vérification visuelle.
- [Source: `_bmad-output/project-context.md`, `CLAUDE.md`, `docs/checklist.md`] — Docker, conventions, SSE, rappels de fin de palier.

---

## Questions pour l'utilisateur (elles ne bloquent pas l'implémentation)

1. **Où le MJ désigne-t-il la séance d'un vote NEUF ?** L'AC9 retire le sélecteur de l'Oracle, mais un vote ne peut pas exister sans séance (encadré n°1). La story tranche **D-1 : la séance se demande à la validation**, pas à l'armement. Alternative : réserver la composition à la **modification** d'un vote existant et laisser la création à la 36.12 (« Lancer un vote depuis l'Agenda »), ce qui reporterait l'AC4. **Confirmez-vous D-1 ?**
2. **« Sceller ce créneau » depuis la barre de sélection** — la 36.9 a laissé la question ouverte en proposant explicitement de l'attacher à cette story. Cette story **ne le prend pas**. Faut-il l'ajouter ici, en faire une story, ou l'accepter jusqu'à la 36.12 ?
3. **Le glissement doit-il composer plusieurs créneaux d'un coup ?** L'AC2 ne parle que du tap, et la story s'y tient : le glissement reste un geste de sélection, donc **neutralisé** pendant la composition. Est-ce le comportement voulu, ou attendez-vous une composition par glissement ?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-22)

### Debug Log References

| | Baseline (HEAD `7812482`, arbre propre) | Arrivée |
| --- | --- | --- |
| API — suites / tests | 60 / 1303 | **60 / 1316** (+13) |
| API — typecheck | propre | **propre** |
| API — lint `src/poll` | 179 problèmes | **210** (+31, voir ci-dessous) |
| Web — fichiers / tests | 109 / **1961** | **110 / 2001** (+1 fichier, +40 tests) |
| Web — lint | 143 problèmes | **142** (−1) |

**Écart de baseline constaté** : **1961 tests web et non 1960** comme l'annonçait la story — les repères venaient de la 36.9 et étaient donnés « à reconfirmer ». Tous les autres repères sont tombés juste.

**Delta de tests web** : +43 ajoutés, **−3 retirés** (les trois de `startVoteFor()`, supprimés avec le gestionnaire — voir les notes).

**⚠️ Lint API `src/poll` : +31, assumé et non corrigé.** Les 31 sont tous des `@typescript-eslint/no-unsafe-*` **dans le fichier de test**, et ils sont la conséquence mécanique du harnais existant : `makePrisma()` renvoie un `any`, donc chaque `prisma.pollOption.deleteMany` d'un test neuf produit deux à trois erreurs. C'est exactement ce qui compose déjà la baseline de 179. Les typer supposerait de réécrire `makePrisma()` pour tout le fichier — hors périmètre de cette story, et un refactor qui toucherait 30 tests existants. **Le code de production, lui, n'ajoute AUCUNE erreur** : les deux qu'il avait (un `as any` sur `slot`, un défaut de format) ont été corrigés, `slot` étant désormais typé `DaySlot` de bout en bout.

**Web `pnpm build`** : compile sans erreur TypeScript ni erreur de gabarit ; sort en échec sur le **budget de bundle pré-existant** (1,44 Mo contre 1,00 Mo), non causé par cette story.

### Completion Notes List

**✅ VÉRIFICATION VISUELLE RÉELLE FAITE, ET POUR LA PREMIÈRE FOIS DE L'ÉPIC ELLE N'A TROUVÉ AUCUN DÉFAUT.** Six stories d'affilée en avaient révélé ; celle-ci passe. Les contrôles ont été spécifiques, pas cosmétiques (claude-in-chrome, compte **Diane**, thème Forêt ancienne, partie « Les Veilleurs du Pont » où elle est **Guide**) :

- **AC10 vu à l'écran** : sur `/profile/calendar`, la Destinée est rendue et « Ajouter des dates » **ne l'est pas**. La garde de contexte tient sur la surface, pas seulement dans les tests.
- **AC1** : le bouton apparaît en contexte de partie MJ **une fois la Destinée armée**, frère de « ✦ Destinée · bibou ». C'est la précondition littérale d'`EXPERIENCE.md:576` (« MJ, mode Destinée ») — et la raison pour laquelle il était absent avant d'armer, sur une partie dont la seule séance porte déjà un vote (`eligibleSeances()` vide).
- **AC13 vu à l'écran** : à l'armement, la barre annonce « Créneaux du vote : bibou — **14 créneaux désignés** », et les bandes concernées portent le liseré orange tireté, nettement distinct du traitement de sélection.
- **🚨 AC13 — LA GARDE DE `startCompose()` S'EST PROUVÉE EN CONDITIONS RÉELLES.** Le compteur disait **14** alors que la grille n'en montrait que **6** : les huit autres options tombent hors du mois affiché. Si le jeu de départ avait été dérivé d'`allCalendarEntries()` — le geste le plus naturel, et celui que toutes les autres dérivations de la story emploient — ces huit options auraient été absentes du jeu de départ, donc **silencieusement SUPPRIMÉES à la validation**, avec les réponses qu'elles portent. Le commentaire qui l'interdit dans `startCompose()` n'est pas défensif : le cas s'est présenté au premier essai.
- **AC2 mesuré** : un tap sur le 26 août matin fait passer le compteur de 14 à **15**, la bande prend le liseré, **le rail suit** (« MERCREDI 26 AOÛT — MATIN ») et **aucune barre de sélection n'apparaît**. Un second tap revient à 14.
- **AC16 lu sur le DOM réel** : `role="toolbar"` + `aria-label` sur la barre, et le nom accessible d'une bande désignée se termine bien par « — désigné pour le vote », **en plus** du titre, de la participation et du canal groupe (il ne les remplace pas).
- **AC3 mesuré** : `Échap` retire la barre, remet le compteur à zéro désigné, ramène le bouton d'armement — **et n'arme aucune sélection au passage**.
- **AC1 en LARGEUR TÉLÉPHONE (viewport ~380 px)** : la barre reste rendue et **entièrement lisible**, sur deux lignes, sans troncature ; le bouton d'armement y mesure 132 px et reste visible. **Aucun écart du type de celui de la 36.5** — ni la barre ni le bouton ne portent de requête de média ou de conteneur.
- **AC9 vérifié sur le DOM réel** : ni `.new-vote-form`, ni la chaîne « Planifier un vote pour » nulle part dans la page.

**❌ CE QUI N'A PAS ÉTÉ VU, ET POURQUOI — L'AVERTISSEMENT DE L'AC6.** Le seul vote MJ atteignable (« bibou ») porte **0 réponse sur 2**. Le dialogue ne s'ouvre donc jamais sur ce jeu de données, et le voir aurait supposé de **poser une réponse dans les données réelles de l'utilisateur** — précisément le piège n°19 de la story, et le reproche déjà fait à la 36.5 (dont les valeurs de démonstration posées via `psql` sont **toujours en base**). Je ne l'ai pas fait, et je ne l'ai pas prétendu. Le chemin est couvert par **six tests** qui vérifient l'ordre (dialogue AVANT l'appel), le chiffre exact (`voterCount: 1`), le renoncement sans perte et le retrait confirmé. **`ComposeConfirmDialog` reste donc un composant jamais vu à l'écran** — consigné dans `deferred-work.md`.

**⚠️ AUCUNE ÉCRITURE N'A ÉTÉ FAITE PENDANT LA VÉRIFICATION.** Le mode a toujours été quitté par « Annuler » ou `Échap`, jamais par « Valider ». La base de développement est dans l'état où je l'ai trouvée, et l'écran a été laissé Destinée éteinte, fenêtre restaurée.

**Décisions prises en cours d'implémentation :**

- **`startCompose()` lit `destinyPollId()` + `activePolls()`, et non `destinyPoll()`** — écart avec ce que la story recommandait, motivé par le cas ci-dessus : `destinyPoll()` dérive des entrées du calendrier, donc de la plage affichée. Un vote mis en avant dont aucun créneau ne tombe dans le mois courant aurait été lu comme « pas de cible », et la validation aurait **créé un second vote** au lieu de modifier le premier. `canCompose()` a été aligné sur la même source.
- **`ScenariosService.notifyChanged()` est privé** : la première rédaction l'appelait après `setPollOptions()`. Retiré au profit du patron réel d'`onClosePoll()` — `PollService` écrit, `loadScenarios()` relit, et la notification de domaine est portée par le `partieTopic` que le serveur émet déjà (AC15).
- **Un seul dialogue, deux faces exclusives** (`ComposeConfirmDialog`) plutôt que deux composants : un vote qui n'existe pas encore ne porte aucune réponse à perdre, donc « désigner la séance » et « avertir de la perte » ne peuvent jamais s'afficher ensemble. Documenté comme tel.
- **Point d'étranglement unique pour la neutralisation des gestes** : la garde `composing()` est posée dans `armSelection()`, que traversent l'appui maintenu, le glissement **et** le clavier — plus une garde propre à `onShiftArrow()`, seul chemin qui pose l'ancre lui-même. Trois gestes, une seule ligne, aucun chemin ne peut y échapper par oubli.
- **Parité clavier** : `Espace` / `1` / `2` / `3` composent aussi. Sans cela le mode aurait été inatteignable sans pointeur.
- **`startVoteFor()` et `noop()` SUPPRIMÉS** avec le sélecteur qui les appelait (AC9), et leurs trois tests avec eux — patron de la 36.9 pour `onChooseDate()`. Le quatrième test, qui vérifiait l'étiquetage « scénario — séance », a été **réorienté** sur `composeSeanceChoices()`, la seule surface qui désigne encore une séance : le libellé est inchangé, seul son point d'affichage a bougé. `eligibleSeances()`, `lockedSeanceId`, `pollPanelOpen` et `<app-poll-creation>` sont **intacts** — ils portent l'arrivée depuis `SeanceList`.
- **Bornes 2..40 redites dans le service**, en plus du DTO : le service est appelable sans pipe de validation, et c'est lui qui porte l'invariant.
- **Aucune clé de ton ajoutée** : les libellés de cette story (« Ajouter des dates », « Valider », « Annuler ») viennent du contrat d'UI et ne sont pas déclinés par thème, contrairement au nom du mode Destinée.

**Reste dû, et explicitement pas fait :**

- ❌ **`/security-review`** — **NON OPTIONNEL sur cet épic** (`epics.md:335`), en dette depuis la 36.4, et **cette story est celle qui le motive le plus** : premier chemin d'écriture destructrice de données d'autrui du calendrier (retirer une option supprime les `PollVote` par cascade), nouvelle route d'écriture, nouveau DTO.
- ❌ **`/code-review`** sur cette story.
- ❌ **`ComposeConfirmDialog` n'a jamais été rendu à l'écran** (voir ci-dessus).
- ❌ **`/code-review` de la 36.8** reste à lancer, et sa vérification visuelle reste due par l'utilisateur.

### File List

**Nouveaux (8)**

- `apps/api/src/poll/dto/set-poll-options.dto.ts`
- `apps/web/src/app/features/calendar/compose-bar/compose-bar.ts`
- `apps/web/src/app/features/calendar/compose-bar/compose-bar.html`
- `apps/web/src/app/features/calendar/compose-bar/compose-bar.scss`
- `apps/web/src/app/features/calendar/compose-bar/compose-bar.spec.ts`
- `apps/web/src/app/features/calendar/compose-confirm-dialog/compose-confirm-dialog.ts`
- `apps/web/src/app/features/calendar/compose-confirm-dialog/compose-confirm-dialog.html`
- `apps/web/src/app/features/calendar/compose-confirm-dialog/compose-confirm-dialog.scss`

**Modifiés (16)**

- `packages/shared/src/index.ts`
- `apps/api/src/poll/poll.service.ts`
- `apps/api/src/poll/poll.service.spec.ts`
- `apps/api/src/poll/poll.controller.ts`
- `apps/api/src/poll/poll.controller.spec.ts`
- `apps/web/src/app/core/poll/poll.service.ts`
- `apps/web/src/app/features/calendar/selection.utils.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts`

**Documentation**

- `_bmad-output/implementation-artifacts/deferred-work.md`

🚨 **AUCUNE migration Prisma.** `apps/api/prisma/` n'est pas touché.

### Change Log

- **2026-08-22** — Story 36.10 implémentée (bmad-dev-story). **D-16 refermée** : `PUT /parties/:id/poll/:pollId/options`, déclaratif, réconcilié sur la clé métier `date|slot` — **une option conservée garde son `id` et ne subit aucune écriture**, seules les options réellement retirées perdent leurs réponses (cascade `PollVote`). MJ seul (`getOwned`), poll `OPEN` seul, bornes 2..40, doublons refusés, transaction unique, `partieTopic` **et** `notifyPartieSignalsChanged`. Front : mode de composition (**le seul de l'application qui réassigne le tap**), barre persistante, dialogue de validation à deux faces exclusives (désigner la séance / avertir du nombre de réponses détruites), traitement `composed` distinct de `selected` dans les deux grilles, `Échap` désambiguïsé. **AC9 : le sélecteur « Planifier un vote pour : » retiré de l'Oracle**, avec `startVoteFor()`, `noop()` et leurs trois tests. Vérification visuelle réelle faite, **aucun défaut trouvé** — et elle a prouvé en conditions réelles la garde de `startCompose()` (14 options composées, 6 seulement dans le mois affiché : dériver le jeu de départ des entrées les aurait supprimées en silence). ⚠️ Écart assumé avec `contrat-ui-calendrier.html:376` (armement dans la bande de contrôles, pas dans la barre de sélection), à répercuter par `bmad-ux`. API 60/1316 (baseline 1303), typecheck propre ; web 110/2001 (baseline 109/1961), lint 142 (baseline 143). Aucune migration. ❌ `/security-review` TOUJOURS DÛ, et non optionnel sur cet épic.
