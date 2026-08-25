---
baseline_commit: b01a6b1bb3e7581ba7eb27c0a6f1a10f57bc4011
---

# Story 28.6: Changement d'e-mail à double canal

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want changer mon adresse e-mail sans risquer de perdre l'accès à mon compte,
so that une faute de frappe ou une usurpation reste rattrapable.

## Contexte

**Sixième et dernière story de l'épic 28** — elle clôt le palier « Compte et identité ». Elle introduit un flux à **deux canaux, deux jetons, deux fenêtres temporelles** :
1. **Demande** (authentifiée, mot de passe courant requis) → un lien de **confirmation** part vers la **nouvelle** adresse, un **avis** informatif part vers l'**ancienne** — l'adresse du compte ne change pas encore.
2. **Confirmation** (lien ouvert depuis la nouvelle adresse) → l'adresse change réellement, et un lien de **retour arrière** (rollback), valable **un mois**, part vers l'**ancienne** adresse.
3. **Retour arrière** (lien ouvert depuis l'ancienne adresse, si un tiers a changé l'adresse à l'insu du titulaire) → l'ancienne adresse est restaurée, **toutes** les sessions sont coupées, et une réinitialisation de mot de passe est **exigée avant toute reconnexion**.

### Découverte faite en préparant cette story — à connaître avant de coder

**`revokeSessions(tx, userId, exceptSid?)` existe déjà (Story 28.5) et doit être réutilisée telle quelle pour l'AC3** — aucune nouvelle logique de coupure de session à écrire. `apps/api/src/auth/auth.service.ts` :
```ts
async revokeSessions(tx: Prisma.TransactionClient, userId: string, exceptSid?: string): Promise<void> {
  const where = exceptSid !== undefined ? { userId, sid: { not: exceptSid } } : { userId };
  const activeSessions = await tx.userSession.findMany({ where, select: { sid: true } });
  const sids = activeSessions.map((s) => s.sid);
  await tx.session.deleteMany({ where: { sid: { in: sids } } });
  await tx.userSession.deleteMany({ where });
}
```
Le rollback l'appelle **sans** `exceptSid` (comme `resetPassword()`) — c'est un lien e-mail activé hors session, il n'y a pas de « session courante » à préserver.

**Deux nouveaux modèles Prisma, pas un seul avec un discriminant.** Vérifié : aucun modèle de type « token » de ce projet n'utilise de champ `type`/`purpose`/`kind` — `PasswordResetToken`, `InviteLink`, `Invitation` sont chacun un modèle dédié à son concern. Les deux jetons de cette story ont des colonnes et des TTL différents (la confirmation ne connaît que la nouvelle adresse ; le rollback doit mémoriser l'ancienne adresse pour pouvoir la restaurer, et vit un mois au lieu de 24h) — suivre le même style, ne pas introduire de polymorphisme qui n'existe nulle part ailleurs dans ce codebase.

**Aucun mécanisme de « compte contraint » n'existe encore.** Vérifié : `LocalStrategy`, `AuthenticatedGuard`, `SessionSerializer` ne portent aucune logique de ce type. Cette story introduit `User.mustResetPassword: Boolean @default(false)` et l'AC3 (« réinitialisation exigée avant toute reconnexion ») se fait respecter en un seul point : `LocalStrategy.validate()`, juste après `validateUser()` — si l'utilisateur authentifié porte `mustResetPassword: true`, la connexion est refusée avec un message dédié (« Une réinitialisation de mot de passe est requise. » — pas la même erreur générique qu'un mauvais mot de passe, pour orienter l'utilisateur vers `forgot-password`). Comme `AuthService.validateUser()` fait déjà `const { passwordHash, ...safe } = user;`, `mustResetPassword` traverse déjà cet objet sans rien à changer là — seul `LocalStrategy` gagne une vérification supplémentaire.

**Écart assumé par rapport à `requestPasswordReset()` : les jetons de confirmation d'e-mail précédents, non utilisés, sont invalidés à chaque nouvelle demande.** `requestPasswordReset()` ne le fait pas (plusieurs `PasswordResetToken` actifs peuvent coexister, seule la purge horaire les nettoie) — mais laisser vivre plusieurs `EmailChangeToken` pointant vers des `newEmail` différents est dangereux : un ancien lien encore valide pourrait faire aboutir le compte à une adresse que l'utilisateur ne veut plus. `requestEmailChange()` doit donc commencer par `updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } })` sur `EmailChangeToken` avant de créer le nouveau.

**Vérification explicite (pas silencieuse) que la nouvelle adresse n'est pas déjà prise.** Contrairement à `register()`/`requestPasswordReset()` (anti-énumération nécessaire car routes non authentifiées), `PATCH /me/email` est authentifiée et exige le mot de passe courant — l'anti-énumération n'a pas la même valeur ici. Vérifier via `UsersService.findByEmail(newEmail)` et lever un `ConflictException` clair si pris. **Cela n'élimine pas le besoin de gérer le P2002 au moment de la confirmation aussi** : l'adresse peut être prise par quelqu'un d'autre entre la demande et la confirmation (fenêtre potentiellement longue, jusqu'à 24h) — `confirmEmailChange()` doit catcher `P2002` sur `tx.user.update()` et répondre par un `ConflictException` distinct (« Cette adresse est désormais utilisée par un autre compte, refaites une demande. »), sans quoi une erreur Prisma brute remonterait en 500.

**Les routes publiques (confirmation, rollback) vivent dans `AuthController`, pas dans un nouveau contrôleur** — c'est exactement là que vivent déjà `forgot-password`/`reset-password` (routes non authentifiées, `@Throttle({ default: { ttl: 60_000, limit: 5 } })`, DTOs `class-validator`). `PATCH /me/email`, elle, vit dans `AccountController` (préfixe `/me`, authentifiée) mais **délègue toute la logique métier à `AuthService`** — même décision et même raison que `changePassword()` en story 28.5 : ce n'est pas une « préférence » lue/écrite, c'est une opération de sécurité qui partage sa logique (jetons, argon2, sessions) avec le reste de `AuthService`. `AccountController` reste une façade fine.

**Patron de token composite `id.secret` à répliquer à l'identique**, deux fois (confirmation et rollback) : `id` = clé Prisma publique, `secret` = 32 octets aléatoires en base64url jamais stockés en clair (seul `argon2.hash(secret)` va en `tokenHash`), vérification `argon2.verify` **avant** toute réclamation atomique (`updateMany` avec `usedAt: null, expiresAt: { gt: new Date() }`, `count === 0` → rejet), message d'erreur générique unique par type de jeton (aucune distinction expiré/utilisé/inconnu/malformé côté appelant — cf. `RESET_TOKEN_INVALID_MESSAGE`).

**Limitation par e-mail, même patron que `requestPasswordReset()`** (`EMAIL_RATE_LIMIT_WINDOW_MS = 1h`, `EMAIL_RATE_LIMIT_MAX = 5`) — compter les `EmailChangeToken` créés par l'utilisateur dans la fenêtre glissante avant d'en créer un nouveau, pour éviter le spam de deux boîtes mail (nouvelle + ancienne) en cas d'abus depuis une session compromise.

**4 nouveaux templates e-mail**, à ajouter à `EmailTemplate` (`apps/api/src/email/email-template.enum.ts`) et à `SUBJECTS` (`apps/api/src/email/email.service.ts`) :
- `email-change-confirm` (→ nouvelle adresse, à la demande) : lien de confirmation.
- `email-change-notice` (→ ancienne adresse, à la demande) : avis informatif, pas de lien, incite à agir si non désiré (contacter le support / rien à faire si volontaire).
- `email-change-rollback-available` (→ ancienne adresse, après confirmation réussie) : lien de retour arrière, valable un mois.
- `email-change-rolled-back` (→ adresse restaurée, après un rollback exécuté) : confirme la restauration, précise que toutes les sessions ont été coupées et qu'une réinitialisation de mot de passe est requise — même esprit que `password-changed.hbs` (notifier systématiquement d'un événement de sécurité), cohérent avec la convention déjà établie sur ce point. Ce 4ᵉ template n'est pas littéralement exigé par le texte des AC, mais complète le principe déjà appliqué partout ailleurs dans ce projet (`password-changed`, envoyé par les deux flux de changement de mot de passe) — ne pas le considérer comme du hors-scope.

**`process.env.WEB_ORIGIN ?? 'http://localhost:4200'` est le patron existant pour construire un lien e-mail** (`requestPasswordReset()`) — le réutiliser pour les 3 liens de cette story (confirmation, rollback, et implicitement le lien `forgot-password` mentionné dans `email-change-rolled-back`).

**Décision consciente, pas un oubli : le rollback écrase l'adresse courante par `oldEmail` sans vérifier qu'elle vaut toujours la `newEmail` posée à la confirmation.** Si l'adresse a été changée une troisième fois entre la confirmation et l'utilisation du rollback (fenêtre d'un mois), le rollback écrase quand même vers `oldEmail` — accepté comme risque résiduel à faible probabilité (cohérent avec la tolérance déjà actée ailleurs dans ce projet pour des fenêtres de course à faible probabilité, cf. `deferred-work.md`), pas un AC à couvrir explicitement.

## Acceptance Criteria

1. **Given** je demande un changement d'adresse, **When** je fournis mon mot de passe courant, **Then** un lien de confirmation part vers la **nouvelle** adresse, **and** un avis de demande part vers l'**ancienne**, **and** l'adresse du compte n'a pas encore changé.
2. **Given** j'ouvre le lien de confirmation reçu sur la nouvelle adresse, **When** je l'active, **Then** l'adresse du compte est remplacée, **and** un lien de retour arrière valable un mois part vers l'ancienne adresse.
3. **Given** un tiers a changé mon adresse à mon insu, **When** j'active le lien de retour arrière depuis mon ancienne boîte, **Then** mon ancienne adresse est restaurée, **and** toutes les sessions actives sont coupées, **and** une réinitialisation de mot de passe est exigée avant toute reconnexion.
4. **Given** un jeton expiré, déjà utilisé, ou inconnu, **When** il est présenté, **Then** il est refusé sans effet de bord.
5. **Given** une adresse mal saisie qui n'aboutit à personne, **When** le lien de confirmation n'est jamais ouvert, **Then** le compte conserve son adresse d'origine et reste accessible.

## Tasks / Subtasks

### Fondations partagées

- [x] Task 1 — Modèles Prisma + migration (AC: #1, #2, #3)
  - [x] `apps/api/prisma/schema.prisma` : `mustResetPassword Boolean @default(false)` ajouté sur `User`.
  - [x] Deux nouveaux modèles ajoutés, à côté de `PasswordResetToken` :
    ```prisma
    model EmailChangeToken {
      id        String    @id @default(uuid())
      userId    String
      user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
      newEmail  String
      tokenHash String    @unique
      expiresAt DateTime
      usedAt    DateTime?
      createdAt DateTime  @default(now())

      @@index([userId])
    }

    model EmailChangeRollbackToken {
      id        String    @id @default(uuid())
      userId    String
      user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
      oldEmail  String
      tokenHash String    @unique
      expiresAt DateTime
      usedAt    DateTime?
      createdAt DateTime  @default(now())

      @@index([userId])
    }
    ```
  - [x] Relations inverses ajoutées sur `User` (`emailChangeTokens`, `emailChangeRollbackTokens`), même style que `passwordResetTokens`.
  - [x] `prisma migrate dev` a refusé (dérive préexistante déjà rencontrée stories 15.1/28.4) — filet de secours appliqué : `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` + création manuelle du dossier de migration (`20260807033135_email_change_double_canal`) + `prisma migrate deploy`, `prisma generate`.
  - [x] `mustResetPassword` (défaut `false`) appliqué sans backfill particulier, migration propre sur la base de dev peuplée.

### Backend — demande, confirmation, retour arrière

- [x] Task 2 — `AuthService.requestEmailChange(userId, currentPassword, newEmail)` (AC: #1, #4, #5)
  - [x] Implémentée telle que décrite : `findUnique` → `argon2.verify` (401) → `newEmail === user.email` (409) → `findByEmail` (409 si pris) → limite de fréquence (silencieux `{ ok: true }`) → invalide les anciens tokens non utilisés → crée le nouveau token → envoie les 2 e-mails.
  - [x] `describe('requestEmailChange')` (6 tests) : succès, mot de passe incorrect, adresse identique, adresse déjà prise, limite de fréquence atteinte, compte introuvable.

- [x] Task 3 — `AuthService.confirmEmailChange(token)` (AC: #2, #4)
  - [x] Implémentée telle que décrite : parse `id.secret` → `findUnique` → `argon2.verify` → `$transaction` (réclamation atomique + `tx.user.update` + création `EmailChangeRollbackToken`, `oldEmail` lue avant l'update) → catch `P2002` → `ConflictException` → e-mail `email-change-rollback-available` hors transaction.
  - [x] `describe('confirmEmailChange')` (6 tests) : succès, token inconnu, déjà utilisé, expiré, secret incorrect, `P2002` catché → 409.

- [x] Task 4 — `AuthService.rollbackEmailChange(token)` (AC: #3, #4)
  - [x] Implémentée telle que décrite : validation du token → `$transaction` (réclamation atomique + `tx.user.update` avec `mustResetPassword: true` + `revokeSessions(tx, userId)` sans `exceptSid`) → e-mail `email-change-rolled-back` hors transaction.
  - [x] `describe('rollbackEmailChange')` (2 tests) : succès (assertions complètes), token invalide.

- [x] Task 5 — Blocage de connexion si `mustResetPassword` (AC: #3)
  - [x] `apps/api/src/auth/local.strategy.ts` : garde ajoutée après `validateUser()`, avant tout `req.login()`.
  - [x] `resetPassword()` remet `mustResetPassword: false` (assertion mise à jour dans le test `resetPassword` existant).
  - [x] Nouveau `apps/api/src/auth/local.strategy.spec.ts` (3 tests, piège ESM `jest.mock('@master-jdr/shared', ...)` rencontré et corrigé comme anticipé) : identifiants invalides, compte valide sans `mustResetPassword`, `mustResetPassword: true` → refus avec message dédié.

- [x] Task 6 — Endpoints REST (AC: #1, #2, #3, #4)
  - [x] `apps/api/src/account/dto/request-email-change.dto.ts` :
    ```ts
    import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

    export class RequestEmailChangeDto {
      @IsString()
      @MinLength(1)
      @MaxLength(128)
      currentPassword!: string;

      @IsEmail()
      @MaxLength(255)
      newEmail!: string;
    }
    ```
  - [x] `apps/api/src/auth/dto/confirm-email-change.dto.ts` et `rollback-email-change.dto.ts` : même forme, un seul champ `token` (`@IsString() @MinLength(1) @MaxLength(255)`), même bornes que `ResetPasswordDto.token`.
  - [x] `apps/api/src/account/account.controller.ts` : nouvelle route, même patron que `changePassword()` (délègue à `AuthService`, `req.user.id` jamais du corps) :
    ```ts
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Patch('email')
    requestEmailChange(@Req() req: Request, @Body() dto: RequestEmailChangeDto) {
      return this.auth.requestEmailChange(
        (req.user as { id: string }).id,
        dto.currentPassword,
        dto.newEmail,
      );
    }
    ```
  - [x] `apps/api/src/auth/auth.controller.ts` : deux nouvelles routes publiques, même patron que `forgot-password`/`reset-password` :
    ```ts
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Post('confirm-email-change')
    confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
      return this.auth.confirmEmailChange(dto.token);
    }

    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Post('rollback-email-change')
    rollbackEmailChange(@Body() dto: RollbackEmailChangeDto) {
      return this.auth.rollbackEmailChange(dto.token);
    }
    ```
  - [x] `apps/api/src/email/email-template.enum.ts` : 4 nouveaux templates ajoutés à l'union `EmailTemplate`.
  - [x] `apps/api/src/email/email.service.ts` : 4 entrées correspondantes ajoutées à `SUBJECTS`.
  - [x] 4 nouveaux fichiers `apps/api/src/email/templates/*.hbs` créés.
  - [x] Tests `account.controller.spec.ts` (+1 test unitaire `requestEmailChange`, +4 tests HTTP réels) et `auth.controller.spec.ts` (+2 tests unitaires pour les deux nouvelles routes publiques). Piège rencontré : `newEmail: 'new@b.c'` (utilisé partout ailleurs dans les tests unitaires) est rejeté par le `ValidationPipe` réel (`@IsEmail()` de `class-validator`, TLD à un seul caractère) — corrigé en utilisant `new@example.com` dans le seul test HTTP qui attend un succès (200).

### Frontend

- [x] Task 7 — `AccountService.requestEmailChange()` + formulaire sur l'écran de compte (AC: #1, #5)
  - [x] `apps/web/src/app/core/account/account.service.ts` : `requestEmailChange()` ajoutée, même patron exact que `changePassword()`.
  - [x] `apps/web/src/app/features/account/account.ts` : `emailForm`, trio de signaux `emailSaving`/`emailError`/`emailSaved`, `submitEmailChange()` — ne touche jamais `this.auth.currentUser`.
  - [x] `apps/web/src/app/features/account/account.html` : 3ᵉ `<form>` indépendant ajouté.
  - [x] `apps/web/src/app/core/theme/tones.ts` : 7 nouvelles clés `account.email_change_*`/`account.new_email_label`/`account.current_password_for_email_label` dans les **3 thèmes**.
  - [x] Tests `account.service.spec.ts` (+1 test) et `account.spec.ts` (+6 tests, describe dédié : succès, 401, générique, validation, `currentUser` jamais réécrit).

- [x] Task 8 — Pages publiques d'activation (AC: #2, #3, #4)
  - [x] `apps/web/src/app/features/auth/confirm-email-change/*` : bouton « Confirmer », pas de redirection automatique (l'utilisateur peut déjà être connecté ailleurs).
  - [x] `apps/web/src/app/features/auth/rollback-email-change/*` : bouton « Restaurer », redirige vers `/forgot-password` en cas de succès.
  - [x] `apps/web/src/app/core/auth/auth.service.ts` : `confirmEmailChange(token)`/`rollbackEmailChange(token)` ajoutées.
  - [x] `apps/web/src/app/app.routes.ts` : deux nouvelles routes publiques ajoutées.
  - [x] Tests dédiés (3 tests par composant + 2 tests `AuthService` web) : succès, jeton invalide → message générique, redirection.

### Suites et vérification

- [x] Task 9 — Suites complètes et vérification manuelle (AC: #1-5)
  - [x] `docker compose exec api pnpm test` — 50 suites, 988 tests, tout vert, aucune régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm test` — 82 fichiers, 1090 tests, tout vert.
  - [x] `docker compose exec web pnpm build` — dépassement de budget bundle confirmé pré-existant : 216.61 kB au-delà du budget error sur le commit de baseline (`b01a6b1`, avant cette story) vs 224.27 kB avec cette story, delta ≈ 7.7 kB cohérent avec l'ajout de 2 pages publiques + 1 formulaire, pas de régression significative.
  - [x] Conteneur `api` redémarré réellement (`docker compose restart api`), logs vérifiés jusqu'à `Nest application successfully started`, les 3 nouvelles routes confirmées mappées (`Mapped {/me/email, PATCH}`, `Mapped {/auth/confirm-email-change, POST}`, `Mapped {/auth/rollback-email-change, POST}`).
  - [x] Vérification manuelle bout-en-bout réelle (curl + psql, mailpit, compte `bob@example.com`) couvrant l'enchaînement complet : demande de changement (mot de passe incorrect → 401 ; mot de passe correct → 200, adresse inchangée en base ; nouvelle adresse déjà prise (`alice@example.com`) → 409) ; les 2 e-mails de demande reçus dans mailpit (avis → ancienne adresse, confirmation → nouvelle adresse) ; confirmation (token inconnu → 404 message générique ; token valide → adresse changée en base, `EmailChangeRollbackToken` créé, e-mail rollback reçu sur l'ancienne adresse ; token rejoué → refusé sans effet) ; deux sessions actives ouvertes (ancienne + nouvelle adresse) avant rollback ; rollback (token valide → adresse restaurée en base, `mustResetPassword: true`, les 3 sessions actives coupées — `UserSession` count passé à 0) ; tentative de connexion avec `mustResetPassword: true` → 401 avec le message dédié « Une réinitialisation de mot de passe est requise avant de vous reconnecter. » ; `forgot-password` + `reset-password` sur ce compte → `mustResetPassword` repasse à `false` en base, connexion de nouveau possible (201). Données de test nettoyées après coup : `mj-demo@example.com` avait un `mustResetPassword: true` résiduel d'un test manuel antérieur à cette session — remis à `false` ; `EmailChangeToken`/`EmailChangeRollbackToken` vidées ; `bob@example.com` déjà revenu à son état d'origine par le flux lui-même (aucune action requise).

### Review Findings

- [x] [Review][Patch] `RollbackEmailChange` redirige immédiatement vers `/forgot-password` sans confirmation visible — corrigé : état `restored()` + bouton « Continuer » avant redirection (patron `ConfirmEmailChange`), décision utilisateur validée. [apps/web/src/app/features/auth/rollback-email-change/rollback-email-change.ts]
- [x] [Review][Patch] `requestEmailChange()` : comparaison d'adresse (auto-vérification ET recherche d'unicité) sensible à la casse, pas de normalisation — corrigé : `normalizedNewEmail = newEmail.trim().toLowerCase()` (patron `invitations.service.ts`), utilisé pour les 2 vérifications et le stockage. [apps/api/src/auth/auth.service.ts]
- [x] [Review][Patch] Formatage `schema.prisma` désaligné sur les champs de relation de `User` — corrigé : `prisma format` exécuté. [apps/api/prisma/schema.prisma]
- [x] [Review][Patch] Frontend `submitEmailChange()` ne distingue pas le 409 (adresse déjà prise) du reste — corrigé : message dédié `account.email_change_taken` (nouvelle clé, 3 thèmes) pour le 409, distinct du 401 et du générique. [apps/web/src/app/features/account/account.ts]
- [x] [Review][Patch] `rollbackEmailChange()` : si l'utilisateur a été supprimé entre l'émission du jeton de rollback et son usage, `tx.user.update` sur un id inexistant lève un P2025 Prisma brut → 500 non intercepté — corrigé : catch P2025 → `NotFoundException` générique. [apps/api/src/auth/auth.service.ts]
- [x] [Review][Patch] `rollbackEmailChange()` : si `oldEmail` a été repris par un autre compte entre la confirmation et le rollback, la contrainte unique (P2002) sur `tx.user.update` n'est pas interceptée — corrigé : même patron `catch` que `confirmEmailChange()`, P2002 → `ConflictException`. [apps/api/src/auth/auth.service.ts]
- [x] [Review][Patch] `confirmEmailChange()` lit `oldEmail` via un `findUnique` séparé avant la transaction (TOCTOU) — corrigé : lecture déplacée à l'intérieur de la transaction, juste avant l'update. [apps/api/src/auth/auth.service.ts]
- [x] [Review][Defer] Effet de bord temporel (timing side-channel) entre « jeton inconnu » (404 rapide) et « secret invalide » (404 après `argon2.verify`) sur confirm/rollback [apps/api/src/auth/auth.service.ts] — déferré, motif préexistant identique à `resetPassword()`/`requestPasswordReset()`, pas introduit par ce diff.
- [x] [Review][Defer] `process.env.WEB_ORIGIN ?? 'http://localhost:4200'` dupliqué (désormais 3 occurrences), retombée silencieuse vers localhost en prod si mal configuré [apps/api/src/auth/auth.service.ts] — déferré, motif préexistant de `requestPasswordReset()`, réutilisé tel que demandé par la spec.
- [x] [Review][Defer] Validation DTO des tokens (`ConfirmEmailChangeDto`/`RollbackEmailChangeDto`) limitée à `MinLength`/`MaxLength`, la vérification structurelle réelle (position du séparateur) vit dans le service [apps/api/src/auth/dto/confirm-email-change.dto.ts, apps/api/src/auth/dto/rollback-email-change.dto.ts] — déferré, réplique exacte du motif établi par `ResetPasswordDto`.
- [x] [Review][Defer] `email-change-notice.hbs` invite la victime potentielle à « contactez-nous immédiatement » sans lien ni canal de contact concret [apps/api/src/email/templates/email-change-notice.hbs] — déferré, aucun mécanisme de support n'existe ailleurs dans le projet à référencer, hors périmètre de ce diff.
- [x] [Review][Defer] `ConfirmEmailChange` et `RollbackEmailChange` sont des composants quasi-dupliqués (fichiers `.scss` identiques) [apps/web/src/app/features/auth/confirm-email-change/, apps/web/src/app/features/auth/rollback-email-change/] — déferré, réplique le motif déjà établi par reset-password/forgot-password (une page par flux de jeton), pas une déviation.
- [x] [Review][Defer] Cast non vérifié `(req.user as { id: string }).id` dans `AccountController.requestEmailChange()` [apps/api/src/account/account.controller.ts] — déferré, identique au motif déjà utilisé par `changePassword()`/`updateDisplayName()` dans le même contrôleur, pas nouveau à ce diff.
- [x] [Review][Defer] `Validators.email` (Angular, permissif) côté front vs `@IsEmail()` (class-validator, strict) côté back [apps/web/src/app/features/account/account.ts] — déferré, écart déjà documenté dans la story elle-même (contournement appliqué dans les tests), motif préexistant sur d'autres formulaires du projet, retombe sur un message d'erreur générique fonctionnel.

## Dev Notes

### Previous Story Intelligence (28.5, statut `done`)

- **`revokeSessions(tx, userId, exceptSid?)` est directement réutilisable** — ne pas la réécrire, l'importer telle quelle depuis `AuthService`. Le rollback l'appelle sans `exceptSid`.
- **`ts-jest` ne type-check pas en cross-file** — lancer `pnpm typecheck` côté API séparément après tout changement de `schema.prisma` (deux nouveaux modèles + nouveau champ sur `User`).
- **`ng test` type-check réellement les `.spec.ts`** — aucune fixture `AuthUser` n'est affectée cette fois (`mustResetPassword` n'est pas exposé dans `AuthUser`/`@master-jdr/shared`, c'est un champ interne API uniquement — vérifier qu'aucun endpoint ne le fuite par erreur dans une réponse JSON, notamment `tx.user.update()` qui renvoie l'utilisateur complet : exclure `passwordHash` **et vérifier que `mustResetPassword` n'a pas besoin d'être caché** — il n'est pas sensible en soi, mais aucun endroit de la story ne doit le renvoyer sans raison).
- **Piège ESM/CJS `jest.mock('@master-jdr/shared', ...)`** — cette story ne touche à aucun import runtime de `@master-jdr/shared` ; si un nouveau spec touche transitivement un fichier qui importe déjà `THEMES` (comme `auth.service.ts`), le piège habituel peut resurgir — même correctif que toujours.
- Story 28.5 a établi le patron « route `PATCH /me/...` dans `AccountController`, logique déléguée à `AuthService` » pour toute opération de sécurité (pas une préférence) — cette story l'étend une troisième fois (`/me/email`), plus deux routes publiques dans `AuthController`.

### Ce qui doit continuer de fonctionner

- `resetPassword()` (flux mot de passe oublié existant) continue de couper **toutes** les sessions sans exception — inchangé, seul un `mustResetPassword: false` s'ajoute à son `data` de mise à jour.
- `changePassword()` (story 28.5) reste strictement inchangée.
- `AuthController.login()`/`logout()` restent inchangées — seule `LocalStrategy.validate()` gagne une garde supplémentaire, après le `validateUser()` existant.
- `AccountController.updateDisplayName()`/`updateTheme()`/`changePassword()` restent inchangées.
- `apps/web/src/app/features/auth/reset-password/*` (flux distinct) reste le gabarit à copier, pas à modifier.

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Coupure de sessions (AC3) | `AuthService.revokeSessions(tx, userId, exceptSid?)`, story 28.5 | Réécrire la logique de suppression `Session`/`UserSession` |
| Token composite `id.secret`, hash argon2, réclamation atomique | Patron exact de `requestPasswordReset()`/`resetPassword()` | Un format de token différent, ou un secret stocké en clair |
| Vérification mot de passe courant avant écriture | Patron exact de `changePassword()` (story 28.5) | Réimplémenter argon2.verify ailleurs |
| Endpoint `PATCH /me/...` orienté sécurité | Patron `AccountController` → délégation `AuthService`, id de session jamais du corps | Un nouveau contrôleur, ou la logique dans `AccountService` |
| Routes publiques d'activation de lien e-mail | Patron exact `AuthController.forgotPassword()`/`resetPassword()` (throttle, DTOs, pas de guard) | Un contrôleur séparé pour ces deux routes |
| Page frontend d'activation de lien par token dans l'URL | Gabarit `apps/web/src/app/features/auth/reset-password/` | Réinventer la lecture de route/gestion d'état |
| Formulaire compte avec ses propres signaux `saving`/`error`/`saved` | Patron établi par `displayName`/`password` dans `Account` (story 28.4/28.5) | Fusionner avec un formulaire existant |
| Envoi e-mail best-effort hors transaction | `EmailService.sendMail()`, ne relance jamais | Ajouter un `try/catch` inutile autour de `sendMail()` |

### Sécurité

- `PATCH /me/email` protégée par `AuthenticatedGuard` (niveau contrôleur) + mot de passe courant vérifié avant toute écriture.
- Les deux routes publiques (`confirm-email-change`, `rollback-email-change`) suivent le même throttle `5/min` que `reset-password`/`forgot-password`.
- Secret de jeton jamais stocké en clair (argon2), jamais renvoyé dans une réponse HTTP.
- `mustResetPassword` bloque la reconnexion **avant** que `req.user`/la session ne soit créée (dans `LocalStrategy.validate()`, en amont de `req.login()`) — un compte compromis puis restauré ne peut donc jamais obtenir de nouvelle session tant que le mot de passe n'a pas été changé.
- Le rollback coupe **toutes** les sessions sans exception (contrairement à `changePassword()`) — cohérent avec `resetPassword()`, un tiers a pu être à l'origine du changement initial.
- Anti-rejeu : réclamation atomique (`updateMany` + `count === 0` → rejet) identique au patron `resetPassword()`, sur les deux nouveaux types de jeton.

### Project Structure Notes

- **Modifiés (partagé)** : aucun — `mustResetPassword` n'est pas exposé dans `@master-jdr/shared`.
- **Modifiés (API)** : `apps/api/prisma/schema.prisma` (+2 modèles, +`User.mustResetPassword`, +migration), `apps/api/src/auth/auth.service.ts` (+`requestEmailChange`/`confirmEmailChange`/`rollbackEmailChange`, `resetPassword()` +`mustResetPassword: false`), `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/auth/local.strategy.ts` (+garde `mustResetPassword`), `apps/api/src/auth/auth.controller.ts` (+2 routes), `apps/api/src/auth/auth.controller.spec.ts`, `apps/api/src/account/account.controller.ts` (+`@Patch('email')`), `apps/api/src/account/account.controller.spec.ts`, `apps/api/src/email/email-template.enum.ts`, `apps/api/src/email/email.service.ts`.
- **Nouveau (API)** : `apps/api/src/account/dto/request-email-change.dto.ts`, `apps/api/src/auth/dto/confirm-email-change.dto.ts`, `apps/api/src/auth/dto/rollback-email-change.dto.ts`, 4 templates `.hbs`.
- **Modifiés (web)** : `apps/web/src/app/core/account/account.service.ts`, `apps/web/src/app/core/account/account.service.spec.ts`, `apps/web/src/app/core/auth/auth.service.ts` (+2 méthodes), `apps/web/src/app/core/auth/auth.service.spec.ts`, `apps/web/src/app/features/account/account.ts`/`.html`/`.spec.ts`, `apps/web/src/app/core/theme/tones.ts`, `apps/web/src/app/app.routes.ts`.
- **Nouveau (web)** : `apps/web/src/app/features/auth/confirm-email-change/*`, `apps/web/src/app/features/auth/rollback-email-change/*`.
- **Non touchés** : `AccountService` (API, garde ses deux seules méthodes `updateDisplayName`/`updateTheme`), `SessionSerializer`, `changePassword()`.

### Temps réel (checklist `docs/checklist.md`)

Aucun besoin de câblage SSE — le changement d'adresse e-mail est un événement strictement personnel et sensible, jamais diffusé (cohérent avec AD-14, déjà appliqué aux stories 28.4/28.5).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.6] — Acceptance Criteria d'origine (AC1-5, reprises telles quelles)
- [Source: apps/api/prisma/schema.prisma:15-39,129-139] — `User`, `PasswordResetToken`, modèles de référence
- [Source: apps/api/src/auth/auth.service.ts] — `requestPasswordReset()`/`resetPassword()` (patron token composite), `revokeSessions()` (story 28.5), `validateUser()`
- [Source: apps/api/src/auth/local.strategy.ts] — point d'insertion de la garde `mustResetPassword`
- [Source: apps/api/src/auth/auth.controller.ts] — patron exact `@Throttle`/routes publiques à répliquer
- [Source: apps/api/src/account/account.controller.ts, account.module.ts] — patron `PATCH /me/...` délégué à `AuthService` (story 28.5)
- [Source: apps/api/src/email/email.service.ts, email-template.enum.ts, templates/password-reset.hbs, password-changed.hbs, invitation.hbs] — patron exact des templates et de `sendMail()`
- [Source: apps/api/src/users/users.service.ts] — `findByEmail()` réutilisable
- [Source: apps/web/src/app/features/auth/reset-password/*] — gabarit exact pour les 2 nouvelles pages publiques d'activation
- [Source: apps/web/src/app/features/account/account.ts, account.html] — patron exact des formulaires `displayName`/`password` (stories 28.1/28.5) à répliquer pour l'e-mail
- [Source: apps/web/src/app/core/theme/tones.ts] — clés `account.*` existantes dans les 3 thèmes, patron à étendre
- [Source: apps/web/src/app/app.routes.ts] — patron de route `reset-password/:token`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec api pnpm test` → 50 suites, 988 tests, PASS.
- `docker compose exec api pnpm typecheck` → propre.
- `docker compose exec web pnpm test` → 82 fichiers, 1090 tests, PASS.
- `docker compose exec web pnpm build` → erreur budget bundle pré-existante (216.61 kB de dépassement sur baseline `b01a6b1`, 224.27 kB avec cette story) ; delta ≈ 7.7 kB, non significatif.
- Redémarrage `api` : `Nest application successfully started`, 3 nouvelles routes mappées.
- Vérification manuelle (curl + psql + mailpit, compte `bob@example.com`) : demande (401/200/409), 2 e-mails reçus, confirmation (404 token inconnu, 200 token valide, rejeu refusé), 2 sessions actives puis rollback (adresse restaurée, `mustResetPassword: true`, sessions coupées à 0), connexion refusée avec message dédié, `forgot-password`/`reset-password` lève le blocage, reconnexion OK.

### Completion Notes List

- Tasks 1-8 étaient déjà complétées avant cette session (reprise d'une story `in-progress`) ; cette session a exécuté uniquement la Task 9 (suites complètes + vérification manuelle bout-en-bout).
- Nettoyage effectué : `mj-demo@example.com` avait un `mustResetPassword: true` résiduel d'un test manuel antérieur à cette session (non lié à cette exécution) — remis à `false` ; `EmailChangeToken`/`EmailChangeRollbackToken` de test vidées.
- Aucune régression détectée sur les suites existantes ni sur le typecheck.
- Revue de code (`bmad-code-review`, 3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor) : 0 violation d'AC (Acceptance Auditor clean), 7 patchs appliqués (normalisation de casse `requestEmailChange()`, formatage `schema.prisma`, distinction 409 côté frontend, gestion P2025/P2002 sur `rollbackEmailChange()`, fermeture de la fenêtre TOCTOU sur `oldEmail` dans `confirmEmailChange()`, confirmation visible avant redirection sur `RollbackEmailChange`), 7 items déferrés dans `deferred-work.md` (motifs préexistants ou hors périmètre), 1 finding dismissé (conséquence directe et documentée d'un choix assumé de la spec sur l'anti-énumération). Suites re-exécutées après application des patchs : API 993 tests (50 suites), Web 1092 tests (82 fichiers), typecheck propre.

### File List

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260807033135_email_change_double_canal/`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/local.strategy.ts`
- `apps/api/src/auth/local.strategy.spec.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.controller.spec.ts`
- `apps/api/src/auth/dto/confirm-email-change.dto.ts`
- `apps/api/src/auth/dto/rollback-email-change.dto.ts`
- `apps/api/src/account/account.controller.ts`
- `apps/api/src/account/account.controller.spec.ts`
- `apps/api/src/account/dto/request-email-change.dto.ts`
- `apps/api/src/email/email-template.enum.ts`
- `apps/api/src/email/email.service.ts`
- `apps/api/src/email/templates/email-change-confirm.hbs`
- `apps/api/src/email/templates/email-change-notice.hbs`
- `apps/api/src/email/templates/email-change-rollback-available.hbs`
- `apps/api/src/email/templates/email-change-rolled-back.hbs`
- `apps/web/src/app/core/account/account.service.ts`
- `apps/web/src/app/core/account/account.service.spec.ts`
- `apps/web/src/app/core/auth/auth.service.ts`
- `apps/web/src/app/core/auth/auth.service.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/account/account.ts`
- `apps/web/src/app/features/account/account.html`
- `apps/web/src/app/features/account/account.spec.ts`
- `apps/web/src/app/features/auth/confirm-email-change/`
- `apps/web/src/app/features/auth/rollback-email-change/`
- `apps/web/src/app/app.routes.ts`
