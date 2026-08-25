---
baseline_commit: 3b221066cc3339101ea1b3f12bdc678861c5361d
---

# Story 22.2: Convention documentée de vérification SSE pour tout nouvel ajout

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a future contributeur (humain ou agent) du projet,
I want qu'une règle explicite rappelle d'évaluer le besoin de câblage SSE pour tout nouveau composant affichant des données scopées à une Partie,
so that le même problème de désynchro ne se recrée pas silencieusement aux paliers suivants.

## Acceptance Criteria

1. **Given** `CLAUDE.md` et/ou `docs/checklist.md` **When** cette story est terminée **Then** une règle est écrite noir sur blanc : tout nouveau composant/page affichant des données scopées à une Partie doit être évalué pour un besoin de câblage sur le signal de changement SSE.
2. **Given** cette règle **When** elle est ajoutée **Then** ce n'est pas une garde automatisée (pas de lint/CI) — une vérification humaine/agent documentée suffit, cohérent avec le contexte hobby.

## Tasks / Subtasks

- [x] **Task 1 — Ajouter la règle dans `CLAUDE.md` (AC1, AC2)**
  - **Fichier existant à lire intégralement avant modification** : `CLAUDE.md` (43 lignes actuelles). Section `## Conventions` (lignes 23-28) contient déjà deux puces (« Architecture plugin », « Sécurité ») du même format court, une phrase, avec renvoi vers un doc source de vérité — reproduire ce **même format**, ne pas créer une nouvelle section à part entière pour une seule puce.
  - Ajouter une puce à la suite des deux existantes :
    ```markdown
    - **Temps réel (SSE)** : tout nouveau composant/page affichant des données scopées à une Partie
      (ou à l'utilisateur, cf. canal `user:{id}`) doit être évalué pour un besoin de câblage sur le
      signal de changement `RealtimeService` (voir `docs/checklist.md`) — pas de garde automatisée
      (lint/CI), vérification humaine/agent à chaque ajout.
    ```
  - **Correction post-revue de code** : le libellé initial laissait entendre que `RealtimeService`
    lui-même expose un signal « changed », alors que ce signal vit sur chaque service de domaine
    (`ScenariosService.changed`, `InvitationsService.changed`, etc.) — `RealtimeService` ne fait que
    le propager. Reformulé pour lever l'ambiguïté (voir Review Findings ci-dessous).
  - **Ne pas transformer ceci en garde automatisée** (AC2) — pas de règle ESLint/ES-lint custom, pas de test CI dédié, pas de script de vérification. Une phrase dans un fichier lu en début de session (déjà le cas pour `CLAUDE.md`, cf. ligne 4 du fichier) suffit, cohérent avec le contexte hobby du projet (aucune CI n'est actuellement mentionnée dans le repo pour ce type de garde).

- [x] **Task 2 — Ajouter un item de checklist dans `docs/checklist.md` (AC1, AC2)**
  - **Fichier existant à lire intégralement avant modification** : `docs/checklist.md` (40 lignes actuelles). Format déjà établi : sections `##` avec listes `- [ ]` à cocher manuellement par l'utilisateur humain (« Avant de coder une feature non triviale », « À la fin de chaque palier », etc.).
  - Ajouter une nouvelle section (ou une puce dans une section existante pertinente) :
    ```markdown
    ## Nouveau composant affichant des données de Partie (ou de l'utilisateur)
    - [ ] **Évaluer le besoin de câblage temps réel (SSE)** : ce composant a-t-il besoin de refléter
          un changement fait par un autre membre pendant qu'il reste ouvert ? Si oui, câbler
          `RealtimeService.connect()`/`disconnect()` (topic `partie:{id}` ou `user:{id}`) et un
          `effect()` réactif sur le signal `changed`/`notifyChanged()` du service de domaine concerné
          — patterns établis au Palier 7 (`_bmad-output/implementation-artifacts/21-*.md`, `19-*.md`).
    ```
  - Cette nouvelle section peut être placée après « Tâches sensibles » et avant « Git » (ordre logique : décisions de conception avant les étapes de fin de cycle) — la story ne prescrit pas un emplacement unique obligatoire, l'important est la présence de la règle quelque part dans le fichier, cohérente avec le format existant.
  - **Ne pas dupliquer intégralement le contenu de `CLAUDE.md`** — `docs/checklist.md` est déjà référencé depuis `CLAUDE.md` comme « source de vérité » (ligne 37 actuelle) pour les rappels manuels ; la puce `CLAUDE.md` (Task 1) peut rester courte et renvoyer ici pour le détail.

- [x] **Task 3 — Validation finale**
  - Aucun test automatisé à écrire (story purement documentaire, AC2 exclut explicitement toute garde automatisée).
  - Vérifier que les deux fichiers modifiés restent cohérents entre eux (pas de contradiction de formulation) et lisibles en l'état (Markdown valide, pas de rupture de structure des listes existantes).
  - **Aucune modification de code** (`apps/api`, `apps/web`, `packages/shared`) — cette story ne touche que de la documentation.

### Review Findings

Revue de code le 2026-07-23 (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 2 patches appliqués, 0 item différé, 10 écartés.

- [x] [Review][Patch] `CLAUDE.md` laissait entendre que `RealtimeService` lui-même expose un signal « changed », alors que ce signal vit sur chaque service de domaine (`ScenariosService.changed`, `InvitationsService.changed`, etc.) — `RealtimeService` ne fait que le propager depuis la connexion SSE. Incohérent avec `docs/checklist.md` qui, lui, l'attribuait déjà correctement. Corrigé : reformulation dans `CLAUDE.md`. [`CLAUDE.md`]
- [x] [Review][Patch] L'item de `docs/checklist.md` ne mentionnait pas que `connect()`/`disconnect()` ne sont en général ouverts que par le composant/page de tête, les composants imbriqués (ex. `ScenarioTimeline`/`SeanceList`) se contentant de l'`effect()` sur le signal déjà propagé par une connexion ancêtre — omission pouvant amener un futur contributeur à ouvrir une connexion `EventSource` redondante pour un composant enfant. Corrigé : précision ajoutée. [`docs/checklist.md`]

**Écarté (faux positifs / non pertinents)** : vague/non-actionable « évaluer le besoin » — intentionnel, l'AC2 exclut explicitement toute garde automatisée au profit d'un jugement humain/agent ; absence de définition stricte de « données de Partie » — même raisonnement, portée volontairement laissée au jugement ; « contradiction » entre absence de garde automatisée et confiance dans le respect de la règle — c'est le compromis explicitement acté par AC2, pas un défaut ; référence `_bmad-output/implementation-artifacts/21-*.md`/`19-*.md` jugée « cassée » — vérifiée : ces fichiers existent bel et bien et documentent le pattern référencé ; « service de domaine concerné » jugé sous-spécifié — portée volontairement générique, cohérent avec le principe d'une règle transverse ; risque de coquille sur le format de topic (`partie:{id}`) — spéculatif ; duplication entre les deux fichiers — non avérée, `CLAUDE.md` reste court et renvoie à `docs/checklist.md` pour le détail, sans dupliquer son contenu ; absence de signal de sévérité/priorité sur l'item de checklist — nit de style ; granularité de section jugée incohérente avec les sections voisines — nit de style.

## Dev Notes

### Dernière story du Palier 7 — aucun code, uniquement de la documentation

Contrairement à toutes les autres stories de ce palier (18.x-22.1), celle-ci ne touche **aucun fichier de code source**. FR15 du PRD est explicite : *« pas de garde automatisée, vérification humaine/agent documentée suffit »* — ne pas interpréter cette story comme une opportunité d'ajouter un lint custom, un script de vérification CI, ou un test qui inspecterait les composants du projet à la recherche d'un câblage SSE manquant. Ce serait un contournement de la décision produit explicite (AC2), pas une amélioration.

### Où écrire la règle : les deux fichiers déjà prévus par l'AC

L'AC1 dit « `CLAUDE.md` **et/ou** `docs/checklist.md` » — cette story choisit les **deux**, par cohérence avec le pattern déjà établi dans le projet : `CLAUDE.md` (lu par Claude en début de session, contient une section `## Conventions` pour des règles générales de ce type) renvoie déjà vers `docs/checklist.md` comme « source de vérité » pour les rappels d'action concrets (cf. `CLAUDE.md` ligne 37 actuelle, section « Rappels à faire à l'utilisateur »). Reproduire cette répartition : une puce courte dans `CLAUDE.md` (rappel de principe), un item de checklist plus détaillé dans `docs/checklist.md` (action concrète à vérifier).

### Testing Standards

- Aucun test à écrire — story documentaire pure (cf. Task 3).

### Previous Story Intelligence (Epic 18-22)

- Cette story clôt formellement le Palier 7 (Synchronisation client/serveur en temps quasi réel). Les patterns établis au fil des Stories 18.1 à 22.1 (RealtimeService/partieTopic-userTopic/notifyChanged/firstRun/matchesPartie) sont ce que la règle documentée doit permettre de retrouver rapidement pour un futur palier — d'où le renvoi explicite vers les fichiers de story existants (`_bmad-output/implementation-artifacts/`) plutôt qu'une reformulation abstraite du mécanisme.

### Project Structure Notes

- Fichiers modifiés : `CLAUDE.md`, `docs/checklist.md`. Aucun fichier nouveau, aucune migration, aucun changement `apps/api`/`apps/web`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 22.2 complète, lignes 339-353 ; FR15, ligne 46)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (Capability → Architecture Map : « FR-15 (convention documentée pour l'avenir) | `CLAUDE.md`/`docs/checklist.md` (hors code) | Pas de décision d'architecture — mécanique documentaire »)
- `CLAUDE.md` (état actuel lu intégralement avant rédaction de cette story — section `## Conventions` lignes 23-28, section rappels lignes 30-37)
- `docs/checklist.md` (état actuel lu intégralement avant rédaction de cette story — format `- [ ]` par section `##`)
- `_bmad-output/implementation-artifacts/22-1-reactivite-dopenpollsservice-et-modeservice-au-signal-temps-reel.md` (dernière story de code du palier, clôt FR14 ; cette story 22.2 clôt FR15, dernier FR du Palier 7)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `git status`/`git diff` ne montrent aucun changement après modification de `CLAUDE.md`/`docs/checklist.md` — vérifié que c'est attendu : ces deux chemins (ainsi que `_bmad/`, `_bmad-output/`, `.claude/`) sont explicitement exclus du dépôt via `.gitignore` (« Specs / planification — privé pour l'instant (hors repo public) »). Contenu confirmé présent sur disque par lecture directe des deux fichiers après édition.
- Aucun test automatisé exécuté (story purement documentaire, AC2 exclut explicitement toute garde automatisée) — conforme à Task 3.

### Completion Notes List

- Task 1 : puce « Temps réel (SSE) » ajoutée dans `CLAUDE.md`, section `## Conventions`, même format court que les deux puces existantes (« Architecture plugin », « Sécurité »), renvoi vers `docs/checklist.md` pour le détail.
- Task 2 : nouvelle section « Nouveau composant affichant des données de Partie (ou de l'utilisateur) » ajoutée dans `docs/checklist.md`, placée après « Tâches sensibles » et avant « Git », avec un item détaillé renvoyant aux patterns établis au Palier 7.
- Task 3 : les deux fichiers relus intégralement après modification — cohérents entre eux, Markdown valide, aucune rupture de structure des listes existantes. Aucune modification de code (`apps/api`/`apps/web`/`packages/shared`) — confirmé, seuls les deux fichiers de documentation ont été touchés. Aucune garde automatisée introduite (pas de lint/CI/test), conforme à AC2.
- Cette story clôt formellement le Palier 7 (Synchronisation client/serveur en temps quasi réel) — FR15 (dernier FR du palier) désormais couvert.

### File List

- `CLAUDE.md` (modifié — hors dépôt git, `.gitignore`)
- `docs/checklist.md` (modifié — hors dépôt git, `.gitignore`)

## Change Log

- 2026-07-23 : Implémentation complète de la Story 22.2 (Tasks 1-3) — règle SSE documentée dans `CLAUDE.md` et `docs/checklist.md`. Aucun code touché, aucun test à écrire (story purement documentaire, AC2). Dernière story du Palier 7 — palier désormais entièrement terminé (FR1-FR15).
- 2026-07-23 : Revue de code (3 couches adversariales) — 2 patches appliqués (attribution incorrecte du signal `changed` à `RealtimeService` dans `CLAUDE.md`, omission du pattern parent/enfant dans `docs/checklist.md`), 0 item différé, 10 écartés. Statut passé à `done`.
