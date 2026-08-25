---
baseline_commit: 3e46979a5c337201363452e9a35e2a8b63cc9750
---

# Story 15.2: Invalidation des sessions actives au reset de mot de passe

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que toutes mes sessions actives soient coupées quand je réinitialise mon mot de passe,
so that si quelqu'un d'autre avait accès à mon compte, il en soit immédiatement exclu.

## Acceptance Criteria

1. **Given** je me connecte avec succès (`POST /auth/login`) **When** ma session est créée **Then** une ligne `UserSession` (`userId`, `sid`) est créée dans le callback de la route, juste après l'appel réussi à `req.login()`.
2. **Given** je me déconnecte (`POST /auth/logout`) **When** la déconnexion s'exécute **Then** la ligne `UserSession` correspondant à `req.sessionID` est supprimée avant la résolution de `req.logout()`.
3. **Given** je réinitialise mon mot de passe avec succès (`AuthService.resetPassword()`) **When** l'opération se termine **Then** toutes les lignes `UserSession` de mon compte sont supprimées, ainsi que les lignes `Session` correspondantes (jointure sur `sid`) — mes sessions actives ne sont plus valides.
4. **Given** le flux complet « login → navigation authentifiée → logout » et « mot de passe oublié → reset » déjà en production (Stories 5.4, 15.1) **When** cette story est appliquée **Then** aucune régression : login/logout continuent de fonctionner à l'identique côté client, le flux reset-password reste inchangé côté frontend, et un reset réussi ne casse pas la propre session courante de l'utilisateur qui vient de faire le reset (il n'est PAS connecté au moment du reset — cf. Dev Notes, pas de garde spéciale nécessaire).

## Tasks / Subtasks

- [x] **Task 1 — `apps/api/prisma/schema.prisma` : nouveau modèle `UserSession` (AC1, AC2, AC3)**
  - Ajouter, juste après le modèle `PasswordResetToken` (lignes 123-133) :
    ```prisma
    model UserSession {
      id        String   @id @default(uuid())
      userId    String
      user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
      sid       String   // référence logique vers Session.sid — pas de FK Prisma stricte,
                          // Session (table "session") est gérée par connect-pg-simple
      createdAt DateTime @default(now())

      @@index([userId])
    }
    ```
  - Ajouter la relation inverse sur `User` (ligne ~31, à côté de `passwordResetTokens PasswordResetToken[]`) : `sessions UserSession[]`.
  - **Ne pas** ajouter de `@relation` Prisma entre `UserSession.sid` et `Session.sid` : `Session` est mappée sur la table `"session"` gérée par `connect-pg-simple` (`main.ts`, `createTableIfMissing: false`), une FK stricte introduirait un couplage que l'architecture (AD-3) exclut explicitement — la jointure au moment de la suppression se fait par requête applicative (`sid IN (...)`), pas par contrainte de schéma.
  - Migration : `docker compose exec api pnpm prisma migrate dev --name user_session` (ou `migrate diff` + `migrate deploy` non-interactif si la commande dev échoue dans ce conteneur, cf. piège rencontré Story 15.1) puis `docker compose exec api pnpm prisma generate`.

- [x] **Task 2 — `AuthController.login()` : création de `UserSession` après `req.login()` (AC1)**
  - Fichier : `apps/api/src/auth/auth.controller.ts` (méthode actuelle lignes 23-26, citée intégralement dans les Dev Notes).
  - Le `LocalAuthGuard` (déjà en place) appelle en interne `req.login()` avant que le handler ne s'exécute (comportement standard `@nestjs/passport` + `AuthGuard('local')`) — au moment où `login(@Req() req)` s'exécute, la session est déjà ouverte et `req.sessionID` est déjà disponible. Pas besoin d'appeler `req.login()` explicitement dans le controller.
  - Ajouter un appel à une nouvelle méthode de service (Task 4) juste avant `return req.user`, en passant `(req.user as { id: string }).id` et `req.sessionID` :
    ```typescript
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @UseGuards(LocalAuthGuard)
    @Post('login')
    async login(@Req() req: Request) {
      await this.auth.recordSession(
        (req.user as { id: string }).id,
        req.sessionID,
      );
      return req.user;
    }
    ```
  - `login` devient `async` (actuellement synchrone).

- [x] **Task 3 — `AuthController.logout()` : suppression de `UserSession` avant résolution de `req.logout()` (AC2)**
  - Fichier : `apps/api/src/auth/auth.controller.ts` (méthode actuelle lignes 34-41).
  - `req.sessionID` reste valide jusqu'à `req.session.destroy()` (2ᵉ étape déjà en place) — le récupérer **avant** `req.logout()` (qui déconnecte `req.user` mais ne détruit pas encore la session).
  - Insérer la suppression entre les deux `await` existants :
    ```typescript
    @Post('logout')
    async logout(@Req() req: Request): Promise<{ ok: boolean }> {
      const sid = req.sessionID;
      await new Promise<void>((resolve, reject) =>
        req.logout((err) => (err ? reject(err) : resolve())),
      );
      await this.auth.forgetSession(sid);
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      return { ok: true };
    }
    ```
  - L'AC dit "avant la résolution de `req.logout()`" au sens fonctionnel large (avant que le cycle logout complet ne se termine, donc avant `session.destroy()`) — l'ordre exact retenu ci-dessus (après `req.logout()`, avant `session.destroy()`) est nécessaire car `req.sessionID` doit être capturé avant toute destruction de session, et `req.logout()` lui-même ne touche pas `sid`. Ne pas capturer `sid` après `session.destroy()`.

- [x] **Task 4 — `AuthService` : `recordSession()`, `forgetSession()`, invalidation dans `resetPassword()` (AC1, AC2, AC3)**
  - Fichier : `apps/api/src/auth/auth.service.ts`.
  - `recordSession(userId: string, sid: string): Promise<void>` — `this.prisma.userSession.create({ data: { userId, sid } })`. Pas de garde d'unicité particulière (un même `sid` ne devrait jamais se reproduire, généré par `express-session`).
  - `forgetSession(sid: string): Promise<void>` — `this.prisma.userSession.deleteMany({ where: { sid } })` (pas `delete` : ne doit pas lever si la ligne n'existe déjà plus — idempotent, cohérent avec le fait que `logout` peut être appelé sur une session déjà partiellement invalide).
  - Dans `resetPassword()` (lignes 114-155 actuelles, citées intégralement dans les Dev Notes) : après la vérification du secret (`argon2.verify`) réussie et **dans la même transaction Prisma** que le claim du token + la mise à jour de `passwordHash` (la transaction existante couvre déjà ces deux opérations depuis la Story 15.1 — l'étendre, ne pas en ouvrir une seconde) :
    1. Récupérer les `sid` des `UserSession` de `record.userId` (`tx.userSession.findMany({ where: { userId: record.userId }, select: { sid: true } })`).
    2. Supprimer les lignes `Session` correspondantes : `tx.session.deleteMany({ where: { sid: { in: sids } } })` (le modèle `Session` — table `"session"`, ligne 384-391 de `schema.prisma` — est déjà accessible via `PrismaService`/`tx`, aucune nouvelle déclaration nécessaire).
    3. Supprimer les lignes `UserSession` : `tx.userSession.deleteMany({ where: { userId: record.userId } })`.
    - Si `sids` est vide (aucune session active), l'étape 2 est un no-op naturel (`deleteMany` avec `in: []` ne supprime rien) — pas de branche conditionnelle nécessaire.
    - Ordre non critique entre 2 et 3 (pas de FK stricte entre les deux tables, cf. Task 1) mais garder `Session` puis `UserSession` par lisibilité (on supprime d'abord ce qui dépend du `sid` collecté, puis la table qui le référence).

- [x] **Task 5 — Tests (`apps/api/src/auth/auth.service.spec.ts`, AC1, AC2, AC3)**
  - Étendre les mocks `tx`/`prisma` existants (Dev Notes — conventions déjà en place, à reproduire à l'identique) : ajouter `userSession: { create: jest.Mock, deleteMany: jest.Mock, findMany: jest.Mock }` sur `prisma` (pour `recordSession`/`forgetSession`, hors transaction) et sur `tx` (pour l'invalidation dans `resetPassword`) ; ajouter `session: { deleteMany: jest.Mock }` sur `tx`.
  - `recordSession` : test simple, `prisma.userSession.create` appelé avec `{ data: { userId, sid } }`.
  - `forgetSession` : test simple, `prisma.userSession.deleteMany` appelé avec `{ where: { sid } }`.
  - `resetPassword` — étendre le test "token composite valide" existant (ligne 182 actuelle) : mocker `tx.userSession.findMany` pour renvoyer `[{ sid: 's1' }, { sid: 's2' }]`, asserter `tx.session.deleteMany` appelé avec `{ where: { sid: { in: ['s1', 's2'] } } }` et `tx.userSession.deleteMany` appelé avec `{ where: { userId: 'u1' } }`, **dans la même transaction** que `updateMany`/`user.update` (un seul appel à `prisma.$transaction`, pas un deuxième).
  - Nouveau cas : aucune session active (`tx.userSession.findMany` renvoie `[]`) → `tx.session.deleteMany` appelé avec `{ where: { sid: { in: [] } } }`, aucune erreur, reset réussit normalement.
  - Ne pas dupliquer les tests d'échec déjà couverts (format invalide, id inconnu, secret incorrect, déjà utilisé, expiré, course concurrente sur `updateMany`) — l'invalidation de session n'est atteinte que sur le chemin de succès, ces tests existants n'ont pas besoin de mocker `userSession`/`session` puisqu'ils échouent avant.

- [x] **Task 6 — `AuthController` : nouveau fichier de test (AC1, AC2)**
  - Aucun `auth.controller.spec.ts` n'existe actuellement (seul `auth.service.spec.ts` existe dans ce module) — en créer un, nouveau, avec le même style de mock manuel que `auth.service.spec.ts` (pas de `Test.createTestingModule`, instancier `new AuthController(authMock)` directement — convention à vérifier contre un controller-spec existant ailleurs dans le projet si un pattern différent y est établi, sinon suivre ce style).
  - `login()` : `req.user = { id: 'u1' }`, `req.sessionID = 'sess1'` (mock `Request` minimal) → asserter `auth.recordSession` appelé avec `('u1', 'sess1')`, retour = `req.user`.
  - `logout()` : mock `req.logout`/`req.session.destroy` résolvant immédiatement (callback appelé synchrone), `req.sessionID = 'sess1'` → asserter `auth.forgetSession` appelé avec `'sess1'`, **avant** que `req.session.destroy` ne soit invoqué (ordre d'appel, via `jest.fn()` + vérification de l'ordre des invocations si le style de test du projet le permet, sinon au minimum vérifier que les deux sont appelés).

- [x] **Task 7 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api.
  - `docker compose exec api pnpm typecheck` — propre (nouveau modèle Prisma, cf. mémoire projet `jdr-api-typecheck-gap` : `ts-jest` ne type-check pas cross-fichier, un usage résiduel incorrect du client Prisma ne serait pas détecté par les tests seuls).
  - Redémarrage réel du conteneur `api` (`docker compose restart api` ou équivalent) pour confirmer que la migration s'applique proprement sur la base de dev locale et que Nest démarre sans erreur (convention établie, cf. Stories 15.1, 8.8/8.9/10.4).
  - Test manuel réel recommandé si possible (pas d'e2e auth existant dans ce projet, cf. Dev Notes) : login → vérifier en base qu'une ligne `UserSession` existe ; logout → vérifier qu'elle a disparu ; login à nouveau puis reset de mot de passe (2ᵉ onglet/session) → vérifier que la session du 1ᵉʳ onglet est bien coupée (requête suivante renvoie 401/redirige vers login).
  - Aucune modification `apps/web` attendue (AC4) — à confirmer par `git status`/diff en fin de story.

### Review Findings

- [x] [Review][Patch] Aucune stratégie d'erreur définie pour `recordSession()`/`forgetSession()` dans `AuthController` — décision utilisateur (option mixte) : `recordSession()` dans `login()` reste fail-hard tel quel (garantit qu'une session "réussie" est toujours traçable) ; `forgetSession(sid)` dans `logout()` passe dans un `try/catch` (log l'erreur, ne bloque jamais `req.session.destroy()`). [`apps/api/src/auth/auth.controller.ts` — `login()`, `logout()`] — corrigé : `try/catch` ajouté autour de `forgetSession()` dans `logout()`, test de non-régression ajouté (`auth.controller.spec.ts`)
- [x] [Review][Patch] Aucune contrainte d'unicité sur `UserSession.sid` — `recordSession()` pourrait insérer des doublons pour le même `sessionID` (retry, double-soumission), cassant silencieusement l'hypothèse 1:1 implicite sur laquelle repose l'invalidation. [`apps/api/prisma/schema.prisma` — modèle `UserSession`] — corrigé : `sid` passé en `@unique` (migration `20260719113057_user_session_sid_unique`), `recordSession()` passé de `create()` à `upsert()` pour rester idempotent
- [x] [Review][Defer] `UserSession` n'a aucun TTL/purge — croissance non bornée pour tout utilisateur qui ne se déconnecte jamais explicitement (fermeture navigateur, crash) [`apps/api/prisma/schema.prisma` — modèle `UserSession`] — deferred, hors scope de cette story (AD-3 couvre uniquement l'invalidation, pas la purge ; AD-5/FR-14 ne couvre que `PasswordResetToken`, pas `UserSession`)
- [x] [Review][Defer] `onDelete: Cascade` supprime les lignes `UserSession` à la suppression d'un `User`, mais pas les lignes `Session` (connect-pg-simple) correspondantes — orpheline potentielle si une fonctionnalité de suppression de compte est ajoutée un jour [`apps/api/prisma/schema.prisma` — modèle `UserSession`] — deferred, aucune fonctionnalité de suppression de compte n'existe actuellement dans le projet
- [x] [Review][Defer] `req.session.destroy(() => resolve())` avale toute erreur passée au callback (comportement pré-existant, ligne non modifiée par ce diff) [`apps/api/src/auth/auth.controller.ts` — `logout()`] — deferred, pré-existant, hors scope de cette story

## Dev Notes

### Architecture — décision contraignante AD-3 (`ARCHITECTURE-SPINE.md` Palier 6, 2026-07-18)

> **AD-3 [ADOPTED]** : Nouveau modèle Prisma `UserSession` (`id`, `userId` FK→`User` `onDelete: Cascade`, `sid` référençant `Session.sid`, `createdAt`) — la ligne est créée à un seul point d'entrée précis : dans le callback de la route `POST /auth/login` (`AuthController`), juste après l'appel réussi à `req.login()` — jamais dans une stratégie Passport ni dans un guard, pour rester à un seul endroit auditable. Supprimée symétriquement dans le callback de `POST /auth/logout` (`req.logout()`), avant sa résolution. `AuthService.resetPassword()` supprime, dans la même opération que le changement de `passwordHash` : toutes les lignes `UserSession` de l'utilisateur **et** les lignes `Session` correspondantes (jointure sur `sid`) — les deux tables doivent rester synchronisées, une session supprimée d'un côté sans l'autre serait soit un fantôme soit une session non révoquée. Vit dans `AuthModule` existant, aucun nouveau module.

- **Prevents** (raison d'être de cette table d'index inverse plutôt qu'une requête directe) : une requête JSON non indexée sur `Session.sess` (fragile, dépend du format de sérialisation interne de `passport`) ; une invalidation "molle" par versioning qui laisserait des sessions serveur valides après un reset.
- **AD-9 (héritée)** : aucun nouveau module NestJS — tout vit dans `AuthModule` déjà existant (modification de fichiers existants uniquement : `auth.service.ts`, `auth.controller.ts`, `schema.prisma`).
- Cette story couvre **uniquement AD-3/FR-11**. **AD-4** (hachage du token, FR-10) est déjà livrée (Story 15.1, `done`). **AD-5** (purge `@Cron`, FR-14) et FR-12/FR-13 (e-mail confirmation, rate-limit) sont hors scope — stories 15.3/15.4 séparées. Ne pas anticiper la purge `@Cron` ni l'e-mail de confirmation dans cette story.

### Pourquoi pas de garde spéciale sur "je ne me déconnecte pas moi-même en réinitialisant mon mot de passe" (AC4)

Le flux `resetPassword()` est **anonyme** — l'utilisateur qui soumet le nouveau mot de passe via le lien reçu par e-mail n'est PAS authentifié au moment de l'appel (`POST /auth/reset-password` est une route publique, pas de guard, cf. `auth.controller.ts` ligne 51). Il n'y a donc pas de "session courante à préserver" : l'invalidation coupe **toutes** les sessions du compte, y compris celle(s) potentiellement encore ouvertes ailleurs (navigateur resté connecté, tiers non autorisé) — c'est exactement le comportement voulu par FR-11, aucune exclusion à coder.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/auth/auth.controller.ts`** (55 lignes, cité intégralement) :
  ```typescript
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Req() req: Request) {
    return req.user;
  }
  // ...
  @Post('logout')
  async logout(@Req() req: Request): Promise<{ ok: boolean }> {
    await new Promise<void>((resolve, reject) =>
      req.logout((err) => (err ? reject(err) : resolve())),
    );
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { ok: true };
  }
  ```
  `req.sessionID` (propriété standard `express-session`, typée via `@types/express-session`) est disponible dès que le middleware `session()` a tourné (toujours le cas, `main.ts` ligne 22) — pas d'import supplémentaire nécessaire, `Request` est déjà importé depuis `express`.
- **`apps/api/src/auth/auth.service.ts`** (156 lignes actuelles) — `resetPassword()` (lignes 114-155) déjà cité intégralement dans la Story 15.1 (voir historique). Signature/comportement inchangés par cette story sauf l'extension de la transaction existante (Task 4).
- **`apps/api/src/main.ts`** (59 lignes, cité intégralement) — confirme : session Postgres via `connect-pg-simple`, cookie `httpOnly`/`sameSite: 'lax'`, `passport.session()` monté. Aucune modification attendue dans ce fichier.
- **`apps/api/prisma/schema.prisma`** — modèle `Session` déjà existant (lignes 384-391), mappé `@@map("session")`, géré par `connect-pg-simple` (`createTableIfMissing: false` dans `main.ts`) mais **déjà déclaré côté Prisma** et donc requêtable via `PrismaService`/`tx.session.*` sans aucune modification de ce modèle :
  ```prisma
  model Session {
    sid    String   @id @db.VarChar
    sess   Json     @db.Json
    expire DateTime @db.Timestamp(6)

    @@index([expire], map: "IDX_session_expire")
    @@map("session")
  }
  ```
  Modèle `User` (lignes 15-36) — relation `passwordResetTokens PasswordResetToken[]` déjà présente ligne 31, ajouter `sessions UserSession[]` à côté.
- **`apps/api/src/auth/auth.module.ts`** (21 lignes) — `AuthService`, `LocalStrategy`, `SessionSerializer` déjà providers de `AuthModule` ; aucune modification de ce fichier attendue (pas de nouveau provider, tout vit dans `AuthService`/`AuthController` existants).
- **`apps/api/src/auth/guards/local-auth.guard.ts`** — à lire pour confirmer que `req.login()` est bien appelé en interne par `AuthGuard('local')` avant l'exécution du handler `login()` (comportement standard `@nestjs/passport`, ne devrait nécessiter aucune modification de ce guard).
- **`apps/api/src/auth/auth.service.spec.ts`** (278 lignes actuelles) — conventions de mock détaillées en Task 5, à réutiliser à l'identique.

### Project Structure Notes

- Fichiers modifiés : `apps/api/prisma/schema.prisma` (+ migration générée) ; `apps/api/src/auth/auth.controller.ts` ; `apps/api/src/auth/auth.service.ts` (+ test étendu).
- Fichier nouveau : `apps/api/src/auth/auth.controller.spec.ts` (Task 6, n'existe pas encore).
- Aucune modification `apps/web`, aucun nouveau module NestJS, aucune nouvelle dépendance.

### Testing Standards

- `apps/api` : Jest, `apps/api/src/auth/auth.service.spec.ts` — étendre le fichier existant, conventions de mock déjà en place (Task 5). `apps/api/src/auth/auth.controller.spec.ts` — nouveau, style manuel (mocks simples, pas de `Test.createTestingModule`), cohérent avec `auth.service.spec.ts`.
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — toujours lancer `pnpm typecheck` après l'ajout du modèle `UserSession`, un usage résiduel incorrect (ex. `prisma.userSession` mal orthographié) ne serait pas détecté par les tests seuls.
- Pas de suite e2e touchant `auth` dans ce projet (`apps/api/test/` ne contient aucun fichier `*auth*`) — le test manuel réel (Task 7) reste la seule vérification bout-en-bout, à ne pas sauter.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 262-301 — Epic 15 / Story 15.2 complète, FR11)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-3 — invalidation de session, AD-9 — aucun nouveau module, Structural Seed lignes 133-144 — modèle `UserSession`)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR-11 — invalidation des sessions actives lors d'un reset réussi)
- `_bmad-output/implementation-artifacts/15-1-hachage-du-token-de-reinitialisation-de-mot-de-passe.md` (story précédente — transaction Prisma existante dans `resetPassword()` à étendre, pas à dupliquer ; convention de mock `tx`/`prisma` à reproduire)
- `_bmad-output/implementation-artifacts/deferred-work.md` (ligne 442 — item "Pas d'invalidation des sessions actives lors d'un reset réussi" différé depuis Story 5.4, résolu par cette story)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Migration `prisma migrate dev --name user_session` a fonctionné directement dans ce run (contrairement à la Story 15.1 où l'environnement non interactif l'avait fait échouer) — pas eu besoin du fallback `migrate diff`/`migrate deploy`.
- Test manuel réel effectué via `curl` + Mailpit API (`http://localhost:8025/api/v1/*`) plutôt qu'un navigateur, pas d'outil browser disponible dans cette session : login → `UserSession` créée (vérifié via `psql`) → `GET /auth/me` 200 → logout → `UserSession` supprimée (`count = 0`) → login à nouveau → `forgot-password` + `reset-password` avec le token extrait de l'e-mail Mailpit → `UserSession` supprimée après reset → l'ancien cookie de session renvoie `403 Forbidden` sur `/auth/me` (session bien invalidée) → nouveau mot de passe fonctionne pour se reconnecter → mot de passe admin restauré à sa valeur d'origine (`.env` `ADMIN_PASSWORD`) via un second cycle forgot/reset pour ne pas casser l'environnement de dev partagé.

### Completion Notes List

- Task 1 : modèle `UserSession` ajouté à `schema.prisma` (`id`, `userId` FK→`User` `onDelete: Cascade`, `sid` texte libre sans FK stricte vers `Session`, `createdAt`, `@@index([userId])`), relation inverse `sessions UserSession[]` sur `User`. Migration `20260719104430_user_session` générée et appliquée, `prisma generate` exécuté.
- Task 2/3 : `AuthController.login()` devient `async`, appelle `auth.recordSession(userId, req.sessionID)` juste avant `return req.user` (après que `LocalAuthGuard` a déjà appelé `req.login()` en interne). `AuthController.logout()` capture `sid = req.sessionID` avant `req.logout()`, appelle `auth.forgetSession(sid)` entre `req.logout()` et `req.session.destroy()`.
- Task 4 : `AuthService.recordSession()`/`forgetSession()` ajoutées (`create`/`deleteMany` simples, hors transaction). `resetPassword()` étend sa transaction existante (Story 15.1 : claim du token + update du mot de passe) avec l'invalidation de session : `tx.userSession.findMany()` pour collecter les `sid`, `tx.session.deleteMany({ where: { sid: { in: sids } } })` puis `tx.userSession.deleteMany({ where: { userId } })` — aucune deuxième transaction ouverte, `sids: []` est un no-op naturel sur `deleteMany`.
- Task 5 : `auth.service.spec.ts` étendu — mocks `tx.userSession`/`tx.session`/`prisma.userSession` ajoutés aux conventions existantes ; 2 nouveaux tests `recordSession`/`forgetSession` ; test `resetPassword` "token composite valide" étendu avec les assertions d'invalidation (dans la même transaction) ; nouveau cas "aucune session active" (`findMany` → `[]`).
- Task 6 : nouveau `auth.controller.spec.ts` (aucun fichier de ce type n'existait dans le module) — style de mock manuel identique à `auth.service.spec.ts` (`new AuthController(authMock)`, pas de `Test.createTestingModule`). Test `logout` vérifie explicitement l'ordre d'appel (`logout` → `forgetSession` → `session.destroy`) via un tableau `callOrder`.
- Task 7 : 800/800 tests API (42 suites), `pnpm typecheck` propre, redémarrage réel du conteneur `api` confirmé (migration appliquée sans intervention manuelle — "No pending migrations to apply", "Nest application successfully started"). Test manuel bout-en-bout réel effectué (voir Debug Log References) confirmant AC1/AC2/AC3/AC4. Aucune modification `apps/web` (confirmé par `git status`).

### File List

- `apps/api/prisma/schema.prisma` (modifié)
- `apps/api/prisma/migrations/20260719104430_user_session/migration.sql` (nouveau)
- `apps/api/prisma/migrations/20260719113057_user_session_sid_unique/migration.sql` (nouveau — revue de code)
- `apps/api/src/auth/auth.controller.ts` (modifié)
- `apps/api/src/auth/auth.controller.spec.ts` (nouveau)
- `apps/api/src/auth/auth.service.ts` (modifié)
- `apps/api/src/auth/auth.service.spec.ts` (modifié)

## Change Log

- 2026-07-19 : Implémentation complète (Tasks 1-7). Nouveau modèle `UserSession` (AD-3, FR-11) créé au login (`AuthController.login()` → `AuthService.recordSession()`) et supprimé au logout (`AuthController.logout()` → `AuthService.forgetSession()`). `AuthService.resetPassword()` étend sa transaction existante (Story 15.1) pour invalider toutes les sessions actives du compte (`UserSession` + `Session` correspondantes) lors d'un reset réussi. 800/800 tests API, typecheck propre, redémarrage réel du conteneur confirmé, test manuel bout-en-bout réel (login/logout/reset via curl + Mailpit) validant les 4 AC. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 décisions tranchées avec l'utilisateur : (1) gestion d'erreur mixte sur `recordSession()`/`forgetSession()` — `recordSession()` reste fail-hard au login (garantit qu'une session "réussie" est toujours traçable), `forgetSession()` passe en best-effort au logout (`try/catch`, ne bloque jamais `session.destroy()`) ; (2) risque "sessions préexistantes au déploiement non invalidées par un reset" écarté après clarification — ce projet n'étant pas encore en production, cette story fera partie du code dès le premier déploiement réel, le trou ne peut donc jamais se matérialiser pour un vrai utilisateur. 2 patches appliqués : `try/catch` autour de `forgetSession()` dans `logout()` (+ test de non-régression) ; `UserSession.sid` passé en `@unique` (nouvelle migration `20260719113057_user_session_sid_unique`) et `recordSession()` passé de `create()` à `upsert()` pour rester idempotent en cas de retry. 3 items différés (voir `deferred-work.md`) : pas de TTL/purge sur `UserSession`, `onDelete: Cascade` ne nettoie pas la table `Session` de connect-pg-simple (aucune fonctionnalité de suppression de compte n'existe actuellement), `session.destroy()` avale les erreurs de callback (pré-existant, hors scope). 5 findings écartés comme bruit (cast `req.user`, `req.sessionID` non-null garanti par le middleware global, no-op `in: []` déjà testé, critique redondante, subtilité d'ordre déjà jugée sûre par l'auditeur). Suite finale : 801/801 tests API (42 suites), typecheck propre, redémarrage réel du conteneur confirmé, login/logout re-testés manuellement après patch (comportement inchangé). Statut passé à done.