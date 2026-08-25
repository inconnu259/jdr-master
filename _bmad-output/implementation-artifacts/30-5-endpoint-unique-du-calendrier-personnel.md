---
baseline_commit: ed62a31
---

# Story 30.5 : Endpoint unique du calendrier personnel

Status: done

Epic: 30 — Calendrier
Porte : **CAP-19** (D-6, D-13) · **AD-18** (endpoint unique) · **AD-9** (indisponibilité dérivée des séances, injection avant séparation MJ/joueur) · **AD-16** (union `CalendarLayerKey`)

---

## Story

As a utilisateur,
I want que mon calendrier se charge d'un seul coup,
So that ajouter une couche demain n'ajoute pas une requête.

---

## 🚨 Encadré n°1 — Cette story n'est pas qu'un nouvel endpoint : AD-9 (indisponibilité dérivée d'une séance) n'est PAS implémenté aujourd'hui

Vérifié dans le code : `AvailabilityService.computeSlotStatus()` (`apps/api/src/availability/availability.service.ts:627`) et `getActiveDeclarations()` (`:606`) ne connaissent QUE le modèle `AvailabilityDeclaration` — aucune trace de `Seance` nulle part dans `availability.service.ts`, ni dans `parties.service.ts` (`getAvailableSlots()`/`getHeatmap()`, lignes 899-1093, seuls appelants de `getActiveDeclarations()`). `epics.md` classe FR-33/FR-34 comme reposant sur « l'agrégation de créneaux existante » — c'est vrai du **mécanisme** (on va le réutiliser), pas de la **fonctionnalité** : personne n'a encore câblé la dérivation.

**Cette story livre donc deux choses, pas une** :
1. Le nouvel endpoint `GET /me/calendar` (AD-18), qui vit dans `AvailabilityModule`.
2. La dérivation AD-9 elle-même — modification de code **existant** dans `parties.service.ts`/`availability.service.ts`, consommé par les endpoints `/parties/:id` **déjà en place** (`getAvailableSlots`, `getHeatmap`) qui alimentent la couche « disponibilité du groupe » (30.6, hors périmètre pour l'UI, mais leur exactitude AD-9 est un AC de **cette** story).

Sans (2), les AC3, AC6 et AC7 ci-dessous ne peuvent pas être satisfaits, quel que soit le soin apporté à l'endpoint `/me/calendar` — ces AC portent sur le calendrier **d'une partie**, pas sur le calendrier personnel.

**Approche recommandée (ne casse pas `computeSlotStatus`/`matchesDeclaration`, non testés à changer) :** synthétiser, pour chaque séance datée (`poll.chosenDate ?? dateValidee`, slot `poll.chosenSlot ?? 'FULL_DAY'`) d'un participant, un objet au format `DeclarationLike` (`kind: 'UNAVAILABLE'`, `recurKind: 'PUNCTUAL'`, `dayOfWeek: null`, `startDate = endDate = date de la séance`, `expiresAt` = fin de journée de cette date) et le fusionner dans le tableau retourné pour cet utilisateur, **avant** l'appel à `computeSlotStatus`. `computeSlotStatus`/`matchesDeclaration` traitent déjà ce format nativement (aucune modification requise de leur algorithme). Concrètement : soit étendre `getActiveDeclarations()` pour inclure ces entrées synthétiques, soit ajouter une méthode sœur (`getActiveDeclarationsWithSeances()` ou équivalent) — **ne pas modifier la sémantique de `getActiveDeclarations()`** si elle a vocation à rester « déclarations réelles seulement » ailleurs (aujourd'hui ses deux seuls appelants sont `getAvailableSlots`/`getHeatmap`, donc soit convient — décision d'implémentation, documenter le choix).

**Qui est « participant » d'une séance datée ?**
- `ONE_SHOT` / `CAMPAGNE_LINEAIRE` : tous les membres de la Partie (`Membership`) + le MJ — pas de mécanisme de présence individuelle, la séance concerne toute la table.
- `CAMPAGNE_EPISODIQUE` : uniquement les utilisateurs ayant une ligne `Inscription` pour cette séance (`Inscription(seanceId, userId)`, `apps/api/prisma/schema.prisma:542-551`) — un joueur non inscrit n'est engagé sur rien. Le MJ reste participant de toutes les séances de ses propres parties (il anime la séance, quel que soit le kind) — **décision proposée, pas tranchée par les AC**, documenter le choix retenu.

**La non-fuite est structurelle par construction de cette approche** : la sortie de la dérivation est un `SlotStatus` (`UNAVAILABLE`), jamais une identité de partie/scénario — AC3 en découle automatiquement si l'approche ci-dessus est suivie à la lettre. Ne réintroduisez surtout pas une identité de partie dans ce chemin.

---

## 🚨 Encadré n°2 — Portée exacte des 5 couches de `GET /me/calendar`

`disponibilite-groupe` (la 6ᵉ clé de `CalendarLayerKey`) **n'a pas de sens hors contexte de partie** (AD-16) et l'AC5 de la Story 30.4 dit explicitement qu'elle est « simplement absente » du calendrier personnel — **décision retenue pour cette story : la clé `disponibilite-groupe` est absente de l'objet renvoyé par `GET /me/calendar`** (pas un tableau vide sous cette clé — la couche entière n'existe pas dans ce contexte). Les 5 autres clés sont, elles, **toujours présentes**, tableau vide si rien à afficher (AD-18, littéral : « une couche vide est un tableau vide, jamais une clé absente » — cette règle s'applique aux 5 couches réellement pertinentes ici, pas à celle qui ne l'est structurellement jamais).

Les 5 couches et leur source, aucune couche par appel séparé, aucune itération par partie :

| Clé | Source | Filtré par plage `[from, to]` |
|---|---|---|
| `mes-indisponibilites` | `AvailabilityDeclaration` (kind `UNAVAILABLE`) de l'utilisateur | Oui — déjà lu par `AvailabilityService`, mais `findActive()` ne filtre pas par plage aujourd'hui : à étendre ou filtrer en mémoire |
| `mes-disponibilites` | `AvailabilityDeclaration` (kind `AVAILABLE`) de l'utilisateur | Idem |
| `mes-seances` | `Seance` datées (`poll.chosenDate ?? dateValidee` dans la plage) de **toutes mes parties** (MJ ou membre) — **identité de partie incluse**, ce sont mes propres parties (AC4 : « la notion de partie tierce n'y existe pas ») | Oui |
| `votes-en-cours` | `SessionPoll` `status: 'OPEN'` de mes parties, dont au moins une option tombe dans la plage — **identité de partie incluse** | Oui (sur les options) |
| `inscriptions-ouvertes` | `Seance` de mes parties `CAMPAGNE_EPISODIQUE` avec `inscriptionMax` défini et **aucune date validée** (`poll?.chosenDate ?? dateValidee` est null — cf. garde déjà en place dans `ScenariosService.inscrire()`, ligne ~758) | **Ambigu, cf. Dev Notes** — une séance sans date validée n'a pas de position naturelle dans une plage de dates |

« Mes parties » = `Partie` où `mjId = userId` **OU** il existe une `Membership(userId, partieId)` — même patron que `AvailabilityService.affectedPartieIds()` (`availability.service.ts:59-76`), à réutiliser ou dupliquer selon ce qui minimise le couplage entre modules (`AvailabilityModule` n'importe aujourd'hui aucun autre module métier).

---

## Acceptance Criteria

Repris (reformulés en AC numérotés) de `epics.md#Story 30.5`, verbatim dans l'intention.

**AC1 — Given** une plage de dates
**When** le calendrier personnel se charge
**Then** un seul appel (`GET /me/calendar?from=...&to=...`) renvoie tout ce que les couches savent afficher
**And** aucun appel n'est émis par couche ni par partie

**AC2 — Given** la charge utile renvoyée
**When** elle est sérialisée
**Then** elle est indexée par clé de couche (`mes-indisponibilites`, `mes-disponibilites`, `mes-seances`, `votes-en-cours`, `inscriptions-ouvertes` — cf. encadré n°2 pour `disponibilite-groupe`)
**And** une couche sans contenu porte un tableau vide, jamais une clé absente (pour les 5 couches concernées)

**AC3 — Given** une séance datée appartenant à une autre partie que celle consultée
**When** elle est renvoyée dans le calendrier **d'une partie** (`getAvailableSlots`/`getHeatmap` existants, `parties.service.ts`)
**Then** elle n'apparaît que comme une indisponibilité du participant (`SlotStatus.UNAVAILABLE`)
**And** ni le nom de la partie, ni son scénario, ni ses participants ne transitent

**AC4 — Given** mon calendrier personnel
**When** mes séances y sont renvoyées (couche `mes-seances`)
**Then** elles sont explicites et légendées — toutes les séances y sont les miennes, la notion de partie tierce n'y existe pas (identité de partie/scénario incluse, ce sont mes propres parties)

**AC5 — Given** une séance dont la date est validée sans créneau propre (`dateValidee` posé, aucun `poll` lié, ou poll sans `chosenSlot`)
**When** son créneau est déterminé
**Then** il est lu sur le sondage rattaché (`poll.chosenSlot`) s'il existe, et vaut `FULL_DAY` à défaut — jamais une supposition locale à un appelant

**AC6 — Given** l'indisponibilité dérivée d'une séance
**When** elle est injectée
**Then** elle l'est dans le calcul de statut par membre, **avant** la séparation entre la vue du MJ (`AvailableSlotDto`, `getAvailableSlots`) et celle des joueurs (`AggregatedSlotDto`, `getHeatmap`/branche non-MJ de `getAvailableSlots`)
**And** les deux vues s'accordent sur le même créneau (même source de vérité, pas deux calculs séparés)

**AC7 — Given** une séance à laquelle je ne participe pas et une partie dont je ne suis pas membre
**When** je consulte n'importe quel calendrier (personnel ou d'une partie)
**Then** rien de cette partie ne m'est renvoyé

---

## Tasks / Subtasks

### Backend — AD-9 : dérivation d'indisponibilité (le vrai risque, cf. encadré n°1)

- [x] **Task 1 — Résoudre les séances datées d'un utilisateur, par kind de Partie** (AC3, AC6, AC7)
  - [x] Nouvelle méthode (emplacement à trancher — `AvailabilityService` ou nouveau helper importé par elle) qui, pour un `userId`, retourne les créneaux occupés par des séances : `{ date: Date; slot: DaySlot }[]`, à travers toutes ses parties (MJ ou `Membership`), respectant la règle « participant » de l'encadré n°1 (tous les membres pour ONE_SHOT/CAMPAGNE_LINEAIRE, `Inscription` uniquement pour CAMPAGNE_EPISODIQUE, MJ toujours inclus).
  - [x] Requête `Seance` avec `include: { poll: true, scenario: { select: { partieId: true } } }` (ou `scenario: true` si le kind de Partie est nécessaire pour la règle participant), filtrée sur date résolue non nulle (`poll.chosenDate ?? dateValidee`).
  - [x] Batch, pas de N+1 : une seule requête pour l'ensemble des `userIds` d'une Partie (même patron que `getActiveDeclarations(userIds: string[])`), appelée une fois par `getAvailableSlots`/`getHeatmap`, pas par membre.

- [x] **Task 2 — Injecter la dérivation dans `computeSlotStatus`, sans le modifier** (AC3, AC6)
  - [x] Synthétiser un objet `DeclarationLike` (`kind: 'UNAVAILABLE'`, `recurKind: 'PUNCTUAL'`, `dayOfWeek: null`, `startDate = endDate =` date de la séance à minuit UTC, `expiresAt` = fin de journée UTC) par créneau occupé résolu en Task 1.
  - [x] Fusionner ces entrées synthétiques avec les déclarations réelles retournées par `getActiveDeclarations()` (ou une variante), **avant** l'appel à `computeSlotStatus` dans `parties.service.ts` (lignes 947, 974, 1076 — les trois call sites).
  - [x] `computeSlotStatus`/`matchesDeclaration` restent **intouchés** — vérifier qu'aucun test existant sur ces méthodes ne casse (ils ne connaissent que la forme `DeclarationLike`, agnostique à son origine réelle/synthétique).

- [x] **Task 3 — Non-régression `getAvailableSlots`/`getHeatmap`** (AC3, AC6, AC7)
  - [x] Un membre d'une Partie A occupé par une séance datée de sa Partie B apparaît `UNAVAILABLE` sur le créneau concerné dans le calendrier de A, sans qu'aucun champ ne nomme B, son scénario ou ses participants.
  - [x] `AvailableSlotDto` (vue MJ) et `AggregatedSlotDto` (vue joueur) s'accordent : même créneau marqué `UNAVAILABLE` des deux côtés pour le même utilisateur.
  - [x] Un utilisateur qui ne participe à aucune séance concurrente n'est pas affecté (non-régression des tests existants de `parties.service.spec.ts`).

### Backend — `GET /me/calendar` (AD-18)

- [x] **Task 4 — Types partagés** (AC1, AC2)
  - [x] `packages/shared/src/index.ts` : DTOs d'entrée par couche — proposition (à ajuster) :
    - `mes-indisponibilites`/`mes-disponibilites` → réutiliser `AvailabilityDeclarationDto` tel quel (déjà exporté), filtré côté serveur par `kind`.
    - `mes-seances` → nouveau `MyCalendarSeanceEntry { seanceId: string; partieId: string; partieName: string; scenarioId: string; scenarioTitle: string; date: string; slot: DaySlot }`.
    - `votes-en-cours` → nouveau `MyCalendarPollEntry { pollId: string; partieId: string; partieName: string; options: { date: string; slot: DaySlot }[] }` (une entrée par poll, pas par option — le front sait déjà éclater par option si besoin, cf. `PollOptionDto`).
    - `inscriptions-ouvertes` → nouveau `MyCalendarOpenInscriptionEntry { seanceId: string; partieId: string; partieName: string; scenarioTitle: string; inscriptionMin: number; inscriptionMax: number; inscritsCount: number; jeSuisInscrit: boolean }` (pas de date — cf. Dev Notes sur l'ambiguïté de la plage pour cette couche).
    - `MeCalendarDto { 'mes-indisponibilites': AvailabilityDeclarationDto[]; 'mes-disponibilites': AvailabilityDeclarationDto[]; 'mes-seances': MyCalendarSeanceEntry[]; 'votes-en-cours': MyCalendarPollEntry[]; 'inscriptions-ouvertes': MyCalendarOpenInscriptionEntry[] }` — **`disponibilite-groupe` absente du type**, pas juste vide (cf. encadré n°2).
  - [x] Nouveau DTO de requête (query params `from`/`to`, format `YYYY-MM-DD`, même style que `getHeatmap`/`getAvailableSlots`) — valider `from <= to` et une borne de plage raisonnable (s'inspirer du plafond de 366 jours de `getAvailableSlots`, ligne 938).

- [x] **Task 5 — `me-calendar.controller.ts` + méthode de service** (AC1, AC2, AC7)
  - [x] `apps/api/src/availability/me-calendar.controller.ts` — **hébergé dans `AvailabilityModule`**, jamais un `CalendarModule` neuf (AD-18, AD-4). `@Get('me/calendar')`, `@UseGuards(AuthenticatedGuard)`, même patron que `AvailabilityController`.
  - [x] Méthode de service (nouvelle, sur `AvailabilityService` ou un service dédié colocalisé) qui résout « mes parties » (MJ ou membre), puis assemble les 5 couches en requêtes groupées (pas de boucle par partie pour les lectures Prisma elles-mêmes — `where: { partieId: { in: [...] } }` partout où c'est possible).
  - [x] `AvailabilityModule` doit pouvoir lire `Seance`/`SessionPoll`/`Inscription`/`Partie`/`Membership` — `PrismaModule` étant global (`account.service.ts`/`parties.service.ts` le confirment), aucun import de module supplémentaire n'est requis pour la lecture Prisma brute ; si la Task 1 réutilise une méthode de `PartiesService` (ex. `resolveParticipants`), alors `AvailabilityModule` doit importer `PartiesModule` — cohérent avec la flèche `AvailabilityModule --> PartiesModule` déjà actée dans le diagramme de la spine (ARCHITECTURE-SPINE.md, section mermaid). **Décision retenue : requêtes Prisma directes dans `AvailabilityService`, aucun import de `PartiesModule`** — la Task 1 n'a finalement pas eu besoin de `PartiesService.resolveParticipants` (logique différente : résolution cross-partie, pas résolution des membres d'une seule partie).

- [x] **Task 6 — Filtrage par plage `[from, to]`** (AC1)
  - [x] `mes-indisponibilites`/`mes-disponibilites` : `findActive()` ne filtre pas par plage aujourd'hui — décider si un filtrage en mémoire suffit (la Story 30.4 n'a pas touché ce point, le volume par utilisateur est faible) ou s'il faut étendre la requête Prisma. Décision d'implémentation, documenter le choix. **Retenu : filtrage en mémoire** (`declarationOverlapsRange()`), requête Prisma inchangée (toutes les déclarations actives), volume par utilisateur trop faible pour justifier une requête dédiée.
  - [x] `mes-seances`/`votes-en-cours` : filtrer sur la date résolue / les dates d'options dans `[from, to]`.
  - [x] `inscriptions-ouvertes` : cf. Dev Notes — probablement non filtrée par plage (aucune date à comparer), à documenter explicitement dans le code si c'est le choix retenu. **Retenu et documenté en commentaire** (`buildOpenInscriptionsLayer`).

### Tests

- [x] **Task 7 — Tests AD-9 (le cœur du risque)** (AC3, AC6, AC7)
  - [x] `parties.service.spec.ts` : membre d'une Partie A avec une séance datée dans une Partie B (kind ONE_SHOT/CAMPAGNE_LINEAIRE) → `UNAVAILABLE` sur le créneau dans `getAvailableSlots(A)` et `getHeatmap(A)`, aucun champ ne nomme B.
  - [x] Cas CAMPAGNE_EPISODIQUE : un membre de la Partie B non inscrit à la séance concurrente n'est PAS marqué `UNAVAILABLE` par cette séance ; un membre inscrit l'est.
  - [x] `AvailableSlotDto`/`AggregatedSlotDto` s'accordent sur le même créneau pour le même utilisateur (test croisé MJ/joueur).
  - [x] Non-régression complète de `parties.service.spec.ts`/`availability.service.spec.ts` existants — aucune assertion cassée sur des scénarios sans séance concurrente.

- [x] **Task 8 — Tests `GET /me/calendar`** (AC1, AC2, AC4, AC5, AC7)
  - [x] Un seul appel renvoie les 5 clés, chacune un tableau (vide si rien).
  - [x] `disponibilite-groupe` absente du corps de la réponse.
  - [x] Mes séances (`mes-seances`) portent l'identité de ma propre partie/scénario (pas anonymisées).
  - [x] Créneau d'une séance sans `chosenSlot` sur son poll → `FULL_DAY` ; avec `chosenSlot` → ce créneau.
  - [x] Une séance/partie dont je ne suis ni MJ ni membre n'apparaît dans aucune couche.
  - [x] Plage de dates invalide (`from > to`, plage excessive) → 400, même style que `getAvailableSlots`/`getHeatmap`. Testé au niveau service (comme `GetHeatmapDto`, aucun spec dédié n'existe pour ces DTO de query — validation déclarative class-validator + ValidationPipe globale, non testée isolément dans ce module).

### Vérification

- [x] **Task 9 — Non-régression complète**
  - [x] Suites complètes API, `pnpm typecheck`, lint sur les fichiers touchés.
  - [x] Redémarrage réel du conteneur `api`, requête `GET /me/calendar?from=...&to=...` en direct.

### Review Findings

- [x] [Review][Decision] AD-9 : une séance datée de la partie consultée elle-même n'est pas exclue de sa propre dérivation d'indisponibilité — `getSeanceDerivedUnavailability()` (`availability.service.ts:660-724`) résout toutes les parties (MJ ou membre) sans exclure la partie A actuellement consultée par `getAvailableSlots(A)`/`getHeatmap(A)`. **Décision utilisateur : comportement voulu, laisser tel quel** — une séance déjà planifiée occupe logiquement le créneau, aucun changement de code requis. À documenter explicitement dans un commentaire si une future story touche à nouveau cette méthode.

- [x] [Review][Patch] `declarationOverlapsRange` ignore `dayOfWeek` pour les déclarations RECURRING [apps/api/src/availability/availability.service.ts:825] — corrigé, itère les jours de la fenêtre d'intersection.
- [x] [Review][Patch] Dates `from`/`to` calendaires invalides (ex. `2026-02-30`) non rejetées, `NaN` se propage silencieusement [apps/api/src/availability/availability.service.ts:738] — corrigé via `parseDateOnly()` (vérifie le round-trip ISO).
- [x] [Review][Patch] `buildMySeancesLayer`/`buildOpenPollsLayer` comparent au début de journée UTC de `to`, excluant une séance/option datée plus tard le même jour [apps/api/src/availability/availability.service.ts:888,920] — corrigé à la source : `toMs` est désormais la fin de journée (`parseDateOnly(to, true)`).
- [x] [Review][Patch] `buildMySeancesLayer` n'exclut pas les séances CAMPAGNE_EPISODIQUE auxquelles je ne suis pas inscrit — incohérent avec la règle "participant" appliquée par `getSeanceDerivedUnavailability` dans le même diff [apps/api/src/availability/availability.service.ts:872-905] — corrigé, même règle réutilisée.
- [x] [Review][Patch] `parties.find(...)` en boucle (O(n·m)) au lieu d'une Map, alors que `getMyCalendar` juste en dessous utilise `partieById` [apps/api/src/availability/availability.service.ts:699] — corrigé, `partieById` introduit.
- [x] [Review][Patch] Même objet `entry` synthétique poussé par référence dans le tableau de plusieurs utilisateurs participant à la même séance [apps/api/src/availability/availability.service.ts:721] — corrigé, copie par entrée (`{ ...entry }`).
- [x] [Review][Patch] Le nouveau test end-to-end n'exerce que `getAvailableSlots` (vues MJ/joueur), jamais `getHeatmap` — AC6 mentionne explicitement les deux [apps/api/src/parties/parties.service.spec.ts:1186-1259] — corrigé, assertions `getHeatmap` ajoutées au même test.
- [x] [Review][Defer] `seance.findMany` sans borne de date inférieure dans `getSeanceDerivedUnavailability`/`getMyCalendar` — tout l'historique des séances est chargé à chaque appel, `getActiveDeclarationsWithSeances` n'exclut pas non plus les séances passées malgré son nom [apps/api/src/availability/availability.service.ts:660-724,738-820] — déféré, pré-existant au design de cette story (aucune AC ne demande de borne, optimisation de charge sans impact fonctionnel actuel)
- [x] [Review][Defer] Aucun test dédié prouvant qu'une `SessionPoll` d'une partie tierce n'apparaît jamais dans `votes-en-cours` (AC7) — structurellement protégé par le `where: { partieId: { in: partieIds } }` mais non testé explicitement [apps/api/src/availability/availability.service.ts:807-822] — déféré, risque faible (protection structurelle déjà en place)

---

## Hors périmètre

- **Tout affichage** de ces couches sur les écrans de calendrier (contrôle de bascule, vue Agenda, filtrage effectif de `calendar-view.ts`) — Story 30.6, qui consommera cet endpoint.
- **La couche `disponibilite-groupe`** en tant que telle — elle existe déjà (`getAvailableSlots`/`getHeatmap`, Story 30.4 AC6/AC7 déjà couvertes en non-régression) et n'apparaît jamais dans `GET /me/calendar` (encadré n°2).
- **Le modèle de préférences et l'écran Compte** — Story 30.4, déjà livrée.
- **Le panneau « voir les créneaux calculés »** et sa suppression — Story 30.6.

## Ce qui doit continuer de fonctionner

- `getAvailableSlots`/`getHeatmap` pour un utilisateur sans séance concurrente — comportement inchangé (Tasks 1-2 n'ajoutent que des entrées **supplémentaires**, jamais de suppression de statut existant).
- `computeSlotStatus`/`matchesDeclaration`/`isInCoveredPeriod` — algorithme **intouché** (encadré n°1).
- `AvailabilityService.create()`/`createBatch()`/`splitOccurrence()`/`update()`/`softDelete()` — non touchés par cette story.
- `calendar-view.ts` et les vues Mois/Semaine (Stories 30.1-30.3, 30.4) — strictement intouchées (aucun endpoint existant qu'elles consomment n'est modifié en signature).

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Croire que l'agrégation de créneaux « existante » couvre déjà AD-9.** Elle ne le fait pas — vérifié dans le code (encadré n°1). C'est la moitié du travail de cette story, pas un acquis.
2. **Injecter la dérivation seulement dans le nouvel endpoint `/me/calendar`**, en laissant `getAvailableSlots`/`getHeatmap` (calendrier d'une partie) sans la séance concurrente d'un membre. AC3/AC6 portent explicitement sur le calendrier **d'une partie**, pas sur le calendrier personnel.
3. **Modifier `computeSlotStatus`/`matchesDeclaration` pour leur apprendre à lire `Seance`.** Inutile et risqué (ce sont des fonctions pures déjà testées) — synthétiser des `DeclarationLike` en amont suffit et ne touche à rien d'existant.
4. **Compter tous les membres d'une CAMPAGNE_EPISODIQUE comme participants d'une séance.** Seuls les `Inscription` comptent pour ce kind — sinon un joueur non inscrit se retrouve `UNAVAILABLE` sur une séance à laquelle il n'a jamais dit qu'il venait.
5. **Renvoyer `disponibilite-groupe: []` dans `GET /me/calendar`.** Décision retenue : la clé est **absente**, pas vide (encadré n°2) — à l'inverse des 5 autres couches, où vide ≠ absent.
6. **Créer un `CalendarModule` neuf.** AD-18 est explicite : `AvailabilityModule` seulement.
7. **Laisser fuiter une identité de partie tierce.** Toute séance d'une partie où l'utilisateur n'est ni MJ ni membre doit être invisible ; toute séance d'une partie tierce visible via la dérivation AD-9 ne doit produire qu'un `SlotStatus`, jamais un nom.

### Décisions à trancher en implémentation (non tranchées par les AC)

- **Couche `inscriptions-ouvertes` et plage de dates.** Une séance en attente d'inscriptions n'a pas de date propre — l'AD-18 demande un filtrage par plage, mais rien à comparer ici. Recommandation : ne pas filtrer cette couche par `[from, to]` (retourner toutes les séances ouvertes de mes parties épisodiques), documenter ce choix en commentaire à l'endroit de l'implémentation. Story 30.6 (hors périmètre) décidera de son affichage.
- **MJ participant systématique de toutes les séances de ses parties ?** Recommandé oui (il anime chaque séance), mais pas tranché par les AC — documenter le choix retenu.
- **Emplacement exact de la logique de résolution « mes parties » et de la dérivation AD-9** — réutiliser `PartiesService`/`AvailabilityService.affectedPartieIds()` comme patron, ou écrire une requête Prisma dédiée directement dans le nouveau service. Si `PartiesModule` est importé par `AvailabilityModule` pour cela, vérifier l'absence de cycle d'import (`PartiesModule` n'importe aujourd'hui pas `AvailabilityModule` directement — `AvailabilityService` est consommé via injection dans `parties.service.ts`, sens de dépendance à confirmer avant d'ajouter l'import inverse).
- **Forme exacte des entrées `mes-seances`/`votes-en-cours`/`inscriptions-ouvertes`** — proposées en Task 4, ajustables si un champ manque à l'usage réel de la Story 30.6 (qui n'existe pas encore : ne pas sur-anticiper au-delà du raisonnable).

### Notes de plateforme

- **API : Jest 30 + ts-jest.** `ts-jest` ne type-vérifie pas d'un fichier à l'autre (`isolatedModules`) — lancer `pnpm typecheck` après toute extension de `DeclarationLike`/nouveaux exports partagés.
- **Exécution** : tout par Docker (`docker compose exec api ...`).
- **Baseline** (après 30.4, commit `ed62a31`) : API 58/58 suites, 1206 tests ; web 98/98 fichiers, 1538 tests.
- Story **front-only précédente (30.3)** avait relevé l'absence de vérification visuelle par extension Chrome dans cet environnement — sans objet ici, cette story est **backend uniquement**.

### Project Structure Notes

- **Nouveaux — API** : `apps/api/src/availability/me-calendar.controller.ts`, spec associé, éventuel nouveau fichier de service/helper pour la résolution « mes parties » + dérivation AD-9 (emplacement à trancher, cf. Décisions).
- **Modifiés — API** : `apps/api/src/availability/availability.service.ts` (nouvelle méthode de résolution des séances datées par utilisateur, éventuelle extension de `getActiveDeclarations`), `apps/api/src/parties/parties.service.ts` (`getAvailableSlots`/`getHeatmap` — injection de la dérivation avant `computeSlotStatus`, lignes ~947/974/1076), `apps/api/src/availability/availability.module.ts` (import de `PartiesModule` si Task 1 réutilise son code — sinon inchangé).
- **Modifiés — partagé** : `packages/shared/src/index.ts` (nouveaux DTOs de couche, `MeCalendarDto`).
- **Non touchés** : `apps/web/src/app/features/calendar/**` (Story 30.6), `apps/web/src/app/features/account/**` (Story 30.4, livrée), `computeSlotStatus`/`matchesDeclaration`/`isInCoveredPeriod` (algorithme intouché), tout le CRUD `AvailabilityController` existant.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.5] — Story et 7 ACs, verbatim (repris ici en AC1-AC7, avec AC2 étendu par l'encadré n°2).
- [Source: ARCHITECTURE-SPINE.md#AD-18] — Endpoint unique, hébergé dans `AvailabilityModule`, forme indexée par couche, une couche vide = tableau vide jamais clé absente (nuancé par AD-16 pour `disponibilite-groupe`).
- [Source: ARCHITECTURE-SPINE.md#AD-9] — Séances d'autres parties jamais exposées, converties en indisponibilité à la lecture, injectée avant la séparation `AvailableSlotDto`/`AggregatedSlotDto`, créneau lu sur `SessionPoll.chosenSlot` sinon `FULL_DAY`.
- [Source: ARCHITECTURE-SPINE.md#AD-16] — Union `CalendarLayerKey`, `disponibilite-groupe` sans sens hors contexte de partie.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#D-6, D-13] — Dérogations actées : exposition cross-partie des séances (contrainte de sécurité) et inscriptions ouvertes toutes parties confondues (fan-out proscrit).
- [Source: apps/api/src/availability/availability.service.ts:606-654] — `getActiveDeclarations()`/`computeSlotStatus()`/`matchesDeclaration()`, à réutiliser sans modifier leur algorithme.
- [Source: apps/api/src/availability/availability.service.ts:59-76] — `affectedPartieIds()`, patron de résolution « mes parties » (MJ + memberships) à réutiliser/dupliquer.
- [Source: apps/api/src/parties/parties.service.ts:899-1093] — `getAvailableSlots()`/`getHeatmap()`, les trois call sites de `computeSlotStatus` à amender (947, 974, 1076), aucune trace actuelle de `Seance`.
- [Source: apps/api/prisma/schema.prisma:280-296] — `SessionPoll` (`chosenDate`, `chosenSlot`, `status`).
- [Source: apps/api/prisma/schema.prisma:526-551] — `Seance` (`pollId`, `dateValidee`, `inscriptionMin/Max`), `Inscription` (`seanceId`, `userId`, unique).
- [Source: apps/api/src/scenarios/scenarios.service.ts:491-532] — `recalculateNextSession()`, patron exact de résolution de la date effective d'une séance (`poll.chosenDate ?? dateValidee`) à reproduire pour `mes-seances`/l'injection AD-9.
- [Source: apps/api/src/scenarios/scenarios.service.ts:734-810] — `inscrire()`, garde « date validée fige les inscriptions », confirme que `inscriptionMax` non-null + aucune date validée = inscriptions ouvertes.
- [Source: apps/api/src/availability/availability.controller.ts] — Patron de contrôleur (`@UseGuards(AuthenticatedGuard)`, `@CurrentUser()`) à reproduire pour `me-calendar.controller.ts`.
- [Source: packages/shared/src/index.ts:566-580] — `AvailableSlotDto`/`AggregatedSlotDto`, formes existantes à ne pas dupliquer/réinventer, seulement alimenter correctement.
- [Source: packages/shared/src/index.ts:479-491] — `AvailabilityDeclarationDto`, réutilisée telle quelle pour les couches `mes-indisponibilites`/`mes-disponibilites`.
- [Source: _bmad-output/implementation-artifacts/30-4-modele-de-couches-et-preferences.md] — Story précédente : `CalendarLayerKey`/`DEFAULT_CALENDAR_LAYER_KEYS` déjà livrés, `toAuthUser()` non concerné par celle-ci, `calendar-view.ts` toujours hors périmètre.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec api pnpm jest parties.service availability.service --silent` — suite ciblée, exécutée en boucle pendant le TDD des Tasks 1-3, 7-8.
- `docker compose exec api pnpm test --silent` — suite complète API : 58/58 suites, 1232/1232 tests.
- `docker compose exec api pnpm typecheck` — clean (`tsc --noEmit -p tsconfig.build.json`).
- `docker compose exec api pnpm eslint <fichiers touchés> --fix` — aucune erreur neuve introduite (comparé à la baseline via `git stash`/lint avant-après) ; 2 warnings `no-unsafe-argument` neufs, non bloquants (mock Prisma `any` du nouveau test end-to-end, cohérent avec la tolérance déjà présente ailleurs dans ce fichier).
- `docker compose restart api` + `POST /auth/login` (`identifier`/`password`, compte admin seedé) + `GET /me/calendar?from=...&to=...` en direct contre le conteneur réel (Task 9) : migration/redémarrage propres, réponse 200 avec les 5 clés attendues (aucune `disponibilite-groupe`), 400 correct sur `from > to`.
- Un échec isolé (`notifications.integration.spec.ts`, pollution de données entre suites sur la même base Postgres partagée) observé sur un run de la suite complète, non reproductible en isolation (`pnpm jest notifications.integration` seul → vert) ni lié aux fichiers de cette story — confirmé pré-existant/flaky, pas une régression introduite ici.

### Completion Notes List

- **AD-9 n'était effectivement pas implémenté avant cette story** (confirmé par l'encadré n°1 de la story) : `getActiveDeclarations()`/`computeSlotStatus()` ne connaissaient que `AvailabilityDeclaration`. Nouvelle méthode `AvailabilityService.getActiveDeclarationsWithSeances()` (Task 1-2) : synthétise des `DeclarationLike` `UNAVAILABLE`/`PUNCTUAL` par séance datée d'une des parties (MJ ou membre) de chaque utilisateur demandé, fusionnées avec les déclarations réelles — `computeSlotStatus`/`matchesDeclaration` n'ont **pas** été modifiés, exactement comme recommandé. `parties.service.ts` (`getAvailableSlots`/`getHeatmap`) appelle désormais cette variante au lieu de `getActiveDeclarations()` — source unique partagée par les deux vues (AC6).
- **Règle « participant » retenue** (décision documentée, non tranchée par les AC) : ONE_SHOT/CAMPAGNE_LINEAIRE → MJ + tous les membres ; CAMPAGNE_EPISODIQUE → MJ + utilisateurs `Inscription` de cette séance uniquement. Le MJ est toujours considéré participant de ses propres séances, y compris épisodiques sans y être explicitement inscrit.
- **`disponibilite-groupe` est absente du corps de `GET /me/calendar`**, pas un tableau vide (décision actée dans l'encadré n°2) — vérifié par un test dédié (`hasOwnProperty` retourne `false`).
- **`inscriptions-ouvertes` n'est pas filtrée par `[from, to]`** — une séance en attente d'inscriptions n'a pas de date propre à comparer (décision documentée en commentaire dans `buildOpenInscriptionsLayer`).
- **`mes-indisponibilites`/`mes-disponibilites` filtrées en mémoire** (pas d'extension de la requête Prisma) — décision retenue, volume par utilisateur jugé trop faible pour justifier une requête dédiée.
- **`AvailabilityModule` n'a finalement pas eu besoin d'importer `PartiesModule`** — toute la résolution « mes parties »/dérivation AD-9 se fait par requêtes Prisma directes dans `AvailabilityService` (le module Prisma étant global), contrairement à l'anticipation de la story qui envisageait de réutiliser `PartiesService.resolveParticipants()`.
- Test end-to-end ajouté dans `parties.service.spec.ts` (câblage réel `PartiesService` + `AvailabilityService`, sans mock sur `avail`) pour vérifier que la production appelle effectivement la nouvelle méthode et que la dérivation traverse jusqu'aux deux vues sans fuite d'identité — au-delà des tests unitaires déjà exhaustifs de `availability.service.spec.ts`.

### File List

**Nouveaux**
- `apps/api/src/availability/me-calendar.controller.ts`
- `apps/api/src/availability/dto/me-calendar-query.dto.ts`

**Modifiés — API**
- `apps/api/src/availability/availability.service.ts` (`getActiveDeclarationsWithSeances`, `getSeanceDerivedUnavailability`, `getMyCalendar` et ses helpers privés)
- `apps/api/src/availability/availability.service.spec.ts`
- `apps/api/src/availability/availability.module.ts` (enregistrement de `MeCalendarController`)
- `apps/api/src/parties/parties.service.ts` (`getAvailableSlots`/`getHeatmap` : appel à `getActiveDeclarationsWithSeances`)
- `apps/api/src/parties/parties.service.spec.ts` (renommage des mocks + tests AD-9 dédiés)

**Modifiés — partagé**
- `packages/shared/src/index.ts` (`MyCalendarSeanceEntry`, `MyCalendarPollEntry`, `MyCalendarOpenInscriptionEntry`, `MeCalendarDto`)

**Non touchés (confirmé)**
- `apps/web/src/app/features/calendar/**`, `apps/web/src/app/features/account/**` — hors périmètre (Story 30.6/30.4).
- `computeSlotStatus`/`matchesDeclaration`/`isInCoveredPeriod` — algorithme intouché.
- Tout le CRUD `AvailabilityController` existant (`create`/`createBatch`/`splitOccurrence`/`update`/`softDelete`).

### Change Log

- 2026-08-15 — Implémentation complète (Tasks 1-9). AD-9 (indisponibilité dérivée d'une séance) réellement câblé pour la première fois : `getActiveDeclarationsWithSeances()` synthétise des `DeclarationLike` sans modifier `computeSlotStatus`, consommé par `getAvailableSlots`/`getHeatmap` (calendrier d'une partie) ET par le nouvel endpoint `GET /me/calendar` (calendrier personnel, AD-18, 5 couches indexées, `disponibilite-groupe` absente). Suites complètes vertes : API 58/58 (1232 tests), `pnpm typecheck` propre, lint sans nouvelle erreur. Vérifié en conditions réelles contre le conteneur `api` relancé (`GET /me/calendar` 200/400). Statut → review.