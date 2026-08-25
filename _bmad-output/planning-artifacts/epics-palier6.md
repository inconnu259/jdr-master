---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md
---

# jdr-master — Epic Breakdown — Palier 6 : Dette technique accumulée

## Overview

Ce document décompose les 24 exigences fonctionnelles du PRD Palier 6 (`prd-jdr-master-2026-07-18`) et les 9 décisions d'architecture de sa spine (`architecture-jdr-master-2026-07-18`) en epics et stories implémentables. Palier de durcissement pur — aucune nouvelle capacité produit visible, critère de fin exhaustif (décision actée avec l'utilisateur, pas de re-report accepté).

## Requirements Inventory

### Functional Requirements

FR1: Un clic sur un CTA de mutation scénario (Marquer Courant, Clôturer le scénario, Participer à cette enquête, et tout CTA équivalent découvert dans le même groupe de composants) ne déclenche jamais un second appel réseau concurrent tant que le premier est en cours — garde anti-double-clic via un signal `pending` local par composant (pattern déjà établi 3x dans le projet, ex. `SeanceList.pollActionPending`), CTA visuellement désactivé pendant l'appel.

FR2: Un message d'erreur affiché après l'échec d'une action de mutation (`markCourantError`, `closeError`, `participantError`, erreur d'édition de champ narratif, et équivalents) ne reste pas affiché indéfiniment si l'état sous-jacent est rechargé/changé par ailleurs — un rechargement externe du scénario efface tout message d'erreur périmé.

FR3: Les listes de scénarios (`ScenarioTimeline`) et les composants qui en dépendent reflètent l'état réel côté serveur sans dépendre uniquement d'un remontage complet du composant : `ScenarioTimeline` se recharge si l'identifiant de Partie change sans destruction/recréation du composant ; `ScenarioEditor` n'affiche jamais un échec silencieux du chargement des participants ; le chargement de `ScenarioTimeline` (`loadScenarios()`) n'écrit jamais dans un signal d'un composant déjà démonté.

FR4: L'accès direct par URL ou le rechargement (F5) d'une fiche scénario affiche un indicateur de chargement pendant la résolution du fallback réseau, plutôt qu'une page vide sans feedback.

FR5: Un champ en cours de saisie (ex. `descriptionDraft`) ne diverge pas silencieusement d'un rechargement externe du scénario pendant que l'utilisateur tape — comportement exact (garder la saisie vs. écraser) laissé à la story.

FR6: Un personnage n'a plus qu'une seule liste d'objets d'inventaire général, chacun avec un nom, un poids, un prix facultatif et un effet facultatif — remplace les deux blocs actuels (« Équipement de groupe » texte libre + « Inventaire » structuré sans prix/effet). Un personnage existant migré conserve tous ses objets (poids par défaut `0` pour les anciennes entrées `group`, prix/effet vides pour tous). L'UI propriétaire et l'UI MJ exposent toutes deux le système unifié.

FR7: Un personnage dispose d'une section « Contenants » distincte de l'inventaire général, chaque contenant portant un nom, un prix facultatif, un poids (obligatoire) et un effet facultatif — catégorie structurellement séparée, jamais mélangée aux objets généraux.

FR8: Un personnage dispose d'une section « Animaux » distincte, chaque animal portant un nom, un prix facultatif et un effet facultatif — **sans poids** (jamais de champ poids/encombrement dans le modèle ni l'UI pour cette catégorie).

FR9: L'export PDF équipement (`mapEquipmentToPdfFields`, Story 11.1) mappe désormais les colonnes `Prix`/`Effets` de l'inventaire général et remplit les blocs « Contenant »/« Animal » du template, tous les trois actuellement laissés vides. Troncature silencieuse au-delà des limites physiques du template (3 lignes contenant, 3 lignes animal, 21 objets généraux) — même convention déjà acceptée en Story 11.1, aucune régression sur le mapping des 21 emplacements déjà en production.

FR10: Un token de réinitialisation de mot de passe n'est jamais récupérable en clair depuis une lecture de la base de données — haché via `argon2` (réutilise le mécanisme déjà en place pour `User.passwordHash`), champ `PasswordResetToken.tokenHash`.

FR11: Un changement de mot de passe réussi via le flux de réinitialisation invalide les sessions actives existantes du compte — nouvelle table d'index inverse `UserSession` (userId↔sid), ligne créée au login/supprimée au logout, toutes les lignes de l'utilisateur (et les `Session` correspondantes) supprimées lors d'un reset réussi.

FR12: Un e-mail de confirmation est envoyé au titulaire du compte après un changement de mot de passe réussi (via reset) — envoi best-effort, un échec d'envoi ne bloque jamais le reset lui-même.

FR13: En complément du rate-limit par IP déjà en place, une limitation de débit s'applique aussi par adresse e-mail ciblée sur `/auth/forgot-password` — des tentatives répétées visant la même adresse depuis des IP différentes sont limitées.

FR14: Les tokens de réinitialisation expirés ne s'accumulent pas indéfiniment en base — purge via un job planifié (`@Cron`, réutilise le pattern déjà établi par `NotificationsService.sendDueReminders`).

FR15: La validation des documents de scénario uploadés (PDF/texte) résiste mieux à un fichier délibérément malformé/polyglotte que la simple vérification de signature magique actuelle — ajoute une validation structurelle via `PDFDocument.load()` (pdf-lib, déjà une dépendance du projet) en complément de `detectDocumentMime()`.

FR16: Un portrait de personnage uploadé ne conserve aucune métadonnée EXIF (position GPS notamment) une fois stocké par l'application — nettoyage via une nouvelle dépendance (`sharp`) au moment de l'upload.

FR17: Les réponses de téléchargement de documents de scénario incluent l'en-tête `X-Content-Type-Options: nosniff`.

FR18: Les endpoints qui renvoient une liste potentiellement longue sans plafond (historique de distributions XP, liste complète des scénarios d'une Partie) supportent une pagination/limite explicite (`skip`/`take` Prisma, pas de curseur).

FR19: Le signal `ScenariosService._changed` (frontend) est scopé par Partie plutôt que global à toute l'application — une mutation sur une Partie ne déclenche plus de rechargement complet des `ScenarioTimeline` ouverts sur une Partie différente.

FR20: La liste des inscrits à une séance épisodique (`Seance.inscriptions`) est renvoyée dans un ordre déterministe (ex. par date d'inscription).

FR21: Les méthodes de mutation de `Seance` sans vérification actuelle du statut du scénario parent (`setSeanceCapacity`, `inscrire`, `desinscrire`, `validerDate`, `addSeance`) gagnent une garde cohérente — comportement exact (rejet vs. autorisation documentée) tranché méthode par méthode en story.

FR22: Les endpoints `POST` sensibles à un double envoi (ex. `POST /parties/:id/xp-distributions`) sont couverts par la garde anti-double-clic déjà posée en FR1 — le cas résiduel d'un vrai retry réseau (hors double-clic) reste un risque accepté, cohérent avec les autres non-atomicités déjà acceptées dans ce projet.

FR23: Les méthodes de `ScenariosService` qui résolvent une relation via `findUniqueOrThrow` sans gestion d'erreur dédiée ne laissent pas fuiter une erreur `500` non contrôlée si la clé étrangère se révèle orpheline — erreur explicite à la place.

FR24: La requête de dédoublonnage des invitations par e-mail (`InviteLinksService.findOrCreateForEmail`) s'appuie sur un index DB `(partieId, targetEmail)`.

### NonFunctional Requirements

NFR1: Tout token à usage unique stocké en base doit être haché (jamais en clair) — s'applique à `PasswordResetToken` (FR10) ; `InviteLink.token` reste explicitement hors scope de ce palier (non retraité).

NFR2: Aucune régression sur les fonctionnalités existantes touchées par ce palier — en particulier l'export PDF équipement déjà en production (Story 11.1, FR9) et les flux de vote de séance déjà en production (FR1-FR5).

NFR3: Critère de fin exhaustif — chaque FR listé ci-dessus doit être traité avant de considérer le palier terminé ; un item significativement plus complexe que prévu remonte à l'utilisateur avant d'être re-différé (pas de re-report silencieux, à la différence de la pratique habituelle du projet).

### Additional Requirements

- Aucun nouveau module NestJS pour ce palier (AD-9) — toutes les modifications vivent dans des modules déjà existants : `AuthModule` (FR10-FR14), `CharacterModule` (FR6-FR9, FR16), `ScenariosModule` (FR1-FR5, FR15, FR17-FR21, FR23), `InvitationsModule` implicite (FR24).
- Nouveau modèle Prisma `UserSession` (`id`, `userId` FK→`User` cascade, `sid`, `createdAt`, `@@index([userId])`) — cf. AD-3.
- `PasswordResetToken.token` renommé `tokenHash` (migration Prisma) — cf. AD-4.
- Nouvel index Prisma `@@index([partieId, targetEmail])` sur `InviteLink` — cf. FR24.
- Aucune migration Prisma pour l'inventaire équipement (AD-1) — reste dans `Character.sheetData: Json`, migration de données (pas de schéma) via script ponctuel au déploiement, jamais en lazy transform à la lecture.
- `packages/game-rules/src/ryuutama/types.ts` : `RyuutamaSheetData.equipment` restructuré (`individual` fusionne l'ancien `individual`+`group`, + `contenants`, + `animaux`) — cf. AD-1, Structural Seed de la spine.
- `packages/game-rules/src/ryuutama/equipment-pdf-field-map.ts` étendu (pas réécrit) pour mapper Prix/Effets/Contenant/Animal — cf. AD-2.
- Nouvelle dépendance `sharp` (nettoyage EXIF, FR16) — version à vérifier au moment de l'implémentation.
- Point d'entrée unique pour la création/suppression de `UserSession` : callback `POST /auth/login` (après `req.login()`) et `POST /auth/logout` (avant `req.logout()`) — cf. AD-3, jamais dans une stratégie Passport ou un guard.

### UX Design Requirements

Aucune — pas de document UX pour ce palier (aucune nouvelle capacité produit visible, cf. PRD §2 Target User).

### FR Coverage Map

FR1: Epic 13 - Garde anti-double-clic sur les mutations scénario
FR2: Epic 13 - Réinitialisation des messages d'erreur obsolètes
FR3: Epic 13 - Fraîcheur des listes affichées
FR4: Epic 13 - Indicateur de chargement sur l'accès direct à un scénario
FR5: Epic 13 - Cohérence des brouillons en édition concurrente
FR6: Epic 14 - Inventaire général unifié
FR7: Epic 14 - Section Contenants
FR8: Epic 14 - Section Animaux
FR9: Epic 14 - Export PDF équipement aligné
FR10: Epic 15 - Protection du token de reset au repos
FR11: Epic 15 - Invalidation des sessions actives au reset
FR12: Epic 15 - Confirmation par e-mail post-reset
FR13: Epic 15 - Limitation de débit par e-mail
FR14: Epic 15 - Purge des tokens expirés
FR15: Epic 16 - Détection de fichier renforcée (documents)
FR16: Epic 16 - Nettoyage EXIF des portraits
FR17: Epic 16 - En-tête de sécurité sur les téléchargements
FR18: Epic 17 - Pagination des listes non bornées
FR19: Epic 17 - Portée du signal de changement scénario
FR20: Epic 17 - Ordre déterministe des inscriptions
FR21: Epic 17 - Garde de statut sur les mutations de séance
FR22: Epic 17 - Idempotence des endpoints sensibles (garde UI)
FR23: Epic 17 - Gestion défensive des références orphelines
FR24: Epic 17 - Index de dédoublonnage des invitations

## Epic List

### Epic 13: Fiabilité perçue sur les actions scénario/séance
Un joueur ou MJ qui clique sur une action (Marquer Courant, Clôturer, Participer) ne voit plus jamais "rien ne se passe", de message d'erreur périmé, ou d'écran vide sans feedback.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 14: Inventaire d'équipement enrichi et fidèle à la fiche PDF
Un joueur gère un inventaire unifié (objets, contenants, animaux, avec prix/effet) qui correspond enfin à la vraie fiche PDF officielle, exportable sans case vide.
**FRs covered:** FR6, FR7, FR8, FR9

### Epic 15: Sécurité du compte — authentification et réinitialisation
Un utilisateur dont le mot de passe est réinitialisé (ou compromis) a la garantie que ses anciennes sessions sont coupées, son token n'est jamais lisible en clair, et il est informé par e-mail.
**FRs covered:** FR10, FR11, FR12, FR13, FR14

### Epic 16: Sécurité des fichiers uploadés
Un document ou portrait uploadé est mieux validé (PDF structurellement vérifié) et ne fuite plus de métadonnées personnelles (EXIF/GPS).
**FRs covered:** FR15, FR16, FR17

### Epic 17: Robustesse et performance internes
*(Pas de valeur utilisateur directe — maintenabilité/fiabilité technique assumée comme telle, décision utilisateur actée au PRD.)* L'application reste stable et prévisible à mesure que le volume de données augmente (pagination, ordre déterministe, gardes défensives) — aucun changement visible pour l'utilisateur final.
**FRs covered:** FR18, FR19, FR20, FR21, FR22, FR23, FR24

Aucune dépendance croisée entre les 5 epics — ordre d'implémentation libre (confirmé au PRD).

## Epic 13: Fiabilité perçue sur les actions scénario/séance

Un joueur ou MJ qui clique sur une action (Marquer Courant, Clôturer, Participer) ne voit plus jamais "rien ne se passe", de message d'erreur périmé, ou d'écran vide sans feedback.

### Story 13.1: Garde anti-double-clic et réinitialisation des erreurs sur les mutations scénario

As a joueur ou MJ,
I want qu'un clic sur une action de mutation scénario (Marquer Courant, Clôturer, Participer) ne déclenche jamais deux fois la même requête, et que les messages d'erreur périmés disparaissent quand l'état change ailleurs,
So that je ne me retrouve jamais bloqué par un état incohérent après une action.

**Acceptance Criteria:**

**Given** je clique rapidement deux fois sur un CTA de mutation (Marquer Courant, Clôturer, Participer)
**When** le premier clic a déjà déclenché une requête en cours
**Then** le second clic ne déclenche aucun appel réseau supplémentaire
**And** le CTA est visuellement désactivé pendant l'appel

**Given** un message d'erreur est affiché suite à l'échec d'une de ces actions
**When** le scénario est rechargé (signal `changed`, remontage du composant)
**Then** le message d'erreur disparaît

### Story 13.2: Fraîcheur des listes de scénarios et indicateur de chargement

As a joueur ou MJ,
I want que la chronologie des scénarios reste à jour et que l'accès direct à une fiche affiche un état de chargement,
So that je ne consulte jamais une page silencieusement vide ou obsolète.

**Acceptance Criteria:**

**Given** je change de Partie sans que `ScenarioTimeline` soit détruit/recréé
**When** l'identifiant de Partie change
**Then** la timeline se recharge avec les scénarios de la nouvelle Partie

**Given** `ScenarioEditor` échoue à charger la liste des participants
**When** l'erreur survient
**Then** un signal d'erreur cohérent avec le reste du composant s'affiche (jamais un échec silencieux)

**Given** `loadScenarios()` est en vol quand le composant `ScenarioTimeline` est démonté
**When** la requête se résout après la destruction
**Then** aucune écriture n'est tentée sur un signal du composant détruit

**Given** j'accède directement par URL ou je recharge (F5) une fiche scénario
**When** le fallback réseau est en cours de résolution
**Then** un indicateur de chargement visible est affiché, jamais une page vide sans feedback

### Story 13.3: Cohérence du brouillon de description en édition concurrente

As a MJ,
I want que ma saisie en cours dans le champ description ne soit pas silencieusement écrasée ou perdue si le scénario est rechargé pendant que je tape,
So that je ne perde jamais du texte déjà saisi sans le savoir.

**Acceptance Criteria:**

**Given** je suis en train de taper dans le champ description d'un scénario
**When** le scénario est rechargé en arrière-plan (signal `changed` déclenché ailleurs)
**Then** le comportement (conserver ma saisie vs. l'écraser par la valeur serveur) est explicite et documenté — pas un écrasement silencieux non intentionnel

## Epic 14: Inventaire d'équipement enrichi et fidèle à la fiche PDF

Un joueur gère un inventaire unifié (objets, contenants, animaux, avec prix/effet) qui correspond enfin à la vraie fiche PDF officielle, exportable sans case vide.

### Story 14.1: Modèle d'inventaire unifié — backend, validation et migration

As a joueur,
I want que mon inventaire (objets, contenants, animaux) soit stocké dans un modèle unique cohérent avec la vraie fiche PDF officielle,
So that mes anciens objets ne soient jamais perdus quand la structure évolue.

**Acceptance Criteria:**

**Given** un personnage existant avec des objets `individual` (avec poids) et `group` (texte libre, sans poids)
**When** la migration de données s'exécute (script ponctuel au déploiement)
**Then** tous les objets sont conservés dans la liste unifiée, les anciennes entrées `group` reçoivent un poids par défaut de `0`, prix et effet démarrent vides pour tous

**Given** un objet d'inventaire général
**When** il est créé ou modifié
**Then** il porte un nom, un poids (obligatoire), un prix (facultatif) et un effet (facultatif) — `validate()` (`packages/game-rules`) accepte un objet sans prix ni effet

**Given** un contenant
**When** il est créé
**Then** il porte un nom, un prix facultatif, un poids obligatoire et un effet facultatif — catégorie structurellement distincte des objets généraux

**Given** un animal
**When** il est créé
**Then** il porte un nom, un prix facultatif et un effet facultatif — **jamais** de champ poids, ni dans le modèle ni dans la validation

### Story 14.2: UI d'inventaire unifiée (objets, contenants, animaux)

As a joueur ou MJ,
I want gérer l'inventaire de mon personnage (ou de celui d'un joueur) depuis une interface unique avec objets, contenants et animaux,
So that je n'aie plus à jongler entre deux blocs incohérents (« Équipement de groupe » texte libre vs « Inventaire » structuré).

**Acceptance Criteria:**

**Given** je consulte l'onglet inventaire d'un personnage
**When** la page se charge
**Then** je vois trois sections distinctes : objets généraux, contenants, animaux — sans distinction visuelle "groupe vs individuel" héritée de l'ancien modèle

**Given** je suis propriétaire du personnage ou MJ
**When** je consulte l'inventaire
**Then** je peux ajouter/éditer un objet avec nom, poids, prix (facultatif), effet (facultatif) dans la bonne section

### Story 14.3: Export PDF équipement aligné sur le modèle enrichi

As a joueur,
I want que mon export PDF équipement affiche mes prix, effets, contenants et animaux,
So that ma fiche imprimée reflète fidèlement mon inventaire complet.

**Acceptance Criteria:**

**Given** un objet d'inventaire général avec un prix et un effet renseignés
**When** j'exporte le PDF équipement
**Then** ces valeurs apparaissent dans les colonnes `Prix`/`Effets` du template (jusqu'ici toujours vides)

**Given** des contenants et des animaux renseignés sur ma fiche
**When** j'exporte le PDF
**Then** ils apparaissent dans leurs blocs dédiés du template, dans la limite physique (3 lignes contenant, 3 lignes animal — au-delà, troncature silencieuse, même convention que les 21 objets généraux déjà en place, Story 11.1)

**Given** un personnage avec jusqu'à 21 objets généraux déjà mappés (Blocs A/B du template)
**When** j'exporte après cette évolution
**Then** aucune régression sur ce mapping déjà en production

## Epic 15: Sécurité du compte — authentification et réinitialisation

Un utilisateur dont le mot de passe est réinitialisé (ou compromis) a la garantie que ses anciennes sessions sont coupées, son token n'est jamais lisible en clair, et il est informé par e-mail.

### Story 15.1: Hachage du token de réinitialisation de mot de passe

As a utilisateur,
I want que mon token de réinitialisation de mot de passe ne soit jamais stocké en clair,
So that une fuite de la base de données ne permette pas à quelqu'un de réinitialiser mon mot de passe à ma place.

**Acceptance Criteria:**

**Given** une demande de réinitialisation est créée
**When** le token est généré
**Then** seule sa version hachée (`argon2`, `PasswordResetToken.tokenHash`) est stockée en base — jamais le token en clair

**Given** un utilisateur soumet un token de réinitialisation
**When** le token est vérifié
**Then** la comparaison se fait via `argon2.verify()`, cohérente avec le mécanisme déjà utilisé pour les mots de passe

### Story 15.2: Invalidation des sessions actives au reset de mot de passe

As a utilisateur,
I want que toutes mes sessions actives soient coupées quand je réinitialise mon mot de passe,
So that si quelqu'un d'autre avait accès à mon compte, il en soit immédiatement exclu.

**Acceptance Criteria:**

**Given** je me connecte avec succès
**When** ma session est créée
**Then** une ligne `UserSession` (userId, sid) est créée dans le callback `POST /auth/login`, juste après `req.login()`

**Given** je me déconnecte
**When** `POST /auth/logout` est appelé
**Then** la ligne `UserSession` correspondante est supprimée avant la résolution de `req.logout()`

**Given** je réinitialise mon mot de passe avec succès
**When** `AuthService.resetPassword()` s'exécute
**Then** toutes les lignes `UserSession` de mon compte sont supprimées, ainsi que les lignes `Session` correspondantes (jointure sur `sid`) — mes sessions actives ne sont plus valides

### Story 15.3: Confirmation par e-mail et limitation de débit par e-mail

As a utilisateur,
I want être informé par e-mail après un changement de mot de passe, et que les tentatives répétées ciblant mon adresse soient limitées même depuis des IP différentes,
So that je sois alerté d'un changement que je n'ai pas initié, et protégé contre un harcèlement de demandes de reset.

**Acceptance Criteria:**

**Given** mon mot de passe est réinitialisé avec succès
**When** l'opération se termine
**Then** un e-mail de confirmation m'est envoyé (best-effort — un échec d'envoi ne bloque jamais le reset)

**Given** des tentatives répétées de reset ciblent la même adresse e-mail depuis des IP différentes
**When** le seuil de limitation par e-mail est atteint
**Then** les tentatives supplémentaires sont limitées, en complément du rate-limit par IP déjà en place

### Story 15.4: Purge des tokens de réinitialisation expirés

As a mainteneur du projet,
I want que les tokens de réinitialisation expirés soient automatiquement supprimés,
So that la table `PasswordResetToken` ne grossisse pas indéfiniment.

**Acceptance Criteria:**

**Given** des tokens dont `expiresAt` est dépassé
**When** le job planifié (`@Cron`, même pattern que `NotificationsService.sendDueReminders`) s'exécute
**Then** ces tokens sont supprimés de la base

## Epic 16: Sécurité des fichiers uploadés

Un document ou portrait uploadé est mieux validé (PDF structurellement vérifié) et ne fuite plus de métadonnées personnelles (EXIF/GPS).

### Story 16.1: Détection de PDF renforcée et en-tête de sécurité sur les documents de scénario

As a MJ ou joueur,
I want que les documents PDF que j'uploade soient mieux validés, et que leurs téléchargements portent un en-tête de sécurité,
So that l'application résiste mieux à un fichier délibérément malformé.

**Acceptance Criteria:**

**Given** un fichier détecté comme PDF par sa signature magique (`detectDocumentMime()`)
**When** l'upload est traité
**Then** une validation structurelle additionnelle via `PDFDocument.load()` (pdf-lib) rejette le fichier s'il n'est pas un PDF structurellement valide

**Given** une requête de téléchargement de document de scénario
**When** la réponse est envoyée
**Then** elle inclut l'en-tête `X-Content-Type-Options: nosniff`

### Story 16.2: Nettoyage des métadonnées EXIF des portraits uploadés

As a joueur,
I want que mon portrait uploadé ne conserve pas de métadonnées EXIF (position GPS, etc.),
So that je ne diffuse pas involontairement des informations personnelles en partageant une fiche de personnage.

**Acceptance Criteria:**

**Given** un portrait avec des métadonnées EXIF (GPS ou autre)
**When** il est uploadé
**Then** aucune métadonnée EXIF n'est récupérable sur le fichier stocké par l'application (nettoyage via `sharp`)

## Epic 17: Robustesse et performance internes

*(Pas de valeur utilisateur directe — maintenabilité/fiabilité technique assumée comme telle, décision utilisateur actée au PRD.)* L'application reste stable et prévisible à mesure que le volume de données augmente (pagination, ordre déterministe, gardes défensives) — aucun changement visible pour l'utilisateur final.

Note : **FR22** (idempotence) est déjà satisfaite par la garde anti-double-clic de la Story 1.1 — pas de story dédiée, vérification croisée dans les tests de cette story-là.

### Story 17.1: Pagination des listes non bornées et ordre déterministe des inscriptions

As a mainteneur du projet,
I want que les listes qui grossissent (historique XP, scénarios d'une Partie, inscrits à une séance) restent bornées et prévisibles,
So that l'application reste stable à mesure que le volume de données augmente.

**Acceptance Criteria:**

**Given** `GET /parties/:id/xp-distributions` ou `GET /parties/:id/scenarios`
**When** la liste sous-jacente dépasse un volume raisonnable
**Then** l'endpoint supporte une pagination/limite explicite (`skip`/`take` Prisma), sans charger l'intégralité en une seule réponse non bornée

**Given** `Seance.inscriptions`
**When** la liste des inscrits est renvoyée
**Then** l'ordre est déterministe (ex. par date d'inscription) — deux chargements successifs donnent le même ordre

### Story 17.2: Gardes de statut et gestion défensive sur les mutations de séance

As a mainteneur du projet,
I want que les méthodes de mutation de séance aient un comportement explicite vis-à-vis du statut du scénario parent, et ne laissent jamais fuiter une erreur non contrôlée sur une référence orpheline,
So that le comportement du système reste prévisible même dans des cas limites.

**Acceptance Criteria:**

**Given** `setSeanceCapacity`, `inscrire`, `desinscrire`, `validerDate`, `addSeance`
**When** ces méthodes sont appelées sur une séance dont le scénario parent est `BROUILLON`/`PASSE`
**Then** le comportement (rejet ou autorisation) est explicitement décidé et testé pour chaque méthode, plutôt qu'un défaut non intentionnel

**Given** une méthode de `ScenariosService` qui résout une relation via `findUniqueOrThrow`
**When** la clé étrangère se révèle orpheline (cas normalement impossible en usage courant)
**Then** une erreur explicite est levée plutôt qu'un `500` non contrôlé

### Story 17.3: Portée du signal de changement scénario et index de dédoublonnage des invitations

As a mainteneur du projet,
I want que le signal de rechargement frontend soit scopé par Partie, et que la recherche de dédoublonnage des invitations soit indexée,
So that l'application évite du travail réseau/DB superflu à mesure que le nombre de Parties et d'invitations augmente.

**Acceptance Criteria:**

**Given** une mutation sur une Partie A
**When** `ScenariosService._changed` (frontend) est déclenché
**Then** seuls les composants `ScenarioTimeline` ouverts sur la Partie A se rechargent — pas ceux ouverts sur une autre Partie

**Given** la requête de dédoublonnage des invitations par e-mail (`InviteLinksService.findOrCreateForEmail`)
**When** elle s'exécute
**Then** elle s'appuie sur l'index DB `(partieId, targetEmail)` plutôt qu'un scan complet de la table
