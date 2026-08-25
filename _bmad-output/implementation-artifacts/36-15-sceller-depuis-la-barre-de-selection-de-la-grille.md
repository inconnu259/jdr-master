---
baseline_commit: 8a1950259d9e59c3290d6794f6aced8a7bed3de2
---

# Story 36.15: Sceller depuis la barre de sélection de la grille

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want sceller un vote directement depuis la barre de sélection de la grille, sans détour par l'Agenda ou la fiche de scénario,
so that je conclus l'action là où je viens de désigner le créneau.

---

**Story ajoutée le 2026-08-24** (epics.md, Epic 36), après la clôture apparente de l'épic (36.14 livrée). Origine : `deferred-work.md`, dette redemandée sans être tranchée par les stories 36.9, 36.10, 36.12 et 36.14 — décision actée avec l'utilisateur le 2026-08-24 : **story dédiée** plutôt qu'abandon du chemin depuis la grille.

**Contrat d'UI.** `contrat-ui-calendrier.html:376` (section « 4 · Oracle MJ ») dessine, dans la barre de sélection (`.selbar`) : une piste de participation, un compteur `3 / 4`, puis deux boutons côte à côte — `<span class="mat-flat">Sceller ce créneau</span>` et `<span class="mat-stroked mut">Ajouter des dates</span>`. **`Ajouter des dates` a divergé** de ce tracé (36.10 : vit dans la bande de contrôles, écart déjà assumé et documenté) — cette story ne le rouvre pas. Elle ne porte que le bouton *Sceller*.

**Chemin d'écriture : AUCUN CODE NOUVEAU.** `PollService.chooseDate()` est déjà appelé par deux chemins (`SeanceList.onChoose()`, et `CalendarView.onSealRequested()` derrière l'Agenda, story 36.12) — cette story ajoute un **troisième déclencheur** vers l'infrastructure **déjà existante** de `CalendarView.onSealRequested()` (confirmation via `SealConfirmDialog`, garde anti-double-clic, rechargement). Elle ne réécrit ni la confirmation, ni l'appel réseau, ni le rechargement.

---

## Acceptance Criteria

Les huit AC d'`epics.md`, verbatim :

**AC1 — le bouton apparaît sur la bonne sélection**
**Given** une sélection portant sur un **créneau unique**, dans la barre de sélection de la grille
**When** l'utilisateur connecté est **MJ** de la partie, et ce créneau correspond exactement à une **option** d'un `SessionPoll` **OPEN** de cette partie (même date, même `slot`)
**Then** un bouton *Sceller* apparaît dans la barre de sélection

**AC2 — absent sans vote correspondant**
**Given** ce même contexte
**When** le créneau sélectionné ne correspond à **aucune** option d'un vote ouvert de la partie
**Then** aucun bouton *Sceller* n'apparaît

**AC3 — réservé au MJ**
**Given** cette même barre
**When** l'utilisateur connecté n'est **pas** MJ de la partie (ou hors contexte de partie — calendrier personnel)
**Then** aucun bouton *Sceller* n'apparaît, quel que soit le créneau sélectionné

**AC4 — absent sur une sélection multiple**
**Given** une sélection portant sur **plusieurs** créneaux (plage)
**When** la barre de sélection est rendue
**Then** aucun bouton *Sceller* n'apparaît

**AC5 — confirmation avant écriture**
**Given** le bouton *Sceller* activé
**When** l'utilisateur clique dessus
**Then** une confirmation est demandée avant toute écriture, via le **même dialogue** que l'Agenda (`SealConfirmDialog`, `CalendarView.onSealRequested()`)
**And** un refus n'appelle aucune API et laisse la sélection intacte

**AC6 — l'écriture réussie rafraîchit tout**
**Given** la confirmation acceptée
**When** l'écriture réussit
**Then** `PollService.chooseDate()` est appelé avec le `pollId` et l'`optionId` résolus depuis la sélection
**And** le vote passe `CLOSED`, la sélection de grille est effacée
**And** le rail de détail et l'Agenda reflètent le nouvel état sans rechargement manuel

**AC7 — l'échec ne perd rien**
**Given** l'écriture échoue (réseau, 403, vote déjà clos entre-temps)
**When** la réponse d'erreur revient
**Then** un message d'erreur clair est affiché (réutilise `CalendarView.error`, déjà rendu à l'écran)
**And** la sélection n'est pas perdue silencieusement

**AC8 — les deux grilles se comportent à l'identique**
**Given** la vue Mois et la vue Semaine
**When** le même contexte de sélection/vote est présenté à chacune
**Then** le bouton apparaît, se nomme et se comporte **identiquement** dans les deux (patron déjà établi par `scope`/`armedKind`/`composing`, jumeaux entre les deux vues)

## Tasks / Subtasks

- [x] **Task 0 — Vérifier le baseline** (dev-story) : `git rev-parse HEAD`, consigner `baseline_commit` en frontmatter, arbre propre.

- [x] **Task 1 — `SelectionBar` : accepter un candidat de scellement, rester un composant pur** (AC1, AC2, AC4, AC5)
  - [x] Ajouté `readonly sealCandidate = input<AgendaSealRequest | null>(null)`.
  - [x] Ajouté `readonly sealRequested = output<AgendaSealRequest>()`.
  - [x] `@if (sealCandidate(); as candidate)` dans `selection-bar.html`, bouton `mat-flat-button` avant Disponible/Indisponible, `[attr.aria-label]="sealAriaLabel(candidate)"`.
  - [x] `(click)` émet `sealRequested.emit(candidate)` — aucun appel réseau.
  - [x] Aucune logique de correspondance date/slot/vote dans `SelectionBar`.

- [x] **Task 2 — `CalendarWeekView` : dériver le candidat, câbler le bouton** (AC1, AC2, AC3, AC4, AC6, AC8)
  - [x] Ajouté `readonly canSeal = input(false)`.
  - [x] Ajouté le computed `sealCandidate` (garde `canSeal()` + `selectedCells().length === 1` + correspondance `entries()` sur `date`/`slot`).
  - [x] `[sealCandidate]="sealCandidate()"` passé à `<app-selection-bar>`.
  - [x] `readonly sealRequested = output<AgendaSealRequest>()`, réémis depuis `(sealRequested)`.

- [x] **Task 3 — `CalendarMonthView` : bloc jumeau** (AC1, AC2, AC3, AC4, AC6, AC8)
  - [x] Répété à l'identique (`canSeal`, `sealCandidate` computed, `sealRequested`), commentaires croisés vers le jumeau `calendar-week-view.ts`.

- [x] **Task 4 — `CalendarView` : brancher `canSeal` et réutiliser `onSealRequested()`** (AC1, AC3, AC5, AC6, AC7)
  - [x] `[canSeal]="isMjMode() && partieId() !== null"` posé sur les deux grilles (`calendar-view.html`), copie exacte du binding de `<app-calendar-agenda-view>`.
  - [x] `(sealRequested)="onSealRequested($event)"` câblé sur les deux grilles — **aucune nouvelle méthode dans `CalendarView`**.
  - [x] `AgendaSealRequest` importé directement depuis `calendar-agenda-view.ts` dans les trois composants (aucun type dupliqué).

- [x] **Task 5 — Tests** (toutes les AC)
  - [x] `selection-bar.spec.ts` : 3 tests (bouton absent/présent/thématisé, clic émet le candidat exact).
  - [x] `calendar-week-view.spec.ts` / `calendar-month-view.spec.ts` (jumeaux) : 6 tests chacun (AC1, AC2, AC3, AC4, AC5/AC6, bouton rendu).
  - [x] `calendar-view.spec.ts` : 5 tests (`canSeal` reçu par les deux grilles en mode MJ/personnel, `sealRequested` des deux grilles route vers `onSealRequested()`).
  - [x] Aucun test nouveau sur `onSealRequested()`/`writeSeal()`/`SealConfirmDialog` — déjà couverts par la 36.12.

- [x] **Task 6 — Vérification visuelle réelle** (Chrome MCP)
  - [x] Grille chargée sans erreur console (partie « Les Veilleurs du Pont », contexte MJ, vue Mois puis Semaine) — aucune régression visuelle sur le rendu de base.
  - [⚠️] **NON VU À L'ÉCRAN : l'apparition réelle du bouton *Sceller* avec un vote MJ ouvert.** Le seul vote MJ atteignable du jeu de données de développement (« Les Veilleurs du Pont ») est déjà **CLOSED** (date validée, « Consulter l'oracle des créneaux » affiché) ; en fabriquer un nouveau aurait exigé de créer un scénario, une séance puis un vote — plusieurs écritures non triviales sur des données partagées, pour un jeu de données qui n'en offre aucun de jetable. Couvert par 20 tests automatisés (unitaires + intégration) qui exercent exactement la même logique de résolution (`sealCandidate`) et le même rendu DOM que l'écran réel. Consigné dans `deferred-work.md` comme reste dû, même patron que 36.9/36.10 (« NON VU À L'ÉCRAN », vote MJ du jeu de dev unique/précieux).

### Review Findings

Revue du 2026-08-24 (3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 18 constats bruts → 1 patch, 3 defer (propres à cette story), 13 rejetés comme bruit (dont : le champ `compteRendu` inline non exporté — patron déjà établi pour `heureRdv`/`lieu`/`notePratique` ; `.trim()` traitant espaces=manquant — comportement explicitement voulu et testé par l'AC1 de la 36.16 ; l'absence de borne sur la plage passée — bornée par `ME_CALENDAR_MAX_RANGE_DAYS`, item de perf déjà suivi séparément (30.5) ; la duplication `SEAL_DATE_FORMAT`/`sealCandidate` entre grilles — patron de blocs jumeaux délibéré du projet, cf. D4 ci-dessous pour le detail conservé ; `entry.vote.partieId` préféré à `entry.partieId` — faux positif, `AgendaEntry.partieId` n'est justement PAS renseigné pour les entrées `votes-en-cours` ; retrait de `.seance-dot`/`seanceDates` présenté comme régression — décision utilisateur déjà actée et documentée ; « race condition » sur le thread `sealRequested` — spéculatif, aucune fenêtre asynchrone entre sélection et clic ; `aria-label` non échappé — Angular sanitize déjà les bindings d'attribut, ce n'est pas `[innerHTML]` ; citations AD-12/AD-17/AD-19 invisibles dans le diff — limite inhérente à une revue diff-only, pas un défaut du code ; champ non-optionnel sans preuve que tous les producteurs sont à jour — vérifié manuellement, un seul site de construction, `pnpm typecheck` propre ; fragilité implicite du `findMany` sans `select` — même fragilité pré-existante déjà acceptée pour les 3 autres champs).

- [x] [Review][Patch] `sealCandidate` peut résoudre le mauvais vote si deux `SessionPoll` OPEN de la même partie proposent le même créneau exact (`date`+`slot`) — `entries().find(...)` retournait le premier match sans exiger l'unicité. **Corrigé** : `.filter()` + `matches.length !== 1 → null` dans les deux grilles (jumeaux), même principe qu'AC2/AC4 (ambiguïté = pas de candidat). Test de non-régression ajouté dans les deux specs. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts:430-437 ; calendar-month-view.ts:387-394]
- [x] [Review][Defer] Confirmation UX inconsistante : `SeanceList.onChoose()` utilise `window.confirm()` natif tandis que l'Agenda utilise `SealConfirmDialog` (MatDialog stylé) pour la même action de scellement — deferred, pre-existing (le fichier utilisait déjà `window.confirm()` pour d'autres actions avant cette story). [apps/web/src/app/features/scenarios/seance-list/seance-list.ts]
- [x] [Review][Defer] Couverture de test AC4 incomplète : seul le cas « deux cellules même jour » est testé pour la sélection multiple (aucun cas multi-jours ni sélection vide explicite) — deferred, pre-existing pattern de test minimal, comportement correct par construction (`cells.length !== 1`). [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts ; calendar-month-view.spec.ts]
- [x] [Review][Defer] `SEAL_DATE_FORMAT`/`sealDateLabel()` et le computed `sealCandidate` sont dupliqués verbatim (avec commentaires croisés) entre les deux grilles — deferred, patron de blocs jumeaux délibéré et déjà établi dans ce projet (`.selected`/`.band--composed`, `OPTION_DATE_FORMAT`), piège de synchronisation si un seul fichier est retouché sans l'autre. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts ; calendar-month-view.ts]

## Dev Notes

### Encadré n°1 — Le type `SealCandidate`/`AgendaSealRequest`, et où vit sa dérivation

`AgendaSealRequest` (`calendar-agenda-view.ts:143-151`) a exactement la forme dont ce bouton a besoin :

```ts
export interface AgendaSealRequest {
  partieId: string;
  pollId: string;
  optionId: string;
  dateLabel: string;
  pollLabel: string;
}
```

Ces cinq champs sont **tous dérivables depuis ce que `CalendarWeekView`/`CalendarMonthView` reçoivent déjà en entrée** — aucune donnée nouvelle à faire remonter depuis `CalendarView` :

- `partieId`, `pollId`, `optionId` : portés par `entry.vote` (`VoteParticipation`, `poll-track.utils.ts:24-45`) — le **triplet d'identité** déjà utilisé par les trois autres surfaces (case du Mois, cellule de Semaine, rail) pour construire leurs propres actions de vote (36.7).
- `dateLabel` : même formatage que `CalendarAgendaView.optionLabel()` (ligne 598-603) — `OPTION_DATE_FORMAT.format(dateKeyToLocalMidnight(entry.date))`, suivi de `, ${SLOT_LABELS[entry.slot].toLowerCase()}` si le slot n'est pas `FULL_DAY`. `OPTION_DATE_FORMAT` est un `const` **privé** à `calendar-agenda-view.ts` (ligne 182) — soit le dupliquer avec un commentaire renvoyant vers son jumeau (patron déjà utilisé ailleurs dans le projet pour des blocs dupliqués délibérément), soit l'extraire vers `day-detail.utils.ts` si le duplicata semble trop fragile à l'usage. **Décision laissée au dev-story**, aucun des deux choix n'est dicté par une AC.
- `pollLabel` : `entry.label`, déjà porté par `AgendaEntry` (= `entry.scenario.title`, posé par `CalendarView.allCalendarEntries()` ligne 554 — `label: entry.scenario.title`). Pas besoin de remonter jusqu'à `activePolls()`.

**La dérivation "sélection → candidat" vit dans `CalendarWeekView`/`CalendarMonthView`, jamais dans `SelectionBar`.** Raison : `SelectionBar` ne reçoit pas `entries()` aujourd'hui et n'a aucune raison de connaître le concept de vote — elle reste un composant de présentation pur, cohérent avec sa JSDoc actuelle (« Elle ne construit ni n'envoie rien elle-même »). Les deux grilles, elles, reçoivent déjà `entries()` (AC7, 30.6) et savent déjà lire dedans pour construire leurs propres bandes/pistes de vote — ce candidat n'est qu'une lecture de plus sur la même donnée, au même endroit.

**Comparaison de créneau : `SelectedCell.date` est un `Date`, `AgendaEntry.date` est une clé `YYYY-MM-DD`.** Utiliser `toDateKey(selectedCells()[0].date)` (déjà importé dans les deux vues, `day-detail.utils.ts`) avant de comparer — ne jamais comparer deux `Date` par égalité d'objet ni reformater à la main.

### Encadré n°2 — `canSeal`, le double garde-fou MJ + contexte de partie

`CalendarAgendaView.canSeal` (déjà en place, 36.12) porte **deux conditions à la fois**, et le commentaire qui l'accompagne (`calendar-view.html:203-206`) explique pourquoi elles ne peuvent pas se séparer :

> `canSeal` porte les DEUX conditions : être MJ ET être dans le calendrier d'une partie. Le calendrier personnel agrège plusieurs parties et ne sait d'aucune si j'en suis le MJ — `isMjMode()` seul y laisserait passer des boutons qui échoueraient en 403.

Binding exact à répliquer sur les deux grilles : `[canSeal]="isMjMode() && partieId() !== null"`. Ne pas essayer d'affiner (ex. vérifier le rôle serveur) — cette story n'introduit aucune nouvelle route, la garde d'autorisation réelle reste côté serveur (`getOwned` dans `PollService`), exactement comme le dit déjà le commentaire de `CalendarAgendaView.requestSeal()` (ligne 640-644) : *« Aucune écriture ici : la garde d'autorisation vit côté serveur, la confirmation et l'appel vivent dans CalendarView. »* Le même principe s'applique ici : `SelectionBar` et les deux grilles ne font que **proposer** le bouton quand le contexte le permet, elles ne décident jamais seules de l'autoriser.

### Encadré n°3 — Pourquoi aucune nouvelle méthode n'est nécessaire dans `CalendarView`

`CalendarView.onSealRequested(request: AgendaSealRequest)` (ligne 1886-1905) fait déjà tout ce qu'AC5/AC6/AC7 demandent : garde anti-double-clic posée **avant** l'ouverture du dialogue (piège corrigé en revue de code 36.12, cf. commentaire ligne 1890-1893), ouverture de `SealConfirmDialog`, écriture via `PollService.chooseDate()`, rechargement (`loadScenarios()` + `refreshMjPanels()`), message d'erreur sur échec. Cette story ajoute un **troisième site d'écoute** de `(sealRequested)` — sur `<app-calendar-week-view>` et `<app-calendar-month-view>` — vers cette même méthode, exactement comme le fait déjà `<app-calendar-agenda-view>` à la ligne 215. **Ne pas écrire de logique d'écriture, de confirmation ou de rechargement ailleurs** : ce serait dupliquer un chemin déjà correct et déjà testé.

### Encadré n°4 — Le texte du bouton : réutiliser la clé de thème existante ou en créer une neuve ?

`calendar.agenda.action_seal` existe déjà dans les trois thèmes (`tones.ts:333/685/1033` — « Sceller » / « Planter » / « Verrouiller ») et sert aujourd'hui le bouton *Sceller* de l'Agenda. Cette story livre **la même action**, au même sens, ailleurs sur l'écran. Deux options :

- **Réutiliser `calendar.agenda.action_seal` tel quel** — évite exactement le défaut que `deferred-work.md` reproche par ailleurs au projet (« Vote en attente » contre « Réponds au vote », deux mots pour un même état, écart de registre non voulu). Le nom de la clé porte `agenda` par accident d'historique (elle a été créée pour ce bouton-là en premier), pas par intention de portée.
- **Créer `calendar.grid.action_seal`** (ou clé équivalente) avec le même texte dans les trois thèmes — cohérent avec la décision prise ailleurs dans ce projet d'éviter qu'un composant lise la clé d'un autre composant (cf. `character.sheet_menu_trigger_aria`, ajoutée plutôt que de réutiliser `calendar.display.trigger_aria` bien que le texte soit identique).

**Aucune AC ne tranche.** Le dev-story choisit, documente son choix dans Dev Agent Record, et si une clé neuve est créée, l'ajoute aux trois blocs de thème (`tones.ts`) **et** au test de complétude correspondant dans `theme-tone.service.spec.ts` (patron `SHEET_MENU_KEYS`/`AGENDA_KEYS` déjà en place, cf. story 31.1/36.11).

### Project Structure Notes

- Fichiers à modifier : `selection-bar.ts`/`.html` ; `calendar-week-view.ts`/`.html` ; `calendar-month-view.ts`/`.html` ; `calendar-view.html` (deux bindings `[canSeal]`/`(sealRequested)` de plus, aucune méthode TS nouvelle).
- Aucun fichier serveur (`apps/api`), aucun fichier `packages/shared`, aucune migration — cohérent avec `AC14`-style de garantie déjà posée par d'autres stories front-pures de cet épic (36.9, 36.11, 36.13, 36.14) : à vérifier par `git status` en fin de story si le dev-story souhaite l'attester explicitement (aucune AC ne l'exige formellement ici, mais c'est le motif implicite de la story).
- `MatMenu` reste proscrit projet entier (`shell.spec.ts`) — sans objet ici, cette story n'ouvre aucun menu.
- Alignement : aucun écart avec la structure unifiée du projet, cette story ajoute des inputs/outputs à des composants existants sans en créer de nouveaux.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md`, Epic 36, Story 36.15]
- [Source: `deferred-work.md`, section « Décisions actées avec l'utilisateur (2026-08-24) », item 1]
- [Source: `ux-designs/ux-jdr-master-2026-08-04/mockups/contrat-ui-calendrier.html:376`]
- [Source: `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:143-151, 598-603, 616-661` — `AgendaSealRequest`, `optionLabel()`, `sealLabel()`, `requestSeal()`]
- [Source: `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:1886-1921` — `onSealRequested()`, `writeSeal()`]
- [Source: `apps/web/src/app/features/calendar/calendar-view/calendar-view.html:199-218` — patron `canSeal`/`sealRequested` déjà câblé pour l'Agenda]
- [Source: `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` — composant de rendu pur à étendre]
- [Source: `apps/web/src/app/features/calendar/poll-track.utils.ts:24-45` — `VoteParticipation`, triplet d'identité]
- [Source: `apps/web/src/app/features/calendar/selection.utils.ts:5-8` — `SelectedCell`]
- [Source: `apps/web/src/app/core/theme/tones.ts:333,685,1033` — `calendar.agenda.action_seal`]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story, 2026-08-24)

### Debug Log References

- Suite complète `pnpm test` : 115 fichiers / 2231 tests verts (baseline 115/2211, +20 tests de cette story).
- `pnpm lint` : 142 = baseline exactement (2 erreurs prettier introduites par mes propres tests puis corrigées avant validation finale — signatures multi-lignes de `voteEntry()`/`selectSingle()` dans `calendar-week-view.spec.ts`).

### Completion Notes List

- **Aucun code nouveau sur le chemin d'écriture** : les trois composants touchés (`SelectionBar`, `CalendarWeekView`, `CalendarMonthView`) ne font que router vers `CalendarView.onSealRequested()`, entièrement livré et testé par la 36.12. `AgendaSealRequest` est importé tel quel, jamais dupliqué.
- **La dérivation `sealCandidate` vit dans les grilles, pas dans `SelectionBar`** (Encadré n°1) : `SelectionBar` reste un composant de rendu pur, cohérent avec sa JSDoc d'origine.
- **`canSeal` est un copier-coller littéral** du binding déjà posé sur `<app-calendar-agenda-view>` (`isMjMode() && partieId() !== null`), avec le même commentaire explicatif dupliqué sur les deux nouveaux sites (Encadré n°2).
- **Choix tranché pour Encadré n°4** (texte du bouton) : réutilisation de la clé de thème existante `calendar.agenda.action_seal` plutôt que création d'une clé neuve — la même action mérite le même mot sur les trois surfaces (Agenda + les deux grilles), et créer une troisième clé pour un texte identique aurait reproduit exactement le défaut de divergence de registre que `deferred-work.md` reproche ailleurs au projet (« Vote en attente » / « Réponds au vote »). Aucun test de complétude de thème n'a donc été ajouté (la clé existe déjà dans les trois thèmes).
- **Revue de code (2026-08-24)** : 1 patch corrigé (ambiguïté de `sealCandidate` sur deux votes OPEN concurrents partageant le même créneau exact — `.find()` → `.filter()` + unicité stricte), 4 items différés (voir `deferred-work.md`), 13 constats rejetés comme bruit. Web 115/2233 tests verts post-patch (+2 tests de non-régression), lint 142 = baseline.
- ⚠️ **Task 6 partiellement honorée** : le rendu de la grille a été vérifié à l'écran sans régression (aucune erreur console, deux vues), mais l'apparition réelle du bouton *Sceller* avec un vote MJ ouvert n'a **pas** pu être observée — le seul vote MJ atteignable du jeu de données de développement est déjà scellé (`CLOSED`), et en fabriquer un nouveau demandait plusieurs écritures non triviales sur des données partagées. Couvert par 20 tests automatisés qui exercent la même logique et le même DOM. Item consigné dans `deferred-work.md`.
- Formule de `dateLabel` dupliquée dans les deux grilles (`SEAL_DATE_FORMAT`) plutôt qu'extraite en util partagé, avec commentaires croisés — cohérent avec le patron déjà établi par `OPTION_DATE_FORMAT` de `calendar-agenda-view.ts`, qui reste un détail interne de l'Agenda.

### File List

- `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` (modifié)
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.html` (modifié)
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html` (modifié)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html` (modifié)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (modifié)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (modifié)
