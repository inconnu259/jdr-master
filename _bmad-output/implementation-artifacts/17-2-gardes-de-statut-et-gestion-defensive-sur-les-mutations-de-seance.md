---
baseline_commit: 7d0ef9d8f613bf1922ee33df247dcf08f05cfda8
---

# Story 17.2: Gardes de statut et gestion défensive sur les mutations de séance

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du projet,
I want que les méthodes de mutation de séance aient un comportement explicite vis-à-vis du statut du scénario parent, et ne laissent jamais fuiter une erreur non contrôlée sur une référence orpheline,
so that le comportement du système reste prévisible même dans des cas limites.

## Acceptance Criteria

1. **Given** `setSeanceCapacity`, `inscrire`, `desinscrire`, `addSeance` **When** ces méthodes sont appelées sur une séance dont le scénario parent est `BROUILLON`/`PASSE` **Then** le comportement (rejet ou autorisation) est explicitement décidé et testé pour chaque méthode, plutôt qu'un défaut non intentionnel.
   - **⚠️ Correction par rapport au libellé de l'epic** : l'epic source cite aussi `validerDate` parmi les méthodes concernées. **Ce nom de méthode n'existe plus dans le code** — vérifié empiriquement (voir Dev Notes, "`validerDate()` — méthode disparue"). Le scope réel de cet AC est donc les **4 méthodes existantes** listées ci-dessus.
2. **Given** une méthode de `ScenariosService` qui résout une relation via `findUniqueOrThrow` **When** la clé étrangère se révèle orpheline (cas normalement impossible en usage courant) **Then** une erreur explicite est levée plutôt qu'un `500` non contrôlé.

## Tasks / Subtasks

- [x] **Task 1 — Garde de statut sur `addSeance()` (AC1)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`, méthode `addSeance()` (lignes 422-435 actuelles, citée intégralement en Dev Notes) — **aucune vérification de statut actuellement**.
  - **Décision : rejeter uniquement `PASSE`, autoriser `BROUILLON`/`A_VENIR`/`COURANT`.**
    - **Pourquoi** : un scénario `PASSE` (clôturé) est déjà un invariant protégé ailleurs dans ce même fichier pour la structure des séances — `deleteSeance()` (ligne 495-499 actuelles) rejette déjà la suppression d'une séance sur un scénario `PASSE` avec le commentaire explicite : *"Un scénario PASSE (clôturé) est figé — sa découpe en séances ne doit plus changer rétroactivement"*. `addSeance()` modifie la même "découpe en séances" que `deleteSeance()` protège déjà — l'symétrie impose la même règle, pas une nouvelle décision.
    - **Pourquoi `BROUILLON` reste autorisé** : le MJ doit pouvoir préparer des séances pendant qu'il rédige encore le scénario (avant publication) — bloquer `addSeance()` sur `BROUILLON` empêcherait ce travail de préparation légitime, sans bénéfice.
  - Insertion juste après `if (!scenario) throw new NotFoundException(...)` (ligne 426 actuelle), avant `await this.parties.getOwned(...)` (ligne 427) — **avant** la vérification de propriété, comme le fait déjà `deleteSeance()` pour son propre garde de statut (revérifier l'ordre exact des vérifications dans `deleteSeance()` avant d'écrire — la garde de statut doit suivre le pattern déjà établi, pas l'inventer) :
    ```typescript
    if (scenario.status === 'PASSE') {
      throw new BadRequestException(
        "Impossible d'ajouter une séance à un scénario clôturé",
      );
    }
    ```
    Réutiliser le **même style de message** que `deleteSeance()`/`resetSeanceDate()` ("Impossible de... un scénario clôturé") — cohérence déjà établie entre ces 2 méthodes.

- [x] **Task 2 — Garde de statut sur `setSeanceCapacity()` (AC1)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`, méthode `setSeanceCapacity()` (lignes 629-664 actuelles, citée intégralement en Dev Notes) — **aucune vérification de statut actuellement** (seul `partie.kind !== 'CAMPAGNE_EPISODIQUE'` est vérifié).
  - **Décision : rejeter uniquement `PASSE`, autoriser `BROUILLON`/`A_VENIR`/`COURANT`.** Même raisonnement que Task 1 (préparation légitime en `BROUILLON`, invariant "figé" déjà établi pour `PASSE`) — **`resetSeanceDate()` (lignes 593-623 actuelles) applique déjà exactement cette règle** sur la même entité `Seance`, avec le message : *"Impossible de réinitialiser la date d'une séance d'un scénario clôturé"*. `setSeanceCapacity()` est structurellement identique (même méthode `getOwned`, même résolution `seance → scenario` via FK) — reproduire le même pattern, pas en inventer un nouveau.
  - Insertion juste après la résolution de `scenario` (avant la vérification `partie.kind !== 'CAMPAGNE_EPISODIQUE'`, ligne 644 actuelle) :
    ```typescript
    if (scenario.status === 'PASSE') {
      throw new BadRequestException(
        "Impossible de définir la capacité d'une séance d'un scénario clôturé",
      );
    }
    ```

- [x] **Task 3 — Garde de statut sur `inscrire()` (AC1)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`, méthode `inscrire()` (lignes 668-732 actuelles, citée intégralement en Dev Notes) — **aucune vérification de statut actuellement**.
  - **⚠️ [ASSUMPTION] Décision : rejeter `BROUILLON` ET `PASSE`, autoriser uniquement `A_VENIR`/`COURANT`.**
    - **Ce n'est PAS une application de AD-6** (anti-spoil) — AD-6 dit explicitement (`ARCHITECTURE-SPINE.md`, commentaire `findAllForPartie()` ligne 219-221 de `scenarios.service.ts`) : *"aucun filtrage par statut — l'anti-spoil est un rendu frontend, jamais serveur"*. Cette règle concerne la **lecture** (un scénario `BROUILLON` reste listé/lisible par l'API, le frontend décide de l'afficher ou non). Le rejet de `inscrire()` sur `BROUILLON` est un motif **différent et indépendant** : une inscription est un **engagement réel** (crée une ligne `Inscription`, compte contre `inscriptionMax`) sur des données de séance encore mouvantes en phase de rédaction (le MJ peut encore supprimer/recréer des séances, changer la capacité — cf. Task 1/2). Verrouiller un joueur sur un état non finalisé est une source de confusion opérationnelle, pas une fuite d'information.
    - **Pourquoi aussi `PASSE`** : s'inscrire à une séance d'un scénario déjà clôturé n'a pas de sens (l'événement a déjà eu lieu) — cohérent avec l'invariant "figé" déjà établi (Task 1/2).
    - Si ce raisonnement ne convient pas (ex. préférence pour autoriser l'inscription dès `BROUILLON`), ajuster la condition ci-dessous en conséquence — mais la décision doit rester **explicite et testée**, pas implicite.
  - Insertion juste après la résolution de `scenario` (avant `if (partie.kind !== 'CAMPAGNE_EPISODIQUE')`, ligne 679 actuelle) :
    ```typescript
    if (scenario.status === 'BROUILLON' || scenario.status === 'PASSE') {
      throw new BadRequestException(
        "Impossible de s'inscrire à une séance dont le scénario n'est pas actif",
      );
    }
    ```
  - **Ne pas toucher** à la garde existante "date déjà validée — inscriptions figées" (lignes 692-696, 714-718 actuelles, sous le verrou `FOR UPDATE`) — logique indépendante, orthogonale au statut du scénario.

- [x] **Task 4 — Décision explicite documentée pour `desinscrire()` : aucune nouvelle garde (AC1)**
  - Fichier : `apps/api/src/scenarios/scenarios.service.ts`, méthode `desinscrire()` (lignes 736-762 actuelles, citée intégralement en Dev Notes).
  - **Décision : ne PAS ajouter de garde de statut.** Cette méthode a déjà un commentaire explicite en tête (lignes 734-735 actuelles) : *"deleteMany (pas delete) : idempotent si l'utilisateur n'était pas inscrit — pas d'effet de bord dangereux possible, aucune garde de kind/capacité nécessaire"*. Un retrait d'inscription reste sûr et réversible quel que soit le statut du scénario (y compris `PASSE` : retirer une inscription à une séance déjà passée n'a aucun effet secondaire dangereux, contrairement à en créer une). Cette story **confirme et documente** cette décision déjà implicite dans le code, plutôt que de la changer.
  - Modifier le commentaire existant (lignes 734-735) pour la rendre **explicite au sens de l'AC1** (actuellement, le commentaire justifie l'absence de garde de *kind*/*capacité*, pas de *statut* — ajouter la mention du statut) :
    ```typescript
    // deleteMany (pas delete) : idempotent si l'utilisateur n'était pas inscrit — pas d'effet de
    // bord dangereux possible, aucune garde de kind/capacité nécessaire (cf. Dev Notes Story 8.3).
    // Story 17.2 (AC1) : décision explicite de ne PAS ajouter de garde de statut scénario non plus —
    // un retrait d'inscription reste sûr et réversible quel que soit le statut (y compris PASSE).
    ```
  - Aucun changement de comportement — seul un test dédié (Task 6) rend la décision vérifiable.

- [x] **Task 5 — Helper `resolveScenarioOrThrow()` pour les références orphelines (AC2)**
  - **Pattern vulnérable identifié par grep exhaustif** (7 occurrences exactes de `this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } })`, sans gestion d'erreur dédiée) dans ces méthodes : `deleteSeance()` (ligne ~494), `createSeancePoll()` (ligne ~553), `resetSeanceDate()` (ligne ~598), `setSeanceCapacity()` (ligne ~639), `inscrire()` (ligne ~674), `desinscrire()` (ligne ~742), `setCompteRendu()` (ligne ~776). **Revérifier les numéros de ligne exacts avant d'éditer** — ils auront décalé après les Tasks 1-4.
  - **Ce pattern est structurellement différent** des nombreux autres appels `findUniqueOrThrow({ where: { id: scenarioId } })` du même fichier qui **re-lisent la MÊME entité juste après l'avoir écrite dans la même méthode** (ex. `markCourant()` ligne 356, `close()` ligne 387, `participate()` ligne 414 — ceux-ci restent inchangés, hors scope de cette story). Le pattern ciblé ici résout une **relation** (`Seance.scenarioId` FK → `Scenario`), exactement le cas décrit par AC2.
  - **Vérifié empiriquement dans ce conteneur** (script `node` inline, `PrismaClient` avec l'adapter `@prisma/adapter-pg` déjà configuré comme `PrismaService`) : un `findUniqueOrThrow()` sur un id inexistant lève une `Prisma.PrismaClientKnownRequestError` avec `code === 'P2025'` — confirmé par instanciation réelle contre la base de ce projet, pas une supposition issue de la documentation Prisma générique.
  - Nouvelle fonction module-privée (même convention que `loadSeancesBatch()`, non exportée, prend `prisma` en premier paramètre), à ajouter **avant** `loadSeancesBatch()` (ligne ~962 actuelle) :
    ```typescript
    async function resolveScenarioOrThrow(
      prisma: PrismaService,
      scenarioId: string,
    ) {
      try {
        return await prisma.scenario.findUniqueOrThrow({
          where: { id: scenarioId },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2025'
        ) {
          throw new NotFoundException(
            'Scénario introuvable (référence orpheline)',
          );
        }
        throw e;
      }
    }
    ```
  - **Import à corriger** : `apps/api/src/scenarios/scenarios.service.ts` importe actuellement `Prisma` en **`import type`** (ajouté Story 17.1, ligne ~8 actuelle : `import type { Prisma } from '@prisma/client';`) — un `import type` est effacé au runtime, `instanceof Prisma.PrismaClientKnownRequestError` a besoin de la **valeur** réelle. Remplacer par un import de valeur : `import { Prisma } from '@prisma/client';` (`Prisma` reste utilisable comme type ET valeur avec cet import — cf. `apps/api/src/characters/character.service.ts` ligne 12, même pattern déjà établi : `import { Prisma } from '@prisma/client';`, utilisé pour `Prisma.JsonNull`).
  - Remplacer les 7 occurrences de :
    ```typescript
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: seance.scenarioId },
    });
    ```
    par :
    ```typescript
    const scenario = await resolveScenarioOrThrow(this.prisma, seance.scenarioId);
    ```
  - **Ne toucher à rien d'autre dans ces 7 méthodes** — aucun changement de logique métier, uniquement le remplacement de l'appel Prisma direct par l'appel au helper.

- [x] **Task 6 — Tests (AC1, AC2)**

  **Fichier unique concerné : `apps/api/src/scenarios/scenarios.service.spec.ts`** (fichier volumineux — ne PAS le relire intégralement, seules les sections déjà citées dans les Dev Notes sont pertinentes).

  **AC1 — `describe('addSeance()', ...)`** (ligne ~1764 actuelle) : nouveau test, calqué sur le pattern déjà utilisé pour `deleteSeance()`/`resetSeanceDate()` (`mockScenario({ status: 'PASSE' })`, cf. Dev Notes) :
  - `scénario PASSE → rejet 400, aucune création de séance` : `prisma.scenario.findUnique.mockResolvedValue({ id: VALID_SCENARIO_ID, partieId: 'p1', status: 'PASSE' })`, puis `expect(service.addSeance(...)).rejects.toThrow(BadRequestException)`, `expect(prisma.seance.create).not.toHaveBeenCalled()`.

  **AC1 — `describe('setSeanceCapacity()', ...)`** (ligne ~2522 actuelle) : nouveau test, réutiliser `mockScenario({ status: 'PASSE' })` déjà défini dans ce describe (ligne 2525-2539 actuelle) :
  - `scénario PASSE → rejet 400, aucune écriture` : `prisma.scenario.findUniqueOrThrow.mockResolvedValue(mockScenario({ status: 'PASSE' }))`, `expect(...).rejects.toThrow(BadRequestException)`, `expect(prisma.seance.update).not.toHaveBeenCalled()`.

  **AC1 — `describe('inscrire()', ...)`** (ligne ~2649 actuelle) : 2 nouveaux tests, réutiliser `mockScenario()` déjà défini dans ce describe (ligne 2652-2666 actuelle) :
  - `scénario BROUILLON → rejet 400, aucune inscription créée` : `mockScenario({ status: 'BROUILLON' })`, `expect(...).rejects.toThrow(BadRequestException)`, `expect(prisma.tx.inscription.create).not.toHaveBeenCalled()` (vérifier que la transaction `$transaction` n'est même pas entrée — le rejet doit intervenir AVANT le bloc `this.prisma.$transaction(...)`).
  - `scénario PASSE → rejet 400, aucune inscription créée` : même schéma avec `status: 'PASSE'`.

  **AC1 — `describe('desinscrire()', ...)`** (ligne ~2926 actuelle) : nouveau test confirmant l'absence de garde (décision explicite, Task 4) :
  - `scénario PASSE → retrait toujours autorisé (décision explicite, Story 17.2 AC1)` : `mockScenario({ status: 'PASSE' })`, `await service.desinscrire(...)` ne lève pas, `expect(prisma.inscription.deleteMany).toHaveBeenCalledWith(...)` (même assertion que le test de succès existant ligne 2945-2963).

  **AC2 — `resolveScenarioOrThrow()`** : pas de `describe` dédié séparé (fonction privée non exportée, comme `loadSeancesBatch()`) — prouver le comportement via **2 méthodes représentatives** (pas les 7, ça dupliquerait un test identique 7 fois pour un seul mécanisme partagé) :
  - Dans `describe('deleteSeance()', ...)` (ligne ~2004 actuelle) : nouveau test `référence scénario orpheline → 404 explicite, pas de 500 (AC2)` :
    ```typescript
    prisma.scenario.findUniqueOrThrow.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('...', { code: 'P2025', clientVersion: '7.8.0' }),
    );
    await expect(service.deleteSeance(SECOND_SEANCE_ID, 'mj1')).rejects.toThrow(NotFoundException);
    ```
    Importer `Prisma` depuis `@prisma/client` en tête du fichier de test (vérifier si déjà importé — sinon ajouter `import { Prisma } from '@prisma/client';`).
  - Dans `describe('inscrire()', ...)` : même test, adapté à `service.inscrire(...)`.
  - **Ne pas dupliquer ce test dans les 5 autres describe blocks** (`createSeancePoll`, `resetSeanceDate`, `setSeanceCapacity`, `desinscrire`, `setCompteRendu`) — le mécanisme est partagé et déjà prouvé, 2 preuves suffisent pour AC2 (méthode générique, pas un comportement par-méthode comme AC1).

- [x] **Task 7 — Validation finale**
  - `docker compose exec api pnpm test` — 0 régression sur l'ensemble de la suite api (825 tests avant cette story).
  - `docker compose exec api pnpm typecheck` — propre (piège connu : le changement `import type { Prisma }` → `import { Prisma }` peut révéler des usages implicites ailleurs dans le fichier — vérifier).
  - **Aucune migration Prisma** — aucun changement de schéma.
  - `git status`/diff en fin de story pour confirmer : un seul fichier source modifié (`scenarios.service.ts`) + son fichier de test (`scenarios.service.spec.ts`), aucune modification `apps/web`.

## Dev Notes

### Architecture — Open Question explicitement laissée à la story (`ARCHITECTURE-SPINE.md`, Palier 6)

> `| Comportement exact de FR-5 (brouillon en édition concurrente) et FR-21 (garde de statut par méthode) | Laissés à la story (PRD Open Questions 1 et 2) — impact trop mineur/spécifique pour figer une règle d'architecture globale |`

Cette story **est** la réponse à cette Open Question pour FR-21 — les décisions par méthode (Tasks 1-4) sont le livrable attendu, pas un détail d'implémentation à déduire d'une règle préexistante. **Source tree** (ligne 202-203) confirme le scope fichier : `scenarios.service.ts # + garde findUniqueOrThrow (FR-23), + orderBy inscriptions (FR-20), + pagination findAllForPartie (FR-18), + garde statut séance (FR-21)` — un seul fichier source, cohérent avec cette story.

### `validerDate()` — méthode disparue (vérifié dans le code, pas une supposition)

L'AC1 de l'epic source liste `validerDate` parmi les 5 méthodes à garder. **Cette méthode n'existe plus** dans `ScenariosService` — confirmé par `grep -rn "async.*[Vv]alider" apps/api/src/` (aucun résultat) et par un commentaire du code lui-même, `scenarios.service.ts` ligne 689-691 actuelle (dans `inscrire()`) :

> *"Story 8.8 : la date peut désormais aussi provenir d'un vote (Décision 1) — Seance.dateValidee seul ne suffit plus à détecter le gel du roster (gap trouvé en analyse : `validerDate()`, seule à écrire ce champ, a été retirée)."*

`validerDate()` a donc été supprimée avant la Story 8.8, remplacée par le mécanisme de vote (`PollService.choose()`, module `poll/` séparé — **hors scope `ScenariosModule`**, cohérent avec le fait que le source tree de la spine ne mentionne QUE `scenarios.service.ts` pour FR-21). Le champ `Seance.dateValidee` subsiste uniquement en lecture (héritage de séances créées avant l'introduction du système de vote) et en reset (`resetSeanceDate()`) — plus jamais écrit avec une valeur non-null par le code applicatif actuel. **Conclusion : le scope réel de AC1 est les 4 méthodes existantes**, pas 5.

### Code existant à lire intégralement avant d'écrire le code

- **`addSeance()`** (`scenarios.service.ts:422-435`) :
  ```typescript
  async addSeance(scenarioId: string, mjId: string): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    await this.prisma.seance.create({ data: { scenarioId } });

    const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }
  ```
  Utilise `findUnique` (pas `findUniqueOrThrow`) pour la résolution initiale — déjà protégé par un `if (!scenario)`, **hors scope AC2** (ce n'est pas le pattern FK-orpheline, `scenarioId` est reçu directement en paramètre).

- **`setSeanceCapacity()`** (`scenarios.service.ts:629-664`, commentaire ligne 625-628 cité) :
  ```typescript
  // AD-4/AD-5 : capacité d'inscription réservée à CAMPAGNE_EPISODIQUE — symétrique au rejet
  // CAMPAGNE_EPISODIQUE de linkSeancePoll (ici c'est l'inverse qui est rejeté). addSeance() reste
  // inchangé (Story 8.2) : la capacité se définit dans un second temps...
  async setSeanceCapacity(seanceId: string, mjId: string, inscriptionMin: number, inscriptionMax: number): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({ where: { id: seanceId } });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException("La capacité d'inscription ne peut être définie que pour les campagnes épisodiques");
    }
    if (inscriptionMax < inscriptionMin) {
      throw new BadRequestException('Le maximum doit être supérieur ou égal au minimum');
    }
    await this.prisma.seance.update({ where: { id: seanceId }, data: { inscriptionMin, inscriptionMax } });
    const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }
  ```

- **`inscrire()`** (`scenarios.service.ts:668-732`) — citée en quasi-intégralité, y compris le double-check sous verrou :
  ```typescript
  async inscrire(seanceId: string, userId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({ where: { id: seanceId }, include: { poll: true } });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });
    const partie = await this.parties.getViewable(scenario.partieId, userId);

    if (partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new BadRequestException("L'inscription à capacité limitée n'est disponible que pour les campagnes épisodiques");
    }
    if (seance.inscriptionMax == null) {
      throw new BadRequestException("Cette séance n'a pas encore de capacité définie par le MJ");
    }
    if (seance.poll?.chosenDate ?? seance.dateValidee) {
      throw new BadRequestException('Cette séance a déjà une date validée — les inscriptions sont figées');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Seance" WHERE id = ${seanceId} FOR UPDATE`;
      const existing = await tx.inscription.findUnique({ where: { seanceId_userId: { seanceId, userId } } });
      if (existing) return;
      const locked = await tx.seance.findUniqueOrThrow({ where: { id: seanceId }, include: { poll: true } });
      if (locked.poll?.chosenDate ?? locked.dateValidee) {
        throw new ConflictException('Cette séance a déjà une date validée — les inscriptions sont figées');
      }
      const count = await tx.inscription.count({ where: { seanceId } });
      if (count >= locked.inscriptionMax!) {
        throw new ConflictException('Cette séance a atteint son nombre maximal d’inscrits');
      }
      await tx.inscription.create({ data: { seanceId, userId } });
    });
    const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }
  ```
  **La nouvelle garde de statut (Task 3) doit s'insérer AVANT le bloc `$transaction`** — pas à l'intérieur, pas après. Elle ne remplace ni ne modifie la garde "date déjà validée" existante (orthogonale).

- **`desinscrire()`** (`scenarios.service.ts:734-762`, commentaire ligne 734-735 cité intégralement) :
  ```typescript
  // deleteMany (pas delete) : idempotent si l'utilisateur n'était pas inscrit — pas d'effet de
  // bord dangereux possible, aucune garde de kind/capacité nécessaire (cf. Dev Notes Story 8.3).
  async desinscrire(seanceId: string, userId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({ where: { id: seanceId }, include: { poll: true } });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });
    const partie = await this.parties.getViewable(scenario.partieId, userId);
    if (seance.poll?.chosenDate ?? seance.dateValidee) {
      throw new BadRequestException('Cette séance a déjà une date validée — les inscriptions sont figées');
    }
    await this.prisma.inscription.deleteMany({ where: { seanceId, userId } });
    const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } });
    return toEnrichedDto(this.prisma, this.characters, updated, partie.kind);
  }
  ```

- **`deleteSeance()`** (`scenarios.service.ts:489-527`) — **précédent exact** pour la garde `PASSE`, à reproduire (pas à réinventer) :
  ```typescript
  async deleteSeance(seanceId: string, mjId: string): Promise<ScenarioDto> {
    const seance = await this.prisma.seance.findUnique({ where: { id: seanceId } });
    if (!seance) throw new NotFoundException('Séance introuvable');
    const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });
    const partie = await this.parties.getOwned(scenario.partieId, mjId);
    if (scenario.status === 'PASSE') {
      throw new BadRequestException("Impossible de supprimer une séance d'un scénario clôturé");
    }
    // ... (suite inchangée, hors scope de cette story)
  }
  ```

- **`resetSeanceDate()`** (`scenarios.service.ts:593-623`) — **second précédent exact**, cité intégralement au §"Task 2" ci-dessus.

- **`apps/api/prisma/schema.prisma`** — `Scenario.status` :
  ```prisma
  enum ScenarioStatus {
    BROUILLON
    A_VENIR
    COURANT
    PASSE
  }
  ```

- **`apps/api/src/characters/character.service.ts:12`** — précédent d'import `Prisma` en valeur (pas type-only) : `import { Prisma } from '@prisma/client';`, utilisé pour `Prisma.JsonNull` (ligne 388). Même pattern à appliquer dans `scenarios.service.ts` (Task 5).

### Vérification empirique — comportement réel de `findUniqueOrThrow()` sur un id inexistant

Script exécuté dans ce conteneur (`docker compose exec api node -e "..."`, `PrismaClient` initialisé avec le même adapter `@prisma/adapter-pg` que `PrismaService`, contre la vraie base du projet) :
```javascript
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
await prisma.scenario.findUniqueOrThrow({ where: { id: '00000000-0000-0000-0000-000000000000' } });
// → rejette avec : e instanceof Prisma.PrismaClientKnownRequestError === true, e.code === 'P2025'
```
Confirme le check `e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'` utilisé dans `resolveScenarioOrThrow()` (Task 5). Confirmé aussi que le constructeur `new Prisma.PrismaClientKnownRequestError(message, { code: 'P2025', clientVersion: '7.8.0' })` fonctionne pour mocker cette erreur dans les tests (Task 6).

### Testing Standards

- `apps/api` : Jest, conventions déjà en place (mocks manuels `PrismaService`/`PartiesService`, `Test.createTestingModule`).
- Piège connu (mémoire projet `jdr-api-typecheck-gap`) : `ts-jest` ne type-check pas cross-fichier (`isolatedModules`) — lancer `pnpm typecheck` après le changement de style d'import de `Prisma`.
- **Ne pas modifier `scenarios.service.spec.ts` au-delà des sections explicitement citées** (Task 6) — fichier partagé par de nombreuses autres stories/describe blocks non liés à celle-ci.
- **Ne pas dupliquer le test de référence orpheline (AC2) dans les 7 describe blocks** — 2 preuves suffisent (mécanisme partagé, pas un comportement par-méthode).

### Previous Story Intelligence (Story 17.1)

- Convention établie : vérifier empiriquement tout comportement de bibliothèque tierce (ici, le comportement exact de `Prisma.PrismaClientKnownRequestError`/`P2025`) directement dans ce conteneur avant d'écrire les tâches, plutôt que de supposer depuis la documentation générique — reproduit ici à l'identique.
- Story 17.1 a laissé 2 items mineurs dans `deferred-work.md` (index composite manquant, `skip` sans `take` non borné) — **sans rapport avec cette story**, ne pas y toucher.
- Story 17.1 a introduit `import type { Prisma } from '@prisma/client';` dans ce même fichier (`scenarios.service.ts`) pour le cast `Prisma.InscriptionOrderByWithRelationInput[]` (SEANCE_INCLUDE). **Cette story change ce type-only import en import de valeur** (Task 5) — l'usage `Prisma.InscriptionOrderByWithRelationInput[]` (type) reste valide avec un import de valeur (les types restent accessibles sur le namespace importé en valeur), aucune régression attendue mais à vérifier au typecheck.

### References

- `_bmad-output/planning-artifacts/epics-palier6.md` (lignes 384-398 — Epic 17 / Story 17.2 complète, FR21/FR23)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-18/ARCHITECTURE-SPINE.md` (lignes 202-203 — source tree `scenarios.service.ts` ; ligne 235 — Capability Map, FR-21 = laissé à la story ; ligne 245 — Deferred, Open Question FR-21 explicite)
- `_bmad-output/implementation-artifacts/17-1-pagination-des-listes-non-bornees-et-ordre-deterministe-des-inscriptions.md` (story précédente — méthodologie de vérification empirique, tie-breaker déterministe déjà établi dans ce même fichier)
- Vérifications empiriques effectuées pendant la préparation de cette story : recherche exhaustive (`grep`) de toute méthode `validerDate` (aucune trouvée, confirmée disparue par un commentaire du code lui-même) ; recherche exhaustive des 7 occurrences du pattern FK-orpheline (`findUniqueOrThrow({ where: { id: seance.scenarioId } })`) ; comportement réel de `Prisma.PrismaClientKnownRequestError`/`P2025` vérifié par script `node` réel contre la base de ce projet, pas une supposition.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story / bmad-dev-story)

### Debug Log References

- Aucun blocage rencontré — toutes les vérifications empiriques nécessaires (comportement `P2025`, absence de `validerDate()`, numéros de ligne des 7 sites vulnérables) avaient déjà été effectuées pendant la préparation de la story et se sont confirmées exactes à l'implémentation (aucun décalage de ligne, aucune surprise).

### Completion Notes List

- Gardes de statut ajoutées sur 3 méthodes (`addSeance`, `setSeanceCapacity`, `inscrire`), toutes rejettent `PASSE` ; `inscrire` rejette aussi `BROUILLON` (décision `[ASSUMPTION]` documentée dans le AC1 de la story).
- `desinscrire()` : aucune garde ajoutée — décision explicite confirmée par un test dédié + commentaire de code enrichi (comportement inchangé, juste rendu intentionnel et vérifiable).
- Helper `resolveScenarioOrThrow()` ajouté (convention module-privée, même style que `loadSeancesBatch()`), remplace les 7 occurrences du pattern FK-orpheline (`deleteSeance`, `createSeancePoll`, `resetSeanceDate`, `setSeanceCapacity`, `inscrire`, `desinscrire`, `setCompteRendu`) — convertit `Prisma.PrismaClientKnownRequestError`/`P2025` en `NotFoundException` explicite au lieu d'un 500 non contrôlé.
- Import `Prisma` dans `scenarios.service.ts` changé de `import type` à import de valeur (nécessaire pour `instanceof Prisma.PrismaClientKnownRequestError` au runtime) — le type `Prisma.InscriptionOrderByWithRelationInput[]` (Story 17.1) reste valide avec un import de valeur, confirmé par le typecheck qui passe sans erreur.
- 2 tests de non-régression AC2 (pas 7) sur `deleteSeance()`/`inscrire()`, comme prévu dans la story — mécanisme partagé, pas un comportement par-méthode.
- 825 → 832 tests (7 nouveaux : 1 `addSeance`, 1 `setSeanceCapacity`, 2 `inscrire` AC1 + 1 `inscrire` AC2, 1 `desinscrire`, 1 `deleteSeance` AC2). Suite complète : 832/832, typecheck propre.
- Seuls 2 fichiers modifiés (`scenarios.service.ts` + `scenarios.service.spec.ts`) — confirmé par `git status`, aucune modification `apps/web`, aucune migration Prisma.
- Revue de code (3 agents adversariaux) : 2 patches appliqués (message d'erreur générique, test de la branche `throw e`), 1 item mineur déféré (TOCTOU sur les gardes de statut, cohérent avec le risque déjà accepté pour les gardes préexistantes). 833/833 tests, typecheck propre.

### File List

- `apps/api/src/scenarios/scenarios.service.ts`
- `apps/api/src/scenarios/scenarios.service.spec.ts`

### Review Findings

- [x] [Review][Patch] Le message `'Scénario introuvable (référence orpheline)'` révèle un détail d'intégrité interne (existence d'une clé étrangère orpheline) à l'appelant de l'API [apps/api/src/scenarios/scenarios.service.ts — `resolveScenarioOrThrow()`] — corrigé : remplacé par le message générique `'Scénario introuvable'` (identique aux autres `NotFoundException` de ce fichier).
- [x] [Review][Patch] Aucun test ne couvre la branche `throw e` (erreur Prisma autre que `P2025`, ou erreur non-Prisma) de `resolveScenarioOrThrow()` [apps/api/src/scenarios/scenarios.service.ts] — corrigé : test ajouté (erreur `P2002` propagée telle quelle, `deleteSeance()` comme représentant).
- [x] [Review][Defer] TOCTOU (race condition) : le statut du scénario peut changer entre la lecture non-transactionnelle de la garde et l'écriture qui suit [apps/api/src/scenarios/scenarios.service.ts — `inscrire()` (lecture avant le bloc `$transaction`), `addSeance()`, `setSeanceCapacity()`] — deferred, cohérent avec la classe de risque déjà acceptée pour les gardes `PASSE` préexistantes (`deleteSeance()`/`resetSeanceDate()`/`createSeancePoll()`), qui n'ont elles non plus jamais eu de re-vérification sous verrou. Fenêtre de course étroite (un MJ devrait clôturer le scénario exactement entre la lecture et l'écriture d'un joueur), conséquence limitée (une inscription créée quelques instants avant/après clôture). Durcissement possible dans une story future si un besoin réel émerge.

## Change Log

| Date | Change |
|------|--------|
| 2026-07-19 | Implémentation complète (Tasks 1-7) : gardes de statut sur `addSeance`/`setSeanceCapacity`/`inscrire`, décision explicite documentée pour `desinscrire` (aucune garde), helper `resolveScenarioOrThrow()` appliqué aux 7 sites vulnérables (AC2). 7 tests ajoutés. 832/832 tests, typecheck propre. Statut → review. |
| 2026-07-19 | Revue de code (3 agents adversariaux) : 2 patches appliqués (message d'erreur générique, test branche `throw e`), 1 item déféré (TOCTOU gardes de statut) — voir `deferred-work.md`. 833/833 tests, typecheck propre. Statut → done. |
