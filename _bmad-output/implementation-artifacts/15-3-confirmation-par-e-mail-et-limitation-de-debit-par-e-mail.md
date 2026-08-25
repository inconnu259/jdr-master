---
baseline_commit: b34b8900a4bde8ce74c09f7c0f71139a48e42fed
---

# Story 15.3: Confirmation par e-mail et limitation de débit par e-mail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want être informé par e-mail après un changement de mot de passe, et que les tentatives répétées ciblant mon adresse soient limitées même depuis des IP différentes,
so that je sois alerté d'un changement que je n'ai pas initié, et protégé contre un harcèlement de demandes de reset.

## Acceptance Criteria

1. **Given** mon mot de passe est réinitialisé avec succès (`AuthService.resetPassword()`) **When** l'opération se termine **Then** un e-mail de confirmation m'est envoyé, de façon best-effort (un échec d'envoi ne bloque jamais le reset — cohérent avec le reste de l'infra e-mail du projet, `EmailService.sendMail()` ne relance jamais et retourne `{ ok: false }` plutôt que de lever).
2. **Given** des tentatives répétées de `POST /auth/forgot-password` ciblent la **même adresse e-mail**, y compris **depuis des IP différentes** (contournant le rate-limit IP existant, `@Throttle({ ttl: 60_000, limit: 5 })`) **When** un seuil de limitation par e-mail est atteint **Then** les tentatives supplémentaires pour cette adresse sont limitées (aucun nouveau token créé, aucun e-mail envoyé), tout en conservant le comportement anti-énumération existant (`{ ok: true }` renvoyé dans tous les cas — jamais de signal distinguant "email inconnu" de "email connu mais throttlé").
3. **Given** le flux complet « mot de passe oublié → réception du lien → soumission du nouveau mot de passe » déjà en production (Stories 5.4, 15.1, 15.2) **When** cette story est appliquée **Then** aucune régression : le reset réussit toujours normalement pour un utilisateur qui ne dépasse pas le seuil, l'e-mail de reset (`password-reset`) est toujours envoyé normalement, l'invalidation de session (Story 15.2) reste inchangée.

## Tasks / Subtasks

- [x] **Task 1 — Nouveau template e-mail `password-changed` (AC1)**
  - `apps/api/src/email/email-template.enum.ts` (7 lignes actuelles, citées intégralement dans les Dev Notes) : ajouter `'password-changed'` à l'union `EmailTemplate`.
  - `apps/api/src/email/email.service.ts` (42 lignes actuelles) : ajouter une entrée dans la constante `SUBJECTS` (ligne 7-12) : `'password-changed': 'Votre mot de passe a été modifié'`.
  - Nouveau fichier `apps/api/src/email/templates/password-changed.hbs`, même style que `password-reset.hbs` (1 ligne, cité intégralement dans les Dev Notes) — contenu informatif, **aucun lien** (rien à cliquer, juste une alerte) :
    ```html
    <p>Le mot de passe de votre compte vient d'être modifié.</p>
    <p>Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.</p>
    ```
  - Aucune donnée de contexte (`data`) nécessaire pour ce template — `sendMail('password-changed', email, {})`.
  - **Aucune nouvelle dépendance, aucune modification de `email.module.ts`** : le `HandlebarsAdapter` charge déjà tous les fichiers `.hbs` de `templates/` dynamiquement (`dir: join(__dirname, 'templates')`), un nouveau fichier suffit.

- [x] **Task 2 — `AuthService.resetPassword()` : envoi de l'e-mail de confirmation après succès (AC1, AC3)**
  - Fichier : `apps/api/src/auth/auth.service.ts` (189 lignes actuelles, méthode `resetPassword()` lignes 136-188, citée intégralement dans les Dev Notes).
  - `tx.user.update({...})` (ligne 172-175) **renvoie déjà l'utilisateur mis à jour** (comportement standard Prisma `update()`) — capturer ce retour dans une variable (`const updatedUser = await tx.user.update({...})`) au lieu de l'`await` sans capture actuel, pour récupérer `updatedUser.email` **sans requête supplémentaire**.
  - Après la fin de la transaction (`await this.prisma.$transaction(...)`, donc **hors** transaction — cohérent avec la convention déjà établie par cette méthode de garder les opérations I/O externes/lentes hors de la portée transactionnelle, cf. `argon2.hash`/`argon2.verify` déjà sortis en Story 15.1), appeler :
    ```typescript
    await this.email.sendMail('password-changed', updatedUser.email, {});
    ```
  - `updatedUser` doit être extrait du callback de transaction vers l'extérieur (le callback passé à `$transaction` doit `return updatedUser;` à la fin, et `resetPassword()` capture ce retour : `const updatedUser = await this.prisma.$transaction(async (tx) => { ...; return updatedUser; });`).
  - **Pas de `try/catch` nécessaire autour de `sendMail()`** : `EmailService.sendMail()` (cf. Dev Notes, code cité intégralement) ne relance jamais une exception — un échec d'envoi SMTP est déjà intercepté en interne et transformé en `{ ok: false }` avec un log d'erreur. Le simple fait d'`await`er l'appel après la transaction (donc après que le mot de passe a déjà été changé avec succès) suffit à garantir AC1/AC3 : un échec d'e-mail ne peut pas faire échouer un reset déjà committé en base.

- [x] **Task 3 — `AuthService.requestPasswordReset()` : limitation de débit par e-mail (AC2)**
  - Fichier : `apps/api/src/auth/auth.service.ts` (méthode `requestPasswordReset()` lignes 101-121 actuelles, citée intégralement dans les Dev Notes).
  - **Aucune nouvelle table/migration** : réutiliser `PasswordResetToken` (déjà indexé `@@index([userId])`, cf. `schema.prisma` lignes 123-158) — compter les lignes créées récemment pour cet utilisateur plutôt que de les tracker ailleurs.
  - Nouvelles constantes en tête de fichier, à côté de `RESET_TOKEN_TTL_MS` (ligne 14) :
    ```typescript
    const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1h — fenêtre glissante de limitation par e-mail (FR-13)
    const EMAIL_RATE_LIMIT_MAX = 5; // même valeur que le throttle IP existant (5/60s), fenêtre différente
    ```
    **Ces valeurs ne sont dictées par aucun AC** — choix de conception documenté ici, ajustable sans impact structurel si le seuil s'avère trop strict/laxiste en usage réel.
  - Dans `requestPasswordReset()`, **à l'intérieur du bloc `if (user)`** (ligne 103), **avant** la génération du secret/la création du token :
    ```typescript
    const recentCount = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - EMAIL_RATE_LIMIT_WINDOW_MS) },
      },
    });
    if (recentCount >= EMAIL_RATE_LIMIT_MAX) {
      return { ok: true };
    }
    ```
  - **Pourquoi un `return` anticipé à l'intérieur du `if (user)` plutôt qu'une exception ou un code HTTP différent** : préserve intégralement le comportement anti-énumération déjà en place (AC1 de la Story 5.4/15.1 — la réponse `{ ok: true }` ne doit **jamais** distinguer "email inconnu", "email connu, e-mail envoyé" et "email connu, throttlé"). Un `429 Too Many Requests` ou une réponse différente fuiterait l'information "cette adresse existe et vous avez déjà fait plusieurs demandes".
  - **Ne compte PAS** les tentatives pour un e-mail inconnu (`user` est `null`, la branche entière est sautée comme aujourd'hui) — FR-13 ne s'applique qu'à un compte réel ciblé, cohérent avec le libellé "tentatives répétées de reset visant la même adresse e-mail".
  - La requête `count()` réutilise l'index `@@index([userId])` déjà existant — aucune migration nécessaire.

- [x] **Task 4 — Tests (`apps/api/src/auth/auth.service.spec.ts`, AC1, AC2, AC3)**
  - Fichier existant (voir Dev Notes pour les lignes exactes des tests `requestPasswordReset`/`resetPassword` actuels, conventions de mock à reproduire à l'identique).
  - Ajouter au mock `prisma.passwordResetToken` : `count: jest.fn()` (à côté de `create`/`findUnique` déjà présents). Dans `beforeEach`, initialiser `prisma.passwordResetToken.count.mockResolvedValue(0)` par défaut (sinon `undefined >= 5` est `false` en JS donc le test passerait accidentellement même sans mock — préférer un défaut explicite `0` pour la clarté).
  - Ajouter au mock `tx.user` : `update: jest.fn()` — **déjà présent** (`tx.user.update: jest.fn()`, cf. mock existant), mais il faut maintenant lui faire retourner un objet utilisateur complet avec `email` dans le test de succès de `resetPassword` (actuellement le mock ne définit pas de valeur de retour explicite pour `tx.user.update`, donc `undefined` — à corriger : `tx.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.c', pseudo: 'alice', role: 'USER', createdAt: new Date(), passwordHash: 'NEW_HASH' })` dans le test "token composite valide").
  - **`requestPasswordReset`** — nouveaux cas :
    - `recentCount` sous le seuil (`count.mockResolvedValue(4)`) → token créé et e-mail envoyé normalement (comportement inchangé, à vérifier avec le mock désormais explicite).
    - `recentCount` au seuil ou au-delà (`count.mockResolvedValue(5)`) → **aucun** appel à `prisma.passwordResetToken.create`, **aucun** appel à `email.sendMail`, résultat `{ ok: true }` malgré tout (même assertion de forme que le cas "email inconnu" existant, AC2).
    - Vérifier que `prisma.passwordResetToken.count` est appelé avec `{ where: { userId: 'u1', createdAt: { gt: expect.any(Date) } } }`.
    - **Ne pas** appeler `count()` quand l'email est inconnu (`users.findByEmail` → `null`) — étendre l'assertion du test existant "e-mail sans compte correspondant" avec `expect(prisma.passwordResetToken.count).not.toHaveBeenCalled()`.
  - **`resetPassword`** — étendre le test "token composite valide" (voir Dev Notes pour la ligne exacte) : après avoir mocké `tx.user.update` pour retourner l'utilisateur complet (voir ci-dessus), asserter `expect(email.sendMail).toHaveBeenCalledWith('password-changed', 'a@b.c', {})`.
  - **Ne pas** dupliquer les tests d'échec de `resetPassword` déjà couverts (format invalide, id inconnu, secret incorrect, déjà utilisé, expiré, course concurrente) — l'envoi de l'e-mail de confirmation n'est atteint que sur le chemin de succès, ces tests existants n'ont besoin d'aucune modification.

- [x] **Task 5 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api.
  - `docker compose exec api pnpm typecheck` — propre (cf. mémoire projet `jdr-api-typecheck-gap` : `ts-jest` ne type-check pas cross-fichier).
  - **Aucune migration Prisma dans cette story** — `schema.prisma` n'est pas modifié, pas de redémarrage de conteneur strictement requis pour une migration, mais `docker compose restart api` reste recommandé pour valider que Nest démarre proprement avec le nouveau template chargé par `HandlebarsAdapter`.
  - Test manuel réel recommandé (cohérent avec la convention établie en Stories 15.1/15.2, Mailpit accessible sur `http://localhost:8025`) : déclencher un reset complet (`forgot-password` → email reçu → `reset-password`) et vérifier dans Mailpit qu'un **second** e-mail "Votre mot de passe a été modifié" (`password-changed`) est bien reçu juste après le reset ; puis déclencher 6 `forgot-password` de suite pour la même adresse et vérifier qu'au 6ᵉ appel, aucun nouvel e-mail `password-reset` n'apparaît dans Mailpit (mais la réponse HTTP reste `{ ok: true }`).
  - Aucune modification `apps/web` attendue (AC3) — à confirmer par `git status`/diff en fin de story.

### Review Findings

- [x] [Review][Defer] Course concurrente (TOCTOU) entre `count()` et `create()` dans `requestPasswordReset()` — les deux appels ne sont pas dans une transaction ; deux requêtes simultanées pour la même adresse peuvent toutes deux lire `recentCount < 5` avant qu'aucune n'ait créé de token, permettant de dépasser le plafond de 5/heure si l'attaquant envoie des requêtes en parallèle (exactement le scénario visé par FR-13 — "depuis des IP différentes"). [`apps/api/src/auth/auth.service.ts` — `requestPasswordReset()`] — deferred, risque accepté (décision utilisateur) : conséquence limitée (quelques e-mails en plus, pas un contournement d'authentification), cohérent avec d'autres races déjà acceptées dans ce projet (`PollService.create()`/`choose()`) ; une transaction stricte serait disproportionnée pour un simple garde-fou anti-abus
- [x] [Review][Defer] `count()` inclut les tokens déjà utilisés/expirés dans le calcul du quota — la clause `where` ne filtre que sur `userId`/`createdAt`, pas sur `usedAt`. Un utilisateur qui a déjà réussi un reset dans l'heure voit son propre token réussi compter contre son quota pour le reste de l'heure (jugé "choix de conception ambigu, pas une déviation claire" par l'Acceptance Auditor — aucun AC ne tranche ce point). [`apps/api/src/auth/auth.service.ts` — `requestPasswordReset()`] — deferred, comportement gardé tel quel (décision utilisateur) : FR-13 vise à limiter les tentatives (réussies ou non), pas seulement les tentatives non abouties ; exclure les tokens utilisés affaiblirait la garantie sans bénéfice réel pour l'utilisateur légitime
- [x] [Review][Dismiss] Sémantique de `EMAIL_RATE_LIMIT_MAX = 5` — finding initial inexact : `recentCount` vaut 0,1,2,3,4 aux 5 premières requêtes (chacune `< 5`, donc créée), et n'atteint `5` qu'à la 6ᵉ tentative (bloquée). `MAX = 5` autorise donc bien exactement 5 requêtes réussies par fenêtre glissante, comme son nom l'indique — confirmé par le test manuel réel de la Task 5 (5 tokens existants, 6ᵉ appel silencieusement bloqué). Aucun changement de code nécessaire.

## Dev Notes

### Architecture — FR-12/FR-13 (`ARCHITECTURE-SPINE.md` Palier 6, 2026-07-18)

Cette story n'a **aucune décision d'architecture dédiée** (contrairement aux Stories 15.1/15.2 qui suivaient AD-4/AD-3) :

> Capability → Architecture Map : **FR-12, FR-13 (e-mail confirmation, rate-limit) | `AuthModule`, `EmailModule` existant | Extensions directes de l'infra déjà en place, aucune décision structurelle**

Concrètement : réutiliser `EmailService`/`EmailModule` tels quels pour AC1 (nouveau template, pas de nouveau module) et réutiliser `PasswordResetToken` (déjà en place, déjà indexé) pour AC2 plutôt que d'introduire une nouvelle table de compteurs ou une dépendance externe (ex. Redis) — cohérent avec **AD-9 hérité** ("aucun nouveau module NestJS pour ce palier").

- **AD-4** (hachage du token, Story 15.1) et **AD-3** (invalidation de session, Story 15.2) sont **déjà livrées** — cette story ne les modifie pas, elle ajoute uniquement l'envoi d'un e-mail et un comptage en plus du flux existant.
- **AD-5** (purge `@Cron` des tokens expirés, FR-14) reste **hors scope** — Story 15.4 séparée. Ne pas anticiper de job planifié dans cette story ; le comptage de rate-limit (Task 3) fonctionne indépendamment de la purge (compte tous les tokens récents, expirés ou non).

### Pourquoi un comptage `PasswordResetToken` plutôt qu'un throttler dédié

`@nestjs/throttler` (déjà utilisé pour le rate-limit IP sur cette même route, `@Throttle({ ttl: 60_000, limit: 5 })`) trace par défaut sur l'IP de la requête (`req.ip`), pas sur un champ du corps de la requête — il n'existe pas de mécanisme standard pour throttler par `email` sans écrire un `ThrottlerGuard` personnalisé (nouvelle classe, nouveau tracker). Compter les lignes `PasswordResetToken` déjà créées pour l'utilisateur dans une fenêtre glissante est strictement équivalent fonctionnellement, ne demande aucune nouvelle classe/dépendance, et réutilise une table qui existe déjà avec l'index nécessaire (`@@index([userId])`) — cohérent avec la note d'architecture "extension directe de l'infra déjà en place".

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/auth/auth.service.ts`** (189 lignes actuelles) :
  - `requestPasswordReset()` (lignes 101-121) :
    ```typescript
    async requestPasswordReset(email: string): Promise<{ ok: true }> {
      const user = await this.users.findByEmail(email);
      if (user) {
        const secret = randomBytes(32).toString('base64url');
        const tokenHash = await argon2.hash(secret);
        const created = await this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        await this.email.sendMail('password-reset', user.email, {
          link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/reset-password/${created.id}.${secret}`,
        });
      }
      return { ok: true };
    }
    ```
  - `resetPassword()` (lignes 136-188) — bloc transaction actuel (lignes 163-187) :
    ```typescript
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new NotFoundException(RESET_TOKEN_INVALID_MESSAGE);
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      // Invalidation des sessions actives (AD-3, FR-11) : ...
      const activeSessions = await tx.userSession.findMany({
        where: { userId: record.userId },
        select: { sid: true },
      });
      const sids = activeSessions.map((s) => s.sid);
      await tx.session.deleteMany({ where: { sid: { in: sids } } });
      await tx.userSession.deleteMany({ where: { userId: record.userId } });
    });
    ```
    **Remarque critique** : le retour de `tx.user.update(...)` n'est actuellement pas capturé (`await tx.user.update({...});` seul). Il faut le capturer (`const updatedUser = await tx.user.update({...});`) ET faire en sorte que le callback de la transaction retourne `updatedUser`, ET que `resetPassword()` capture le retour de `this.prisma.$transaction(...)` pour pouvoir envoyer l'e-mail de confirmation après coup avec la bonne adresse.
- **`apps/api/src/email/email-template.enum.ts`** (7 lignes, cité intégralement) :
  ```typescript
  export type EmailTemplate =
    | 'invitation'
    | 'session-reminder'
    | 'password-reset'
    | 'level-up';
  ```
- **`apps/api/src/email/email.service.ts`** (42 lignes, cité intégralement) — `SUBJECTS` (lignes 7-12) et `sendMail()` (lignes 21-41, cf. commentaire ligne 20 : "Ne relance jamais : un échec d'envoi est loggé (NFR) et signalé via `{ ok: false }`, jamais une exception").
- **`apps/api/src/email/templates/password-reset.hbs`** (1 ligne, cité intégralement) — modèle à suivre pour `password-changed.hbs` (Task 1) : `<p>Vous avez demandé la réinitialisation de votre mot de passe.</p><p><a href="{{link}}">Choisir un nouveau mot de passe</a></p><p>Ce lien expire dans 24h et ne peut être utilisé qu'une seule fois.</p>`.
- **`apps/api/src/email/email.module.ts`** (66 lignes) — confirme que `HandlebarsAdapter` charge dynamiquement tout fichier `.hbs` du dossier `templates/` (`dir: join(__dirname, 'templates')`) — **aucune modification de ce fichier nécessaire** pour ajouter un template.
- **`apps/api/prisma/schema.prisma`** — modèle `PasswordResetToken` (lignes 123-133, inchangé par cette story) :
  ```prisma
  model PasswordResetToken {
    id        String    @id @default(uuid())
    userId    String
    user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
    tokenHash String    @unique
    expiresAt DateTime
    usedAt    DateTime?
    createdAt DateTime  @default(now())

    @@index([userId])
  }
  ```
- **`apps/api/src/auth/auth.controller.ts`** — routes `forgot-password`/`reset-password` déjà `@Throttle({ default: { ttl: 60_000, limit: 5 } })`, publiques (pas de guard) — **aucune modification attendue** dans ce fichier, la story reste interne à `AuthService`/`EmailModule`.
- **`apps/api/src/auth/auth.service.spec.ts`** (état actuel après Story 15.2, ~300 lignes) :
  - `describe('requestPasswordReset', ...)` : lignes 144-180 (2 tests actuels — "e-mail correspondant à un compte", "e-mail sans compte correspondant").
  - `describe('resetPassword', ...)` : test "token composite valide" (le premier de ce describe) — mock `tx.user.update: jest.fn()` déjà déclaré (sans valeur de retour par défaut) dans le `tx` partagé du `beforeEach`.
  - Conventions de mock détaillées en Task 4, à réutiliser à l'identique (pas de `Test.createTestingModule`, mocks manuels).

### Project Structure Notes

- Fichiers modifiés : `apps/api/src/email/email-template.enum.ts` ; `apps/api/src/email/email.service.ts` ; `apps/api/src/auth/auth.service.ts` ; `apps/api/src/auth/auth.service.spec.ts`.
- Fichier nouveau : `apps/api/src/email/templates/password-changed.hbs`.
- Aucune modification `apps/web`, aucun nouveau module NestJS, aucune nouvelle dépendance, **aucune migration Prisma**.

### Testing Standards

- `apps/api` : Jest, `apps/api/src/auth/auth.service.spec.ts` — étendre le fichier existant, conventions de mock déjà en place (Task 4).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — toujours lancer `pnpm typecheck` après l'ajout de `'password-changed'` à l'union `EmailTemplate` (un `SUBJECTS` non mis à jour serait une erreur de type détectée par `tsc`, pas par les tests unitaires seuls si le test ne couvre pas ce chemin).
- Pas de suite e2e touchant `auth`/`email` dans ce projet — le test manuel réel via Mailpit (Task 5) reste la seule vérification bout-en-bout.

### Previous Story Intelligence (Story 15.2)

- **Mocks Prisma manuels** (`tx`/`prisma` en objets simples typés, pas de `PrismaService` réel ni `Test.createTestingModule`) — convention à respecter scrupuleusement, déjà établie sur 3 stories consécutives (15.1, 15.2, 15.3).
- **`tx.user.update` sans valeur de retour explicite** était acceptable tant que rien ne consommait son retour — ce n'est plus le cas ici (Task 2 en dépend directement), d'où la nécessité de corriger le mock dans le test existant (Task 4).
- Revue de code Story 15.2 : décision utilisateur notable — privilégier un comportement **best-effort** (ne jamais bloquer une opération principale pour une opération secondaire de type notification/tracking) plutôt qu'un comportement fail-hard partout. Cette story suit le même principe pour l'envoi de l'e-mail de confirmation (Task 2) : `EmailService.sendMail()` ne relance déjà jamais, donc aucun `try/catch` supplémentaire n'est nécessaire, mais l'intention reste la même.
- Piège de migration rencontré à 2 reprises (15.1, 15.2) : `prisma migrate dev` refuse l'environnement non interactif de ce conteneur — **non applicable à cette story** (aucune migration).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 302-317 — Epic 15 / Story 15.3 complète, FR12/FR13)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (ligne 231 — Capability Map FR-12/FR-13, "extensions directes, aucune décision structurelle" ; AD-9 hérité)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR-12 — confirmation par e-mail ; §FR-13 — limitation de débit par e-mail)
- `_bmad-output/implementation-artifacts/15-1-hachage-du-token-de-reinitialisation-de-mot-de-passe.md` (convention argon2/transaction existante, mocks `tx`/`prisma`)
- `_bmad-output/implementation-artifacts/15-2-invalidation-des-sessions-actives-au-reset-de-mot-de-passe.md` (story précédente — transaction `resetPassword()` à étendre une fois de plus avec le retour de `tx.user.update()`, décision "best-effort" reprise ici pour l'e-mail)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Test manuel réel effectué via `curl` + Mailpit API + `psql` (pas d'outil browser disponible dans cette session) : `forgot-password` → e-mail `password-reset` reçu → token extrait → `reset-password` → e-mail `password-changed` reçu juste après (AC1 confirmée par observation directe dans Mailpit, sujet "Votre mot de passe a été modifié").
- Rate-limit par e-mail (AC2) : au moment du test manuel, 5 `PasswordResetToken` existaient déjà pour le compte admin dans la dernière heure (cumul des tests manuels des Stories 15.1/15.2/15.3) — donc déjà au seuil. Après une pause de 60s (fenêtre du throttle IP existant, distincte de la fenêtre e-mail 1h), un appel `forgot-password` supplémentaire a été déclenché : réponse HTTP `{ ok: true }` inchangée, mais `SELECT count(*) FROM "PasswordResetToken" ... WHERE createdAt > now() - interval '1 hour'` est resté à `5` avant/après (aucun nouveau token), et le nombre de messages Mailpit est resté à `6` avant/après (aucun nouvel e-mail `password-reset`) — confirme que le throttle silencieux fonctionne sans fuite d'information (toujours `{ ok: true }`, jamais de `429` ni de réponse distincte).
- Mot de passe admin modifié 2 fois pendant les tests manuels (`temp-story153-pw` puis restauration) ; comme le rate-limit par e-mail était déjà atteint pour ce compte au moment de la restauration, le cycle `forgot-password`/`reset-password` habituel (déjà utilisé en Stories 15.1/15.2) était indisponible — mot de passe restauré directement via `UPDATE "User" SET "passwordHash" = ...` avec un hash argon2 calculé dans le conteneur `api` (`argon2.hash('change-me-admin')`), pas de modification de code impliquée, uniquement une opération de nettoyage de l'environnement de dev partagé.

### Completion Notes List

- Task 1 : `'password-changed'` ajouté à l'union `EmailTemplate` (`email-template.enum.ts`), entrée `SUBJECTS['password-changed'] = 'Votre mot de passe a été modifié'` (`email.service.ts`), nouveau fichier `templates/password-changed.hbs` (contenu informatif, aucun lien). Aucune modification de `email.module.ts` (chargement dynamique déjà en place).
- Task 2 : `resetPassword()` capture désormais le retour de `tx.user.update()` (`const updated = await tx.user.update(...)`, `return updated;` en fin de callback de transaction) et le retour de `this.prisma.$transaction(...)` (`const updatedUser = await ...`). Après la transaction (hors scope transactionnel), `await this.email.sendMail('password-changed', updatedUser.email, {})` — aucun `try/catch` nécessaire, `EmailService.sendMail()` ne relance jamais.
- Task 3 : constantes `EMAIL_RATE_LIMIT_WINDOW_MS` (1h) et `EMAIL_RATE_LIMIT_MAX` (5) ajoutées en tête de `auth.service.ts`. Dans `requestPasswordReset()`, à l'intérieur du bloc `if (user)` et avant la génération du secret : `prisma.passwordResetToken.count()` sur une fenêtre glissante ; si le seuil est atteint, `return { ok: true };` immédiat (aucun token créé, aucun e-mail envoyé, comportement anti-énumération identique au cas "email inconnu").
- Task 4 : `auth.service.spec.ts` étendu — mocks `prisma.passwordResetToken.count` (défaut `0`) et `tx.user.update` (défaut : utilisateur complet avec `email`) ajoutés aux conventions existantes ; 2 nouveaux tests `requestPasswordReset` (sous le seuil / seuil atteint) ; assertion `count` ajoutée au test existant "e-mail correspondant à un compte" et à "e-mail sans compte correspondant" (jamais appelé si email inconnu) ; assertion `email.sendMail('password-changed', ...)` ajoutée au test `resetPassword` "token composite valide".
- Task 5 : 803/803 tests API (42 suites, +2 vs Story 15.2), `pnpm typecheck` propre, redémarrage réel du conteneur `api` confirmé ("Nest application successfully started", nouveau template `.hbs` chargé sans erreur). Test manuel bout-en-bout réel effectué (voir Debug Log References) confirmant AC1/AC2/AC3. Aucune modification `apps/web` (confirmé par `git status`), aucune migration Prisma (confirmé — `schema.prisma` inchangé).

### File List

- `apps/api/src/email/email-template.enum.ts` (modifié)
- `apps/api/src/email/email.service.ts` (modifié)
- `apps/api/src/email/templates/password-changed.hbs` (nouveau)
- `apps/api/src/auth/auth.service.ts` (modifié)
- `apps/api/src/auth/auth.service.spec.ts` (modifié)

## Change Log

- 2026-07-19 : Implémentation complète (Tasks 1-5). Nouveau template e-mail `password-changed` envoyé de façon best-effort après un reset réussi (FR-12) — `resetPassword()` capture désormais le retour de `tx.user.update()` pour connaître l'adresse sans requête supplémentaire. Limitation de débit par e-mail (FR-13) via comptage `PasswordResetToken.count()` sur une fenêtre glissante d'1h (max 5), réutilisant l'index déjà existant — aucune nouvelle table/dépendance/migration, comportement anti-énumération préservé (`{ ok: true }` dans tous les cas). 803/803 tests API, typecheck propre, redémarrage réel du conteneur confirmé, test manuel bout-en-bout réel (curl + Mailpit + psql) validant les 3 AC, y compris l'observation directe du rate-limit silencieux en base et dans Mailpit. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 décisions tranchées avec l'utilisateur, toutes deux "garder tel quel" : (1) course concurrente (TOCTOU) entre `count()` et `create()` acceptée comme risque best-effort, cohérente avec d'autres races déjà acceptées dans ce projet — une transaction stricte serait disproportionnée pour un simple garde-fou anti-abus ; (2) `count()` compte aussi les tokens déjà utilisés dans le quota horaire — comportement volontaire, FR-13 vise à limiter les tentatives (réussies ou non), pas seulement les tentatives non abouties. 0 patch appliqué : le seul finding "patch" (sémantique de `EMAIL_RATE_LIMIT_MAX`) s'est révélé, après revérification du code, être un faux positif — `MAX = 5` autorise bien exactement 5 requêtes réussies par fenêtre glissante (confirmé par le test manuel de la Task 5), aucun changement nécessaire. 2 items différés (voir `deferred-work.md`), reste écarté. Suite finale inchangée : 803/803 tests API, typecheck propre. Statut passé à done.
