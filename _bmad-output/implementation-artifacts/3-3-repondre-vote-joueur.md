---
baseline_commit: ad9f741c4d94e79b8c87180b020f09e9d12229a3
---

# Story 3.3 : Répondre au vote — frontend joueur

Status: done

## Story

As a player,
I want to respond to an open date poll from my dashboard and the guild calendar,
So that the GM knows when I'm available.

## Acceptance Criteria

**AC1 — Badge "vote en attente" dans le dashboard joueur**

Given un poll OPEN existe pour une partie dont le joueur est membre
When le joueur consulte son dashboard (mode joueur)
Then un badge/bandeau thématisé (`theme.tone()['poll.vote_pending']`) est visible sur la carte de la partie
And ce badge est un lien vers `/parties/:id/guild-calendar`

**AC2 — Affichage du PollResponseComponent dans guild-calendar**

Given le joueur navigue vers `/parties/:id/guild-calendar`
When `GET /parties/:id/poll` retourne un poll OPEN
Then le `PollResponseComponent` s'affiche en haut du panneau `.guild-slots-panel`
And chaque option affiche : date formatée, créneau, 3 boutons YES / NO / MAYBE
And les options déjà répondues affichent la réponse courante en surbrillance (bouton actif)

**AC3 — Soumission des réponses**

Given le joueur sélectionne au moins une réponse (YES/NO/MAYBE sur au moins une option)
When il clique sur le bouton de confirmation (`theme.tone()['cta.confirm_votes']`)
Then `POST /parties/:id/poll/:pollId/vote` est appelé pour chaque option répondue
And un toast `theme.tone()['success.vote_cast']` s'affiche (MatSnackBar, 3000 ms)
And le composant affiche les réponses mises à jour (re-fetch du poll via `getCurrentPoll`)

**AC4 — Changement de réponse**

Given le joueur a déjà répondu à une ou plusieurs options
When il modifie une réponse et reconfirme
Then la réponse précédente est écrasée (upsert backend — story 3.1)
And l'UI reflète la réponse mise à jour après re-fetch

**AC5 — Poll fermé**

Given le poll est CLOSED (clôturé par le MJ ou expiré)
When le joueur consulte la vue guild-calendar
Then les boutons YES/NO/MAYBE sont désactivés
And un message `theme.tone()['poll.vote_closed']` indique que le vote est fermé

**AC6 — Tests unitaires (Vitest)**

Given `PollResponseComponent` testé dans `poll-response.spec.ts`
When la suite s'exécute
Then les cas suivants passent :
  1. Le composant contient autant d'options que `fakePoll.options`
  2. `setAnswer('opt1', 'YES')` → `pendingAnswers().get('opt1') === 'YES'`
  3. Confirmation → `castVote` appelé 2× (une par sélection), toast affiché
  4. Poll CLOSED → `isClosed()` vrai, `setAnswer` sans effet
And `PollService.castVote` testé dans `poll.service.spec.ts` :
  5. `castVote` appelle `POST /parties/p1/poll/poll1/vote` avec le DTO

## Tasks/Subtasks

- [x] Task 1 — PollService frontend : ajouter `castVote()` (AC3, AC6)
  - [x] `apps/web/src/app/core/poll/poll.service.ts` — ajouter `castVote(partieId, pollId, dto): Promise<void>`
  - [x] `apps/web/src/app/core/poll/poll.service.spec.ts` — ajouter test castVote (AC6 cas 5)

- [x] Task 2 — PollResponseComponent (NEW) (AC2–AC5)
  - [x] Créer `apps/web/src/app/features/poll/poll-response/poll-response.ts`
  - [x] Créer `apps/web/src/app/features/poll/poll-response/poll-response.html`
  - [x] Créer `apps/web/src/app/features/poll/poll-response/poll-response.scss`

- [x] Task 3 — Tone keys (AC1, AC3, AC5)
  - [x] `apps/web/src/app/core/theme/tones.ts` — ajouter `poll.vote_pending`, `success.vote_cast`, `cta.confirm_votes`, `poll.vote_closed` dans les 3 thèmes

- [x] Task 4 — Intégration CalendarView guild-calendar (AC2–AC5)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — charger `activePoll` en mode joueur (retirer la garde `if (isMjMode())`), ajouter `onPollResponded()`, ajouter `PollResponseComponent` aux imports
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — afficher `app-poll-response` en haut du `.guild-slots-panel` si `activePoll()`

- [x] Task 5 — Badge dashboard joueur (AC1)
  - [x] `apps/web/src/app/features/dashboard/dashboard.ts` — ajouter `openPolls` signal, injection `PollService`, chargement via `effect()` réactif aux `playerParties`
  - [x] `apps/web/src/app/features/dashboard/dashboard.html` — badge conditionnel sur les cartes joueur

- [x] Task 6 — Tests Vitest PollResponseComponent (AC6)
  - [x] Créer `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts` (voir Dev Notes §Task 6)
  - [x] `docker compose exec web pnpm test` — 0 régression

- [x] Task 7 — Validation finale
  - [x] `docker compose exec web pnpm test` — 0 régression (16 fichiers / 82 tests passent, +5 nouveaux tests)

### Hors périmètre initial (corrigé pendant la validation finale)

- [x] Fix `calendar-month-view.spec.ts` — test `does not mark any cell as isToday in a past month` était sensible à la date courante (les cellules de débordement d'un mois adjacent pouvaient légitimement contenir "aujourd'hui"). Corrigé pour ne vérifier que les cellules du mois affiché (`isCurrentMonth`). Décidé avec l'utilisateur pendant la session.

## Dev Notes

### Vue d'ensemble

Story 3.3 crée `apps/web/src/app/features/poll/poll-response/` from scratch et étend `PollService`, `CalendarView`, `Dashboard`, et `tones.ts`.

**Fichiers nouveaux :**
- `apps/web/src/app/features/poll/poll-response/poll-response.ts`
- `apps/web/src/app/features/poll/poll-response/poll-response.html`
- `apps/web/src/app/features/poll/poll-response/poll-response.scss`
- `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts`

**Fichiers modifiés :**
- `apps/web/src/app/core/poll/poll.service.ts` — ajouter `castVote()`
- `apps/web/src/app/core/poll/poll.service.spec.ts` — ajouter test castVote
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/features/dashboard/dashboard.html`
- `apps/web/src/app/core/theme/tones.ts`

---

### Task 1 — PollService.castVote()

**Fichier :** `apps/web/src/app/core/poll/poll.service.ts`

État actuel (post story 3-2) : le fichier a `createPoll`, `getCurrentPoll`, `closePoll`. Ajouter après `closePoll()` :

```typescript
castVote(partieId: string, pollId: string, dto: CastVoteDto): Promise<void> {
  return firstValueFrom(
    this.http.post<void>(
      `${API_BASE}/parties/${partieId}/poll/${pollId}/vote`,
      dto,
      { withCredentials: true },
    ),
  );
}
```

Ajouter `CastVoteDto` à la ligne d'import existante :

```typescript
import type { AggregatedSlotDto, AvailableSlotDto, CastVoteDto, CreatePollDto, SessionPollDto } from '@master-jdr/shared';
```

`CastVoteDto` est défini dans `packages/shared/src/index.ts` :
```typescript
export interface CastVoteDto {
  optionId: string;
  answer: VoteAnswer;  // 'YES' | 'NO' | 'MAYBE'
}
```

**Backend `castVote` retourne `void`** (no body) — c'est confirmé dans `apps/api/src/poll/poll.service.ts:58` : `async castVote(...): Promise<void>`.

**Test dans `poll.service.spec.ts`** — même pattern que `createPoll` (déjà dans ce fichier) :

```typescript
it('castVote appelle POST /parties/p1/poll/poll1/vote avec le DTO', async () => {
  const dto: CastVoteDto = { optionId: 'opt1', answer: 'YES' };
  const promise = service.castVote('p1', 'poll1', dto);
  const req = http.expectOne('http://localhost:3000/parties/p1/poll/poll1/vote');
  expect(req.request.method).toBe('POST');
  expect(req.request.body).toEqual(dto);
  req.flush(null);
  await promise;
});
```

---

### Task 2 — PollResponseComponent

**Fichier :** `apps/web/src/app/features/poll/poll-response/poll-response.ts`

```typescript
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { CastVoteDto, DaySlot, SessionPollDto, VoteAnswer } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-response',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './poll-response.html',
  styleUrl: './poll-response.scss',
})
export class PollResponseComponent implements OnInit {
  readonly partieId = input.required<string>();
  readonly poll     = input.required<SessionPollDto>();

  readonly responded = output<SessionPollDto>();

  private readonly pollSvc = inject(PollService);
  private readonly authSvc = inject(AuthService);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack   = inject(MatSnackBar);

  protected readonly pendingAnswers = signal<Map<string, VoteAnswer>>(new Map());
  protected readonly saving         = signal(false);
  protected readonly error          = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly VOTE_OPTIONS: VoteAnswer[] = ['YES', 'NO', 'MAYBE'];

  protected readonly isClosed = computed(() => this.poll().status === 'CLOSED');
  protected readonly hasSelection = computed(() => this.pendingAnswers().size > 0);

  ngOnInit(): void {
    const userId = this.authSvc.currentUser()?.id;
    if (!userId) return;
    const map = new Map<string, VoteAnswer>();
    for (const opt of this.poll().options) {
      const myVote = opt.votes.find(v => v.userId === userId);
      if (myVote) map.set(opt.id, myVote.answer);
    }
    this.pendingAnswers.set(map);
  }

  protected setAnswer(optionId: string, answer: VoteAnswer): void {
    if (this.isClosed()) return;
    const m = new Map(this.pendingAnswers());
    m.set(optionId, answer);
    this.pendingAnswers.set(m);
  }

  protected getAnswer(optionId: string): VoteAnswer | null {
    return this.pendingAnswers().get(optionId) ?? null;
  }

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }

  protected async onConfirm(): Promise<void> {
    if (!this.hasSelection() || this.saving() || this.isClosed()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const dtos: CastVoteDto[] = [...this.pendingAnswers()].map(
        ([optionId, answer]) => ({ optionId, answer }),
      );
      await Promise.all(
        dtos.map(dto => this.pollSvc.castVote(this.partieId(), this.poll().id, dto)),
      );
      this.snack.open(this.theme.tone()['success.vote_cast'], undefined, { duration: 3000 });
      const refreshed = await this.pollSvc.getCurrentPoll(this.partieId());
      if (refreshed) this.responded.emit(refreshed);
    } catch {
      this.error.set("Impossible d'enregistrer le vote. Réessayez.");
    } finally {
      this.saving.set(false);
    }
  }
}
```

**⚠️ `formatDate(iso)` :** les dates des options viennent du backend sous forme ISO complète (`"2026-08-01T00:00:00.000Z"`). NE PAS concaténer `'T00:00:00Z'` — utiliser `new Date(iso)` directement. C'est différent de `poll-creation.ts` qui reçoit des `AvailableSlotDto` avec des dates `YYYY-MM-DD`.

**Template `poll-response.html`** :

```html
<div class="poll-response">
  <h3 class="poll-response__title">{{ theme.tone()['poll.status_title'] }}</h3>
  @if (poll().scenarioRef) {
    <p class="poll-response__scenario">{{ poll().scenarioRef }}</p>
  }

  @for (opt of poll().options; track opt.id) {
    <div class="poll-response__option">
      <span class="poll-response__date">
        {{ formatDate(opt.date) }} — {{ SLOT_LABELS[opt.slot] }}
      </span>
      <div class="poll-response__buttons">
        @for (a of VOTE_OPTIONS; track a) {
          <button
            mat-stroked-button
            [class.poll-response__btn--active]="getAnswer(opt.id) === a"
            [disabled]="isClosed() || saving()"
            (click)="setAnswer(opt.id, a)"
          >{{ a }}</button>
        }
      </div>
    </div>
  }

  @if (isClosed()) {
    <p class="poll-response__closed">{{ theme.tone()['poll.vote_closed'] }}</p>
  } @else {
    <div class="poll-response__footer">
      @if (error()) {
        <p class="poll-response__error">{{ error() }}</p>
      }
      <button
        mat-flat-button
        color="primary"
        [disabled]="!hasSelection() || saving()"
        (click)="onConfirm()"
      >
        @if (saving()) { Envoi… } @else { {{ theme.tone()['cta.confirm_votes'] }} }
      </button>
    </div>
  }
</div>
```

**SCSS `poll-response.scss`** — créer un fichier minimal (même approche que `poll-creation.scss`) :
- `.poll-response` : padding, background `var(--mat-sys-surface-container-high, #f0ebe3)`
- `.poll-response__option` : flex, align-items center, gap 8px, border-bottom
- `.poll-response__btn--active` : couleur primaire (surbrillance de la réponse active)
- `.poll-response__error` : `color: var(--mat-sys-error, #c00)`

---

### Task 3 — Tone Keys

Ajouter dans `apps/web/src/app/core/theme/tones.ts`, section `calendrier & vote` des 3 thèmes (après `poll.status_title`) :

| Clé | grimoire-des-ombres | foret-ancienne | medieval-steampunk |
|-----|---------------------|----------------|-------------------|
| `poll.vote_pending` | `'Vote de date en cours — parchemin en attente'` | `'L\'écureuil attend ta réponse au vote'` | `'Registre de vote — réponse requise'` |
| `success.vote_cast` | `'Réponse inscrite dans le grimoire.'` | `'L\'écureuil a transmis ta réponse.'` | `'Réponse enregistrée dans le registre.'` |
| `cta.confirm_votes` | `'Sceller mes réponses'` | `'Transmettre mes réponses'` | `'Valider dans le registre'` |
| `poll.vote_closed` | `'Ce vote est clos. L\'oracle a tranché.'` | `'Le vote de la forêt est terminé.'` | `'Registre de vote verrouillé.'` |

---

### Task 4 — Intégration CalendarView

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`

**État actuel (post 3-2) — bloc ngOnInit à modifier :**

```typescript
// AVANT :
if (this.isMjMode()) {
  this.activePoll.set(await this.pollSvc.getCurrentPoll(id).catch(() => null));
}

// APRÈS (retirer la garde — `getCurrentPoll` est accessible à tous les membres, pas seulement le MJ) :
this.activePoll.set(await this.pollSvc.getCurrentPoll(id).catch(() => null));
```

Ajouter la méthode :

```typescript
protected onPollResponded(poll: SessionPollDto): void {
  this.activePoll.set(poll);
}
```

Ajouter `PollResponseComponent` aux imports :

```typescript
import { PollResponseComponent } from '../../poll/poll-response/poll-response';
// Ajouter PollResponseComponent dans imports: [..., PollResponseComponent]
```

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`

État actuel du bloc `guild-slots-panel` (ligne 90–119 du fichier actuel) :

```html
@if (!isMjMode() && partieId()) {
  <div class="guild-slots-panel" #slotsPanel>
    <div class="date-range-form">...</div>
    <app-available-slots ... />
  </div>
}
```

Modifier pour ajouter `app-poll-response` EN HAUT du panneau :

```html
@if (!isMjMode() && partieId()) {
  <div class="guild-slots-panel" #slotsPanel>
    @if (activePoll()) {
      <app-poll-response
        [partieId]="partieId()!"
        [poll]="activePoll()!"
        (responded)="onPollResponded($event)"
      />
    }
    <div class="date-range-form">
      <!-- ... inchangé ... -->
    </div>
    <app-available-slots
      [slots]="availableSlots()"
      [loading]="slotsLoading()"
      [error]="slotsError()"
    />
  </div>
}
```

---

### Task 5 — Badge dashboard joueur

**Fichier :** `apps/web/src/app/features/dashboard/dashboard.ts`

**⚠️ Problème de timing :** `Shell.ngOnInit` lance `refreshPlayerParties()` avec `void` (fire-and-forget, sans `await`). Au moment où `Dashboard.ngOnInit` s'exécute, `playerParties()` est vide. Ne pas appeler `loadOpenPolls()` dans `ngOnInit` — utiliser un **`effect()`** pour réagir quand `playerParties` se remplit.

```typescript
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import type { InvitationDto, SessionPollDto } from '@master-jdr/shared';
import { PollService } from '../../core/poll/poll.service';

// Dans la classe Dashboard, ajouter :
private readonly pollSvc = inject(PollService);
protected readonly openPolls = signal<Map<string, SessionPollDto>>(new Map());

constructor() {
  effect(() => {
    const parties = this.playerParties();
    if (parties.length > 0) void this.loadOpenPolls();
  });
}

private async loadOpenPolls(): Promise<void> {
  const parties = this.playerParties();
  if (parties.length === 0) return;
  const results = await Promise.allSettled(
    parties.map(p =>
      this.pollSvc.getCurrentPoll(p.id).then(poll => ({ id: p.id, poll })),
    ),
  );
  const map = new Map<string, SessionPollDto>();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.poll) {
      map.set(r.value.id, r.value.poll);
    }
  }
  this.openPolls.set(map);
}
```

**Note :** `Dashboard` n'a pas de `constructor()` actuellement (utilise `ngOnInit` seulement). Ajouter le `constructor()` avec le `effect()`. L'`effect()` se déclenchera automatiquement quand `playerParties()` signal changera de `[]` à la liste réelle.

**Attention :** l'`effect()` se redéclenchera si `playerParties` est mis à jour ultérieurement (ex : accept/decline d'invitation → `refreshPlayerParties()`). C'est voulu — rechargement des polls après changement de membership.

**Fichier :** `apps/web/src/app/features/dashboard/dashboard.html`

Dans la boucle `@for (p of playerParties(); track p.id)` du mode joueur (actuellement ligne 46–51), modifier la `mat-card` :

```html
<mat-card class="tile" [routerLink]="['/parties', p.id]">
  <mat-card-header>
    <mat-card-title>{{ p.name }}</mat-card-title>
    <mat-card-subtitle>{{ system(p.gameSystemId) }} · {{ kind(p.kind) }}</mat-card-subtitle>
  </mat-card-header>
  @if (openPolls().has(p.id)) {
    <mat-card-content class="poll-badge">
      <a
        mat-stroked-button
        [routerLink]="['/parties', p.id, 'guild-calendar']"
        (click)="$event.stopPropagation()"
      >
        {{ theme.tone()['poll.vote_pending'] }}
      </a>
    </mat-card-content>
  }
</mat-card>
```

**`$event.stopPropagation()`** est nécessaire car la `mat-card` a déjà un `[routerLink]` — sans ça, le clic sur le bouton naviguerait vers `/parties/:id` plutôt que vers `/parties/:id/guild-calendar`.

**Vérifier que `RouterLink` est dans `Dashboard.imports`** — il l'est déjà (ligne 5 de `dashboard.ts` actuel).

---

### Task 6 — Tests Vitest PollResponseComponent

**Fichier :** `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts`

Même pattern que `poll-creation.spec.ts` (TestBed + `setInput` + `vi.fn()`).

```typescript
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { PollResponseComponent } from './poll-response';
import { PollService } from '../../../core/poll/poll.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import type { SessionPollDto } from '@master-jdr/shared';

const fakePoll: SessionPollDto = {
  id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
  expiresAt: null, chosenDate: null, chosenSlot: null,
  options: [
    { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING', votes: [] },
    { id: 'opt2', date: '2026-08-08T00:00:00.000Z', slot: 'AFTERNOON',
      votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' }] },
  ],
};

function makePollService() {
  return {
    castVote: vi.fn().mockResolvedValue(undefined),
    getCurrentPoll: vi.fn().mockResolvedValue(fakePoll),
  };
}

function makeAuthService(userId = 'u1') {
  return { currentUser: () => ({ id: userId, email: 'alice@test.com', pseudo: 'Alice', role: 'USER', createdAt: '' }) };
}

function makeThemeService() {
  return { tone: () => ({
    'success.vote_cast': 'Réponse enregistrée !',
    'cta.confirm_votes': 'Confirmer',
    'poll.vote_closed': 'Vote clos',
    'poll.status_title': 'Vote en cours',
  })};
}

function makeSnackBar() {
  return { open: vi.fn() };
}

async function createComponent(poll = fakePoll, userId = 'u1') {
  const pollSvc = makePollService();
  const snack = makeSnackBar();
  await TestBed.configureTestingModule({
    imports: [PollResponseComponent],
    providers: [
      provideAnimationsAsync(),
      { provide: PollService, useValue: pollSvc },
      { provide: AuthService, useValue: makeAuthService(userId) },
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: MatSnackBar, useValue: snack },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PollResponseComponent);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('poll', poll);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, pollSvc, snack };
}

describe('PollResponseComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('contient autant d\'options que le poll', async () => {
    const { fixture } = await createComponent();
    expect(fixture.componentInstance.poll().options).toHaveLength(2);
  });

  it('setAnswer(opt1, YES) → pendingAnswers contient YES pour opt1', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.setAnswer('opt1', 'YES');
    expect(comp.pendingAnswers().get('opt1')).toBe('YES');
  });

  it('confirmation → castVote appelé 2×, toast affiché', async () => {
    const { fixture, pollSvc, snack } = await createComponent();
    const comp = fixture.componentInstance as any;
    comp.setAnswer('opt1', 'NO');
    comp.setAnswer('opt2', 'MAYBE');
    await comp.onConfirm();
    expect(pollSvc.castVote).toHaveBeenCalledTimes(2);
    expect(snack.open).toHaveBeenCalledWith('Réponse enregistrée !', undefined, { duration: 3000 });
  });

  it('poll CLOSED → isClosed vrai, setAnswer sans effet', async () => {
    const closedPoll: SessionPollDto = { ...fakePoll, status: 'CLOSED' };
    const { fixture } = await createComponent(closedPoll);
    const comp = fixture.componentInstance as any;
    expect(comp.isClosed()).toBe(true);
    comp.setAnswer('opt1', 'YES');
    expect(comp.pendingAnswers().get('opt1')).toBeUndefined();
  });
});
```

**Note sur le test 3 :** `fakePoll.options[1]` a déjà un vote de `u1 → YES`. Après `ngOnInit`, `pendingAnswers` contient `{opt2: 'YES'}`. Le test ajoute `opt1 → NO` et modifie `opt2 → MAYBE` → 2 `castVote` total attendus.

---

### Patterns à respecter

- **Standalone components** avec `standalone: true` — tous les composants du projet
- **Signals** : `signal()`, `computed()`, `input.required()`, `output()`
- **`@if / @for`** control flow (pas `*ngIf` / `*ngFor`)
- **`firstValueFrom()`** pour HTTP (pas subscribe)
- **`MatSnackBar`** pour les toasts — injecter directement, fournir dans les tests (voir `poll-creation.spec.ts`)
- **`import type`** pour les types de `@master-jdr/shared`
- **`effect()` dans `constructor()`** pour réagir aux signaux — Angular 22 : `effect()` doit être dans un contexte d'injection (constructor, field, injection context)
- Commandes tests : `docker compose exec web pnpm test`

### Types partagés disponibles (`packages/shared/src/index.ts`)

```typescript
export type VoteAnswer = 'YES' | 'NO' | 'MAYBE';
export interface CastVoteDto { optionId: string; answer: VoteAnswer; }
export interface PollVoteDto  { userId: string; pseudo: string; answer: VoteAnswer; }
export interface PollOptionDto { id: string; date: string; slot: DaySlot; votes: PollVoteDto[]; }
export interface SessionPollDto {
  id: string; partieId: string; status: PollStatus;
  scenarioRef: string | null; expiresAt: string | null;
  chosenDate: string | null; chosenSlot: DaySlot | null;
  options: PollOptionDto[];
}
```

### Endpoint backend (confirmé)

`POST /parties/:id/poll/:pollId/vote` — `AuthenticatedGuard` requis — accepte tout membre (pas seulement MJ) — retourne `void` (204/200 sans body).

### Tone keys existantes (ne pas dupliquer)

Déjà présentes dans `tones.ts` (post story 3-2) : `cta.launch_vote`, `empty.no_poll`, `success.poll_created`, `success.date_chosen`, `cta.cancel_poll`, `cta.choose_date`, `poll.status_title`.

## Dev Agent Record

### Debug Log

- Docker Desktop n'était pas lancé au démarrage de la session ; une fois relancé, `deps` (service dédié à l'installation des node_modules dans des volumes nommés) a été utilisé pour resynchroniser les workspaces avant de lancer les tests.
- Le conteneur `web` avait besoin d'un `docker compose restart web` après resynchronisation des dépendances pour que la compilation Sass (`@angular/material`) reparte sur un état propre.

### Completion Notes

Implémentation complète des 7 tasks de la story :
- `PollService.castVote()` ajouté avec test HTTP dédié.
- `PollResponseComponent` créé (standalone, signals, pré-population des votes existants via `AuthService.currentUser()`, formatage de date `new Date(iso)` sans concaténation de fuseau).
- 4 clés de microcopy ajoutées dans les 3 thèmes (`poll.vote_pending`, `success.vote_cast`, `cta.confirm_votes`, `poll.vote_closed`).
- `CalendarView` : garde `isMjMode()` retirée autour de `getCurrentPoll` (le poll est maintenant chargé pour tous les membres) ; `app-poll-response` intégré en haut du `guild-slots-panel`.
- `Dashboard` : badge "vote en attente" sur les cartes joueur, chargement des polls ouverts via un `effect()` réactif à `playerParties()` (contourne le problème de timing où `Shell.ngOnInit` peuple ce signal de façon asynchrone sans `await`).
- 5 nouveaux tests Vitest (4 sur `PollResponseComponent`, 1 sur `PollService.castVote`).
- Suite complète : 16 fichiers de test / 82 tests, 0 échec.

Hors périmètre strict mais corrigé avec l'accord de l'utilisateur pendant la validation finale : un test préexistant dans `calendar-month-view.spec.ts` échouait car sensible à la date du jour (cellules de débordement d'un mois adjacent pouvant légitimement contenir "aujourd'hui"). Corrigé en filtrant sur `isCurrentMonth`.

Discussion parallèle : l'utilisateur a demandé si un détail des votes (qui a voté, pour quoi) côté vue MJ était déjà planifié. Confirmé que c'est couvert par FR14 et la story `3.4-resultat-vote-choix` déjà présente dans le backlog (prochaine story après celle-ci) — aucune nouvelle story n'a été créée.

## File List

**Nouveaux fichiers :**
- `apps/web/src/app/features/poll/poll-response/poll-response.ts`
- `apps/web/src/app/features/poll/poll-response/poll-response.html`
- `apps/web/src/app/features/poll/poll-response/poll-response.scss`
- `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts`

**Fichiers modifiés :**
- `apps/web/src/app/core/poll/poll.service.ts`
- `apps/web/src/app/core/poll/poll.service.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/features/dashboard/dashboard.html`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts` (fix hors périmètre, test date-dépendant)

**Fichiers modifiés (code review — decision + patches) :**
- `apps/web/src/app/features/poll/poll-response/poll-response.ts`
- `apps/web/src/app/features/poll/poll-response/poll-response.html`
- `apps/web/src/app/features/poll/poll-response/poll-response.scss`
- `apps/web/src/app/features/poll/poll-response/poll-response.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.ts`

### Review Findings

- [x] [Review][Decision] Échec partiel de `Promise.all(castVote)` — RÉSOLU : bascule sur `Promise.allSettled`, options en échec marquées visuellement (`failedOptionIds`, classe CSS `--failed` + icône ⚠), message `"X/Y réponse(s) enregistrée(s). Réessayez pour les autres."` au lieu d'une erreur générique. Test `poll-response.spec.ts` ajouté pour ce chemin. Résout au passage le patch "toast avant refetch" ci-dessous (toast désormais conditionné à `failed.size === 0`, affiché après le refetch). [`poll-response.ts:70-100`]
- [x] [Review][Patch] `AuthService.currentUser()` lu de façon synchrone dans `ngOnInit` — RÉSOLU : remplacé par un `effect()` dans le constructeur réagissant à `authSvc.currentUser()`, lecture de `poll()` volontairement `untracked()` pour ne pas resynchroniser sur chaque remplacement de l'input poll. [`poll-response.ts:42-58`]
- [x] [Review][Patch] Toast de succès affiché avant la fin du refetch — RÉSOLU dans le cadre de la décision ci-dessus (toast déplacé après refetch, conditionné à l'absence d'échec) [`poll-response.ts:70-100`]
- [x] [Review][Patch] `Dashboard.loadOpenPolls()` — RÉSOLU : ajout d'un compteur de séquence (`loadOpenPollsSeq`) pour ignorer les réponses obsolètes si un nouvel appel a démarré entre-temps. [`dashboard.ts:44-62`]
- [x] [Review][Defer] `calendar-view.ts` charge le poll sans condition même en mode personnel avec `partieId` — changement voulu par le spec (retrait de la garde `isMjMode()`), mais pas de garde supplémentaire pour les contextes hors guild-calendar — deferred, pre-existing pattern extended by this story [`calendar-view.ts:97`]
- [x] [Review][Defer] `onConfirm()` ne revérifie pas `isClosed()` juste avant l'envoi (fenêtre de course avec une clôture serveur concurrente) — deferred, le serveur valide déjà côté backend [`poll-response.ts:78`]
- [x] [Review][Defer] `getCurrentPoll()` retournant `null` après un vote réussi (poll supprimé entre-temps) est traité comme un succès silencieux, sans réconciliation d'état — deferred, cas limite rare [`poll-response.ts:82-83`]
- [x] [Review][Defer] `pendingAnswers` non resynchronisé si l'input `poll()` change d'instance en cours de vie du composant — deferred, risque réel limité (IDs UUID, pas de collision) [`poll-response.ts:20,41-50`]
- [x] [Review][Defer] Badge "vote en attente" du dashboard reste affiché même si le joueur a déjà répondu à toutes les options — conforme au texte littéral de l'AC1 (conditionné uniquement sur "poll OPEN existe"), amélioration UX à envisager dans une story future [`dashboard.html:52-62`]
- [x] [Review][Defer] `effect()` du dashboard se redéclenche à chaque écriture de `playerParties()` même sans changement de contenu (égalité par référence) — gaspillage réseau mineur, non bloquant [`dashboard.ts:33-38`]

## Change Log

| Date | Change |
|------|--------|
| 2026-07-01 | Story créée (bmad-create-story) |
| 2026-07-01 | Implémentation complète (7 tasks) + fix test date-dépendant calendar-month-view.spec.ts. 82 tests passent, 0 régression. |
| 2026-07-02 | Code review (3 layers : Blind Hunter, Edge Case Hunter, Acceptance Auditor) : 1 decision-needed, 3 patch, 6 defer, 4 dismissed. |
| 2026-07-02 | Decision + 2 patches appliqués : Promise.allSettled avec marquage visuel des échecs partiels, effect() pour la race AuthService.currentUser(), garde de séquence pour Dashboard.loadOpenPolls(). 83 tests passent, 0 régression. |
