---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-15/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md
---

# jdr-master - Epic Breakdown — Palier 5 : Homme Dragon (Ryuutama) & fiches de référence annexes

## Overview

Ce document décompose les requirements du PRD "Palier 5 — Homme Dragon (Ryuutama) & fiches de référence annexes" et de sa spine architecture en epics et stories implémentables. Pas de document UX dédié pour ce palier (aucune UI significativement nouvelle — extension des vues personnage/scénario/partie existantes).

## Requirements Inventory

### Functional Requirements

FR1: Le MJ d'une Partie Ryuutama peut créer un Homme Dragon pour sa Partie — un seul, rattaché à son propre compte. Une tentative de création d'un deuxième est rejetée. Un joueur (non-MJ) ne peut pas créer/modifier l'Homme Dragon de la Partie.

FR2: À la création, le MJ choisit une race parmi 4 (Dragon Vert/Bleu/Rouge/Noir) qui détermine les 3 artefacts proposés (12 au total, 3 par race). Le MJ sélectionne un artefact et peut lui donner un nom et une inscription libres, éditables après coup. Le changement d'artefact reste toujours possible techniquement (convention de table, non imposée par l'app) ; aucun historique des changements passés n'est conservé.

FR3: Le MJ renseigne des champs texte libre sur la fiche : nom, apparence, caractère, vocation, demeure, avatar (3e forme), et « mondes protégés » (pré-rempli avec le titre de la Partie/one-shot à la création, éditable ensuite). Tous optionnels sauf le nom.

FR4: La fiche affiche automatiquement les « voyageurs protégés » (membres actuels de la Partie) et un historique des scénarios joués (titre, date, participants) — calculés à partir de l'état réel de la Partie, jamais saisis manuellement. L'historique ne liste jamais un scénario non encore joué (statut ≠ `Passé`) ; les deux se mettent à jour sans action du MJ.

FR5: Le niveau de l'Homme Dragon (1 à 5) progresse automatiquement selon le nombre de scénarios `Passé` de la Partie : 1 → niveau 2, 3 → niveau 3, 7 → niveau 4, 12 → niveau 5. Recalculé à chaque consultation, jamais forçable manuellement.

FR6: Quand la fiche est consultée après un changement de niveau, le MJ est invité à choisir un pouvoir d'éveil parmi ceux débloqués à ce niveau. Le choix est conservé (donnée saisie). Si plusieurs seuils sont franchis entre deux consultations, un choix est proposé pour chaque niveau intermédiaire non encore pourvu.

FR7: La fiche affiche la valeur maximale de Points de Souffle (PS) correspondant au niveau actuel (3 aux niveaux 1-2, 5 aux niveaux 3-4, 10 au niveau 5) — affichage seul, aucun suivi de dépense/récupération en jeu dans l'app.

FR8: Le MJ peut exporter sa fiche Homme Dragon en PDF pré-rempli reflétant l'état courant (niveau/PS/historique inclus).

FR9: Un joueur (ou le MJ pour l'un de ses joueurs) peut exporter un PDF pré-rempli listant l'équipement de son personnage, à partir des données déjà présentes sur la fiche — pas de catalogue d'équipement partagé, uniquement l'inventaire individuel.

FR10: Un joueur peut exporter un PDF pré-rempli de ses notes de personnage existantes.

FR11: Tout membre d'une Partie Ryuutama peut télécharger les fiches de référence « journal » et « carte » telles quelles.

FR12: Le MJ seul peut télécharger les fiches de référence « monde », « monstre », « ville », « objectif » (3 variantes : chasse/quête/voyage), « œuf de bataille » et « structure ». Un joueur non-MJ qui tente d'y accéder reçoit un refus explicite, pas un fichier vide.

FR13: Aucune fiche de référence (FR11, FR12) n'est pré-remplie avec des données de la campagne — servie dans son état officiel d'origine. Une demande par clé inexistante renvoie une erreur claire (« introuvable »), jamais un fichier incorrect ou une réponse silencieuse.

### NonFunctional Requirements

NFR1: Lecture de la fiche Homme Dragon ouverte à tout membre de la Partie (aucune donnée exposée ne révèle un scénario non joué — pas de risque de spoil) ; écriture réservée au MJ.

NFR2: Toute valeur dérivable d'une autre source de vérité sur la fiche Homme Dragon (niveau, PS, historique, voyageurs protégés) est calculée à la lecture, jamais stockée ni éditable manuellement — élimine tout risque de désynchronisation avec l'état réel de la Partie.

### Additional Requirements

- Nouveau modèle de données `HommeDragon` (Prisma), un par `[userId, partieId, gameSystemId]`, sans colonne `derived` (niveau/PS recalculés à chaque requête, jamais persistés) — cf. spine AD-1/AD-2/AD-3.
- Nouveau module NestJS dédié `apps/api/src/homme-dragon/` (jamais fondu dans `CharacterModule` existant) — cf. spine AD-1.
- Deux nouveaux catalogues `ContentType`/`ContentEntry` (`hommeDragonArtefact`, `eveilPower`), seedés depuis de nouveaux fichiers JSON dans `game-systems/ryuutama/data/` au bootstrap — cf. spine AD-4. Format minimal : `{ key, label, race }` pour les artefacts, `{ key, label, levelUnlocked }` pour les pouvoirs d'éveil.
- Fonction pure `validateHommeDragon()` dans `packages/game-rules/ryuutama` pour la validation référentielle de l'artefact choisi — jamais dupliquée côté frontend au-delà d'un affichage des options valides — cf. spine AD-4.
- Nouvelle table de seuils de niveau dédiée (distincte de `LEVEL_TABLE` du PJ) et fonction pure `computeHommeDragonDerived(level)` dans `packages/game-rules/ryuutama` — cf. spine AD-3.
- Export PDF Homme Dragon : réutilise le pattern `RyuutamaPdfService`/`mapToPdfFields()` existant, charge le template déjà présent `Ryuutama_fiche_homme-dragon_big_edit.pdf` — cf. spine AD-1.
- Exports PDF équipement/notes : nouvelles capacités sur `CharacterModule` existant (aucun nouveau modèle), templates `Ryuutama-fiche_equipement_edit.pdf` et `Ryuutama_fiche_de_notes_edit.pdf`, nouvelles fonctions de mapping dans `packages/game-rules/ryuutama` — cf. spine AD-6.
- `GameSystemModule` importe `PartiesModule` et expose `GET /parties/:id/game-systems/:systemId/assets/:key` (`StreamableFile`) pour le téléchargement statique des 10 fiches de référence, avec une table de correspondance exhaustive `key → { file, access }` (`member` ou `mj`) et 404 explicite sur clé inconnue — cf. spine AD-5.
- Aucun registre de plugin générique par système — le module Homme Dragon n'est exposé que pour Ryuutama, même pattern codé en dur que le reste du code existant (`GameSystemService.getSchema()`) — cf. spine Deferred.
- Aucune migration de schéma pour les exports PDF équipement/notes ni pour le service de fichiers statiques (aucune nouvelle donnée en base pour ces deux capacités).

### UX Design Requirements

Aucun document UX dédié à ce palier — pas de nouveau pattern d'interaction ; les nouvelles vues (fiche Homme Dragon, boutons d'export PDF, liens de téléchargement de fiches de référence) réutilisent les composants/patterns déjà établis (cartes de personnage, panneaux de fiche, boutons d'export existants).

### FR Coverage Map

FR1: Epic 10 - Création de la fiche Homme Dragon
FR2: Epic 10 - Choix de race et d'artefact
FR3: Epic 10 - Champs narratifs et avatar
FR4: Epic 10 - Voyageurs protégés et historique dérivés automatiquement
FR5: Epic 10 - Progression de niveau automatique
FR6: Epic 10 - Choix d'un pouvoir d'éveil au changement de niveau
FR7: Epic 10 - Points de Souffle affichés
FR8: Epic 10 - Export PDF de la fiche Homme Dragon
FR9: Epic 11 - Export PDF de l'équipement
FR10: Epic 11 - Export PDF des notes
FR11: Epic 12 - Téléchargement des fiches accessibles à tout membre
FR12: Epic 12 - Téléchargement des fiches réservées au MJ
FR13: Epic 12 - Fiches servies telles quelles

## Epic List

### Epic 10: Le MJ joue son propre personnage (Homme Dragon)
Le MJ crée la fiche de son Homme Dragon (race, artefact, champs narratifs) puis la voit évoluer automatiquement au rythme des scénarios joués (niveau, PS, historique, voyageurs protégés, pouvoirs d'éveil), sans jamais ressaisir ces données — et peut l'exporter en PDF pour jouer à table.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8

### Epic 11: Le joueur exporte facilement sa fiche
Un joueur peut exporter en PDF pré-rempli son équipement ou ses notes de personnage, sans ressaisie, en complément de l'export de fiche complète déjà existant.
**FRs covered:** FR9, FR10

### Epic 12: Accès aux fiches de référence Ryuutama
Tout membre d'une Partie Ryuutama télécharge les fiches de référence officielles (journal, carte) ; le MJ seul télécharge les fiches de préparation de campagne (monde, monstre, ville, objectifs, œuf de bataille, structure) — toutes servies telles quelles.
**FRs covered:** FR11, FR12, FR13

## Epic 10: Le MJ joue son propre personnage (Homme Dragon)

Le MJ crée la fiche de son Homme Dragon (race, artefact, champs narratifs) puis la voit évoluer automatiquement au rythme des scénarios joués (niveau, PS, historique, voyageurs protégés, pouvoirs d'éveil), sans jamais ressaisir ces données — et peut l'exporter en PDF pour jouer à table.

### Story 10.1: Créer sa fiche Homme Dragon

As a MJ,
I want créer la fiche de mon Homme Dragon pour ma Partie Ryuutama,
So that mon propre personnage existe dans l'outil, prêt à évoluer avec ma campagne.

**Acceptance Criteria:**

**Given** je suis le MJ d'une Partie Ryuutama sans Homme Dragon existant
**When** je crée mon Homme Dragon en choisissant une race (Dragon Vert/Bleu/Rouge/Noir), un artefact parmi les 3 propres à cette race, et en renseignant les champs narratifs (nom obligatoire ; apparence, caractère, vocation, demeure, avatar, mondes protégés optionnels)
**Then** la fiche est créée et rattachée à mon compte et à ma Partie
**And** seuls les 3 artefacts de la race choisie m'étaient proposés
**And** le champ « mondes protégés » était pré-rempli avec le titre de ma Partie/one-shot, modifiable avant validation

**Given** j'ai déjà un Homme Dragon sur cette Partie
**When** je tente d'en créer un second
**Then** la création est rejetée

**Given** je suis un joueur (non-MJ) de la Partie
**When** je tente de créer ou modifier l'Homme Dragon de cette Partie
**Then** l'action est refusée

**Given** mon Homme Dragon existe déjà, avec un artefact choisi
**When** je change d'artefact (nom et inscription personnalisés inclus) à tout moment
**Then** le changement est accepté sans blocage technique (la règle « jamais en cours de scénario » reste une convention de table)
**And** aucun historique des artefacts précédents n'est conservé

### Story 10.2: Consulter historique et voyageurs protégés

As a MJ,
I want voir automatiquement l'historique des scénarios joués et la liste des voyageurs protégés sur la fiche de mon Homme Dragon,
So that je n'aie jamais à les ressaisir manuellement.

**Acceptance Criteria:**

**Given** ma Partie a des scénarios au statut `Passé` et des membres actifs
**When** j'ouvre la fiche de mon Homme Dragon
**Then** je vois la liste des voyageurs protégés correspondant aux membres actuels de la Partie
**And** je vois un historique listant chaque scénario `Passé` avec son titre, sa date et ses personnages participants

**Given** aucun scénario de ma Partie n'est encore `Passé`
**When** j'ouvre la fiche
**Then** l'historique est vide, sans erreur

**Given** un scénario de ma Partie est au statut `Brouillon`, `À venir` ou `Courant`
**When** je consulte l'historique de mon Homme Dragon
**Then** ce scénario n'y apparaît jamais

**Given** un membre rejoint ou quitte ma Partie, ou un nouveau scénario passe `Passé`
**When** je rouvre la fiche de mon Homme Dragon
**Then** voyageurs protégés et historique reflètent l'état à jour, sans action de ma part

### Story 10.3: Voir son niveau et ses Points de Souffle progresser automatiquement

As a MJ,
I want que le niveau et les Points de Souffle de mon Homme Dragon progressent automatiquement avec les scénarios joués,
So that je n'aie jamais à recalculer ces valeurs à la main.

**Acceptance Criteria:**

**Given** ma Partie compte 0 scénario `Passé`
**When** je consulte la fiche de mon Homme Dragon
**Then** le niveau affiché est 1 et les PS affichés sont 3

**Given** ma Partie compte 1, 3, 7 ou 12 scénarios `Passé`
**When** je consulte la fiche
**Then** le niveau affiché est respectivement 2, 3, 4 ou 5
**And** les PS affichés sont respectivement 3, 5, 5 et 10 (5 aux niveaux 3 et 4, 10 au niveau 5)

**Given** un nouveau scénario de ma Partie passe au statut `Passé`
**When** je rouvre la fiche de mon Homme Dragon
**Then** le niveau et les PS sont recalculés sans action de ma part

**Given** je consulte la fiche de mon Homme Dragon
**When** j'observe les champs niveau/PS
**Then** aucune action de l'interface ne permet de forcer une valeur différente de celle calculée

### Story 10.4: Choisir un pouvoir d'éveil au changement de niveau

As a MJ,
I want être invité à choisir un pouvoir d'éveil quand mon Homme Dragon change de niveau,
So that sa progression narrative reste sous mon contrôle.

**Acceptance Criteria:**

**Given** mon Homme Dragon vient de franchir un seuil de niveau depuis ma dernière consultation
**When** j'ouvre la fiche
**Then** je suis invité à choisir un pouvoir d'éveil parmi ceux débloqués à ce niveau

**Given** j'ai déjà choisi un pouvoir d'éveil pour un niveau donné
**When** je consulte à nouveau la fiche
**Then** ce choix n'est pas re-proposé et reste visible sur la fiche

**Given** plusieurs seuils de niveau ont été franchis depuis ma dernière consultation (je n'ai pas rouvert la fiche depuis longtemps)
**When** j'ouvre la fiche
**Then** un choix de pouvoir d'éveil m'est proposé pour chaque niveau intermédiaire non encore pourvu, pas seulement pour le niveau final atteint

### Story 10.5: Exporter sa fiche en PDF

As a MJ,
I want exporter la fiche de mon Homme Dragon en PDF pré-rempli,
So that je puisse jouer à table comme mes joueurs.

**Acceptance Criteria:**

**Given** ma fiche Homme Dragon existe, avec un niveau/PS/historique/artefact déjà déterminés
**When** je déclenche l'export PDF
**Then** j'obtiens un fichier PDF reflétant l'état courant complet de la fiche (champs narratifs, artefact, niveau, PS, historique)

**Given** je modifie un champ de ma fiche (ex. artefact, champs narratifs) après un premier export
**When** j'exporte à nouveau
**Then** le nouveau PDF reflète les valeurs à jour, pas celles du premier export

## Epic 11: Le joueur exporte facilement sa fiche

Un joueur peut exporter en PDF pré-rempli son équipement ou ses notes de personnage, sans ressaisie, en complément de l'export de fiche complète déjà existant.

### Story 11.1: Exporter son équipement en PDF

As a joueur,
I want exporter un PDF pré-rempli de l'équipement de mon personnage,
So that je puisse l'imprimer sans ressaisir mon inventaire.

**Acceptance Criteria:**

**Given** mon personnage a un équipement déjà renseigné sur sa fiche
**When** je déclenche l'export PDF équipement
**Then** j'obtiens un fichier PDF listant cet équipement, sans ressaisie de ma part

**Given** je modifie l'équipement de mon personnage après un premier export
**When** j'exporte à nouveau
**Then** le nouveau PDF reflète l'équipement à jour

**Given** je suis le MJ
**When** j'exporte l'équipement d'un personnage joueur de ma Partie
**Then** l'export fonctionne pour ce personnage comme s'il était le mien

### Story 11.2: Exporter ses notes en PDF

As a joueur,
I want exporter un PDF pré-rempli de mes notes de personnage,
So that je puisse les imprimer sans ressaisir mon journal.

**Acceptance Criteria:**

**Given** mon personnage a des notes déjà renseignées
**When** je déclenche l'export PDF notes
**Then** j'obtiens un fichier PDF listant ces notes, sans ressaisie de ma part

**Given** je modifie mes notes après un premier export
**When** j'exporte à nouveau
**Then** le nouveau PDF reflète les notes à jour

## Epic 12: Accès aux fiches de référence Ryuutama

Tout membre d'une Partie Ryuutama télécharge les fiches de référence officielles (journal, carte) ; le MJ seul télécharge les fiches de préparation de campagne (monde, monstre, ville, objectifs, œuf de bataille, structure) — toutes servies telles quelles.

### Story 12.1: Télécharger les fiches accessibles à tout membre

As a membre d'une Partie Ryuutama (joueur ou MJ),
I want télécharger les fiches de référence « journal » et « carte »,
So that je dispose des documents officiels sans les chercher ailleurs.

**Acceptance Criteria:**

**Given** je suis membre d'une Partie Ryuutama (joueur ou MJ)
**When** je demande le téléchargement de la fiche « journal » ou « carte »
**Then** je reçois le PDF officiel tel quel, sans donnée de ma campagne injectée

**Given** je demande une fiche avec une clé qui n'existe pas
**When** la requête est traitée
**Then** je reçois une erreur claire (« introuvable »), jamais un fichier incorrect ni une réponse silencieuse

**Given** je ne suis pas membre de la Partie concernée
**When** je tente de télécharger une fiche « journal » ou « carte » de cette Partie
**Then** l'accès est refusé

### Story 12.2: Télécharger les fiches réservées au MJ

As a MJ,
I want télécharger les fiches de préparation de campagne (monde, monstre, ville, objectifs, œuf de bataille, structure),
So that je dispose de tous les documents officiels nécessaires à la préparation, sans les chercher ailleurs.

**Acceptance Criteria:**

**Given** je suis le MJ d'une Partie Ryuutama
**When** je demande le téléchargement d'une des fiches « monde », « monstre », « ville », « objectif-chasse », « objectif-quête », « objectif-voyage », « œuf de bataille » ou « structure »
**Then** je reçois le PDF officiel tel quel, sans donnée de ma campagne injectée

**Given** je suis un joueur non-MJ de la Partie
**When** je tente de télécharger une de ces fiches réservées au MJ
**Then** je reçois un refus explicite, jamais un fichier vide ou une erreur générique

**Given** je demande une fiche MJ avec une clé qui n'existe pas
**When** la requête est traitée
**Then** je reçois une erreur claire (« introuvable »)
