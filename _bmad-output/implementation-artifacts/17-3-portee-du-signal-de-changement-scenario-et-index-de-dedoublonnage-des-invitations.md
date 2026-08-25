---
baseline_commit: 4adaf2d79dc309163f43eee21bff2863db990de6
---

# Story 17.3: Portée du signal de changement scénario et index de dédoublonnage des invitations

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du projet,
I want que le signal de rechargement frontend soit scopé par Partie, et que la recherche de dédoublonnage des invitations soit indexée,
so that l'application évite du travail réseau/DB superflu à mesure que le nombre de Parties et d'invitations augmente.

## Acceptance Criteria

1. **Given** une mutation sur une Partie A **When** `ScenariosService._changed` (frontend) est déclenché **Then** seuls les composants `ScenarioTimeline` ouverts sur la Partie A se rechargent — pas ceux ouverts sur une autre Partie.
2. **Given** la requête de dédoublonnage des invitations par e-mail (`InviteLinksService.findOrCreateForEmail`) **When** elle s'exécute **Then** elle s'appuie sur l'index DB `(partieId, targetEmail)` plutôt qu'un scan complet de la table.

## Tasks / Subtasks

- [x] **Task 1 — Scoper `ScenariosService._changed` par Partie (AC1, frontend)**
  - Fichier : `apps/web/src/app/core/scenarios/scenarios.service.ts` (258 lignes actuelles, cité intégralement en Dev Notes) — signal global actuel (lignes 21-26) :
    ```typescript
    private readonly _changed = signal(0);
    readonly changed = this._changed.asReadonly();
    ```
    Suivi de **16 sites d'appel identiques** `this._changed.update((v) => v + 1);`, un par méthode de mutation (`create`, `update`, `open`, `markCourant`, `close`, `participate`, `addSeance`, `createSeancePoll`, `deleteSeance`, `resetSeanceDate`, `setSeanceCapacity`, `inscrire`, `desinscrire`, `setCompteRendu`, `setResumeFin`).
  - **Point clé vérifié empiriquement (pas une supposition)** : **chacune** de ces 16 méthodes retourne `Promise<ScenarioDto>` et assigne déjà `const result = await firstValueFrom(...)` juste avant l'appel à `_changed.update(...)`. `ScenarioDto` (`packages/shared/src/index.ts:104-121`) porte **déjà** un champ `partieId: string` au niveau racine — **y compris pour les mutations qui n'agissent qu'sur une Seance** (`addSeance`, `createSeancePoll`, `deleteSeance`, `resetSeanceDate`, `setSeanceCapacity`, `inscrire`, `desinscrire`, `setCompteRendu` retournent le `ScenarioDto` **enrichi** du scénario parent, pas juste la Seance). **Conséquence : aucune signature de méthode publique n'a besoin de changer** — `result.partieId` est disponible partout où `_changed` est actuellement appelé. Zéro impact sur les appelants (composants) de ces 16 méthodes.
  - Remplacer le signal et son unique méthode d'émission :
    ```typescript
    private readonly _changed = signal<{ partieId: string } | null>(null);
    readonly changed = this._changed.asReadonly();

    private notifyChanged(partieId: string): void {
      this._changed.set({ partieId });
    }
    ```
    **Pourquoi `.set({ partieId })` (nouvel objet à chaque appel) et pas `.update()`** : Angular compare par défaut avec `Object.is` — un nouvel objet littéral a toujours une référence différente, donc le signal notifie systématiquement ses effets à chaque appel, même si `partieId` est identique à l'appel précédent (deux mutations successives sur la même Partie doivent chacune déclencher un rechargement). Pas besoin d'un compteur de version pour ça — c'est déjà garanti par la nouvelle référence d'objet.
  - Remplacer les **16 occurrences exactes** de `this._changed.update((v) => v + 1);` par `this.notifyChanged(result.partieId);` — **texte de remplacement identique dans les 16 méthodes**, aucune logique conditionnelle à ajouter.
  - **Aucun autre changement dans ce fichier** — les méthodes qui ne mutent rien (`listDrafts`, `listAll`, `uploadDocument`, `listDocuments`, `listLibraryDocuments`, `downloadDocument`) n'appellent jamais `_changed` et restent inchangées.

- [x] **Task 2 — Filtrer le rechargement de `ScenarioTimeline` par Partie (AC1, frontend)**
  - Fichier : `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (constructeur, lignes 111-124 actuelles, citées intégralement en Dev Notes) — **c'est l'UNIQUE consommateur en production de `ScenariosService.changed`** dans tout `apps/web` (vérifié par grep exhaustif : `grep -rn "\.changed()" apps/web/src` ne retourne que ce fichier + son fichier de test). Aucun autre composant à toucher.
  - Effect actuel (lignes 120-124) :
    ```typescript
    effect(() => {
      const partieId = this.partieId();
      this.scenariosService.changed();
      untracked(() => this.loadScenarios(partieId));
    });
    ```
    Se recharge **inconditionnellement** à chaque changement de `partieId` **OU** à chaque déclenchement de `changed()`, quelle que soit la Partie concernée par la mutation à l'origine — exactement le défaut de AC1.
  - **⚠️ Piège à éviter : ne pas casser le rechargement initial au montage.** `changed()` vaut `null` avant toute mutation (Task 1) — une comparaison naïve `change?.partieId === partieId` échouerait systématiquement à l'exécution initiale de l'effet (montage du composant) puisque `change` est `null`, ce qui **empêcherait le premier chargement**. Il faut aussi préserver le rechargement quand `partieId` lui-même change (réutilisation potentielle du même composant pour une autre Partie, ex. navigation sans démontage) — comportement déjà implicite dans le code actuel (puisque `partieId` est lu dans l'effet).
  - Remplacement (variable locale fermée par la closure du constructeur, PAS un signal — inutile de la rendre réactive, elle sert uniquement à mémoriser la dernière valeur vue de `partieId` entre deux exécutions de l'effet) :
    ```typescript
    let lastPartieId: string | undefined;
    effect(() => {
      const partieId = this.partieId();
      const change = this.scenariosService.changed();
      const partieIdChanged = partieId !== lastPartieId;
      lastPartieId = partieId;
      if (!partieIdChanged && change !== null && change.partieId !== partieId) {
        return; // mutation notifiée pour une autre Partie — ignorée, pas de rechargement
      }
      untracked(() => this.loadScenarios(partieId));
    });
    ```
    Vérifier le comportement de chaque branche avant de considérer la tâche terminée :
    - Montage initial : `lastPartieId` est `undefined`, `partieId` est une chaîne → `partieIdChanged = true` → charge, quel que soit `change`. ✓ (ne régresse pas le chargement initial)
    - `changed()` déclenché pour la Partie actuellement affichée (`change.partieId === partieId`) → charge. ✓ (AC1, cas positif)
    - `changed()` déclenché pour une **autre** Partie (`change.partieId !== partieId`) → `partieIdChanged` est `false` → **ignoré, aucun rechargement**. ✓ (AC1, cas négatif — c'est le comportement demandé par la story)
    - `partieId` change (composant réutilisé pour une autre Partie) → `partieIdChanged = true` → charge pour la nouvelle Partie, indépendamment de `change`. ✓ (préserve le comportement déjà présent avant cette story)
  - **Ne pas toucher** au second `effect()` du même constructeur (lignes 128+, gestion des fondus visuels `fadeStart`/`fadeEnd`) — sans rapport avec cette story.

- [x] **Task 3 — Tests frontend (AC1)**

  **Fichier : `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts`** (cité intégralement en Dev Notes pour les parties pertinentes — fichier volumineux, ne pas le relire en entier).
  - Mock actuel du service (`createComponent()`, lignes 52-55 actuelles) : `changed: signal(0)` — **à changer en** `changed: signal<{ partieId: string } | null>(null)`. Le composant de test est toujours monté avec `partieId = 'p1'` (`fixture.componentRef.setInput('partieId', 'p1')`, ligne 71 actuelle) — **ne pas changer cette valeur**, les nouveaux tests s'appuient dessus.
  - **Test existant à mettre à jour** (ligne 383-395 actuelle, `'une mutation notifiée par ScenariosService.changed() recharge bien les données (listAll rappelé)'`) : `scenariosSvc.changed.update((v: number) => v + 1);` devient `scenariosSvc.changed.set({ partieId: 'p1' });` (Partie identique à celle du composant — doit toujours déclencher un rechargement). Garder la boucle de ticks déjà en place (`for (let i = 0; i < 10; i++) { await Promise.resolve(); fixture.detectChanges(); }` — cf. mémoire projet `jdr-zoneless-test-timing`, pas de zone.js, ne pas inventer un autre mécanisme d'attente).
  - **Nouveau test (AC1, cas négatif)** — même structure que le test ci-dessus, mais avec un `partieId` différent :
    ```typescript
    it('une mutation notifiée pour une AUTRE Partie ne recharge pas (Story 17.3 AC1)', async () => {
      const { scenariosSvc, fixture } = await createComponent([PASSE]);
      scenariosSvc.listAll.mockClear();

      scenariosSvc.changed.set({ partieId: 'p2-autre-partie' });
      fixture.detectChanges();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }

      expect(scenariosSvc.listAll).not.toHaveBeenCalled();
    });
    ```
  - **Ne pas ajouter de test pour le cas "`partieId` du composant change"** — le composant utilise `input.required<string>()` fixé une seule fois par `setInput()` dans `createComponent()` ; simuler un changement de cet input en cours de test demanderait de restructurer le harnais de test existant, hors scope de cette story (le comportement est déjà correct par construction du code, cf. Task 2).

- [x] **Task 4 — Index Prisma `(partieId, targetEmail)` sur `InviteLink` (AC2, backend)**
  - Fichier : `apps/api/prisma/schema.prisma` — modèle `InviteLink` (lignes 108-121 actuelles, cité intégralement en Dev Notes) **n'a actuellement AUCUN `@@index`** (seulement `@id` sur `id` et `@unique` sur `token`) — vérifié directement dans le schéma.
  - Ajouter en fin de modèle :
    ```prisma
    @@index([partieId, targetEmail])
    ```
  - **Colonnes dans cet ordre précis** (`partieId` puis `targetEmail`) — reflète exactement l'ordre des colonnes dans le `where` de `InviteLinksService.findOrCreateForEmail()` (`apps/api/src/invitations/invite-links.service.ts:146-154`, cité intégralement en Dev Notes) : `where: { partieId, targetEmail: email, revoked: false, expiresAt: { gt: new Date() } }` — un index composite `(partieId, targetEmail)` couvre efficacement un filtre qui commence par `partieId` puis affine par `targetEmail`, cohérent avec le pattern déjà en place pour `XpDistribution` (`@@index([partieId, createdAt])`, Story 17.1) et `Scenario` (`@@index([partieId, status])`, préexistant).
  - **Aucun changement de code applicatif** — `findOrCreateForEmail()` reste identique, l'index accélère la requête existante sans changer son comportement. AC2 est purement déclaratif (schéma), pas de test à ajouter — même traitement que les index déjà en place dans ce projet (aucun test ne vérifie leur utilisation par le planner Postgres, cohérent avec la convention déjà établie en Story 17.1).
  - **Migration Prisma requise** (contrairement aux Stories 17.1/17.2 qui n'en nécessitaient aucune) — méthode déjà établie dans ce projet pour ce conteneur (mémoire projet, `prisma migrate dev` refuse de tourner non-interactivement ici) :
    ```bash
    docker compose exec api pnpm prisma migrate diff \
      --from-config-datasource prisma/schema.prisma \
      --to-schema-datamodel prisma/schema.prisma \
      --script > /tmp/migration.sql
    ```
    Puis créer manuellement le dossier `apps/api/prisma/migrations/<timestamp>_invite_link_partie_email_index/migration.sql` avec le SQL généré (`CREATE INDEX ...`), et appliquer via `docker compose exec api pnpm prisma migrate deploy` (non-interactif) suivi de `docker compose exec api pnpm prisma generate`. **Vérifier le SQL généré avant de l'appliquer** — s'assurer qu'il ne contient QUE la création de l'index `(partieId, targetEmail)`, rien d'autre (si `migrate diff` détecte un drift non lié, ne prendre que la partie pertinente).
    - `<timestamp>` au format `YYYYMMDDHHmmss`, cohérent avec les migrations existantes (`apps/api/prisma/migrations/`, ex. `20260719113057_user_session_sid_unique`).

- [x] **Task 5 — Validation finale**
  - `docker compose exec web pnpm test` (Vitest, `ng test --watch=false`) — 0 régression sur la suite `apps/web`.
  - `docker compose exec api pnpm test` — 0 régression sur la suite `apps/api` (833 tests avant cette story).
  - `docker compose exec api pnpm typecheck` — propre.
  - **`apps/web/package.json` n'a pas de script `typecheck` dédié** (vérifié : scripts disponibles sont `ng`, `start`, `build`, `watch`, `test`, `test:watch`, `lint`) — utiliser `docker compose exec web pnpm build` comme vérification de type la plus proche (`ng build` échoue sur toute erreur TypeScript), cohérent avec l'absence de commande dédiée dans ce projet.
  - Vérifier que la migration Prisma a bien été appliquée (`docker compose exec api pnpm prisma migrate status` — aucune migration en attente) et que le schéma généré (`node_modules/.prisma`) reflète le nouvel index.
  - `git status`/diff en fin de story pour confirmer les fichiers touchés : `scenarios.service.ts`, `scenario-timeline.ts`, `scenario-timeline.spec.ts` (apps/web) ; `schema.prisma` + nouveau dossier de migration (apps/api). **Aucun autre fichier** ne devrait apparaître.

## Dev Notes

### Architecture — seed déclaratif, aucune AD numérotée dédiée (`ARCHITECTURE-SPINE.md`, Palier 6)

> `| FR-18 à FR-24 (robustesse/perf) | ScenariosModule, InvitationsModule | AD-7 (FR-22), Consistency Conventions (pagination, FR-18) ; FR-19/20/23/24 = seed déclaratif ; FR-21 = laissé à la story (Deferred) |`

FR-19 (portée du signal) et FR-24 (index invitations) sont explicitement qualifiés de **"seed déclaratif"** — contrairement à FR-21 (Story 17.2), aucune décision de conception n'est laissée ouverte ici : le comportement attendu est direct, seule l'implémentation technique reste à trouver (d'où la Task 1/2 détaillée pour le signal, non triviale malgré la qualification "déclarative" du FR).
**Additional Requirements** (epics-palier6.md, ligne 79) : `Nouvel index Prisma @@index([partieId, targetEmail]) sur InviteLink — cf. FR-24.` — confirme exactement la Task 4.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** (258 lignes actuelles) — fichier cité en quasi-intégralité ci-dessus (Task 1). Toutes les 16 méthodes de mutation partagent le même pattern `const result = await firstValueFrom(this.http.<verbe><ScenarioDto>(...)); this._changed.update((v) => v + 1); return result;` — seule la ligne `_changed` change dans chacune, aucune autre logique à toucher.
- **`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** — constructeur cité intégralement (Task 2). Le composant importe déjà `effect`, `untracked`, `input` depuis `@angular/core` (lignes 1-13 actuelles) — aucun nouvel import nécessaire pour la Task 2.
- **`packages/shared/src/index.ts:104-121`** — `ScenarioDto` cité intégralement :
  ```typescript
  export interface ScenarioDto {
    id: string;
    partieId: string;
    title: string;
    description: string | null;
    status: ScenarioStatus;
    dureeHeures: number | null;
    dureeSeances: number | null;
    resumeFin: string | null;
    createdAt: string;
    closedAt: string | null;
    seances: SeanceDto[];
    participants?: { userId: string; pseudo: string }[];
    retrospectiveNotes?: CharacterNoteDto[];
  }
  ```
  Confirme `partieId` toujours présent — aucune modification de ce type nécessaire pour cette story.
- **`apps/api/src/invitations/invite-links.service.ts:141-168`** — `findOrCreateForEmail()` cité intégralement :
  ```typescript
  async findOrCreateForEmail(partieId: string, mjId: string, email: string): Promise<InviteLink> {
    const existing = await this.prisma.inviteLink.findFirst({
      where: { partieId, targetEmail: email, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    const token = randomBytes(32).toString('base64url');
    return this.prisma.inviteLink.create({
      data: { token, partieId, createdById: mjId, maxUses: 1, targetEmail: email, expiresAt: new Date(Date.now() + DEFAULT_TTL_MS) },
    });
  }
  ```
  **Non modifiée par cette story** — l'index accélère cette requête existante sans changer son code.
- **`apps/api/prisma/schema.prisma:107-121`** — modèle `InviteLink` cité intégralement (Task 4).

### Frontend — vérifié, un seul consommateur

`grep -rn "\.changed()" apps/web/src` ne retourne que `scenario-timeline.ts` (production) et `scenario-timeline.spec.ts` (test) — confirmé par recherche exhaustive, pas une supposition. Aucun autre composant (`ScenarioDrafts`, `ScenarioOneShotTab`, `CalendarView`, etc.) ne lit `ScenariosService.changed` à ce jour — cohérent avec le fait que l'Epic 19 (câblage temps réel de ces composants, palier futur non implémenté) n'existe pas encore dans le code.

### Testing Standards

- `apps/web` : Vitest (`ng test --watch=false`), zoneless — mémoire projet `jdr-zoneless-test-timing` : pas de zone.js, `whenStable()` seul ne suffit pas pour un chargement asynchrone déclenché par un effect ; utiliser la boucle de ticks déjà établie dans `scenario-timeline.spec.ts` (`for (let i = 0; i < 10; i++) { await Promise.resolve(); fixture.detectChanges(); }`), ne pas en inventer une autre.
- `apps/api` : Jest, conventions déjà en place. Aucun test à ajouter pour l'index (Task 4) — purement déclaratif, cohérent avec la convention déjà établie en Story 17.1 pour `@@index([partieId, createdAt])`/`@@index([partieId, status])`.
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après tout changement de signature côté `apps/api` (aucun changement de signature prévu dans cette story côté backend, seulement le schéma).

### Previous Story Intelligence (Story 17.2)

- Convention établie : vérifier empiriquement toute hypothèse plutôt que de la supposer — reproduit ici pour la présence de `partieId` sur `ScenarioDto` (vérifié en lisant `packages/shared/src/index.ts`, pas en supposant) et pour l'unicité du consommateur `changed()` (vérifié par grep exhaustif).
- Story 17.2 a laissé 1 item mineur dans `deferred-work.md` (TOCTOU sur les gardes de statut) — **sans rapport avec cette story**, ne pas y toucher.
- Cette story est la **dernière de l'Epic 17** — une fois terminée, `epic-17` peut passer à `done` dans `sprint-status.yaml` (aucune autre story `17-*` ne reste en `backlog`).

### Project Structure Notes

- Fichiers modifiés : `apps/web/src/app/core/scenarios/scenarios.service.ts`, `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`, `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts`, `apps/api/prisma/schema.prisma`.
- Fichier nouveau : `apps/api/prisma/migrations/<timestamp>_invite_link_partie_email_index/migration.sql`.
- **Première story du palier touchant `apps/web`** (17.1 et 17.2 étaient purement backend) — première migration Prisma du palier 17 également.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 400-414 — Epic 17 / Story 17.3 complète, FR19/FR24 ; ligne 79 — Additional Requirements, index InviteLink explicite)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (ligne 235 — Capability Map, FR-19/24 = seed déclaratif)
- `_bmad-output/implementation-artifacts/17-1-pagination-des-listes-non-bornees-et-ordre-deterministe-des-inscriptions.md` (précédent d'index composite `(partieId, createdAt)`, précédent de migration via `prisma migrate diff` + dossier manuel)
- Vérifications empiriques effectuées pendant la préparation de cette story (lecture directe du code, grep exhaustif, pas de supposition) : présence de `partieId` sur `ScenarioDto` confirmée dans `packages/shared/src/index.ts` ; unicité du consommateur `ScenariosService.changed()` confirmée par `grep -rn "\.changed()" apps/web/src` ; absence de tout `@@index` sur `InviteLink` confirmée dans `schema.prisma` ; ordre des colonnes du `where` de `findOrCreateForEmail()` confirmé pour aligner l'ordre de l'index composite.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story / bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm build` échoue sur un budget de taille de bundle dépassé (1.19 Mo vs budget 1.00 Mo) — vérifié pré-existant, sans rapport avec cette story (aucune erreur `error TS` dans la sortie, seulement l'échec de budget `angular.json` ; le diff de cette story est minime, 2 fichiers `apps/web` modifiés sans nouvelle dépendance). Non traité (hors scope).
- `prisma migrate diff --to-schema-datamodel` a été retiré dans cette version de Prisma 7 (CLI) — remplacé par `--to-schema`, découverte empirique via le message d'erreur de la commande elle-même (le nom de flag documenté dans la story précédente n'est plus valide). Corrigé et utilisé : `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.

### Completion Notes List

- `ScenariosService._changed` scopé par Partie : signal `signal<{ partieId: string } | null>(null)`, méthode privée `notifyChanged(partieId)` appelée dans les 15 méthodes de mutation avec `result.partieId` (déjà disponible dans la réponse HTTP) — aucun changement de signature publique, zéro impact sur les appelants.
- `ScenarioTimeline` : effect modifié pour ignorer les mutations notifiées pour une autre Partie, tout en préservant le rechargement initial au montage et lors d'un changement de `partieId` lui-même (via une variable locale `lastPartieId` fermée par la closure du constructeur).
- Index Prisma `@@index([partieId, targetEmail])` ajouté sur `InviteLink`, migration `20260719195519_invite_link_partie_email_index` générée (SQL vérifié minimal : une seule `CREATE INDEX`), appliquée via `migrate deploy`, confirmée en base (`\d "InviteLink"`) et via `prisma migrate status` (à jour).
- Tests : 1 test existant mis à jour (`scenario-timeline.spec.ts`, mutation même Partie → recharge), 1 nouveau test ajouté (mutation autre Partie → ne recharge pas, AC1). Aucun test ajouté pour l'index (AC2, purement déclaratif, cohérent avec la convention déjà établie en Story 17.1).
- Suites complètes : `apps/web` 834/834 (833 → 834, +1 test), `apps/api` 833/833 (inchangé, aucune régression). Typecheck `apps/api` propre.
- Seuls les fichiers prévus par la story ont été modifiés — confirmé par `git status` : `scenarios.service.ts`, `scenario-timeline.ts`, `scenario-timeline.spec.ts` (apps/web), `schema.prisma` + nouvelle migration (apps/api). Aucune autre modification.

### File List

- `apps/web/src/app/core/scenarios/scenarios.service.ts`
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260719195519_invite_link_partie_email_index/migration.sql` (nouveau)

### Review Findings

- [x] [Review][Defer] Le signal `_changed` reste global : chaque `ScenarioTimeline` monté réévalue son `effect()` à chaque mutation, quelle que soit la Partie concernée — seul le rechargement HTTP (coûteux) est désormais évité, pas la réexécution de l'effet lui-même (comparaison bon marché) [apps/web/src/app/core/scenarios/scenarios.service.ts, apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts] — deferred, un signal réellement scopé par Partie (slice/Map) serait une refonte plus large, cohérente avec le travail prévu à l'Epic 18/19 (câblage temps réel scopé par Partie), hors périmètre de cette story de durcissement ("seed déclaratif").
- [x] [Review][Defer] Deux `notifyChanged()` pour deux Parties différentes survenant dans le même flush du scheduler Angular pourraient se télescoper (seule la dernière valeur du signal survit) — la notification de la première Partie serait alors silencieusement perdue [apps/web/src/app/core/scenarios/scenarios.service.ts, apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts] — deferred, non atteignable dans la structure actuelle de l'UI (aucune page ne monte simultanément deux `ScenarioTimeline` de Parties différentes), fragilité architecturale théorique à garder en tête pour l'Epic 18/19.

## Change Log

| Date | Change |
|------|--------|
| 2026-07-19 | Implémentation complète (Tasks 1-5) : signal `ScenariosService._changed` scopé par Partie, `ScenarioTimeline` ne recharge plus que pour la Partie concernée, index Prisma `(partieId, targetEmail)` sur `InviteLink` (migration appliquée). 1 test mis à jour + 1 nouveau. `apps/web` 834/834, `apps/api` 833/833, typecheck propre. Statut → review. |
| 2026-07-19 | Revue de code (3 agents adversariaux) : 0 patch, 2 items déférés (signal encore global au niveau de l'effet, fragilité théorique de coalescing) — voir `deferred-work.md`. Aucune violation trouvée par l'Acceptance Auditor. Statut → done. Epic 17 complet. |
