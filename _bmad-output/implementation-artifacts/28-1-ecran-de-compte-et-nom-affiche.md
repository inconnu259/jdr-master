---
baseline_commit: 4e7032a7134e9847adee05e75698982a32b7b946
---

# Story 28.1: Écran de compte et nom affiché

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur connecté,
I want un écran regroupant mes informations et mes préférences, où je peux choisir un nom affiché,
so that je décide de la façon dont j'apparais aux autres sans toucher à mon identifiant de connexion.

## Contexte

**Première story du Palier 9 et première story de l'épic 28.** L'application n'a aujourd'hui **aucun écran de profil** — la seule route `profile/` est le calendrier (`app.routes.ts`, `profile/calendar`). Aucun endpoint de modification de profil n'existe : pas de `PATCH` utilisateur, `UsersController` n'expose que `GET /users/search`.

Cette story ouvre **deux fondations** dont dépendent les épics 29, 31 et 32 :

1. **Le module `account` côté API** (`AD-4`) — premier domicile de l'état attaché au compte plutôt qu'à une partie.
2. **`User.displayName`** (`AD-1`, `AD-2`) — le champ que la story 28.2 fera ensuite traverser tous les DTO d'identité.

**Le piège central de cette story est la migration.** `displayName` est `NOT NULL` sans valeur par défaut sur une table `User` déjà peuplée : la migration générée par Prisma échouera telle quelle. Voir Task 1, qui donne le SQL exact à écrire.

**Deuxième piège, silencieux :** une colonne `NOT NULL` que la migration remplit mais que `AuthService.register()` ne renseigne pas — toute inscription ultérieure violerait la contrainte. `AD-1` l'appelle « les **deux** points d'écriture obligatoires ». Les deux sont dans cette story, ni l'un ni l'autre n'est optionnel.

### Décisions de périmètre déjà tranchées — ne pas les rouvrir

- **Aucune section « Préférences » dans l'écran.** L'AC l'exige explicitement : « aucune section vide n'y figure — les préférences apparaîtront avec la première d'entre elles ». Le thème arrive en 28.4, le masquage des parties terminées en 29.6, les modes d'affichage en 29.7. **Ne pas créer de section vide, ni de placeholder « à venir ».**
- **`GET /me` n'est PAS créé dans cette story.** `GET /auth/me` existe et renvoie déjà l'objet `User` complet moins `passwordHash` (voir `SessionSerializer.deserializeUser`) — `displayName` y apparaîtra donc **automatiquement** dès que la colonne existe. Créer un second endpoint de lecture maintenant serait de la duplication sans consommateur. Le `GET /me` de `AD-4` naîtra avec la première donnée que `/auth/me` ne porte pas.
- **`AD-2` (tous les DTO d'identité portent `pseudo` **et** `displayName`) est la story 28.2, pas celle-ci.** Ne pas toucher `PartieMemberDto`, `CharacterDto.ownerPseudo`, les participants, les auteurs d'annonce, les lignes de distribution d'XP ni les membres de créneau. Cette story s'arrête à `User` + `AuthUser`.
- **Le pseudo reste strictement immuable** — aucun champ, aucune route, aucun formulaire ne permet de le modifier. C'est un identifiant de connexion (`LocalStrategy` accepte e-mail *ou* pseudo).
- **Aucune contrainte d'unicité sur `displayName`** (AC4). Ni `@unique` Prisma, ni index unique SQL, ni vérification applicative. L'homonymie est traitée en 28.3, et de façon **non bloquante**.
- **L'entrée de menu se greffe sur le menu existant** (`shell.html`, `mat-menu`). La barre de navigation à quatre destinations est la story 29.3 — **ne pas l'anticiper**, ne pas créer de `BottomNav`. L'épic 28 ne dépend d'aucun épic suivant, c'est voulu.

## Acceptance Criteria

1. **Given** je suis connecté, **when** j'ouvre l'entrée « Compte » du menu existant, **then** j'accède à un écran regroupant mes informations personnelles, **and** mon pseudo y est affiché sans qu'aucun champ ne permette de le modifier, **and** aucune section vide n'y figure.

2. **Given** la migration a été appliquée sur une base existante, **when** je consulte n'importe quel compte, **then** son nom affiché vaut son pseudo, **and** aucun compte ne porte un nom affiché vide ou nul.

3. **Given** un nouveau compte est créé par le parcours d'invitation, **when** l'inscription aboutit, **then** le nom affiché est renseigné à la création par `AuthService.register()`, **and** la contrainte `NOT NULL` n'est jamais violée par une inscription.

4. **Given** je saisis un nouveau nom affiché, **when** j'enregistre, **then** la valeur est persistée sans contrainte d'unicité, **and** un autre utilisateur peut porter exactement le même nom affiché.

## Tasks / Subtasks

- [x] Task 1 — Migration Prisma `User.displayName` (AC: #2, #4)
  - [x] `apps/api/prisma/schema.prisma`, modèle `User` : ajouter `displayName String` **juste après `pseudo`**, avec le commentaire `// AD-1 — NOT NULL : migration (comptes existants) ET register() (nouveaux)`. **Aucun `@unique`, aucun `@default`** — un `@default("")` ferait passer la migration en laissant des noms vides, exactement ce que l'AC2 interdit.
  - [x] Générer la migration : `docker compose exec api pnpm prisma migrate dev --name user_display_name --create-only` (le `--create-only` est **obligatoire** : il faut éditer le SQL avant application).
  - [x] **Éditer le SQL généré.** Prisma produit `ALTER TABLE "User" ADD COLUMN "displayName" TEXT NOT NULL;`, qui **échoue sur une table peuplée**. Le remplacer par les trois instructions :
    ```sql
    ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
    UPDATE "User" SET "displayName" = "pseudo" WHERE "displayName" IS NULL;
    ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;
    ```
  - [x] Appliquer : `docker compose exec api pnpm prisma migrate dev` puis `docker compose exec api pnpm prisma generate`.
  - [x] Vérifier en base que la colonne est `NOT NULL` et qu'aucune ligne n'a une valeur vide.
  - [x] Nommage : `<timestamp>_user_display_name`, cohérent avec les migrations existantes (`20260730060331_character_group_role`).

- [x] Task 2 — `AuthService.register()` renseigne `displayName` (AC: #3)
  - [x] `apps/api/src/auth/auth.service.ts`, méthode `register()` : dans `tx.user.create({ data: { ... } })`, ajouter `displayName: dto.pseudo`.
  - [x] **Ne pas ajouter de champ `displayName` à `RegisterDto`** — le parcours d'inscription ne le demande pas, il est initialisé au pseudo comme pour les comptes migrés (même règle, deux chemins). L'utilisateur le changera ensuite depuis l'écran de compte.
  - [x] `apps/api/src/users/users.service.ts`, méthode `create()` : ajouter `displayName: data.pseudo` au `prisma.user.create()`. Cette méthode n'est appelée par aucun chemin de production aujourd'hui (`register()` écrit directement via `tx`), mais elle **compilerait sans erreur et casserait au runtime** si on l'oubliait — `tsc` ne signale pas un champ requis manquant dans un `create` Prisma de façon fiable avec le générateur legacy.
  - [x] `apps/api/src/auth/auth.service.spec.ts` : test « `register()` renseigne `displayName` au pseudo » — vérifier l'argument passé à `tx.user.create`, pas seulement le retour.

- [x] Task 3 — Type partagé `AuthUser` (AC: #1)
  - [x] `packages/shared/src/index.ts`, interface `AuthUser` : ajouter `displayName: string;` **après `pseudo`**. Commentaire : `/** Nom affiché aux autres utilisateurs. Initialisé au pseudo, librement modifiable, sans contrainte d'unicité (AD-1). */`
  - [x] **Rien d'autre à faire pour la lecture** : `SessionSerializer.deserializeUser()` renvoie l'objet `User` complet moins `passwordHash`, donc `GET /auth/me` et `POST /auth/login` portent `displayName` dès que la colonne existe. Ne pas écrire de projection ni de mapper.
  - [x] **Lancer `docker compose exec api pnpm typecheck` après cette task** — `ts-jest` ne type-check pas en cross-file (`isolatedModules`), un champ ajouté à une interface partagée ne fait pas échouer les tests même s'il casse un appelant. (2 appelants supplémentaires non anticipés par la story trouvés et corrigés : `prisma/seed-demo.ts#createUser` et `src/prisma/seed-admin.ts#seedAdmin` — tous deux écrivent `displayName: pseudo`, cohérent avec AD-1.)

- [x] Task 4 — `AccountModule` : `PATCH /me/display-name` (AC: #4)
  - [x] Créer `apps/api/src/account/` — nouveau module (`AD-4`, `P8-AD-6` : un dossier par capacité).
    - `account.module.ts` : `@Module({ controllers: [AccountController], providers: [AccountService] })`. **Ne pas réimporter `PrismaModule`** (global, `P1-AD-1`). Pas besoin d'importer `AuthModule` dans cette story (aucune vérification de mot de passe ici — ça viendra en 28.5/28.6).
    - `account.controller.ts` : `@UseGuards(AuthenticatedGuard) @Controller('me')`, méthode `@Patch('display-name')` prenant `@Req() req` pour l'`id` de l'utilisateur courant et `@Body() dto: UpdateDisplayNameDto`.
    - `account.service.ts` : `updateDisplayName(userId: string, displayName: string)` → `prisma.user.update({ where: { id: userId }, data: { displayName } })`, renvoie l'utilisateur sans `passwordHash` (même déstructuration `const { passwordHash, ...safe } = user` que partout ailleurs).
    - `account/dto/update-display-name.dto.ts` : `@IsString() @MinLength(1) @MaxLength(60) displayName!: string;`. Pas de `@IsNotEmpty` en plus de `@MinLength(1)` (redondant). **Aucune validation d'unicité.**
  - [x] `apps/api/src/app.module.ts` : enregistrer `AccountModule` dans les `imports`.
  - [x] **L'`id` vient de la session, jamais du corps ni de l'URL** — sinon n'importe quel utilisateur connecté renomme n'importe quel compte. Le pattern est `(req.user as { id: string }).id`, comme dans `AuthController.login`.
  - [x] `packages/shared/src/index.ts` : ajouter `export interface UpdateDisplayNameDto { displayName: string; }` près de `AuthUser`.
  - [x] Tests `apps/api/src/account/account.service.spec.ts` et `account.controller.spec.ts` (mêmes conventions que `auth.service.spec.ts`/`auth.controller.spec.ts`) : nom persisté ; deux utilisateurs peuvent porter le même nom (AC4) ; l'id écrit est bien celui de la session, pas un id fourni par l'appelant ; nom vide et nom > 60 caractères rejetés. Test HTTP réel supplémentaire (calqué sur `characters.controller.spec.ts`) : un `id` glissé dans le corps est rejeté par `forbidNonWhitelisted` (400), jamais transmis au service.

- [x] Task 5 — Clés de thème pour l'entrée de menu (AC: #1)
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter la clé `'nav.account'` dans **les trois** blocs de thème, dans la section `/* — navigation — */`, à côté de `'nav.calendar'`. Le typage actuel (`Record<Theme, Record<string, string>>`) **ne détecte pas une clé oubliée dans un thème** — elle rendrait une chaîne vide à l'écran, sans erreur. (Cette faiblesse est corrigée par la story 35.1, pas ici.)
  - [x] Registre de tons proposé, cohérent avec le vocabulaire de chaque univers :
    - `grimoire-emeraude` : `'nav.account': 'Mon grimoire personnel'`
    - `foret-ancienne` : `'nav.account': 'Mon carnet de route'`
    - `medieval-steampunk` : `'nav.account': 'Mon établi'`
  - [x] Ajouter aussi les libellés de l'écran (`account.title`, `account.pseudo_label`, `account.display_name_label`, `account.save_btn`, `account.saved`, `account.error`) dans les trois thèmes, dans une nouvelle section `/* — compte — */`. **Aucun texte de règle de jeu ne va dans `tones.ts`** (`P8-AD-9`) — ici il n'y en a aucun, mais la règle tient.

- [x] Task 6 — Écran de compte (frontend) (AC: #1, #4)
  - [x] Créer `apps/web/src/app/core/account/account.service.ts` : `updateDisplayName(displayName: string): Promise<AuthUser>` → `firstValueFrom(this.http.patch<AuthUser>(\`${API_BASE}/me/display-name\`, { displayName }, { withCredentials: true }))`. Import `API_BASE` depuis `../api-base` — **jamais une URL en dur** (défaut corrigé au cadrage du palier, cf. addendum §4.1). `import type { AuthUser }` depuis `@master-jdr/shared`.
  - [x] `account.service.spec.ts` calqué sur `apps/web/src/app/core/character-roles/character-roles.service.spec.ts` (`HttpTestingController`, `provideHttpClient()`/`provideHttpClientTesting()`).
  - [x] Créer `apps/web/src/app/features/account/account.ts` + `.html` + `.scss` + `.spec.ts`, standalone, calqué sur `features/parties/partie-form/partie-form.ts` : `FormBuilder.nonNullable.group`, signaux `saving`/`error`, `MatCardModule`/`MatFormFieldModule`/`MatInputModule`/`MatButtonModule`, `ThemeToneService` injecté en `protected readonly theme`.
    - Champ **pseudo** : affiché en lecture seule (texte simple ou `<input readonly disabled>`), **jamais un contrôle de formulaire soumis**.
    - Champ **nom affiché** : `['', [Validators.required, Validators.maxLength(60)]]`, pré-rempli depuis `auth.currentUser()?.displayName`.
    - À la soumission : appeler `AccountService.updateDisplayName()`, puis **mettre à jour `AuthService.currentUser`** avec l'utilisateur renvoyé — sinon le menu et les écrans continuent d'afficher l'ancienne valeur jusqu'au prochain `F5`.
    - Afficher aussi l'e-mail en lecture seule (information personnelle, sa modification est la story 28.6).
    - Contrôle-flow Angular moderne `@if`/`@for`, signaux — jamais `*ngIf`/`*ngFor` (`P1-AD-5`).
  - [x] `apps/web/src/app/app.routes.ts` : ajouter `{ path: 'account', component: Account }` dans les `children` du `Shell` (zone authentifiée, derrière `authGuard`). **Pas sous `profile/`** — cette racine porte aujourd'hui le calendrier et sera reprise par la navigation à quatre destinations en 29.3.
  - [x] `apps/web/src/app/layout/shell/shell.html` : ajouter l'entrée de menu **avant** `nav.calendar`, sur le modèle exact des entrées existantes :
    ```html
    <a mat-menu-item routerLink="/account">
      <mat-icon>person</mat-icon>
      <span>{{ theme.tone()['nav.account'] }}</span>
    </a>
    ```
  - [x] `shell.spec.ts` : test vérifiant la présence du lien vers `/account` dans le menu.
  - [x] `account.spec.ts` : le formulaire est pré-rempli depuis `currentUser`, la soumission appelle le service et met à jour `currentUser`, aucun champ ne permet d'éditer le pseudo. **Attention au timing zoneless** : `whenStable()` seul ne suffit pas pour un `ngOnInit` asynchrone — reprendre la boucle de drainage de microtasks déjà utilisée dans les specs existantes (`partie-detail.spec.ts`, helper `createFixture()`). Découverte non anticipée par la story : `ng test` type-check réellement les fichiers `.spec.ts` (pas seulement `pnpm build`) — `AuthUser` élargi cassait la compilation de `auth.guard.spec.ts` et `auth.service.spec.ts` (littéraux typés `: AuthUser` sans `displayName`), corrigés.

- [x] Task 7 — Suites complètes et vérifications
  - [x] `docker compose exec api pnpm test` — aucune régression. 49/49 suites, 934/934 tests verts. Découverte non anticipée par la story : `notifications.integration.spec.ts` crée des `User` via un `prisma.user.create()` réel (pas mocké) — a échoué au runtime (`PrismaClientValidationError: Argument displayName is missing`) tant que non corrigé.
  - [x] `docker compose exec api pnpm typecheck` — propre. **Obligatoire** : `AuthUser` a changé de forme. 2 appelants Prisma supplémentaires non listés par la story ont dû être corrigés pour que le typecheck passe (`prisma/seed-demo.ts`, `src/prisma/seed-admin.ts` — voir Task 3).
  - [x] `docker compose exec web pnpm test` — aucune régression. 76/76 fichiers, 1024/1024 tests verts (baseline 1017 + nouveaux tests account/shell). Découverte non anticipée : `ng test` type-check réellement les `.spec.ts` (pas seulement `pnpm build`) — a cassé sur 2 littéraux `AuthUser` non mis à jour (`auth.guard.spec.ts`, `auth.service.spec.ts`), corrigés (voir Task 6).
  - [x] `docker compose exec web pnpm build` — compile sans erreur de type. Dépassement de budget : 204.58 kB (baseline mesurée via `git stash` : 200.15 kB) — augmentation de ~4.4 kB cohérente avec le nouveau composant `Account`, pas une régression anormale.
  - [x] **Redémarré réellement le conteneur api** — logs confirmant `Mapped {/me/display-name, PATCH} route` puis `Nest application successfully started`.
  - [x] Vérifié à la main (curl réel contre le conteneur + lecture directe en base) : login admin → `displayName: "admin"` (= pseudo, AC2) ; `PATCH /me/display-name` persiste un nouveau nom (AC1/AC4) ; deux comptes (`admin` et `mj`) confirmés porteurs du même `displayName` en base sans rejet (AC4). Données de démo restaurées à leur état d'origine après vérification.

### Review Findings

- [x] [Review][Patch] Nom affiché composé uniquement d'espaces accepté (aucun trim) [apps/api/src/account/dto/update-display-name.dto.ts:4-7] — corrigé : `@Transform` trim avant validation (API) + validateur `notBlank` (frontend), vérifié end-to-end (curl réel : `"   "` → 400, `"  Nom  "` → `"Nom"` persisté).
- [x] [Review][Patch] `AccountService.updateDisplayName()` ne gère pas un `userId` de session référant un compte supprimé (P2025 Prisma non catché → 500 générique) [apps/api/src/account/account.service.ts:8-15] — corrigé : `catch` P2025 → `NotFoundException`, même pattern que `resolveScenarioOrThrow()` (scenarios.service.ts).
- [x] [Review][Patch] Libellé `account.display_name_label` identique mot pour mot entre les thèmes `grimoire-emeraude` et `foret-ancienne` (copier-coller non reformulé) [apps/web/src/app/core/theme/tones.ts] — corrigé : reformulé en « Nom porté aux yeux du cercle » pour `foret-ancienne`.
- [x] [Review][Patch] Libellé "E-mail" codé en dur dans le template, seul champ de l'écran à ne pas passer par `theme.tone()` [apps/web/src/app/features/account/account.html] — corrigé : nouvelle clé `account.email_label` dans les 3 thèmes.
- [x] [Review][Patch] Branche `if (this.form.invalid) return;` de `submit()` non testée (aucun test ne vérifie qu'une soumission invalide n'appelle pas le service) [apps/web/src/app/features/account/account.spec.ts] — corrigé : 2 tests ajoutés (vide, espaces seuls).
- [x] [Review][Patch] Commentaire d'avertissement Prisma auto-généré obsolète laissé dans la migration (dit l'opération impossible alors qu'elle a été rendue possible) [apps/api/prisma/migrations/20260805182210_user_display_name/migration.sql:1-6] — corrigé : remplacé par un commentaire factuel expliquant le contournement.
- [x] [Review][Defer] Gestion d'erreur générique dans `Account.submit()` — ne distingue pas 401 (session expirée)/réseau/validation, aucun log — deferred, stratégie d'erreur transverse hors scope de cette story (relève d'une future story sur l'expiration de session) [apps/web/src/app/features/account/account.ts:55-56]
- [x] [Review][Defer] Migration en 3 instructions SQL séparées sans transaction explicite — fenêtre de course théorique si une inscription concurrente survient pendant le déploiement de la migration — deferred, projet pas encore en production (cf. décision similaire actée Story 15.2), Prisma applique généralement chaque fichier de migration de façon atomique sur Postgres [apps/api/prisma/migrations/20260805182210_user_display_name/migration.sql:8-10]

## Dev Notes

### État actuel des fichiers modifiés

- **`apps/api/prisma/schema.prisma`, modèle `User`** — champs actuels : `id`, `email` (`@unique`), `pseudo` (`@unique`), `passwordHash`, `role` (`GlobalRole`), `createdAt`, plus 15 relations. **Aucun champ de préférence.** C'est la première colonne d'état de compte du projet.
- **`apps/api/src/auth/auth.service.ts`, `register()`** — crée l'utilisateur dans une `$transaction` (`tx.user.create({ data: { email, pseudo, passwordHash } })`) puis consomme le lien d'invitation dans la même transaction. Émet `partieTopic(joinedPartieId)` **après** résolution de la transaction, jamais dedans (`P7-AD-2`) — ne pas déplacer cet appel. Capture `P2002` → `ConflictException` : ce chemin reste inchangé, `displayName` n'ayant aucune contrainte d'unicité.
- **`apps/api/src/auth/session.serializer.ts`** — `deserializeUser()` recharge l'utilisateur à chaque requête via `UsersService.findById()` et renvoie `{ ...user }` moins `passwordHash`. **Conséquence directe** : toute colonne ajoutée à `User` est automatiquement exposée par `GET /auth/me` et par `req.user`. C'est pourquoi aucun travail de lecture n'est nécessaire — mais c'est aussi pourquoi il ne faudra jamais y mettre de secret.
- **`apps/api/src/users/users.service.ts`** — `create()` n'est appelée par aucun chemin de production, mais doit être mise à jour (voir Task 2). `searchByEmailOrPseudo()` renvoie aujourd'hui `{ id, pseudo, email }` — **ne pas y toucher** : c'est `AD-2`/`D-8`, story 32.1.
- **`apps/web/src/app/layout/shell/shell.html`** — `mat-menu` contenant `menu-user` (affiche `user()?.pseudo`), l'entrée « créer une partie », l'entrée calendrier, un `<app-theme-selector />` et la déconnexion. La bascule MJ/joueur (`mat-button-toggle-group`, deux emplacements dont une `mat-toolbar-row` mobile) **reste en place** — sa suppression est la story 29.1.
- **`apps/web/src/app/core/auth/auth.service.ts`** — `currentUser` est un `signal<AuthUser | null>`. `loadSession()` déduplique l'appel `/auth/me`. Le commentaire en tête sur `API_BASE` documente le défaut corrigé au cadrage du palier : ne jamais réintroduire une URL d'API en dur.
- **`apps/web/src/app/core/theme/tones.ts`** — `TONE_MAP: Record<Theme, Record<string, string>>`, trois blocs, sections commentées (`/* — navigation — */`, `/* — dashboard — */`…). Le typage garantit la présence des **trois thèmes**, pas celle d'une clé dans chacun.

### Ce qui doit continuer de fonctionner

- **L'inscription par lien d'invitation** (`POST /auth/register` → compte + `Membership` atomiques + émission SSE). Une contrainte `NOT NULL` non renseignée la casserait intégralement — c'est le scénario que l'AC3 verrouille.
- **La connexion par e-mail *ou* pseudo** (`LocalStrategy` → `UsersService.findByEmailOrPseudo`). Le pseudo reste un identifiant : rien dans cette story ne doit le rendre modifiable.
- **La restauration de session au démarrage** (`AuthService.loadSession()` → `/auth/me`). Le contrat `AuthUser` s'élargit, il ne change pas de forme pour les champs existants.
- **Le sélecteur de thème dans le menu** — l'entrée « Compte » s'ajoute au menu, elle ne remplace ni ne déplace `<app-theme-selector />` (le thème migre vers le compte en 28.4, pas ici).

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Service HTTP frontend | pattern de `core/character-roles/character-roles.service.ts` (`firstValueFrom`, `API_BASE`, `withCredentials`) | `BehaviorSubject`, `resource()`, URL en dur |
| Formulaire + états | `features/parties/partie-form/partie-form.ts` (`fb.nonNullable.group`, signaux `saving`/`error`) | un nouveau patron de formulaire |
| Garde d'authentification API | `AuthenticatedGuard` (`auth/guards/`) | une garde maison |
| Id de l'utilisateur courant | `(req.user as { id: string }).id` | un id passé dans le corps ou l'URL |
| Retrait du hash | `const { passwordHash, ...safe } = user` | un `select` Prisma partiel divergent |
| Libellés d'interface | `tones.ts`, les trois thèmes | une chaîne en dur dans le template |

### Sécurité

- La route est **authentifiée** (`AuthenticatedGuard`) et n'accepte **que** `displayName` — un DTO validé par `class-validator` avec `whitelist` global empêche qu'un `role: 'ADMIN'` ou un `email` glissé dans le corps atteigne Prisma. Ne jamais passer `req.body` tel quel à `update()`.
- `displayName` est **affiché à d'autres utilisateurs** : plafonner la longueur (60) est autant une garde d'affichage qu'une garde de stockage. Angular échappe par défaut, ne pas introduire d'`innerHTML`.
- Pas de limitation de débit spécifique nécessaire : le plafond global (300/min) suffit pour une route authentifiée non sensible. Les routes sensibles de l'épic (mot de passe, e-mail) porteront leur propre `@Throttle` en 28.5/28.6.
- Cet épic porte des enjeux de sécurité réels et le PRD demande un passage par `/security-review` — à faire en fin d'épic, pas à cette story.

### Project Structure Notes

- **Nouveaux (API)** : `apps/api/src/account/{account.module.ts, account.controller.ts, account.service.ts, dto/update-display-name.dto.ts}` + `account.service.spec.ts`, `account.controller.spec.ts`. Conforme au source tree de `ARCHITECTURE-SPINE.md` (§ Source tree, `apps/api/src/account/`).
- **Nouveaux (web)** : `apps/web/src/app/core/account/account.service.ts` (+ spec), `apps/web/src/app/features/account/account.{ts,html,scss,spec.ts}`. Conforme au source tree (`core/account/account.service.ts`, `features/account/`).
- **Nouvelle migration** : `apps/api/prisma/migrations/<timestamp>_user_display_name/`.
- **Modifiés** : `apps/api/prisma/schema.prisma`, `apps/api/src/auth/auth.service.ts` (+ spec), `apps/api/src/users/users.service.ts`, `apps/api/src/app.module.ts`, `packages/shared/src/index.ts`, `apps/web/src/app/core/theme/tones.ts`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/layout/shell/shell.html` (+ `shell.spec.ts`).
- **Non touchés** : `packages/game-rules`, tout `apps/api/src/characters/`, `parties/`, `scenarios/`, et l'ensemble des DTO d'identité (story 28.2).

### Pièges connus du projet

- **Migration `NOT NULL` sur table peuplée** — le piège principal, traité en Task 1. Ne pas contourner par un `@default("")` : l'AC2 exige `displayName = pseudo`, pas une chaîne vide.
- **`pnpm typecheck` après un changement de signature** — `ts-jest` est configuré en `isolatedModules` et **ne type-check pas en cross-file**. Une suite de tests verte ne prouve pas que le projet compile. Obligatoire ici, `AuthUser` change.
- **Specs API important `game-rules`** — tout nouveau spec API qui importe `game-rules` (directement ou transitivement, typiquement via `CharacterService`) exige `jest.mock('@master-jdr/game-rules', ...)`, sinon l'erreur trompeuse « Unexpected token export ». `AccountService` ne dépend que de `PrismaService`, la précaution ne devrait pas s'appliquer — mais si elle apparaît, c'est la cause.
- **Timing des tests web zoneless** — pas de `zone.js` : `whenStable()` seul ne suffit pas pour un `ngOnInit` asynchrone. Réutiliser la boucle de drainage de microtasks déjà établie dans les specs existantes ; la story 27.3 a dû la porter de 10 à 15 itérations après l'ajout d'un `await`.
- **Budget de bundle Angular** — `pnpm build` échoue sur le budget de 1 MB (`angular.json`). Dépassement **préexistant** (~200 Ko à la baseline). Vérifier qu'il n'augmente pas anormalement, ne pas essayer de le résoudre.
- **Tout passe par Docker** — aucun outil Node sur l'hôte. Le PATH de l'agent ne voit `docker` qu'après rechargement depuis le registre (cf. `CLAUDE.md`).

### Temps réel (checklist `docs/checklist.md`)

`AD-14` classe les préférences et l'état de compte en **état strictement personnel : rafraîchissement local après l'action, aucune émission SSE**. Cette story met donc à jour `AuthService.currentUser` côté client après le `PATCH`, et **n'émet aucun événement**. Ne pas câbler `RealtimeService`, ne pas ajouter d'entrée à `handlers`.

Nuance à connaître pour la suite : `displayName` est affiché à d'autres utilisateurs, donc sa modification sera visible ailleurs. C'est acceptable ici — aucun écran tiers ne l'affiche encore (28.2 fera traverser le champ). Si le sujet revient, il relèvera d'une décision de 28.2, pas d'un rattrapage sur cette story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.1] — Acceptance Criteria d'origine, notes de l'épic 28
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-1,FR-4] — écran de compte, nom affiché modifiable / pseudo immuable, absence d'unicité et son motif
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/addendum.md#1] — état vérifié du serveur : aucun endpoint de profil, modèle `User` sans préférences
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-1] — colonnes typées sur `User`, `displayName` NOT NULL, **deux points d'écriture obligatoires**
- [Source: .../ARCHITECTURE-SPINE.md#AD-4] — `/me` est une convention de routage ; `AccountModule` porte l'état de compte seul
- [Source: .../ARCHITECTURE-SPINE.md#AD-2] — `pseudo` **et** `displayName` dans les DTO d'identité (story 28.2, hors périmètre ici)
- [Source: .../ARCHITECTURE-SPINE.md#AD-14] — état personnel : rafraîchissement local, aucune émission SSE
- [Source: .../ARCHITECTURE-SPINE.md#Source tree] — emplacements `apps/api/src/account/`, `core/account/`, `features/account/`
- [Source: apps/api/prisma/schema.prisma#User] — modèle actuel, aucun champ de préférence
- [Source: apps/api/src/auth/auth.service.ts#register] — `tx.user.create`, transaction, émission SSE hors transaction, capture P2002
- [Source: apps/api/src/auth/session.serializer.ts#deserializeUser] — renvoie `User` complet moins `passwordHash` : `displayName` est exposé automatiquement
- [Source: apps/api/src/auth/auth.controller.ts#login] — pattern `(req.user as { id: string }).id`
- [Source: apps/api/src/users/users.service.ts#create] — second `user.create` à mettre à jour
- [Source: packages/shared/src/index.ts#AuthUser] — interface à étendre
- [Source: apps/web/src/app/layout/shell/shell.html] — `mat-menu` existant, emplacement de l'entrée « Compte »
- [Source: apps/web/src/app/app.routes.ts] — enfants du `Shell` derrière `authGuard` ; `profile/calendar` occupe déjà `profile/`
- [Source: apps/web/src/app/features/parties/partie-form/partie-form.ts] — patron de formulaire à copier
- [Source: apps/web/src/app/core/character-roles/character-roles.service.ts] — patron de service HTTP frontend à copier
- [Source: apps/web/src/app/core/theme/tones.ts] — trois blocs de thème, section `/* — navigation — */`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api pnpm test` → 49 suites, 934/934 passed (aucune régression). Découverte : `notifications.integration.spec.ts` crée des `User` via un `prisma.user.create()` réel (non mocké) — a échoué au runtime (`PrismaClientValidationError: Argument displayName is missing`) tant que non corrigé.
- `docker compose exec api pnpm typecheck` → propre après correction de 2 appelants Prisma non listés par la story : `prisma/seed-demo.ts#createUser` et `src/prisma/seed-admin.ts#seedAdmin` (+ `seed-admin.spec.ts`), tous deux écrivent `displayName: pseudo`.
- `docker compose exec web pnpm test` → 76 fichiers, 1024/1024 passed (baseline 1017 + nouveaux tests `account.spec.ts`/`account.service.spec.ts`/`shell.spec.ts`). Découverte : `ng test` type-check réellement les `.spec.ts` (pas seulement `pnpm build`) — cassé sur 2 littéraux `AuthUser` non mis à jour (`auth.guard.spec.ts`, `auth.service.spec.ts`), corrigés.
- `docker compose exec web pnpm build` → compile sans erreur de type. Dépassement de budget : 204.58 kB (baseline mesurée via `git stash`/`git stash pop` : 200.15 kB) — augmentation de ~4.4 kB cohérente avec le nouveau composant `Account`, pas une régression anormale.
- Redémarrage réel du conteneur `api` : logs confirmant `Mapped {/me/display-name, PATCH} route` puis `Nest application successfully started`.
- Vérification manuelle bout-en-bout (curl réel contre le conteneur + lecture directe PostgreSQL) : login admin → `displayName: "admin"` (= pseudo, AC2) ; `PATCH /me/display-name` persiste un nouveau nom (AC1) ; deux comptes (`admin` et `mj`) confirmés porteurs du même `displayName` en base sans rejet (AC4, aucune contrainte d'unicité). Données de démo restaurées à leur état d'origine après vérification.

### Completion Notes List

- Migration `User.displayName` en 3 étapes SQL (`ADD COLUMN` nullable → `UPDATE` depuis `pseudo` → `SET NOT NULL`) pour ne jamais échouer sur la table `User` déjà peuplée (5 comptes) — vérifié en base : colonne `NOT NULL`, aucune valeur vide.
- Les **deux** points d'écriture obligatoires (AD-1) sont couverts : `AuthService.register()` (chemin de production réel, via `tx.user.create`) et `UsersService.create()` (chemin non appelé en production aujourd'hui mais qui aurait cassé au runtime sans le typecheck).
- `AccountModule` créé à l'identique du pattern `CharacterRolesModule`/`XpDistributionsModule` : `id` toujours lu depuis la session (`req.user`), jamais du corps — vérifié par un test HTTP réel (`ValidationPipe` global, `forbidNonWhitelisted`) rejetant un `id` injecté dans le corps.
- Écran de compte frontend calqué sur `PartieForm` (formulaire) et `CharacterRolesService` (service HTTP) : pseudo et e-mail en lecture seule hors du `FormGroup`, seul `displayName` est un contrôle soumis. La soumission met à jour `AuthService.currentUser` avec l'utilisateur renvoyé par l'API (AD-14 : rafraîchissement local uniquement, aucune émission SSE — état strictement personnel).
- Entrée de menu « Compte » ajoutée avant « Mes disponibilités » dans les trois thèmes de `tones.ts`, avec ses propres libellés (`account.*`), aucune section vide créée (AC1).
- Deux découvertes non anticipées par la story, toutes deux liées au changement de forme de `AuthUser`/`User` : (1) le typecheck API a révélé 2 appelants Prisma directs supplémentaires dans les scripts de seed ; (2) `ng test` s'est avéré type-checker les specs (pas seulement `pnpm build`), révélant 2 littéraux `AuthUser` obsolètes côté web. Aucune des deux n'était dans le File List prévu par la story ; corrigées et documentées ici.

### File List

- `apps/api/prisma/schema.prisma` (modifié — champ `displayName`)
- `apps/api/prisma/migrations/20260805182210_user_display_name/migration.sql` (nouveau)
- `apps/api/prisma/seed-demo.ts` (modifié — `createUser()` écrit `displayName`)
- `apps/api/src/auth/auth.service.ts` (modifié — `register()` écrit `displayName`)
- `apps/api/src/auth/auth.service.spec.ts` (modifié — nouveau test)
- `apps/api/src/users/users.service.ts` (modifié — `create()` écrit `displayName`)
- `apps/api/src/users/users.service.spec.ts` (modifié — assertion mise à jour)
- `apps/api/src/prisma/seed-admin.ts` (modifié — `seedAdmin()` écrit `displayName`)
- `apps/api/src/prisma/seed-admin.spec.ts` (modifié — assertion mise à jour)
- `apps/api/src/notifications/notifications.integration.spec.ts` (modifié — fixtures `User` complétées)
- `apps/api/src/account/account.module.ts` (nouveau)
- `apps/api/src/account/account.controller.ts` (nouveau)
- `apps/api/src/account/account.controller.spec.ts` (nouveau)
- `apps/api/src/account/account.service.ts` (nouveau)
- `apps/api/src/account/account.service.spec.ts` (nouveau)
- `apps/api/src/account/dto/update-display-name.dto.ts` (nouveau)
- `apps/api/src/app.module.ts` (modifié — enregistrement `AccountModule`)
- `packages/shared/src/index.ts` (modifié — `AuthUser.displayName`, `UpdateDisplayNameDto`)
- `apps/web/src/app/core/account/account.service.ts` (nouveau)
- `apps/web/src/app/core/account/account.service.spec.ts` (nouveau)
- `apps/web/src/app/core/auth/auth.guard.spec.ts` (modifié — fixture `AuthUser` complétée)
- `apps/web/src/app/core/auth/auth.service.spec.ts` (modifié — fixture `AuthUser` complétée)
- `apps/web/src/app/core/theme/tones.ts` (modifié — `nav.account` + section `account.*` dans les 3 thèmes)
- `apps/web/src/app/features/account/account.ts` (nouveau)
- `apps/web/src/app/features/account/account.html` (nouveau)
- `apps/web/src/app/features/account/account.scss` (nouveau)
- `apps/web/src/app/features/account/account.spec.ts` (nouveau)
- `apps/web/src/app/app.routes.ts` (modifié — route `/account`)
- `apps/web/src/app/layout/shell/shell.html` (modifié — entrée de menu)
- `apps/web/src/app/layout/shell/shell.spec.ts` (modifié — nouveau test)

## Change Log

- 2026-08-05 — Backend : migration `User.displayName` (NOT NULL, sans contrainte d'unicité), `AccountModule` (`PATCH /me/display-name`), les deux points d'écriture obligatoires (`register()`/`UsersService.create()`). Frontend : écran de compte, entrée de menu, câblage `AuthService.currentUser`. Story passée en `review`.
- 2026-08-05 — Revue de code (bmad-code-review, 3 couches adversariales) : 0 decision-needed, 6 patches appliqués (trim/rejet des noms composés uniquement d'espaces API+front, P2025 catché dans `AccountService` → 404 propre, libellé dupliqué entre thèmes reformulé, label E-mail câblé sur `theme.tone()`, test de la branche formulaire invalide ajouté, commentaire de migration obsolète nettoyé), 2 items différés (voir `deferred-work.md`), 8 écartés (dont 1 faux positif de l'Acceptance Auditor sur `account.scss`, vérifié présent). Suite finale : 938/938 tests API, 1027/1027 tests web, typecheck propre, redémarrage réel du conteneur confirmé, vérification manuelle bout-en-bout (curl) du trim et du rejet des espaces seuls. Statut passé à `done`.
