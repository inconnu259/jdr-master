---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-20260706/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md
---

# jdr-master - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for jdr-master, decomposing the requirements from the PRD "Infra e-mail & notifications (Palier 4)" and its associated Architecture Spine into implementable stories. No dedicated UX design contract exists for this palier — scope is backend-heavy with two simple forms, specified directly in the stories.

## Requirements Inventory

### Functional Requirements

FR1: Le système peut envoyer un e-mail via un relais SMTP configuré uniquement par variables d'environnement, sans changement de code entre dev et prod (Mailpit en dev/test, Brevo en prod).

FR2: Le système dispose d'un gabarit d'e-mail par cas d'usage (invitation, rappel de séance, réinitialisation de mot de passe), en français, avec objet clair, contexte minimal, lien d'action unique, mention d'expiration si applicable, et aucune donnée personnelle superflue.

FR3: Le MJ peut saisir une adresse e-mail lors de l'invitation à une partie ; le système envoie un e-mail avec le lien adapté (Invitation existante si l'adresse correspond à un utilisateur inscrit, nouvel InviteLink à usage unique sinon) ; une confirmation ou une erreur explicite est affichée au MJ ; une seconde invitation à la même adresse réutilise l'invitation/le lien existant plutôt que d'en créer un doublon.

FR4: Le système envoie automatiquement un e-mail de rappel à tous les membres d'une partie (MJ inclus) 24h avant `Partie.nextSessionDate`, si cette date est renseignée ; aucun rappel n'est envoyé si la date est nulle ; un rappel devenu périmé (date changée/annulée après programmation) ne part pas ; un même créneau ne déclenche qu'un seul rappel par membre ; un membre rejoignant/quittant la partie autour de l'envoi ne reçoit pas de rappel rétroactif ou tardif.

FR5: Un utilisateur non connecté peut demander un e-mail de réinitialisation de mot de passe en saisissant son adresse ; le système répond toujours avec le même message générique (anti-énumération), et envoie un e-mail avec un lien de réinitialisation uniquement si l'adresse correspond à un compte existant.

FR6: Le lien de réinitialisation permet de définir un nouveau mot de passe (mêmes règles de robustesse qu'à l'inscription), une seule fois, dans un délai de 24h ; passé ce délai ou après usage, il devient invalide et affiche un message clair invitant à refaire une demande.

### NonFunctional Requirements

NFR1: Le mécanisme de programmation du rappel de séance (tâche planifiée récurrente) est un détail d'implémentation laissé à l'architecture — résolu par un `@Cron` horaire (`@nestjs/schedule`).

NFR2: En cas d'échec d'envoi d'un e-mail (rappel ou autre), le système consigne l'échec dans les logs applicatifs existants — pas de nouveau tableau de bord.

NFR3: Les requêtes de réinitialisation de mot de passe sont limitées en fréquence (par adresse e-mail et/ou IP) via le throttler déjà en place (`@nestjs/throttler`).

### Additional Requirements

- EmailModule générique (`apps/api/src/email/`), expose `EmailService.sendMail(template, to, data)` — `@nestjs-modules/mailer` (v2.3.7) + moteur `handlebars`, 3 templates neutres partageant un layout commun (`invitation.hbs`, `session-reminder.hbs`, `password-reset.hbs`).
- Transport SMTP configuré exclusivement via `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASSWORD`/`MAIL_FROM`, lus directement via `process.env` (convention du projet — pas de `@nestjs/config`) — aucun code spécifique à un fournisseur.
- Nouveau service `mailpit` (image `axllent/mailpit`, remplaçant maintenu de MailHog — non maintenu depuis 2020, mêmes ports/API) dans `docker-compose.yml` (dev/test) : port SMTP 1025, UI/API HTTP 8025 (interrogeable par les tests automatisés).
- `NotificationsModule` (nouveau, `apps/api/src/notifications/`) : `@Cron` horaire (`@nestjs/schedule`) exécutant `sendDueReminders()`, importe `PartiesModule` + `EmailModule`.
- Nouveau champ `Partie.reminderSentAt` (`DateTime?`) pour le dédoublonnage/péremption du rappel ; remis à `null` par toute mutation de `nextSessionDate` (notamment `PollService.choseDate`, `poll.service.ts:144`).
- `InvitationsService.inviteByEmail(partieId, inviterId, email)` (nouvelle méthode) + nouveau champ `InviteLink.targetEmail` (`String?`) pour retrouver/réutiliser un lien déjà émis pour une adresse donnée.
- Nouveau modèle Prisma `PasswordResetToken` (userId, token unique, expiresAt, usedAt) dans le domaine `AuthModule`, sur le modèle d'`InviteLink`.
- Nouvelles routes API : `POST /parties/:id/invitations/by-email`, `POST /auth/forgot-password`, `POST /auth/reset-password`.
- Nouvelles routes Angular : `/forgot-password` (`ForgotPasswordComponent`), `/reset-password/:token` (`ResetPasswordComponent`), dans `apps/web/src/app/features/auth/`.
- Le composant d'invitation de partie existant reçoit un champ e-mail additionnel branché sur la nouvelle route by-email — pas de nouvelle page.
- Migration Prisma unique : `email_notifications_p4`.
- Invariants hérités à respecter (Paliers 1/2, read-only) : `PrismaService` global, mutations via Service layer uniquement, `import type` strict pour `@master-jdr/shared` (aucune valeur runtime importée côté API), control-flow `@if/@for` côté Angular, `PartiesService` seul point de vérité pour l'appartenance/rôle MJ.

### UX Design Requirements

Aucun document UX dédié pour ce palier — non applicable.

### FR Coverage Map

FR1: Epic 5 - Relais SMTP swappable dev/prod (Mailpit/Brevo)
FR2: Epic 5 - Gabarits d'e-mail par cas d'usage
FR3: Epic 5 - Invitation par e-mail
FR4: Epic 5 - Rappel automatique de séance
FR5: Epic 5 - Demande de réinitialisation de mot de passe
FR6: Epic 5 - Réinitialisation effective du mot de passe

## Epic List

### Epic 5: Infra e-mail & notifications (Palier 4)
Le projet gagne un canal e-mail transactionnel qui pousse trois informations vers l'utilisateur au bon moment, sans qu'il ait à aller les chercher : une invitation à rejoindre une partie, un rappel avant une séance, et un moyen de récupérer l'accès à son compte en cas de mot de passe oublié. Un seul epic car les trois cas d'usage partagent la même brique d'infrastructure (`EmailModule`, transport SMTP, Mailpit/Brevo) construite une seule fois puis réutilisée — les séparer en epics distincts créerait un epic d'infra sans valeur utilisateur propre. Découpé en 3 groupes de stories, livrables et testables indépendamment :
- **Groupe A — Infrastructure e-mail & invitation par e-mail** (FR1, FR2, FR3, NFR2) : construit l'EmailModule commun et son premier cas d'usage concret.
- **Groupe B — Rappel automatique de séance** (FR4, NFR1) : s'appuie sur le Groupe A, ajoute la planification (`NotificationsModule`, `@Cron`).
- **Groupe C — Mot de passe oublié self-service** (FR5, FR6, NFR3) : s'appuie sur le Groupe A, indépendant du Groupe B.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

### Story 5.1: Infrastructure d'envoi d'e-mails

As a développeur du projet,
I want un service d'envoi d'e-mails configurable uniquement par variables d'environnement,
So that je peux développer et tester toutes les fonctionnalités e-mail sans jamais envoyer un vrai e-mail ni dépendre d'un fournisseur externe.

**Acceptance Criteria:**

**Given** le projet est lancé via `docker compose up`
**When** un module appelle `EmailService.sendMail(template, to, data)`
**Then** l'e-mail est envoyé au relais configuré par `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASSWORD`/`MAIL_FROM`
**And** en dev/test, ce relais est Mailpit (nouveau service `mailpit` dans `docker-compose.yml`, image `axllent/mailpit`, port SMTP `1025`, UI/API HTTP `8025`)

**Given** un test automatisé veut vérifier qu'un e-mail a été envoyé
**When** il interroge l'API HTTP de Mailpit (`:8025/api`)
**Then** il retrouve l'e-mail par destinataire et peut en inspecter le contenu (objet, destinataire, lien inclus)

**Given** un gabarit `invitation`, `session-reminder` ou `password-reset` est rendu
**When** l'e-mail est généré
**Then** il contient un objet clair, le contexte minimal nécessaire, un lien d'action unique, une mention d'expiration si applicable, et aucune donnée personnelle superflue (mot de passe, jeton en clair au-delà du lien, autre membre de la partie)

**Given** l'envoi d'un e-mail échoue (relais indisponible, etc.)
**When** `EmailService.sendMail` est appelé
**Then** l'échec est consigné dans les logs applicatifs existants (pas de crash, pas de nouveau tableau de bord)

**Given** le même code tourne en dev et en prod
**When** on compare les deux environnements
**Then** aucune différence de code n'existe entre eux — seule la configuration `.env` change (`MAIL_HOST` pointant vers Brevo en prod)

### Story 5.2: Inviter un ami par e-mail

As a MJ,
I want saisir l'adresse e-mail d'un ami dans le formulaire d'invitation d'une partie,
So that il reçoit un lien et peut rejoindre la partie sans que je doive le lui envoyer par un autre canal.

**Acceptance Criteria:**

**Given** je suis MJ d'une partie et je saisis une adresse e-mail dans le formulaire d'invitation
**When** cette adresse correspond à un utilisateur déjà inscrit
**Then** le système utilise le mécanisme `Invitation` existant (upsert idempotent) et envoie un e-mail contenant un lien vers l'invitation en attente dans l'app

**Given** l'adresse ne correspond à aucun utilisateur inscrit
**When** je soumets le formulaire
**Then** le système génère un `InviteLink` à usage unique (`maxUses: 1`, `targetEmail` renseigné à cette adresse) et l'envoie par e-mail

**Given** une invitation ou un `InviteLink` valide (non révoqué, non expiré) existe déjà pour cette adresse sur cette partie
**When** j'invite une seconde fois la même adresse
**Then** le système renvoie l'invitation/le lien existant plutôt que d'en créer un nouveau en doublon

**Given** l'envoi de l'e-mail échoue
**When** je soumets le formulaire d'invitation
**Then** je vois un message d'erreur explicite (jamais un échec silencieux)

**Given** l'envoi réussit
**When** je soumets le formulaire
**Then** je vois une confirmation que l'e-mail a été envoyé

### Story 5.3: Rappel automatique avant une séance

As a joueur (membre d'une partie),
I want recevoir un e-mail de rappel la veille d'une séance confirmée,
So that je n'oublie pas la séance sans avoir à vérifier l'app moi-même.

**Acceptance Criteria:**

**Given** `Partie.nextSessionDate` est renseignée et à moins de 24h
**When** le job planifié (`@Cron` horaire) s'exécute et que `reminderSentAt` est `null`
**Then** un e-mail de rappel est envoyé à tous les membres de la partie (MJ inclus) et `reminderSentAt` est mis à jour à la date d'envoi

**Given** `Partie.nextSessionDate` est `null`
**When** le job s'exécute
**Then** aucun rappel n'est envoyé pour cette partie (ce n'est jamais une erreur)

**Given** `nextSessionDate` change (nouvelle date choisie via le vote) après qu'un rappel ait déjà été envoyé pour l'ancienne date
**When** la date change
**Then** `reminderSentAt` est remis à `null`, de sorte qu'un nouveau rappel sera envoyé pour la nouvelle date le moment venu et que l'ancien rappel ne « traîne » pas avec une date périmée

**Given** un rappel a déjà été envoyé pour le créneau courant (`reminderSentAt` non nul)
**When** le job repasse à l'exécution horaire suivante
**Then** aucun second rappel n'est envoyé pour ce même créneau

**Given** un membre rejoint la partie après l'envoi du rappel, ou la quitte avant l'envoi
**When** le rappel est calculé puis envoyé
**Then** ce membre ne reçoit pas de rappel rétroactif s'il a rejoint après, ni de rappel s'il a quitté avant

**Given** l'envoi d'un rappel échoue pour un membre
**When** le job traite ce membre
**Then** l'échec est consigné dans les logs applicatifs, sans bloquer l'envoi aux autres membres de la même partie

### Story 5.4: Mot de passe oublié (self-service)

As a utilisateur qui ne se souvient plus de son mot de passe,
I want demander et effectuer une réinitialisation de mot de passe par e-mail,
So that je peux récupérer l'accès à mon compte sans dépendre du MJ ou d'un accès admin.

**Acceptance Criteria:**

**Given** je ne suis pas connecté et je saisis mon adresse e-mail sur `/forgot-password`
**When** je soumets le formulaire
**Then** je vois toujours le même message générique (« si un compte existe, un e-mail a été envoyé »), que l'adresse corresponde ou non à un compte existant (anti-énumération)

**Given** l'adresse correspond à un compte existant
**When** je soumets le formulaire
**Then** un `PasswordResetToken` est créé (`expiresAt` = +24h) et un e-mail est envoyé avec un lien vers `/reset-password/:token`

**Given** je clique sur le lien reçu dans les 24h et je ne l'ai pas encore utilisé
**When** je saisis un nouveau mot de passe respectant les mêmes règles de robustesse qu'à l'inscription
**Then** mon mot de passe est mis à jour, le token est marqué utilisé (`usedAt`), et je peux me connecter avec le nouveau mot de passe

**Given** le lien a expiré (plus de 24h) ou a déjà été utilisé
**When** j'essaie de l'utiliser pour définir un nouveau mot de passe
**Then** je vois un message clair m'invitant à refaire une demande, et le mot de passe n'est pas modifié

**Given** je fais plusieurs demandes de réinitialisation rapprochées pour la même adresse ou depuis la même IP
**When** je dépasse le taux limite configuré
**Then** le throttler existant (`@nestjs/throttler`) bloque les requêtes excédentaires
