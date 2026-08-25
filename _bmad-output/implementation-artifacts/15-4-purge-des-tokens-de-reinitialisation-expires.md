---
baseline_commit: 6eff15155581772ca09ebb1b6ca63b937c8a2be2
---

# Story 15.4: Purge des tokens de réinitialisation expirés

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du projet,
I want que les tokens de réinitialisation expirés soient automatiquement supprimés,
so that la table `PasswordResetToken` ne grossisse pas indéfiniment.

## Acceptance Criteria

1. **Given** des lignes `PasswordResetToken` dont `expiresAt` est dépassé (utilisées ou non) **When** le job planifié s'exécute **Then** ces lignes sont supprimées de la base.
2. **Given** des lignes `PasswordResetToken` dont `expiresAt` n'est **pas** encore dépassé **When** le job planifié s'exécute **Then** ces lignes ne sont **pas** supprimées (qu'elles soient déjà utilisées ou non — seul `expiresAt` détermine l'éligibilité, cohérent avec le libellé de l'AC epics : "des tokens dont `expiresAt` est dépassé").
3. **Given** le job planifié tourne en continu dans le conteneur `api` **When** l'application redémarre **Then** le job est bien enregistré et s'exécute selon le pattern `@Cron` déjà en place ailleurs dans le projet (`NotificationsService.sendDueReminders`, `@Cron(CronExpression.EVERY_HOUR)`).

## Tasks / Subtasks

- [x] **Task 1 — `AuthService` : méthode `@Cron`-décorée de purge (AC1, AC2, AC3)**
  - Fichier : `apps/api/src/auth/auth.service.ts` (211 lignes actuelles).
  - Importer `Cron`, `CronExpression` depuis `@nestjs/schedule` (déjà une dépendance du projet — voir `apps/api/src/notifications/notifications.service.ts` ligne 2 pour l'import exact) et `Logger` depuis `@nestjs/common` (déjà importé partiellement — `ConflictException`/`Injectable`/`NotFoundException` sont déjà importés depuis `@nestjs/common`, ajouter `Logger` au même import groupé).
  - Ajouter un champ privé `private readonly logger = new Logger(AuthService.name);` (convention déjà en place dans `NotificationsService`, `EquipmentPdfService`, etc. — voir Dev Notes).
  - Nouvelle méthode publique, décorée `@Cron(CronExpression.EVERY_HOUR)`, **même cadence que `NotificationsService.sendDueReminders`** (AD-5 le demande explicitement — "même pattern") :
    ```typescript
    @Cron(CronExpression.EVERY_HOUR)
    async purgeExpiredResetTokens(): Promise<void> {
      const { count } = await this.prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (count > 0) {
        this.logger.log(`${count} PasswordResetToken(s) expiré(s) purgé(s)`);
      }
    }
    ```
  - **Un seul prédicat : `expiresAt < now`** — ne PAS filtrer sur `usedAt` (un token déjà utilisé mais pas encore expiré doit être conservé jusqu'à son expiration naturelle, cohérent avec AC2 ; l'AC epics ne parle que d'`expiresAt`, jamais de `usedAt`). Un token utilisé ET expiré est purgé comme n'importe quel token expiré — aucune distinction nécessaire dans la requête.
  - **Pas de garde `isRunning` (contrairement à `NotificationsService.sendDueReminders`)** — cette dernière boucle sur potentiellement de nombreuses parties/destinataires avec un `await this.email.sendMail(...)` par itération, ce qui peut prendre du temps et créer un risque réel de double-envoi si deux exécutions se chevauchent. Ici, `deleteMany()` est un unique appel DB atomique et idempotent (supprimer deux fois la même ligne expirée ne produit aucun effet de bord distinct) — aucun risque de chevauchement à garder.
  - **Aucune nouvelle migration nécessaire** : la requête filtre sur `expiresAt`, colonne déjà existante (non indexée, mais la table `PasswordResetToken` reste de très petite taille dans ce projet — pas de besoin de nouvel index pour un job horaire, cohérent avec le scope minimal de cette story). Ne pas ajouter d'index non demandé par l'AC.
  - **Aucune modification de `auth.module.ts`** : `ScheduleModule.forRoot()` est déjà enregistré globalement dans `apps/api/src/app.module.ts` (ligne 26) — tout provider Nest peut utiliser `@Cron` sans import supplémentaire, exactement comme `NotificationsService` le fait déjà sans que son module n'importe `ScheduleModule`.

- [x] **Task 2 — Tests (`apps/api/src/auth/auth.service.spec.ts`, AC1, AC2, AC3)**
  - Fichier existant, conventions de mock déjà en place (mocks manuels `prisma`/`tx`, pas de `Test.createTestingModule`, pas de test du déclenchement réel du `@Cron` — appeler directement la méthode, exactement comme `notifications.service.spec.ts` teste `sendDueReminders()` en l'appelant directement sans simuler le scheduler, voir Dev Notes).
  - Ajouter au mock `prisma.passwordResetToken` : `deleteMany: jest.fn()` (à côté de `create`/`findUnique`/`count` déjà présents).
  - Nouveau bloc `describe('purgeExpiredResetTokens', ...)` avec 3 tests :
    - Tokens expirés existants (`deleteMany` mocké pour renvoyer `{ count: 3 }`) → `prisma.passwordResetToken.deleteMany` appelé avec `{ where: { expiresAt: { lt: expect.any(Date) } } }`.
    - Aucun token expiré (`deleteMany` renvoie `{ count: 0 }`) → la méthode se résout sans erreur (`resolves.toBeUndefined()`), pas d'assertion sur le logging nécessaire (comportement best-effort/silencieux acceptable).
    - Ne pas tester `usedAt` séparément dans ce fichier — la requête ne le référence jamais, il n'y a rien à mocker de plus pour AC2 : un seul test suffit à documenter que le filtre est bien `expiresAt` seul (vérifié par l'assertion `toHaveBeenCalledWith` ci-dessus, qui échouerait si un futur changement ajoutait `usedAt` au `where`).

- [x] **Task 3 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api.
  - `docker compose exec api pnpm typecheck` — propre.
  - **Aucune migration Prisma dans cette story** — `schema.prisma` n'est pas modifié.
  - Redémarrage réel du conteneur `api` (`docker compose restart api`) pour confirmer que Nest démarre proprement avec le nouveau job planifié enregistré (pas de log d'erreur au démarrage lié à `@Cron`).
  - Test manuel réel recommandé (cohérent avec la convention établie en Stories 15.1/15.2/15.3) : créer manuellement une ligne `PasswordResetToken` avec un `expiresAt` déjà dans le passé (via `psql`, ex. `UPDATE "PasswordResetToken" SET "expiresAt" = now() - interval '1 day' WHERE id = '...'` sur un token existant issu d'un `forgot-password` de test), puis appeler la méthode de purge directement en conteneur (ex. petit script `ts-node` inline, ou attendre le déclenchement horaire réel si le temps le permet) et vérifier via `psql` que la ligne a bien disparu. Un token non expiré créé dans le même test ne doit pas être supprimé.
  - Aucune modification `apps/web` attendue — à confirmer par `git status`/diff en fin de story.

### Review Findings

- [x] [Review][Defer] Aucun `try/catch` autour de `deleteMany()` dans `purgeExpiredResetTokens()` — si l'appel Prisma échoue (erreur DB transitoire), l'exception remonte non gérée hors du gestionnaire `@Cron`, sans passer par le `Logger` de l'app. [`apps/api/src/auth/auth.service.ts` — `purgeExpiredResetTokens()`] — deferred, pré-existant : `NotificationsService.sendDueReminders()` (le pattern `@Cron` de référence explicitement suivi par cette story) n'a lui non plus aucun `catch` autour de ses appels DB/e-mail — seul un `finally` y réinitialise `isRunning`. Cette story reproduit fidèlement un pattern déjà établi dans le projet, pas une régression introduite ici.
- [x] [Review][Defer] `deleteMany()` sans limite de lot (`batching`) — un backlog important de tokens expirés accumulés (purge indisponible un temps, pic de resets) pourrait produire un `DELETE` non borné, avec un risque de timeout ou de verrou long sur la table. [`apps/api/src/auth/auth.service.ts` — `purgeExpiredResetTokens()`] — deferred, risque théorique à faible probabilité actuellement : la story documente déjà explicitement que la table `PasswordResetToken` reste de petite taille dans ce projet (pas de besoin d'index non plus), et la purge tourne toutes les heures — pas d'accumulation significative possible en usage normal.

## Dev Notes

### Architecture — décision contraignante AD-5 (`ARCHITECTURE-SPINE.md` Palier 6, 2026-07-18)

> **AD-5 [ADOPTED]** : Nouvelle méthode `@Cron`-décorée dans `AuthService` (ou un service dédié si `AuthService` devient trop chargé — détail d'implémentation), qui supprime les `PasswordResetToken` dont `expiresAt` est dépassé. Même bibliothèque (`@nestjs/schedule`, déjà une dépendance du projet), pas de nouvelle infra de planification.

- **Prevents** : un nouveau mécanisme de planification alors qu'un existe déjà et fonctionne en production (`NotificationsService.sendDueReminders`, `@Cron(CronExpression.EVERY_HOUR)`).
- **Choix retenu pour cette story : `AuthService`** (pas de service dédié) — cohérent avec les Stories 15.1/15.2/15.3 qui ont toutes ajouté leur logique dans `AuthService` sans jamais créer de nouveau service ; `AuthService` reste à une taille raisonnable (211 lignes avant cette story) et toute la logique `PasswordResetToken` (création, vérification, maintenant purge) reste au même endroit — cohérent avec **AD-9 hérité** ("aucun nouveau module NestJS pour ce palier").
- Cette story est la **dernière de l'Epic 15** — après son implémentation, `epic-15` peut passer à `done` dans `sprint-status.yaml` (à vérifier/faire en fin de story, aucune autre story `15-*` ne reste en `backlog`).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/notifications/notifications.service.ts`** — pattern `@Cron` de référence explicitement demandé par AD-5 :
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { Cron, CronExpression } from '@nestjs/schedule';
  // ...
  @Injectable()
  export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private isRunning = false; // garde de non-chevauchement — PAS nécessaire ici (cf. Task 1)

    constructor(
      private readonly prisma: PrismaService,
      private readonly email: EmailService,
    ) {}

    @Cron(CronExpression.EVERY_HOUR)
    async sendDueReminders(): Promise<void> {
      if (this.isRunning) {
        this.logger.warn('sendDueReminders ignoré : une exécution précédente est encore en cours');
        return;
      }
      this.isRunning = true;
      try {
        await this.processDueReminders();
      } finally {
        this.isRunning = false;
      }
    }
  }
  ```
  La garde `isRunning` protège contre un double-envoi d'e-mails lors d'un chevauchement (boucle longue, un `await` par destinataire). `purgeExpiredResetTokens()` n'a **pas** ce risque : un seul `deleteMany()` atomique, aucune boucle, aucun effet de bord non idempotent — ne pas copier la garde `isRunning` sans raison, ce serait de la complexité non justifiée par le besoin réel (cf. `AuthService`, principe déjà appliqué en Story 15.2 : `forgetSession()` utilise `deleteMany` précisément pour son idempotence).
- **`apps/api/src/notifications/notifications.service.spec.ts`** — confirme le style de test pour une méthode `@Cron` : on appelle directement `await service.sendDueReminders()` dans le test, on n'essaie jamais de déclencher réellement le scheduler NestJS (`@nestjs/schedule`) dans les tests unitaires. Reproduire ce style à l'identique pour `purgeExpiredResetTokens()`.
- **`apps/api/src/app.module.ts`** (49 lignes) — confirme `ScheduleModule.forRoot()` déjà importé globalement (ligne 27) : `NotificationsModule` lui-même n'a besoin d'aucun import supplémentaire pour que `@Cron` fonctionne dans ses providers, donc `AuthModule` non plus.
- **`apps/api/src/auth/auth.service.ts`** (211 lignes actuelles, cité intégralement dans les stories précédentes de cet epic) — `import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';` (lignes 1-5) à étendre avec `Logger`. Aucune autre méthode de ce fichier n'est modifiée par cette story — uniquement un ajout, en fin de classe ou à proximité des autres méthodes liées à `PasswordResetToken` (`requestPasswordReset`, `resetPassword`).
- **`apps/api/prisma/schema.prisma`** — modèle `PasswordResetToken` (inchangé par cette story, déjà cité intégralement dans les Dev Notes de la Story 15.1) :
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

### Project Structure Notes

- Fichier modifié : `apps/api/src/auth/auth.service.ts` (+ test étendu).
- Aucun fichier nouveau, aucune migration Prisma, aucune nouvelle dépendance, aucune modification `apps/web`, aucun nouveau module NestJS.

### Testing Standards

- `apps/api` : Jest, `apps/api/src/auth/auth.service.spec.ts` — étendre le fichier existant.
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après l'ajout de l'import `Logger`/`Cron`/`CronExpression`.
- Pas de suite e2e touchant `auth` dans ce projet — le test manuel réel via `psql` (Task 3) reste la seule vérification bout-en-bout du comportement de purge réel (le test unitaire ne vérifie que l'appel Prisma avec les bons arguments, pas le comportement SQL réel de `expiresAt < now`).

### Previous Story Intelligence (Story 15.3)

- Convention de mock Prisma manuelle (objets simples typés, pas de `PrismaService` réel ni `Test.createTestingModule`) — respectée sur 4 stories consécutives (15.1 à 15.4), à reproduire à l'identique.
- Revue de code Story 15.3 : un finding "faux positif" a été retiré après re-vérification manuelle du code plutôt que d'être corrigé aveuglément — rappel que la revue de code de cette story devra elle aussi être vérifiée avec soin, pas suivie mécaniquement.
- Story 15.3 n'a touché aucune migration — cette story non plus, la routine de déploiement pour cet epic reste simple (redémarrage du conteneur suffit).

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 318-328 — Epic 15 / Story 15.4 complète, FR14)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-5 — purge planifiée, AD-9 hérité — aucun nouveau module)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§FR-14 — purge des tokens de réinitialisation expirés)
- `_bmad-output/implementation-artifacts/15-1-hachage-du-token-de-reinitialisation-de-mot-de-passe.md` (modèle `PasswordResetToken` cité intégralement, convention de mock)
- `_bmad-output/implementation-artifacts/15-3-confirmation-par-e-mail-et-limitation-de-debit-par-e-mail.md` (story précédente — dernières modifications de `auth.service.ts`/`auth.service.spec.ts` à connaître avant d'éditer ces fichiers)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

- Test manuel réel effectué via `psql` + script `node` inline dans le conteneur `api` (pas d'outil browser disponible dans cette session, et un job `@Cron(EVERY_HOUR)` n'est pas raisonnablement attendable en temps réel) : 7 `PasswordResetToken` existants en base (issus des tests manuels des Stories 15.1/15.2/15.3) → 1 passé manuellement en `expiresAt` dans le passé via `UPDATE`, 6 laissés non expirés (dont 1 déjà `usedAt` non nul) → appel direct de la même requête Prisma que `purgeExpiredResetTokens()` (`deleteMany({ where: { expiresAt: { lt: new Date() } } })`) via un script `node` inline dans le conteneur → `{ count: 1 }` renvoyé → vérification `psql` : le token expiré a disparu, les 6 autres (utilisés ou non, tous non expirés) sont intacts. Confirme AC1 et AC2 sur des données réelles, pas seulement des mocks.
- Le `@Cron(CronExpression.EVERY_HOUR)` lui-même n'a pas été observé se déclencher en temps réel (aurait nécessité d'attendre jusqu'à 1h) — la logique métier exécutée par le job a été validée directement (voir ci-dessus), et l'enregistrement correct du job par Nest au démarrage a été confirmé par l'absence de toute erreur au redémarrage du conteneur (AC3).

### Completion Notes List

- Task 1 : `Logger`, `Cron`, `CronExpression` importés dans `auth.service.ts` (`Logger` ajouté au groupe d'imports `@nestjs/common` existant, `Cron`/`CronExpression` nouveau import `@nestjs/schedule`). Champ `private readonly logger = new Logger(AuthService.name)` ajouté. Nouvelle méthode `purgeExpiredResetTokens()` décorée `@Cron(CronExpression.EVERY_HOUR)` en fin de classe : un seul `deleteMany({ where: { expiresAt: { lt: new Date() } } })`, log conditionnel (`count > 0`) du nombre de lignes purgées. Aucune garde `isRunning` (non nécessaire, `deleteMany` est atomique et idempotent). Aucune modification de `auth.module.ts` (`ScheduleModule.forRoot()` déjà global).
- Task 2 : `auth.service.spec.ts` étendu — mock `prisma.passwordResetToken.deleteMany` ajouté ; nouveau bloc `describe('purgeExpiredResetTokens', ...)` avec 2 tests (suppression effective avec assertion sur le `where` exact, cas sans token expiré résolvant sans erreur). Style identique à `notifications.service.spec.ts` (appel direct de la méthode, pas de simulation du scheduler NestJS).
- Task 3 : 805/805 tests API (42 suites), `pnpm typecheck` propre, redémarrage réel du conteneur `api` confirmé ("Nest application successfully started", aucune erreur liée au nouveau job planifié). Test manuel bout-en-bout réel effectué (voir Debug Log References) confirmant AC1/AC2/AC3 sur des données réelles en base. Aucune modification `apps/web`, aucune migration Prisma (confirmé par `git status` — seuls `auth.service.ts`/`auth.service.spec.ts` modifiés).

### File List

- `apps/api/src/auth/auth.service.ts` (modifié)
- `apps/api/src/auth/auth.service.spec.ts` (modifié)

## Change Log

- 2026-07-19 : Implémentation complète (Tasks 1-3). Nouvelle méthode `AuthService.purgeExpiredResetTokens()` décorée `@Cron(CronExpression.EVERY_HOUR)` (AD-5, FR-14) — supprime les `PasswordResetToken` dont `expiresAt` est dépassé (utilisés ou non), même cadence que `NotificationsService.sendDueReminders`, sans garde `isRunning` (non nécessaire, `deleteMany` atomique/idempotent). Aucune nouvelle migration, aucun nouveau module. 805/805 tests API, typecheck propre, redémarrage réel du conteneur confirmé, test manuel bout-en-bout réel (psql + script node inline) validant les 3 AC sur des données réelles. Dernière story de l'Epic 15. Statut passé à review.
- 2026-07-19 : Revue de code (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 décision, 0 patch. 2 items différés (voir `deferred-work.md`) : absence de `try/catch` autour de `deleteMany()` (pré-existant, `NotificationsService.sendDueReminders` — le pattern de référence — n'en a pas non plus) ; `deleteMany()` sans limite de lot (risque théorique, table volontairement petite dans ce projet). 9 findings écartés, dont deux vérifiés factuellement incorrects après relecture (la purge ne peut pas interférer avec le rate-limit par e-mail de la Story 15.3 — fenêtre 1h vs TTL 24h ; aucune contrainte FK n'existe vers `PasswordResetToken`). Suite finale inchangée : 805/805 tests API, typecheck propre. Statut passé à done.
