---
baseline_commit: 2a19e153ec4e43fd939569e54d7030b278a3a2fc
---

# Story 28.2: Le nom affiché traverse l'application

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want savoir en permanence si le nom que je lis est celui d'un joueur ou celui d'un personnage,
so that je cesse de deviner à chaque écran.

## Contexte

**Deuxième story de l'épic 28**, elle consomme directement ce que la story 28.1 a posé : `User.displayName` (NOT NULL, jamais nul) et l'écran de compte pour le modifier. Cette story fait traverser ce champ dans **tous** les DTO d'identité de l'API, et introduit le composant partagé `IdentityLabel` qui devient le **seul** point de rendu d'un nom d'identité dans le front.

Deux règles gouvernent tout le travail de cette story :

- **`AD-2`** (architecture) : tout DTO exposant une identité utilisateur porte **les deux champs**, `pseudo` et `displayName` — jamais l'un sans l'autre, jamais un repli `displayName ?? pseudo` écrit côté front (`displayName` est `NOT NULL` en base, aucun repli n'est nécessaire). **Une seule exception explicite** : le DTO de recherche d'utilisateurs pour une invitation (`UserSearchResultDto`) ne porte **que** `pseudo` — ni nom affiché, ni e-mail. Et une règle de confidentialité : `PartieMemberDto.email` n'est renseigné que si le demandeur est le **MJ** de la partie ; il est omis pour tout autre membre.
- **`AD-12`** (architecture) : tout affichage d'un nom d'identité passe par **un composant partagé unique**, `IdentityLabel`. Le traitement visuel, longtemps différé par `AD-12`, a depuis été tranché par la passe d'UX du 2026-08-04 (`EXPERIENCE.md` §4.5, `DESIGN.md` §7.5) : **deux noms affichés ensemble** → personnage en italique, joueur en romain, aucune icône ; **un seul nom affiché** → une icône est **obligatoire** (écu pour un personnage, silhouette pour un joueur). C'est la convention que cette story câble.

**Cette story ne construit PAS l'alerte d'homonymie** (FR-4b) ni le repositionnement de la pastille de montée de niveau (FR-17) — les deux sont la story 28.3, qui vient juste après et consomme le `pseudo` que cette story rend disponible partout. Ne pas les anticiper.

### Découverte faite en préparant cette story — à connaître avant de coder

**Le modèle `Announcement` n'a aucune relation vers `User`.** Aucun `authorId`, aucune FK, rien ne permet aujourd'hui de savoir qui a publié une annonce. Créer un nouveau champ persisté exigerait une migration — **évitée ici** : une annonce n'est publiable que par le MJ de la Partie (`AnnouncementsService.create()` est gardé par `parties.getOwned(partieId, mjId)`, un seul MJ par Partie). **L'auteur d'une annonce est donc dérivé de `Partie.mjId`, jamais stocké** — zéro migration, zéro nouveau champ Prisma. Voir Task 7.

## Acceptance Criteria

1. **Given** un DTO exposant une identité utilisateur — membres d'une partie, propriétaire d'un personnage, participants de scénario, auteur d'une annonce, lignes de distribution d'XP, membres d'un créneau de disponibilité — **When** il est renvoyé par l'API, **Then** il porte `pseudo` **et** `displayName`, **and** `displayName` n'est jamais nul, aucun repli n'étant écrit côté front.

2. **Given** un écran affiche un nom de joueur et un nom de personnage ensemble, **When** il les rend, **Then** le nom de personnage est en italique et celui du joueur en romain, **and** aucune de ces deux informations n'est portée par la couleur seule.

3. **Given** un écran n'affiche qu'un seul nom, quel qu'il soit, **When** il le rend, **Then** une icône l'accompagne — écu pour un personnage, silhouette pour un joueur.

4. **Given** n'importe quel affichage d'un nom d'identité dans l'application, **When** il est rendu, **Then** il passe par le composant partagé `IdentityLabel`, **and** aucun template ne compose la convention à la main (italique/icône câblés directement dans un template métier).

5. **Given** un joueur consulte la liste des membres d'une partie, **When** il la reçoit, **Then** aucun e-mail d'un autre utilisateur n'y figure, **and** le MJ de cette partie, lui, continue de les voir.

6. **Given** la recherche d'utilisateurs pour une invitation, **When** elle renvoie des résultats, **Then** ils ne portent que le pseudo — ni nom affiché, ni e-mail.

7. **Given** l'onglet Détails › Troupe, qui n'affiche aujourd'hui que le nom du personnage (le pseudo du joueur n'existe que dans l'`aria-label`, jamais visible à l'écran), **When** il est rendu après cette story, **Then** chaque ligne porte le personnage **et** son joueur lorsque le personnage existe, **and** une ligne sans personnage (MJ, ou membre sans personnage) n'affiche que le joueur, accompagné de son icône silhouette.

## Tasks / Subtasks

### Backend

- [x] Task 1 — Types partagés : étendre tous les DTO d'identité (AC: #1, #6)
  - [x] `packages/shared/src/index.ts`, `PartieMemberDto` : ajouter `displayName: string;` après `pseudo`. Rendre `email` optionnel — `email?: string;` — avec un commentaire expliquant qu'il n'est présent que pour le demandeur MJ (AC5).
  - [x] `CharacterDto` : ajouter `ownerDisplayName: string;` juste après `ownerPseudo`.
  - [x] `ScenarioDto.participants` (inline `{ userId: string; pseudo: string }[]`) : ajouter `displayName: string`.
  - [x] `AnnouncementDto` : ajouter `authorPseudo: string;` et `authorDisplayName: string;`.
  - [x] `XpDistributionEntryDto` : ajouter `ownerPseudo: string;` et `ownerDisplayName: string;` (identité du **propriétaire du personnage crédité**, pas celle du MJ qui distribue).
  - [x] `AvailableSlotDto.members` (inline `{ userId: string; pseudo: string; status: SlotStatus }[]`) : ajouter `displayName: string`.
  - [x] `UserSearchResultDto` : **retirer** `email: string;`. Ne porte plus que `id`, `pseudo`. **Ne pas ajouter `displayName`** — AD-2 l'exclut explicitement de ce DTO (AC6).
  - [x] **Hors scope explicite, ne pas toucher** : `PollVoteDto`, `SeanceInscriptionDto.inscrits`, `HommeDragonDto.voyageursProteges`, `InvitationDto.inviterPseudo`. Ce ne sont pas les catégories explicitement nommées par l'AC1 ("membres d'une partie, propriétaire de personnage, participants, auteur d'annonce, lignes de distribution d'XP, membres d'un créneau") — les étendre serait un élargissement de périmètre non demandé par cette story.

- [x] Task 2 — `PartieMemberDto` : `displayName` + e-mail réservé au MJ (AC: #1, #5)
  - [x] `apps/api/src/parties/parties.service.ts`, méthode `listMembers()` (actuellement ~ligne 97-110) : le `select` du `include.user` passe de `{ id: true, pseudo: true, email: true }` à `{ id: true, pseudo: true, displayName: true, email: true }`.
  - [x] La méthode doit connaître le rôle du demandeur pour décider d'inclure `email`. Elle a déjà `partieId` et `userId` (le demandeur) en paramètres et appelle déjà `this.getViewable(partieId, userId)` — cet appel renvoie la `Partie` (donc `mjId`). Comparer `partie.mjId === userId` pour décider si `email` est inclus dans chaque ligne mappée ; sinon `email: undefined` (jamais une chaîne vide — `undefined` s'omet proprement en JSON, contrairement à `''`).
  - [x] Test : un membre non-MJ demandant la liste → aucune ligne ne porte `email` (`toBeUndefined()`) ; le MJ demandant la même liste → toutes les lignes portent `email`. Test existant sur le mapping de base à étendre pour vérifier `displayName` également présent dans les deux cas.

- [x] Task 3 — `CharacterDto.ownerDisplayName` (AC: #1)
  - [x] `apps/api/src/characters/character.service.ts`, fonction `toDto()` (~ligne 1581) : signature actuelle `toDto(character, ownerPseudo: string, ownerIsMj: boolean, viewerIsMj: boolean)`. Ajouter un paramètre `ownerDisplayName: string` (après `ownerPseudo`, avant `ownerIsMj` — même ordre que les champs dans `CharacterDto`), et `ownerDisplayName,` dans l'objet retourné.
  - [x] **4 sites d'appel à mettre à jour, tous dans ce fichier :** (en réalité 3 sites nommés + 8 sites via `resolveOwnerInfo()`, tous mis à jour)
    - `create()` (~ligne 256-259) : `const owner = await this.users.findById(userId);` renvoie déjà la ligne complète (donc `owner?.displayName` est disponible sans changement de requête) → `toDto(character, owner?.pseudo ?? '', owner?.displayName ?? '', isMj, isMj)`.
    - `findOne()` (~ligne 363, 369-374) : même chose, `owner?.displayName ?? ''` en plus de `owner?.pseudo ?? ''`.
    - `findByPartie()` (~ligne 377-406) : la résolution par lot limite déjà le `select` à `{ id: true, pseudo: true }` (ligne ~394) — **ajouter `displayName: true`**. Étendre la `Map` (`pseudoById`) pour aussi porter `displayName`, ou construire une seconde map — au choix, mais les deux valeurs doivent être disponibles pour l'appel à `toDto()` ligne ~400-405.
    - `resolveOwnerInfo()` (privée, ~ligne 1531-1543) : appelée par 8 méthodes de mutation. Son type de retour `{ pseudo: string; isMj: boolean }` devient `{ pseudo: string; displayName: string; isMj: boolean }`. `this.users.findById(ownerId)` (déjà appelée dedans) renvoie déjà la ligne complète — juste ajouter `displayName: owner?.displayName ?? ''` à l'objet retourné. Chaque site d'appel passe alors `owner.displayName` à `toDto()`.
  - [x] Test : `character.service.spec.ts` — au moins un test par site d'appel modifié vérifiant `ownerDisplayName` dans le DTO retourné (tests existants sur `ownerPseudo` étendus).

- [x] Task 4 — `ScenarioDto.participants` (AC: #1)
  - [x] `apps/api/src/scenarios/scenarios.service.ts`, fonction `loadParticipants()` (~ligne 963-972) : le `select` de `user` passe de `{ pseudo: true }` à `{ pseudo: true, displayName: true }` ; le `.map()` ajoute `displayName: p.user.displayName`.
  - [x] Même changement dans la variante batchée de `findAllForPartie()` (~ligne 267-276) : `select: { pseudo: true }` → `{ pseudo: true, displayName: true }`, et l'objet poussé dans `byScenario` porte `displayName`.
  - [x] Test : au moins un test sur chacune des deux méthodes vérifiant `displayName` dans les participants retournés.

- [x] Task 5 — `AvailableSlotDto.members` (AC: #1)
  - [x] `apps/api/src/parties/parties.service.ts`, fonction privée `resolveParticipants()` (~ligne 142-168, utilisée par `getAvailableSlots`/`getHeatmap`) : les deux `select` (MJ ligne ~146, membres ligne ~150) passent de `{ id: true, pseudo: true }` à `{ id: true, pseudo: true, displayName: true }` ; le mapping final ajoute `displayName`.
  - [x] Test : vérifier `displayName` présent dans `AvailableSlotDto.members` pour un slot avec MJ et membres.

- [x] Task 6 — `XpDistributionEntryDto` : identité du personnage crédité (AC: #1)
  - [x] `apps/api/src/xp-distributions/xp-distributions.service.ts` : les requêtes de `createDistribution()` et `listForPartie()` (actuellement `include: { entries: true }`, sans jointure `Character`/`User`) doivent étendre l'`include` à `entries: { include: { character: { include: { user: { select: { pseudo: true, displayName: true } } } } } }`. La relation Prisma existe déjà nativement (`XpDistributionEntry.character → Character`, `Character.userId → User`, `schema.prisma`) — aucune migration.
  - [x] `toDto()` (~ligne 107-119) : dans le `.map()` des `entries`, ajouter `ownerPseudo: e.character.user.pseudo` et `ownerDisplayName: e.character.user.displayName`.
  - [x] Test : une distribution avec au moins une entrée → `ownerPseudo`/`ownerDisplayName` présents et corrects dans le DTO retourné, pour `createDistribution()` **et** `listForPartie()`.

- [x] Task 7 — `AnnouncementDto` : auteur dérivé de `Partie.mjId` (AC: #1)
  - [x] `apps/api/src/announcements/announcements.service.ts`, `toDto()` (~ligne 12-20) : ajouter un second paramètre `mj: { pseudo: string; displayName: string }`, et `authorPseudo: mj.pseudo, authorDisplayName: mj.displayName` dans l'objet retourné.
  - [x] `create()` (~ligne 31-55) : `mjId` est déjà un paramètre de la méthode. Après la création de l'annonce, résoudre `const mj = await this.prisma.user.findUnique({ where: { id: mjId }, select: { pseudo: true, displayName: true } });` puis `toDto(announcement, mj!)`. (Le MJ existe forcément — `getOwned(partieId, mjId)` a déjà validé son existence en amont.)
  - [x] `findAll()` (~ligne 60-67) : étendre la requête `findMany` avec `include: { partie: { select: { mj: { select: { pseudo: true, displayName: true } } } } }`, puis `announcements.map((a) => toDto(a, a.partie.mj))`.
  - [x] Test : `create()` et `findAll()` renvoient tous deux `authorPseudo`/`authorDisplayName` correspondant au MJ de la Partie — pas au demandeur (un joueur consultant `findAll()` doit voir le pseudo/nom du **MJ**, pas le sien).

- [x] Task 8 — `UserSearchResultDto` : retrait de l'e-mail (AC: #6)
  - [x] `apps/api/src/users/users.service.ts`, `searchByEmailOrPseudo()` : `select: { id: true, pseudo: true, email: true }` → `select: { id: true, pseudo: true }`. Mettre à jour le commentaire de la méthode (qui dit actuellement "juste de quoi inviter (id, pseudo, email)").
  - [x] **Ne pas toucher la logique de correspondance** (`OR: [{ email: q }, { pseudo: q }]` reste une égalité stricte) — la recherche partielle est la story 32.1, hors scope ici.
  - [x] Test : le résultat ne porte plus `email`. Vérifier aussi qu'aucun consommateur de ce DTO (`PartiesService.searchUsers()` / `partie-detail.html` résultats de recherche) ne lit `.email` — sinon `undefined` s'affiche. (vérification frontend faite en Task 14)

### Frontend

- [x] Task 9 — Composant partagé `IdentityLabel` (AC: #2, #3, #4) — implémenté avec `mode: 'joint' | 'single-character' | 'single-player'` dérivé des inputs, icônes SVG inline reprenant les tracés du mockup, `identity.character_label`/`identity.player_label` ajoutés aux 3 thèmes. Correctifs de compilation transverses (non prévus explicitement par la story mais requis par le changement de forme de 6 DTO partagés) : `ng test` type-checkant les specs (piège déjà documenté story 28.1), une quinzaine de fixtures/littéraux `PartieMemberDto`/`CharacterDto`/`AnnouncementDto`/`AvailableSlotDto`/`XpDistributionEntryDto`/`ScenarioDto.participants` à travers le codebase web mis à jour avec `displayName`/`ownerDisplayName`/`authorPseudo`/`authorDisplayName` ; `partie-detail.html` : `u.email` retiré de l'affichage des résultats de recherche (UserSearchResultDto ne le porte plus).
  - [x] Créer `apps/web/src/app/shared/identity/identity-label.ts` + `.html` + `.scss` + `.spec.ts` — **premier fichier du nouveau dossier `shared/`** (n'existe pas encore ; seuls `core/`, `features/`, `layout/` existent aujourd'hui).
  - [x] Deux inputs, tous deux optionnels : `characterName = input<string | null>(null)` et `playerName = input<string | null>(null)`. Au moins un des deux doit être fourni par l'appelant (pas de garde runtime nécessaire — un appel sans aucun des deux est une erreur d'intégration, pas un état à gérer silencieusement).
  - [x] `mode` dérivé (`computed`) : `'joint'` si les deux noms sont fournis, `'single-character'` si seul `characterName`, `'single-player'` si seul `playerName`.
  - [x] Template :
    - Mode `joint` : deux `<span>`, personnage en premier (`font-style: italic`, teinte `accent-1` du thème), joueur en second (`font-style: normal`, teinte `text-muted`) — **aucune icône**. Reproduit EXPERIENCE.md §4.5 traitement A.
    - Mode `single-*` : une icône SVG inline (voir ci-dessous) + le nom, l'icône portant `aria-hidden="true"` et le conteneur portant `[attr.aria-label]` construit à partir d'une nouvelle paire de clés de thème (voir sous-tâche suivante) + le nom — jamais l'icône seule sans équivalent textuel pour un lecteur d'écran (même discipline que `roster-row.util.ts#withLevelUpSuffix`).
  - [x] Icônes SVG — reprendre exactement les tracés de `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/convention-identite.html` (lignes 62-69) : écu (`#icPc`, `viewBox="0 0 16 16"`, `<path d="M8 1 L15 3.5 V8 C15 11.5 11.8 14.2 8 15 C4.2 14.2 1 11.5 1 8 V3.5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`) et silhouette (`#icPl`, `<circle cx="8" cy="5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.8 14.5 C1.8 10.6 4.6 9 8 9 C11.4 9 14.2 10.6 14.2 14.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`). Inliner le SVG complet (pas de `<use>`/`<defs>` global partagé — chaque instance du composant porte son propre SVG, plus simple et plus sûr qu'un unique bloc `<defs>` global à coordonner entre toutes les instances montées simultanément).
  - [x] `apps/web/src/app/core/theme/tones.ts` : nouvelle section `/* — identité — */` dans les **trois** thèmes, deux clés : `identity.character_label` et `identity.player_label`. Ce sont des libellés d'accessibilité structurels (comme `roster.mj_badge`, déjà identique dans les trois thèmes) — même valeur dans les trois thèmes est un pattern déjà établi, pas une exception : `'Personnage'` / `'Joueur'` partout.
  - [x] `identity-label.spec.ts` : un test par mode (`joint`, `single-character`, `single-player`), vérifiant le DOM rendu (italique/romain en mode joint, présence de l'icône + `aria-label` en mode single) — calqué sur `scenario-status-badge.spec.ts` (`TestBed`, `fixture.componentRef.setInput(...)`).

- [x] Task 10 — Câblage : Troupe (`roster-row.util.ts`/`roster-rail`/`roster-strip`) (AC: #4, #7)
  - [x] **Piège de nommage** : `RosterRow.displayName` (existant, `roster-row.util.ts`) est un **libellé de présentation** (le nom du personnage, ou le pseudo à défaut) — **sans rapport** avec le nouveau champ `User.displayName`/`PartieMemberDto.displayName`. Ne pas les confondre. Renommé en `RosterRow.avatarLabel` (utilisé tel quel par `<app-character-avatar [name]="...">`) + nouveau `characterLabel: string | null`.
  - [x] `RosterRow` gagne un champ `playerLabel: string` = `member.displayName` (jamais `member.pseudo` — c'est le nom affiché qui doit primer, cf. AC1/AC2). `character: CharacterDto | null` existe déjà et porte `ownerDisplayName` depuis Task 3.
  - [x] `roster-rail.html` (~ligne 54-63) et `roster-strip.html` (~ligne 40) : remplacer le rendu texte brut par `<app-identity-label [characterName]="row.characterLabel" [playerName]="row.playerLabel" />`. Pour une ligne MJ ou sans personnage, `characterLabel` vaut `null` → mode `single-player` automatique (silhouette + `playerLabel`).
  - [x] Importer `IdentityLabel` dans les `imports: [...]` de `RosterRail` et `RosterStrip`.
  - [x] `ariaLabel` (déjà construit dans `roster-row.util.ts`) reste inchangé dans sa logique — il utilise déjà `member.pseudo` pour l'accessibilité ; **remplacé `member.pseudo` par `member.displayName`** dans sa construction (cohérence AC1/AC2 : c'est le nom affiché qui identifie, pas le pseudo, sauf exception homonymie qui est 28.3).
  - [x] Tests `roster-rail.spec.ts`/`roster-strip.spec.ts` ajustés : assertions `aria-label` mises à jour (`displayName` au lieu de `pseudo`) ; rendu DOM validé transitivement via `IdentityLabel`.

- [x] Task 11 — Câblage : fiche personnage (badge propriétaire) + distribution d'XP (AC: #4)
  - [x] `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (~ligne 14-20) : la branche `@else` (propriétaire non-MJ) remplace `{{ character().ownerPseudo }}` par `<app-identity-label [playerName]="character().ownerDisplayName" />`. La branche `ownerIsMj` (badge "Maître"/`character.owner_badge_mj`) reste **inchangée** — ce n'est pas un nom d'identité, c'est un rôle, `IdentityLabel` ne s'y applique pas.
  - [x] Importer `IdentityLabel` dans `CharacterSummaryCard`.
  - [x] `apps/web/src/app/features/parties/xp-distribution-panel/xp-distribution-panel.html` (~ligne 24-28) : chaque ligne affiche aujourd'hui `{{ characterName(pair.character) }}` seul (aucun nom de joueur). Ajouté le nom du joueur en mode `joint` : `<app-identity-label [characterName]="characterName(pair.character)" [playerName]="pair.character.ownerDisplayName" />`, en gardant la `mat-checkbox` et son `(change)` existants autour.
  - [x] `apps/web/src/app/features/parties/xp-history/xp-history.ts`, `labelForCharacter()` (~ligne 43-48) : renommée `characterLabelFor()`, ne renvoie plus qu'un `string | null` (nom narratif ou `null`). Le nom du joueur vient désormais directement de `entry.ownerDisplayName` (porté par `XpDistributionEntryDto` depuis Task 6) plutôt que d'être reconstruit via `characters()` — plus robuste. `xp-history.html` : `<app-identity-label [characterName]="entry.characterLabel" [playerName]="entry.playerLabel" />`.
  - [x] Tests des trois composants ajustés (assertions de texte mises à jour).

- [x] Task 12 — Câblage : disponibilités, vote, participants sans personnage (AC: #3, #4)
  - [x] `apps/web/src/app/features/calendar/creneau-card/creneau-card.html` (~ligne 10-18) : `<span class="creneau-card__pseudo">{{ member.pseudo }}</span>` (précédé d'un `⚔` décoratif `aria-hidden`) → `<app-identity-label [playerName]="member.displayName" />`, qui apporte sa propre icône silhouette (`⚔` retiré). `missingAlert()` renommé en paramètre `displayName`, interpole désormais `member.displayName`.
  - [x] `poll-status.html` **laissé inchangé, hors scope confirmé** — `PollVoteDto` n'a pas été étendu (Task 1 l'exclut explicitement).
  - [x] `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (~ligne 106) et `scenario-editor.html` (~ligne 94) : `{{ p.pseudo }}` (participant sans personnage) → `<app-identity-label [playerName]="p.displayName" />`, `p` étant un élément de `ScenarioDto.participants` (porte `displayName` depuis Task 4). `<span class="hint">(pas encore de personnage)</span>` adjacent inchangé.
  - [x] `IdentityLabel` importé dans les `imports` de chaque composant touché.
  - [x] Tests ajustés : nouveau test dédié pour `creneau-card` vérifiant icône silhouette + `displayName` (pas `pseudo`) ; `scenario-read-dialog`/`scenario-editor` déjà couverts par les assertions de texte existantes (« pas encore de personnage »).

- [x] Task 13 — Câblage : auteur d'annonce (AC: #1, #4)
  - [x] **Dépend de Task 7** (backend). `apps/web/src/app/features/announcements/annonce-card/annonce-card.html` : ajouté `<app-identity-label [playerName]="announcement().authorDisplayName" />` (mode `single-player`) après le `scope-label`, avant le texte.
  - [x] `IdentityLabel` importé dans `AnnonceCard`.
  - [x] Test `annonce-card.spec.ts` : nouveau test vérifiant la présence de `authorDisplayName` + icône dans le DOM rendu.

- [x] Task 14 — Câblage : listes de membres de Partie + menu utilisateur (AC: #1, #4, #6)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` :
    - Ligne ~75 (liste mobile "Troupe" repliable, non-MJ) : `{{ m.pseudo }}` → `<app-identity-label [playerName]="m.displayName" />`.
    - Ligne ~263 (onglet Invitations, liste des membres actuels avec bouton retirer) : même remplacement.
    - Ligne ~284 (résultats de **recherche** d'utilisateur pour inviter, `UserSearchResultDto`) : **non touché** — reste `{{ u.pseudo }}`. Exception explicite d'AD-2 (AC6).
  - [x] `IdentityLabel` importé dans `PartieDetail`.
  - [x] `apps/web/src/app/layout/shell/shell.html` (ligne 33) et `apps/web/src/app/features/join/join.html` (ligne 15) : `user()?.pseudo` / `loggedIn()?.pseudo` → `user()?.displayName` / `loggedIn()?.displayName`. Pas de `IdentityLabel` (nom du compte connecté, aucune ambiguïté joueur/personnage).
  - [x] Tests `shell.spec.ts` ajusté (fixture `currentUser` complétée avec `displayName`). Pas de spec dédié pour `join`/`partie-detail` à modifier (assertions existantes déjà compatibles, `toContain('Alice')` reste vrai pour `'Alice au pays'`).

- [x] Task 15 — Suites complètes et vérifications
  - [x] `docker compose exec api pnpm test` — aucune régression. 49/49 suites, 941/941 tests verts.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm test` — aucune régression. 77/77 fichiers, 1032/1032 tests verts (baseline 1027 + nouveaux tests `identity-label`/`creneau-card`/`annonce-card`).
  - [x] `docker compose exec web pnpm build` — compile sans erreur de type. Dépassement de budget : 208.79 Ko (baseline mesurée via `git stash` : 204.84 Ko) — augmentation de ~4 Ko cohérente avec le nouveau composant `IdentityLabel` réutilisé dans 8 endroits.
  - [x] **Redémarré réellement le conteneur api** — `Nest application successfully started` confirmé, aucune erreur de compilation.
  - [x] Vérification manuelle bout-en-bout (curl réel contre le conteneur + lecture directe PostgreSQL) :
    - `GET /parties/:id/members` en MJ → `email` présent pour chaque membre ; en non-MJ (Alice) → `email` totalement absent des deux lignes (AC5).
    - `GET /users/search?q=admin` → `{ id, pseudo }` uniquement, aucun `email`, aucun `displayName` (AC6).
    - `POST /parties/:id/announcements` (MJ) puis `GET .../announcements` (MJ et joueur) → `authorPseudo`/`authorDisplayName` corrects (ceux du MJ, pas du demandeur) sur les deux chemins `create()`/`findAll()`. Annonce de test supprimée après vérification.

### Review Findings

*Revue du 2026-08-06 — trois couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 25 constats bruts → 20 après dédoublonnage → 2 écartés comme faux positifs après vérification dans le code.*

- [x] [Review][Decision] ✅ **Tranchée le 2026-08-06 — on étend `PollVoteDto`.** `<span aria-hidden="true">⚔</span> {{ vote.pseudo }}` est le motif retiré de `creneau-card` par la Task 12, et AC4 interdit la composition manuelle indépendamment d'AC1. Sans `displayName` sur `PollVoteDto`, la liste « ont répondu » nomme le joueur par son pseudo pendant que la liste « n'ont pas répondu » (patch, `PartieMemberDto`) le nomme par son nom affiché — même écran, deux noms. **Décision : dépassement de périmètre assumé**, `PollVoteDto` gagne `displayName` et les deux listes passent par `IdentityLabel`. Devient un patch (voir ci-dessous). [apps/web/src/app/features/poll/poll-status/poll-status.html:22]
- [x] [Review][Decision] ✅ **Tranchée le 2026-08-06 — aucun changement de code.** La ligne de Troupe du MJ reste identifiée comme **MJ seulement**, sans son personnage. Motif utilisateur : *le personnage du MJ est une spécificité Ryuutama, pas une règle générale* — une exception pourra être posée plus tard, système par système. Le code (`characterLabel: null` dans la branche `isMj`) est donc **correct tel quel** ; c'est le libellé d'AC7 qui est trop large. **Action de suivi hors code :** amender AC7 dans `epics.md` (story 28.2) pour exclure explicitement la ligne MJ de « lorsque le personnage existe », sinon la contradiction ressortira au prochain audit. [apps/web/src/app/features/parties/roster-row.util.ts:63-71]
- [x] [Review][Decision] ✅ **Tranchée le 2026-08-06 — on garde le CTA, on aligne le strip sur le rail.** Pour l'utilisateur courant sans personnage, « créer mon personnage » est une invite à l'action plus utile que le rappel de son propre nom. `roster-strip.html` est donc aligné sur `roster-rail.html` (CTA des deux côtés), et l'exception est actée dans AC7 plutôt que corrigée. Devient un patch (voir ci-dessous). [apps/web/src/app/features/parties/roster-strip/roster-strip.html:40]
- [x] [Review][Decision] ✅ **Tranchée le 2026-08-06 — écartée, aucun changement.** Le constat d'origine (« le MJ ne peut plus confirmer la cible d'une invitation trouvée par e-mail ») ne résiste pas à l'analyse : la recherche est une **égalité stricte** et `email`/`pseudo` sont uniques. Un e-mail saisi qui renvoie un résultat renvoie donc **par construction** le compte portant cet e-mail ; une faute de frappe ne renvoie aucun résultat, jamais un mauvais compte. Aucun risque d'inviter la mauvaise personne. Résidu théorique négligeable : deux résultats si un pseudo était littéralement une adresse e-mail. **Piste notée pour plus tard, à titre de confort uniquement** — faire porter au DTO le critère de correspondance (`matchedOn: 'email' | 'pseudo'`) lèverait l'ambiguïté d'affichage sans exposer aucune donnée personnelle.

- [x] [Review][Patch] `announcements.create()` : `mj!` non-null-asserté résolu après l'écriture, et l'émission SSE placée derrière une requête qui peut échouer [apps/api/src/announcements/announcements.service.ts:50-64]
- [x] [Review][Patch] `IdentityLabel` rend une icône seule avec un `aria-label` tronqué quand le nom est une chaîne vide (l'API produit `?? ''` sur propriétaire introuvable) [apps/web/src/app/shared/identity/identity-label.ts:19-23]
- [x] [Review][Patch] `XpHistory` : deux personnages sans nom du même joueur produisent deux lignes strictement identiques, et « personnage inconnu » disparaît silencieusement [apps/web/src/app/features/parties/xp-history/xp-history.ts:52-57]
- [x] [Review][Patch] `character-sheet.html` affiche `ownerPseudo` en texte brut hors `IdentityLabel`, alors que la carte résumé du même personnage a été migrée — violation AC4, fichier non exclu du périmètre [apps/web/src/app/features/characters/character-sheet/character-sheet.html:22]
- [x] [Review][Patch] **(issu de la décision 1)** Étendre `PollVoteDto` avec `displayName` et faire passer les **deux** listes de `poll-status` par `IdentityLabel` : les votants (`⚔ {{ vote.pseudo }}` composé à la main, AC4) et les manquants (`missingAlert(m.pseudo)` alors que `m` est un `PartieMemberDto` qui porte déjà `displayName`). Les deux vont ensemble — corriger la seconde seule créerait deux noms pour la même personne sur le même écran. Touche `packages/shared/src/index.ts`, le service/les requêtes de vote côté API, `poll-status.html`/`.ts` et les fixtures associées [apps/web/src/app/features/poll/poll-status/poll-status.html:22,31]
- [x] [Review][Patch] **(issu de la décision 3)** Aligner `roster-strip` sur `roster-rail` : afficher le CTA « créer mon personnage » à la place de l'identité pour la ligne de l'utilisateur courant sans personnage [apps/web/src/app/features/parties/roster-strip/roster-strip.html:40]
- [x] [Review][Patch] La confirmation de retrait d'un membre nomme le joueur par son pseudo alors que la ligne au-dessus affiche son nom affiché [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:492]
- [x] [Review][Patch] `roster-rail` perd `.roster-rail__name` (0.85rem/600) sur le chemin nominal ; `roster-strip` a conservé son wrapper équivalent — les deux composants du même diff divergent [apps/web/src/app/features/parties/roster-rail/roster-rail.html:57]
- [x] [Review][Patch] Le mode `joint` est en `flex-direction: column` et se retrouve inséré dans des contextes de ligne — `« : {{ amount }} XP »` s'aligne sur la baseline du bloc à deux lignes, et le libellé de `mat-checkbox` devient bi-ligne [apps/web/src/app/shared/identity/identity-label.scss:7-11, xp-history.html:19-20, xp-distribution-panel.html:26-30]
- [x] [Review][Patch] Task 3 déclarée « un test par site d'appel modifié » : aucune assertion `ownerDisplayName` sur les sites d'édition MJ, validation avec warnings, ni `setXp()` [apps/api/src/characters/character.service.spec.ts]
- [x] [Review][Patch] Task 11 déclare « tests des trois composants ajustés » : `xp-distribution-panel.spec.ts` est intact et absent de la File List, alors que l'affichage du nom du joueur y est un comportement neuf [apps/web/src/app/features/parties/xp-distribution-panel/xp-distribution-panel.spec.ts]

- [x] [Review][Defer] Le mode `joint` ne porte aucun équivalent non visuel de la distinction personnage/joueur [apps/web/src/app/shared/identity/identity-label.html:1-5] — deferred, le contrat d'UX (EXPERIENCE §4.5) a délibérément choisi la typographie seule en mode joint, et un `aria-label` naïf écraserait le texte visible
- [x] [Review][Defer] Homme Dragon : « voyageurs protégés » et historique affichent le pseudo, alors que `listMembers()` et `ScenarioDto.participants` portent désormais `displayName` [apps/api/src/homme-dragon/homme-dragon.service.ts:357-359,379-380] — deferred, `HommeDragonDto.voyageursProteges` explicitement hors périmètre (Task 1)
- [x] [Review][Defer] Le tableau de bord affiche « invité par {pseudo} » [apps/web/src/app/features/dashboard/dashboard.html:29] — deferred, `InvitationDto` explicitement hors périmètre (Task 1)
- [x] [Review][Defer] Les exports PDF impriment `ownerPseudo` sur la feuille [apps/api/src/characters/ryuutama-pdf.service.ts:220,388,445 · equipment-pdf.service.ts:26] — deferred, aucune AC ne couvre le contenu des artefacts exportés ; changer l'identité imprimée est une décision produit

**Suites après application des 11 patches (2026-08-06) :** `api pnpm typecheck` propre · `api pnpm test` **942/942** (baseline 941 + 1 nouveau) · `web pnpm test` **1033/1033** (baseline 1032 + 1 nouveau) · `web pnpm build` compile sans erreur de type, dépassement de budget **209,55 Ko** contre 208,79 Ko en fin de story, soit **+0,76 Ko** cohérents avec les patches · conteneur `api` redémarré réellement, `Nest application successfully started`, routes d'annonces mappées, `GET /health` → `{status:"ok", db:"up"}`.

**Effets de bord des patches, rattrapés :** l'ajout de `displayName` à `PollVoteDto` a cassé **22 littéraux de vote** dans 6 fichiers (`open-polls.service.spec.ts`, `poll.util.spec.ts`, `poll-response.spec.ts`, `poll-status.spec.ts`, `partie-detail.spec.ts`) plus **un site de production** — `poll-response.ts` construisait un vote optimiste à la main, il porte désormais `currentUser.displayName`. Le test `character-sheet.spec.ts` « pseudo du propriétaire affiché » assertait l'ancien comportement : réécrit pour vérifier le nom affiché, la présence d'`IdentityLabel` et l'icône silhouette (AC3).

**Écartés après vérification dans le code (faux positifs) :** consommateurs front de `PartieMemberDto.email` devenu optionnel — aucun n'existe, vérifié sur tout `apps/web` ; réattribution rétroactive de l'auteur d'une annonce en cas de changement de MJ — aucun mécanisme de transfert de MJ n'existe dans le code, et `create()`/`findAll()` lisent aujourd'hui la même valeur (`getOwned` garantit `mjId === partie.mjId`).

**Vérifié et jugé correct** (non compté comme constat) : les 11 sites d'appel de `toDto()` ont tous reçu le paramètre à la bonne position, les 3 services PDF consomment un `CharacterDto` déjà construit ; le renommage `RosterRow.displayName` → `avatarLabel` ne laisse aucune référence résiduelle dans le dépôt ; la garde MJ de `listMembers()` discrimine correctement, y compris pour un MJ également membre ; les tracés SVG sont identiques au caractère près au mockup ; toutes les relations Prisma étendues sont requises, aucun accès `.user.displayName` ne peut lever ; aucun dépassement de périmètre.

## Dev Notes

### État actuel des fichiers modifiés — résumé par catégorie

Voir le détail exact (numéros de ligne, code actuel) dans chaque Task ci-dessus — issu d'une exploration exhaustive du code réel au moment de la création de cette story. Points transverses :

- **Chaque site qui résout une identité utilisateur le fait déjà via un `select`/`include` Prisma explicite et minimal** (`{ pseudo: true }`, parfois `{ id: true, pseudo: true }`) — jamais un objet `User` brut propagé. Le motif de cette story est mécanique : ajouter `displayName: true` à chaque `select` existant, jamais introduire un nouveau pattern de requête.
- **`UsersService.findById()`** (utilisée par `character.service.ts`) ne fait **aucun** `select` — elle renvoie déjà la ligne `User` complète, donc `displayName` y est déjà présent au runtime, juste non lu. Ces sites (Task 3, `create()`/`findOne()`/`resolveOwnerInfo()`) ne demandent **aucun changement de requête**, seulement de lire un champ déjà là.
- **Un seul DTO perd un champ** dans cette story : `UserSearchResultDto` (Task 8, `email` retiré). Tous les autres DTO **gagnent** des champs, aucun champ existant n'est renommé au niveau de l'API (seul `RosterRow.displayName`, un type **frontend interne**, est renommé — cf. Task 10, piège de nommage).

### Ce qui doit continuer de fonctionner

- **`CharacterDto.ownerPseudo`** reste présent et inchangé — plusieurs endroits en dépendent encore (badge MJ, historique XP en repli). Cette story **ajoute** `ownerDisplayName` à côté, ne remplace rien.
- **Les 3 exports PDF de personnage** (`ryuutama-pdf.service.ts`, `equipment-pdf.service.ts`, `notes-pdf.service.ts`) appellent `findOne()`/`toDto()` indirectement — vérifier qu'aucun ne casse sur la nouvelle signature de `toDto()` (Task 3). Ils ne consomment probablement que `sheetData`/`derived`, pas `ownerPseudo`/`ownerDisplayName`, mais le typecheck le confirmera.
- **`PartiesService.searchUsers()`** (invitation) continue de fonctionner à l'identique niveau logique de recherche — seul le DTO de retour perd `email` (Task 8). Ne pas toucher `getOwned`/`getViewable`/`resolveParticipants` au-delà du `select` (Task 5).
- **La recherche d'utilisateur reste une égalité stricte** (`WHERE email = q OR pseudo = q`) — la recherche partielle est la story 32.1, **ne pas l'anticiper**.
- **Aucune émission temps réel nouvelle** : cette story ne fait qu'étendre la forme de DTO déjà émis par des mutations existantes (Partie, Personnage, Scénario, Annonce, Distribution XP) — ne rien ajouter à `RealtimeService`/`RealtimeEventsService`, ces mutations émettent déjà leurs événements respectifs, inchangés.

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Composant présentationnel pur, input-driven | patron de `features/scenarios/scenario-status-badge/` (4 fichiers, `computed()` de présentation, `TestBed`+`setInput` en test) | un nouveau patron de composant |
| Icône + nom + taille | `features/characters/character-avatar/character-avatar.ts` (le plus proche analogue existant pour les conventions de dimensionnement/`aria-label` calculé) | réinventer la logique d'accessibilité |
| Résolution d'identité en lot (pas de N+1) | pattern déjà utilisé par `character.service.ts#findByPartie` et `parties.service.ts#resolveParticipants` (`findMany` + `Map` indexée par id) | une boucle de requêtes individuelles |
| Libellé d'interface | `tones.ts`, les trois thèmes, valeur identique dans les trois si le libellé est structurel (déjà le cas de `roster.mj_badge`) | une chaîne en dur dans un template |

### Sécurité

- **`PartieMemberDto.email` conditionnel au rôle MJ** (Task 2, AC5) est un correctif de confidentialité réel : aujourd'hui tout membre d'une Partie voit l'e-mail de tous les autres membres, y compris ceux arrivés par un `InviteLink` à usages illimités que le MJ n'a pas choisis individuellement. Vérifier ce comportement par un test HTTP réel si possible (pas seulement une assertion unitaire sur le mapping), dans l'esprit du test `ValidationPipe` ajouté en story 28.1.
- **`UserSearchResultDto` sans e-mail** (Task 8) réduit la surface d'exposition de données personnelles lors d'une recherche d'invitation — cohérent avec FR-30.
- Rien dans cette story ne touche à l'authentification, aux mots de passe ou aux sessions — scope strictement DTO + affichage.

### Project Structure Notes

- **Nouveau** : `apps/web/src/app/shared/identity/identity-label.{ts,html,scss,spec.ts}` — premier fichier du dossier `shared/`, conforme au source tree de `ARCHITECTURE-SPINE.md` (§ Source tree, `shared/identity/`).
- **Modifiés (API)** : `packages/shared/src/index.ts`, `apps/api/src/parties/parties.service.ts`, `apps/api/src/characters/character.service.ts`, `apps/api/src/scenarios/scenarios.service.ts`, `apps/api/src/xp-distributions/xp-distributions.service.ts`, `apps/api/src/announcements/announcements.service.ts`, `apps/api/src/users/users.service.ts` + tous leurs `*.spec.ts` associés.
- **Modifiés (web)** : `apps/web/src/app/core/theme/tones.ts`, `apps/web/src/app/features/parties/roster-row.util.ts`, `roster-rail/`, `roster-strip/`, `apps/web/src/app/features/characters/character-summary-card/`, `apps/web/src/app/features/parties/xp-distribution-panel/`, `apps/web/src/app/features/parties/xp-history/xp-history.ts`, `apps/web/src/app/features/calendar/creneau-card/`, `apps/web/src/app/features/scenarios/scenario-read-dialog/`, `apps/web/src/app/features/scenarios/scenario-editor/`, `apps/web/src/app/features/announcements/annonce-card/`, `apps/web/src/app/features/parties/partie-detail/`, `apps/web/src/app/layout/shell/shell.html`, `apps/web/src/app/features/join/join.html` + tous leurs `*.spec.ts` associés.
- **Non touchés** : `packages/game-rules`, `PollVoteDto`, `SeanceInscriptionDto.inscrits`, `HommeDragonDto.voyageursProteges`, `InvitationDto`, `poll-status.html`, tout mécanisme de recherche partielle (story 32.1), toute alerte d'homonymie ou pastille de niveau (story 28.3).

### Pièges connus du projet

- **`pnpm typecheck` après un changement de forme de DTO partagé** — `ts-jest` ne type-check pas en cross-file (`isolatedModules`). Cette story change la forme de **six** DTO partagés simultanément (Task 1) : lancer le typecheck API **et** vérifier la build web (qui, elle, type-check réellement les fichiers `.spec.ts` — découverte de la revue de code story 28.1) après chaque DTO étendu, pas seulement à la fin.
- **Le champ `RosterRow.displayName` existant n'a aucun rapport avec `User.displayName`** — collision de nom pure coïncidence entre un type frontend interne (le libellé déjà résolu à afficher) et le nouveau champ API. Renommer le premier (Task 10) avant d'ajouter le second, pour ne jamais les confondre en cours de route.
- **Specs API important `game-rules`** — tout nouveau spec API qui importe `game-rules` (directement ou transitivement, typiquement via `CharacterService`) exige `jest.mock('@master-jdr/game-rules', ...)`. `character.service.spec.ts` l'a déjà (story 4.1) ; si un nouveau fichier de test touchant `CharacterService` est créé, appliquer la même précaution.
- **Budget de bundle Angular** — préexistant, ~204 Ko de dépassement à la baseline (relevé story 28.1 + sa revue de code). Le nouveau composant `IdentityLabel`, réutilisé dans ~8 endroits, devrait réduire la duplication de markup plus qu'il n'en ajoute — vérifier via `git stash` que le dépassement n'augmente pas anormalement.
- **Tout passe par Docker** — aucun outil Node sur l'hôte.

### Temps réel (checklist `docs/checklist.md`)

Aucun nouveau besoin de câblage SSE dans cette story — elle étend la **forme** de DTO déjà émis par des mutations existantes qui émettent déjà leurs événements respectifs (Partie, Personnage, Scénario, Annonce, Distribution XP), inchangés par ce travail. Ne pas ajouter d'entrée à `RealtimeService.handlers`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.2] — Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-4,FR-4b,FR-14,FR-15,FR-17,FR-30] — nom affiché, convention d'identité, autocomplétion
- [Source: .../ARCHITECTURE-SPINE.md#AD-2] — pseudo + displayName dans tous les DTO d'identité, exception recherche, e-mail réservé au MJ
- [Source: .../ARCHITECTURE-SPINE.md#AD-12] — composant `IdentityLabel` partagé, mécanisme fixé, apparence renvoyée à l'UX
- [Source: .../ARCHITECTURE-SPINE.md#Source tree] — emplacement `shared/identity/`
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#4.5] — règle exacte : deux noms = typographie seule, un nom = icône obligatoire
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md#7.5] — spécification du composant IdentityLabel, icônes écu/silhouette
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/convention-identite.html] — tracés SVG exacts des icônes, quatre écrans de référence
- [Source: apps/api/prisma/schema.prisma#Announcement] — confirmé : aucune relation vers User, auteur dérivé de Partie.mjId
- [Source: apps/api/prisma/schema.prisma#XpDistributionEntry] — relation directe vers Character (donc User), pas de nouvelle requête batch nécessaire
- [Source: apps/api/src/characters/character.service.ts#toDto,resolveOwnerInfo] — signature à étendre, 4+7 sites d'appel
- [Source: apps/api/src/parties/parties.service.ts#listMembers,resolveParticipants] — selects à étendre
- [Source: apps/api/src/scenarios/scenarios.service.ts#loadParticipants,toSeanceDto] — selects à étendre
- [Source: apps/api/src/announcements/announcements.service.ts#toDto] — nouveau paramètre mj
- [Source: apps/api/src/users/users.service.ts#searchByEmailOrPseudo] — select à réduire
- [Source: apps/web/src/app/features/parties/roster-row.util.ts] — collision de nom `displayName` à résoudre
- [Source: apps/web/src/app/features/characters/character-summary-card/character-summary-card.html] — badge propriétaire à migrer
- [Source: apps/web/src/app/features/scenarios/scenario-status-badge/] — patron de composant présentationnel à copier

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api pnpm test` → 49 suites, 941/941 passed (aucune régression).
- `docker compose exec api pnpm typecheck` → propre. Un site d'appel de `toDto()` non anticipé par la story (`scenarios.service.ts`, fonction `toDto()` elle-même — sa signature de paramètre `participants?` devait aussi être étendue, en plus des deux sites déjà listés) découvert via le typecheck après Task 4.
- `docker compose exec web pnpm test` → 77 fichiers, 1032/1032 passed (baseline 1027 + nouveaux tests `identity-label`, `creneau-card`, `annonce-card`). Découverte majeure non anticipée : le changement de forme de 6 DTO partagés (Task 1) s'est propagé à une quinzaine de fixtures/littéraux à travers tout le codebase web (`ng test` type-check les specs, piège déjà documenté story 28.1) — tous corrigés avant de pouvoir enchaîner sur le câblage `IdentityLabel` (Tasks 9-14).
- `docker compose exec web pnpm build` → compile sans erreur de type. Dépassement de budget : 208.79 Ko (baseline mesurée via `git stash`/`git stash pop` : 204.84 Ko) — augmentation de ~4 Ko cohérente avec le nouveau composant `IdentityLabel`, réutilisé dans 8 endroits.
- Redémarrage réel du conteneur `api` : `Nest application successfully started` confirmé après compilation propre.
- Vérification manuelle bout-en-bout (curl réel contre le conteneur + lecture/écriture PostgreSQL) : `GET /parties/:id/members` en MJ (email présent) vs en non-MJ Alice (email totalement absent, AC5) ; `GET /users/search` ne renvoie que `{id, pseudo}` (AC6) ; `POST`/`GET .../announcements` renvoient `authorPseudo`/`authorDisplayName` corrects (ceux du MJ, jamais du demandeur) sur les deux chemins `create()`/`findAll()`. Données de test nettoyées après vérification.

### Completion Notes List

- **AD-2** (pseudo + displayName dans tout DTO d'identité) appliqué aux 6 catégories explicitement nommées par l'AC1 : `PartieMemberDto`, `CharacterDto.ownerDisplayName`, `ScenarioDto.participants`, `AnnouncementDto` (auteur), `XpDistributionEntryDto` (propriétaire du personnage crédité), `AvailableSlotDto.members`. `PollVoteDto`, `SeanceInscriptionDto.inscrits`, `HommeDragonDto.voyageursProteges` et `InvitationDto` explicitement laissés hors scope (non nommés par l'AC), de même que la recherche partielle (story 32.1).
- **`Announcement` n'a aucune relation vers `User` en base** — découvert en préparant la story. Résolu sans migration : l'auteur est dérivé de `Partie.mjId` (un seul MJ par Partie, seule source d'écriture d'une annonce), jamais stocké.
- **`PartieMemberDto.email` conditionnel au rôle MJ** (AC5) — corrige un vrai défaut de confidentialité : un membre arrivé par `InviteLink` (usages illimités) voyait jusqu'ici l'e-mail de tous les autres membres, y compris ceux que le MJ n'a pas individuellement invités.
- **`UserSearchResultDto` perd `email`** (AC6, seule exception d'AD-2 — ne porte ni `email` ni `displayName`, seulement `pseudo`). Seul DTO de cette story qui *perd* un champ ; tous les autres en gagnent.
- **Composant `IdentityLabel`** (`shared/identity/`, premier fichier de ce nouveau dossier) implémente la convention tranchée par la passe d'UX du 2026-08-04 (`EXPERIENCE.md` §4.5) : deux noms ensemble → typographie seule (italique personnage/romain joueur) ; un seul nom → icône obligatoire (écu/silhouette, tracés SVG reprenant exactement le mockup `convention-identite.html`). Câblé dans 8 endroits : Troupe (roster), fiche personnage (badge propriétaire), distribution XP + historique XP, disponibilités (créneau), participants de scénario sans personnage (2 écrans), auteur d'annonce, listes de membres de Partie.
- **`XpHistory` simplifié** : la résolution de l'identité du joueur ne passe plus par un lookup local dans `characters()` (fragile si le personnage n'est plus chargé) mais directement par `entry.ownerDisplayName`, désormais porté par `XpDistributionEntryDto` (Task 6) — plus robuste que l'ancien code.
- **Piège de nommage résolu** : `RosterRow.displayName` (libellé de présentation interne, préexistant) renommé en `avatarLabel` + nouveau `characterLabel`/`playerLabel`, pour ne jamais le confondre avec le nouveau `User.displayName`/`PartieMemberDto.displayName`.
- **Découverte non anticipée par la story** : le changement de forme des 6 DTO partagés s'est propagé à une quinzaine de fixtures/littéraux `PartieMemberDto`/`CharacterDto`/`AnnouncementDto`/`AvailableSlotDto`/`XpDistributionEntryDto`/`ScenarioDto.participants` dans des fichiers non listés par la story (`poll.util.spec.ts`, `level-up-banner.spec.ts`, `level-up-wizard.spec.ts`, `annonce-card.spec.ts` — fixture locale distincte de la fixture partagée, etc.) — tous corrigés, `ng test` (qui type-check réellement les specs, cf. story 28.1) les aurait de toute façon bloqués.
- **`shell.html`/`join.html`** migrés de `pseudo` à `displayName` pour le nom du compte connecté dans son propre menu — pas de `IdentityLabel` ici (aucune ambiguïté joueur/personnage possible sur son propre nom de compte).

### File List

- `packages/shared/src/index.ts` (modifié — 6 DTO étendus, 1 DTO réduit)
- `apps/api/src/parties/parties.service.ts` (modifié — `listMembers()`, `resolveParticipants()`)
- `apps/api/src/parties/parties.service.spec.ts` (modifié)
- `apps/api/src/characters/character.service.ts` (modifié — `toDto()`, `resolveOwnerInfo()`, 3 sites d'appel)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `loadParticipants()`, `findAllForPartie()`, `toDto()`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié)
- `apps/api/src/xp-distributions/xp-distributions.service.ts` (modifié — `ENTRIES_WITH_OWNER_INCLUDE`, `toDto()`)
- `apps/api/src/xp-distributions/xp-distributions.service.spec.ts` (modifié)
- `apps/api/src/announcements/announcements.service.ts` (modifié — `toDto()`, `create()`, `findAll()`)
- `apps/api/src/announcements/announcements.service.spec.ts` (modifié)
- `apps/api/src/users/users.service.ts` (modifié — `searchByEmailOrPseudo()`)
- `apps/api/src/users/users.service.spec.ts` (modifié)
- `apps/web/src/app/shared/identity/identity-label.ts` (nouveau)
- `apps/web/src/app/shared/identity/identity-label.html` (nouveau)
- `apps/web/src/app/shared/identity/identity-label.scss` (nouveau)
- `apps/web/src/app/shared/identity/identity-label.spec.ts` (nouveau)
- `apps/web/src/app/core/theme/tones.ts` (modifié — section `identity.*` dans les 3 thèmes)
- `apps/web/src/app/core/announcements/announcement-dto.fixture.ts` (modifié)
- `apps/web/src/app/core/announcements/announcements.service.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character-dto.fixture.ts` (modifié)
- `apps/web/src/app/core/poll/poll.util.spec.ts` (modifié)
- `apps/web/src/app/features/parties/roster-row.util.ts` (modifié — renommage `displayName`→`avatarLabel`+`characterLabel`/`playerLabel`)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.ts` (modifié)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.html` (modifié)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.spec.ts` (modifié)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.ts` (modifié)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.html` (modifié)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (modifié)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.spec.ts` (modifié)
- `apps/web/src/app/features/parties/xp-distribution-panel/xp-distribution-panel.ts` (modifié)
- `apps/web/src/app/features/parties/xp-distribution-panel/xp-distribution-panel.html` (modifié)
- `apps/web/src/app/features/parties/xp-history/xp-history.ts` (modifié)
- `apps/web/src/app/features/parties/xp-history/xp-history.html` (modifié)
- `apps/web/src/app/features/parties/xp-history/xp-history.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.ts` (modifié)
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.html` (modifié)
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.spec.ts` (modifié)
- `apps/web/src/app/features/calendar/available-slots/available-slots.spec.ts` (modifié)
- `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.ts` (modifié)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.html` (modifié)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.spec.ts` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié)
- `apps/web/src/app/layout/shell/shell.html` (modifié)
- `apps/web/src/app/layout/shell/shell.spec.ts` (modifié)
- `apps/web/src/app/features/join/join.html` (modifié)
</content>
