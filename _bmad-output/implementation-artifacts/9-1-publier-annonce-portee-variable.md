---
baseline_commit: b00ef4c
---

# Story 9.1: Publier une annonce à portée variable

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want publier une annonce texte libre scopée à toute ma campagne, à un one-shot, ou à un scénario précis,
So that je diffuse une information à la bonne audience sans polluer les joueurs non concernés.

## Acceptance Criteria

1. **Given** je suis MJ d'une Partie **When** je publie une annonce sans `scenarioId` **Then** une `Announcement` (`partieId`, `scenarioId: null`, `text`) est créée — portée « toute la campagne »/« ce one-shot »
2. **Given** je suis MJ d'une Partie **When** je publie une annonce avec un `scenarioId` appartenant à ma Partie **Then** l'`Announcement` est créée avec ce `scenarioId` — portée limitée à ce scénario
3. **Given** un `scenarioId` n'appartenant pas à la Partie visée **When** le MJ tente de publier une annonce scopée dessus **Then** la requête est rejetée (validation d'appartenance, AD-2)
4. **Given** le formulaire de publication **When** le MJ choisit une portée « scénario » **Then** seuls les scénarios `COURANT`/`PASSE` de sa Partie sont proposés dans le sélecteur — jamais un `BROUILLON`/`A_VENIR` (fuiterait indirectement son existence)
5. **Given** un texte d'annonce vide **When** le MJ tente de publier **Then** le bouton de publication reste désactivé — pas de soumission suivie d'une erreur après coup
6. **Given** un joueur non-MJ **When** il tente de publier une annonce **Then** la requête échoue en 403
7. **Given** le backend reçoit malgré tout une annonce scopée à un scénario `BROUILLON`/`A_VENIR` (ex. appel direct à l'API) **When** la requête est traitée **Then** elle est acceptée sans validation de statut — même philosophie qu'AD-6, c'est le filtrage d'affichage (Story 9.2) qui protège l'anti-spoil, jamais le backend

## Tasks / Subtasks

- [x] **Task 1 — Types partagés** (AC1, AC2, AC3, AC7)
  - [x] Dans `packages/shared/src/index.ts`, ajouter sous une nouvelle section `// ─── Epic 9 : Annonces MJ ──` (après la section `// ─── Palier 4 (suite) : Scénarios ──`) :
    ```typescript
    export interface AnnouncementDto {
      id: string;
      partieId: string;
      scenarioId: string | null;
      text: string;
      createdAt: string;
    }

    export interface CreateAnnouncementDto {
      text: string;
      scenarioId?: string;
    }
    ```

- [x] **Task 2 — `ScenariosService` : validation d'appartenance d'un scénario à une Partie (AD-2)** (AC3, AC7)
  - [x] TDD : dans `apps/api/src/scenarios/scenarios.service.spec.ts`, écrire les tests d'abord (rouge), puis l'implémentation (vert).
  - [x] Ajouter une méthode publique à `ScenariosService` (`apps/api/src/scenarios/scenarios.service.ts`), utilisée par le futur `AnnouncementsService` (AD-2 : « `ScenariosModule` (validation qu'un `scenarioId` de portée existe bien et appartient à la Partie visée) ») :
    ```typescript
    /** Story 9.1 (AD-2) : valide qu'un scenarioId existe et appartient à la Partie donnée — utilisé
     * par AnnouncementsService pour la portée d'une annonce. AUCUNE validation de statut ici
     * (contrairement à uploadDocument() qui bloque PASSE) : AD-2 est explicite, une annonce peut
     * viser un scénario BROUILLON/A_VENIR, seul le rendu frontend (Story 9.2) protège l'anti-spoil. */
    async verifyScenarioBelongsToPartie(scenarioId: string, partieId: string): Promise<void> {
      const scenario = await this.prisma.scenario.findUnique({ where: { id: scenarioId } });
      if (!scenario) throw new NotFoundException('Scénario introuvable');
      if (scenario.partieId !== partieId) {
        throw new BadRequestException("Ce scénario n'appartient pas à cette Partie");
      }
    }
    ```
  - [x] Tests : scénario existant + appartient à la Partie → résout sans erreur ; scénario introuvable → `NotFoundException` ; scénario d'une autre Partie → `BadRequestException` ; scénario `BROUILLON`/`A_VENIR` → résout **sans erreur** (test explicite couvrant AC7, à ne pas oublier — c'est la divergence délibérée avec `uploadDocument()`).

- [x] **Task 3 — `AnnouncementsModule` (backend)** (AC1, AC2, AC3, AC5, AC6, AC7)
  - [x] TDD : écrire `announcements.service.spec.ts` puis `announcements.controller.spec.ts` avant l'implémentation.
  - [x] Créer `apps/api/src/announcements/dto/create-announcement.dto.ts` :
    ```typescript
    import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

    export class CreateAnnouncementDto {
      @IsString()
      @MinLength(1)
      text!: string;

      @IsOptional()
      @IsUUID()
      scenarioId?: string;
    }
    ```
    (AC5 : le bouton de publication désactivé côté frontend est la garde principale contre un texte vide — `@MinLength(1)` côté backend est une garde défensive de dernier recours, pas le mécanisme UX.)
  - [x] Créer `apps/api/src/announcements/announcements.service.ts` :
    - Constructeur injecte `PrismaService`, `PartiesService`, `ScenariosService`.
    - `async create(partieId: string, mjId: string, dto: CreateAnnouncementDto): Promise<AnnouncementDto>` :
      1. `await this.parties.getOwned(partieId, mjId)` — AD-9, écriture MJ-only (couvre AC6 : 403 propagé par `getOwned` pour un non-MJ).
      2. Si `dto.scenarioId` défini : `await this.scenarios.verifyScenarioBelongsToPartie(dto.scenarioId, partieId)` (Task 2 — couvre AC2/AC3/AC7).
      3. `this.prisma.announcement.create({ data: { partieId, scenarioId: dto.scenarioId ?? null, text: dto.text } })` (couvre AC1 : `scenarioId` absent → `null`).
      4. Retourner le DTO mappé (`toDto` local, même style que `toDocumentDto` dans `scenarios.service.ts`).
  - [x] Créer `apps/api/src/announcements/announcements.controller.ts` :
    ```typescript
    @UseGuards(AuthenticatedGuard)
    @Controller('parties/:id/announcements')
    export class AnnouncementsController {
      constructor(private readonly announcements: AnnouncementsService) {}

      @Post()
      create(
        @Param('id', ParseUUIDPipe) partieId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateAnnouncementDto,
      ) {
        return this.announcements.create(partieId, user.id, dto);
      }
    }
    ```
  - [x] Créer `apps/api/src/announcements/announcements.module.ts` (**pas de `forwardRef` nécessaire** — le sens de dépendance est unique, `AnnouncementsModule → ScenariosModule`, `ScenariosModule` n'a besoin de rien en retour, contrairement au cycle `ScenariosModule ↔ PollModule` de la Story 8.8) :
    ```typescript
    @Module({
      imports: [PartiesModule, ScenariosModule],
      controllers: [AnnouncementsController],
      providers: [AnnouncementsService],
      exports: [AnnouncementsService],
    })
    export class AnnouncementsModule {}
    ```
  - [x] Enregistrer `AnnouncementsModule` dans `apps/api/src/app.module.ts` (imports), à côté de `ScenariosModule`.
  - [x] Tests service : AC1 (pas de `scenarioId` → `Announcement` créée avec `scenarioId: null`) ; AC2 (`scenarioId` valide de la Partie → créée avec ce `scenarioId`) ; AC3 (`scenarioId` d'une autre Partie → rejet, propagé par `verifyScenarioBelongsToPartie`, aucune écriture) ; AC7 (`scenarioId` d'un scénario `BROUILLON`/`A_VENIR` de la même Partie → **acceptée**, aucune validation de statut) ; non-MJ → `ForbiddenException` propagée par `getOwned`, aucune écriture.
  - [x] Tests controller : route `POST parties/:id/announcements` délègue correctement à `AnnouncementsService.create()` avec `partieId`/`user.id`/`dto`.

- [x] **Task 4 — Microcopy (3 thèmes)** (AC1, AC4)
  - [x] Dans `apps/web/src/app/core/theme/tones.ts`, ajouter pour chacun des 3 thèmes (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`), dans le style déjà établi de chaque thème (cf. `partie.scheduling_title`/`cta.find_date` pour le registre de vocabulaire propre à chaque thème) :
    - `announcement.scope_campaign_label` — option de portée « toute la campagne » du sélecteur (ex. Grimoire : `'Toute la campagne'`, cohérent avec `sessions.annonce_scope_partie` de `EXPERIENCE.md`)
    - `announcement.publish_cta` — libellé du bouton de publication (ex. Grimoire : `'Publier l'annonce'` ou équivalent thématique, à composer dans le registre du thème comme les CTA existants)
    - `announcement.text_placeholder` — placeholder du champ texte libre (ex. Grimoire : `'Écrire une annonce...'`)
    - `announcement.published_notice` — confirmation après publication (ex. Grimoire : `'Annonce publiée.'`)
  - [x] Ces 4 clés suffisent pour ce formulaire minimal — ne pas ajouter d'autres clés `sessions.annonce_scope_*`/`AnnonceCard.scope-label` ici : elles concernent l'affichage d'une annonce déjà publiée (Story 9.2), hors scope de cette story.

- [x] **Task 5 — Service Angular** (AC1, AC2)
  - [x] Créer `apps/web/src/app/core/announcements/announcements.service.ts`, même style que `apps/web/src/app/core/scenarios/scenarios.service.ts` (HttpClient injecté, `API_BASE`, `withCredentials: true`, `firstValueFrom`) :
    ```typescript
    @Injectable({ providedIn: 'root' })
    export class AnnouncementsService {
      private readonly http = inject(HttpClient);

      create(partieId: string, dto: CreateAnnouncementDto): Promise<AnnouncementDto> {
        return firstValueFrom(
          this.http.post<AnnouncementDto>(`${API_BASE}/parties/${partieId}/announcements`, dto, {
            withCredentials: true,
          }),
        );
      }
    }
    ```

- [x] **Task 6 — `AnnouncementFormComponent`** (AC1, AC2, AC4, AC5)
  - [x] TDD : écrire `announcement-form.spec.ts` d'abord.
  - [x] Créer `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (+ `.html`), composant standalone, conventions signal `input`/`output` déjà établies (cf. `PollCreationComponent`, `apps/web/src/app/features/poll/poll-creation/poll-creation.ts`) :
    - `readonly partieId = input.required<string>();`
    - `readonly published = output<AnnouncementDto>();`
    - Injecte `ScenariosService` (`listAll(partieId)`) pour peupler le sélecteur de portée, `AnnouncementsService`, `ThemeToneService`.
    - `protected readonly scenarios = signal<ScenarioDto[]>([]);` chargé dans un `ngOnInit`/effect au premier accès (pattern déjà vu dans `CalendarView`/`PartieDetail`).
    - `protected readonly eligibleScenarios = computed(() => this.scenarios().filter((s) => s.status === 'COURANT' || s.status === 'PASSE'));` (AC4 — jamais `BROUILLON`/`A_VENIR` dans le sélecteur, filtrage frontend, cohérent avec AD-6).
    - `protected readonly text = signal('');`
    - `protected readonly selectedScenarioId = signal<string | null>(null);` (`null` = portée Partie/campagne entière, valeur par défaut du sélecteur)
    - `protected readonly isValid = computed(() => this.text().trim().length > 0);` (AC5 — bouton désactivé tant que vide ou uniquement des espaces)
    - `protected readonly publishing = signal(false);`
    - `async onSubmit()` : construit `CreateAnnouncementDto` (`{ text: this.text().trim(), scenarioId: this.selectedScenarioId() ?? undefined }`), appelle `AnnouncementsService.create()`, émet `(published)`, réinitialise `text`/`selectedScenarioId`, affiche brièvement `announcement.published_notice` (signal `justPublished`, même pattern que `notice()` dans `partie-detail.ts`).
  - [x] Template : `<textarea>` + `<mat-select>` (option fixe « Toute la campagne » valeur `null`, puis une `@for` sur `eligibleScenarios()` affichant `scenario.title`) + bouton `[disabled]="!isValid() || publishing()"`.
  - [x] Tests : liste filtrée aux `COURANT`/`PASSE` uniquement (AC4, vérifier qu'un scénario `BROUILLON`/`A_VENIR` renvoyé par `listAll()` n'apparaît jamais dans les options rendues) ; bouton désactivé si texte vide ou uniquement des espaces, activé sinon (AC5) ; soumission sans sélection de scénario appelle `AnnouncementsService.create()` avec `scenarioId: undefined` (AC1) ; soumission avec un scénario sélectionné inclut son `id` (AC2) ; `(published)` émis avec le DTO retourné, formulaire réinitialisé après succès.

- [x] **Task 7 — Intégration dans `PartieDetail` (MJ uniquement)** (AC1, AC2, AC4, AC5, AC6)
  - [x] Lire intégralement `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` et `.html` avant modification (état déjà connu de la session précédente : onglet « Détails », section `xp-section` MJ-only avec toggle `showXpPanel`/bouton/panel conditionnel, juste avant la fermeture du `mat-tab` « Détails »).
  - [x] Ajouter une section « Annonces » sur le **même modèle visuel** que `xp-section` (bouton toggle + panel conditionnel), MJ uniquement (`@if (isMj())`), positionnée après `xp-section` dans le template :
    ```html
    @if (isMj()) {
      <section class="announcement-section">
        <button type="button" mat-stroked-button (click)="showAnnouncementForm.set(!showAnnouncementForm())">
          {{ theme.tone()['announcement.publish_cta'] }}
        </button>
        @if (showAnnouncementForm()) {
          <app-announcement-form [partieId]="p.id" (published)="onAnnouncementPublished()" />
        }
      </section>
    }
    ```
  - [x] `partie-detail.ts` : `protected readonly showAnnouncementForm = signal(false);`, `protected onAnnouncementPublished(): void { this.showAnnouncementForm.set(false); }` (referme le panel après publication — pas de liste affichée dans cette story, cf. Task 8/Dev Notes « hors scope »).
  - [x] Tests `partie-detail.spec.ts` : bouton/panel visible pour le MJ, absent pour un joueur (AC6 — cohérent avec le reste de la page qui masque déjà les actions MJ-only aux joueurs, ex. `xp-section`) ; `onAnnouncementPublished()` referme le panel.

- [x] **Task 8 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 0 régression, nouveaux tests `scenarios.service.spec.ts`/`announcements.service.spec.ts`/`announcements.controller.spec.ts` verts.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression, nouveaux tests `announcement-form.spec.ts`/`partie-detail.spec.ts` verts.
  - [x] Redémarrage réel du conteneur `api` (`docker compose up -d --build api` ou équivalent, puis `docker compose logs api` — vérifier `Nest application successfully started` sans erreur de résolution DI) : `AnnouncementsModule` est un nouveau module avec une nouvelle dépendance cross-module (`ScenariosModule`), à vérifier même si aucun cycle `forwardRef` n'est attendu ici (contrairement à Story 8.8).

### Review Findings

Revue adversariale 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) menée le 2026-07-15 sur `git diff HEAD` (19 fichiers, baseline `b00ef4c`). Acceptance Auditor : 0 violation d'AC, les 7 ACs sont correctement implémentées.

- [x] [Review][Patch] (résolu, décision utilisateur : option 1) Le message de confirmation `justPublished()`/« Annonce publiée » (`AnnouncementFormComponent`, Task 6) ne pouvait en pratique jamais être vu par l'utilisateur : `PartieDetail.onAnnouncementPublished()` (Task 7) refermait immédiatement `showAnnouncementForm` en réaction au même événement `(published)` qui déclenche `justPublished.set(true)` côté enfant. **Corrigé** : le parent ne referme plus automatiquement le panel après publication — `onAnnouncementPublished()`/le binding `(published)` ont été retirés, l'utilisateur voit la confirmation et referme lui-même le panel via le bouton toggle déjà existant. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts, `.html`, `.spec.ts`]
- [x] [Review][Patch] `CreateAnnouncementDto.text` n'avait aucune borne haute (`@MaxLength`) — corrigé, `@MaxLength(5000)` ajouté (même borne que `description` sur `CreateScenarioDto`), testé. [apps/api/src/announcements/dto/create-announcement.dto.ts]
- [x] [Review][Patch] `dto.scenarioId` envoyé explicitement comme `null` passait `@IsOptional()` sans jamais être validé par `@IsUUID()`, causant une erreur Prisma 500 non gérée en aval. **Corrigé** : `@IsOptional()` remplacé par `@ValidateIf((o) => o.scenarioId !== undefined)` — une valeur `null` explicite est désormais soumise à `@IsUUID()` et rejetée proprement en 400. Testé. [apps/api/src/announcements/dto/create-announcement.dto.ts, `.spec.ts`]
- [x] [Review][Patch] `AnnouncementFormComponent.loadScenarios()` n'avait aucune gestion d'erreur — corrigé, `try/catch` + signal `error` (même pattern que `PollCreationComponent`), testé. [apps/web/src/app/features/announcements/announcement-form/announcement-form.ts, `.html`, `.spec.ts`]
- [x] [Review][Patch] `AnnouncementFormComponent.onSubmit()` n'avait aucune gestion d'erreur autour de `AnnouncementsService.create()` — corrigé, `try/catch` + signal `error` partagé avec `loadScenarios()`, texte/sélection volontairement conservés en cas d'échec (pas de reset, permet une nouvelle tentative sans ressaisie). Testé. [apps/web/src/app/features/announcements/announcement-form/announcement-form.ts, `.html`, `.spec.ts`]
- [x] [Review][Defer] Course (TOCTOU) entre `verifyScenarioBelongsToPartie()` et `prisma.announcement.create()` si le scénario est supprimé/réassigné entre les deux appels — même classe de risque que la non-atomicité déjà acceptée ailleurs dans le module (Story 8.7, décision utilisateur), et la contrainte FK (`Announcement.scenario`, `onDelete: Cascade`) empêche toute corruption silencieuse : au pire une erreur FK propre, pas un état incohérent. [apps/api/src/announcements/announcements.service.ts] — deferred, même risque déjà accepté ailleurs dans ce module, FK empêche la corruption
- [x] [Review][Defer] Aucun test au niveau HTTP/e2e du `ValidationPipe` pour un `scenarioId` malformé ou un `text` manquant — uniquement des tests unitaires service/controller. Écart de couverture, pas un bug fonctionnel ; cohérent avec la convention déjà établie du projet (pas de tests e2e par endpoint individuel ailleurs dans le codebase). [apps/api/src/announcements/dto/create-announcement.dto.ts] — deferred, écart de couverture mineur, cohérent avec la convention existante du projet

**Écarté (bruit/faux positifs)** : absence de test dédié « joueur non-MJ sur un chemin scopé à un scénario » (redondant, `getOwned` bloque déjà tout non-MJ avant toute logique de scénario) ; absence de sanitization XSS du texte (spéculatif, aucun rendu HTML de ce texte n'existe encore dans ce diff — à traiter par Story 9.2 si son choix de rendu le justifie) ; `toDto(announcement: any)` non typé (cohérent avec le pattern déjà établi `toDocumentDto(document: any)` dans `scenarios.service.ts`) ; absence de rate-limiting dédié (le `ThrottlerGuard` global couvre déjà l'app, aucune preuve qu'une limite plus stricte soit nécessaire pour une action MJ à faible fréquence) ; `verifyScenarioBelongsToPartie` sans `select` Prisma (micro-optimisation non justifiée pour un lookup mono-ligne, cohérent avec le pattern existant) ; « contournement anti-spoil via appel API direct » (c'est le comportement **voulu et documenté** d'AD-2/AC7 — le MJ ne peut pas se spoiler lui-même son propre contenu) ; indentation dans `partie-detail.html` (cosmétique) ; migration Prisma manquante pour `Announcement` (faux positif du Blind Hunter, sans accès au repo — le modèle existe déjà en base, vérifié directement dans cette session) ; texte composé uniquement d'espaces passant `@MinLength(1)` (explicitement documenté et accepté dans les Dev Notes de la story elle-même, Task 3 : « garde défensive de dernier recours, pas le mécanisme UX ») ; `partieId()` qui changerait sans recréation du composant (aucun chemin de code réaliste dans cette app — le composant n'existe que dans un toggle intra-page, un changement de route détruit/recrée tout l'arbre).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-2** (`ARCHITECTURE-SPINE.md`, palier `architecture-jdr-master-20260712`) : `AnnouncementsModule` séparé (`apps/api/src/announcements/`), importe `PartiesModule` (vérification appartenance/rôle) **et** `ScenariosModule` (validation qu'un `scenarioId` de portée existe et appartient à la Partie visée). Même schéma de dépendance que `PollModule` (P2-AD-2). **Aucune validation de statut de scénario côté backend** — `Announcement` peut viser un scénario `BROUILLON`/`A_VENIR`, seul le rendu Angular (Story 9.2, hors scope ici) protège l'anti-spoil à l'affichage. Ne pas reproduire le blocage `status === 'PASSE'` que `uploadDocument()` applique à `ScenarioDocument` — ce n'est **pas** le même contrat (AD-2 le dit explicitement, divergence assumée).
- **AD-9** : écriture (publier une annonce) = MJ seul, via `parties.getOwned(partieId, mjId)` — pas de guard NestJS dédié, réutilise le pattern déjà uniforme du module `scenarios`.
- **AD-6** (référencée par analogie, AD-2 : « même philosophie qu'AD-6 ») : le filtrage `COURANT`/`PASSE` du sélecteur de portée (AC4) est un filtrage **frontend uniquement** — l'API `GET /parties/:id/scenarios` (`ScenariosService.listAll()`, déjà existante, réutilisée telle quelle) renvoie déjà tous les scénarios quel que soit leur statut ; c'est `AnnouncementFormComponent` qui filtre côté client avant de peupler les options du sélecteur. Ne jamais créer un endpoint dédié « scénarios éligibles à une annonce » côté backend — ce serait une réintroduction de filtrage serveur qu'AD-6 écarte explicitement.

### Modèle de données — **déjà en base, aucune migration requise**

Le modèle `Announcement` existe déjà dans `apps/api/prisma/schema.prisma` (lignes ~461-472), créé par anticipation lors d'une migration précédente (`scenarios_seances_p4`) mais **jamais exploité par aucun module** — c'est le premier travail réellement neuf de l'Epic 9 (même situation que `ScenarioParticipant`/`Inscription` pour la Story 8.1) :

```prisma
model Announcement {
  id         String    @id @default(uuid())
  partieId   String
  partie     Partie    @relation(fields: [partieId], references: [id], onDelete: Cascade)
  scenarioId String?
  scenario   Scenario? @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  text       String
  createdAt  DateTime  @default(now())

  @@index([partieId, createdAt])
}
```

`scenarioId: null` = portée Partie/campagne entière (ou « ce one-shot » pour une Partie `ONE_SHOT`, qui n'a qu'un seul scénario, AD-7 — nuance purement d'affichage, Story 9.2). `Partie.announcements`/`Scenario.announcements` (relations inverses) sont également déjà présentes sur le schéma (vérifié : `Scenario.announcements Announcement[]` ligne 398). **Ne pas lancer `prisma migrate dev`** pour cette story — aucun changement de schéma nécessaire, uniquement du code applicatif.

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/scenarios/scenarios.service.ts`** — en particulier `uploadDocument()` (lignes ~103-161) : précédent le plus proche de la validation `scenarioId` optionnel + appartenance à la Partie (`isUUID`, `findUnique`, comparaison `partieId`), **mais attention à la divergence** : `uploadDocument()` bloque aussi `status === 'PASSE'`, ce que `verifyScenarioBelongsToPartie()` (Task 2) ne doit **pas** faire (AD-2).
- **`apps/api/src/scenarios/scenarios.module.ts`** et **`apps/api/src/poll/poll.module.ts`** — patterns de module avec imports cross-module ; contrairement à `PollModule`↔`ScenariosModule` (Story 8.8, cycle bidirectionnel nécessitant `forwardRef()`), `AnnouncementsModule → ScenariosModule` est un import à sens unique, **pas de `forwardRef` nécessaire**.
- **`apps/api/src/parties/parties.service.ts`** — `getOwned(id, userId)`/`getViewable(id, userId)`, déjà exportés par `PartiesModule`.
- **`apps/web/src/app/core/scenarios/scenarios.service.ts`** — `listAll(partieId): Promise<ScenarioDto[]>` déjà existant, à réutiliser tel quel pour peupler le sélecteur de portée (pas de nouvel endpoint).
- **`apps/web/src/app/features/poll/poll-creation/poll-creation.ts`** (+ `.html`) — précédent le plus proche pour un composant de formulaire standalone avec `input.required<string>()`/`output<T>()`, injectant un service de scénarios pour peupler une liste filtrée.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** (+ `.html`) — lire la section `xp-section` (bouton toggle MJ-only + panel conditionnel `showXpPanel`) : modèle visuel/structurel à répliquer à l'identique pour la section Annonces (Task 7).
- **`apps/web/src/app/core/theme/tones.ts`** — structure `TONE_MAP: Record<Theme, Record<string, string>>`, 3 thèmes (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`), chacun avec son propre registre de vocabulaire (ex. « séance » vs « clairière » vs « mission » pour la même notion) — respecter ce registre par thème pour les 4 nouvelles clés (Task 4).

### Hors scope explicite de cette story (Story 9.2)

- Tout affichage/consultation d'une annonce déjà publiée (`AnnonceCard`, liste chronologique sur `PartieDetail` ou en pied de `RetrospectivePanel`/fiche scénario) — Story 9.2.
- `AnnonceCard.scope-label` (« Toute la campagne » / « Ce one-shot » / « Ce scénario », rendu générique côté affichage) — distinct du sélecteur de portée du formulaire de publication (Task 6), qui affiche les **titres réels** des scénarios éligibles, pas un libellé générique.
- Filtrage anti-spoil à l'affichage (masquer une annonce scopée à un scénario non encore `COURANT`/`PASSE` pour un joueur) — Story 9.2, AC6.
- Endpoint `GET /parties/:id/announcements` ou équivalent — pas nécessaire pour cette story (publication uniquement), à ajouter en Story 9.2.

### Project Structure Notes

- Aucun conflit avec la structure existante — `apps/api/src/announcements/` et `apps/web/src/app/{core,features}/announcements/` sont de nouveaux dossiers, alignés avec le `Source tree (ajouts)` de `ARCHITECTURE-SPINE.md` (`architecture-jdr-master-20260712`).
- `packages/shared/src/index.ts` : ajouter la nouvelle section en fin de fichier ou à la suite de la section Scénarios existante — cohérent avec l'organisation par palier déjà en place (commentaires `// ─── Palier X : ... ──`).

### References

- `_bmad-output/planning-artifacts/epics.md` (lignes 664-735, Epic 9 complet — Story 9.1 et 9.2)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md` (AD-2, AD-6, AD-9, modèle `Announcement`, section « Structural Seed »)
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md` (§2 « Annonces MJ », §3 microcopy `sessions.annonce_scope_*`, §4 « Annonces (`AnnonceCard`) »)
- `_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md` (§7 `AnnonceCard`, §8 Do/Don't)
- `apps/api/prisma/schema.prisma` (modèle `Announcement` déjà présent, lignes ~461-472)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story)

### Debug Log References

Piège rencontré (Task 3) : les 2 premiers specs `announcements.service.spec.ts`/`announcements.controller.spec.ts` échouaient avec `SyntaxError: Unexpected token 'export'` pointant vers `@master-jdr/game-rules` — pas un bug d'implémentation. `ScenariosService` (importée pour servir de jeton DI) importe transitivement `CharacterService` → `@master-jdr/game-rules` (package ESM, non transformé par ts-jest). Solution (déjà en place ailleurs, ex. `poll.controller.spec.ts`) : `jest.mock('@master-jdr/game-rules', () => ({...}))` en tête de fichier. Mémoire projet mise à jour pour éviter de reperdre du temps sur ce piège à l'avenir.

### Completion Notes List

- Task 1 : `AnnouncementDto`/`CreateAnnouncementDto` ajoutés à `packages/shared/src/index.ts`.
- Task 2 : `ScenariosService.verifyScenarioBelongsToPartie()` ajoutée (TDD) — valide l'existence + l'appartenance à la Partie, **aucune validation de statut** (AD-2, divergence assumée avec `uploadDocument()`).
- Task 3 : `AnnouncementsModule` créé (service/controller/dto/module), enregistré dans `app.module.ts`. Import à sens unique vers `ScenariosModule`, aucun `forwardRef` nécessaire.
- Task 4 : 4 clés de microcopy (`announcement.scope_campaign_label`/`publish_cta`/`text_placeholder`/`published_notice`) ajoutées aux 3 thèmes de `tones.ts`, dans le registre de vocabulaire propre à chacun.
- Task 5 : `AnnouncementsService` (web) créé, réutilise le pattern `HttpClient`/`API_BASE`/`firstValueFrom` déjà établi.
- Task 6 : `AnnouncementFormComponent` créé — `<select>` natif (pas `mat-select`, plus simple à tester et cohérent avec le sélecteur de séance de l'Oracle, Story 8.8) filtré aux scénarios `COURANT`/`PASSE` (AC4, filtrage frontend, AD-6). Chargement des scénarios déplacé de `constructor()` à `ngOnInit()` (l'`input.required<string>()` n'est pas encore disponible dans le constructeur).
- Task 7 : section « Annonces » ajoutée dans l'onglet Détails de `PartieDetail`, MJ uniquement, même modèle que `xp-section` (toggle + panel conditionnel) — pas de liste affichée (Story 9.2).
- Task 8 : 641/641 tests API, 705/705 tests web, `pnpm typecheck` API propre, redémarrage réel du conteneur `api` vérifié (`AnnouncementsController` routes mappées, `Nest application successfully started`, aucune erreur de résolution DI).
- Revue de code (2026-07-15) : 1 décision utilisateur (le panel Annonces ne se referme plus automatiquement après publication — l'utilisateur voit la confirmation et le referme lui-même) + 5 patches appliqués (voir Review Findings) : `@MaxLength(5000)` sur `text`, `@ValidateIf` corrige le contournement `scenarioId: null`, gestion d'erreur (`try/catch` + signal `error`) ajoutée à `loadScenarios()`/`onSubmit()` de `AnnouncementFormComponent`. 648/648 tests API + 707/707 tests web après corrections, `pnpm typecheck` propre.

### File List

- `packages/shared/src/index.ts` (modifié — `AnnouncementDto`, `CreateAnnouncementDto`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `verifyScenarioBelongsToPartie()` ajoutée)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — tests `verifyScenarioBelongsToPartie()`)
- `apps/api/src/announcements/announcements.service.ts` (nouveau)
- `apps/api/src/announcements/announcements.service.spec.ts` (nouveau)
- `apps/api/src/announcements/announcements.controller.ts` (nouveau)
- `apps/api/src/announcements/announcements.controller.spec.ts` (nouveau)
- `apps/api/src/announcements/announcements.module.ts` (nouveau)
- `apps/api/src/announcements/dto/create-announcement.dto.ts` (nouveau, modifié en revue — `@MaxLength`, `@ValidateIf`)
- `apps/api/src/announcements/dto/create-announcement.dto.spec.ts` (nouveau, revue de code)
- `apps/api/src/app.module.ts` (modifié — `AnnouncementsModule` enregistré)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 4 clés `announcement.*` × 3 thèmes)
- `apps/web/src/app/core/announcements/announcements.service.ts` (nouveau)
- `apps/web/src/app/core/announcements/announcements.service.spec.ts` (nouveau)
- `apps/web/src/app/features/announcements/announcement-form/announcement-form.ts` (nouveau, modifié en revue — signal `error`, gestion d'erreur `loadScenarios()`/`onSubmit()`)
- `apps/web/src/app/features/announcements/announcement-form/announcement-form.html` (nouveau, modifié en revue — bloc `error()`)
- `apps/web/src/app/features/announcements/announcement-form/announcement-form.spec.ts` (nouveau, modifié en revue — tests des 2 chemins d'erreur)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — section Annonces MJ-only ; `onAnnouncementPublished()` retiré en revue)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié ; binding `(published)` retiré en revue)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — tests visibilité MJ/joueur ; test `onAnnouncementPublished()` remplacé en revue par un test du panel qui reste ouvert)

## Change Log

- 2026-07-15 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`/`.module.ts`, `poll.module.ts`, `parties.service.ts`, `scenarios.service.ts`/`poll-creation.ts` (web), `partie-detail.ts`/`.html`, `tones.ts`, `schema.prisma`, `epics.md` Epic 9, `ARCHITECTURE-SPINE.md` (architecture-jdr-master-20260712, AD-2/AD-6/AD-9), `EXPERIENCE.md`/`DESIGN.md` (ux-jdr-master-20260711)). Point notable trouvé en analyse : le modèle Prisma `Announcement` existe déjà en base (créé par anticipation lors d'une migration précédente, jamais exploité) — aucune migration requise pour cette story, uniquement du code applicatif (même situation que `ScenarioParticipant`/`Inscription` pour la Story 8.1). Périmètre volontairement limité à la publication (formulaire + backend) — la consultation/affichage des annonces déjà publiées est explicitement Story 9.2, pas dupliquée ici.
- 2026-07-15 : Implémentation complète (bmad-dev-story). 8 tasks, TDD red-green par task. `ScenariosService.verifyScenarioBelongsToPartie()` (aucune validation de statut, AD-2) + `AnnouncementsModule` (backend, import à sens unique vers `ScenariosModule`) + service/formulaire Angular (`<select>` natif filtré `COURANT`/`PASSE`, AD-6) intégrés dans `PartieDetail` (MJ uniquement, même modèle que `xp-section`). Piège rencontré et documenté (voir Debug Log) : nouveaux specs API touchant `ScenariosService` nécessitent `jest.mock('@master-jdr/game-rules', ...)`, sans quoi ts-jest échoue avec une erreur trompeuse. 641/641 tests API + 705/705 tests web, `pnpm typecheck` API propre, redémarrage réel du conteneur `api` vérifié (`AnnouncementsController` mappé, aucune erreur DI). Status → `review`.
- 2026-07-15 : Revue de code (`bmad-code-review`, 3 couches adversariales sur `git diff HEAD`). Acceptance Auditor : 0 violation d'AC. 1 Decision tranchée par l'utilisateur : le panel Annonces ne se referme plus automatiquement après publication (`onAnnouncementPublished()`/binding `(published)` retirés de `PartieDetail`) — le message de confirmation n'était sinon jamais visible, le composant qui le porte se démontant avant affichage. 5 Patches appliqués : `@MaxLength(5000)` sur `CreateAnnouncementDto.text` (absence de borne haute) ; `@ValidateIf` remplace `@IsOptional()` sur `scenarioId` (un `null` explicite passait sans validation et causait une erreur Prisma 500 non gérée) ; gestion d'erreur ajoutée à `AnnouncementFormComponent.loadScenarios()` et `.onSubmit()` (promesses rejetées non gérées, aucun retour utilisateur en cas d'échec). 2 items Defer (risque de course TOCTOU déjà accepté ailleurs dans le module, FK empêche la corruption ; absence de tests e2e du ValidationPipe, cohérent avec la convention du projet). 10 items écartés comme bruit/faux positifs. 648/648 tests API + 707/707 tests web après corrections, `pnpm typecheck` propre. Status → `done`.
