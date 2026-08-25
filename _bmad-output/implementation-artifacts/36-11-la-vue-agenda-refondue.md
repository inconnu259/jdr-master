---
baseline_commit: ff64143
baseline_note: "Arbre de travail PROPRE au démarrage (git status vide). HEAD = ff64143 « feat: composer un vote depuis la grille » (story 36.10)."
---

# Story 36.11 : La vue Agenda refondue

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · porte **FR-56** (avec la 36.12) [Source: `epics.md:1909`] · classée **« Front »** par `epics.md:1927`.

> **Aucun octet ne change côté serveur.** Toute la matière est déjà chargée par `CalendarView`. Ce que cette story change, c'est **le critère d'organisation** de la liste : elle cesse d'être triée par date et devient triée **par ce qu'on attend du lecteur**. C'est la seule vue du calendrier qui n'a **pas** d'axe temporel — le Mois et la Semaine le portent déjà [Source: `EXPERIENCE.md:336`].

---

## 🚨 Encadré n°1 — CE QUI EST REMPLACÉ, ET CE QUI NE DOIT SURTOUT PAS L'ÊTRE

La planche contractuelle le dit sans détour : *« **Remplace intégralement** l'`agenda-view` actuelle — une `<ul>` de 22 lignes, sans aucun gestionnaire de clic »* [Source: `contrat-ui-calendrier.html:353`].

**Ce qui est remplacé** — et rien d'autre :

| Fichier | Traitement |
| --- | --- |
| `calendar-agenda-view.html` | **Réécrit** — trois sections, plus de `<ul>` plate |
| `calendar-agenda-view.scss` | **Réécrit** — sections, liseré, badges |
| `calendar-agenda-view.ts` | **Refondu** — `sortedEntries()` devient un partitionnement en trois sections |
| `calendar-agenda-view.spec.ts` | **Étendu** — les tests existants qui décrivent la liste plate deviennent caducs et sont **remplacés**, pas contournés |

**Ce qui ne doit PAS être touché, sous aucun prétexte :**

1. 🚨 **`allCalendarEntries()`** (`calendar-view.ts:321-536`). Elle sert **quatre** consommateurs : la vue Mois, la vue Semaine, le rail **et** l'Agenda. Y toucher casse trois surfaces livrées. L'Agenda consomme `agendaEntries()`, en aval.
2. 🚨 **`AgendaEntry`** est un contrat **partagé** avec le rail (`day-detail.utils.ts`), la case du Mois et la cellule de Semaine. On peut y **ajouter** un champ optionnel ; on n'en retire ni n'en renomme aucun.
3. **`<app-poll-track>`**, **`<app-group-gauge>`**, `poll-track.utils.ts` (`counterLabel`, `answerLabel`, `participationAriaLabel`, `trackSegments`) : livrés par les 36.6/36.7, **réutilisés tels quels**. Ne pas réécrire une piste de participation.
4. **`composeSeanceInfo(parts, density)`** (`day-detail.utils.ts:308`) : la composition « chez Marc · 20 h 30 · pensez aux dés » et son ordre de repli existent. L'Agenda a de la place ⇒ densité **`'full'`**, comme aujourd'hui.
5. **`onVoteOptionActivated()`** / le `cdkConnectedOverlay` du sélecteur de réponse dans `calendar-view.html:293-319` : c'est l'**unique** sélecteur des quatre surfaces. L'Agenda continue de l'ouvrir via l'`output` `voteOptionActivated` existant.
6. **`onScenarioActivated(target: RailTarget)`** (`calendar-view.ts:1183`) : la navigation vers le scénario **existe déjà**, livrée par la 36.1 pour le rail. L'Agenda la **réutilise** — ne pas écrire un second `router.navigate`.

---

## 🚨 Encadré n°2 — LE PIÈGE QUI COÛTERAIT LA STORY : « C'est passé » est structurellement VIDE en contexte personnel

Lire ceci avant d'écrire la moindre ligne de partitionnement.

**Deux contextes, deux sources** (encadré n°1 de la 36.1, toujours vrai) :

| Contexte | Source des séances | Porte `compteRendu` ? | Porte le passé ? |
| --- | --- | --- | --- |
| **Partie** (`partieId()` renseigné) | `scenarios()` → `SeanceDto` complet | ✅ `SeanceDto.compteRendu` (`shared:362`) | ✅ tous les scénarios de la partie, sans borne de date |
| **Personnel** (`/profile/calendar`) | `meCalendar()` → `MyCalendarSeanceEntry` | ❌ **le champ n'existe pas** (`shared:645-660`) | ❌ **la plage part d'aujourd'hui** (`fromDateStr = todayIso()`, `calendar-view.ts:962`) |

Conséquence, à écrire noir sur blanc dans le code :

- En **contexte de partie**, « C'est passé » se remplit et sait dire *« compte-rendu à écrire »*.
- En **contexte personnel**, la section est **vide par construction** : aucune séance passée n'arrive au client, et même si l'on élargissait la plage, rien ne dirait si le compte-rendu manque.

**Ne pas « réparer » cela ici.** Élargir la plage ajouterait une charge réseau non demandée ; ajouter `compteRendu` à `MyCalendarSeanceEntry` ferait de cette story une story serveur, qu'`epics.md:1927` classe explicitement « Front ». La section **s'efface quand elle est vide** (AC10) — c'est honnête, et invisible pour l'utilisateur. La limitation part en `deferred-work.md` et en **question n°1**.

---

## 🚨 Encadré n°3 — TROIS SECTIONS N'EST PAS UN TRI. C'est un changement de critère

`sortedEntries()` trie aujourd'hui par `date.localeCompare()`. **Cette ligne disparaît comme critère principal.**

> *« L'Agenda n'a pas d'axe temporel. […] **Aucun jour en en-tête** : la date redevient une propriété de la ligne. C'est ce qui distingue cette vue des deux autres et ce qui l'a fait retenir — se représenter des dates en liste est l'effort mental que la grille supprime, et qu'une liste groupée par jour réimpose. »* [Source: `EXPERIENCE.md:336-346`]

Le contrat, section par section [Source: `EXPERIENCE.md:340-344`, `contrat-ui-calendrier.html:329-347`] :

| # | Section | Contenu | Teinte |
| --- | --- | --- | --- |
| 1 | **Ça t'attend** | Votes ouverts · inscriptions ouvertes | `--jdr-status-todo` |
| 2 | **C'est programmé** | Séances datées, avec leurs informations pratiques | `--jdr-status-soon`, **intensité d'imminence** |
| 3 | **C'est passé** | Séances jouées dont le compte-rendu manque | `--jdr-status-done` |

🚨 **La date reste rendue sur chaque ligne** (AC2). Ce que l'AC1 interdit, c'est l'**en-tête de jour** — pas l'affichage de la date. Supprimer la date serait aussi faux que la mettre en en-tête.

Le tri **à l'intérieur** d'une section reste chronologique — c'est la seule clé qui ait un sens une fois le critère d'urgence appliqué. « C'est passé » se trie **du plus récent au plus ancien** : un compte-rendu oublié d'hier prime sur celui d'il y a trois mois.

---

## 🚨 Encadré n°4 — CE QUE LA REFONTE RETIRE DE L'AGENDA (et pourquoi ce n'est pas une perte)

Trois des six types d'entrée n'ont **aucune section** dans le contrat : `mes-disponibilites`, `mes-indisponibilites`, `disponibilite-groupe`.

**Ce n'est pas un oubli de la planche** : l'Agenda est « ce qu'on attend de moi », et ma propre déclaration de disponibilité n'attend rien de moi. Elle est déjà lisible **là où elle sert** — dans les deux grilles (36.2, 36.13) et dans le rail (36.1), qui nomme les trois créneaux de chaque jour.

⚠️ **C'est un retrait de comportement livré** (la 30.6 les listait). Il est **assumé et tracé** :

- Les **trois interrupteurs restent** dans la barre : ils commandent toujours les grilles et le rail. Seule la **liste** cesse de les rendre.
- Le filtre par couche continue de s'appliquer aux types **qui restent** — éteindre « mes séances » vide « C'est programmé ». La couche `inscriptions-ouvertes` est le seul cas particulier (AC7, encadré n°6).
- **Ne pas retirer ces types d'`allCalendarEntries()`** : le rail et les grilles en dépendent (encadré n°1, point 1). Le retrait est **à l'affichage**, dans le partitionnement de l'Agenda — exactement le patron déjà appliqué par la 36.8 au filtre `disponibilite-groupe` (`calendar-view.ts:520-535`).

---

## 🚨 Encadré n°5 — LE VOTE AUQUEL J'AI RÉPONDU NE DISPARAÎT PAS

Le tableau de `EXPERIENCE.md:342` écrit « **Votes ouverts sans ma réponse** ». Lu littéralement, un vote auquel j'ai répondu n'aurait **plus aucune section** — il s'évanouirait de l'Agenda, et je n'aurais plus aucun moyen d'y **changer** ma réponse.

L'AC4 dit l'inverse, explicitement : *« son libellé dit qu'on attend ma réponse **et il change quand j'ai répondu** »*. Un libellé qui change suppose une ligne qui reste.

**Tranché (D-2) : les votes ouverts restent tous dans « Ça t'attend », le badge fait la différence** — conformément à la règle générale des états dépendants du lecteur :

> *« Deux teintes imposent deux libellés. […] Les libellés sont donc **« Réponds au vote »** (`status-todo`) et **« Vote en cours »** (`status-live`). »* [Source: `EXPERIENCE.md:452-454`]

Ordre à l'intérieur de la section : **les entrées sans réponse d'abord**, les répondues ensuite, chacune triée par date. L'urgence est le critère de la vue ; elle doit valoir aussi à l'intérieur d'une section.

⚠️ À répercuter par `bmad-ux` : le tableau §4.4 bis doit dire « Votes ouverts » et non « Votes ouverts sans ma réponse ».

---

## 🚨 Encadré n°6 — L'INTERRUPTEUR DISPARAÎT, LA CLÉ RESTE (AC7)

Le PRD est catégorique et donne le mode d'emploi :

> *« La **clé de couche reste** dans l'union fermée et dans la préférence de compte : c'est l'interrupteur qui disparaît de l'écran, pas la clé — aucune préférence déjà enregistrée n'est invalidée. »* [Source: `prd.md:305`]

Ce qu'il faut faire, et **seulement** cela :

- `availableLayerKeys()` (`calendar-view.ts:194-198`) retire `'inscriptions-ouvertes'` de la liste passée à `<app-calendar-layer-toggle>`. **Une ligne.**
- 🚨 **NE PAS** retirer la clé de `CALENDAR_LAYER_KEYS` (`packages/shared/src/index.ts:37`) — l'union est validée côté serveur par `@IsIn(CALENDAR_LAYER_KEYS, { each: true })` ; la retirer ferait **échouer la sauvegarde des préférences** de tout compte l'ayant déjà enregistrée.
- 🚨 **NE PAS** retirer la case correspondante de l'écran **Compte** (`features/account/account.html`) : `account.calendar_layer.inscriptions-ouvertes` reste un réglage de compte valide. L'AC dit « la barre de contrôles », pas « le compte ».
- 🚨 **NE PAS** écrire de migration ni de script de nettoyage de préférences. « sans migration », littéralement.
- Conséquence directe : **la section « Ça t'attend » ignore la couche `inscriptions-ouvertes`** dans son filtrage. Un interrupteur qu'on ne peut plus atteindre ne doit pas pouvoir vider une section (AC9). Une préférence de compte à `false` héritée du palier précédent masquerait sinon définitivement les inscriptions, sans aucun moyen de les rétablir.

---

## Story

As a **utilisateur**,
I want **que l'agenda me dise ce qu'on attend de moi**,
so that **je n'aie pas à me représenter une liste de dates**.

[Source: `epics.md:2376-2380`]

---

## Acceptance Criteria

Les AC1 à AC7 sont **verbatim** d'`epics.md:2382-2414`. Les AC8+ sont ajoutées par cette story pour verrouiller ce que le verbatim laisse ouvert.

### AC1 — Trois sections, aucun jour en en-tête (verbatim)

**Given** la vue agenda
**When** elle est rendue
**Then** elle s'organise en trois sections — ce qui m'attend, ce qui est programmé, ce qui est passé
**And** **aucun jour ne figure en en-tête de section**

### AC2 — La date est une propriété de la ligne (verbatim)

**Given** une entrée quelconque
**When** elle est rendue
**Then** sa date est une propriété de la ligne

### AC3 — Une inscription ouverte n'est pas une anomalie (verbatim)

**Given** une séance à inscription ouverte, donc sans date
**When** l'agenda est rendu
**Then** elle figure dans « ce qui m'attend »
**And** son absence de date n'est pas une anomalie d'affichage

### AC4 — Le libellé d'un vote dépend du lecteur (verbatim)

**Given** un vote auquel je n'ai pas répondu
**When** il est rendu
**Then** son libellé dit qu'on attend ma réponse
**And** il change quand j'ai répondu

### AC5 — Activer une entrée de séance ouvre le SCÉNARIO (verbatim, corrigée le 2026-08-17)

**Given** une entrée portant une séance
**When** je la tape
**Then** le **scénario** qui porte cette séance s'ouvre

> ⚠️ *Correction du 2026-08-17 : la formulation d'origine, « la séance s'ouvre », supposait un écran de séance qui n'existe pas. Règle générale : une surface nomme la séance, l'activer ouvre le niveau au-dessus. Même cible que l'AC correspondante de la story 36.1.* [Source: `epics.md:2404`, `EXPERIENCE.md:585`]

Le **libellé accessible annonce l'ouverture du scénario**, jamais de la séance [Source: `EXPERIENCE.md:585`].

### AC6 — L'Agenda est le défaut mobile (verbatim)

**Given** un téléphone
**When** j'ouvre le calendrier
**Then** l'agenda est la vue affichée par défaut

### AC7 — L'interrupteur « inscriptions ouvertes » quitte la barre (verbatim)

**Given** la couche « les inscriptions ouvertes »
**When** cette story est livrée
**Then** son interrupteur disparaît de la barre de contrôles
**And** sa clé reste dans la préférence de compte, sans migration

### AC8 — 🚨 Chaque ligne porte un badge d'état, jamais la couleur seule

**Given** une entrée d'une quelconque section
**When** elle est rendue
**Then** elle porte un **liseré** teinté de sa section **et** un **badge textuel** nommant ce qu'on attend
**And** aucune information n'est portée par la couleur seule (P-1)
**And** les teintes viennent de `--jdr-status-todo` / `--jdr-status-soon` / `--jdr-status-done`, jamais d'une valeur codée en dur

Libellés de badge : « Réponds au vote » (vote sans ma réponse) · « Vote en cours » (vote répondu) · « S'inscrire » (inscription ouverte où je ne suis pas inscrit) · « Inscrit » (où je le suis) · l'**imminence** pour une séance programmée · « Débriefer » (compte-rendu manquant).

### AC9 — 🚨 Le filtre par couche s'applique, sauf aux inscriptions

**Given** la couche « mes séances » éteinte
**When** l'agenda est rendu
**Then** « C'est programmé » et « C'est passé » sont vides
**And** « Ça t'attend » continue de porter les inscriptions ouvertes, dont l'interrupteur n'existe plus (encadré n°6)
**And** les couches `mes-disponibilites`, `mes-indisponibilites` et `disponibilite-groupe` ne produisent **aucune** ligne d'agenda, quel que soit l'état de leur interrupteur (encadré n°4)

### AC10 — 🚨 Une section vide s'efface ; un agenda vide le dit

**Given** une section sans aucune entrée
**When** l'agenda est rendu
**Then** ni son en-tête ni son cadre ne sont rendus — pas un en-tête suivi du vide

**Given** les trois sections vides
**When** l'agenda est rendu
**Then** un message unique le dit explicitement, comme aujourd'hui

**Given** le chargement en cours
**When** l'agenda est rendu
**Then** l'indicateur de chargement s'affiche, et **jamais** le message de vide (comportement existant, à ne pas régresser)

### AC11 — 🚨 Le badge d'imminence est une intensité, pas une cinquième couleur

**Given** une séance programmée
**When** son badge est rendu
**Then** il garde la teinte `status-soon` et se **densifie** selon l'échéance :

| Palier | Quand | Traitement |
| --- | --- | --- |
| Lointain | > 7 jours | Contour seul, fond transparent |
| Proche | 7 à 2 jours | Badge teinté (fond à 15 %) |
| Imminent | Demain et aujourd'hui | Badge **plein**, texte sur fond, poids 600, **libellé humain** |

**And** le libellé du palier imminent est humain — « demain soir », « ce soir » — **jamais « J-1 »**
**And** le texte d'un badge plein prend `{colors.primary-bg}`, **jamais du blanc**

[Source: `DESIGN.md:195-203`, `EXPERIENCE.md:128`]

### AC12 — 🚨 Seul ce qui est ouvrable est cliquable

**Given** une entrée dont le scénario est identifiable (`partieId` **et** `scenarioId` renseignés)
**When** elle est rendue
**Then** elle est activable au clic **et au clavier**, et l'annonce

**Given** une entrée sans scénario identifiable — inscription ouverte du calendrier personnel (`MyCalendarOpenInscriptionEntry` ne porte pas de `scenarioId`)
**When** elle est rendue
**Then** elle **n'est pas cliquable et ne s'en donne pas l'air**

*(Même règle que l'AC5 de la 36.1 pour le rail. Un `<button>` désactivé n'est pas une réponse : c'est une ligne qui n'est pas un bouton.)*

### AC13 — 🚨 Le sélecteur de réponse de vote survit à la refonte

**Given** une ligne de vote de la section « Ça t'attend »
**When** je l'active
**Then** le **même** sélecteur de réponse que les grilles et le rail s'ouvre, ancré sur la ligne
**And** aucun second chemin de réponse ni de retrait n'apparaît dans l'Agenda

*(La 36.7 a fait de ce sélecteur l'unique chemin des quatre surfaces. La refonte ne doit pas le perdre en réécrivant le template.)*

### AC14 — 🚨 Zéro appel réseau, zéro changement serveur

**Given** l'ouverture de la vue agenda et toute bascule vers elle
**When** elle est rendue
**Then** **aucun** appel HTTP supplémentaire n'est émis — toute la matière vient de `agendaEntries()`, déjà dérivée
**And** aucun fichier de `apps/api/` ni `packages/shared/` n'est modifié par cette story

### AC15 — 🚨 Le défaut mobile est un défaut, pas un verrou

**Given** un téléphone, où l'agenda s'est affiché par défaut
**When** je choisis « Vue mois »
**Then** j'y reste — aucun recalcul de défaut ne me ramène à l'agenda
**And** une rotation ou un redimensionnement ne change **jamais** la vue courante

---

## Tasks / Subtasks

### 0. Baseline (obligatoire, avant toute modification)

- [x] `docker compose exec web pnpm test` — relever le nombre de fichiers/tests verts, et le consigner. **Toute comparaison de fin se fait contre ce chiffre.**
- [x] `docker compose exec web pnpm lint` — relever le nombre d'erreurs **pré-existantes** (143 à la 36.10). Aucune erreur **nouvelle** sur les fichiers touchés n'est acceptable ; les pré-existantes ne sont pas dans le périmètre.
- [x] Vérifier `git status` propre et noter le SHA de HEAD.

### 1. Le partitionnement en trois sections (AC1, AC3, AC9, AC10, encadrés n°3 à n°6)

- [x] Dans `calendar-agenda-view.ts`, remplacer `sortedEntries()` par un `computed()` `sections()` renvoyant un tableau ordonné de `{ id, title, tint, entries }` — **les sections vides sont exclues du tableau**, pas rendues puis masquées (AC10).
- [x] Règles d'affectation, une par type :
  - `votes-en-cours` → **Ça t'attend** (tous, cf. encadré n°5 ; sans réponse d'abord, puis par date)
  - `inscriptions-ouvertes` → **Ça t'attend**
  - `mes-seances` avec `date >= aujourd'hui` → **C'est programmé** (par date croissante)
  - `mes-seances` avec `date < aujourd'hui` **et** compte-rendu manquant → **C'est passé** (par date **décroissante**)
  - `mes-disponibilites`, `mes-indisponibilites`, `disponibilite-groupe` → **aucune section** (encadré n°4)
- [x] `today` est un **paramètre**, pas un `new Date()` interne — sinon aucun test n'est déterministe. Patron déjà appliqué par `countdownProgress(nextSessionDate, now)` (`party-countdown.util.ts`) et par `Dashboard.countdownNow`. Le figer au montage dans `CalendarView`, une seule source pour tout l'écran.
- [x] Comparaison de dates : sur les **clés `YYYY-MM-DD`**, par `localeCompare`, **jamais** par construction d'objets `Date` — c'est le patron du fichier (`toDateKey`, `dateKeyToLocalMidnight`) et cela évite le piège UTC/local documenté dans `deferred-work.md`.
- [x] Dans `calendar-view.ts`, étendre le filtre d'`agendaEntries()` (`:520-535`) : `inscriptions-ouvertes` **échappe** au filtre par couche (AC9, encadré n°6). Commenter le pourquoi sur place.

### 2. Le champ « compte-rendu manquant » (AC1 section 3, encadré n°2)

- [x] Ajouter à `AgendaEntry` un champ **optionnel** `compteRenduManquant?: boolean`, documenté comme *renseigné en contexte de partie uniquement — `MyCalendarSeanceEntry` ne porte pas `compteRendu`*.
- [x] Le renseigner dans `allCalendarEntries()`, branche `if (pid)`, à côté de `seanceHeure`/`seanceLieu`/`seanceNote` : `compteRenduManquant: !seance.compteRendu?.trim()`.
- [x] **Ne rien renseigner** dans la branche personnelle. `undefined` ⇒ l'entrée ne peut pas atterrir dans « C'est passé » ⇒ section vide ⇒ section absente (AC10). Comportement voulu, à commenter.
- [x] 🚨 Ne **pas** toucher `packages/shared` (AC14).

### 3. Les badges, les liserés et l'imminence (AC8, AC11)

- [x] Un helper `agenda-badge.utils.ts` **à côté du composant** (patron `poll-track.utils.ts` / `group-availability.utils.ts` : la logique testable sort du composant). Il expose :
  - `badgeFor(entry, today)` → `{ label: string; tone: 'todo' | 'live' | 'soon' | 'done'; intensity?: 'far' | 'near' | 'imminent' }`
  - `imminenceLabel(dateKey, slot, today)` → libellé **humain** au palier imminent (« ce soir », « demain soir »), « dans N j » / « dans N sem. » au-delà.
- [x] SCSS : liseré `.kbar` de 3 px + badge, teintes via `var(--jdr-status-todo, …)` / `-soon` / `-done` **avec repli littéral**, comme le fait `dashboard.scss:86-95`. Trois paliers d'intensité = trois classes, jamais trois couleurs.
- [x] 🚨 Texte d'un badge **plein** : `{colors.primary-bg}`, jamais `#fff` (`DESIGN.md:191`).
- [x] Aucun composant partagé à extraire : `StatusBadge` (`DESIGN.md §7.1`) n'existe pas en code, `dashboard.scss` porte déjà sa propre déclinaison. **Ne pas refactoriser le dashboard** — hors périmètre.

### 4. La ligne activable et la navigation (AC5, AC12, AC13)

- [x] Une ligne **ouvrable** est un `<button type="button">` occupant la ligne, avec `[attr.aria-label]` annonçant **« Ouvrir le scénario … »**. Une ligne non ouvrable est un `<li>` nu — pas de `<button disabled>` (AC12).
- [x] Nouvel `output` `scenarioActivated = output<RailTarget>()` sur `CalendarAgendaView`, **du même type** que celui du rail (`day-detail.utils.ts:34`) pour que `calendar-view.html` le branche sur `onScenarioActivated($event)` **existant** — aucune nouvelle méthode de navigation (encadré n°1, point 6).
- [x] Le bouton de vote existant (`.agenda-entry__vote-action`, `voteOptionActivated`) est **conservé tel quel** dans la nouvelle ligne (AC13) — vérifier qu'il reste ancré (`event.currentTarget`) et que `voteAriaLabel()` survit.
- [x] 🚨 **Pas de bouton « S'inscrire »**. Le badge est un **libellé d'état**, pas une action (`contrat-ui-calendrier.html:352`, note 11 : *« les badges reprennent les libellés dépendants du lecteur »*). Le chemin d'inscription reste la fiche de scénario. Créer ici un appel à `scenariosSvc.inscrire()` serait un second chemin d'écriture non demandé.
- [x] 🚨 **Pas d'imbrication de boutons** : le bouton de vote ne doit pas se retrouver **dans** le bouton de ligne (HTML invalide, navigation clavier cassée). Une ligne porte l'un **ou** l'autre — une entrée de vote n'a pas de scénario ouvrable dans la pratique, mais la garde doit être structurelle.

### 5. Le défaut mobile (AC6, AC15)

- [x] Dans `CalendarView`, injecter `BreakpointObserver` et reprendre **exactement** le patron des deux composants qui l'utilisent déjà (`partie-detail.ts:121, 126`, `list-control-bar.ts:31-58`) : constante privée `DESKTOP_QUERY = '(min-width: 1024px)'`, valeur initiale **synchrone** via `isMatched()` pour éviter un flash.
- [x] 🚨 **Lecture UNE SEULE FOIS, à l'initialisation du signal `view`** : `signal<'month'|'week'|'agenda'>(isMatched(DESKTOP_QUERY) ? 'month' : 'agenda')`. **Aucun `effect()`, aucun `toSignal()` réactif ne doit réassigner `view`** — sinon une rotation d'écran ramènerait l'utilisateur de force sur l'agenda (AC15).
- [x] Le seuil est le même que le reste de l'application. `EXPERIENCE.md:688` dit « mobile / desktop » sans chiffre ; réutiliser un troisième seuil créerait un vocabulaire de plus.

### 6. Les libellés thématisés (AC1, AC8)

- [x] Nouvelles clés de ton, **dans les TROIS thèmes** de `tones.ts` (piège n°12 de la 36.9 : une clé posée dans un seul thème rend `undefined` dans les deux autres) :
  `calendar.agenda.section_awaiting`, `calendar.agenda.section_scheduled`, `calendar.agenda.section_past`, `calendar.agenda.badge_answer_poll`, `calendar.agenda.badge_poll_open`, `calendar.agenda.badge_signup`, `calendar.agenda.badge_signed_up`, `calendar.agenda.badge_debrief`, `calendar.agenda.empty`.
- [x] ⚠️ **Ne pas réutiliser `dashboard.section_awaiting`** (« Ce qui t'attend ») : la liste des parties et le calendrier sont deux écrans, et le registre du thème doit pouvoir diverger. La 35.2 fera l'inventaire ; y poser un partage implicite maintenant le lui compliquerait.
- [x] ⚠️ Écart signalé : le ton existant `partie.signal_vote_en_cours_sans_reponse` dit **« Vote en attente »** là où `EXPERIENCE.md:454` impose **« Réponds au vote »**. **Ne pas modifier la clé du dashboard dans cette story** — la nouvelle clé d'agenda porte le libellé du contrat, l'incohérence part en `deferred-work.md` pour la 35.2/35.3.

### 7. La barre de contrôles (AC7, encadré n°6)

- [x] `availableLayerKeys()` (`calendar-view.ts:194-198`) : retirer `'inscriptions-ouvertes'` **de ce qui est passé au bandeau**, dans les deux contextes.
- [x] Vérifier que `defaultLayersForContext()`, `isOverridden()` et `resetToDefault()` continuent de raisonner sur le jeu **complet** — sinon la pastille « Affichage filtré » se déclencherait à tort pour tout compte dont la préférence porte encore la clé.
- [x] 🚨 Ne toucher ni `packages/shared`, ni `apps/api`, ni `features/account`.

### 8. La Destinée en vue Agenda (dette ouverte, tranchée ici)

- [x] `deferred-work.md:21` laisse explicitement la décision à cette story : *« La vue Agenda ignore le mode Destinée […] à trancher avec la 36.11. »*
- [x] **Tranché (D-3) : le contrôle Destinée est masqué en vue Agenda**, comme le sont déjà le rail, la barre de composition et le bouton « Ajouter des dates » (`calendar-view.html:110, 125`). La Destinée estompe **une grille** ; il n'y en a pas ici. Un contrôle visible sans effet est un défaut, pas une neutralité.
- [x] Si la Destinée est **active** quand on bascule vers l'Agenda, l'état n'est **pas** réinitialisé — revenir au Mois la retrouve. On masque le contrôle, on ne détruit pas le mode.
- [x] Retirer l'entrée correspondante de `deferred-work.md`.

### 9. Tests — Web (Vitest, zoneless)

`calendar-agenda-view.spec.ts` — les tests décrivant la `<ul>` plate sont **remplacés** :

- [x] AC1 : trois sections rendues, dans l'ordre ; **aucun nœud d'en-tête de jour** (assertion négative explicite sur un libellé de date en en-tête).
- [x] AC2 : la date figure **sur la ligne** de chaque entrée datée.
- [x] AC3 : une inscription sans date atterrit dans « Ça t'attend » et ne rend aucun nœud de date vide.
- [x] AC4 : deux cas, `myAnswer: null` → « Réponds au vote » ; `myAnswer: 'YES'` → « Vote en cours ». **Même entrée, deux libellés.**
- [x] AC5/AC12 : entrée avec `scenarioId` → `<button>` + `scenarioActivated` émis avec le bon `RailTarget` ; entrée sans `scenarioId` → **aucun** `<button>` de ligne.
- [x] AC8/AC11 : les trois paliers d'imminence, avec un `today` injecté ; palier imminent → libellé humain.
- [x] AC10 : une section vide n'est pas rendue ; les trois vides → message unique ; `loading` → spinner **et pas** le message vide.
- [x] AC13 : le sélecteur de vote est toujours atteignable depuis la nouvelle ligne (test de la 36.7 conservé, adapté au nouveau DOM).
- [x] Tri intra-section : « C'est passé » **décroissant**, les deux autres croissants ; votes sans réponse avant les répondus.

`agenda-badge.utils.spec.ts` — nouveau, tests unitaires purs : bornes des trois paliers (7 j, 2 j, demain, aujourd'hui, hier), libellés humains, chaque type d'entrée → son badge.

`calendar-view.spec.ts` :

- [x] AC6/AC15 : `BreakpointObserver` mocké mobile → `view()` vaut `'agenda'` au montage ; desktop → `'month'`. Puis : après `onViewChange('month')` en mobile, une émission de l'observer ne ramène **pas** l'agenda.
- [x] AC7 : `availableLayerKeys()` ne contient plus `'inscriptions-ouvertes'` ; `CALENDAR_LAYER_KEYS` (shared) le contient toujours.
- [x] AC9 : couche `mes-seances` éteinte → aucune entrée de séance dans `agendaEntries()` ; couche `inscriptions-ouvertes` éteinte dans les préférences → les inscriptions **restent**.
- [x] AC14 : aucun appel HTTP supplémentaire au passage en vue agenda (compteur sur le `HttpTestingController` déjà utilisé par ce spec).
- [x] D-3 : `<app-destiny-control>` absent du DOM en vue agenda.

**Rappel plateforme (mémoire projet)** : Angular **zoneless**, pas de zone.js. `whenStable()` seul ne suffit pas pour un `ngOnInit` asynchrone — réutiliser la **boucle de ticks** déjà établie dans `calendar-view.spec.ts`, ne pas en inventer une autre.

### 10. Qualité

- [x] `docker compose exec web pnpm test` — comparer au chiffre de la tâche 0. **Aucune régression.**
- [x] `docker compose exec web pnpm lint` — aucune erreur **nouvelle**.
- [x] `docker compose exec web pnpm typecheck`. *(API non requis : `packages/shared` n'est pas modifié — AC14. S'il l'était, l'API le serait aussi, cf. `apps/api` typecheck gap.)*

### 11. 🚨 Vérification visuelle réelle (obligatoire)

Discipline établie par les 36.9/36.10, non négociable.

- [x] **Chrome MCP (`claude-in-chrome`), session de test déjà connectée** — jamais le navigateur interne.
- [x] `/profile/calendar` **et** le calendrier d'une partie, en **compte joueur** puis **compte MJ**.
- [x] Les **trois thèmes**, à l'œil : liseré, badge, contraste du badge plein.
- [x] **375 px** (défaut agenda vérifié au chargement) **et** desktop (défaut mois).
- [x] Vérifier de visu : aucun en-tête de jour ; une section vide absente ; un vote répondu et un non répondu côte à côte ; le sélecteur de réponse s'ouvre bien depuis une ligne.
- [x] ⚠️ Le jeu de données de développement porte les valeurs posées par la 36.5 (séance du 3 septembre) — **s'en servir, ne rien écrire de nouveau en base**.

### 12. Clôture

- [x] Consigner dans `deferred-work.md` : la limitation de « C'est passé » en contexte personnel (encadré n°2), l'écart de libellé « Vote en attente » / « Réponds au vote », le retrait des trois couches de la liste (encadré n°4) ; **retirer** l'entrée Destinée refermée par D-3.
- [x] Remplir Dev Agent Record (File List, Completion Notes, Change Log).
- [x] Rappeler à l'utilisateur `/code-review` puis `/security-review` (`epics.md:335` — non optionnel sur cet épic, **en dette depuis la 36.4**).

---

### Review Findings

Revue du 2026-08-23 — Blind Hunter, Edge Case Hunter, Acceptance Auditor (diff vs baseline `ff64143`). **Acceptance Auditor : 0 violation d'AC.**

- [x] [Review][Patch] `AGENDA_DATE_FORMAT` ne rend jamais l'année, alors que « C'est passé »/« C'est programmé » peuvent franchir une frontière d'année [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:137-141] — **corrigé** : `year: 'numeric'` ajouté au format.
- [x] [Review][Patch] `metaLine()` code en dur le littéral `'sans date'`, hors du registre de thème alors que tous les autres libellés de cette story passent par `theme.tone()` [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:255] — **le littéral en dur était déjà corrigé par la story 36.12** (`theme.tone()['calendar.agenda.no_date']`, commentaire de revue déjà en place). **Corrigé aujourd'hui** : garde explicite `if (!entry.date)` ajoutée avant de pousser ce libellé, absente jusqu'ici (extension trouvée en revue du 2026-08-24 : rien n'empêchait techniquement une entrée `inscriptions-ouvertes` future de porter à la fois une date et le suffixe contradictoire « sans date »).
- [x] [Review][Patch] Le liseré/pastille « C'est passé » (`.agenda-section__key`/`.agenda-entry__kbar`) ne tient qu'au repli CSS de base, sans règle `.agenda-section--done` explicite comme `--todo`/`--soon` [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss:24-30,67-73] — **corrigé** : deux règles `.agenda-section--done` explicites ajoutées.

**Revue du 2026-08-24 (2e passe)** — 3 patch supplémentaires trouvés, dont 1 **correction d'un verdict erroné de la 1ère passe** :

- [x] [Review][Patch] **Le verdict « non atteignable » ci-dessous (ligne différée du 2026-08-23) était FAUX au moment du diff `452e5c9`** — `badgeFor()` affichait « Réponds au vote » (badge `todo`, en tête de section) quand `entry.vote === undefined`, un cas réellement atteignable (`calendar-view.ts` pose `vote: !servedAggregates ? undefined : {...}` pendant un déploiement dégradé). **Déjà résolu entre-temps par la story 36.12** : `badgeFor()` porte désormais `if (!entry.vote) return null;` avec un commentaire citant explicitement ce même principe de dégradation honnête (`agenda-badge.utils.ts:158-160`). **Aucun changement de code nécessaire** — vérifié sur l'arbre actuel, pas sur le diff historique.
- [x] [Review][Patch] `imminenceLabel()` arrondit les semaines par `Math.round(days / 7)` — la transition « 2 sem. » → « 3 sem. » a lieu au jour 18 (arrondi de 17,5) et non au jour 21 attendu d'une granularité « semaines » [apps/web/src/app/features/calendar/agenda-badge.utils.ts:105] — **corrigé** : `Math.floor` remplace `Math.round`, + test dédié verrouillant la transition au jour 21.
- [x] [Review][Patch] Branche morte dans `metaLine()` pour `votes-en-cours` (`entry.detail && !entry.date`) — `date` est TOUJOURS renseignée pour ce type dans l'invariant actuel de construction des entrées (une ligne par option, chacune datée), rendant la branche inatteignable et non prouvée par un test [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts] — **corrigé** : conservée (pas retirée — pourrait redevenir utile), mais documentée explicitement comme filet plutôt que laissée sans explication.

- [x] [Review][Defer] `.agenda-badge--done` sous le seuil AA sur le thème Steampunk [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss] — deferred, déjà consigné pour `bmad-ux`
- [x] [Review][Defer] `badgeFor`/`sectionIdFor` recalculés à chaque comparaison dans les tris de `sections()` [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:206-221] — deferred, pré-existant/négligeable à la taille de liste réelle
- [x] [Review][Defer] `imminenceLabel`/`imminenceIntensity` ne gardent pas en interne contre un `days` négatif, seul l'appelant le garantit [apps/web/src/app/features/calendar/agenda-badge.utils.ts:81-106] — deferred, non atteignable par le seul chemin d'appel actuel
- [x] [Review][Defer] `SLOT_LABELS` dupliqué de `calendar-view.ts`, et re-minusculé dans `dateWithSlot` [apps/web/src/app/features/calendar/agenda-badge.utils.ts:39-44] — deferred, compromis déjà documenté dans le code
- [x] [Review][Defer] `todayKey` figé une seule fois à la construction de `CalendarView`, jamais rafraîchi au franchissement de minuit [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — deferred, décision de conception explicite de la story
- [x] [Review][Defer] La garde anti-imbrication de boutons d'`openTarget()` repose sur la troncature `entry.vote`, pas sur le système de types [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:311-313] — deferred, refactorisation de types hors périmètre de cette story
- [x] [Review][Defer] `badgeLabel()` retombe sur `''` pour l'imminence — le P-1 « jamais la couleur seule » n'est garanti que par convention [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts:288-292] — deferred, non atteignable aujourd'hui
- [x] [Review][Defer] `jeSuisInscrit`/`mine` dérivés de `authSvc.currentUser()?.id`, transitoirement `undefined` avant résolution de l'auth [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:403-447] — deferred, se corrige seul via la réactivité des signaux, patron déjà existant pour `myAnswer`
- [x] [Review][Defer] `AgendaEntry` est une interface plate où tous les champs (`vote`, `jeSuisInscrit`, `compteRenduManquant`…) sont optionnels quel que soit `type` — rien n'empêche une combinaison impossible ; une union discriminée serait la correction propre, hors périmètre d'un patch ponctuel [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts] — deferred, refactorisation de types (revue du 2026-08-24)
- [x] [Review][Defer] `badgeLabel()` n'a aucun repli si une clé de `BADGE_KEYS` manquait du thème actif — protection uniquement par le tableau `AGENDA_KEYS` maintenu à la main dans `theme-tone.service.spec.ts`, à part du code qu'il protège [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts] — deferred, même discipline de test déjà actée pour ce fichier (revue du 2026-08-24)

Dismissed comme bruit (revue du 2026-08-23, 4) : `metaLine` qui « perd » `entry.detail` sur un vote daté (faux positif — doublon du créneau déjà affiché) ; l'ordre des imports dans `calendar-view.spec.ts` (stylistique) ; l'absence de gabarit commun aux libellés par thème (choix assumé) ; l'absence de repli runtime si une clé de ton manquait (patron pré-existant de `ThemeToneService`, déjà gardé par un test dédié de cette story).

Dismissed comme bruit (revue du 2026-08-24, 5) : les entrées `inscriptions-ouvertes` ignorent le réglage de couche de l'utilisateur — vérifié INTENTIONNEL et conforme à AC7/AC9 par l'Acceptance Auditor (avec accès à la spec) ; `SLOT_LABELS` dupliqué — déjà différé ci-dessus, doublon de constat ; contraste des badges non vérifié par un outil automatisé — lacune systémique du projet, pas un défaut introduit par cette story ; `actionRank()` recalculé dans le comparateur de tri — déjà différé ci-dessus, doublon de constat ; `jeSuisInscrit` potentiellement absent d'une réponse API dégradée — non étayé, `MyCalendarOpenInscriptionEntry.jeSuisInscrit` est un champ **requis** du DTO partagé (`packages/shared/src/index.ts:709`), aucun mécanisme de dégradation équivalent à `servedAggregates` n'existe pour ce champ ; mock de test `observe()` jamais exercé — hygiène de test mineure, sans risque de production.

## Hors périmètre

- **L'Agenda du MJ** — options dépliées, tri par faveur, bouton *Sceller*, bouton *Lancer un vote*. C'est la **story 36.12**, bloquée par **Q-25** (définition d'un vote « mûr »). N'en implémenter aucune partie, même « en préparation ».
- **Le panneau « ☰ Affichage »** et la légende (planche `contrat-ui-calendrier.html:328`) : story **36.14**. La barre de couches reste telle qu'elle est aujourd'hui, moins un interrupteur.
- **Tout changement serveur** : élargir la plage de `GET /me/calendar`, ajouter `compteRendu`/`scenarioId` aux DTO du calendrier personnel (encadré n°2, AC14).
- **Un chemin d'inscription depuis l'Agenda** (tâche 4).
- **La virtualisation / pagination de la liste** (`deferred-work.md:74`) — la dette reste ouverte ; le partitionnement en sections ne la referme pas et n'a pas à la refermer.
- **Extraire un composant `StatusBadge` partagé** avec le dashboard.
- **Toucher aux 143 erreurs de lint pré-existantes.**

---

## Ce qui doit continuer de fonctionner

Une story doit laisser le système entier debout, pas seulement satisfaire ses AC.

1. **Les vues Mois et Semaine, à l'identique** — elles consomment `calendarEntries()` (non filtré), que cette story ne touche pas.
2. **Le rail de détail** (36.1) — il consomme `allCalendarEntries()`. Toute modification de la source le casse silencieusement.
3. **Le sélecteur de réponse de vote** (36.7) depuis les **quatre** surfaces.
4. **Le mode de composition** (36.10) et la barre persistante, en Mois et Semaine.
5. **Le mode Destinée** en Mois et Semaine — masquer son contrôle en Agenda ne doit pas éteindre le mode.
6. **La bascule de couches** et la pastille « Affichage filtré » : cinq interrupteurs au lieu de six, sans faux positif d'écart au défaut.
7. **L'écran Compte** et ses six cases de couches, intactes.
8. **La sauvegarde des préférences de calendrier** : la clé `inscriptions-ouvertes` reste valide côté serveur.
9. **`GET /me/calendar`** : un seul appel, plage inchangée.
10. **Le rechargement temps réel** (`scenariosSvc.changed()`) : la liste se recompose à la volée, sections comprises.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Trier par date au lieu de partitionner par urgence** (encadré n°3). Le tri survit **à l'intérieur** des sections, il cesse d'être le critère principal.
2. **Supprimer la date des lignes** en croyant appliquer « aucun jour en en-tête ». L'AC2 dit l'inverse.
3. **Toucher `allCalendarEntries()`** — casse le rail, le Mois et la Semaine (encadré n°1).
4. **Retirer `mes-disponibilites` / `disponibilite-groupe` de la source** au lieu de l'affichage (encadré n°4).
5. **Laisser un vote répondu disparaître** de l'Agenda (encadré n°5).
6. **Retirer `'inscriptions-ouvertes'` de `CALENDAR_LAYER_KEYS`** — casse la validation serveur des préférences déjà enregistrées (encadré n°6).
7. **Laisser la couche `inscriptions-ouvertes` filtrer la section** alors que son interrupteur n'existe plus : une préférence héritée à `false` masquerait la section sans recours (AC9).
8. **Réassigner `view` depuis un `effect()`** sur le breakpoint — une rotation ramènerait l'utilisateur de force à l'agenda (AC15).
9. **Imbriquer le bouton de vote dans le bouton de ligne** — HTML invalide, focus cassé (tâche 4).
10. **Fabriquer un bouton « S'inscrire »** : le badge est un libellé, pas une action.
11. **Poser une clé de ton dans un seul thème** — piège n°12 de la 36.9, `undefined` rendu dans les deux autres.
12. **Coder une couleur en dur** au lieu de `var(--jdr-status-*)` — patch n°1 de la revue de la 36.1, déjà payé une fois.
13. **Du blanc sur un badge plein** (`DESIGN.md:191`, contraste 2,3:1).
14. **Un `new Date()` dans le composant** au lieu d'un `today` injecté — aucun test déterministe, et deux entrées peuvent tomber de part et d'autre d'une frontière de jour.
15. **Construire des `Date` pour comparer des jours** : comparer les clés `YYYY-MM-DD`. Le piège UTC/local a déjà coûté la story 1-8.
16. **Rendre un en-tête de section puis rien** (AC10) : la section absente, pas vide.
17. **Perdre le spinner** au profit du message de vide pendant le chargement — test existant, à conserver.
18. **Croire que « C'est passé » marchera sur `/profile/calendar`** (encadré n°2). Elle sera vide. C'est attendu.
19. **Écrire en base de développement** pour se fabriquer un cas de test.
20. **Rendre `today` ou le nouvel `output` obligatoires** dans les vues sans réparer les fixtures — piège n°18 de la 36.9, n°11 de la 36.10.

### Décisions arrêtées par cette story

- **D-1 — « C'est passé » = séance passée dont le compte-rendu manque, en contexte de partie uniquement.** Le contrat (`EXPERIENCE.md:344`) dit « séances jouées dont le compte-rendu manque » ; le calendrier personnel n'a ni le champ ni les données. Section vide, donc absente. *(Question n°1.)*
- **D-2 — Tous les votes ouverts restent dans « Ça t'attend », le badge distingue** (encadré n°5). ⚠️ À répercuter dans `EXPERIENCE.md §4.4 bis` par `bmad-ux`.
- **D-3 — Le contrôle Destinée est masqué en vue Agenda**, sans réinitialiser le mode (tâche 8). Referme la dette `deferred-work.md:21`.
- **D-4 — Les trois couches de disponibilité quittent la liste Agenda**, gardent leurs interrupteurs pour les grilles (encadré n°4).
- **D-5 — Le seuil du défaut mobile est `(min-width: 1024px)`**, le seuil déjà utilisé par `partie-detail` et `list-control-bar`. Pas un troisième vocabulaire.
- **D-6 — Les badges sont des libellés d'état, jamais des actions** (`contrat-ui-calendrier.html:352`). L'unique action d'une ligne est : ouvrir le scénario, ou ouvrir le sélecteur de vote.
- **D-7 — La logique de badge/imminence sort du composant** dans `agenda-badge.utils.ts`, patron `poll-track.utils.ts`.

### Décisions laissées à l'implémentation

- **La forme exacte de `sections()`** : tableau de sections, ou trois `computed()` distincts. *Recommandation : un tableau — il rend le `@for` du template trivial et l'ordre explicite.*
- **Le gabarit des libellés d'imminence** (« dans 5 j », « dans 3 sem. », « ce soir »). *La planche montre les deux premiers ; le palier imminent doit être humain (AC11).*
- **Le rendu d'une inscription non ouvrable** : `<li>` nu, ou `<div>` avec `role="listitem"`. *Recommandation : `<li>` — la liste reste une liste.*
- **Le nom des classes SCSS** — suivre le préfixe `agenda-` existant.
- **Où figer `today`** : un `signal(new Date())` dans `CalendarView` passé en `input`, ou dans le composant d'agenda. *Recommandation : dans `CalendarView`, comme `Dashboard.countdownNow` — une seule source pour l'écran.*

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4.0.8, TypeScript 6.0.2. `@if` / `@for`, signals, `input()` / `output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **`BreakpointObserver`** vient de `@angular/cdk/layout`, déjà installé et déjà utilisé — aucune dépendance nouvelle.
- **Aucune dépendance, aucune migration, aucun changement d'API.**
- **Exécution : tout par Docker** — `docker compose exec web pnpm <…>`. Jamais d'outil Node sur l'hôte.
- **Context7 (MCP)** avant d'écrire du code framework-spécifique — en particulier pour `BreakpointObserver` + `toSignal` en Angular 22.
- `packages/shared` **n'est pas** modifié ⇒ `pnpm typecheck` API non requis (mais web oui).

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau, ni serveur ni client.**

- Cette story n'écrit **rien**. Elle ne crée aucune mutation, donc aucun `partieTopic()` ni `notifyPartieSignalsChanged()` à émettre.
- Côté client, l'Agenda dérive de `agendaEntries()` ← `allCalendarEntries()` ← `scenarios()` / `activePolls()` / `meCalendar()` / `declarations()`. Ces signaux sont **déjà** rebranchés sur `scenariosSvc.changed()` par l'`effect()` de `calendar-view.ts:973`. Une réponse de vote d'un autre membre recompose donc les sections **sans code supplémentaire** — à vérifier de visu (tâche 11).
- Écarts SSE **existants et inchangés**, déjà consignés : `heatmap` non câblée, `GET /me/calendar` non câblé (`deferred-work.md`). Cette story ne les aggrave pas — elle **retire** au contraire la couche `disponibilite-groupe` de la liste.

[Source: `CLAUDE.md` ; `docs/checklist.md`]

### Sécurité

Story de rendu pur, mais l'épic reste sous obligation.

- 🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`) et **en dette depuis la 36.4**.
- **Aucune donnée nouvelle n'est exposée.** Toutes les entrées rendues le sont déjà aujourd'hui par la même liste ; la story en **retire** trois types.
- **XSS** : les titres de scénario, noms de partie et informations pratiques (`lieu`, `notePratique`) sont du texte libre saisi par le MJ. Ils sont rendus par **interpolation `{{ }}`**, jamais `[innerHTML]`, jamais `bypassSecurityTrust*`. La règle vaut aussi pour les `aria-label` composés.
- **Aucune identité ne fuit** : le calendrier personnel agrège plusieurs parties et sa charge utile est **anonyme par conception** (`MyCalendarPollOption`, `shared:662-667`). Ne rien y ajouter, ne rien y recomposer.
- **Autorisation** : inchangée. La navigation ouvre `/parties/:id/scenarios/:sid`, route déjà gardée côté serveur ; le front ne devient pas la garde.
- **`compteRenduManquant` est un booléen dérivé côté client** d'un champ déjà servi et déjà rendu ailleurs — il n'expose pas le contenu du compte-rendu.

### Dette refermée par cette story

- **La vue Agenda « liste de texte que personne n'a envie de lire »** (`prd.md:360`) — motif de FR-56.
- **Les inscriptions ouvertes sans foyer** : un interrupteur de grille qui ne pouvait rien produire à l'écran (`prd.md:305`, `EXPERIENCE.md:233`). **D-13 est refermée.**
- **La Destinée sans effet en vue Agenda** (`deferred-work.md:21`) — tranchée par D-3.
- **La divergence « une ligne d'agenda par option »** (`deferred-work.md:55`) devient sans objet : la planche groupait les options d'un vote en une ligne pour une liste plate ; les sections rendent la question caduque, chaque option restant une ligne avec sa piste.

### Dette explicitement NON refermée

- ⚠️ **« C'est passé » vide en contexte personnel** (encadré n°2) — demande `compteRendu` sur `MyCalendarSeanceEntry` **et** une plage élargie. **À consigner.**
- ⚠️ **Une inscription ouverte du calendrier personnel n'est pas ouvrable** : `MyCalendarOpenInscriptionEntry` ne porte pas de `scenarioId` (`shared:701-710`). Un champ, côté serveur — hors périmètre « Front ».
- ⚠️ **« Vote en attente » vs « Réponds au vote »** : incohérence de registre entre le dashboard et le contrat UX, laissée à la 35.2/35.3.
- **La liste Agenda non bornée** (`deferred-work.md:74`, aggravée par l'éclatement par option de la 36.6).
- **« Sceller ce créneau » depuis la barre de sélection** — toujours sans story porteuse.
- ⚠️ **Les valeurs de démonstration écrites en base de développement par la 36.5** sont toujours présentes.
- ⚠️ **La vérification visuelle du panneau réduit de la 36.9** reste due.
- Les autres entrées de `deferred-work.md` : `heatmap` sans SSE, `GET /me/calendar` sans SSE, `.seance-dot`, « Soirée » / « Soir », arrondi des trois segments de piste, budget de bundle web, `loading` du rail sans `slotsLoading`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md:2376-2414`] — les sept AC, verbatim · [`:1909, 1927`] — FR-56, portée « Front » · [`:335`] — `/security-review` non optionnel · [`:1938`] — révision 3 de la planche.
- [Source: `prds/prd-jdr-master-2026-08-01/prd.md:359-364`] — FR-56 · [`:305`] — la clé reste, l'interrupteur part · [`:476`] — Q-19 close · [`:481`] — Q-25, ce qui bloque la 36.12.
- [Source: `ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:332-361`] — §4.4 bis, les trois sections · [`:128`] — libellés d'imminence humains · [`:208, 233`] — les couches, les inscriptions · [`:450-454`] — états dépendants du lecteur, les deux libellés · [`:571, 585`] — activer une ligne ouvre le scénario · [`:688`] — défaut mobile.
- [Source: `ux-designs/ux-jdr-master-2026-08-04/DESIGN.md:171-203`] — §7.1 StatusBadge, les trois paliers d'imminence, la couleur du texte.
- [Source: `ux-designs/…/mockups/contrat-ui-calendrier.html:323-356`] — planche 3, l'Agenda joueur · [`:517-585`] — planche 6, mobile · [`:353`] — « remplace intégralement » · [`:583`] — défaut mobile.
- [Source: `apps/web/.../calendar-agenda-view/calendar-agenda-view.ts:14-72, 102-147`] — `AgendaEntry`, `sortedEntries`, `onVoteActivate`.
- [Source: `apps/web/.../calendar-view/calendar-view.ts:180, 194-198, 321-536, 520-535, 962, 1183, 1340-1344`] — `view`, `availableLayerKeys`, `allCalendarEntries`, `agendaEntries`, la plage, `onScenarioActivated`, `onViewChange`.
- [Source: `apps/web/.../calendar-view/calendar-view.html:14-57, 98-133`] — barre de contrôles, bascule de vue, blocs masqués en Agenda.
- [Source: `apps/web/.../day-detail.utils.ts:34, 308`] — `RailTarget`, `composeSeanceInfo` · [`poll-track.utils.ts:98-160`] — compteurs et libellés de participation.
- [Source: `apps/web/.../shared/list-control-bar/list-control-bar.ts:31-58`, `features/parties/partie-detail/partie-detail.ts:121-126`] — le patron `BreakpointObserver` + valeur initiale synchrone.
- [Source: `apps/web/.../features/dashboard/dashboard.ts:193-230, 282-335`, `dashboard.scss:86-95, 190-225`] — le patron sections/teintes/badges déjà en place.
- [Source: `apps/web/src/styles.scss:83-86, 148-151, 210-213`] — `--jdr-status-*`, les trois thèmes.
- [Source: `packages/shared/src/index.ts:37-50, 356-379, 645-722`] — couches, `SeanceDto`, DTO du calendrier personnel.
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md:21, 54-57, 61, 72-74`] — Destinée en Agenda, liste non bornée, éclatement par option.
- [Source: `_bmad-output/implementation-artifacts/36-10-…md`, `36-9-…md`, `36-1-…md`] — pièges, patrons de mode, discipline de vérification visuelle.
- [Source: `_bmad-output/project-context.md`, `CLAUDE.md`, `docs/checklist.md`] — Docker, conventions, SSE, rappels de fin de palier.

---

## Questions pour l'utilisateur (elles ne bloquent pas l'implémentation)

1. **« C'est passé » sera vide sur `/profile/calendar`** (encadré n°2) : le calendrier personnel ne charge pas le passé et ne sait pas si un compte-rendu manque. La story livre la section **fonctionnelle en contexte de partie** et **absente** ailleurs. Acceptez-vous cette asymétrie, ou voulez-vous une story serveur de suite (deux champs et une plage) ?
2. **Les votes auxquels j'ai déjà répondu restent dans « Ça t'attend »** avec le badge « Vote en cours » (D-2), là où le tableau UX dit « votes ouverts **sans ma réponse** ». C'est ce que l'AC4 impose. **Confirmez-vous D-2 ?** (Sinon un vote répondu disparaîtrait, et on ne pourrait plus changer sa réponse depuis l'Agenda.)
3. **Mes disponibilités, mes indisponibilités et la disponibilité du groupe quittent la liste Agenda** (D-4). Elles restent lisibles dans les deux grilles et dans le rail. **Confirmez-vous ce retrait ?**
4. **Le contrôle Destinée est masqué en vue Agenda** (D-3), ce que `deferred-work.md` laissait à trancher ici. Préférez-vous le laisser visible mais inerte ?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, `bmad-dev-story`)

### Debug Log References

**Baseline (tâche 0, arbre propre, HEAD `ff64143`)** — web **110 fichiers / 2001 tests** verts · lint web **142 erreurs pré-existantes** · `git status` vide.

**Final** — web **111 fichiers / 2043 tests** verts (**+1 fichier, +42 tests**, aucune régression) · lint web **142** = baseline exactement (aucune erreur nouvelle) · **aucune migration**, **aucune dépendance**, **aucun fichier de `apps/api/` ni `packages/shared/`** (AC14, vérifié par `git status`).

*Pas de `pnpm typecheck` côté web : le script n'existe pas dans `apps/web/package.json` — c'est la compilation du bundle par `ng test` qui joue ce rôle, et elle est propre. Côté API il n'est pas requis, `packages/shared` n'étant pas modifié.*

**Deux échecs traversés, et ce qu'ils ont appris :**

1. 🚨 **9 tests de `calendar-view.spec.ts` sont tombés d'un coup** en ajoutant le défaut mobile. Cause : **jsdom répond `matches: false` à n'importe quelle media query**, donc tous les tests basculaient en vue Agenda et perdaient la grille, la barre de composition et le rail. Corrigé par un `BreakpointObserver` mocké **desktop par défaut** dans la fabrique du spec (même forme que `partie-detail.spec.ts`), avec une option `desktop: false` pour les trois tests qui veulent le téléphone. *À retenir pour toute story qui introduira un breakpoint dans un composant déjà testé.*
2. Un test d'intensité d'imminence supposait l'ordre d'insertion des fixtures ; c'est **l'ordre de la section** (date croissante) qui gouverne le DOM. Le test était faux, pas le code.

### Completion Notes List

**Ce qui est livré.** L'Agenda cesse d'être une `<ul>` triée par date et devient **trois sections rangées par ce qu'on attend du lecteur** — « Ça t'attend », « C'est programmé », « C'est passé » — **sans aucun jour en en-tête**, la date redevenant une propriété de la ligne. Chaque ligne porte un liseré de section, un titre, une méta (date · créneau · informations pratiques) et un **badge textuel**.

**Les décisions de la story, toutes tenues :**

- **D-1** — « C'est passé » = séance passée **dont le compte-rendu manque**, en contexte de partie seulement. `compteRenduManquant` est un booléen dérivé côté client de `SeanceDto.compteRendu`, renseigné **uniquement** dans la branche `if (pid)` d'`allCalendarEntries()`. `undefined` = « on ne sait pas » ⇒ pas de section ⇒ section absente. Vérifié à l'écran **et** par un test dédié.
- **D-2** — **tous** les votes ouverts restent dans « Ça t'attend », le badge distingue : « Réponds au vote » (`todo`) sans ma réponse, « Vote en cours » (`live`) une fois répondu. Vu à l'écran **sur des données réelles** : le seul vote répondu du jeu de développement porte bien le badge vert et se range **après** les non-répondus.
- **D-3** — le contrôle **Destinée est masqué en vue Agenda** sans que le mode soit réinitialisé (revenir au Mois le retrouve). Referme l'entrée `deferred-work.md` que la 36.9 avait explicitement laissée à cette story.
- **D-4** — `mes-disponibilites`, `mes-indisponibilites` et `disponibilite-groupe` **quittent la liste**. Retrait **à l'affichage** (`sectionIdFor` rend `null`), jamais dans `allCalendarEntries()`, dont dépendent le rail et les deux grilles. `<app-group-gauge>` et `TYPE_LABELS` disparaissent du composant plutôt que d'y rester en code mort (patron 36.9).
- **D-5** — défaut mobile au seuil `(min-width: 1024px)`, celui de `partie-detail` et `list-control-bar`. **Lu une seule fois, à l'initialisation du signal `view`** — aucun `effect()`, donc une rotation d'écran ne peut pas ramener l'Agenda de force (AC15).
- **D-6** — les badges sont des **libellés d'état, jamais des actions**. Aucun bouton « S'inscrire » n'a été créé : le chemin d'inscription reste la fiche de scénario.
- **D-7** — la logique testable vit dans `agenda-badge.utils.ts` (18 tests purs, sans TestBed).

**AC7, les trois pièges désamorcés.** L'interrupteur « inscriptions ouvertes » quitte la barre (`availableLayerKeys()`), mais **la clé reste** dans `CALENDAR_LAYER_KEYS` — la retirer casserait la validation `@IsIn` serveur de toute préférence déjà enregistrée — **l'écran Compte reste intact**, et **la section ignore désormais cette couche** : sans cela, une préférence héritée à `false` aurait masqué les inscriptions **sans plus aucun moyen de les rétablir**. Trois tests couvrent les trois points.

**AC12, la garde structurelle.** Une ligne ouvrable est un `<button>`, une ligne non ouvrable n'en est pas un — pas de `<button disabled>`. Et **une ligne de vote n'est jamais ouvrable** : elle contient déjà le bouton du sélecteur, et un bouton dans un bouton casse la navigation clavier. La garde ne décrit pas les données actuelles, elle les précède.

**Vérification visuelle réelle — faite, deux constats.**

Chrome MCP (session de test connectée), calendrier **personnel** et calendrier de **partie**, **trois thèmes**, sans **aucune écriture** en base : les séances datées absentes du jeu de développement ont été simulées **côté client uniquement** (mutation du signal `scenarios()` via `window.ng`, effacée au rechargement).

Vu et conforme : les trois sections dans l'ordre · aucun en-tête de jour · la barre à **4 chips** au lieu de 5 (personnel) et **5 au lieu de 6** (partie) · le contrôle Destinée absent · les **trois intensités d'imminence** nettement distinctes (badge plein « demain soir », teinté « dans 5 j », contour « dans 4 sem. ») · « Débriefer » en retrait · le **sélecteur de réponse s'ouvre bien depuis une ligne d'agenda**, ancré, avec « Retirer ma réponse » (aucune réponse posée) · une section vide absente · troncature de la méta correcte à 360 px, sans débordement.

1. 🚨 **Défaut d'accessibilité trouvé À LA MESURE, pas à l'œil.** Le badge `done` composé selon `DESIGN.md` (texte `--jdr-text-muted` sur 26 % de `--jdr-status-done`) tombe à **3,45:1** en Médiéval Steampunk — sous AA. Cause : `status-done` est **plus clair que la surface** dans les trois thèmes, donc le fond remonte vers le texte muet. Le fond passe à **12 %** : +0,6 point partout (3,95 / 5,44 / 5,71). ⚠️ Écart chiffré avec la planche, consigné, à répercuter par `bmad-ux`. **Reste dû, hors périmètre :** `--jdr-text-muted` du thème Steampunk plafonne à ~4,4:1 sur sa propre surface — c'est la **palette** qu'il faut corriger, pas ce badge.
2. **Défaut de style corrigé** : `.agenda-entry__title` portait `overflow:hidden; text-overflow:ellipsis` **sans `nowrap`** — combinaison inopérante. Le titre est l'identité de la ligne : il se **replie sur deux lignes**, comme la planche, avec `overflow-wrap: anywhere` pour le cas pathologique. Seule la méta est tronquée.

❌ **NON VU À L'ÉCRAN — le défaut mobile (AC6).** La largeur de vue du navigateur piloté est **figée à 1384 px** : `resize_window` change `outerWidth` sans jamais toucher `innerWidth`, donc `matchMedia('(min-width: 1024px)')` répond toujours `true`. Le comportement est couvert par **trois tests** (défaut mobile, défaut desktop, non-verrouillage AC15) et la **mise en page** de l'Agenda a été vérifiée en largeur téléphone (conteneur ramené à 360 px). Consigné dans `deferred-work.md` : **reste à confirmer sur un vrai téléphone**.

**Garde ajoutée hors AC, une ligne de test :** `theme-tone.service.spec.ts` vérifie désormais que les **neuf clés** de l'Agenda existent et sont non vides dans les **trois** thèmes — le piège n°12 de la 36.9 (« une clé posée dans un seul thème rend `undefined` dans les deux autres ») ne peut plus passer inaperçu, aucun test de composant ne tournant hors du thème par défaut.

**Ce qui reste dû, non négociable :** ❌ **`/security-review`** est **non optionnel sur cet épic** (`epics.md:335`) et **en dette depuis la 36.4**. ❌ **`/code-review`** des stories **36-8**, **36-10** et de celle-ci restent à lancer.

**Les quatre questions de la story restent posées** (elles n'ont pas bloqué l'implémentation) : l'asymétrie de « C'est passé », D-2, D-4 et D-3.

**Revue de code (2026-08-24, 2 passes) : 6 patch tous corrigés, 2 defer supplémentaires, 9 rejetés comme bruit.** Corrigés : année ajoutée à `AGENDA_DATE_FORMAT` (« C'est passé »/« C'est programmé » n'ont pas de borne de date, peuvent franchir une année) ; garde `!entry.date` explicite avant le libellé « sans date » (le littéral en dur lui-même avait déjà été corrigé par la 36.12) ; règles `.agenda-section--done` explicites (ne tenaient qu'au repli CSS de base) ; `imminenceLabel()` passé de `Math.round` à `Math.floor` (la transition « 2 sem. »→« 3 sem. » avait lieu au jour 18 au lieu de 21) ; branche `votes-en-cours` de `metaLine()` documentée comme filet plutôt que laissée sans explication. **Un verdict de la 1ère passe (2026-08-23) était erroné** : `badgeFor` affichant « Réponds au vote » sans participation servie avait été classé « non atteignable » à tort (le cas existe bel et bien via `servedAggregates`) — mais s'est trouvé **déjà résolu entre-temps par la story 36.12**, qui applique le même principe de dégradation honnête ; aucun changement de code n'a donc été nécessaire ici, seule la story a été mise à jour pour corriger le verdict. Post-patch : web 115/2210 (+1 test), lint 142 = baseline exactement.

### File List

**Nouveaux :**

- `apps/web/src/app/features/calendar/agenda-badge.utils.ts`
- `apps/web/src/app/features/calendar/agenda-badge.utils.spec.ts`

**Modifiés :**

- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.html`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/core/theme/theme-tone.service.spec.ts`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/36-11-la-vue-agenda-refondue.md`

### Change Log

**2026-08-22 — Story 36.11 « La vue Agenda refondue » implémentée (FR-56).** L'Agenda passe d'une liste plate triée par date à **trois sections rangées par ce qu'on attend du lecteur**, sans aucun jour en en-tête ; chaque ligne porte sa date, ses informations pratiques et un badge d'état thématisé, l'imminence d'une séance étant rendue en **trois intensités d'une seule teinte**. Une ligne portant une séance ouvre **le scénario** qui la porte, via la navigation déjà livrée par le rail. L'interrupteur « inscriptions ouvertes » quitte la barre de contrôles, **sa clé et sa préférence de compte survivant intactes**. L'Agenda devient la vue par défaut sur téléphone, **sans verrouiller** le choix de l'utilisateur. Le contrôle Destinée est masqué en vue Agenda (dette `deferred-work.md` refermée). **Front pur : aucun changement serveur, aucune migration, aucun appel réseau nouveau.** Web 111 fichiers / 2043 tests verts (baseline 110/2001), lint 142 = baseline.
