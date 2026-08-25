---
title: "Sprint Change Proposal — Rattrapage frontend Epic 7-8 (Palier 4 suite)"
date: 2026-07-12
status: approved
---

# Sprint Change Proposal — 2026-07-12

## 1. Résumé du problème

Après livraison des Stories 7.1, 7.2 et 7.3 (toutes `done`, backend uniquement), l'utilisateur a remarqué qu'aucun frontend n'avait été développé pour ces trois stories. Investigation : aucune Acceptance Criteria de `epics.md` pour 7.1/7.2/7.3 ne mentionne de composant Angular — uniquement des contrats API (`POST`, `GET`, `PATCH`). Catégorie : malentendu dans la rédaction initiale des epics (ACs pensées "backend d'abord", jamais explicitées côté frontend story par story).

Audit étendu à l'ensemble des Epics 7, 8 et 9 : le trou n'est pas uniforme.

| Story | Frontend dans les ACs d'origine ? |
|---|---|
| 7.1, 7.2, 7.3 | Aucun |
| 7.4 (ex, anti-spoil/timeline) | Oui (ScenarioTimeline détaillé) — mais backend manquant (aucun endpoint de liste complète) |
| 7.5 (ex, passer Courant) | Aucun (bouton non mentionné) |
| 7.6 (ex, clôturer) | Aucun (bouton non mentionné) |
| 8.1 (participation) | Aucun (action joueur non UI-isée) |
| 8.2 (séances/vote) | Aucun (ajout de séance non UI-isé) |
| 8.3 (inscription capacité) | Oui (`FillIndicator`, boutons explicites) |
| 8.4 (compte-rendu) | Implicite seulement |
| 8.5 (résumé de fin) | Oui (`RetrospectivePanel` explicite) |
| 8.6 (association journal) | Oui (switch explicite) |
| 9.1, 9.2 (annonces) | Oui (formulaire, `AnnonceCard` explicites) |

## 2. Impact epics

**Epic 7** : insertion d'une nouvelle Story 7.4 ("Interface MJ — création, documents et brouillons de scénario") couvrant le frontend de 7.1/7.2/7.3. Renumérotation : ex-7.4 (anti-spoil/timeline) → 7.5, ex-7.5 (passer Courant) → 7.6, ex-7.6 (clôturer) → 7.7. AC backend ajoutée à la 7.5 (endpoint `GET /parties/:id/scenarios`, absent jusqu'ici). AC frontend ajoutées aux 7.6 et 7.7 (CTA manquants).

**Epic 8** : AC frontend ajoutées à 8.1 (bouton Participer), 8.2 (bouton Ajouter une séance), 8.4 (formulaire compte-rendu). 8.3/8.5/8.6 laissées inchangées (déjà bien pairées).

**Epic 9** : aucun changement — 9.1/9.2 déjà bien pairées.

**Stories déjà livrées (7.1, 7.2, 7.3, toutes `done`)** : non modifiées, non rollback. Leur backend reste la fondation sur laquelle la nouvelle Story 7.4 s'appuie.

## 3. Impact PRD / Architecture / UX

Aucun — le comportement produit ne change pas. DESIGN.md/EXPERIENCE.md (ux-jdr-master-20260711) décrivaient déjà tous les composants concernés (`ScenarioCard`, `FillIndicator`, `ScenarioStatusBadge`, `DocumentRow`, UX-DR5/DR8). Seul le découpage epics→stories manquait de granularité frontend explicite.

## 4. Chemin retenu

**Option 1 — Ajustement direct.** Effort faible-moyen, risque faible : aucune story livrée n'est modifiée ou rollback, seules les stories futures (pas encore développées) sont réorganisées/complétées avant d'être abordées en `dev-story`.

## 5. Changements détaillés

### 5.1 Nouvelle Story 7.4 (insérée)

"Interface MJ — création, documents et brouillons de scénario" — 6 ACs couvrant : formulaire création/édition (relie 7.1), section Documents avec upload (relie 7.2), vue MJ des Brouillons + bouton "Ouvrir aux joueurs" (relie 7.3), gestion d'erreur upload à l'écran.

### 5.2 Story 7.5 (ex-7.4, renumérotée)

Titre et 8 ACs de rendu (`ScenarioTimeline`, anti-spoil) inchangées. **AC ajoutée** : `GET /parties/:id/scenarios` doit exister et renvoyer l'intégralité des scénarios sans filtrage serveur (AD-6) — jusqu'ici seul `listDrafts` (MJ-only, BROUILLON) avait été construit en Story 7.3 ; la timeline joueur n'avait aucune source de données.

### 5.3 Story 7.6 (ex-7.5, renumérotée)

ACs backend inchangées (transition `A_VENIR→COURANT`, 409, verrou concurrent AD-10). **AC ajoutée** : CTA "Marquer comme Courant" (`ScenarioCard.actions-mj`).

### 5.4 Story 7.7 (ex-7.6, renumérotée)

ACs backend inchangées (clôture, `closedAt`, levée anti-spoil). **AC ajoutée** : CTA "Clôturer le scénario" (gradient linéaire / `btn-danger-outline` épisodique).

### 5.5 Story 8.1 — AC ajoutée

Bouton "Participer à cette enquête" (campagne épisodique uniquement).

### 5.6 Story 8.2 — AC ajoutée

Bouton "Ajouter une séance" ; réutilisation explicite de `PollOption` existant pour le vote (aucun nouveau composant de vote).

### 5.7 Story 8.4 — AC ajoutée

Champ + bouton "Enregistrer le compte-rendu" côté vue MJ.

## 6. Handoff

**Scope : Mineur.** Implémentation directe par l'agent développeur (`dev-story`), aucune coordination PM/Architecte nécessaire — les changements sont des compléments d'ACs dans des stories pas encore commencées, sans impact sur le travail déjà livré.

**Fichiers modifiés :**
- `_bmad-output/planning-artifacts/epics.md` (nouvelle Story 7.4, renumérotation 7.5-7.7, ACs ajoutées à 8.1/8.2/8.4)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (nouvelle entrée `7-4-interface-mj-gestion-scenarios`, renommage des clés `7-5`/`7-6`/`7-7`, notes ajoutées sur `8-1`/`8-2`/`8-4`)

**Prochaine étape :** `create-story` sur `7-4-interface-mj-gestion-scenarios` (prochaine story `backlog` dans l'ordre du sprint).
