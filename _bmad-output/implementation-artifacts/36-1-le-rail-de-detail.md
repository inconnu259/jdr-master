---
baseline_commit: 205cbfc9014d540b2c02bd25c53bfa45f2af0b8f
---

# Story 36.1 : Le rail de détail

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · Première story de l'épic · **Front pur**

---

## Story

As a **utilisateur**,
I want **lire le détail complet d'un jour sans quitter la grille**,
so that **l'étroitesse d'une case ne me prive pas de l'information**.

*Placée **avant** la refonte de la case (36.2), délibérément : le rail se construit sur la grille telle qu'elle existe aujourd'hui, il est utile dès sa livraison, et il évite que la story suivante ne rende la vue mois muette sur téléphone entre deux livraisons.* [Source: epics.md:1944]

---

## 🚨 Encadré n°1 — Le rail est un **consommateur passif**, et le seul chemin de clic existant ouvre déjà un formulaire

Le principe d'arbitrage n°2 de la spine UX est la clé de toute cette story :

> « **Le rail suit, il ne se commande pas.** Aucun geste n'est dépensé à « ouvrir le détail » : le rail reflète la dernière case touchée, **quelle que soit la raison du toucher**. Un consommateur passif ne peut pas entrer en conflit. » [Source: EXPERIENCE.md:536]

**Le piège concret.** Il n'existe aujourd'hui **qu'un seul** point d'entrée « j'ai touché un jour/créneau » dans `CalendarView` :

```ts
// calendar-view.ts:507-513
protected onSlotSelected(event: SlotSelectedEvent): void {
  this.selectedDate.set(event.date);
  this.selectedSlot.set(event.slot);
  this.selectedExisting.set(this.findMatchingDeclaration(event.date, event.slot));
  this.panelOpen.set(true);          // ← ouvre le ConstraintPanel
}
```

Ce handler est branché sur `(slotSelected)` des **deux** vues (`calendar-view.html:37`, `:49`) et ouvre systématiquement le panneau d'édition. Les signaux `selectedDate`/`selectedSlot` (`calendar-view.ts:169-170`) lui appartiennent : ils sont **liés au cycle de vie de `panelOpen`** et remis à zéro par `closePanel()`.

**Conséquences non négociables :**

1. **Le rail a son propre état** — un signal distinct (`railDate` + `railSlot`), jamais `selectedDate`/`selectedSlot`. Les réutiliser ferait disparaître le contenu du rail à chaque fermeture du panneau.
2. **`onSlotSelected` alimente le rail en plus, sans rien changer d'autre.** Il continue d'ouvrir `ConstraintPanel` exactement comme aujourd'hui. Aucun nouveau geste, aucun nouvel écouteur de clic sur la grille, aucun output supplémentaire sur les vues Mois/Semaine.
3. **Le rail ne se ferme jamais.** Pas de bouton, pas de `railOpen`, pas de `@if` conditionnant sa présence à un état utilisateur. Il est structurellement toujours là. [Source: EXPERIENCE.md:699 ; contrat-ui-calendrier.html:576 (annotation 28)]
4. **Le tap sur une bande vide sélectionne — il n'ouvre pas le détail.** La table de collisions le tranche explicitement : « Tap sur une bande vide → **Sélectionner.** Le détail n'a pas de geste — principe 2 ». [Source: EXPERIENCE.md:592]

**Passif ne veut pas dire inerte.** Aucun geste ne *commande* le rail — mais **ses lignes sont cliquables** : taper une ligne qui porte une séance ouvre **le scénario** qui la porte (AC11, décision utilisateur du 2026-08-17). La distinction est nette : rien n'ouvre *le rail* ; le rail, lui, nomme une chose et ouvre le niveau au-dessus.

---

## 🚨 Encadré n°2 — **Zéro appel réseau.** Tout ce que le rail affiche est déjà chargé, et déjà dérivé

`agendaEntries()` (`calendar-view.ts:242-352`) fait **déjà exactement le travail d'agrégation** dont le rail a besoin : elle mappe chaque couche vers une entrée `{type, date, label, detail}`, avec **deux chemins d'alimentation distincts** selon la présence de `partieId()`.

| Couche | Contexte de **partie** (`partieId()` renseigné) | Contexte **personnel** (`profile/calendar`) |
| --- | --- | --- |
| `mes-seances` | `scenarios()` → `poll.chosenDate ?? inscription.dateValidee`, créneau = `poll.chosenSlot` (l. 247-261) | `meCalendar()['mes-seances']` (l. 302-312) |
| `votes-en-cours` | `activePolls()`, dérivé de `scenarios()` (l. 262-275) | `meCalendar()['votes-en-cours']` (l. 313-324) |
| `inscriptions-ouvertes` | `openInscriptionSeances()` — **`date` toujours `''`** (l. 276-286) | `meCalendar()[…]` — idem sans date (l. 325-335) |
| `disponibilite-groupe` | `heatmap()` (`AggregatedSlotDto[]`) (l. 287-298) | **jamais** — absente de `MeCalendarDto` par conception (AD-16) |
| `mes-disponibilites` / `mes-indisponibilites` | `visibleDeclarations()` (l. 339-349) | idem |

**Le rail se dérive de ces mêmes sources, en `computed()`, et n'émet aucun appel.** C'est un invariant d'architecture, pas une optimisation :

- **AD-18** — « un endpoint, pas un par couche » ; `GET /me/calendar` est l'appel unique du calendrier personnel. [Source: ARCHITECTURE-SPINE.md:187-194]
- **AD-3** — principe anti-fan-out : « un appel unique, jamais un appel par partie ». Le projet a connu **deux bugs de production** dus à ce type de rafale (`429`, listes vidées). [Source: ARCHITECTURE-SPINE.md:77-82 ; prd.md:143]
- Précédent immédiat : la Story 30.6 a livré son AC9 « **zéro appel réseau supplémentaire en contexte de partie** ».

**Ne pas réécrire la dérivation.** `agendaEntries()` existe et est testée. Le travail consiste à en **extraire une fonction pure réutilisable** qui produit le détail d'**un** jour, pas à construire un second pipeline en parallèle — ce serait exactement la duplication que l'épic 36 combat (`epics.md:339` : « Les séparer produirait le cas fautif du découpage par couches techniques »).

**Deux trous réels à combler** dans `AgendaEntry` (`calendar-agenda-view.ts:16-25`) — les seuls éléments véritablement neufs de cette story côté données :

1. **Le créneau n'est pas typé.** Il vit dans `detail?: string`, en texte libre, pas en `DaySlot` exploitable. Le rail a besoin d'un regroupement `date → { MORNING, AFTERNOON, EVENING }`.
2. **Aucun identifiant navigable.** L'interface ne porte que `key`/`type`/`date`/`label`/`detail` — ni `partieId`, ni `scenarioId`, ni `seanceId`. L'AC11 (ouvrir la séance) les exige. Les deux sources les possèdent déjà : `MyCalendarSeanceEntry` en contexte personnel, `scenarios()` en contexte de partie.

Dans les deux cas : **champs additifs sur un type existant**, jamais un type parallèle.

---

## 🚨 Encadré n°3 — ⚠️ Trois écarts assumés au contrat d'UI, et pourquoi

Rappel de la convention de l'épic : *« `contrat-ui-calendrier.html` décrit **l'état d'arrivée de l'épic**, pas celui de chaque story. […] Le ⚠️ signale une story qui s'écarte de la cible finale, ou qui modifie un comportement déjà livré. »* [Source: epics.md:1917-1921]

### ⚠️ Écart 1 — Le rail est permanent dans les **deux** vues, à **toutes** les largeurs

L'AC1 d'`epics.md` dit « la vue mois **ou** la vue semaine → un rail visible **en permanence** ». La spine UX §9, elle, n'attribue le rail qu'à la vue **Semaine en portrait < 500 px** et écrit « **Aucun** — tout est dans la cellule » au-delà ; le contrat ne dessine **aucun rail** en Semaine desktop. [Source: EXPERIENCE.md:694-697 ; contrat-ui-calendrier.html:283-314, annotation 27 l. 575]

**Décision : on suit `epics.md`. ✅ Confirmé par l'utilisateur le 2026-08-17** — « on peut avoir le rail en desktop aussi, on pourra mettre plus d'info comme ça ». Le rail desktop n'est donc pas une tolérance : c'est **l'endroit où l'information est la plus riche**, la largeur disponible servant à déplier les accessoires plutôt qu'à les replier (voir Task 5).

Motifs techniques concordants :
- le contrat **dessine bien un rail en vue Mois desktop** (`contrat-ui-calendrier.html:259-264`) — la table §9 d'`EXPERIENCE.md` ne parle que de la Semaine et ne couvre donc pas le Mois ;
- la story **36.13** reformule elle-même le masquage en « le rail **devient inutile** » (`epics.md:2452`), pas « disparaît » — et le seuil exact reste **Q-24, ouverte, à caler sur un téléphone réel** (`prd.md:481`) ;
- livrer un rail conditionnel à un seuil non tranché ferait porter à 36.1 une décision qui appartient à 36.13.

**Conséquence : aucune media query de masquage du rail dans cette story.** 36.13 posera le seuil et décidera de l'escamotage.

### ⚠️ Écart 2 — En vue Semaine, le rail détaille le **jour**, pas seulement le créneau touché

Le contrat scope le rail Semaine au créneau : libellé « Jeudi 20 août — **soir** », **une seule ligne**, colonne de créneau supprimée (`contrat-ui-calendrier.html:564-567`). L'AC2 d'`epics.md` exige « il nomme **ses trois créneaux** et ce que chacun porte ».

**Décision : trois créneaux dans les deux vues, et le libellé nomme en plus le créneau touché en vue Semaine** (« Jeudi 20 août — soir »), la ligne correspondante étant mise en avant. Cela satisfait l'AC2 à la lettre **et** conserve l'apport du contrat (savoir quel créneau on a touché), sans les opposer.

### ⚠️ Écart 3 — Les trois créneaux sont **toujours** listés, y compris vides

Le rendu Mois mobile du contrat n'affiche que **2 lignes sur 3**, omettant le créneau « Matin / Disponible » (`contrat-ui-calendrier.html:538-542`). L'AC4 exige au contraire qu'un jour sans rien « le dise explicitement plutôt que de rester vide ».

**Décision : les trois lignes sont toujours rendues, à toutes les largeurs.** Un créneau sans objet posé affiche son état de disponibilité (« Disponible », « Indisponible », « Rien de prévu ») — c'est précisément ce que l'AC4 demande, et l'omission mobile du contrat le contredirait.

✅ **Confirmé par l'utilisateur le 2026-08-17** : « Matin est important, il faut qu'il soit là aussi. » **Aucune largeur, aucun état, aucune couche éteinte ne peut faire disparaître une des trois lignes.** C'est un invariant de cette story, pas une préférence de rendu.

---

## Acceptance Criteria

**AC1 à AC4 : reprises verbatim d'`epics.md:1948-1964`.**

**AC1 — Given** la vue mois ou la vue semaine
**When** l'écran est affiché
**Then** un rail de détail est visible **en permanence** sous la grille
**And** il n'existe aucun geste pour l'ouvrir ou le fermer

**AC2 — Given** je touche une case, pour quelque raison que ce soit
**When** le toucher est enregistré
**Then** le rail affiche le jour touché
**And** il nomme ses trois créneaux et ce que chacun porte

**AC3 — Given** aucun toucher depuis l'ouverture de l'écran
**When** le rail se peuple
**Then** il montre le prochain jour portant quelque chose

**AC4 — Given** un jour sans rien
**When** il est touché
**Then** le rail le dit explicitement plutôt que de rester vide

**AC5 à AC10 : ajoutées ici pour combler des trous qui coûteraient une reprise.**

**AC5 — Given** le rail, dans l'un ou l'autre contexte
**When** il se peuple ou change de jour
**Then** **aucun appel réseau supplémentaire** n'est émis — il dérive exclusivement des signaux déjà chargés (`scenarios()`, `activePolls()`, `heatmap()`, `visibleDeclarations()`, `meCalendar()`)
**And** en particulier aucun appel à `getMyCalendar()`, `getAvailableSlots()` ou `getHeatmap()` n'est déclenché par un toucher de case (encadré n°2)

**AC6 — Given** la couche « mes séances confirmées » éteinte
**When** un créneau porte une séance
**Then** le **texte** de la séance disparaît du rail
**And** l'**indisponibilité** qui en découle demeure affichée — elle ne dépend d'aucun réglage
*(FR-50 : « Éteindre la couche « mes séances » retire le texte du créneau, jamais le fait d'être pris. » [Source: prd.md:322])*

**AC7 — Given** le calendrier **d'une partie**
**When** un créneau est rendu indisponible par une séance d'une **autre** partie
**Then** le rail dit l'indisponibilité **sans jamais nommer** cette séance, cette partie ni ce scénario
**And** dans le calendrier **personnel**, au contraire, la séance est nommée
*(AD-9 : les séances d'autres parties ne sont jamais exposées, elles sont converties à la lecture en indisponibilité anonyme. [Source: ARCHITECTURE-SPINE.md:119-126])*

**AC8 — Given** une ligne du rail
**When** elle est rendue
**Then** **aucune information n'est portée par la couleur seule** — l'état est écrit en toutes lettres (« Disponible », « Indisponible », « Rien de prévu ») ou porté par une icône légendée
*(P-1, invariant du palier. [Source: prd.md:49 ; EXPERIENCE.md:623])*

**AC9 — Given** le rail livré
**When** j'utilise la grille comme avant
**Then** le tap ouvre toujours le `ConstraintPanel` à l'identique
**And** la sélection par glissement, la sélection au clavier et l'écriture groupée (Stories 30.2/30.3) se comportent **exactement** comme avant
**And** aucune régression de saisie n'est introduite

**AC10 — Given** le rail change de contenu sans que j'aie déclenché d'action explicite de consultation
**When** il se repeuple
**Then** le changement est annoncé aux technologies d'assistance (région live discrète)
**And** le rail ne vole ni ne piège le focus, puisqu'il n'ouvre et ne ferme rien (encadré n°1)

**AC11 — Given** une ligne du rail qui porte une séance
**When** je la tape
**Then** **le scénario qui porte cette séance s'ouvre** — navigation vers `/parties/{partieId}/scenarios/{scenarioId}`
**And** la ligne se signale comme actionnable (élément focalisable, atteignable au clavier, curseur et traitement visuel distincts)

**Given** une ligne qui ne porte rien d'ouvrable — un créneau simplement « Disponible », « Indisponible » ou « Rien de prévu »
**When** elle est rendue
**Then** elle **n'est pas cliquable** et ne se présente pas comme telle
**And** aucune affordance morte n'est introduite

> **La règle, énoncée une fois pour toutes : le rail nomme une chose, et l'ouvre au niveau du dessus.**
> Une ligne de rail **décrit une séance** — son titre, son créneau, plus tard ses informations pratiques (36.5). L'activer **ouvre son contenant, le scénario**. Ce n'est pas un pis-aller faute de mieux : c'est le niveau qui porte réellement le contexte utile — la chronologie, les autres séances, le compte rendu.
> *(Décision utilisateur du 2026-08-17 : « le rail affiche les infos de la séance, et cliquer dessus affiche l'item juste au-dessus, donc le scénario. »)*
>
> Cette règle **précise** la formulation d'`EXPERIENCE.md:571` (« Ouvrir une séance | Tap sur sa bande, sa ligne d'agenda, **ou sa ligne de rail** »), qui laissait entendre l'existence d'un écran de séance. ⚠️ **Elle vaut aussi pour la story 36.11**, dont l'AC « je tape une entrée portant une séance → la séance s'ouvre » désigne la même cible.

---

## Tasks / Subtasks

### 1. Modèle de données du rail — fonction pure (AC2, AC4, AC5, AC6, AC7)

- [x] Créer `apps/web/src/app/features/calendar/day-detail.utils.ts` + `day-detail.utils.spec.ts` (patron `selection.utils.ts`, colocalisé à plat, testé **sans TestBed**).
- [x] Y définir et exporter les types du rail, p. ex. :
      `DaySlotDetail { slot: 'MORNING'|'AFTERNOON'|'EVENING'; status: SlotStatus; seanceLabel: string|null; pollLabel: string|null; }`
      et `DayDetail { date: string; slots: [DaySlotDetail, DaySlotDetail, DaySlotDetail]; isEmpty: boolean; }`.
- [x] Écrire la fonction pure `buildDayDetail(dateKey, entries: AgendaEntry[], declarations, activeLayers): DayDetail` — trois créneaux **toujours** présents, dans l'ordre matin → après-midi → soir.
- [x] **Ne pas réimplémenter la dérivation par couche** : la fonction consomme les `AgendaEntry` produits par `agendaEntries()` (encadré n°2).
- [x] Y appliquer la règle AC6 : la couche gouverne le **texte** (`seanceLabel`/`pollLabel` mis à `null`), jamais le `status` d'indisponibilité.
- [x] Y appliquer la règle AC7 : ne jamais construire de `seanceLabel` à partir d'une indisponibilité anonyme ; en contexte de partie, seules les séances de **cette** partie (issues de `scenarios()`) sont nommables.

### 2. Exposer le créneau dans les entrées agrégées (AC2)

- [x] `AgendaEntry.detail` porte aujourd'hui le créneau en **texte libre** — ajouter un champ typé (`slot?: DaySlot`) à l'interface de `calendar-agenda-view.ts:16-25`, renseigné aux points de construction d'`agendaEntries()` qui le connaissent déjà (l. 259, 310, 348).
- [x] Vérifier que `CalendarAgendaView` continue de rendre exactement comme avant (champ additif, aucun changement d'affichage attendu).
- [x] Traiter `FULL_DAY` comme « couvre les trois créneaux » en lecture, cohérent avec `compute-display-status.ts:30-33`.

### 3. Le composant `CalendarDetailRail` (AC1, AC2, AC4, AC8, AC10)

- [x] Créer `apps/web/src/app/features/calendar/calendar-detail-rail/` → `calendar-detail-rail.{ts,html,scss,spec.ts}`, sélecteur `app-calendar-detail-rail`, `standalone: true`, `styleUrl` au singulier (patron `calendar-layer-toggle`, `calendar-agenda-view`).
- [x] **Composant de rendu pur** : inputs signal-based `readonly detail = input<DayDetail | null>(null)`, `readonly touchedSlot = input<DaySlot | null>(null)`, `readonly loading = input(false)`. Aucun service injecté hors `ThemeToneService` si des libellés thématisés sont nécessaires.
- [x] Structure DOM alignée sur le contrat (`contrat-ui-calendrier.html:128-136`) : `.rail > .dl` (libellé du jour, capitales) + trois `.it`, chacun `.w` (icône `SlotIcon` + libellé de créneau) et `.v` (contenu, `<b>` pour le titre, `.m` pour l'accessoire atténué).
- [x] Icônes de créneau : SVG **inline**, soleil levant / soleil haut / croissant de lune, reprises telles quelles de `contrat-ui-calendrier.html:261-263`. Le mot « Matin »/« Après-midi »/« Soir » étant déjà dans `.w`, marquer les SVG `aria-hidden="true"` pour éviter la double annonce.
- [x] État vide (AC4) : les trois lignes restent rendues ; un créneau sans objet affiche son état en toutes lettres.
- [x] Région live (AC10) : `aria-live="polite"` sur le conteneur du rail, `aria-atomic` à évaluer.

### 4. Câblage dans `CalendarView` (AC1, AC2, AC3, AC9)

- [x] Ajouter deux signaux **distincts** de ceux du panneau : `railDate: signal<Date | null>(null)` et `railSlot: signal<DaySlot | null>(null)` — **jamais** `selectedDate`/`selectedSlot` (encadré n°1, piège n°1).
- [x] Dans `onSlotSelected` (`calendar-view.ts:507-513`) : poser `railDate`/`railSlot` **en plus** du comportement actuel, sans en retirer une ligne.
- [x] **Ne rien remettre à zéro dans `closePanel()`** (`calendar-view.ts:583-591`) — le rail survit à la fermeture du panneau.
- [x] `computed()` `railDetail()` : combine `agendaEntries()`, `visibleDeclarations()`, `activeLayers()` et `railDate() ?? nextMeaningfulDate()` via `buildDayDetail()`.
- [x] `computed()` `nextMeaningfulDate()` (AC3) — voir la définition arrêtée en Dev Notes.
- [x] Insérer `<app-calendar-detail-rail>` dans `calendar-view.html` **juste après le bloc `@if/@else if/@else` des trois vues et avant la fermeture de `.calendar-main`** (aujourd'hui entre les lignes 58 et 59), sous condition `@if (view() !== 'agenda')` — l'Agenda est lui-même une liste détaillée, le rail n'y a pas de sens.

### 4 bis. Ouvrir le scénario depuis la ligne de séance (AC11)

> **La cible est le scénario, pas la séance.** Le rail *décrit* la séance et *ouvre* le niveau au-dessus — voir la règle sous l'AC11.
>
> 🚨 **Constat d'analyse confirmant la cohérence de ce choix : il n'existe AUCUNE « fenêtre de séance » dans l'application.** Vérifié — aucun composant `SeanceDetail`, aucun dialogue de séance, aucune route de séance. Une séance n'a d'existence à l'écran **qu'à l'intérieur de son scénario** (`/parties/:id/scenarios/:scenarioId`, `app.routes.ts:73`), rendue par `SeanceList` au sein de `ScenarioTimeline`/`ScenarioEditor`. Le seul lien existant va d'ailleurs **dans l'autre sens** : `seance-list.ts:86` envoie le MJ *vers* le calendrier avec `?seanceId=`. La règle « ouvrir le niveau du dessus » est donc à la fois le choix produit **et** le seul chemin réel. **Ne créer aucun composant de détail de séance dans cette story.**

- [x] Rendre actionnable **uniquement** les lignes portant une séance : un `<button>` natif (ou un élément avec `role="button"` + `tabindex="0"` + gestion `keyup.enter`/`keyup.space`), jamais un `<div>` avec un simple `(click)`.
- [x] Libeller l'action pour ce qu'elle fait : le nom accessible doit annoncer l'ouverture du **scénario** (p. ex. « Ouvrir le scénario *Les Cendres d'Ashal* »), jamais « ouvrir la séance » — sans quoi la promesse faite au lecteur d'écran ne correspond pas à la destination.
- [x] Émettre un output depuis `CalendarDetailRail` (composant de rendu pur — il ne connaît ni `Router` ni routes) ; `CalendarView` porte la navigation. **Nommer l'output d'après la destination** (`scenarioActivated`, pas `seanceActivated`) pour que la règle survive à la relecture.
- [x] Dans `CalendarView`, naviguer vers `['/parties', partieId, 'scenarios', scenarioId]`. Les deux identifiants sont **déjà disponibles** dans les deux contextes : `MyCalendarSeanceEntry` porte `partieId`/`scenarioId`/`seanceId` en calendrier personnel ; `scenarios()` les porte en contexte de partie.
- [x] **Propager `scenarioId` (et `seanceId`) jusque dans le modèle du rail** — `AgendaEntry` ne porte aujourd'hui que `key`/`type`/`date`/`label`/`detail`, aucun identifiant navigable. C'est le second trou de données de cette story, après le créneau typé (Task 2).
- [x] Vérifier explicitement le cas AC7 : une indisponibilité dérivée d'une séance d'une **autre** partie n'expose ni nom ni identifiant — elle n'est donc **jamais** actionnable en contexte de partie.
- [x] Ne rendre actionnable aucune ligne de vote, de disponibilité ou d'état vide dans cette story (ouvrir un vote depuis le calendrier appartient à 36.7 / 36.9).

### 5. Style et thèmes (AC8, AC11)

- [x] `calendar-detail-rail.scss` : reprendre les valeurs du contrat (`border-radius:10px`, padding 8/12 px, `margin-top: 8px`, `.dl` 11 px capitales `letter-spacing:.07em`, `.w` 78 px, `.v` 12,5 px).
- [x] **N'utiliser que des tokens existants** : `--mat-sys-surface-container` (fond), `--jdr-text` / `--jdr-text-muted`, `--color-available` / `--color-unavailable` / `--color-unknown`, `--jdr-status-soon` (séance) / `--jdr-status-todo` (vote).
- [x] ⚠️ **Les `--sp1…--sp6` de la maquette n'existent pas dans `apps/web/src/styles.scss`** — ce sont des tokens locaux de maquette. Utiliser les valeurs en px, comme le reste du dossier calendrier.
- [x] **Ne jamais cibler un slug de thème** (`.theme-medieval-steampunk` etc.) : écrire contre les tokens, pour rester neutre au renommage de l'épic 35.
- [x] **Densité par largeur** (`--bp-tablet`, 768 px, seul seuil réellement utilisé par le dossier calendrier) : en dessous, `.w` réduit et libellé de créneau abrégeable (« Après-m. », `contrat-ui-calendrier.html:540`), accessoires `.m` repliés ; **au-dessus, le rail déplie au contraire tout ce qu'il a** — c'est l'endroit le plus riche de l'écran, pas une consolation mobile (décision utilisateur). **Jamais, à aucune largeur, une des trois lignes ne disparaît** (écart 3).
- [x] Ligne actionnable (AC11) : traitement visuel distinct (curseur, survol, focus visible) sans reposer sur la couleur seule.

### 6. Tests (AC1 à AC10)

- [x] `day-detail.utils.spec.ts` — sans TestBed : trois créneaux toujours présents ; `FULL_DAY` couvre les trois ; jour vide → `isEmpty` ; couche `mes-seances` éteinte → `seanceLabel === null` **et** `status` inchangé (AC6) ; indisponibilité anonyme jamais convertie en `seanceLabel` (AC7).
- [x] `calendar-detail-rail.spec.ts` — en-tête obligatoire `import '@angular/compiler';` en toute première ligne, imports `vitest` explicites, `provideAnimationsAsync()`, `componentRef.setInput()` : rendu des **trois** lignes y compris en largeur étroite (AC4/écart 3), état vide libellé, libellé du jour, mise en avant du créneau touché, `aria-hidden` sur les SVG, `aria-live` présent ; ligne de séance actionnable au clic **et au clavier**, ligne sans séance **non** actionnable (AC11).
- [x] `calendar-view.spec.ts` — étendre les fabriques existantes (l. 33-175) : rail présent en Mois **et** en Semaine, absent en Agenda ; un `slotSelected` peuple le rail **et** ouvre toujours le panneau ; `closePanel()` ne vide pas le rail ; état de repos = prochain jour porteur ; **aucun appel supplémentaire** à `getMyCalendar`/`getHeatmap`/`getAvailableSlots` après un toucher (AC5, assertion sur les compteurs d'appels des mocks `vi.fn()`) ; activation d'une ligne de séance → `router.navigate(['/parties', partieId, 'scenarios', scenarioId])` (AC11, `provideRouter([])` déjà en place l. 127-175).
- [x] Non-régression explicite : les tests existants de `ConstraintPanel`, de la sélection par glissement et du clavier passent **inchangés** (AC9).

### 7. Vérification

- [x] `docker compose exec web pnpm test` — aucune régression, baseline ci-dessous.
- [x] `docker compose exec web pnpm lint` — aucune erreur nouvelle (3 erreurs pré-existantes connues, à confirmer via `git stash`).
- [x] `docker compose exec web pnpm build` — le **seul** échec admis est le budget de bundle pré-existant (constant depuis 29.4) ; mesurer le delta des deux côtés via `git stash`.
- [x] Vérification visuelle réelle sur les **trois thèmes** et en largeur mobile. **Si l'extension Chrome n'est pas connectée dans l'environnement, le dire explicitement plutôt que de l'omettre** — cette story est à 100 % visuelle, une validation uniquement automatisée est un résultat partiel, pas un succès.

### Review Findings

*Revue de code adversariale (bmad-code-review, 2026-08-17) — trois couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor) sur le diff des changements non commités (10 fichiers, +1347/-91). 16 signaux bruts remontés, dédupliqués et triés : 6 patch, 3 defer, 7 dismiss après vérification directe dans le code.*

- [x] [Review][Patch] Bordures codées en dur au lieu des tokens du projet [calendar-detail-rail.scss:110,131] — remplacées par `var(--mat-sys-outline-variant, #ccc)`, alignées sur le reste de `features/calendar/**`.
- [x] [Review][Patch] Sélecteur CSS `.it:first-of-type` ne peut jamais matcher [calendar-detail-rail.scss:~133] — remplacé par `.it:first-child`, qui matche réellement la première ligne du groupe.
- [x] [Review][Patch] `railDateKey` (état de repos, AC3) dérive de `agendaEntries()` (liste filtrée par couches actives) au lieu de `allCalendarEntries()` (liste complète) [calendar-view.ts:~390] — corrigé, `railDateKey` dérive désormais de `allCalendarEntries()`.
- [x] [Review][Patch] Doublon de séance/vote sur le même jour/créneau silencieusement écarté [day-detail.utils.ts, `buildDayDetail`] — corrigé, indicateur textuel « (+1 autre) » ajouté au libellé (`seanceLabel`/`pollLabel`) quand plusieurs entrées partagent le même jour/créneau, tests dédiés ajoutés.
- [x] [Review][Patch] `RailSlot` retype manuellement un sous-ensemble de `DaySlot` [day-detail.utils.ts:~1432] — corrigé, `RailSlot = Exclude<DaySlot, 'FULL_DAY'>`.
- [x] [Review][Patch] `SLOT_NAMES: Record<string, string>` au lieu de `Record<RailSlot, string>` [calendar-detail-rail.ts:486] — corrigé, `SLOT_NAMES: Record<RailSlot, string>`.

- [x] [Review][Defer] Vote actif masqué quand un créneau porte déjà une séance [calendar-detail-rail.html:39-48] — deferred, chaîne `@if/@else if` mutuellement exclusive ; aucun AC ne couvre ce cas, comportement plausible (une séance confirmée prime sur un vote concurrent) mais non tranché formellement.
- [x] [Review][Defer] Indicateur `loading` du rail omet `slotsLoading` (rafraîchissement heatmap en contexte MJ/partie) [calendar-view.html:568] — deferred, pré-existant : binding `loading() || meCalendarLoading()` identique à celui, non modifié par ce diff, de la vue Agenda (calendar-view.html:557).
- [x] [Review][Defer] Couverture de test insuffisante pour le scénario concret AC7 (indisponibilité anonyme dérivée d'une séance d'une autre partie) [calendar-view.spec.ts] — deferred, l'architecture est structurellement correcte (`scenarios()` scopé à la partie courante empêche toute fuite), mais aucun test ne construit directement le cas « créneau UNAVAILABLE sans nom ni id ».



Ces éléments sont **dessinés dans le contrat d'UI ou exigés par la spine**, mais appartiennent à d'autres stories. Les livrer ici serait du dépassement de périmètre.

- **Les informations pratiques d'une séance** (« · chez Marc, 20 h 30 », `contrat-ui-calendrier.html:263`) → **Story 36.5 / dérogation D-15**. Le champ **n'existe pas encore côté serveur** : il est structurellement impossible de l'afficher ici. Le rail doit prévoir l'emplacement (`.m`) sans rien y mettre.
- **Les noms du groupe et leur statut dans le rail** (`EXPERIENCE.md:306`, `DESIGN.md:348`, CSS `.who` défini mais jamais instancié) → **Story 36.8**.
- **Le compteur de participation « 3 / 4 »** (`DESIGN.md:335`) → **Story 36.6 / dérogation D-17**.
- **Ouvrir un vote, y répondre, ou sceller un créneau depuis le rail** → Stories 36.7 et 36.9. Seules les lignes portant une **séance** sont actionnables ici (AC11).
- **Créer un composant de détail de séance** — il n'en existe aucun et cette story n'en crée pas : elle navigue vers l'écran de scénario existant (Task 4 bis).
- **La case du mois en trois bandes, la préséance, le retrait des pastilles `seance-dot`/`guild-dot` et de la réglette de segments** → **Story 36.2**. Le rail se construit sur la grille **telle qu'elle est aujourd'hui**.
- **La sélection comme geste de déclaration et la barre de portée** → **Story 36.3**.
- **Le seuil de densité de la vue Semaine (Q-24, ≈ 500 px) et l'escamotage du rail** → **Story 36.13**.
- **La refonte de la vue Agenda en trois sections** → **Story 36.11**.
- **Toute modification serveur** — story front pure, aucun fichier `apps/api/**`, aucun ajout dans `packages/shared`.

---

## Ce qui doit continuer de fonctionner

- **`ConstraintPanel` et le tap unitaire** — `onSlotSelected` conserve son comportement intégral. La story **ajoute** au handler, elle n'en retire rien.
- **La sélection par glissement, le clavier et l'écriture groupée** (Stories 30.2/30.3) — `selection.utils.ts`, `SelectionBar`, `onBatchDeclareRequested`, `createDeclarationBatch()` : intouchés.
- **Les algorithmes purs déjà testés** — `buildMonth()`, `buildWeek()`, `getWeekStart()`, `computeDisplayStatus()` : **signatures et corps inchangés**. Le rail se sert de leurs résultats, il ne les modifie pas (même discipline que 30.3, 30.5 et 30.6).
- **Les couches et la pastille d'écart au défaut** (Story 30.6) — `activeLayers`, `toggleLayer`, `isOverridden`, `resetToDefault` : lus, jamais écrits par le rail. **Aucun appel à `AccountService.updatePreferences()` depuis cet écran, jamais.**
- **Les pastilles existantes** (`seance-dot`, `guild-dot`) et la réglette de trois segments — conservées telles quelles ; leur retrait appartient à 36.2.
- **Le rafraîchissement temps réel existant** — les deux `effect()` de `calendar-view.ts:391-423` (sur `scenariosSvc.changed()` et `availabilitySvc.changed()`). Le rail étant un `computed()` sur les mêmes signaux, il en bénéficie **gratuitement**.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Réutiliser `selectedDate`/`selectedSlot` pour le rail.** Ces signaux appartiennent à `ConstraintPanel` et sont liés à `panelOpen`/`closePanel()`. Le rail se viderait à chaque fermeture du panneau. → Signaux dédiés (encadré n°1).
2. **Ajouter un geste, un bouton ou un output « ouvrir le détail ».** Le principe 2 l'interdit frontalement, et la table de collisions tranche déjà le cas du tap sur bande vide en faveur de la sélection. [Source: EXPERIENCE.md:536, :592]
3. **Émettre un appel réseau au toucher.** AD-18 et AD-3 l'interdisent ; deux bugs de production sont documentés sur ce motif exact. Le rail est un `computed()`, point. [Source: ARCHITECTURE-SPINE.md:77-82, :187-194 ; prd.md:143]
4. **Nommer une séance d'une autre partie dans le calendrier d'une partie.** AD-9 : ces séances arrivent en indisponibilité **anonyme** — les nommer serait une fuite de données inter-parties. Dans le calendrier personnel, l'inverse est vrai : elles sont légendées. [Source: ARCHITECTURE-SPINE.md:119-126]
5. **Faire dépendre l'indisponibilité d'une couche.** FR-50 est catégorique : éteindre « mes séances » retire le **texte**, jamais le **fait d'être pris**. Filtrer le libellé, pas le statut. [Source: prd.md:322]
6. **Confondre `mode` (`'personal' | 'mj'`) et présence de `partieId()`.** `guild-calendar` est en mode `'personal'` **mais porte un `partieId()`** : c'est un calendrier de partie. Seul `profile/calendar` est le calendrier personnel au sens d'AD-18. Piège hérité de la Story 30.6, à ne pas rejouer. [Source: app.routes.ts:44-45, 79]
7. **Modifier `buildMonth()`/`buildWeek()`/`computeDisplayStatus()`** pour leur apprendre la notion de rail. Ces fonctions pures sont testées et partagées ; le rail travaille en aval, sur `agendaEntries()`.
8. **Ouvrir une seconde connexion `RealtimeService`.** `calendar-view.ts:450-451` connecte déjà `partie:{id}` quand `partieId()` existe ; la checklist du projet interdit de dupliquer une connexion depuis un composant imbriqué. [Source: docs/checklist.md:29-33]
9. **Oublier que `ng test` type-vérifie aussi les specs.** Toute nouvelle fixture doit satisfaire les types **complets** (piège déjà rencontré en 30.4 sur `defaultCalendarLayers`, non-optionnel).
10. **Rendre le rail en vue Agenda.** L'Agenda est déjà une liste détaillée ; y ajouter un rail créerait le doublon que la revue de code de 30.6 a précisément fait corriger pour les panneaux MJ/joueur.

### Décisions arrêtées par cette story (non tranchées par les AC)

- **AC3 — définition de « un jour portant quelque chose »** : un jour porteur d'une **séance**, d'un **vote en cours** ou d'une **inscription ouverte datée** — c'est-à-dire une entrée d'`agendaEntries()` dont le `type` n'est **ni** `mes-disponibilites` **ni** `mes-indisponibilites`. Une déclaration de disponibilité est un **état**, pas un événement : elle ne fait pas d'un jour un jour « porteur ». (Les entrées `inscriptions-ouvertes` ont `date: ''` par conception et sont donc naturellement exclues d'une recherche par date.)
- **AC3 — portée de la recherche** : le prochain jour porteur **à partir d'aujourd'hui**, dans les données déjà chargées, sans borne haute artificielle. Si aucun jour porteur n'existe, le rail affiche **aujourd'hui** dans son état vide (AC4) — jamais un rail blanc.
- **Point ouvert n°11 de la spine** (« le rail de la Semaine suit-il la sélection multiple en cours, ou seulement la dernière case touchée ? », `EXPERIENCE.md:764`) : **tranché ici pour « la dernière case touchée »**, conformément au principe 2 (« le rail reflète la dernière case touchée »). Faire suivre une sélection multiple demanderait un rail multi-jours, hors AC. À rouvrir en 36.13 si l'usage le réclame.
- **Emplacement de l'état du rail** : signal local à `CalendarView`, pas de service dédié — la logique reste une projection, aucun autre écran ne la réutilise. Même arbitrage que celui retenu en 30.6 pour l'état des couches ; à réévaluer si 36.2/36.13 en ont besoin ailleurs.

### Décisions laissées à l'implémentation

- **Nom exact du composant et du fichier utilitaire** (`calendar-detail-rail` / `day-detail.utils.ts` sont des propositions ; la spine ne préempte que `core/calendar/calendar-layers.service.ts`).
- **Forme exacte de `DayDetail`** — le contrat impose la structure visuelle, pas la forme du type.
- **Mise en avant du créneau touché en vue Semaine** — classe CSS, poids typographique ou liséré : à caler à l'œil sur les trois thèmes. Le liséré `.bar` de 3 px teinté par le statut existe dans une maquette antérieure (`q20-gouttiere-et-paysage.html:78-80`) mais **n'a pas été repris par le contrat** ; le réintroduire serait cohérent avec P-1, à documenter si retenu.
- **`aria-atomic`** sur la région live — à évaluer à l'usage réel d'un lecteur d'écran.

### Notes de plateforme

- **Angular 22 zoneless, Vitest 4.** Versions épinglées : `@angular/core ^22.0.0`, `@angular/material ^22.0.2`, `vitest ^4.0.8`, `typescript ~6.0.2`, `jsdom ^28.0.0`. **Aucune dépendance nouvelle n'est nécessaire ni autorisée par cette story** — le rail est du DOM et du SVG inline.
- **Conventions obligatoires** : `@if`/`@for` et signals, jamais `*ngIf`/`*ngFor` (P1-AD-5) ; `input()`/`output()` signal-based, jamais `@Input()`/`@Output()` ; `import type` pour tout type de `@master-jdr/shared` (P1-AD-4) ; `standalone: true` explicite ; classe `PascalCase` **sans** suffixe `Component` ; fichiers **sans** suffixe `.component`.
- **Exécution** : tout par Docker (`docker compose exec web pnpm <…>`). Pas de script `typecheck` dédié côté web — `ng test`/`ng build` type-vérifient l'intégralité du code **et** des specs.
- **Baseline à confirmer avant de commencer** (après 30.6) : **web 100 fichiers, 1560 tests**. Build web en échec sur le **seul** budget de bundle pré-existant, constant depuis 29.4.
- **Story front-only** : aucune suite API attendue en régression, aucune raison de les relancer.

### Évaluation SSE (obligatoire, checklist projet)

La checklist exige une évaluation explicite à chaque ajout de composant affichant des données scopées à une Partie ou à l'utilisateur. [Source: CLAUDE.md:32-37 ; docs/checklist.md:25-46]

**Verdict : aucun câblage temps réel propre à ajouter.** Trois raisons :
1. Le rail est **imbriqué** dans un écran déjà connecté (`calendar-view.ts:450-451` ouvre `partie:{id}`) — ouvrir une seconde connexion violerait `docs/checklist.md:29-33`.
2. Le rail est un **`computed()` sur les mêmes signaux** que les grilles : il hérite gratuitement des deux `effect()` existants (`calendar-view.ts:391-423`).
3. **Dette héritée, non aggravée** : `GET /me/calendar` n'est rafraîchi par aucun signal temps réel (`AvailabilityService.changed()` est scopé à `partie:{id}`, jamais actif sur `profile/calendar`). Sur le calendrier personnel, le rail sera donc périmé jusqu'au rechargement — **exactement comme la grille l'est déjà**. Item déjà consigné dans `deferred-work.md`, à ne pas refermer ici sans AC.

### Project Structure Notes

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.{ts,html,scss,spec.ts}`
- `apps/web/src/app/features/calendar/day-detail.utils.ts` + `day-detail.utils.spec.ts`

**Modifiés — Web**
- `calendar-view/calendar-view.ts` — signaux `railDate`/`railSlot`, `railDetail()`, `nextMeaningfulDate()`, ajout dans `onSlotSelected`
- `calendar-view/calendar-view.html` — insertion du rail entre les lignes 58 et 59 (fin du bloc des vues, dans `.calendar-main`)
- `calendar-view/calendar-view.spec.ts`
- `calendar-agenda-view/calendar-agenda-view.ts` — champs **additifs** sur `AgendaEntry` : `slot?: DaySlot`, `partieId?`, `scenarioId?`, `seanceId?` (rendu inchangé)

**Non touchés (à confirmer par `git status` en fin d'implémentation)**
- `apps/api/**` en totalité · `packages/shared/**` · `computeSlotStatus`/`matchesDeclaration`/`buildMonth`/`buildWeek`/`getWeekStart`/`computeDisplayStatus` · `ConstraintPanel` · `selection.utils.ts`/`SelectionBar` · `calendar-layer-toggle` · `available-slots`/`creneau-card`/`aggregated-creneau-card` · `apps/web/src/app/features/account/**`

### References

- [Source: _bmad-output/planning-artifacts/epics.md:1938-1964] — Story 36.1 et ses 4 AC, verbatim (repris en AC1-AC4).
- [Source: _bmad-output/planning-artifacts/epics.md:1893-1936] — En-tête de l'épic 36, carte de couverture des FR, table de séquence, convention de lecture du contrat d'UI et règle du ⚠️.
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:313-318] — **FR-49** : préséance ; « l'information écartée par la préséance n'est pas perdue : elle reste atteignable […] dans le détail du créneau » — la charge fonctionnelle du rail.
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:320-325] — **FR-50** : séance lisible et bloquante quoi qu'il arrive (AC6) ; informations pratiques = D-15, hors périmètre ici.
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:341-345] — **FR-53** : « les noms dans le détail » — hors périmètre (36.8).
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:364-372] — **FR-57**, dont 36.1 porte la part « rail ».
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:45-57] — Principes transverses du palier : P-1 (jamais la couleur seule, AC8), P-2 (accessibilité en vigilance, **pas de seuil chiffré en AC**), P-3 (desktop et mobile à parité), P-4 (états vides au cas par cas, AC4).
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:143] — Exigence anti-fan-out et les deux bugs de production associés (AC5).
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:481] — **Q-24 ouverte** : seuil de densité ≈ 500 px, à trancher à l'implémentation de 36.13, pas ici.
- [Source: ARCHITECTURE-SPINE.md:119-126] — **AD-9** : séances d'autres parties jamais exposées, converties en indisponibilité anonyme (AC7).
- [Source: ARCHITECTURE-SPINE.md:169-175] — **AD-16** : couches relationnelles, `disponibilite-groupe` sans objet hors contexte de partie.
- [Source: ARCHITECTURE-SPINE.md:187-194] — **AD-18** : endpoint unique `/me/calendar` (AC5).
- [Source: ARCHITECTURE-SPINE.md:77-82] — **AD-3** : appel unique, principe anti-fan-out.
- [Source: ARCHITECTURE-SPINE.md:206-213] — **AD-20** : états dépendants du lecteur résolus côté client, aucun endpoint dédié — fonde la dérivation locale du rail.
- [Source: ARCHITECTURE-SPINE.md:434-453] — Source tree du front : `features/<domaine>/<composant>/`, quatre fichiers de même racine.
- ⚠️ [Source: ARCHITECTURE-SPINE.md:11] — La spine déclare `binds: [FR-1 … FR-48]` : **aucune AD ne couvre FR-49 à FR-57**. Le rail relève de la ligne « refontes d'écran → aucune AD dédiée, gouverné par les conventions » (l. 470).
- [Source: ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:536] — Principe d'arbitrage n°2, « le rail suit, il ne se commande pas » (encadré n°1).
- [Source: …/EXPERIENCE.md:570-571] — Consulter le détail = **aucun geste** ; la ligne de rail est un point d'ouverture d'une séance (hors périmètre ici).
- [Source: …/EXPERIENCE.md:592] — Collision n°2 : tap sur bande vide → sélectionner, pas ouvrir le détail.
- [Source: …/EXPERIENCE.md:694-699] — §9, table de densité et définition du rail ; ⚠️ écart 1 documenté en encadré n°3.
- [Source: …/EXPERIENCE.md:764] — Point ouvert n°11, tranché par cette story.
- [Source: …/EXPERIENCE.md:623] — « Aucune information n'est portée par la couleur seule » (AC8).
- [Source: …/DESIGN.md:356-362] — §7.10 `SlotIcon` : soleil levant / soleil haut / croissant, SVG inline, `stroke: text-muted`, libellé accessible explicite.
- [Source: …/DESIGN.md:335, :348] — Compteur « 3/4 » et « les noms vivent dans le rail » — **hors périmètre** (36.6, 36.8).
- [Source: …/mockups/contrat-ui-calendrier.html:128-141] — **CSS du rail, fait foi** : structure `.rail > .dl + .it{.w,.v}`, dimensions, `svg.ic`.
- [Source: …/mockups/contrat-ui-calendrier.html:259-264] — Instance Mois desktop : trois lignes, libellés exacts, SVG des trois créneaux à reprendre.
- [Source: …/mockups/contrat-ui-calendrier.html:538-542, :564-567] — Instances mobile et Semaine ; ⚠️ écarts 2 et 3 documentés en encadré n°3.
- [Source: …/mockups/contrat-ui-calendrier.html:226-234] — Engagement du contrat : « tout élément dessiné ici sera implémenté » + obligation de signaler tout écart par ⚠️.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:242-352] — `agendaEntries()`, les deux chemins d'alimentation, source unique du rail (encadré n°2).
- [Source: …/calendar-view.ts:507-513] — `onSlotSelected`, unique point d'entrée de clic, à étendre sans le modifier.
- [Source: …/calendar-view.ts:169-170, :583-591] — `selectedDate`/`selectedSlot` et `closePanel()` : **à ne pas réutiliser** (piège n°1).
- [Source: …/calendar-view.ts:391-423, :450-451] — Effets temps réel existants et connexion `partie:{id}` déjà ouverte (évaluation SSE).
- [Source: …/calendar-view.html:30-58] — Bloc des trois vues ; point d'insertion du rail juste après.
- [Source: …/calendar-week-view.ts:218-226] — `SLOT_ROWS` : la table des trois créneaux la plus complète du dossier (`protected`, donc non réutilisable en l'état — source d'inspiration, pas d'import).
- [Source: …/calendar-agenda-view.ts:16-25] — `AgendaEntry`, à étendre d'un `slot?: DaySlot` typé (Task 2).
- [Source: apps/web/src/app/app.routes.ts:73] — `parties/:id/scenarios/:scenarioId` → `ScenarioDetail` : **la cible de navigation de l'AC11**. Aucune route de séance n'existe.
- [Source: apps/web/src/app/features/scenarios/seance-list/seance-list.ts:86] — `goToCalendarForSeance()` : le seul lien séance ↔ calendrier existant, et il va **dans l'autre sens** (Story 8.7). Confirme qu'aucune fenêtre de séance n'est à réutiliser.
- [Source: apps/web/src/app/core/availability/compute-display-status.ts:30-33] — `FULL_DAY` couvre les trois créneaux en lecture.
- [Source: packages/shared/src/index.ts:461-462] — `DaySlot` ; **aucune constante runtime itérable des trois créneaux n'existe** — chaque composant redéfinit sa table de libellés.
- [Source: _bmad-output/implementation-artifacts/30-6-les-couches-a-lecran-et-la-vue-agenda.md] — Story précédente du calendrier : patrons de test, pièges de plateforme, baseline, discipline « ne pas toucher un algorithme testé ».
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Dette héritée : rafraîchissement temps réel de `GET /me/calendar`, liste Agenda non bornée.
- [Source: CLAUDE.md:32-37 ; docs/checklist.md:25-46] — Convention SSE du projet, évaluation obligatoire à chaque ajout.

---

## Décisions utilisateur actées le 2026-08-17

*Les trois points signalés à la création ont été tranchés par l'utilisateur. Ils sont consignés ici parce qu'ils touchent un contrat d'UI validé et devront être répercutés dans les planches.*

1. **⚠️ Rail permanent aux deux vues et à toutes les largeurs — desktop compris.** Tranché : *« on peut avoir le rail en desktop aussi, on pourra mettre plus d'info comme ça. »* Le rail desktop n'est pas une tolérance mais **la surface la plus riche** ; la largeur sert à déplier, pas à masquer. Écart assumé vis-à-vis d'`EXPERIENCE.md:697` et de l'annotation 27 du contrat (« le rail disparaît » ≥ 500 px). Le seuil de densité reste **Q-24**, propriété de la story 36.13.
2. **⚠️ Les trois créneaux sont toujours listés.** Tranché : *« Matin est important, il faut qu'il soit là aussi. »* Écart assumé vis-à-vis du rendu mobile du contrat (`contrat-ui-calendrier.html:538-542`, deux lignes sur trois). Invariant de la story.
3. **Le tap sur une ligne de rail ouvre le scénario — entré dans le périmètre (AC11).** Tranché : *« le rail affiche les infos de la séance, et cliquer dessus affiche l'item juste au-dessus, donc le scénario. C'est plus cohérent. »* Règle générale retenue : **le rail nomme une chose et ouvre son contenant.** Constat d'analyse concordant : aucune fenêtre de séance n'existe dans l'application, le scénario est le seul niveau qui porte réellement le contexte (chronologie, autres séances, compte rendu). ⚠️ Cette règle **précise `EXPERIENCE.md:571`** et s'applique aussi à la story **36.11**, dont l'AC vise la même cible.

**✅ Répercuté hors de cette story, le 2026-08-17 :**
- `EXPERIENCE.md` — §9 (table de densité + deux encadrés ⚠️), §6 bis table 2 (« Ouvrir le scénario qui porte une séance » + encadré de la règle générale), point ouvert 8 amendé, **point ouvert 11 clos**.
- `DESIGN.md` — **§7.10 bis `DetailRail` créée** (le composant n'avait aucune fiche dans le design system), §7.10 `SlotIcon` étendue au rail.
- `mockups/contrat-ui-calendrier.html` — **révision 3** : rail ajouté en Semaine desktop, les quatre rails portent trois créneaux, annotations 27/28 corrigées, 37/38 neuves.
- `epics.md` — AC de la story 36.1 précisées, **story 36.11 corrigée** (« la séance s'ouvre » → le scénario), **story 36.13 corrigée** (« le rail devient inutile » → le rail demeure), encadré de révision en tête d'épic.
- [`sprint-change-proposal-2026-08-17.md`](../planning-artifacts/sprint-change-proposal-2026-08-17.md) — analyse d'impact complète.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm test` — 102 fichiers, 1616 tests, tous verts.
- `docker compose exec web pnpm lint` — 143 erreurs, **identiques à la baseline** (mesurée par `git stash push -u` + lint + `git stash pop`).
- `docker compose exec web pnpm build` — échec sur le seul budget de bundle : 1,35 Mo en baseline → 1,36 Mo (delta +8,13 ko), mesuré des deux côtés par `git stash`.

### Completion Notes List

**Ce qui a été construit**

- `day-detail.utils.ts` — fonctions pures `buildDayDetail()` et `nextMeaningfulDate()`, plus les conversions de dates. Testées sans TestBed (patron `selection.utils.ts`). Aucune notion d'Angular, de HTTP ni de route.
- `CalendarDetailRail` — composant de rendu pur, inputs signal-based, structure DOM et valeurs reprises du contrat d'UI (`.rail > .dl + .it{.w,.v}`). Ne connaît ni `Router` ni service de données.
- `CalendarView` — signaux `railDate`/`railSlot` **dédiés**, `railDetail()` en `computed()`, navigation vers le scénario.
- `AgendaEntry` — quatre champs **additifs** (`slot`, `partieId`, `scenarioId`, `seanceId`), rendu de la vue Agenda inchangé.

**Décision d'implémentation — la dérivation a été dédoublée en amont, pas dupliquée.** `agendaEntries()` filtrait par couche pendant qu'elle dérivait. Or l'AC6 exige qu'une séance dont la couche est éteinte continue de rendre son créneau indisponible : lui passer des entrées déjà filtrées aurait fait disparaître l'indisponibilité en même temps que le titre. La dérivation a donc été extraite en `allCalendarEntries()` (non filtrée, privée), et `agendaEntries()` est devenue `allCalendarEntries().filter(e => active.has(e.type))`. Le filtre par type est strictement équivalent à l'ancien gating bloc par bloc, y compris pour les déclarations. Vérifié par les 60 tests existants de `calendar-view.spec.ts`, tous verts sans modification.

**Décision d'implémentation — le statut du rail.** Une séance présente force `UNAVAILABLE` **avant** tout appel à `computeDisplayStatus()` : l'indisponibilité dérivée d'une séance n'existe pas côté client dans `GET /availability` (elle n'est injectée que côté serveur, AD-9, pour `getAvailableSlots`/`getHeatmap`). Sans cette règle, éteindre la couche « mes séances » aurait affiché « Rien de prévu » sur un créneau où l'utilisateur est pris — l'inverse exact de FR-50.

**Décision d'implémentation — libellé du jour et créneau touché.** Le composant nomme le créneau touché dans son libellé (« Jeudi 20 août — soir ») dès que `touchedSlot` vaut autre chose que `FULL_DAY`. Il n'a donc **pas besoin de connaître la vue** : en vue Semaine la cellule est un créneau, en vue Mois un tap sur segment en désigne un aussi, et un tap sur le corps d'une case (`FULL_DAY`) n'en nomme aucun. Cela satisfait à la fois l'apport du contrat (savoir quel créneau on a touché) et l'AC2 (les trois créneaux restent listés).

**Décision d'implémentation — le rail est absent de la vue Agenda.** Aucun AC ne l'y demande, et la revue de code de la Story 30.6 avait déjà fait masquer les panneaux MJ/joueur en vue Agenda pour cause de doublon. Un rail sous une liste détaillée aurait reproduit exactement ce défaut.

**AC7 vérifié structurellement, pas seulement par filtrage.** En contexte de partie, `allCalendarEntries()` ne construit d'entrées `mes-seances` qu'à partir de `scenarios()`, qui ne contient que les scénarios de la partie consultée. Une séance d'une autre partie n'entre donc jamais dans le modèle du rail : elle n'existe que sous forme d'indisponibilité anonyme dérivée côté serveur. Test explicite ajouté.

**Évaluation SSE (checklist projet) — refaite, verdict inchangé : aucun câblage propre.** Le rail est un `computed()` sur les mêmes signaux que les grilles, dans un écran qui ouvre déjà sa connexion `partie:{id}` (`calendar-view.ts`). Il hérite des deux `effect()` existants. La dette connue sur `GET /me/calendar` (non rafraîchi par aucun signal temps réel sur `profile/calendar`) est **héritée et non aggravée** : le rail y sera périmé exactement comme la grille l'est déjà. Aucun AC ne l'exige, l'item reste dans `deferred-work.md`.

**✅ VÉRIFICATION VISUELLE RÉELLE FAITE** — dans Chrome, sur l'application en marche, après connexion par l'utilisateur (compte de démo). Contrôlé point par point :

| Vérifié | Résultat observé |
| --- | --- |
| Rail présent en vue Mois **et** Semaine, en desktop (AC1) | ✅ les deux |
| Rail en largeur mobile (420 px) | ✅ présent, libellé abrégé « Après-m. », **trois lignes conservées** |
| État de repos = prochain jour porteur (AC3) | ✅ « JEUDI 3 SEPTEMBRE », jour de la séance à venir, sans aucun toucher |
| Trois créneaux toujours nommés (AC2) | ✅ Matin / Après-midi / Soir, y compris quand seul l'après-midi porte la séance |
| Créneau sans objet dit son état (AC4) | ✅ « Disponible » / « Indisponible » en toutes lettres |
| Le rail suit le toucher, créneau nommé | ✅ tap sur le segment après-midi du 20 → « JEUDI 20 AOÛT — APRÈS-MIDI », ligne touchée en gras |
| Le panneau s'ouvre toujours (AC9) | ✅ `ConstraintPanel` ouvert à l'identique |
| **Fermer le panneau ne vide pas le rail** | ✅ le rail conserve le 20 août après fermeture — le piège n°1 est bien évité |
| AC11 — activer la ligne ouvre le **scénario** | ✅ navigation vers `/parties/…/scenarios/…`, écran « Chapitre 2 : Le Sceau Brisé », séance 1 datée du 3 sept. après-midi |
| Aucune affordance morte | ✅ **1 seul bouton** dans le rail sur 3 lignes ; `cursor: auto` sur les lignes non activables |
| Nom accessible orienté destination | ✅ « Ouvrir le scénario La Route des Lanternes — Chapitre 2 : Le Sceau Brisé » |
| Focus clavier visible | ✅ `outline` 3 px au focus, bouton natif focalisable |
| Icônes de créneau muettes pour l'AT | ✅ `aria-hidden="true"` sur les trois |
| Région live | ✅ `role="region"`, `aria-live="polite"` |
| **Les trois thèmes** | ✅ Forêt Ancienne, Grimoire Émeraude et Médiéval Steampunk : le rail suit les tokens, titre de séance en `--jdr-text` (`#e8e0f0` vérifié en Émeraude), aucun slug de thème ciblé |

Aucun défaut visuel constaté. Le seul écart au contrat d'UI reste l'absence des **informations pratiques** (« chez Marc, 20 h 30 ») — attendu, le champ n'existe pas encore côté serveur (D-15, story 36.5).

### File List

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/day-detail.utils.ts`
- `apps/web/src/app/features/calendar/day-detail.utils.spec.ts`
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.ts`
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.html`
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.scss`
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.spec.ts`

**Modifiés — Web**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts`

**Non touchés (confirmé par `git status`)**
- `apps/api/**` en totalité · `packages/shared/**` · `calendar-month-view` · `calendar-week-view` · `calendar-layer-toggle` · `constraint-panel` · `selection.utils.ts` · `selection-bar` · `available-slots` · `creneau-card` · `aggregated-creneau-card` · `core/availability/compute-display-status.ts` · `features/account/**`.

### Change Log

- 2026-08-17 — **Implémentation complète (Tasks 1 à 7, bmad-dev-story). Statut → review.** Rail de détail permanent sous la grille, en vue Mois et Semaine, à toutes les largeurs, absent de la vue Agenda. Deux fonctions pures neuves (`buildDayDetail`, `nextMeaningfulDate`) et un composant de rendu pur (`CalendarDetailRail`). **Refonte en amont plutôt que duplication** : `agendaEntries()` filtrait par couche en même temps qu'elle dérivait — la dérivation est extraite en `allCalendarEntries()` (non filtrée) et le filtre par couche passe en aval, seul moyen de satisfaire l'AC6 (la couche retire le titre, jamais l'indisponibilité) sans construire un second pipeline. Signaux `railDate`/`railSlot` **dédiés** : les tests vérifient explicitement que `closePanel()` ne vide pas le rail. Une séance force `UNAVAILABLE` avant tout calcul de statut, l'indisponibilité dérivée d'une séance n'existant pas côté client. AC11 : la ligne portant une séance est un `<button>` natif (focus et clavier gratuits) qui ouvre `/parties/:id/scenarios/:scenarioId` — **aucun composant de détail de séance n'a été créé**, et les lignes sans séance ne sont pas cliquables. Quatre champs additifs sur `AgendaEntry`, rendu de la vue Agenda inchangé. **Web 102 fichiers / 1616 tests (baseline 100/1560, +2 fichiers / +56 tests), tous verts.** Lint : 143 erreurs avant comme après, **zéro erreur introduite**, nouveaux fichiers propres — baseline mesurée par `git stash`. Build : échec sur le seul budget de bundle pré-existant, 1,35 → 1,36 Mo (+8,13 ko), mesuré des deux côtés. Story front-only, aucun fichier `apps/api/**` ni `packages/shared/**` touché, aucune suite API relancée. **✅ VÉRIFICATION VISUELLE RÉELLE FAITE** dans Chrome sur l'application en marche (connexion faite par l'utilisateur) : rail présent aux deux vues en desktop et en 420 px (trois lignes conservées, libellé abrégé), état de repos sur le prochain jour porteur, le rail suit le toucher et nomme le créneau, **le panneau fermé ne le vide pas**, la ligne de séance ouvre bien le scénario, un seul bouton sur trois lignes (aucune affordance morte), focus clavier visible, icônes `aria-hidden`, région live, et les **trois thèmes** rendus par les tokens sans accroc. Aucun défaut visuel constaté. Seul écart au contrat : les informations pratiques, attendues (champ serveur inexistant, D-15/story 36.5).
- 2026-08-17 — **Trois décisions utilisateur intégrées.** (1) Rail permanent aux deux vues **et en desktop**, la largeur servant à déplier l'information plutôt qu'à masquer le rail — écart assumé vs `EXPERIENCE.md:697` et l'annotation 27 du contrat. (2) Les **trois** créneaux toujours listés, « Matin » compris, à toutes les largeurs — écart assumé vs le rendu mobile du contrat (2 lignes sur 3), désormais invariant de la story. (3) **AC11 ajoutée**, avec sa règle générale : **le rail nomme une chose et ouvre le niveau au-dessus** — une ligne décrit une séance, l'activer ouvre **le scénario** qui la porte (`/parties/:id/scenarios/:scenarioId`). Ce n'est pas un repli mais le niveau qui porte le contexte utile (chronologie, autres séances, compte rendu). Constat d'analyse concordant consigné en Task 4 bis : **aucune fenêtre de séance n'existe dans l'application** (aucun composant, aucun dialogue, aucune route ; le seul lien existant, `seance-list.ts:86`, va du scénario **vers** le calendrier) — la story **ne crée aucun composant de détail de séance**. La règle précise `EXPERIENCE.md:571` et vaut aussi pour la story **36.11**. Nommage et libellé accessible alignés sur la destination (`scenarioActivated`, « Ouvrir le scénario … »), jamais sur la séance. Second trou de données identifié en conséquence : `AgendaEntry` ne porte aucun identifiant navigable — `partieId`/`scenarioId`/`seanceId` à ajouter en champs additifs, les deux sources les possédant déjà. Les lignes sans séance restent non actionnables (pas d'affordance morte) ; ouvrir ou répondre à un vote depuis le rail reste hors périmètre (36.7/36.9). Les points 1 et 2 modifient le contrat d'UI et la table de densité d'`EXPERIENCE.md` §9 : **planches non éditées, à répercuter par `bmad-ux`**.
- 2026-08-17 — Story créée (bmad-create-story). Première story de l'épic 36. Trois encadrés consignés : (1) le rail est un consommateur passif et `onSlotSelected` est l'unique point d'entrée de clic existant — il ouvre le `ConstraintPanel` et ses signaux `selectedDate`/`selectedSlot` sont liés à `panelOpen`, donc le rail exige des signaux dédiés ; (2) zéro appel réseau — `agendaEntries()` fait déjà la dérivation par couche pour les deux contextes, le rail en extrait une fonction pure plutôt que de construire un second pipeline ; (3) trois écarts assumés au contrat d'UI, chacun marqué ⚠️ avec son motif (rail permanent aux deux vues et à toutes largeurs, portée « jour » en vue Semaine, trois créneaux toujours listés). Dix AC : les quatre d'`epics.md` verbatim (AC1-AC4) plus AC5-AC10 (zéro appel réseau, couche gouvernant le texte et jamais l'indisponibilité, non-nommage des séances d'autres parties en contexte de partie, jamais la couleur seule, non-régression de saisie, région live). Point ouvert n°11 de la spine UX tranché (« la dernière case touchée »). Story front-only : aucun changement attendu côté `apps/api/**` ni `packages/shared`.
