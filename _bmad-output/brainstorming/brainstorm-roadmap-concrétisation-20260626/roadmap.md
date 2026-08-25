# Roadmap jdr-master

> Document généré le 2026-06-26 à partir de la session de brainstorming "Roadmap et concrétisation du produit".
> Ce document a vocation à remplacer et compléter `docs/backlog.md`.

---

## Vision synthétique

**jdr-master n'est pas un outil de préparation MJ** — c'est la **couche de partage** entre le MJ (qui prépare dans Amsel Suite, offline) et les joueurs. La vraie friction résolue : Amsel est offline → les joueurs se rappellent mal entre sessions → le démarrage de chaque session est lent. jdr-master est le bridge Amsel → joueurs : récaps partageables, XP, planning, évolution des fiches.

---

## MoSCoW

### MUST (non-négociable pour le MVP)

- Comptes + auth (inscription sur invitation uniquement)
- Créer une partie (campagne ou one-shot)
- Inviter des joueurs (in-app + lien)
- Architecture plugin `GameSystem` dès le départ (pas de système hard-codé)
- Seed JSON automatique pour peupler le premier système (Ryuutama)
- Création de personnage guidée (steps typées, rendu adaptatif front)
- Validation fiche à 3 niveaux (strict joueur / dons MJ trackés / mode MJ-valide)
- Évolution XP selon les règles du système
- Export PDF de la fiche
- Session record hybride (titre, recap MJ privé, recap joueurs partagé, XP, items structurés, décisions clés)
- Calendrier : indispos déclarées (récurrent + ponctuel) + calcul automatique des créneaux libres + vote sur dates proposées
- Bascule de vue MJ ↔ Joueur

### SHOULD (fortement souhaité, livrable dès MVP ou juste après)

- Notes joueurs partageables (visibilité au choix du joueur : participants + MJ, ou MJ seul)
- Workflow validation champs libres — Conte de Minuit (MJ approve / reject + contre-proposition)
- Visibilité granulaire des infos session (tous les joueurs / sous-groupe / un seul joueur)
- Lien item session → fiche personnage (ajout direct depuis le session record)
- Calendrier : contrainte positive ("seulement le weekend")
- Notifications email (SMTP) — SHOULD pour scope-1, **BLOQUANT pour le passage en scope-2**

### COULD (valeur ajoutée, planifiable en P7/P8)

- Message secret MJ → joueur pendant ou hors session
- 2e système de jeu complet (Conte de Minuit, après Ryuutama)
- Widget résumé visuel de campagne (PNJ rencontrés, timeline, événements marquants)
- Import fichiers Amsel (JSON) → extraction PNJ / lieux / événements

### WON'T (hors scope pour l'instant)

- Carte interactive
- Éditeur de système complet sans coder (éditeur visuel de schéma)
- Connexion Amsel en temps réel (sync live)
- Modération / rôles avancés pour plateforme publique
- Back-office CMS pour contenu propriétaire

---

## Décisions architecturales clés

### 1. Architecture plugin par composition

Le moteur de système de jeu expose une interface commune (`createCharacter`, `renderSheet`, `exportPDF`, `validate`, `computeDerived`). Chaque système est un plugin qui implémente cette interface. Un système peut hériter d'un autre (ex : Draconis hérite d'un plugin D&D 5e SRD générique et surcharge). Le front reçoit des "steps typées" déclarées par le plugin et choisit le rendu (stepper ou formulaire simple selon le nombre d'étapes).

### 2. Ordre des systèmes de jeu

**Ryuutama → Conte de Minuit → Draconis.**

Stratégie risque minimal : Ryuutama est le système le plus simple, il valide l'architecture plugin avant d'investir dans les systèmes complexes. Si l'interface plugin est fausse, on le découvre sur Ryuutama. Conte de Minuit teste les champs libres et le workflow d'approbation MJ. Draconis (le plus complexe, avec steps conditionnelles) arrive en dernier, quand l'archi est prouvée.

### 3. Validation fiche à 3 niveaux

- **Niveau 1 — Strict joueur** : le moteur valide selon les règles du système, le joueur ne peut pas enfreindre les règles.
- **Niveau 2 — Dons MJ trackés** : le MJ peut accorder des items ou stats hors-règles, trackés dans `grantedItems[]`. Ces dons sont exclus du calcul XP et de la validation stricte — le joueur n'est pas bloqué par un don MJ.
- **Niveau 3 — Mode MJ-valide** : le MJ coche "je valide cette fiche", toute modification joueur passe en "pending MJ approval" avant d'être appliquée. Mode dégradé ultime : peu importe les règles, le MJ a le dernier mot.

### 4. Calendrier par indisponibilités inversées

Contrairement à Doodle (MJ propose des dates → vote), jdr-master inverse la logique : chaque membre déclare ses **indisponibilités** (récurrentes, ponctuelles, ou contraintes positives comme "seulement le weekend"). Le système calcule automatiquement l'intersection = les créneaux libres. Le MJ propose des dates parmi ces créneaux, un vote optionnel tranche si ambiguïté.

### 5. jdr-master = bridge Amsel → joueurs

Le MJ reste sur Amsel Suite pour la préparation et les notes live. jdr-master reçoit les résultats : session record léger (titre, date jouée, recap MJ privé, recap joueurs partagé, XP distribué, items importants, décisions clés). Le format est hybride : blocs structurés en BDD (pour les liens actifs, ex. item → fiche personnage) + texte libre Markdown autour.

---

## Paliers

### MVP = P1 à P5

> Les paliers P1 à P5 constituent le **MVP jouable** pour un groupe fermé (MJ + ses joueurs habituels). À l'issue de P5, le groupe peut gérer ses parties de A à Z : créer une campagne, inviter les joueurs, créer et faire évoluer leurs personnages, planifier les sessions et documenter ce qui s'est passé.

---

### P1 — Fondations (DONE)

**Objectif :** Socle technique opérationnel, auth, gestion des parties et des invitations.

**Features MUST :**
- Monorepo pnpm, Docker Compose (db + api + web)
- Auth : inscription sur invitation, login/logout
- Rôles admin / MJ / joueur
- Créer une partie (campagne ou one-shot)
- Inviter des joueurs (in-app + lien d'invitation)
- Architecture Prisma + migrations
- CI de base (lint, build)

**Done when :** Un MJ peut créer une partie, inviter des joueurs via lien, et les joueurs peuvent s'inscrire et rejoindre la partie. Les rôles sont fonctionnels.

**Dépendances :** aucune (palier initial).

---

### P2 — Calendrier

**Objectif :** Résoudre le problème de planification des sessions — trouver des dates sans sondage manuel.

**Features MUST :**
- Déclaration d'indisponibilités : récurrentes (ex : jamais le mercredi soir), ponctuelles (ex : du 15 au 22 juillet) avec date d'expiration
- Calcul automatique des créneaux libres (intersection des indispos du groupe)
- Vue MJ : "les N prochaines dates où tout le monde est dispo"
- Proposition de dates par le MJ + vote optionnel si ambiguïté

**Features SHOULD :**
- Contrainte positive ("seulement le weekend")
- Rappel automatique quand les indispos d'un membre expirent

**Done when :** Le MJ peut consulter les créneaux libres automatiquement calculés et proposer une date. Les joueurs peuvent voter. Aucun sondage manuel n'est nécessaire.

**Dépendances :** P1 (comptes, parties, membres).

---

### P3 — Moteur plugin + premier système (Ryuutama)

**Objectif :** Poser l'architecture plugin GameSystem et la valider sur le système le plus simple.

**Features MUST :**
- Interface plugin `GameSystem` : `createCharacter`, `renderSheet`, `validate`, `computeDerived`, `exportPDF`
- Seed JSON pour peupler Ryuutama (races, compétences, attributs)
- Création de personnage guidée Ryuutama (steps typées, rendu formulaire simple)
- Validation fiche niveau 1 (strict joueur, règles Ryuutama)
- Export PDF fiche Ryuutama
- Bascule vue MJ ↔ Joueur

**Features SHOULD :**
- Steps conditionnelles (si choix A → étape B disponible)

**Done when :** Un joueur peut créer un personnage Ryuutama complet via l'interface, la fiche est validée selon les règles du système, et l'export PDF fonctionne.

**Dépendances :** P1 (parties, membres).

---

### P4 — Évolution & édition de fiche

**Objectif :** Permettre l'évolution du personnage sur la durée de la campagne (XP, dons MJ, overrides).

**Features MUST :**
- Distribution d'XP par le MJ
- Évolution de fiche selon les règles (achat de compétences, montée de niveau selon le système)
- Validation fiche niveau 2 : dons MJ trackés (`grantedItems[]`, exclus du calcul XP)
- Validation fiche niveau 3 : mode MJ-valide (toute modif joueur → pending approval)

**Features SHOULD :**
- Historique des modifications de fiche (qui a modifié quoi, quand)
- Notification joueur quand le MJ approuve ou rejette une modification

**Done when :** Le MJ peut distribuer de l'XP, accorder des dons hors-règles sans bloquer le joueur, et valider manuellement les fiches si besoin. Les joueurs peuvent faire évoluer leur personnage selon les règles.

**Dépendances :** P3 (moteur plugin + système de base).

---

### P5 — Sessions & partage

**Objectif :** Documenter les sessions jouées et partager les informations entre MJ et joueurs.

**Features MUST :**
- Session record : titre, date jouée, recap MJ (privé), recap joueurs (partagé), XP distribué, items importants (structurés), décisions clés (structurées)
- Texte libre Markdown pour les recaps
- Lien XP session → mise à jour fiche personnage

**Features SHOULD :**
- Visibilité granulaire des infos session (tous / sous-groupe / un seul joueur)
- Lien item session → ajout direct à la fiche du personnage concerné
- Notes joueurs partageables (visibilité au choix : participants + MJ, ou MJ seul)

**Done when :** Après chaque session, le MJ peut créer un session record, distribuer l'XP directement depuis le record, et les joueurs peuvent consulter le recap partagé. Les joueurs peuvent prendre et partager leurs propres notes.

**Dépendances :** P1 (parties), P4 (fiches avec XP).

---

## Passage scope-2 — P6 (amis MJ)

> À partir de P6, la plateforme s'ouvre au-delà du groupe fermé. Un MJ extérieur doit pouvoir s'inscrire, créer ses parties, et inviter ses joueurs — sans passer par l'administrateur. Ce passage nécessite les notifications email pour être viable.

### P6 — Notifications & onboarding autonome

**Objectif :** Permettre à un MJ extérieur de rejoindre et d'utiliser la plateforme de façon autonome.

**Features MUST :**
- Notifications email (SMTP) : invitation à une partie, approbation de fiche, distribution d'XP, nouvelle session disponible
- Flux d'inscription autonome pour un nouveau MJ (sans admin)
- Gestion de plusieurs groupes / parties indépendantes par MJ

**Features SHOULD :**
- Page de profil MJ public (bio, systèmes joués)
- Paramétrage des notifications par utilisateur (opt-in/out par type)

**Done when :** Un MJ extérieur peut s'inscrire, créer sa partie, inviter ses joueurs par email, et tout le groupe reçoit les notifications pertinentes sans intervention de l'admin.

**Dépendances :** P1–P5 (MVP complet), SMTP configuré.

---

### P7 — Deuxième système de jeu (Conte de Minuit)

**Objectif :** Valider l'architecture plugin sur un système à champs libres et workflow d'approbation MJ.

**Features MUST :**
- Seed JSON Conte de Minuit
- Création de personnage avec champs libres (race, compétences inventées par le joueur)
- Workflow d'approbation : MJ approve / reject chaque champ libre + contre-proposition

**Features SHOULD :**
- 3e système de jeu (Draconis) — priorité haute si le groupe le réclame

**Done when :** Un joueur peut créer un personnage Conte de Minuit avec des champs inventés, le MJ peut approuver ou rejeter chaque champ avec une contre-proposition, et le workflow complet fonctionne.

**Dépendances :** P3 (architecture plugin prouvée sur Ryuutama).

---

### P8 — Richesse & engagement (post-MVP)

**Objectif :** Enrichir l'expérience pour fidéliser les groupes et faciliter la narration entre sessions.

**Features COULD :**
- Message secret MJ → joueur (pendant ou hors session, visible uniquement du destinataire)
- Widget résumé visuel de campagne (PNJ rencontrés, timeline, événements marquants)
- Import fichiers Amsel JSON (extraction de PNJ, lieux, événements vers jdr-master)
- Draconis (3e système) si pas livré en P7

**Done when :** Au moins deux des features COULD ci-dessus sont livrées et utilisées par le groupe.

**Dépendances :** P5 (sessions & partage), P7 (deuxième système validé).

---

## Récapitulatif

| Palier | Titre | Scope | Statut |
|--------|-------|-------|--------|
| P1 | Fondations | Monorepo, auth, parties, invitations | DONE |
| P2 | Calendrier | Indispos inversées, créneaux automatiques, vote | À faire |
| P3 | Moteur plugin + Ryuutama | Architecture GameSystem, 1er système | À faire |
| P4 | Évolution & édition de fiche | XP, dons MJ, 3 niveaux de validation | À faire |
| P5 | Sessions & partage | Session record, notes, visibilité granulaire | À faire |
| **P1–P5** | **MVP jouable** | **Groupe fermé autonome** | — |
| P6 | Notifications & scope-2 | Email, onboarding MJ autonome | Passage scope-2 |
| P7 | Conte de Minuit | Champs libres, workflow approbation | Post-MVP |
| P8 | Richesse & engagement | Messages secrets, widget campagne, import Amsel | Long terme |
