---
title: 'PRD — Palier 5 : Homme Dragon (Ryuutama) & fiches de référence annexes'
status: final
created: '2026-07-15'
updated: '2026-07-15'
---

# PRD: Palier 5 — Homme Dragon (Ryuutama) & fiches de référence annexes
*Working title — confirm.*

## 0. Document Purpose

Ce PRD complète le Palier 4 (Sessions, dispos & résumés, cf. `prd-jdr-master-20260711`) en couvrant le premier lot du Palier 5 : la fiche du personnage du MJ (« Homme Dragon », spécifique au système Ryuutama), deux nouveaux exports PDF pour la fiche joueur, et le téléchargement des fiches de référence officielles Ryuutama. Il s'appuie directement sur la spine architecture déjà finalisée (`_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md`) et sur `docs/backlog.md` (Palier 5) — ce document formule le **quoi** produit ; le **comment** technique vit dans la spine, référencée par capacité plutôt que dupliquée.

## 1. Vision

Un MJ qui fait tourner une campagne Ryuutama sur la plateforme joue lui aussi un personnage — l'Homme Dragon, une figure protectrice qui accompagne les voyageurs, évolue avec la campagne et intervient dans l'histoire. Aujourd'hui, rien dans l'outil ne modélise ce personnage : le MJ doit le suivre à la main, hors de l'application. Ce palier lui donne une fiche numérique dédiée qui se construit une fois puis évolue toute seule au rythme des scénarios joués — sans ressaisie, sans risque de désynchronisation avec la campagne réelle — et qu'il peut exporter en PDF pour jouer à table comme n'importe quel joueur.

En complément, deux petites lacunes d'export PDF côté joueur sont comblées (équipement, notes), et l'ensemble des fiches de référence officielles Ryuutama (monde, ville, monstre, objectifs...) devient téléchargeable directement depuis l'application plutôt que cherché ailleurs.

## 2. Target User

### 2.1 Jobs To Be Done

- En tant que MJ, je veux que mon propre personnage (Homme Dragon) évolue automatiquement avec ma campagne, pour ne jamais avoir à recalculer son niveau ou ses ressources à la main.
- En tant que MJ, je veux imprimer/exporter la fiche de mon Homme Dragon comme celle de mes joueurs, pour jouer à table sans jongler entre outils.
- En tant que joueur, je veux pouvoir sortir une version imprimable de mon inventaire ou de mes notes sans dupliquer la saisie.
- En tant que MJ, je veux accéder aux fiches de référence Ryuutama (monde, ville, monstres...) directement depuis l'app, sans aller chercher les PDF ailleurs.

### 2.2 Key User Journeys

- **UJ-1. Le MJ crée son Homme Dragon en démarrant sa campagne.** À la création de sa Partie Ryuutama, le MJ ouvre l'onglet Homme Dragon, choisit sa race (ex. Dragon Rouge), sélectionne un artefact parmi les 3 proposés (Grand arc/Grande épée/Grande lance), lui donne un nom, remplit les champs narratifs (apparence, vocation, demeure...). Il exporte immédiatement la fiche en PDF pour la première séance.
- **UJ-2. Le MJ consulte son Homme Dragon après plusieurs séances.** Après la clôture du 3e scénario de sa campagne, le MJ rouvre la fiche : le niveau est passé à 3 automatiquement, l'historique liste les 3 scénarios joués avec leurs dates et participants, et un pouvoir d'éveil l'attend pour être choisi. **Cas limite** : si le MJ n'a encore clos aucun scénario, la fiche affiche niveau 1 et un historique vide, sans erreur.
- **UJ-3. Un joueur exporte sa fiche d'équipement avant une séance.** Le joueur ouvre sa fiche de personnage, clique sur « Exporter équipement », et obtient un PDF pré-rempli avec son inventaire actuel, prêt à imprimer.

## 3. Glossary

- **Homme Dragon** — Le personnage du Meneur de Jeu (MJ) dans le système Ryuutama : une figure protectrice (race dragon) qui accompagne et peut intervenir auprès des joueurs. Un seul par Partie, rattaché au compte du MJ.
- **Race** — L'une des 4 origines possibles de l'Homme Dragon (Dragon Vert / Bleu / Rouge / Noir), fixée à la création, qui détermine les artefacts disponibles.
- **Artefact** — Objet emblématique choisi par le MJ parmi les 3 propres à sa race (12 au total) ; personnalisable par un nom et une inscription libres.
- **Points de Souffle (PS)** — Ressource de l'Homme Dragon utilisée pour ses capacités de souffle/éveil ; sa valeur maximale dépend du niveau, affichée mais non suivie par l'application pendant le jeu.
- **Pouvoir d'éveil** — Capacité spéciale débloquée par l'Homme Dragon à certains paliers de niveau, choisie par le MJ dans une liste.
- **Fiche de référence** — Document PDF officiel Ryuutama (monde, ville, monstre, journal, carte, objectifs, œuf de bataille, structure) téléchargeable tel quel depuis l'application, sans données de la campagne injectées.
- **Scénario `Passé`** — Terme déjà en usage (Palier 4) : un scénario dont le statut est `PASSE`, jouable a posteriori sans risque de révéler un contenu à venir.

## 4. Features

### 4.1 Fiche Homme Dragon

**Description :** Le MJ d'une Partie Ryuutama crée et consulte la fiche de son propre personnage, l'Homme Dragon. La fiche se compose une fois (race, artefact, champs narratifs) puis évolue automatiquement au rythme des scénarios clos par le MJ — jamais de ressaisie manuelle du niveau, des ressources, de l'historique ou des compagnons protégés. Réalise UJ-1, UJ-2.

**Functional Requirements:**

#### FR-1: Création de la fiche Homme Dragon

Le MJ d'une Partie Ryuutama peut créer un Homme Dragon pour sa Partie — un seul, rattaché à son propre compte.

**Consequences (testable):**
- Une tentative de création d'un deuxième Homme Dragon sur la même Partie est rejetée.
- Un joueur (non-MJ) ne peut pas créer/modifier l'Homme Dragon de la Partie.

#### FR-2: Choix de race et d'artefact

À la création, le MJ choisit une race parmi 4 (Dragon Vert/Bleu/Rouge/Noir) ; ce choix détermine les 3 artefacts proposés (12 au total, 3 par race). Le MJ sélectionne un artefact et peut lui donner un nom et une inscription libres.

**Consequences (testable):**
- Seuls les 3 artefacts de la race choisie sont proposés.
- Nom et inscription de l'artefact sont optionnels et éditables après coup.
- Le changement d'artefact reste toujours possible techniquement, à tout moment — la règle « jamais en cours de scénario » est une convention de table, non imposée par l'application.

**Out of Scope:**
- Aucun historique des artefacts précédemment choisis n'est conservé.

#### FR-3: Champs narratifs et avatar

Le MJ renseigne des champs texte libre : nom, apparence, caractère, vocation, demeure, avatar (la 3e forme de l'Homme Dragon), et « mondes protégés » (pré-rempli avec le titre de la Partie/one-shot à la création, éditable ensuite).

**Consequences (testable):**
- Tous ces champs sont optionnels sauf le nom.
- « Mondes protégés » est pré-rempli à la création mais reste librement modifiable.

#### FR-4: Voyageurs protégés et historique dérivés automatiquement

La fiche affiche la liste des « voyageurs protégés » (les membres actuels de la Partie) et un historique des scénarios joués (titre, date, personnages participants) — l'un et l'autre calculés à partir de l'état réel de la Partie, jamais saisis manuellement.

**Consequences (testable):**
- L'historique ne liste jamais un scénario qui n'a pas encore été joué (statut ≠ `Passé`).
- Ajouter/retirer un membre de la Partie met à jour la liste des voyageurs protégés sans action du MJ.
- L'historique se met à jour dès la clôture d'un nouveau scénario, sans action du MJ.

#### FR-5: Progression de niveau automatique

Le niveau de l'Homme Dragon (1 à 5) progresse automatiquement selon le nombre de scénarios `Passé` de la Partie : 1 scénario → niveau 2, 3 → niveau 3, 7 → niveau 4, 12 → niveau 5.

**Consequences (testable):**
- Le niveau affiché correspond toujours au nombre réel de scénarios `Passé`, recalculé à chaque consultation.
- Aucune action manuelle du MJ ne peut forcer un niveau différent de celui calculé.

#### FR-6: Choix d'un pouvoir d'éveil au changement de niveau

Quand la fiche est consultée après un changement de niveau, le MJ est invité à choisir un pouvoir d'éveil parmi ceux débloqués à ce niveau.

**Consequences (testable):**
- Le choix proposé ne contient que les pouvoirs du niveau nouvellement atteint.
- Un choix déjà fait à un niveau donné n'est pas re-proposé — le pouvoir choisi est conservé sur la fiche (donnée saisie, pas recalculée, contrairement au niveau/PS eux-mêmes).
- Si plusieurs seuils sont franchis entre deux consultations (le MJ n'a pas rouvert la fiche depuis longtemps), un choix est proposé pour **chaque** niveau intermédiaire non encore pourvu, pas seulement le niveau final atteint.

#### FR-7: Points de Souffle affichés

La fiche affiche la valeur maximale de Points de Souffle (PS) correspondant au niveau actuel (3 aux niveaux 1-2, 5 aux niveaux 3-4, 10 au niveau 5).

**Consequences (testable):**
- La valeur affichée change automatiquement au changement de niveau.

**Out of Scope:**
- Aucun suivi de dépense/récupération de PS en cours de partie — reste géré à table.

#### FR-8: Export PDF de la fiche Homme Dragon

Le MJ peut exporter sa fiche Homme Dragon en PDF pré-rempli, prêt à imprimer.

**Consequences (testable):**
- Le PDF exporté reflète l'état courant de la fiche (y compris niveau/PS/historique calculés).

**Feature-specific NFRs:**
- Lecture de la fiche ouverte à tout membre de la Partie (aucune donnée exposée ne révèle un scénario non joué — pas de risque de spoil, contrairement à un scénario) ; écriture réservée au MJ.

### 4.2 Exports PDF joueur additionnels

**Description :** Deux nouveaux exports PDF viennent compléter l'export de fiche complète déjà existant, en réutilisant les données déjà saisies par le joueur. Réalise UJ-3.

**Functional Requirements:**

#### FR-9: Export PDF de l'équipement

Un joueur (ou le MJ pour l'un de ses joueurs) peut exporter un PDF pré-rempli listant l'équipement de son personnage, à partir des données déjà présentes sur la fiche.

**Consequences (testable):**
- Le PDF reflète l'équipement actuel du personnage sans ressaisie.

**Out of Scope:**
- Pas de catalogue d'équipement partagé/campagne — uniquement l'inventaire individuel du personnage exporté.

#### FR-10: Export PDF des notes

Un joueur peut exporter un PDF pré-rempli de ses notes de personnage existantes.

**Consequences (testable):**
- Le PDF reflète les notes actuelles du personnage sans ressaisie.

### 4.3 Fiches de référence Ryuutama

**Description :** L'ensemble des fiches de référence officielles Ryuutama devient téléchargeable directement depuis l'application, avec deux niveaux d'accès selon la fiche.

**Functional Requirements:**

#### FR-11: Téléchargement des fiches accessibles à tout membre

Tout membre d'une Partie Ryuutama peut télécharger les fiches « journal » et « carte » telles quelles.

#### FR-12: Téléchargement des fiches réservées au MJ

Le MJ seul peut télécharger les fiches « monde », « monstre », « ville », « objectif » (3 variantes : chasse/quête/voyage), « œuf de bataille » et « structure » — ces fiches concernent la préparation/le contenu de la campagne (adversaires, lieux, enjeux), du ressort du MJ, contrairement au journal/à la carte qui sont des outils individuels de joueur.

**Consequences (testable):**
- Un joueur non-MJ qui tente d'accéder à une fiche MJ-only reçoit un refus explicite, pas un fichier vide ou une erreur générique.

#### FR-13: Fiches servies telles quelles

Aucune fiche de référence (FR-11, FR-12) n'est pré-remplie avec des données de la campagne à ce stade — elle est téléchargée dans son état officiel d'origine.

**Consequences (testable):**
- Une demande de fiche par une clé inexistante renvoie une erreur claire (« introuvable »), jamais un fichier incorrect ou une réponse silencieuse.

## 5. Non-Goals (Explicit)

- Pas de journal de campagne éditable en ligne (distinct des notes personnelles du joueur) — reste une idée future non retenue ici.
- Pas de catalogue d'équipement partagé/campagne au-delà de l'inventaire individuel exporté (FR-9).
- Pas de remplissage dynamique des fiches monde/monstre/ville/objectifs/œuf de bataille/structure — servies vierges (FR-13).
- Pas de support pour plusieurs Homme Dragon / PNJ multiples par Partie — un seul MJ, un seul personnage.
- Pas d'historique des changements d'artefact.
- Pas de registre générique de plugin multi-système — reste spécifique à Ryuutama, comme le reste du moteur de fiche aujourd'hui. *(Le mécanisme générique déjà en place — `sheetData`/`GameSystem`/`ContentType`/`ContentEntry`, cf. spine AD-1/AD-4 — reste, lui, réutilisable ; seul le registre de sélection automatique par système est différé, cohérent avec l'esprit de généralisation du backlog.)*
- L'ajout des classes/textes manquants au contenu Ryuutama seedé (3e item du backlog Palier 5) est traité comme du contenu, hors périmètre de ce PRD — à reprendre directement en story, sans PRD dédié.

## 6. MVP Scope

### 6.1 In Scope
- FR-1 à FR-13 (fiche Homme Dragon complète, 2 exports PDF joueur additionnels, téléchargement des 10 fiches de référence).

### 6.2 Out of Scope for MVP
- Tout ce qui figure en §5 Non-Goals.
- `[NOTE FOR PM]` Le remplissage dynamique des fiches monde/monstre/ville/objectifs reste une piste plausible si un besoin concret émerge à l'usage — non écarté définitivement, juste non retenu maintenant.

## 7. Success Metrics

Contexte hobby — pas de métriques quantitatives formelles.

- **Succès** : le MJ utilise la fiche Homme Dragon à chaque séance de sa campagne en cours, sans revenir à un suivi papier/externe.
- **Contre-mesure** : ne pas ajouter de complexité (ex. suivi de PS en jeu) tant qu'aucun besoin concret ne l'exige — la simplicité de la fiche est elle-même un critère de succès.

## 8. Open Questions

1. La contrainte « un seul Homme Dragon par Partie » (Non-Goal §5) ferme la porte à un futur roster de PNJ multiples pour d'autres systèmes — à confirmer que c'est acceptable à long terme, ou à revisiter si un futur système de jeu en a besoin.
2. Le contenu exact des fiches monde/ville/objectifs/œuf de bataille/structure (au-delà de « monstre », qui a des valeurs calculées identifiées) n'a pas été vérifié champ par champ — si un besoin de remplissage dynamique émerge, il faudra le spécifier fiche par fiche.

## 9. Assumptions Index

- [ASSUMPTION §4.1 FR-6] Le choix de pouvoir d'éveil est proposé "à la prochaine ouverture de la fiche" après franchissement d'un seuil — pas de notification push, cohérent avec l'absence de notifications e-mail sur ce type d'événement (Non-Goal déjà acté au Palier 4).
- [ASSUMPTION §4.1 FR-1] Seul le MJ peut créer/consulter en écriture la fiche Homme Dragon — un joueur ne peut jamais la modifier, seulement la lire (cohérent avec le reste du modèle d'accès Partie).
