---
baseline_commit: e8dd3f13fe58bd6f199e938b365292beeb04d5b1
---

# Story 28.4: Thème persisté sur le compte

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que mon thème me suive d'un appareil à l'autre,
so that je ne le reconfigure pas à chaque fois que je change de téléphone ou d'ordinateur.

## Contexte

**Quatrième story de l'épic 28**, elle clôt le mécanisme de préférences amorcé par 28.1 (écran de compte) — c'est la première préférence de compte au sens d'AD-1/AD-13 (une colonne typée sur `User`, jamais un blob `preferences`).

Aujourd'hui, `ThemeToneService` lit/écrit uniquement `localStorage` (clé `jdr-theme`) — aucune trace côté compte. Deux conséquences : (1) changer d'appareil réinitialise le thème au défaut, (2) rien n'empêche `localStorage` de désynchroniser deux appareils l'un de l'autre. Cette story fait du compte la seule source de vérité une fois connecté, `localStorage` devenant un simple **cache d'amorçage** (évite le clignotement avant identification).

> ⚠️ **Instruction explicite de l'utilisateur pour cette story** (donnée à la création, absente d'`epics.md`) : le sélecteur de thème (`app-theme-selector`) vit aujourd'hui dans le menu utilisateur du shell (`layout/shell/shell.html`), accessible depuis n'importe quel écran ("à la racine du menu"). Il doit être **retiré de ce menu racine** et **déplacé dans l'écran de compte** (`/account`) — c'est là, et seulement là, que le thème se choisit désormais. Voir **AC6** ci-dessous (ajoutée pour cette story, ne pas la confondre avec une AC issue d'epics.md).

### Découverte faite en préparant cette story — à connaître avant de coder

**`Theme` (le type + la liste des 3 clés) n'existe aujourd'hui que côté web**, déclaré en local dans `apps/web/src/app/core/theme/tones.ts` (`export type Theme = 'grimoire-emeraude' | 'foret-ancienne' | 'medieval-steampunk'` + `export const THEMES: Theme[] = [...]`). AD-13 (ARCHITECTURE-SPINE.md) est catégorique : *« La liste des thèmes valides est déclarée une seule fois, dans `@master-jdr/shared`, et la validation API s'y réfère — jamais une seconde liste côté serveur »*. **Task 1** déplace `Theme`/`THEMES` vers `@master-jdr/shared` ; `tones.ts` les **ré-exporte** (`export type { Theme } from '@master-jdr/shared'; export { THEMES } from '@master-jdr/shared';`) pour ne casser aucun des 6 fichiers web qui importent aujourd'hui depuis `'.../core/theme/tones'` — ne pas faire chasser chaque site d'import un par un, ce serait un chantier plus large que ce que la story demande.

**`packages/shared` n'est pas strictement « types seuls » malgré ce que dit sa description dans `CLAUDE.md`/`project-context.md`.** `GAME_SYSTEMS` y est déjà un **`export const` runtime** (un tableau, pas juste un type), importé sans `import type` par `apps/api/src/parties/dto/create-partie.dto.ts` pour construire un `@IsIn(...)` de validation (`const GAME_SYSTEM_IDS = GAME_SYSTEMS.map((s) => s.id)`). **`THEMES`/`Theme` suivent exactement ce même patron déjà établi** — ce n'est pas une nouvelle exception à inventer, juste la même règle qu'AD-13 documente explicitement pour ce cas précis.

**Le renommage `medieval-steampunk` → `atelier-cuivre` (AD-13, CAP-17) n'est PAS dans le périmètre de cette story.** Il est explicitement assigné à la **Story 35.1** (« Découpe et renommage », traçabilité FR-43 dans `epics.md`), tout en bout de palier. AD-13 prévient que ce renommage *« emporte une migration des valeurs persistées, indissociable de la story qui découpe les fichiers de thème »* — cette migration sera **la responsabilité de la Story 35.1** (qui devra migrer les `User.theme = 'medieval-steampunk'` existants au moment du renommage), pas de celle-ci. Cette story-ci persiste simplement les 3 clés actuelles telles quelles.

**`SessionSerializer.deserializeUser()` recharge l'utilisateur complet depuis la base à chaque requête** (`apps/api/src/auth/session.serializer.ts`) — dès que `User.theme` existe en colonne, il traverse automatiquement `/auth/me` (donc `AuthService.loadSession()` au démarrage de l'app) sans aucune modification de ce fichier. Idem pour `/auth/login` (`AuthService.validateUser()` fait un simple spread de l'utilisateur Prisma moins le hash). Rien à toucher côté session/passport.

## Acceptance Criteria

1. **Given** mon compte n'a jamais eu de thème enregistré (`User.theme` vaut `null`), **When** je me connecte, **Then** le thème présent dans mon stockage local est adopté une seule fois et poussé vers mon compte, **and** je ne perds pas le thème que j'utilisais avant la mise à jour.

2. **Given** mon compte porte un thème, **When** je me connecte depuis un autre appareil, **Then** ce thème s'applique, **and** le stockage local de cet appareil est réécrit depuis le compte.

3. **Given** je ne suis pas connecté, **When** j'ouvre un écran d'authentification, **Then** le dernier thème connu localement s'applique sans clignotement.

4. **Given** mon compte porte déjà un thème, **When** une valeur différente traîne dans le stockage local, **Then** elle ne remonte jamais écraser la préférence du compte.

5. **Given** le thème change, quelle qu'en soit la cause, **When** il est appliqué, **Then** `ThemeToneService` en reste le seul applicateur, **and** le service de compte se borne à lire et écrire la préférence.

6. **(Ajoutée pour cette story, instruction utilisateur — absente d'epics.md)** **Given** je veux changer de thème, **When** j'ouvre le menu utilisateur (icône compte, racine de l'application), **Then** aucun sélecteur de thème n'y apparaît, **and** le sélecteur de thème n'est disponible que dans l'écran `/account`.

## Tasks / Subtasks

### Fondations partagées

- [x] Task 1 — `Theme`/`THEMES` dans `@master-jdr/shared` ; `User.theme` en base (AC: #1, #2)
  - [x] `packages/shared/src/index.ts` : ajouté `THEMES`/`Theme` runtime, même patron que `GAME_SYSTEMS`.
  - [x] `packages/shared/src/index.ts`, `AuthUser` : ajouté `theme: Theme | null;`.
  - [x] `apps/web/src/app/core/theme/tones.ts` : `Theme`/`THEMES` ré-exportés depuis `@master-jdr/shared`, sites d'appel existants inchangés.
  - [x] `apps/api/prisma/schema.prisma` : `theme String?` ajouté. `prisma migrate dev` a refusé (dérive préexistante d'une migration antérieure, aurait exigé un reset complet de la base de dev avec perte des données de démo) — migration créée manuellement via `prisma migrate diff --from-config-datasource --to-schema` + `prisma migrate deploy` (`20260806222819_user_theme`), même filet de secours que Story 15.1.
  - [x] `session.serializer.ts`/`AuthService.validateUser()` non touchés, comme prévu.

### Backend — endpoint de préférence

- [x] Task 2 — `PATCH /me/theme` (AC: #1, #2, #5)
  - [x] `apps/api/src/account/dto/update-theme.dto.ts` créé — copie exacte du patron `create-partie.dto.ts`.
  - [x] `apps/api/src/account/account.service.ts` : `updateTheme(userId, theme)` ajoutée, même garde P2025.
  - [x] `apps/api/src/account/account.controller.ts` : `@Patch('theme')` ajouté.
  - [x] Tests service+controller ajoutés (18 tests account au total, tous verts). **Piège rencontré** : `AccountController` → `update-theme.dto.ts` → import runtime (pas `import type`) de `THEMES` casse `ts-jest` sur `account.controller.spec.ts` (ESM non transformé, même piège déjà documenté pour `GAME_SYSTEMS`/`realtime.module.spec.ts` et `@master-jdr/game-rules`) — corrigé par `jest.mock('@master-jdr/shared', () => ({ THEMES: [...] }))` en tête de fichier.

### Frontend — persistance et synchronisation

- [x] Task 3 — `AccountService.setTheme()` + orchestration dans `AuthService` (AC: #1, #2, #4, #5)
  - [x] `AccountService.setTheme()` ajoutée.
  - [x] `AuthService.syncTheme()` privée ajoutée (injecte `ThemeToneService`+`AccountService`), branche apply vs push-once, try/catch non-bloquant.
  - [x] Appelée depuis `login()` et `fetchSession()`.
  - [x] Aucun autre point d'application créé — `ThemeToneService.setTheme()` reste unique.
  - [x] AC3 vérifié par un test de non-régression (aucune modif à `app.ts`).
  - [x] Fixture `auth.service.spec.ts` mise à `theme: 'grimoire-emeraude'` pour les 5 tests existants ; 3 nouveaux tests dédiés (`theme` non-null → apply/écrase local ; `theme: null` → push-once ; échec du push → non-bloquant) dans un `describe` séparé (pas imbriqué) car `ThemeToneService` lit `localStorage` une seule fois à la construction — un test niché dans le `beforeEach` partagé aurait posé `localStorage` trop tard. **Piège supplémentaire rencontré** : après le `flush()` de `/auth/login`, le `PATCH /me/theme` de `syncTheme()` n'est émis qu'après une microtâche — `await Promise.resolve();` nécessaire avant de chercher la seconde requête dans `HttpTestingController`.

### Frontend — déplacement du sélecteur (AC6)

- [x] Task 4 — Retirer `ThemeSelector` du menu racine, l'intégrer à l'écran de compte (AC: #6)
  - [x] `theme-selector.{ts,html,scss}` déplacés vers `apps/web/src/app/features/account/theme-selector/`.
  - [x] `shell.html`/`shell.ts` : bloc et import retirés, un seul `<mat-divider />` restant.
  - [x] `account.ts`/`account.html` : `ThemeSelector` importé et rendu hors du `<form>`.
  - [x] `theme-selector.ts` : `selectTheme()` appelle désormais aussi `accountSvc.setTheme(theme)` (fire-and-forget).
  - [x] `theme-selector.spec.ts` créé (2 tests) ; `shell.spec.ts` +1 test négatif (AC6) ; `account.spec.ts` mock `ThemeToneService`/`AccountService` étendus.

### Suites et vérification

- [x] Task 5 — Suites complètes et vérification manuelle (AC: #1-6)
  - [x] `docker compose exec api pnpm test` — 49/49 suites, 953/953 tests, aucune régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm test` — 79/79 suites, 1065/1065 tests, aucune régression. Sites de fixtures `AuthUser` corrigés : `account.service.spec.ts`, `auth.guard.spec.ts`, `auth.service.spec.ts`, `account.spec.ts` (les 4 seuls réellement typés `AuthUser` strictement — les autres usages recensés dans la story utilisaient `as AuthUser`/inférence structurelle, donc non affectés par le nouveau champ obligatoire).
  - [x] `docker compose exec web pnpm build` — dépassement confirmé préexistant et stable (~214.41 Ko au-delà du budget de 1 Mo, quasi identique aux ~214.50 Ko de la story 28.3) — pas de régression.
  - [x] Conteneur `api` redémarré réellement — `Nest application successfully started` confirmé, route `PATCH /me/theme` mappée.
  - [x] Vérification manuelle bout-en-bout réelle (curl + psql, compte `mj-demo@example.com`) : `GET /auth/me` avant tout changement renvoie `theme: null` ; `PATCH /me/theme` avec une clé valide (`foret-ancienne`) → 200, thème persisté ; une clé hors `THEMES` → 400 avec message explicite ; `GET /auth/me` reflète bien le nouveau thème après coup. Donnée de test nettoyée après vérification (`theme` remis à `NULL`). Le comportement push-once (AC1) est une orchestration **frontend** (`AuthService.syncTheme()`) non exerçable par curl — couvert par les 3 tests unitaires dédiés de `auth.service.spec.ts` (apply/push/échec non-bloquant). **Limitation connue de cet environnement** (déjà rencontrée en story 28.3) : l'extension Claude in Chrome n'était pas connectée — pas de contrôle visuel réel de l'écran `/account` (position du sélecteur) ni du menu racine (absence confirmée par test DOM uniquement). Contrôle visuel manuel rapide recommandé avant merge.

### Ajout post-revue (hors périmètre initial du palier 9, demande utilisateur)

- [x] Task 6 — Thème aléatoire à l'inscription (résout la Décision 1 ci-dessus)
  - [x] `apps/api/src/auth/auth.service.ts` : `pickRandomTheme()` privée ajoutée (tirage uniforme dans `THEMES`), appelée dans `register()` pour peupler `tx.user.create()`'s `theme` (au lieu de laisser `null`/défaut implicite) — évite que tout nouveau compte démarre systématiquement sur `grimoire-emeraude`.
  - [x] N'affecte pas le push-once (AD-13) : celui-ci ne concerne que les comptes déjà existants avant cette story (`theme: null`), jamais un compte créé après ce point.
  - [x] Tests ajoutés : `auth.service.spec.ts` (le thème créé appartient à `THEMES`), `jest.mock('@master-jdr/shared', ...)` ajouté à `auth.service.spec.ts` et `auth.controller.spec.ts` (même piège ESM que Task 2, nouvellement déclenché par l'import runtime de `THEMES` dans `auth.service.ts`).

## Dev Notes

### Previous Story Intelligence (28.3, statut `done`)

- **`ts-jest` ne type-check pas en cross-file** — après tout changement de forme d'un type partagé (`AuthUser` ici), lancer `pnpm typecheck` côté API séparément du run de tests.
- **`ng test` type-check réellement les `.spec.ts`** — toute fixture `AuthUser` existante gagne le nouveau champ `theme`, sans exception, sous peine d'échec de compilation des specs (piège reconfirmé à chaque story touchant un type partagé depuis 28.1).
- **`packages/shared` porte déjà du code runtime** (pas seulement des types) — `GAME_SYSTEMS` en est le précédent direct, à suivre à l'identique pour `THEMES`.
- Story 28.3 a laissé `mjPseudo`/`mjDisplayName` optionnels sur `PartieDto` suite à une décision de revue de code (typage honnête quand un champ n'est pas garanti par tous les endpoints) — **`AuthUser.theme` n'est PAS dans ce cas** : `/auth/me`, `/auth/login` et `PATCH /me/theme` renvoient tous le même objet `User` Prisma complet (aucun endpoint partiel comme `listForUser()` pour les Parties) — `theme: Theme | null` reste un champ **toujours présent** (jamais `undefined`), seule sa valeur peut être `null`. Ne pas reproduire la même optionalité par réflexe.

### Ce qui doit continuer de fonctionner

- `SessionSerializer`/`AuthService.validateUser()` (API) restent strictement inchangés — ils renvoient déjà l'utilisateur Prisma complet, `theme` y transite sans modification de leur code.
- `app.ts` continue d'appliquer le thème `localStorage` de façon synchrone et indépendante de l'authentification (AC3) — ne rien reconstruire ici.
- Les ~11 sites d'appel existants d'`IdentityLabel`/composants non liés au thème ne sont pas concernés par cette story.
- `theme-selector.ts`/`.html`/`.scss` restent fonctionnellement identiques (mêmes dégradés, mêmes libellés, même détection du thème actif) — seuls son emplacement dans l'arborescence et son intégration (retiré de `shell.html`, ajouté à `account.html`) changent, plus l'appel de persistance ajouté dans `selectTheme()`.

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Liste de valeurs valides partagée + validation API | patron `GAME_SYSTEMS`/`GAME_SYSTEM_IDS`/`@IsIn(...)` déjà dans `create-partie.dto.ts` | une seconde liste de thèmes côté API, ou un `enum` Prisma dupliquant la liste |
| Endpoint `PATCH /me/...` orienté préférence | patron exact `update-display-name.dto.ts`/`AccountService.updateDisplayName()`/`AccountController.updateDisplayName()` (garde P2025, id de session jamais du corps) | un nouveau contrôleur ou une route sous un autre préfixe que `/me` |
| Distinction « jamais configuré » vs « valeur explicite » | `theme: string \| null` nullable sans défaut (même patron que `calendarLayersSetAt` d'AD-16, ou `mjPseudo?`/`mjDisplayName?` de 28.3 pour la nuance optionnel vs nullable) | une valeur par défaut en base qui rendrait « jamais choisi » indétectable |
| Application effective d'un thème (classe CSS, signal, `localStorage`) | `ThemeToneService.setTheme()`, seul point d'entrée | write direct à `localStorage`/`document.body.classList` ailleurs dans le code |

### Sécurité

- `PATCH /me/theme` valide strictement contre `THEMES` (`@IsIn`) — aucune chaîne libre ne peut atteindre la colonne `User.theme`.
- Rien dans cette story ne touche à l'authentification, aux mots de passe, aux sessions ou aux e-mails.
- Le thème n'est pas une donnée sensible — aucune nouvelle considération de fuite/exposition.

### Project Structure Notes

- **Modifiés (partagé)** : `packages/shared/src/index.ts` (`Theme`, `THEMES`, `AuthUser.theme`).
- **Modifiés (API)** : `apps/api/prisma/schema.prisma` (+migration), `apps/api/src/account/account.service.ts`, `apps/api/src/account/account.controller.ts`, + `*.spec.ts` associés.
- **Nouveau (API)** : `apps/api/src/account/dto/update-theme.dto.ts`.
- **Modifiés (web)** : `apps/web/src/app/core/theme/tones.ts` (ré-export), `apps/web/src/app/core/account/account.service.ts`, `apps/web/src/app/core/auth/auth.service.ts`, `apps/web/src/app/layout/shell/shell.html`, `apps/web/src/app/layout/shell/shell.ts`, `apps/web/src/app/features/account/account.ts`, `apps/web/src/app/features/account/account.html`, + `*.spec.ts` associés (dont les 7 sites de fixtures `AuthUser` listés en Task 5).
- **Déplacés (web)** : `apps/web/src/app/layout/shell/theme-selector/*` → `apps/web/src/app/features/account/theme-selector/*`.
- **Nouveau (web)** : `apps/web/src/app/features/account/theme-selector/theme-selector.spec.ts`.
- **Non touchés** : `packages/game-rules`, tout fichier `theme/tones/*.ts` par thème (c'est la Story 35.1, pas celle-ci), la migration du renommage `medieval-steampunk`→`atelier-cuivre` (Story 35.1), `SessionSerializer`, `app.ts`.

### Pièges connus du projet

- **`pnpm typecheck` après un changement de forme de type partagé** — lancer côté API après modification d'`AuthUser`.
- **`ng test` type-check réellement les specs** — toute fixture `AuthUser` gagne `theme`.
- **`packages/shared` peut porter du runtime (pas seulement des types)** — importer `THEMES` sans `import type`, exactement comme `GAME_SYSTEMS`.
- **Tout passe par Docker** — aucun outil Node sur l'hôte.
- **`prisma migrate dev` peut refuser l'environnement non interactif du conteneur** (déjà rencontré en Story 15.1) — filet de secours : `prisma migrate diff` + `prisma migrate deploy`.
- **Piège de test spécifique à cette story** (détaillé en Task 3) : les tests existants d'`auth.service.spec.ts` doivent recevoir un fixture `theme` non-null pour ne pas déclencher une requête HTTP inattendue et casser `http.verify()`.

### Temps réel (checklist `docs/checklist.md`)

Aucun besoin de câblage SSE — le thème est un état **strictement personnel** (AD-14 : « préférences, favoris, annonce vue... rafraîchi localement après l'action, aucune émission SSE »). Ne rien ajouter à `RealtimeService`/`RealtimeEventsService`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.4] — Acceptance Criteria d'origine (AC1-5 ; AC6 ajoutée par cette création de story, instruction utilisateur)
- [Source: _bmad-output/planning-artifacts/epics.md#FR-2] — « Thème persisté sur le compte, repli local avant connexion »
- [Source: _bmad-output/planning-artifacts/epics.md#FR-43] — renommage `medieval-steampunk`→`atelier-cuivre`, assigné à la Story 35.1, hors périmètre ici
- [Source: .../ARCHITECTURE-SPINE.md#AD-13] — décision d'architecture directrice de cette story : un fichier par thème (hors scope ici, cf. Story 35.1), thème de référence typé, compte source de vérité, `localStorage` cache d'amorçage, push-once si `null`, `ThemeToneService` seul applicateur
- [Source: .../ARCHITECTURE-SPINE.md#AD-1] — règle générale des préférences de compte (colonne typée si scalaire, jamais de blob `preferences`)
- [Source: .../ARCHITECTURE-SPINE.md#AD-14] — état personnel jamais diffusé en SSE
- [Source: apps/api/src/parties/dto/create-partie.dto.ts] — patron exact `GAME_SYSTEMS`/`@IsIn` à reproduire pour `THEMES`
- [Source: apps/api/src/account/account.service.ts,account.controller.ts,dto/update-display-name.dto.ts] — patron exact à reproduire pour `updateTheme`/`UpdateThemeDto`
- [Source: apps/api/src/auth/session.serializer.ts] — confirmé : recharge l'utilisateur complet à chaque requête, rien à modifier
- [Source: apps/web/src/app/core/auth/auth.service.ts#login,fetchSession] — points d'intégration de `syncTheme()`
- [Source: apps/web/src/app/core/theme/theme-tone.service.ts] — `setTheme()`/`activeTheme`/`readStoredTheme()` actuels, seul point d'application
- [Source: apps/web/src/app/layout/shell/shell.html:32-53, shell.ts] — emplacement actuel du sélecteur à retirer
- [Source: apps/web/src/app/features/account/account.ts,account.html] — écran de compte existant (28.1), point d'intégration du sélecteur
- [Source: apps/web/src/app/layout/shell/theme-selector/*] — composant à déplacer, comportement à préserver

### Review Findings

Revue de code adversariale du 2026-08-07 (3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 15 constats bruts → 11 après dédoublonnage → 1 écarté comme faux positif après vérification.

- [x] [Review][Decision] Un thème persisté sur un compte partagé (poste public/familial) peut fuiter d'un utilisateur à l'autre — `logout()` ne vide jamais `localStorage['jdr-theme']` ; si le compte suivant qui se connecte sur le même appareil n'a jamais eu de thème (`theme: null`), le mécanisme push-once (AC1) lui attribue silencieusement le dernier thème laissé par l'utilisateur précédent, sans qu'il l'ait choisi. — **Décision (utilisateur) : accepté tel quel (option b), et le risque est réduit par un ajout hors-story** : tout nouveau compte reçoit désormais un thème tiré au hasard à l'inscription (voir Task 6 ci-dessous) plutôt que `null`/`grimoire-emeraude` par défaut — un compte qui « hérite » silencieusement du thème du précédent utilisateur ne peut plus arriver qu'à la toute première connexion d'un compte créé *avant* ce correctif (fenêtre historique bornée, pas un risque permanent). Pas de changement de code sur `logout()`.
- [x] [Review][Decision] Course étroite entre une sélection manuelle de thème (`ThemeSelector`) et la synchronisation de connexion (`AuthService.syncTheme()`) : si le push-once (`theme` du compte encore `null`) est encore en vol au moment où l'utilisateur clique un thème différent dans `/account`, la réponse de `syncTheme()` peut arriver après celle du clic et réécrire `currentUser().theme` avec l'ancienne valeur poussée (pas celle cliquée). — **Décision : option (b) appliquée** — `syncTheme()` ne met à jour `currentUser` depuis la réponse du push-once que si le thème local n'a pas changé depuis l'émission de la requête (comparaison avec `themeAtPushTime`), coût négligeable pour une garde définitive. Voir patch ci-dessous.
- [x] [Review][Patch] `AuthService.syncTheme()` applique `user.theme` via `ThemeToneService.setTheme()` sans jamais vérifier qu'il appartient à `THEMES`. — **Corrigé** : `(THEMES as readonly string[]).includes(user.theme)` gardé avant tout appel à `setTheme()`, valeur invalide ignorée silencieusement (ni appliquée, ni plantage). Test dédié ajouté. [apps/web/src/app/core/auth/auth.service.ts]
- [x] [Review][Patch] Titre de test trompeur : annonce « → 200 » mais l'assertion vérifie un 400. — **Corrigé**, titre renommé pour refléter l'assertion réelle. [apps/api/src/account/account.controller.spec.ts]
- [x] [Review][Patch] `UpdateThemeDto` exporté dans `packages/shared/src/index.ts` n'est utilisé par aucun des deux côtés — code mort trompeur. — **Corrigé**, interface supprimée de `packages/shared/src/index.ts`.
- [x] [Review][Patch] Task 3 revendique « AC3 vérifié par un test de non-régression » mais aucun test de ce type n'apparaît dans le diff. — **Corrigé**, nouveau fichier `apps/web/src/app/core/theme/theme-tone.service.spec.ts` (3 tests : application du thème local sans authentification, repli sur défaut si valeur invalide, repli sur défaut si absence de valeur).
- [x] [Review][Defer] Cast `(req.user as { id: string }).id` sans garde d'exécution sur `PATCH /me/theme` — reproduit fidèlement le patron déjà utilisé par `updateDisplayName()` dans le même contrôleur (même risque théorique, déjà accepté ailleurs). Pas une régression propre à cette story. — deferred, pre-existing (patron déjà utilisé partout dans `AccountController`)
- [x] [Review][Defer] `THEMES` recopié à la main dans plusieurs mocks de test (`jest.mock('@master-jdr/shared', ...)`, fixtures `ThemeToneService`) au lieu d'être importé — risque de dérive silencieuse si la liste change un jour. Reproduit le même patron déjà établi pour `GAME_SYSTEMS` (`realtime.module.spec.ts`). — deferred, pre-existing (convention de test déjà en place dans le projet)
- [x] [Review][Defer] Le push-once (`theme: null`) n'a pas de garde d'écriture conditionnelle (« compare-and-swap ») — deux appareils se connectant simultanément sur un compte jamais configuré peuvent faire une course sur l'`UPDATE` Prisma ; le client perdant reste persuadé d'un thème compte qui ne correspond plus à ce qui est réellement persisté (`currentUser` mis à jour depuis sa propre requête, pas relu depuis la base). Fenêtre étroite, auto-cicatrisante à la prochaine connexion ; les AC ne spécifient aucune exigence de cohérence multi-appareils simultanée. — deferred, pre-existing (edge case à très faible probabilité, non couvert par les AC)

**Écarté (faux positif après vérification)** :
- « L'import runtime de `THEMES` depuis `@master-jdr/shared` dans `update-theme.dto.ts` casserait la résolution de module ESM en production, le contournement `jest.mock()` ne masquant que le problème côté tests » — vérifié faux : `PATCH /me/theme` a été testé réellement via curl contre le conteneur `api` (même pipeline `nest start --watch` que toute exécution de ce projet, 100 % Docker) pendant la vérification manuelle de la Task 5, et a fonctionné sans erreur. Le même patron d'import runtime existe déjà en production pour `GAME_SYSTEMS` (`create-partie.dto.ts`) sans incident connu.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `prisma migrate dev --name user_theme` a refusé de s'exécuter (dérive préexistante d'une migration antérieure modifiée après application, aurait exigé un reset complet de la base de dev avec perte des données de démo) — contourné via `prisma migrate diff --from-config-datasource --to-schema` + `prisma migrate deploy` manuel, comme prévu par le filet de secours de la story (précédent Story 15.1).
- `account.controller.spec.ts` cassé par le piège ESM déjà documenté (mémoire projet) pour `@master-jdr/game-rules`/`GAME_SYSTEMS` — désormais confirmé aussi pour `THEMES` (`@master-jdr/shared`) : tout import runtime (pas `import type`) transitif via une nouvelle DTO casse `ts-jest`. Corrigé par `jest.mock('@master-jdr/shared', ...)`, mémoire projet mise à jour en conséquence.
- Tests `auth.service.spec.ts` (push-once) : le `PATCH /me/theme` déclenché par `syncTheme()` n'apparaît dans `HttpTestingController` qu'après une microtâche suivant le `flush()` du login — nécessite `await Promise.resolve();` avant de chercher la seconde requête.
- Revue de code (2026-08-07) : piège ESM re-rencontré 3 fois de plus (`account.controller.spec.ts`, puis `auth.service.spec.ts`/`auth.controller.spec.ts` suite à l'import runtime de `THEMES` dans `auth.service.ts` pour `pickRandomTheme()`) — corrigé identiquement à chaque fois par `jest.mock('@master-jdr/shared', ...)`.
- Test de la garde anti-course (Décision 2) : première tentative en écrivant directement `localStorage` pour simuler un changement de thème pendant le push-once en vol — ne fonctionne pas, `ThemeToneService.activeTheme()` est un signal qui ne se met à jour que via `setTheme()`, jamais en relisant `localStorage` a posteriori. Corrigé en injectant `ThemeToneService` depuis le même `TestBed` et en appelant `.setTheme()` directement.

### Completion Notes List

- 5 tasks complétées en TDD + Task 6 ajoutée en revue de code (thème aléatoire à l'inscription, demande utilisateur). Suites finales : 49/49 suites API (954/954 tests), 80/80 suites web (1070/1070 tests), typecheck API propre, aucune régression.
- Revue de code adversariale (2026-08-07, 3 couches parallèles) : 2 décisions tranchées avec l'utilisateur, 4 patches appliqués, 3 constats différés (voir Review Findings), 1 faux positif écarté après vérification manuelle réelle.
- Décision 1 (fuite de thème sur appareil partagé) résolue indirectement par une demande utilisateur hors périmètre initial : chaque nouveau compte reçoit désormais un thème choisi aléatoirement parmi `THEMES` à l'inscription (`AuthService.pickRandomTheme()`, API), au lieu de démarrer systématiquement sur `grimoire-emeraude` — accepté tel quel pour le reste (risque résiduel borné aux comptes créés avant ce correctif).
- Décision 2 (course push-once / sélection manuelle) corrigée par une garde dans `syncTheme()` (web) : `currentUser` n'est mis à jour depuis la réponse du push-once que si le thème local n'a pas changé depuis l'émission de la requête.
- `Theme`/`THEMES` déplacés vers `@master-jdr/shared` (runtime, même patron que `GAME_SYSTEMS`) ; `tones.ts` les ré-exporte, aucun site d'appel web existant modifié.
- `User.theme` (colonne nullable) ajoutée via une migration créée manuellement (voir Debug Log) pour éviter un reset destructif de la base de dev.
- `PATCH /me/theme` créé en miroir exact de `PATCH /me/display-name` (même garde P2025, même structure de tests).
- `AuthService.syncTheme()` orchestre la synchronisation (apply si compte configuré, push-once si `theme: null`) depuis `login()` et `fetchSession()` — `ThemeToneService` reste l'unique point d'application (AC5), `AccountService` ne fait que lire/écrire.
- `ThemeSelector` déplacé de `layout/shell/` vers `features/account/`, retiré du menu utilisateur racine, intégré à l'écran `/account` (AC6, instruction utilisateur explicite) ; persiste désormais aussi le choix au compte en plus de l'appliquer localement.
- Dépassement de budget bundle web confirmé préexistant et stable (~214.41 Ko, quasi identique à la baseline de 28.3) — pas une régression de cette story.
- Redémarrage réel du conteneur `api` confirmé (`Nest application successfully started`, route `PATCH /me/theme` mappée).
- Vérification manuelle bout-en-bout réelle via curl + psql sur le compte de démo `mj-demo@example.com` : `theme: null` initial confirmé, `PATCH /me/theme` valide → persisté et reflété par `GET /auth/me`, valeur invalide → 400. Donnée de test nettoyée après coup (`theme` remis à `NULL`).
- Limitation : l'extension Claude in Chrome n'était pas connectée dans cet environnement — pas de vérification visuelle réelle du nouvel emplacement du sélecteur de thème dans `/account`, ni de son absence dans le menu racine. La vérification s'est arrêtée à la confirmation du payload API et aux tests DOM ciblés (Vitest/jsdom) qui reproduisent ces scénarios (dont un test négatif dédié dans `shell.spec.ts` pour AC6). Un contrôle visuel manuel rapide est recommandé avant merge.

### File List

**Modifiés (partagé)**
- `packages/shared/src/index.ts` (`THEMES`, `Theme`, `AuthUser.theme`; `UpdateThemeDto` ajoutée puis retirée en revue de code — code mort jamais consommé)

**Modifiés (API)**
- `apps/api/prisma/schema.prisma` (`User.theme`)
- `apps/api/src/account/account.service.ts` (+`updateTheme()`)
- `apps/api/src/account/account.service.spec.ts`
- `apps/api/src/account/account.controller.ts` (+`@Patch('theme')`)
- `apps/api/src/account/account.controller.spec.ts` (+ titre de test corrigé en revue de code)
- `apps/api/src/auth/auth.service.ts` (+`pickRandomTheme()`, appelée dans `register()` — Task 6)
- `apps/api/src/auth/auth.service.spec.ts` (+ test thème aléatoire, `jest.mock('@master-jdr/shared', ...)`)
- `apps/api/src/auth/auth.controller.spec.ts` (`jest.mock('@master-jdr/shared', ...)`, piège ESM transitif)

**Nouveaux (API)**
- `apps/api/src/account/dto/update-theme.dto.ts`
- `apps/api/prisma/migrations/20260806222819_user_theme/migration.sql`

**Modifiés (web)**
- `apps/web/src/app/core/theme/tones.ts` (ré-export depuis `@master-jdr/shared`)
- `apps/web/src/app/core/account/account.service.ts` (+`setTheme()`)
- `apps/web/src/app/core/account/account.service.spec.ts`
- `apps/web/src/app/core/auth/auth.service.ts` (+`syncTheme()`, appelée depuis `login()`/`fetchSession()` ; + garde de validation `THEMES` et garde anti-course ajoutées en revue de code)
- `apps/web/src/app/core/auth/auth.service.spec.ts` (+ 2 tests de revue de code : validation `THEMES`, garde anti-course)
- `apps/web/src/app/core/auth/auth.guard.spec.ts` (fixture `AuthUser`)
- `apps/web/src/app/layout/shell/shell.html` (retrait `<app-theme-selector />`)
- `apps/web/src/app/layout/shell/shell.ts` (retrait import `ThemeSelector`)
- `apps/web/src/app/layout/shell/shell.spec.ts` (+1 test négatif AC6)
- `apps/web/src/app/features/account/account.ts` (+import `ThemeSelector`)
- `apps/web/src/app/features/account/account.html` (+`<app-theme-selector />`)
- `apps/web/src/app/features/account/account.spec.ts` (fixture `AuthUser` + mocks `ThemeToneService`/`AccountService` étendus)

**Déplacés (web)**
- `apps/web/src/app/layout/shell/theme-selector/{theme-selector.ts,html,scss}` → `apps/web/src/app/features/account/theme-selector/{theme-selector.ts,html,scss}` (import `AccountService` ajouté à `theme-selector.ts`)

**Nouveaux (web)**
- `apps/web/src/app/features/account/theme-selector/theme-selector.spec.ts`
- `apps/web/src/app/core/theme/theme-tone.service.spec.ts` (ajouté en revue de code — couverture AC3 manquante)

## Change Log

- 2026-08-07 : Implémentation complète (bmad-dev-story). Task 1 (`Theme`/`THEMES` partagés, `User.theme` en base), Task 2 (`PATCH /me/theme`), Task 3 (`AccountService.setTheme()` + `AuthService.syncTheme()`), Task 4 (déplacement de `ThemeSelector` vers `/account`, AC6), Task 5 (suites complètes + vérification manuelle). Statut passé à review.
- 2026-08-07 : Revue de code adversariale. 2 décisions tranchées avec l'utilisateur (thème aléatoire à l'inscription — Task 6 — résout la Décision 1 ; garde anti-course dans `syncTheme()` résout la Décision 2), 4 patches appliqués (validation `THEMES` avant application, titre de test corrigé, `UpdateThemeDto` mort supprimé, test AC3 manquant ajouté), 3 constats différés (documentés dans `deferred-work.md`), 1 faux positif écarté après vérification manuelle réelle. Suites finales : 49/49 suites API (954/954 tests), 80/80 suites web (1070/1070 tests). Statut passé à done.
