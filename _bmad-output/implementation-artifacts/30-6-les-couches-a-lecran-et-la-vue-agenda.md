---
baseline_commit: 9ff3021
---

# Story 30.6 : Les couches à l'écran et la vue Agenda

Status: done

Epic: 30 — Calendrier
Porte : **FR-46** (couches à l'écran + vue Agenda) · **AD-16** (union `CalendarLayerKey`, préférence de compte) · **AD-18** (endpoint unique `/me/calendar`) · **AD-9** (indisponibilité dérivée des séances — consommée ici en non-régression) · **CAP-19**

---

## Story

As a utilisateur,
I want allumer et éteindre ce que je vois, et disposer d'une vue chronologique,
So that je sache où j'en suis sans reconstruire l'information moi-même.

---

## 🚨 Encadré n°1 — Cette story est la dernière des trois : elle ne construit ni le modèle ni l'endpoint, elle les branche à l'écran

`FR-46` a été livré en trois stories distinctes, aucune ne recouvrant les deux autres :

| Story | A livré |
|---|---|
| **30.4** (done) | Le modèle (`UserCalendarLayer`, `CalendarLayerKey`, `defaultCalendarLayers` sur `AuthUser`) et l'écran **Compte** où l'utilisateur règle son jeu **par défaut**. `calendar-view.ts` et les vues Mois/Semaine étaient explicitement **hors périmètre** (encadré n°1 de 30.4). |
| **30.5** (done) | `GET /me/calendar` (5 couches, `disponibilite-groupe` **absente** de la réponse — AD-16) et la dérivation AD-9 (indisponibilité par séance, injectée dans `computeSlotStatus`, déjà active dans `getAvailableSlots`/`getHeatmap`). `apps/web/src/app/features/calendar/**` et `apps/web/src/app/features/account/**` étaient hors périmètre. |
| **30.6** (cette story) | Le **bandeau de bascule interactif**, le **filtrage effectif** de ce qui s'affiche, la **vue Agenda**, et la **suppression** de l'ancien panneau « voir les créneaux calculés » en tant que panneau séparé. |

Vérifié dans le code (`calendar-view.ts`, lu en entier pour cette story) : **aucune notion de couche n'existe aujourd'hui** dans le calendrier — ni signal `activeLayers`, ni lecture de `auth.currentUser()?.defaultCalendarLayers`, ni filtrage conditionnel. Les six couches ont chacune un mapping *implicite* vers un signal ou un appel existant, déjà documenté par 30.4 (References) :

| Couche | Source actuelle dans `calendar-view.ts` | Portée contextuelle |
|---|---|---|
| `mes-indisponibilites` | `declarations()` filtré `kind === 'UNAVAILABLE'` | Toujours (perso et partie) |
| `mes-disponibilites` | `declarations()` filtré `kind === 'AVAILABLE'` | Toujours |
| `mes-seances` | **Rien aujourd'hui.** En contexte personnel : `GET /me/calendar` (couche du même nom, Story 30.5). En contexte de partie : à dériver de `scenarios()` déjà chargé (`ScenariosService.listAll`, aucune notion de « mes » séances construite aujourd'hui — toutes les séances de la Partie sont d'office « miennes » puisque j'y suis MJ ou membre) |
| `votes-en-cours` | `activePolls()` (computed existant, dérivé de `scenarios()`) — **en contexte de partie uniquement**. En contexte personnel : couche `votes-en-cours` de `GET /me/calendar` |
| `inscriptions-ouvertes` | `eligibleSeances()` (computed existant, **MJ-only** aujourd'hui — cf. Dev Notes) — en contexte de partie. En contexte personnel : couche `inscriptions-ouvertes` de `GET /me/calendar` |
| `disponibilite-groupe` | `availableSlots()`/`heatmap()` (déjà chargés, `AvailableSlotsPanel`) — **exclusivement en contexte de partie** (AD-16), jamais en personnel |

**Cette story doit donc construire deux chemins d'alimentation distincts pour les couches** selon que `partieId()` est renseigné ou non — ce n'est pas une seule liste homogène à peupler d'un coup :
1. **`profile/calendar`** (`partieId()` null, route existante `app.routes.ts:79`) : les 5 couches personnelles viennent d'un **unique appel** `GET /me/calendar?from=...&to=...` (AC1 de cette story, réutilise directement AD-18/Story 30.5 sans rien y changer). `disponibilite-groupe` n'existe pas dans ce contexte — absente du bandeau, pas grisée (cohérent avec l'absence de la clé dans la réponse serveur).
2. **`parties/:id/calendar` (MJ) et `parties/:id/guild-calendar` (joueur)** (`partieId()` renseigné) : les 6 couches viennent de données **déjà chargées par cette même page** (`declarations`, `scenarios`/`activePolls`/`eligibleSeances`, `availableSlots`/`heatmap`) — **aucun appel à `GET /me/calendar` ici**, et aucun appel réseau supplémentaire pour `votes-en-cours` (AC6 de la story `epics.md`, verbatim : *« aucun appel supplémentaire n'est émis pour les obtenir — le sondage de la partie les renvoie déjà »*).

**Piège immédiat** : ne pas confondre « contexte de partie » et « mode MJ ». `guild-calendar` (mode `'personal'`, cf. `app.routes.ts:45`) porte quand même un `partieId()` — c'est un calendrier **de la partie**, vu par un joueur, distinct de `profile/calendar` (mode `'personal'`, **sans** `partieId()`) qui est le calendrier **personnel** au sens de 30.5/AD-18. Le nom du `mode` input (`'personal' | 'mj'`) ne suffit donc pas à décider quelle source de couches utiliser — c'est la présence de `partieId()` qui gouverne.

---

## 🚨 Encadré n°2 — La pastille d'écart au défaut : bascule de visite ≠ nouveau défaut, jamais

`epics.md` est explicite et répété deux fois dans les AC de cette story : une bascule effectuée pendant la visite (allumer/éteindre une couche à l'écran) **ne modifie jamais** `defaultCalendarLayers` (compte, Story 30.4). Au retour sur l'écran (nouvelle visite, autre appareil, ou même un simple rechargement), c'est **toujours** le jeu par défaut du compte qui s'applique — jamais le dernier état affiché.

**Conséquence directe sur l'implémentation** : l'état des couches actives affichées est un **signal purement local au composant** (`CalendarView` ou un service scopé au composant, pas `providedIn: 'root'` sans précaution), initialisé depuis `auth.currentUser()?.defaultCalendarLayers` à chaque montage, **jamais persisté** par la bascule elle-même — aucun appel à `AccountService.updatePreferences()` depuis cet écran. Seul l'écran **Compte** (30.4, inchangé par cette story) écrit `defaultCalendarLayers`.

La **pastille** compare cet état local à `defaultCalendarLayers` (égalité d'ensemble, ordre indifférent) et propose un « rétablir » qui réinitialise l'état local — pas un appel réseau. Elle doit rester visible même quand l'écart consiste à avoir **éteint** une couche (dernier AC de la story : « j'éteins la couche de mes indisponibilités… la pastille d'écart au défaut reste visible ») — ce n'est donc pas seulement un badge de couches *en plus*, une comparaison d'ensemble complète est requise dans les deux sens (allumé en plus, éteint en moins).

---

## Acceptance Criteria

Les sept premiers sont repris (reformulés en AC numérotés) de `epics.md#Story 30.6`, verbatim dans l'intention.

**AC1 — Given** le calendrier
**When** je l'affiche
**Then** trois présentations des mêmes couches sont disponibles : Mois, Semaine et Agenda (troisième option du `mat-button-toggle-group` existant, `calendar-view.html:14-19`)

**AC2 — Given** la vue Agenda
**When** je l'ouvre
**Then** elle liste chronologiquement les couches actives — séances à venir, votes en cours, inscriptions ouvertes, mes déclarations — chacune identifiable comme telle (pas une liste indifférenciée)

**AC3 — Given** j'éteins ou j'allume une couche en cours de visite
**When** je quitte puis reviens plus tard (nouvelle navigation vers l'écran, ou nouvel appareil)
**Then** mon jeu par défaut (`AuthUser.defaultCalendarLayers`, Story 30.4) est rétabli
**And** ma bascule de visite n'est pas devenue mon nouveau défaut — aucun appel à `PATCH /me/preferences` n'est émis par cet écran (cf. encadré n°2)

**AC4 — Given** l'affichage courant s'écarte de mon défaut (au moins une couche allumée ou éteinte différemment)
**When** je regarde l'écran
**Then** une pastille me le signale et me propose de rétablir mon défaut en un geste, sans rechargement de page

**AC5 — Given** l'ancien panneau « voir les créneaux calculés » (`available-slots-panel`, atteint aujourd'hui par le bouton `.see-slots-btn` et `scrollToSlots()`, `calendar-view.ts:443-445`)
**When** l'épic est livré
**Then** il n'existe plus comme panneau séparé atteint par un bouton de défilement — le bouton et le scroll dédié disparaissent
**And** son contenu (créneaux calculés MJ `AvailableSlotDto` / agrégés joueur `AggregatedSlotDto`, via `AvailableSlotsPanel` existant, réutilisé tel quel) devient la couche `disponibilite-groupe`, affichable dans les trois vues (Mois/Semaine en overlay comme aujourd'hui pour le heatmap mensuel, Agenda comme entrées chronologiques)

**AC6 — Given** un vote de date en cours sur une partie, et la couche « votes en cours » allumée
**When** j'ouvre le calendrier **de cette partie** (`parties/:id/calendar` ou `parties/:id/guild-calendar`, `partieId()` renseigné)
**Then** les créneaux proposés par le vote y apparaissent (dérivés de `activePolls()`, déjà chargé)
**And** ils sont distingués visuellement de mes propres déclarations (jamais fondus dans le même badge/couleur que `mes-disponibilites`/`mes-indisponibilites`)
**And** aucun appel supplémentaire n'est émis pour les obtenir — le sondage de la partie (`ScenariosService.listAll`, déjà appelé par `loadScenarios()`) les renvoie déjà ; **ni** `GET /me/calendar` **ni** un nouvel endpoint ne sont sollicités depuis un contexte de partie

**AC7 — Given** j'éteins la couche de mes indisponibilités
**When** un créneau bloqué n'apparaît plus (dans quelque vue que ce soit)
**Then** la pastille d'écart au défaut reste visible pour me rappeler que l'écran ne montre pas tout (cf. encadré n°2 — comparaison dans les deux sens, pas seulement « couche ajoutée »)

**AC8 — Given** le calendrier personnel (`profile/calendar`, `partieId()` absent)
**When** les couches `mes-seances`, `votes-en-cours` et `inscriptions-ouvertes` s'affichent
**Then** elles sont alimentées par un unique appel `GET /me/calendar?from=...&to=...` (Story 30.5, AD-18), jamais par une itération sur les parties de l'utilisateur
**And** la couche `disponibilite-groupe` n'apparaît pas dans le bandeau de bascule de cet écran — elle n'a de sens que dans le calendrier d'une partie (AD-16, cohérent avec son absence de `MeCalendarDto`)

**AC9 — Given** le calendrier d'une partie (`partieId()` renseigné, MJ ou joueur)
**When** les six couches s'affichent
**Then** toutes proviennent de données déjà chargées par cette page pour d'autres besoins (`declarations`, `scenarios`, `availableSlots`/`heatmap`) — aucun appel réseau n'est ajouté par cette story dans ce contexte

**AC10 — Given** la plage de dates affichée change (navigation mois suivant/précédent, changement de vue Semaine, ou champs `from`/`to` du panneau MJ existant)
**When** la couche `mes-seances`/`votes-en-cours`/`inscriptions-ouvertes` du calendrier personnel est concernée
**Then** `GET /me/calendar` est rappelé avec la nouvelle plage — pas de cache silencieusement périmé (mais toujours un seul appel par changement de plage, pas un appel par couche, cf. AC8)

---

## Tasks / Subtasks

### État des couches et bandeau de bascule

- [x] **Task 1 — État local des couches actives, jamais persisté par la bascule** (AC3, AC4, AC7, encadré n°2)
  - [x] Nouveau signal (proposé : `activeLayers = signal<CalendarLayerKey[]>([])`, colocalisé dans `CalendarView` ou extrait dans un service dédié `apps/web/src/app/core/calendar/calendar-layers.service.ts` si la logique de comparaison/reset le justifie — la spine (`ARCHITECTURE-SPINE.md`, section arborescence) anticipe déjà ce nom de fichier) — initialisé dans `ngOnInit()` depuis `auth.currentUser()?.defaultCalendarLayers ?? DEFAULT_CALENDAR_LAYER_KEYS` (import `AuthService` non encore injecté dans `calendar-view.ts`, à ajouter).
  - [x] Hors contexte de partie (`partieId()` absent), retirer `disponibilite-groupe` de l'ensemble affichable (elle peut être présente dans `defaultCalendarLayers` — c'est le stockage qui l'inclut toujours par défaut, AD-16 — mais la **lecture** l'ignore ici, exactement comme AC5 de la Story 30.4 déjà vérifiée en non-régression).
  - [x] Méthode `toggleLayer(key: CalendarLayerKey)` : ajoute/retire de `activeLayers()`, aucun appel réseau.
  - [x] `isOverridden = computed(...)` : compare `activeLayers()` à l'ensemble par défaut applicable au contexte (6 clés en partie, 5 hors `disponibilite-groupe` en personnel) — égalité d'ensemble, pas d'ordre (`Set` ou tri avant comparaison).
  - [x] `resetToDefault()` : réaffecte `activeLayers()` depuis `auth.currentUser()?.defaultCalendarLayers`, aucun appel réseau (cf. encadré n°2).

- [x] **Task 2 — Bandeau de bascule (nouveau composant)** (AC1 implicite au support, AC3, AC4)
  - [x] Nouveau composant, proposé `apps/web/src/app/features/calendar/calendar-layer-toggle/` — chips ou toggles Material (`MatChipListbox`/`mat-chip-option`, ou `mat-slide-toggle` répétés, décision d'implémentation selon densité) pour chacune des couches affichables dans le contexte courant (5 ou 6 selon `partieId()`), libellés via `theme.tone()['account.calendar_layer.<key>']` — **réutiliser tels quels** les six libellés déjà seedés par la Story 30.4 (`tones.ts:294-299` et les deux autres thèmes), ne pas en écrire de nouveaux.
  - [x] Pastille d'écart (AC4) : visible seulement si `isOverridden()`, bouton « Rétablir mon affichage par défaut » (ou libellé thématisé équivalent, nouvelle clé si aucune n'existe déjà) appelant `resetToDefault()`.
  - [x] Câblé dans `calendar-view.html`, visible dans les trois vues (Mois/Semaine/Agenda) — un seul bandeau au-dessus du sélecteur de vue existant, pas un par vue.

### Alimentation des couches — deux chemins distincts (encadré n°1)

- [x] **Task 3 — Client `GET /me/calendar`** (AC8, AC10)
  - [x] Nouvelle méthode cliente (proposé : `MeCalendarService` dans `apps/web/src/app/core/availability/` ou une extension d'`AvailabilityService` existant — décision d'implémentation, `AvailabilityService` porte déjà le CRUD de déclarations, une méthode `getMyCalendar(from, to): Promise<MeCalendarDto>` y trouve naturellement sa place) — `GET /me/calendar?from=...&to=...`, même patron `firstValueFrom(http.get(...))` que le reste du service.
  - [x] Appelée uniquement quand `partieId()` est absent (`profile/calendar`) — jamais depuis un contexte de partie (AC9).
  - [x] Rappelée à chaque changement de plage affichée pertinent pour les couches temporelles (AC10) — réutiliser `fromDateStr()`/`toDateStr()` déjà présents sur `CalendarView`, ou une plage dérivée de la vue Mois/Semaine/Agenda actuellement affichée si plus appropriée (décision d'implémentation : la plage `[from, to]` actuelle sert aujourd'hui uniquement au panneau MJ `available-slots`, à réévaluer pour couvrir aussi la fenêtre visible de la vue Mois/Semaine/Agenda).

- [x] **Task 4 — Couches en contexte de partie : zéro appel réseau supplémentaire** (AC6, AC9)
  - [x] `votes-en-cours` : dériver directement de `activePolls()` (computed existant, `calendar-view.ts:131-141`) — pas de nouvelle requête.
  - [x] `inscriptions-ouvertes` : dériver de `eligibleSeances()` côté MJ (computed existant, `calendar-view.ts:146-157`). **Côté joueur (`guild-calendar`), `eligibleSeances()` n'est aujourd'hui peuplé que dans un contexte où `scenarios()` est chargé (déjà le cas pour toute Partie, MJ ou joueur) — vérifier si le filtre MJ-only de `eligibleSeances()` (accès à `startVoteFor`, action MJ) doit être distingué d'une lecture pure joueur de « quelles séances ont des inscriptions ouvertes » ; ces deux besoins ne sont pas strictement identiques (l'un est une liste actionnable pour lancer un vote, l'autre une couche de lecture). Décision d'implémentation : soit réutiliser `eligibleSeances()` tel quel pour cette couche des deux côtés (lecture seule pour un joueur, qui n'a de toute façon pas accès à `startVoteFor`), soit dériver une liste séparée depuis `scenarios()` filtrée sur `inscriptionMax` défini + aucune date validée (même règle que `buildOpenInscriptionsLayer` côté serveur, Story 30.5) — documenter le choix retenu.**
  - [x] `mes-seances` : aucun signal existant ne porte ce concept en contexte de partie (cf. tableau de l'encadré n°1) — dériver de `scenarios()` (déjà chargé) : toute séance dont `poll?.chosenDate ?? seance.inscription?.dateValidee` est renseignée dans la Partie courante (le mot « mes » perd son sens de filtrage inter-parties ici, puisque toutes les séances affichées appartiennent déjà à la Partie consultée).
  - [x] `disponibilite-groupe` : dériver de `availableSlots()`/`heatmap()` déjà chargés — c'est le contenu de l'ancien panneau (Task 6).
  - [x] `mes-indisponibilites`/`mes-disponibilites` : inchangées, `declarations()` filtré par `kind` (déjà la source de vérité des vues Mois/Semaine).

- [x] **Task 5 — Filtrage effectif Mois/Semaine** (AC1, AC7)
  - [x] `CalendarMonthView`/`CalendarWeekView` reçoivent aujourd'hui `declarations` sans distinction de couche (`kind AVAILABLE`/`UNAVAILABLE` mélangés dans un seul tableau, `buildMonth()`/`computeDisplayStatus`). Filtrer en amont dans `CalendarView` (nouveau `computed()`, proposé `visibleDeclarations`) selon que `mes-disponibilites`/`mes-indisponibilites` sont actives avant de les transmettre — **ne pas modifier la signature ni l'algorithme de `buildMonth()`/`computeDisplayStatus()`** (fonctions pures déjà testées, cf. patron « ne pas toucher un algorithme testé » déjà suivi en 30.5 pour `computeSlotStatus`).
  - [x] `heatmap` (overlay `disponibilite-groupe` de la vue Mois) : transmis uniquement si la couche est active — sinon tableau vide passé au `[heatmap]` input existant (pas de nouvel input booléen requis si un tableau vide suffit à masquer l'overlay, vérifier `heatmapByDate` de `calendar-month-view.ts:179-195`).
  - [x] `available-slots`/`disponibilite-groupe` dans la vue Semaine : aujourd'hui aucun overlay heatmap n'existe côté Semaine (à vérifier dans `calendar-week-view.ts`, non lu en détail par cette story — traiter en cohérence si un mécanisme équivalent existe, sinon documenter l'écart).

### Vue Agenda

- [x] **Task 6 — Nouveau composant `CalendarAgendaView`** (AC1, AC2, AC5)
  - [x] `apps/web/src/app/features/calendar/calendar-agenda-view/` — reçoit les mêmes entrées que les deux autres vues côté source (`declarations` filtrées, séances/votes/inscriptions dérivés Task 3/4, `availableSlots`/`heatmap` pour `disponibilite-groupe`) et les fusionne en une liste chronologique unique, triée par date, chaque entrée légendée par sa couche d'origine (badge ou icône distinctif — cf. AC6, distinction visuelle déjà exigée pour `votes-en-cours`).
  - [x] Chaque type d'entrée reste identifiable à l'écran : séance à venir, option de vote, inscription ouverte, ma déclaration — pas une liste indifférenciée de dates (AC2).
  - [x] Câblé comme troisième valeur du `mat-button-toggle-group` existant (`calendar-view.html:15-18`), même patron `@if (view() === '...')`/`@else` étendu à trois branches.

### Suppression de l'ancien panneau

- [x] **Task 7 — Retirer le panneau séparé, migrer son contenu en couche** (AC5)
  - [x] Retirer `.see-slots-btn` et `scrollToSlots()` (`calendar-view.ts:443-445`, `calendar-view.html:44-53`), ainsi que `#slotsPanel`/`ElementRef` associé si plus utilisé.
  - [x] `AvailableSlotsPanel` (`apps/web/src/app/features/calendar/available-slots/available-slots.ts`) reste le composant de rendu (pas de réécriture) mais son point de montage change : intégré dans les trois vues comme représentation de la couche `disponibilite-groupe`, visible seulement quand cette couche est active — décision d'implémentation sur l'emplacement exact par vue (probable : section dédiée sous la grille en Mois/Semaine, entrées mêlées en Agenda).
  - [x] Le panneau MJ conserve son formulaire `from`/`to` (`onSearch()`, `date-range-form`) — non touché, toujours nécessaire pour piloter la plage de `getAvailableSlots`/`getHeatmap`, indépendamment de la disparition du bouton de défilement.
  - [x] Vérifier qu'aucun test existant (`calendar-view.spec.ts`) n'attend encore `.see-slots-btn`/`scrollToSlots` — mise à jour mécanique attendue.

### Tests

- [x] **Task 8 — Tests du bandeau et de l'état des couches** (AC3, AC4, AC7)
  - [x] Montage avec `defaultCalendarLayers` d'un compte fixture → toutes les couches attendues actives à l'ouverture (5 en personnel, 6 en partie).
  - [x] Bascule d'une couche → pastille apparaît ; navigation simulée (destroy/recreate du composant) → défaut rétabli, pastille absente.
  - [x] Éteindre une couche (retrait, pas ajout) → pastille toujours visible (AC7, piège explicite de l'encadré n°2 — un test naïf ne couvrant que l'ajout laisserait passer une régression sur ce cas précis).
  - [x] `resetToDefault()` → aucun appel HTTP émis (spy sur `HttpClient`/`AccountService`).

- [x] **Task 9 — Tests de source des couches** (AC6, AC8, AC9)
  - [x] Contexte personnel (`partieId()` absent) : `GET /me/calendar` appelé une fois par plage affichée, jamais par couche.
  - [x] Contexte de partie : aucun appel `GET /me/calendar` émis ; `votes-en-cours` alimenté par `activePolls()` sans requête supplémentaire (spy `HttpClient.get` avant/après activation de la couche).
  - [x] Vue Agenda : entrées de couches désactivées absentes de la liste ; entrées correctement légendées par type.

- [x] **Task 10 — Non-régression** (Task 7)
  - [x] `calendar-view.spec.ts` existant : suppression/adaptation des assertions sur `.see-slots-btn`/`scrollToSlots`, reste vert par ailleurs.
  - [x] `available-slots.spec.ts` : inchangé si le composant n'est pas réécrit, seulement redéployé (Task 7).
  - [x] Mois/Semaine : tap unitaire, sélection par glissement (Story 30.3), panneau `ConstraintPanel` — strictement inchangés, tests existants verts sans modification de leurs assertions.

### Vérification

- [x] **Task 11 — Suite complète et build**
  - [x] `docker compose exec web pnpm test` (suite complète), `pnpm lint` sur les fichiers touchés, `ng build` (le budget de bundle pré-existant reste le seul point d'échec attendu, à confirmer par comparaison avant/après comme dans les stories précédentes).
  - [x] **Story front-only** : aucune suite API à relancer (aucun fichier `apps/api/**` attendu dans le File List final, `GET /me/calendar` n'est pas modifié par cette story).
  - [x] Vérification visuelle manuelle si l'extension Chrome est disponible dans l'environnement d'exécution — sinon documenter l'absence de validation à l'œil comme en Story 30.3/29.14.

### Review Findings

- [x] [Review][Patch] Couches `mes-seances`/`inscriptions-ouvertes` sans représentation en vues Mois/Semaine — elles n'alimentent que `agendaEntries()` (`calendar-view.ts:247-330`), jamais transmises aux templates Mois/Semaine. Décision utilisateur (revue du 2026-08-16) : aucune story ultérieure de l'épic 30 ne comble cet écart (30.6 est la dernière story de l'épic) — corrigé : marqueur `seance-dot` ajouté à `CalendarMonthView`/`CalendarWeekView` (nouvel input `seanceDates`, dérivé d'`agendaEntries()` via `seanceMarkerDates`) pour la couche `mes-seances`. `inscriptions-ouvertes` reste Agenda-only : structurellement sans date (`MyCalendarOpenInscriptionEntry` n'a pas de champ `date`, une inscription ouverte n'a pas encore de séance validée).
- [x] [Review][Patch] Doublon `disponibilite-groupe`/`votes-en-cours` en vue Agenda — `mj-results-panel`/`guild-slots-panel` (`calendar-view.html:59-161`) restaient affichés sous la grille même en vue Agenda, en plus des entrées chronologiques équivalentes. Décision utilisateur (revue du 2026-08-16) : n'afficher qu'une seule fois — corrigé, ces panneaux sont maintenant gatés aussi par `view() !== 'agenda'`.
- [x] [Review][Patch] `loadMeCalendarForRange` avalait silencieusement les échecs réseau — corrigé : `error()` renseigné sur échec, `meCalendar` vidé plutôt que laissé sur la plage précédente (AC10).
- [x] [Review][Patch] Aucune protection contre les réponses `getMyCalendar` désordonnées — corrigé : identifiant de requête incrémental (`meCalendarReqId`) ignorant toute réponse obsolète.
- [x] [Review][Patch] Entrées `votes-en-cours` sans option (`date: ''`) sans clé de tri secondaire — corrigé : `sortedEntries` trie désormais par `date` puis par `label`.
- [x] [Review][Dismiss] Troncature de date « incohérente » entre les deux branches de `agendaEntries()` — vérifié faux positif : le serveur tronque déjà en `YYYY-MM-DD` côté `MeCalendarDto` (`buildMySeancesLayer`/`buildOpenPollsLayer`, `availability.service.ts:938,971`, `.toISOString().substring(0, 10)`), tandis que `chosenDate`/`dateValidee` (contexte de partie) sont des timestamps ISO complets nécessitant la troncature côté client. Les deux branches sont correctes pour leur format d'entrée respectif — aucun changement appliqué.
- [x] [Review][Patch] Bouton de réinitialisation (`calendar-layer-toggle.html`, `.layer-toggle__reset`) sans annonce accessible — corrigé : enveloppé dans une région `aria-live="polite"`.
- [x] [Review][Defer] Assertions non-null (`seance.inscription!`) dans `agendaEntries()` reposant sur une synchronicité implicite avec le filtre `openInscriptionSeances` plutôt que sur un rétrécissement de type — deferred, pre-existing pattern
- [x] [Review][Defer] Couverture de tests incomplète pour la dérivation `agendaEntries()` en contexte de partie — seul le cas de retrait (`votes-en-cours`) est testé négativement, aucun test positif pour `mes-seances`/`inscriptions-ouvertes`/`disponibilite-groupe` en contexte de partie — deferred, pre-existing pattern
- [x] [Review][Defer] Liste Agenda non bornée — `agendaEntries()` concatène tout sans limite, pagination ni virtualisation ; pourrait devenir volumineux pour un MJ avec de nombreuses parties — deferred, pre-existing pattern
- [x] [Review][Defer] Réutilisation des signaux `fromDateStr`/`toDateStr` entre le formulaire de recherche MJ et la plage du calendrier personnel (`loadMeCalendarForRange`) — les deux usages sont mutuellement exclusifs au rendu aujourd'hui, mais brouille la séparation architecturale des deux chemins d'alimentation (encadré n°1) — deferred, pre-existing pattern
- [x] [Review][Defer] Écart de rafraîchissement temps réel de `GET /me/calendar` (absence de câblage sur `RealtimeService`/signal `changed`) documenté en prose dans les Completion Notes mais non consigné dans `deferred-work.md` avant cette revue — deferred, pre-existing pattern

---

## Hors périmètre

- **Toute modification du modèle de préférences ou de l'écran Compte** — Story 30.4, déjà livrée. Cette story **lit** `defaultCalendarLayers`, ne l'écrit jamais.
- **Toute modification de `GET /me/calendar` ou de la dérivation AD-9** — Story 30.5, déjà livrée. Cette story **consomme** l'endpoint tel quel.
- **`computeSlotStatus`/`matchesDeclaration`/`buildMonth`/`computeDisplayStatus`** — algorithmes intouchés, seul leur point d'appel (les données transmises) est filtré en amont.
- **La sélection par glissement (Story 30.3)** et l'écriture groupée (Story 30.2) — inchangées, `onBatchDeclareRequested`/`SelectionBar` non concernés par cette story.
- **Un nouveau mécanisme de préférence « couches actives par vue »** (une pastille différente en Mois vs Semaine vs Agenda) — non demandé par les AC, l'état des couches actives est **unique**, partagé par les trois vues.

## Ce qui doit continuer de fonctionner

- Le panneau MJ (`date-range-form`, `onSearch()`, `PollCreationComponent`/`PollStatusPanel`) et le panneau joueur (`PollResponseComponent`) — inchangés dans leur logique, seulement déplacés hors d'un panneau atteint par défilement (Task 7).
- `ConstraintPanel` et la déclaration unitaire (`onSlotSelected`) — strictement inchangés.
- Le rafraîchissement temps réel existant (`effect()` sur `scenariosSvc.changed()`/`availabilitySvc.changed()`, `calendar-view.ts:191-216`) — les nouvelles couches dérivées de `scenarios()`/`activePolls()` en bénéficient automatiquement puisqu'elles sont des `computed()` sur les mêmes signaux, aucun câblage temps réel supplémentaire à ajouter pour elles. **`GET /me/calendar` (contexte personnel) n'est, lui, rafraîchi par aucun signal temps réel existant aujourd'hui** — décision à documenter si un rafraîchissement est jugé nécessaire (probable candidat pour un item différé si hors AC, cf. checklist SSE du projet, `docs/checklist.md`, qui exige une évaluation explicite à chaque ajout de composant scopé utilisateur).

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Confondre `mode` (`'personal' | 'mj'`) et présence de `partieId()`.** `guild-calendar` est en mode `'personal'` mais porte un `partieId()` — c'est un calendrier de partie, pas le calendrier personnel au sens de `GET /me/calendar` (encadré n°1).
2. **Faire persister une bascule de visite.** Aucun appel à `AccountService.updatePreferences()` ne doit partir de `CalendarView`, jamais (encadré n°2) — c'est l'inverse exact de ce que fait l'écran Compte.
3. **N'afficher la pastille que pour les couches ajoutées, pas retirées.** L'AC7 teste explicitement le cas d'un retrait — une comparaison d'ensemble complète est requise (encadré n°2).
4. **Appeler `GET /me/calendar` depuis un contexte de partie**, même « juste pour être cohérent » — AC6/AC9 l'interdisent explicitement, la couche `votes-en-cours` d'une partie doit rester sans coût réseau supplémentaire.
5. **Modifier `buildMonth()`/`computeDisplayStatus()`/`computeSlotStatus()`** pour leur apprendre une notion de couche — filtrer les données **avant** de les leur passer, ces fonctions restent agnostiques (même discipline que Stories 30.3/30.5 sur leurs algorithmes respectifs).
6. **Forcer `disponibilite-groupe` active dans le bandeau du calendrier personnel.** Elle n'existe simplement pas dans ce contexte (ni dans la réponse serveur, ni dans le bandeau) — ce n'est pas une case désactivée/grisée, elle est absente (cohérent avec AD-16/AC5 Story 30.4).

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Emplacement exact de l'état des couches** — signal local à `CalendarView` vs service dédié `calendar-layers.service.ts` (nom anticipé par la spine). Un service se justifie si la logique de comparaison/reset devient significative ou si un futur écran doit la réutiliser ; sinon un signal + deux méthodes privées suffisent.
- **Composant de bandeau** — chips Material vs toggles répétés, cf. Task 2. Densité à évaluer une fois les six libellés posés à l'écran (même type de décision que Task 6 de la Story 30.4 pour l'écran Compte, qui a tranché pour des cases à cocher simples).
- **`inscriptions-ouvertes` côté joueur en contexte de partie** — réutiliser `eligibleSeances()` (aujourd'hui pensé MJ-only) ou dériver une liste séparée en lecture seule (cf. Task 4). Aucun AC ne tranche ce point, documenter le choix retenu.
- **Rafraîchissement temps réel de `GET /me/calendar`** — aucun signal existant ne le couvre aujourd'hui (`AvailabilityService.changed()` est scopé à une connexion `partie:{id}`, jamais active sur `profile/calendar` puisqu'aucun `partieId()` n'y déclenche `realtime.connect()`, cf. `calendar-view.ts:237-240`). À évaluer explicitement (checklist SSE du projet) — si jugé hors périmètre des AC, documenter comme item différé plutôt que de l'ignorer silencieusement.
- **Fenêtre de dates pour `GET /me/calendar`** — réutiliser `fromDateStr()`/`toDateStr()` existants (aujourd'hui pilotés par le panneau MJ uniquement) ou dériver une plage propre à la vue affichée (mois visible, semaine visible, ou fenêtre glissante pour l'Agenda). Décision d'implémentation, à documenter.
- **Emplacement du rendu `disponibilite-groupe` dans les vues Mois/Semaine** une fois sorti du panneau à défilement — section dédiée toujours visible sous la grille (le plus proche du comportement actuel une fois le bouton retiré), ou strictement intégrée à l'Agenda avec un simple overlay heatmap conservé en Mois. Aucun AC ne fixe le placement exact, seulement l'absence du panneau séparé atteint par bouton (AC5).

### Notes de plateforme

- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs — toute nouvelle fixture `AuthUser`/`MeCalendarDto` dans les specs touchées doit satisfaire les types complets (piège déjà rencontré en 30.4 sur `defaultCalendarLayers`, non-optionnel).
- **Exécution** : tout par Docker (`docker compose exec web ...`).
- **Baseline** (après 30.5, commit `9ff3021`) : API 58/58 suites, 1232 tests ; web 98/98 fichiers, 1538 tests. Build web en échec sur le seul budget de bundle pré-existant (constant depuis 29.4).
- **Story front-only** : aucune suite API attendue en régression, `GET /me/calendar` n'est pas modifié.
- Comme en Story 30.3, si l'extension Chrome n'est pas connectée dans l'environnement d'exécution, la vérification visuelle du rendu réel (bandeau, pastille, vue Agenda) ne peut être qu'automatisée — le documenter explicitement plutôt que de l'omettre.

### Project Structure Notes

- **Nouveaux — Web (proposés, ajustables)** :
  - `apps/web/src/app/features/calendar/calendar-agenda-view/` (composant + spec) — troisième vue.
  - `apps/web/src/app/features/calendar/calendar-layer-toggle/` (composant + spec) — bandeau de bascule + pastille.
  - `apps/web/src/app/core/calendar/calendar-layers.service.ts` (si l'état est extrait en service, cf. Décisions) — nom anticipé par `ARCHITECTURE-SPINE.md` (arborescence, section `apps/web/src/app/core/`).
  - Méthode cliente `GET /me/calendar` — sur `AvailabilityService` existant ou un service dédié colocalisé (`apps/web/src/app/core/availability/`).
- **Modifiés — Web** :
  - `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (état des couches, filtrage, retrait du panneau à défilement, injection `AuthService`).
  - `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (troisième option de vue, bandeau, retrait `.see-slots-btn`/`#slotsPanel`).
  - `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`.
  - `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` (si l'input `heatmap` doit être conditionné, sans changement de signature).
  - `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` (à vérifier si un mécanisme équivalent au heatmap mensuel existe, Task 5).
  - `packages/shared/src/index.ts` — **aucun changement attendu** (tous les types nécessaires — `CalendarLayerKey`, `MeCalendarDto`, `AuthUser.defaultCalendarLayers` — existent déjà depuis 30.4/30.5).
- **Non touchés** : `apps/api/**` en totalité (story front-only), `apps/web/src/app/features/account/**` (30.4), `computeSlotStatus`/`matchesDeclaration`/`buildMonth`/`computeDisplayStatus` (algorithmes), `ConstraintPanel`, `selection.utils.ts`/`SelectionBar` (Story 30.3), `AvailabilityService.createDeclarationBatch()`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.6] — Story et 7 ACs, verbatim (repris ici en AC1-AC7, complétés par AC8-AC10 pour couvrir les deux chemins d'alimentation).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-46] — Couches combinables, disponibilité du groupe par rôle (déjà couverte en non-régression par 30.4), vue Agenda introduite par FR-46.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-48] — Le calendrier « cesse d'être une entrée de menu » et devient un écran de consultation courante grâce aux couches — contexte produit de cette story.
- [Source: ARCHITECTURE-SPINE.md#AD-16] (architecture-jdr-master-2026-08-04) — Union `CalendarLayerKey`, `disponibilite-groupe` sans sens hors contexte de partie, préférence relationnelle.
- [Source: ARCHITECTURE-SPINE.md#AD-18] — Endpoint unique `/me/calendar`, forme indexée par couche, hébergé dans `AvailabilityModule`.
- [Source: ARCHITECTURE-SPINE.md#AD-9] — Indisponibilité dérivée des séances, déjà injectée dans `computeSlotStatus` par la Story 30.5 — non-régression à préserver, rien à changer ici.
- [Source: ARCHITECTURE-SPINE.md, arborescence] — `calendar/calendar-layers.service.ts` anticipé comme emplacement des couches actives côté front, défaut lu du compte.
- [Source: _bmad-output/implementation-artifacts/30-4-modele-de-couches-et-preferences.md#References] — Mapping initial des six couches vers les signaux existants de `calendar-view.ts`, établi par 30.4 pour préparer cette story.
- [Source: _bmad-output/implementation-artifacts/30-5-endpoint-unique-du-calendrier-personnel.md] — `GET /me/calendar`, `MeCalendarDto`, décisions retenues (5 couches, `disponibilite-groupe` absente, `inscriptions-ouvertes` non filtrée par plage) à consommer telles quelles.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — Composant central de cette story, lu en entier : signaux `declarations`/`activePolls`/`eligibleSeances`/`availableSlots`/`heatmap`, panneau à défilement (`scrollToSlots`, `.see-slots-btn`, lignes 443-445), effets temps réel existants (lignes 191-216).
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.html] — Sélecteur de vue actuel (`mat-button-toggle-group`, lignes 14-19), panneaux MJ/joueur à défilement (lignes 44-53, 56-147, 149-195).
- [Source: apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts] — `buildMonth()`, `computeDisplayStatus` (via `compute-display-status.ts`), overlay heatmap (`heatmapByDate`, lignes 179-195) — algorithmes à ne pas modifier.
- [Source: apps/web/src/app/features/calendar/available-slots/available-slots.ts] — `AvailableSlotsPanel`, composant de rendu de l'ancien panneau, réutilisé tel quel comme représentation de la couche `disponibilite-groupe`.
- [Source: apps/web/src/app/core/auth/auth.service.ts:23] — `currentUser` signal, source de `defaultCalendarLayers` à lire (pas encore injecté dans `CalendarView`).
- [Source: apps/web/src/app/core/theme/tones.ts:294-299] — Six libellés de couches déjà seedés par la Story 30.4 (trois thèmes), à réutiliser sans en écrire de nouveaux.
- [Source: apps/web/src/app/app.routes.ts:44-45,79] — Les trois routes du calendrier (`parties/:id/calendar` MJ, `parties/:id/guild-calendar` joueur, `profile/calendar` personnel) et leurs `data: { mode }` — fondement de la distinction de l'encadré n°1.
- [Source: apps/api/src/availability/me-calendar.controller.ts, dto/me-calendar-query.dto.ts] — Contrat exact de l'endpoint consommé, déjà livré, non modifié par cette story.
- [Source: packages/shared/src/index.ts:33-50,585-628] — `CalendarLayerKey`, `DEFAULT_CALENDAR_LAYER_KEYS`, `MeCalendarDto` et les DTOs de couche, déjà exportés, aucun ajout attendu.
- [Source: docs/checklist.md] — Convention SSE du projet : tout nouveau composant affichant des données scopées à une Partie ou à l'utilisateur doit être évalué pour un câblage temps réel — applicable à `GET /me/calendar`, cf. Décisions à trancher.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec web pnpm test` — suite complète : 100/100 fichiers, 1560/1560 tests (baseline 98/1538, +2 fichiers/+22 tests).
- `docker compose exec web pnpm exec eslint <fichiers touchés> --fix` — 2 erreurs prettier introduites par cette story corrigées ; les 3 erreurs restantes (`noop()` vide, `_poll` non utilisé dans `calendar-view.ts`, arrow function vide dans `calendar-view.spec.ts`) confirmées pré-existantes via `git show 9ff3021:...` (baseline avant cette story), non introduites ici.
- `docker compose exec web pnpm build` — échoue uniquement sur le budget de bundle pré-existant (1,34 Mo → 1,35 Mo, mesuré des deux côtés par `git stash`/`git stash pop`, delta ~10 Ko cohérent avec les deux nouveaux composants). Aucune erreur de compilation.
- Pas de script `typecheck` dédié côté web (contrairement à l'API) — `ng test`/`ng build` type-vérifient déjà l'intégralité du code et des specs (cf. Notes de plateforme de la story) ; la suite complète verte couvre ce besoin.
- Extension Chrome non connectée dans cet environnement (`tabs_context_mcp` → « Browser extension is not connected »), comme en Story 30.3/29.14 — **VÉRIFICATION VISUELLE MANUELLE NON FAITE**, uniquement validée par tests automatisés (DOM/signals).

### Completion Notes List

- **Deux chemins d'alimentation distincts implémentés** (encadré n°1) : `activeLayers`/`meCalendar` en `CalendarView`, la source de chaque couche dérivée soit de `GET /me/calendar` (`AvailabilityService.getMyCalendar()`, nouveau, contexte personnel uniquement), soit des signaux déjà chargés (`scenarios`, `activePolls`, `availableSlots`/`heatmap`, contexte de partie, AC9 — zéro appel réseau de plus vérifié par test).
- **État des couches jamais persisté** (encadré n°2) : `activeLayers` est un signal local à `CalendarView`, initialisé au montage depuis `authSvc.currentUser()?.defaultCalendarLayers`, jamais écrit vers le serveur — aucune injection d'`AccountService`/appel `PATCH` n'existe dans ce composant. `isOverridden` compare l'ensemble complet (ajouts ET retraits), testé explicitement sur le cas retrait (AC7).
- **Décision retenue — emplacement de l'état** : signal + méthodes privées directement sur `CalendarView`, pas de service `calendar-layers.service.ts` séparé (logique de comparaison/reset restée simple, aucun autre écran ne la réutilise à ce jour) — écart documenté vs. l'anticipation de la spine, à réévaluer si un futur écran a besoin de la même logique.
- **Décision retenue — bandeau de bascule** : boutons natifs (pas de chips/toggles Material) dans `CalendarLayerToggle`, pour un DOM simple et robuste en test ; libellés réutilisés tels quels (`account.calendar_layer.<key>`, Story 30.4), une seule nouvelle clé de thème ajoutée (`cta.restore_default_layers`, sur les 3 thèmes).
- **Décision retenue — `inscriptions-ouvertes` côté partie** : dérivation séparée (`openInscriptionSeances()`, sur `scenarios()`, même règle que `buildOpenInscriptionsLayer` serveur — Story 30.5) plutôt que réutilisation d'`eligibleSeances()` (qui sert un besoin MJ différent : lancer un vote, exclut aussi les séances avec un poll CLOSED qui ne sont pas forcément fermées à l'inscription).
- **Décision retenue — fenêtre de dates de `GET /me/calendar`** : réutilise `fromDateStr()`/`toDateStr()` existants, recalculée sur la grille visible (mois : même calcul que `loadHeatmap`, extrait en `monthGridRange()` réutilisé par les deux ; semaine : `getWeekStart(d)` → `+6` jours) — rappelée à chaque navigation mois/semaine en contexte personnel (AC10), jamais en contexte de partie.
- **Décision retenue — rendu de `disponibilite-groupe` hors du panneau à défilement (Task 7/AC5)** : le bouton `.see-slots-btn`/`scrollToSlots()` et le `#slotsPanel` sont retirés ; `AvailableSlotsPanel` reste affiché en permanence dans les panneaux MJ/joueur existants (non déplacés, seulement rendus non-scrollés-vers), gaté par `isLayerActive('disponibilite-groupe')`. La section `poll-section`/`app-poll-response` (couche `votes-en-cours`) est gatée de la même façon ; le formulaire `date-range-form`/`onSearch()` reste, lui, toujours visible (pilote la plage MJ, hors notion de couche).
- **Décision retenue — heatmap Semaine** : aucun mécanisme d'overlay heatmap n'existe dans `calendar-week-view.ts` (vérifié, absent) — `disponibilite-groupe` en vue Semaine n'est donc représentée que via la section `AvailableSlotsPanel` sous la grille, pas d'overlay par cellule, écart documenté (Task 5).
- **Décision retenue — Agenda et déclarations RECURRING** : la vue Agenda liste une entrée par déclaration (pas d'expansion d'occurrences) ; une déclaration RECURRING est étiquetée « Récurrent » sans dérouler chaque date future — simplification bornée pour rester dans le périmètre de cette story (aucun AC ne demande l'expansion complète).
- **Item différé identifié, non traité par cette story** (cf. « Ce qui doit continuer de fonctionner ») : `GET /me/calendar` n'est rafraîchi par aucun signal temps réel existant aujourd'hui (aucune connexion SSE `partie:{id}` n'existe sur `profile/calendar`, sans `partieId()`) — checklist SSE du projet évaluée explicitement, jugée hors périmètre des AC de cette story (aucun AC ne l'exige), à consigner dans `deferred-work.md` lors de la revue de code.
- Non-régression complète confirmée : `computeSlotStatus`/`matchesDeclaration`/`buildMonth`/`computeDisplayStatus` non touchés ; `ConstraintPanel`/`selection.utils.ts`/`SelectionBar` (Story 30.3) non touchés ; `AvailabilityService.createDeclarationBatch()` non touché ; aucun fichier `apps/api/**` modifié (story front-only, confirmé par `git status`).

### File List

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.ts`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.html`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.scss`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.spec.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.html`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.spec.ts`

**Modifiés — Web**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (état des couches, `agendaEntries`, `visibleDeclarations`, `loadMeCalendarForRange`/`monthGridRange`, injection `AuthService`, retrait `scrollToSlots`/`ElementRef`/`ViewChild`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (bandeau de bascule, 3ᵉ option de vue, retrait `.see-slots-btn`/`#slotsPanel`, gating des couches)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss` (retrait des règles `.see-slots-btn`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (mock `AuthService`/`getMyCalendar`, nouveaux tests Tasks 8/9)
- `apps/web/src/app/core/availability/availability.service.ts` (`getMyCalendar(from, to)`)
- `apps/web/src/app/core/theme/tones.ts` (`cta.restore_default_layers`, 3 thèmes)

**Non touchés (confirmé)**
- `apps/api/**` (story front-only).
- `packages/shared/src/index.ts` (aucun type nécessaire manquant, confirmé).
- `computeSlotStatus`/`matchesDeclaration`/`buildMonth`/`computeDisplayStatus`/`ConstraintPanel`/`selection.utils.ts`/`SelectionBar`/`AvailabilityService.createDeclarationBatch()`.
- `apps/web/src/app/features/account/**` (Story 30.4).

### Change Log

- 2026-08-15 — Implémentation complète (Tasks 1-11, bmad-dev-story). Bandeau de bascule (`CalendarLayerToggle`), vue Agenda (`CalendarAgendaView`), état des couches local à `CalendarView` jamais persisté par la bascule (encadré n°2, vérifié par test), deux chemins d'alimentation distincts (encadré n°1 : `GET /me/calendar` en contexte personnel via nouvelle méthode cliente `AvailabilityService.getMyCalendar()`, signaux déjà chargés en contexte de partie sans appel réseau supplémentaire, vérifié par test). Suppression du panneau à défilement (`.see-slots-btn`/`scrollToSlots()`/`#slotsPanel`) — `AvailableSlotsPanel` devient la couche `disponibilite-groupe`, gatée par le bandeau. Web 100/100 fichiers (+2), 1560/1560 tests (+22) ; lint sans nouvelle erreur (3 erreurs pré-existantes confirmées via `git show` baseline) ; build : budget de bundle pré-existant seul point d'échec (delta ~10 Ko, confirmé via `git stash`). Story front-only, aucune suite API relancée. VÉRIFICATION VISUELLE MANUELLE NON FAITE : extension Chrome non connectée dans cet environnement. Statut → review.
- 2026-08-15 — Story créée (bmad-create-story). Deux constats consignés en encadré : (1) cette story est la troisième et dernière de FR-46 — 30.4 a livré le modèle et l'écran Compte, 30.5 a livré `GET /me/calendar` et la dérivation AD-9 ; `calendar-view.ts` n'a aujourd'hui aucune notion de couche, mais chaque couche a un mapping implicite vers un signal ou un appel déjà existant (documenté en tableau), avec deux chemins d'alimentation distincts selon la présence de `partieId()` — calendrier personnel (`profile/calendar`, sans `partieId`) via l'unique appel `GET /me/calendar`, calendrier de partie (`parties/:id/calendar`/`guild-calendar`, avec `partieId`) via les signaux déjà chargés (`activePolls`, `eligibleSeances`, `availableSlots`/`heatmap`, `scenarios`), sans aucun appel réseau supplémentaire ; (2) la bascule de couches en cours de visite ne doit jamais être persistée comme nouveau défaut (aucun appel `PATCH /me/preferences` depuis cet écran) — la pastille d'écart au défaut doit comparer l'ensemble complet des couches (ajouts ET retraits), pas seulement les couches ajoutées. Dix AC : les sept d'epics.md reformulés (AC1-AC7), plus AC8-AC10 (source `GET /me/calendar` en contexte personnel, zéro appel réseau supplémentaire en contexte de partie, rafraîchissement sur changement de plage). Story front-only : aucun changement attendu côté API ni côté `packages/shared` (tous les types nécessaires existent déjà depuis 30.4/30.5).
