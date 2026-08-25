---
baseline_commit: be5d9a8eca3d9bd98975e1bba3f1406d54cc939b
---

# Story 29.8: Filtres, tris et parties favorites

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want filtrer, trier et mettre en avant mes parties,
so that je retrouve ce que je cherche quand la liste s'allonge.

## Contexte

**Huitième story de l'épic 29**, consomme `PartieDto.status` (29.6) et `PartySignalsDto`/`party-signal-priority.ts` (29.7, `done`) sans les modifier. Trois mécanismes distincts à ne pas confondre (AC4/AC5, tranché au PRD le 2026-08-05) :
- **Filtres** (rôle, statut) : réduisent la liste affichée. **Purement front** — `PartieDto.role`/`.status` sont déjà chargés (`MyPartiesService.allParties()`), aucun nouvel appel serveur.
- **Tri** (urgence, date, nom, type, statut — union fermée déclarée dans `@master-jdr/shared`, AD-1) : change l'ordre. Le **critère choisi** est mémorisé sur le compte (nouveau champ `User.partiesSort`) via un appel serveur ; l'**application du tri lui-même** reste front, sur la liste déjà chargée — aucun endpoint de tri serveur n'existe.
- **Favoris** : `PartieFavorite(userId, partieId)`, nouveau modèle relationnel (AD-1/P6-AD-1 — état multi-valué, jamais un booléen sur `Partie` qui appartiendrait alors à tout le monde). Mis en avant dans la liste, indépendamment du tri choisi.

**`hideFinishedParties`** (masquer les parties terminées) est une **quatrième préférence de compte, distincte** des trois ci-dessus (FR-3, déjà nommée dans l'architecture mais pas encore posée en base) : booléen mémorisé sur le compte, appliqué **côté front à la liste déjà chargée**, jamais par un filtre serveur (AC6, règle explicite).

**Le schéma cible des quatre champs (`hideFinishedParties`, `partiesSort`, `PartieFavorite`) est déjà écrit dans `ARCHITECTURE-SPINE.md`** (Structural Seed, lignes 269-317) — cette story les fait exister réellement : à ce jour, `schema.prisma` ne contient **aucun** des quatre (vérifié — `grep` sur `partiesSort|hideFinishedParties|PartieFavorite` : aucune occurrence). De même, les routes `PATCH /me/preferences` et `PUT|DELETE /me/favorites/:partieId` sont documentées dans la source tree cible (ligne 401-402) mais **n'existent pas encore** dans `account.controller.ts` (vérifié — seules `display-name`/`theme`/`password`/`email` existent).

**Hors périmètre explicite** (cf. epics.md, story suivante du même épic) :
- Modes d'affichage (grande vignette / moyen / liste compacte) et le composant partagé `ListControlBar` (icônes de densité, masquage au défilement, pastille de résumé, révélation par icône) — **story 29.9**, qui porte le même titre « barre de contrôles » dans epics.md. Cette story-ci ajoute les contrôles de tri/filtre/favoris **directement dans `Dashboard`**, sans extraire de composant partagé — 29.9 sera l'occasion naturelle de factoriser un `ListControlBar` réutilisable (parties + personnages), une fois que le second consommateur (vue « mes personnages », story 29.2, `done`) aura lui aussi ses propres contrôles de mode d'affichage. Ne pas anticiper cette extraction ici.
- `charactersSort`/`charactersViewMode` (préférences de la vue « mes personnages ») — hors AC, réservées à 29.9.
- Recherche dans la barre de contrôles (§4.2/§7.7 DESIGN.md) — non demandée par les ACs de cette story.
- Bannière générative de partie, image de couverture — stories 29.10/29.12.

## Acceptance Criteria

1. **Given** je marque une partie comme favorite, **When** je recharge la liste, **Then** elle est mise en avant.
2. **Given** je filtre par rôle ou par statut, **When** j'applique le filtre, **Then** la liste se réduit aux parties correspondantes.
3. **Given** je choisis un critère de tri, **When** je l'applique, **Then** l'ordre change, **and** le critère est mémorisé sur mon compte.
4. **Given** les valeurs de tri des parties, **When** elles sont validées côté serveur, **Then** elles appartiennent à une union fermée déclarée dans le paquet partagé, **and** cette union vaut : urgence, date, nom, type, statut.
5. **Given** les critères de filtre, **When** ils s'affichent dans la barre de contrôles, **Then** ils se limitent au rôle et au statut, **and** la date, le nom et le type sont des critères de **tri**, pas de filtre.
6. **Given** j'active « masquer les parties terminées », **When** j'ouvre mes listes, **Then** elles sont masquées par défaut, **and** elles restent accessibles à la demande, **and** le masquage est appliqué côté front sur la liste déjà chargée, sans filtre serveur supplémentaire.

## Tasks / Subtasks

### Base de données & paquet partagé

- [x] Task 1 — Migration Prisma : les quatre champs du Structural Seed (AC: #1, #3, #4, #6)
  - [x] `apps/api/prisma/schema.prisma`, modèle `User` — ajouté `partiesSort String @default("urgence")` et `hideFinishedParties Boolean @default(false)`. `partiesViewMode`/`charactersViewMode`/`charactersSort` non ajoutés (29.9, hors périmètre).
  - [x] Nouveau modèle `PartieFavorite` (id `uuid`, `userId`/`user` relation `onDelete: Cascade`, `partieId`/`partie` relation `onDelete: Cascade`, `createdAt @default(now())`, `@@unique([userId, partieId])`).
  - [x] Relations inverses : `favorites PartieFavorite[]` sur `User` et sur `Partie`.
  - [x] `docker compose exec api pnpm prisma migrate dev --name partie_favoris_tri_masquage` (migration `20260810204008_partie_favoris_tri_masquage` créée et appliquée) puis `pnpm prisma generate`.
  - [x] Redémarrage réel du conteneur `api` vérifié après migration (`docker compose restart api` — `Nest application successfully started`, routes `/me/*` toujours mappées).

- [x] Task 2 — Paquet partagé : `PartieSort` et champs dérivés (AC: #3, #4)
  - [x] `packages/shared/src/index.ts` — `PARTIE_SORTS`/`PartieSort` ajoutés à côté de `THEMES`, même patron.
  - [x] `PartieDto.isFavorite: boolean` ajouté (toujours présent).
  - [x] `AuthUser.hideFinishedParties`/`.partiesSort` ajoutés — `req.user` expose déjà tout champ `User` non retiré (seul `passwordHash` est destructuré par `session.serializer.ts`), aucune modification requise côté `auth.controller.ts`.
  - [x] Gap trouvé pendant l'implémentation (confirmé via `pnpm typecheck`, exclut `tsconfig.build.json` les specs) : les fixtures `AuthUser` **côté web uniquement** (`ng test` type-checke les specs, piège déjà documenté Story 28.1/29.1) violaient la forme étendue — corrigées dans `auth.guard.spec.ts`, `features/account/account.spec.ts` (factory `makeUser`), `core/account/account.service.spec.ts` (×2), `core/auth/auth.service.spec.ts` (×2 fixtures). Les fixtures `AuthUser` côté `apps/api/*.spec.ts` (my-party-signals/parties/scenarios/poll `.controller.spec.ts`) n'ont **pas** été touchées : `tsconfig.build.json` exclut les specs du typecheck API et ts-jest ne type-check pas cross-file (mémoire projet), ces fixtures partielles compilent et s'exécutent sans erreur.

### Backend — préférences de compte, favoris, projection

- [x] Task 3 — `PATCH /me/preferences` (AC: #3, #4, #6)
  - [x] `apps/api/src/account/dto/update-preferences.dto.ts` créé, deux champs optionnels (`@IsIn(PARTIE_SORTS)`/`@IsBoolean()`).
  - [x] `AccountController.updatePreferences()` — délégation directe à `AccountService`.
  - [x] `AccountService.updatePreferences(userId, dto)` — patch partiel, même gestion P2025 que `updateDisplayName()`/`updateTheme()`.

- [x] Task 4 — Favoris : modèle relationnel + routes (AC: #1)
  - [x] `AccountService.addFavorite(userId, partieId)` — `create()` + `try/catch` P2002 (no-op)/P2003 (`NotFoundException`). Aucune garde d'appartenance ajoutée (non demandée par l'AC).
  - [x] `AccountService.removeFavorite(userId, partieId)` — `deleteMany()`, idempotent par nature.
  - [x] `AccountController` — `@Put('favorites/:partieId')`/`@Delete('favorites/:partieId')`.

- [x] Task 5 — Projection `PartieDto.isFavorite` (AC: #1)
  - [x] `toPartieDto()` — paramètre `isFavorite: boolean` ajouté, même patron que `hasScenario`.
  - [x] `favoritePartieIds()` (lecture en lot) ajoutée, appelée en `Promise.all` avec `hasScenarioByPartieId()` dans les deux branches de `listForUser()`.
  - [x] `create()` — `isFavorite: false` sans requête.
  - [x] `isFavorite()` (mono-partie) ajoutée, utilisée par `findOneDto()`/`update()`/`close()`/`reopen()` en `Promise.all` avec `hasScenario()`.
  - [x] `pnpm typecheck` (API) propre après ces changements.

- [x] Task 6 — `AccountModule`/`PartiesModule` : câblage (AC: #1, #3)
  - [x] Vérifié : aucun nouveau provider/import requis dans les deux modules (les nouvelles méthodes vivent sur des services déjà injectés).

### Frontend — préférences, favoris, filtres/tri sur Dashboard

- [x] Task 7 — `AccountService` (front) : préférences + favoris (AC: #1, #3, #6)
  - [x] `updatePreferences()`/`addFavorite()`/`removeFavorite()` ajoutés, même patron `firstValueFrom`/`withCredentials: true` que `setTheme()`. Tests ajoutés dans `account.service.spec.ts` (front).
  - [x] Gap trouvé (même piège que Task 2) : `PartieDto.isFavorite` a cassé le typecheck de 7 fichiers de specs web (`ng test` type-checke les specs) — corrigés : `core/parties/parties.service.spec.ts`, `core/poll/open-polls.service.spec.ts`, `features/dashboard/dashboard.spec.ts` (factory `makeParty` + paramètre `isFavorite`), `features/parties/partie-detail/partie-detail.spec.ts`, `features/parties/partie-form/partie-form.spec.ts`, `features/scenarios/scenario-editor/scenario-editor.spec.ts`, `features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts`. Suite web complète vérifiée verte après coup (86/86 fichiers, 1196/1196 tests).

- [x] Task 8 — Tri : fonction pure + mémorisation (AC: #3, #4)
  - [x] `apps/web/src/app/core/parties/party-sort.ts` créé — `sortParties()`, ne mute jamais le tableau d'entrée. `urgence` réutilise `dominantCategory()` (`party-signal-priority.ts`, aucune table dupliquée), `PARTIE_TERMINEE`/statut `TERMINEE` toujours en dernier, entrée absente de `signalsMap` traitée comme « aucun signal ». `date`/`nom`/`type` (via `partieKindLabel()`, `parties.util.ts`)/`statut` implémentés comme prévu.
  - [x] **Décision retenue (documentée)** : `urgence` conserve les 4 intertitres (tri appliqué à l'intérieur de chaque groupe dans `Dashboard`, Task 10) ; tout autre critère bascule sur une liste plate unique. Voir Completion Notes.
  - [x] Mémorisation : câblage reporté à Task 10 (`Dashboard` appelle `AccountService.updatePreferences({ partiesSort })` au changement de sélection).

- [x] Task 9 — Filtres rôle/statut : signals transitoires, jamais persistés (AC: #2, #5)
  - [x] `roleFilter`/`statusFilter` (signaux transitoires, réinitialisés à chaque montage) ajoutés à `Dashboard`.
  - [x] Sélecteurs natifs `<select>` (`FormsModule`, `[ngModel]`/`(ngModelChange)`, même patron que `announcement-form.html`) liés à ces signaux, appliqués dans `filteredParties` avant `tiles()`.

- [x] Task 10 — `Dashboard` : pipeline filtres → tri → favoris, contrôles, masquage (AC: #1, #2, #3, #5, #6)
  - [x] `filteredParties` (computed) : `allParties()` filtré par `roleFilter()`/`statusFilter()` **et** `hideFinishedParties` (sauf `showFinishedOverride()` ou filtre statut déjà explicite sur autre chose que 'all' — décision : le masquage ne s'applique que si `statusFilter() === 'all'`, cf. Completion Notes).
  - [x] `tiles()` recalculé sur `filteredParties()` au lieu de `allParties()` — badges/teinte/priorité inchangés.
  - [x] `pinFavorites()` ajoutée à `party-sort.ts` (partition stable, générique sur `{ isFavorite: boolean }`) — appliquée dans le nouveau computed `orderedTiles` juste après `sortParties()`, avant le découpage en intertitres.
  - [x] Étoile de favori sur chaque tuile (icône Material `star`/`star_border`, `$event.stopPropagation()`) → `toggleFavorite()`, rechargement ciblé `refreshMjParties()`/`refreshPlayerParties()` selon `partie.role`.
  - [x] Contrôles (rôle, statut, tri, case masquage, bouton de révélation) ajoutés directement dans `dashboard.html`, au-dessus des sections.
  - [x] `onSortChange()`/`onHideFinishedChange()` : mise à jour locale de `auth.currentUser` + `AccountService.updatePreferences()` fire-and-forget.
  - [x] 15 nouvelles clés de thème ×3 (`tones.ts`) : tri (6), filtres rôle/statut (3), masquage/révélation (2), favoris (2), message vide filtré (1), libellé « Tous » réutilisé.

### Tests

- [x] Task 11 — Backend : `account.service.spec.ts` — préférences + favoris (AC: #1, #3, #6)
  - [x] `updatePreferences()` : patch partiel (×2, `partiesSort` seul / `hideFinishedParties` seul), P2025 → `NotFoundException`.
  - [x] `addFavorite()` : crée la ligne ; P2002 (déjà favori) → aucune erreur ; P2003 (`partieId` inexistant) → `NotFoundException` ; autre erreur Prisma → propagée.
  - [x] `removeFavorite()` : supprime la ligne ; appel sur une partie non favorite → aucune erreur.

- [x] Task 12 — Backend : `account.controller.spec.ts` — routage (AC: #1, #3)
  - [x] Tests unitaires de routage (`updatePreferences`/`addFavorite`/`removeFavorite`) + tests HTTP réels via `ValidationPipe` (union fermée `partiesSort`, type `hideFinishedParties`, patch partiel, corps vide, `PUT`/`DELETE /me/favorites/:partieId`). Mock `jest.mock('@master-jdr/shared', ...)` étendu avec `PARTIE_SORTS` (même piège ESM que `THEMES`, déjà documenté).

- [x] Task 13 — Backend : `parties.service.spec.ts` — `isFavorite` (AC: #1)
  - [x] `listForUser()` (mj + player) : `isFavorite: true`/`false` selon présence en base ; `partieFavorite.findMany` appelé **une seule fois** pour N parties.
  - [x] `findOneDto()`/`update()`/`close()`/`reopen()` : `isFavorite` toujours présent (vérifié `true`).
  - [x] `create()` : `isFavorite: false`, `partieFavorite.findUnique`/`.findMany` jamais appelés.
  - [x] Assertions `toEqual`/`Object.keys()` pré-existantes (revue de code AC6) mises à jour avec `isFavorite`.

- [x] Task 14 — Frontend : `party-sort.spec.ts` (nouveau) (AC: #3, #4)
  - [x] Un test par critère + `pinFavorites()` (3 tests supplémentaires) — 11 tests au total, tous verts.
  - [x] `date` : partie sans `nextSessionDate` toujours en dernier.
  - [x] `urgence` : réutilise `dominantCategory()`, `PARTIE_TERMINEE`/statut `TERMINEE` toujours en dernier, entrée absente de `signalsMap` traitée comme « aucun signal ».
  - [x] Immutabilité vérifiée pour `sortParties()` et `pinFavorites()`.

- [x] Task 15 — Frontend : `dashboard.spec.ts` (AC: #1, #2, #3, #5, #6)
  - [x] Filtre rôle/statut : réduit la liste affichée, aucun appel `refreshMjParties`/`refreshPlayerParties` déclenché.
  - [x] Changement de tri : `AccountService.updatePreferences({ partiesSort })` appelé, affichage réordonné (vérifié + bascule intertitres↔liste plate).
  - [x] `hideFinishedParties` actif : parties `TERMINEE` absentes par défaut ; bouton de révélation les réaffiche sans appel `updatePreferences` supplémentaire ; case à cocher persiste la préférence.
  - [x] Clic sur l'étoile : `addFavorite`/`removeFavorite` appelé selon l'état courant, rechargement ciblé selon `partie.role` (jamais les deux), `aria-label` vérifié.
  - [x] Une partie favorite apparaît avant une non-favorite après rechargement (AC1). 14 nouveaux tests, suite dashboard.spec.ts passée de 33 à 47 tests, tous verts.

### Review Findings

- [x] [Review][Patch] `onSortChange()`/`onHideFinishedChange()` ne font aucun rollback si `AccountService.updatePreferences()` échoue — corrigé : `.catch()` restaure la valeur locale précédente sur échec [apps/web/src/app/features/dashboard/dashboard.ts]
- [x] [Review][Patch] `toggleFavorite()` n'a aucune garde anti-double-clic — corrigé : signal `pendingFavorites` (Set de `partieId` en vol), étoile désactivée (`[disabled]`) pendant la requête [apps/web/src/app/features/dashboard/dashboard.ts, dashboard.html]
- [x] [Review][Patch] `sortParties()` n'a pas de branche de repli si `sort` sort un jour de l'union `PARTIE_SORTS` — corrigé : `default: return copy;` [apps/web/src/app/core/parties/party-sort.ts]
- [x] [Review][Patch] `hasHiddenFinished` ignore `roleFilter()` actif — corrigé : intersecte désormais avec le rôle filtré avant de décider si le bouton de révélation a un effet visible [apps/web/src/app/features/dashboard/dashboard.ts]
- [x] [Review][Defer] Aucun test dédié `forbidNonWhitelisted` pour `PATCH /me/preferences` (contrairement à `/me/display-name`/`/me/theme`) — deferred, gap de couverture uniquement, la `ValidationPipe` globale (`whitelist: true`) couvre déjà structurellement cette route [apps/api/src/account/account.controller.spec.ts]

**Écartés comme bruit (8)** : validation UUID de `partieId` (déjà géré proprement via la contrainte FK → 404), ligne `PartieFavorite` orpheline après retrait d'un membre (décision documentée explicitement dans la story — « aucun effet observable »), défauts de migration non testés sur les lignes existantes (garantis par la sémantique SQL `NOT NULL DEFAULT`), double lecture de `PartySignalsService.signals()` (lecture de signal déjà en cache, pas un appel réseau), ambiguïté d'idempotence `addFavorite`/`removeFavorite` (sémantique REST voulue), asymétrie de garde `favoritePartieIds()`/`isFavorite()` (fausse analogie, `isFavorite()` n'a pas de cas vide équivalent), tri `'date'` via `localeCompare` sur des chaînes ISO (format serveur strictement cohérent, comparaison lexicographique correcte), écriture DB inconditionnelle sur `PATCH /me/preferences` à corps vide (comportement testé et voulu).

## Dev Notes

### Ce qui doit continuer de fonctionner

- `PartiesService.listForUser()`/`findOneDto()`/`close()`/`reopen()`/`create()`/`update()` (Stories 29.1/29.6) — signature étendue (Task 5) mais **comportement de dérivation de `status`/`role` inchangé**, seul `isFavorite` s'ajoute à la projection.
- `PartySignalsService`/`party-signal-priority.ts` (Story 29.7, `done`) — **lus tels quels** par `party-sort.ts` (Task 8), jamais modifiés. Aucune nouvelle table de priorité dupliquée.
- Les 4 intertitres (`awaitingTiles`/`ongoingTiles`/`upcomingTiles`/`finishedTiles`, Story 29.7) — le pipeline de filtrage (Task 10) s'insère **avant** ce découpage, pas à la place : `tiles()` doit continuer de fonctionner à l'identique quand aucun filtre/tri non-défaut n'est actif.
- `Dashboard.badgeLabel()`/`tintIcon()`/`tintLabel()` (Story 29.7) — non touchés, seule la **source** de `tiles()` change (Task 10).
- `MyPartiesService.refreshMjParties()`/`refreshPlayerParties()` (Story 29.1) — réutilisés tels quels pour recharger après un favori (Task 10), pas de nouvelle méthode de rafraîchissement.

### Hors périmètre (réservé à 29.9 ou ultérieur)

- Modes d'affichage (grande vignette/moyen/liste compacte), composant partagé `ListControlBar`, masquage au défilement, pastille de résumé d'écart au défaut, révélation par icône — story 29.9 (même « barre de contrôles » nommée dans epics.md, cf. Contexte).
- `charactersSort`/`charactersViewMode` — story 29.9.
- Recherche dans la barre de contrôles.
- Bannière générative / image de couverture — stories 29.10/29.12.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Interaction tri × 4 intertitres** — recommandation de cette story (Task 8) : `urgence` conserve les 4 groupes (tri appliqué à l'intérieur de chacun), tout autre critère bascule sur une liste plate unique. À documenter dans Completion Notes, ajuster si contre-indiqué en implémentation.
- **Emplacement des contrôles dans `dashboard.html`** — au-dessus des sections, sans nouveau composant (décision de scope, cf. Contexte) ; le layout exact (icônes vs libellés, disposition mobile/desktop) n'est pas fixé par une AC — DESIGN.md §7.7 sert de repère (« icônes de mode, tri, filtres »), mais ce repère décrit le `ListControlBar` complet de 29.9, pas le sous-ensemble de cette story.
- **Rechargement après favori** — Task 10 propose un rechargement ciblé (`refreshMjParties`/`refreshPlayerParties` selon `partie.role`) plutôt qu'une mise à jour optimiste en place ; à ajuster si la latence perçue s'avère gênante en test manuel.

### Project Structure Notes

- **Backend nouveaux** : `apps/api/src/account/dto/update-preferences.dto.ts`, migration `apps/api/prisma/migrations/<timestamp>_partie_favoris_tri_masquage/`.
- **Backend modifiés** : `apps/api/prisma/schema.prisma` (+ `User.partiesSort`/`hideFinishedParties`, modèle `PartieFavorite`), `apps/api/src/account/account.controller.ts` (+ `PATCH /me/preferences`, `PUT`/`DELETE /me/favorites/:partieId`), `apps/api/src/account/account.service.ts` (+ `updatePreferences`/`addFavorite`/`removeFavorite`), `apps/api/src/account/account.service.spec.ts`, `apps/api/src/account/account.controller.spec.ts`, `apps/api/src/parties/parties.service.ts` (+ `isFavorite` dans `toPartieDto`/toutes les méthodes retournant un `PartieDto`), `apps/api/src/parties/parties.service.spec.ts`.
- **Shared modifié** : `packages/shared/src/index.ts` (`PARTIE_SORTS`, `PartieSort`, `PartieDto.isFavorite`, `AuthUser.hideFinishedParties`/`.partiesSort`).
- **Frontend nouveaux** : `apps/web/src/app/core/parties/party-sort.ts` (+ spec).
- **Frontend modifiés** : `apps/web/src/app/core/account/account.service.ts` (+ `updatePreferences`/`addFavorite`/`removeFavorite`), `apps/web/src/app/features/dashboard/dashboard.ts`/`.html`/`.scss`/`.spec.ts` (filtres, tri, favoris, masquage, contrôles), `apps/web/src/app/core/theme/tones.ts` (nouvelles clés ×3).
- **Non touchés** : `PartySignalsService`/`party-signal-priority.ts` (front et back, Story 29.7, lus tels quels), `MyPartiesService` (méthodes de rafraîchissement réutilisées telles quelles), `ListControlBar` (n'existe pas encore, ne pas le créer dans cette story).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.8] — Story, Acceptance Criteria (reprises telles quelles).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-3] — Masquage des parties terminées, préférence de compte.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-10] — Filtres (rôle, statut) vs tri (urgence, date, nom, type, statut), tranché le 2026-08-05.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-11] — Parties favorites, mises en avant dans la liste.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-45] — Modes d'affichage (hors périmètre, 29.9) — rappel que tri/filtres relèvent de FR-10, pas FR-45.
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Règle canonique complète : colonnes typées vs relationnel, quatre nouveaux scalaires sur `User` (dont `partiesSort`/`hideFinishedParties`), union fermée déclarée dans `@master-jdr/shared`, `hideFinishedParties` appliqué côté front jamais par un filtre serveur.
- [Source: ARCHITECTURE-SPINE.md#AD-4] — `PATCH /me/preferences`/`PUT|DELETE /me/favorites/:partieId` vivent dans `AccountModule` (état de compte), jamais dans `PartiesModule`.
- [Source: ARCHITECTURE-SPINE.md, Structural Seed, lignes 269-317] — Schéma Prisma cible exact (`User.partiesSort`/`.hideFinishedParties`, modèle `PartieFavorite`) — à recopier tel quel en Task 1.
- [Source: ARCHITECTURE-SPINE.md, Consistency Conventions, « Lecture en lot »] — Toute lecture sur une collection de parties se fait par requêtes groupées, jamais par itération — s'applique à `favoritePartieIds()` (Task 5) comme à `hasScenarioByPartieId()` (29.6).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §7.7 ListControlBar] — Barre de contrôles cible (icônes de mode, tri, filtres, recherche desktop) — repère pour cette story, mais décrit le composant complet livré par 29.9 (cf. Décisions à trancher).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md §4.2] — « Le défaut (mode d'affichage, tri) vit dans les Préférences du compte, pas dans la barre » — confirme que seul le **critère de tri** (pas les filtres) est mémorisé.
- [Source: apps/api/src/parties/parties.service.ts] — `toPartieDto()`/`hasScenarioByPartieId()`/`listForUser()` : patron exact à reproduire pour `isFavorite`/`favoritePartieIds()`.
- [Source: apps/api/src/account/account.service.ts] — `updateTheme()`/`updateDisplayName()` : patron exact de gestion P2025, à reproduire pour `updatePreferences()`.
- [Source: apps/api/src/account/dto/update-theme.dto.ts] — Patron `@IsIn(THEMES)` à reproduire avec `@IsIn(PARTIE_SORTS)`.
- [Source: apps/web/src/app/core/parties/party-signal-priority.ts] — `dominantCategory()`/`dominantSignal()`/`PRIORITY_ORDER` (Story 29.7) : à réutiliser tels quels pour le tri `'urgence'`, jamais dupliqués.
- [Source: apps/web/src/app/features/dashboard/dashboard.ts, dashboard.html] — `tiles()`/`awaitingTiles()`/etc. (Story 29.7) : point d'insertion exact du pipeline filtres → tri → favoris (Task 10) ; gabarit `#tile` (ligne 66-132 de `dashboard.html`) où ajouter l'étoile de favori.
- [Source: apps/web/src/app/features/account/theme-selector/theme-selector.ts] — Patron « appliqué immédiatement côté client, appel réseau fire-and-forget » à reproduire pour le changement de tri/masquage.
- [Source: apps/api/prisma/schema.prisma] — Confirmé par lecture directe : aucun des quatre champs cibles (`partiesSort`, `hideFinishedParties`, `PartieFavorite`, et par extension `partiesViewMode`/`charactersSort`/`charactersViewMode` de 29.9) n'existe encore.
- [Source: _bmad-output/implementation-artifacts/29-7-signaletique-detat-des-parties.md] — Story précédente : conventions de Dev Notes/Completion Notes à reproduire ; patron de tests « appelé une seule fois pour N parties » à reproduire pour `favoritePartieIds()`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Migration `20260810204008_partie_favoris_tri_masquage` créée et appliquée (`docker compose exec api pnpm prisma migrate dev`), `prisma generate` exécuté, conteneur `api` redémarré réellement (`Nest application successfully started`, routes `PATCH /me/preferences`, `PUT`/`DELETE /me/favorites/:partieId` confirmées mappées dans les logs après redémarrage).
- Suite API complète (`docker compose exec api pnpm test`) : 54/54 suites, 1087/1087 tests verts.
- `docker compose exec api pnpm typecheck` : propre.
- Suite web complète (`docker compose exec web pnpm test`) : 87/87 fichiers, 1223/1223 tests verts.
- Lint API + web sur les fichiers touchés par cette story : propre après un correctif de formatage prettier (`party-sort.ts`, `party-sort.spec.ts`, `dashboard.spec.ts`) — seule erreur pré-existante restante repérée dans les fichiers touchés (`account.service.ts:24`, méthode `setTheme()` non modifiée par cette story) laissée en l'état.
- `docker compose exec web pnpm build` : échoue uniquement sur le budget de bundle initial pré-existant (1.23 MB vs budget 1.00 MB) — vérifié par `git stash` : le même échec existe déjà sur `master` (1.22 MB), écart de +10 Ko cohérent avec le code ajouté par cette story. Même point d'échec que les stories 29.4-29.7.
- **Revue de code (`bmad-code-review`, 2026-08-10)** — 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) : 0 violation d'AC, 4 patches appliqués (rollback `onSortChange`/`onHideFinishedChange` sur échec réseau, garde anti-double-clic `toggleFavorite()`, repli défensif `sortParties()`, `hasHiddenFinished` respecte `roleFilter()`), 1 différé (`deferred-work.md`), 8 écartés comme bruit. Suite finale après correctifs : suite web complète 87/87 fichiers, 1228/1228 tests verts (+5 tests dédiés aux 4 correctifs), lint propre.

### Completion Notes List

- Story créée le 2026-08-10 (bmad-create-story). Vérifications faites avant écriture : `schema.prisma` ne porte aucun des champs du Structural Seed de l'épic (`partiesSort`/`hideFinishedParties`/`PartieFavorite`/`partiesViewMode`/`charactersSort`/`charactersViewMode`) — cette story pose les deux premiers et le modèle relationnel, laisse le reste à 29.9. `account.controller.ts` ne porte que `display-name`/`theme`/`password`/`email` — les routes préférences/favoris documentées dans la source tree cible de l'architecture n'existent pas encore. Filtres rôle/statut confirmés réalisables sans aucun changement serveur (`PartieDto.role`/`.status` déjà chargés côté front) — seule la mémorisation du tri et les favoris nécessitent un aller-retour serveur.
- Implémentée le 2026-08-10 (bmad-dev-story), TDD sur les 15 tâches. **Décisions retenues, documentées ici comme demandé par les Dev Notes** :
  - **Interaction tri × 4 intertitres** : la recommandation de la story a été suivie telle quelle — `urgence` (défaut) conserve les 4 intertitres (`awaitingTiles`/`ongoingTiles`/`upcomingTiles`/`finishedTiles`), désormais dérivés d'un nouveau computed `orderedTiles` qui applique `sortParties()` puis `pinFavorites()` avant le découpage. Tout autre critère bascule sur `flatTiles` (= `orderedTiles`), une liste plate unique sans intertitres.
  - **Masquage des terminées vs filtre statut explicite** : `hideFinishedParties` ne s'applique que lorsque `statusFilter() === 'all'` — filtrer explicitement sur « Terminées » les affiche déjà, sans besoin du bouton de révélation. Décision non demandée par les Dev Notes mais nécessaire pour éviter une incohérence (case cochée + filtre « Terminées » → liste vide, message trompeur).
  - **Favoris — aucune garde d'appartenance sur `addFavorite()`** : implémenté tel que recommandé (P2003 → 404 si `partieId` inexistant, P2002 absorbé en no-op) ; aucune vérification `getViewable()` ajoutée, un favori sur une partie hors de portée de l'utilisateur reste sans effet observable.
  - **Rechargement après favori** : rechargement ciblé (`refreshMjParties()`/`refreshPlayerParties()` selon `partie.role`) retenu tel que proposé, latence non gênante en test.
- **Gap trouvé pendant l'implémentation (Task 2), documenté sur le moment** : ajouter `AuthUser.hideFinishedParties`/`.partiesSort` et `PartieDto.isFavorite` a cassé le typecheck de `ng test` (qui type-checke les specs, piège déjà documenté Story 28.1/29.1) sur 9 fichiers de fixtures web (`auth.guard.spec.ts`, `features/account/account.spec.ts`, `core/account/account.service.spec.ts`, `core/auth/auth.service.spec.ts`, `core/parties/parties.service.spec.ts`, `core/poll/open-polls.service.spec.ts`, `features/dashboard/dashboard.spec.ts`, `features/parties/partie-detail/partie-detail.spec.ts`, `features/parties/partie-form/partie-form.spec.ts`, `features/scenarios/scenario-editor/scenario-editor.spec.ts`, `features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts`) — tous corrigés. Les fixtures `AuthUser` côté `apps/api/*.spec.ts` n'ont **pas** été touchées : `tsconfig.build.json` exclut les specs du typecheck API et ts-jest ne type-check pas cross-file (mémoire projet), confirmé par lecture directe avant de décider de ne rien changer là.
- **Retour utilisateur en cours d'implémentation (2026-08-10, après une première passe complète)** : la barre de contrôles restait toujours visible et prenait trop de place sur mobile — DESIGN.md §7.7 (`ListControlBar`) associe pourtant la « révélation par icône » aux deux autres comportements (masquage au défilement, pastille de résumé) que cette story avait explicitement différés à la Story 29.9. Ajout d'un repli minimal en réponse : bouton discret (`mat-icon-button`, icône `tune`) qui déplie/replie les champs de filtre/tri, repliés par défaut (`controlsExpanded` signal, classe CSS `--expanded`, aucun changement structurel du DOM — les `<select>` restent présents pour ne pas casser les tests déjà écrits, seule leur visibilité CSS change). Masquage au défilement et pastille de résumé restent hors périmètre, toujours réservés à la Story 29.9 — seule la révélation par icône a été anticipée, sur demande explicite. 2 tests ajoutés (`dashboard.spec.ts`), suite complète revérifiée verte après ce correctif (87/87, 1223/1223).
- Aucune décision non tranchée restante : les trois points de la section « Décisions à trancher en implémentation » de la story ont tous été résolus comme recommandé, sans contre-indication rencontrée en test.

### File List

- `apps/api/prisma/schema.prisma` (modifié — `User.partiesSort`/`.hideFinishedParties`, modèle `PartieFavorite`, relations inverses)
- `apps/api/prisma/migrations/20260810204008_partie_favoris_tri_masquage/migration.sql` (nouveau)
- `apps/api/src/account/dto/update-preferences.dto.ts` (nouveau)
- `apps/api/src/account/account.controller.ts` (modifié — `PATCH /me/preferences`, `PUT`/`DELETE /me/favorites/:partieId`)
- `apps/api/src/account/account.service.ts` (modifié — `updatePreferences`/`addFavorite`/`removeFavorite`)
- `apps/api/src/account/account.controller.spec.ts` (modifié — routage + validation HTTP réelle)
- `apps/api/src/account/account.service.spec.ts` (modifié — mock Prisma `partieFavorite` + nouveaux tests)
- `apps/api/src/parties/parties.service.ts` (modifié — `toPartieDto()`/`favoritePartieIds()`/`isFavorite()`, `isFavorite` dans `create()`/`listForUser()`/`findOneDto()`/`update()`/`close()`/`reopen()`)
- `apps/api/src/parties/parties.service.spec.ts` (modifié — mock Prisma `partieFavorite`, assertions `isFavorite` mises à jour, nouveaux tests dédiés)
- `packages/shared/src/index.ts` (modifié — `PARTIE_SORTS`, `PartieSort`, `PartieDto.isFavorite`, `AuthUser.hideFinishedParties`/`.partiesSort`)
- `apps/web/src/app/core/account/account.service.ts` (modifié — `updatePreferences`/`addFavorite`/`removeFavorite`)
- `apps/web/src/app/core/account/account.service.spec.ts` (modifié — fixtures `AuthUser` + nouveaux tests)
- `apps/web/src/app/core/parties/party-sort.ts` (nouveau — `sortParties()`, `pinFavorites()`)
- `apps/web/src/app/core/parties/party-sort.spec.ts` (nouveau)
- `apps/web/src/app/core/parties/parties.service.spec.ts` (modifié — fixture `isFavorite`)
- `apps/web/src/app/core/poll/open-polls.service.spec.ts` (modifié — fixture `isFavorite`)
- `apps/web/src/app/core/auth/auth.guard.spec.ts` (modifié — fixture `AuthUser`)
- `apps/web/src/app/core/auth/auth.service.spec.ts` (modifié — fixtures `AuthUser`)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 16 nouvelles clés ×3 thèmes)
- `apps/web/src/app/features/account/account.spec.ts` (modifié — factory `makeUser`)
- `apps/web/src/app/features/dashboard/dashboard.ts` (modifié — filtres, tri, favoris, masquage, repli de la barre de contrôles)
- `apps/web/src/app/features/dashboard/dashboard.html` (modifié — barre de contrôles repliable, étoile de favori, branche liste plate/intertitres)
- `apps/web/src/app/features/dashboard/dashboard.scss` (modifié — `.controls-bar*`, `.favorite-btn*`)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (modifié — fixtures étendues + 16 nouveaux tests)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — fixture `isFavorite`)
- `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts` (modifié — fixture `isFavorite`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — fixture `isFavorite`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — fixture `isFavorite`)
