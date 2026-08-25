---
baseline_commit: 3c6c96320249856e39b9822d80f5009daf0beeca
---

# Story 27.4: Vérification de complétude en fin de palier

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ (utilisateur du projet),
I want qu'on me redemande explicitement s'il reste du contenu à ajouter une fois tout implémenté,
so that le palier ne se termine pas avec des textes/classes/armes/sorts oubliés.

## Contexte

**Ceci n'est PAS une story de code.** Aucune implémentation, aucun test automatisé, aucun fichier à modifier — c'est un rappel de process, une seule fois, en fin de Palier 8 (cohérent avec la convention déjà établie au Palier 7, FR-15 : rappel manuel `docs/checklist.md`, pas de garde automatisée).

Toutes les stories du Palier 8 (Épics 23 à 27, soit les Stories 23.1 à 27.3) sont déjà `done` dans `sprint-status.yaml` au moment de la création de cette story :

- Épic 23 (Contenu Ryuutama enrichi) : 23.1 à 23.9 — `done`
- Épic 24 (Profils d'attributs) : 24.1 — `done`
- Épic 25 (Refonte du choix d'arme) : 25.1, 25.2 — `done`
- Épic 26 (Équipement de départ) : 26.1 — `done`
- Épic 27 (Rôles de groupe) : 27.1, 27.2, 27.3 — `done`

## Acceptance Criteria

1. **Given** les Stories 23.1 à 27.3 toutes complétées, **when** cette story démarre, **then** l'agent/le développeur redemande explicitement à l'utilisateur s'il reste des textes, classes, armes, sorts ou autres éléments de contenu à ajouter.
2. **Given** ce rappel, **when** il est fait, **then** c'est une seule fois, en fin de palier — pas répété à chaque story, et sans aucune mécanique de code ni test automatisé associé (cohérent avec la convention SSE déjà établie, Palier 7 FR-15).

## Tasks / Subtasks

- [x] Task 1 — Vérifier la complétude du palier (AC: #1)
  - [x] Charger `_bmad-output/implementation-artifacts/sprint-status.yaml` en entier, confirmer que toutes les stories 23-1 à 27-3 sont bien `status: done` (déjà vérifié à la création de cette story, cf. Contexte ci-dessus — reconfirmer au moment de l'exécution, l'état peut avoir changé).
  - [x] Si une story du palier n'est pas `done`, HALT et signaler à l'utilisateur laquelle avant de poser la question de complétude (ne pas poser la question tant que le palier n'est pas réellement terminé).
- [x] Task 2 — Poser la question de complétude une seule fois (AC: #1, #2)
  - [x] Demander explicitement à l'utilisateur : « Le Palier 8 est terminé (Épics 23 à 27). Reste-t-il des textes, classes, armes, sorts ou autres éléments de contenu Ryuutama à ajouter avant de considérer ce palier comme clos ? »
  - [x] Attendre la réponse de l'utilisateur. Ne pas déduire ou supposer une réponse.
  - [x] Consigner la réponse telle quelle dans Dev Agent Record → Completion Notes (texte verbatim ou résumé fidèle) — c'est la seule trace attendue, aucun code/test à produire.
  - [x] Si l'utilisateur signale du contenu manquant : ne pas l'implémenter dans cette story (hors scope) — noter dans Completion Notes que l'utilisateur devra le faire créer via une nouvelle story/epic (`create-story` ou `correct-course`), et laisser cette story 27.4 passer à `review` normalement (le rappel a été fait, c'est la totalité de son AC — l'ajout de contenu lui-même n'est pas une tâche de cette story). — N/A, l'utilisateur a répondu qu'il ne restait rien à ajouter.

## Dev Notes

- **Aucun fichier de code à créer/modifier.** Cette story n'a pas de "File List" au sens habituel — si aucun fichier n'est touché, le laisser vide plutôt que d'inventer un changement.
- **Ne pas répéter ce rappel à l'avenir dans une autre story** — c'est un événement unique de fin de palier, pas un pattern à industrialiser (pas de nouveau mécanisme de code, pas de checklist automatisée — cf. AC2, cohérent avec la convention Palier 7 FR-15 déjà établie : rappel manuel dans `docs/checklist.md`, vérification humaine/agent à chaque palier, jamais une garde CI/lint).
- **Ne pas halluciner de contenu manquant** — cette story ne doit jamais elle-même proposer une liste de "ce qui manque probablement" ; elle pose la question à l'utilisateur et attend sa réponse réelle (cohérent avec la règle absolue de l'Épic 23 : ne jamais inventer de contenu, même partiellement).
- **Si l'utilisateur répond qu'il reste du contenu** : ne pas commencer à l'ajouter dans cette story — c'est un signal pour une story/epic future, pas une extension de scope de 27.4.

### Project Structure Notes

- Aucun changement de structure de fichiers prévu par cette story.

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 27.4] — Acceptance Criteria d'origine
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml] — état de complétude du Palier 8 (Épics 23-27) au moment de la création de cette story
- [Source: CLAUDE.md, section "Rappels à faire à l'utilisateur"] — convention déjà établie de rappels manuels de fin de palier/avant grosse feature (mode plan, `/security-review`, `/code-review`), même esprit que cette story mais portée différente (complétude de contenu, pas sécurité/qualité)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `sprint-status.yaml` relu en entier le 2026-07-30 : toutes les stories 23-1 à 27-3 confirmées `status: done` (Épics 23-27).

### Completion Notes List

- Task 1 : complétude du Palier 8 (Épics 23 à 27, Stories 23.1 à 27.3) reconfirmée à l'exécution — toutes `done`.
- Task 2 : question de complétude posée à l'utilisateur le 2026-07-30. Réponse : **« Non, rien à ajouter »** — le Palier 8 est considéré complet, aucun texte/classe/arme/sort manquant identifié par l'utilisateur.
- Aucun code, aucun test, aucun fichier modifié — conforme au scope de cette story (rappel de process unique, cf. AC2).
- Revue de code (`bmad-code-review`) du 2026-07-30 : diff vide confirmé (aucun fichier de code touché par cette story) — revue non applicable, confirmé avec l'utilisateur, aucun finding.

### File List

Aucun fichier de code créé ou modifié (story de process, cf. Dev Notes).
