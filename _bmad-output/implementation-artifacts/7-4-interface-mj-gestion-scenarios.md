---
baseline_commit: 83467f645c45fca2834403facbab8315ccfd1a37
---

# Story 7.4: Interface MJ — création, documents et brouillons de scénario

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want créer/éditer un scénario, joindre ses documents, et gérer mes Brouillons depuis une interface dédiée,
so that je prépare le contenu narratif de ma campagne sans jamais passer par un appel API manuel.

## Acceptance Criteria

1. **Given** je suis MJ d'une Partie `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE` **When** je clique « + Nouveau scénario » depuis ma vue MJ des Brouillons **Then** un formulaire (titre, description, durée en heures ou en séances) s'affiche, et la soumission crée le scénario via `POST /parties/:id/scenarios` (Story 7.1).
2. **Given** un scénario existant dont je suis le MJ, non `PASSE` **When** j'édite ses champs (`FieldEditPencil`, pattern existant Story 6.6) **Then** la modification est envoyée via `PATCH /scenarios/:id` (Story 7.1), sans rechargement de page.
3. **Given** la fiche d'un scénario (n'importe quel statut, vue MJ) **When** je consulte sa section Documents **Then** je vois deux listes (documents du scénario / bibliothèque de campagne, `DocumentRow` avec `library-tag`) alimentées par `GET /scenarios/:id/documents` et `GET /parties/:id/documents` (Story 7.2), avec un bouton d'upload par liste (`POST /parties/:id/documents`, ≤5 Mo, cf. Story 7.2).
4. **Given** ma vue MJ des Brouillons (UX-DR8) **When** je la consulte **Then** je vois tous mes scénarios `BROUILLON` (`GET /parties/:id/scenarios/drafts`, Story 7.3), jamais mêlés à la timeline joueur (qui n'existe pas encore — Story 7.5).
5. **Given** un scénario `BROUILLON` dans cette vue **When** je clique « Ouvrir aux joueurs » **Then** `PATCH /scenarios/:id/open` est appelé (Story 7.3), le scénario quitte la vue Brouillons.
6. **Given** un upload de document en cours **When** le fichier dépasse 5 Mo ou n'est pas un PDF/texte valide **Then** l'erreur 413/400 renvoyée par l'API (Story 7.2) s'affiche clairement à l'écran, jamais une erreur générique.

*(Source: epics.md Story 7.4 — ACs verbatim, insérée par correct-course le 2026-07-12 pour rattraper le frontend manquant des Stories 7.1/7.2/7.3.)*

## Tasks / Subtasks

- [x] **Task 1 — `apps/web/src/app/core/scenarios/scenarios.service.ts`** (AC1-AC6)
  - [x] `create(partieId: string, dto: CreateScenarioDto): Promise<ScenarioDto>` → `POST ${API_BASE}/parties/${partieId}/scenarios`.
  - [x] `update(scenarioId: string, dto: UpdateScenarioDto): Promise<ScenarioDto>` → `PATCH ${API_BASE}/scenarios/${scenarioId}`.
  - [x] `listDrafts(partieId: string): Promise<ScenarioDto[]>` → `GET ${API_BASE}/parties/${partieId}/scenarios/drafts`.
  - [x] `open(scenarioId: string): Promise<ScenarioDto>` → `PATCH ${API_BASE}/scenarios/${scenarioId}/open` (pas de body).
  - [x] `uploadDocument(partieId: string, file: File, scenarioId?: string): Promise<ScenarioDocumentDto>` — `FormData` avec `file` et, si fourni, `scenarioId` ; `POST ${API_BASE}/parties/${partieId}/documents`.
  - [x] `listDocuments(scenarioId: string): Promise<ScenarioDocumentDto[]>` → `GET ${API_BASE}/scenarios/${scenarioId}/documents`.
  - [x] `listLibraryDocuments(partieId: string): Promise<ScenarioDocumentDto[]>` → `GET ${API_BASE}/parties/${partieId}/documents`.
  - [x] `downloadDocument(documentId: string): Promise<Blob>` → `GET ${API_BASE}/documents/${documentId}` avec `responseType: 'blob'`.
  - [x] Toutes les méthodes : `private readonly http = inject(HttpClient)`, `firstValueFrom(this.http...)`, `withCredentials: true`, types importés en `import type { ... } from '@master-jdr/shared'`, jamais de try/catch interne (erreurs remontées à l'appelant — même convention que `character.service.ts`/`parties.service.ts`).
  - [x] `scenarios.service.spec.ts` : `provideHttpClient()` + `provideHttpClientTesting()` + `HttpTestingController`, un test par méthode (vérifie verbe HTTP, URL, body, `withCredentials`), `afterEach(() => http.verify())` — même pattern que `parties.service.spec.ts`.

- [x] **Task 2 — `apps/web/src/app/features/scenarios/scenario-form/`** (AC1)
  - [x] Formulaire de création : champs `title` (requis), `description` (textarea, optionnel), `dureeHeures`/`dureeSeances` (number, optionnels). Soumission → `scenariosService.create(partieId, dto)`, puis navigation vers `parties/:id/scenarios/:scenarioId` (le scénario nouvellement créé).
  - [x] Composant standalone (`selector: 'app-scenario-form'`), **utiliser `ReactiveFormsModule`/`FormBuilder`** — c'est le pattern réel du formulaire de création le plus proche (`partie-form.ts`, même domaine Partie/Scénario), pas des signals bruts. Répliquer exactement sa structure : `private readonly fb = inject(FormBuilder)`, `this.fb.nonNullable.group({...}, [Validators.required, ...])`, `saving`/`error` en signals, `submit()` en `try/catch/finally`, cf. Dev Notes pour le code complet à répliquer.
  - [x] `scenario-form.spec.ts` : soumission avec titre seul (succès), soumission sans titre (bouton désactivé ou validation bloquante).

- [x] **Task 3 — `apps/web/src/app/features/scenarios/scenario-detail/`** (AC2, AC3)
  - [x] Affiche titre/description/durée via `<app-field-edit-pencil>` (title, dureeHeures, dureeSeances en mode `text`/`number` ; description en textarea simple avec bouton Enregistrer — `FieldEditPencil` ne supporte que `text`/`number` mono-ligne, pas de variante multi-ligne existante, cf. Dev Notes `[ASSUMPTION]`). Chaque `(confirm)` appelle `scenariosService.update(scenarioId, { <champ>: valeur })`.
  - [x] **Si `scenario().status === 'PASSE'`** : ne pas afficher les boutons crayon de `FieldEditPencil` ni le bouton "Enregistrer" de la description (les remplacer par un affichage en lecture seule) — le backend rejette de toute façon ces modifications (`BadRequestException`, cf. Story 7.1 AC5), mais l'UI ne doit jamais laisser croire que l'action est possible (pas de bouton qui échoue silencieusement).
  - [x] Section Documents : deux listes (`documents du scénario` via `listDocuments(scenarioId)` — combine déjà scénario+bibliothèque côté API, cf. Story 7.2 ; **et** un bouton d'upload scénario-scopé passant `scenarioId`). Chaque document affiché via une ligne simple (icône, nom, poids, tag "bibliothèque campagne" si `scenarioId === null`) cliquable pour télécharger (`downloadDocument` → `Blob` → lien `<a>` temporaire avec `download`).
  - [x] Bouton d'upload : `<input type="file" accept=".pdf,.txt">`, sur sélection appelle `uploadDocument(partieId, file, scenarioId)` ; en cas d'erreur (413/400), afficher le message d'erreur retourné par l'API dans une zone dédiée (AC6) — jamais une erreur générique/silencieuse. Si `scenario().status === 'PASSE'`, masquer le bouton d'upload scénario-scopé (le backend le rejette aussi, cf. Story 7.2) — l'upload bibliothèque de campagne, lui, reste toujours actif quel que soit le statut.
  - [x] `scenario-detail.spec.ts` : rendu des champs, édition d'un champ déclenche `update()`, liste de documents rendue, upload réussi appelle `uploadDocument`, upload en erreur affiche le message.
  - [x] **`[DÉVIATION]`** : aucun endpoint `GET /scenarios/:id` n'existe (Stories 7.1-7.3 livrées sans lui) — le scénario complet est transmis via `Router.navigate(..., { state: { scenario } })` depuis `ScenarioForm` (après création) et `ScenarioDrafts` (clic sur une ligne, Task 4), lu en constructeur via `Router.getCurrentNavigation()?.extras.state`. Accès direct par URL/refresh → message d'erreur explicite invitant à repasser par la liste des Brouillons (backend non modifié, conforme à la contrainte de la story).

- [x] **Task 4 — `apps/web/src/app/features/scenarios/scenario-drafts/`** (AC4, AC5)
  - [x] Liste les scénarios `BROUILLON` via `listDrafts(partieId)`. Bouton « + Nouveau scénario » → navigation vers `parties/:id/scenarios/new`. Chaque ligne : titre + bouton « Ouvrir aux joueurs » → `open(scenarioId)`, puis retire l'élément de la liste locale (signal) sans recharger toute la liste.
  - [x] Clic sur une ligne (hors bouton Ouvrir) → navigation vers `parties/:id/scenarios/:scenarioId` (Task 3), scénario transmis via `{ state: { scenario } }` (cf. `[DÉVIATION]` Task 3, pas de `GET /scenarios/:id`).
  - [x] `scenario-drafts.spec.ts` : liste rendue, clic « + Nouveau scénario » navigue, clic « Ouvrir aux joueurs » appelle `open()` et retire la ligne.

- [x] **Task 5 — Routing et intégration `PartieDetail`** (AC1, AC4)
  - [x] Ajouter dans `apps/web/src/app/app.routes.ts` (sous le même parent `Shell`/`authGuard` que les routes `characters/*` existantes, pattern `loadComponent`), **dans cet ordre précis** — les segments statiques `drafts`/`new` doivent être déclarés avant le segment dynamique `:scenarioId`, sinon Angular route `drafts`/`new` vers le composant `:scenarioId` (segment dynamique qui matcherait n'importe quelle valeur en premier si mal ordonné) :
    1. `parties/:id/scenarios/drafts` → `ScenarioDrafts`
    2. `parties/:id/scenarios/new` → `ScenarioForm` (mode création)
    3. `parties/:id/scenarios/:scenarioId` → `ScenarioDetail`
  - [x] Dans `partie-detail.html`, ajouter un nouvel onglet MJ-only dans le `<mat-tab-group>` existant (`@if (isMj())`, même garde que les onglets « Invitations » déjà présents) contenant soit un lien vers `parties/:id/scenarios/drafts`, soit `<app-scenario-drafts [partieId]="partie()!.id" />` intégré directement dans l'onglet (préférer l'intégration directe, cohérent avec les autres onglets qui n'ouvrent pas de nouvelle page).
  - [x] **⚠️ Régression à éviter** : `partie-detail.ts` définit `const MJ_INVITATIONS_TAB_INDEX = 1;` (commentaire : "toujours en 2e position pour le MJ"), utilisé par `openInvitationsTab()` (déclenché depuis le bouton "+ Inviter" du roster). Ce nombre est codé en dur en supposant la position actuelle de l'onglet Invitations. **Ajouter le nouvel onglet Scénarios/Brouillons STRICTEMENT APRÈS l'onglet Invitations dans le `<mat-tab-group>`** (jamais avant), pour ne pas décaler l'index et casser silencieusement `openInvitationsTab()`. Si un ordre différent est préféré, mettre à jour `MJ_INVITATIONS_TAB_INDEX` en conséquence et vérifier `openInvitationsTab()` reste correct (test de non-régression à ajouter dans ce cas).
  - [x] `ScenariosService` provisionné dans `partie-detail.spec.ts` (`makeScenariosService()`, `listDrafts` mocké) — le nouvel onglet `ScenarioDrafts` est rendu (non lazy) dans le `<mat-tab-group>` existant pour tout MJ, `MJ_INVITATIONS_TAB_INDEX` inchangé et vérifié par les tests existants.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **Backend déjà livré et stable** (Stories 7.1/7.2/7.3, toutes `done`, 483 tests passants) : `POST /parties/:id/scenarios`, `PATCH /scenarios/:id`, `POST /parties/:id/documents`, `GET /scenarios/:id/documents`, `GET /parties/:id/documents`, `GET /documents/:id`, `GET /parties/:id/scenarios/drafts`, `PATCH /scenarios/:id/open`. **Ne rien modifier côté `apps/api`** — cette story est 100% frontend.
- **AD-6 (rappel)** : le backend ne filtre jamais par statut. Cette story ne construit que la vue MJ (qui voit toujours tout) — la vue joueur avec rendu anti-spoil conditionnel est le périmètre de la Story 7.5, pas celui-ci. Ne pas construire de logique d'anti-spoil ici.
- **Rôle MJ côté frontend** : pas de champ "rôle" par Partie côté client — `AuthUser.role` (`'USER'|'ADMIN'`) est un rôle **global**, sans rapport avec MJ/joueur. Le motif exact à répliquer (`partie-detail.ts`) :
  ```ts
  protected readonly isMj = computed(() => this.partie()?.mjId === this.auth.currentUser()?.id);
  ```
- **Types partagés déjà exportés** (`packages/shared/src/index.ts`, Stories 7.1/7.2) : `ScenarioStatus`, `ScenarioDto`, `CreateScenarioDto`, `UpdateScenarioDto`, `ScenarioDocumentDto` — importer en `import type`, ne rien redéfinir.
- **`[ASSUMPTION]`** : `FieldEditPencil` ne supporte que `type: 'text' | 'number'` (mono-ligne). Le champ `description` d'un scénario est potentiellement long (texte libre narratif) — utiliser une zone de texte simple (`<textarea>` + bouton Enregistrer) plutôt que de forcer `FieldEditPencil` dans un cas qu'il ne gère pas nativement. Ne pas étendre `FieldEditPencil` lui-même dans cette story (risque de régression sur ses autres usages, Story 6.6) — un pattern local suffit.
- **`[ASSUMPTION]`** : pas de barre de progression d'upload — aucun précédent dans le code base (`updatePortrait` est un simple `FormData` + `PUT` sans suivi de progression). Rester cohérent : upload simple, état "en cours"/"terminé"/"erreur" suffit.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/web/src/app/core/characters/character.service.ts`** — pattern de service à suivre à l'identique (upload multipart, download blob, `firstValueFrom`) :
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { CharacterDto, CreateCharacterDto } from '@master-jdr/shared';
import { API_BASE } from '../api-base';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);

  create(partieId: string, dto: CreateCharacterDto): Promise<CharacterDto> {
    return firstValueFrom(
      this.http.post<CharacterDto>(`${API_BASE}/parties/${partieId}/characters`, dto, { withCredentials: true }),
    );
  }

  updatePortrait(id: string, file: File, cropData: { scale: number; offsetX: number; offsetY: number } | null): Promise<CharacterDto> {
    const form = new FormData();
    form.append('file', file);
    if (cropData) form.append('cropData', JSON.stringify(cropData));
    return firstValueFrom(
      this.http.put<CharacterDto>(`${API_BASE}/characters/${id}/portrait`, form, { withCredentials: true }),
    );
  }

  exportPdf(id: string, format: 'editable' | '2pages'): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE}/characters/${id}/export.pdf`, { params: { format }, responseType: 'blob', withCredentials: true }),
    );
  }
}
```
**Important** : `uploadDocument` doit ajouter `scenarioId` au `FormData` **seulement s'il est fourni** (`if (scenarioId) form.append('scenarioId', scenarioId);`) — jamais une chaîne vide (cf. Story 7.2, le backend rejette explicitement un `scenarioId` en chaîne vide).

**`apps/web/src/app/features/parties/partie-form/partie-form.ts`** (complet — pattern de formulaire de création/édition à répliquer pour `ScenarioForm`, `ReactiveFormsModule` pas des signals bruts) :
```ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PartiesService } from '../../../core/parties/parties.service';

@Component({
  selector: 'app-partie-form',
  imports: [ReactiveFormsModule, /* Mat*Module */],
  templateUrl: './partie-form.html',
  styleUrl: './partie-form.scss',
})
export class PartieForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parties = inject(PartiesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly editId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    gameSystemId: ['draconis', [Validators.required]],
    kind: ['ONE_SHOT' as const, [Validators.required]],
    description: [''],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.editId.set(id);
    const p = await this.parties.get(id);
    this.form.patchValue({ name: p.name, /* ... */ });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    try {
      const id = this.editId();
      const partie = id ? await this.parties.update(id, v) : await this.parties.create(v);
      void this.router.navigate(['/parties', partie.id]);
    } catch {
      this.error.set("Impossible d'enregistrer la partie.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    const id = this.editId();
    void this.router.navigate(id ? ['/parties', id] : ['/']);
  }
}
```
Pour `ScenarioForm` : reproduire exactement cette structure (`fb.nonNullable.group`, `Validators.required` sur `title`, `saving`/`error` en signals, `submit()` en `try/catch/finally`), mais **sans `ngOnInit` d'édition** (le mode édition passe par `FieldEditPencil` dans `ScenarioDetail`, pas par ce formulaire — `ScenarioForm` ne sert qu'à la création, AC1).

**`FieldEditPencil`** (`apps/web/src/app/features/characters/character-sheet/field-edit-pencil/field-edit-pencil.ts`, complet — inclut `options`/`onInput`/`datalistId` ajoutés en Story 6.7, ne pas se fier à une version abrégée) :
```ts
import { Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export interface FieldEditPencilOption { key: string; label: string; }

let nextDatalistId = 0;

@Component({
  selector: 'app-field-edit-pencil',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './field-edit-pencil.html',
  styleUrl: './field-edit-pencil.scss',
})
export class FieldEditPencil {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly type = input<'text' | 'number'>('text');
  readonly options = input<FieldEditPencilOption[]>([]); // combobox optionnel, non utilisé pour Scenario
  readonly confirm = output<string | number>();
  protected readonly datalistId = `field-edit-pencil-datalist-${nextDatalistId++}`;
  protected readonly editing = signal(false);
  protected readonly draft = signal<string | number>('');
  protected startEdit(): void { this.draft.set(this.value()); this.editing.set(true); }
  protected cancel(): void { this.editing.set(false); }
  protected onInput(raw: string): void {
    // Number('') vaut 0, pas NaN — un champ vidé doit bloquer la soumission, pas soumettre 0.
    this.draft.set(this.type() === 'number' ? (raw.trim() === '' ? NaN : Number(raw)) : raw);
  }
  protected submit(): void {
    const value = this.draft();
    if (typeof value === 'number' && Number.isNaN(value)) return;
    this.editing.set(false);
    this.confirm.emit(value);
  }
}
```
Pour `Scenario`, seuls `label`/`value`/`type`/`confirm` sont utilisés — `options` reste `[]` par défaut (pas de combobox pour titre/durée).
Usage (à répliquer tel quel) :
```html
<app-field-edit-pencil label="le titre" [value]="scenario().title" (confirm)="onFieldConfirm('title', $event)" />
```

**`CharacterSummaryCard`** (`apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts`) — modèle de composant "carte" standalone à suivre pour `DocumentRow`/les lignes de la vue Brouillons :
```ts
@Component({
  selector: 'app-character-summary-card',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './character-summary-card.html',
  styleUrl: './character-summary-card.scss',
})
export class CharacterSummaryCard {
  readonly character = input.required<CharacterDto>();
  readonly selected = output<void>();
  protected onClick(): void { this.selected.emit(); }
}
```

**`PartieDetail`** (`apps/web/src/app/features/parties/partie-detail/partie-detail.html`) — pattern d'onglet MJ-only à répliquer :
```html
<mat-tab-group [selectedIndex]="selectedTabIndex()" (selectedIndexChange)="onTabIndexChange($event)">
  <mat-tab label="Détails"> ... </mat-tab>
  @if (isMj()) {
    <mat-tab [label]="theme.tone()['partie.invitations_tab_label']"> ... </mat-tab>
  }
</mat-tab-group>
```

**Routing** (`apps/web/src/app/app.routes.ts`) — pattern `loadComponent` lazy à répliquer :
```ts
{
  path: 'parties/:id/characters/new',
  loadComponent: () => import('./features/characters/character-wizard/character-wizard').then((m) => m.CharacterWizard),
},
{
  path: 'parties/:id/characters/:characterId',
  loadComponent: () => import('./features/characters/character-sheet/character-sheet').then((m) => m.CharacterSheet),
},
```

### Design tokens (DESIGN.md/EXPERIENCE.md → mécanisme réel)

Les tokens sémantiques du DESIGN.md (`status-unavailable`/`status-mixed`/`status-available`, `accent-1`, `accent-2`, `text-muted`) sont en réalité des **CSS custom properties** définies dans `apps/web/src/styles.scss` — noms réels différents de la doc UX, à utiliser tels quels dans le code (pas de nouvelle valeur à inventer) :
- `--color-available` / `--color-unavailable` / `--color-unknown` / `--color-mixed` (`:root`, sémantique disponibilité)
- `--jdr-accent-1` / `--jdr-accent-1-rgb` / `--jdr-accent-2` / `--jdr-accent-2-rgb` / `--jdr-text-muted` (par thème, ex. `.theme-grimoire-emeraude`)

Exemple d'usage réel (`aggregated-creneau-card.scss`) : `border-left: 3px solid var(--color-available);`. Pour le badge de statut de scénario (`ScenarioStatusBadge`, hors scope de cette story mais utile pour la cohérence visuelle des vues Brouillons/détail) : réutiliser `var(--jdr-text-muted)`/`var(--color-unknown)` pour `BROUILLON`, jamais une nouvelle couleur.

### Tests — conventions à suivre exactement

Service (`scenarios.service.spec.ts`, calqué sur `parties.service.spec.ts`) :
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScenariosService } from './scenarios.service';
import { API_BASE as API } from '../api-base';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ScenariosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('create → POST avec le payload', async () => {
    const dto = { title: 'Le Marché aux Ombres' };
    const p = service.create('p1', dto);
    const req = http.expectOne(`${API}/parties/p1/scenarios`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 's1', partieId: 'p1', title: dto.title, /* ... */ });
    await p;
  });
});
```
Composants : Vitest + `TestBed`, `fixture.componentRef.setInput(...)`, `fixture.detectChanges()`, `await fixture.whenStable()`, assertions sur `nativeElement.textContent`/`querySelector` — même pattern que `character-summary-card.spec.ts`.

### Hors scope explicite de cette story (ne pas implémenter)

- Aucun rendu anti-spoil / `ScenarioTimeline` — Story 7.5.
- Aucun bouton "Marquer comme Courant"/"Clôturer" — Stories 7.6/7.7.
- Aucune UI de séances/inscriptions/rétrospective/annonces — Epics 8/9.
- Aucune barre de progression d'upload, aucun composant `ScenarioStatusBadge` visuellement abouti (un texte de statut brut suffit pour cette story — le badge stylé complet est naturellement affiné en Story 7.5 quand la timeline l'utilisera aussi).

### Project Structure Notes

- Nouveaux fichiers dans `apps/web/src/app/core/scenarios/` et `apps/web/src/app/features/scenarios/{scenario-form,scenario-detail,scenario-drafts}/` — aligné avec le source tree de l'architecture (`apps/web/src/app/features/scenarios/`, `apps/web/src/app/core/scenarios/`, déjà prévus dans architecture-jdr-master-20260712).
- Un `DocumentRow` simple peut être un sous-composant de `scenario-detail/` (pas nécessairement un dossier `features/scenarios/document-row/` séparé si son usage reste local à cette story — à trancher par le développeur selon la taille du template).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4: Interface MJ — création, documents et brouillons de scénario] — ACs verbatim.
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-12.md] — contexte de l'insertion de cette story par correct-course.
- [Source: _bmad-output/implementation-artifacts/7-1-creer-editer-scenario.md, 7-2-documents-scenario-bibliotheque.md, 7-3-brouillon-ouverture-manuelle.md] — endpoints backend consommés par cette story, tous `done`.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-6, Source tree] — anti-spoil frontend-only (hors scope ici), arborescence `apps/web/src/app/features/scenarios/`.
- [Source: apps/web/src/app/core/characters/character.service.ts] — pattern service HTTP (upload/download/CRUD) à répliquer.
- [Source: apps/web/src/app/features/characters/character-sheet/field-edit-pencil/] — pattern d'édition inline à réutiliser.
- [Source: apps/web/src/app/features/characters/character-summary-card/] — pattern de composant "carte" standalone.
- [Source: apps/web/src/app/features/parties/partie-detail/] — pattern d'onglet MJ-only, détection du rôle MJ.
- [Source: apps/web/src/app/app.routes.ts] — pattern de routes lazy `loadComponent`.
- [Source: apps/web/src/styles.scss] — tokens CSS réels (`--color-*`, `--jdr-*`).
- [Source: apps/web/src/app/core/parties/parties.service.spec.ts] — pattern de test de service HTTP (`HttpTestingController`).

### Review Findings

Revue adversariale parallèle (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 21 findings bruts, fusionnés/dédoublonnés à 15 findings uniques : 1 décision nécessitant l'utilisateur, 6 patches, 6 différés, 8 rejetés comme bruit/faux positifs/déjà couverts.

- [x] [Review][Decision] Le flux « + Nouveau scénario »/onglet Scénarios reste accessible pour une Partie `ONE_SHOT` (AC1 le scope explicitement à `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`), et toute tentative échoue avec un message générique masquant la vraie raison backend (AD-7, `BadRequestException` "Une Partie de type ONE_SHOT ne peut pas avoir plusieurs scénarios..."). **Résolu par l'utilisateur** : un ONE_SHOT n'a jamais qu'un seul scénario (auto-créé, AD-7) — au lieu de masquer l'onglet, il donne un accès direct à ce scénario unique (édition + documents), sans liste ni "+ Nouveau". Implémenté : extraction de la logique d'édition dans un composant partagé `ScenarioEditor` (input direct, pas de résolution interne), réutilisé par `ScenarioDetail` (campagne, via état de navigation) et par un nouvel onglet dédié `ScenarioOneShotTab` (ONE_SHOT, via `listDrafts()[0]` + bouton "Ouvrir aux joueurs"). `partie-detail.html` branche l'onglet sur `p.kind`. `[DÉVIATION]` documentée : une fois le scénario ONE_SHOT sorti de `BROUILLON`, `listDrafts()` (filtré) ne le retrouve plus tant que la Story 7.5 n'ajoute pas `GET /parties/:id/scenarios` (liste complète) — limitation temporaire assumée.

- [x] [Review][Patch] `ScenarioForm.submit()` avale le message d'erreur backend (toujours "Impossible d'enregistrer le scénario.") [scenario-form.ts:48] — corrigé : remonte `err.error.message` si présent (`HttpErrorResponse`), sinon le message générique.
- [x] [Review][Patch] `ScenarioDetail.onFieldConfirm`/`submitDescription` avalent le message d'erreur backend, contrairement à `upload()` qui le remonte déjà [scenario-detail.ts:63-77] — corrigé dans `ScenarioEditor` (composant partagé issu du refactor ONE_SHOT), via un helper `extractErrorMessage()` commun à tous les chemins d'erreur.
- [x] [Review][Patch] `downloadDocument` n'a aucune gestion d'erreur (rejet de promesse non intercepté, aucun retour utilisateur) [scenario-detail.ts:118-128] — corrigé dans `ScenarioEditor` : try/catch + signal `downloadError`.
- [x] [Review][Patch] Les `<input type="file">` ne réinitialisent jamais `event.target.value` — resélectionner le même fichier après une erreur ne redéclenche pas `change` [scenario-detail.html:61,72] — corrigé dans `ScenarioEditor` : `input.value = ''` après lecture du fichier, avant tout traitement.
- [x] [Review][Patch] Garde-fou runtime manquant en défense en profondeur : `onFieldConfirm`/`submitDescription`/`upload` ne vérifient que `!s`, pas `isReadOnly()` — un scénario qui passe à `PASSE` pendant une édition en cours envoie quand même le PATCH [scenario-detail.ts:63-113] — corrigé dans `ScenarioEditor` : `if (!s || this.isReadOnly()) return;`.
- [x] [Review][Patch] Durées (`dureeHeures`/`dureeSeances`) invisibles (aucun `@else`) quand `status === 'PASSE'`, alors que Task 3 exige un affichage lecture seule (pas une disparition) [scenario-detail.html:24-34] — corrigé dans `ScenarioEditor` : `@else { <p>{{ s.dureeHeures ?? '—' }} h · {{ s.dureeSeances ?? '—' }} séances</p> }`.
- [x] [Review][Patch] Lignes de documents sans icône, alors que Task 3 la spécifie explicitement (« icône, nom, poids, tag ») [scenario-detail.html:391-408] — corrigé dans `ScenarioEditor` : `<mat-icon>description</mat-icon>` ajouté à chaque ligne.

- [x] [Review][Defer] Accès direct par URL/refresh à `ScenarioDetail` dépend uniquement de `Router.getCurrentNavigation()?.extras.state` (aucun `GET /scenarios/:id`) ; comportement navigateur précédent/suivant (popstate) non vérifié par les tests [scenario-detail.ts:20-53] — deferred, dépend de l'endpoint `GET /parties/:id/scenarios` prévu Story 7.5
- [x] [Review][Defer] `resolvePartieId()` préfère l'input sans réactivité si le composant était réutilisé dans un autre contexte routé à l'avenir [scenario-drafts.ts:26-28] — deferred, aucun chemin de déclenchement dans le câblage actuel
- [x] [Review][Defer] Pas de souscription réactive à `route.paramMap` dans `ScenarioDetail` — une navigation scénario→scénario sur la même route laisserait l'ancien contenu affiché [scenario-detail.ts:46-61] — deferred, aucun point d'entrée actuel ne déclenche ce cas
- [x] [Review][Defer] `descriptionDraft` peut diverger du `scenario` signal en cas d'édition concurrente (pas de verrouillage optimiste) [scenario-detail.ts:33,51-77] — deferred, cohérent avec AD-3 (pas de verrouillage optimiste sur Scenario), risque préexistant dans le pattern de l'appli
- [x] [Review][Defer] Route lazy `scenarios/drafts` n'apporte aucun gain réel (`ScenarioDrafts` déjà importé eagerly par `PartieDetail`, lui-même non-lazy) [app.routes.ts:45-51, partie-detail.ts:50] — deferred, optimisation bundle hors scope de cette story
- [x] [Review][Defer] Bouton "Annuler" non désactivé pendant `saving()` dans `ScenarioForm` [scenario-form.ts:15,32] — deferred, UX mineure, non bloquante

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Aucun changement `apps/api` — story 100% frontend, conforme aux Dev Notes.
- `ScenarioForm.submit()` et `ScenarioDrafts.openScenario()` transmettent le `ScenarioDto` complet via `Router.navigate(..., { state: { scenario } })`, lu dans `ScenarioDetail` via `Router.getCurrentNavigation()?.extras.state` (capturé au constructeur — seul moment où `getCurrentNavigation()` est renseigné). Nécessaire car aucun endpoint `GET /scenarios/:id` n'existe (Stories 7.1-7.3) ; accès direct par URL/refresh → message d'erreur explicite plutôt qu'un crash (limitation documentée, cf. `[DÉVIATION]` Task 3).
- `ScenarioDrafts.partieId` est un input optionnel (repli sur `ActivatedRoute` `:id`) pour supporter à la fois l'intégration directe dans `PartieDetail` (`[partieId]="partie()!.id"`) et la route `parties/:id/scenarios/drafts` déclarée en Task 5.
- Suite complète web : 56 suites / 464 tests, tous passants (aucune régression). `ng build` échoue sur le budget de bundle initial (1.08 Mo > 1 Mo) — confirmé préexistant sur `master` avant cette story (vérifié via `git stash`), hors scope.

### Completion Notes List

- `ScenariosService` (8 méthodes HTTP) : `create`, `update`, `listDrafts`, `open`, `uploadDocument`, `listDocuments`, `listLibraryDocuments`, `downloadDocument` — pattern `character.service.ts` répliqué à l'identique (`firstValueFrom`, `withCredentials`, `import type`).
- `ScenarioForm` : formulaire de création `ReactiveFormsModule`/`FormBuilder` (pattern `partie-form.ts`), navigation vers le détail avec le scénario créé transmis en état.
- `ScenarioDetail` : édition inline via `FieldEditPencil` (titre, durées) + textarea pour la description ; lecture seule complète si `status === 'PASSE'` (AC2) ; deux listes de documents (scénario / bibliothèque) + deux boutons d'upload distincts, le scénario-scopé masqué si `PASSE` (AC3, AC6) ; erreurs d'upload affichées verbatim depuis `err.error.message` (AC6).
- `ScenarioDrafts` : liste des `BROUILLON`, bouton « + Nouveau scénario », bouton « Ouvrir aux joueurs » par ligne (retire l'élément localement sans recharger), clic sur une ligne navigue vers le détail (AC4, AC5).
- Routing : 3 nouvelles routes lazy (`drafts`, `new`, `:scenarioId`) ajoutées dans le bon ordre (statiques avant dynamique) ; nouvel onglet MJ-only « Scénarios » ajouté strictement après l'onglet Invitations dans `PartieDetail` — `MJ_INVITATIONS_TAB_INDEX` non affecté (vérifié par les 25 tests existants de `partie-detail.spec.ts`, désormais avec `ScenariosService` mocké).
- 6 acceptance criteria couvertes : AC1 (création), AC2 (édition), AC3 (documents, 2 listes + upload), AC4 (vue Brouillons), AC5 (ouverture aux joueurs), AC6 (erreur d'upload explicite).
- 464/464 tests passent (suite web complète), aucune régression.

### File List

- `apps/web/src/app/core/scenarios/scenarios.service.ts` (nouveau)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-form/scenario-form.ts` (nouveau, modifié en revue — message d'erreur backend remonté)
- `apps/web/src/app/features/scenarios/scenario-form/scenario-form.html` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-form/scenario-form.scss` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-form/scenario-form.spec.ts` (nouveau, modifié en revue)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (nouveau, revue — extraction de l'édition/documents partagée entre `ScenarioDetail` et `ScenarioOneShotTab`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (nouveau, revue)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.scss` (nouveau, revue)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (nouveau, revue)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.ts` (nouveau, réécrit en revue — wrapper fin autour de `ScenarioEditor`)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.html` (nouveau, réécrit en revue)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.scss` (nouveau, réécrit en revue)
- `apps/web/src/app/features/scenarios/scenario-detail/scenario-detail.spec.ts` (nouveau, réécrit en revue)
- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.html` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.scss` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-drafts/scenario-drafts.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.ts` (nouveau, revue — onglet dédié ONE_SHOT, résolution de la décision)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.html` (nouveau, revue)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.scss` (nouveau, revue)
- `apps/web/src/app/features/scenarios/scenario-one-shot-tab/scenario-one-shot-tab.spec.ts` (nouveau, revue)
- `apps/web/src/app/app.routes.ts` (modifié — 3 nouvelles routes lazy)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — import `ScenarioDrafts` + `ScenarioOneShotTab`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — onglet MJ-only branché sur `p.kind` : « Scénario » (ONE_SHOT) vs « Scénarios » (campagne))
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — `ScenariosService` mocké + 3 tests de branchement par `kind`)

## Change Log

- 2026-07-12 : Implémentation complète de la Story 7.4 (frontend MJ pour la création/édition de scénario, documents, brouillons — rattrapage des Stories 7.1/7.2/7.3, 6 ACs couvertes, 464/464 tests passants).
- 2026-07-12 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 1 décision résolue (accès direct au scénario unique d'une Partie `ONE_SHOT`, via nouveau composant partagé `ScenarioEditor` et nouvel onglet `ScenarioOneShotTab`), 6 patches appliqués (messages d'erreur backend remontés, gestion d'erreur `downloadDocument`, reset des `<input type="file">`, garde-fou `isReadOnly()` en défense en profondeur, affichage lecture seule des durées si `PASSE`, icône sur les lignes de documents), 6 items différés documentés dans `deferred-work.md`. 477/477 tests passants après correctifs (58 suites).
