---
baseline_commit: 1c46732
---

# Story 29.13: Annonces non vues signalées à la connexion

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want savoir à la connexion qu'une annonce m'attend,
so that je ne découvre pas trois jours plus tard une information qui me concernait.

## Acceptance Criteria

1. **Given** une annonce que je n'ai pas encore vue, **When** je me connecte, **Then** une notification éphémère me la signale.
2. **Given** j'ouvre l'annonce, **When** je la consulte, **Then** la notification disparaît, **and** l'état « vue » est enregistré sur mon compte.
3. **Given** j'ai lu une annonce sur mon téléphone, **When** je me connecte depuis mon ordinateur, **Then** elle ne m'est plus signalée.
4. **Given** les annonces existantes, **When** la fonctionnalité est livrée, **Then** leur portée, leur ciblage et leur emplacement de consultation sont inchangés.

## 🚨 Cette story est purement additive — ne touchez à rien d'existant

AC4 est une garde-fou explicite : `AnnouncementsService`, `AnnouncementsController`, `AnnonceCard` et l'emplacement de consultation actuel (`PartieDetail`, `ScenarioReadDialog`) **ne changent pas de comportement**. Cette story ajoute une **couche par-dessus** — un état « vue » par utilisateur et par annonce, et une notification qui l'exploite — elle ne modifie ni le stockage, la portée (Partie + Scénario optionnel) ni le ciblage (tout membre de la Partie) des annonces elles-mêmes.

## Contexte

**Treizième story de l'épic 29**, CAP-6 du SPEC / FR-13 du PRD. Elle clôt le sujet « qu'est-ce qui réclame mon attention » ouvert par la signalétique d'état des parties (Story 29.7) — mais à l'échelle du **compte**, pas d'une Partie : une annonce non vue peut se trouver dans n'importe laquelle des parties de l'utilisateur.

**Ce qui existe déjà et qu'il faut lire avant d'écrire :**
- `Announcement` (`schema.prisma:564`) — `partieId`, `scenarioId?`, `text`, `createdAt`. Aucune relation vers `User`, aucun état de lecture.
- `AnnouncementsService`/`AnnouncementsController` (`apps/api/src/announcements/`) — `create()` (MJ seul, `getOwned`), `findAll(partieId, userId)` (tout membre, `getViewable`). Route `@Controller('parties/:id/announcements')`, strictement scopée à une Partie — **aucune lecture transverse** (c'est précisément le trou identifié par la revue adversariale du PRD, cf. Références).
- `AnnonceCard` (`apps/web/.../announcements/annonce-card/`) — purement présentationnel, aucune interaction de clic/ouverture aujourd'hui. Consommé par `PartieDetail` (`campaignAnnouncements()`, annonces de campagne) et par les écrans de scénario (`ScenarioEditor`, `ScenarioReadDialog`, annonces scopées à un scénario). Ce sont les emplacements de consultation existants (AC4) — **aucun nouveau**.
- `AccountModule`/`AccountService`/`AccountController` (`apps/api/src/account/`) — porte déjà `PartieFavorite` (favoris, Story 29.8), patron **exact** à reproduire pour l'état « vue » (cf. Structural Seed ci-dessous). `AccountController` n'a **aucune route `GET` aujourd'hui** — uniquement `Patch`/`Put`/`Delete`. Cette story y ajoute la première.
- `Shell` (`apps/web/.../layout/shell/shell.ts`) — importe déjà `MatBadgeModule`, affiche déjà un badge (`openPollsCount`, depuis `OpenPollsService`) dans la barre de navigation. Mais **`OpenPollsService` fait un appel par Partie** (`fetchOne(partieId)` en boucle) — patron **legacy**, explicitement déconseillé pour du code neuf (cf. AD-3 ci-dessous, et le point M-4 de la revue adversariale du PRD qui documente déjà ce défaut sur `OpenPollsService`). **Ne pas le reproduire.**
- `AuthService` (front, `apps/web/.../core/auth/auth.service.ts`) — deux chemins font passer `currentUser` de `null` à un utilisateur : `login()` (connexion interactive) et `fetchSession()` (restauration de session via cookie, appelée par `loadSession()` depuis `App.ngOnInit()` à **chaque** chargement de l'app). **AC3 exige que les deux comptent comme « je me connecte »** — un utilisateur qui garde sa session ouverte des jours durant sans jamais retaper son mot de passe doit quand même voir la notification à sa prochaine ouverture de l'app.

## Acceptance Criteria — traduction en invariants testables

| AC | Invariant vérifiable |
| --- | --- |
| 1 | Une seule requête agrégée (jamais un appel par Partie, AD-3) renvoie les annonces non vues de **toutes** les parties de l'utilisateur. Déclenchée aussi bien après `login()` qu'après une restauration de session (`fetchSession()`). |
| 2 | Marquer une annonce vue est **idempotent** (mêmes garanties que `addFavorite()` : `P2002` avalé, `P2003` → 404) et persiste `(userId, announcementId)` — jamais un état en mémoire ni en `localStorage` (AD-1, ce serait le symptôme que FR-13 corrige). |
| 3 | Deux connexions depuis deux appareils différents, avec le même compte, lisent le **même** état « vu » — la table est interrogée par `userId`, jamais par session/appareil. |
| 4 | `AnnouncementsService`, `AnnouncementsController`, `AnnonceCard`, et toute logique de rendu dans `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog` restent **inchangés** — la suite de tests existante de ces fichiers passe sans modification. |

## Tasks / Subtasks

### Backend — schéma et lecture agrégée

- [x] Task 1 — Modèle `AnnouncementRead` (AC: #2, #3)
  - [x] `schema.prisma` — nouveau modèle relationnel `AnnouncementRead(userId, announcementId)`, contrainte d'unicité, relations inverses ajoutées sur `Announcement.reads` et `User.announcementReads`.
  - [x] Un seul champ multi-valué relationnel, aucun timestamp scalaire sur `User`.
  - [x] Migration `20260812233502_announcement_read` créée et appliquée, `prisma generate` exécuté, conteneur `api` redémarré (`Nest application successfully started` confirmé).

- [x] Task 2 — `AccountService` : lecture agrégée et marquage (AC: #1, #2, #3)
  - [x] `getUnseenAnnouncements(userId: string): Promise<AnnouncementDto[]>` implémentée dans `account.service.ts` avec exactement la requête unique prescrite (`reads: { none: { userId } }` + `partie: { OR: [...] }`), testée pour asserter un seul appel `findMany`.
  - [x] `markAnnouncementRead(userId, announcementId)` implémentée en miroir exact d'`addFavorite()` (P2002 avalé, P2003 → `NotFoundException`).
  - [x] `toDto()` d'`announcements.service.ts` exporté (aliasé `toAnnouncementDto` à l'import) et réutilisé sans duplication (AD-17).

- [x] Task 3 — `AccountController` : deux routes (AC: #1, #2)
  - [x] `GET /me/unseen-announcements` → `this.account.getUnseenAnnouncements(userId)` ajoutée.
  - [x] `PUT /me/announcements-read/:announcementId` → `this.account.markAnnouncementRead(userId, announcementId)` ajoutée, patron `addFavorite()` respecté.
  - [x] Aucune route `GET` de listage des annonces déjà vues — non ajoutée, aucune AC ne le demande.

### Backend — tests

- [x] Task 4 — Tests service et contrôleur (AC: #1, #2, #3, #4)
  - [x] `getUnseenAnnouncements()` : requête et mapping vérifiés ; l'exclusion des membres non liés à la Partie et l'inclusion MJ+membre sont prouvées par l'assertion exacte du `where` (`OR:[{mjId},{memberships:{some}}]` + `reads:{none}`), même esprit qu'AD-9.
  - [x] **Une seule requête Prisma** — `toHaveBeenCalledTimes(1)` sur `prisma.announcement.findMany` (AD-3).
  - [x] `markAnnouncementRead()` : création, idempotence P2002, P2003 → `NotFoundException`, autre erreur propagée — 4 tests.
  - [x] AC3 (multi-appareil) : test dédié simulant deux appels `getUnseenAnnouncements()` de part et d'autre d'un `markAnnouncementRead()`.
  - [x] Non-régression AC4 : `announcements.service.spec.ts`/`announcements.controller.spec.ts` non modifiés, toujours verts (44 tests, 4 suites, confirmé avec `account.service.spec.ts`).
  - [x] Contrôleur : 2 tests unitaires (session→service) + 2 tests HTTP réels (`GET`/`PUT`) dans `account.controller.spec.ts`, mock `@master-jdr/game-rules` ajouté (chaîne transitive via `toDto`).

### Frontend — détection et notification

- [x] Task 5 — `AccountService` (front) : deux méthodes (AC: #1, #2)
  - [x] `getUnseenAnnouncements(): Promise<AnnouncementDto[]>` → `GET /me/unseen-announcements` ajoutée, testée.
  - [x] `markAnnouncementRead(announcementId: string): Promise<{ ok: true }>` → `PUT /me/announcements-read/:announcementId`, corps vide, ajoutée en miroir exact d'`addFavorite()`, testée.

- [x] Task 6 — Service de détection (nouveau, `UnseenAnnouncementsService`) (AC: #1, #3)
  - [x] `providedIn: 'root'`, `unseenAnnouncements` signal + `count` computed, patron `MyPartiesService`/`OpenPollsService`.
  - [x] `effect()` sur `currentUser()` avec garde `wasLoggedIn` (transition null→utilisateur uniquement) — couvre `login()` **et** `fetchSession()`, un seul appel même si `currentUser()` est réécrit plusieurs fois après (testé explicitement, cf. `syncTheme`).
  - [x] Aucun SSE — chargement one-shot à la transition, rien d'autre.
  - [x] `markRead()` retire localement l'annonce du signal (`filter`), sans refetch serveur — testé.

- [x] Task 7 — Notification éphémère (AC: #1, #2)
  - [x] `MatSnackBar` évité — badge réactif retenu (piloté par `count()`, `0` → invisible), pas de minuteur.
  - [x] **Décision (documentée en Completion Notes)** : badge combiné sur la destination « Parties » du `Shell`, additionnant `openPollsCount()` et `unseenAnnouncementsCount()` — pas une 5e destination ni une bannière séparée, les deux notifications mènent au même point d'entrée (tableau de bord).
  - [x] Non-décoratif : `matBadgeDescription` construite dynamiquement, mentionne explicitement le nombre d'annonces non lues quand `> 0` (jamais la seule couleur/nombre visuel).

- [x] Task 8 — Marquage « vue » à la consultation (AC: #2)
  - [x] Emplacement inchangé (AC4) : `PartieDetail` (campagne), `ScenarioEditor` et `ScenarioReadDialog` (scopées). Aucun écran dédié créé.
  - [x] Un `effect()` par composant, câblé sur la liste effectivement rendue (`campaignAnnouncements()` / `scenarioAnnouncements()` / `visibleAnnouncements()` respectant `isRestricted()`+`canSeeAnnouncements()` pour le dialogue), appelle `markRead()` pour toute annonce présente dans `unseenAnnouncementsSvc.unseenAnnouncements()`. Auto-convergent : un id marqué disparaît du set, jamais re-marqué. Pas de nouveau bouton.
  - [x] Utilisateur sans annonce non vue → `unseenIds` vide → aucun appel (vérifié par construction de la boucle, pas de test dédié superflu nécessaire au-delà des tests de `UnseenAnnouncementsService`).

### Frontend — tests

- [x] Task 9 — Tests du service de détection et du câblage (AC: #1, #2, #3)
  - [x] `unseen-announcements.service.spec.ts` (5 tests) : transition null→utilisateur = un seul appel, réécritures ultérieures de `currentUser()` (syncTheme) = pas de second appel, `markRead()` retire localement sans refetch, transition utilisateur→null vide le signal.
  - [x] `shell.spec.ts` (4 tests dédiés Story 29.13) : badge combiné visible/masqué selon la somme des deux compteurs, description accessible mentionnant les annonces non lues.
  - [x] `partie-detail.spec.ts`/`scenario-editor.spec.ts`/`scenario-read-dialog.spec.ts` (2 tests dédiés chacun) : annonce visible+non-vue → `markRead(id)` exact ; annonce déjà vue ou non affichée (AC6, statut A_VENIR) → aucun appel.
  - [x] Non-régression confirmée : suite complète verte (95 fichiers, 1409 tests), `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog`/`AnnonceCard` inclus sans régression sur leur comportement préexistant.

### Review Findings

- [x] [Review][Patch] Fuite de données entre sessions dans `UnseenAnnouncementsService.load()` [apps/web/src/app/core/announcements/unseen-announcements.service.ts:43-48] — corrigé (compteur de génération, réponse en vol jetée si l'utilisateur a changé entre-temps)
- [x] [Review][Patch] `markRead()` sans gestion d'erreur ni garde anti-doublon (rejet non catché aux 3 sites d'appel, PUT dupliqués possibles) [apps/web/src/app/core/announcements/unseen-announcements.service.ts:46-48] — corrigé (try/catch + `Set` d'ids en vol)
- [x] [Review][Patch] Logique d'intersection non-vues + `markRead()` dupliquée verbatim dans 3 composants [apps/web/src/app/features/parties/partie-detail/partie-detail.ts, apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts] — corrigé (extraction dans `markVisibleAnnouncementsRead()`, `apps/web/src/app/core/announcements/unseen-announcements.service.ts`)
- [x] [Review][Defer] Message d'erreur trompeur sur P2003 (suppose toujours que c'est `announcementId` qui est invalide) [apps/api/src/account/account.service.ts:136-138] — deferred, pre-existing (mirrors `addFavorite()`'s exact pattern)
- [x] [Review][Defer] Requête `getUnseenAnnouncements()` non paginée [apps/api/src/account/account.service.ts:108-124] — deferred, pre-existing (mirrors `AnnouncementsService.findAll()`'s unpaginated convention)
- [x] [Review][Defer] `toDto(announcement: any, ...)` reste non typé [apps/api/src/announcements/announcements.service.ts] — deferred, pre-existing (signature inchangée par cette story, seul le mot-clé `export` a été ajouté)

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Fan-out par Partie pour la lecture agrégée.** C'est l'erreur qu'`OpenPollsService` a déjà commise (un appel par Partie en boucle) et que la revue adversariale du PRD (M-4) documente comme un défaut existant, pas un patron à suivre. AD-3 est explicite : *« un appel unique, jamais un appel par partie »*. Le filtre relationnel Prisma `reads: { none: { userId } }` combiné à `partie: { OR: [...] } }` fait tout en une requête — ne le remplacez pas par une boucle `for (const partie of parties)`.
2. **Timestamp scalaire au lieu d'une table relationnelle.** Un champ `User.lastAnnouncementCheckAt` semblerait plus simple, mais ne peut pas représenter « vue dans la Partie A, pas vue dans la Partie B » — exactement ce qu'AC3 vérifie. AD-1 est explicite sur ce point : état multi-valué interrogé → relationnel, jamais un scalaire, jamais une troisième forme inventée.
3. **`localStorage` pour l'état « vue ».** C'est le symptôme même que FR-13 corrige (état attaché à l'appareil, pas au compte) — l'addendum du PRD le nomme explicitement en écartant cette alternative pour le thème, même raisonnement ici.
4. **Notification pilotée par un minuteur (`MatSnackBar` par défaut).** AC2 dit qu'elle disparaît **quand l'annonce est ouverte**, pas après un délai fixe — un composant réactif sur le compteur, pas un tir unique.
5. **SSE/temps réel pour cette fonctionnalité.** AD-14 l'exclut explicitement pour tout état « strictement personnel ». Ne câblez `RealtimeService`/`userTopic` sur rien ici.
6. **Toucher `AnnouncementsService`/`AnnouncementsController`/`AnnonceCard`.** AC4 est une garde-fou : la portée, le ciblage et l'emplacement de consultation des annonces existantes ne changent pas. Cette story ajoute une couche, elle n'en modifie aucune.
7. **Dupliquer `toDto()` d'`announcements.service.ts`** plutôt que l'exporter et le réutiliser — AD-17 (extraction, jamais duplication), même principe déjà appliqué à l'utilitaire d'upload d'image (Story 29.12).

### Ce qui doit continuer de fonctionner

- **Tout le chemin `Announcement` existant** : création (MJ seul), lecture par Partie (tout membre), rendu dans `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog` via `AnnonceCard`. Aucune régression tolérée (AC4).
- **`OpenPollsService`, `PartySignalsService`, `MyPartiesService`** : non touchés, aucune dépendance croisée avec cette story.
- **Suites de référence à l'ouverture** (baseline `1c46732`) : API 54/54 suites (1121/1121 tests), Web 94/94 fichiers (1391/1391 tests). Tout écart non expliqué par les tests ajoutés est une régression.

### Hors périmètre

- **Liste des annonces déjà vues** — aucune AC ne la demande.
- **Notification en temps réel** (annonce publiée pendant que je suis connecté) — AD-14 l'exclut explicitement pour cet état personnel.
- **Compteur d'annonces non vues par Partie** dans la signalétique d'état (FR-12/Story 29.7) — cette story porte sur une notification transverse au compte, pas sur un nouveau signal de `PartySignalsDto`. Si le produit le veut plus tard, c'est une extension de la Story 29.7, pas celle-ci.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Forme exacte de la notification éphémère** — badge `Shell` (patron `openPollsCount`) ou bannière compacte. Recommandation : badge, cohérent avec l'existant, pas de nouvel élément visuel à faire approuver. Documenter le choix.
- **Cible du badge/de la notification quand plusieurs parties portent des annonces non vues** — un lien générique vers le Dashboard (où l'utilisateur navigue ensuite vers la Partie concernée) est le choix le plus simple ; un menu déroulant listant les annonces serait plus riche mais non demandé par les ACs. Recommandation : lien vers le Dashboard, garder simple.
- **Granularité du marquage « vue » dans `PartieDetail`** — marquer chaque annonce individuellement dès qu'elle est rendue, ou marquer en lot toutes les annonces visibles de la Partie à l'ouverture de l'écran ? Les deux satisfont les ACs ; le marquage en lot fait un seul appel réseau au lieu de N. Recommandation : en lot, un appel par Partie ouverte (pas un appel par annonce).

### Notes de plateforme

- **API : Jest 30 + ts-jest.** `ts-jest` ne type-vérifie pas d'un fichier à l'autre (`isolatedModules`) — après avoir exporté `toDto()` et changé la forme du filtre Prisma, lancer `pnpm typecheck` en plus des tests.
- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs — aucun nouveau champ `PartieDto`/`AnnouncementDto` introduit par cette story, donc aucune fixture à réparer cette fois (contrairement à 29.9/29.10/29.12).
- **Exécution** : tout par Docker. Après la migration Prisma, redémarrer réellement le conteneur `api` et vérifier `Nest application successfully started` dans les logs.

### Project Structure Notes

- **Backend nouveaux** : aucun fichier — tout vit dans `apps/api/src/account/` (service et contrôleur déjà en place) et la migration Prisma.
- **Backend modifiés** : `apps/api/prisma/schema.prisma` (+ modèle `AnnouncementRead`, relations sur `User`/`Announcement`), `apps/api/src/announcements/announcements.service.ts` (`toDto` exporté, aucun autre changement), `apps/api/src/account/account.service.ts` (+ 2 méthodes), `apps/api/src/account/account.controller.ts` (+ 2 routes), `apps/api/src/account/account.service.spec.ts`/`account.controller.spec.ts` (tests étendus).
- **Frontend nouveaux** : le service de détection (Task 6, nom à choisir — `UnseenAnnouncementsService` proposé) + sa spec ; le composant/élément de notification (Task 7) s'il n'est pas directement intégré à `Shell`.
- **Frontend modifiés** : `apps/web/src/app/core/account/account.service.ts` (+ 2 méthodes), `apps/web/src/app/layout/shell/shell.ts`/`.html` (câblage du badge/bannière), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` et les écrans de scénario concernés (câblage du marquage « vue », Task 8).
- **Non touchés** : `AnnouncementsService`/`AnnouncementsController`/`AnnonceCard` (AC4), `OpenPollsService`, `PartySignalsService`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.13] — Story et Acceptance Criteria, repris verbatim.
- [Source: _bmad-output/specs/spec-palier9-refonte-ui/SPEC.md#CAP-6] — Intent/critère de succès exacts : *« Une annonce lue sur téléphone n'est plus signalée à la connexion suivante sur PC »*.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-13] — Notification éphémère, portée/ciblage inchangés, état mémorisé sur le compte.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/review-adversarial.md#M-3] — Le trou identifié : `@Controller('parties/:id/announcements')` est scopé à une Partie, aucune lecture transverse n'existe ; recommande explicitement un endpoint d'agrégation plutôt qu'un fan-out.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/review-adversarial.md#M-4] — `OpenPollsService.refresh()` documenté comme un fan-out par Partie, à ne pas reproduire.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/addendum.md] — Alternative écartée : `localStorage` pour l'état « annonce vue » (même raisonnement que pour le thème, FR-2).
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Règle canonique : état multi-valué interrogé → relationnel. `AnnouncementRead(userId, announcementId)` nommé explicitement dans le Structural Seed.
- [Source: ARCHITECTURE-SPINE.md#AD-3] — Un appel unique, jamais un appel par Partie — même discipline que `GET /me/party-signals` (Story 29.7).
- [Source: ARCHITECTURE-SPINE.md#AD-4] — `/me` est une convention de routage ; l'état de compte (favoris, annonces vues) vit dans `apps/api/src/account/`.
- [Source: ARCHITECTURE-SPINE.md#AD-14] — État strictement personnel : rafraîchi localement après l'action, aucune émission SSE.
- [Source: apps/api/src/account/account.service.ts:79-102] — `addFavorite()`/`removeFavorite()` : patron exact pour `markAnnouncementRead()` (idempotence, `P2002`/`P2003`).
- [Source: apps/api/src/account/account.controller.ts:48-59] — `PUT`/`DELETE /me/favorites/:partieId` : patron exact des nouvelles routes.
- [Source: apps/api/src/announcements/announcements.service.ts] — `toDto()` (non exporté) à exporter et réutiliser ; `findAll()`/`create()` à ne pas toucher.
- [Source: apps/api/src/parties/party-signals.service.ts:28-35] — Patron de requête batchée par lot (`Promise.all`, `partieId: { in: [...] }`) — même discipline AD-3, référence si le filtre relationnel `none`/`OR` s'avère insuffisant.
- [Source: apps/web/src/app/core/auth/auth.service.ts] — `login()`/`fetchSession()` : les deux chemins qui font passer `currentUser` de `null` à un utilisateur, tous deux à couvrir (AC3).
- [Source: apps/web/src/app/core/poll/open-polls.service.ts] — Patron de service de détection transverse (signal, `computed()`, `effect()`) — **le fan-out par Partie qu'il contient n'est pas à reproduire**, seule la forme du service (signal exposé) est un bon patron.
- [Source: apps/web/src/app/layout/shell/shell.ts] — `MatBadgeModule` déjà importé, `openPollsCount` déjà câblé en badge — patron visuel de référence pour Task 7.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts:149-155] — `campaignAnnouncements()`, emplacement de consultation existant à ne pas modifier au-delà du câblage de Task 8.
- [Source: apps/web/src/app/features/announcements/annonce-card/annonce-card.ts] — Composant purement présentationnel, aucune interaction de clic aujourd'hui — confirme que le déclencheur de Task 8 est l'affichage, pas un clic.
- [Source: _bmad-output/implementation-artifacts/29-12-image-de-couverture-de-partie.md] — Story précédente : patron d'extraction/réutilisation (AD-17) transposé ici pour `toDto()`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-13 (bmad-create-story). Vérifications faites avant écriture, par lecture directe du code et des documents de planification :
  - **Le trou d'agrégation était déjà documenté** dans la revue adversariale du PRD (M-3) : `AnnouncementsController` est strictement scopé à une Partie, sans lecture transverse — confirmé par lecture directe du contrôleur. M-4 documente aussi le fan-out existant d'`OpenPollsService`, explicitement à ne pas reproduire ici.
  - **Le modèle relationnel `AnnouncementRead(userId, announcementId)` est nommé verbatim dans le Structural Seed** (AD-1, ligne 467 de l'architecture spine) — pas une invention de cette story, une décision déjà actée à l'architecture.
  - **AD-14 exclut explicitement le SSE** pour cet état — vérifié par lecture directe de la règle (« état strictement personnel… aucune émission SSE »), pas une supposition.
  - **`AccountController` n'a aujourd'hui aucune route `GET`** — vérifié par lecture directe, toutes ses routes actuelles sont `Patch`/`Put`/`Delete`. Cette story introduit la première.
  - **Deux chemins font passer `currentUser` de `null` à un utilisateur côté front** (`login()` et `fetchSession()`) — vérifié par lecture directe d'`auth.service.ts`. AC3 (multi-appareil, session déjà ouverte) exige de couvrir les deux, pas seulement la connexion interactive.
  - **`AnnonceCard` n'a aucune interaction de clic aujourd'hui** — vérifié par lecture directe, ce qui tranche la question de ce que signifie « ouvrir » une annonce : l'affichage, pas un clic dédié à construire.
  - **Filtre relationnel Prisma `reads: { none: { userId } }` combiné à un `OR` sur `mjId`/`memberships`** : technique qui satisfait AD-3 (un seul appel) sans injecter `PartiesService` dans `AccountService`, évitant ainsi le risque qu'AD-4 nomme explicitement (« Prevents : un module account qui absorberait progressivement la logique d'appartenance de PartiesService »).

- Implémentation complétée le 2026-08-13 (bmad-dev-story), les 9 tâches, TDD (red-green) à chaque étape :
  - **Décision Task 7 (notification)** : badge combiné sur la destination « Parties » du `Shell`, additionnant `openPollsCount()` et `unseenAnnouncementsCount()` dans un seul `matBadge` — pas de 5e destination ni de bannière séparée. Justification : les deux notifications (vote en attente, annonce non vue) mènent au même point d'entrée (le tableau de bord, d'où l'on rejoint la Partie concernée) ; `matBadgeDescription` reste construite dynamiquement pour nommer explicitement chaque catégorie (jamais la seule couleur/nombre).
  - **Piège évité (chaîne ESM transitive)** : `AccountService` importe désormais `toDto()` depuis `AnnouncementsService`, qui importe transitivement `CharacterService` → `@master-jdr/game-rules` (module ESM non transformé par `ts-jest`). Toute spec chargeant `AccountService`/`AccountController` sans le mock `jest.mock('@master-jdr/game-rules', …)` échoue avec `Unexpected token 'export'` — ajouté à `account.service.spec.ts` et `account.controller.spec.ts` (même patron déjà en place dans `announcements.service.spec.ts`/`scenarios.service.spec.ts`).
  - **Effect auto-convergent pour le marquage « vue »** (Task 8) : chaque composant de consultation (`PartieDetail`, `ScenarioEditor`, `ScenarioReadDialog`) câble un `effect()` qui compare la liste effectivement rendue à `unseenAnnouncementsSvc.unseenAnnouncements()` et appelle `markRead()` pour toute intersection. Comme `markRead()` retire l'id du signal partagé, l'id ne réapparaît jamais dans l'intersection au tour suivant — pas de garde `firstRun` ni de compteur d'appels nécessaire, contrairement aux effects temps réel existants de ces mêmes composants.
  - **`ScenarioReadDialog`** respecte scrupuleusement les mêmes gardes que le template (`isRestricted()` + `canSeeAnnouncements()`) via un `visibleAnnouncements` computed dédié — une annonce jamais rendue (anti-spoil AC6, scénario A_VENIR/BROUILLON) n'est jamais marquée lue.
  - Suite complète verte aux deux bouts : backend 54 suites / 1133 tests (`pnpm test` + `pnpm typecheck` sans erreur), frontend 95 fichiers / 1409 tests. Lint vérifié sur tous les fichiers touchés — aucune nouvelle dette introduite (les erreurs `no-unsafe-*` relevées préexistent sur du code non touché par cette story).

- Revue de code (bmad-code-review, 2026-08-13, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) : 0 decision-needed, 3 patches appliqués — fuite de données entre sessions dans `UnseenAnnouncementsService.load()` (poste partagé : réponse en vol appliquée après un changement d'utilisateur, corrigée par un compteur de génération), `markRead()` sans gestion d'erreur ni garde anti-doublon (rejet non catché aux 3 sites d'appel + PUT dupliqués possibles, corrigé par try/catch + `Set` d'ids en vol), logique d'intersection non-vues/`markRead()` dupliquée verbatim dans `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog` (extraite dans `markVisibleAnnouncementsRead()`). 3 items différés dans `deferred-work.md` (message d'erreur P2003 trompeur, requête non paginée, `toDto` non typé — les trois reproduisent des conventions déjà établies ailleurs dans le module), 10 écartés comme bruit (absence de garde d'appartenance sur `markAnnouncementRead` jugée sans effet observable, même raisonnement que le commentaire déjà en place sur `addFavorite()`; absence de SSE explicitement voulue par AD-14; etc.). Suite finale revérifiée : Web 95/95 fichiers (1409/1409 tests), API typecheck propre. Statut passé à `done`.

- **Correction post-review du 2026-08-13 (retour utilisateur, hors du périmètre initial de la revue de code)** : l'interprétation de « j'ouvre l'annonce » (AC2) comme « affichée à l'écran » — actée dans Task 8, revalidée par l'Acceptance Auditor lors de la revue de code — se révèle fausse à l'usage : sur `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog`, une annonce est rendue (donc marquée lue) dès l'arrivée sur l'écran, avant même que l'utilisateur n'ait eu le temps de remarquer le badge dans le `Shell`. **Décision utilisateur** : le marquage « vue » exige désormais un **clic explicite** sur l'annonce ; la fermeture sur déconnexion (déjà acquise, `unseenAnnouncements.set([])` sur la transition utilisateur→null) reste inchangée ; le rechargement de page n'a **pas** été retenu comme déclencheur de fermeture (risque de fermeture accidentelle). Remplace intégralement le mécanisme de Task 8 :
  - `AnnonceCard` (jusqu'ici purement présentationnelle et sans interaction) gagne un input `unseen` et un output `opened()` — reste sans service injecté, l'appelant (`PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog`) fournit l'état et réagit à l'événement. Affiche un libellé « Non lue » textuel (jamais la seule couleur, AC4/AC5) quand `unseen`, cliquable/`Enter` uniquement dans ce cas (`role="button"`/`tabindex` posés conditionnellement).
  - Les 3 `effect()` auto-convergents de Task 8 sont supprimés ; chaque composant expose désormais `unseenAnnouncementIds` (computed) et une méthode `markAnnouncementOpened(id)` câblée sur `(opened)`.
  - `markVisibleAnnouncementsRead()` (extraite lors de la revue de code, patch #3) est supprimée avec le mécanisme qu'elle factorisait.
  - `ScenarioReadDialog` : le computed `visibleAnnouncements` (gardes anti-spoil `isRestricted()`/`canSeeAnnouncements()`) devient sans objet — le template n'itère déjà que sur les annonces réellement affichées, donc `unseenAnnouncementIds` suffit ; supprimé.
  - Nouvelle clé de thème `announcement.unseen_label` ajoutée aux 3 thèmes (`tones.ts`).
  - Tests réécrits en conséquence dans les 3 composants + nouveaux tests `AnnonceCard` (clic/clavier, présence conditionnelle de l'indicateur). Suite finale revérifiée : Web 95/95 fichiers (1416/1416 tests), lint propre sur les fichiers touchés (erreurs préexistantes non touchées laissées en l'état).
  - **Non vérifié visuellement** (pas d'accès navigateur dans cette session) — l'utilisateur est invité à confirmer que le badge reste maintenant visible jusqu'au clic.

- **Seconde correction post-review du 2026-08-13 (retour utilisateur)** : après le clic-sur-carte ci-dessus, le badge nav reste jugé trop discret pour être remarqué (« un truc qui s'ouvre et se ferme hyper rapidement », non identifiable). L'utilisateur demande un **bandeau de type notification push**, distinct du badge, visible même hors de la Partie concernée. Décisions tranchées via question ciblée avant implémentation :
  - **Une annonce à la fois** (la plus récente — `getUnseenAnnouncements()` trie déjà par `createdAt desc`, AD-3 : aucun tri client supplémentaire nécessaire), pas d'empilement.
  - **Contenu** : nom de la Partie + texte intégral de l'annonce (jamais tronqué), pas le nom du MJ.
  - **Fermeture (bouton dédié)** : équivaut à ouvrir l'annonce — même `markRead()` persisté que le clic sur `AnnonceCard` (état partagé, `unseenAnnouncements` est le même signal des deux côtés) ; ne réapparaît jamais après fermeture, y compris après reconnexion.
  - **Clic sur le corps du bandeau** (hors bouton fermer) : navigue vers la Partie (`routerLink`), **sans** marquer lue — seuls un clic sur `AnnonceCard` ou la fermeture explicite du bandeau persistent l'état « vue ».
  - **Nom de Partie non disponible côté client sans appel serveur additionnel** (`AnnouncementDto` ne porte pas le nom de la Partie, et `AC4` interdit de toucher au DTO/contrôleur existants) — résolu par lookup local dans `MyPartiesService.allParties()`, déjà chargé par `Shell.ngOnInit()` pour le tableau de bord (Story 29.1) : **aucun changement backend**. Le bandeau reste masqué tant que ce nom n'est pas résolu (course de chargement bénigne entre les deux listes chargées en parallèle à la connexion), pas d'état de chargement dédié.
  - Implémentation : `Shell.banner` (computed combinant l'annonce non vue la plus récente et le nom de Partie correspondant) + `Shell.dismissBanner(id)`. Bandeau placé entre le `mat-toolbar` et la barre de navigation (`shell.html`), structuré en `<a routerLink>` (corps, navigation) + `<button>` séparé (fermeture) pour éviter l'anti-patron d'éléments interactifs imbriqués.
  - Tests : 5 nouveaux dans `shell.spec.ts` (absence tant qu'aucune annonce/nom non résolu, contenu affiché, navigation, fermeture → `markRead()`). Suite finale revérifiée : Web 95/95 fichiers (1421/1421 tests), lint propre.
  - **Non vérifié visuellement** (pas d'accès navigateur dans cette session) — placement exact (avant/après la barre de nav), lisibilité et déclenchement à confirmer par l'utilisateur.

- **Troisième correction post-review du 2026-08-13 (retour utilisateur)** : le clic sur le bandeau amenait bien sur la Partie, mais sur l'onglet par défaut (« Ma fiche » pour un joueur mobile) sans lien avec l'annonce — jamais scrollé jusqu'au message. Corrigé sans nouvelle question (portée resserrée, mécanisme déjà entièrement cadré par les décisions précédentes) :
  - `Shell` : le `routerLink` du bandeau distingue désormais annonce de campagne (`scenarioId` null → `/parties/:id`) et annonce scopée à un scénario (→ `/parties/:id/scenarios/:scenarioId`, route `ScenarioDetail`/`ScenarioEditor` existante, fonctionne aussi pour les Parties ONE_SHOT bien que leur scénario unique soit normalement consulté via l'onglet embarqué — route générique valide indépendamment du `kind`). Un query param `announcementId` accompagne les deux cas.
  - `AnnonceCard` gagne un `id` DOM (`announcement-<id>`, déjà unique) — aucune donnée supplémentaire nécessaire, l'id de l'annonce était déjà disponible.
  - Nouvel utilitaire partagé `scroll-to-announcement.util.ts` (`scrollToAnnouncement()`) : cible l'élément par id, réessaie sur quelques frames (`requestAnimationFrame`) si le contenu de l'onglet Angular Material n'est pas encore monté, défile (`scrollIntoView({ block: 'center' })`) et applique une mise en évidence de 2 s. Animation en opacité uniquement (transform/opacity, jamais `box-shadow`) avec garde `prefers-reduced-motion`, par analogie avec DESIGN.md §8 bien que cette section soit à l'origine scopée aux bannières de Partie.
  - `PartieDetail` : lit `announcementId` depuis `ActivatedRoute` au constructeur, force l'onglet « Détails » (index 0, où vivent les annonces de campagne) et déclenche le défilement dès que l'annonce apparaît dans `campaignAnnouncements()` — câblé APRÈS l'effect existant qui réinitialise `manualTabIndex` à chaque changement MJ/desktop (`tabSetKey()`), pour ne pas être écrasé par lui dans le cas courant (l'annonce n'apparaît qu'une fois `partie()`/`announcements()` chargés, après la résolution initiale de `isMj()`/`isDesktop()`).
  - `ScenarioEditor` : même mécanisme sans le forçage d'onglet (composant sans onglets propres), câblé sur `scenarioAnnouncements()`.
  - **Piège de plateforme découvert** : l'injection d'`ActivatedRoute` dans `ScenarioEditor` cassait 3 suites de tests qui le montent sans routeur (`scenario-editor.spec.ts` × 3 TestBed distincts, `scenario-one-shot-tab.spec.ts`, `scenario-detail.spec.ts`) — `provideRouter([])` ou un mock `ActivatedRoute` (avec `queryParamMap`, pas seulement `paramMap`) ajouté à chacun.
  - Tests : 3 nouveaux dans `partie-detail.spec.ts` (forçage d'onglet joueur mobile, défilement + mise en évidence, absence d'interférence sans query param) + 2 dans `scenario-editor.spec.ts` (défilement, absence d'interférence). `Element.prototype.scrollIntoView` stubbé (non implémenté par jsdom). Suite finale revérifiée : Web 95/95 fichiers (1426/1426 tests), lint propre sur tous les fichiers touchés (erreurs préexistantes non touchées confirmées par diff avant correction).
  - **Non vérifié visuellement** (pas d'accès navigateur dans cette session) — le rendu réel du défilement/de la mise en évidence, ainsi que le cas ONE_SHOT (route directe vs onglet embarqué), restent à valider par l'utilisateur.

### File List

**Backend — nouveaux**
- `apps/api/prisma/migrations/20260812233502_announcement_read/migration.sql`

**Backend — modifiés**
- `apps/api/prisma/schema.prisma` (modèle `AnnouncementRead`, relations `Announcement.reads`/`User.announcementReads`)
- `apps/api/src/announcements/announcements.service.ts` (`toDto` exporté)
- `apps/api/src/account/account.service.ts` (+ `getUnseenAnnouncements()`, `markAnnouncementRead()`)
- `apps/api/src/account/account.service.spec.ts` (+ 11 tests, mock `@master-jdr/game-rules`)
- `apps/api/src/account/account.controller.ts` (+ `GET /me/unseen-announcements`, `PUT /me/announcements-read/:announcementId`)
- `apps/api/src/account/account.controller.spec.ts` (+ 4 tests, mock `@master-jdr/game-rules`)

**Frontend — nouveaux**
- `apps/web/src/app/core/announcements/unseen-announcements.service.ts`
- `apps/web/src/app/core/announcements/unseen-announcements.service.spec.ts`
- `apps/web/src/app/core/announcements/scroll-to-announcement.util.ts`

**Frontend — modifiés**
- `apps/web/src/app/core/account/account.service.ts` (+ `getUnseenAnnouncements()`, `markAnnouncementRead()`)
- `apps/web/src/app/core/account/account.service.spec.ts` (+ 2 tests)
- `apps/web/src/app/layout/shell/shell.ts` (+ badge combiné `homeBadgeCount`/`homeBadgeDescription` ; + bandeau `banner` computed/`dismissBanner()`, `routerLink`/`queryParams` distinguant annonce de campagne/scénario)
- `apps/web/src/app/layout/shell/shell.html` (badge câblé sur le compteur combiné ; + bandeau `.announcement-banner`)
- `apps/web/src/app/layout/shell/shell.scss` (+ styles `.announcement-banner*`)
- `apps/web/src/app/layout/shell/shell.spec.ts` (+ 9 tests, providers `UnseenAnnouncementsService`/`MyPartiesService` étendus)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (+ `unseenAnnouncementIds` computed, `markAnnouncementOpened()`, `pendingScrollAnnouncementId` + effect de défilement/forçage d'onglet)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (marquage « vue » réécrit en clic explicite ; + 3 tests d'arrivée depuis le bandeau)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (+ `unseenAnnouncementIds` computed, `markAnnouncementOpened()`, `ActivatedRoute` injecté, `pendingScrollAnnouncementId` + effect de défilement)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (marquage « vue » réécrit en clic explicite ; `provideRouter([])`/mock `ActivatedRoute` ajoutés à 4 `TestBed` ; + 2 tests d'arrivée depuis le bandeau)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts` (`provideRouter([])` ajouté — `ScenarioEditor` embarqué requiert désormais `ActivatedRoute`)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts` (mock `ActivatedRoute` étendu avec `queryParamMap`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (+ `unseenAnnouncementIds` computed, `markAnnouncementOpened()` ; `visibleAnnouncements` supprimé, devenu sans objet)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (marquage « vue » réécrit en clic explicite)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.ts` (+ input `unseen`, output `opened()`)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.html` (indicateur « non lue », activation clic/clavier, `id` DOM `announcement-<id>`)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.scss` (styles indicateur/état cliquable, mise en évidence `--highlight`)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.spec.ts` (+ 4 tests)
- `apps/web/src/app/core/theme/tones.ts` (+ clé `announcement.unseen_label`, 3 thèmes)

### Change Log

- 2026-08-13 : Implémentation complète (9/9 tâches) — Backend : modèle `AnnouncementRead`, agrégation batchée `AccountService.getUnseenAnnouncements()`, `markAnnouncementRead()` idempotent, 2 routes `AccountController`. Frontend : `UnseenAnnouncementsService` (détection one-shot à la connexion, AD-14), badge combiné dans `Shell`, marquage « vue » auto-convergent câblé sur `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog`. Statut → `review`.
