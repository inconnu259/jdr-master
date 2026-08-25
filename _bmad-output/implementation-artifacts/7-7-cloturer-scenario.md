---
baseline_commit: 7bc42e3
---

# Story 7.7: Clôturer un scénario

Status: done

## Story

As a MJ,
I want clôturer un scénario `Courant` dès que je le souhaite,
so that le contenu devient une trace durable consultable par tous et que la campagne peut avancer.

## Acceptance Criteria

1. **Given** un scénario `status: COURANT` **When** le MJ (propriétaire de la Partie) appelle la transition **Then** `PATCH /scenarios/:id/passe` fait passer son statut à `PASSE` et renseigne `closedAt` (horodatage serveur, `new Date()`), en réutilisant le pattern `updateMany({ where: { id, status: 'COURANT' } }) + count` établi par la revue de Story 7.6 (protection TOCTOU — la lecture du statut hors verrou ne doit jamais être réutilisée telle quelle pour l'écriture).
2. **Given** un scénario dont le statut n'est **pas** `COURANT` (`BROUILLON`, `A_VENIR`, déjà `PASSE`) **When** une transition vers `Passé` est tentée **Then** la requête est rejetée avec `400 Bad Request` — seule la transition `COURANT` → `PASSE` est valide dans cette story ; aucune écriture n'a lieu.
3. **Given** un utilisateur qui n'est pas le MJ propriétaire de la Partie **When** il tente d'appeler `PATCH /scenarios/:id/passe` **Then** la requête est rejetée avec `403 Forbidden` (même garde `getOwned` que `update`/`open`/`markCourant`).
4. **Given** un scénario venant de passer `PASSE` **When** n'importe quel membre de la Partie le consulte (`GET /parties/:id/scenarios`, `ScenarioReadDialog`) **Then** il voit le contenu complet (description, documents, participants) en lecture — l'anti-spoil est levé. **Déjà satisfait par le code existant** (AD-6 : aucun filtrage backend, `findAllForPartie` renvoie toujours tout ; `ScenarioReadDialog.isRestricted` exclut déjà `PASSE`) — cette AC est une **vérification de non-régression**, pas une nouvelle implémentation (cf. Dev Notes).
5. **Given** une Partie `CAMPAGNE_LINEAIRE` dont le scénario `COURANT` vient d'être clôturé, avec un scénario `A_VENIR` existant **When** le MJ tente de passer ce dernier à `COURANT` (`ScenariosService.markCourant`, Story 7.6) **Then** l'opération réussit sans rejet `409` — le verrou AD-10 ne trouve plus aucun `COURANT` sur la Partie. **Aucune modification de `markCourant`** : ce comportement découle automatiquement de la transition `close()` de cette story (cf. Dev Notes, test croisé à ajouter).
6. **Given** un scénario `COURANT` **When** le MJ consulte sa fiche (vue MJ, `ScenarioEditor`) **Then** un CTA « Clôturer le scénario » est visible, conditionné strictement à `status === 'COURANT'` ; au clic, la clôture est déclenchée et le statut/l'affichage se met à jour immédiatement à l'écran (signal `scenario` réassigné avec la réponse HTTP, même mécanisme que `markCourant`, Story 7.6) — sans rechargement de page (F5). En cas d'échec, le message d'erreur serveur s'affiche explicitement (pas un échec silencieux), même pattern `extractErrorMessage` que `markCourant`.
7. **Given** un scénario `status: PASSE` **When** le MJ tente de modifier la description ou d'ajouter un document (`PATCH /scenarios/:id`, `POST /parties/:id/documents`) **Then** la requête est rejetée — seul le résumé de fin (Epic 8, Story 8.5, champ `resumeFin`) restera éditable après clôture, via un mécanisme dédié futur. **Déjà satisfait par le code existant** (`ScenariosService.update()`/`uploadDocument()` rejettent déjà tout `PATCH`/upload sur un scénario `PASSE`, testé — `scenarios.service.spec.ts:245` et `:336`) — vérification de non-régression uniquement, aucun changement de code requis pour cette AC (cf. Dev Notes, **`[ASSUMPTION]`**).

*(Source: epics.md Story 7.7, 5 ACs reformulées en Given/When/Then et complétées de 2 ACs (403 non-MJ, CTA + mise à jour réactive) pour couvrir explicitement les points d'entrée backend/frontend absents du texte epics.md d'origine, même méthode que Story 7.6 AC5/AC8.)*

## Tasks / Subtasks

- [x] **Task 1 — `apps/api/src/scenarios/scenarios.service.ts` : `close()`** (AC1, AC2, AC3, AC5)
  - [x] `async close(scenarioId: string, mjId: string): Promise<ScenarioDto>` :
    - `findUnique` par `id` → `NotFoundException('Scénario introuvable')` si absent (même message que `open`/`markCourant`).
    - `await this.parties.getOwned(scenario.partieId, mjId)` (403 si non-MJ propriétaire, AC3).
    - `if (scenario.status !== 'COURANT') throw new BadRequestException('Seul un scénario Courant peut être clôturé');` (AC2 — même formulation que les `BadRequestException` existantes de ce fichier : `'Seul un scénario Brouillon peut être ouvert aux joueurs'`, `'Seul un scénario À venir peut être marqué Courant'`).
    - `const { count } = await this.prisma.scenario.updateMany({ where: { id: scenarioId, status: 'COURANT' }, data: { status: 'PASSE', closedAt: new Date() } });` — **pas de verrou `FOR UPDATE`/`$transaction`** : contrairement à `markCourant` (AD-10, unicité *entre* plusieurs scénarios de la Partie), `close()` ne contraint que **le scénario ciblé lui-même** — `updateMany` + vérification du `count` (même garde-fou TOCTOU que la correction de revue de Story 7.6) suffit à empêcher une double-clôture concurrente d'écraser un `closedAt` déjà posé.
    - `if (count === 0) throw new ConflictException('Le statut du scénario a changé entretemps, réessayez.');` (même message que `markCourant`, cohérence).
    - `const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });` puis `return toDto(updated);`.
  - [x] `scenarios.service.spec.ts` : nouveau `describe('close()')` — transition réussie `COURANT` → `PASSE` avec `closedAt` renseigné dans le DTO retourné ; statut source ≠ `COURANT` (`BROUILLON`/`A_VENIR`/`PASSE`, `it.each`) → `BadRequestException`, `updateMany` jamais appelé ; non-MJ → `ForbiddenException` propagée par `getOwned`, aucune lecture/écriture Prisma après ; `count === 0` (course concurrente simulée) → `ConflictException`, message `'Le statut du scénario a changé entretemps, réessayez.'`.
  - [x] **Test croisé AC5** (promotion linéaire après clôture) : scénario de test — `close()` réussit sur un scénario `CAMPAGNE_LINEAIRE` `COURANT`, puis `markCourant()` (Story 7.6) est appelé sur un second scénario `A_VENIR` de la même Partie ; mock `tx.scenario.findFirst` (vérification `COURANT`) retourne `null` (plus aucun `COURANT` après clôture) → `markCourant()` réussit sans `ConflictException`. Ce test ne modifie ni ne réimplémente `markCourant`, il documente/verrouille le comportement croisé attendu par AC5.

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.controller.ts`** (AC1-AC3)
  - [x] `@Patch('scenarios/:id/passe') close(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser) { return this.scenarios.close(scenarioId, user.id); }` — même pattern que `open()`/`markCourant()`. URL `/passe` (nom du statut cible, cohérent avec `/courant` de Story 7.6, plutôt que `/cloturer`, verbe).
  - [x] `scenarios.controller.spec.ts` : ajouter `close: jest.fn()` à `makeScenariosService()`, test de routage standard (`controller.close('s1', user)` → `scenarios.close` appelé avec `'s1', 'mj1'`).

- [x] **Task 3 — `apps/web/src/app/core/scenarios/scenarios.service.ts`** (AC1, AC6)
  - [x] `async close(scenarioId: string): Promise<ScenarioDto>` — copie exacte du pattern `markCourant()` : `firstValueFrom(this.http.patch<ScenarioDto>(\`${API_BASE}/scenarios/${scenarioId}/passe\`, {}, { withCredentials: true }))`, puis `this._changed.update((v) => v + 1)` avant de retourner (cohérence `create`/`update`/`open`/`markCourant` — `ScenarioTimeline` recharge sans F5).
  - [x] `scenarios.service.spec.ts` : un test supplémentaire, même pattern `HttpTestingController` que `markCourant` (vérifie la requête `PATCH .../passe`, corps vide).

- [x] **Task 4 — CTA « Clôturer le scénario » dans `ScenarioEditor`** (AC6)
  - [x] `scenario-editor.ts` : ajouter `protected readonly closeError = signal<string | null>(null);` et `protected async close(): Promise<void>` — garde `if (!s || s.status !== 'COURANT') return;`, `try { this.scenario.set(await this.scenarios.close(s.id)); } catch (err) { this.closeError.set(extractErrorMessage(err, 'Impossible de clôturer ce scénario.')); }` — même structure exacte que `markCourant()` (lignes 126-137 actuelles). Réutiliser `extractErrorMessage` déjà défini en haut du fichier, ne pas dupliquer.
  - [x] `scenario-editor.html` : dans le `<header>`, à côté du bouton `markCourant` existant, ajouter `@if (s.status === 'COURANT') { <button mat-button type="button" (click)="close()">Clôturer le scénario</button> }` ; afficher `@if (closeError()) { <p class="error">{{ closeError() }}</p> }` sous le `<header>` (même schéma que `markCourantError()`). **Pas de classe CSS `gradient`/`btn-danger-outline`** — ces classes n'existent nulle part dans le codebase actuel (DESIGN.md §7 `ScenarioCard.actions-mj` reste un design cible non implémenté, même écart déjà noté par Story 7.6 pour le CTA « Marquer comme Courant » qui utilise un `mat-button` simple) ; cette story suit le même précédent, cf. Dev Notes `[ASSUMPTION]`.
  - [x] `scenario-editor.spec.ts` : bouton absent pour `BROUILLON`/`A_VENIR`/`PASSE`, présent pour `COURANT` ; clic → appelle `scenariosService.close`, met à jour `scenario()` avec le retour (`status: 'PASSE'`, `closedAt` renseigné) — vérifier que `isReadOnly()` bascule à `true` immédiatement après (les champs deviennent lecture seule sans rechargement, AC6) ; échec (mock rejeté) → `closeError()` affiche le message serveur, `scenario()` reste inchangé.

- [x] **Task 5 — Routage MJ depuis `ScenarioTimeline` pour `COURANT`** (AC6 — rendre le CTA atteignable)
  - [x] `scenario-timeline.ts` : `openDetail()` étend sa garde existante `isMj() && (status === 'BROUILLON' || status === 'A_VENIR')` → `isMj() && (status === 'BROUILLON' || status === 'A_VENIR' || status === 'COURANT')`, routant vers la même page `ScenarioEditor`. **`PASSE` reste inchangé** (MJ continue d'ouvrir `ScenarioReadDialog` pour `PASSE` — cette story n'ajoute aucune vue MJ dédiée pour `PASSE`, cf. AC4/AC7 déjà satisfaites par `ScenarioReadDialog`/le blocage backend existants ; `ScenarioEditor.isReadOnly()` gère déjà l'affichage lecture seule si un MJ y accédait malgré tout). Comportement joueur (`isMj() === false`) inchangé pour tous les statuts.
  - [x] `scenario-timeline.spec.ts` : **test préexistant à adapter** (ligne ~287, titre exact `'MJ + clic sur un COURANT/PASSE → ouvre bien ScenarioReadDialog (comportement inchangé)'`, utilise `COURANT_1`) — son comportement change désormais pour `COURANT` (même piège déjà rencontré en Story 7.6 avec `A_VENIR`, cf. `scenario-timeline.spec.ts` historique). Scinder en deux tests : (1) titre renommé sur `PASSE` uniquement (`comp.openDetail(PASSE)` → `dialog.open` toujours appelé, seul comportement réellement inchangé) ; (2) nouveau test — MJ clique sur un nœud `COURANT` → `router.navigate` appelé vers `ScenarioEditor` (pas `MatDialog.open`). Ajouter aussi un test joueur (`isMj: false`) clique sur `COURANT` → `ScenarioReadDialog` s'ouvre comme avant (non-régression comportement joueur).

### Vérifications de non-régression (aucun code à écrire — AC4, AC7)

- [x] Confirmer que `findAllForPartie`/`GET /parties/:id/scenarios` renvoie déjà `description`/`documents`/`participants` complets pour un scénario `PASSE` sans filtrage backend (AD-6) — déjà le cas, ne pas ajouter de filtrage.
- [x] Confirmer que `ScenarioReadDialog.isRestricted`/`isPasse` affiche déjà le contenu complet + résumé de fin pour `PASSE` — déjà le cas (`scenario-read-dialog.ts:30-34`), aucune modification.
- [x] Confirmer que `ScenariosService.update()`/`uploadDocument()` rejettent déjà toute modification sur un scénario `PASSE` (`scenarios.service.ts:67-71`, `:114-118`, testés `scenarios.service.spec.ts:245`, `:336`) — aucune modification.

### Review Findings

- [x] [Review][Defer] Aucun garde anti-double-clic / état de chargement sur le CTA « Clôturer le scénario » [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts:140] — deferred, pre-existing (même limitation déjà différée pour le CTA « Marquer comme Courant », Story 7.6 — motif partagé par tous les handlers du composant)
- [x] [Review][Defer] `closeError` n'est jamais réinitialisée par l'`effect()` du constructeur lors d'un rechargement externe du scénario [apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts:53] — deferred, pre-existing (même limitation déjà différée pour `markCourantError`, Story 7.6 — aucun des signaux d'erreur du composant n'est reset par cet `effect()`)

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-9 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > Écriture de contenu (créer/éditer/ouvrir/**clôturer un scénario**, rédiger résumé/compte-rendu, publier une annonce) = MJ seul, `parties.getOwned`.

  `close()` suit ce pattern à l'identique — `getOwned`, pas de guard NestJS dédié (AC3).

- **AD-6 (verbatim, rappel)** :
  > `GET /parties/:id/scenarios`, `GET /scenarios/:id`... renvoient/servent toujours le contenu complet... à tout membre de la Partie (`parties.getViewable`), quel que soit le statut du scénario... **Aucune donnée n'est retirée côté serveur.** L'anti-spoil est un rendu Angular conditionnel.

  **Conséquence directe pour AC4** : il n'y a **rien à implémenter côté backend** pour lever l'anti-spoil au passage `PASSE` — c'est déjà l'état du système depuis Story 7.1/7.5. `close()` n'a besoin que de changer `status`/`closedAt` ; le rendu conditionnel (`ScenarioReadDialog.isRestricted`) exclut déjà `PASSE` de toute restriction. Vérifié par lecture directe de `scenario-read-dialog.ts`/`.html` (Dev Notes ci-dessous).

- **AD-10 (rappel, Story 7.6, non modifié par cette story)** : le verrou `SELECT ... FOR UPDATE` + vérification `status = COURANT` dans `markCourant()` s'applique **au moment de l'appel** — une fois `close()` a fait passer l'unique scénario `COURANT` d'une Partie `CAMPAGNE_LINEAIRE` à `PASSE`, un appel `markCourant()` ultérieur sur un `A_VENIR` de la même Partie ne trouve plus aucun `COURANT` (`tx.scenario.findFirst({ where: { status: 'COURANT' } })` retourne `null`) et procède sans `409` (AC5). **Aucune modification de `markCourant`/AD-10 requise** — le comportement est une conséquence automatique de la transition d'état, à couvrir uniquement par un test croisé (Task 1, dernier sous-item).

- **Statuts (rappel schéma, `ARCHITECTURE-SPINE.md` L132)** : `ScenarioStatus` enum `BROUILLON | A_VENIR | COURANT | PASSE`, jamais de booléen parallèle. `closedAt DateTime?` déjà présent sur le modèle `Scenario` (migration `scenarios_seances_p4`, confirmé par lecture de `schema.prisma:391`) et déjà exposé dans `ScenarioDto`/`toDto()` (`scenarios.service.ts:325`) — **aucun nouveau champ/migration/type partagé requis pour cette story**, seule l'écriture de `closedAt` (actuellement toujours `null` en pratique, jamais renseigné par le code existant) est nouvelle.

- **`[ASSUMPTION]` — AC7 (résumé de fin excepté) déjà couverte sans changement** : le texte epics.md dit *« seul le résumé de fin (Epic 8, Story 8.5) reste éditable après clôture »*. Le code actuel de `update()` **bloque déjà 100% des `PATCH` sur un scénario `PASSE`**, sans distinction de champ (`if (scenario.status === 'PASSE') throw new BadRequestException(...)` avant même de lire `dto`). Comme `resumeFin` n'existe pas encore dans `UpdateScenarioDto` (champ Prisma présent, DTO absent — Epic 8 non commencé), il n'y a **aucune régression possible** aujourd'hui à laisser ce blocage inconditionnel : la story 8.5 future devra elle-même affiner `update()` (ou créer un endpoint dédié `PATCH /scenarios/:id/resume`) pour excepter `resumeFin` — **hors scope explicite de 7.7**, ne pas anticiper cette branche maintenant (YAGNI, cf. section Hors scope).

- **`[ASSUMPTION]` — nommage `close()`/URL `/passe`** : comme pour `markCourant` (Story 7.6, `[ASSUMPTION]` sur le nom `ouvrir` d'AD-10 non repris), le texte source ne fige pas de nom de méthode pour la clôture. Cette story choisit `close()` (anglais, cohérent avec `create`/`update`/`open`) et l'URL `scenarios/:id/passe` (nom du statut cible en minuscule, cohérent avec `scenarios/:id/courant` de Story 7.6 — pas `scenarios/:id/cloturer`, qui romprait la convention "URL = statut cible" établie par la story précédente).

- **`[ASSUMPTION]` — styles gradient/`btn-danger-outline` (AC6, épic-DESIGN.md §7)** : recherche exhaustive (`grep -r "btn-danger-outline\|gradient"` sur `apps/web/src`) confirme qu'**aucune de ces classes CSS n'existe dans le codebase**, ni pour le CTA `markCourant` de Story 7.6 (lui-même documenté comme devant porter un « CTA gradient » par epics.md et implémenté en `mat-button` simple sans distinction visuelle). Cette story suit le même précédent : le CTA « Clôturer le scénario » est un `mat-button` standard, sans branche `partie.kind` pour varier son style — le raffinement visuel (gradient linéaire / bordure rouge épisodique) est un travail de design system non encore amorcé, à traiter globalement (pas scénario par scénario) dans une future story UI dédiée.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** — `markCourant()` actuel (Story 7.6, post-revue), pattern le plus proche à répliquer pour la partie TOCTOU-safe (branche non verrouillée, `CAMPAGNE_EPISODIQUE`/`ONE_SHOT`) :
```ts
const { count } = await this.prisma.scenario.updateMany({
  where: { id: scenarioId, status: 'A_VENIR' },
  data: { status: 'COURANT' },
});
if (count === 0) {
  throw new ConflictException('Le statut du scénario a changé entretemps, réessayez.');
}
const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenarioId } });
return toDto(updated);
```
`close()` réplique cette structure exacte (pas la branche `$transaction`/`FOR UPDATE` — inutile ici, cf. Dev Notes AD-10), avec `where: { status: 'COURANT' }` et `data: { status: 'PASSE', closedAt: new Date() }`.

**`apps/api/src/scenarios/scenarios.controller.ts`** — pattern de route à répliquer (`markCourant()`) :
```ts
@Patch('scenarios/:id/courant')
markCourant(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser) {
  return this.scenarios.markCourant(scenarioId, user.id);
}
```
Nouveau : `@Patch('scenarios/:id/passe')` appelant `close`.

**`apps/web/src/app/core/scenarios/scenarios.service.ts`** — `markCourant()` actuel, copie exacte pour `close()` (changer uniquement l'URL) :
```ts
async markCourant(scenarioId: string): Promise<ScenarioDto> {
  const result = await firstValueFrom(
    this.http.patch<ScenarioDto>(`${API_BASE}/scenarios/${scenarioId}/courant`, {}, { withCredentials: true }),
  );
  this._changed.update((v) => v + 1);
  return result;
}
```

**`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** — `markCourant()` actuel (lignes 126-137), pattern exact à répliquer pour `close()` :
```ts
protected async markCourant(): Promise<void> {
  const s = this.scenario();
  if (!s || s.status !== 'A_VENIR') return;
  this.markCourantError.set(null);
  try {
    this.scenario.set(await this.scenarios.markCourant(s.id));
  } catch (err) {
    this.markCourantError.set(extractErrorMessage(err, 'Impossible de marquer ce scénario comme Courant.'));
  }
}
```
`isReadOnly = computed(() => this.scenario()?.status === 'PASSE')` (déjà présent, ligne 40) — se recalcule automatiquement dès que `this.scenario.set(...)` reçoit le DTO `PASSE` retourné par `close()`, ce qui masque immédiatement `FieldEditPencil`/textarea/upload sans rechargement (AC6/AC7 satisfaites par un mécanisme déjà en place, aucune logique supplémentaire à écrire côté lecture seule).

**`apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts`** — `openDetail()` actuel (post-Story 7.6) :
```ts
if (this.isMj() && (scenario.status === 'BROUILLON' || scenario.status === 'A_VENIR')) {
  void this.router.navigate(['/parties', this.partieId(), 'scenarios', scenario.id], { state: { scenario } });
  return;
}
this.dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, { data: { scenario } });
```
Modification : ajouter `|| scenario.status === 'COURANT'` à la condition — même corps, `PASSE` continue de tomber dans la branche `ScenarioReadDialog`.

**`apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`/`.html`** — état actuel confirmé par lecture directe : `isRestricted = A_VENIR || BROUILLON`, `isPasse = PASSE` affiche déjà `description`/`durations`/`resumeFin` en plus du contenu commun. **Aucune modification** — sert uniquement de preuve pour la vérification de non-régression AC4.

### Hors scope explicite de cette story (ne pas implémenter)

- Toute exception de `update()` pour `resumeFin` (Epic 8, Story 8.5) — le blocage inconditionnel actuel sur `PASSE` reste tel quel (cf. `[ASSUMPTION]` ci-dessus).
- Toute UI/logique de résumé de fin (`resumeFin`), compte-rendu de séance, ou association journal — Epic 8.
- Styles visuels gradient/`btn-danger-outline` différenciés par `partie.kind` pour le CTA (cf. `[ASSUMPTION]` ci-dessus — `mat-button` simple, cohérent avec le précédent Story 7.6).
- Toute vue MJ dédiée pour `PASSE` — le MJ continue d'utiliser `ScenarioReadDialog` (déjà complet, lecture seule) pour ce statut, comme les joueurs.
- Notification temps réel/websocket lors de la clôture par un autre onglet — le rechargement repose uniquement sur le signal `changed` déjà en place (actif au sein du même onglet applicatif), même limitation documentée par Story 7.6.

### Project Structure Notes

- Aucun nouveau fichier — cette story modifie exclusivement des fichiers déjà créés par les Stories 7.1/7.4/7.5/7.6 (`scenarios.service.ts`/`.spec.ts` API et web, `scenarios.controller.ts`/`.spec.ts`, `scenario-editor.ts`/`.html`/`.spec.ts`, `scenario-timeline.ts`/`.spec.ts`).
- Aucun nouveau type partagé dans `packages/shared` — `ScenarioDto`/`ScenarioStatus`/`closedAt` existants suffisent (tous déjà présents depuis la migration `scenarios_seances_p4`).
- Aucune migration Prisma nécessaire — `closedAt DateTime?` existe déjà sur le modèle `Scenario`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.7] — texte d'origine de la story et 5 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-6, #AD-9, #AD-10] — anti-spoil frontend uniquement, accès MJ-only en écriture, verrou de linéarité (non modifié par cette story).
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `open()`/`markCourant()`/`update()`/`uploadDocument()` lus intégralement ; `update()`/`uploadDocument()` bloquent déjà `PASSE` (AC7), confirmé.
- [Source: apps/api/src/scenarios/scenarios.service.spec.ts:245,336] — tests existants prouvant le blocage `PASSE` déjà en place (AC7, non-régression).
- [Source: apps/api/prisma/schema.prisma:380-399] — `Scenario.closedAt` déjà présent, aucune migration requise.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `markCourant()`/`_changed.update` à répliquer pour `close`.
- [Source: apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, .html] — `isReadOnly`, `extractErrorMessage`, pattern `markCourant()` à répliquer pour `close()`.
- [Source: apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts] — `openDetail()` à étendre (branche MJ existante pour `BROUILLON`/`A_VENIR`).
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts, .html] — confirmé : contenu complet déjà affiché pour `PASSE`, aucune modification (AC4).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md#ScenarioCard] — texte source du CTA gradient/`btn-danger-outline`, non encore implémenté ailleurs dans le codebase (cf. `[ASSUMPTION]`).
- [Source: 7-6-passer-scenario-courant.md] — intelligence de story précédente : pattern `updateMany + count` (correctif TOCTOU de revue) à répliquer directement, convention de nommage `[ASSUMPTION]`, décision de routage `ScenarioTimeline`/`ScenarioEditor` à étendre plutôt qu'à dupliquer.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `close()` réplique directement le pattern `updateMany({ where: { id, status: X } }) + count` + `findUniqueOrThrow` introduit par le correctif de revue de Story 7.6 (TOCTOU) — pas de `$transaction`/`FOR UPDATE`, car `close()` ne contraint que le scénario ciblé lui-même (pas d'unicité inter-scénarios comme `markCourant`/AD-10).
- Test croisé AC5 ajouté dans `describe('close()')` : `close()` sur un scénario `COURANT` d'une Partie `CAMPAGNE_LINEAIRE`, puis `markCourant()` sur un `A_VENIR` de la même Partie, avec `tx.scenario.findFirst` mocké à `null` — documente/verrouille le comportement croisé sans modifier `markCourant`.
- AC4 et AC7 confirmées déjà satisfaites par le code existant (Story 7.1/7.5, AD-6) — aucune modification requise, seulement vérification directe des fichiers (`scenario-read-dialog.ts:30-34`, `scenarios.service.ts` blocages `PASSE` déjà testés).
- `scenario-timeline.spec.ts` : test préexistant `'MJ + clic sur un COURANT/PASSE → ouvre bien ScenarioReadDialog'` scindé en 3 tests (PASSE inchangé, COURANT→navigation MJ, COURANT→dialogue joueur) — même piège que Story 7.6 avec `A_VENIR`.
- Suite complète (après implémentation) : 29 suites / 508 tests API (+11 : 8 `close()` + 1 test croisé AC5 + 1 routage contrôleur + comptage net), 61 suites / 536 tests web (+9 : 1 `scenarios.service` `close` + 5 CTA `scenario-editor` + 3 net `scenario-timeline`). Aucune régression.

### Completion Notes List

- Backend : `ScenariosService.close(scenarioId, mjId)` (nouvel endpoint `PATCH /scenarios/:id/passe`) — transition `COURANT` → `PASSE` MJ-only (`getOwned`), `closedAt` renseigné au serveur. `updateMany({ where: { id, status: 'COURANT' } }) + count` protège contre une double-clôture concurrente (TOCTOU), pas de verrou `FOR UPDATE` (contrainte mono-scénario, pas d'unicité inter-scénarios).
- Frontend service : `ScenariosService.close(scenarioId)` — même convention que `markCourant()` (`_changed` incrémenté).
- `ScenarioEditor` : nouveau CTA « Clôturer le scénario » dans le `<header>`, visible uniquement pour `status === 'COURANT'` ; erreur affichée via `closeError`, réutilisant `extractErrorMessage`. `isReadOnly()` bascule automatiquement à `true` dès que le signal `scenario` reçoit le DTO `PASSE` retourné.
- `ScenarioTimeline` : branche MJ existante (`isMj() && (BROUILLON || A_VENIR)` → navigation) étendue à `COURANT` — le MJ accède désormais à la vue d'édition (avec CTA Clôturer) pour ce statut. `PASSE` et le comportement joueur restent inchangés.
- 7 acceptance criteria couvertes : AC1 (transition + closedAt), AC2 (statut source invalide), AC3 (403 non-MJ), AC4 (anti-spoil PASSE, non-régression vérifiée), AC5 (promotion linéaire après clôture, test croisé), AC6 (CTA + mise à jour réactive), AC7 (blocage édition PASSE, non-régression vérifiée).
- 508/508 tests API + 536/536 tests web passent, aucune régression.

### File List

- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `close()`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — `describe('close()')`, 8 tests + 1 test croisé AC5)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `PATCH scenarios/:id/passe`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mock `close` ajouté, 1 nouveau test de routage)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `close()`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — 1 nouveau test)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — `closeError`, `close()`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié — CTA conditionnel `COURANT`, affichage `closeError`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — mock `close` ajouté, 5 nouveaux tests)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — `openDetail()` étend la garde MJ à `COURANT`)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié — 1 test scindé en 3)

## Change Log

- 2026-07-13 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`, `scenario-editor.ts`/`.html`, `scenario-timeline.ts`, `scenario-read-dialog.ts`/`.html`, `ARCHITECTURE-SPINE.md` AD-6/AD-9/AD-10, `schema.prisma`, intelligence Story 7.6 — confirmation que AC4/AC7 sont déjà satisfaites par le code existant, scope réduit en conséquence).
- 2026-07-13 : Implémentation complète de la Story 7.7 (`ScenariosService.close()` avec protection TOCTOU `updateMany`+count, route `PATCH /scenarios/:id/passe`, service frontend `close`, CTA « Clôturer le scénario » dans `ScenarioEditor`, routage MJ étendu dans `ScenarioTimeline` — 7 ACs couvertes dont 2 vérifiées en non-régression, 508/508 tests API + 536/536 tests web passants, aucune régression).
