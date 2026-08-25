---
baseline_commit: "0119e509fbd7cd79165d1d3dcc071c6de8d318d8"
---

# Story 3.2 : Créer un vote — frontend MJ

Status: done

## Story

As a GM,
I want to create a date poll from the available slots view,
So that my players can vote on the best option.

## Acceptance Criteria

**AC1 — Bouton « lancer le vote » dans la vue MJ**

Given le MJ est sur `/parties/:id/calendar` (mode MJ)
When il consulte la fenêtre de la destinée (mj-results-panel)
Then un bouton `theme.tone()['cta.launch_vote']` est visible
And un clic ouvre le `PollCreationComponent` (panel slide-in)
And si un poll OPEN existe déjà, le `PollStatusPanel` s'affiche à la place du bouton avec un bouton "Clôturer le vote" (DELETE).

**AC2 — Formulaire de création de vote**

Given le `PollCreationComponent` est ouvert
When le MJ consulte le formulaire
Then les 5 premiers créneaux calculés disponibles (AvailableSlotDto du panel MJ) sont pré-listés sous forme de checkboxes sélectionnables
And un bouton "charger plus" permet d'afficher les créneaux calculés suivants (4 par batch) si d'autres existent
And le MJ peut ajouter autant de créneaux personnalisés (date + slot) que souhaité
And un champ texte `scenarioRef` optionnel est présent
And le bouton de soumission est désactivé si < 2 ou > 40 options sont sélectionnées au total
And le bouton de soumission est désactivé pendant l'envoi (`saving` signal).

**AC3 — Soumission réussie**

Given le MJ sélectionne 2–4 options et clique soumettre
When `POST /parties/:id/poll` retourne 201
Then le panel se ferme
And un toast `theme.tone()['success.poll_created']` s'affiche (MatSnackBar, durée 3000 ms)
And le poll OPEN créé s'affiche dans la vue MJ (composant `PollStatusPanel` minimal dans mj-results-panel).

**AC4 — Gestion d'erreur**

Given une erreur réseau ou serveur lors de la création
When l'API retourne une erreur
Then le panel reste ouvert avec un message d'erreur thématisé
And aucune donnée du formulaire n'est perdue.

**AC5 — Tests unitaires (Vitest)**

Given `PollCreationComponent` testé dans `poll-creation.spec.ts`
When la suite s'exécute
Then les cas suivants passent :
  1. Avec 2 slots pré-sélectionnés → bouton soumettre activé
  2. Avec 0 slots sélectionnés → bouton soumettre désactivé
  3. Soumission réussie → émet `created`, toast affiché
  4. Soumission en erreur → signal `error` non-null, `saving` false, formulaire intact
And `PollService.createPoll` testé dans `poll.service.spec.ts` :
  5. `createPoll` appelle `POST /parties/p1/poll` avec le DTO et retourne `SessionPollDto`

## Tasks/Subtasks

- [x] Task 1 — PollService frontend : ajouter `createPoll()` et `getCurrentPoll()` (AC3, AC5)
  - [x] `apps/web/src/app/core/poll/poll.service.ts` — ajouter `createPoll(partieId, dto)` : POST (voir Dev Notes §Task 1)
  - [x] `apps/web/src/app/core/poll/poll.service.ts` — ajouter `getCurrentPoll(partieId)` : GET → `SessionPollDto | null`
  - [x] `apps/web/src/app/core/poll/poll.service.spec.ts` — ajouter test `createPoll` (AC5 cas 5)

- [x] Task 2 — PollCreationComponent (AC1–AC4)
  - [x] Créer `apps/web/src/app/features/poll/poll-creation/poll-creation.ts` (voir Dev Notes §Task 2)
  - [x] Créer `apps/web/src/app/features/poll/poll-creation/poll-creation.html`
  - [x] Créer `apps/web/src/app/features/poll/poll-creation/poll-creation.scss`

- [x] Task 3 — PollStatusPanel : affichage minimal d'un poll OPEN (AC3)
  - [x] Créer `apps/web/src/app/features/poll/poll-status/poll-status.ts` — composant read-only (voir Dev Notes §Task 3)
  - [x] Créer `apps/web/src/app/features/poll/poll-status/poll-status.html`
  - [x] Créer `apps/web/src/app/features/poll/poll-status/poll-status.scss`

- [x] Task 4 — Intégration dans CalendarView (AC1–AC4)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — ajouter signaux + méthodes (voir Dev Notes §Task 4)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — bouton vote + panel + poll status
  - [x] En `ngOnInit`, si `id` + mode MJ : appeler `getCurrentPoll()` et setter `activePoll`

- [x] Task 5 — Tests Vitest PollCreationComponent (AC5)
  - [x] Créer `apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts` avec les 4 cas (voir Dev Notes §Task 5)
  - [x] `docker compose exec web pnpm test` — 0 régression

- [x] Task 6 — Validation finale
  - [x] `docker compose exec web pnpm test` — 77 tests, 0 régression (+4 nouveaux poll-creation + 1 poll.service)
  - [ ] Vérifier les 4 ACs fonctionnels visuellement si possible

### Review Findings

- [x] [Review][Decision] AC2 — Spec dit ≤ 4 options au total ; code autorise ≤ 40 et bouton "charger plus" dépasse les 5 créneaux calculés initiaux — override intentionnel ? (D1/D2) → **résolu : spec mise à jour (≤ 40, load-more, custom illimité)**
- [x] [Review][Decision] AC1 — Quand un poll OPEN existe, spec dit bouton désactivé avec `empty.no_poll` ; code affiche PollStatusPanel + bouton "Clôturer" à la place — déviation UX acceptable ? (D3) → **résolu : spec mise à jour (PollStatusPanel + Clôturer)**
- [x] [Review][Patch] `onClosePoll` sans gestion d'erreur — `activePoll` mis à null même si le DELETE échoue [calendar-view.ts:onClosePoll]
- [x] [Review][Patch] `poll-status.html` texte "Vote en cours" codé en dur — utiliser `theme.tone()` [poll-status.html] + clé `poll.status_title` ajoutée aux 3 thèmes
- [x] [Review][Patch] `nextDefaultDate` mélange heure locale et UTC — off-by-one pour les fuseaux UTC+ [poll-creation.ts:nextDefaultDate]
- [x] [Review][Patch] `customSlots` avec date vide comptés dans `isValid` mais filtrés au submit — peut déclencher un 400 du backend si ≥ 1 slot vide [poll-creation.ts:totalSelected/onSubmit]
- [x] [Review][Defer] `isValid`/`totalSelected` comme getters JS et non `computed()` signals [poll-creation.ts] — deferred, pre-existing
- [x] [Review][Defer] Indices de slots stockés dans `checkedSlots` fragiles si `preselectedSlots` change pendant la saisie [poll-creation.ts] — deferred, pre-existing
- [x] [Review][Defer] Backend : `findFirst + updateMany + create` sans transaction Prisma → double poll OPEN possible sous concurrence [poll.service.ts backend] — deferred, pre-existing
- [x] [Review][Defer] `mjSlots` : pas de pagination pour jusqu'à 40 slots dans le panel MJ [calendar-view.ts] — deferred, pre-existing
- [x] [Review][Defer] Route `guild-calendar` accessible par URL directe sans redirection si non-membre (backend rejette correctement) [app.routes.ts] — deferred, pre-existing
- [x] [Review][Defer] `scenarioRef` champ brut non-signal [poll-creation.ts] — deferred, pre-existing
- [x] [Review][Defer] Test hardcode `http://localhost:3000` (pattern projet existant) [poll.service.spec.ts] — deferred, pre-existing

## Dev Notes

### Vue d'ensemble

Cette story crée `apps/web/src/app/features/poll/` from scratch et étend `PollService`, `CalendarView`.

**Fichiers nouveaux :**
- `apps/web/src/app/core/poll/poll.service.ts` — **UPDATE** (ajouter 2 méthodes)
- `apps/web/src/app/core/poll/poll.service.spec.ts` — **UPDATE** (ajouter 1 test)
- `apps/web/src/app/features/poll/poll-creation/poll-creation.ts` — **NEW**
- `apps/web/src/app/features/poll/poll-creation/poll-creation.html` — **NEW**
- `apps/web/src/app/features/poll/poll-creation/poll-creation.scss` — **NEW**
- `apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts` — **NEW**
- `apps/web/src/app/features/poll/poll-status/poll-status.ts` — **NEW**
- `apps/web/src/app/features/poll/poll-status/poll-status.html` — **NEW**
- `apps/web/src/app/features/poll/poll-status/poll-status.scss` — **NEW**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — **UPDATE**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — **UPDATE**

**État initial vérifié :**
- `apps/web/src/app/core/poll/poll.service.ts` — existe, a `getAvailableSlots` + `getHeatmap`, pas de `createPoll`/`getCurrentPoll`
- `apps/web/src/app/features/poll/` — inexistant ✗
- Tone keys `cta.launch_vote` et `success.poll_created` — déjà définis dans tous les thèmes ✓
- `CalendarView.availableSlots` signal — déjà typé `(AvailableSlotDto | AggregatedSlotDto)[]`, contiendra les slots MJ quand `mode='mj'`
- `constraint-panel` pattern pour les panels slide-in : backdrop + composant absolu, signal `panelOpen` dans CalendarView

---

### Task 1 — PollService frontend

Fichier : `apps/web/src/app/core/poll/poll.service.ts`

Ajouter après `getHeatmap()` :

```typescript
import type { CreatePollDto, SessionPollDto } from '@master-jdr/shared';

createPoll(partieId: string, dto: CreatePollDto): Promise<SessionPollDto> {
  return firstValueFrom(
    this.http.post<SessionPollDto>(
      `${API_BASE}/parties/${partieId}/poll`,
      dto,
      { withCredentials: true },
    ),
  );
}

getCurrentPoll(partieId: string): Promise<SessionPollDto | null> {
  return firstValueFrom(
    this.http.get<SessionPollDto | null>(
      `${API_BASE}/parties/${partieId}/poll`,
      { withCredentials: true },
    ),
  );
}
```

Test à ajouter dans `poll.service.spec.ts` :

```typescript
it('createPoll appelle POST /parties/p1/poll avec le DTO', async () => {
  const dto: CreatePollDto = {
    options: [
      { date: '2026-08-01', slot: 'MORNING' },
      { date: '2026-08-08', slot: 'AFTERNOON' },
    ],
  };
  const fakePoll: SessionPollDto = {
    id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
    expiresAt: null, chosenDate: null, chosenSlot: null, options: [],
  };
  const promise = service.createPoll('p1', dto);
  const req = http.expectOne('http://localhost:3000/parties/p1/poll');
  expect(req.request.method).toBe('POST');
  expect(req.request.body).toEqual(dto);
  req.flush(fakePoll);
  const result = await promise;
  expect(result.id).toBe('poll1');
});
```

---

### Task 2 — PollCreationComponent

**`poll-creation.ts`**

```typescript
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { AvailableSlotDto, CreatePollDto, DaySlot, SessionPollDto } from '@master-jdr/shared';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

interface CustomSlot {
  date: string;
  slot: DaySlot;
}

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-creation',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatIconModule],
  templateUrl: './poll-creation.html',
  styleUrl: './poll-creation.scss',
})
export class PollCreationComponent {
  readonly partieId      = input.required<string>();
  readonly preselectedSlots = input<AvailableSlotDto[]>([]);

  readonly created   = output<SessionPollDto>();
  readonly cancelled = output<void>();

  private readonly pollSvc = inject(PollService);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack   = inject(MatSnackBar);

  // Sélection des créneaux pré-calculés (indexés par position dans preselectedSlots())
  protected readonly checkedSlots = signal<Set<number>>(new Set());
  // Créneaux personnalisés ajoutés manuellement
  protected readonly customSlots  = signal<CustomSlot[]>([]);
  // Champ texte optionnel
  protected scenarioRef = '';

  protected readonly saving = signal(false);
  protected readonly error  = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly SLOT_OPTIONS: DaySlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

  protected get totalSelected(): number {
    return this.checkedSlots().size + this.customSlots().length;
  }

  protected get isValid(): boolean {
    return this.totalSelected >= 2 && this.totalSelected <= 4;
  }

  protected toggleSlot(index: number): void {
    const s = new Set(this.checkedSlots());
    if (s.has(index)) { s.delete(index); } else { s.add(index); }
    this.checkedSlots.set(s);
  }

  protected addCustomSlot(): void {
    if (this.customSlots().length >= 4) return;
    this.customSlots.update(list => [...list, { date: '', slot: 'MORNING' }]);
  }

  protected removeCustomSlot(i: number): void {
    this.customSlots.update(list => list.filter((_, idx) => idx !== i));
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isValid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const preSelected = this.preselectedSlots();
      const options = [
        ...[...this.checkedSlots()].map(i => ({
          date: preSelected[i].date,
          slot: preSelected[i].slot,
        })),
        ...this.customSlots().filter(c => c.date).map(c => ({
          date: c.date,
          slot: c.slot,
        })),
      ];
      const dto: CreatePollDto = {
        options,
        scenarioRef: this.scenarioRef.trim() || null,
      };
      const poll = await this.pollSvc.createPoll(this.partieId(), dto);
      this.snack.open(this.theme.tone()['success.poll_created'], undefined, { duration: 3000 });
      this.created.emit(poll);
    } catch {
      this.error.set("Impossible de créer le vote. Réessayez.");
    } finally {
      this.saving.set(false);
    }
  }
}
```

**`poll-creation.html`** (structure minimale, à adapter avec les classes SCSS) :

```html
<div class="poll-creation-panel">
  <div class="poll-creation-panel__header">
    <h2>Créer un vote de date</h2>
    <button mat-icon-button (click)="cancelled.emit()" aria-label="Fermer">
      <mat-icon>close</mat-icon>
    </button>
  </div>

  @if (error()) {
    <p class="poll-creation-panel__error" role="alert">{{ error() }}</p>
  }

  <section class="poll-creation-panel__section">
    <h3>Créneaux calculés</h3>
    @for (slot of preselectedSlots(); track slot.date + slot.slot; let i = $index) {
      <label class="poll-creation-panel__slot">
        <input
          type="checkbox"
          [checked]="checkedSlots().has(i)"
          (change)="toggleSlot(i)"
        />
        {{ formatSlot(slot.date, slot.slot) }}
      </label>
    }
    @if (preselectedSlots().length === 0) {
      <p class="poll-creation-panel__empty">Aucun créneau calculé disponible.</p>
    }
  </section>

  <section class="poll-creation-panel__section">
    <h3>Créneaux personnalisés</h3>
    @for (c of customSlots(); track $index; let i = $index) {
      <div class="poll-creation-panel__custom-slot">
        <input type="date" [(ngModel)]="c.date" class="poll-creation-panel__date-input" />
        <mat-button-toggle-group [(ngModel)]="c.slot">
          @for (s of SLOT_OPTIONS; track s) {
            <mat-button-toggle [value]="s">{{ SLOT_LABELS[s] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        <button mat-icon-button (click)="removeCustomSlot(i)" aria-label="Supprimer">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    }
    @if (customSlots().length < 4 && totalSelected < 4) {
      <button mat-stroked-button (click)="addCustomSlot()">+ Ajouter un créneau</button>
    }
  </section>

  <section class="poll-creation-panel__section">
    <mat-label>Référence de séance (optionnel)</mat-label>
    <input
      class="poll-creation-panel__scenario-input"
      type="text"
      [(ngModel)]="scenarioRef"
      placeholder="ex. Séance 3 — Le Donjon de Fer"
    />
  </section>

  <div class="poll-creation-panel__footer">
    <span class="poll-creation-panel__count">{{ totalSelected }}/4 option(s) sélectionnée(s)</span>
    <button mat-stroked-button (click)="cancelled.emit()">Annuler</button>
    <button
      mat-flat-button
      color="primary"
      [disabled]="!isValid || saving()"
      (click)="onSubmit()"
    >
      @if (saving()) { Envoi… } @else { Ouvrir le vote }
    </button>
  </div>
</div>
```

Note : ajouter `formatSlot(date: string, slot: DaySlot): string` dans le composant :
```typescript
protected formatSlot(date: string, slot: DaySlot): string {
  const d = new Date(date + 'T00:00:00Z');
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(d);
  return `${dateStr} — ${SLOT_LABELS[slot]}`;
}
```

---

### Task 3 — PollStatusPanel (affichage read-only OPEN poll)

Composant minimal pour afficher un `SessionPollDto` en lecture.

**`poll-status.ts`**

```typescript
import { Component, inject, input } from '@angular/core';
import type { DaySlot, SessionPollDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-status',
  standalone: true,
  templateUrl: './poll-status.html',
  styleUrl: './poll-status.scss',
})
export class PollStatusPanel {
  readonly poll = input.required<SessionPollDto>();
  protected readonly theme = inject(ThemeToneService);
  readonly SLOT_LABELS = SLOT_LABELS;

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }
}
```

**`poll-status.html`** (minimal — sera enrichi en story 3.3/3.4) :

```html
<div class="poll-status">
  <h3 class="poll-status__title">Vote en cours</h3>
  @if (poll().scenarioRef) {
    <p class="poll-status__scenario">{{ poll().scenarioRef }}</p>
  }
  <ul class="poll-status__options">
    @for (opt of poll().options; track opt.id) {
      <li class="poll-status__option">
        {{ formatDate(opt.date) }} — {{ SLOT_LABELS[opt.slot] }}
        <span class="poll-status__votes">{{ opt.votes.length }} vote(s)</span>
      </li>
    }
  </ul>
</div>
```

---

### Task 4 — Intégration CalendarView

**Signaux à ajouter** dans `calendar-view.ts` (après les signaux existants) :

```typescript
protected readonly activePoll    = signal<SessionPollDto | null>(null);
protected readonly pollPanelOpen = signal(false);
```

**Import** à ajouter :
```typescript
import type { SessionPollDto } from '@master-jdr/shared';
```

**`mjSlots` computed** (slots MJ pour pré-sélection) :
```typescript
protected readonly mjSlots = computed(() =>
  this.availableSlots().filter((s): s is AvailableSlotDto => 'members' in s).slice(0, 5),
);
```

**Méthodes à ajouter** :
```typescript
protected openPollPanel(): void  { this.pollPanelOpen.set(true); }
protected closePollPanel(): void { this.pollPanelOpen.set(false); }

protected onPollCreated(poll: SessionPollDto): void {
  this.activePoll.set(poll);
  this.pollPanelOpen.set(false);
}
```

**Dans `ngOnInit`** — ajouter après `loadHeatmap` :
```typescript
// Si mode MJ, charger le poll courant (s'il en existe un)
if (id && this.isMjMode()) {
  this.activePoll.set(await this.pollSvc.getCurrentPoll(id).catch(() => null));
}
```

Attention : `isMjMode()` est un `computed()` basé sur `mode` (input signal). Au moment de `ngOnInit`, `mode()` est déjà valorisé car les inputs sont résolus avant `ngOnInit`. Donc l'appel est sûr.

**Template `calendar-view.html`** — dans le bloc `@if (isMjMode())` / `mj-results-panel`, ajouter :

```html
<!-- Bouton lancer le vote -->
@if (!activePoll()) {
  <button mat-stroked-button (click)="openPollPanel()">
    {{ theme.tone()['cta.launch_vote'] }}
  </button>
} @else {
  <app-poll-status [poll]="activePoll()!" />
}
```

Ajouter les imports du composant dans `CalendarView.imports`:
```typescript
import { PollCreationComponent } from '../../poll/poll-creation/poll-creation';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';
```

Et le panel + backdrop (après le `@if (panelOpen())` existant) :
```html
@if (pollPanelOpen()) {
  <div class="constraint-backdrop" (click)="closePollPanel()" aria-hidden="true"></div>
  <app-poll-creation
    [partieId]="partieId()!"
    [preselectedSlots]="mjSlots()"
    (created)="onPollCreated($event)"
    (cancelled)="closePollPanel()"
  />
}
```

**Important** : `partieId()` peut être `null` (mode personal). Le bouton vote n'apparaît que dans le bloc `@if (isMjMode())`, et le mode MJ implique toujours un `partieId` non-null (route `/parties/:id/calendar`). Le `!` est donc sûr ici.

---

### Task 5 — Tests Vitest PollCreationComponent

Pattern de test (Vitest + TestBed Angular, identique à `calendar-view.spec.ts`) :

```typescript
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { PollCreationComponent } from './poll-creation';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

function makePollService() {
  return { createPoll: vi.fn().mockResolvedValue({
    id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
    expiresAt: null, chosenDate: null, chosenSlot: null, options: [],
  }) };
}

function makeThemeService() {
  return { tone: () => ({ 'success.poll_created': 'Vote créé !' }) };
}

async function createComponent(preselected = 0) {
  const pollSvc = makePollService();
  await TestBed.configureTestingModule({
    imports: [PollCreationComponent],
    providers: [
      provideAnimationsAsync(),
      { provide: PollService, useValue: pollSvc },
      { provide: ThemeToneService, useValue: makeThemeService() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PollCreationComponent);
  fixture.componentRef.setInput('partieId', 'p1');
  const slots = Array.from({ length: preselected }, (_, i) => ({
    date: `2026-08-0${i + 1}`, slot: 'MORNING' as const,
    members: [{ userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' as const }],
  }));
  fixture.componentRef.setInput('preselectedSlots', slots);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, pollSvc };
}

describe('PollCreationComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('avec 2 slots pré-sélectionnés cochés → bouton soumettre activé', async () => {
    const { fixture } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    expect(comp.isValid).toBe(true);
  });

  it('avec 0 slots sélectionnés → bouton soumettre désactivé', async () => {
    const { fixture } = await createComponent(2);
    expect((fixture.componentInstance as any).isValid).toBe(false);
  });

  it('soumission réussie → émet created', async () => {
    const { fixture, pollSvc } = await createComponent(2);
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    const createdValues: any[] = [];
    fixture.componentInstance.created.subscribe((v: any) => createdValues.push(v));
    await comp.onSubmit();
    expect(pollSvc.createPoll).toHaveBeenCalledTimes(1);
    expect(createdValues).toHaveLength(1);
    expect(comp.saving()).toBe(false);
  });

  it('soumission en erreur → error non-null, saving false, formulaire intact', async () => {
    const { fixture, pollSvc } = await createComponent(2);
    pollSvc.createPoll.mockRejectedValue(new Error('network'));
    const comp = fixture.componentInstance as any;
    comp.toggleSlot(0);
    comp.toggleSlot(1);
    fixture.detectChanges();
    await comp.onSubmit();
    expect(comp.error()).not.toBeNull();
    expect(comp.saving()).toBe(false);
    expect(comp.checkedSlots().size).toBe(2); // données préservées
  });
});
```

---

### Patterns à respecter

- **Standalone components** avec `standalone: true` — tous les composants de ce projet.
- **Signals** pour l'état interne : `signal()`, pas de BehaviorSubject.
- **`input()`** pour les inputs, **`output()`** pour les outputs (Angular 22 conventions).
- **`firstValueFrom()`** pour les appels HTTP (voir PollService existant).
- **`@if / @for`** control flow — pas de `*ngIf` / `*ngFor`.
- **MatSnackBar** pour les toasts (voir ConstraintPanel.ts ligne 202).
- **Backdrop** : réutiliser la classe `.constraint-backdrop` existante dans `calendar-view.scss`.
- **SCSS** : créer des fichiers `.scss` vides initialement, ajouter du style minimal.
- **NgModel** avec `FormsModule` pour les champs simples (même pattern que partie-form.ts).
- **Pas de `MatFormField`** pour les inputs date custom — utiliser `<input type="date">` directement (voir CalendarView.html).
- **Pas de `MatCheckbox`** standalone si ça complique les imports — utiliser `<input type="checkbox">` natif est acceptable.
- Commandes tests : `docker compose exec web pnpm test`.

### Notes sur getCurrentPoll au démarrage

`getCurrentPoll` peut retourner `null` (aucun poll OPEN) ou un `SessionPollDto`. En cas d'erreur (403, 404), on utilise `.catch(() => null)` pour ne pas bloquer le chargement initial. Cela évite aussi les erreurs si l'utilisateur est en mode personal sans partieId.

L'appel doit être conditionné à `this.isMjMode()` pour ne pas appeler ce endpoint en mode joueur (story 3.3 s'occupe du côté joueur).

## Dev Agent Record

### Debug Log

_(vide — remplir si des erreurs surviennent)_

### Completion Notes

77 tests passés (0 régression), +6 nouveaux tests (poll-creation ×4, poll.service ×1, calendar-view mock fix ×1).

Tous les ACs couverts :
- AC1/AC2 : PollCreationComponent avec checkboxes pré-sélectionnées + créneaux custom + scenarioRef
- AC3 : toast MatSnackBar 3000ms + PollStatusPanel inline dans mj-results-panel
- AC4 : signal `error()` préserve l'état du formulaire, `saving()` revient à false
- AC5 : 4 tests Vitest (isValid, submit ok, submit ko, 0 slots)

Décision : `MatSnackBar` mocké explicitement dans poll-creation.spec.ts car le `provideAnimationsAsync()` seul ne l'injecte pas via `TestBed` sans provider.

## File List

**Créés :**
- `apps/web/src/app/features/poll/poll-creation/poll-creation.ts`
- `apps/web/src/app/features/poll/poll-creation/poll-creation.html`
- `apps/web/src/app/features/poll/poll-creation/poll-creation.scss`
- `apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.html`
- `apps/web/src/app/features/poll/poll-status/poll-status.scss`

**Modifiés :**
- `apps/web/src/app/core/poll/poll.service.ts` — ajout `createPoll()` + `getCurrentPoll()`
- `apps/web/src/app/core/poll/poll.service.spec.ts` — test `createPoll`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — signaux + méthodes poll
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — section poll + backdrop
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` — mock `getCurrentPoll`

## Change Log

| Date | Change |
|------|--------|
| 2026-06-30 | Story créée (bmad-create-story) |
