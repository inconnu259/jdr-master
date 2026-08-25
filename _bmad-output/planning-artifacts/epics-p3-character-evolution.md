---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/prd.md
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-20260707/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md
---

# jdr-master - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for jdr-master, decomposing the requirements from the PRD "Évolution du personnage, historique & édition MJ (Palier 3)", its UX design contract, and its Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Le MJ d'une Partie peut ouvrir un formulaire de distribution d'XP depuis la page de la Partie (403 pour tout autre rôle) ; le formulaire liste tous les joueurs ayant un personnage actif rattaché, chacun avec un montant proposé, modifiable individuellement avant confirmation.

FR2: Le système calcule un montant d'XP suggéré à partir de trois entrées saisies par le MJ (difficulté max du voyage → table 100/200/300/500 XP, +50 XP par souffle de l'homme-dragon, +10×niveau du monstre le plus fort vaincu) ; le calcul n'est qu'une aide, jamais bloquant, ajustable par le MJ avant confirmation.

FR3: Le MJ peut ajouter un bonus d'XP à un ou plusieurs joueurs spécifiques, en plus du montant commun, sans affecter les autres joueurs.

FR4: Le MJ peut associer une note libre optionnelle à une distribution d'XP, conservée avec l'instantané créé pour chaque personnage concerné et consultable depuis l'historique.

FR5: Le système détecte à la volée qu'un personnage a franchi un ou plusieurs seuils de niveau dès qu'une distribution porte son XP cumulé au-delà du seuil suivant (jamais saisi manuellement) ; un saut de plusieurs niveaux d'un coup s'applique séquentiellement, chacun avec ses propres gains.

FR6: Quand son personnage a franchi un seuil, le propriétaire est guidé pour appliquer les gains de ce niveau (état "à traiter" tant que non appliqué, jamais automatique) ; une fois validés, la fiche est mise à jour, un instantané est créé, et le niveau suivant déjà franchi est proposé si applicable.

FR7: À chaque niveau gagné, le joueur répartit exactement 3 points entre son maximum de PV et son maximum de PE (librement, y compris tout sur un seul des deux) ; `derived.PV`/`derived.PE` intègrent le bonus cumulé des répartitions passées.

FR8: À chaque niveau gagné, la limite d'encombrement augmente de 1 et la capacité correspondante (table de niveaux, cf. PRD §4.2/addendum.md) est appliquée ou proposée au choix du joueur ; pour la capacité Attribut, un attribut déjà à 12 ne peut pas être re-choisi tant qu'un autre est disponible ; les capacités choisies sont enregistrées et affichées sur la fiche avec leur description.

FR9: Le propriétaire du personnage peut ajouter, modifier et retirer des objets de son inventaire individuel, chacun avec un nom et un poids (un objet sans poids saisi vaut 0) ; l'équipement de groupe reste en texte libre sans poids en v1.

FR10: Le système affiche le poids total de l'inventaire individuel en regard de la limite d'encombrement dérivée, et signale visuellement un dépassement — jamais bloquant.

FR11: Le propriétaire du personnage peut tenir un journal chronologique d'entrées de notes datées en texte libre sur sa fiche (append-only, pas d'édition rétroactive de la date) ; le MJ voit toutes les entrées en lecture seule ; le propriétaire peut marquer individuellement chaque entrée "partagée avec le groupe" (visible par tous les participants de la Partie), statut par défaut privé (MJ + auteur uniquement), réglage par entrée.

FR12: Le système crée un instantané immuable de la fiche (`sheetData`, `derived`, niveau, note associée le cas échéant) à chaque montée de niveau appliquée (FR6) et à chaque édition MJ confirmée (FR14) ; l'édition de l'inventaire (FR9) ou des notes (FR11) ne crée pas d'instantané.

FR13: Le propriétaire du personnage et le MJ de la Partie peuvent consulter la liste chronologique des instantanés d'un personnage (date, déclencheur, note associée) ; aucune restauration ("revert") n'est proposée en v1.

FR14: Le MJ d'une Partie peut modifier n'importe quel champ de `sheetData` d'un personnage rattaché à sa Partie sans passer par la validation stricte de création (403 pour tout autre rôle, y compris un autre MJ) ; la validation reste permissive avec avertissements non bloquants ; chaque édition confirmée crée un instantané marqué "modifié par le MJ" ; modifier le champ XP redéclenche le flux guidé de montée de niveau (FR5/FR6) — les autres champs restent pleinement libres.

### NonFunctional Requirements

NFR1: Toute mutation nouvelle sur `Character` (montée de niveau, édition MJ, ajout d'objet joueur) utilise un verrouillage optimiste basé sur `updatedAt` (pattern déjà en place pour le portrait) — écriture perdue jamais silencieuse, conflit → 409.

NFR2: L'incrément d'XP par une distribution est une opération atomique commutative côté serveur (pas de lecture-puis-écriture) — deux distributions concurrentes sur des personnages différents ne se bloquent jamais entre elles.

NFR3: La validation en mode MJ (`validate(data, 'mj', catalog)`) ne rejette jamais une requête — elle ne fait que produire des avertissements consultatifs, conformément à `docs/spec.md` §5 ("indicative pour le MJ, jamais de blocage").

NFR4: Le socle d'accessibilité hérité s'applique à tous les nouveaux composants (touch targets 44px mobile/36px desktop, contraste 4.5:1/3:1, couleur jamais seul vecteur d'information, dark mode strict) — cf. UX EXPERIENCE.md §7.

### Additional Requirements

- Nouvelle colonne `Character.xp Int @default(0)` — seule source de vérité pour l'XP ; le niveau n'est jamais persisté, toujours dérivé via `levelForXp(xp)` (nouvelle fonction `packages/game-rules/src/ryuutama/leveling.ts`).
- Gains de montée de niveau stockés dans `sheetData.levelUps[]` (Ryuutama-spécifique) — `computeDerived` reste une fonction pure de `sheetData` seul, sans élargir sa signature.
- `sheetData.equipment.individual` passe de `string[]` à `InventoryItem[]` (`{name, weight, addedBy}`) — migration one-off requise pour les personnages Palier 2 déjà en base, exécutée comme étape bloquante du déploiement avant redémarrage API.
- Pas de registre `GameSystemPlugin` générique introduit — les fonctions XP/niveau vivent directement dans `packages/game-rules/src/ryuutama/`, importées directement par `CharacterService` (cohérent avec le pattern existant `validate`/`computeDerived`).
- 3 nouveaux modèles Prisma dédiés (pas de tableaux JSON sur `Character`) : `CharacterNote`, `CharacterSnapshot` (enum `SnapshotTrigger: LEVEL_UP | MJ_EDIT`), `XpDistribution`/`XpDistributionEntry`.
- Endpoints MJ-édition XP et sheet-field structurellement distincts (`PATCH /characters/:id/xp` vs `PATCH /characters/:id/sheet-field`) — `sheet-field` a un denylist bloquant (400) sur les segments racines `xp`/`levelUps`, jamais accessibles via ce canal générique.
- `validate(data, 'mj', catalog)` passe d'un no-op câblé en dur à l'exécution réelle des 5 règles existantes, toujours `valid: true`, `errors[]` consultatif.
- Contrôle d'accès : réutilisation exclusive de `parties.getOwned`/`getViewable` (aucun nouveau guard NestJS) ; troisième pattern d'accès introduit pour la lecture d'une note partagée (tout participant de la Partie via `getViewable`, filtré `shared:true`).
- `XpDistributionsService.createDistribution` valide `character.partieId === partieId` pour chaque entrée avant toute écriture (rejet total si mismatch).
- `InventoryItem.addedBy` n'est jamais lu depuis l'entrée client — forcé serveur selon la route (`'player'` ou `'mj'`), requête rejetée si le client l'envoie.
- `EmailTemplate` étendu avec `'level-up'` ; même point de déclenchement (`pendingLevels()`) partagé entre les deux writers XP (distribution et édition MJ directe).
- Migration Prisma : `character_evolution_p3`.

### UX Design Requirements

UX-DR1: Restructuration de la page détail de Partie (desktop ≥1024px) — remplace l'onglet "Personnages" par un `RosterRail` permanent à gauche, replié par défaut (64px, icônes/avatars), dépliable au clic (260px, noms+niveaux) ; slot "+ Inviter" en dernier item, visible seulement s'il reste une place libre.

UX-DR2: Nouvel onglet "Invitations" séparé sur la page détail de Partie (gestion invitations/liens) ; un lien révoqué disparaît totalement de la liste (jamais grisé/barré).

UX-DR3: Sur mobile (<768px), IA différenciée par rôle — MJ voit un `RosterStrip` horizontal scrollable + onglets Calendrier/Vote/Invitations ; joueur n'a pas de bandeau troupe par défaut, nav réduite à "Ma fiche" (onglet par défaut)/Calendrier/Vote, accès à la troupe via un lien discret.

UX-DR4: `XpDistributionPanel` (MJ) — panneau avec `RulesReminder` (rappel des règles XP, registre "info calme", jamais interactif), 3 champs de calcul assisté, montant suggéré en emphase, liste des joueurs (checkbox inclusion, montant éditable, lien "+bonus"), note optionnelle, avertissement inline non bloquant si un joueur franchit un seuil.

UX-DR5: `LevelUpBanner` — bannière persistante et non bloquante sur la fiche dès qu'un seuil est franchi (jamais de popup forcée), CTA "Level up !" compact, `aria-live="polite"`.

UX-DR6: `LevelUpWizard` — assistant guidé avec barre de progression multi-segments si plusieurs niveaux d'un coup ; `pv-pe-stepper` (contrôle +/- à bouton rond, zone tactile 44px/36px explicite malgré un glyphe visuel compact) ; `attribute-choice-grid` (4 colonnes, état désactivé + aria-describedby si attribut à 12).

UX-DR7: `EncumbranceBar` — barre chiffrée (poids/limite toujours affiché en texte), dégradé rouge/ambre + label texte "Surchargé" en cas de dépassement (jamais la couleur seule).

UX-DR8: `InventoryItemRow` — ligne d'objet avec badge de provenance "ajouté par le MJ" si applicable (contraste vérifié ≥14px), `FieldEditPencil` en fin de ligne pour l'édition MJ.

UX-DR9: `NotesJournal` — liste chronologique inversée d'entrées datées, toggle de partage par entrée (icône verrou fermé/ouvert + texte, jamais la couleur seule), aria-label explicite par statut.

UX-DR10: `FieldEditPencil` — composant partagé réutilisé partout où le MJ édite un champ individuel (jamais un mode "édition globale" de la fiche) ; `aria-label="Modifier [nom du champ]"` ; sauvegarde confirmée inline, sans bouton "Enregistrer" global.

UX-DR11: Indicateur MJ dans le roster (`RosterRail`/`RosterStrip`) — anneau de couleur **et** badge texte "MJ" (jamais la couleur seule) ; `aria-label` complet même à l'état replié/compact.

UX-DR12: Historique des distributions d'XP — section permanente sur la page détail de Partie (pas seulement dans le panneau de distribution), liste chronologique simple (date, total, répartition par joueur, bonus), vue MJ uniquement.

UX-DR13: `history-tab` (fiche personnage) — liste des instantanés, consultable par le propriétaire et le MJ.

UX-DR14: Toute cible tactile visuellement sous 44px mobile/36px desktop (`pv-pe-stepper`, `RosterStrip` items, slot "+ Inviter") conserve une zone de tap étendue par padding invisible jusqu'au seuil requis.

### FR Coverage Map

| Requirement | Couverte par |
|---|---|
| FR1–FR4 (distribution XP) | Epic 6, Story 6.2 |
| FR5–FR8 (montée de niveau) | Epic 6, Story 6.3 |
| FR9–FR10 (inventaire) | Epic 6, Story 6.4 |
| FR11 (journal de notes) | Epic 6, Story 6.5 |
| FR12 (instantané) | Epic 6, Story 6.3 (déclencheur LEVEL_UP) + Story 6.6 (déclencheur MJ_EDIT) |
| FR13 (consulter l'historique) | Epic 6, Story 6.3 |
| FR14 (édition MJ) | Epic 6, Story 6.6 |
| UX-DR1–UX-DR3, UX-DR11 (partiel), UX-DR14 | Epic 6, Story 6.1 |
| UX-DR4, UX-DR12 | Story 6.2 |
| UX-DR5–UX-DR6, UX-DR13 | Story 6.3 |
| UX-DR7–UX-DR8 | Story 6.4 |
| UX-DR9 | Story 6.5 |
| UX-DR10, UX-DR11 (édition MJ) | Story 6.6 |
| NFR1 (verrouillage optimiste) | Story 6.3, 6.4, 6.6 |
| NFR2 (increment atomique) | Story 6.2 |
| NFR3 (validate mj consultatif) | Story 6.6 |
| NFR4 (accessibilité) | Toutes les stories UI (6.1–6.6) |

## Epic List

- **Epic 6 : Évolution du personnage, historique & édition MJ (Palier 3)**

## Epic 6 : Évolution du personnage, historique & édition MJ (Palier 3)

Rendre la fiche de personnage vivante : le MJ récompense les joueurs en XP après une session, les personnages montent de niveau selon les vraies règles Ryuutama, l'inventaire et les notes s'enrichissent au fil de la campagne, et le MJ retrouve la main pour corriger une fiche avec traçabilité complète.

### Story 6.1: Nouvelle disposition de la page Partie (troupe + invitations)

As a MJ ou joueur consultant une partie,
I want une page de détail de Partie moins encombrée, avec la troupe toujours accessible et les invitations dans leur propre espace,
So that je retrouve rapidement qui joue quoi sans naviguer dans un onglet surchargé, et je ne clique jamais sur un lien d'invitation qui n'existe plus.

**Acceptance Criteria:**

**Given** je suis MJ ou joueur et j'ouvre la page détail d'une Partie sur desktop (≥1024px)
**When** la page se charge
**Then** un `RosterRail` remplace l'ancien onglet "Personnages", replié par défaut (64px, avatars seuls), et se déplie au clic (260px, noms + niveaux) — jamais au survol

**Given** je suis MJ sur `RosterRail`
**When** je regarde l'avatar d'un participant qui est le MJ de la partie
**Then** il porte un anneau de couleur **et** un badge texte "MJ" (jamais la couleur seule) ; l'`aria-label` de chaque avatar (replié ou déplié) inclut le nom et le rôle/niveau complet

**Given** il reste au moins une place libre dans la Partie
**When** je consulte le `RosterRail` (ou le `RosterStrip` mobile)
**Then** un slot "+ Inviter" apparaît en dernier item, absent (pas grisé) si toutes les places sont pourvues

**Given** je suis MJ ou joueur et j'ouvre la page détail de Partie sur mobile (<768px), et je suis MJ
**When** la page se charge
**Then** un `RosterStrip` horizontal scrollable s'affiche sous le titre, suivi des onglets Calendrier/Vote/Invitations

**Given** je suis un joueur et j'ouvre la page détail de Partie sur mobile
**When** la page se charge
**Then** aucun bandeau troupe n'est affiché par défaut ; la navigation se limite à "Ma fiche" (onglet par défaut), Calendrier, Vote, avec un lien discret "Voir la troupe" pour accéder aux autres personnages

**Given** je suis MJ et je consulte l'onglet "Invitations" (nouvel onglet séparé, plus fusionné avec la troupe)
**When** j'y révoque un lien d'invitation
**Then** ce lien disparaît totalement de la liste (jamais grisé ni barré) dès le prochain rafraîchissement

**Given** un contrôle tactile (slot "+ Inviter", items `RosterStrip`) a une taille visuelle sous 44px mobile / 36px desktop
**When** je le touche/clique près de son bord
**Then** la zone cliquable réelle atteint 44px/36px via un padding invisible, sans agrandir le glyphe visuel

### Story 6.2: Distribuer de l'XP après une session

As a MJ,
I want distribuer de l'XP à mes joueurs depuis la page de la Partie, avec un calcul assisté et la possibilité de récompenser un joueur individuellement,
So that je peux clôturer une session en quelques secondes sans recalculer les règles Ryuutama à la main, et garder une trace de ce que j'ai distribué.

**Acceptance Criteria:**

**Given** je suis MJ d'une Partie et je clique sur "Distribuer de l'XP"
**When** le panneau `XpDistributionPanel` s'ouvre
**Then** il affiche un `RulesReminder` (rappel des règles, non interactif) et liste tous les joueurs ayant un personnage actif rattaché à cette Partie, chacun avec un montant proposé à 0 XP par défaut

**Given** je saisis la difficulté max du voyage, le nombre de souffles de l'homme-dragon, et le niveau du monstre le plus fort vaincu
**When** je renseigne ces 3 champs
**Then** le système calcule et propose un montant suggéré (table 100/200/300/500 selon difficulté + 50×souffles + 10×niveau monstre), appliqué par défaut à tous les joueurs listés, modifiable individuellement sans que le calcul ne bloque jamais la saisie manuelle

**Given** je veux récompenser un joueur pour une action individuelle
**When** j'ajoute un bonus d'XP sur sa ligne
**Then** ce bonus s'ajoute au montant commun pour ce joueur uniquement, sans affecter les autres

**Given** j'ai rempli le formulaire (montants, bonus, note optionnelle)
**When** je confirme la distribution
**Then** le système crée un `XpDistribution` avec ses `XpDistributionEntry`, incrémente `Character.xp` de chaque personnage listé via une écriture atomique (`increment`, pas de verrou optimiste — NFR2), et rejette la requête entière (400) si un `characterId` n'appartient pas à cette Partie

**Given** une entrée de ma distribution fait franchir un seuil de niveau à un personnage
**When** je consulte le récapitulatif avant confirmation
**Then** un avertissement inline non bloquant me signale quel(s) joueur(s) vont franchir un niveau

**Given** je suis MJ et je reviens sur la page détail de Partie plus tard
**When** je consulte la section "Historique des distributions d'XP" (permanente, pas seulement dans le panneau)
**Then** je vois la liste chronologique de mes distributions passées (date, montant total, répartition par joueur, bonus, note)

**Given** je ne suis pas le MJ de la Partie
**When** j'essaie d'ouvrir le formulaire de distribution ou l'historique
**Then** je reçois une erreur 403

### Story 6.3: Monter de niveau et consulter l'historique de sa fiche

As a joueur dont le personnage a gagné assez d'XP,
I want être guidé pour appliquer ma montée de niveau quand je le souhaite, et retrouver l'historique de ce qui a changé sur ma fiche,
So that je ne perds jamais mes choix de progression, même si je n'ai pas le temps de m'en occuper tout de suite.

**Acceptance Criteria:**

**Given** mon personnage a franchi un seuil de niveau (XP cumulé au-delà du seuil suivant de la table)
**When** j'ouvre ma fiche
**Then** une `LevelUpBanner` persistante s'affiche ("Niveau [N] disponible !"), sans popup forcée, avec `aria-live="polite"` et un CTA "Level up !" ; elle reste affichée tant que je n'ai pas traité ce niveau

**Given** je clique sur "Level up !"
**When** le `LevelUpWizard` s'ouvre
**Then** je répartis exactement 3 points entre PV et PE via un contrôle +/- (zone tactile 44px/36px malgré un glyphe compact), et je choisis la capacité débloquée pour ce niveau (ex. Attribut : grille de 4 attributs, un attribut déjà à 12 est désactivé avec une raison explicite tant qu'un autre reste disponible)

**Given** je valide mes choix pour ce niveau
**When** la montée est appliquée
**Then** `sheetData.levelUps[]` gagne une entrée (`level`, `pvAllocated`, `peAllocated`, `capability`), `derived.PV`/`derived.PE`/`derived.Encombrement` se recalculent en conséquence, un `CharacterSnapshot(trigger: 'LEVEL_UP')` immuable est créé, et si un niveau supplémentaire est déjà franchi, l'assistant me le propose immédiatement à la suite (barre de progression multi-segments)

**Given** je reçois de l'XP (distribution ou édition MJ) qui fait franchir un seuil
**When** l'événement se produit côté serveur
**Then** je reçois une notification par e-mail (`sendMail('level-up', ...)`), en plus de la bannière qui apparaîtra à ma prochaine connexion (pas de mécanisme de push temps réel)

**Given** je suis le propriétaire du personnage ou le MJ de sa Partie
**When** je consulte l'onglet "Historique" de la fiche
**Then** je vois la liste chronologique des instantanés (date, déclencheur, note associée si présente) ; aucune action de restauration n'est proposée

**Given** deux requêtes modifient mon personnage en même temps (ex. montée de niveau + édition MJ concurrente)
**When** l'une des deux écrit après l'autre sur la base d'un `updatedAt` périmé
**Then** elle échoue avec une erreur 409 plutôt que d'écraser silencieusement les changements de l'autre (NFR1)

### Story 6.4: Gérer son inventaire chiffré

As a joueur,
I want ajouter, modifier et retirer des objets de mon inventaire avec leur poids, et voir mon encombrement total,
So that je sais si mon personnage est en surcharge sans recalculer moi-même le poids de mon sac.

**Acceptance Criteria:**

**Given** je suis propriétaire d'un personnage et j'ouvre l'onglet Inventaire de sa fiche
**When** la page se charge
**Then** je vois une `EncumbranceBar` (poids total individuel / limite dérivée, toujours affichés en texte) suivie de la liste de mes objets (`InventoryItemRow`, nom + poids)

**Given** je remplis le formulaire d'ajout (nom, poids optionnel)
**When** je valide sans saisir de poids
**Then** l'objet est ajouté avec un poids de 0, sans bloquer l'ajout ; le champ `addedBy` est forcé à `'player'` côté serveur quoi que j'envoie dans la requête

**Given** le poids total de mon inventaire individuel dépasse ma limite d'encombrement
**When** je consulte l'onglet Inventaire
**Then** `EncumbranceBar` passe en dégradé rouge/ambre avec un label texte "Surchargé" (jamais la couleur seule) — sans jamais bloquer l'ajout d'un nouvel objet

**Given** je modifie ou retire un objet existant
**When** je confirme le changement
**Then** la mise à jour est appliquée avec verrouillage optimiste (NFR1) et **ne crée pas** d'instantané dans l'historique (cf. FR12)

**Given** des personnages créés avant ce palier ont un inventaire au format texte libre (`equipment.individual: string[]`)
**When** le déploiement de cette story a lieu
**Then** un script de migration one-off convertit chaque entrée existante en `{name, weight: 0, addedBy: 'player'}` **avant** le redémarrage de l'API — jamais de fenêtre où le nouveau code lit l'ancien format

### Story 6.5: Tenir un journal de notes personnelles

As a joueur,
I want écrire des notes datées sur ma fiche au fil de la campagne, et choisir lesquelles partager avec le reste du groupe,
So that je retrouve facilement ce qui s'est passé sans être pollué par des notes que je préfère garder pour moi.

**Acceptance Criteria:**

**Given** je suis propriétaire d'un personnage et j'ouvre l'onglet Notes de sa fiche
**When** j'ajoute une nouvelle entrée de texte libre
**Then** elle apparaît en tête du `NotesJournal` (liste chronologique inversée), horodatée à la création, avec un statut "privée" par défaut (visible par moi et le MJ uniquement)

**Given** une entrée de mon journal existe
**When** je bascule son toggle "Partager avec le groupe"
**Then** seule cette entrée devient visible par tous les participants de la Partie (icône verrou fermé/ouvert + texte, jamais la couleur seule) ; les autres entrées ne sont pas affectées

**Given** je suis le MJ de la Partie
**When** je consulte le journal de notes d'un de mes joueurs
**Then** je vois toutes ses entrées en lecture seule (privées et partagées), sans pouvoir les éditer via ce mécanisme

**Given** je suis un autre joueur de la même Partie (ni MJ, ni propriétaire de ce personnage)
**When** je consulte le journal de notes de ce personnage
**Then** je ne vois que les entrées marquées "partagées avec le groupe"

**Given** une entrée existe déjà dans mon journal
**When** je cherche à l'éditer ou la supprimer après création
**Then** aucune action de ce type n'est proposée (v1 : append-only) ; ajouter une entrée ne crée pas d'instantané dans l'historique (cf. FR12)

### Story 6.6: Édition MJ sans contrainte, avec traçabilité

As a MJ,
I want corriger n'importe quel champ de la fiche d'un de mes joueurs, y compris son XP, directement depuis l'application,
So that je n'ai plus besoin de modifier la base de données à la main quand une information a été mal saisie.

**Acceptance Criteria:**

**Given** je suis le MJ de la Partie à laquelle un personnage est rattaché
**When** je clique sur le `FieldEditPencil` à côté d'un champ de sa fiche (capacité, attribut, objet d'inventaire, etc. — hors XP)
**Then** je peux éditer ce champ précis et le confirmer individuellement, sans "mode édition" global qui déverrouille toute la fiche

**Given** je confirme une édition de champ
**When** la requête `PATCH /characters/:id/sheet-field` est traitée
**Then** `validate(data, 'mj', catalog)` exécute les règles réelles mais ne rejette jamais la requête — un avertissement non bloquant s'affiche si la valeur sort du catalogue seedé (NFR3) — et un `CharacterSnapshot(trigger: 'MJ_EDIT')` est créé immédiatement

**Given** je tente de modifier `sheetData.levelUps` ou `sheetData.xp` via ce même mécanisme d'édition de champ
**When** la requête est envoyée
**Then** elle est rejetée (400) — ces deux sous-arbres ne sont accessibles que via `PATCH /xp` et l'assistant de montée de niveau

**Given** je modifie directement le champ XP d'un personnage (`PATCH /characters/:id/xp`)
**When** la nouvelle valeur franchit un seuil de niveau
**Then** le système applique la même détection qu'une distribution normale (le joueur voit sa `LevelUpBanner` et reçoit l'e-mail) — je ne peux jamais faire sauter un niveau silencieusement sans passer par le flux guidé du joueur

**Given** je ne suis ni le MJ de la Partie du personnage, ni un autre rôle autorisé
**When** je tente une édition MJ sur ce personnage
**Then** je reçois une erreur 403, y compris si je suis MJ d'une autre Partie

**Given** deux éditions MJ (ou une édition MJ et une autre mutation) arrivent en concurrence sur le même personnage
**When** l'une des deux écrit sur la base d'un `updatedAt` périmé
**Then** elle échoue avec une erreur 409 (verrouillage optimiste, NFR1)
