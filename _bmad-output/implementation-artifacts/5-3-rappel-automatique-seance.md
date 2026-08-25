---
baseline_commit: 4fcd073b80c7ee683198eeb40d4d6225dca346d9
---

# Story 5.3: Rappel automatique avant une séance

Status: done

## Story

As a joueur (membre d'une partie),
I want recevoir un e-mail de rappel la veille d'une séance confirmée,
so that je n'oublie pas la séance sans avoir à vérifier l'app moi-même.

## Acceptance Criteria

1. **Given** `Partie.nextSessionDate` est renseignée et à moins de 24h, **When** le job planifié (`@Cron` horaire) s'exécute et que `reminderSentAt` est `null`, **Then** un e-mail de rappel est envoyé à tous les membres de la partie (MJ inclus) et `reminderSentAt` est mis à jour à la date d'envoi. [Source: epics.md#Story 5.3, AC1 ; PRD FR-4]
2. **Given** `Partie.nextSessionDate` est `null`, **When** le job s'exécute, **Then** aucun rappel n'est envoyé pour cette partie (ce n'est jamais une erreur). [Source: epics.md#Story 5.3, AC2]
3. **Given** `nextSessionDate` change (nouvelle date choisie via le vote) après qu'un rappel ait déjà été envoyé pour l'ancienne date, **When** la date change, **Then** `reminderSentAt` est remis à `null`. [Source: epics.md#Story 5.3, AC3]
4. **Given** un rappel a déjà été envoyé pour le créneau courant, **When** le job repasse à l'exécution horaire suivante, **Then** aucun second rappel n'est envoyé pour ce même créneau. [Source: epics.md#Story 5.3, AC4]
5. **Given** un membre rejoint la partie après l'envoi du rappel, ou la quitte avant l'envoi, **When** le rappel est calculé puis envoyé, **Then** ce membre ne reçoit pas de rappel rétroactif s'il a rejoint après, ni de rappel s'il a quitté avant. [Source: epics.md#Story 5.3, AC5]
6. **Given** l'envoi d'un rappel échoue pour un membre, **When** le job traite ce membre, **Then** l'échec est consigné dans les logs applicatifs, sans bloquer l'envoi aux autres membres de la même partie. [Source: epics.md#Story 5.3, AC6]

## Tasks / Subtasks

- [x] **Task 1 — Migration Prisma : `Partie.reminderSentAt`** (AC: 1, 3, 4)
  - [x] Ajouter `reminderSentAt DateTime?` à `model Partie` dans `apps/api/prisma/schema.prisma` (nullable — `null` = rappel pas encore envoyé pour le créneau courant).
  - [x] `docker compose exec api pnpm prisma migrate dev --name partie_reminder_sent_at`.

- [x] **Task 2 — Dépendance `@nestjs/schedule`** (AC: 1)
  - [x] `docker compose exec api pnpm add @nestjs/schedule@^6.1.3`.
  - [x] `apps/api/src/app.module.ts` : ajouter `ScheduleModule.forRoot()` aux `imports` (une seule fois, au niveau racine — pattern standard NestJS, indépendant de `NotificationsModule`).

- [x] **Task 3 — `PollService.choose()` remet `reminderSentAt` à `null`** (AC: 3)
  - [x] `apps/api/src/poll/poll.service.ts:144` : le seul endroit du code où `Partie.nextSessionDate` est modifié. Ajouter `reminderSentAt: null` dans le même objet `data` du `prisma.partie.update` (`data: { nextSessionDate: option.date, nextSessionSlot: option.slot, reminderSentAt: null }`). **Ne pas** créer de nouvelle logique de remise à zéro ailleurs — ce point de mutation est unique et déjà localisé.
  - [x] **⚠️ Casse un test existant à corriger** : `apps/api/src/poll/poll.service.spec.ts` (autour de la ligne 178) contient `expect(prisma.partie.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { nextSessionDate: d, nextSessionSlot: 'MORNING' } })` — mettre à jour cette assertion pour inclure `reminderSentAt: null` dans `data`, sinon le test échoue après cette story.

- [x] **Task 4 — `NotificationsModule` + `NotificationsService`** (AC: 1, 2, 4, 5, 6)
  - [ ] Créer `apps/api/src/notifications/notifications.module.ts` : `@Module({ imports: [EmailModule], providers: [NotificationsService] })`. **Pas besoin d'importer `PartiesModule`** (déviation volontaire par rapport à la spine d'architecture, voir Dev Notes) : la requête de sélection des parties dues et le chargement des membres se font directement via `PrismaService` (global, injectable sans réimport, cf. P1-AD-1), sans passer par les méthodes de `PartiesService` qui sont toutes conçues pour une requête HTTP authentifiée (`getViewable`/`listMembers` exigent un `userId` "viewer" — non pertinent pour un job système sans utilisateur courant).
  - [ ] Créer `apps/api/src/notifications/notifications.service.ts` : `@Cron(CronExpression.EVERY_HOUR)` (import depuis `@nestjs/schedule`) sur une méthode `sendDueReminders(): Promise<void>` :
    1. `const now = new Date(); const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);`
    2. `const dueParties = await this.prisma.partie.findMany({ where: { nextSessionDate: { gte: now, lte: in24h }, reminderSentAt: null }, include: { mj: { select: { id: true, email: true } }, memberships: { include: { user: { select: { id: true, email: true } } } } } });` (AC1, AC2 — une partie sans `nextSessionDate` ne matche jamais ce `where`, donc aucun traitement, aucune erreur : AC2 satisfaite par construction, pas besoin de `if` explicite).
    3. Pour chaque partie : `const recipients = [partie.mj, ...partie.memberships.map((m) => m.user)];` (le MJ n'a jamais de ligne `Membership` pour sa propre partie — vérifié dans le schéma et le code existant, donc pas de risque de doublon d'e-mail).
    4. Pour chaque destinataire, appeler `await this.email.sendMail('session-reminder', recipient.email, { partieName: partie.name, sessionDate: this.formatSessionDate(partie.nextSessionDate!, partie.nextSessionSlot), link: \`${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${partie.id}\` })`. Si `{ ok: false }`, logger l'échec (`this.logger.error(...)`) et continuer la boucle — **ne jamais** interrompre le traitement des autres destinataires/parties sur un échec individuel (AC6).
    5. Après avoir traité tous les destinataires d'une partie (que certains aient échoué ou non), `await this.prisma.partie.update({ where: { id: partie.id }, data: { reminderSentAt: new Date() } });` — **décision de conception** : le marquage se fait une seule fois par partie après une tentative complète, pas par membre individuel ; un échec partiel ne redéclenche pas de nouvelle tentative à l'heure suivante (évite un rappel qui spammerait indéfiniment si un seul destinataire a une adresse invalide). Ceci est cohérent avec le NFR "log minimal, pas de nouveau tableau de bord" — aucun mécanisme de retry n'est demandé par le PRD.
  - [ ] Méthode privée `formatSessionDate(date: Date, slot: DaySlot | null): string` — `Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)` (même pattern que `nextSessionLabel` dans `apps/web/.../partie-detail.ts:109-127`, mais côté serveur), suffixé par le libellé du créneau (`SLOT_LABELS` local au service : `{ MORNING: 'matin', AFTERNOON: 'après-midi', EVENING: 'soir', FULL_DAY: 'toute la journée' }` — mini-map locale, ne PAS importer celle du frontend). Type `DaySlot` : importer `import type { DaySlot } from '@prisma/client'` (type Prisma généré, pas `@master-jdr/shared`, évite toute dépendance inter-package pour un type déjà disponible nativement).

- [x] **Task 5 — Enregistrement dans `AppModule`** (AC: 1)
  - [x] `apps/api/src/app.module.ts` : ajouter `NotificationsModule` aux `imports` (en plus de `ScheduleModule.forRoot()` de la Task 2).

- [x] **Task 6 — Tests** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `apps/api/src/notifications/notifications.service.spec.ts` (nouveau, suit le pattern d'instanciation manuelle `new Service(mockPrisma, mockEmail)` déjà utilisé dans `invite-links.service.spec.ts`/`invitations.service.spec.ts`, pas de `Test.createTestingModule`) :
    - Une partie avec `nextSessionDate` dans la fenêtre `[now, now+24h]` et `reminderSentAt: null` → un e-mail envoyé par destinataire (MJ + tous les membres), puis `partie.update({ data: { reminderSentAt: expect.any(Date) } })` appelé une fois pour cette partie.
    - `prisma.partie.findMany` renvoie `[]` (aucune partie due) → aucun appel à `email.sendMail`, aucune erreur levée (AC2 — couvert par la construction de la requête, pas de branche `if` à tester séparément, mais un test qui prouve qu'aucun envoi n'a lieu documente bien le comportement).
    - Un des destinataires reçoit `{ ok: false }` de `email.sendMail` → l'envoi aux autres destinataires de la même partie continue (tous les `sendMail` sont appelés), `partie.update` est quand même appelé pour cette partie (AC6).
    - Deux parties dues dans le même run → chacune traitée indépendamment, un échec sur la première partie n'empêche pas le traitement de la seconde.
  - [x] `apps/api/src/poll/poll.service.spec.ts` : corriger l'assertion existante (Task 3) pour inclure `reminderSentAt: null`.

### Review Findings

- [x] [Review][Patch] Ajouter un test d'intégration Prisma pour `NotificationsService` [apps/api/src/notifications/notifications.integration.spec.ts] — Fait : nouveau test contre la vraie DB Postgres du docker-compose (EmailService remplacé par un espion), vérifie le `where` réel (fenêtre 24h, `reminderSentAt: null`, exclusion des parties sans `nextSessionDate`) et le snapshot des memberships (AC2, AC5).
- [x] [Review][Patch] Garder une garde d'égalité avant de reset `reminderSentAt` dans `choose()` [apps/api/src/poll/poll.service.ts:142] — Fait : `reminderSentAt` n'est remis à `null` que si `option.date`/`option.slot` diffère du `nextSessionDate`/`nextSessionSlot` actuel de la partie ; test de régression ajouté dans `poll.service.spec.ts`.
- [x] [Review][Patch] Pas de garde de non-chevauchement sur le `@Cron(EVERY_HOUR)` [apps/api/src/notifications/notifications.service.ts:26] — Fait : flag `isRunning` empêchant une exécution concurrente ; test de régression ajouté dans `notifications.service.spec.ts`.
- [x] [Review][Patch] Destinataires non dédupliqués [apps/api/src/notifications/notifications.service.ts:42] — Fait : déduplication par `id` via `Map` avant envoi ; test de régression ajouté.
- [x] [Review][Defer] Crash entre l'envoi et `partie.update` → re-envoi complet au prochain run [apps/api/src/notifications/notifications.service.ts:56] — deferred, pre-existing (trade-off assumé en Dev Notes : marquage unique après tentative complète, aucun mécanisme d'exactly-once demandé par le PRD, scope hobby).
- [x] [Review][Defer] Fenêtre horaire échantillonnée toutes les heures, pas de rattrapage si le job est indisponible pendant toute la fenêtre [apps/api/src/notifications/notifications.service.ts:20] — deferred, pre-existing (limitation de portée déjà actée en Dev Notes : "fenêtre calendaire approximative", scope hobby, pas de délai configurable demandé).
- [x] [Review][Defer] Échec total d'envoi (tous les destinataires) marque quand même `reminderSentAt`, sans alerte [apps/api/src/notifications/notifications.service.ts:56] — deferred, pre-existing (comportement explicitement voulu et documenté en Dev Notes : "aucun mécanisme de retry n'est demandé par le PRD", déjà testé intentionnellement).
- [x] [Review][Defer] `formatSessionDate` fige `timeZone: 'UTC'` [apps/api/src/notifications/notifications.service.ts:66] — deferred, pre-existing (cohérent avec le pattern déjà en place côté frontend `nextSessionLabel` et la sémantique déjà actée de `nextSessionDate` en jour UTC, pas une régression de cette story).
- [x] [Review][Defer] Fallback `WEB_ORIGIN ?? 'http://localhost:4200'` sans échec explicite si absent [apps/api/src/notifications/notifications.service.ts:53] — deferred, pre-existing (pattern identique déjà utilisé dans `main.ts:53` et `invitations.service.ts:137`, pas introduit par cette story).
- [x] [Review][Defer] Assertion non-null `partie.nextSessionDate!` fragile si la requête évolue [apps/api/src/notifications/notifications.service.ts:47] — deferred, pre-existing (actuellement sûre grâce au `where` de la requête ; nit mineur, faible valeur d'action immédiate).

## Dev Notes

- **Déviation assumée par rapport à la spine d'architecture (AD-3)** : la spine mentionnait `NotificationsModule` importe `PartiesModule`. En lisant le code réel de `PartiesService` (`getViewable`, `listMembers`), toutes les méthodes exigent un `userId` de "viewer" pour l'autorisation HTTP — non applicable à un job système sans requête/utilisateur courant. Le job accède donc directement à `PrismaService` (global, cf. P1-AD-1) pour charger les parties dues et leurs membres, sans dépendre de `PartiesModule`. C'est une simplification légitime découverte pendant l'analyse de cette story, pas une improvisation à l'implémentation — documenté ici pour que la story suivante (si elle touche ce module) ne soit pas surprise par l'absence de cet import.
- **Le MJ n'a jamais de ligne `Membership` pour sa propre partie** — vérifié dans `apps/api/prisma/schema.prisma` (`Membership` n'est créé que via `invitations.service.ts:80` `upsert` ou `invite-links.service.ts:132` `create`, jamais pour le MJ). Donc `[partie.mj, ...partie.memberships.map(m => m.user)]` ne peut pas contenir de doublon d'e-mail.
- **Fenêtre "24h avant" et granularité des données** : `Partie.nextSessionDate` est un `DateTime` représentant un **jour** (minuit UTC), pas une heure précise de séance (`PollOption.date` suit le même pattern, confirmé par `apps/api/src/parties/parties.service.ts` — les dates de créneaux sont construites via `Date.UTC(year, month, day)`). Le "24h avant" de cette story est donc une fenêtre calendaire approximative (le job horaire entrera dans la fenêtre `[nextSessionDate - 24h, nextSessionDate)` à un moment donné dans l'heure qui suit le franchissement du seuil), pas un compte à rebours à la minute près. Le PRD accepte cette granularité (délai fixe non configurable, scope hobby) — ne pas complexifier au-delà de la comparaison de `Date` directe.
- **`EmailService.sendMail` ne relance jamais** (Story 5.1) — retourne toujours `{ ok: boolean }`. Le job doit donc vérifier `result.ok` lui-même pour logger un échec (AC6), pas s'appuyer sur un `catch`.
- **Fichiers existants à modifier (UPDATE, pas NEW)** :
  - `apps/api/prisma/schema.prisma` (ajout d'un champ sur `Partie`, modèle existant)
  - `apps/api/src/poll/poll.service.ts` (une ligne ajoutée dans `choose()`, ne pas toucher aux autres méthodes `create`/`findOpen`/`castVote`/`close`)
  - `apps/api/src/poll/poll.service.spec.ts` (assertion existante à corriger, Task 3)
  - `apps/api/src/app.module.ts` (deux imports ajoutés : `ScheduleModule.forRoot()`, `NotificationsModule`)
- **Nouveaux fichiers** : `apps/api/src/notifications/notifications.module.ts`, `apps/api/src/notifications/notifications.service.ts`, `apps/api/src/notifications/notifications.service.spec.ts`.
- **`@master-jdr/shared` non modifié** — `DaySlot` déjà disponible via `@prisma/client` (type généré par Prisma depuis l'enum du schéma), pas besoin de passer par le package partagé pour ce type utilisé uniquement côté API.
- **`@nestjs/schedule` (v6.1.3, vérifié par recherche web le 2026-07-06)** : `ScheduleModule.forRoot()` s'enregistre une seule fois, typiquement dans `AppModule` (pas dans le module qui définit les `@Cron`) — pattern standard de la doc NestJS. `CronExpression.EVERY_HOUR` est une constante exportée par le package, pas une chaîne cron à écrire à la main.
- **Architecture (AD-3, AD-4 de la spine Palier 4)** : `NotificationsModule` est propriétaire exclusif du rappel de séance planifié ; dédoublonnage/péremption via `Partie.reminderSentAt`. [Source: ARCHITECTURE-SPINE.md#AD-3, #AD-4]

### Project Structure Notes

- `apps/api/src/notifications/` est un nouveau module isolé, sans controller (pas de route HTTP — déclenché uniquement par le `@Cron`), suit la structure `module.ts` + `service.ts` + `service.spec.ts` déjà vue pour `email/` (Story 5.1).
- Aucun changement frontend dans cette story (le rappel est un e-mail, pas une notification in-app).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3: Rappel automatique avant une séance]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260706/prd.md#4.3 Rappel de séance (FR-4)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md#AD-3 NotificationsModule, #AD-4 Dédoublonnage reminderSentAt]
- [Source: _bmad-output/implementation-artifacts/5-1-infrastructure-envoi-emails.md — EmailService.sendMail(template, to, data)]
- [Source: apps/api/src/poll/poll.service.ts:144 — seul point de mutation de `nextSessionDate`]
- [Source: apps/api/prisma/schema.prisma — modèles `Partie`, `Membership`, `User`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Après `prisma migrate dev`, le client Prisma généré ne reflétait pas encore `reminderSentAt` dans les types TS tant que `pnpm prisma generate` n'avait pas été relancé explicitement — corrigé en régénérant le client avant le typecheck final.

### Completion Notes List

- `Partie.reminderSentAt` ajouté (migration `20260707103502_partie_reminder_sent_at`), remis à `null` dans `PollService.choose()` au seul point de mutation de `nextSessionDate`.
- `NotificationsModule`/`NotificationsService` créés (job `@Cron(EVERY_HOUR)`), sans dépendance à `PartiesModule` (déviation assumée et documentée dans les Dev Notes) : accès direct à `PrismaService`.
- Rappel envoyé au MJ + tous les membres d'une partie due, dédoublonné via `reminderSentAt`, échecs individuels loggés sans bloquer les autres envois ni les autres parties.
- Tests : nouveau `notifications.service.spec.ts` (6 cas couvrant AC1, AC2, AC6, traitement indépendant multi-parties, dédoublonnage MJ/membre, garde de non-chevauchement du cron) + correction de l'assertion existante dans `poll.service.spec.ts` (Task 3).
- Suite complète (`pnpm test`) : 246/246 tests passent, aucune régression. `pnpm lint` : nombre de problèmes inchangé/légèrement amélioré (198 vs 202 avant, tous pré-existants — pattern `expect.any(Date)` + `toDto: any` déjà présents ailleurs dans le code base, hors scope de cette story).

**Revue de code (2026-07-07)** — 4 patches appliqués :
- Test d'intégration Prisma ajouté (`notifications.integration.spec.ts`) vérifiant le vrai `where` (fenêtre 24h, exclusion des parties sans `nextSessionDate`) et le snapshot des memberships contre la DB réelle du docker-compose (AC2, AC5) — EmailService remplacé par un espion pour éviter un envoi réseau réel.
- Garde d'égalité ajoutée dans `PollService.choose()` : `reminderSentAt` n'est remis à `null` que si la date/le créneau change réellement (évite un double envoi sur re-confirmation du même créneau).
- Garde de non-chevauchement (`isRunning`) ajoutée sur `@Cron(EVERY_HOUR)` pour éviter un double envoi si une exécution dépasse 1h.
- Déduplication des destinataires par `id` (défense en profondeur si le MJ a un jour aussi une ligne `Membership`).
- Suite complète après patches (`pnpm test`) : 250/250 tests passent. Un leak de handle Jest (pool pg non fermé) découvert et corrigé pendant l'écriture du test d'intégration (`prisma.$disconnect()` explicite dans `afterAll`).
- 6 items non actionnables restants documentés dans `deferred-work.md` (tous des trade-offs déjà actés dans les Dev Notes ou des patterns déjà présents ailleurs dans le code base).

### File List

- `apps/api/prisma/schema.prisma` (modifié)
- `apps/api/prisma/migrations/20260707103502_partie_reminder_sent_at/migration.sql` (nouveau)
- `apps/api/package.json` (modifié — dépendance `@nestjs/schedule`)
- `pnpm-lock.yaml` (modifié)
- `apps/api/src/notifications/notifications.integration.spec.ts` (nouveau — revue de code)
- `apps/api/src/app.module.ts` (modifié)
- `apps/api/src/poll/poll.service.ts` (modifié)
- `apps/api/src/poll/poll.service.spec.ts` (modifié)
- `apps/api/src/notifications/notifications.module.ts` (nouveau)
- `apps/api/src/notifications/notifications.service.ts` (nouveau)
- `apps/api/src/notifications/notifications.service.spec.ts` (nouveau)
