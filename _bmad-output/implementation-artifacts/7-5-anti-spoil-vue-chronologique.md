---
baseline_commit: 8883c754d2230c80992dac7aeca94de95ca1f418
---

# Story 7.5: Anti-spoil et vue chronologique

Status: done

## Story

As a joueur,
I want consulter une chronologie de campagne qui distingue clairement ce qui est joué, en cours et à venir sans jamais me spoiler,
so that je sais ce qui m'attend sans perdre la surprise.

## Acceptance Criteria

1. **Given** un membre quelconque d'une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` **When** il consulte la vue chronologique **Then** `GET /parties/:id/scenarios` renvoie **tous** les scénarios de la Partie avec leur contenu complet quel que soit leur statut ou le rôle de l'appelant (AD-6 — aucun filtrage serveur, même principe que `listDocuments`/`getDocumentFile` des Stories 7.1-7.2) ; c'est ce nouvel endpoint, pas `listDrafts` (MJ-only, Story 7.3), qui alimente la timeline joueur.
2. **Given** un scénario `status: A_VENIR` **When** un joueur consulte sa fiche **Then** seuls le titre et la/les date(s) proposée(s) sont rendus à l'écran — description, documents, participants détaillés ne sont jamais présents dans le rendu (rendu conditionnel Angular, AD-6), même si l'API a renvoyé le contenu complet.
3. **Given** un joueur sur desktop (≥768px) **When** il consulte `ScenarioTimeline` **Then** l'orientation est horizontale, le défilement (`overflow-x: auto`) est propre au composant (jamais la page), la molette verticale est convertie en `scrollLeft`, le glisser-déposer souris est supporté, des fondus signalent le contenu à défiler aux deux bords.
4. **Given** un joueur sur mobile (<768px) **When** il consulte `ScenarioTimeline` **Then** l'orientation est verticale, la page défile normalement (aucun scroll interne), la ligne est positionnée à `left: 9px`.
5. **Given** une Partie `CAMPAGNE_EPISODIQUE` avec plusieurs scénarios `COURANT` **When** la timeline s'affiche **Then** les cartes correspondantes s'empilent verticalement au même point de la ligne, jamais sur une deuxième ligne parallèle.
6. **Given** la timeline desktop se charge **When** elle s'affiche pour la première fois **Then** elle s'ancre d'emblée sur le scénario `COURANT`, jamais sur l'extrémité gauche (le passé le plus ancien).
7. **Given** un utilisateur naviguant au clavier (Tab) **When** il parcourt `ScenarioTimeline` **Then** chaque nœud est atteint dans l'ordre chronologique, avec `scroll-into-view` automatique au focus — le défilement molette/glisser-déposer reste un confort, jamais le seul moyen d'accès.
8. **Given** un scénario `status: PASSE` **When** un membre clique dessus **Then** sa description complète et son résumé de fin s'ouvrent en lecture complète (les comptes-rendus de séance par séance sont hors scope de cette story — cf. Dev Notes `[ASSUMPTION]`, aucune donnée de séance n'existe encore, Epic 8).
9. **Given** un scénario `status: COURANT` **When** un membre clique dessus **Then** sa description complète s'affiche (participants et état de sélection de date sont hors scope de cette story — cf. Dev Notes `[ASSUMPTION]`, aucun modèle de séance/participant exploité encore, Epic 8).
10. **Given** les membres d'une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` **When** ils consultent la vue chronologique **Then** seuls les scénarios `PASSE`/`COURANT`/`A_VENIR` apparaissent, dans l'ordre chronologique — les `BROUILLON` en sont exclus (cf. Story 7.3).

*(Source: epics.md Story 7.5 — ACs 8 et 9 amendées dans cette story par rapport au texte verbatim d'epics.md : "participants"/"comptes-rendus de séance" retirés du critère observable et déplacés en note `[ASSUMPTION]`, car aucune donnée de séance/participant n'existe dans `ScenarioDto` ni dans le backend à ce stade — cf. Dev Notes.)*

## Tasks / Subtasks

- [x] **Task 1 — `apps/api/src/scenarios/scenarios.service.ts` + `scenarios.controller.ts`** (AC1)
  - [x] `findAllForPartie(partieId: string, userId: string): Promise<ScenarioDto[]>` — `await this.parties.getViewable(partieId, userId);` (lecture ouverte à tout membre, PAS `getOwned`) puis `this.prisma.scenario.findMany({ where: { partieId }, orderBy: { createdAt: 'asc' } })` — **aucun filtre `status`** (AD-6, contrairement à `listDrafts` qui filtre `BROUILLON`). `orderBy: 'asc'` délibérément (chronologique, passé→futur, pas `desc` comme `listDrafts` qui liste juste les brouillons sans notion de timeline). Map avec `toDto()` existant.
  - [x] Route controller : `@Get('parties/:id/scenarios') findAll(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) { return this.scenarios.findAllForPartie(partieId, user.id); }` — même pattern que `listDrafts`/`listDocuments` (`ParseUUIDPipe`, `CurrentUser`).
  - [x] `scenarios.service.spec.ts` : retourne tous statuts (BROUILLON inclus, aucun filtre serveur — teste explicitement qu'un `BROUILLON` est bien dans le résultat, pour prouver l'absence de filtrage, cf. AD-6) ; utilise `getViewable` et pas `getOwned` (donc accessible à un simple membre non-MJ, pas de 403) ; non-membre → 403 propagé par `getViewable`.
  - [x] `scenarios.controller.spec.ts` : test de routage standard (mock service, vérifie l'appel avec les bons paramètres).

- [x] **Task 2 — `apps/web/src/app/core/scenarios/scenarios.service.ts`** (AC1)
  - [x] `listAll(partieId: string): Promise<ScenarioDto[]>` → `GET ${API_BASE}/parties/${partieId}/scenarios` — même convention que les 8 méthodes existantes (`firstValueFrom`, `withCredentials: true`).
  - [x] `scenarios.service.spec.ts` : un test supplémentaire, même pattern `HttpTestingController` que les 8 existants.

- [x] **Task 3 — `apps/web/src/app/features/scenarios/scenario-status-badge/`** (support visuel pour AC2-AC10)
  - [x] Composant standalone pur (`selector: 'app-scenario-status-badge'`), `readonly status = input.required<ScenarioStatus>()`. Affiche un libellé microcopy joueur (« En cours » pour `COURANT` — jamais littéralement "Courant" en microcopy, cf. Dev Notes `EXPERIENCE.md` §3 ; « À venir », « Passé », « Brouillon ») avec une classe CSS par statut reprenant les tokens DESIGN.md §7 (`--jdr-accent-1` pour `COURANT`, `--color-unknown`/`--jdr-text-muted` pointillé pour `A_VENIR`/`BROUILLON`, `--jdr-text-muted` simple pour `PASSE`) — **aucune nouvelle couleur**, cf. Dev Notes.
  - [x] `scenario-status-badge.spec.ts` : un test par statut (libellé + classe CSS attendue).

- [x] **Task 4 — `apps/web/src/app/features/scenarios/scenario-timeline/`** (AC1, AC2, AC10)
  - [x] Charge tous les scénarios via `scenariosService.listAll(partieId)`. **Exclut côté client tout scénario `BROUILLON`** (jamais rendu, même reçu de l'API — rendu conditionnel systématique, AD-6, même principe que `ScenarioEditor.isReadOnly()` en Story 7.4) ; trie par `createdAt` croissant (ordre chronologique, AC10).
  - [x] Regroupe les scénarios `COURANT` simultanés (épisodique) : calcule une liste de « nœuds » où chaque nœud porte un ou plusieurs scénarios `COURANT` empilés au même point (AC5) — les scénarios `A_VENIR`/`PASSE` restent un nœud = un scénario.
  - [x] Chaque nœud rendu via une carte compacte : titre + `<app-scenario-status-badge>` uniquement (« densité réduite », DESIGN.md §7 `ScenarioTimeline.card`) — **jamais** de description/documents dans la carte elle-même (ceux-ci n'apparaissent que dans la fiche de détail au clic, Task 6).
  - [x] Clic sur un nœud → ouvre `ScenarioReadDialog` (Task 6) via `MatDialog`, pattern `dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, { data: { scenario } })` — même convention que `character-sheet.ts` (`PortraitCropper`/`LevelUpWizard`). **`[DÉVIATION]`** : `EXPERIENCE.md` §4 décrit la fiche scénario comme une page/section riche (mockup `fiche-scenario-20260711.html`, avec participants/séance), pas une modale — un `MatDialog` est un choix délibérément réduit pour cette story vu l'absence de données séance/participant (cf. `[ASSUMPTION]` Dev Notes) ; l'Epic 8, en ajoutant participants/séance, devra probablement faire évoluer ce dialogue vers une page routée à la place — accepté comme limitation temporaire, pas à corriger ici.
  - [x] `scenario-timeline.spec.ts` : charge et exclut les `BROUILLON`, trie chronologiquement, regroupe les `COURANT` simultanés, clic sur un nœud ouvre le dialogue avec le bon scénario.

- [x] **Task 5 — Interactions desktop/mobile de `ScenarioTimeline`** (AC3, AC4, AC6, AC7)
  - [x] Bascule orientation via `inject(BreakpointObserver).observe('(min-width: 768px)')` (`768px` en dur — **aucun token CSS/SCSS n'existe** pour ce seuil dans le code base actuel, cf. Dev Notes ; pattern `toSignal(...observe(...), { initialValue: ... })` identique à `partie-detail.ts` `isDesktop`). **Deux branches de template distinctes** (`@if`/`@else`), pas une même grille réorientée en CSS (DESIGN.md §4, corrige un bug constaté en Discovery).
  - [x] **Desktop (≥768px)** : conteneur `overflow-x: auto` propre au composant (`(wheel)` intercepté : `event.preventDefault()` + `el.scrollLeft += event.deltaY`) ; glisser-déposer souris (`(mousedown)`/`(mousemove)`/`(mouseup)`/`(mouseleave)`, `cursor: grab` → `grabbing` pendant le drag, calcule le delta et applique à `scrollLeft`) ; fondus aux deux bords (overlay CSS `linear-gradient`, visibilité togglée via un `(scroll)` listener qui vérifie `scrollLeft > 0` / `scrollLeft < scrollWidth - clientWidth`). **Aucun précédent dans le code base** (confirmé par recherche — aucun `scrollLeft`/`wheel`/drag-to-scroll existant nulle part dans `apps/web`), à construire intégralement.
  - [x] Ancrage au chargement (AC6) : après le premier rendu (`AfterViewInit` ou effect post-liste), si un nœud `COURANT` existe, `scrollIntoView({ inline: 'center', behavior: 'auto' })` (pas `'smooth'` — un ancrage au chargement doit être instantané, pas animé) ; sinon aucun ancrage particulier (position par défaut, jamais forcé à gauche).
  - [x] Navigation clavier (AC7) : chaque nœud est un élément nativement tabbable (`<button>` ou `tabindex="0"` sur un `<div>` avec `role="button"`), `(focus)="node.scrollIntoView({ inline: 'center', behavior: 'smooth' })"` — Tab natif du navigateur suffit pour l'ordre (les nœuds sont déjà dans l'ordre chronologique du DOM, AC10), aucune logique de navigation personnalisée nécessaire (contrairement à `radio-group-nav.directive.ts`, qui gère une sémantique radiogroup différente et non réutilisable ici, cf. Dev Notes).
  - [x] **Mobile (<768px)** : liste verticale simple, `<ul>`/`<li>` empilés, aucun scroll interne (la page défile normalement) ; ligne positionnée en `position: absolute; left: 9px` sur toute la hauteur du conteneur (pseudo-élément ou `<div>` dédié).
  - [x] `scenario-timeline.spec.ts` (compléments) : bascule desktop/mobile simulée via mock `BreakpointObserver` (même pattern que `partie-detail.spec.ts` `makeBreakpointObserver`) ; ancrage sur le `COURANT` au chargement (assertion sur l'appel `scrollIntoView`) ; focus sur un nœud déclenche `scrollIntoView`. **`Element.prototype.scrollIntoView` n'existe pas dans jsdom** (aucun précédent dans le projet, confirmé) — stubber explicitement `Element.prototype.scrollIntoView = vi.fn()` dans un `beforeEach`, sinon l'appel lève une erreur "not implemented". De même, `scrollWidth`/`clientWidth` valent toujours `0` en jsdom (pas de vrai layout) — la logique des fondus (`scrollLeft > 0` / `scrollLeft < scrollWidth - clientWidth`) doit être testée en fixant ces propriétés via `Object.defineProperty(el, 'scrollWidth', { value: ... })` (et `clientWidth`/`scrollLeft`), jamais par un scroll réel simulé.

- [x] **Task 6 — `apps/web/src/app/features/scenarios/scenario-read-dialog/`** (AC2, AC8, AC9)
  - [x] Composant de dialogue **strictement en lecture seule** — **jamais** de `FieldEditPencil`/bouton d'édition/upload, quel que soit le rôle du viewer (contrairement à `ScenarioEditor`, Story 7.4, qui est MJ-only et toujours accessible en édition hors `PASSE` ; ce nouveau composant est joueur-facing et n'édite jamais rien, cf. Dev Notes `[DÉVIATION]`).
  - [x] Injection **non optionnelle** : `private readonly data = inject(MAT_DIALOG_DATA);` / `private readonly dialogRef = inject(MatDialogRef<ScenarioReadDialog, void>);` — contrairement à `PortraitCropper` (Story 4.5) qui utilise `{ optional: true }` parce qu'il est aussi utilisable hors dialogue (double usage) ; `ScenarioReadDialog` n'est **que** dialogue-only, aucune garde `if (!data)` nécessaire.
  - [x] Reçoit `{ scenario: ScenarioDto }` via `MAT_DIALOG_DATA`. Rendu conditionnel strict par statut (AD-6) :
    - `A_VENIR` : **titre uniquement** + une note explicite (« Date à définir » ou équivalent) — **aucune** description, document, participant, même si l'objet `ScenarioDto` reçu les contient tous (AC2). Aucune vraie date de séance n'existe encore dans le modèle (Epic 8, cf. Dev Notes `[ASSUMPTION]`), ne pas fabriquer de date.
    - `COURANT`/`PASSE` : titre, `<app-scenario-status-badge>`, description complète, `dureeHeures`/`dureeSeances` (texte simple, pas d'édition) ; en plus pour `PASSE` : `resumeFin` (ou message neutre si `null`, ex. « Aucun résumé pour l'instant » — pas d'incitation MJ, ce composant est joueur-facing).
  - [x] `scenario-read-dialog.spec.ts` : rendu minimal pour `A_VENIR` (titre seul, pas de description même non-null), rendu complet pour `COURANT` (sans `resumeFin`), rendu complet + `resumeFin` pour `PASSE`, aucun élément interactif d'édition dans le DOM quel que soit le statut.

- [x] **Task 7 — Intégration `PartieDetail`** (AC1, AC10)
  - [x] Nouvel onglet **« Chronologie »**, visible à **tout membre** (MJ et joueurs, pas de garde `isMj()`) quand `p.kind !== 'ONE_SHOT'` (un ONE_SHOT n'a pas de timeline — un seul scénario, cf. `EXPERIENCE.md` §2 : « Un one-shot n'a pas de timeline »). Contient `<app-scenario-timeline [partieId]="p.id" />`.
  - [x] **⚠️ Position** : ajouter cet onglet **en tout dernier**, après tous les onglets existants (y compris l'onglet MJ-only « Scénario »/« Scénarios » de la Story 7.4) — jamais avant, pour ne décaler aucun index existant (`MJ_INVITATIONS_TAB_INDEX`, cf. régression déjà documentée en Story 7.4). Comme l'onglet est visible à tout rôle (MJ et joueur), le placer en dernier est aussi la position la plus simple à raisonner indépendamment de la combinaison de rôle/desktop qui déterminre les onglets précédents.
  - [x] `partie-detail.spec.ts` : ajouter `ScenariosService.listAll` au mock existant (`makeScenariosService()`) ; tests de présence/absence de l'onglet « Chronologie » selon `p.kind` (présent pour `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`, absent pour `ONE_SHOT`), et présence pour un joueur non-MJ (contrairement aux onglets Story 7.4 qui sont MJ-only).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-6 (rappel, central à cette story)** : l'anti-spoil est **100% un rendu Angular conditionnel**, jamais un filtrage serveur — `GET /parties/:id/scenarios` renvoie TOUJOURS tout, `BROUILLON` inclus, contenu complet inclus. C'est `ScenarioTimeline`/`ScenarioReadDialog` qui décident de ne jamais laisser transiter certaines données vers l'affichage. Ne jamais faire confiance à un filtre serveur qui n'existe pas — vérifié par un test explicite (Task 1) qui prouve qu'un `BROUILLON` est bien retourné par l'API.
- **AD-9 (rappel)** : lecture = tout membre (`getViewable`), jamais `getOwned` pour ce nouvel endpoint — au contraire de `listDrafts` (MJ-only).
- **`[ASSUMPTION]` majeure — périmètre séances/participants/comptes-rendus** : `ScenarioDto` actuel (`packages/shared/src/index.ts`, confirmé par lecture directe du code) ne contient QUE `id, partieId, title, description, status, dureeHeures, dureeSeances, resumeFin, createdAt, closedAt` — **aucune liste de séances, aucun tableau de participants, aucun compte-rendu par séance**. Les modèles Prisma `Seance`/`Inscription`/`ScenarioParticipant` existent dans le schéma mais sont explicitement commentés "Epic 8, non exploité" (`schema.prisma`). Le texte verbatim des ACs d'epics.md pour cette story mentionne "participants", "comptes-rendus de séance", "état de sélection de date" — **ces éléments ne sont pas construits dans cette story** (aucune DTO/endpoint pour ça n'existe), ils sont amendés dans les ACs ci-dessus en note explicite. Ne pas fabriquer de fausses données ; ne pas construire `FillIndicator`/`RetrospectivePanel`/`PollOption` ici — ce sont des composants Epic 8 (8.1-8.6) séparés, dont la Story-writer d'epics.md a délibérément prévu la découpe (cf. Epic 8 dans `epics.md`).
- **Anti-spoil de `A_VENIR`** : sans données de séance, le "date(s) proposée(s)" de l'AC2 originale ne peut pas être affiché avec une vraie date. `ScenarioReadDialog` affiche le titre + une note neutre plutôt qu'une date fabriquée. Ce point sera naturellement complété quand l'Epic 8 ajoutera le lien séance↔scénario (à cette date, `ScenarioReadDialog` n'aura qu'à afficher le champ existant, aucune régression anti-spoil prévisible).
- **Breakpoint 768px** : aucun token CSS/SCSS n'existe dans `apps/web/src/styles.scss` pour ce seuil (confirmé — uniquement les tokens couleur `--jdr-*`/`--color-*` par thème). Toutes les autres parties du code (calendrier, fiche personnage) codent `768px` en dur. Faire de même ici, ne pas introduire de nouveau système de tokens de breakpoint dans cette story (hors scope, changement transverse).
- **Aucun précédent de scroll horizontal molette/glisser-déposer** dans le code base (confirmé par recherche exhaustive — zéro occurrence de `scrollLeft`/`wheel`/drag-to-scroll dans `apps/web/src/app`). Construire intégralement dans cette story, pas de composant à adapter.
- **`radio-group-nav.directive.ts`** (`apps/web/src/app/features/characters/character-wizard/choice-card/`) gère une navigation flèches en sémantique `radiogroup`/`radio` (ArrowRight/Down/Left/Up + `.click()` sur le voisin) — **ne gère pas `Tab` et n'a aucun `scrollIntoView`**. Non réutilisable pour `ScenarioTimeline` (besoin : ordre `Tab` natif + `scrollIntoView` au focus, pas une resélection par flèches). Ne pas essayer de l'adapter — un simple `(focus)="scrollIntoView(...)"` par nœud suffit, `Tab` natif du navigateur gère déjà l'ordre puisque les nœuds sont dans l'ordre chronologique du DOM.
- **`RosterRail`/`RosterStrip`** (`apps/web/src/app/features/parties/{roster-rail,roster-strip}/`) : précédent de "bascule de composant à un breakpoint via `BreakpointObserver`" (utilisé par `partie-detail.ts`, seuil `1024px`, pas `768px`) — le **pattern** `BreakpointObserver` + branches distinctes est un bon précédent structurel à suivre, mais **aucune mécanique de scroll** (ni molette, ni glisser-déposer, ni fondus, ni ancrage) n'existe dans ces composants — ils font un simple `overflow-x: auto` sans traitement additionnel. Ne pas s'attendre à réutiliser leur logique de scroll, seulement le pattern de bascule responsive.
- **`ScenarioEditor` (Story 7.4)** reste MJ-only, inchangé par cette story — `ScenarioReadDialog` est un **nouveau** composant séparé, jamais un mode "lecture seule" de `ScenarioEditor`, car `ScenarioEditor` affiche toujours les contrôles d'édition (`FieldEditPencil`) sauf si `status === 'PASSE'` — un joueur ne doit **jamais** voir ces contrôles, quel que soit le statut (contrainte plus stricte que celle de `ScenarioEditor`, qui ne connaît que le statut, pas le rôle du viewer). Ne pas toucher aux fichiers de Story 7.4 dans cette story.
- **Microcopy** : `COURANT` s'affiche « En cours » (jamais littéralement "Courant") en microcopy joueur, cf. `EXPERIENCE.md` §3 — "Courant" reste le nom technique du statut (glossaire PRD), pas la chaîne affichée.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** — pattern exact de `listDrafts` à contraster (nouveau : `getViewable` pas `getOwned`, pas de filtre `status`, `orderBy: 'asc'` pas `'desc'`) :
```ts
async listDrafts(partieId: string, mjId: string): Promise<ScenarioDto[]> {
  await this.parties.getOwned(partieId, mjId);
  const scenarios = await this.prisma.scenario.findMany({
    where: { partieId, status: 'BROUILLON' },
    orderBy: { createdAt: 'desc' },
  });
  return scenarios.map(toDto);
}
```
Nouveau (`findAllForPartie`) :
```ts
async findAllForPartie(partieId: string, userId: string): Promise<ScenarioDto[]> {
  await this.parties.getViewable(partieId, userId);
  const scenarios = await this.prisma.scenario.findMany({
    where: { partieId },
    orderBy: { createdAt: 'asc' },
  });
  return scenarios.map(toDto);
}
```

**`apps/api/src/scenarios/scenarios.controller.ts`** — pattern de route à répliquer (`ParseUUIDPipe`, `CurrentUser`) :
```ts
@Get('parties/:id/scenarios/drafts')
listDrafts(
  @Param('id', ParseUUIDPipe) partieId: string,
  @CurrentUser() user: AuthUser,
) {
  return this.scenarios.listDrafts(partieId, user.id);
}
```
Nouveau : `@Get('parties/:id/scenarios')` avec les mêmes paramètres, appelant `findAllForPartie`.

**`apps/api/src/scenarios/scenarios.service.spec.ts`** — pattern de test (`listDrafts()`) à répliquer :
```ts
describe('listDrafts()', () => {
  it('retourne uniquement les scénarios BROUILLON de la Partie (AC2)', async () => {
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.scenario.findMany.mockResolvedValue([]);
    await service.listDrafts('p1', 'mj1');
    expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    expect(prisma.scenario.findMany).toHaveBeenCalledWith({
      where: { partieId: 'p1', status: 'BROUILLON' },
      orderBy: { createdAt: 'desc' },
    });
  });
  it('non-MJ → 403 propagé par getOwned, aucune lecture', async () => {
    parties.getOwned.mockRejectedValue(new ForbiddenException());
    await expect(service.listDrafts('p1', 'stranger')).rejects.toThrow(ForbiddenException);
    expect(prisma.scenario.findMany).not.toHaveBeenCalled();
  });
});
```
Pour `findAllForPartie` : même structure mais avec `parties.getViewable` (pas `getOwned`), `orderBy: { createdAt: 'asc' }`, sans filtre `status` — **ajouter un test explicite qui inclut un scénario `BROUILLON` dans le mock retourné par `prisma.scenario.findMany` et vérifie qu'il apparaît bien dans le résultat** (preuve qu'aucun filtre serveur n'est appliqué, AD-6).

**`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** — pattern `BreakpointObserver` à répliquer pour `ScenarioTimeline` :
```ts
private readonly breakpointObserver = inject(BreakpointObserver);
private static readonly DESKTOP_QUERY = '(min-width: 1024px)';
protected readonly isDesktop = toSignal(
  this.breakpointObserver.observe(PartieDetail.DESKTOP_QUERY).pipe(map((r) => r.matches)),
  { initialValue: this.breakpointObserver.isMatched(PartieDetail.DESKTOP_QUERY) },
);
```
Pour `ScenarioTimeline` : même pattern, mais `'(min-width: 768px)'`.

**`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`** — pattern `MatDialog` à répliquer pour `ScenarioReadDialog` :
```ts
private readonly dialog = inject(MatDialog);
const ref = this.dialog.open<PortraitCropper, PortraitCropperData, PortraitCropResult | null>(
  PortraitCropper,
  { data: { characterId: c.id } },
);
```
Pour `ScenarioReadDialog` : `this.dialog.open<ScenarioReadDialog, ScenarioReadDialogData, void>(ScenarioReadDialog, { data: { scenario } })`.

**`apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`** — mock `BreakpointObserver` existant (`makeBreakpointObserver`) à répliquer pour les tests desktop/mobile de `ScenarioTimeline` :
```ts
function makeBreakpointObserver(desktop: boolean) {
  return {
    observe: () => of({ matches: desktop, breakpoints: {} }),
    isMatched: () => desktop,
  };
}
```

### Design tokens (DESIGN.md §2/§7 → mécanisme réel)

Réutiliser exactement (aucune nouvelle valeur) :
- `COURANT` : `--jdr-accent-1` (couleur + bordure), fond `rgba(var(--jdr-accent-1-rgb), 0.15)`.
- `A_VENIR`/`BROUILLON` : `--color-unknown`/`--jdr-text-muted`, bordure pointillée (`border-style: dashed`) — même traitement visuel que `AvailabilityBadge` UNKNOWN.
- `PASSE` : `--jdr-text-muted`, léger `opacity: 0.55` sur la carte (cohérent avec `DayCell.states.past` à `0.45`, un peu moins atténué car le contenu reste la destination principale de clic).
- Fondus de bord de timeline / lien de scroll : `--jdr-accent-2`.

### Hors scope explicite de cette story (ne pas implémenter)

- `FillIndicator`, `RetrospectivePanel`, `AnnonceCard`, `PollOption` intégré à une fiche scénario — Epic 8/9, aucune donnée backend disponible.
- Participants (`CharacterSummaryCard` dans une fiche scénario) — nécessite `ScenarioParticipant`/dérivation `Membership`, Epic 8.
- Comptes-rendus de séance, résumé de fin éditable côté MJ depuis cette vue — Story 8.4/8.5, cette story est joueur-facing en lecture seule uniquement.
- Bouton MJ "Clôturer le scénario"/"Marquer comme Courant" — Stories 7.6/7.7.
- Toute modification de `ScenarioEditor`, `ScenarioDetail`, `ScenarioDrafts`, `ScenarioOneShotTab` (Story 7.4) — cette story n'ajoute que de nouveaux fichiers + l'intégration `PartieDetail`.

### Project Structure Notes

- Nouveaux fichiers dans `apps/web/src/app/features/scenarios/{scenario-status-badge,scenario-timeline,scenario-read-dialog}/` — `scenario-timeline/` et `scenario-status-badge/` conformes au source tree de l'architecture (`architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md`).
- **Écart avec le source tree** : `ARCHITECTURE-SPINE.md` désignait à l'origine `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts` comme la fiche scénario joueur ("ScenarioCard/RetrospectivePanel (Courant/Passé)"). Ce chemin a depuis été repris par la Story 7.4 pour un tout autre usage — un wrapper MJ-only autour de `ScenarioEditor`, routé depuis `ScenarioDrafts`, sans branche lecture seule joueur. Cette story crée donc `scenario-read-dialog/` (nouveau chemin, absent du source tree d'origine) comme équivalent joueur, plutôt que de retoucher `scenario-detail/` (Story 7.4, hors scope). Le source tree de l'architecture sera à corriger a posteriori pour refléter ce chemin réel — pas un blocage pour cette story.
- Aucun nouveau type partagé nécessaire dans `packages/shared` — `ScenarioDto` existant suffit au périmètre de cette story (cf. `[ASSUMPTION]` ci-dessus).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.5: Anti-spoil et vue chronologique] — ACs, amendées pour le périmètre séances/participants (voir note en tête de section Acceptance Criteria).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md#4, #7] — spec responsive `ScenarioTimeline`, `ScenarioStatusBadge`, tokens couleur.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md#4, #5, #6] — comportement clic par statut, State Patterns anti-spoil, primitives d'interaction (scroll/clavier).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-6, #AD-9, Source tree] — anti-spoil frontend-only, lecture ouverte à tout membre, arborescence des nouveaux fichiers.
- [Source: apps/api/src/scenarios/scenarios.service.ts, scenarios.controller.ts, scenarios.service.spec.ts] — patterns `listDrafts`/`getViewable`/tests à répliquer pour le nouvel endpoint.
- [Source: apps/api/prisma/schema.prisma] — confirmation que `Seance`/`Inscription`/`ScenarioParticipant` sont "Epic 8, non exploité" — justifie le périmètre réduit de cette story.
- [Source: packages/shared/src/index.ts] — `ScenarioDto` actuel, confirmé suffisant pour cette story.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts, partie-detail.spec.ts] — pattern `BreakpointObserver`/`toSignal`, mock `makeBreakpointObserver`.
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts] — pattern `MatDialog.open<...>`.
- [Source: apps/web/src/app/features/characters/character-wizard/choice-card/radio-group-nav.directive.ts] — confirmé non réutilisable pour la navigation clavier de `ScenarioTimeline`.
- [Source: apps/web/src/app/features/parties/roster-rail/, roster-strip/] — précédent de bascule responsive via `BreakpointObserver` (pattern réutilisable), confirmé sans mécanique de scroll avancée (non réutilisable pour ça).
- [Source: apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts] — confirmé MJ-only, non réutilisé/modifié par cette story ; `ScenarioReadDialog` est un composant séparé.
- [Source: apps/web/src/styles.scss] — confirmé : aucun token de breakpoint 768px n'existe, à coder en dur comme le reste du projet.

### Review Findings

Revue adversariale parallèle (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 21 findings bruts, fusionnés/dédoublonnés à 17 findings uniques : 0 décision nécessitant l'utilisateur, 9 patches, 4 différés, 4 rejetés comme bruit/faux positifs/conformes à l'AC.

- [x] [Review][Patch] `onWheel` ignore `deltaX` (swipe horizontal trackpad) et ne réagit qu'à `deltaY` — le geste trackpad natif devient inopérant [scenario-timeline.ts:128-134] — corrigé : privilégie `deltaX` quand non nul, retombe sur `deltaY` sinon.
- [x] [Review][Patch] Glisser-déposer : aucun listener `document`/`window` pour `mouseup`/`mousemove` — relâcher la souris hors du `track` laisse `dragging` bloqué à `true` [scenario-timeline.ts:147-169] — corrigé : `@HostListener('document:mouseup')`/`@HostListener('document:mousemove')` remplacent les bindings locaux `(mousemove)`/`(mouseup)`/`(mouseleave)`.
- [x] [Review][Patch] `onMouseDown` n'appelle pas `event.preventDefault()` — sélection de texte native concurrente au glisser-déposer personnalisé [scenario-timeline.ts:onMouseDown] — corrigé.
- [x] [Review][Patch] `fadeStart`/`fadeEnd` ne s'initialisent jamais au chargement (seulement sur `scroll`/`wheel`) — le fondu de fin n'apparaît pas tant que l'utilisateur n'a pas déjà interagi, alors que le contenu déborde dès le rendu initial [scenario-timeline.ts:updateFades] — corrigé : `updateFades()` appelé dans l'`effect()` dès que les données/le DOM sont prêts.
- [x] [Review][Patch] Un simple clic après un léger glissé ouvre quand même `ScenarioReadDialog` (aucun seuil de distance ne distingue clic de glissé) [scenario-timeline.ts:onMouseDown/onMouseMove/openDetail] — corrigé : seuil de 4px (`dragMoved`), `openDetail` no-op si un glissé a eu lieu.
- [x] [Review][Patch] L'`effect()` d'ancrage sur `COURANT` n'a pas de garde "déjà ancré une fois" — tout recalcul futur de `nodes()`/`isDesktop()` réenclenche un `scrollIntoView`, contrairement à l'intention de l'AC6 ("à son premier affichage") [scenario-timeline.ts:constructor effect] — corrigé : flag `anchoredOnce`.
- [x] [Review][Patch] `ScenarioReadDialog` n'a aucune garde défensive pour `BROUILLON` — un futur appelant qui n'exclurait pas les brouillons côté client afficherait la description complète sans protection anti-spoil (seul `ScenarioTimeline` filtre aujourd'hui, mais `ScenarioReadDialog` ne se protège pas lui-même) [scenario-read-dialog.ts:isAVenir/isPasse] — corrigé : `isAVenir` renommé `isRestricted`, couvre `A_VENIR` et `BROUILLON`.
- [x] [Review][Patch] Aucune activation clavier de `ScenarioReadDialog` — le nœud est atteint au Tab (AC7 satisfait à la lettre) mais rien n'ouvre le dialogue au clavier (`Enter`/`Espace`), seul `(click)` sur `.card` déclenche `openDetail` — lacune d'accessibilité au-delà du texte littéral de l'AC7 [scenario-timeline.html] — corrigé : `.card` devient `tabindex="0" role="button"` avec `(keydown)` Entrée/Espace.
- [x] [Review][Patch] Dev Agent Record : le décompte annoncé (« `scenarios.service` +2 ») est inexact — le diff n'ajoute qu'1 test à `apps/web/.../scenarios.service.spec.ts` (`listAll`), pas 2 — correction de la note, pas de code — corrigé.

- [x] [Review][Defer] `findAllForPartie` n'a ni pagination ni limite — charge l'historique complet de scénarios à chaque affichage de l'onglet [scenarios.service.ts:findAllForPartie] — deferred, aucun AC/NFR ne le requiert, cohérent avec le reste du projet (mêmes constats déjà différés sur d'autres endpoints)
- [x] [Review][Defer] `openDetail` transmet l'objet `ScenarioDto` mis en cache localement (chargé une fois via `listAll`) plutôt que de le re-fetcher par ID — si le contenu change côté serveur entre le chargement de la timeline et le clic, le dialogue affiche des données obsolètes [scenario-timeline.ts:openDetail] — deferred, même limitation que `ScenarioDetail` en Story 7.4 (aucun `GET /scenarios/:id` n'existe), à revisiter si cet endpoint est ajouté
- [x] [Review][Defer] Aucun gestionnaire tactile dédié (`touchstart`/`touchmove`) pour le glisser-déposer desktop — une tablette ≥768px (ex. iPad paysage) n'a que le scroll tactile natif du navigateur sur `overflow-x: auto` (fonctionne nativement, mais sans les fondus/ancrage réactifs au geste) [scenario-timeline.ts] — deferred, amélioration future, pas un blocage (le scroll natif reste fonctionnel)
- [x] [Review][Defer] `ScenarioTimeline` ne réagit pas si `partieId()` change sans destruction du composant [scenario-timeline.ts:ngOnInit] — deferred, aucun chemin de déclenchement dans le câblage actuel (le composant est détruit/recréé à chaque navigation de Partie)



### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Aucune donnée séance/participant/compte-rendu construite — confirmé absent du backend/`ScenarioDto` avant de coder (cf. `[ASSUMPTION]` Dev Notes) ; ACs 8/9 amendées en conséquence, `ScenarioReadDialog` n'affiche que les champs réellement disponibles.
- `ScenarioReadDialog` construit avant `ScenarioTimeline` dans l'ordre d'implémentation réel (bien que Task 6 soit numérotée après Task 4/5) — dépendance directe : `ScenarioTimeline.openDetail()` importe et ouvre `ScenarioReadDialog`, impossible de compiler/tester Task 4 sans elle. Les deux sont marquées complètes seulement une fois leurs specs respectives passantes.
- Ancrage sur `COURANT` implémenté via `effect()` dans le constructeur (pas `ngAfterViewInit` + `effect()`, qui lève `NG0203` hors contexte d'injection) — réagit naturellement à l'arrivée asynchrone des données après le premier rendu.
- Suite complète (avant revue) : 61 suites / 499 tests web (dont `scenario-status-badge` 4, `scenario-read-dialog` 6, `scenario-timeline` 8, `scenarios.service` +1 — correction : la note initiale annonçait +2 par erreur —, `partie-detail` +3), 29 suites / 487 tests API (dont `findAllForPartie` +3). Aucune régression.

### Completion Notes List

- Backend : `ScenariosService.findAllForPartie` (nouvel endpoint `GET /parties/:id/scenarios`) — lecture ouverte à tout membre (`getViewable`), aucun filtre `status` (AD-6, vérifié par un test qui prouve qu'un `BROUILLON` est bien retourné), tri chronologique croissant.
- Frontend service : `ScenariosService.listAll(partieId)`.
- `ScenarioStatusBadge` : 4 états, microcopy joueur (« En cours » pour `COURANT`), tokens couleur existants réutilisés tels quels.
- `ScenarioReadDialog` : dialogue lecture seule (jamais de contrôle d'édition, injection `MAT_DIALOG_DATA`/`MatDialogRef` non optionnelle), rendu anti-spoil strict par statut (A_VENIR = titre seul ; COURANT/PASSE = complet ; PASSE + résumé si présent).
- `ScenarioTimeline` : charge via `listAll`, exclut les `BROUILLON` côté client, trie chronologiquement, fusionne les `COURANT` simultanés en un nœud empilé, bascule desktop (molette→scroll, glisser-déposer, fondus, ancrage sur `COURANT`, clavier+`scrollIntoView`) / mobile (liste verticale, ligne `left: 9px`) via `BreakpointObserver` (768px en dur, aucun token existant).
- `PartieDetail` : nouvel onglet « Chronologie » visible à tout membre (MJ et joueurs) pour `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`, absent pour `ONE_SHOT`, placé en tout dernier (aucun impact sur `MJ_INVITATIONS_TAB_INDEX`).
- 10 acceptance criteria couvertes : AC1 (endpoint complet non filtré), AC2 (anti-spoil A_VENIR), AC3/AC4 (responsive desktop/mobile), AC5 (empilement COURANT), AC6 (ancrage), AC7 (clavier), AC8/AC9 (détail PASSE/COURANT, périmètre réduit documenté), AC10 (exclusion BROUILLON + ordre chronologique).
- 499/499 tests web + 487/487 tests API passent, aucune régression.

### File List

- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `findAllForPartie`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — 3 nouveaux tests)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `GET parties/:id/scenarios`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — test de routage)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `listAll`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — test supplémentaire)
- `apps/web/src/app/features/scenarios/scenario-status-badge/scenario-status-badge.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-status-badge/scenario-status-badge.html` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-status-badge/scenario-status-badge.scss` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-status-badge/scenario-status-badge.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.scss` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.scss` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (nouveau)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — import `ScenarioTimeline`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — nouvel onglet « Chronologie »)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — `ScenariosService.listAll` mocké, 3 nouveaux tests)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié en revue — deltaX, listeners document, seuil clic/glissé, garde ancrage unique, activation clavier)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html` (modifié en revue — bindings document déplacés, `.card` focusable/`role="button"`/`(keydown)`)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié en revue — 9 nouveaux tests)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié en revue — `isRestricted` couvre aussi `BROUILLON`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié en revue)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié en revue — 1 nouveau test)

## Change Log

- 2026-07-13 : Implémentation complète de la Story 7.5 (endpoint `GET /parties/:id/scenarios`, `ScenarioStatusBadge`, `ScenarioTimeline` responsive, `ScenarioReadDialog`, intégration `PartieDetail` — 10 ACs couvertes, 499/499 tests web + 487/487 tests API passants).
- 2026-07-13 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 9 patches appliqués (trackpad `deltaX`, listeners `document` pour le glisser-déposer, `preventDefault` sur `mousedown`, initialisation des fondus au chargement, seuil clic/glissé, garde d'ancrage unique sur `COURANT`, garde défensive `BROUILLON` dans `ScenarioReadDialog`, activation clavier Entrée/Espace, correction du décompte de tests dans le Dev Agent Record), 4 items différés documentés dans `deferred-work.md`. 509/509 tests web passants après correctifs (61 suites, +10 tests).
