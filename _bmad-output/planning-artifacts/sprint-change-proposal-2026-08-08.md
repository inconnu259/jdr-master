# Sprint Change Proposal — 2026-08-08

## 1. Issue Summary

**Déclencheur :** en utilisant la story 29.3 (« Navigation à quatre destinations », livrée le jour même), l'utilisateur a identifié que le bandeau du haut du `Shell` reste entièrement vide sur tous les écrans — un espace mort — et que rien ne signale localement, sur les écrans qui ont des sous-sections (détail d'une partie, fiche personnage), « où je suis, qu'est-ce que je peux faire ici ». Il a proposé de rendre la barre à 4 destinations elle-même contextuelle (elle changerait de contenu selon l'écran, avec un bouton Retour).

**Nature du problème :** nouvelle exigence, née de l'usage réel de ce qui vient d'être livré — pas une erreur d'implémentation ni une régression.

**Évaluation de la proposition initiale :** rendre la barre globale contextuelle casserait la garantie que 29.3 vient d'établir (AC5 : le calendrier — et par extension Parties/Personnages/Compte — à un seul geste, depuis n'importe quel écran, FR-48). En perdant l'accès direct pendant qu'on est « dans » une partie, on réintroduirait le problème d'orientation que 29.3 corrigeait. La bonne réponse consiste à **ajouter** une couche de navigation locale, sans jamais remplacer la barre globale.

**Point d'appui existant :** `PartieDetail` a déjà un `mat-tab-group` interne (Détails, Ma fiche, Invitations, Scénarios, Chronologie...) — l'essentiel de la sous-navigation pour l'écran Partie existe déjà, il s'agit de l'exposer via le mécanisme contextuel plutôt que de la reconstruire. La fiche personnage, elle, n'a aucune structure de sections : l'équipement et le journal sont aujourd'hui empilés dans une page unique qui défile — les en sortir est un chantier distinct, plus lourd.

## 2. Impact Analysis

### Epic Impact

- **Epic 29 (Navigation et listes)** reste entièrement réalisable tel quel — c'est un ajout, pas une remise en cause. Aucun epic futur n'est invalidé.
- Deux nouvelles stories insérées **juste après 29.3** (leur seul prérequis direct) :
  - **29.4 — Sous-navigation contextuelle des écrans** : mécanisme générique (titre contextuel + sous-navigation locale), appliqué à l'écran Partie qui a déjà la structure nécessaire.
  - **29.5 — Fiche personnage en sections routées** : applique le mécanisme de 29.4 à la fiche personnage, après l'avoir d'abord découpée en sections (équipement, journal).
- **Renumérotation** : les anciennes stories 29.4 à 29.12 (toutes en `backlog`, aucun fichier story créé) glissent à 29.6–29.14. Aucune référence externe cassée — c'est le même raisonnement que celui déjà appliqué pour insérer la story 29.0 en tête d'épic.

### Story Impact

- Story 29.3 (`done`) : **non modifiée**. Le mécanisme contextuel s'ajoute à sa barre, ne la remplace pas — aucune régression sur ses ACs.
- Stories 29.6 à 29.14 (ex-29.4–29.12) : renommées uniquement (numéro + clé `sprint-status.yaml`), contenu inchangé.
- `PartieDetail`, `CharacterSheet` : deviendront les deux premiers écrans concrets à porter une sous-navigation locale — futur travail d'implémentation de 29.4/29.5, pas de changement immédiat.

### Artifact Conflicts

- **PRD (`prd-jdr-master-2026-08-01/prd.md`)** : aucun conflit. FR-48 (navigation globale à 4 destinations) reste satisfait à l'identique — la nouvelle couche est additive. Pas de nouvelle FR formelle créée dans cette passe (suit le précédent de 29.0, insérée sans ancrage FR nouveau) ; une FR dédiée pourrait être ajoutée lors d'une prochaine révision PRD si jugé utile, mais ce n'est pas bloquant.
- **`epics.md`** : mis à jour — 2 nouvelles stories insérées avec ACs complets, renumérotation de 29.4–29.12 → 29.6–29.14 propagée à toutes les références croisées (table des FR, notes de séquencement, titres de section).
- **Architecture / UX** : aucun document d'architecture ni de design dédié à modifier dans l'immédiat — l'implémentation de 29.4/29.5 s'appuiera sur les patrons déjà établis par 29.3 (`RouterLinkActive`, distinction au-delà de la couleur) et sur le `mat-tab-group` déjà présent dans `PartieDetail`.
- **Autres artefacts** : aucun impact sur déploiement, CI/CD, tests d'infrastructure.

## 3. Recommended Approach

**Option retenue : Direct Adjustment (ajout de stories dans l'épic existant).**

- Rollback : non pertinent, rien à défaire.
- Révision du MVP PRD : non pertinent, le changement n'affecte aucun objectif ni périmètre du PRD, il l'étend dans l'esprit de FR-48.

**Effort estimé :** Moyen pour 29.4 (essentiellement de l'exposition d'une structure déjà là), Moyen-élevé pour 29.5 (vrai découpage de la fiche personnage). **Risque :** Faible — additif, ne touche à aucun comportement déjà livré et testé.

**Justification :** le changement est net, borné, et directement motivé par l'usage de ce qui vient d'être livré — l'insérer maintenant, pendant que le contexte du `Shell`/de la barre est frais, coûte moins cher que d'y revenir plus tard.

## 4. Detailed Change Proposals

### 4.1 `epics.md`

**Insertion** — après la fin de la Story 29.3, avant l'ancienne Story 29.4 (désormais 29.6) :

> ### Story 29.4 : Sous-navigation contextuelle des écrans
>
> As a utilisateur, I want que le bandeau du haut m'indique où je suis et que chaque écran propose ses propres sections quand il en a, So that je comprenne d'un coup d'œil ce que je regarde et ce que je peux y faire.
>
> ACs : titre contextuel toujours présent · barre globale toujours visible et prioritaire, jamais remplacée · sous-navigation locale sur l'écran Partie réutilisant le `mat-tab-group` existant · distinction de l'entrée active au-delà de la couleur (même principe que 29.3 AC3) · pas de sous-nav vide sur les écrans sans sections · pas de bouton Retour dédié nécessaire.
>
> ### Story 29.5 : Fiche personnage en sections routées
>
> As a joueur, I want retrouver l'équipement et le journal de mon personnage dans leurs propres sections, So that je trouve ce que je cherche sans défiler toute la fiche.
>
> ACs : fiche découpée en sections (fiche principale, équipement, journal) via la sous-navigation de 29.4 · changement de section sans perte de contexte · aucune régression fonctionnelle sur l'équipement/le journal · même convention de distinction de l'entrée active.

**Renumérotation** — 29.4→29.6, 29.5→29.7, 29.6→29.8, 29.7→29.9, 29.8→29.10, 29.9→29.11, 29.10→29.12, 29.11→29.13, 29.12→29.14, propagée à la table des FR (FR-44, FR-45, FR-47, FR-13, Q-1), à la table UX-DR8/9, et aux notes de séquencement (prérequis de 29.0).

**Note ajoutée** au résumé de l'épic 29, expliquant l'insertion (rationale, non-remplacement de FR-48).

*(Appliqué directement dans `epics.md` — voir le fichier pour le texte complet des deux stories.)*

### 4.2 `sprint-status.yaml`

- Clés renommées : `29-4-cloture-explicite-dune-partie` → `29-6-cloture-explicite-dune-partie` (et ainsi de suite jusqu'à `29-14-refonte-...`), statut `backlog` conservé.
- Deux nouvelles entrées ajoutées, statut `backlog` :
  - `29-4-sous-navigation-contextuelle-des-ecrans`
  - `29-5-fiche-personnage-en-sections-routees`
- `last_updated` et commentaire d'en-tête mis à jour.

*(Appliqué directement dans `sprint-status.yaml`.)*

## 5. Implementation Handoff

**Classification du changement : Minor.** Modification directe des artefacts de planification (epics + sprint tracking), pas de refonte de PRD ni d'architecture, pas de story déjà livrée à toucher.

**Routage :** Developer agent — prêt pour `create-story` sur 29.4 dès que vous voulez démarrer (elle est maintenant la première story `backlog` de l'épic 29, juste après 29.3 `done`).

**Critères de succès :** 29.4 livre le mécanisme générique + son application à l'écran Partie sans toucher aux ACs de 29.3 ; 29.5 découpe la fiche personnage sans régression sur l'inventaire/l'encombrement/le journal, vérifiable par la suite de tests existante de `character-sheet`.
