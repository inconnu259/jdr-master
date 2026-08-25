---
baseline_commit: ad58127f00aed02f4d85afbd649761e4cc914c1a
---

# Story 30.4 : Modèle de couches et préférences

Status: done

Epic: 30 — Calendrier
Porte : **FR-46** (couches d'affichage du calendrier) · **AD-16** (préférence multi-valuée relationnelle) · **CAP-19**

---

## Story

As a utilisateur,
I want choisir ce que mon calendrier me montre,
So that je puisse me concentrer sur ce qui m'intéresse à ce moment-là.

---

## 🚨 Encadré n°1 — Cette story livre le modèle et les préférences, pas l'affichage

`epics.md` regroupe sous FR-46 le modèle des couches **et** leur rendu à l'écran. Le découpage en sous-épics ne les mélange pas : cette story (30.4) livre le **modèle** (union fermée, stockage relationnel, résolution du défaut, préférence de compte) — la **Story 30.6** (« Les couches à l'écran et la vue Agenda ») livrera le bandeau de bascule interactif et le filtrage effectif de `calendar-view.ts`. Ne construisez donc **aucun** contrôle de bascule sur les écrans de calendrier eux-mêmes dans cette story — `calendar-view.ts`, `calendar-week-view.ts`, `calendar-month-view.ts` restent **intouchés**. Le seul écran modifié côté UI est **Compte** (`features/account/`), où l'utilisateur règle son jeu de couches **par défaut** (persistant, cross-appareil) — pas les bascules temporaires de la session en cours, qui appartiennent aussi à 30.6.

Les AC5-AC7 (comportement de la couche « disponibilité du groupe » selon le contexte et le rôle) décrivent un comportement déjà **entièrement fonctionnel aujourd'hui** via `AvailableSlotDto`/`AggregatedSlotDto` (Story existante, non touchée) — ce sont des critères de **non-régression** à vérifier, pas de nouvelles fonctionnalités à construire.

## 🚨 Encadré n°2 — Le vrai risque : six points construisent un utilisateur « sûr » côté API, tous doivent inclure le nouveau champ

Il n'existe **aucune fonction centrale** aujourd'hui qui construit la forme `AuthUser` renvoyée au front — six endroits, dans deux fichiers, répètent chacun `const { passwordHash, ...safe } = user; return safe;` (vérifié, zéro helper partagé) :

| # | Fichier | Méthode | Déclenché par |
|---|---|---|---|
| 1 | `apps/api/src/auth/auth.service.ts:64` | `validateUser()` | `POST /auth/login` (via `LocalStrategy.validate()`) |
| 2 | `apps/api/src/auth/auth.service.ts:90` | `register()` (dans la transaction) | `POST /auth/register` |
| 3 | `apps/api/src/auth/session.serializer.ts:29` | `deserializeUser()` | **`GET /auth/me` — appelé à chaque chargement de page** (`AuthService.loadSession()` côté front) |
| 4 | `apps/api/src/account/account.service.ts:30` | `updateDisplayName()` | `PATCH /me/display-name` |
| 5 | `apps/api/src/account/account.service.ts:51` | `updateTheme()` | `PATCH /me/theme` |
| 6 | `apps/api/src/account/account.service.ts:73` | `updatePreferences()` | `PATCH /me/preferences` |

Le point 3 est le piège : `deserializeUser()` lit via `UsersService.findById()` puis reconstruit `req.user`, et `AuthController.me()`/`AuthController.login()` (`apps/api/src/auth/auth.controller.ts:41,51`) renvoient **`req.user` tel quel**, sans jamais repasser par `AccountService`. Si `defaultCalendarLayers` n'est ajouté qu'aux trois méthodes de `account.service.ts` (les plus « visibles »), tout rechargement de page renverra un utilisateur **sans** ce champ — violation silencieuse de type, ou pire, un champ `undefined` qui atteint la Story 30.6 sans avertissement.

**Décision imposée par cette story** : extraire un helper unique — `toAuthUser(user: User & { calendarLayers: UserCalendarLayer[] })` — qui fait le strip de `passwordHash` **et** résout `defaultCalendarLayers` en un seul endroit, réutilisé par les six points. Chacun des six doit aussi inclure la relation `calendarLayers` dans sa requête Prisma. **`UsersService.findById()` ne doit PAS recevoir cet `include` par défaut** : il est appelé ailleurs pour des besoins sans rapport (`character.service.ts:310,426,520,760,1706`, propriétaire d'une fiche pour PDF/notifications) — y ajouter la relation partout serait une jointure inutile sur cinq appels qui n'en ont aucun besoin. `session.serializer.ts` doit utiliser une requête **dédiée** (nouvelle méthode `UsersService.findByIdWithCalendarLayers()`, ou requête Prisma inline), jamais `findById()` tel quel.

---

## Contexte

`AvailabilityModule` et le calendrier (vues Mois/Semaine, Story 30.1-30.3) existent déjà et sont hors périmètre de cette story. Le compte porte aujourd'hui cinq préférences scalaires (`theme`, `hideFinishedParties`, `partiesSort`, `partiesViewMode`, `charactersSort`/`charactersViewMode`) toutes validées contre une union fermée déclarée dans `@master-jdr/shared`, écrites via `PATCH /me/preferences` (`AccountController`/`AccountService`) et deux états multi-valués relationnels (`PartieFavorite`, `AnnouncementRead`) — c'est le patron établi par **AD-1**. **AD-16** étend ce patron au cas d'une préférence qui est un *ensemble* de valeurs (les couches actives) : `UserCalendarLayer(userId, layerKey)`, une ligne par couche active, plus un marqueur `User.calendarLayersSetAt DateTime?` qui distingue « jamais réglé » (`null` → le jeu par défaut s'applique) de « explicitement réglé, y compris à vide » (une date, l'absence de ligne valant alors couche éteinte) — exactement le rôle que joue `theme: String?` pour distinguer un thème jamais choisi d'un thème choisi (AD-13).

Les six couches (FR-46, verbatim) : mes indisponibilités, mes disponibilités, mes séances confirmées, les votes en cours, les inscriptions ouvertes, et — en contexte de partie seulement — la disponibilité agrégée du groupe.

---

## Acceptance Criteria

Les sept premiers sont repris (reformulés en AC numérotés) de `epics.md#Story 30.4`, verbatim dans l'intention.

**AC1 — Given** les six couches (mes indisponibilités, mes disponibilités, mes séances confirmées, les votes en cours, les inscriptions ouvertes, la disponibilité du groupe)
**When** leurs clés sont validées
**Then** elles appartiennent à une union fermée déclarée dans `@master-jdr/shared`
**And** aucune clé libre n'est acceptée à l'écriture

**AC2 — Given** un compte qui n'a jamais réglé ses couches (`calendarLayersSetAt` null)
**When** il ouvre le calendrier (ou charge sa session)
**Then** le jeu de couches par défaut s'applique
**And** le calendrier n'est jamais vide au premier usage

**AC3 — Given** un utilisateur qui a volontairement tout éteint (`calendarLayersSetAt` renseigné, zéro ligne `UserCalendarLayer`)
**When** il revient
**Then** son choix (aucune couche active) est respecté et distinct de « jamais réglé »

**AC4 — Given** je modifie mon jeu de couches par défaut depuis mes préférences
**When** je me connecte depuis un autre appareil
**Then** ce jeu s'applique (préférence de compte, pas locale)

**AC5 — Given** la couche « disponibilité du groupe »
**When** je consulte mon calendrier personnel
**Then** elle est simplement absente de l'union effective pour cet écran — elle n'a de sens que dans une partie (comportement de lecture, non-régression, hors périmètre du modèle lui-même — cf. encadré n°1)

**AC6 — Given** la couche « disponibilité du groupe » dans le calendrier d'une partie
**When** je suis un joueur de cette partie
**Then** elle me montre des compteurs agrégés, sans identité (`AggregatedSlotDto`, déjà en place, non-régression à vérifier)

**AC7 — Given** cette même couche
**When** je suis le MJ de la partie
**Then** elle me montre la disponibilité par membre, nommément (`AvailableSlotDto`, déjà en place, non-régression à vérifier)
**And** aucune troisième forme d'agrégation n'est introduite par cette story

**AC8 — Given** un utilisateur authentifié, quel que soit le point d'entrée (connexion, chargement de session, mise à jour d'une autre préférence)
**When** son objet utilisateur est renvoyé par l'API
**Then** il porte toujours `defaultCalendarLayers` résolu (jamais `undefined`), via les six points d'écriture-lecture de l'encadré n°2

**AC9 — Given** un lot de couches soumis à l'écriture
**When** il contient une clé hors union, dépasse six éléments, ou contient des doublons
**Then** les clés hors union et le dépassement de taille sont rejetés (400) ; les doublons sont silencieusement dédupliqués (pas une erreur — un choix d'implémentation documenté en Dev Notes)

---

## Tasks / Subtasks

### Backend — modèle et union fermée

- [x] **Task 1 — Union fermée `CalendarLayerKey`** (AC1)
  - [x] `packages/shared/src/index.ts` : `export const CALENDAR_LAYER_KEYS = [...] as const;` (6 clés) et `export type CalendarLayerKey = (typeof CALENDAR_LAYER_KEYS)[number];`, même patron que `THEMES`/`PARTIE_SORTS` (`index.ts:8-16`) — doc-comment citant FR-46/AD-16/Story 30.4.
  - [x] `export const DEFAULT_CALENDAR_LAYER_KEYS: CalendarLayerKey[] = [...CALENDAR_LAYER_KEYS]` (toutes actives par défaut, y compris `disponibilite-groupe` — c'est la **lecture** qui l'ignore hors contexte de partie, pas le stockage/défaut, cf. AD-16 et encadré n°1).
  - [x] Étendre `AuthUser` (`index.ts:34-56`) : `defaultCalendarLayers: CalendarLayerKey[];` — **non-nullable**, toujours résolu côté serveur (jamais un sentinel « pas encore réglé » exposé au client, cf. encadré n°2).

- [x] **Task 2 — Modèle Prisma** (AC2, AC3)
  - [x] `apps/api/prisma/schema.prisma` : ajouter `calendarLayersSetAt DateTime?` sur `User` (même style de commentaire que `theme`/AD-13, ligne 23), et la relation `calendarLayers UserCalendarLayer[]`.
  - [x] Nouveau modèle `UserCalendarLayer` — mirroring exact de `PartieFavorite` (`schema.prisma:90-99`) : `id`, `userId` + relation `onDelete: Cascade`, `layerKey String`, `@@unique([userId, layerKey])`. Pas de colonne tableau typée (AD-16 l'écarte explicitement).
  - [x] `docker compose exec api pnpm prisma migrate dev --name calendar_layers`.

- [x] **Task 3 — Helper `toAuthUser()` centralisé** (AC8, encadré n°2)
  - [x] Nouveau fichier (ex. `apps/api/src/users/to-auth-user.util.ts`, ou colocalisé dans `users.service.ts`) : `toAuthUser(user: User & { calendarLayers: { layerKey: string }[] }): AuthUser` — strip `passwordHash`, résout `defaultCalendarLayers` : `calendarLayersSetAt === null ? DEFAULT_CALENDAR_LAYER_KEYS : calendarLayers.map(l => l.layerKey)` (cast/validation légère, les lignes en base sont déjà de confiance puisqu'écrites via le DTO validé).
  - [x] Réécrire les **six points** de l'encadré n°2 pour utiliser ce helper, chacun avec sa requête Prisma étendue de `include: { calendarLayers: true }` (ou `select` équivalent).
  - [x] `UsersService.findById()` reste **inchangée** (pas d'`include` ajouté — cf. encadré n°2). Nouvelle méthode dédiée `findByIdWithCalendarLayers()` pour `session.serializer.ts`.
  - [x] `UsersService.findByEmailOrPseudo()` (seul appelant : `auth.service.ts:49`, `validateUser()`) peut recevoir l'`include` directement, aucun autre appelant à ménager (vérifié).

- [x] **Task 4 — DTO et endpoint d'écriture** (AC1, AC9)
  - [x] `apps/api/src/account/dto/update-preferences.dto.ts` : ajouter `defaultCalendarLayers?: CalendarLayerKey[]` — `@IsOptional() @IsArray() @ArrayMaxSize(6) @IsIn(CALENDAR_LAYER_KEYS, { each: true })`, même style que le reste du DTO.
  - [x] `AccountService.updatePreferences()` : le champ `defaultCalendarLayers`, quand présent, ne peut pas être `spread`é dans `prisma.user.update({ data: {...dto} })` comme les scalaires (ce n'est pas une colonne) — extraire ce champ du reste du DTO, dédupliquer (`[...new Set(...)]`), puis dans une **unique** `$transaction` : `deleteMany` les lignes existantes de l'utilisateur, `createMany` les nouvelles, et `user.update` avec les scalaires restants **et** `calendarLayersSetAt: new Date()`. Un lot vide (`[]`) est une valeur valide (AC3) — ne pas la confondre avec « absent » (`undefined`, qui laisse le reste de la méthode inchangé).
  - [x] Retour de `updatePreferences()` (et des deux autres méthodes de `account.service.ts`) : construit via `toAuthUser()` (Task 3), pas l'ancien destructuring.

### Frontend — préférence et écran Compte

- [x] **Task 5 — `AccountService` et `AuthService`** (AC4, AC8)
  - [x] `apps/web/src/app/core/account/account.service.ts` : étendre le type inline de `updatePreferences()` (`account.service.ts:56-62`) avec `defaultCalendarLayers?: CalendarLayerKey[]`.
  - [x] Rien à changer dans `AuthService.syncTheme()` ni son patron d'adoption locale : `defaultCalendarLayers` est **toujours résolu côté serveur** (Task 3), il n'a pas besoin d'un mécanisme d'adoption-puis-poussée comme `theme` (pas de cache `localStorage` à réconcilier, aucun risque de FOUC visuel avant connexion).

- [x] **Task 6 — Écran Compte : réglage du jeu de couches par défaut** (AC1, AC4)
  - [x] `apps/web/src/app/features/account/` : nouveau contrôle (checkbox par couche, ou un composant dédié `calendar-layers-picker` si la répétition le justifie — décision d'implémentation) lisant `auth.currentUser()?.defaultCalendarLayers` et écrivant via `AccountService.updatePreferences({ defaultCalendarLayers: [...] })`, même patron optimiste-avec-rollback que `Dashboard.onHideFinishedChange()` (`dashboard.ts:474-483`) : mise à jour locale de `auth.currentUser` avant la requête, restauration de la valeur précédente en cas d'échec.
  - [x] Libellés des six couches : passer par `theme.tone()` (patron établi dans tout l'écran Compte), pas de chaîne en dur.

### Tests

- [x] **Task 7 — Tests backend** (AC1-AC3, AC8, AC9)
  - [x] `toAuthUser()` : jamais réglé → `DEFAULT_CALENDAR_LAYER_KEYS` ; réglé à vide → `[]` ; réglé avec un sous-ensemble → exactement ce sous-ensemble.
  - [x] `AccountService.updatePreferences()` : lot valide → lignes remplacées atomiquement (une seule `$transaction`), `calendarLayersSetAt` posé ; lot vide → zéro ligne mais `calendarLayersSetAt` posé (distinct de « jamais réglé ») ; doublons → dédupliqués, pas d'erreur ; clé hors union → 400 au niveau DTO, service jamais appelé (patron `account.controller.spec.ts:406+`) ; plus de six éléments → 400.
  - [x] **AC8 explicitement** : test sur `POST /auth/login`, `GET /auth/me` et `POST /auth/register` vérifiant que la réponse porte `defaultCalendarLayers` non-`undefined` — c'est le test qui aurait attrapé l'oubli de l'encadré n°2 s'il avait eu lieu.
  - [x] Non-régression : les specs existantes de `account.controller.spec.ts`/`auth.service.spec.ts` pour les préférences scalaires restent vertes sans modification de leurs assertions (seule leur éventuelle re-vérification du shape complet de la réponse peut nécessiter une mise à jour mécanique si elles comparent une égalité stricte).

- [x] **Task 8 — Tests frontend** (AC4, Task 6)
  - [x] Nouveau contrôle de l'écran Compte : coche/décoche une couche → appelle `updatePreferences` avec le tableau attendu ; échec réseau → la valeur locale précédente est restaurée (rollback).
  - [x] Non-régression : `account.spec.ts` existant reste vert.

### Vérification

- [x] **Task 9 — Non-régression complète**
  - [x] Suites complètes API et web, `pnpm typecheck` (API — `ts-jest` ne vérifie pas cross-fichier, important ici vu le nombre de call sites touchés par le nouveau champ obligatoire d'`AuthUser`), lint sur les fichiers touchés.
  - [x] Redémarrage réel du conteneur `api`, vérification que la migration s'applique proprement et que `GET /auth/me` répond avec `defaultCalendarLayers`.

### Review Findings

- [x] [Review][Decision] AC9 : plafond de taille (`@ArrayMaxSize(6)`) appliqué sur le tableau brut avant déduplication — un lot de 7 doublons de la même clé est rejeté en 400 au lieu d'être dédupliqué. Conforme à la lettre de la Task 4 de la story (qui prescrit explicitement cet ordre) ; l'AC9 elle-même est ambiguë sur si « dépasse six éléments » s'entend avant ou après dédup. **Décision utilisateur (2026-08-15) : gardé tel quel** — l'écran Compte (seul appelant) envoie toujours un ensemble déjà dédupliqué, ce scénario n'est pas atteignable depuis l'UI actuelle. Documenté dans le DTO.
- [x] [Review][Patch] `DEFAULT_CALENDAR_LAYER_KEYS` renvoyée par référence, jamais clonée [apps/api/src/users/to-auth-user.util.ts:41-44] — tout compte « jamais réglé » reçoit la même référence de tableau ; une mutation par un appelant futur corromprait la constante partagée pour tous les utilisateurs du process. **Corrigé** : clonage via `[...DEFAULT_CALENDAR_LAYER_KEYS]`.
- [x] [Review][Patch] Violation FK (P2003) sur `userCalendarLayer.createMany` non interceptée dans `updatePreferences()` [apps/api/src/account/account.service.ts:86-93] — si le compte est supprimé entre l'authentification et cet appel, l'erreur ne correspond pas à P2025 et remonte en 500 brut au lieu de `NotFoundException`. **Corrigé** : `e.code === 'P2025' || e.code === 'P2003'`.
- [x] [Review][Patch] Race condition sur `onLayerToggle()` — double bascule rapide avant résolution de la première requête [apps/web/src/app/features/account/account.ts:117-128] — si la première requête échoue après que la seconde ait réussi, le rollback de la première écrase silencieusement l'état de la seconde, pourtant bien persisté côté serveur. **Corrigé** : le rollback ne s'applique que si l'état affiché est toujours celui posé par cette requête (comparaison de référence). Test de non-régression ajouté.
- [x] [Review][Defer] Casts non validés à la lecture (`theme`/`partiesSort`/`layerKey` etc. `as X`) [apps/api/src/users/to-auth-user.util.ts] — deferred, pre-existing (même patron de confiance-à-l'écriture que le reste du compte, pas un risque nouveau introduit par cette story)
- [x] [Review][Defer] Aucune contrainte CHECK sur `UserCalendarLayer.layerKey` au niveau DB [apps/api/prisma/schema.prisma] — deferred, pre-existing (cohérent avec le reste du schéma, ex. `theme String?` sans CHECK)

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Oublier un des six points de l'encadré n°2.** `deserializeUser()` (chaque page load) et `validateUser()`/`register()` (connexion/inscription) sont aussi faciles à manquer que les trois méthodes de `AccountService`, plus faciles même puisqu'ils ne sont pas dans le module qu'on modifie intuitivement en premier.
2. **Ajouter `include: { calendarLayers: true }` à `UsersService.findById()`.** Cette méthode est appelée par `character.service.ts` à cinq endroits sans rapport avec l'authentification — une jointure ajoutée là serait un coût silencieux et non nécessaire.
3. **Construire un contrôle de bascule sur les écrans de calendrier.** Hors périmètre (encadré n°1) — c'est la Story 30.6.
4. **Exclure `disponibilite-groupe` du jeu par défaut** en pensant « bien faire » parce qu'elle n'a pas de sens hors contexte de partie. AD-16 est explicite : c'est la lecture qui l'ignore, pas le stockage — le défaut porte les six clés.
5. **Traiter un lot vide comme une absence de valeur.** `defaultCalendarLayers: []` (envoyé explicitement) doit poser `calendarLayersSetAt`, `defaultCalendarLayers: undefined` (champ absent du corps) ne doit toucher à rien.

### Ce qui doit continuer de fonctionner

- Les cinq préférences scalaires existantes (`theme`, `hideFinishedParties`, `partiesSort`, `partiesViewMode`, `charactersSort`/`charactersViewMode`) et leur écran d'édition (`Dashboard`, `Account`/`ThemeSelector`) — inchangés.
- `PartieFavorite`/`AnnouncementRead` et leurs endpoints — inchangés, simplement le patron de référence pour `UserCalendarLayer`.
- `AvailableSlotDto`/`AggregatedSlotDto` et la distinction MJ/joueur déjà en place (AC6/AC7) — non-régression uniquement.
- `calendar-view.ts` et les vues Mois/Semaine (Stories 30.1-30.3) — strictement intouchées.

### Hors périmètre

- **Tout contrôle de bascule sur l'écran calendrier**, temporaire ou par défaut — Story 30.6.
- **Le filtrage effectif de ce qui s'affiche** selon les couches actives — Story 30.6.
- **L'endpoint unique du calendrier personnel** (AD-18) — Story 30.5, qui n'est pas un prérequis de celle-ci (le modèle de préférence ne dépend d'aucun endpoint de lecture agrégée).
- **Toute nouvelle vue Agenda** — Story 30.6.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Noms exacts des six clés de `CALENDAR_LAYER_KEYS`** — proposées : `mes-indisponibilites`, `mes-disponibilites`, `mes-seances`, `votes-en-cours`, `inscriptions-ouvertes`, `disponibilite-groupe` (kebab-case, même style que `THEMES`/`PARTIE_SORTS`). À ajuster si un nom entre en collision ou manque de clarté, mais garder le style kebab-case existant.
- **Emplacement exact de `toAuthUser()`** — proposé : `apps/api/src/users/to-auth-user.util.ts`, importé par `account.service.ts`, `auth.service.ts`, `session.serializer.ts`. Peut aussi vivre directement dans `UsersService` comme méthode statique si ça évite un import croisé superflu.
- **Composant dédié vs checkboxes inline** pour le réglage de l'écran Compte (Task 6) — dépend de la densité visuelle une fois les six libellés posés à l'écran.

### Notes de plateforme

- **API : Jest 30 + ts-jest.** `ts-jest` ne type-vérifie pas d'un fichier à l'autre (`isolatedModules`) — `pnpm typecheck` est **particulièrement important** sur cette story : ajouter un champ non-optionnel à `AuthUser` doit faire échouer la compilation de tout point qui construit un objet de ce type sans lui, c'est le filet de sécurité principal contre l'oubli de l'encadré n°2.
- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs.
- **Exécution** : tout par Docker.
- **Baseline** (après 30.3, non commitée) : API 55/55 suites, 1184 tests ; web 98/98 fichiers, 1532 tests. Build web en échec sur le seul budget de bundle pré-existant.

### Project Structure Notes

- **Nouveaux — API** : `apps/api/src/users/to-auth-user.util.ts` (ou équivalent), migration Prisma `*_calendar_layers`.
- **Modifiés — API** : `apps/api/prisma/schema.prisma` (+`UserCalendarLayer`, +`User.calendarLayersSetAt`), `apps/api/src/account/dto/update-preferences.dto.ts`, `apps/api/src/account/account.service.ts` (3 méthodes), `apps/api/src/auth/auth.service.ts` (2 méthodes), `apps/api/src/auth/session.serializer.ts`, `apps/api/src/users/users.service.ts` (+1 méthode dédiée).
- **Modifiés — partagé** : `packages/shared/src/index.ts` (`CalendarLayerKey`, `AuthUser.defaultCalendarLayers`).
- **Modifiés — Web** : `apps/web/src/app/core/account/account.service.ts`, `apps/web/src/app/features/account/account.ts`/`.html` (+ nouveau contrôle).
- **Non touchés** : tout `apps/web/src/app/features/calendar/**`, `AvailabilityModule` (API).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.4] — Story et 7 premiers ACs (regroupés ici en AC1-AC7), verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-46] — Couches combinables, disponibilité du groupe par rôle, tranché le 2026-08-05.
- [Source: ARCHITECTURE-SPINE.md#AD-16] — `UserCalendarLayer(userId, layerKey)`, union fermée, `calendarLayersSetAt` distinguant jamais-réglé de tout-éteint.
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Patron des préférences de compte : scalaires typées sur `User`, multi-valué relationnel, jamais de table clé/valeur générique.
- [Source: ARCHITECTURE-SPINE.md#AD-18] — Endpoint unique du calendrier personnel (Story 30.5, hors périmètre de celle-ci, juste pour situer la suite).
- [Source: apps/api/prisma/schema.prisma:15-49] — `User`, préférences scalaires existantes.
- [Source: apps/api/prisma/schema.prisma:90-99] — `PartieFavorite`, patron exact à mirroring pour `UserCalendarLayer`.
- [Source: apps/api/src/account/dto/update-preferences.dto.ts] — Patron de validation `@IsIn(UNION)` par préférence.
- [Source: apps/api/src/account/account.service.ts:1-146] — Les six méthodes existantes, patron `passwordHash` destructuré à la main (aucun helper central aujourd'hui).
- [Source: apps/api/src/auth/auth.service.ts:60-92] — `validateUser()`/`register()`, deux des six points de l'encadré n°2.
- [Source: apps/api/src/auth/session.serializer.ts] — `deserializeUser()`, le point le plus facile à manquer (encadré n°2).
- [Source: apps/api/src/auth/auth.controller.ts:40-52] — `login()`/`me()` renvoient `req.user` tel quel, sans repasser par `AccountService`.
- [Source: apps/api/src/users/users.service.ts] — `findById()` (5 appelants hors auth dans `character.service.ts`, ne pas y ajouter la relation), `findByEmailOrPseudo()` (1 seul appelant, peut recevoir l'`include`).
- [Source: packages/shared/src/index.ts:6-56] — Patron `THEMES`/`PARTIE_SORTS`/`AuthUser` à mirroring pour `CalendarLayerKey`.
- [Source: apps/web/src/app/core/auth/auth.service.ts:62-91] — `syncTheme()`, patron de résolution compte/local à NE PAS reproduire ici (pas de cache local pour les couches, résolution 100% serveur).
- [Source: apps/web/src/app/core/account/account.service.ts:55-68] — `updatePreferences()` front, à étendre.
- [Source: apps/web/src/app/features/dashboard/dashboard.ts:474-483] — Patron optimiste-avec-rollback pour l'écriture d'une préférence, à réutiliser Task 6.
- [Source: apps/web/src/app/features/account/account.ts] — Écran Compte, où vivra le nouveau contrôle.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — Confirmé strictement hors périmètre (encadré n°1) ; mapping actuel des signaux vers les 6 couches documenté pour la Story 30.6 à venir (déclarations combinées avi/indispo, `activePolls` pour votes en cours, `eligibleSeances` MJ-only pour inscriptions ouvertes côté MJ seulement, aucun rendu existant pour « séances confirmées », `availableSlots`/`heatmap` pour la disponibilité du groupe).

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec api pnpm jest auth account users --silent` — suite ciblée exécutée en boucle pendant le TDD (Tasks 3-4, 7) ; dernier état : 9 suites, 147 tests, 0 échec.
- `docker compose exec api pnpm test --silent` — suite complète API : 58/58 suites, 1206/1206 tests.
- `docker compose exec api pnpm typecheck` — clean (`tsc --noEmit -p tsconfig.build.json`), y compris après le refactor `toAuthUser()` (Task 3).
- `docker compose exec web pnpm test` — suite complète web : 98/98 fichiers, 1537 tests (+5 vs baseline 1532).
- `docker compose restart api` + requêtes `POST /auth/login`/`GET /auth/me` en direct contre le conteneur réel (Task 9) : migration appliquée sans étape manuelle (« No pending migrations to apply »), `defaultCalendarLayers` présent et résolu au jeu par défaut pour un compte n'ayant jamais réglé la préférence.

### Completion Notes List

- **Bug découvert et corrigé en cours d'implémentation, hors périmètre initial des tasks mais directement issu du helper `toAuthUser()` introduit par cette story** : la première version de `toAuthUser()` construisait la réponse via `{ ...rest, ... }` (spread du reste de l'enregistrement `User` moins les champs explicitement réécrits) — les vérifications TypeScript d'excès de propriétés ne s'appliquant pas à un spread, `mustResetPassword` et `calendarLayersSetAt` (colonnes internes, absentes du contrat `AuthUser`) fuitaient silencieusement dans le JSON renvoyé par `POST /auth/login`, `POST /auth/register`, `GET /auth/me` et les trois routes `PATCH /me/*` — vérifié en conditions réelles contre le conteneur `api` relancé. Ce bug préexistait déjà à cette story (l'ancien pattern manuel `const { passwordHash, ...safe } = user; return safe;`, remplacé par cette story, avait exactement la même fuite), mais puisque `toAuthUser()` est désormais le point de passage unique et revendique construire *la forme* `AuthUser`, corrigé ici : `toAuthUser()` énumère maintenant explicitement chaque champ du contrat plutôt que de spreader `rest`. Test de non-régression dédié ajouté (`to-auth-user.util.spec.ts`), et re-vérifié en direct contre le conteneur après correction.
- `validateUser()` (`AuthService`) retire désormais lui-même `passwordHash` avant de renvoyer l'utilisateur à `LocalStrategy` (au lieu de renvoyer l'enregistrement brut) — `mustResetPassword` reste lisible par la garde AC3 (Story 28.6), c'est `toAuthUser()`, appelé après cette garde dans `LocalStrategy.validate()`, qui produit la forme `AuthUser` finale. `toAuthUser()` accepte donc un enregistrement avec ou sans `passwordHash` déjà retiré (type `UserForAuth`).
- Six jeux de mocks Jest historiques (`jest.mock('@master-jdr/shared', () => ({ THEMES: [...], ... }))`) dans les specs touchées par cette story masquaient les nouveaux exports (`CALENDAR_LAYER_KEYS`) en résolvant `undefined` — root cause déjà documentée en mémoire projet (fix racine `transformIgnorePatterns`/`nodenext`, ces mocks manuels n'étaient plus nécessaires) ; supprimés dans les 3 fichiers touchés (`auth.controller.spec.ts`, `auth.service.spec.ts`, `local.strategy.spec.ts`) — les occurrences dans des fichiers non touchés par cette story (`parties.controller.spec.ts`, `parties.service.ts`, `party-cover.controller.spec.ts`, `realtime.module.spec.ts`) laissées en l'état, hors périmètre.
- Task 6 (écran Compte) : contrôle à cases à cocher (une par couche, `mat-checkbox`), pas de composant dédié — la densité visuelle (6 libellés courts) ne justifiait pas l'abstraction supplémentaire.
- Toutes les fixtures `AuthUser` du front (specs) devaient recevoir `defaultCalendarLayers` — champ non-optionnel, `ng test` type-vérifie les specs (Vitest 4) : 6 fichiers de fixtures corrigés (`account.spec.ts`, `account.service.spec.ts`, `dashboard.spec.ts`, `my-characters.spec.ts`, `auth.guard.spec.ts`, `auth.service.spec.ts`, `unseen-announcements.service.spec.ts`).

### File List

**Nouveaux**
- `apps/api/src/users/to-auth-user.util.ts`
- `apps/api/src/users/to-auth-user.util.spec.ts`
- `apps/api/src/auth/session.serializer.spec.ts`
- `apps/api/src/account/dto/update-preferences.dto.spec.ts`
- `apps/api/prisma/migrations/20260814192840_calendar_layers/`

**Modifiés — API**
- `apps/api/prisma/schema.prisma`
- `apps/api/src/account/dto/update-preferences.dto.ts`
- `apps/api/src/account/account.service.ts`
- `apps/api/src/account/account.service.spec.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/local.strategy.ts`
- `apps/api/src/auth/local.strategy.spec.ts`
- `apps/api/src/auth/session.serializer.ts`
- `apps/api/src/auth/auth.controller.spec.ts` (mock `@master-jdr/shared` obsolète retiré)
- `apps/api/src/account/account.controller.spec.ts` (mock `@master-jdr/shared` obsolète retiré)
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`

**Modifiés — partagé**
- `packages/shared/src/index.ts` (`CALENDAR_LAYER_KEYS`, `CalendarLayerKey`, `DEFAULT_CALENDAR_LAYER_KEYS`, `AuthUser.defaultCalendarLayers`)

**Modifiés — Web**
- `apps/web/src/app/core/account/account.service.ts`
- `apps/web/src/app/core/account/account.service.spec.ts`
- `apps/web/src/app/core/theme/tones.ts` (libellés des 6 couches, 3 thèmes)
- `apps/web/src/app/features/account/account.ts`
- `apps/web/src/app/features/account/account.html`
- `apps/web/src/app/features/account/account.scss`
- `apps/web/src/app/features/account/account.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (fixture `AuthUser`)
- `apps/web/src/app/features/characters/my-characters/my-characters.spec.ts` (fixture `AuthUser`)
- `apps/web/src/app/core/auth/auth.guard.spec.ts` (fixture `AuthUser`)
- `apps/web/src/app/core/auth/auth.service.spec.ts` (fixture `AuthUser`)
- `apps/web/src/app/core/announcements/unseen-announcements.service.spec.ts` (fixture `AuthUser`)

**Non touchés (confirmé)**
- `apps/web/src/app/features/calendar/**`, `AvailabilityModule` (API) — strictement hors périmètre (encadré n°1).

### Change Log

- 2026-08-14 — Implémentation complète (Tasks 1-9). Modèle relationnel `UserCalendarLayer` + `User.calendarLayersSetAt` (migration `20260814192840_calendar_layers`), union fermée `CalendarLayerKey` (6 clés), helper central `toAuthUser()` réutilisé aux six points de l'encadré n°2, DTO/endpoint d'écriture avec remplacement atomique par transaction, écran Compte (cases à cocher par couche, patron optimiste-avec-rollback). Bug de fuite de champs internes (`mustResetPassword`, `calendarLayersSetAt`) dans la réponse API découvert et corrigé pendant l'implémentation de `toAuthUser()` (voir Completion Notes) — préexistant à cette story mais corrigé ici puisque `toAuthUser()` en est désormais le point de passage unique. Suites complètes vertes : API 58/58 (1206 tests), web 98/98 (1537 tests), `pnpm typecheck` propre côté API. Vérifié en conditions réelles contre le conteneur `api` relancé (migration + `GET /auth/me`). Statut → review.

- 2026-08-14 — Story créée (bmad-create-story). Deux constats d'analyse consignés en encadré : (1) le découpage epics.md sépare modèle (30.4, cette story) et affichage (30.6) — aucun contrôle de bascule sur les écrans de calendrier n'est à construire ici, `calendar-view.ts` et les vues Mois/Semaine restent intouchées ; (2) six points distincts du code API construisent aujourd'hui un objet `AuthUser`-shaped sans passer par un helper commun (`account.service.ts` ×3, `auth.service.ts` ×2, `session.serializer.ts` ×1) — le plus piégeux étant `session.serializer.ts` (`GET /auth/me`, appelé à chaque chargement de page) qui échapperait facilement à une implémentation naïve se concentrant sur `AccountService`. Neuf AC : les sept d'epics.md reformulés (AC1-AC7), plus AC8 (cohérence des six points) et AC9 (validation du lot : union fermée, taille, doublons dédupliqués). Décision actée : aucun `include` de la relation `calendarLayers` sur `UsersService.findById()`, qui a cinq appelants sans rapport dans `character.service.ts` — une méthode dédiée est requise pour `session.serializer.ts`.
