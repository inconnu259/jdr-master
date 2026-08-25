---
title: "PRD — Infra e-mail & notifications"
status: final
created: 2026-07-06
updated: 2026-07-06
---

# PRD — Infra e-mail & notifications (Palier 4)

## 0. Document Purpose

Ce PRD couvre la sous-partie "infra e-mail" du Palier 4 (`docs/backlog.md`) : donner au projet une première capacité d'envoi d'e-mails transactionnels, et l'utiliser pour trois cas d'usage concrets (invitation par e-mail, rappel de séance, mot de passe oublié). Il s'appuie sur les modèles existants (`User`, `Invitation`, `InviteLink`, `Partie.nextSessionDate`) sans les redéfinir — voir le Glossaire. Les choix techniques (bibliothèque d'envoi, ordonnanceur de tâches) sont hors PRD, à trancher en architecture.

## 1. Vision

jdr-master est aujourd'hui un système "actif seulement quand on le regarde" : pour savoir qu'on a été invité à une partie, ou que la prochaine séance approche, il faut se connecter et vérifier soi-même. Ce palier ajoute un canal e-mail qui pousse trois informations vers l'utilisateur au bon moment, sans qu'il ait à aller les chercher : une invitation à rejoindre une partie, un rappel avant une séance, et un moyen de récupérer l'accès à son compte en cas de mot de passe oublié — ce dernier point débloquant aussi une brique de sécurité basique qui manquait jusqu'ici (pas de "mot de passe oublié" self-service).

## 2. Target User

### 2.1 Jobs To Be Done

- En tant que MJ, je veux inviter quelqu'un par e-mail sans avoir à lui envoyer le lien "à la main" par un autre canal (Discord, SMS...).
- En tant que joueur, je veux recevoir un rappel avant la séance pour ne pas l'oublier, sans avoir à consulter l'app pour vérifier la date.
- En tant qu'utilisateur qui a oublié son mot de passe, je veux pouvoir le réinitialiser moi-même, sans dépendre du MJ ou d'un accès admin.

### 2.2 Non-Users (v1)

- Personne en dehors du petit groupe d'amis actuel — pas de scénario d'acquisition/onboarding public à ce stade (cf. Non-Goals).

### 2.3 Key User Journeys

*Périmètre hobby — UJ formulées en une phrase (JTBD reformulé), pas de flow détaillé.*

- **UJ-1.** Le MJ tape l'adresse e-mail d'un ami dans le formulaire d'invitation d'une partie ; l'ami reçoit un e-mail avec un lien, clique, s'inscrit (ou se connecte s'il a déjà un compte) et atterrit directement sur la partie.
- **UJ-2.** Un joueur reçoit un e-mail de rappel la veille d'une séance confirmée, sans avoir rien demandé.
- **UJ-3.** Un utilisateur qui ne se souvient plus de son mot de passe clique "mot de passe oublié", reçoit un e-mail avec un lien à usage unique, et redéfinit son mot de passe.

## 3. Glossaire

- **Invitation** — Modèle existant (`Invitation`) : invitation ciblée d'un utilisateur *déjà inscrit* vers une partie, acceptée/refusée dans l'app.
- **InviteLink** — Modèle existant (`InviteLink`) : lien à jeton, `maxUses` configurable (illimité / usage unique / N joueurs), seul mécanisme d'inscription actuel pour une personne *pas encore inscrite*.
- **Rappel de séance** — E-mail envoyé aux membres d'une partie avant `Partie.nextSessionDate` (champ existant, renseigné par le flow de vote de date de l'Epic 3).
- **Réinitialisation de mot de passe** — Flow self-service : demande → e-mail avec lien à usage unique et durée de vie limitée → nouveau mot de passe.
- **Relais SMTP** — Le transport sortant des e-mails : un serveur SMTP factice (**Mailhog**) en dev/test, **Brevo** en prod — swap par variable d'environnement uniquement, jamais par changement de code (cf. FR-1).

## 4. Features

### 4.1 Infrastructure d'envoi d'e-mails

**Description :** La brique commune sous-jacente aux trois cas d'usage. Doit permettre de développer et tester tout le reste de ce palier sans jamais toucher un vrai service e-mail. Le gabarit visuel est unique et neutre pour tous les e-mails, indépendant du thème visuel actif dans l'app (Ryuutama/Steampunk/...) — cf. Non-Goals.

#### FR-1 : Relais SMTP swappable dev/prod

Le système peut envoyer un e-mail via un relais SMTP configuré uniquement par variables d'environnement, sans changement de code entre dev et prod.

**Conséquences (testables) :**
- En dev/test (`docker compose up`), les e-mails partent vers **Mailhog** (nouveau service dans `docker-compose.yml`), consultables via son interface web sans qu'aucun e-mail ne quitte réellement la machine.
- Les tests automatisés peuvent interroger l'API HTTP de Mailhog pour vérifier qu'un e-mail donné a bien été "envoyé" et en inspecter le contenu (objet, destinataire, lien inclus).
- En prod, le même code pointe vers un relais SMTP réel (ex. Brevo) via des variables d'environnement (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`) — aucune bibliothèque ou appel spécifique à un fournisseur dans le code métier.

#### FR-2 : Gabarits d'e-mails

Le système dispose d'un gabarit d'e-mail par cas d'usage (invitation, rappel de séance, réinitialisation de mot de passe), en français, avec le lien d'action et le minimum de contexte nécessaire.

**Conséquences (testables) :**
- Chaque gabarit inclut : objet clair, nom de la partie ou du contexte concerné, un lien d'action unique, une mention de l'expiration si applicable (invitation/reset).
- Aucune donnée personnelle superflue (mot de passe, jeton en clair au-delà du lien lui-même, autre membre de la partie) n'apparaît dans le corps de l'e-mail.

### 4.2 Invitation par e-mail

**Description :** Réutilise les mécanismes d'invitation existants (`Invitation`, `InviteLink`) — cette feature ajoute uniquement l'e-mail comme canal de remise, sans changer la logique d'acceptation/inscription déjà en place. Réalise UJ-1.

#### FR-3 : Envoyer une invitation par e-mail

Le MJ peut saisir une adresse e-mail lors de l'invitation à une partie ; le système envoie un e-mail contenant le lien d'invitation adapté au cas.

**Conséquences (testables) :**
- Si l'adresse correspond à un utilisateur déjà inscrit, le système utilise le mécanisme `Invitation` existant et envoie un e-mail contenant un lien vers l'invitation en attente dans l'app.
- Si l'adresse ne correspond à aucun utilisateur inscrit, le système génère un `InviteLink` à usage unique (`maxUses: 1`) et l'envoie par e-mail à cette adresse — la personne s'inscrit puis atterrit directement sur la partie.
- Le MJ voit une confirmation que l'e-mail a été envoyé (ou un message d'erreur explicite si l'envoi échoue — ne doit jamais échouer silencieusement).
- Si le MJ invite une seconde fois la même adresse alors qu'une invitation/`InviteLink` précédent est encore valide, le système renvoie l'invitation/le lien existant plutôt que d'en créer un nouveau en doublon.

**Hors scope :** valider que l'adresse saisie appartient réellement à la personne visée (pas de vérification d'identité) ; renvoyer/relancer automatiquement une invitation non ouverte (v2 potentielle).

### 4.3 Rappel de séance

**Description :** E-mail automatique envoyé aux membres d'une partie avant la date confirmée de la prochaine séance. Réalise UJ-2.

#### FR-4 : Envoi automatique du rappel

Le système envoie un e-mail de rappel à tous les membres d'une partie (MJ inclus) avant `Partie.nextSessionDate`, si cette date est renseignée.

**Conséquences (testables) :**
- Délai fixe : 24h avant `nextSessionDate`, identique pour toutes les parties, non configurable en v1.
- Si `nextSessionDate` est `null` (aucune séance confirmée), aucun rappel n'est envoyé — ce n'est jamais une erreur.
- Si `nextSessionDate` change ou est annulée après la programmation du rappel mais avant son envoi, l'ancien rappel ne doit pas partir avec une date périmée.
- Un même créneau confirmé ne déclenche qu'un seul rappel par membre (pas de doublon si le job de vérification tourne plusieurs fois).
- Un membre qui rejoint la partie après l'envoi du rappel ne le reçoit pas rétroactivement ; un membre qui la quitte avant l'envoi ne le reçoit pas.

**Feature-specific NFRs :**
- Le mécanisme de programmation (ex. tâche planifiée récurrente) est un détail d'implémentation laissé à l'architecture — hors PRD.
- En cas d'échec d'envoi (rappel ou tout autre e-mail de ce palier), le système consigne l'échec dans les logs applicatifs existants — pas de nouveau tableau de bord, juste une trace exploitable pour déboguer.

**Notes :**
- [NOTE FOR PM] Déféré mais explicitement demandé par l'utilisateur : (1) rendre le délai de 24h configurable (par partie ou globalement), et (2) permettre au MJ de déclencher un e-mail/notification ponctuel à la demande, indépendamment du rappel automatique. Les deux sont de bons candidats pour une itération v2 de ce palier — cf. §6.2.

### 4.4 Mot de passe oublié (self-service)

**Description :** Premier flow de sécurité self-service du projet — comble une lacune actuelle (aucun moyen de récupérer l'accès sans intervention manuelle). Réalise UJ-3.

#### FR-5 : Demander une réinitialisation

Un utilisateur non connecté peut demander un e-mail de réinitialisation en saisissant son adresse e-mail.

**Conséquences (testables) :**
- Que l'adresse corresponde ou non à un compte existant, le système répond avec le **même message générique** ("si un compte existe, un e-mail a été envoyé") — jamais de confirmation ou infirmation de l'existence d'un compte (anti-énumération).
- Si l'adresse correspond à un compte, un e-mail est envoyé avec un lien de réinitialisation.

#### FR-6 : Réinitialiser le mot de passe

Le lien reçu permet de définir un nouveau mot de passe, une seule fois, dans un délai limité.

**Conséquences (testables) :**
- Durée de vie du lien : 24h.
- Le lien est à usage unique : une fois le mot de passe changé (ou après expiration), il devient invalide et affiche un message clair invitant à refaire une demande.
- Le nouveau mot de passe suit les mêmes règles de robustesse que l'inscription actuelle.

**Feature-specific NFRs :**
- Les requêtes de réinitialisation sont limitées en fréquence (par adresse e-mail et/ou IP) via le throttler déjà en place dans le projet (`@nestjs/throttler`), pour éviter l'abus/spam.

## 5. Non-Goals (Explicit)

- Pas de préférences de notification par utilisateur (opt-out des rappels, etc.) en v1 — tout le monde reçoit les rappels de séance.
- Pas de tableau de bord de suivi des e-mails envoyés/échoués/rebonds (bounce handling) — v1 fait confiance au relais SMTP.
- Pas de variation de gabarit d'e-mail par thème visuel (Ryuutama/Steampunk/...) — un seul style neutre pour tous les e-mails.
- Pas de canal SMS ou notification push — e-mail uniquement pour ce palier.
- Pas d'e-mails marketing/newsletter/digest récapitulatif — uniquement les trois cas d'usage transactionnels listés ici.

## 6. MVP Scope

### 6.1 In Scope
- Mailhog en dev/test (nouveau service Docker Compose).
- Relais SMTP réel en prod, swappable par variables d'environnement (fournisseur retenu : **Brevo**).
- Invitation par e-mail (via `Invitation` existante ou nouvel `InviteLink` à usage unique).
- Rappel de séance automatique (basé sur `Partie.nextSessionDate` existant).
- Mot de passe oublié self-service (demande + réinitialisation à usage unique).

### 6.2 Out of Scope pour MVP
- Préférences de notification par utilisateur — reporté, revoir si des joueurs se plaignent de trop de rappels. [NOTE FOR PM]
- Délai de rappel configurable (actuellement fixe à 24h) — v2 potentielle. [NOTE FOR PM]
- Envoi d'e-mail/notification ponctuel à la demande du MJ (hors rappel automatique) — v2 potentielle. [NOTE FOR PM]
- Renvoi automatique d'invitation non ouverte après X jours — v2 potentielle.
- Tout fournisseur SMTP alternatif à Brevo — peut être révisé si le palier gratuit devient insuffisant.

## 7. Success Metrics

*Périmètre hobby — un critère de succès simple suffit.*

- **Succès** : un ami invité par e-mail rejoint la partie sans que le MJ n'ait à lui envoyer le lien par un autre canal ; personne ne reste bloqué dehors faute de mot de passe ; au moins un rappel de séance envoyé et reçu avec succès en conditions réelles.
- **Succès dans la durée** : pas d'écart inexpliqué de plus de quelques jours entre une séance confirmée et l'envoi consigné en logs de son rappel — le canal e-mail doit rester fiable dans le temps, pas seulement lors du premier essai.
- **Contre-métrique** : ne pas envoyer de rappel en double ou de rappel pour une date annulée — un rappel erroné casse la confiance plus vite qu'il ne rend service.

## 8. Open Questions

Aucune — toutes tranchées en session avec l'utilisateur, voir §9 pour la trace complète.

## 9. Assumptions Index

Toutes les hypothèses initiales ont été confirmées ou tranchées explicitement par l'utilisateur — aucune ne reste supposée sans validation :
- §4.1 — Gabarit visuel neutre unique, indépendant du thème actif : **confirmé**.
- §4.3 (FR-4) — Délai de rappel : 24h fixe en v1 : **confirmé** (configurabilité + envoi ponctuel à la demande déférés, cf. §6.2).
- §4.3 — Log minimal en cas d'échec d'envoi : **confirmé**, ajouté comme NFR.
- §4.4 (FR-6) — Durée de vie du lien de réinitialisation : **24h**, confirmé (révisé depuis l'hypothèse initiale d'1h).
- §6.2 — Pas de préférences de notification par utilisateur en v1 : **confirmé**.
