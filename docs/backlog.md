# Backlog & feuille de route

> Découpage en **paliers** (milestones) livrables. Chaque palier apporte une valeur testable.
> Détail des tâches fines : à ouvrir palier par palier. Voir la vision dans `docs/spec.md`.

---

## 🎯 Principe

On avance par **incréments démontrables**. On valide l'abstraction « plugin système » tôt (palier 2),
puis on enrichit. On garde `docker compose up` fonctionnel **à chaque palier**.

---

## Palier 0 — Socle technique & onboarding *(= 1re itération, « toute première version »)*

But : un squelette qui démarre en une commande, base de la collaboration.

- [x] Monorepo (workspaces pnpm) : `apps/web` (Angular 22), `apps/api` (NestJS 11), `packages/shared`.
- [x] `docker-compose.yml` unique : web + api + Postgres 17 → `docker compose up` (image de dev avec OpenSSL).
- [x] API : `GET /health` ; connexion Postgres OK via Prisma 7 + `@prisma/adapter-pg` (`db push` ; migrations propres au palier 1).
- [x] Web : page d'accueil qui appelle `/health` et affiche « API OK / DB OK ».
- [x] `README.md` (démarrage 1 commande) + `CLAUDE.md` (contexte projet).
- [~] Outillage : Prettier/ESLint fournis par les scaffolds (lint unifié racine à finaliser).

**Done quand** : un dev clone, fait `docker compose up`, ouvre le navigateur → front qui parle à l'API qui parle à la base.

---

## Palier 1 — Comptes, modes & campagnes

- [x] Auth : **session cookie httpOnly** (argon2) ; **inscription sur invitation** ; rôle global **USER/ADMIN**. *(1a)*
- [x] Bascule **mode MJ ↔ mode Joueur** (le mode est dérivé des appartenances). *(1b)*
- [x] N'importe quel user **crée une partie** (one-shot **ou** campagne linéaire) → devient **MJ** dessus. *(1b — l'épisodique viendra avec le mode « agence »)*
- [x] **Invitations** : in-app (recherche email/pseudo, accept/refus) **+ liens** (maxUses, expiration, révocables). *(1c — inscription désormais sur invitation)*
- [x] Tableaux de bord : MJ (mes parties) ✅ / Joueur (mes parties + invitations reçues) ✅ *(1c)*.
- [ ] *(détail complet + état réel : `docs/palier-1.md` §10/§11)*

---

## Palier 2 — Moteur de système + Ryuutama + création de perso

> **Changement de plan (décidé avec l'utilisateur, 2026-07-07)** : système v1 = **Ryuutama**, pas
> Draconis — règles plus simples à modéliser, plus utile pour l'utilisateur dans l'immédiat. Draconis
> et Conte de Minuit sont repoussés plus loin dans la feuille de route (voir plus bas).

- [x] `GameSystemPlugin` + `GameSystemRegistry` (back).
- [x] Module **Ryuutama** : `sheetSchema`, `creationSteps`, `validate(strict)`, `computeDerived`.
- [x] **Back-office de contenu (CRM)** : le contenu (classes, types, catégories d'armes, patterns
      d'attributs) est seedé en **base** au démarrage (`GameSystemService.onApplicationBootstrap` →
      `ContentType`/`ContentEntry`, scope `BASE`) depuis des fichiers JSON **gitignorés**
      (`apps/api/game-systems/ryuutama/data/*.json`) qui ne servent que de source de seed pour
      reconstruire la base proprement — **jamais lus directement par l'UI**, qui passe exclusivement par
      `GET /game-systems/:id/content` (lecture DB). Respecte la raison légale (contenu propriétaire hors
      repo). *(Nuance : `getSchema()` — structure de l'assistant de création, étapes/champs — reste codée
      en dur en TypeScript, pas encore pilotée par le catalogue ; à revoir si besoin lors du Palier 11.)*
- [x] Front : **rendu de fiche** et **assistant de création pas à pas** pilotés par le schéma.
- [x] Créer un personnage (guidé), le **rattacher** à une partie (neuf ou existant compatible).

**Livré** (Épic 4) : un joueur crée un perso Ryuutama guidé par les règles, le voit dans sa partie, et
peut l'exporter en PDF (recoupe une partie du Palier 3).

---

## Palier 3 — Évolution, édition MJ & PDF

- [x] Évolution par **XP** (distribution MJ, montée de niveau guidée joueur). *(Épic 6, stories 6.2/6.3)*
- [x] **Historique / versions** de la fiche (`CharacterSnapshot`, déclencheurs montée de niveau + édition MJ). *(Épic 6, stories 6.3/6.6)*
- [x] **Inventaire / équipements** et **notes personnelles** sur la fiche du joueur. *(Épic 6, stories 6.4/6.5)*
- [x] **Édition MJ** sans contrainte (validation `mode: "mj"` indicative). *(Épic 6, story 6.6 + durcissement revue de code)*
- [x] **Export PDF** de la fiche. *(livré en avance, Épic 4 — portrait inclus)*
- [x] Champs narratifs et arme de prédilection éditables (MJ + propriétaire). *(Épic 6, story 6.7)*

---

## Palier 4 — Sessions, dispos & résumés

- [x] **Sessions** (séances) avec **participants** (sous-ensemble) — gère linéaire **et** épisodique. *(Épic 8)*
- [x] **Calendrier de dispos** + **recherche de date** (meilleur créneau) + **vote de date** entre joueurs. *(Épics 1-3)*
- [x] **Rapports / résumés** de séance, lisibles par tous les membres. *(Épic 8, stories 8.4/8.5)*
- [x] **Événements** + **timeline / historique** de la campagne ; **missions** (= scénarios / quêtes). *(Épic 7)*
- [x] Flux d'**infos/annonces** du MJ. *(Épic 9)*
- [x] **Infra e-mail (SMTP)** + notifications (rappels de séance, invitations par mail) ; débloque le **« mot de passe oublié »** self-service. *(Épic 5)*

---

## Palier 5 — Amélioration du système de jeu (contenu & fiches, propre à Ryuutama mais généralisable)

> Approfondit le système v1 (Ryuutama) au-delà de la fiche de personnage joueur, avec un souci de
> généralisation (d'autres systèmes futurs auront des besoins similaires : PNJ évolutifs, fiches
> structurées annexes). Ce qui est spécifique aux règles Ryuutama reste dans `packages/game-rules`,
> ce qui est générique (mécanisme de fiche typée, plugin) doit rester réutilisable par d'autres systèmes.

- [x] **Personnage du MJ (« Homme Dragon », Ryuutama)** : fiche distincte de celle du joueur (un seul
      par Partie), avec sa propre progression (niveau fonction du nombre de scénarios `PASSE`, pas d'XP
      distribuée) et son propre export PDF. *(Épic 10.)*
- [ ] **Fiches de référence Ryuutama** : journal, carte, monde, monstre, ville, objectifs (chasse/quête/
      voyage), œuf de bataille, structure — servies telles quelles en téléchargement PDF (journal/carte
      à tout membre, le reste au MJ seul), aucun remplissage dynamique à ce stade. *(Épic 12, en cours —
      stories 12.1/12.2 prêtes.)*
- [x] **Export PDF équipement & notes du PJ** : deux nouveaux exports auto-remplis depuis les données déjà
      en base (`Character.sheetData.equipment`, `CharacterNote`), en plus de l'export fiche complète déjà
      existant. *(Épic 11.)*

**Reliquat déplacé vers le Palier 8** : l'ajout des classes/textes manquants au contenu Ryuutama seedé
n'est plus traité en fin de Palier 5 mais fusionné dans une vraie refonte de contenu, repoussée après
la dette technique et la synchro (cf. ordre ci-dessous).

---

## Palier 6 — Dette technique accumulée *(nouveau, décidé le 2026-07-18 — premier palier après l'Épic 12)*

> Rassemble les items différés (`_bmad-output/implementation-artifacts/deferred-work.md`) jugés
> substantiels/cohérents pour justifier une passe dédiée, hors ceux explicitement écartés ou déplacés
> ailleurs (cf. `deferred-work.md`, section « Décisions actées le 2026-07-18 »).

- [ ] **Nettoyage synchronisation & anti-double-clic UI** : gardes anti-double-clic manquantes sur les
      CTA `ScenarioEditor`/`ScenarioReadDialog` (Marquer Courant, Clôturer, Participer), signaux
      d'erreur jamais réinitialisés après un rechargement externe, `_changed` non scopé par Partie,
      `loadScenarios()` sans garde de démontage, `ScenarioTimeline` pas réactif si `partieId` change.
- [ ] **Fusion du système d'inventaire équipement** : `equipment.group` (texte libre) et
      `equipment.individual` (`InventoryItem[]`) unifiés, sélection couplée nom/poids — migration
      Prisma + 2 UI (MJ et propriétaire).
- [ ] **Durcissement sécurité auth/reset** : hachage du token de reset (actuellement en clair),
      invalidation des sessions actives au reset réussi, e-mail de confirmation post-changement de mot
      de passe, rate-limit par e-mail (pas seulement IP), purge des tokens expirés.
- [ ] **Durcissement sécurité fichiers/uploads** : détection PDF par signature magique contournable,
      nettoyage EXIF des portraits uploadés (nouvelle dépendance `sharp`), header
      `X-Content-Type-Options` manquant sur les téléchargements.
- [ ] **Robustesse mineure / perf** : pagination des listes qui grossissent (historique XP, scénarios),
      idempotence des `POST` sensibles, `orderBy` déterministe sur les inscriptions. Traité comme un
      5e epic formel du Palier 6 (décision actée le 2026-07-18, cf. PRD), pas au fil de l'eau.

---

## Palier 7 — Synchronisation client/serveur en temps quasi réel (SSE) *(nouveau, décidé le 2026-07-18)*

> Pas de vrai temps réel bidirectionnel visé — juste éliminer le besoin de recharger la page pour voir
> une modif faite par quelqu'un d'autre (MJ ↔ joueur, ou un autre onglet). **Approche tranchée avec
> l'utilisateur : Server-Sent Events (SSE)**, pas de polling. Le serveur pousse un événement léger
> (« ça a changé sur la Partie X ») via une connexion HTTP longue durée (`@Sse()` NestJS, nouveau
> mécanisme d'émission — rien de tel n'existe encore dans ce projet) ; le client, en écoute, déclenche
> le refetch qu'il a déjà (pattern `changed` signal déjà en place partout, à étendre pour être aussi
> déclenché par le push serveur, pas seulement par une action locale). Touche potentiellement toutes
> les pages consommant des listes (partie, timeline, séances, calendrier).

- [ ] Mécanisme d'émission d'événements côté NestJS (scope minimal : par Partie, pas par ressource fine).
- [ ] Connexion SSE côté Angular (`EventSource` ou wrapper), reconnexion sur coupure.
- [ ] Câblage sur les pages existantes (`partie-detail`, `scenario-timeline`, `seance-list`,
      `calendar-view`) pour déclencher leur refetch déjà existant à la réception d'un événement.
- [ ] *(détail fin à cadrer avec l'utilisateur au démarrage de ce palier)*

---

## Palier 8 — Refonte complète des classes et textes Ryuutama *(nouveau, décidé le 2026-07-18)*

> Regroupe le reliquat « classes et textes manquants » du Palier 5 en une vraie passe de contenu,
> plutôt qu'un ajout ponctuel en fin de palier précédent. **À discuter ensemble au moment d'attaquer ce
> palier** — périmètre exact (quelles classes/textes, quelle profondeur) pas encore cadré.

- [ ] *(périmètre à définir avec l'utilisateur à ce moment-là)*

---

## Palier 9 — Refonte UI & harmonisation des thèmes *(ex-Palier 6)*

- [ ] Passe d'amélioration de l'UI existante (polish, cohérence visuelle inter-écrans).
- [ ] Revue des textes des 3 thèmes (Grimoire Émeraude, Forêt Ancienne, Médiéval Steampunk) —
      cohérence de registre, complétude des clés `tones.ts`, élimination des libellés orphelins/oubliés.
- [ ] `ScenarioTimeline` ne correspond pas au mockup `DESIGN.md` (retour utilisateur, 2026-07-14) : pas
      de ronds d'accroche des nœuds sur la ligne chronologique, ligne et rectangles de scénario trop
      proches (pas assez d'espacement), dates non affichées sur la ligne. Sans rapport avec les
      séances/capacité (Story 8.7) — pur défaut visuel du composant existant depuis la Story 7.5.
      **Décision le 2026-07-18 : à trancher au démarrage de ce palier** (question à reposer à
      l'utilisateur à ce moment-là — une bonne partie de l'UI sera de toute façon revue ici, autant
      décider en contexte si ce défaut mérite un traitement dédié ou se résorbe avec le reste).

---

## Palier 10 — Mise en production d'une première version *(ex-Palier 7)*

- [ ] Décision d'hébergement : auto-hébergé (VPS, Docker Compose en prod) **vs** hébergement managé
      (PaaS) — arbitrage coût / simplicité / maintenance.
- [ ] Durcissement production : variables d'environnement/secrets, HTTPS, sauvegardes base de données,
      monitoring/logs minimal.
- [ ] Procédure de déploiement (manuelle ou CI/CD minimal) documentée.
- [ ] **⚠️ Reprendre les 2 aménagements de dev faits au Palier 9 pour tester sur un vrai téléphone**
      (décidés avec l'utilisateur le 2026-08-01 — à vérifier/inverser ici, ne pas les laisser filer en prod) :
      - `apps/web/src/app/core/api-base.ts` : `API_BASE` n'est plus codé en dur sur `http://localhost:3000`,
        il est calculé depuis `window.location` (`{protocol}//{hostname}:3000`). En prod l'API sera
        vraisemblablement derrière le même domaine (reverse-proxy, chemin `/api`) et/ou en HTTPS sur 443 —
        le port 3000 en dur n'aura alors plus de sens. **À reprendre selon la topologie retenue.**
      - `apps/api/src/main.ts` + `.env` : `WEB_ORIGIN` accepte désormais une **liste** d'origines séparées
        par des virgules (pour autoriser à la fois `localhost:4200` et l'IP LAN du poste).
        **En prod, n'y laisser que l'origine publique réelle — surtout aucune IP de réseau local.**

---

## Palier 11 — 2e système (Conte de Minuit) & durcissement multi-MJ *(ex-Palier 8)*

> Ryuutama étant le système v1 (Palier 2), ce palier valide l'abstraction plugin sur un
> **2ᵉ système** avec **Conte de Minuit** (agence, épisodique — mécaniques très différentes de
> Ryuutama, bon test de l'architecture plugin).

- [ ] Module **Conte de Minuit** (`sheetSchema`, `creationSteps`, `validate`, `computeDerived`).
- [ ] Durcissement **multi-MJ** : isolation des données, invitations, permissions, polish.
- [ ] Flow **« agence »** (Conte de Minuit) : annoncer une enquête → opt-in selon dispo → équipe. *(déplacé depuis Palier 4, dépend du module Conte de Minuit livré dans ce même palier)*

---

## Palier 12 — Module Draconis (3ᵉ système) *(ex-Palier 9)*

> Repoussé depuis le Palier 2 initial (décidé avec l'utilisateur, 2026-07-07) : Ryuutama puis Conte de
> Minuit passent devant. Draconis nécessite une référence des règles (D&D 5e) — cf. spec §9.

- [ ] Module **Draconis** : `sheetSchema`, `creationSteps`, `validate(strict)`, `computeDerived`
      (basé D&D 5e — SRD/Creative Commons si possible, cf. spec §9).
- [ ] Contenu Draconis (classes, races, sorts, compétences…) seedé en base via le même mécanisme
      CRM/JSON-gitignoré que Ryuutama (Palier 2).
- [ ] Front : rendu de fiche + assistant de création pour Draconis (réutilise l'infra plugin existante).

---

## Palier 13 — Carte interactive *(ex-Palier 10)*

- [ ] Carte (Leaflet + fond image) : **marqueurs** (lieux, événements, scénarios), **routes**.
- [ ] **Visibilité contrôlée par le MJ** (révéler / masquer aux joueurs).

---

## Palier 14 — Contenu personnalisable par le MJ (homebrew) *(ex-Palier 11)*

- [ ] Le MJ **ajoute / édite** des entrées (classes, métiers, compétences…) par-dessus le catalogue
      d'un système existant, scope `MJ` / `PARTIE` (le scope `BASE` sert déjà au contenu officiel
      depuis le Palier 2 — `ContentType`/`ContentEntry` existent déjà en base).
- [ ] Interface MJ pour saisir/éditer ce contenu custom.
- [ ] Moteur de règles et assistant de création **lisent le catalogue fusionné** (`BASE` + `MJ`/`PARTIE`
      du MJ courant).

---

## Idées / plus tard

- **Éditeur de système complet** : un MJ définit un nouveau système (types de contenu + schéma de fiche +
  règles simples) **sans coder**. Ambitieux.
- Notifications (e-mail / in-app).
- Import de perso existant entre parties du même système.
- Rôles avancés / modération (si plateforme publique).
- Thèmes par univers.
- **Aperçu résumé + détail au clic pour les types (assistant de création)** : à l'étape Type, afficher les courts textes de `docs/assistant.md` (ex. "Le voyageur sait comment se débarrasser des monstres.") en aperçu par type, avec un clic pour afficher la description complète déjà seedée dans `types.json` (effets, avantages...). Idée notée le 2026-07-26 pendant la Story 23.3, non implémentée (hors scope).
