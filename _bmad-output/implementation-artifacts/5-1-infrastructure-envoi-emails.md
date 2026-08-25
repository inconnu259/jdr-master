---
baseline_commit: 782423fef7cc06744f29e1bbca8c62a96bee1148
---

# Story 5.1: Infrastructure d'envoi d'e-mails

Status: done

## Story

As a développeur du projet,
I want un service d'envoi d'e-mails configurable uniquement par variables d'environnement,
so that je peux développer et tester toutes les fonctionnalités e-mail du Palier 4 sans jamais envoyer un vrai e-mail ni dépendre d'un fournisseur externe.

## Acceptance Criteria

1. **Given** le projet est lancé via `docker compose up`, **When** un module appelle `EmailService.sendMail(template, to, data)`, **Then** l'e-mail est envoyé au relais configuré par `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASSWORD`/`MAIL_FROM`, **And** en dev/test ce relais est Mailpit (nouveau service `mailpit` dans `docker-compose.yml`, image `axllent/mailpit`, port SMTP `1025`, UI/API HTTP `8025`). [Source: epics.md#Story 5.1, AC1]
2. **Given** un test automatisé veut vérifier qu'un e-mail a été envoyé, **When** il interroge l'API HTTP de Mailpit (`http://mailpit:8025/api/v1/...`), **Then** il retrouve l'e-mail par destinataire et peut en inspecter le contenu (objet, destinataire, lien inclus). [Source: epics.md#Story 5.1, AC2]
3. **Given** un gabarit `invitation`, `session-reminder` ou `password-reset` est rendu, **When** l'e-mail est généré, **Then** il contient un objet clair, le contexte minimal nécessaire, un lien d'action unique, une mention d'expiration si applicable, et aucune donnée personnelle superflue (mot de passe, jeton en clair au-delà du lien, autre membre de la partie). [Source: epics.md#Story 5.1, AC3 ; PRD FR2]
4. **Given** l'envoi d'un e-mail échoue (relais indisponible, etc.), **When** `EmailService.sendMail` est appelé, **Then** l'échec est consigné dans les logs applicatifs existants (pas de crash, pas de nouveau tableau de bord). [Source: epics.md#Story 5.1, AC4 ; PRD NFR §4.3]
5. **Given** le même code tourne en dev et en prod, **When** on compare les deux environnements, **Then** aucune différence de code n'existe entre eux — seule la configuration `.env` change (`MAIL_HOST` pointant vers Brevo en prod). [Source: epics.md#Story 5.1, AC5 ; PRD FR1]

**Hors scope de cette story** (couvert par les stories suivantes du même epic, qui consomment `EmailService` sans le modifier) : l'appel réel à `sendMail('invitation', ...)` (Story 5.2), `sendMail('session-reminder', ...)` (Story 5.3), `sendMail('password-reset', ...)` (Story 5.4). Cette story ne crée QUE l'infrastructure et les 3 gabarits — pas leurs appelants métier.

## Tasks / Subtasks

- [x] **Task 1 — Dépendances** (AC: 1, 3)
  - [x] `apps/api` : ajouter `@nestjs-modules/mailer@^2.3.7`, `nodemailer@^9.0.3`, `handlebars@^4.7.9` en dependencies ; `@types/nodemailer@^8.0.1` en devDependencies (via `docker compose exec api pnpm add ...` / `pnpm add -D ...` — jamais `npm`/`pnpm` sur l'hôte, cf. CLAUDE.md).
- [x] **Task 2 — Service Mailpit (dev/test)** (AC: 1, 2)
  - [x] Ajouter un service `mailpit` dans `docker-compose.yml` : image `axllent/mailpit`, ports `8025:8025` (UI/API HTTP) et `1025:1025` (SMTP). Pas de volume nécessaire (état éphémère, acceptable pour du dev/test).
  - [x] Ajouter au service `api` une dépendance implicite via variables d'env pointant vers `mailpit` (voir Task 3) — pas de `depends_on` strict requis (Mailpit n'a pas de healthcheck bloquant, contrairement à `db`).
- [x] **Task 3 — Variables d'environnement** (AC: 1, 5)
  - [x] Ajouter à `.env` (et `.env.dev`, le template de référence) : `MAIL_HOST=mailpit`, `MAIL_PORT=1025`, `MAIL_USER=` (vide en dev), `MAIL_PASSWORD=` (vide en dev), `MAIL_FROM="jdr-master <no-reply@jdr-master.local>"`.
  - [x] Documenter dans le même fichier qu'en prod ces mêmes clés pointent vers Brevo (host/port/user/password fournis par Brevo), sans changement de code.
- [x] **Task 4 — EmailModule** (AC: 1, 4, 5)
  - [x] Créer `apps/api/src/email/email.module.ts` : `MailerModule.forRootAsync({ useFactory: () => ({ transport: {...}, defaults: {...} }) })` (pas besoin d'`inject`/`ConfigService`, lire `process.env` directement dans la factory — voir Dev Notes). Transport : `{ host: process.env.MAIL_HOST, port: Number(process.env.MAIL_PORT), secure: false, auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD } : undefined }` — **important** : mettre `auth` à `undefined` (pas `{ user: '', pass: '' }`) quand `MAIL_USER` est vide, sinon Nodemailer tente un `AUTH LOGIN` avec des identifiants vides qui peut échouer selon le serveur ; Mailpit n'exige aucune authentification. `secure: false` car Mailpit/le port 1025 ne fait pas de TLS.
  - [x] Créer `apps/api/src/email/email.service.ts` : `EmailService.sendMail(template: EmailTemplate, to: string, data: Record<string, unknown>)`, appelle `MailerService.sendMail({ to, template, context: data })`, catch toute erreur et logge via le `Logger` NestJS standard (pattern déjà utilisé dans le projet — vérifier un exemple existant, ex. un service qui logge une erreur non bloquante) puis **ne relance pas** l'exception (l'appelant ne doit pas planter sur un échec d'envoi, seulement être informé si besoin via une valeur de retour `{ ok: boolean }`).
  - [x] Créer `apps/api/src/email/email-template.enum.ts` : `export type EmailTemplate = 'invitation' | 'session-reminder' | 'password-reset';` (garder ce type ici, PAS dans `@master-jdr/shared` — voir contrainte critique en Dev Notes).
  - [x] Exporter `EmailService` depuis `EmailModule`.
- [x] **Task 5 — Gabarits Handlebars** (AC: 3)
  - [x] Créer `apps/api/src/email/templates/layout.hbs` : structure HTML minimale neutre (pas de branding par thème visuel — cf. PRD §5 Non-Goals), avec un bloc `{{{body}}}`.
  - [x] Créer `apps/api/src/email/templates/invitation.hbs`, `session-reminder.hbs`, `password-reset.hbs` : chacun avec objet implicite (défini au niveau de l'appel `sendMail`, pas dans le template), un texte contextuel minimal, et un lien d'action (`{{link}}`) en variable.
  - [x] Configurer `MailerModule` avec `template.dir` pointant vers ce dossier et l'adaptateur Handlebars (`HandlebarsAdapter` fourni par `@nestjs-modules/mailer/adapters/handlebars.adapter`).
- [x] **Task 6 — Enregistrement dans AppModule** (AC: 1)
  - [x] Ajouter `EmailModule` aux `imports` de `apps/api/src/app.module.ts` (fichier existant à modifier, pas à recréer — voir liste actuelle des imports en Dev Notes).
- [x] **Task 7 — Tests** (AC: 1, 2, 3, 4, 5)
  - [x] `email.service.spec.ts` : mock `MailerService.sendMail` (Nest testing module), vérifier que `sendMail()` transmet bien `to`/`template`/`context` ; vérifier qu'une erreur levée par `MailerService.sendMail` est catchée, loggée (spy sur `Logger`), et ne remonte pas.
  - [x] Un test d'intégration (ou a minima un test manuel documenté dans Completion Notes) confirmant qu'un e-mail réellement envoyé via le transport configuré apparaît dans l'API HTTP de Mailpit — vérification manuelle effectuée (voir Completion Notes ; endpoint réel `GET /api/v1/messages`, pas `/api/v2/` comme supposé initialement).

## Dev Notes

- **Contrainte critique héritée (P1-AD-4)** : `@master-jdr/shared` est **types-only**, jamais de valeur runtime importée côté `apps/api` — Jest ne transforme pas les workspace deps et ça casse toute la suite API (`SyntaxError: Unexpected token 'export'`), leçon vécue en Story 4.7. `EmailTemplate` doit être un type LOCAL à `apps/api/src/email/`, pas dans `packages/shared`.
- **Pas de `@nestjs/config` dans ce projet** : convention actuelle = lecture directe de `process.env.X` (voir `apps/api/src/main.ts:25,28,33,53,57` et `apps/api/src/prisma/prisma.service.ts:8`). Ne PAS introduire `ConfigModule`/`ConfigService` pour rester cohérent — lire les 5 variables `MAIL_*` directement dans `EmailModule` au moment de construire la config `MailerModule.forRootAsync`.
- **MailHog vs Mailpit** : le PRD nomme "Mailhog" mais MailHog n'est plus maintenu depuis 2020. Mailpit (`axllent/mailpit`) est un remplaçant drop-in activement maintenu — mêmes ports (SMTP 1025, UI/API HTTP 8025), API HTTP compatible. Utiliser Mailpit. Ceci a été validé avec l'utilisateur et documenté dans `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md` (AD-2, amendement) et `.memlog.md`.
- **Versions vérifiées (recherche web, 2026-07-07)** : `@nestjs-modules/mailer@2.3.7` (dernière stable, Nodemailer + adaptateurs Handlebars/Pug/EJS/Liquid/MJML), `nodemailer@9.0.3`, `handlebars@4.7.9`, `@types/nodemailer@8.0.1`. Installer avec `npm install --save @nestjs-modules/mailer nodemailer` + handlebars séparément (dépendance optionnelle du côté du mailer). [Source: npmjs.com/package/@nestjs-modules/mailer, npmjs.com/package/nodemailer, npmjs.com/package/handlebars]
- **Architecture (AD-1, AD-2 de la spine Palier 4)** : `EmailModule` générique, expose UNE seule méthode `sendMail(template, to, data)` — pas de service dédié par cas d'usage (`InvitationEmailService` etc. rejetés). Chaque appelant futur (Story 5.2/5.3/5.4) choisit son template et ses données ; `EmailService` ne connaît aucune règle métier. [Source: ARCHITECTURE-SPINE.md#AD-1, #AD-2]
- **Fichier existant à modifier (UPDATE, pas NEW)** : `apps/api/src/app.module.ts` — imports actuels : `ThrottlerModule`, `PrismaModule`, `HealthModule`, `UsersModule`, `AuthModule`, `PartiesModule`, `InvitationsModule`, `AvailabilityModule`, `PollModule`, `GameSystemModule`, `CharacterModule`. Ajouter `EmailModule` à cette liste sans réorganiser les imports existants.
- **Fichier existant à modifier (UPDATE, pas NEW)** : `docker-compose.yml` — structure actuelle : ancre `x-dev`, puis services `db` (Postgres avec healthcheck), `deps` (installe les deps une fois), `api`, `web`. Ajouter `mailpit` comme service indépendant (pas de `x-dev`, pas de build — image toute faite). Ne pas casser le pattern `depends_on: { db: condition: service_healthy, deps: condition: service_completed_successfully }` du service `api`.
- **Fichier existant à modifier (UPDATE, pas NEW)** : `.env` — variables actuelles : `POSTGRES_*`, `DATABASE_URL`, `API_PORT`, `WEB_ORIGIN`, `SESSION_SECRET`, `ADMIN_*`, `WEB_PORT`, `API_URL`. Ajouter les 5 variables `MAIL_*` à la suite, avec un commentaire de section comme les autres blocs.
- **Pattern d'accès aux données existant réutilisable pour un futur token** (context pour Story 5.2/5.4, pas requis ici) : `randomBytes(32).toString('base64url')` déjà utilisé dans `apps/api/src/invitations/invite-links.service.ts:35` pour générer un token — même pattern à réutiliser pour `PasswordResetToken` en Story 5.4 (pas dans cette story).
- **NestJS module pattern du projet** : controller → service → PrismaService global (jamais réimporté), voir `apps/api/src/invitations/invitations.module.ts` comme référence de structure (`@Module({ imports, controllers, providers, exports })`). `EmailModule` n'a pas de controller (pas de route HTTP directe) ni de dépendance à Prisma.
- **Logging des échecs (NFR2)** : ce projet n'a pas de pattern de logging centralisé identifié au-delà du `Logger` NestJS standard — utiliser `new Logger(EmailService.name)` et `logger.error(...)` en cas d'échec d'envoi, cohérent avec les conventions NestJS par défaut.

### Project Structure Notes

- Nouveau module isolé : `apps/api/src/email/` (module, service, enum de template, dossier `templates/*.hbs`) — suit exactement le pattern de dossier des autres modules (`invitations/`, `parties/`, etc.), sans DTO ni controller car ce module n'expose aucune route HTTP propre dans cette story.
- Aucune migration Prisma dans cette story (le modèle `PasswordResetToken` et les champs `Partie.reminderSentAt`/`InviteLink.targetEmail` sont scoped aux Stories 5.3/5.4/5.2 respectivement, pas ici — principe "créer une entité seulement quand une story en a besoin").
- Aucune variance détectée avec la structure unifiée du projet.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1: Infrastructure d'envoi d'e-mails]
- [Source: _bmad-output/planning-artifacts/epics.md#FR1, FR2, NFR2]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260706/prd.md#4.1 Infrastructure d'envoi d'e-mails (FR-1, FR-2)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md#AD-1 EmailModule, #AD-2 Transport SMTP swappable]
- [Source: CLAUDE.md — tout via Docker, aucun outil Node sur l'hôte]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Import cassé au premier build : `@nestjs-modules/mailer/dist/adapters/handlebars.adapter` n'existe pas dans le `exports` du package (restreint à `./adapters/*` sans `/dist`) → corrigé en `@nestjs-modules/mailer/adapters/handlebars.adapter`.
- `template.dir` sans copie des `.hbs` vers `dist/` : `nest-cli.json` n'avait pas de config `assets`, donc les gabarits n'auraient pas suivi en watch/build → ajouté `compilerOptions.assets: ["email/templates/**/*.hbs"]` et `watchAssets: true`.
- `docker compose restart api` ne relit PAS `env_file` (les nouvelles variables `MAIL_*` restaient vides dans le conteneur) → il faut `docker compose up -d --force-recreate api` pour qu'un conteneur existant reprenne un `.env` modifié.
- Layout non appliqué au premier essai réel (Mailpit renvoyait le HTML brut du gabarit, sans l'enveloppe `layout.hbs`) : l'option `layout` doit être au niveau racine de `MailerOptions.options.layout`, pas dans `template.options.layout` — c'est literalement `get(mailerOptions, 'options.layout')` dans le code de `HandlebarsAdapter.compile()`. Corrigé et revérifié par un envoi réel.
- Endpoint Mailpit réel : `GET /api/v1/messages` (la story supposait `/api/v2/` par erreur — pas de `v2` dans cette version de Mailpit).

### Completion Notes List

- Vérification manuelle end-to-end effectuée (au-delà des tests unitaires) : lancement d'un envoi réel via `EmailService.sendMail('invitation', 'ami@example.com', { partieName: 'La Forêt Ancienne', link: '...' })` dans le conteneur `api`, confirmé reçu dans Mailpit via `curl http://localhost:8025/api/v1/messages` — objet interpolé correct (« Invitation à rejoindre La Forêt Ancienne »), destinataire correct, corps HTML enveloppé par `layout.hbs`, lien d'action présent. Script de test supprimé après vérification (pas de fichier de test ad hoc laissé dans le repo).
- Suite complète après revue de code + patches : 236 tests / 18 suites passent (aucune régression). Lint propre sur tous les fichiers touchés par cette story ; les erreurs restantes rapportées par `pnpm lint` sont une dette préexistante dans `poll.service.ts`/`poll-*.spec.ts`, non touchés par cette story.
- Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) : 1 decision-needed tranché (fail-fast) + 3 patches appliqués (validation stricte `MAIL_HOST`/`MAIL_FROM`/`MAIL_PORT` au boot, `auth` exige `MAIL_USER` ET `MAIL_PASSWORD`, ajout de `email.integration.spec.ts` — un test d'intégration réel contre Mailpit qui aurait attrapé les 2 bugs trouvés manuellement pendant l'implémentation). 3 items différés (voir `deferred-work.md`), 5 findings écartés comme bruit (voir Review Findings ci-dessous).

### File List

- `apps/api/src/email/email.module.ts` (nouveau, patché en revue : validation stricte des env vars)
- `apps/api/src/email/email.service.ts` (nouveau)
- `apps/api/src/email/email.service.spec.ts` (nouveau)
- `apps/api/src/email/email.integration.spec.ts` (nouveau, ajouté en revue de code)
- `apps/api/src/email/email-template.enum.ts` (nouveau)
- `apps/api/src/email/templates/layout.hbs` (nouveau)
- `apps/api/src/email/templates/invitation.hbs` (nouveau)
- `apps/api/src/email/templates/session-reminder.hbs` (nouveau)
- `apps/api/src/email/templates/password-reset.hbs` (nouveau)
- `apps/api/src/app.module.ts` (modifié — ajout `EmailModule` aux imports)
- `apps/api/nest-cli.json` (modifié — ajout `compilerOptions.assets`/`watchAssets` pour copier les `.hbs`)
- `docker-compose.yml` (modifié — ajout du service `mailpit`)
- `.env` (modifié — ajout des 5 variables `MAIL_*`, non versionné)
- `.env.dev` (modifié — même ajout, template versionné)
- `apps/api/package.json` (modifié — ajout `@nestjs-modules/mailer`, `nodemailer`, `handlebars`, `@types/nodemailer`)
- `pnpm-lock.yaml` (modifié — lockfile mis à jour par `pnpm add`)

### Review Findings

- [x] [Review][Patch] Valider strictement `MAIL_HOST`/`MAIL_FROM` au boot (lever une exception si absents) — décision utilisateur : fail-fast plutôt que fallback silencieux [apps/api/src/email/email.module.ts]
- [x] [Review][Patch] `MAIL_PORT` non validé — `Number(process.env.MAIL_PORT)` produit silencieusement `NaN` si absent/malformé [apps/api/src/email/email.module.ts:15]
- [x] [Review][Patch] `auth` ne vérifie que `MAIL_USER`, pas `MAIL_PASSWORD` — un user renseigné sans password tenterait un `AUTH LOGIN` avec un mot de passe vide [apps/api/src/email/email.module.ts:19-21]
- [x] [Review][Patch] Aucun test automatisé ne prouve que le transport réel + le layout + l'interpolation du sujet fonctionnent bout-en-bout — seule une vérification manuelle (non répétable) l'a confirmé cette session, après avoir justement attrapé 2 bugs réels (chemin d'import, placement de `layout`) que les tests unitaires mockés n'auraient jamais détectés [apps/api/src/email/email.service.spec.ts]
- [x] [Review][Defer] Retour d'erreur différencié pour les appelants (`{ ok: false }` sans détail de cause) [apps/api/src/email/email.service.ts:27-33] — deferred, pas de besoin concret avant qu'un appelant réel (Story 5.2/5.3/5.4) n'ait besoin de réagir différemment selon la cause d'échec
- [x] [Review][Defer] Validation du format de `to` (adresse e-mail) [apps/api/src/email/email.service.ts:16] — deferred, relève des DTOs des futurs appelants (class-validator `@IsEmail`), pas de ce service d'infra générique
- [x] [Review][Defer] Garde-fou pour clé de contexte manquante (ex. `partieName` absent) [apps/api/src/email/email.service.ts] — deferred, dépend de ce que les stories 5.2/5.3/5.4 fourniront réellement comme contexte

**Findings dismissed as noise/false positives (5) :**
- « Service `db` dupliqué dans `docker-compose.yml` » (Blind Hunter + Acceptance Auditor) — artefact de copier-coller dans le diff fourni aux sous-agents (un `+` ajouté par erreur sur des lignes de contexte inchangées) ; le fichier réel ne contient aucun doublon, vérifié.
- « `.env` non mis à jour » (Acceptance Auditor) — faux positif : `.env` est bien à jour, simplement non suivi par git (`.gitignore`) donc absent du diff ; `.env.dev` (le template versionné) est correctement mis à jour.
- « `@types/nodemailer@8.0.1` vs `nodemailer@9.0.3`, incohérence de version majeure » (Blind Hunter) — les paquets `@types/*` de DefinitelyTyped ne suivent pas le schéma de version du paquet runtime ; build, lint et 235 tests passent sans aucune erreur de type liée à `nodemailer`.
- « Pas de `depends_on`/healthcheck entre `api` et `mailpit` » (Blind Hunter + Edge Case Hunter) — décision de story déjà documentée explicitement dans les Dev Notes/Task 2 (Mailpit n'a pas de healthcheck bloquant) ; l'Acceptance Auditor, qui avait le contexte de la story, n'a pas relevé ce point.
- « Gabarit `password-reset.hbs` avec "24h" en dur » (Blind Hunter) — conforme à la décision PRD confirmée (FR-6 : durée fixe non configurable en v1), pas un bug.



- 2026-07-07 : Implémentation complète (Tasks 1-7). Amendements découverts en cours d'implémentation : chemin d'import `HandlebarsAdapter` corrigé, `nest-cli.json` complété pour copier les gabarits, placement correct de l'option `layout`. Voir Debug Log References.
- 2026-07-07 : Revue de code (3 couches). 4 patches appliqués (validation stricte des env vars au boot, garde `MAIL_PORT`, `auth` exige user+password, test d'intégration réel `email.integration.spec.ts` ajouté). 3 items différés dans `deferred-work.md`. 236 tests / 18 suites, lint propre.
