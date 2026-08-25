---
baseline_commit: 3b221066cc3339101ea1b3f12bdc678861c5361d
---

# Story 21.3: Câblage AnnouncementForm (scénarios éligibles)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want que la liste des scénarios proposés dans le formulaire d'annonce reflète un changement de statut de scénario fait ailleurs,
so that je ne rédige jamais une annonce en référençant un scénario qui n'est plus dans le bon état.

## Acceptance Criteria

1. **Given** `AnnouncementForm` ouvert, avec sa liste de scénarios éligibles (`COURANT`/`PASSE`, filtrage `eligibleScenarios` déjà existant, AC4 de la Story 9.1) **When** un scénario devient `COURANT` (ou change de statut) pendant que le formulaire reste ouvert **Then** le sélecteur de scénarios se met à jour sans rechargement de page.
2. **Given** `ScenarioDetail` **When** ce câblage est implémenté ailleurs (Epic 19, `ScenarioEditor`) **Then** aucune modification distincte n'est nécessaire sur `ScenarioDetail` — simple wrapper routé, corrigé par transitivité. Aucune action pour cette story.

## Tasks / Subtasks

- [x] **Task 1 — `AnnouncementFormComponent` : connexion SSE + effet réactif (AC1)**
  - **Code existant à lire intégralement avant modification** : `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (75 lignes). `partieId` est un `input.required<string>()` (toujours défini, comme `ScenarioOneShotTab` — pas de repli route à gérer, contrairement à `ScenarioDrafts`, Story 21.2). `ngOnInit()` appelle `loadScenarios()` (méthode privée déjà existante, déjà extraite avec `try/catch`, AUCUNE dépendance à un état interne du composant avant de fetcher — même simplicité que `Dashboard.loadInvitations()`, Story 21.1 : réutilisable telle quelle par les deux chemins, aucun piège de timing).
  - Injecter `RealtimeService`, `DestroyRef` (nouveaux imports : `import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';`, `import { matchesPartie } from '../../../core/scenarios/scenarios.service';`, `DestroyRef` déjà importable depuis `@angular/core`).
  - Constructeur : `effect()` gardé par `firstRun` (même piège que `ScenarioEditor`/`Dashboard`/`ScenarioOneShotTab`, Stories 19.2/21.1/21.2 : `ScenariosService` est `providedIn: 'root'`, son `_changed` peut déjà porter une valeur avant le montage), filtré par `matchesPartie(change, this.partieId())` avant de recharger :
    ```typescript
    constructor() {
      let firstRun = true;
      effect(() => {
        const change = this.scenariosSvc.changed();
        if (firstRun) {
          firstRun = false;
          return;
        }
        if (!matchesPartie(change, this.partieId())) return;
        untracked(() => void this.loadScenarios());
      });
    }
    ```
  - `ngOnInit()` : ouvrir la connexion **avant** le chargement initial, fermeture via `DestroyRef` — même ordre que `ScenarioOneShotTab`/`ScenarioEditor` :
    ```typescript
    ngOnInit(): void {
      this.realtime.connect(partieTopic(this.partieId()));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(this.partieId())));
      void this.loadScenarios();
    }
    ```
  - **Ne pas toucher** `loadScenarios()`/`onSubmit()`/`eligibleScenarios` (computed déjà filtrant COURANT/PASSE, AC4 de la Story 9.1, inchangé) — le refetch complet suffit, `eligibleScenarios` se recalcule automatiquement (dérivé de `scenarios()`).
  - **Aucune modification `ScenarioDetail`** (AC2) — composant wrapper routé déjà corrigé par transitivité via `ScenarioEditor` (Story 19.2). Vérifier qu'aucune tâche ne s'y égare.

- [x] **Task 2 — Tests (AC1)**
  - **`announcement-form.spec.ts`** : ajouter un mock `RealtimeService` (`{ connect: vi.fn(), disconnect: vi.fn() }`) et `changed: signal<{ partieId: string } | null>(null)` sur `makeScenariosService()` (factory existante, ligne 27 — actuellement `{ listAll: vi.fn()... }` seul, sans `changed`, à étendre). Nouveaux tests :
    - `connect()` appelé avec `partieTopic('p1')` au montage.
    - `disconnect()` appelé à `fixture.destroy()`.
    - `scenariosSvc.changed.set({ partieId: 'p1' })` après montage (nouveau retour `listAll` incluant un scénario fraîchement `COURANT`) → `listAll` rappelé une deuxième fois, `eligibleScenarios()`/le DOM du sélecteur reflètent le scénario nouvellement éligible (flush microtasks, boucle déjà établie `for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }` — ce fichier utilise actuellement `whenStable()` seul, insuffisant pour un `effect()` réactif post-montage, cf. Dev Notes).
    - `scenariosSvc.changed.set({ partieId: 'autre-partie' })` → aucun second appel à `listAll` (filtrage `matchesPartie`).
    - Garde `firstRun` : créer le composant avec `changed` déjà à une valeur non-nulle correspondant à `'p1'` avant montage → `listAll` appelé une seule fois.

- [x] **Task 3 — Validation finale**
  - `docker compose exec web pnpm test` — 0 régression (dernier chiffre connu avant cette story : à relire dans les logs du dernier `pnpm test` exécuté, cf. Story 21.2).
  - Aucune migration Prisma, aucun changement de schéma, **aucune modification côté `apps/api`** (FR-13 est un gap purement frontend — le backend émet déjà `partieTopic` sur toute mutation de `ScenariosService`/`markCourant`/`close`, Epic 18).
  - Fichiers modifiés attendus : `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (+ spec). **Aucune modification** `apps/web/src/app/core/realtime/realtime.service.ts` (le préfixe `'partie:'` → `ScenariosService.notifyRealtimeChanged()` existe depuis la Story 19.1), `apps/web/src/app/core/scenarios/scenarios.service.ts` (déjà complet), `AnnouncementsService`/`annonce-card.ts` (hors scope, non mentionnés par l'epic — la consultation des annonces publiées, Story 9.2, n'est pas concernée par ce câblage), `ScenarioDetail`/`ScenarioEditor` (déjà câblés, Story 19.2, cf. AC2).

### Review Findings

Revue de code le 2026-07-23 (3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 2 patches appliqués, 2 items différés, 6 écartés.

- [x] [Review][Patch] `loadScenarios()` ne réinitialisait jamais `error` sur un rechargement réussi — une erreur de chargement initiale restait affichée indéfiniment même après un rafraîchissement temps réel réussi. Corrigé : `error.set(null)` ajouté à la branche de succès. [`announcement-form.ts`]
- [x] [Review][Patch] `selectedScenarioId` n'était jamais revalidé après un rechargement temps réel — si le scénario sélectionné devenait inéligible (repassé en BROUILLON, supprimé) pendant que le formulaire restait ouvert, `onSubmit()` aurait soumis un `scenarioId` qui n'apparaissait plus dans `eligibleScenarios()`. Corrigé : la sélection est réinitialisée si elle ne figure plus parmi les scénarios éligibles après rechargement. Risque introduit par cette story même (avant ce câblage, la liste de scénarios ne changeait jamais après le montage). [`announcement-form.ts`]
- [x] [Review][Defer] Absence de garde de génération/démontage entre `ngOnInit()` et l'`effect()` temps réel — même classe de risque déjà acceptée pour `Dashboard`/`ScenarioOneShotTab` (Stories 21.1/21.2). [`announcement-form.ts`] — deferred, pre-existing pattern
- [x] [Review][Defer] `effect()` lit `this.partieId()` de façon réactive tandis que la connexion SSE capture `partieId` une seule fois — même limitation déjà connue et différée depuis les Stories 18.3/21.2, non atteignable en usage réel (composant toujours imbriqué avec un `partieId` fixe). [`announcement-form.ts`] — deferred, pre-existing pattern

**Écarté (faux positifs / non pertinents)** : absence de référence explicite conservée pour le cleanup de l'`effect()` (pattern Angular standard, disposé avec le contexte d'injection) ; garde `firstRun` jugée « untestable en isolation » (convention déjà établie et acceptée dans tout le palier) ; mock `RealtimeService` dupliqué inline au lieu d'un helper partagé (nit de style, non fonctionnel) ; absence de test comparant `connect`/`disconnect` par égalité de référence (malentendu sur l'égalité profonde déjà utilisée par `toHaveBeenCalledWith`) ; `matchesPartie`/`partieTopic` non re-testés unitairement dans ce diff (déjà couverts dans leurs stories d'origine) ; refetch complet sur tout `changed()` générique plutôt qu'incrémental (comportement assumé à l'échelle du palier entier, cohérent avec NFR1).

## Dev Notes

### Story la plus simple de l'Epic 21 — aucune subtilité de piège de timing

Contrairement à `ScenarioOneShotTab` (Story 21.2, piège de la copie interne de `ScenarioEditor` non répercutée au parent), `AnnouncementFormComponent` n'a **aucun enfant** avec sa propre réactivité SSE et **aucune donnée dérivée d'un signal du composant** avant le premier fetch — `loadScenarios()` est directement réutilisable par `ngOnInit()` ET l'`effect()` temps réel, à l'identique. C'est le même cas que `Dashboard.loadInvitations()` (Story 21.1) : le garde `firstRun` économise un appel réseau redondant, il ne prévient aucun bug de timing.

### `partieId` toujours défini — pas de résolution différée

Contrairement à `ScenarioDrafts` (Story 21.2, `input()` optionnel + repli route), `AnnouncementFormComponent.partieId` est un `input.required<string>()` et ce composant n'est utilisé **que** imbriqué dans `PartieDetail` (`partie-detail.html:110`, `[partieId]="p.id"`) — aucune route directe. `partieId()` est donc utilisable directement dans le constructeur, comme `ScenarioOneShotTab`.

### Redondance de connexion assumée (AD-6)

`PartieDetail` (parent) maintient déjà sa propre connexion `partie:{id}` depuis la Story 18.3. `AnnouncementFormComponent` en ouvre une deuxième sur le même topic — intentionnel, cf. **AD-6** (*« Deux composants simultanément ouverts sur le même topic maintiennent chacun leur propre connexion, sans partage »*) et le Structural Seed de l'architecture qui liste explicitement `announcement-form.ts` parmi les composants devant « ouvrir/fermer RealtimeService ». Ne pas tenter de supprimer cette redondance.

### Piège de test à corriger : `whenStable()` seul ne suffit pas

`announcement-form.spec.ts` utilise actuellement `fixture.whenStable()` seul après `detectChanges()` (lignes 69-71, 168-170) — suffisant pour le chargement initial (une seule promesse en vol), **insuffisant** pour valider un `effect()` réactif qui se déclenche après une mutation du signal `changed()` post-montage (mémoire projet `jdr-zoneless-test-timing` : pas de zone.js, `whenStable()` seul ne couvre pas un enchaînement microtask → effect() → nouvelle promesse HTTP). Utiliser la boucle déjà établie ailleurs dans le projet (`for (let i=0;i<10;i++) { await Promise.resolve(); fixture.detectChanges(); }`) pour les nouveaux tests de cette story — les tests existants peuvent rester tels quels (ils ne testent pas de réactivité post-montage).

### Testing Standards

- `apps/web` : Vitest + `TestBed`, factory `createComponent()` déjà établie dans ce fichier.
- `matchesPartie()` (exporté par `scenarios.service.ts`) : réutiliser directement, ne jamais réimplémenter une comparaison de `partieId` ad hoc.

### Previous Story Intelligence (Stories 19.2, 21.1, 21.2)

- Pattern `firstRun` : établi Story 19.2, reproduit Stories 21.1/21.2 — un composant ayant déjà un chargement dédié dans `ngOnInit()` doit neutraliser la première exécution de l'`effect()` du constructeur.
- Régression transitive à anticiper (établie Story 19.1, reconfirmée 21.2) : `announcement-form.spec.ts` ne mock actuellement ni `RealtimeService` ni `changed` sur `ScenariosService` (`makeScenariosService()`, ligne 27-29) — à ajouter avant d'exécuter la suite complète, sinon échec immédiat sur `inject(RealtimeService)` non fourni.
- Cette story clôt l'Epic 21 (FR11-FR13 couverts après les Stories 21.1/21.2/21.3) — dernière story avant l'Epic 22 (FR14-FR15, services partagés `OpenPollsService`/`ModeService` + convention documentée).

### Project Structure Notes

- Fichier modifié : `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (+ spec).
- Aucun fichier nouveau, aucune migration, aucun changement `apps/api`.

### References

- `_bmad-output/planning-artifacts/epics-palier7.md` (Story 21.3 complète, lignes 299-313)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18-p7/ARCHITECTURE-SPINE.md` (AD-3, AD-4, AD-6 ; Structural Seed listant `announcement-form.ts`, ligne 192)
- `_bmad-output/implementation-artifacts/21-1-canal-utilisateur-et-cablage-dashboard-invitations-recues.md` (pattern `firstRun` sans piège de timing, cas le plus proche de celui-ci)
- `_bmad-output/implementation-artifacts/21-2-cablage-scenariodrafts-et-scenariooneshottab.md` (pattern `matchesPartie` + connexion propre par composant, redondance AD-6)
- Vérifications empiriques effectuées pendant la préparation de cette story : `announcement-form.ts` n'a aujourd'hui aucune réactivité SSE ; `announcement-form.spec.ts` ne mock ni `RealtimeService` ni `changed` sur `ScenariosService` ; ce composant n'est utilisé qu'imbriqué dans `PartieDetail` (`partie-detail.html:110`), aucune route directe trouvée ; `eligibleScenarios` (computed existant, AC4 Story 9.1) se recalcule automatiquement dès que `scenarios()` change, aucune modification requise sur ce filtre.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm ng test --watch=false --include='**/announcement-form.spec.ts'` — 12/12 après Task 1/2.
- `docker compose exec web pnpm test` — suite complète : 71 fichiers / 912 tests, 0 échec (avant revue de code).
- Après revue de code (2 patches + 2 nouveaux tests de régression) : `announcement-form.spec.ts` — 14/14 ; suite complète finale : 71 fichiers / 914 tests, 0 échec.

### Completion Notes List

- Task 1 : `AnnouncementFormComponent` ouvre sa propre connexion SSE (`partieTopic`, `partieId()` capturé une seule fois dans `ngOnInit()` — leçon appliquée directement depuis la revue de code de la Story 21.2 pour éviter que `disconnect()` relise un signal potentiellement modifié) et réagit à `ScenariosService.changed()` via un `effect()` gardé par `firstRun`, filtré par `matchesPartie`. `loadScenarios()` réutilisé tel quel (aucun piège de timing, comme anticipé par les Dev Notes). `eligibleScenarios` (computed AC4 pré-existant) se recalcule automatiquement, aucune modification nécessaire.
- Task 2 : nouveaux tests (connect/disconnect, refetch sur `changed()` scopé à la bonne Partie avec assertion DOM sur le sélecteur, garde `firstRun`). Les deux tests isolés pré-existants (`whenStable()` seul) ont été étendus avec un mock `RealtimeService` mais laissés inchangés sur le fond (ils ne testent pas la réactivité post-montage).
- Task 3 : suite complète relancée (912/912 tests web), aucune régression. Aucune modification `apps/api`, `RealtimeService`, `ScenariosService`, `ScenarioDetail`/`ScenarioEditor` (AC2 confirmée sans action) — conforme aux attentes de la story.

### File List

- `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (modifié)
- `apps/web/src/app/features/announcements/announcement-form/announcement-form.spec.ts` (modifié)

## Change Log

- 2026-07-23 : Implémentation complète de la Story 21.3 (Tasks 1-3) — câblage temps réel d'`AnnouncementFormComponent` (connexion SSE propre + réactivité à `ScenariosService.changed()`). 912/912 tests web passants, aucune régression. Dernière story de l'Epic 21 (FR11-FR13 du Palier 7 désormais couverts).
- 2026-07-23 : Revue de code (3 couches adversariales) — 2 patches appliqués (`error` non réinitialisé après succès, `selectedScenarioId` non revalidé après un rechargement rendant la sélection inéligible), 2 items différés (voir `deferred-work.md`), 6 écartés. 2 nouveaux tests de régression ajoutés. Suite finale : 914/914 tests web. Statut passé à `done`.
