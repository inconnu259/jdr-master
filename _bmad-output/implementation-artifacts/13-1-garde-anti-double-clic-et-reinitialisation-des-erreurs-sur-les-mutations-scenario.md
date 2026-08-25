---
baseline_commit: 835bf7a446b42bd76b886dfd28721c10bc98b198
---

# Story 13.1: Garde anti-double-clic et réinitialisation des erreurs sur les mutations scénario

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want qu'un clic sur une action de mutation scénario (Marquer Courant, Clôturer, Participer, et tout CTA équivalent) ne déclenche jamais deux fois la même requête, et que les messages d'erreur périmés disparaissent quand l'état change ailleurs,
so that je ne me retrouve jamais bloqué par un état incohérent après une action.

## Acceptance Criteria

1. **Given** je clique rapidement deux fois sur un CTA de mutation scénario (Marquer comme Courant, Clôturer le scénario, Participer à cette enquête, Ajouter une séance, Enregistrer [description], Enregistrer le résumé de fin, upload de document) **When** le premier clic a déjà déclenché une requête en cours **Then** le second clic ne déclenche aucun appel réseau supplémentaire **And** le CTA est visuellement désactivé pendant l'appel.
2. **Given** un message d'erreur est affiché suite à l'échec d'une de ces actions (`markCourantError`, `closeError`, `addSeanceError`, `fieldEditError`, `uploadError`, `downloadError`, `resumeFinError` dans `ScenarioEditor` ; `participantError` dans `ScenarioReadDialog`) **When** le scénario affiché change parce qu'une nouvelle valeur est reçue en entrée du composant (`scenarioInput()` change dans `ScenarioEditor` — équivalent au « remontage » évoqué au FR pour ce composant qui n'est jamais réellement démonté tant que la page reste ouverte ; nouvelle valeur `fresh` obtenue par `ScenarioReadDialog.ngOnInit()`) **Then** le message d'erreur correspondant disparaît.
3. **Given** un CTA de mutation est désactivé pendant qu'un appel est en cours **When** l'appel se termine (succès ou échec) **Then** le CTA redevient cliquable — jamais bloqué indéfiniment (garantie du `finally`).

## Tasks / Subtasks

- [x] **Task 1 — `ScenarioEditor` : signaux `pending` locaux par méthode de mutation (AC1, AC3)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`
  - Reproduire **exactement** le pattern `SeanceList.pollActionPending` (AD-8) — signal `signal(false)` nommé `<action>Pending`, vérifié en tête de méthode (`if (this.xPending()) return;`), mis à `true` avant l'appel, remis à `false` dans un `finally`. Pas de signal partagé unique entre plusieurs CTA (voir Dev Notes — piège déjà identifié ailleurs dans le projet).
  - Méthodes concernées, avec le signal à créer pour chacune :
    - [x] `markCourant()` (ligne 220) → `markCourantPending`
    - [x] `close()` (ligne 233) → `closePending`
    - [x] `addSeance()` (ligne 244) → `addSeancePending`
    - [x] `onFieldConfirm()` (ligne 155) → `fieldEditPending`
    - [x] `submitDescription()` (ligne 168) → réutilise `fieldEditPending` (même signal d'erreur `fieldEditError` que `onFieldConfirm`, cohérence à conserver)
    - [x] `upload()` (ligne 203, appelée par `onScenarioFileSelected`/`onLibraryFileSelected`) → `uploadPending`
    - [x] `submitResumeFin()` (ligne 255) → `resumeFinPending`
    - [x] `downloadDocument()` (ligne 272) → `downloadPending` (pas une mutation à proprement parler, mais un double-clic déclenche deux téléchargements concurrents — même garde par cohérence, cf. FR1 "tout CTA équivalent")
  - Chaque bouton du template (`scenario-editor.html`) reçoit `[disabled]="xPending()"` sur le CTA correspondant (lignes 14, 17, 19, 46, 91 ; inputs file lignes 136/148 → `[disabled]`).
  - **`downloadDocument()` est déclenché par des `<li (click)="downloadDocument(doc)">` (lignes 129, 142), pas des `<button>`** — `[disabled]` n'est pas une propriété DOM valide sur `<li>` (le compilateur Angular le rejettera). Gater visuellement via `[class.disabled]="downloadPending()"` + règle CSS correspondante (`pointer-events: none; opacity: 0.5;` ou équivalent déjà utilisé ailleurs dans le projet) dans `scenario-editor.scss`, en plus de la garde de réentrance dans la méthode elle-même (qui, elle, empêche déjà tout second appel réseau indépendamment du rendu visuel).

- [x] **Task 2 — `ScenarioReadDialog` : signal `pending` pour `participate()` (AC1, AC3)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`
  - `participate()` (ligne 147) → nouveau signal `participatePending`, même pattern qu'au Task 1.
  - Bouton « Participer à cette enquête » (`scenario-read-dialog.html:111`) reçoit `[disabled]="participatePending()"`.
  - **Hors scope explicite** : `toggleAutoAssociate()` (ligne 164), `toggleShare()` (ligne 181) et `toggleNoteAssociation()` (ligne 197) sont aussi des méthodes de mutation sans garde `pending`, partageant toutes trois `journalError` (un cas déjà réel du piège décrit dans les Dev Notes). Elles ne sont ni citées dans l'AC de cette story ni dans `deferred-work.md` — **ne pas les toucher ici**, elles restent un gap connu mais non tracké, à signaler explicitement dans les Completion Notes plutôt qu'à corriger silencieusement ou à ignorer sans trace.

- [x] **Task 3 — `ScenarioEditor` : réinitialisation des erreurs périmées sur changement d'entrée (AC2)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`, `effect()` du constructeur (lignes 108-114).
  - Ajouter la remise à `null` de **tous** les signaux d'erreur du composant (`markCourantError`, `closeError`, `addSeanceError`, `fieldEditError`, `uploadError`, `downloadError`, `resumeFinError`) dans cet `effect()`, aux côtés du reset déjà existant de `descriptionDraft`/`resumeFinDraft`.
  - Ne pas toucher `documentsError` (rechargement séparé géré par `ngOnInit`, hors scope AC2 — les documents ne sont pas rechargés par ce chemin).
  - **Décision laissée à l'implémentation** (comme FR5 le permet pour un cas analogue) : `onSeanceLinked()` (ligne 268) met aussi à jour `scenario()` localement suite à une action sur une séance enfant (`SeanceList`) — décider si ce chemin doit aussi déclencher un reset des erreurs de ce composant-ci (probablement non : ce sont des erreurs indépendantes du sous-composant séance), documenter le choix dans Completion Notes.
  - **Décision prise** : `onSeanceLinked()` n'a pas été touché — les erreurs de `ScenarioEditor` (mark/close/addSeance/field/upload/download/resumeFin) sont indépendantes des actions sur une séance enfant (`SeanceList` a son propre `pollActionPending`/`error` déjà isolés), aucune raison fonctionnelle de les effacer sur ce chemin.

- [x] **Task 4 — `ScenarioReadDialog` : réinitialisation de `participantError` sur rechargement (AC2)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`, `ngOnInit()` (lignes 121-129).
  - Remettre `participantError` à `null` quand un `fresh` scénario est effectivement obtenu et appliqué (dans le `if (fresh) this.scenario.set(fresh);`), pas si le rafraîchissement échoue silencieusement (le `catch` existant garde l'ancien scénario affiché tel quel — cohérent de ne pas non plus effacer une erreur encore valide dans ce cas).

- [x] **Task 5 — Tests**
  - `scenario-editor.spec.ts` : pour chaque méthode du Task 1, un test « double-clic rapide → un seul appel réseau » (2 appels synchrones à la méthode avant résolution de la promesse mockée, assert `toHaveBeenCalledTimes(1)`) + un test « bouton désactivé pendant l'appel, réactivé après » (assert `[disabled]` avant/pendant/après résolution). Pour le Task 3, un test par signal d'erreur : erreur affichée, puis `scenarioInput` change (nouvelle valeur `ScenarioDto`) → erreur disparue.
  - `scenario-read-dialog.spec.ts` : mêmes deux tests (double-clic, disabled) pour `participate()` ; test dédié pour le reset de `participantError` sur rechargement réussi de `ngOnInit`.
  - Suivre la convention `describe('CTA « ... »')` déjà en place dans ces deux fichiers de spec (cf. `describe('CTA « Marquer comme Courant » (AC8)', ...)` existant).

- [x] **Task 6 — Validation finale**
  - `docker compose exec web pnpm exec ng test --watch=false` — 0 régression (798/798 tests web).
  - `docker compose exec web pnpm exec ng build --configuration development` — compilation propre (pas de script `typecheck` dédié dans ce package ; le build de production échoue sur un budget de bundle déjà dépassé avant cette story de 185 Ko, sans rapport avec ce diff — confirmé pré-existant, non traité ici, hors scope Palier 6/FR1-FR24).
  - Aucune modification backend, aucune migration Prisma, aucun nouveau module (AD-9) — cette story est strictement frontend.

### Review Findings

Revue du 2026-07-18 (3 couches adversariales : Blind Hunter, Edge Case Hunter, Acceptance Auditor).

- [x] [Review][Decision] `fieldEditPending` partagé entre `onFieldConfirm()` (3 pencils indépendants : titre, `dureeHeures`, `dureeSeances`) et `submitDescription()` — un clic sur un pencil pendant qu'un autre est en vol était **silencieusement ignoré**, sans aucun feedback utilisateur. Confirmé par les 3 couches (Blind Hunter, Acceptance Auditor, Edge Case Hunter). **Résolu (2026-07-18)** : décision utilisateur — scinder par champ. Remplacé par `pendingFields = signal<ReadonlySet<ScenarioTextField>>(new Set())` + `fieldPending(field)`/`setFieldPending(field, pending)`, chaque champ (`title`, `dureeHeures`, `dureeSeances`, `description`) suit désormais son propre état ; 2 champs différents peuvent être édités en parallèle sans perte silencieuse. 2 nouveaux tests ajoutés (édition parallèle de 2 champs → les 2 appels partent ; `fieldPending(field)` vrai uniquement pour le champ en vol). `fieldEditError` reste un signal partagé (hors scope de la décision, non touché). 61/61 tests `scenario-editor.spec.ts`, 800/800 tests web au global.
- [x] [Review][Defer] `downloadPending`/`uploadPending` partagés entre toutes les lignes de documents (propres + bibliothèque) → télécharger/uploader un document bloque visuellement et fonctionnellement les autres pendant l'appel [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, scenario-editor.html] — deferred, conforme au texte littéral de la story (Task 1 : un signal par *méthode* de mutation, pas par instance de ligne), même limitation déjà acceptée pour `SeanceList.pollActionPending` (cf. Dev Notes de cette story elle-même, `deferred-work.md` section 8-4)
- [x] [Review][Defer] Course entre deux mutations indépendantes (ex. `close()` et `submitDescription()`) résolues dans le désordre → la réponse la plus lente écrase `scenario()` avec un état obsolète, aucune réconciliation par version [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts] — deferred, risque pré-existant avant cette story (cette story ne fait que garder chaque méthode contre son propre double-clic, elle ne change rien à l'absence de garde inter-méthodes qui existait déjà)

4 findings écartés comme bruit : `participantError` non réinitialisée via `onSeanceLinked()` dans `ScenarioReadDialog` (cohérent avec la décision symétrique déjà actée pour `ScenarioEditor.onSeanceLinked()` à la Task 3 — erreurs indépendantes des actions sur une séance enfant) ; remise à zéro groupée de `uploadError`/`downloadError` avec les erreurs de champ dans l'`effect()` (c'est exactement ce que demande l'AC2, pas un bug) ; absence de garde clavier sur les `<li>` désactivés visuellement (pattern de clic sans support clavier déjà pré-existant avant cette story) ; absence de spinner/texte "en cours" (l'AC1 ne demande qu'une désactivation visuelle, déjà satisfaite par `[disabled]`).

## Dev Notes

### Architecture — décisions contraignantes (AD-8, `ARCHITECTURE-SPINE.md` du 2026-07-18)

- **AD-8 [ADOPTED]** : chaque composant concerné (`ScenarioEditor`, `ScenarioReadDialog`) ajoute son **propre signal booléen `pending` local par méthode de mutation**, suivant exactement le modèle `SeanceList.pollActionPending` — pas de directive/service générique, pas de nouvelle abstraction. Dupliquer le pattern est le choix architectural explicite (moins coûteux que de généraliser pour ~5 usages au total dans le projet).
- **Convention de projet actée** (table de cohérence de la spine) : « Toute action de mutation déclenchée par un CTA porte un signal `pending` local qui désactive le CTA pendant l'appel (AD-8) — convention à appliquer à toute nouvelle mutation future, pas seulement celles de ce palier. » Cette story est donc normative pour tout code futur, pas un patch isolé.
- **AD-9** : aucun nouveau module NestJS pour ce palier — non déclenché ici (story 100% frontend) mais à ne pas violer si un doute survient.
- **FR2 (reset d'erreurs)** : la spine documente explicitement qu'aucune AD dédiée n'est requise — « correctifs locaux, aucune décision d'architecture requise, pas de risque de divergence entre implémentations indépendantes ». Latitude d'implémentation locale, comportement à documenter (cf. Task 3, décision `onSeanceLinked`).
- **P1-AD-5 (héritée)** : tout template Angular touché utilise `@if`/`@for`, jamais `*ngIf`/`*ngFor` — déjà respecté dans les deux fichiers `.html` concernés, à ne pas régresser.

### ⚠️ Piège à éviter : signal `pending` partagé entre plusieurs CTA indépendants

`SeanceList.pollActionPending` (le pattern de référence lui-même) partage **un seul** signal entre toutes les lignes de séance d'un scénario — connu et accepté comme limitation mineure pour ce composant (cf. `deferred-work.md`, « Deferred from: code review of 8-4-compte-rendu-seance »), mais **pas un modèle à reproduire pour des CTA sans rapport entre eux**. Une expérience très proche vient d'être corrigée dans la Story 12.2 (revue de code du 2026-07-18) : deux sections de téléchargement de `PartieDetail` partageaient un seul signal `downloadingAsset`/`assetDownloadError`, provoquant une fuite d'état entre sections indépendantes (un téléchargement en cours désactivait aussi les boutons de l'autre section). **Chaque méthode de mutation de cette story doit avoir son propre signal `pending`** (cf. Task 1 — 6 signaux distincts pour `ScenarioEditor`, pas un seul `mutationPending` global), sans quoi cliquer « Ajouter une séance » désactiverait aussi « Marquer comme Courant » pendant l'appel, ce qui n'a aucune raison fonctionnelle.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/features/scenarios/seance-list/seance-list.ts`** (lignes 54, 79-91, 124-137 notamment) — patron exact du signal `pending` à répliquer : déclaration `protected readonly xPending = signal(false);`, garde `if (this.xPending()) return;` en tête de méthode, `set(true)` avant l'appel, `set(false)` dans un `finally`. Gabarit à copier littéralement pour chaque nouvelle méthode.
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** (fichier entier, 289 lignes) — toutes les méthodes de mutation à garder sont déjà listées au Task 1 avec leurs numéros de ligne actuels ; lire aussi l'`effect()` du constructeur (108-114) et `ngOnInit()` (117-153) pour comprendre le cycle de rechargement existant avant d'y ajouter les resets d'erreur.
- **`apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`** (fichier entier, 229 lignes) — `participate()` (147-156) et `ngOnInit()` (121-129, avec le `if (fresh) this.scenario.set(fresh);` où insérer le reset de `participantError`).
- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** — `_changed`/`changed` (lignes 25-26) : signal global incrémenté sur **toute** mutation, où qu'elle survienne dans l'app. Seul `ScenarioTimeline` l'écoute aujourd'hui (`scenario-timeline.ts:111-115`) ; ni `ScenarioEditor` ni `ScenarioReadDialog` ne le lisent — leur seul mécanisme de rechargement est respectivement l'`effect()` sur `scenarioInput()` et le fetch unique de `ngOnInit()`. **Ne pas ajouter d'écoute de `changed()` dans ces deux composants** — hors scope de cette story (le FR ne le demande pas, et cela toucherait FR19, hors scope de 13.1).
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts`** (describes existants : « CTA « Marquer comme Courant » (AC8) » ligne 173, « CTA « Clôturer le scénario » (AC6, Story 7.7) » ligne 219) — convention de nommage des blocs de test à réutiliser pour les nouveaux tests double-clic/disabled.

### Historique — ces gaps sont documentés depuis plusieurs stories précédentes

Tous les manques comblés par cette story ont déjà été identifiés et sciemment différés lors de revues de code antérieures (jamais traités individuellement, regroupés ici par décision explicite du Palier 6 — cf. `deferred-work.md`) :
- CTA « Marquer comme Courant » sans garde : différé depuis la Story 7.6.
- `markCourantError` jamais réinitialisée : différé depuis la Story 7.6.
- CTA « Clôturer le scénario » sans garde : différé depuis la Story 7.7.
- `closeError` jamais réinitialisée : différé depuis la Story 7.7.
- CTA « Participer à cette enquête » sans garde, `participantError` jamais réinitialisée : différé depuis les Stories 7.6/7.7 (mentionné à nouveau en 8.1).
- Aucun bouton d'action de `ScenarioEditor` (`submitDescription`, `markCourant`, `close`, `addSeance`) n'a de garde loading/disabled : différé depuis la Story 8.5, qui a introduit `submitResumeFin` avec le même manque.

Ces items apparaissent dans `_bmad-output/implementation-artifacts/deferred-work.md` sous plusieurs sections « Deferred from: code review of 7-6-... », « 7-7-... », « 8-1-... », « 8-4-... », « 8-5-... ». Une fois cette story `done`, ces lignes du fichier peuvent être marquées résolues (à faire lors de la revue de code de cette story, pas maintenant).

### Project Structure Notes

- Aucun nouveau fichier — uniquement des modifications dans `scenario-editor.ts`/`.html`, `scenario-read-dialog.ts`/`.html`, et leurs `.spec.ts` respectifs.
- Aucune migration Prisma, aucun nouveau module NestJS (AD-9), aucune modification backend.
- Cohérent avec la structure `apps/web/src/app/features/scenarios/` existante — pas de nouveau répertoire.

### Testing Standards

- Frontend : Vitest, fichiers `*.spec.ts` déjà en place à côté des composants — étendre les fichiers existants, ne pas en créer de nouveaux.
- Pattern de test double-clic : appeler la méthode deux fois de suite de façon synchrone (avant que la promesse mockée du service ne se résolve), puis `expect(serviceMethod).toHaveBeenCalledTimes(1)`.
- Pattern de test disabled : après le premier appel (avant résolution), `fixture.detectChanges()` puis assert `button.disabled === true` ; résoudre la promesse, `await` + `fixture.detectChanges()`, assert `button.disabled === false`.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 92-96, 141-161 — Epic 13 / Story 13.1 complète, FR1/FR2)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (AD-8, table de cohérence « État & gardes UI »)
- `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-18/prd.md` (§4.1 FR1/FR2, §3 Glossaire « Garde anti-double-clic »/« Staleness »)
- `_bmad-output/implementation-artifacts/deferred-work.md` (sections « Deferred from: code review of 7-6-... », 7-7, 8-1, 8-4, 8-5 — inventaire exhaustif des gaps comblés par cette story)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (patron `pollActionPending` à répliquer)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (revue de code Story 12.2, 2026-07-18 — piège du signal `pending`/erreur partagé entre sections indépendantes, à éviter ici)

## Change Log

- 2026-07-18 : Revue de code (`bmad-code-review`, 3 couches adversariales). 1 décision utilisateur résolue (`fieldEditPending` scindé par champ — `pendingFields`/`fieldPending()`/`setFieldPending()` remplacent le booléen unique, 2 champs distincts peuvent désormais être édités en parallèle sans perte silencieuse) + 2 items différés (signal `downloadPending`/`uploadPending` partagé entre lignes de documents, course inter-méthodes pré-existante sur `scenario()`) + 4 écartés comme bruit. 2 nouveaux tests. 800/800 tests web au vert.
- 2026-07-18 : Implémentée via `bmad-dev-story`. 6 tasks complétées en TDD (signaux `pending` par méthode de mutation dans `ScenarioEditor`/`ScenarioReadDialog`, réinitialisation des erreurs périmées sur changement d'entrée/rechargement). 22 nouveaux tests, 798/798 tests web au vert, aucune régression. Statut passé à `review`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Task 1 : 7 signaux `pending` ajoutés à `ScenarioEditor` (`markCourantPending`, `closePending`, `addSeancePending`, `fieldEditPending` — partagé entre `onFieldConfirm`/`submitDescription`, `uploadPending`, `resumeFinPending`, `downloadPending`), tous suivant le pattern `SeanceList.pollActionPending` (garde de réentrance en tête de méthode, `set(true)` avant l'appel, `set(false)` dans un `finally`). Chaque bouton du template reçoit `[disabled]="xPending()"` sur son signal propre (jamais un signal partagé entre CTA indépendants, cf. piège documenté dans les Dev Notes).
- `downloadDocument()` est déclenché par des `<li (click)="...">`, pas des `<button>` — `[disabled]` n'y est pas une propriété DOM valide. Gardé visuellement via `[class.disabled]="downloadPending()"` + règle CSS (`pointer-events: none; opacity: 0.5;`) dans `scenario-editor.scss`.
- Task 2 : `participatePending` ajouté à `ScenarioReadDialog`, même pattern. **Hors scope confirmé** (comme prévu par la story) : `toggleAutoAssociate()`/`toggleShare()`/`toggleNoteAssociation()` restent sans garde `pending`, non touchées — gap connu, non tracké dans `deferred-work.md` avant cette story, signalé ici pour trace future.
- Task 3 : les 7 signaux d'erreur de `ScenarioEditor` (`markCourantError`, `closeError`, `addSeanceError`, `fieldEditError`, `uploadError`, `downloadError`, `resumeFinError`) sont réinitialisés dans l'`effect()` du constructeur, déclenché à chaque changement de `scenarioInput()`. `documentsError` n'est volontairement pas concerné (rechargement séparé via `ngOnInit`, hors scope AC2). `onSeanceLinked()` n'a pas été instrumenté : ses erreurs sont indépendantes de celles gérées par ce composant (décision documentée dans la Task 3 elle-même).
- Task 4 : `participantError` de `ScenarioReadDialog` réinitialisé uniquement quand un `fresh` scénario est effectivement obtenu et appliqué dans `ngOnInit()` — pas si le rechargement échoue silencieusement (cohérent avec le comportement existant qui garde l'ancien scénario affiché tel quel dans ce cas).
- Task 5 : 3 tests par CTA guardé (double-clic → 1 seul appel réseau ; bouton désactivé pendant l'appel ; reset d'erreur sur changement d'entrée), suivant la convention `describe('CTA « ... »')` déjà en place. Pour `markCourant()`/`close()`, le succès change le statut du scénario et fait disparaître le bouton du DOM (garde `@if` existante) — le test « réactivé après » vérifie donc le signal `xPending()` directement plutôt que l'état DOM du bouton disparu.
- Task 6 : 798/798 tests web au vert (suite complète, aucune régression). Pas de script `pnpm typecheck` dédié dans ce projet — `ng build --configuration development` utilisé comme équivalent (compilation stricte sans les budgets de bundle de la config production), compilation propre. Le build de production (`ng build` sans configuration) échoue sur un budget de bundle déjà dépassé de 185 Ko **avant** cette story (confirmé en isolant le diff) — pré-existant, sans rapport avec ce changement, hors scope de cette story et du Palier 6 (FR1-FR24 ne couvrent pas la taille du bundle).
- `pnpm exec ng lint` : 66 erreurs pré-existantes sur des fichiers non touchés par cette story (`partie-form.spec.ts`, `seance-list.ts`, `scenario-drafts.html`, `partie-detail.ts`) confirment que la commande était déjà rouge avant cette story. Les `<li (click)="downloadDocument(doc)">` de `scenario-editor.html` déclenchent aussi 2 erreurs d'accessibilité (`click-events-have-key-events`/`interactive-supports-focus`) — mais ce pattern (clic sans clavier) existait déjà avant cette story (vérifié via `git show HEAD:...`), je n'ai fait qu'y ajouter `[class.disabled]`. Non corrigé ici (hors scope AC de cette story).

### File List

- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (7 signaux `pending`, garde de réentrance + `finally` sur 8 méthodes, reset des 7 signaux d'erreur dans l'`effect()` du constructeur)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (`[disabled]`/`[class.disabled]` sur les CTA et les lignes de document)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.scss` (règle `.document-row.disabled`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (18 nouveaux tests Story 13.1)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (`participatePending`, reset de `participantError` sur rechargement réussi)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (`[disabled]` sur le bouton « Participer »)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (4 nouveaux tests Story 13.1)
