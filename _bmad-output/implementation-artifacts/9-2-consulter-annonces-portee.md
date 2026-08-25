---
baseline_commit: c3f8964
---

# Story 9.2: Consulter les annonces selon leur portée

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want voir les annonces qui me concernent, avec leur portée toujours indiquée,
So that je comprends immédiatement à qui s'adresse chaque annonce, sans jamais voir celles d'un scénario auquel je ne participe pas.

## Acceptance Criteria

1. **Given** des annonces publiées à portée « toute la campagne » **When** un membre consulte la page détail de Partie **Then** il voit la liste de ces annonces, triée chronologiquement (plus récentes en premier)
2. **Given** une annonce scopée à un scénario **When** un membre consulte la fiche de ce scénario **Then** l'annonce apparaît en pied de la fiche scénario, triée chronologiquement
3. **Given** une annonce scopée à un scénario `CAMPAGNE_EPISODIQUE` **When** un joueur non participant à ce scénario consulte les annonces **Then** il ne la voit jamais (cohérent avec le fait qu'il n'a de toute façon pas accès à la fiche détaillée de ce scénario)
4. **Given** n'importe quelle annonce affichée **When** elle est rendue **Then** son libellé de portée (« Toute la campagne » / « Ce one-shot » / « Ce scénario ») est toujours visible, jamais implicite
5. **Given** un lecteur d'écran **When** il parcourt une annonce affichée **Then** le libellé de portée fait partie du contenu textuel lu, jamais seulement une couleur d'accent
6. **Given** une annonce scopée à un scénario dont le statut est `BROUILLON`/`A_VENIR` (cas limite : accepté par le backend malgré l'UI qui l'empêche à la création, cf. Story 9.1) **When** un joueur consulte les annonces **Then** cette annonce n'est jamais affichée tant que le scénario visé n'est pas `COURANT`/`PASSE` — la protection anti-spoil vit uniquement dans ce filtrage d'affichage, jamais côté serveur

## Tasks / Subtasks

- [x] **Task 1 — Backend : `GET /parties/:id/announcements`** (AC1, AC2, AC6)
  - [x] TDD : dans `apps/api/src/announcements/announcements.service.spec.ts`, écrire les tests d'abord.
  - [x] Ajouter à `AnnouncementsService` (`apps/api/src/announcements/announcements.service.ts`) :
    ```typescript
    /** Story 9.2 (AD-9/AD-6) : lecture ouverte à tout membre (getViewable), retourne TOUTES les
     * annonces de la Partie sans filtrage de statut de scénario — l'anti-spoil (AC6) est un rendu
     * Angular conditionnel côté consommateur, jamais un filtrage serveur. */
    async findAll(partieId: string, userId: string): Promise<AnnouncementDto[]> {
      await this.parties.getViewable(partieId, userId);
      const announcements = await this.prisma.announcement.findMany({
        where: { partieId },
        orderBy: { createdAt: 'desc' },
      });
      return announcements.map(toDto);
    }
    ```
    (`toDto` est déjà une fonction privée du fichier, réutiliser telle quelle — pas de duplication.)
  - [x] Ajouter à `AnnouncementsController` (`apps/api/src/announcements/announcements.controller.ts`) :
    ```typescript
    @Get()
    findAll(
      @Param('id', ParseUUIDPipe) partieId: string,
      @CurrentUser() user: AuthUser,
    ) {
      return this.announcements.findAll(partieId, user.id);
    }
    ```
  - [x] Tests service : liste triée par `createdAt` desc ; retourne aussi bien les annonces `scenarioId: null` que scopées à un scénario, **sans distinction de statut** (un scénario `BROUILLON`/`A_VENIR` scopé est bien inclus dans la réponse — c'est le frontend qui filtrera, AC6) ; non-membre → `ForbiddenException` propagée par `getViewable`.
  - [x] Test controller : route `GET parties/:id/announcements` délègue à `AnnouncementsService.findAll()` avec `partieId`/`user.id`.

- [x] **Task 2 — Service Angular : `listAll()`** (AC1, AC2)
  - [x] TDD : test d'abord dans `apps/web/src/app/core/announcements/announcements.service.spec.ts` (même fichier que `create()`, Story 9.1).
  - [x] Ajouter à `AnnouncementsService` (`apps/web/src/app/core/announcements/announcements.service.ts`), même style que `create()` déjà en place :
    ```typescript
    listAll(partieId: string): Promise<AnnouncementDto[]> {
      return firstValueFrom(
        this.http.get<AnnouncementDto[]>(`${API_BASE}/parties/${partieId}/announcements`, {
          withCredentials: true,
        }),
      );
    }
    ```

- [x] **Task 3 — Microcopy (3 thèmes) : libellés de portée manquants** (AC4)
  - [x] Dans `apps/web/src/app/core/theme/tones.ts`, la clé `announcement.scope_campaign_label` (« Toute la campagne » / « Toute la forêt » / « Toute la mission ») existe déjà (Story 9.1, lignes ~84, ~227, ~365). Ajouter **2 nouvelles clés** juste après, pour chacun des 3 thèmes :
    - `announcement.scope_oneshot_label` — portée « ce one-shot » (ex. Grimoire : `'Ce one-shot'` ou équivalent thématique)
    - `announcement.scope_scenario_label` — portée « ce scénario », **libellé générique** utilisé quel que soit le scénario visé (ex. Grimoire : `'Ce scénario'`) — ne jamais afficher le titre réel du scénario ici, contrairement au sélecteur du formulaire de publication (Task 6 de la Story 9.1, qui lui affiche les titres réels) : ce sont deux besoins différents (choisir *lequel* vs indiquer *que c'est scopé*).

- [x] **Task 4 — `AnnonceCard` (composant de présentation)** (AC1, AC2, AC4, AC5)
  - [x] TDD : écrire `annonce-card.spec.ts` d'abord.
  - [x] Créer `apps/web/src/app/features/announcements/annonce-card/annonce-card.ts` (+ `.html`), composant standalone, purement présentationnel (aucune logique métier de détermination du libellé — c'est l'appelant qui la calcule et la passe en input, cf. Task 5/6/7) :
    - `readonly announcement = input.required<AnnouncementDto>();`
    - `readonly scopeLabel = input.required<string>();`
    - Template : le texte de l'annonce, le libellé de portée **en texte visible** (pas seulement une classe CSS de couleur — AC5, lecteur d'écran), la date (`announcement().createdAt | date: 'short'`, réutiliser `DatePipe` déjà importé ailleurs dans le projet, ex. `partie-detail.ts`).
    - Style : cf. `DESIGN.md` §7 `AnnonceCard` (fond `surface-bg-2`, bordure 1px, libellé de portée en majuscules, couleur accent) — non bloquant si non pixel-perfect, l'important est la structure sémantique (AC4/AC5).
  - [x] Tests : le texte de l'annonce est rendu ; le libellé de portée passé en input est rendu **en tant que texte** dans le DOM (pas seulement présent dans un attribut/style) ; la date est formatée.

- [x] **Task 5 — `PartieDetail` : annonces « toute la campagne »** (AC1, AC4, AC5)
  - [x] Lire intégralement l'état actuel de `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` et `.html` avant modification (section `announcement-section` MJ-only déjà en place depuis la Story 9.1, `.html:100-113`).
  - [x] `partie-detail.ts` : injecter `AnnouncementsService` (déjà utilisé indirectement par `AnnouncementFormComponent`, mais pas encore par `PartieDetail` lui-même) ; ajouter `protected readonly announcements = signal<AnnouncementDto[]>([]);` et `protected readonly campaignAnnouncements = computed(() => this.announcements().filter((a) => a.scenarioId === null));` (déjà trié par le backend, pas besoin de re-trier) ; charger dans `ngOnInit()` (même bloc `try` que le chargement des polls actifs, cf. `loadActivePolls`) via `this.announcements.set(await this.announcementsSvc.listAll(id).catch(() => []));`.
  - [x] Libellé de portée : `protected readonly campaignScopeLabel = computed(() => this.partie()?.kind === 'ONE_SHOT' ? this.theme.tone()['announcement.scope_oneshot_label'] : this.theme.tone()['announcement.scope_campaign_label']);`
  - [x] `partie-detail.html` : nouvelle section **non conditionnée par `isMj()`** (visible à tout membre), à ajouter après la section `announcement-section` (après `.html:113`, dans l'onglet Détails) :
    ```html
    @if (campaignAnnouncements().length > 0) {
      <section class="announcements-feed">
        @for (a of campaignAnnouncements(); track a.id) {
          <app-annonce-card [announcement]="a" [scopeLabel]="campaignScopeLabel()" />
        }
      </section>
    }
    ```
  - [x] Après publication d'une annonce (Story 9.1 : le panel `AnnouncementFormComponent` reste désormais ouvert après succès, décision de revue de code), rebrancher `(published)` pour recharger `announcements` (pas pour refermer le panel — ce comportement a été retiré en revue) : `<app-announcement-form [partieId]="p.id" (published)="onAnnouncementPublished()" />` avec `protected async onAnnouncementPublished(): Promise<void> { this.announcements.set(await this.announcementsSvc.listAll(this.partie()!.id).catch(() => this.announcements())); }` — sans ce rechargement, l'annonce fraîchement publiée par le MJ n'apparaîtrait dans son propre flux qu'au prochain rechargement de page.
  - [x] Tests `partie-detail.spec.ts` : annonces `scenarioId: null` affichées, triées ; une annonce scopée à un scénario n'apparaît **jamais** dans ce flux (filtrée) ; libellé « Ce one-shot » pour une Partie `ONE_SHOT`, « Toute la campagne » sinon ; visible pour un joueur (pas seulement le MJ) ; publication d'une annonce recharge la liste.

- [x] **Task 6 — `ScenarioEditor` (vue MJ) : annonces scopées au scénario** (AC2, AC4, AC5)
  - [x] Lire intégralement `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` et `.html` avant modification (section `resume-fin` gated par `s.status === 'PASSE'`, `.html:34-53` ; section `participants`, `.html:64-83`).
  - [x] `scenario-editor.ts` : injecter `AnnouncementsService` ; `protected readonly announcements = signal<AnnouncementDto[]>([]);` ; `protected readonly scenarioAnnouncements = computed(() => this.announcements().filter((a) => a.scenarioId === this.scenario()?.id));` ; charger dans le `ngOnInit()` existant (même bloc `try`/`await Promise.all(...)` que le chargement `documents`/`members`, `.ts:104+`) via `this.scenarios.listAll(...)`-like call : `this.announcementsSvc.listAll(s.partieId)`.
  - [x] **Pas de filtrage de statut ici** : `ScenarioEditor` est une vue MJ-only (déjà restreinte à son auteur) — le MJ voit toujours ses propres annonces scopées, quel que soit le statut du scénario (il ne peut pas se spoiler son propre contenu). AC6 protège les *joueurs*, pas le MJ.
  - [x] `scenario-editor.html` : nouvelle section après `<app-seance-list>` (`.html:62`) ou après la section `participants` (`.html:83`) :
    ```html
    @if (scenarioAnnouncements().length > 0) {
      <section class="scenario-announcements">
        <h2>Annonces</h2>
        @for (a of scenarioAnnouncements(); track a.id) {
          <app-annonce-card [announcement]="a" [scopeLabel]="theme.tone()['announcement.scope_scenario_label']" />
        }
      </section>
    }
    ```
    `ThemeToneService` n'est **pas encore injecté** dans `ScenarioEditor` (vérifié) — l'ajouter : `protected readonly theme = inject(ThemeToneService);`, cf. pattern déjà utilisé dans `partie-detail.ts`/`poll-creation.ts`.
  - [x] Tests `scenario-editor.spec.ts` : annonces filtrées au `scenarioId` du scénario affiché (une annonce d'un autre scénario ou `scenarioId: null` n'apparaît jamais ici) ; visible même si `scenario.status === 'BROUILLON'` (pas de gate de statut côté MJ).

- [x] **Task 7 — `ScenarioReadDialog` (vue joueur) : annonces scopées, anti-spoil** (AC2, AC3, AC4, AC5, AC6)
  - [x] Lire intégralement `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` et `.html` avant modification. Point clé déjà en place à réutiliser :
    - `isRestricted` (`.ts:72-75`) = `status === 'A_VENIR' || status === 'BROUILLON'` — le bloc `@else` du template (`.html:6-84`) ne s'affiche **que** si `!isRestricted()`, c'est-à-dire déjà uniquement pour `COURANT`/`PASSE`. **Placer la nouvelle section d'annonces à l'intérieur de ce `@else`** (pas besoin d'un nouveau computed de statut — AC6 est déjà satisfaite par la structure existante).
    - `isParticipating` (`.ts:79-81`) = déjà exactement le test requis par AC3 (« joueur non participant à un scénario `CAMPAGNE_EPISODIQUE` »).
    - `isEpisodique` (`.ts:78`), `isMj` (`.ts:58`).
  - [x] `scenario-read-dialog.ts` : injecter `AnnouncementsService` ; `protected readonly announcements = signal<AnnouncementDto[]>([]);` ; `protected readonly scenarioAnnouncements = computed(() => this.announcements().filter((a) => a.scenarioId === this.scenario().id));` ; `protected readonly canSeeAnnouncements = computed(() => this.isMj() || !this.isEpisodique() || this.isParticipating());` (AC3 : un non-participant d'un scénario épisodique ne voit jamais ses annonces, mais le MJ et les scénarios non-épisodiques ne sont pas concernés par cette restriction) ; charger dans le `ngOnInit()` existant (`.ts:99+`, même bloc que le rechargement du scénario frais) via `this.data.scenario.partieId`.
  - [x] `ThemeToneService` n'est **pas encore injecté** dans `ScenarioReadDialog` (vérifié) — l'ajouter : `protected readonly theme = inject(ThemeToneService);`.
  - [x] `scenario-read-dialog.html` : nouvelle section, **sibling** de la section `resume-fin`/`isPasse()` mais à l'intérieur du `@else` global (donc déjà garanti `COURANT`/`PASSE`, AC6), gardée par `canSeeAnnouncements()` (AC3) — placer par exemple juste avant la fermeture du `@else` (avant `.html:84`) :
    ```html
    @if (canSeeAnnouncements() && scenarioAnnouncements().length > 0) {
      <section class="scenario-announcements">
        <h3>Annonces</h3>
        @for (a of scenarioAnnouncements(); track a.id) {
          <app-annonce-card [announcement]="a" [scopeLabel]="theme.tone()['announcement.scope_scenario_label']" />
        }
      </section>
    }
    ```
  - [x] Tests `scenario-read-dialog.spec.ts` : annonce scopée affichée pour un membre quand `status` est `COURANT`/`PASSE` (AC2) ; **jamais** affichée quand `status` est `A_VENIR`/`BROUILLON` (AC6 — au niveau du dialogue lui-même la restriction `isRestricted()` empêchait déjà tout accès normal, mais tester explicitement que même une annonce présente dans les données ne fuite pas si le composant était malgré tout monté avec un statut restreint) ; joueur non participant d'un scénario `CAMPAGNE_EPISODIQUE` → aucune annonce visible (AC3) ; joueur participant → visible ; MJ → toujours visible quel que soit `isParticipating()`.

- [x] **Task 8 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 0 régression, nouveaux tests verts. **Rappel important (piège Story 9.1, voir Debug Log de cette story et mémoire projet)** : tout nouveau fichier de test API qui importe (même transitivement, via `ScenariosService`/`CharacterService`) `@master-jdr/game-rules` doit commencer par `jest.mock('@master-jdr/game-rules', () => ({ validate: jest.fn(), computeDerived: jest.fn(), pendingLevels: jest.fn(), LEVEL_TABLE: [] }));` — sans quoi ts-jest échoue avec `SyntaxError: Unexpected token 'export'`, une erreur trompeuse qui n'a rien à voir avec le code écrit. `announcements.service.spec.ts` a déjà ce mock (Story 9.1) ; les tests ajoutés dans ce même fichier n'ont rien de plus à faire, mais si un nouveau fichier de test est créé ailleurs et touche `ScenariosService`, ne pas oublier ce mock.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression, nouveaux tests `annonce-card.spec.ts`/`announcements.service.spec.ts`/`partie-detail.spec.ts`/`scenario-editor.spec.ts`/`scenario-read-dialog.spec.ts` verts.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-9** : lecture (`GET /parties/:id/announcements`) = tout membre, via `parties.getViewable(partieId, userId)` — pas de guard NestJS dédié, cohérent avec le reste du module `announcements`/`scenarios`.
- **AD-6** (anti-spoil frontend uniquement, jamais de filtrage serveur) : c'est la règle **la plus importante** de cette story. `AnnouncementsService.findAll()` (backend) retourne **toutes** les annonces d'une Partie sans aucune condition sur le statut du scénario visé — exactement comme `GET /parties/:id/scenarios` retourne déjà tous les scénarios quel que soit leur statut. Le filtrage anti-spoil (AC6) est entièrement porté par `ScenarioReadDialog` (déjà structuré pour ça via `isRestricted()`), jamais par le backend. **Ne jamais ajouter de condition sur `scenario.status` dans `AnnouncementsService.findAll()`** — ce serait une régression architecturale déjà écartée explicitement par AD-2/AD-6 en Story 9.1.
- **Story 9.1 (déjà fait, ne pas dupliquer)** : `AnnouncementDto`/`CreateAnnouncementDto` existent déjà dans `packages/shared/src/index.ts`. `AnnouncementsModule`/`AnnouncementsService`/`AnnouncementsController` existent déjà (`apps/api/src/announcements/`), avec une seule route `POST`. `AnnouncementsService` (web, `apps/web/src/app/core/announcements/announcements.service.ts`) n'a pour l'instant que `create()`. `AnnouncementFormComponent` (`apps/web/src/app/features/announcements/announcement-form/`) est le formulaire de publication (MJ-only, déjà intégré dans `PartieDetail`) — cette story n'y touche pas, sauf pour rebrancher `(published)` afin de recharger la liste de consultation (Task 5).
- **Décision de revue de code Story 9.1 (déjà appliquée)** : le panel de publication (`showAnnouncementForm`) ne se referme plus automatiquement après publication — l'utilisateur le referme lui-même. Ne pas réintroduire une fermeture automatique dans cette story.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/announcements/announcements.service.ts`** (Story 9.1) — `create()` et la fonction privée `toDto()`, déjà exactement ce qu'il faut réutiliser pour `findAll()`.
- **`apps/api/src/announcements/announcements.controller.ts`** (Story 9.1) — une seule route `@Post()`, y ajouter `@Get()`.
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** (+ `.html`) — vue MJ du détail d'un scénario. `isEpisodique`/`participantCharacters` (lignes 82-93) montrent le pattern de filtrage à base de `computed()` à répliquer pour `scenarioAnnouncements`. `ngOnInit()` (ligne 104+) charge déjà `documents`/`members` au montage — y ajouter le chargement des annonces.
- **`apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`** (+ `.html`) — vue joueur en dialogue, lecture seule. `isRestricted`/`isPasse`/`isEpisodique`/`isParticipating` (lignes 72-85) sont **exactement** les computed nécessaires pour satisfaire AC3/AC6 sans rien réinventer — la structure `@else` du template (`.html:6-84`) garantit déjà `COURANT`/`PASSE` uniquement.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** (+ `.html`) — section `announcement-section` (Story 9.1, `.html:100-113`) déjà en place pour la publication ; `loadActivePolls()` (pattern déjà établi Story 8.8) montre comment charger une liste dans `ngOnInit()` avec dégradation silencieuse (`.catch(() => [])`).
- **`apps/web/src/app/core/theme/tones.ts`** — clé `announcement.scope_campaign_label` déjà présente pour les 3 thèmes (Story 9.1, lignes ~84/~227/~365) ; y ajouter les 2 nouvelles clés juste à côté.
- **`_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md`** §7 `AnnonceCard` — spécification visuelle du composant (fond, bordure, libellé de portée en majuscules).

### Hors scope explicite de cette story

- Pagination/limite du nombre d'annonces affichées — aucune AC ne le demande, `findAll()` retourne tout (volume attendu faible, contexte hobby).
- Suppression/édition d'une annonce déjà publiée — non demandé, `Announcement` reste immuable après création dans tout le périmètre actuel (9.1 + 9.2).
- Notification (e-mail, badge) lors d'une nouvelle annonce — Non-Goal PRD explicite (Palier 4 e-mail), déjà noté dans `ARCHITECTURE-SPINE.md` §Deferred.

### Project Structure Notes

- `apps/web/src/app/features/announcements/annonce-card/` : nouveau dossier, sibling de `announcement-form/` déjà créé en Story 9.1.
- Aucun nouveau type partagé requis — `AnnouncementDto` (Story 9.1) suffit intégralement pour cette story.

### References

- `_bmad-output/planning-artifacts/epics.md` (lignes 704-735, Story 9.2)
- `_bmad-output/implementation-artifacts/9-1-publier-annonce-portee-variable.md` (story précédente, contexte architecture direct)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md` (AD-2, AD-6, AD-9)
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md` (§2 « Annonces MJ », §4 « Annonces (`AnnonceCard`) »)
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md` (§7 `AnnonceCard`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

Aucun blocage. Piège connu de la Story 9.1 (jest.mock game-rules) déjà présent dans les fichiers réutilisés, aucun nouveau piège rencontré.

### Completion Notes List

- Task 1 : `AnnouncementsService.findAll()` (backend) + route `GET /parties/:id/announcements` — lecture ouverte à tout membre (`getViewable`), aucune validation de statut (AD-6), triée par `createdAt` desc.
- Task 2 : `AnnouncementsService.listAll()` (web) ajouté, même style que `create()`.
- Task 3 : 2 nouvelles clés de microcopy (`announcement.scope_oneshot_label`/`scope_scenario_label`) × 3 thèmes.
- Task 4 : `AnnonceCard` créé — composant présentationnel pur, libellé de portée en texte visible (AC4/AC5), pas de logique de détermination du libellé.
- Task 5 : `PartieDetail` — section `announcements-feed` (visible à tout membre, pas seulement MJ) filtrée aux annonces `scenarioId: null`, libellé dynamique selon `partie.kind`. `(published)` rebranché sur `onAnnouncementPublished()` pour recharger la liste après publication (le panel reste ouvert, décision de revue Story 9.1 préservée).
- Task 6 : `ScenarioEditor` (vue MJ) — section annonces scopées au scénario, **aucun filtrage de statut** (le MJ voit toujours son propre contenu).
- Task 7 : `ScenarioReadDialog` (vue joueur) — section annonces scopées, placée à l'intérieur du bloc `@else` existant (`isRestricted()` déjà garanti `COURANT`/`PASSE`, AC6 satisfaite sans nouveau computed) et gardée par `canSeeAnnouncements()` = `isMj() || !isEpisodique() || isParticipating()` (AC3).
- Task 8 : 652/652 tests API, 723/723 tests web, `pnpm typecheck` API propre.

### File List

- `apps/api/src/announcements/announcements.service.ts` (modifié — `findAll()` ajoutée)
- `apps/api/src/announcements/announcements.service.spec.ts` (modifié — tests `findAll()`)
- `apps/api/src/announcements/announcements.controller.ts` (modifié — route `GET` ajoutée)
- `apps/api/src/announcements/announcements.controller.spec.ts` (modifié — test `findAll()`)
- `apps/web/src/app/core/announcements/announcements.service.ts` (modifié — `listAll()` ajoutée)
- `apps/web/src/app/core/announcements/announcements.service.spec.ts` (modifié — test `listAll()`)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 2 clés `announcement.scope_oneshot_label`/`scope_scenario_label` × 3 thèmes)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.ts` (nouveau)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.html` (nouveau)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.scss` (nouveau)
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.spec.ts` (nouveau)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — section campagne-wide, rechargement après publication)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — nouveaux tests consultation)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — section annonces scopées, MJ)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — nouveaux tests + provider `AnnouncementsService` sur les 3 blocs `TestBed`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié — section annonces scopées, anti-spoil)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — nouveaux tests + provider `AnnouncementsService` sur les 2 blocs `TestBed`)

### Review Findings

- [x] [Review][Patch] AC2 violation — annonces pas en pied de fiche (ScenarioReadDialog + ScenarioEditor) [apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html:85, apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html:85] — décision utilisateur : ScenarioEditor (vue MJ, pas de contrainte anti-spoil) déplacé en pied de fiche ; ScenarioReadDialog laissé en position actuelle (dernier élément du bloc `@else` gardé par `isRestricted()`) car le déplacer après participants/seance-list le sortirait de la garde AC6 — AC6 prime sur la formulation littérale « en pied » de AC2.
- [x] [Review][Patch] onAnnouncementPublished() — race condition possible sur des rechargements concurrents (réponse périmée écrase l'état frais) [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:441] — corrigé par un compteur de requête (`announcementsReqId`), la réponse périmée est ignorée si une requête plus récente a été émise entre-temps.
- [x] [Review][Patch] AnnonceCard — variables CSS custom (--surface-bg-2, --border-subtle, --radius-card, --accent-2, --text-muted) inexistantes ailleurs dans le code, fallback clair incohérent avec le thème sombre établi (--jdr-*, cf. scenario-status-badge.scss) [apps/web/src/app/features/announcements/annonce-card/annonce-card.scss:1] — corrigé : `--mat-sys-surface-container-high`/`--mat-sys-outline-variant` (fond/bordure, cf. poll-creation.scss) et `--jdr-accent-2`/`--jdr-text-muted` (libellé de portée/date, cf. field-edit-pencil.scss/scenario-status-badge.scss) avec fallbacks sombres cohérents.
- [x] [Review][Patch] makeAnnouncement() dupliqué 4× avec des defaults divergents entre fichiers de test [apps/api/src/announcements/announcements.controller.spec.ts, apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts, apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts] — dédupliqué côté web via une factory partagée `apps/web/src/app/core/announcements/announcement-dto.fixture.ts` (`makeAnnouncementDto`, même pattern que `character-dto.fixture.ts`) réutilisée dans les 3 fichiers de spec web ; le duplicata côté `apps/api` est laissé tel quel (frontière de package distincte, pas de fixture partagée cross apps/api↔apps/web).
- [x] [Review][Defer] Dégradation silencieuse (.catch(() => [])/catch{}) — échec de fetch indiscernable d'un flux vide [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:276, apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts:146, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts:140] — deferred, pre-existing (pattern déjà utilisé par loadActivePolls/characterSvc.listByPartie avant cette story)
- [x] [Review][Defer] Aucun test pour findAll() sur 404/UUID malformé [apps/api/src/announcements/announcements.controller.spec.ts] — deferred, pre-existing (lacune de couverture déjà présente sur les autres routes du module)

## Change Log

- 2026-07-15 : Story créée via `bmad-create-story` (lecture directe de `announcements.service.ts`/`.controller.ts` (Story 9.1), `scenario-editor.ts`/`.html`, `scenario-read-dialog.ts`/`.html`, `partie-detail.ts`/`.html`, `tones.ts`, `packages/shared/src/index.ts`, `epics.md` Story 9.2, `ARCHITECTURE-SPINE.md` AD-2/AD-6/AD-9, story 9.1 complète). Point clé trouvé en analyse : `ScenarioReadDialog` a déjà toutes les guards nécessaires (`isRestricted`/`isParticipating`) pour satisfaire AC3/AC6 sans rien réinventer — la structure du template garantit déjà `COURANT`/`PASSE` uniquement dans la branche où la nouvelle section doit être ajoutée. Décision de conception : un seul endpoint `GET /parties/:id/announcements` (retourne tout, non filtré, AD-6) réutilisé identiquement par les 3 vues consommatrices (`PartieDetail`, `ScenarioEditor`, `ScenarioReadDialog`), chacune filtrant côté client selon son propre besoin — pas d'endpoint dédié par vue, pas d'embarquement dans `ScenarioDto` (éviterait de charger le coût pour chaque scénario d'une liste `findAllForPartie`/`listDrafts`).
- 2026-07-15 : Implémentation complète (bmad-dev-story). 8 tasks, TDD red-green par task. `AnnouncementsService.findAll()` (backend, AD-6 : aucun filtrage de statut) + `listAll()` (web) + `AnnonceCard` (composant présentationnel pur) intégrés dans 3 vues : `PartieDetail` (campagne-wide, visible à tout membre, rechargée après publication), `ScenarioEditor` (scopé, vue MJ sans filtrage de statut), `ScenarioReadDialog` (scopé, anti-spoil via les guards `isRestricted()`/`isParticipating()` déjà existantes). 652/652 tests API + 723/723 tests web, `pnpm typecheck` API propre. Status → `review`.
