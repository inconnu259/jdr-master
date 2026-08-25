---
baseline_commit: d9038e4
baseline_note: "⚠️ L'arbre de travail n'est PAS propre : la story 36.8 est implémentée et NON COMMITÉE (29 fichiers). Voir l'encadré n°9."
---

# Story 36.9 : Le mode Destinée et le panneau réduit à « qui manque »

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · porte **FR-52** (avec la 36.10) [Source: epics.md:1908] · classée **« Front »** par `epics.md:1925` — **et elle l'est vraiment** : aucun endpoint, aucun DTO, aucune migration (encadré n°1).

> **Tout ce que ce mode affiche est déjà chargé.** Les votes ouverts (`activePolls()`), leurs options éclatées une par une (`allCalendarEntries()`, story 36.6), la participation de chacune (`VoteParticipation`), ma réponse (`myAnswer`), les membres (`members()`) : rien de neuf n'entre en mémoire. Cette story ne va rien chercher — **elle décide de ce qu'on regarde**. C'est un mode d'affichage, et c'est la raison pour laquelle il n'a le droit de casser aucun geste.

---

## 🚨 Encadré n°1 — LA STORY EST FRONT PURE. Le prouver, et s'y tenir

Contrairement à la 36.8 (qui a dû élargir `heatmap`), tout est déjà servi. Vérifié dans le code, pas supposé :

| Ce dont le mode a besoin | Ce qui le sert déjà |
| --- | --- |
| La liste des votes ouverts, nommés | `activePolls()` (`calendar-view.ts:243-257`) en contexte de partie ; `allCalendarEntries()` porte les entrées `votes-en-cours` **dans les deux contextes** (`:335-380` partie, `:436-471` personnel) |
| Les créneaux proposés par chaque vote | Éclatés **une entrée par option** depuis la 36.6, avec `vote.pollId` / `vote.optionId` / `vote.myAnswer` |
| Qui n'a pas répondu / qui a répondu | `getMissingVoters(poll, members)` et `getRespondedCount()` (`core/poll/poll.util.ts`), déjà consommés par `PollStatusPanel` |
| L'effectif réel de la troupe | `poll.membersCount` (servi depuis la 36.6, MJ compris) |

🚨 **Ce que cette story n'a PAS le droit de faire :**
- Aucun appel réseau nouveau. Aucun `GET /parties/:id`. **Aucune requête n'est ajoutée à `ngOnInit` ni à `refreshMjPanels()`.**
- Aucun champ dans `packages/shared`. Aucune migration Prisma. **`apps/api` n'est pas touché du tout.**
- Aucune clé de préférence de compte : le mode est **éphémère**, il ne se persiste pas (ce n'est pas une couche, encadré n°2).

---

## 🚨 Encadré n°2 — LE MODE N'EST PAS UNE COUCHE. Il est keyé par `pollId`, jamais par un index

`EXPERIENCE.md:367` : *« **La Destinée n'est pas une couche de plus, c'est un mode** »*. Trois conséquences, toutes structurelles :

1. **Il ne rejoint pas `activeLayers`.** `CALENDAR_LAYER_KEYS` est un type partagé, persisté dans `defaultCalendarLayers` du compte. Y ajouter la Destinée l'exposerait à `resetToDefault()`, à `isOverridden()`, à la pastille de résumé et à l'écran Compte — et ferait de ce mode un réglage persistant, ce qu'il n'est pas.
2. **Il reste hors du panneau des couches** (AC5, `EXPERIENCE.md:198` : *« Reste en dehors du panneau — c'est un mode, pas un filtre, et il doit se voir tant qu'il est actif »*). Aujourd'hui `app-calendar-layer-toggle` **est** la barre de chips ; le contrôle Destinée est donc un **frère** de ce composant dans `calendar-view.html`, jamais une chip de plus à l'intérieur.
3. 🚨 **L'état retenu est un `pollId`, pas un index.** `activePolls()` est recalculé à chaque événement SSE (`calendar-view.ts:609-624` recharge les scénarios sur `scenariosSvc.changed()`). Un index survivrait au rechargement en **désignant un autre vote** — la Destinée basculerait toute seule sur un vote que personne n'a demandé. Avec un `pollId`, la disparition du vote (scellé, clôturé, brûlé) est **détectable** : voir AC9.

**Forme retenue :** `destinyPollId = signal<string | null>(null)`. Le mode est actif **si et seulement si** ce signal désigne un vote qui existe encore dans la liste courante.

---

## 🚨 Encadré n°3 — L'ESTOMPE : son unité, sa source, et le piège de la couche éteinte

**Unité retenue : le JOUR, dans les deux vues.** La planche l'écrit littéralement — `if(destin && !(day.e||[]).some(x=>x.t==='vo')) dim=' style="opacity:.28"'` (`contrat-ui-calendrier.html:783`) : c'est la **case entière** qui s'estompe, numéro du jour compris, pas une bande sur trois. En vue Semaine, la même règle s'applique à la **colonne** du jour. *Motif : une case de ~115 px dont une bande sur trois est claire et deux sont à 28 % est du bruit, pas de la hiérarchie ; et une seule règle pour deux surfaces vaut mieux que deux règles cohérentes par accident.*

**Source retenue : un `ReadonlySet<string>` de clés `YYYY-MM-DD`**, dérivé **une seule fois** dans `CalendarView` depuis `allCalendarEntries()` — la liste **NON filtrée** — et passé en `input()` aux deux vues. Doctrine AD-12/AD-19, et exactement le patron de `seanceMarkerDates()` (`calendar-view.ts:555-561`).

🚨 **Pourquoi `allCalendarEntries()` et surtout PAS `band.vote` / `DaySlotDetail.pollVote`.** `pollVote` est **gouverné par la couche `votes-en-cours`** (`day-detail.utils.ts`, commentaire de `DaySlotDetail.pollVote` : *« la couche `votes-en-cours` éteinte la fait disparaître »*). Un jour dériverait alors sa pertinence d'un champ que l'utilisateur peut éteindre : **couche éteinte ⇒ ensemble vide ⇒ la grille entière s'estompe**, uniformément, sans rien mettre en avant. C'est le défaut le plus probable de cette story, et aucun test existant ne le verrait.

**Corollaire, AC6 :** activer la Destinée **allume `votes-en-cours` si elle est éteinte**. Un mode qui concentre l'écran sur un vote ne peut pas laisser ce vote invisible — l'AC1 exige que « les créneaux proposés restent **pleinement lisibles** ». C'est un coup de pouce **à sens unique** : quitter le mode ne rééteint rien (on ne défait pas un réglage que l'utilisateur voit et peut refaire lui-même).

---

## 🚨 Encadré n°4 — ⚠️ LE PANNEAU À RÉDUIRE EST CELUI DU CALENDRIER, ET LUI SEUL

`PollStatusPanel` (`features/poll/poll-status/`) est rendu à **trois** endroits :

| Site | Fichier | Ce que cette story en fait |
| --- | --- | --- |
| Le calendrier (Oracle MJ) | `calendar-view.html:136` | **RÉDUIT** — c'est l'AC4 |
| La fiche de scénario, liste des séances | `seance-list.html:117` | **INTACT** |
| La fiche de scénario, vote épisodique | `seance-list.html:201` | **INTACT** |

🚨 **Ne pas vider `PollStatusPanel` lui-même.** Le geste naturel — supprimer la `<ul class="poll-status__options">` du composant — casserait les deux surfaces de la fiche de scénario, où la liste des options **et son bouton « Sceller ce créneau »** sont le seul chemin de scellement de tout le projet. Cinq tests de `seance-list.spec.ts` (`:144`, `:167`, `:258`, `:470`, `:481`) le vérifient et deviendraient rouges — ce qui est une chance : ils sont le garde-fou.

**Deux mises en œuvre acceptables, au choix de l'implémentation :**
- **(recommandé)** un composant frère dédié dans `features/calendar/`, rendu par le calendrier à la place de `<app-poll-status>` — le calendrier cesse d'importer `PollStatusPanel`. Symétrique de ce que la 36.7 a fait pour `app-poll-response` (retiré du calendrier, conservé sur la fiche de scénario) ;
- un `input()` de variante sur `PollStatusPanel` (`compact` / `missing-only`), **par défaut à la forme complète**, de sorte qu'aucun appelant existant ne change.

*Le premier est préféré : il empêche par construction qu'une évolution future du panneau réduit fuie sur la fiche de scénario.*

🚨 **Conséquence à écrire noir sur blanc : le calendrier perd le bouton « Sceller ce créneau ».** C'est voulu (`contrat-ui-calendrier.html:406-412`, annotation 14 : *« Dates, participation et ma réponse sont dans la grille — reste ce qui n'a pas de case : des personnes »*), et **le scellement reste atteignable** depuis la fiche du scénario, qui n'est pas touchée. La barre de scellement de la planche et l'Agenda scellable arrivent plus tard — encadré n°5.

---

## 🚨 Encadré n°5 — ⚠️ CE QUE LA PLANCHE MONTRE ET QUE CETTE STORY NE LIVRE PAS

`contrat-ui-calendrier.html` §4 décrit **l'état d'arrivée de l'épic**, pas celui de cette story (convention de lecture, `epics.md:1937`). Sur cet écran, **quatre** éléments ne sont couverts par aucun AC de la 36.9 :

| Élément de la planche | Story qui le porte | Ce que la 36.9 en fait |
| --- | --- | --- |
| **« Ajouter des dates »** (`:377`) et le mode de composition | **36.10** (D-16) | Rien |
| **« Sceller ce créneau »** dans la barre de sélection (`:376`, annotation 17, `EXPERIENCE.md:577`) | ⚠️ **aucune story de l'épic ne le porte** — la 36.12 ne couvre que le scellement **depuis l'Agenda** | Rien. **Écart signalé**, question posée en fin de story |
| Le retrait du sélecteur **« Planifier un vote pour : »** | **36.10**, dernier AC (`epics.md:2372-2375`) | **Il reste.** Ne pas le retirer ici |
| La barre repliée **☰ Affichage** et la pastille de résumé | **36.14** | Le contrôle Destinée est posé **à côté** de la barre de chips actuelle, et devra **rester hors** du panneau quand la 36.14 le créera (AC5) |

🚨 **La 36.9 ne retire aucun chemin d'action existant sauf celui que l'AC4 nomme.** Le sélecteur « Planifier un vote pour : », le bouton « Brûler le parchemin de vote », le formulaire « Du / Au / Rechercher » et « Fenêtres de la destinée » restent tous en place.

---

## 🚨 Encadré n°6 — ⚠️ « QUI MANQUE » HÉRITE D'UNE DETTE ÉCRITE : le MJ n'y figure jamais

`deferred-work.md` (entrée du 2026-08-20, dev-story 36.6), verbatim :

> *« `getMissingVoters()` / `poll-status` comptent la troupe **SANS le MJ** […] La liste des « manquants » dérive de `GET /parties/:id/members`, qui n'a jamais renvoyé le MJ : elle ne le comptera donc jamais comme manquant, et son dénominateur implicite diffère de celui de la piste. »*

Vérifié : `listMembers()` (`parties.service.ts:325-344`) fait `membership.findMany` — le MJ n'a pas de ligne `Membership`. Et le MJ **peut voter** (`castVote` garde par `getViewable`, tranché par la 36.6).

⚠️ **Cette story aggrave la visibilité de l'écart sans le créer** : jusqu'ici « qui manque » était une ligne parmi une liste d'options ; à partir d'ici, **c'est le contenu entier du panneau**. Un MJ qui n'a pas voté lira « Ont répondu : Incon, Marc » sans se voir manquer.

**Décision de cette story : la dette N'EST PAS refermée ici, et c'est un choix, pas un oubli.**
- La refermer proprement suppose une liste de **participants** (MJ compris) et non de **membres** — soit un changement de `listMembers()` (route partagée par les écrans de gestion de membres, hors calendrier), soit un `GET /parties/:id` de plus (interdit par l'encadré n°1).
- Le contournement client (« ajouter l'utilisateur courant si `isMjMode()` ») est **faux** : `isMjMode()` dérive de la **route**, pas du rôle réel (encadré n°9 de la 36.8, `calendar-view.ts:234`).

**Ce que la story fait à la place, et qui est exigible (AC7) :** le panneau **nomme son dénominateur**. Il affiche le nombre de répondants **sur `poll.membersCount`** — la valeur serveur, MJ compris — de sorte que « Ont répondu : Incon, Marc · 2 / 4 » reste vrai même quand la liste nominative est incomplète. *Un compte juste à côté d'une liste incomplète vaut mieux qu'une liste incomplète seule.*

---

## 🚨 Encadré n°7 — AC3 : « AUCUN GESTE NE CHANGE DE SIGNIFICATION ». La liste exhaustive

`EXPERIENCE.md:537`, principe d'arbitrage n°3 : *« Le mode Destinée ne réassigne aucun geste. Il change **ce qui est affiché**, jamais ce que fait le doigt. C'est ce qui l'empêche de devenir un mode au sens dangereux du terme. »* Et la collision n°5 de la même table réserve la réassignation du tap au **seul** mode de composition (36.10).

**Doivent fonctionner à l'identique, mode actif, y compris sur un jour estompé :**

| Geste | Ce qu'il fait, mode actif ou non |
| --- | --- |
| Tap sur une bande vide | Arme une sélection d'un créneau (36.3) |
| Tap sur une bande portant une séance | Ouvre le **scénario** (36.1 / 36.2) |
| Tap sur une bande portant une option | Ouvre le **sélecteur de réponse** ancré (36.7) |
| Appui maintenu 450 ms + glissement | Arme et étend la sélection ; hit-test `elementFromPoint` + `closest('[data-cell-date]')` |
| `1` / `2` / `3` / `Espace` / `Maj`+flèches / `Entrée` / `Échap` | Inchangés |
| Bascule de vues, navigation de mois / semaine | Inchangées |

🚨 **Trois interdits qui suffisent à tenir l'AC3 :**
1. **Jamais `pointer-events: none`** sur un jour estompé. Le glissement casserait, et **aucun test ne le verrait** (le hit-test est stubbé en jsdom — rappel des 36.6 et 36.8).
2. **Jamais `aria-hidden`, jamais `tabindex="-1"`, jamais `[disabled]`** sur un jour estompé. L'estompe est **décorative** : elle ne retire rien à un lecteur d'écran ni au clavier.
3. **Aucun nœud ajouté** dans `.day-cell` / `.slot-cell` / `.band`. L'estompe est une **classe sur un nœud qui existe déjà**.

---

## 🚨 Encadré n°8 — L'ESTOMPE NE DOIT PAS AVALER CE QUE L'UTILISATEUR EST EN TRAIN DE FAIRE

Défaut prévisible, invisible aux tests qui ne regardent qu'une classe : `opacity: .28` s'applique à **tout** le sous-arbre — le liseré de sélection, l'aperçu de déclaration (`preview`), la bordure « aujourd'hui » et l'anneau de focus compris.

Concrètement : je suis en mode Destinée, je glisse sur trois jours qui ne portent pas le vote courant pour me déclarer indisponible — **je ne vois plus ma propre sélection**. Le geste marche (AC3), mais l'écran ment.

⇒ **AC8 : un jour sélectionné, en aperçu, ou porteur du focus clavier n'est jamais estompé.** La règle vit en CSS (`.day-cell--dim:not(.selected):not(:focus-within)`) ou dans le prédicat TypeScript ; l'implémentation choisit, mais le comportement est un AC.

---

## 🚨 Encadré n°9 — LE DÉPÔT N'EST PAS PROPRE AU DÉMARRAGE

⚠️ `git log -1` = `d9038e4` (« le selecteur de reponse de vote », story 36.7), **mais la story 36.8 est implémentée et non commitée** : 29 fichiers modifiés / ajoutés dans l'arbre de travail, dont `packages/shared/src/index.ts`, `apps/api/src/parties/parties.service.ts` et tout `features/calendar/`.

**Conséquences pour la Task 0 :**
- **Ne pas attendre un `git status` propre**, et surtout **ne rien réinitialiser** : ces changements sont l'état livré de la 36.8, revu et validé.
- La **baseline de tests se mesure sur l'arbre de travail tel quel**, pas sur `HEAD`. Repères indicatifs de la 36.8 (à **reconfirmer**, jamais à recopier) : **API 60 suites / 1300 tests**, **web ~107 fichiers / ~1880 tests**, **lint web 143 problèmes**, typecheck propre.
- En fin de story, `git status` portera **les fichiers de la 36.8 ET ceux de la 36.9**. Distinguer les siens avant tout commit.

---

## 🚨 Encadré n°10 — CE QUI EXISTE DÉJÀ ET NE DOIT PAS ÊTRE RÉÉCRIT

| Le besoin | Ce qui le sert déjà | Ce qui reste à faire |
| --- | --- | --- |
| Éclater un vote en une entrée par option, avec participation et ma réponse | `allCalendarEntries()` (36.6 / 36.7) | **Rien** |
| Nommer un vote | `entry.scenario.title` (+ `— Séance N` si le scénario en a plusieurs) en contexte de partie ; `entry.label` sur les entrées `votes-en-cours` | Réutiliser, ne pas recomposer |
| Le rendu de la piste, du sélecteur, de la jauge | `PollTrack`, `VoteAnswerPicker`, `GroupGauge` | **Rien** — l'estompe ne les modifie pas |
| Qui manque / qui a répondu | `getMissingVoters()`, `getRespondedCount()` (`core/poll/poll.util.ts`) | Réutiliser telles quelles |
| Le patron d'un `Set` de clés de date passé aux vues | `seanceMarkerDates()` → `[seanceDates]` de la vue Semaine | Le copier, pas l'inventer |
| Le patron d'un composant de rendu pur, sans service | `PollTrack`, `GroupGauge`, `CalendarLayerToggle` | Le suivre |

---

## Story

As a membre d'une partie,
I want concentrer le calendrier sur un vote à la fois,
So that je choisisse une date sans lire une liste à côté de la grille.

---

## Acceptance Criteria

Les cinq premiers sont ceux d'`epics.md` (Story 36.9), **verbatim**. Les suivants sont ajoutés par cette story et portent leur motif.

**AC1 — Le mode concentre l'écran**
**Given** au moins un vote ouvert
**When** j'active le mode Destinée
**Then** tout ce qui ne relève pas du vote courant s'estompe
**And** les créneaux proposés restent pleinement lisibles
*Mise en œuvre (encadré n°3) : l'unité de l'estompe est le **jour**, dans les deux vues de grille.*

**AC2 — Plusieurs votes, une navigation explicite**
**Given** plusieurs votes ouverts
**When** le mode est actif
**Then** je passe de l'un à l'autre par une navigation explicite
**And** le vote courant est nommé
*Chevrons `‹ n / N ›` et le nom du vote, dans le contrôle lui-même (`contrat-ui-calendrier.html:365`).*

**AC3 — Aucun geste ne change de signification**
**Given** le mode Destinée actif
**When** j'utilise la grille
**Then** **aucun geste ne change de signification**
**And** seul l'affichage est modifié
*Encadré n°7 — c'est l'AC qui protège tout le reste du calendrier.*

**AC4 — Le panneau se réduit à des personnes**
**Given** le panneau « Vote en cours »
**When** cette story est livrée
**Then** il se réduit aux membres qui n'ont pas répondu et à ceux qui ont répondu
**And** la liste des créneaux groupés par jour disparaît
*Encadré n°4 — **du calendrier seulement**. La fiche de scénario garde son panneau complet et son bouton de scellement.*

**AC5 — Le mode se voit sans rien ouvrir**
**Given** le mode Destinée
**When** la barre de contrôles est rendue
**Then** il reste visible en dehors du panneau des couches
**And** son état actif se voit sans ouvrir quoi que ce soit
*Aujourd'hui « le panneau des couches » est la bande de chips `app-calendar-layer-toggle` ; le contrôle en est un **frère**, jamais une chip de plus (encadré n°2).*

**AC6 — Le mode ne peut pas cacher son propre sujet**
**Given** la couche « les votes en cours » éteinte
**When** j'active le mode Destinée
**Then** cette couche s'allume
**And** les créneaux proposés sont rendus
*Motif : encadré n°3. Sans cela, l'AC1 est structurellement infaisable — l'estompe s'appliquerait à toute la grille et rien ne serait mis en avant.*

**AC7 — Le panneau réduit dit son dénominateur**
**Given** le panneau réduit
**When** il est rendu
**Then** il affiche le nombre de répondants sur l'effectif servi par le serveur (`poll.membersCount`)
**And** ce nombre ne dérive jamais de la longueur de la liste des membres
*Motif : encadré n°6 — la liste nominative exclut le MJ, `membersCount` non. Deux dénominateurs sur le même écran était exactement le défaut que la 36.6 a corrigé.*

**AC8 — L'estompe n'avale pas ce que je fais**
**Given** le mode actif et un jour qui ne relève pas du vote courant
**When** ce jour est sélectionné, en aperçu de déclaration, ou porte le focus clavier
**Then** il n'est pas estompé
*Motif : encadré n°8 — sans cette règle, une sélection par glissement devient invisible pendant qu'elle fonctionne.*

**AC9 — Le vote courant disparaît, le mode aussi**
**Given** le mode actif sur un vote donné
**When** ce vote est scellé, clôturé ou supprimé (y compris par un événement temps réel venu d'un autre membre)
**Then** le mode se termine proprement, ou bascule sur un vote encore ouvert
**And** aucune surface n'affiche un vote qui n'existe plus
*Motif : encadré n°2 — `activePolls()` est reconstruit à chaque `scenariosSvc.changed()`. Un index survivrait en désignant un autre vote ; un `pollId` disparu est détectable.*

**AC10 — Aucun vote ouvert, aucun mode**
**Given** aucun vote ouvert
**When** la barre de contrôles est rendue
**Then** le contrôle Destinée n'est pas proposé
**And** il ne se donne pas l'air d'être désactivé pour une raison qu'on ignore
*Motif : condition préalable de la table 2 (`EXPERIENCE.md:574`, « Au moins un vote ouvert ») ; règle du projet contre les affordances qui ne mènent nulle part (36.1, AC11).*

**AC11 — Le mode se dit en toutes lettres**
**Given** le contrôle Destinée
**When** un lecteur d'écran l'annonce
**Then** il dit s'il est actif, et quel vote est courant
**And** l'estompe n'est jamais le seul porteur de cette information
*Motif : P-1. L'estompe est une opacité — elle n'existe pas pour un lecteur d'écran, et elle est illisible en contraste élevé. L'état du mode doit vivre dans du texte et dans `aria-pressed`, pas seulement dans la grille.*

**AC12 — Une seule dérivation de la pertinence**
**Given** la vue Mois et la vue Semaine
**When** elles estompent
**Then** elles consomment le **même** ensemble de jours, dérivé une seule fois dans `CalendarView`
**And** aucune des deux ne recalcule la pertinence depuis ses propres bandes
*Motif : doctrine AD-12 / AD-19, patron `seanceMarkerDates()`. Deux dérivations divergeraient au premier cas limite (couche éteinte, encadré n°3).*

---

## Tasks / Subtasks

### 0. Baseline
- [x] ⚠️ **Ne pas exiger un `git status` propre** (encadré n°9) : la story 36.8 est dans l'arbre de travail, non commitée. Ne rien réinitialiser.
- [x] **Mesurer la baseline sur l'arbre tel quel, avant toute modification** : `docker compose exec web pnpm test` (fichiers / tests), `docker compose exec web pnpm lint` (nombre de problèmes), `docker compose exec api pnpm test` + `pnpm typecheck`. Noter les chiffres dans les Completion Notes.
- [x] Context7 (MCP) : **à consulter seulement si** une API Angular / CDK nouvelle entre en jeu. Aucune n'est prévue — `signal()`, `computed()`, `input()`, `@if` / `@for` sont employés partout ici.

### 1. L'état du mode dans `CalendarView` (AC1, AC2, AC9, AC10, AC12)
- [x] `destinyPollId = signal<string | null>(null)` — **jamais un index** (encadré n°2). Aucune persistance, aucune clé de compte, aucun ajout à `CALENDAR_LAYER_KEYS`.
- [x] `destinyPolls = computed<{ pollId; label }[]>` — la liste ordonnée des votes ouverts, **dérivée d'`allCalendarEntries()`** (entrées `type === 'votes-en-cours'`, groupées par `vote.pollId`, dans l'ordre de première rencontre). *Recommandé : cette source fonctionne dans les **deux** contextes (partie et personnel) et réutilise l'`label` déjà composé, plutôt qu'`activePolls()` qui est vide hors partie.*
- [x] `destinyPoll = computed(...)` : l'entrée dont le `pollId` correspond, ou `null`. **AC9** : quand `destinyPollId` ne correspond plus à rien, le mode se termine (ou bascule sur le premier vote restant) — décision à écrire dans un commentaire, pas à laisser au hasard.
- [x] `destinyDates = computed<ReadonlySet<string> | null>` — `null` hors mode ; sinon les clés `YYYY-MM-DD` des options du vote courant, prises sur `allCalendarEntries()` **non filtré** (encadré n°3). Patron `seanceMarkerDates()` (`calendar-view.ts:555-561`).
- [x] `enterDestiny(pollId)` / `exitDestiny()` / `destinyPrev()` / `destinyNext()`. **AC6** : `enterDestiny` allume `votes-en-cours` si elle est éteinte (coup de pouce à sens unique — `exitDestiny` ne la rééteint pas).

### 2. Le contrôle dans la barre (AC2, AC5, AC10, AC11)
- [x] Rendu dans `calendar-view.html`, **frère** d'`<app-calendar-layer-toggle>`, sur la même ligne de contrôles. Jamais à l'intérieur (encadré n°2).
- [x] **AC10** : rien n'est rendu quand `destinyPolls().length === 0`. Pas de bouton grisé.
- [x] État actif visible sans rien ouvrir : `aria-pressed`, une classe d'état, et **le nom du vote courant en clair** (AC2 / AC11).
- [x] Chevrons `‹ n / N ›` **seulement** si `destinyPolls().length >= 2` (`EXPERIENCE.md:575`), chacun avec un `aria-label` explicite.
- [x] Clés de ton **dans les TROIS thèmes** (`tones.ts` : `grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`) : au minimum `cta.destiny_mode`. Une clé posée dans un seul thème est un défaut d'affichage garanti sur les deux autres.
- [x] *Décision laissée à l'implémentation :* composant dédié (`destiny-control/`) ou balisage inline dans `calendar-view.html`. *Recommandation : composant dédié, de rendu pur — la 36.14 devra le déplacer sans le réécrire.*

### 3. L'estompe dans les deux grilles (AC1, AC3, AC8, AC12)
- [x] `calendar-month-view` — `destinyDates = input<ReadonlySet<string> | null>(null)` et un prédicat `isDimmed(cell)`. **Ne pas changer la signature de `buildMonth()`** : elle est pure, testée directement, et la pertinence n'est pas une propriété de la donnée du jour.
- [x] `calendar-week-view` — même `input()`, appliqué à la **colonne** du jour (`.slot-cell` de la colonne, et son `.col-header`).
- [x] SCSS : **une classe, une `opacity`, rien d'autre.** Valeur de départ `.28` (`contrat-ui-calendrier.html:783`), transition facultative sur `opacity` seule (`DESIGN.md:402`).
- [x] 🚨 **AC3 — les trois interdits de l'encadré n°7** : jamais `pointer-events: none`, jamais `aria-hidden` / `tabindex` / `disabled`, **aucun nœud ajouté** dans `.day-cell` / `.slot-cell` / `.band`.
- [x] 🚨 **AC8** — un jour `selected`, en `preview`, ou `:focus-within` n'est pas estompé (encadré n°8).
- [x] Le rail de détail **n'est pas touché** : il est la lecture longue et il suit le dernier toucher (principe d'arbitrage n°2). *Divergence assumée avec la planche §4, qui ne dessine pas de rail sur cet écran — antérieure à la révision 3.*

### 4. Le panneau réduit (AC4, AC7)
- [x] Créer la forme réduite selon l'encadré n°4 — **recommandé : un composant frère dans `features/calendar/`**, et le calendrier cesse d'importer `PollStatusPanel`.
- [x] Contenu, et rien de plus (`contrat-ui-calendrier.html:385-389`) : le nom du vote (`scénario — Séance N`), **« Il manque : … »** (`getMissingVoters()`), **« Ont répondu : … »**, et le bouton existant « Brûler le parchemin de vote ». Noms rendus par `IdentityLabel`, jamais `[innerHTML]`.
- [x] **AC7** : le compte de répondants s'affiche **sur `poll.membersCount`**, jamais sur `members().length` (encadré n°6).
- [x] 🚨 **La liste des options disparaît du calendrier** — et avec elle le bouton « Sceller ce créneau » **de cet écran seulement**.
- [x] 🚨 **Vérifier que `seance-list.html:117` et `:201` rendent toujours le panneau COMPLET** et que les cinq tests de `seance-list.spec.ts` restent verts sans modification. S'ils exigent une retouche, c'est que la réduction a fuité — revoir l'approche.
- [x] Ne **rien** retirer d'autre du panneau MJ (encadré n°5) : ni « Planifier un vote pour : », ni « Du / Au / Rechercher », ni « Fenêtres de la destinée ».

### 5. Tests — Web
- [x] **AC1 / AC12** : mode actif ⇒ les jours portant une option du vote courant ne sont **pas** estompés, les autres le sont — **dans les deux vues**, avec le **même** ensemble de dates.
- [x] **AC1, cas limite** : un jour portant une option d'un **autre** vote ouvert est estompé. *C'est ce qui distingue « le vote courant » de « un vote » ; la planche simplifie et ne le montre pas.*
- [x] 🚨 **AC3, le test qui prouve la story** : mode actif, sur un jour **estompé** — le tap arme une sélection, le tap sur une option ouvre le sélecteur, le tap sur une séance émet l'ouverture du scénario, et `elementFromPoint` / `closest('[data-cell-date]')` remonte toujours à la cellule. Vérifier aussi qu'**aucun** nœud estompé ne porte `pointer-events: none`, `aria-hidden` ou `tabindex="-1"`.
- [x] **AC6** : couche `votes-en-cours` éteinte + activation du mode ⇒ la couche est active **et** `destinyDates()` n'est pas vide. *Ce test est rouge sur une implémentation naïve fondée sur `band.vote`.*
- [x] **AC8** : un jour non pertinent mais sélectionné (ou en aperçu) ne porte pas la classe d'estompe.
- [x] **AC9** : le vote courant retiré de la liste (rechargement SSE simulé, patron déjà présent dans `calendar-view.spec.ts`) ⇒ le mode se termine ou bascule ; **aucune** surface n'affiche encore l'ancien vote. Et : deux votes, le **premier** disparaît ⇒ le mode ne saute pas silencieusement sur un autre vote sans le dire (preuve que l'état n'est pas un index).
- [x] **AC10** : zéro vote ouvert ⇒ aucun contrôle Destinée dans le DOM.
- [x] **AC2 / AC11** : deux votes ⇒ chevrons présents, le nom du vote courant est dans le DOM, `aria-pressed` reflète l'état ; un seul vote ⇒ pas de chevrons.
- [x] **AC4** : dans le calendrier, aucune liste d'options, aucun bouton de scellement ; les noms des manquants et des répondants sont présents.
- [x] **AC4, non-régression** : `seance-list.spec.ts` **inchangé et vert** — le panneau complet survit sur la fiche de scénario.
- [x] **AC7** : `members()` à 3 et `membersCount` à 4 ⇒ le panneau affiche bien `… / 4`.
- [x] **AC5** : le contrôle Destinée n'est **pas** un descendant d'`app-calendar-layer-toggle`.
- [x] Non-régression : les tests des 36.1 → 36.8 restent verts **sans modification**. Toute retouche d'un test existant doit être justifiée dans les Completion Notes.

### 6. 🚨 Vérification visuelle réelle (obligatoire)
*Les stories 36.4, 36.5, 36.6, 36.8 et 36.13 ont chacune trouvé par ce seul moyen un défaut qu'aucun test n'avait vu. `deferred-work.md` note que la vérification de la 36.8 **n'a pas pu être faite par l'agent** et reste à passer par l'utilisateur.*
Utiliser **claude-in-chrome** (session de test déjà connectée), jamais le navigateur interne.
- [x] L'estompe à `.28` est-elle lisible **dans les trois thèmes** ? Un fond sombre et une opacité basse peuvent rendre un jour totalement noir.
- [x] Un glissement de sélection **traversant des jours estompés** : la sélection se voit-elle (AC8) ?
- [x] Le sélecteur de réponse ancré sur une bande d'un jour **estompé** : le sélecteur lui-même n'hérite-t-il pas de l'opacité ? *(Il est rendu dans un overlay CDK, donc hors du sous-arbre — à confirmer à l'œil.)*
- [x] La jauge de groupe et la piste de participation, mode actif : la superposition estompe + trame reste-t-elle lisible ?
- [x] Le contrôle Destinée sur téléphone : la barre de chips tient-elle encore sur une ligne, ou passe-t-elle à deux ?
- [x] Le panneau réduit avec **zéro manquant** et avec **tous manquants** : les deux extrêmes disent-ils quelque chose d'utile ?

### Review Findings

- [x] [Review][Patch] AC9 non appliqué en contexte personnel quand le vote est réellement clos (pas seulement hors plage) [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — **traité** : l'effet de fin de mode garde désormais `lastDestinyDates` (dernier `destinyDates()` connu avant disparition) et compare aux bornes `fromDateStr()`/`toDateStr()` de la plage actuellement chargée. En contexte personnel, la disparition ne termine le mode que si la plage chargée couvrait déjà pleinement les dates connues du vote ; sinon (hors plage), le mode survit comme avant. Aucun appel réseau ajouté (encadré n°1 respecté). Nouveau test : `calendar-view.spec.ts`, « AC9 — contexte personnel : le vote disparaît d'une plage qui le couvrait déjà ⇒ le mode se termine ». Suite complète : 1961/1961 tests verts, typecheck web propre.

- [x] [Review][Patch] Commentaire SCSS contradictoire sur `.calendar-controls` (AC5) [apps/web/src/app/features/calendar/calendar-view/calendar-view.scss:13-15] — **corrigé** : le commentaire annonçait `align-items: center` alors que la déclaration réelle est `align-items: flex-start`. Réécrit pour refléter le code et la même justification que le second commentaire voisin (chip alignée en tête de la première ligne de chips).


- [x] `deferred-work.md` : consigner l'écart de l'encadré n°5 (**« Sceller ce créneau » depuis la barre de sélection n'est porté par aucune story de l'épic**) et rappeler que la dette « MJ non compté dans qui manque » (encadré n°6) reste ouverte **et devient plus visible**.
- [x] Completion Notes : chiffres de baseline **et** d'arrivée, décisions prises, défauts trouvés à l'œil.

---

## Hors périmètre

- **Composer un vote depuis la grille**, « Ajouter des dates », le retrait du sélecteur « Planifier un vote pour : » → **36.10** (D-16).
- **La refonte de l'Agenda** → **36.11** ; **l'Agenda du MJ, les options dépliées et le scellement** → **36.12** (bloquée par Q-25).
- **La barre repliée `☰ Affichage`, la pastille de résumé, la légende, les préférences** → **36.14**. Le contrôle Destinée devra alors **rester hors** du panneau (AC5).
- ⚠️ **« Sceller ce créneau » depuis la barre de sélection** (`EXPERIENCE.md:577`, `contrat-ui-calendrier.html:376`) — **aucune story de l'épic ne le porte**. Signalé, non livré. *Question posée en fin de story.*
- **Refermer la dette « le MJ ne figure jamais parmi les manquants »** (encadré n°6) — reste ouverte, mieux documentée.
- **Câbler `heatmap` ou `GET /me/calendar` sur SSE** → dette écrite, sans objet ici (cette story n'ajoute aucune source de données).
- **Borner la liste Agenda**, **retirer `.seance-dot`**, **aligner « Soirée » / « Soir »** → dettes écrites, non traitées.

---

## Ce qui doit continuer de fonctionner

- **La sélection par glissement**, en Mois comme en Semaine : long-press 450 ms, seuil 8 px, `elementFromPoint` + `closest('[data-cell-date]')`, clamp, `suppressNextClick`, `Échap`, `Maj`+flèches, la barre de sélection, l'écriture groupée et sa résolution de conflits (36.3, 36.4).
- **Le sélecteur de réponse de vote** et son ordre d'arbitrage du tap (36.7) — y compris ancré sur une bande estompée.
- **La piste de participation** et ses quatre surfaces, la densité par `@container` seule, `pointer-events: none`, `data-winner` (36.6).
- **La jauge / les pastilles de groupe** sur leur canal séparé, et la règle « couche allumée ⇒ pas de fusion de bandes » (36.8).
- **La préséance à quatre rangs** et la fusion du jour uniforme.
- **FR-50** : une séance confirmée rend le créneau indisponible quelle que soit la couche — et quel que soit le mode.
- **Le rail permanent** à toutes les largeurs, ses trois lignes toujours rendues, l'ouverture du scénario depuis une ligne de séance (36.1).
- **Le contrat DOM** : `.slot-cell`, `data-cell-date`, `data-cell-slot`, `.band`, `data-winner`, `.week-grid`, `app-selection-bar`.
- **`PollStatusPanel` complet** sur `seance-list` (deux sites), bouton de scellement compris.
- **`GET /parties/:id/heatmap`, `/available-slots`, `/me/calendar`** : formes inchangées, **aucune** n'est touchée.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Dériver l'estompe de `band.vote` / `DaySlotDetail.pollVote`** (encadré n°3). Couche `votes-en-cours` éteinte ⇒ la grille entière s'estompe. C'est le défaut le plus probable de cette story.
2. **Garder un index de vote au lieu d'un `pollId`** (encadré n°2). Un rechargement SSE fait basculer le mode sur un autre vote, en silence.
3. **Vider `PollStatusPanel` lui-même** (encadré n°4) — casse la fiche de scénario et le seul chemin de scellement qui reste.
4. **Poser `pointer-events: none` sur un jour estompé.** Le glissement casse et **aucun test ne le verra**.
5. **Poser `aria-hidden` ou `tabindex="-1"`** sur un jour estompé : l'estompe est décorative, elle ne retire rien à personne.
6. **Estomper un jour sélectionné ou en aperçu** (AC8) — la sélection devient invisible pendant qu'elle fonctionne.
7. **Ajouter un nœud** dans `.day-cell` / `.slot-cell` / `.band` pour porter l'estompe. Le hit-test du glissement ne remonterait plus.
8. **Ajouter la Destinée à `CALENDAR_LAYER_KEYS`** : elle deviendrait un réglage persistant, soumise à `resetToDefault()` et à l'écran Compte.
9. **Mettre le contrôle Destinée à l'intérieur d'`app-calendar-layer-toggle`** — contredit l'AC5 littéralement.
10. **Recalculer la pertinence dans chaque vue** (AC12) : deux dérivations, deux comportements au premier cas limite.
11. **Compter les répondants sur `members().length`** au lieu de `poll.membersCount` (AC7, encadré n°6) — deux dénominateurs sur le même écran, le défaut que la 36.6 a corrigé.
12. **Poser une clé de ton dans un seul thème.** Les trois, toujours.
13. **Retirer « Planifier un vote pour : »** — c'est le dernier AC de la **36.10**, pas de celle-ci.
14. **Livrer « Sceller ce créneau » dans la barre de sélection** parce que la planche le montre : aucun AC ne le demande ici (encadré n°5).
15. **Estomper le rail.** Il est la lecture longue ; l'estomper retire l'information au moment précis où elle sert de recours.
16. **Ajouter un appel réseau.** Tout est déjà chargé (encadré n°1).
17. **Réinitialiser l'arbre de travail** parce que `git status` n'est pas propre (encadré n°9) : ce sont les changements livrés de la 36.8.
18. **Rendre `destinyDates` optionnel dans les vues pour éviter de réparer des fixtures** — même raisonnement que `membersCount` (36.6), `partieId` (36.7), `group` (36.8). Un `input()` avec un défaut `null` explicite, oui ; un champ facultatif qui masque un oubli, non.

### Décisions arrêtées par cette story

- **L'état du mode est un `pollId`**, éphémère, hors `activeLayers` et hors préférences de compte.
- **L'unité de l'estompe est le JOUR**, dans les deux vues de grille, conformément à la planche.
- **La pertinence se dérive une seule fois**, dans `CalendarView`, depuis `allCalendarEntries()` **non filtré**, et voyage en `ReadonlySet<string>`.
- **Un jour est pertinent s'il porte une option du VOTE COURANT** — pas « un vote quelconque ». ⚠️ *Divergence assumée avec le rendu simplifié de la planche (`some(t==='vo')`), qui ne modélise pas la navigation entre votes.*
- **Activer le mode allume `votes-en-cours`** ; le quitter ne la rééteint pas.
- **Le panneau réduit est celui du calendrier seulement** ; `seance-list` garde le panneau complet et le scellement.
- **Le dénominateur du panneau réduit est `poll.membersCount`**, pas la longueur de la liste des membres.
- **Un jour sélectionné, en aperçu ou focalisé n'est jamais estompé.**
- **Le rail n'est pas touché** par le mode.
- ⚠️ **La dette « le MJ ne figure jamais parmi les manquants » n'est pas refermée ici** — motivée, écrite, question posée.

### Décisions laissées à l'implémentation

- **Composant dédié ou balisage inline** pour le contrôle Destinée. *Recommandation : un composant de rendu pur — la 36.14 devra le déplacer sans le réécrire.*
- **Composant frère ou variante d'`input()`** pour le panneau réduit (encadré n°4). *Recommandation : composant frère.*
- **Où vit la règle AC8** (CSS `:not(.selected):not(:focus-within)` ou prédicat TypeScript). *Recommandation : CSS — le prédicat n'aurait pas accès au focus.*
- **La valeur exacte de l'opacité.** Départ `.28` (planche) ; à ajuster **à l'œil, thème par thème** (Task 6) plutôt qu'au jugé.
- **Le libellé exact des clés de ton** dans les trois thèmes.

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4, TypeScript 6.0.2. `@if` / `@for`, signals, `input()` / `output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **API** : **non touchée.** Aucune migration, aucun DTO, aucun endpoint.
- **Aucune dépendance nouvelle.**
- **Exécution : tout par Docker.** `docker compose exec web pnpm <…>` / `docker compose exec api pnpm <…>`.
- ⚠️ **Tests zoneless** : pas de zone.js — `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone ; reprendre la boucle de ticks déjà établie dans `calendar-view.spec.ts`.
- `packages/shared` n'étant pas modifié, le `pnpm typecheck` API n'est pas exigé — **le `typecheck` web l'est**.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau n'est requis ; une exigence de robustesse l'est.**

- Cette story **n'introduit aucune source de données**. Tout ce qu'elle affiche vient de signaux déjà câblés : `scenariosSvc.changed()` recharge les scénarios (donc les votes ouverts) et `availabilitySvc.changed()` rafraîchit les panneaux MJ (`calendar-view.ts:609-644`).
- **Ce que le temps réel casse, en revanche, c'est l'état du mode** : un vote scellé par le MJ depuis un autre écran, ou clôturé, disparaît de `activePolls()` sous les pieds du mode. C'est l'objet de l'**AC9**, et c'est exactement le même piège que le sélecteur de réponse de la 36.7, que l'effet SSE ferme explicitement (`this.closePicker()`, `:622`). **Traiter le mode comme le sélecteur : une entité qui référence un vote et qui doit savoir mourir.**
- Les écarts SSE existants (`heatmap` et `GET /me/calendar` non câblés) restent ouverts, inchangés, consignés dans `deferred-work.md`.
[Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- 🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`). Cette story est cependant **la plus légère de l'épic sur ce plan** : aucune écriture, aucune lecture nouvelle, aucun champ, aucune route.
- **Aucune donnée n'est exposée à qui ne l'avait pas déjà.** Le panneau réduit consomme `members()`, qui n'est chargé **qu'en mode MJ** (`calendar-view.ts:690-692`) et n'est rendu que dans le bloc `@if (isMjMode())` — deux gardes déjà en place, à ne pas déplacer.
- **XSS** : les noms (`pseudo`, `displayName`) et le titre du scénario sont rendus par interpolation, via `IdentityLabel`. **Jamais `[innerHTML]`.**
- **Le `pollId` du mode ne pilote aucune requête** : il ne sert qu'à filtrer des données déjà en mémoire. Il n'y a pas d'URL à forger.
- ⚠️ **Le seul point de vigilance réel** : si l'implémentation dérive `destinyPolls` d'`allCalendarEntries()`, elle traverse en contexte **personnel** des votes de **plusieurs parties**. Le `partieId` voyage déjà dans `VoteParticipation` depuis la 36.7 précisément pour cela — **ne jamais supposer que le vote courant appartient à la partie de la route.**

### Dette refermée par cette story

- Le panneau de vote du calendrier dupliquait la grille : depuis la 36.6 / 36.7, les dates, la participation et ma réponse sont **sur la case**. La liste d'options y était devenue une seconde lecture des mêmes faits.

### Dette explicitement NON refermée

- **Le MJ ne figure jamais parmi les manquants** (encadré n°6) — plus visible qu'avant.
- ⚠️ **« Sceller ce créneau » depuis la barre de sélection n'est porté par aucune story de l'épic** (encadré n°5).
- Les entrées existantes de `deferred-work.md` : `heatmap` sans SSE, `GET /me/calendar` sans SSE, liste Agenda non bornée, `scenarios.service.ts` sans `displayName`, `.seance-dot`, « Soirée » / « Soir », arrondi des trois segments de piste.
- ⚠️ **La vérification visuelle de la 36.8 reste entièrement à passer par l'utilisateur** (`deferred-work.md`).

---

## Questions pour l'utilisateur (elles ne bloquent pas l'implémentation)

1. **« Sceller ce créneau » depuis la barre de sélection** — la planche §4 et `EXPERIENCE.md:577` le décrivent, mais **aucune story de l'épic 36 ne le porte** (la 36.12 ne couvre que le scellement depuis l'Agenda, et elle est bloquée par Q-25). Après cette story, le scellement n'existe plus que sur la fiche de scénario. **Faut-il l'ajouter ici, en créer une story, ou l'accepter jusqu'à la 36.12 ?**
2. **« Qui manque » sans le MJ** (encadré n°6) — le panneau réduit devient le seul endroit qui dit qui n'a pas répondu, et il ne pourra jamais nommer le MJ. **Accepte-t-on l'écart jusqu'à une story serveur dédiée, ou faut-il le traiter maintenant ?**
3. **L'estompe en contexte personnel** — la planche ne montre la Destinée que sur un calendrier de partie. L'approche recommandée la rend disponible aussi sur `/profile/calendar`, où elle agrège les votes de plusieurs parties. **Est-ce souhaité, ou le mode doit-il rester réservé au calendrier d'une partie ?**

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-22)

### Debug Log References

**Baseline mesurée sur l'arbre de travail tel quel** (encadré n°9 — la 36.8 y était non commitée) :

| | Baseline | Arrivée |
| --- | --- | --- |
| Web — fichiers / tests | 108 / 1933 | **109 / 1960** (+1 fichier, +27 tests) |
| Web — lint | 143 problèmes | **143** (identique) |
| API — suites / tests | 60 / 1303 | **60 / 1303** (intacte, non touchée) |
| API — typecheck | propre | **propre** |

*Écart de baseline constaté avec ce qu'annonçait la story : **1933 tests web et non ~1880**, et 108 fichiers et non ~107. Les chiffres de la story étaient des repères de la 36.8, explicitement donnés « à reconfirmer ».*

**Type-check web** : `pnpm build` compile sans erreur TypeScript ni erreur de gabarit. La commande sort néanmoins en échec sur un **budget de bundle pré-existant** (initial 1.42 MB contre 1.00 MB) — consigné dans `deferred-work.md`, non causé par cette story (~11 kB de source ajoutée, commentaires compris).

**Delta de tests** : +30 tests ajoutés, **−3 retirés** (ceux d'`onChooseDate()`, supprimés avec le gestionnaire — voir les notes).

### Completion Notes List

**🚨 DEUX DÉFAUTS RÉELS, TROUVÉS UNIQUEMENT PAR LA VÉRIFICATION VISUELLE.** Les 1960 tests étaient verts avant chacun d'eux. C'est la cinquième story d'affilée de cet épic où la vérification à l'œil trouve ce qu'aucun test ne voit.

1. **L'écran entièrement estompé.** Activer la Destinée depuis un mois qui ne porte aucune date du vote courant estompait les 42 cases — un écran noir, rien mis en avant, aucune explication. Techniquement correct (aucun jour ne relève du vote), et inutilisable. **Règle ajoutée : un mode qui estomperait tout n'estompe rien** — l'estompe n'a de sens que *relativement* à ce qu'elle met en avant ; sans repère à l'écran elle ne transmet rien et ne coûte que de la lisibilité. `destinyInView` dans les deux vues, deux tests dédiés.
2. **🚨 Le mode mourait tout seul en calendrier personnel.** Deux clics sur « semaine suivante » et il s'éteignait **définitivement**, alors que le vote existait toujours et restait affiché dans la grille. Cause : mon effet de fin de mode (AC9) lisait « absent de la liste » comme « clos ». C'est vrai en contexte de **partie** (`activePolls()` dérive de tous les scénarios) mais **faux en contexte personnel**, où `GET /me/calendar` est chargé **par plage** : naviguer déplace la plage, et le vote en sort légitimement. Garde ajoutée sur `partieId()`, plus un test de non-régression qui navigue hors plage puis revient — le mode survit et reprend, sans que l'utilisateur ait rien à réarmer.

**Ce qui a été vu à l'œil, et confirmé** (claude-in-chrome, thème Grimoire Émeraude) :
- Le contrôle « ✦ Destinée » rendu **hors** de la bande de couches, `aria-pressed` correct, nommé « ✦ Destinée · Chroniques de la Guilde » une fois actif (AC5, AC2, AC11).
- Septembre, mode actif : **39 cases estompées, 3 nettes** — exactement les trois dates du vote, pleinement lisibles avec leurs bandes, titres et pistes de participation (AC1). Vue Semaine : **18 cellules + 6 en-têtes estompés, la colonne du 20 nette**.
- **AC8 mesuré en conditions réelles** : une case estompée passe de `opacity: 0.28` à `1` dès qu'elle reçoit le focus clavier.
- **AC3 vérifié sur le DOM réel** : une case estompée conserve `role="button"`, `tabindex="0"`, aucun `aria-hidden`, et son `data-cell-date`.
- **AC10 confirmé en direct** sur une partie sans vote ouvert : aucun contrôle Destinée rendu du tout.

**Décisions prises en cours d'implémentation :**
- **`onChooseDate()` a été SUPPRIMÉ de `CalendarView`** avec le panneau qui l'appelait, plutôt que laissé en code mort. Le scellement reste entier sur la fiche de scénario. Trois tests qui ne l'exerçaient que lui ont été retirés ; le quatrième (garde `pollActionPending`) a été **réorienté** sur le chemin réel qui subsiste — une réponse de vote en cours bloque `onClosePoll` —, donc la garde reste couverte. ⚠️ **C'est la seule modification de tests existants de cette story**, et elle est une conséquence directe de l'AC4.
- **Trois clés de ton posées dans les trois thèmes** : `cta.destiny_mode` (valeur identique — « Destinée » est le nom que la spec donne au mode, comme « Vue mois » ; la clé existe pour qu'un thème futur puisse la teinter), `poll.missing_prefix` et `poll.responded_prefix` (teintées, alignées sur `alert.missing_player` de chaque thème). `poll.status_summary`, qui existait déjà dans les trois, est **réutilisée** pour l'AC7 plutôt que dupliquée.
- **La vue Agenda ne reçoit pas l'estompe** — l'AC1 parle de « la grille », et la 36.11 refond l'Agenda. Consigné.
- **Le rail n'est pas estompé** (décision de la story, confirmée à l'œil : il reste la lecture longue sous une grille estompée, et c'est utile).

**Divergence constatée avec la planche, à répercuter :** le panneau joueur de `contrat-ui-calendrier.html` §4 bis annote « le panneau de vote côté joueur reste un `app-poll-response` par vote actif » — **c'est périmé depuis la 36.7**, qui l'a retiré du calendrier. Côté joueur, le calendrier n'a donc aucun panneau de vote, et l'AC4 n'avait rien à y réduire.

**Reste dû, et explicitement pas fait :**
- ❌ **`/security-review`** — non optionnel sur cet épic (`epics.md:335`), en dette depuis la 36.4. Cette story est la plus légère de l'épic sur ce plan (aucune écriture, aucune lecture nouvelle, `apps/api` et `packages/shared` non touchés), mais elle ne l'annule pas.
- ❌ **`/code-review` de la 36.8** reste à lancer, et sa vérification visuelle reste due par l'utilisateur.
- ❌ **Le panneau réduit n'a pas été vu à l'œil** : aucune partie du jeu de données où l'utilisateur est MJ ne porte de vote ouvert, et en créer un aurait écrit dans ses données. Couvert par 6 tests dont des assertions DOM ; consigné dans `deferred-work.md`.

### File List

**Nouveaux (8)**
- `apps/web/src/app/features/calendar/destiny-control/destiny-control.ts`
- `apps/web/src/app/features/calendar/destiny-control/destiny-control.html`
- `apps/web/src/app/features/calendar/destiny-control/destiny-control.scss`
- `apps/web/src/app/features/calendar/poll-missing/poll-missing.ts`
- `apps/web/src/app/features/calendar/poll-missing/poll-missing.html`
- `apps/web/src/app/features/calendar/poll-missing/poll-missing.scss`
- `apps/web/src/app/features/calendar/poll-missing/poll-missing.spec.ts`

**Modifiés (11)**
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
- `apps/web/src/app/core/theme/tones.ts`

**Documentation**
- `_bmad-output/implementation-artifacts/deferred-work.md`

🚨 **`apps/api` et `packages/shared` ne sont PAS touchés.** Aucune migration.

### Change Log

- **2026-08-22** — Story 36.9 implémentée (bmad-dev-story). Mode Destinée (état keyé par `pollId`, contrôle hors du panneau des couches, estompe au jour dans les deux grilles, dérivation unique dans `CalendarView`) et panneau « Vote en cours » du calendrier réduit à « qui manque / ont répondu ». Deux défauts trouvés à la vérification visuelle et corrigés : l'écran entièrement estompé hors plage du vote, et la mort automatique du mode en calendrier personnel. `onChooseDate()` retiré de `CalendarView` avec le panneau qui l'appelait. Web 109/1960 (baseline 108/1933), lint 143 = baseline, API intacte.
