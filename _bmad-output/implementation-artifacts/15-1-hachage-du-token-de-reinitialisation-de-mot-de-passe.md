---
baseline_commit: 20bbdfa4f7f7588bcef8963e86fbc3f9ebffc7a1
---

# Story 15.1: Hachage du token de réinitialisation de mot de passe

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que mon token de réinitialisation de mot de passe ne soit jamais stocké en clair,
so that une fuite de la base de données ne permette pas à quelqu'un de réinitialiser mon mot de passe à ma place.

## Acceptance Criteria

1. **Given** une demande de réinitialisation est créée (`POST /auth/forgot-password`) **When** le token est généré **Then** seule sa version hachée (`argon2`, `PasswordResetToken.tokenHash`) est stockée en base — jamais le token/secret en clair, ni dans la base ni dans les logs.
2. **Given** un utilisateur soumet un token de réinitialisation (`POST /auth/reset-password`) **When** le token est vérifié **Then** la comparaison se fait via `argon2.verify()`, cohérente avec le mécanisme déjà utilisé pour les mots de passe (`AuthService.validateUser`), jamais via une comparaison de chaîne en clair.
3. **Given** le flux complet « mot de passe oublié → réception du lien → soumission du nouveau mot de passe » déjà en production (Story 5.4) **When** cette story est appliquée **Then** aucune régression fonctionnelle : lien reçu par e-mail toujours valide, soumission réussie change bien `User.passwordHash`, token expiré/déjà utilisé/malformé toujours rejeté avec le même message d'erreur générique côté frontend — le frontend (`ResetPassword` component, route `/reset-password/:token`) n'a besoin d'aucune modification (il traite le token comme une chaîne opaque de bout en bout).

## Tasks / Subtasks

- [x] **Task 1 — `apps/api/prisma/schema.prisma` : renommer `PasswordResetToken.token` → `tokenHash` (AC1)**
  - Modèle actuel (lignes 122-133, cité intégralement dans les Dev Notes) : `token String @unique` → `tokenHash String @unique`. Aucun autre champ du modèle ne change (`id`, `userId`, `user`, `expiresAt`, `usedAt`, `createdAt`, `@@index([userId])` inchangés).
  - Migration : `docker compose exec api pnpm prisma migrate dev --name password_reset_token_hash` puis `docker compose exec api pnpm prisma generate` (convention établie, cf. Dev Notes — piège connu : si `tsc --noEmit` échoue avec « does not exist in type X » après la migration, relancer `prisma generate` explicitement).

- [x] **Task 2 — `AuthService.requestPasswordReset()` : génération et hachage du secret (AC1)**
  - Fichier : `apps/api/src/auth/auth.service.ts` (méthode actuelle lignes 77-93, citée intégralement dans les Dev Notes).
  - Remplacer le token en clair par un **secret** généré de la même façon qu'aujourd'hui (`randomBytes(32).toString('base64url')`), haché immédiatement via `argon2.hash(secret)` (mêmes options par défaut que `argon2.hash(dto.password)` déjà utilisé dans ce service — ne pas ajouter d'options `type`/`memoryCost`, cf. AD-4 « même bibliothèque, mêmes conventions »).
  - Stocker `tokenHash` (jamais le secret) via `this.prisma.passwordResetToken.create({...})`, récupérer l'`id` de la ligne créée (retourné par `create()`).
  - Construire le lien e-mail avec un **token composite** `${id}.${secret}` (au lieu du token brut actuel) : `link: \`${WEB_ORIGIN}/reset-password/${id}.${secret}\``. Le séparateur `.` est sûr car l'alphabet `base64url` (RFC 4648 §5) n'utilise jamais `.` (il substitue `+`/`/` par `-`/`_`) — aucune ambiguïté de split possible.
  - **Pourquoi un token composite (décision de conception explicite de cette story, non résolue par la Structural Seed de l'architecture)** : `argon2.verify()` ne peut pas servir de clé de recherche SQL — contrairement à l'ancien `where: { token }` (égalité de chaîne en clair), on ne peut pas retrouver une ligne par son hash sans le posséder déjà. Il faut donc un identifiant de recherche séparé du secret vérifié. Solution retenue : l'`id` (UUID) de la ligne `PasswordResetToken` sert de clé de recherche publique (exposée dans l'URL, sans risque — un UUID de ligne ne révèle ni l'utilisateur ni le mot de passe), le secret reste la seule donnée vérifiée par `argon2.verify()`. Pattern standard (Laravel signed tokens, etc.), pas une invention ad hoc.

- [x] **Task 3 — `AuthService.resetPassword()` : localisation par id + vérification du secret via `argon2.verify()` (AC2, AC3)**
  - Fichier : `apps/api/src/auth/auth.service.ts` (méthode actuelle lignes 101-121, citée intégralement dans les Dev Notes).
  - Parser le token composite reçu : split sur le **premier** `.` (`indexOf('.')`) en `id`/`secret`. Si absence de `.` ou l'une des deux parties vide → rejeter immédiatement avec le même `NotFoundException('Lien invalide ou expiré. Merci de refaire une demande.')` que les autres branches d'échec (pas de requête DB inutile pour un format manifestement invalide).
  - **Ordre des opérations important (à ne pas inverser)** : vérifier le secret via `argon2.verify(record.tokenHash, secret)` **avant** de marquer la ligne `usedAt` (claim atomique `updateMany`). Si l'ordre était inversé (claim d'abord, vérification ensuite), une simple tentative avec un mauvais secret sur un `id` valide brûlerait le token légitime de l'utilisateur réel, l'empêchant de réinitialiser son mot de passe avec le bon lien. Séquence : `findUnique({ where: { id } })` → si absent/`usedAt` déjà posé/`expiresAt` dépassé → `NotFoundException` → sinon `argon2.verify(record.tokenHash, secret)` (catch → `false`, même convention défensive que `validateUser`) → si invalide → `NotFoundException` → sinon `updateMany({ where: { id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })` comme garde anti-double-soumission concurrente (`count === 0` → `NotFoundException`, comportement déjà en place, à préserver) → `user.update({ passwordHash })`. Garder toute la séquence dans le `$transaction` existant (déjà en place, ne pas le retirer).
  - Le message d'erreur (`'Lien invalide ou expiré. Merci de refaire une demande.'`) reste identique sur toutes les branches d'échec (format invalide, id inconnu, secret invalide, expiré, déjà utilisé) — le frontend ne distingue pas ces cas (`reset-password.ts` catch générique), aucune fuite d'information sur la branche d'échec précise.
  - `ResetPasswordDto.token` (`apps/api/src/auth/dto/reset-password.dto.ts`) : **aucun changement de DTO nécessaire** — reste un `@IsString() @MinLength(1) @MaxLength(255)`, porte maintenant une chaîne composite mais la validation structurelle ne change pas (UUID 36 car. + `.` + secret base64url ~43 car. ≈ 80 car., largement sous 255).

- [x] **Task 4 — Tests (`apps/api/src/auth/auth.service.spec.ts`, AC1, AC2, AC3)**
  - Fichier existant, lu intégralement dans les Dev Notes — conventions déjà en place à réutiliser : `jest.mock('argon2')` en tête de fichier, mocks `(argon2.hash as jest.Mock)`/`(argon2.verify as jest.Mock)` par test, `prisma`/`tx` mockés comme objets simples (pas de `PrismaService` réel).
  - `requestPasswordReset` : adapter le test existant — asserter que `argon2.hash` est appelé avec le secret généré (pas directement testable en valeur puisque `randomBytes` est aléatoire ; asserter plutôt que `createArgs.data.tokenHash` est la valeur retournée par le mock `argon2.hash`, jamais égale au secret brut) ; asserter que le lien e-mail (`sendMail` 2ᵉ argument, propriété `link`) contient bien `${id}.${secret}` où `id` correspond à l'id retourné par le mock `create()` et `secret` est **différent** de `tokenHash`.
  - `resetPassword` — nouveaux cas à couvrir (aucun n'existait avant, la vérification par hash change entièrement la mécanique de test) :
    - Token composite valide (id connu, secret correct via `argon2.verify` mocké à `true`) → succès, `user.update` appelé avec le nouveau `passwordHash`.
    - Token sans `.` (format invalide) → `NotFoundException`, **aucun appel** à `prisma.passwordResetToken.findUnique`/`tx.*` (rejet avant toute requête DB).
    - `id` inconnu (`findUnique` → `null`) → `NotFoundException`.
    - Secret incorrect (`argon2.verify` mocké à `false`) → `NotFoundException`, **`updateMany` (claim) jamais appelé** — test explicite de la garde anti-brûlage décrite en Task 3 (c'est le cas que l'ancienne suite ne pouvait pas exprimer, la vérification n'existant pas avant).
    - Token déjà utilisé (`usedAt` non nul sur la ligne trouvée) → `NotFoundException` avant même d'appeler `argon2.verify` (pas la peine de vérifier un secret sur un token déjà consommé).
    - Token expiré (`expiresAt` dans le passé) → `NotFoundException`, même remarque.
  - Retirer/adapter les assertions obsolètes qui supposaient `where: { token }` (égalité de chaîne en clair) — remplacées par `where: { id }` puis vérification séparée du secret.

- [x] **Task 5 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite (pas seulement `auth.service.spec.ts` — `AuthController`/guards/e2e éventuels touchant l'auth à vérifier aussi).
  - `docker compose exec api pnpm typecheck` — propre (changement de nom de champ Prisma, cf. mémoire projet `jdr-api-typecheck-gap` : `ts-jest` ne type-check pas cross-fichier, ne pas se fier uniquement aux tests unitaires pour détecter un `token` résiduel oublié quelque part).
  - Redémarrage réel du conteneur `api` (`docker compose restart api` ou équivalent) pour confirmer que la migration s'applique proprement sur la base de dev locale et que Nest démarre sans erreur (convention déjà établie pour toute story touchant `schema.prisma`, cf. Stories 8.8/8.9/10.4).
  - Aucune modification `apps/web` attendue (AC3) — à confirmer par `git status`/diff en fin de story.

### Review Findings

- [x] [Review][Patch] `argon2.verify()`/`argon2.hash()` (CPU-bound, ~50-100ms chacun) exécutés à l'intérieur de la transaction Prisma ouverte — tient une connexion DB pendant tout le hachage au lieu de la seule partie SQL atomique, régression vs le code d'origine qui hachait hors transaction ; risque d'épuisement du pool de connexions sous requêtes concurrentes [`apps/api/src/auth/auth.service.ts` — `resetPassword()`] — corrigé : `findUnique`/`argon2.verify`/`argon2.hash` déplacés hors de la transaction, celle-ci ne couvre plus que le claim atomique + la mise à jour du mot de passe
- [x] [Review][Patch] Titres de test "avant toute vérification du secret" (cas `usedAt`/`expiresAt`) sans assertion vérifiant réellement que `argon2.verify` n'a pas été appelé — le code est correct, seul le titre du test surinterprète sa propre couverture [`apps/api/src/auth/auth.service.spec.ts`] — corrigé : assertion delta sur le nombre d'appels à `argon2.verify` ajoutée (immunisée contre l'accumulation inter-tests des mocks, ce projet n'a pas `clearMocks` dans sa config Jest)
- [x] [Review][Defer] Nouveau canal de timing dans `resetPassword` : un `id` inconnu échoue immédiatement (miss DB), un `id` connu avec un mauvais secret paie en plus le coût d'`argon2.verify` — distinguable par latence. Faible exploitabilité (l'`id` est un UUID non devinable, il faut déjà posséder le lien pour connaître un `id` valide) ; motif identique déjà accepté pour `validateUser` (AD-4 demande explicitement la cohérence avec ce mécanisme) [`apps/api/src/auth/auth.service.ts` — `resetPassword()`] — deferred, faible risque, cohérent avec un motif déjà accepté ailleurs
- [x] [Review][Defer] Migration `ALTER TABLE ... ADD COLUMN "tokenHash" TEXT NOT NULL` sans défaut — échouerait au déploiement si des lignes `PasswordResetToken` existent déjà (Postgres refuse une colonne `NOT NULL` sans défaut sur une table non vide) ; au mieux invaliderait silencieusement tout lien de reset en attente. Risque accepté pour ce projet actuellement pré-production (PRD : ouverture à plus d'utilisateurs prévue Paliers 9-10) — à traiter avant un vrai déploiement (backfill ou colonne nullable temporaire) [`apps/api/prisma/migrations/20260718223115_password_reset_token_hash/migration.sql`] — deferred, projet pas encore en production

## Dev Notes

### Architecture — décision contraignante AD-4 (`ARCHITECTURE-SPINE.md` du 2026-07-18)

> **AD-4 [ADOPTED]** : Le champ `PasswordResetToken.token` (actuellement stocké en clair, `String @unique`) devient `tokenHash` — haché via `argon2` au moment de la génération, comparé via `argon2.verify()` à la réception. Même bibliothèque, même service (`AuthService`) que le hachage des mots de passe — aucune nouvelle dépendance.

- **AD-9 (héritée)** : aucun nouveau module NestJS — tout vit dans `AuthModule` déjà existant (non déclenché, modification de fichiers existants uniquement).
- Cette story couvre **uniquement AD-4** (FR-10, hachage au repos). **AD-3** (invalidation de session, FR-11, modèle `UserSession`) et **AD-5** (purge `@Cron`, FR-14) sont hors scope — stories 15.2/15.4 séparées malgré le fait que l'architecture les regroupe dans le même fichier `auth.service.ts` en annotation de source tree. Ne pas anticiper `UserSession` dans cette story.

### Modèle Prisma cible (Structural Seed de la spine)

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique   // renommé depuis `token` (AD-4) — haché argon2, jamais en clair
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Modèle actuel (`apps/api/prisma/schema.prisma` lignes 122-133), pour référence exacte du diff attendu :

```prisma
/// Jeton de réinitialisation de mot de passe (self-service, Story 5.4). Usage unique, expire à +24h.
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

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/auth/auth.service.ts`** (123 lignes) — méthodes cibles :
  - `requestPasswordReset()` (lignes 77-93) :
    ```typescript
    async requestPasswordReset(email: string): Promise<{ ok: true }> {
      const user = await this.users.findByEmail(email);
      if (user) {
        const token = randomBytes(32).toString('base64url');
        await this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        await this.email.sendMail('password-reset', user.email, {
          link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/reset-password/${token}`,
        });
      }
      return { ok: true };
    }
    ```
  - `resetPassword()` (lignes 101-121) :
    ```typescript
    async resetPassword(token: string, newPassword: string): Promise<void> {
      const passwordHash = await argon2.hash(newPassword);
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.passwordResetToken.updateMany({
          where: { token, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new NotFoundException(
            'Lien invalide ou expiré. Merci de refaire une demande.',
          );
        }
        const reset = await tx.passwordResetToken.findUniqueOrThrow({
          where: { token },
        });
        await tx.user.update({
          where: { id: reset.userId },
          data: { passwordHash },
        });
      });
    }
    ```
    **Remarque** : cette implémentation actuelle hache le *nouveau* mot de passe en dehors de la transaction (ligne 1) puis claim/vérifie/update dedans. Le nouveau code doit vérifier le secret **avant** de hacher le nouveau mot de passe et avant de claim — voir Task 3 pour la séquence exacte, différente de l'ordre actuel.
  - Convention `argon2` déjà en place (`validateUser`, lignes 26-44) — **à reproduire à l'identique** : pas d'options personnalisées (`type`/`memoryCost`), `try { ok = await argon2.verify(hash, plain); } catch { return null/false; }` (un hash malformé ne doit jamais faire planter la requête).
  - Constante `RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000` (ligne 14) — inchangée par cette story.
- **`apps/api/src/auth/auth.controller.ts`** (55 lignes) — routes `POST /auth/forgot-password`/`POST /auth/reset-password`, déjà `@Throttle({ default: { ttl: 60_000, limit: 5 } })`, publiques (pas de guard) — **aucune modification attendue** dans ce fichier, la story reste interne à `AuthService`.
- **`apps/api/src/auth/dto/reset-password.dto.ts`** / **`request-password-reset.dto.ts`** — lus, confirmés inchangés (Task 3).
- **`apps/api/src/auth/auth.service.spec.ts`** (203 lignes) — conventions de mock détaillées en Task 4, à réutiliser à l'identique (ne pas réinventer une nouvelle façon de mocker Prisma/argon2 dans ce fichier).
- **`apps/web/src/app/features/auth/reset-password/reset-password.ts`** (62 lignes) — confirmé : lit `route.paramMap.get('token')` comme chaîne opaque unique, la transmet telle quelle à `AuthService.resetPassword(token, newPassword)`. **Aucune modification nécessaire** — le token composite `id.secret` reste un seul segment d'URL (`/reset-password/:token`, `app.routes.ts` ligne 18, inchangé).

### Project Structure Notes

- Fichiers modifiés : `apps/api/prisma/schema.prisma` (+ migration générée) ; `apps/api/src/auth/auth.service.ts` (+ test).
- Aucune modification `apps/web`, aucun nouveau module NestJS, aucune nouvelle dépendance (réutilise `argon2` déjà en place).

### Testing Standards

- `apps/api` : Jest, `apps/api/src/auth/auth.service.spec.ts` — étendre le fichier existant, conventions de mock déjà en place (Task 4).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — toujours lancer `pnpm typecheck` après le renommage `token` → `tokenHash`, un usage résiduel du nom de champ `token` ailleurs dans le code ne serait pas détecté par les tests seuls.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 262-281 — Epic 15 / Story 15.1 complète, FR10)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-4 — hachage du token, AD-9 — aucun nouveau module)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.3 FR-10 — protection du token de réinitialisation au repos ; note "Out of Scope" : canal de timing sur `requestPasswordReset` déjà accepté en Story 5.4, non repris ici)
- `_bmad-output/implementation-artifacts/5-4-mot-de-passe-oublie.md` (story d'origine du flux reset-password, Story 5.4 — comportement de référence pour la non-régression AC3)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Task 1 : `PasswordResetToken.token` renommé `tokenHash` dans `schema.prisma`. Migration créée manuellement (`prisma migrate dev` refuse de fonctionner en environnement non interactif dans ce conteneur) : SQL généré via `prisma migrate diff --from-config-datasource ... --to-schema ... --script` (rename traité comme `DROP COLUMN`/`ADD COLUMN`, Prisma ne détecte pas les renommages sans `@map`), écrit dans un dossier de migration nommé selon la convention du projet, appliqué via `prisma migrate deploy` (non-interactif) puis `prisma generate`.
- Task 2/3 : `requestPasswordReset()` génère un secret `base64url` haché via `argon2.hash()` (mêmes options par défaut que le hachage des mots de passe), stocke `tokenHash` (jamais le secret), construit le lien avec un token composite `${id}.${secret}`. `resetPassword()` parse le token composite (split sur le premier `.`), localise la ligne par `id`, vérifie le secret via `argon2.verify()` **avant** de réclamer atomiquement le token (`updateMany`) — ordre critique : vérifier après claim aurait brûlé le token légitime sur une simple tentative avec un mauvais secret. Message d'erreur générique unique extrait en constante (`RESET_TOKEN_INVALID_MESSAGE`), inchangé sur toutes les branches d'échec.
- Task 4 : `auth.service.spec.ts` — `requestPasswordReset` adapté (assertion sur `tokenHash` haché ≠ secret embarqué dans le lien) ; `resetPassword` entièrement réécrit avec 7 tests (token valide, format invalide sans `.`, id inconnu, secret incorrect avec garde anti-brûlage explicite, token déjà utilisé, token expiré, course concurrente sur le claim). Piège rencontré : les mocks `argon2` ne sont pas réinitialisés entre tests (pas de `clearMocks` dans la config Jest du projet) — assertions `not.toHaveBeenCalled()` sur `argon2.verify` remplacées par des assertions sur `tx.passwordResetToken.updateMany`/`tx.user.update` (mocks frais par test via `beforeEach`).
- Task 5 : 795/795 tests api (16/16 sur `auth.service.spec.ts`), `pnpm typecheck` propre, redémarrage réel du conteneur `api` confirmé (`Nest application successfully started`, migration appliquée sans intervention manuelle — "No pending migrations to apply"). Aucune modification `apps/web` (confirmé par `git status`).

### File List

- `apps/api/prisma/schema.prisma` (modifié)
- `apps/api/prisma/migrations/20260718223115_password_reset_token_hash/migration.sql` (nouveau)
- `apps/api/src/auth/auth.service.ts` (modifié)
- `apps/api/src/auth/auth.service.spec.ts` (modifié)

## Change Log

- 2026-07-19 : Implémentation complète (Tasks 1-5). `PasswordResetToken.token` → `tokenHash`, haché via `argon2` (AD-4). Token composite `${id}.${secret}` (le hash n'étant pas indexable, `id` sert de clé de recherche publique, `secret` est la seule donnée vérifiée par `argon2.verify()`). Frontend inchangé (chaîne opaque unique). 795/795 tests api, typecheck propre, redémarrage réel du conteneur confirmé. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 patches appliqués : (1) `argon2.verify`/`argon2.hash` (CPU-bound) sortis de la transaction Prisma — celle-ci ne couvre plus que le claim atomique du token + la mise à jour du mot de passe, évite de tenir une connexion DB pendant tout le hachage ; (2) titres de test corrigés avec une assertion delta réelle sur `argon2.verify`, au lieu d'un titre non vérifié. 2 items différés (voir `deferred-work.md`) : nouveau canal de timing sur l'existence de l'`id` (faible exploitabilité, motif déjà accepté pour `validateUser`) ; migration `NOT NULL` sans défaut (risque accepté, projet pré-production). Suite finale : 795/795 tests api (16/16 sur `auth.service.spec.ts`), typecheck propre, aucune régression. Statut passé à done.
