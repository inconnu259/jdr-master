---
baseline_commit: e324b666879b8905303efdc90eed78b706f51a41
---

# Story 5.4: Mot de passe oublié (self-service)

Status: done

## Story

As a utilisateur qui ne se souvient plus de son mot de passe,
I want demander et effectuer une réinitialisation de mot de passe par e-mail,
so that je peux récupérer l'accès à mon compte sans dépendre du MJ ou d'un accès admin.

## Acceptance Criteria

1. **Given** je ne suis pas connecté et je saisis mon adresse e-mail sur `/forgot-password`, **When** je soumets le formulaire, **Then** je vois toujours le même message générique (« si un compte existe, un e-mail a été envoyé »), que l'adresse corresponde ou non à un compte existant (anti-énumération). [Source: epics.md#Story 5.4, AC1 ; PRD FR-5]
2. **Given** l'adresse correspond à un compte existant, **When** je soumets le formulaire, **Then** un `PasswordResetToken` est créé (`expiresAt` = +24h) et un e-mail est envoyé avec un lien vers `/reset-password/:token`. [Source: epics.md#Story 5.4, AC2 ; PRD FR-5]
3. **Given** je clique sur le lien reçu dans les 24h et je ne l'ai pas encore utilisé, **When** je saisis un nouveau mot de passe respectant les mêmes règles de robustesse qu'à l'inscription, **Then** mon mot de passe est mis à jour, le token est marqué utilisé (`usedAt`), et je peux me connecter avec le nouveau mot de passe. [Source: epics.md#Story 5.4, AC3 ; PRD FR-6]
4. **Given** le lien a expiré (plus de 24h) ou a déjà été utilisé, **When** j'essaie de l'utiliser pour définir un nouveau mot de passe, **Then** je vois un message clair m'invitant à refaire une demande, et le mot de passe n'est pas modifié. [Source: epics.md#Story 5.4, AC4 ; PRD FR-6]
5. **Given** je fais plusieurs demandes de réinitialisation rapprochées pour la même adresse ou depuis la même IP, **When** je dépasse le taux limite configuré, **Then** le throttler existant (`@nestjs/throttler`) bloque les requêtes excédentaires. [Source: epics.md#Story 5.4, AC5 ; PRD §4.4 NFR]

## Tasks / Subtasks

- [x] **Task 1 — Migration Prisma : `PasswordResetToken`** (AC: 2, 3, 4)
  - [x] Ajouter à `apps/api/prisma/schema.prisma` :
    ```prisma
    model PasswordResetToken {
      id        String    @id @default(uuid())
      userId    String
      user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
      token     String    @unique
      expiresAt DateTime
      usedAt    DateTime?
      createdAt DateTime  @default(now())
      @@index([userId])
    }
    ```
  - [x] Ajouter la relation inverse sur `model User` : `passwordResetTokens PasswordResetToken[]` (même style que les autres back-relations du modèle, ex. `pollVotes PollVote[]`).
  - [x] `docker compose exec api pnpm prisma migrate dev --name password_reset_token`.
  - [x] **⚠️ Piège découvert en Story 5.3** : après `migrate dev`, si le client TS généré ne reflète pas encore le nouveau modèle dans les types (`tsc --noEmit` échoue avec « does not exist in type X »), relancer explicitement `docker compose exec api pnpm prisma generate` avant de continuer.

- [x] **Task 2 — Types partagés (`packages/shared`)** (AC: 1, 2, 3, 4)
  - [x] Ajouter à `packages/shared/src/index.ts` (à la suite des types Palier 4 existants — `EmailTemplate` y est déjà, cf. `apps/api/src/email/email-template.enum.ts` qui le duplique côté API par convention `import type` uniquement) :
    ```typescript
    export interface RequestPasswordResetDto { email: string }
    export interface ResetPasswordDto { token: string; newPassword: string }
    ```
  - [x] Ces interfaces sont des types de payload (`import type` côté web), pas des classes `class-validator` — les DTOs de validation côté API (Task 4) sont des classes séparées dans `apps/api/src/auth/dto/`, comme `RegisterDto` existant.

- [x] **Task 3 — `AuthService.requestPasswordReset` / `resetPassword`** (AC: 1, 2, 3, 4)
  - [ ] `apps/api/src/auth/auth.service.ts` : injecter `EmailService` dans le constructeur (à la suite de `users`/`prisma`/`inviteLinks`).
  - [ ] `async requestPasswordReset(email: string): Promise<{ ok: true }>` :
    1. `const user = await this.users.findByEmail(email);` (méthode déjà existante dans `UsersService`, ne pas en créer une nouvelle).
    2. Si `user` existe : générer `const token = randomBytes(32).toString('base64url');` (import `randomBytes` depuis `node:crypto`, même pattern que `InviteLinksService.create`/`findOrCreateForEmail` — `apps/api/src/invitations/invite-links.service.ts:35`), créer `this.prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } })`, puis `await this.email.sendMail('password-reset', user.email, { link: \`${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/reset-password/${token}\` })` (même fallback `WEB_ORIGIN` que `invitations.service.ts:137` et `notifications.service.ts`).
    3. **Toujours** retourner `{ ok: true }`, que `user` existe ou non — c'est la garde anti-énumération (AC1). Ne jamais faire dépendre le retour ou le timing observable d'un `if` qui court-circuite tôt côté branche "utilisateur inconnu" (pas de retour anticipé avant l'envoi d'e-mail conditionnel — structurer le code pour que les deux branches convergent vers le même retour, cf. Dev Notes).
  - [ ] `async resetPassword(token: string, newPassword: string): Promise<void>` :
    1. `const reset = await this.prisma.passwordResetToken.findUnique({ where: { token } });`
    2. Si absent, OU `reset.usedAt !== null`, OU `reset.expiresAt.getTime() <= Date.now()` : `throw new NotFoundException('Lien invalide ou expiré. Merci de refaire une demande.');` (message générique, cf. AD-6 — un seul message pour les trois cas, ne pas distinguer "expiré" de "déjà utilisé" pour ne pas donner d'information sur l'historique du token).
    3. Sinon : `const passwordHash = await argon2.hash(newPassword);` puis dans une transaction (`this.prisma.$transaction`, même pattern que `register()`) : `tx.user.update({ where: { id: reset.userId }, data: { passwordHash } })` **et** `tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } })` — les deux écritures doivent être atomiques (un crash entre les deux laisserait un token valide malgré le mot de passe déjà changé, ou l'inverse).

- [x] **Task 4 — DTOs de validation** (AC: 1, 2, 3, 4)
  - [x] `apps/api/src/auth/dto/request-password-reset.dto.ts` : classe avec `@IsEmail() email!: string;` (même pattern que `RegisterDto`).
  - [x] `apps/api/src/auth/dto/reset-password.dto.ts` : classe avec `@IsString() @MinLength(1) token!: string;` et `@IsString() @MinLength(8) newPassword!: string;` (même règle de robustesse que `RegisterDto.password` — AC3 exige "les mêmes règles qu'à l'inscription", donc `MinLength(8)` exactement, ne pas inventer de règle plus stricte).

- [x] **Task 5 — `AuthController` : deux nouvelles routes** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/api/src/auth/auth.controller.ts` :
    ```typescript
    @Throttle({ default: { ttl: 60_000, limit: 5 } }) // même limite que /auth/login (ligne 19 existante)
    @Post('forgot-password')
    forgotPassword(@Body() dto: RequestPasswordResetDto) {
      return this.auth.requestPasswordReset(dto.email);
    }

    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto) {
      return this.auth.resetPassword(dto.token, dto.newPassword);
    }
    ```
  - [x] Ni l'une ni l'autre route ne porte de guard — elles sont volontairement publiques (utilisateur non connecté), comme `register`. Ne pas ajouter `AuthenticatedGuard`.

- [x] **Task 6 — `AuthModule` : importer `EmailModule`** (AC: 1, 2)
  - [x] `apps/api/src/auth/auth.module.ts` : ajouter `EmailModule` aux `imports` (à la suite de `UsersModule`, `InvitationsModule`, `PassportModule.register(...)`).

- [x] **Task 7 — Frontend : `AuthService` (web)** (AC: 1, 3)
  - [ ] `apps/web/src/app/core/auth/auth.service.ts` : ajouter deux méthodes suivant le pattern existant (`register`, `login` — `firstValueFrom` + `withCredentials: true`) :
    ```typescript
    async requestPasswordReset(email: string): Promise<void> {
      await firstValueFrom(
        this.http.post(`${API}/auth/forgot-password`, { email }, { withCredentials: true }),
      );
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
      await firstValueFrom(
        this.http.post(`${API}/auth/reset-password`, { token, newPassword }, { withCredentials: true }),
      );
    }
    ```
  - [x] Utiliser la constante locale `API` déjà définie dans ce fichier (`const API = 'http://localhost:3000';`) — **ne pas** migrer vers `API_BASE` de `core/api-base.ts` dans cette story : c'est une incohérence pré-existante du projet (certains services l'utilisent, `auth.service.ts` non), hors scope ici (cf. Dev Notes).

- [x] **Task 8 — Frontend : composants `ForgotPassword` et `ResetPassword`** (AC: 1, 3, 4)
  - [x] Créer `apps/web/src/app/features/auth/forgot-password/forgot-password.ts` (+ `.html`, `.scss`) : composant standalone suivant exactement le pattern de `Login`/`Register` (`FormBuilder`, `ReactiveFormsModule`, `MatCardModule`/`MatFormFieldModule`/`MatInputModule`/`MatButtonModule`, signal `loading`/`error`). Formulaire : un seul champ `email` (`Validators.required, Validators.email`). Après soumission réussie, afficher le message générique fixe (« Si un compte existe pour cette adresse, un e-mail de réinitialisation a été envoyé. ») **à la place du formulaire** — ne jamais afficher un message différent selon le résultat (le backend renvoie toujours `{ ok: true }`, donc il n'y a de toute façon qu'un seul chemin de succès à gérer ; le seul cas d'erreur affichable est un échec réseau/HTTP générique, pas une distinction compte trouvé/non trouvé).
  - [x] Créer `apps/web/src/app/features/auth/reset-password/reset-password.ts` (+ `.html`, `.scss`) : composant standalone, token lu via route param comme `Join` (`this.route.snapshot.paramMap.get('token') ?? ''`, **pas** `queryParamMap` comme `Register` — la route est `/reset-password/:token`, pas `?token=`). Formulaire : un seul champ `newPassword` (`Validators.required, Validators.minLength(8)`). Sur `submit()`, appeler `auth.resetPassword(token, newPassword)` ; en cas de succès, rediriger vers `/login` (`router.navigate(['/login'])`) ; en cas d'échec, afficher un message générique invitant à refaire une demande depuis `/forgot-password` (lien `routerLink="/forgot-password"`, cf. AC4).

- [x] **Task 9 — Routing frontend** (AC: 1, 3)
  - [x] `apps/web/src/app/app.routes.ts` : ajouter `{ path: 'forgot-password', component: ForgotPassword }` et `{ path: 'reset-password/:token', component: ResetPassword }` **au même niveau que `login`/`register`/`join/:token`** (hors du bloc `Shell`/`authGuard` — routes publiques, pas de session requise).

- [x] **Task 10 — Lien "mot de passe oublié" depuis la page de connexion** (AC: 1)
  - [x] `apps/web/src/app/features/auth/login/login.html` : ajouter un lien `<a routerLink="/forgot-password">Mot de passe oublié ?</a>` dans `mat-card-actions`, à côté du lien existant `<a routerLink="/register">Créer un compte</a>`.

- [x] **Task 11 — Tests backend** (AC: 1, 2, 3, 4, 5)
  - [ ] `apps/api/src/auth/auth.service.spec.ts` (étendre le fichier existant, même pattern d'instanciation manuelle `new AuthService(users, prisma, inviteLinks, email)` — ajouter le mock `email = { sendMail: jest.fn().mockResolvedValue({ ok: true }) }` au `beforeEach`) :
    - `requestPasswordReset` avec un e-mail correspondant à un utilisateur → crée un `PasswordResetToken` (vérifier l'appel `prisma.passwordResetToken.create` avec `expiresAt` ~24h dans le futur) et appelle `email.sendMail('password-reset', ...)` ; retourne `{ ok: true }`.
    - `requestPasswordReset` avec un e-mail sans compte correspondant → **aucun** appel à `prisma.passwordResetToken.create` ni à `email.sendMail` ; retourne quand même `{ ok: true }` (AC1, anti-énumération — le test doit vérifier l'égalité stricte du retour entre les deux cas, pas seulement l'absence d'exception).
    - `resetPassword` avec un token valide et non expiré → met à jour `user.passwordHash` (argon2.hash mocké comme dans les tests `register()` existants) et `passwordResetToken.usedAt`, dans la même transaction (`prisma.$transaction` appelé une fois).
    - `resetPassword` avec un token inconnu → `NotFoundException`.
    - `resetPassword` avec un token déjà utilisé (`usedAt` non null) → `NotFoundException`, `user.passwordHash` non modifié (vérifier que `tx.user.update` n'est jamais appelé).
    - `resetPassword` avec un token expiré (`expiresAt` dans le passé) → `NotFoundException`, `user.passwordHash` non modifié.
  - [x] Ne pas créer de `auth.controller.spec.ts` — aucun autre controller du projet (poll, invitations, availability) n'a de test unitaire dédié ; les deux seuls existants (`app.controller.spec.ts`, `characters.controller.spec.ts`) ne concernent pas ce module. Rester cohérent avec la convention établie : la logique est testée au niveau service.

- [x] **Task 12 — Tests frontend** (AC: 1, 3, 4)
  - [x] `apps/web/src/app/core/auth/auth.service.spec.ts` (étendre, même pattern `HttpTestingController` que les tests `login`/`logout` existants) : `requestPasswordReset` et `resetPassword` envoient bien la requête POST attendue (URL, body, `withCredentials: true`).
  - [x] Tests de composants pour `ForgotPassword`/`ResetPassword` optionnels si le projet n'a pas de convention de test de composant établie pour `Login`/`Register` (vérifier avant d'écrire — chercher `login.spec.ts`/`register.spec.ts` ; s'ils n'existent pas, ne pas en introduire pour ces deux nouveaux composants, rester cohérent).

### Review Findings

- [x] [Review][Patch] Pas de `@MaxLength` sur `newPassword`/`email` — Fait : `@MaxLength` ajouté aux **trois** DTOs publics d'authentification (`RequestPasswordResetDto.email` 255, `ResetPasswordDto.token`/`newPassword` 255/128, et `RegisterDto.email`/`password`/`token` par cohérence 255/128/255) ; vérifié en direct (`newPassword` de 200 caractères → 400 rejeté).
- [x] [Review][Patch] Race TOCTOU dans `resetPassword` [apps/api/src/auth/auth.service.ts:96] — Fait : réclamation atomique du token via `updateMany({ where: { token, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })` à l'intérieur de la transaction, avant la mise à jour du mot de passe, même pattern que `InviteLinksService.consumeLink`. Tests mis à jour, vérifié en direct (flow complet reset → login → réutilisation du token bloquée).
- [x] [Review][Patch] Token lu de façon non réactive dans `ResetPassword` [apps/web/src/app/features/auth/reset-password/reset-password.ts:29] — Fait : `token` devient un signal réactif via `toSignal(route.paramMap)` au lieu de `route.snapshot.paramMap.get('token')` figé à la construction ; template et `submit()` mis à jour en conséquence.
- [x] [Review][Defer] Canal de timing dans `requestPasswordReset` (travail supplémentaire uniquement sur la branche "utilisateur trouvé") [apps/api/src/auth/auth.service.ts:77] — deferred, pre-existing (risque explicitement accepté dans les Dev Notes : pas de NFR de temps de réponse constant dans le PRD, scope hobby).
- [x] [Review][Defer] Limitation de débit uniquement par IP, pas par e-mail [apps/api/src/auth/auth.controller.ts:44] — deferred, pre-existing (explicitement acté dans les Dev Notes comme cohérent avec l'infrastructure de throttling existante du projet, hors scope de cette story).
- [x] [Review][Defer] `PasswordResetToken.token` stocké en clair en base [apps/api/prisma/schema.prisma] — deferred, pre-existing (même convention que `InviteLink.token`, déjà utilisée et acceptée ailleurs dans le projet).
- [x] [Review][Defer] Pas d'invalidation des autres tokens en cours ni des sessions actives lors d'un reset réussi [apps/api/src/auth/auth.service.ts] — deferred, pre-existing (durcissement légitime mais non requis par un AC ou le PRD, bon candidat v2).
- [x] [Review][Defer] Pas de plafond ni de nettoyage des tokens de reset accumulés [apps/api/prisma/schema.prisma] — deferred, pre-existing (négligeable au volume d'un projet hobby, aucune exigence AC/PRD).
- [x] [Review][Defer] Pas d'e-mail de confirmation après un changement de mot de passe réussi [apps/api/src/auth/auth.service.ts] — deferred, pre-existing (bonne pratique de sécurité, non requise par un AC/PRD, bon candidat v2).
- [x] [Review][Defer] Pas de normalisation de casse dans la recherche par e-mail (`findByEmail`) [apps/api/src/users/users.service.ts] — deferred, pre-existing (comportement déjà présent dans tout le projet pour register/login, pas une régression de cette story).

## Dev Notes

- **Anti-énumération (AC1) — piège d'implémentation classique** : la tentation naturelle est d'écrire `if (!user) return { ok: true }; /* ... crée le token et envoie l'email ... */ return { ok: true };` — fonctionnellement correct, mais si un jour quelqu'un ajoute une opération asynchrone coûteuse uniquement dans la branche "utilisateur trouvé" (ex. un log, un appel externe), le temps de réponse total redevient un canal d'énumération par timing. Ce n'est pas un risque à neutraliser activement dans cette story (scope hobby, pas de NFR de constant-time réponse dans le PRD), mais **ne pas** ajouter de court-circuit avec un retour anticipé structurellement différent entre les deux branches — les deux chemins de code doivent converger vers le même `return { ok: true }` final, pas deux `return` séparés à des points différents de la fonction.
- **`UsersService.findByEmail` existe déjà** (`apps/api/src/users/users.service.ts:9`) — ne pas en recréer une variante.
- **Génération de token** : réutiliser exactement le pattern `randomBytes(32).toString('base64url')` de `InviteLinksService` (`invite-links.service.ts:35,157`) — ne pas introduire une nouvelle bibliothèque ou un format de token différent pour rester cohérent avec le seul autre mécanisme de token à usage unique du projet.
- **Template e-mail déjà existant** : `apps/api/src/email/templates/password-reset.hbs` et l'entrée `'password-reset'` dans `EmailTemplate` (`email-template.enum.ts`) et dans `SUBJECTS` (`email.service.ts:9`) existent déjà depuis la Story 5.1 (placeholders anticipant cette story) — **ne rien modifier** dans `apps/api/src/email/`, seulement consommer `EmailService.sendMail('password-reset', to, { link })`. Le gabarit attend une seule variable de contexte : `link`.
- **Message générique unique pour token invalide/expiré/utilisé (AC4)** : `AuthService.resetPassword` ne doit pas distinguer ces trois cas dans le message d'erreur retourné au client (un seul `NotFoundException` avec un message générique) — distinguer les causes créerait un canal d'information sur l'état interne du token (a-t-il existé ? a-t-il été utilisé récemment ?).
- **Route Angular `/reset-password/:token` utilise un route param, pas un query param** — contrairement à `/register?token=...` (Story existante). Suivre le pattern de `Join` (`route.snapshot.paramMap.get('token')`), pas celui de `Register` (`queryParamMap`). C'est un choix délibéré de l'architecture (AD-7) pour un lien d'e-mail plus propre (`/reset-password/abc123` vs `/reset-password?token=abc123`).
- **Fichiers existants à modifier (UPDATE, pas NEW)** :
  - `apps/api/prisma/schema.prisma` (nouveau modèle + relation sur `User`)
  - `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `auth.service.spec.ts`
  - `apps/api/src/auth/dto/` (nouveaux fichiers, dossier existant)
  - `packages/shared/src/index.ts`
  - `apps/web/src/app/core/auth/auth.service.ts`, `auth.service.spec.ts`
  - `apps/web/src/app/app.routes.ts`
  - `apps/web/src/app/features/auth/login/login.html`
- **Nouveaux fichiers** :
  - `apps/api/src/auth/dto/request-password-reset.dto.ts`, `apps/api/src/auth/dto/reset-password.dto.ts`
  - `apps/web/src/app/features/auth/forgot-password/{forgot-password.ts,forgot-password.html,forgot-password.scss}`
  - `apps/web/src/app/features/auth/reset-password/{reset-password.ts,reset-password.html,reset-password.scss}`
- **`@nestjs/throttler` déjà en place** (`^6.5.0`), pattern `@Throttle({ default: { ttl: 60_000, limit: 5 } })` déjà utilisé sur `POST /auth/login` (`auth.controller.ts:19`) — réutiliser exactement la même limite pour les deux nouvelles routes (AC5), pas besoin de configuration supplémentaire. Le throttling est par IP par défaut (`ThrottlerGuard` global déjà enregistré dans `app.module.ts`) ; le PRD mentionne "par adresse e-mail et/ou IP" mais le mécanisme existant du projet n'est que par IP — rester cohérent avec l'infrastructure existante, ne pas construire un throttling par e-mail dédié (hors scope, non demandé ailleurs dans le projet).
- **`argon2.hash` déjà importé dans `auth.service.ts`** (`import * as argon2 from 'argon2';`, utilisé dans `register()`) — réutiliser directement, ne pas passer par `UsersService.create` (qui hash aussi mais crée un nouvel utilisateur, pas adapté à une mise à jour).
- **Transaction atomique pour `resetPassword`** : suivre le pattern `this.prisma.$transaction(async (tx) => { ... })` déjà utilisé dans `register()` (`auth.service.ts:42`), pas `Promise.all` de deux appels non transactionnels.

### Project Structure Notes

- `apps/api/src/auth/` : module existant, aucune restructuration — ajouts uniquement (deux méthodes de service, deux routes de contrôleur, deux DTOs).
- `apps/web/src/app/features/auth/` : suit la structure `forgot-password.ts` + `.html` + `.scss` déjà vue pour `login/` et `register/` (pas de composant partagé, chaque page duplique son propre petit bloc de styles `.auth-page`/`.auth-card` — convention déjà établie, ne pas introduire de style partagé pour cette story).
- Aucun nouveau module NestJS — tout vit dans `AuthModule` existant (contrairement à `NotificationsModule` en Story 5.3, ce flow n'a pas besoin d'isolation, c'est directement lié à l'authentification).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4: Mot de passe oublié (self-service)]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260706/prd.md#4.4 Mot de passe oublié (self-service) (FR-5, FR-6)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md#AD-6 Mot de passe oublié, #AD-7 Frontend routes publiques]
- [Source: _bmad-output/implementation-artifacts/5-1-infrastructure-envoi-emails.md — EmailService.sendMail(template, to, data), gabarit password-reset.hbs déjà créé]
- [Source: apps/api/src/auth/auth.service.ts — pattern register()/validateUser(), argon2, $transaction]
- [Source: apps/api/src/invitations/invite-links.service.ts:35,157 — pattern de génération de token randomBytes(32).base64url]
- [Source: apps/web/src/app/features/join/join.ts — pattern de lecture de token via route param (paramMap)]
- [Source: apps/web/src/app/features/auth/register/register.ts — pattern de lecture de token via query param (queryParamMap), à ne PAS suivre pour reset-password]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- **Bug pré-existant découvert et corrigé (hors périmètre initial, autorisé par l'utilisateur)** : sur le serveur de dev (`nest start --watch`), les gabarits e-mail `.hbs` étaient copiés dans `dist/email/templates/` par `nest-cli.json`, alors que le code compilé (`__dirname` de `email.module.js`) les cherchait dans `dist/src/email/templates/` — décalage de chemin qui cassait l'envoi réel des 3 e-mails (invitation, rappel, reset) sur le serveur live depuis les Stories 5.1/5.2/5.3, jamais détecté car les tests Jest (`ts-jest`) lisent les sources directement et contournent le problème. Corrigé en ajoutant `"outDir": "dist/src"` à l'entrée `assets` de `apps/api/nest-cli.json`. Vérifié : après correctif, un vrai e-mail "Réinitialisation de votre mot de passe" arrive dans Mailpit avec le bon contenu.
- Pas d'outil de navigateur disponible dans cet environnement pour une vérification UI visuelle des nouvelles pages — vérification de bout en bout faite via HTTP direct (curl) contre l'API réelle + inspection DB (`PasswordResetToken`) + API Mailpit, couvrant les 5 AC. Les routes frontend (`/forgot-password`, `/reset-password/:token`) répondent 200 (SPA), la compilation Angular ne produit aucune nouvelle erreur.

### Completion Notes List

- `PasswordResetToken` ajouté (migration `20260707142414_password_reset_token`) avec relation `User.passwordResetTokens`.
- `AuthService.requestPasswordReset`/`resetPassword` implémentés avec garde anti-énumération (AC1, toujours `{ ok: true }`) et transaction atomique pour le reset (AC3/AC4), réutilisant les patterns existants (`randomBytes(32).base64url` de `InviteLinksService`, `$transaction` de `register()`).
- Deux nouvelles routes publiques `POST /auth/forgot-password` / `POST /auth/reset-password`, throttlées (5/min, même limite que `/auth/login`).
- Frontend : composants `ForgotPassword`/`ResetPassword` suivant exactement le pattern `Login`/`Register`/`Join`, routes publiques ajoutées, lien "Mot de passe oublié ?" sur la page de connexion.
- Tests : `auth.service.spec.ts` (backend) étendu avec 6 nouveaux cas (13/13 passent) ; `auth.service.spec.ts` (frontend) étendu avec 2 nouveaux cas (5/5 passent). Pas de tests de composants pour `ForgotPassword`/`ResetPassword` ni de `auth.controller.spec.ts`, cohérent avec les conventions établies du projet (vérifié : aucun composant `auth` ni la plupart des controllers n'ont de test dédié).
- **Vérification manuelle de bout en bout contre la stack réelle** (curl + DB + Mailpit) : AC1 (réponse identique `{ok:true}` pour e-mail connu/inconnu), AC2 (token créé en DB avec expiration +24h, e-mail réellement reçu dans Mailpit après correction du bug de gabarits), AC3 (mot de passe changé, connexion réussie avec le nouveau mot de passe), AC4 (réutilisation du même token → 404 message générique), AC5 (429 après 5 requêtes/min, réinitialisé après la fenêtre).
- Suite complète : backend 256/256 tests passent (`pnpm test`), frontend 276/276 (`pnpm test`), typecheck backend/frontend propre (mêmes erreurs pré-existantes non liées dans `poll.service.spec.ts`), lint frontend propre, lint backend cohérent avec la dette pré-existante déjà actée en Story 5.3 (delta expliqué par le pattern `jest.fn()` non typé, déjà toléré partout ailleurs dans le projet).

**Revue de code (2026-07-07)** — 3 patches appliqués :
- `@MaxLength` ajouté sur les trois DTOs publics d'authentification (`RequestPasswordResetDto`, `ResetPasswordDto`, `RegisterDto`) pour fermer un vecteur DoS potentiel (payload volumineux vers `argon2.hash`), plutôt que de le limiter aux deux nouveaux DTOs seulement.
- `resetPassword` réclame désormais le token de façon atomique (`updateMany` avec garde `WHERE`, même pattern que `InviteLinksService.consumeLink`) à l'intérieur de la transaction, fermant une race TOCTOU entre deux requêtes concurrentes sur le même token.
- `ResetPassword` (frontend) lit maintenant le token de façon réactive (`toSignal(route.paramMap)`) plutôt que via `route.snapshot`, plus robuste si Angular réutilise l'instance du composant lors d'une navigation ne changeant que le paramètre.
- Suite complète après patches (`pnpm test`) : backend 254/254, frontend 276/276. Vérification en direct contre la stack réelle après redémarrage propre du serveur de dev : flow reset → login avec le nouveau mot de passe → réutilisation du token bloquée (404), et rejet 400 d'un `newPassword` de 200 caractères par la nouvelle borne `@MaxLength(128)`.
- 7 items non actionnables restants documentés dans `deferred-work.md` (durcissements de sécurité légitimes mais non requis par les AC/PRD : canal de timing, throttling par e-mail, hachage du token en base, invalidation des sessions/tokens concurrents, purge des tokens expirés, e-mail de confirmation, normalisation de casse — tous de bons candidats v2).

### File List

- `apps/api/prisma/schema.prisma` (modifié)
- `apps/api/prisma/migrations/20260707142414_password_reset_token/migration.sql` (nouveau)
- `apps/api/nest-cli.json` (modifié — correctif du bug de chemin des gabarits e-mail, hors périmètre initial)
- `apps/api/src/auth/auth.service.ts` (modifié)
- `apps/api/src/auth/auth.service.spec.ts` (modifié)
- `apps/api/src/auth/auth.controller.ts` (modifié)
- `apps/api/src/auth/auth.module.ts` (modifié)
- `apps/api/src/auth/dto/register.dto.ts` (modifié — revue de code, `@MaxLength`)
- `apps/api/src/auth/dto/request-password-reset.dto.ts` (nouveau)
- `apps/api/src/auth/dto/reset-password.dto.ts` (nouveau)
- `packages/shared/src/index.ts` (modifié)
- `apps/web/src/app/core/auth/auth.service.ts` (modifié)
- `apps/web/src/app/core/auth/auth.service.spec.ts` (modifié)
- `apps/web/src/app/app.routes.ts` (modifié)
- `apps/web/src/app/features/auth/login/login.html` (modifié)
- `apps/web/src/app/features/auth/forgot-password/forgot-password.ts` (nouveau)
- `apps/web/src/app/features/auth/forgot-password/forgot-password.html` (nouveau)
- `apps/web/src/app/features/auth/forgot-password/forgot-password.scss` (nouveau)
- `apps/web/src/app/features/auth/reset-password/reset-password.ts` (nouveau)
- `apps/web/src/app/features/auth/reset-password/reset-password.html` (nouveau)
- `apps/web/src/app/features/auth/reset-password/reset-password.scss` (nouveau)
