---
baseline_commit: b8157d7f1fd168b04899b8ec00497249ee5d30fd
---

# Story 29.9: Modes d'affichage et barre de contrôles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want choisir la densité d'affichage de mes listes,
so that j'aie le détail quand j'en veux et la compacité quand j'en ai besoin.

## Contexte

**Neuvième et dernière story « barre de contrôles » de l'épic 29** — CAP-18 du SPEC (« Modes d'affichage des listes ») : *« les mêmes contrôles servent la liste des parties comme la vue "mes personnages" »* (une seule grammaire, deux listes). Cette story finalise le `ListControlBar` que la Story 29.8 avait explicitement **différé** : *« pas de composant `ListControlBar` partagé, réservé à la Story 29.9 »* (`dashboard.html`, commentaire actuel).

**Ce qui existe déjà (Story 29.8, `done`) et qu'il faut réutiliser, pas réinventer :**
- `Dashboard` (`apps/web/src/app/features/dashboard/`) porte déjà : filtres rôle/statut transitoires, tri des parties (`partiesSort`, mémorisé sur le compte via `PATCH /me/preferences`), favoris, masquage des terminées, et une barre `.controls-bar` **repliée par défaut derrière une icône** (`controlsExpanded`, ajouté en cours de Story 29.8 sur retour utilisateur, anticipant déjà la « révélation par icône » de DESIGN.md §7.7).
- `PATCH /me/preferences` (`AccountController`/`AccountService`) accepte déjà un patch partiel `{ partiesSort?, hideFinishedParties? }` — la Story 29.8 a **explicitement anticipé** cette extension : *« cette route accueillera `partiesViewMode`/`charactersSort`/`charactersViewMode` (29.9) sans changer de forme »* (`update-preferences.dto.ts`, commentaire actuel).
- `MyCharacters` (`apps/web/src/app/features/characters/my-characters/`) a une recherche (`mat-form-field`, **toujours visible**, aucun mode d'affichage, aucun tri) — à faire évoluer.
- `party-sort.ts` (`sortParties()`/`pinFavorites()`) — patron exact à reproduire pour un `character-sort.ts` équivalent (vocabulaire disjoint : niveau, partie, nom).

**Ce que cette story ajoute (Structural Seed, `ARCHITECTURE-SPINE.md` lignes 273-276, AD-1) — vérifié : aucun des trois n'existe encore dans `schema.prisma`** :
- `User.partiesViewMode String @default("medium")`
- `User.charactersViewMode String @default("medium")`
- `User.charactersSort String @default("partie")` — vocabulaire **disjoint** de celui des parties (AD-1, verbatim) : *« niveau, partie, nom pour les personnages »*.

**Décision de scope actée par cette story (extraction du composant partagé)** : un nouveau composant `ListControlBar` (`apps/web/src/app/shared/list-control-bar/`) porte les 3 comportements de DESIGN.md §7.7/EXPERIENCE.md §4.2 pris **ensemble** (masquage au défilement, pastille de résumé, révélation par icône) + le sélecteur de mode (icônes seules, AC2) + le sélecteur de tri + un emplacement de recherche (permanente desktop, derrière l'icône sur mobile). `Dashboard` **migre** son `.controls-bar` actuel vers ce composant (filtres rôle/statut projetés en contenu, spécifiques aux parties) ; `MyCharacters` l'adopte pour la première fois (tri + mode + recherche, **aucun filtre** — AC5 de la Story 29.8 limitait déjà les filtres au rôle/statut des *parties*, aucune AC de cette story n'en introduit pour les personnages).

## Acceptance Criteria

1. **Given** trois modes existent, **When** je bascule de l'un à l'autre, **Then** la densité change : grande vignette, intermédiaire, liste compacte.
2. **Given** le sélecteur de mode, **When** il s'affiche, **Then** les modes sont représentés par des icônes, **and** aucun libellé texte de mode n'apparaît.
3. **Given** je choisis un mode, **When** je me reconnecte depuis un autre appareil, **Then** ce mode est conservé.
4. **Given** la liste des parties et celle des personnages, **When** leurs préférences sont stockées, **Then** chacune possède sa propre paire mode et tri.
5. **Given** je fais défiler la liste vers le bas, **When** je descends, **Then** la barre de contrôles se masque, **and** elle revient dès que je remonte.
6. **Given** un réglage s'écarte de mon défaut, **When** la liste s'affiche, **Then** une pastille le signale et propose de rétablir.
7. **Given** j'utilise un téléphone, **When** la barre s'affiche, **Then** la recherche n'y est pas permanente, **and** elle reste atteignable par l'icône de révélation.

## Tasks / Subtasks

### Base de données & paquet partagé

- [x] Task 1 — Migration Prisma : les trois derniers champs du Structural Seed (AC: #3, #4)
  - [x] `apps/api/prisma/schema.prisma`, modèle `User` — ajoutés `partiesViewMode`/`charactersViewMode` (défaut `"medium"`), `charactersSort` (défaut `"partie"`).
  - [x] Migration `20260810215107_modes_affichage_listes` créée et appliquée, `prisma generate` exécuté.
  - [x] Conteneur `api` redémarré réellement — `Nest application successfully started`, routes `/me/*` toujours mappées.

- [x] Task 2 — Paquet partagé : vocabulaires fermés + champs `AuthUser` (AC: #1, #3, #4)
  - [x] `LIST_VIEW_MODES`/`ListViewMode` ajoutés (`'large'|'medium'|'compact'`, littéral synchronisé au défaut Prisma).
  - [x] `CHARACTER_SORTS`/`CharacterSort` ajoutés (`'niveau'|'partie'|'nom'`).
  - [x] `AuthUser.partiesViewMode`/`.charactersViewMode`/`.charactersSort` ajoutés.
  - [x] Gap anticipé confirmé et corrigé : 5 fixtures `AuthUser` web (`auth.guard.spec.ts`, `features/account/account.spec.ts`, `core/account/account.service.spec.ts` ×3, `core/auth/auth.service.spec.ts` ×2, `features/dashboard/dashboard.spec.ts`) étendues avec les 3 nouveaux champs. Suite web complète revérifiée verte après coup (87/87, 1228/1228) — aucune autre fixture cassée.

### Backend — préférences de compte

- [x] Task 3 — `UpdatePreferencesDto` : 3 champs supplémentaires (AC: #1, #3, #4)
  - [x] `apps/api/src/account/dto/update-preferences.dto.ts` — `partiesViewMode`/`charactersViewMode`/`charactersSort` ajoutés, même patron `@IsOptional() @IsIn(...)`.
  - [x] `AccountController`/`AccountService` — confirmé aucune modification requise (route déjà générique).
  - [x] Tests HTTP réels ajoutés (`account.controller.spec.ts`) : union fermée × 3 champs → 400, patch combiné à 6 champs → 200. Mock `@master-jdr/shared` étendu avec `LIST_VIEW_MODES`/`CHARACTER_SORTS`.

### Frontend — composant partagé `ListControlBar`

- [x] Task 4 — `character-sort.ts` : fonction pure de tri des personnages (AC: #1, #4)
  - [x] `apps/web/src/app/core/characters/character-sort.ts` (nouveau) — `sortCharacters()`, même patron que `party-sort.ts` : copie défensive, `niveau` décroissant, `partie`/`nom` via `localeCompare()` (`characterName()` réutilisé pour `nom`), repli défensif `default: return copy;`.

- [x] Task 5 — Composant `ListControlBar` (nouveau, présentationnel) (AC: #1, #2, #4, #5, #6, #7)
  - [x] `apps/web/src/app/shared/list-control-bar/list-control-bar.ts`/`.html`/`.scss`/`.spec.ts` créés — standalone, purement présentationnel, aucun appel à `AccountService`.
  - [x] Entrées : `viewMode`/`viewModeOptions` (icônes `grid_view`/`view_agenda`/`view_list`, AC2), `sortOptions`/`sortValue`, `searchQuery`/`searchLabel`, `hasDeviatedFromDefault`.
  - [x] Sorties : `viewModeChange`, `sortChange`, `searchQueryChange`, `resetRequested`.
  - [x] `<ng-content select="[extraFilters]">` pour les filtres rôle/statut de `Dashboard`.
  - [x] Masquage au défilement (`@HostListener('window:scroll')`, seuil 48px anti-clignotement).
  - [x] Repli par défaut derrière une icône — patron `controlsExpanded`/`.controls-bar__toggle` de la Story 29.8 migré ici (`expanded`/`.list-control-bar__toggle`).
  - [x] Recherche permanente desktop / repliée mobile via `BreakpointObserver`/`DESKTOP_QUERY` (patron `partie-detail.ts`).
  - [x] Pastille de résumé (icône `restart_alt` + libellé, jamais la couleur seule) émettant `resetRequested`.
  - [x] Clés de thème `list_control_bar.*` + `dashboard.search_label`/`my_characters.sort_*` ajoutées aux 3 thèmes (`tones.ts`).

### Frontend — intégration `Dashboard` (migration) et `MyCharacters` (nouveau)

- [x] Task 6 — `Dashboard` : migrer `.controls-bar` vers `ListControlBar` (AC: #1, #2, #4, #5, #6, #7)
  - [x] `dashboard.ts` — `partiesViewMode` (computed), `onViewModeChange()` (fire-and-forget + rollback, même patron que `onSortChange()`), `sortOptionsForBar` (résout les libellés), `hasDeviatedFromDefault` (`roleFilter`/`statusFilter` uniquement), `gridDensityClass`. Ajout d'une recherche par nom (`searchQuery`, transitoire, filtre `filteredParties` — décision prise en implémentation : `ListControlBar` suppose une recherche sur les deux listes consommatrices, cf. Task 5/Dev Notes ; jamais mémorisée, jamais comptée dans `hasDeviatedFromDefault`, même statut que `roleFilter`/`statusFilter`).
  - [x] `dashboard.html` — bloc `.controls-bar` remplacé par `<app-list-control-bar>`, filtres rôle/statut/masquage déplacés dans le slot `extraFilters`.
  - [x] `hasDeviatedFromDefault` = `roleFilter() !== 'all' || statusFilter() !== 'all'` (recommandation des Dev Notes retenue telle quelle).
  - [x] Densité d'affichage (AC1) — `.grid--large`/`.grid--medium`/`.grid--compact` sur les 5 grilles de parties, contenu de tuile inchangé.
  - [x] `AccountService` (web) étendu (`partiesViewMode`/`charactersViewMode`/`charactersSort` optionnels) — `MyPartiesService`/`PartySignalsService`/`party-sort.ts`/favoris non touchés, revérifié par la suite complète (89/89, 1245/1245).

- [x] Task 7 — `MyCharacters` : adopter `ListControlBar` (AC: #1, #2, #4, #5, #6, #7)
  - [x] `my-characters.ts` — `AuthService`/`AccountService` injectés, `charactersSort`/`charactersViewMode` (computed), `onSortChange()`/`onViewModeChange()` (fire-and-forget + rollback), `filtered` = `sortCharacters(searchFiltered(), charactersSort())` (tri après le filtrage par recherche existant).
  - [x] `my-characters.html` — `<mat-form-field class="search-field">` remplacé par `<app-list-control-bar>` (`searchQuery`/`searchQueryChange` câblés sur `query`), aucun filtre projeté (`extraFilters` omis).
  - [x] `hasDeviatedFromDefault` = `false` (constante) — documenté ci-dessus et dans Completion Notes : aucun réglage transitoire sur cet écran, la recherche est une saisie de consultation.
  - [x] Densité d'affichage (AC1) — `.list--large`/`.list--medium`/`.list--compact` sur `.list` (gap only — le contenu de `CharacterSummaryCard` reste inchangé, son input `className` n'est pas réutilisé pour la densité, seulement pour le nom de classe RPG comme avant).

### Tests

- [x] Task 8 — Backend : `account.controller.spec.ts`/`account.service.spec.ts` (AC: #1, #3, #4)
  - [x] Validation HTTP réelle des 3 nouveaux champs (union fermée → 400 ×3, patch combiné → 200).
  - [x] `account.service.spec.ts` : `updatePreferences()` avec les 3 nouveaux champs isolément et combinés (patch à 6 champs). Suite : 52/52 tests verts (`account.controller.spec.ts` + `account.service.spec.ts`).

- [x] Task 9 — Frontend : `character-sort.spec.ts` (nouveau) (AC: #1, #4)
  - [x] Un test par critère (`niveau`, `partie`, `nom`) + repli défensif hors union + immutabilité — 5/5 verts.

- [x] Task 10 — Frontend : `list-control-bar.spec.ts` (nouveau) (AC: #1, #2, #5, #6, #7)
  - [x] 12/12 tests verts : mode (3 boutons, émission, aucun libellé texte), masquage au défilement (seuil + anti-clignotement), repli/révélation, recherche desktop/mobile/`null`, pastille de résumé, tri.

- [x] Task 11 — Frontend : `dashboard.spec.ts` (migration) (AC: #1, #2, #4, #5, #6, #7)
  - [x] Describe « repli de la barre » (couverture dupliquée avec `list-control-bar.spec.ts`) retiré, remplacé par un describe « câblage vers ListControlBar » : filtres projetés présents dans le DOM, `viewModeChange` → `onViewModeChange()` → `AccountService.updatePreferences({ partiesViewMode })` + classe `.grid--compact` appliquée. Suite complète revérifiée verte (89/89, 1245/1245).

- [x] Task 12 — Frontend : `my-characters.spec.ts` (AC: #1, #2, #3, #4, #6, #7)
  - [x] Tri : sélection `nom` réordonne l'affichage + `updatePreferences({ charactersSort: 'nom' })`.
  - [x] Mode d'affichage : clic sur le bouton `large` → `.list--large` + `updatePreferences({ charactersViewMode: 'large' })`.
  - [x] Recherche : 2 tests existants migrés au nouveau sélecteur DOM (`.list-control-bar__search input`), toujours verts (non-régression AC4 Story 29.2).
  - [x] Aucune pastille de résumé affichée. 11/11 tests verts ; suite complète revérifiée (89/89, 1248/1248).

### Review Findings

_Revue de code (bmad-code-review, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `b8157d7f`), 2026-08-12._

- [x] [Review][Decision] Seuil de révélation au défilement remontant symétrique au seuil de masquage (AC5) — `apps/web/src/app/shared/list-control-bar/list-control-bar.ts:63-72`. L'AC5 dit « elle revient dès que je remonte » ; l'implémentation exige un delta cumulé de 48px vers le haut (même seuil anti-clignotement que pour le masquage) avant de révéler la barre — pas un retour littéralement immédiat au premier pixel remonté. **Décision utilisateur (2026-08-12) : seuil symétrique conservé tel quel** — comportement déjà couvert par les tests, objectif anti-clignotement valable dans les deux sens, écart avec la formulation littérale de l'AC jugé mineur.

- [x] [Review][Patch] Test mal nommé ne teste pas le comportement annoncé [apps/api/src/characters/character.service.spec.ts:1017] — le test « personnages de systèmes de jeu distincts → un seul getContent() par système, jamais par personnage » construisait deux personnages avec le même `gameSystemId: 'ryuutama'`, donc ne pouvait pas prouver la déduplication inter-systèmes qu'il prétendait garantir. Corrigé : 3 personnages (2 sur `ryuutama`, 1 sur `homme-dragon`), assertion sur `toHaveBeenCalledTimes(2)` + les deux IDs distincts.
- [x] [Review][Patch] `lastScrollY` initialisé à une valeur figée plutôt qu'à la position réelle au montage [apps/web/src/app/shared/list-control-bar/list-control-bar.ts:63] — un retour sur une page déjà défilée (navigation arrière, ancre) déclenche un premier calcul de delta erroné. Corrigé : `private lastScrollY = window.scrollY;`.
- [x] [Review][Patch] Gestionnaire inline à deux instructions incohérent avec le patron du composant [apps/web/src/app/features/dashboard/dashboard.html:42] — `(resetRequested)="roleFilter.set('all'); statusFilter.set('all')"` alors que `onViewModeChange`/`onSortChange`/`onHideFinishedChange` sont tous des méthodes nommées. Corrigé : extrait en `onResetRequested()` (`dashboard.ts`).
- [x] [Review][Patch] Commentaire « vocabulaire disjoint » inexact [packages/shared/src/index.ts:27-28] — `CHARACTER_SORTS` et `PARTIE_SORTS` partagent la valeur `'nom'`, contrairement à ce qu'affirme le commentaire référençant AD-1 verbatim. Corrigé : commentaire reformulé pour refléter l'union distincte sans nier le chevauchement sur `'nom'`.

- [x] [Review][Defer] Casts non validés à l'exécution dans `resolveContentLabel()`/`sheetData` [apps/api/src/characters/character.service.ts] — deferred, pre-existing (même patron que `ryuutama-pdf.service.ts`)
- [x] [Review][Defer] `Promise.all` sur `gameSystemIds` non résilient à un rejet isolé [apps/api/src/characters/character.service.ts, findMine()] — deferred, pre-existing (même patron que `resolveOwnerInfo()` dans le même fichier)
- [x] [Review][Defer] Recherches catalogue par personnage en `.find()` linéaire plutôt qu'indexées [apps/api/src/characters/character.service.ts, resolveContentLabel()] — deferred, faible volume de données actuel
- [x] [Review][Defer] Aucune contrainte d'énumération au niveau base pour les 3 champs de préférence [apps/api/prisma/schema.prisma] — deferred, pre-existing (même convention que Story 29.8)
- [x] [Review][Defer] Pattern ARIA `role="group"`+`aria-pressed` plutôt que `radiogroup`/`aria-checked` sur le sélecteur de mode [apps/web/src/app/shared/list-control-bar/list-control-bar.html:30-37] — deferred, pattern alternatif valide
- [x] [Review][Defer] `hasDeviatedFromDefault` figé à `false` + `(resetRequested)` non câblé sur MyCharacters [apps/web/src/app/features/characters/my-characters/my-characters.html:7] — deferred, décision intentionnelle documentée, impact nul actuellement
- [x] [Review][Defer] `$any($event)` contourne le typage sur `sortChange` [apps/web/src/app/features/dashboard/dashboard.html:40, apps/web/src/app/features/characters/my-characters/my-characters.html:9] — deferred, échappatoire raisonnable pour un composant partagé entre deux unions disjointes sans génériques Angular
- [x] [Review][Defer] `CharacterSummaryCard.showStats` non couplé structurellement à `density` [apps/web/src/app/features/characters/character-summary-card/character-summary-card.html] — deferred, aucun site d'appel actuel ne déclenche le cas, robustesse préventive

## Dev Notes

### Ce qui doit continuer de fonctionner

- `Dashboard` : `MyPartiesService`, `PartySignalsService`, `party-sort.ts` (`sortParties()`/`pinFavorites()`), favoris, masquage des terminées, filtres rôle/statut, 4 intertitres vs liste plate selon `partiesSort` — **toute la logique de la Story 29.8 reste inchangée**, seule sa présentation (la barre elle-même) migre vers `ListControlBar`.
- `MyCharacters` : `CharacterService.listMine()`, filtrage par recherche (`filtered`, Story 29.2 AC4), `characterName()` — le tri (Task 4) s'ajoute **après** le filtrage existant, ne le remplace pas.
- `AccountService.updatePreferences()` (front et back) — signature déjà générique (`Partial<{...}>` / DTO à champs tous optionnels), étendue avec 3 clés supplémentaires sans changement de forme (anticipé explicitement par la Story 29.8).
- Le correctif de revue de code Story 29.8 (rollback local si `updatePreferences()` échoue) — **à reproduire à l'identique** pour `onViewModeChange()` (`Dashboard`) et les deux nouveaux handlers de `MyCharacters`, ne pas réintroduire la régression déjà corrigée une fois.

### Hors périmètre (réservé à une story ultérieure)

- Bannière générative de partie et son animation — Stories 29.10/29.11, pas encore livrées. Le mode « grande vignette » de cette story n'a **pas** de bannière : l'emplacement est réservé (`.grid--large .tile::before`, hauteur cible 88 px) et porte en attendant un lavis de la teinte d'état ; 29.10 remplace le fond, pas la boîte. Idem en mode liste : l'emplacement de la vignette atténuée + monogramme (AC de la Story 29.10, verbatim) reste vide.
- Image de couverture de partie — Story 29.12.

> **~~Recomposition du contenu de la tuile par mode~~ — exclusion RETIRÉE (revue de maquette, 2026-08-12).**
> La rédaction initiale de cette story excluait « la recomposition du contenu de la tuile par mode (ex. « libellé du signal dominant + compte » spécifique au mode liste) » au motif que la story « ne change que la densité ». Cette exclusion était **infondée** : elle n'était adossée à aucune AC de l'épic (AC1 énumère « grande vignette, intermédiaire, **liste compacte** » — trois formes, pas trois tailles), aucune story ultérieure ne la reprenait (29.10 → 29.14 relues : seule la bannière/vignette y figure), et DESIGN.md §7.7 « ne pas » l'interdit explicitement : *« le mode liste a son propre rendu »*. Le mode liste était livré comme une carte rétrécie en grille. Corrigé — cf. Completion Notes du 2026-08-12.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Sens du tri « niveau » des personnages** — proposé décroissant (plus haut niveau en premier, cohérent avec « urgence » qui met en avant ce qui compte le plus), aucune AC ne fixe le sens ; ajuster si contre-indiqué.
- **Icônes exactes du sélecteur de mode** — `grid_view`/`view_agenda`/`view_list` proposées (Material Symbols déjà utilisé dans tout le projet), à ajuster librement.
- **Seuil de déclenchement du masquage au défilement** — un défilement de quelques pixels ne doit pas faire clignoter la barre ; seuil proposé ~48px, aucune AC ne le fixe.
- **`hasDeviatedFromDefault` pour `Dashboard`** — recommandation : uniquement `roleFilter`/`statusFilter` (les seuls réglages transitoires non auto-persistés). `partiesSort`/`partiesViewMode`/`hideFinishedParties` s'enregistrent immédiatement à chaque changement (patron fire-and-forget déjà établi) et ne peuvent donc jamais « dévier » d'eux-mêmes après le premier changement.
- **`hasDeviatedFromDefault` pour `MyCharacters`** — recommandation : toujours `false` (aucun réglage transitoire sur cet écran une fois `ListControlBar` en place ; la recherche est une saisie de consultation, pas un réglage). Documenter ce choix, ne pas l'omettre silencieusement.
- **Libellé exact de la pastille de résumé** — « Réglages modifiés » proposé, à ajuster ; nouvelle(s) clé(s) de thème ×3 requise(s) dans tous les cas.

### Project Structure Notes

- **Backend modifiés** : `apps/api/prisma/schema.prisma` (+ `User.partiesViewMode`/`.charactersViewMode`/`.charactersSort`), `apps/api/src/account/dto/update-preferences.dto.ts` (+ 3 champs), `apps/api/src/account/account.controller.spec.ts` (+ tests de validation HTTP).
- **Backend non touchés** : `AccountController`/`AccountService` (route déjà générique, aucune modification de code requise au-delà du DTO).
- **Shared modifié** : `packages/shared/src/index.ts` (`LIST_VIEW_MODES`, `ListViewMode`, `CHARACTER_SORTS`, `CharacterSort`, `AuthUser.partiesViewMode`/`.charactersViewMode`/`.charactersSort`).
- **Frontend nouveaux** : `apps/web/src/app/shared/list-control-bar/list-control-bar.ts`/`.html`/`.scss`/`.spec.ts`, `apps/web/src/app/core/characters/character-sort.ts`/`.spec.ts`.
- **Frontend modifiés** : `apps/web/src/app/features/dashboard/dashboard.ts`/`.html`/`.scss`/`.spec.ts` (migration vers `ListControlBar`, ajout `partiesViewMode`), `apps/web/src/app/features/characters/my-characters/my-characters.ts`/`.html`/`.scss`/`.spec.ts` (adoption de `ListControlBar`, ajout tri + mode), toute fixture `AuthUser` cassée par les 3 nouveaux champs (cf. Task 2, liste à confirmer via `pnpm test`).
- **Non touchés** : `PartySignalsService`/`party-signal-priority.ts`/`party-sort.ts` (Story 29.7/29.8, lus tels quels), `CharacterSummaryCard` (réutilisé via son input `className` existant, pas de nouvelle prop), `CharacterService.listMine()`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.9] — Story, Acceptance Criteria (reprises telles quelles).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-45] — Modes d'affichage, même grammaire/barre pour parties et personnages (FR-16), réserve consignée sur l'utilité différée de cet outillage (2-4 parties simultanées aujourd'hui).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-16] — Vue « mes personnages », recherche, jamais mélangée avec la liste des parties.
- [Source: _bmad-output/specs/spec-palier9-refonte-ui/SPEC.md#CAP-18] — Intent/critère de succès exacts : bascule de mode retrouvée après reconnexion depuis un autre appareil, même grammaire pour les deux listes.
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Règle canonique : quatre scalaires de préférence (dont les 3 de cette story), union fermée déclarée dans `@master-jdr/shared`, une paire mode+tri **par liste, jamais partagée** (vocabulaires disjoints).
- [Source: ARCHITECTURE-SPINE.md, Structural Seed, lignes 273-276] — Schéma Prisma cible exact (`partiesViewMode`/`charactersViewMode` défaut `"medium"`, `charactersSort` défaut `"partie"`) — à recopier tel quel en Task 1/2.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §7.7 ListControlBar] — Comportement cible complet (icônes de mode, tri, filtres, recherche desktop, masquage au défilement + pastille + révélation par icône, « les trois patrons cohabitent, retenus ensemble »).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md §4.2] — Recherche permanente desktop / révélation mobile (CAP-8), défaut mode+tri dans les préférences de compte (pas dans la barre elle-même).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md §4.1] — Cible visuelle complète des 3 modes (contenu par mode, bannière animée) — **hors périmètre de cette story** (cf. Décisions/Hors périmètre), dépend des Stories 29.10/29.11 non livrées.
- [Source: apps/web/src/app/features/dashboard/dashboard.ts, dashboard.html] (Story 29.8, `done`) — Code exact à migrer : `controlsExpanded`, `.controls-bar__toggle`, `roleFilter`/`statusFilter`/`onSortChange()`/`onHideFinishedChange()` (avec rollback sur échec, Review Findings), `hasHiddenFinished` (respecte déjà `roleFilter()`, patch de revue Story 29.8 à ne pas régresser).
- [Source: apps/web/src/app/core/parties/party-sort.ts, party-sort.spec.ts] (Story 29.8) — Patron exact de `sortCharacters()`/`character-sort.spec.ts` (copie défensive, repli par défaut sur valeur hors union, immutabilité testée).
- [Source: apps/api/src/account/dto/update-preferences.dto.ts, account.service.ts] (Story 29.8) — DTO/service déjà génériques, patron `@IsIn(...)` à reproduire pour les 3 nouveaux champs, aucune modification de `AccountService` attendue.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts:22,118,123,182-184] — Patron exact `BreakpointObserver`/`DESKTOP_QUERY`/`toSignal()` à reproduire dans `ListControlBar` pour la recherche non permanente sur mobile (AC7).
- [Source: apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts] — Input `className` déjà existant, à réutiliser pour la densité d'affichage plutôt que d'ajouter un mécanisme parallèle.
- [Source: apps/web/src/app/features/characters/my-characters/my-characters.ts, my-characters.html] — État actuel exact : recherche toujours visible, aucun mode/tri, à faire évoluer (Task 7).
- [Source: apps/api/prisma/schema.prisma] — Confirmé par lecture directe : aucun des trois champs cibles (`partiesViewMode`/`charactersViewMode`/`charactersSort`) n'existe encore.
- [Source: _bmad-output/implementation-artifacts/29-8-filtres-tris-et-parties-favorites.md] — Story précédente : conventions de Dev Notes/Completion Notes à reproduire ; décision de scope explicitement héritée (composant partagé différé jusqu'à cette story) ; patron de rollback sur échec réseau (Review Findings) à reproduire pour les nouveaux handlers.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-10 (bmad-create-story). Vérifications faites avant écriture : `schema.prisma` ne porte encore aucun des 3 champs restants du Structural Seed de l'épic (`partiesViewMode`/`charactersViewMode`/`charactersSort`) — la Story 29.8 avait déjà posé `partiesSort`/`hideFinishedParties`/`PartieFavorite` et explicitement différé le reste ici. `PATCH /me/preferences` et son DTO sont déjà génériques (vérifié par lecture directe de `account.service.ts`/`update-preferences.dto.ts`), confirmant l'anticipation documentée dans le code de la Story 29.8 — aucune nouvelle route serveur nécessaire, seulement une extension de DTO. `MyCharacters` n'a aujourd'hui aucun tri ni mode d'affichage, seulement une recherche toujours visible — à faire évoluer entièrement dans cette story.
- Implémentation complétée le 2026-08-10/11. Décisions prises en implémentation, non tranchées par les ACs :
  - **Sens du tri « niveau »** : décroissant (retenu tel que proposé).
  - **Icônes du sélecteur de mode** : `grid_view`/`view_agenda`/`view_list` (retenues telles que proposées).
  - **Seuil de masquage au défilement** : 48px (retenu tel que proposé).
  - **`hasDeviatedFromDefault`** : `Dashboard` → `roleFilter() !== 'all' || statusFilter() !== 'all'` (recommandation retenue) ; `MyCharacters` → toujours `false` (recommandation retenue).
  - **Libellé de la pastille** : « Réglages modifiés » (retenu tel que proposé), clés `list_control_bar.reset_pill_label` ×3 thèmes.
  - **Écart avec les Dev Notes (Task 5/Dev Notes)** : les Dev Notes supposaient que les deux listes consommatrices ont déjà une recherche ; ce n'était vrai que pour `MyCharacters` (Story 29.2). `Dashboard` n'avait aucune recherche par nom — une a été ajoutée (`searchQuery`, filtre transitoire sur `PartieDto.name`, jamais mémorisée, jamais comptée dans `hasDeviatedFromDefault`, même statut que `roleFilter`/`statusFilter`) pour que `ListControlBar` reste cohérent sur les deux écrans, conformément à l'hypothèse du composant partagé.
  - **Écart avec les Dev Notes (Task 7)** : les Dev Notes suggéraient de réutiliser l'input `className` existant de `CharacterSummaryCard` pour la densité — ce input porte en réalité le nom de classe RPG du personnage (déjà utilisé), pas une notion de densité ; le réutiliser aurait été un détournement sémantique. Un nouvel input `density: ListViewMode` a été ajouté à la place (piloté par `avatarSize()` + classes hôte `--large`/`--compact`), pour que le mode d'affichage change réellement l'apparence des cartes personnage, pas seulement l'espacement entre elles (retour utilisateur en cours d'implémentation — la première version ne changeait que le `gap` de `.list`, insuffisant au regard de l'AC1).
  - Suites complètes revérifiées vertes après chaque tâche : API 54/54 suites (1093/1093 tests), typecheck API propre ; Web 89/89 fichiers (1251/1251 tests). Lint : aucune erreur dans les fichiers touchés par cette story (dette de lint pré-existante ailleurs dans le monorepo, non introduite ici). Build web : échoue uniquement sur le budget de bundle initial (dépassement pré-existant, documenté dans les Dev Notes du DoD, non lié à cette story).
  - **Correctifs post-implémentation (retour utilisateur, même session, avant merge)** : les modes d'affichage ne changeaient pas réellement le contenu/la taille des cartes.
    1. **Dashboard** : `.grid--large`/`.grid--medium`/`.grid--compact` ne variaient que `grid-template-columns`/`gap` — invisible sur mobile (une seule colonne quel que soit le mode). DESIGN.md §4.1 fixe la densité par le nombre de tuiles visibles par écran mobile (~2/4-5/~12), ce qui dépend de la HAUTEUR de la tuile, pas seulement de sa largeur. Ajout de règles CSS ciblant `mat-card-header`/`mat-card-title`/`mat-card-subtitle`/`.signal-badges`/`.signal-badge` par mode (padding/taille de police), et masquage du libellé textuel redondant de `.role-indicator`/`.status-indicator` en mode compact (icône + `aria-label` du parent suffisent, P-1 porte sur la teinte de statut, pas ce libellé d'appoint).
    2. **MyCharacters** : les 3 modes ne faisaient varier que l'espacement (`gap` de `.list`) et la taille de l'avatar — contenu de carte identique, jugé peu pertinent (PV/PE/Initiative/Encombrement) et illisible en mode compact (nom écrasé par les infos secondaires). Retravaillé avec l'utilisateur : `MyCharacterDto` étend `classLabel`/`typeLabel`/`groupRoleLabel` (résolus **côté serveur**, `CharacterService.findMine()`, contenu de jeu mis en cache + `CharacterGroupRole` en lot — AD-3, jamais de N+1, jamais de fetch multiple côté client même si les personnages appartiennent à des systèmes de jeu différents). `CharacterSummaryCard` gagne 4 entrées (`typeLabel`, `groupRoleLabel`, `showStats` — défaut `true`, préserve tous les sites d'appel existants — et `showMjMarker`, distinct de `showOwnerInfo` qui afficherait à tort le propre nom du joueur sur ses propres personnages) et affiche désormais systématiquement le niveau à côté du nom. `MyCharacters` câble `showStats=false`/`showMjMarker=true` et les 3 nouveaux libellés ; le mode compact n'affiche plus que nom + niveau (plus de texte écrasant), moyen/grand affichent classe/type/rôle de groupe/partie/repère MJ à la place des stats.
    - Reverifié après coup : API 54/54 suites (1097/1097 tests) + typecheck propre, Web 89/89 fichiers (1257/1257 tests), lint propre sur tous les fichiers touchés, build web toujours en échec uniquement sur le budget de bundle pré-existant.

- **Revue de maquette (2026-08-12, retour utilisateur — écart avec `directions-liste-parties.html` / DESIGN.md §4.1)**. Constat : les 3 modes ne changeaient que la taille des cartes. Vérification faite avant correction — la bannière/vignette/monogramme par mode appartient bien à la **Story 29.10** (AC verbatim : « le mode liste une vignette atténuée surmontée du monogramme »), mais le **gabarit ligne lui-même n'avait aucun porteur** : ni AC de 29.10-29.14, ni entrée dans `deferred-work.md`. Corrections apportées :
  1. **`Dashboard` — le mode liste a désormais son propre gabarit** (`.row`, bascule de template dans `dashboard.html`, pas un jeu de classes CSS) : pastille d'état 8 px teintée par les 4 mêmes teintes que la bande verticale (§7.2 « équivalent exact »), nom tronqué sur une ligne, sous-ligne « Rôle · libellé du signal dominant » (§4.1 : « la pastille n'est jamais seule » — repli sur le libellé de teinte quand la partie ne porte aucun signal, jamais une sous-ligne vide, P-1), **compteur unique** (§4.1 bis : « En mode liste, un seul compteur ») portant son propre `aria-label` via la nouvelle clé `dashboard.row_signal_count_aria` ×3 thèmes. La grille passe en liste pleine largeur à cadre unique. Étoile de favori conservée et testée.
  2. **`Dashboard` — mode grand** : emplacement de bannière réservé (`::before`, 88 px, lavis de `--tile-tint`) pour atteindre la densité cible ~2/écran mobile (DESIGN.md §4 : bannière 78-124 px) ; `--tile-tint` extrait en variable sur les 4 classes de teinte plutôt que de dupliquer la table des statuts.
  3. **`MyCharacters`/`CharacterSummaryCard` — même correction transposée** (EXPERIENCE.md:107 : « réutilise exactement la grammaire de la liste des parties »). Mode liste : cartes jointes en bloc continu (`gap: 0` + séparateurs portés par l'élément hôte `app-character-summary-card`, atteignable depuis le parent — le bouton interne ne l'est pas, encapsulation), nouvelle sous-ligne unique `__compact-sub` « Classe · Partie » (la première version masquait toute info secondaire ; retour utilisateur : ces deux repères sont importants). Le type, le rôle de groupe et les marqueurs de propriété ne sont **pas rendus** en compact (template, pas CSS).
  4. **Ce qui distingue grand de moyen pour les personnages** — question ouverte soulevée par l'utilisateur, **aucune spec ne la tranchait**. Décision prise avec lui : le mode grand est le seul à porter les stats dérivées (`showStats` câblé sur `charactersViewMode() === 'large'` au lieu de `false` en dur), avatar 64 px, stats en pleine largeur sous le bloc d'infos. Réutilise l'input `showStats` existant, aucun mécanisme nouveau.
  5. **Bulle de montée de niveau replacée sur le cercle** (retour utilisateur). Vérification : ce n'était **pas** une régression d'un correctif — la pastille texte est en place sur `CharacterSummaryCard` depuis `db1b1f4` (2026-07-10), inchangée. La bulle dont se souvenait l'utilisateur est celle de `RosterStrip`/`RosterRail` (Story 27.3, `▲` 14×14 px en `position: absolute` sur l'avatar). Le même signal avait donc **deux rendus différents selon l'écran** : `CharacterSummaryCard` s'aligne désormais sur le roster (patron repris verbatim, avatar enveloppé dans `__avatar` en `position: relative`, bulle agrandie à 20 px en mode grand pour rester visible sur un cercle de 64 px). Écart assumé avec le roster : `role="img"` + `aria-label` au lieu d'`aria-hidden="true"` — le libellé visible disparaissant, il doit rester annoncé. Le `LevelUpBanner` de la **fiche** (FR-17/Story 28.3, bandeau + CTA) n'est pas touché : périmètre différent, signalé à l'utilisateur.
  - Vérifié : Web 89/89 fichiers, **1273/1273 tests verts** (+16 tests ajoutés : 6 sur le gabarit ligne du Dashboard, 7 sur `CharacterSummaryCard`, 3 sur `MyCharacters`), lint propre sur tous les fichiers touchés. **Non vérifié visuellement** : l'application exige une session authentifiée, la vérification en conditions réelles reste à faire par l'utilisateur.

- **Revue de code (bmad-code-review, 2026-08-12, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `b8157d7f`)** : 31 constats bruts → 20 après dédoublonnage. 1 decision-needed résolue par l'utilisateur (seuil symétrique de révélation au défilement conservé tel quel malgré la formulation littérale de l'AC5, écart jugé mineur). 4 patches appliqués : test `character.service.spec.ts` corrigé (utilisait le même `gameSystemId` pour ses deux personnages « distincts », ne prouvait pas la déduplication par système), `lastScrollY` de `ListControlBar` initialisé depuis `window.scrollY` réel plutôt que 0 (évite un premier calcul de delta erroné sur une page déjà défilée au montage), gestionnaire `resetRequested` de `Dashboard` extrait en méthode nommée `onResetRequested()` (cohérence avec les autres handlers), commentaire « vocabulaire disjoint » de `CHARACTER_SORTS` corrigé (partage bien `'nom'` avec `PARTIE_SORTS`, contrairement à ce qu'affirmait le commentaire référençant AD-1). 8 items différés dans `deferred-work.md` (casts non validés `resolveContentLabel()`/`sheetData`, `Promise.all` non résilient sur `gameSystemIds`, lookups catalogue en `.find()` linéaire, absence de contrainte d'énumération DB sur les 3 champs de préférence, pattern ARIA `role="group"` du sélecteur de mode, `hasDeviatedFromDefault`/`resetRequested` inertes sur `MyCharacters`, `$any($event)` sur `sortChange`, `showStats` non couplé structurellement à `density`). 7 constats écartés comme bruit après vérification dans le code (garde `level` non-nullable en base, `gameSystemId` FK requise non-nullable, clés de thème `list_control_bar.*` non déclinées par thème — conforme au patron déjà établi par `dashboard.controls_toggle_aria` en Story 29.8, badge `role="img"` déjà documenté comme décision assumée, formatage de la migration Prisma standard, repli `?? sort` conforme au patron du projet, décision `compactSubtitle` déjà documentée dans cette story). Suite finale : API 54/54 suites (1097/1097 tests, typecheck propre), Web 89/89 fichiers (1273/1273 tests). Statut passé à done.

### File List

**Backend**
- `apps/api/prisma/schema.prisma` (+ `User.partiesViewMode`/`.charactersViewMode`/`.charactersSort`)
- `apps/api/prisma/migrations/20260810215107_modes_affichage_listes/` (nouveau)
- `apps/api/src/account/dto/update-preferences.dto.ts` (+ 3 champs)
- `apps/api/src/account/account.controller.spec.ts` (+ tests)
- `apps/api/src/account/account.service.spec.ts` (+ tests)
- `apps/api/src/characters/character.service.ts` (`findMine()` : résolution `classLabel`/`typeLabel`/`groupRoleLabel`, correctif post-implémentation)
- `apps/api/src/characters/character.service.spec.ts` (+ tests)

**Shared**
- `packages/shared/src/index.ts` (`LIST_VIEW_MODES`, `ListViewMode`, `CHARACTER_SORTS`, `CharacterSort`, `AuthUser` +3 champs, `MyCharacterDto` +3 champs `classLabel`/`typeLabel`/`groupRoleLabel`)

**Frontend — nouveaux**
- `apps/web/src/app/core/characters/character-sort.ts`, `.spec.ts`
- `apps/web/src/app/shared/list-control-bar/list-control-bar.ts`, `.html`, `.scss`, `.spec.ts`

**Frontend — modifiés**
- `apps/web/src/app/core/theme/tones.ts` (clés `list_control_bar.*`, `dashboard.search_label`, `my_characters.sort_*`, `dashboard.row_signal_count_aria` ×3 thèmes)
- `apps/web/src/app/core/account/account.service.ts` (signature `updatePreferences()` étendue)
- `apps/web/src/app/features/dashboard/dashboard.ts`, `.html`, `.scss`, `.spec.ts`
- `apps/web/src/app/features/characters/my-characters/my-characters.ts`, `.html`, `.scss`, `.spec.ts`
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts`, `.html`, `.scss`, `.spec.ts` (+ inputs `density`/`typeLabel`/`groupRoleLabel`/`showStats`/`showMjMarker`, niveau affiché systématiquement — non prévus dans la story initiale, cf. Completion Notes)
- `apps/web/src/app/core/characters/character-sort.spec.ts` (fixture `makeMyCharacter()` +3 champs)
- 5 fixtures `AuthUser` web (cf. Task 2)
