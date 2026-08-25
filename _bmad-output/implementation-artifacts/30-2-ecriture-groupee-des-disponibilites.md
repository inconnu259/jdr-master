---
baseline_commit: 9f5d3637ea49bc7010560ad19395374f0d5d03c6
---

# Story 30.2 : Écriture groupée des disponibilités

Status: done

Epic: 30 — Calendrier
Porte : **FR-32** (volet « écriture groupée », D-14) · **AD-21**

---

## Story

As a utilisateur,
I want que déclarer plusieurs créneaux d'un coup ne produise qu'un seul enregistrement,
So that un geste unique ne déclenche pas une rafale de requêtes.

---

## 🚨 Encadré n°1 — Cette story livre le mécanisme, pas encore le geste

**Il n'existe aujourd'hui aucune sélection multiple dans l'interface.** `ConstraintPanel` déclare **un** créneau, pour **une** date, à la fois ; `calendar-week-view.ts` ne contient pas la moindre notion de sélection (vérifié : zéro occurrence de `selected`). Le geste de glissement qui produira N créneaux est la **Story 30.3**.

Conséquence directe sur la lecture des AC : « je déclare N créneaux en une fois » décrit le **contrat** que 30.3 consommera. Cette story livre la route groupée, sa transactionnalité et sa détection de conflits, plus la méthode cliente qui l'appelle. Elle ne construit pas d'écran de sélection, et n'a pas à en inventer un pour se prouver.

## 🚨 Encadré n°2 — AD-21 se trompe sur un point de fait, ne le recopiez pas

AD-21 écrit : *« même discipline que `AvailabilityService.create()`, qui enveloppe déjà ses écritures dans `$transaction` »*. **C'est inexact, et le vérifier prend dix secondes.** Dans `availability.service.ts`, `$transaction` n'apparaît qu'à trois endroits : les deux branches de `createWithHoles()` (RECURRING et PUNCTUAL) et `splitOccurrence()`. Le chemin principal de `create()` ne l'utilise pas : en résolution `overwrite`, il enchaîne un `updateMany()` (expiration des conflits) puis un `doCreate()` — **deux écritures séparées, sans transaction**.

Donc : `create()` n'est **pas** le modèle d'atomicité à copier. La route groupée ouvre sa **propre** transaction, englobant la totalité des écritures du lot. Ne « suivez pas le patron existant » ici, il n'existe pas.

---

## Contexte

Le module `AvailabilityModule` expose aujourd'hui cinq routes (`POST /availability`, `GET /availability`, `POST /availability/:id/split`, `PATCH /availability/:id`, `DELETE /availability/:id`). La création unitaire porte un mécanisme riche, construit par la Story 1.7 : détection de conflits (`findConflictsForCreate`), `409` portant la liste des conflits, et deux résolutions possibles choisies par l'utilisateur — `overwrite` (expire les déclarations conflictuelles) et `keep` (crée la nouvelle déclaration « à trous » autour des conflits, via `createWithHoles`).

**La route groupée n'hérite pas de ce mécanisme de résolution.** AD-21 tranche autrement : un conflit sur un seul créneau fait échouer **tout le lot**, avec un message qui nomme le créneau fautif ; l'utilisateur corrige et rejoue son geste. C'est un contrat volontairement plus simple et plus strict que celui de la création unitaire — et c'est ce qui interdit de faire passer `ConstraintPanel` par la nouvelle route (voir § Ce qui doit continuer de fonctionner).

---

## Acceptance Criteria

Les quatre premiers sont repris verbatim d'`epics.md#Story 30.2`. Les suivants comblent des trous que l'analyse a trouvés.

**AC1 — Given** je déclare N créneaux en une fois
**When** la déclaration part
**Then** elle est envoyée en un seul appel portant l'ensemble des créneaux
**And** aucune boucle d'appels n'est émise côté client

**AC2 — Given** un lot de créneaux dont l'un entre en conflit avec une déclaration existante
**When** le lot est traité
**Then** aucun créneau du lot n'est enregistré
**And** l'erreur nomme le créneau fautif

**AC3 — Given** un lot valide
**When** il est enregistré
**Then** l'écriture est transactionnelle
**And** je ne me retrouve jamais avec une semaine à moitié déclarée

**AC4 — Given** la détection de conflits existante
**When** un lot est soumis
**Then** elle est appliquée à chaque créneau du lot avant toute écriture

**AC5 — Given** deux créneaux du **même lot** qui se contredisent entre eux (par exemple `FULL_DAY` disponible et `MORNING` indisponible le même jour)
**When** le lot est soumis
**Then** il est refusé avant toute écriture
**And** l'erreur nomme les deux créneaux en cause

**AC6 — Given** un lot de N créneaux
**When** la détection de conflits s'exécute
**Then** elle ne déclenche pas N lectures de la table des déclarations
**And** la logique de conflit n'est pas réécrite en double de l'existante

**AC7 — Given** un lot enregistré avec succès
**When** les autres écrans doivent en être informés
**Then** une seule notification temps réel est émise pour l'utilisateur, pas une par créneau

**AC8 — Given** la création unitaire et son dialogue « Écraser / Garder »
**When** la route groupée est livrée
**Then** ils sont strictement inchangés
**And** le panneau de contrainte continue de passer par la route unitaire

**AC9 — Given** un lot vide, ou dépassant un plafond raisonnable de créneaux
**When** il est soumis
**Then** il est rejeté par la validation, avec un message qui dit lequel des deux cas s'applique

**AC10 — Given** un créneau du lot dont `expiresAt` est déjà passé
**When** le lot est validé
**Then** il est rejeté, comme le fait déjà la création unitaire

---

## Tasks / Subtasks

### Backend — la route groupée

- [x] **Task 1 — Contrat partagé du lot** (AC1)
  - [x] Déclarer dans `packages/shared/src/index.ts` le type de la charge utile groupée : une liste d'éléments ayant la forme d'une création unitaire, **sans** `replacingId` ni `conflictResolution` (ces deux champs n'ont aucun sens dans un lot — le premier vise une déclaration remplacée, le second une résolution que le lot n'offre pas).
  - [x] Déclarer aussi la forme de la réponse d'erreur de conflit, pour que le client la lise sans deviner.
  - [x] **Note de plateforme, nouvelle depuis la Story 29.14** : `@master-jdr/shared` est désormais importable **au runtime** depuis les specs API (`transformIgnorePatterns` corrigé dans `apps/api/package.json`). Un `jest.mock('@master-jdr/shared')` n'est plus nécessaire ; ne pas en ajouter par réflexe.

- [x] **Task 2 — DTO de validation du lot** (AC9, AC10)
  - [x] Nouveau `apps/api/src/availability/dto/create-availability-batch.dto.ts` : un tableau validé élément par élément (`@ValidateNested({ each: true })` + `@Type(() => ...)`), non vide, avec un plafond explicite (`@ArrayMinSize(1)` / `@ArrayMaxSize(...)`).
  - [x] Réutiliser les contraintes de `CreateAvailabilityDto` pour chaque élément plutôt que de les recopier — mêmes règles `@ValidateIf` sur `dayOfWeek`/`startDate`/`endDate` selon `recurKind`.
  - [x] Plafond : le dimensionner sur le geste réel visé par 30.3 (une semaine = 7 jours × 3 créneaux = 21 ; une sélection de plusieurs semaines reste plausible). Choisir une valeur, la commenter, ne pas la laisser implicite.

- [x] **Task 3 — Détection de conflits en une seule lecture** (AC4, AC6)
  - [x] `findConflictsForCreate()` fait aujourd'hui un `findMany` **par appel** : l'appeler N fois ferait N lectures. Extraire le **prédicat pur** de comparaison (le corps du `.filter()` : `kind` opposé + `slotsConflict` + `dateRangesConflict`) pour l'appliquer en mémoire à un jeu de déclarations actives lu **une seule fois**.
  - [x] `findConflictsForCreate()` doit continuer d'exister et de se comporter à l'identique — la création unitaire s'appuie dessus. La refactoriser pour qu'elle consomme le même prédicat, jamais dupliquer la logique (AC6, seconde clause).
  - [x] `slotsConflict()`, `dateRangesConflict()` et `hasWeekdayInRange()` sont déjà privés et purs : les réutiliser tels quels, ne rien réécrire.

- [x] **Task 4 — Conflits internes au lot** (AC5)
  - [x] Le prédicat existant compare une création à une déclaration **persistée**. Deux créneaux d'un même lot qui se contredisent ne sont vus par personne. Comparer les éléments du lot **entre eux** avec le même prédicat, avant toute écriture.
  - [x] Le message nomme les **deux** créneaux en cause — un seul suffirait à faire échouer le lot mais ne dirait pas à l'utilisateur ce qu'il doit corriger.

- [x] **Task 5 — Écriture transactionnelle** (AC2, AC3, AC7)
  - [x] `AvailabilityService.createBatch(userId, items)` : validation `expiresAt` de chaque élément, lecture unique des déclarations actives, conflits externes puis internes, **puis seulement** l'écriture.
  - [x] La totalité des créations dans **une seule** `$transaction` — voir encadré n°2 : ne pas prendre `create()` pour modèle.
  - [x] Un conflit lève avant toute écriture, avec la même forme de réponse `409` que la création unitaire (le client sait déjà la lire) **enrichie du créneau fautif**.
  - [x] Aucune résolution `overwrite`/`keep` : le lot échoue, l'utilisateur corrige. C'est ce que tranche AD-21.
  - [x] `emitForUser(userId)` appelé **une fois**, après le commit (AC7) — jamais dans la boucle de création.

- [x] **Task 6 — Route** (AC1)
  - [x] `POST /availability/batch` dans `AvailabilityController`, garde `AuthenticatedGuard` héritée du contrôleur, `userId` pris de `@CurrentUser()` et jamais du corps.
  - [x] Déclarer la route **avant** `POST /availability/:id/split` si un doute d'ordre de résolution existe ; vérifier le mapping réel dans les logs au démarrage.

- [x] **Task 7 — Tests backend** (AC2 à AC10)
  - [x] Lot valide de N créneaux → N déclarations créées, **un seul** `$transaction`, **un seul** `emitForUser`.
  - [x] Conflit externe sur un seul créneau → `409`, **aucune** création (vérifier l'absence d'écriture, pas seulement l'exception), message nommant le créneau.
  - [x] Conflit interne au lot (`FULL_DAY` vs `MORNING`, kinds opposés, même jour) → `409`, aucune création.
  - [x] `expiresAt` passé sur un élément → rejet du lot entier.
  - [x] Lot vide et lot au-delà du plafond → rejet par la validation.
  - [x] **AC6 explicitement** : un lot de N créneaux ne provoque qu'**une** lecture de `availabilityDeclaration.findMany` — assertion sur le nombre d'appels du mock, sinon la régression passera inaperçue.
  - [x] Non-régression : les tests existants de `create()` (conflits, `overwrite`, `keep`, `createWithHoles`) restent verts sans modification.

### Frontend — la méthode cliente

- [x] **Task 8 — `AvailabilityService.createDeclarationBatch()`** (AC1, AC8)
  - [x] Un seul `POST` vers `/availability/batch`, jamais une boucle sur `createDeclaration()`.
  - [x] Même traitement du `409` que `createDeclaration()` : `catchError` convertissant en une erreur typée que l'appelant peut lire (patron `ConflictError` existant), enrichie du créneau fautif.
  - [x] **Ne pas toucher `createDeclaration()`** ni le faire passer par la route groupée (AC8).

- [x] **Task 9 — Tests frontend**
  - [x] Un lot de N créneaux → exactement **un** appel HTTP (assertion sur le nombre de requêtes, c'est le cœur d'AC1).
  - [x] `409` → erreur typée portant le créneau fautif, remontée à l'appelant.
  - [x] Les tests existants de `createDeclaration()`/`ConstraintPanel` restent verts sans modification.

- [x] **Task 10 — Vérification de non-régression**
  - [x] Suites complètes API et web, `pnpm typecheck`, lint sur les fichiers touchés.
  - [x] Redémarrage réel du conteneur `api` et vérification du mapping `POST /availability/batch` dans les logs.

### Review Findings

- [x] [Review][Patch] AC9 : messages de validation vide/plafond non explicites ni testés — repose sur les messages par défaut de class-validator, aucun `{ message: ... }` distinguant les deux cas [apps/api/src/availability/dto/create-availability-batch.dto.ts:466-475] — corrigé : messages explicites ajoutés (`ArrayMinSize`/`ArrayMaxSize`), tests assertant le contenu du message
- [x] [Review][Patch] Conflits internes au lot : les deux entrées de `BatchConflictInfo` partagent le même `id: ''`, un code client qui indexe/dédoublonne par `id` les fusionnerait [apps/api/src/availability/availability.service.ts — `batchItemToConflictInfo`] — corrigé : id synthétique unique par index (`batch-item-${index}`), test dédié
- [x] [Review][Patch] AC7 non pinné par un test direct : aucune assertion sur le nombre d'appels `emitForUser`/`emit` pour le chemin `createBatch` (seule la taille de `created` et `$transaction` sont vérifiées) [apps/api/src/availability/availability.service.spec.ts — `describe('AvailabilityService.createBatch')`] — corrigé : test ajouté dans le describe temps réel, un seul `emit` par Partie affectée quelle que soit la taille du lot
- [x] [Review][Patch] `conflictPredicate()` : le paramètre `existing.kind`/`existing.recurKind` est typé `string` générique au lieu des unions littérales `AvailKind`/`RecurKind` — perte de garde-fou TypeScript par rapport à l'original [apps/api/src/availability/availability.service.ts — `conflictPredicate`] — corrigé : typé `AvailKind`/`RecurKind`
- [x] [Review][Patch] `createBatch()` n'a aucune garde défensive contre un tableau `items` vide si appelé hors du contrôleur (le DTO bloque ce cas via HTTP, mais le service seul ne le fait pas) [apps/api/src/availability/availability.service.ts — `createBatch`] — corrigé : garde `BadRequestException` ajoutée en tête de méthode, test dédié
- [x] [Review][Defer] TOCTOU : la détection de conflits lit les déclarations actives avant la `$transaction`, sans re-vérification pendant l'écriture — deux `createBatch()`/`create()` concurrents pour le même utilisateur pourraient committer des données mutuellement contradictoires [apps/api/src/availability/availability.service.ts — `createBatch`] — deferred, pre-existing : `create()` a exactement la même faille (lecture des conflits puis écriture non-atomique, cf. encadré n°2 de la story) et AC3 ne couvre que l'atomicité interne au lot, pas la course entre requêtes concurrentes ; hors périmètre de cette story
- [x] [Review][Defer] Boucle séquentielle de N créations `await`ées à l'intérieur de la `$transaction` — la fenêtre de verrouillage croît avec la taille du lot (jusqu'à 42 allers-retours DB séquentiels) [apps/api/src/availability/availability.service.ts — `createBatch`] — deferred, pre-existing : aucun AC n'exige un nombre d'écritures constant (seul AC6 vise les *lectures*) ; `createManyAndReturn` serait une optimisation possible mais hors scope de cette story
- [x] [Review][Defer] Doublons stricts non détectés : deux items identiques (même kind) dans le même lot ne sont jamais vus comme conflictuels entre eux, créent deux lignes DB dupliquées [apps/api/src/availability/availability.service.ts — `findInternalConflict`] — deferred, pre-existing : la création unitaire `create()` permet déjà des doublons exacts, aucun AC n'exige de déduplication
- [x] [Review][Defer] `startDate`/`endDate` inversés non validés pour les items PUNCTUAL du lot [apps/api/src/availability/dto/create-availability-batch.dto.ts] — deferred, pre-existing : `CreateAvailabilityDto` (création unitaire) a la même lacune, fidèlement recopiée comme demandé par la story
- [x] [Review][Defer] `emitForUser()` peut lever après un commit déjà réussi, renvoyant un 500 au client malgré une écriture effective (résoumission → 409 déroutant sur ses propres données) [apps/api/src/availability/availability.service.ts — `createBatch`] — deferred, pre-existing : même motif non protégé dans `create()`/`update()`/`softDelete()`/`splitOccurrence()`

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Prendre `create()` pour modèle d'atomicité.** Il ne l'est pas (encadré n°2). Le lot ouvre sa propre transaction.
2. **Faire passer `ConstraintPanel` par la route groupée.** Ce serait « unifier », mais la route groupée **n'offre pas** `overwrite`/`keep`. Le dialogue de résolution construit par la Story 1.7 disparaîtrait silencieusement, et avec lui `createWithHoles()`, tout le mécanisme SPLIT et ses tests. AC8 existe pour l'interdire.
3. **Appeler `findConflictsForCreate()` en boucle.** N appels = N `findMany`. C'est exactement le motif de fan-out que le palier combat (NFR-6), reproduit côté serveur au lieu du client. Une lecture, un prédicat appliqué N fois.
4. **Oublier les conflits internes au lot.** Aucune fonction existante ne les voit : le prédicat compare une création à des lignes **persistées**. Un lot contradictoire s'écrirait intégralement et laisserait des données incohérentes que la détection de conflits refuserait pourtant à la création unitaire.
5. **Émettre le temps réel par créneau.** `emitForUser()` fait un `findMany` sur les parties concernées : l'appeler 21 fois annule le bénéfice de l'appel unique.
6. **Reprendre le raisonnement du limiteur de débit sans le vérifier.** AD-21 et le PRD invoquent le limiteur ; le réglage réel est `ttl: 60_000, limit: 300` (`app.module.ts`), donc 21 appels ne le déclenchent pas. Les vraies raisons de l'appel unique sont l'**atomicité** (AC3) et la latence — elles suffisent largement. Ne pas sur-concevoir pour un plafond qui n'est pas le sujet, et ne pas non plus en conclure que l'appel unique est facultatif : AD-21 l'impose.

### Ce qui doit continuer de fonctionner

- `POST /availability` unitaire, son `409` porteur de conflits, et les deux résolutions `overwrite`/`keep`.
- `createWithHoles()` et tout le mécanisme SPLIT (`POST /availability/:id/split`), issus de la Story 1.7.
- `ConstraintPanel` : formulaire, dialogue de conflit, dialogue « Ce jour uniquement / Toutes les occurrences ».
- `findConflictsForCreate()` — signature et comportement identiques, quelle que soit la refactorisation interne.
- `AvailabilityService.getActiveDeclarations()` / `computeSlotStatus()`, consommés par `PartiesService` pour les créneaux calculés.

### Hors périmètre

- **Le geste de sélection par glissement** — Story 30.3. Cette story ne modifie ni `calendar-week-view` ni `calendar-month-view`.
- Les couches d'affichage et l'endpoint unique du calendrier — Stories 30.4 à 30.6, qui refondront `AvailabilityModule` par ailleurs (AD-18).
- Toute résolution de conflit dans le lot : tranchée par AD-21, l'échec est le contrat.
- La suppression groupée : les AC ne parlent que de déclaration. Ne pas l'inventer.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Plafond du lot** (Task 2). Aucun chiffre n'est imposé. Le dimensionner sur le geste de 30.3 et le commenter.
- **Forme exacte du `409` groupé.** La création unitaire renvoie `{ conflicts: ConflictInfo[] }`. Recommandation : conserver cette forme et y ajouter l'identification du créneau fautif du lot, de sorte que le client existant continue de la lire. Documenter le choix.
- **Nom de la méthode de service.** `createBatch()` est proposé ; l'aligner sur ce que 30.3 appellera.

### Notes de plateforme

- **API : Jest 30 + ts-jest.** `ts-jest` ne type-vérifie pas d'un fichier à l'autre (`isolatedModules`) — lancer `pnpm typecheck` en plus des tests, en particulier après avoir extrait le prédicat de conflit (changement de signature interne).
- **`@master-jdr/shared` importable au runtime côté API depuis la Story 29.14** — `transformIgnorePatterns` de `apps/api/package.json` fait désormais une exception pour les paquets du workspace. Les `jest.mock('@master-jdr/shared')` présents dans certains specs sont des vestiges inoffensifs ; ne pas en ajouter de nouveaux.
- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs.
- **Exécution** : tout par Docker.
- **Baseline** (après 30.1, non commitée) : API 54/54 suites, 1169 tests ; web 96/96 fichiers, 1483 tests. Build web en échec sur le seul budget de bundle pré-existant.

### Project Structure Notes

- **Nouveaux — API** : `apps/api/src/availability/dto/create-availability-batch.dto.ts`.
- **Modifiés — API** : `availability.service.ts` (extraction du prédicat, `createBatch()`), `availability.controller.ts` (+1 route), `availability.service.spec.ts`.
- **Modifiés — partagé** : `packages/shared/src/index.ts` (contrat du lot).
- **Modifiés — Web** : `apps/web/src/app/core/availability/availability.service.ts` (+1 méthode) et sa spec.
- **Non touchés** : `constraint-panel.*`, `calendar-week-view.*`, `calendar-month-view.*`, `parties.service.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.2] — Story et 4 premiers ACs, verbatim.
- [Source: ARCHITECTURE-SPINE.md#AD-21] — Appel unique, transactionnel, tout-ou-rien ; conflit nommant le créneau ; `findConflictsForCreate` appliquée à chaque créneau avant écriture. **Son affirmation sur la transactionnalité de `create()` est inexacte — voir encadré n°2.**
- [Source: prd.md#FR-32] — Écriture groupée (D-14), un seul appel, tout-ou-rien.
- [Source: epics.md#NFR-6] — Aucun appel réseau proportionnel au nombre de parties ; même discipline appliquée ici au nombre de créneaux, côté serveur comme côté client.
- [Source: apps/api/src/availability/availability.service.ts:85-123] — `create()` : validation `expiresAt`, conflits, résolutions `overwrite`/`keep`. **Aucune `$transaction` sur ce chemin.**
- [Source: apps/api/src/availability/availability.service.ts:144-163] — `findConflictsForCreate()` : un `findMany` par appel, puis un `.filter()` — le prédicat à extraire.
- [Source: apps/api/src/availability/availability.service.ts:168-299] — `createWithHoles()` : les deux seules `$transaction` du chemin de création, réservées à la résolution `keep`.
- [Source: apps/api/src/availability/availability.service.ts:320-406] — `slotsConflict()`, `hasWeekdayInRange()`, `dateRangesConflict()` : fonctions pures réutilisables telles quelles.
- [Source: apps/api/src/availability/availability.service.ts:76-84] — `emitForUser()` : à appeler une seule fois par lot (AC7).
- [Source: apps/api/src/availability/dto/create-availability.dto.ts] — Contraintes à réutiliser par élément ; `replacingId` et `conflictResolution` à ne PAS reprendre dans le lot.
- [Source: apps/api/src/availability/availability.controller.ts] — Les cinq routes existantes et le patron `@CurrentUser()`.
- [Source: apps/api/src/app.module.ts:36] — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])` : le réglage réel du limiteur invoqué par AD-21.
- [Source: apps/web/src/app/core/availability/availability.service.ts:66-96] — `createDeclaration()` et sa conversion du `409` en `ConflictError` : patron de la méthode groupée, à ne pas modifier.
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts:190-260] — Flux unitaire complet (conflit, SPLIT, création-avant-suppression) : ce que la route groupée ne doit pas absorber (AC8).
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.utils.ts] — `buildConstraintDto()` : construit **un** DTO pour **une** date ; c'est 30.3 qui produira une liste.
- [Source: _bmad-output/implementation-artifacts/30-1-retrait-dune-reponse-de-vote.md] — Story précédente : patron d'ajout d'une route à un module existant sans toucher au flux existant, et discipline d'émission temps réel.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Aucun blocage. Un seul aléa d'environnement rencontré et résolu : la spec de DTO
(`create-availability-batch.dto.spec.ts`) échouait à l'import avec
`TypeError: Reflect.getMetadata is not a function`, car aucun autre spec du module
n'importait `@Type`/`@ValidateNested` de `class-transformer` en dehors d'un contexte
NestJS déjà chargé (qui installe le polyfill `reflect-metadata` en side-effect). Fix
local : `import 'reflect-metadata';` en tête du fichier de spec — pas de changement de
configuration globale.

### Completion Notes List

- **Task 1–2** : contrat partagé (`CreateAvailabilityBatchItem`, `CreateAvailabilityBatchDto`,
  `BatchConflictInfo`, `CreateAvailabilityBatchResult`) ajouté dans `packages/shared/src/index.ts`,
  sans `replacingId`/`conflictResolution` comme prescrit. DTO de validation créé en réutilisant
  exactement les règles `@ValidateIf` de `CreateAvailabilityDto`. Plafond du lot fixé à **42**
  (documenté en commentaire : 7×3=21 pour une semaine, marge pour une sélection multi-semaines
  visée par 30.3 — décision prise en implémentation, cf. Dev Notes de la story).
- **Task 3** : `conflictPredicate()` extrait du `.filter()` de `findConflictsForCreate()` ; celle-ci
  délègue désormais à ce prédicat sans changement de comportement (tests existants inchangés et
  verts).
- **Task 4** : `findInternalConflict()` compare les éléments du lot deux à deux via le même
  prédicat (converti en forme "Date" via `batchItemAsExisting()`), retourne la première paire en
  conflit.
- **Task 5** : `createBatch()` — validation `expiresAt` par élément, **une seule** lecture
  `findMany`, conflits externes (en mémoire) puis internes, écriture dans **une seule**
  `$transaction`, `emitForUser()` appelé une fois après le commit. Forme du `409` conservée
  (`{ conflicts: [...] }`) et enrichie de `batchIndex` par conflit (`BatchConflictInfo`), y compris
  pour les conflits internes (deux entrées, une par élément fautif, `id: ''` car aucun `id`
  persisté n'existe pour un élément de lot).
- **Task 6** : route `POST /availability/batch` ajoutée avant `POST /availability/:id/split` dans
  `AvailabilityController` ; mapping vérifié dans les logs après redémarrage réel du conteneur
  `api` (`Mapped {/availability/batch, POST} route`).
- **Task 7** : 7 nouveaux tests dans `availability.service.spec.ts` (lot valide, AC6 explicite sur
  le nombre d'appels `findMany`, conflit externe, conflit interne, `expiresAt` passé) + 7 tests
  dans un nouveau `create-availability-batch.dto.spec.ts` (lot vide, plafond dépassé/exact, élément
  invalide, PUNCTUAL sans dates, `items` absent). Suite `create()` existante non modifiée, verte.
- **Task 8–9** : `AvailabilityService.createDeclarationBatch()` côté web, même patron `catchError`
  409→`ConflictError` que `createDeclaration()` (non touchée). 2 nouveaux tests
  (`HttpTestingController`) vérifiant un seul appel HTTP et la conversion du conflit.
- **Task 10** : API 55/55 suites, 1181 tests verts ; `pnpm typecheck` propre. Web 96/96 fichiers,
  1491 tests verts. Lint scopé aux fichiers touchés : aucune erreur introduite (les erreurs
  restantes dans `availability.service.ts`/`.spec.ts` — type union redondant, `MS_1D`/`_now`
  inutilisés, quelques `require-await`/`no-unsafe-*` — sont préexistantes, vérifiées identiques via
  `git stash`). Redémarrage réel du conteneur `api` : route confirmée dans les logs.
- **AC8 vérifié** : `constraint-panel.*`, `calendar-week-view.*`, `calendar-month-view.*` et
  `parties.service.ts` non touchés ; `createDeclaration()` inchangée.

### File List

- **Nouveau** : `apps/api/src/availability/dto/create-availability-batch.dto.ts`
- **Nouveau** : `apps/api/src/availability/dto/create-availability-batch.dto.spec.ts`
- **Modifié** : `packages/shared/src/index.ts`
- **Modifié** : `apps/api/src/availability/availability.service.ts`
- **Modifié** : `apps/api/src/availability/availability.controller.ts`
- **Modifié** : `apps/api/src/availability/availability.service.spec.ts`
- **Modifié** : `apps/web/src/app/core/availability/availability.service.ts`
- **Modifié** : `apps/web/src/app/core/availability/availability.service.spec.ts`

### Change Log

- 2026-08-14 — Story créée (bmad-create-story). Deux constats d'analyse consignés en encadré : (1) aucune sélection multiple n'existe dans l'interface, cette story livre le contrat que la Story 30.3 consommera ; (2) AD-21 affirme à tort que `create()` est transactionnel — vérification faite, `$transaction` n'existe que dans `createWithHoles()` et `splitOccurrence()`. Trois trous comblés par des AC supplémentaires : conflits internes au lot (AC5), lecture unique des déclarations actives (AC6), émission temps réel unique (AC7). Interdiction explicite de faire passer `ConstraintPanel` par la route groupée, qui lui ferait perdre la résolution `overwrite`/`keep` de la Story 1.7 (AC8).
- 2026-08-14 — Implémentation complète (bmad-dev-story), TDD tâche par tâche. Route `POST /availability/batch` transactionnelle et tout-ou-rien, détection de conflits externes+internes en une seule lecture SQL, émission temps réel unique, méthode cliente `createDeclarationBatch()`. Plafond du lot fixé à 42, forme du `409` enrichie de `batchIndex`. Aucune régression : API 1181/1181 tests, web 1491/1491 tests, typecheck propre.
- 2026-08-14 — Revue de code appliquée (bmad-code-review, 3 couches adversariales : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 5 patches appliqués : messages de validation explicites vide/plafond (AC9), id synthétique unique par index pour les conflits internes au lot (évite une collision `id: ''` dupliqué côté client), test direct pinant AC7 (émission unique quelle que soit la taille du lot), typage `AvailKind`/`RecurKind` de `conflictPredicate()` (au lieu de `string` générique), garde défensive contre un lot vide au niveau service. 5 items différés vers `deferred-work.md` (tous pré-existants, non introduits par cette story : TOCTOU sur la détection de conflits entre requêtes concurrentes, écritures séquentielles dans la transaction, doublons stricts non détectés, dates PUNCTUAL inversées non validées, `emitForUser()` post-commit non protégé). 3 findings écartés comme bruit (bypass NaN inatteignable via HTTP, "premier conflit gagne" conforme aux AC, tension AC8 vérifiée sans régression). API 55/55 suites, 1184 tests verts ; typecheck propre ; lint sans nouvelle erreur.
