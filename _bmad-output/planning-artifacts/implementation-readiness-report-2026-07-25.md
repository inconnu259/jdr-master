---
stepsCompleted: [1]
documents:
  prd: '_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/prd.md'
  architecture: '_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md'
  epics: '_bmad-output/planning-artifacts/epics-palier8.md'
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-25
**Project:** jdr-master — Palier 8 : Refonte complète des classes et textes Ryuutama

## Document Inventory

- **PRD:** `prds/prd-jdr-master-2026-07-24/prd.md`
- **Architecture:** `architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md`
- **Epics & Stories:** `epics-palier8.md` (5 epics, 15 stories)
- **UX:** aucun contrat UX pour ce palier (aucune refonte visuelle prévue)

Aucun doublon whole/sharded détecté. Les autres fichiers PRD/architecture présents dans le dossier appartiennent aux paliers précédents (1 à 7), non pertinents pour cette évaluation.

## PRD Analysis

### Functional Requirements

FR1: Chaque classe, chaque type et chaque catégorie d'arme porte un champ `description` (texte narratif/règles), au même niveau de détail que `homme-dragon-artefacts.json`/`eveil-powers.json`.
FR2: Chaque sous-élément d'un type de contenu enrichi par FR1 (un avantage de Type, un talent de Classe) porte aussi son propre champ `description`.
FR3: Chaque étape du wizard de création/évolution de personnage affiche un texte d'introduction propre à l'étape, expliquant ce que ce choix signifie dans les règles — indépendant des descriptions des items choisis dans l'étape (FR1/FR2).
FR4: Le catalogue de classes est complété avec les classes du *Guide du Voyageur* absentes aujourd'hui.
FR5: Chaque classe porte une liste d'occupations et une liste d'actions — texte de référence pur, affiché au joueur comme pistes de jeu/idées de métier. Aucune validation ni mécanique de jeu dessus.
FR6: Chaque talent d'une classe (toujours exactement 3 par classe) porte : un nom, une description propre du talent, et un effet structuré composé d'une description de l'effet, de ses conditions d'application, des attributs concernés (existant) et d'une difficulté (existant).
FR7: Le catalogue de profils d'attributs passe de 1 à 3 entrées : Équilibré, Polyvalent (existant, valeurs à reconfirmer), Spécialiste.
FR8: Le joueur choisit une arme précise dans une liste, chaque arme étant rattachée à une catégorie. La catégorie continue de porter les formules de touche/dégâts/encombrement et gagne une description + sa propre liste (non-exhaustive) d'armes types.
FR9: Le joueur peut créer une arme ne figurant pas dans la liste, en la rattachant manuellement à une des catégories existantes.
FR10: L'étape équipement de l'assistant propose un choix explicite entre (a) le nécessaire de voyage pré-fait (mode pique-nique existant, à compléter/enrichir) et (b) un achat libre dans une liste figée d'objets achetables, avec un budget de départ de 1000 Po.
FR11: Un nouveau `ContentType` porte les règles de magie et la liste des sorts du *Guide du Voyageur*, avec le même niveau de détail (description/effet) que les autres types de contenu enrichis par ce palier.
FR12: Un nouveau `ContentType` porte exactement les 4 rôles (cartographe, chef, chroniqueur, intendant), chacun avec une description — jamais plus de 4, jamais moins.
FR13: Le MJ peut assigner un rôle à un personnage de sa Partie. Le joueur ne choisit jamais son propre rôle ; aucun mécanisme de vote.
FR14: Le rôle assigné à un personnage est visible via un badge sur son avatar, dans le même emplacement que le badge de montée de niveau existant. Le badge de rôle est masqué tant qu'une montée de niveau est en attente sur ce personnage.
FR15: Une fois FR1 à FR14 implémentées, l'agent/le développeur redemande explicitement à l'utilisateur s'il reste des textes, classes, armes, sorts ou autres éléments de contenu à ajouter avant de considérer le palier terminé.

Total FRs: 15

### Non-Functional Requirements

Aucune NFR nouvelle propre à ce PRD. Contrainte permanente héritée et rappelée en §0 :

NFR4 (héritée, inchangée) : le contenu Ryuutama est gitignoré (droits d'auteur) et seedé depuis des fichiers JSON au démarrage de l'API (`GameSystemService.onApplicationBootstrap()`), jamais codé en dur, jamais lu directement par le frontend.

Total NFRs: 1 (héritée, non nouvelle)

### Additional Requirements

- **Mode opératoire (§0) :** l'utilisateur possède le livre physique et dicte le contenu officiel (valeurs, textes, listes) story par story pendant l'implémentation — le PRD documente la forme des données, jamais le texte lui-même. Contrainte transversale sur toutes les stories de contenu.
- **Non-Goals (§5) :** pas de vote/auto-attribution de rôle par les joueurs ; pas de migration automatique des personnages existants (reset du seed) ; pas d'UI multi-listes d'équipement (Palier 9) ; pas de mécanique sur occupations/actions ; pas de refonte visuelle générale du wizard/`ScenarioTimeline` (Palier 9).
- **4 Open Questions** (§8) : contenu exact non bloquant (dicté en story) ; mécanique de sorts non tranchée (FR11) ; forme exacte Prisma/DTO du choix d'arme laissée à l'architecture (résolue depuis, cf. spine AD-2) ; réassignation de rôle non tranchée (FR13, résolue en partie par un plancher minimal dans la spine AD-6).
- **5 Assumptions indexées** (§9) : classes manquantes, valeurs des profils d'attributs, liste de catégories d'armes, budget fixe, catalogue de sorts capturé sans mécanique — toutes explicitement non-bloquantes pour ce PRD.

### PRD Completeness Assessment

PRD complet et cohérent : 15 FR numérotées, Non-Goals explicites, MVP Scope clair, Open Questions et Assumptions correctement isolées plutôt que dissimulées dans les FR. Le PRD a déjà été passé par un Reviewer Gate (rubric walker, 0 critical/high) lors de sa propre finalisation — aucune lacune de rédaction identifiée ici.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement (résumé) | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR1 | Description sur classe/type/arme | Epic 23, Story 23.1 | ✓ Covered |
| FR2 | Description sur les sous-éléments | Epic 23, Story 23.2 | ✓ Covered |
| FR3 | Texte explicatif par étape du wizard | Epic 23, Story 23.3 | ✓ Covered |
| FR4 | Classes manquantes ajoutées | Epic 23, Story 23.4 | ✓ Covered |
| FR5 | Occupations et actions par classe | Epic 23, Story 23.5 | ✓ Covered |
| FR6 | Talents enrichis (effet structuré) | Epic 23, Story 23.6 | ✓ Covered |
| FR7 | Trois profils d'attributs | Epic 24, Story 24.1 | ✓ Covered |
| FR8 | Choix d'une arme précise rattachée à une catégorie | Epic 25, Story 25.1 | ✓ Covered |
| FR9 | Création d'une arme libre | Epic 25, Story 25.2 | ✓ Covered |
| FR10 | Achat d'équipement de départ (budget 1000 Po) | Epic 26, Story 26.1 | ✓ Covered |
| FR11 | Catalogue de sorts et règles de magie | Epic 23, Story 23.7 | ✓ Covered |
| FR12 | Catalogue des 4 rôles | Epic 27, Story 27.1 | ✓ Covered |
| FR13 | Assignation d'un rôle par le MJ | Epic 27, Story 27.2 | ✓ Covered |
| FR14 | Affichage du rôle assigné (badge) | Epic 27, Story 27.3 | ✓ Covered |
| FR15 | Rappel de vérification de complétude | Epic 27, Story 27.4 | ✓ Covered |

### Missing Requirements

Aucune. 15/15 FR couvertes, chacune par exactement une story.

### Coverage Statistics

- Total PRD FRs: 15
- FRs covered in epics: 15
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Not Found (confirmé volontairement — pas de contrat UX pour ce palier).

### Alignment Issues

Aucune. Ce palier touche l'UI (étapes du wizard, badge sur `RosterRow`) mais **réutilise exclusivement des patterns visuels déjà établis** : `ChoiceCard`/`RadioGroupNavDirective` (choix classe/type/arme, déjà utilisés), et l'emplacement de badge déjà existant (`hasPendingLevelUp`). Aucune nouvelle interaction, aucun nouveau composant visuel générique n'est introduit — cohérent avec le Non-Goal explicite du PRD (§5, refonte visuelle reportée au Palier 9).

### Warnings

Aucun avertissement. L'UI est implicitement présente (wizard, roster) mais suffisamment couverte par les conventions déjà établies pour ne pas nécessiter de contrat UX dédié à ce stade.

## Epic Quality Review

### Compliance Checklist (par epic)

| Epic | Valeur utilisateur | Indépendance | Stories bien dimensionnées | Pas de dépendance en avant | Entités créées à la demande |
| --- | --- | --- | --- | --- | --- |
| 23 | ✅ | ✅ | ✅ | ⚠️ voir minor ci-dessous | ✅ (`spell` créé en 23.7, quand nécessaire) |
| 24 | ✅ | ✅ | ✅ | ✅ | N/A (contenu seul) |
| 25 | ✅ | ✅ | ✅ | ✅ (25.2 dépend légitimement de 25.1, story précédente) | ✅ (`weaponItem` créé en 25.1) |
| 26 | ✅ | ✅ | ✅ | ✅ | ✅ (`equipmentItem` créé en 26.1) |
| 27 | ✅ | ✅ | ✅ | ✅ (27.3 dépend de 27.2, story précédente ; 27.4 est un gate de process explicite, pas une dépendance fonctionnelle, même schéma que Palier 7 FR-15) | ✅ (`CharacterGroupRole`/`groupRole` créés en 27.1/27.2, quand nécessaires) |

Aucune epic n'est un jalon technique déguisé (« Setup Database », « API Development ») — les 5 titres décrivent tous un résultat utilisateur concret.

### 🟠 Major Issue

**Chevauchement de fichier non justifié entre Epic 23 (Story 23.1) et Epic 25 (Story 25.1) sur `WeaponStep`.**

- Story 23.1 (« Descriptions sur classes, types et catégories d'armes ») modifie `WeaponStep` pour afficher la description de la **catégorie d'arme actuellement sélectionnable** (modèle actuel : choix direct d'une catégorie).
- Story 25.1 (« Choix d'une arme précise rattachée à une catégorie ») **restructure entièrement** `WeaponStep` pour faire choisir une arme précise plutôt qu'une catégorie — l'UI de sélection change de nature.
- Si les epics s'exécutent dans l'ordre proposé (23 avant 25), le travail d'affichage de description fait en 23.1 sur l'UI de sélection par catégorie sera en grande partie jeté/refait par la restructuration de 25.1 — c'est exactement le type de chevauchement que le principe « Implementation Efficiency » (create-epics-and-stories, étape 2) demande de détecter et de consolider ou reséquencer, pas d'ignorer.

**Recommandation :** dans Story 23.1, retirer `WeaponStep` du périmètre (ne garder que l'ajout du champ `description` aux données `weapon-categories.json`, sans câblage d'affichage) ; câbler l'affichage de la description de catégorie directement dans Story 25.1, qui réécrit `WeaponStep` de toute façon. Alternative : inverser l'ordre d'exécution (Epic 25 avant Epic 23) — mais la première option évite de retoucher l'ordre déjà validé et est la plus simple.

### 🟡 Minor Concerns

1. **Story 23.4, AC2** référence « cf. Stories 23.1/23.5/23.6 » — formulation qui pourrait se lire comme une dépendance en avant (23.5/23.6 viennent après 23.4 dans la séquence). Ce n'en est pas une réellement : 23.5/23.6 s'appliquent à *toutes* les entrées de `classes.json` au moment où elles s'exécutent, classes ajoutées par 23.4 incluses. **Recommandation :** clarifier l'AC pour dire explicitement que les nouvelles classes sont ajoutées dans la forme *courante* à ce stade, et seront enrichies rétroactivement par 23.5/23.6 comme toutes les autres — pas une precondition bloquante.
2. **Story 23.4** n'a pas d'AC couvrant une collision de `key` (une classe ajoutée porterait la même clé qu'une classe existante). Gap mineur, cohérent avec le fait qu'aucun autre catalogue de contenu de ce projet n'a de garde de ce type non plus (constaté en architecture) — mais vaut la peine d'être noté explicitement plutôt que silencieusement absent.
3. **Story 26.1, AC3** (« le total ne peut pas dépasser 1000 Po ») ne précise pas le mécanisme d'échec (quel code HTTP/quelle exception). Les autres stories du même epic (ex. 27.2 avec `ConflictException`) sont plus précises sur ce point — recommandé d'aligner pour la précision de testabilité, mais non bloquant.

### Overall Epic Quality Verdict

Structure globalement solide — aucune violation critique (pas d'epic technique, pas de dépendance en avant réellement bloquante, entités créées à la demande). Un seul point Major mérite correction avant de lancer les stories : le chevauchement `WeaponStep` entre 23.1 et 25.1. Recommandé de l'ajuster avant de démarrer `bmad-sprint-planning`.

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** (mineur) — un seul point Major, facilement corrigeable, avant de démarrer l'implémentation. Couverture FR à 100%, architecture cohérente, aucun problème UX, aucune violation critique de structure d'epic.

### Critical Issues Requiring Immediate Action

Aucune. Rien ne bloque au niveau critique.

### Recommended Next Steps

1. **Corriger le chevauchement `WeaponStep`** (Major) : retirer le câblage d'affichage de description de `WeaponStep` du périmètre de Story 23.1 (garder uniquement l'ajout du champ `description` aux données) ; le câblage d'affichage rejoint Story 25.1, qui réécrit `WeaponStep` de toute façon.
2. **Clarifier Story 23.4, AC2** pour lever l'ambiguïté de dépendance en avant avec 23.5/23.6 (minor).
3. **Ajouter (optionnel) une AC de collision de `key`** sur Story 23.4, et préciser le type d'erreur attendu sur Story 26.1 AC3, pour plus de précision de testabilité (minor, non bloquant).
4. Une fois ces ajustements faits (ou explicitement acceptés tels quels), lancer `bmad-sprint-planning` pour générer le plan de sprint.

### Final Note

Cette évaluation a identifié 4 points (1 major, 3 minor) sur 5 epics / 15 stories. Aucun ne remet en cause la structure globale ni la couverture des exigences — ce sont des ajustements de précision, pas une refonte du découpage.

**Statut mis à jour : READY.** Les 4 points ont été corrigés directement dans `epics-palier8.md` (2026-07-25) :
- Story 23.1 : `WeaponStep` retiré de son périmètre (données seulement, l'affichage est câblé dans Story 25.1 qui réécrit ce composant de toute façon).
- Story 25.1 : mise à jour pour afficher explicitement la description de catégorie ajoutée par 23.1.
- Story 23.4 : AC clarifiée (pas de dépendance en avant réelle sur 23.5/23.6) + AC de collision de `key` ajoutée.
- Story 26.1 : type d'exception précisé (`BadRequestException`) sur le dépassement de budget.

Prêt pour `bmad-sprint-planning`.

**Assessor:** Claude Sonnet 5 (bmad-check-implementation-readiness)
**Date:** 2026-07-25
