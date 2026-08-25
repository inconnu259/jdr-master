---
baseline_commit: 04c21e4
---

# Story 7.6: Passer un scénario à Courant, un seul à la fois en linéaire

Status: done

## Story

As a MJ,
I want marquer un scénario `A_VENIR` comme `Courant`,
so that mes joueurs savent quel scénario est en train d'être joué en ce moment, avec la garantie qu'une seule aventure n'est "en cours" à la fois dans une campagne linéaire.

## Acceptance Criteria

1. **Given** un scénario `status: A_VENIR` d'une Partie `CAMPAGNE_LINEAIRE` **When** le MJ (propriétaire de la Partie) appelle la transition **Then** `PATCH /scenarios/:id/courant` vérifie qu'**aucun autre scénario de la Partie n'est déjà `COURANT`** avant de procéder — recherche + vérification exécutées dans une transaction Prisma qui verrouille explicitement les lignes `Scenario` de la Partie (`SELECT ... FOR UPDATE`, même mécanisme qu'AD-5), pour survivre à deux appels concurrents.
2. **Given** un scénario déjà `COURANT` existe sur la même Partie `CAMPAGNE_LINEAIRE` **When** le MJ tente de marquer un second scénario `Courant` **Then** la requête est rejetée avec `409 Conflict` et un message explicite (ex. `'Un scénario est déjà marqué Courant sur cette Partie.'`, cf. Dev Notes — convention codebase, pas une clé i18n), **aucune écriture n'a lieu**, et le message d'erreur s'affiche explicitement au MJ dans l'UI (pas un échec silencieux).
3. **Given** une Partie `CAMPAGNE_EPISODIQUE` **When** le MJ marque un scénario `A_VENIR` comme `Courant` alors qu'un ou plusieurs autres scénarios de la Partie sont déjà `COURANT` **Then** la transition réussit sans aucune vérification d'unicité — plusieurs scénarios `COURANT` peuvent coexister librement (AD-4, hors du périmètre du verrou AD-10).
4. **Given** un scénario dont le statut n'est **pas** `A_VENIR` (`BROUILLON`, `COURANT`, `PASSE`) **When** une transition vers `Courant` est tentée **Then** la requête est rejetée avec `400 Bad Request` — seule la transition `A_VENIR` → `COURANT` est valide dans cette story.
5. **Given** un utilisateur qui n'est pas le MJ propriétaire de la Partie **When** il tente d'appeler `PATCH /scenarios/:id/courant` **Then** la requête est rejetée avec `403 Forbidden` (même garde `getOwned` que `update`/`open`).
6. **Given** un ONE_SHOT (dont le scénario unique reste toujours seul dans sa Partie) **When** le MJ marque son scénario `A_VENIR` comme `Courant` **Then** la transition réussit sans verrou multi-scénarios (un seul scénario existe de toute façon dans cette Partie — le verrou AD-10 ne s'applique qu'à `CAMPAGNE_LINEAIRE`, cf. Dev Notes).
7. **Given** la transition a réussi **When** le MJ consulte la Chronologie ou l'onglet Scénario(s)/Scénario **Then** le nouveau statut `Courant` est visible sans rechargement manuel (F5) — même mécanisme réactif que Story bug-fix (`ScenariosService.changed` incrémenté, `ScenarioTimeline`/consommateurs rechargent via `effect()`).
8. **Given** le MJ consulte un scénario `A_VENIR` (sa propre Partie) **When** il clique dessus depuis la Chronologie **Then** il accède à une vue MJ (pas la fiche anti-spoil joueur) contenant un CTA « Marquer comme Courant », visible uniquement pour ce statut — jamais pour `BROUILLON`/`COURANT`/`PASSE`.

*(Source: sprint-status.yaml note — "Renumérotée de 7.5 à 7.6 par correct-course (2026-07-12). AC frontend ajoutée (CTA Marquer comme Courant)." ACs reformulées en Given/When/Then à partir du texte d'epics.md, AC8 ajoutée pour couvrir explicitement le point d'entrée frontend absent du texte epics.md d'origine — cf. Dev Notes.)*

## Tasks / Subtasks

- [x] **Task 1 — `apps/api/src/scenarios/scenarios.service.ts` : `markCourant`** (AC1, AC2, AC3, AC4, AC5, AC6)
  - [x] `async markCourant(scenarioId: string, mjId: string): Promise<ScenarioDto>` :
    - `findUnique` par `id` → `NotFoundException` si absent.
    - `await this.parties.getOwned(scenario.partieId, mjId)` (403 si non-MJ propriétaire, AC5) — **conserver la `Partie` retournée**, elle porte `kind`.
    - `if (scenario.status !== 'A_VENIR') throw new BadRequestException(...)` (AC4).
    - Si `partie.kind === 'CAMPAGNE_LINEAIRE'` (AC1/AC2) : exécuter dans `this.prisma.$transaction(async (tx) => { ... })` — `tx.$queryRaw` `SELECT id FROM "Scenario" WHERE "partieId" = ${partie.id} FOR UPDATE` (verrouille toutes les lignes `Scenario` de la Partie), puis `tx.scenario.findFirst({ where: { partieId: partie.id, status: 'COURANT' } })` ; si trouvé → `throw new ConflictException('Un scénario est déjà marqué Courant sur cette Partie.')` (AC2, `import { ConflictException } from '@nestjs/common';` — déjà utilisé ailleurs dans `apps/api/src`, voir Dev Notes) ; sinon `tx.scenario.update({ where: { id: scenarioId }, data: { status: 'COURANT' } })`.
    - Sinon (`CAMPAGNE_EPISODIQUE`/`ONE_SHOT`, AC3/AC6) : `this.prisma.scenario.update({ where: { id: scenarioId }, data: { status: 'COURANT' } })` directement, **aucun verrou, aucune vérification d'unicité**.
    - Retourne `toDto(updated)`.
  - [x] `scenarios.service.spec.ts` : étendre `makePrisma()` avec `$transaction: jest.fn((cb) => cb(txMock))` et un `txMock` exposant `$queryRaw: jest.fn()` + `scenario: { findFirst: jest.fn(), update: jest.fn() }` (aucun mock `$transaction`/`tx` n'existe actuellement dans ce fichier — à ajouter, cf. Dev Notes). Nouveau `describe('markCourant()')` — transition réussie `CAMPAGNE_LINEAIRE` sans conflit ; `409 ConflictException` + `tx.scenario.update` **jamais appelé** quand un `COURANT` existe déjà (mock `tx.scenario.findFirst` retournant un scénario) ; `CAMPAGNE_EPISODIQUE` avec un `COURANT` existant → succès, aucun appel à `$transaction` ; `ONE_SHOT` → succès direct ; statut source ≠ `A_VENIR` → `BadRequestException`, aucune écriture ; non-MJ → `ForbiddenException` propagée par `getOwned`, aucune lecture `scenario.findMany`/écriture.

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.controller.ts`** (AC1-AC6)
  - [x] `@Patch('scenarios/:id/courant') markCourant(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser) { return this.scenarios.markCourant(scenarioId, user.id); }` — même pattern que `open()`.
  - [x] `scenarios.controller.spec.ts` : test de routage standard (mock service, vérifie l'appel avec `scenarioId`/`user.id`).

- [x] **Task 3 — `apps/web/src/app/core/scenarios/scenarios.service.ts`** (AC1-AC7)
  - [x] `async markCourant(scenarioId: string): Promise<ScenarioDto>` — copie exacte du pattern `open()` : `firstValueFrom(this.http.patch<ScenarioDto>(\`${API_BASE}/scenarios/${scenarioId}/courant\`, {}, { withCredentials: true }))`, puis `this._changed.update((v) => v + 1)` avant de retourner (AC7 — cohérence avec `create`/`update`/`open`, tous incrémentent `changed` pour que `ScenarioTimeline` recharge sans F5).
  - [x] `scenarios.service.spec.ts` : un test supplémentaire, même pattern `HttpTestingController` que les méthodes existantes (vérifie la requête `PATCH .../courant`, corps vide).

- [x] **Task 4 — CTA « Marquer comme Courant » dans `ScenarioEditor`** (AC8)
  - [x] `scenario-editor.ts` : ajouter `protected readonly markCourantError = signal<string | null>(null);` et `protected async markCourant(): Promise<void>` — garde `if (!s || s.status !== 'A_VENIR') return;`, `try { this.scenario.set(await this.scenarios.markCourant(s.id)); } catch (err) { this.markCourantError.set(extractErrorMessage(err, 'Impossible de marquer ce scénario comme Courant.')); }` — **le message `409` remonte automatiquement via `extractErrorMessage`** (déjà utilisé par `onFieldConfirm`/`submitDescription`/`upload`/`downloadDocument`), donc affiché tel quel au MJ, satisfaisant AC2 côté UI sans branche `err.status === 409` dédiée.
  - [x] `scenario-editor.html` : dans le `<header>`, après `<app-scenario-status-badge>`, ajouté `@if (s.status === 'A_VENIR') { <button mat-button type="button" (click)="markCourant()">Marquer comme Courant</button> }` ; affiché `@if (markCourantError()) { <p class="error">{{ markCourantError() }}</p> }` sous le `<header>` (même schéma que `fieldEditError`).
  - [x] `scenario-editor.spec.ts` : bouton absent pour `BROUILLON`/`COURANT`/`PASSE`, présent pour `A_VENIR` ; clic → appelle `scenariosService.markCourant`, met à jour `scenario()` avec le retour ; échec (409 mocké) → `markCourantError()` affiche le message serveur, `scenario()` reste inchangé.

- [x] **Task 5 — Routage MJ depuis `ScenarioTimeline` pour `A_VENIR`** (AC8)
  - [x] `scenario-timeline.ts` : `openDetail()` étend sa garde existante `isMj() && scenario.status === 'BROUILLON'` → `isMj() && (scenario.status === 'BROUILLON' || scenario.status === 'A_VENIR')`, routant vers la même page `ScenarioEditor` (`/parties/:id/scenarios/:scenarioId` avec `state: { scenario }`) — **aucune anti-spoil pour le MJ** : il est l'auteur du scénario, `ScenarioReadDialog` (anti-spoil, joueur-facing) ne s'ouvre pour un MJ que pour `COURANT`/`PASSE`. Pour un joueur (`isMj() === false`), le comportement `A_VENIR` reste inchangé (`ScenarioReadDialog`, anti-spoil, Story 7.5).
  - [x] `scenario-timeline.spec.ts` : nouveau test — MJ clique sur un nœud `A_VENIR` → `router.navigate` appelé vers la page `ScenarioEditor` (pas `MatDialog.open`) ; joueur (`isMj` false) clique sur `A_VENIR` → `ScenarioReadDialog` s'ouvre comme avant (non-régression Story 7.5). Test préexistant « MJ + clic sur un scénario non-BROUILLON → ouvre bien ScenarioReadDialog » adapté pour utiliser `COURANT_1` au lieu de `A_VENIR` (le comportement change désormais pour `A_VENIR`, cf. AC8).

### Review Findings

- [x] [Review][Patch] `markCourant()` ne revérifie pas `status: 'A_VENIR'` dans le `where` des deux `update()` (branche `CAMPAGNE_LINEAIRE` sous verrou et branche directe) — écriture basée sur une lecture faite avant l'acquisition du verrou/hors verrou, pouvant écraser un scénario dont le statut a changé entretemps (ex. `PASSE` via un futur endpoint concurrent) [apps/api/src/scenarios/scenarios.service.ts:227-266] — **corrigé** : les deux branches utilisent désormais `updateMany({ where: { id, status: 'A_VENIR' }, ... })` + vérification du `count`, rejet `409 ConflictException` si `count === 0`, puis `findUniqueOrThrow` pour reconstruire le DTO. 2 nouveaux tests ajoutés (`scenarios.service.spec.ts`), 95/95 tests passants.
- [x] [Review][Defer] Aucun garde anti-double-clic / état de chargement sur le CTA « Marquer comme Courant » [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts:126] — deferred, pre-existing (motif partagé par tous les handlers de ce composant — `onFieldConfirm`, `submitDescription`, `upload`, `downloadDocument` — aucun n'a de garde de ce type ; hors scope de cette story)
- [x] [Review][Defer] `markCourantError` n'est jamais réinitialisée par l'`effect()` du constructeur lors d'un rechargement externe du scénario [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts:53-60] — deferred, pre-existing (même limitation partagée par `fieldEditError`/`uploadError`/`downloadError`, aucun n'est reset par cet `effect()`)

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-10 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > Un seul scénario `Courant` à la fois en linéaire, vérifié en service. **Binds :** FR-9 (`CAMPAGNE_LINEAIRE` uniquement — ne s'applique pas à `CAMPAGNE_EPISODIQUE`, cf. AD-4/EXPERIENCE.md §4). **Prevents :** deux scénarios `Courant` simultanés sur une même Partie `CAMPAGNE_LINEAIRE`, par appel concurrent ou par oubli d'un futur endpoint qui ouvrirait un scénario sans vérifier l'état des autres. **Rule :** `ScenariosService.ouvrir(scenarioId)` — pour une Partie `CAMPAGNE_LINEAIRE` uniquement — verrouille (`SELECT ... FOR UPDATE`, même mécanisme qu'AD-5) les lignes `Scenario` de la Partie dans une transaction Prisma, vérifie qu'aucune n'a déjà `status = COURANT`, avant de procéder ; sinon rejet `ConflictException` (409) avec message explicite au MJ (`sessions.scenario_already_courant`, cf. EXPERIENCE.md §3). Action MJ-only à faible fréquence (pas de course réaliste entre joueurs comme pour AD-5), mais le verrou de ligne reste requis pour la même raison : `READ COMMITTED` seul ne bloque pas deux `ouvrir()` concurrents sur deux scénarios différents. Pas un guard/contrainte DB dédiée, cohérent avec le reste du palier.

  **`[ASSUMPTION]`** — AD-10 nomme la méthode `ouvrir(scenarioId)`, mais ce nom est **déjà pris** dans le code par la transition `BROUILLON` → `A_VENIR` (`ScenariosService.open()`, Story 7.1). La nouvelle méthode de cette story est donc nommée `markCourant` (anglais, cohérent avec le reste des noms de méthode du service — `create`, `update`, `open`, `listDrafts`) plutôt que de renommer `open()` (hors scope, casserait Story 7.1/7.4). Le nom `markCourant` transcrit fidèlement l'intention d'AD-10 (transition vers `COURANT`), seul le libellé change.

- **AD-5 (référencé par AD-10 comme "même mécanisme", verbatim)** :
  > `ScenariosService.inscrire(seanceId, userId)` s'exécute dans une transaction Prisma qui **verrouille explicitement la ligne `Seance`** (`tx.$queryRaw` `SELECT ... FOR UPDATE` sur `Seance` par `id`) avant de faire `count(Inscription where seanceId)` puis `create` si `count < max`, sinon rejet (409). L'isolation `READ COMMITTED` par défaut ne suffit pas... Le `SELECT ... FOR UPDATE` est la mesure requise, pas une option.

  **`[ASSUMPTION]` critique** — `AD-5`/`inscrire()` n'est **pas encore implémenté** dans le code (Epic 8, confirmé par recherche exhaustive : aucun `SELECT ... FOR UPDATE`/`FOR UPDATE` dans `apps/api/src`, seul `health.controller.ts` fait un `$queryRaw` de ping `SELECT 1`, sans lien). **Cette story est donc la première à implémenter réellement le verrouillage `FOR UPDATE` dans ce code base** — il n'existe aucun exemple à copier-coller, seulement la prose d'architecture ci-dessus. Le pattern `$transaction(async (tx) => {...})` (structure de callback) a un précédent utilisable dans `poll.service.ts:43`, mais ce précédent (P2-AD-4) ne pose **aucun verrou explicite** (juste un `updateMany`) — ne pas s'y fier pour la syntaxe du verrou lui-même, uniquement pour la structure `$transaction`.

- **Syntaxe exacte du verrou à utiliser** (Postgres, via `Prisma.sql` tagged template ou `$queryRaw` avec interpolation Prisma — jamais de concaténation de chaîne brute, injection SQL) :
  ```ts
  await tx.$queryRaw`SELECT id FROM "Scenario" WHERE "partieId" = ${partie.id} FOR UPDATE`;
  ```
  Le nom de table/colonnes doit respecter la casse Prisma réelle du schéma (`@@map`/nom de modèle par défaut — vérifier dans `schema.prisma` avant d'écrire la requête ; **confirmé : le modèle `Scenario` n'a pas de `@@map`**, donc Prisma utilise le nom du modèle tel quel entre guillemets doubles, `"Scenario"`). Le `SELECT` de verrouillage n'a besoin de récupérer que `id` (aucune donnée exploitée ensuite, seul l'effet de verrou compte) — le `findFirst({ where: { status: 'COURANT' } })` de vérification s'exécute **après**, dans la même transaction `tx`, pour bénéficier du verrou déjà posé. Le paramètre du callback `$transaction(async (tx) => {...})` peut être laissé à l'inférence de type (comme dans `poll.service.ts:43`) ; si un typage explicite est préféré, `invite-links.service.ts:100` établit le précédent `tx: Prisma.TransactionClient` (`import type { Prisma } from '@prisma/client';`) — les deux approches sont valides, aucune n'est requise par cette story.

- **`ConflictException`** : **correction post-validation** — contrairement à une première analyse, `ConflictException` est déjà largement utilisé dans `apps/api/src` (`auth.service.ts`, `availability.service.ts`, `character.service.ts` — 8+ appels —, `invitations.service.ts`, `invite-links.service.ts`), toujours avec un **message français littéral** (ex. `'Vous êtes déjà le MJ de cette partie.'`, `'Invitation déjà traitée.'`), **jamais** une clé technique pointée (`sessions.scenario_already_courant`, texte d'AD-10, n'a aucun précédent d'usage réel de ce format dans le code). Cette story suit donc la convention déjà établie : `throw new ConflictException('Un scénario est déjà marqué Courant sur cette Partie.')`, cohérent avec `NotFoundException('Scénario introuvable')`/`BadRequestException('Seul un scénario Brouillon peut être ouvert aux joueurs')` déjà dans ce même fichier. `import { ConflictException } from '@nestjs/common';` (déjà importé ailleurs dans le projet, même chemin). `extractErrorMessage` (frontend) affiche ce message français tel quel — aucun mapping clé→libellé à construire.

- **`AD-4` (rappel, permet AC3)** : `CAMPAGNE_EPISODIQUE` autorise plusieurs scénarios `COURANT` simultanés (déjà géré par `ScenarioTimeline` Story 7.5, qui empile ces nœuds). `markCourant` ne doit **jamais** appliquer le verrou/la vérification d'unicité pour ce `kind`, ni pour `ONE_SHOT`.

- **Où vit le CTA (AC8) — décision de conception de cette story** : il n'existe aujourd'hui **aucune vue MJ dédiée** pour un scénario une fois sorti de `BROUILLON` — `ScenarioDrafts`/`ScenarioOneShotTab` (Story 7.3/7.4) ne listent que les `BROUILLON` ; `ScenarioReadDialog` (Story 7.5) est **strictement lecture seule, anti-spoil, joueur-facing**, documenté explicitement comme ne devant jamais afficher de contrôle d'édition quel que soit le rôle du viewer (Story 7.5 Dev Notes) — y ajouter un CTA MJ violerait directement ce contrat et ferait courir un risque de régression sur un composant partagé MJ/joueur. Cette story choisit donc d'étendre le branchement **déjà existant** dans `ScenarioTimeline.openDetail()` (`isMj() && status === 'BROUILLON'` → route MJ vers `ScenarioEditor`, ajouté lors de la session de correctifs de bugs post-Story 7.5) pour couvrir aussi `A_VENIR` — routant vers la **même page `ScenarioEditor`** déjà utilisée pour l'édition `BROUILLON`. `ScenarioEditor.isReadOnly()` (`status === 'PASSE'`) reste `false` pour `A_VENIR`, donc tous les champs restent éditables comme avant ; seul le nouveau bouton « Marquer comme Courant » est ajouté, conditionné à `status === 'A_VENIR'` exclusivement. **Aucune modification de `ScenarioReadDialog`/`ScenarioTimeline` pour les joueurs** — le comportement joueur sur `A_VENIR` (anti-spoil, `ScenarioReadDialog`, titre seul) reste strictement inchangé.

- **`extractErrorMessage` (rappel, déjà dans `scenario-editor.ts`)** — fonction déjà utilisée par 4 handlers du même fichier (`onFieldConfirm`, `submitDescription`, `upload`, `downloadDocument`) : `err instanceof HttpErrorResponse && typeof err.error?.message === 'string' ? err.error.message : fallback`. Réutiliser telle quelle pour `markCourant()`, ne pas dupliquer de logique d'extraction 409 spécifique — le message renvoyé par le backend (quel que soit son contenu exact, cf. `[ASSUMPTION]` ci-dessus) remonte automatiquement.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** — `open()` (BROUILLON→A_VENIR), pattern le plus proche à contraster :
```ts
async open(scenarioId: string, mjId: string): Promise<ScenarioDto> {
  const scenario = await this.prisma.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario) throw new NotFoundException('Scénario introuvable');
  await this.parties.getOwned(scenario.partieId, mjId);

  if (scenario.status !== 'BROUILLON') {
    throw new BadRequestException('Seul un scénario Brouillon peut être ouvert aux joueurs');
  }

  const updated = await this.prisma.scenario.update({
    where: { id: scenarioId },
    data: { status: 'A_VENIR' },
  });
  return toDto(updated);
}
```
`markCourant` diverge après `getOwned` : statut source `A_VENIR` (pas `BROUILLON`), et le `update` est conditionné au `kind` de la `Partie` retournée par `getOwned` (verrou + vérification pour `CAMPAGNE_LINEAIRE`, direct sinon) — voir Task 1 pour le squelette complet.

**`poll.service.ts:43`** — structure `$transaction` (callback) à répliquer, **sans** son absence de verrou explicite :
```ts
await this.prisma.$transaction(async (tx) => {
  // ... updateMany existant, PAS un exemple de verrou FOR UPDATE
});
```

**`apps/api/src/scenarios/scenarios.controller.ts`** — pattern de route à répliquer (`open()`) :
```ts
@Patch('scenarios/:id/open')
open(
  @Param('id', ParseUUIDPipe) scenarioId: string,
  @CurrentUser() user: AuthUser,
) {
  return this.scenarios.open(scenarioId, user.id);
}
```
Nouveau : `@Patch('scenarios/:id/courant')` appelant `markCourant`.

**`apps/web/src/app/core/scenarios/scenarios.service.ts`** — `open()` (état final après la session de correctifs de bugs, incrémente déjà `_changed`) :
```ts
async open(scenarioId: string): Promise<ScenarioDto> {
  const result = await firstValueFrom(
    this.http.patch<ScenarioDto>(`${API_BASE}/scenarios/${scenarioId}/open`, {}, { withCredentials: true }),
  );
  this._changed.update((v) => v + 1);
  return result;
}
```
`markCourant` : copie exacte, URL `.../scenarios/${scenarioId}/courant`.

**`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** — état actuel confirmé par lecture directe (voir Dev Notes ci-dessus pour `extractErrorMessage`) : `isReadOnly = computed(() => this.scenario()?.status === 'PASSE')`, `onFieldConfirm`/`submitDescription` déjà gardés par `if (!s || this.isReadOnly()) return;` — **`markCourant()` n'a pas besoin de cette garde `isReadOnly`** (un `A_VENIR` n'est jamais `PASSE`), seule la garde de statut explicite (`s.status !== 'A_VENIR'`) s'applique.

**`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** — `openDetail()` actuel (état après la session de correctifs de bugs) :
```ts
protected openDetail(scenario: ScenarioDto): void {
  if (this.dragMoved) { this.dragMoved = false; return; }
  if (this.isMj() && scenario.status === 'BROUILLON') {
    void this.router.navigate(['/parties', this.partieId(), 'scenarios', scenario.id], { state: { scenario } });
    return;
  }
  this.dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, { data: { scenario } });
}
```
Modification : `if (this.isMj() && (scenario.status === 'BROUILLON' || scenario.status === 'A_VENIR')) { ... }` — même corps, condition élargie.

### Hors scope explicite de cette story (ne pas implémenter)

- Clôture `COURANT` → `PASSE` (Story 7.7, suivante).
- Toute UI de sélection de date/séance liée à la transition — aucun modèle `Seance` exploité avant Epic 8 (même limitation que Story 7.5).
- Mapping i18n clé technique → libellé traduit pour `sessions.scenario_already_courant` (cf. `[ASSUMPTION]` ci-dessus — le message backend, quel qu'il soit, remonte tel quel).
- Toute modification de `ScenarioReadDialog`/comportement joueur sur `A_VENIR` (reste anti-spoil, Story 7.5, inchangé).
- Notification temps réel / websocket lors d'un changement de statut par un autre membre — le rechargement (AC7) repose uniquement sur le signal `changed` déjà en place, actif seulement au sein du même onglet applicatif ouvert par le MJ qui déclenche l'action (pas de push cross-session).

### Project Structure Notes

- Aucun nouveau fichier — cette story modifie exclusivement des fichiers déjà créés par les Stories 7.1/7.4/7.5 et la session de correctifs de bugs (`scenarios.service.ts`/`.spec.ts` API et web, `scenarios.controller.ts`/`.spec.ts`, `scenario-editor.ts`/`.html`/`.spec.ts`, `scenario-timeline.ts`/`.spec.ts`).
- Aucun nouveau type partagé dans `packages/shared` — `ScenarioDto`/`ScenarioStatus` existants suffisent (le statut `COURANT` existe déjà dans l'enum).

### References

- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#7-6-passer-scenario-courant] — note de renumérotation correct-course, AC frontend ajoutée.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.6] — texte d'origine de la story et ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-10, #AD-5, #AD-4] — verrouillage `SELECT ... FOR UPDATE`, unicité `Courant` en linéaire, coexistence en épisodique.
- [Source: apps/api/src/scenarios/scenarios.service.ts, scenarios.controller.ts] — pattern `open()`/`getOwned` à répliquer et diverger.
- [Source: apps/api/src/poll.service.ts:43] — structure `$transaction` (callback), sans précédent de verrou explicite.
- [Source: apps/api/prisma/schema.prisma] — `PartieKind`, `ScenarioStatus`, `@@index([partieId, status])` sur `Scenario`.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `open()`/`_changed.update` à répliquer pour `markCourant`.
- [Source: apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, .html] — `isReadOnly`, `extractErrorMessage`, structure du `<header>` pour l'ajout du CTA.
- [Source: apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts] — `openDetail()` à étendre (branche MJ existante pour `BROUILLON`).
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts] — confirmé strictement lecture seule joueur-facing, non modifié par cette story.
- [Source: 7-5-anti-spoil-vue-chronologique.md] — intelligence de story précédente : patterns `BreakpointObserver`, `MatDialog`, conventions de tests, décisions AD-6/AD-9 déjà établies et non remises en cause ici.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `markCourant()` est la première implémentation réelle d'un verrou `SELECT ... FOR UPDATE` dans ce code base (AD-5 lui-même non encore implémenté, Epic 8) — aucun exemple à copier-coller, uniquement la prose d'architecture (AD-10/AD-5) et la structure `$transaction` de `poll.service.ts:43` (sans verrou). Testé via un mock `tx` dédié dans `makePrisma()` (`$transaction: jest.fn((cb) => cb(txMock))`), absent avant cette story.
- Correction de conception appliquée pendant la revue de la story (avant dev) : `ConflictException` est en réalité déjà largement utilisé dans `apps/api/src` avec des messages français littéraux — le message technique `sessions.scenario_already_courant` suggéré par le texte verbatim d'AD-10 a été remplacé par un message français explicite (`'Un scénario est déjà marqué Courant sur cette Partie.'`), cohérent avec `NotFoundException('Scénario introuvable')`/etc. déjà dans `scenarios.service.ts`.
- `scenario-timeline.spec.ts` : un test préexistant de Story 7.5/session de correctifs (« MJ + clic sur un scénario non-BROUILLON → ouvre bien ScenarioReadDialog ») utilisait `A_VENIR` comme scénario de test — son comportement change désormais avec cette story (MJ + `A_VENIR` → navigation, pas dialogue). Test adapté pour utiliser `COURANT_1` à la place (le comportement MJ sur `COURANT`/`PASSE` reste, lui, inchangé) ; deux nouveaux tests ajoutés pour couvrir explicitement `A_VENIR` côté MJ (navigation) et côté joueur (dialogue anti-spoil inchangé).
- Suite complète (après implémentation) : 29 suites / 497 tests API (+10 : 9 `markCourant()` + 1 routage contrôleur), 61 suites / 527 tests web (+8 : 1 `scenarios.service` `markCourant`, 6 CTA `scenario-editor`, 1 net sur `scenario-timeline` — 1 test adapté + 2 nouveaux - test global déjà comptés). Aucune régression.

### Completion Notes List

- Backend : `ScenariosService.markCourant(scenarioId, mjId)` (nouvel endpoint `PATCH /scenarios/:id/courant`) — transition `A_VENIR` → `COURANT` MJ-only (`getOwned`). Pour `CAMPAGNE_LINEAIRE` : verrou `SELECT ... FOR UPDATE` sur les lignes `Scenario` de la Partie dans une transaction Prisma, vérification qu'aucun autre `COURANT` n'existe, rejet `409 ConflictException` sinon (message français explicite). Pour `CAMPAGNE_EPISODIQUE`/`ONE_SHOT` : transition directe, aucun verrou, aucune vérification d'unicité (AD-4).
- Frontend service : `ScenariosService.markCourant(scenarioId)` — même convention que `open()` (`_changed` incrémenté pour la synchronisation réactive sans F5, AC7).
- `ScenarioEditor` : nouveau CTA « Marquer comme Courant » dans le `<header>`, visible uniquement pour `status === 'A_VENIR'` ; erreur (409 ou autre) affichée via `markCourantError`, réutilisant `extractErrorMessage` déjà en place.
- `ScenarioTimeline` : branche MJ existante (`isMj() && BROUILLON` → navigation vers `ScenarioEditor`) étendue à `A_VENIR` — le MJ accède désormais à la vue d'édition (avec CTA) au lieu du dialogue anti-spoil joueur pour ce statut. Comportement joueur strictement inchangé (toujours `ScenarioReadDialog`, anti-spoil).
- 8 acceptance criteria couvertes : AC1/AC2 (verrou + conflit `CAMPAGNE_LINEAIRE`), AC3 (coexistence `CAMPAGNE_EPISODIQUE`), AC4 (statut source invalide), AC5 (403 non-MJ), AC6 (`ONE_SHOT` sans verrou), AC7 (rechargement réactif via `changed`), AC8 (CTA + routage MJ `A_VENIR`).
- 497/497 tests API + 527/527 tests web passent, aucune régression.

### File List

- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `markCourant`, import `ConflictException`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — mock `$transaction`/`tx` ajouté à `makePrisma()`, 9 nouveaux tests `markCourant()`, import `ConflictException`)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `PATCH scenarios/:id/courant`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mock `markCourant` ajouté, 1 nouveau test de routage)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `markCourant`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — 1 nouveau test)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — `markCourantError`, `markCourant()`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié — CTA conditionnel `A_VENIR`, affichage `markCourantError`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — mock `markCourant` ajouté, 6 nouveaux tests)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — `openDetail()` étend la garde MJ à `A_VENIR`)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié — 1 test adapté, 2 nouveaux tests)

## Change Log

- 2026-07-13 : Story créée via `bmad-create-story` (recherche subagents backend/frontend, intelligence Story 7.5, lecture directe AD-10/AD-5/`open()`/`ScenarioEditor`/`ScenarioTimeline`).
- 2026-07-13 : Implémentation complète de la Story 7.6 (`ScenariosService.markCourant` avec verrou `SELECT ... FOR UPDATE` pour `CAMPAGNE_LINEAIRE`, route `PATCH /scenarios/:id/courant`, service frontend `markCourant`, CTA « Marquer comme Courant » dans `ScenarioEditor`, routage MJ étendu dans `ScenarioTimeline` — 8 ACs couvertes, 497/497 tests API + 527/527 tests web passants, aucune régression).
