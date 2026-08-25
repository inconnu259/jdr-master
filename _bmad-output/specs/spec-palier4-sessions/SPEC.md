---
id: SPEC-palier4-sessions
companions:
  - '../../planning-artifacts/prds/prd-jdr-master-20260711/prd.md'
  - '../../planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md'
  - '../../planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md'
  - '../../planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md'
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# SPEC — Palier 4 (suite) : Sessions, scénarios, rétrospective, annonces MJ

## Why

Une **vision à réaliser** : depuis les paliers précédents, une Partie n'est qu'un conteneur (MJ, joueurs, personnages, calendrier de disponibilités) — aucune notion de scénario ni de séance n'existe, le contenu narratif vit entièrement hors de l'application (Discord, Google Docs). Ce palier donne corps au récit : le MJ crée un scénario, le fait vivre au fil des séances jouées, puis le clôture avec un résumé durable ; les joueurs suivent une chronologie qui distingue clairement ce qui est joué, en cours, ou encore à découvrir (anti-spoil). Un one-shot et une campagne partagent un seul modèle — la campagne est un enchaînement de scénarios, le one-shot son cas particulier à un seul scénario. Contexte : petit groupe d'amis (hobby), pas de scénario multi-tables/multi-MJ à grande échelle. Le calendrier de disponibilités, le vote de date, et l'infra e-mail (Epics 1-3, 5) sont déjà livrés et réutilisés tels quels.

## Capabilities

- **CAP-1 — Créer et faire vivre un scénario**
  - **intent:** Le MJ crée un scénario (titre, description, durée estimée) et le modifie à tout moment tant qu'il n'est pas `Passé` ; il y joint des documents propres au scénario, et des documents à la bibliothèque de Partie/campagne (toujours visibles, jamais anti-spoil).
  - **success:** Un MJ prépare un scénario sans support externe ; une modification après invitation ou inscription de joueurs n'échoue jamais, aucune notification n'est requise.

- **CAP-2 — Cycle de vie anti-spoil du scénario**
  - **intent:** Un scénario transite `Brouillon` (invisible aux joueurs) → `À venir` (titre + date seuls visibles) → `Courant` (contenu complet) → `Passé` (clôturé, lecture seule) ; ouverture et clôture sont toujours des actions MJ explicites, jamais automatiques. Une Partie `CAMPAGNE_LINEAIRE` n'a jamais plus d'un scénario `Courant` ; une Partie `CAMPAGNE_EPISODIQUE` peut en avoir plusieurs en parallèle.
  - **success:** Aucune fuite de contenu `Brouillon`/`À venir` dans une vue joueur ; tenter d'ouvrir un deuxième scénario `Courant` en linéaire échoue avec un message explicite au MJ.

- **CAP-3 — Vue chronologique de campagne**
  - **intent:** Les membres consultent une liste ordonnée des scénarios `Passés`/`Courant(s)`/`À venir` (les `Brouillon` en sont exclus) ; un one-shot n'a pas de timeline, son scénario unique s'affiche directement.
  - **success:** Un joueur distingue en un coup d'œil ce qui est joué, en cours, et à venir sans reconstruction manuelle.

- **CAP-4 — Séances multiples et sélection de date**
  - **intent:** Un scénario peut compter plusieurs séances datées. En `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, la date se choisit via le vote de disponibilités existant, réutilisé sans modification. En `CAMPAGNE_EPISODIQUE`, via une inscription à capacité limitée (fourchette min-max, fermeture automatique au maximum, indicateur visuel de remplissage) — la validation de la date reste toujours une action manuelle du MJ, à n'importe quel niveau de remplissage.
  - **success:** Le MJ planifie une séance sans compter les inscrits à la main ; aucune date n'est jamais validée ou verrouillée automatiquement par le système.

- **CAP-5 — Rétrospective de fin de scénario**
  - **intent:** Un compte-rendu court peut être rédigé par le MJ à l'issue de chaque séance individuelle ; à la clôture du scénario, le MJ rédige un résumé de fin plus riche (éditable après coup). Les deux restent consultables par tous les membres, y compris les absents.
  - **success:** Un joueur absent d'une séance comprend ce qui s'y est passé en lisant le compte-rendu, sans avoir à demander autour de lui.

- **CAP-6 — Association configurable du journal à la rétrospective**
  - **intent:** Un joueur associe des entrées de son journal personnel (existant) à la rétrospective d'un scénario auquel il a participé — par défaut une sélection manuelle entrée par entrée, ou (réglage activable) une association automatique de toute entrée déjà partagée et datée dans la fenêtre du scénario.
  - **success:** Désactiver le réglage d'association automatique après coup ne retire jamais les associations déjà faites manuellement.

- **CAP-7 — Participation aux scénarios**
  - **intent:** En `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, tous les membres de la Partie participent implicitement à chaque scénario. En `CAMPAGNE_EPISODIQUE`, chaque joueur choisit individuellement les scénarios auxquels il participe.
  - **success:** Un joueur épisodique ignore un scénario sans que cela affecte son statut de membre de la Partie.

- **CAP-8 — Annonces MJ à portée variable**
  - **intent:** Le MJ publie une annonce texte libre, scopée à toute la campagne, à un one-shot, ou à un scénario précis ; une annonce scopée à un scénario épisodique n'est visible que par ses participants, et un scénario `Brouillon`/`À venir` n'est jamais une portée disponible.
  - **success:** Un joueur non participant à un scénario épisodique donné ne voit jamais les annonces scopées à ce scénario.

## Constraints

- **Anti-spoil = rendu frontend uniquement, jamais de filtrage backend.** Le backend renvoie toujours le contenu complet (y compris les fichiers de documents) à tout membre de la Partie, quel que soit le statut du scénario ou le rôle de l'appelant ; Angular masque conditionnellement. Décision produit assumée en contexte hobby : le risque qu'un joueur curieux inspecte l'API pour se spoiler lui-même est accepté. Ne jamais réintroduire un filtrage serveur sans repasser par une décision produit explicite.
- **`Scenario` n'a pas de verrouillage optimiste** — le MJ est seul écrivain de son contenu propre, contrairement à `Character`. Ne pas généraliser le pattern `updatedAt` ici.
- **Capacité limitée (inscription) et unicité du scénario `Courant` en linéaire sont vérifiées au niveau service dans une transaction avec verrou de ligne explicite** (`SELECT ... FOR UPDATE`), pas via une contrainte DB dédiée — l'isolation `READ COMMITTED` par défaut ne suffit pas à elle seule contre la course concurrente.
- **Les documents (scénario et bibliothèque) réutilisent le pattern d'upload de portrait existant** — stockage disque local, plafond 5 Mo par fichier, pas de plafond de nombre total.
- **La nouvelle entité « séance de jeu » s'appelle `Seance` (sans accent), jamais `Session`** — collision avec le modèle `Session` existant (store de session HTTP).
- **Deux mécanismes de sélection de date, jamais fusionnés** — le vote existant pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`, l'inscription à capacité limitée (nouveau) pour `CAMPAGNE_EPISODIQUE`, déterminé par `Partie.kind`.
- **La liste de participants n'est jamais persistée pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`** — toujours dérivée en direct de l'appartenance à la Partie ; une table de participation dédiée n'existe que pour `CAMPAGNE_EPISODIQUE`.
- **Le réglage d'association automatique du journal est un booléen par personnage, pas par compte joueur** — cohérent avec le journal personnel déjà scopé au personnage.
- **Une Partie `ONE_SHOT` a toujours exactement un scénario, créé automatiquement à la création de la Partie** (statut `Brouillon` par défaut) — jamais d'état intermédiaire « Partie one-shot sans scénario ». Son ouverture reste malgré tout un geste MJ explicite, jamais automatique.
- **Accès : lecture ouverte à tout membre de la Partie ; écriture de contenu (créer/éditer/ouvrir/clôturer un scénario, rédiger un compte-rendu/résumé, publier une annonce) réservée au MJ ; actions joueur (voter, s'inscrire, choisir un scénario épisodique) ouvertes à tout membre participant.** Aucun mécanisme d'autorisation dédié séparé du contrôle d'appartenance déjà en place.

## Non-goals

- Le flow « agence » complet (annonce d'enquête, opt-in, équipe constituée) — palier futur ; seule l'inscription à capacité limitée est livrée ici comme brique réutilisable.
- Notifications e-mail automatiques sur modification de scénario ou publication d'annonce — consultation in-app uniquement.
- Frise chronologique graphique/illustrée — la vue chronologique est une liste.
- Entité « Événement » libre indépendante d'un scénario — la chronologie ne couvre que les scénarios et leurs séances/résumés.
- Compte-rendu de séance rédigé par un joueur — MJ uniquement (le joueur garde son journal personnel, existant).
- Graphe de dépendances formel entre scénarios — l'enchaînement `Brouillon`→`À venir` reste un geste manuel du MJ.
- Suppression d'un scénario clôturé — historique en lecture seule permanente.
- Gestion de conflits d'agenda entre plusieurs Parties.

## Success signal

Le MJ prépare et lance un scénario sans quitter l'application ; un joueur absent d'une séance comprend ce qui s'y est passé en lisant le compte-rendu sans demander autour de lui ; le MJ d'une campagne épisodique voit en un coup d'œil si une date proposée a assez d'inscrits, sans compter à la main. Contre-métrique : l'anti-spoil ne doit jamais laisser un contenu `Brouillon`/`À venir` visible en clair dans l'UI d'un joueur, même partiellement — un seul oubli de rendu gâche la surprise pour tout le groupe.

## Assumptions

- La vue MJ dédiée aux scénarios `Brouillon` (disposition, navigation exacte) n'a pas de mock produit — laissée comme détail d'implémentation Angular non structurant, à trancher en story.
- Pas de limite de caractères stricte sur le texte d'une annonce ou la description d'un scénario en v1, cohérent avec l'absence de limite similaire ailleurs dans le produit.
