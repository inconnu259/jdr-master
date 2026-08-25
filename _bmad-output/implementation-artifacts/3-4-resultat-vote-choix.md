---
baseline_commit: ad9f741c4d94e79b8c87180b020f09e9d12229a3
---

# Story 3.4 : Résultat du vote & choix de la date finale — MJ

Status: done

## Story

As a GM,
I want to see a summary of all player responses and choose the final session date,
So that I can confirm the next session with full visibility of everyone's availability.

## Acceptance Criteria

**AC1 — Récapitulatif du vote (breakdown par option)**

Given un poll OPEN avec au moins une réponse
When le MJ consulte le panneau de vote sur `/parties/:id/calendar` (mode MJ)
Then chaque option affiche le décompte YES / NO / MAYBE
And chaque option liste les votants avec badge (pseudo + icône ⚔ + réponse)
And une option où tous les votants ont répondu YES est visuellement mise en évidence

**AC2 — Choisir la date finale**

Given le MJ consulte le récapitulatif du vote
When il clique sur `theme.tone()['cta.choose_date']` ("Sceller ce créneau") sur une option
Then une boîte de dialogue de confirmation apparaît, affichant la date et le créneau sélectionnés
And à la confirmation, `PATCH /parties/:id/poll/:pollId/choose` est appelé avec `{ optionId }`
And le poll passe à `CLOSED`, `chosenDate`/`chosenSlot` sont enregistrés
And la partie voit son `nextSessionDate`/`nextSessionSlot` mis à jour côté backend
And un toast `theme.tone()['success.date_chosen']` s'affiche
And le panneau de vote MJ disparaît (plus de poll OPEN)

**AC3 — Date confirmée visible sur la page de la partie**

Given une date a été choisie (poll CLOSED, `partie.nextSessionDate` renseigné)
When le MJ navigue vers `/parties/:id`
Then le widget de planification (`partie-detail.ts` — déjà existant, Story 2.3) affiche la nouvelle date confirmée
And ce comportement est déjà couvert par le code existant (`nextSessionLabel` computed) — aucun changement requis côté `partie-detail`, seule la vérification par test compte

**AC4 — Annuler le vote sans choisir de date**

Given un poll OPEN existe
When le MJ clique sur le bouton d'annulation (`theme.tone()['cta.cancel_poll']`)
Then `DELETE /parties/:id/poll/:pollId` est appelé (déjà implémenté en story 3.2 via `onClosePoll()`)
And le poll disparaît de l'état OPEN, aucune date n'est enregistrée
And **seul le libellé du bouton change** dans cette story : remplacer le texte codé en dur `"Clôturer le vote"` par `theme.tone()['cta.cancel_poll']`, pour correspondre à l'intitulé attendu par le spec ("Annuler le vote")

**AC5 — Tests unitaires (Vitest)**

Given les nouveaux comportements ci-dessus
When la suite de tests s'exécute
Then `poll-status.spec.ts` (nouveau fichier) couvre :
  1. Décompte YES/NO/MAYBE correct par option
  2. Badge par votant affiché (pseudo + réponse)
  3. Option 100% YES marquée avec une classe/attribut de mise en évidence
  4. Clic sur "Sceller ce créneau" + confirmation dialog → émission de l'event `chosen` avec le bon `optionId`
  5. Clic + annulation du dialog → **pas** d'émission de `chosen`
And `poll.service.spec.ts` : test `chooseDate` → `PATCH /parties/p1/poll/poll1/choose` avec le DTO
And `calendar-view.spec.ts` : test `onChooseDate()` → appelle `pollSvc.chooseDate`, poll remis à `null`

## Tasks/Subtasks

- [x] Task 1 — Type partagé `ChooseDateDto` (AC2)
  - [x] `packages/shared/src/index.ts` — ajouter `export interface ChooseDateDto { optionId: string; }` (miroir du DTO backend `apps/api/src/poll/dto/choose-date.dto.ts`, déjà existant et inchangé)

- [x] Task 2 — PollService frontend : `chooseDate()` (AC2, AC5)
  - [x] `apps/web/src/app/core/poll/poll.service.ts` — ajouter `chooseDate(partieId, pollId, dto: ChooseDateDto): Promise<void>` (PATCH)
  - [x] `apps/web/src/app/core/poll/poll.service.spec.ts` — ajouter test `chooseDate`

- [x] Task 3 — Généraliser `ConfirmDialog` pour un label de confirmation custom (AC2)
  - [x] `apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts` — ajouter `confirmLabel?: string` à `ConfirmData`, défaut `'Supprimer'` (préserve le comportement existant pour `partie-detail.ts`)

- [x] Task 4 — Étendre `PollStatusPanel` en panneau de résultat complet (AC1, AC2, AC5)
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.ts` — breakdown par option, badges par votant, highlight "tout YES", bouton "Sceller ce créneau" + dialog de confirmation, `output<string> chosen`
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.html` — template mis à jour
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.scss` — styles pour badges/highlight

- [x] Task 5 — Intégration CalendarView (AC2, AC4)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — injecter `MatSnackBar`, ajouter `onChooseDate(optionId: string): Promise<void>`
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — brancher `(chosen)="onChooseDate($event)"` sur `<app-poll-status>` ; remplacer le texte codé en dur `"Clôturer le vote"` par `{{ theme.tone()['cta.cancel_poll'] }}`

- [x] Task 6 — Tests (AC5)
  - [x] Créer `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts` (5 cas, voir Dev Notes §Task 6)
  - [x] `poll.service.spec.ts` — test `chooseDate`
  - [x] `calendar-view.spec.ts` — ajouter `chooseDate: vi.fn()` au mock `PollService`, test `onChooseDate()`

- [x] Task 7 — Validation finale
  - [x] `docker compose exec web pnpm test` — 0 régression (17 fichiers / 90 tests passent, +8 nouveaux tests)

## Dev Notes

### Vue d'ensemble

Cette story **n'ajoute aucun nouveau composant** — elle étend `PollStatusPanel` (actuellement un simple récapitulatif de décompte de votes, utilisé uniquement côté MJ dans `calendar-view.html`) pour en faire le panneau de résultat complet avec choix de date. Le backend est **déjà 100% prêt** : `PATCH /parties/:id/poll/:pollId/choose` et `DELETE /parties/:id/poll/:pollId` existent et fonctionnent depuis la story 3.1/3.2, aucune modification backend n'est nécessaire.

**Fichiers nouveaux :**
- `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts`

**Fichiers modifiés :**
- `packages/shared/src/index.ts` — ajouter `ChooseDateDto`
- `apps/web/src/app/core/poll/poll.service.ts` — ajouter `chooseDate()`
- `apps/web/src/app/core/poll/poll.service.spec.ts`
- `apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts` — généraliser le label
- `apps/web/src/app/features/poll/poll-status/poll-status.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.html`
- `apps/web/src/app/features/poll/poll-status/poll-status.scss`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`

---

### Backend déjà en place (NE PAS MODIFIER)

**`apps/api/src/poll/poll.controller.ts`** (confirmé, lignes 39-47) :
```typescript
@Patch(':pollId/choose')
choose(
  @Param('id', ParseUUIDPipe) partieId: string,
  @Param('pollId', ParseUUIDPipe) pollId: string,
  @CurrentUser() user: AuthUser,
  @Body() dto: ChooseDateDto,
) {
  return this.poll.choose(partieId, pollId, user.id, dto);
}
```

**`apps/api/src/poll/poll.service.ts`** (confirmé, lignes 75-90) — `choose()` :
- Vérifie `getOwned` (MJ uniquement)
- Vérifie `poll.status === 'OPEN'` sinon `BadRequestException`
- Vérifie que l'option appartient bien à ce poll
- Met à jour le poll : `status: 'CLOSED', chosenDate, chosenSlot`
- Met à jour la partie : `nextSessionDate`, `nextSessionSlot`
- Retourne `void`

**`apps/api/src/poll/dto/choose-date.dto.ts`** (backend-only, existant, ne pas toucher) :
```typescript
export class ChooseDateDto {
  @IsUUID()
  optionId!: string;
}
```

**Endpoint confirmé :** `PATCH /parties/:id/poll/:pollId/choose` — body `{ optionId: string }` — retourne `void` (204/200 sans body).

`close()` (DELETE, AC4) est **déjà appelé** par `CalendarView.onClosePoll()` depuis la story 3.2 — ne rien changer côté logique, seulement le libellé du bouton (Task 5).

---

### Task 1 — Type partagé `ChooseDateDto`

**Fichier :** `packages/shared/src/index.ts`

Ajouter après `CastVoteDto` (fin du fichier) :

```typescript
/** Payload pour choisir la date finale d'un vote (PATCH /parties/:id/poll/:pollId/choose). */
export interface ChooseDateDto {
  optionId: string;
}
```

---

### Task 2 — PollService.chooseDate()

**Fichier :** `apps/web/src/app/core/poll/poll.service.ts`

État actuel (post story 3-3) : le fichier a `createPoll`, `getCurrentPoll`, `closePoll`, `castVote`. Ajouter après `castVote()` :

```typescript
chooseDate(partieId: string, pollId: string, dto: ChooseDateDto): Promise<void> {
  return firstValueFrom(
    this.http.patch<void>(
      `${API_BASE}/parties/${partieId}/poll/${pollId}/choose`,
      dto,
      { withCredentials: true },
    ),
  );
}
```

Ajouter `ChooseDateDto` à la ligne d'import existante :

```typescript
import type { AggregatedSlotDto, AvailableSlotDto, CastVoteDto, ChooseDateDto, CreatePollDto, SessionPollDto } from '@master-jdr/shared';
```

**Test dans `poll.service.spec.ts`** — même pattern que `castVote` :

```typescript
it('chooseDate appelle PATCH /parties/p1/poll/poll1/choose avec le DTO', async () => {
  const dto: ChooseDateDto = { optionId: 'opt1' };
  const promise = service.chooseDate('p1', 'poll1', dto);
  const req = http.expectOne('http://localhost:3000/parties/p1/poll/poll1/choose');
  expect(req.request.method).toBe('PATCH');
  expect(req.request.body).toEqual(dto);
  req.flush(null);
  await promise;
});
```

---

### Task 3 — Généraliser `ConfirmDialog`

**Fichier :** `apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts`

État actuel (confirmé) :
```typescript
export interface ConfirmData {
  message: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Confirmation</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Annuler</button>
      <button mat-flat-button [mat-dialog-close]="true">Supprimer</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
```

⚠️ Le bouton de confirmation affiche toujours `"Supprimer"` — inadapté pour "Sceller ce créneau". **Généraliser sans casser les usages existants** (`partie-detail.ts` : `confirmDelete()`, `removeMember()`) :

```typescript
export interface ConfirmData {
  message: string;
  confirmLabel?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Confirmation</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Annuler</button>
      <button mat-flat-button [mat-dialog-close]="true">{{ data.confirmLabel ?? 'Supprimer' }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
```

Usages existants (`partie-detail.ts:129-131`, `partie-detail.ts:159-161`) n'ont pas besoin de changer — `confirmLabel` reste `undefined` → fallback `'Supprimer'`, comportement identique.

---

### Task 4 — Étendre `PollStatusPanel`

**Fichier :** `apps/web/src/app/features/poll/poll-status/poll-status.ts`

État actuel (confirmé, story 3-2) :
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

**Nouvelle version** :

```typescript
import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { DaySlot, PollOptionDto, SessionPollDto, VoteAnswer } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ConfirmDialog } from '../../parties/confirm-dialog/confirm-dialog';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

const ANSWER_LABELS: Record<VoteAnswer, string> = {
  YES: 'Oui', NO: 'Non', MAYBE: 'Peut-être',
};

const ANSWER_ICONS: Record<VoteAnswer, string> = {
  YES: '✅', NO: '❌', MAYBE: '❔',
};

@Component({
  selector: 'app-poll-status',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './poll-status.html',
  styleUrl: './poll-status.scss',
})
export class PollStatusPanel {
  readonly poll = input.required<SessionPollDto>();

  readonly chosen = output<string>();

  protected readonly theme = inject(ThemeToneService);
  private readonly dialog = inject(MatDialog);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly ANSWER_LABELS = ANSWER_LABELS;
  readonly ANSWER_ICONS = ANSWER_ICONS;

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }

  protected countByAnswer(opt: PollOptionDto, answer: VoteAnswer): number {
    return opt.votes.filter(v => v.answer === answer).length;
  }

  protected isAllYes(opt: PollOptionDto): boolean {
    return opt.votes.length > 0 && opt.votes.every(v => v.answer === 'YES');
  }

  protected async onChooseClick(opt: PollOptionDto): Promise<void> {
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        message: `Confirmer ${this.formatDate(opt.date)} — ${SLOT_LABELS[opt.slot]} comme date de la prochaine séance ?`,
        confirmLabel: this.theme.tone()['cta.choose_date'],
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (confirmed) this.chosen.emit(opt.id);
  }
}
```

**⚠️ Interprétation de "tous les membres ont voté YES" (AC1)** : le spec dit "an option where all members voted YES is visually highlighted". Cette story **ne récupère pas la liste complète des membres de la partie** (ça reste hors périmètre — voir story 3.5 pour l'alerte "qui n'a pas répondu"). `isAllYes()` est donc interprété comme *"tous ceux qui ont voté ont voté YES"* (`opt.votes.every(...)`), pas *"tous les membres de la partie"*. C'est un choix délibéré pour rester dans le périmètre de cette story — documenté ici pour que ce ne soit pas une supposition silencieuse.

---

### Template `poll-status.html`

```html
<div class="poll-status">
  <h3 class="poll-status__title">{{ theme.tone()['poll.status_title'] }}</h3>
  @if (poll().scenarioRef) {
    <p class="poll-status__scenario">{{ poll().scenarioRef }}</p>
  }
  <ul class="poll-status__options">
    @for (opt of poll().options; track opt.id) {
      <li class="poll-status__option" [class.poll-status__option--all-yes]="isAllYes(opt)">
        <div class="poll-status__option-header">
          <span class="poll-status__date">{{ formatDate(opt.date) }} — {{ SLOT_LABELS[opt.slot] }}</span>
          <span class="poll-status__breakdown">
            ✅ {{ countByAnswer(opt, 'YES') }} · ❌ {{ countByAnswer(opt, 'NO') }} · ❔ {{ countByAnswer(opt, 'MAYBE') }}
          </span>
        </div>
        @if (opt.votes.length > 0) {
          <ul class="poll-status__voters" aria-label="Votants">
            @for (vote of opt.votes; track vote.userId) {
              <li class="poll-status__voter">
                <span aria-hidden="true">⚔</span> {{ vote.pseudo }}
                <span class="poll-status__answer">{{ ANSWER_ICONS[vote.answer] }} {{ ANSWER_LABELS[vote.answer] }}</span>
              </li>
            }
          </ul>
        }
        <button mat-stroked-button color="primary" (click)="onChooseClick(opt)">
          {{ theme.tone()['cta.choose_date'] }}
        </button>
      </li>
    }
  </ul>
</div>
```

**SCSS `poll-status.scss`** — ajouter aux styles existants :
- `.poll-status__option--all-yes` : `background-color: var(--mat-sys-primary-container, #d0e8ff);` (mise en évidence)
- `.poll-status__option-header` : `display: flex; justify-content: space-between; align-items: center;`
- `.poll-status__voters` : `list-style: none; margin: 0.25rem 0; padding: 0; font-size: 0.8rem;`
- `.poll-status__voter` : `display: flex; justify-content: space-between; padding: 0.1rem 0;`
- `.poll-status__answer` : `opacity: 0.8;`

---

### Task 5 — Intégration CalendarView

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`

Ajouter l'import et l'injection de `MatSnackBar` :

```typescript
import { MatSnackBar } from '@angular/material/snack-bar';
// ...
private readonly snack = inject(MatSnackBar);
```

Ajouter la méthode, après `onClosePoll()` :

```typescript
protected async onChooseDate(optionId: string): Promise<void> {
  const poll = this.activePoll();
  const id   = this.partieId();
  if (!poll || !id) return;
  try {
    await this.pollSvc.chooseDate(id, poll.id, { optionId });
    this.snack.open(this.theme.tone()['success.date_chosen'], undefined, { duration: 3000 });
    this.activePoll.set(null);
  } catch {
    this.error.set('Impossible de choisir cette date. Réessayez.');
  }
}
```

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`

État actuel du bloc MJ (lignes 46-59, confirmé) :

```html
@if (isMjMode()) {
  <div class="mj-results-panel" #slotsPanel>
    <div class="poll-section">
      @if (!activePoll()) {
        <button mat-flat-button color="primary" (click)="openPollPanel()">
          {{ theme.tone()['cta.launch_vote'] }}
        </button>
      } @else {
        <app-poll-status [poll]="activePoll()!" />
        <button mat-stroked-button color="warn" (click)="onClosePoll()">
          Clôturer le vote
        </button>
      }
    </div>
    ...
```

Modifier pour brancher `(chosen)` et remplacer le libellé codé en dur (AC4) :

```html
      } @else {
        <app-poll-status [poll]="activePoll()!" (chosen)="onChooseDate($event)" />
        <button mat-stroked-button color="warn" (click)="onClosePoll()">
          {{ theme.tone()['cta.cancel_poll'] }}
        </button>
      }
```

---

### Task 6 — Tests

**`poll-status.spec.ts`** (nouveau) — pattern TestBed + MatDialog mocké (voir `partie-detail.spec.ts` pour référence sur le mock de `MatDialog`/`afterClosed`) :

```typescript
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { SessionPollDto } from '@master-jdr/shared';
import { PollStatusPanel } from './poll-status';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const fakePoll: SessionPollDto = {
  id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
  expiresAt: null, chosenDate: null, chosenSlot: null,
  options: [
    { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING',
      votes: [
        { userId: 'u1', pseudo: 'Alice', answer: 'YES' },
        { userId: 'u2', pseudo: 'Bob', answer: 'YES' },
      ] },
    { id: 'opt2', date: '2026-08-08T00:00:00.000Z', slot: 'AFTERNOON',
      votes: [
        { userId: 'u1', pseudo: 'Alice', answer: 'YES' },
        { userId: 'u2', pseudo: 'Bob', answer: 'NO' },
      ] },
  ],
};

function makeThemeService() {
  return { tone: () => ({ 'poll.status_title': 'Vote en cours', 'cta.choose_date': 'Sceller ce créneau' }) };
}

function makeDialog(confirmed: boolean) {
  return { open: vi.fn().mockReturnValue({ afterClosed: () => of(confirmed) }) };
}

async function createComponent(poll = fakePoll, confirmed = true) {
  const dialog = makeDialog(confirmed);
  await TestBed.configureTestingModule({
    imports: [PollStatusPanel],
    providers: [
      provideAnimationsAsync(),
      { provide: ThemeToneService, useValue: makeThemeService() },
      { provide: MatDialog, useValue: dialog },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PollStatusPanel);
  fixture.componentRef.setInput('poll', poll);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, dialog };
}

describe('PollStatusPanel', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('countByAnswer compte correctement YES/NO/MAYBE par option', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;
    expect(comp.countByAnswer(fakePoll.options[0], 'YES')).toBe(2);
    expect(comp.countByAnswer(fakePoll.options[1], 'NO')).toBe(1);
  });

  it('affiche un badge par votant (pseudo + réponse)', async () => {
    const { fixture } = await createComponent();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('isAllYes vrai si tous les votants ont répondu YES', async () => {
    const { fixture } = await createComponent();
    const comp = fixture.componentInstance as any;
    expect(comp.isAllYes(fakePoll.options[0])).toBe(true);
    expect(comp.isAllYes(fakePoll.options[1])).toBe(false);
  });

  it('onChooseClick + confirmation → émet chosen avec optionId', async () => {
    const { fixture } = await createComponent(fakePoll, true);
    const comp = fixture.componentInstance as any;
    const emitted: string[] = [];
    comp.chosen.subscribe((id: string) => emitted.push(id));
    await comp.onChooseClick(fakePoll.options[0]);
    expect(emitted).toEqual(['opt1']);
  });

  it('onChooseClick + annulation → pas d\'émission', async () => {
    const { fixture } = await createComponent(fakePoll, false);
    const comp = fixture.componentInstance as any;
    const emitted: string[] = [];
    comp.chosen.subscribe((id: string) => emitted.push(id));
    await comp.onChooseClick(fakePoll.options[0]);
    expect(emitted).toEqual([]);
  });
});
```

**`calendar-view.spec.ts`** — ajouter `chooseDate: vi.fn().mockResolvedValue(undefined)` à `makePollService()`, puis un test :

```typescript
it('onChooseDate() appelle pollSvc.chooseDate puis vide activePoll', async () => {
  const { fixture, pollSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
  const comp = fixture.componentInstance as any;
  comp.activePoll.set({ id: 'poll1', partieId: 'partie-1', status: 'OPEN', scenarioRef: null, expiresAt: null, chosenDate: null, chosenSlot: null, options: [] });
  await comp.onChooseDate('opt1');
  expect(pollSvc.chooseDate).toHaveBeenCalledWith('partie-1', 'poll1', { optionId: 'opt1' });
  expect(comp.activePoll()).toBeNull();
});
```

**Note :** `calendar-view.spec.ts` n'injecte pas `MatSnackBar` actuellement — `onChooseDate()` l'utilise désormais, donc ajouter `provideAnimationsAsync()` est déjà présent, mais `MatSnackBar` doit être disponible via injection root (Angular Material le fournit automatiquement avec `provideAnimationsAsync()` + un `MatSnackBarModule` implicite). Si le test échoue faute de provider, ajouter `{ provide: MatSnackBar, useValue: { open: vi.fn() } }` aux providers de test.

---

### Patterns à respecter

- **Standalone components**, signals, `@if/@for`, `firstValueFrom()` pour HTTP — cohérent avec tout le reste du projet
- **`MatDialog`** : pattern déjà établi dans `partie-detail.ts` (`confirmDelete`, `removeMember`) — `dialog.open(...)`, `await firstValueFrom(ref.afterClosed())`
- **`MatSnackBar`** : injecter directement, fournir dans les tests
- Icône générique de membre : `⚔` (aria-hidden), cohérent avec `creneau-card.html` — **pas** de système d'emoji par classe de personnage (n'existe pas dans le codebase, malgré la mention "emoji classe" dans UX-DR7 — c'est juste l'icône ⚔ générique)
- Commandes tests : `docker compose exec web pnpm test`

### Tone keys existantes (déjà présentes, ne pas dupliquer)

`cta.choose_date`, `success.date_chosen`, `cta.cancel_poll` sont **déjà définies dans les 3 thèmes** de `tones.ts` depuis la story 3-2 — vérifié, aucune nouvelle clé de microcopy n'est nécessaire pour cette story.

### Hors périmètre (délibérément, voir story 3.5)

- Liste des membres n'ayant pas encore voté (`alert.missing_player`) — Story 3.5
- Notification MJ "tous ont répondu" — Story 3.5
- Rafraîchissement automatique du widget de planification sans navigation — non requis par l'AC3 (la navigation déclenche déjà un rechargement complet de `partie-detail.ngOnInit`)

## Dev Agent Record

### Debug Log

Aucun blocage — le backend étant déjà 100% en place (vérifié dans les Dev Notes avant implémentation), l'implémentation s'est déroulée sans détour : uniquement du code frontend Angular + un type partagé.

### Completion Notes

Implémentation complète des 7 tasks de la story :
- `ChooseDateDto` ajouté à `packages/shared` (miroir du DTO backend existant, aucun changement API).
- `PollService.chooseDate()` ajouté (PATCH) avec test HTTP dédié.
- `ConfirmDialog` généralisé avec `confirmLabel?: string` (fallback `'Supprimer'`) — usages existants dans `partie-detail.ts` non affectés (comportement identique par défaut).
- `PollStatusPanel` étendu en panneau de résultat complet : décompte YES/NO/MAYBE par option, badges par votant (pseudo + icône ⚔ + réponse), mise en évidence des options 100% YES (parmi les votants — voir note d'interprétation ci-dessous), bouton "Sceller ce créneau" ouvrant un `ConfirmDialog`, `output<string> chosen` émis uniquement après confirmation.
- `CalendarView.onChooseDate()` : appelle `chooseDate()`, toast `success.date_chosen`, vide `activePoll` (poll désormais CLOSED). Libellé du bouton d'annulation du vote remplacé par `theme.tone()['cta.cancel_poll']` (auparavant codé en dur `"Clôturer le vote"`, AC4).
- 8 nouveaux tests Vitest (5 sur `PollStatusPanel`, 1 sur `PollService.chooseDate`, 1 sur `CalendarView.onChooseDate`, + réutilisation du pattern existant).
- Suite complète : 17 fichiers de test / 90 tests, 0 échec. `MatSnackBar` fonctionne sans mock explicite dans `calendar-view.spec.ts` (aucun provider requis au-delà de `provideAnimationsAsync()`).

**Interprétation documentée (non-ambiguë mais notée pour traçabilité) :** `isAllYes()` compare uniquement les votants existants (`opt.votes.every(v => v.answer === 'YES')`), pas l'ensemble des membres de la partie — cette story ne récupère pas la liste complète des membres (réservé à la story 3.5 pour l'alerte "qui n'a pas répondu"). Choix déjà documenté dans les Dev Notes avant implémentation, appliqué tel quel.

## File List

**Fichiers modifiés :**
- `packages/shared/src/index.ts`
- `apps/web/src/app/core/poll/poll.service.ts`
- `apps/web/src/app/core/poll/poll.service.spec.ts`
- `apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.html`
- `apps/web/src/app/features/poll/poll-status/poll-status.scss`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

**Fichiers nouveaux :**
- `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts`

### Review Findings

- [x] [Review][Patch] Aucune garde de ré-entrance sur `onChooseClick`/`onChooseDate`/`onClosePoll` — RÉSOLU : garde locale `dialogPending` dans `PollStatusPanel` (bloque le double-clic avant le redessin d'Angular) + input `busy` piloté par le parent + signal `pollActionPending` dans `CalendarView` rendant `onChooseDate`/`onClosePoll` mutuellement exclusifs et non-réentrants, boutons désactivés en conséquence dans les deux templates. [`poll-status.ts:31-38,58-72`, `calendar-view.ts:60-61,148-176`]
- [x] [Review][Patch] Signal `error()` jamais réinitialisé en début de tentative — RÉSOLU : `this.error.set(null)` ajouté en tête de `onClosePoll()` et `onChooseDate()`. [`calendar-view.ts:148-176`]
- [x] [Review][Patch] Couverture de test insuffisante sur `onChooseDate()` — RÉSOLU : assertion sur `snack.open` (contenu + duration), test du chemin d'échec (activePoll conservé, error affichée, pas de toast), test de la garde de ré-entrance (2 appels concurrents → 1 seul appel réel), test de l'exclusion mutuelle avec `onClosePoll()`. + 2 tests dans `poll-status.spec.ts` pour `dialogPending`/`busy`. [`calendar-view.spec.ts`, `poll-status.spec.ts`]
- [x] [Review][Defer] `onChooseDate`/`onClosePoll` ne refetchent pas `activePoll` en cas d'échec — pattern préexistant hérité de `onClosePoll` (story 3.2), pas une régression de cette story — deferred, pre-existing [`calendar-view.ts:147-169`]
- [x] [Review][Defer] "Sceller ce créneau" cliquable sur une option à 0 vote, pas d'état désactivé — ne viole aucune AC (le spec ne l'interdit pas, probablement un override MJ intentionnel) — deferred, comportement non bloquant [`poll-status.html:25`]
- [x] [Review][Defer] `isAllYes()` ne vérifie pas `poll().status` — surbrillance théoriquement incorrecte sur un poll CLOSED, mais inatteignable aujourd'hui (le panneau MJ disparaît dès que `activePoll` passe à `null`) — deferred, risque hypothétique futur si le composant est réutilisé ailleurs [`poll-status.ts:50-52`]
- [x] [Review][Defer] Signal partagé `activePoll` entre le flux joueur (`onPollResponded`, story 3.3) et le flux MJ (`onChooseDate`) — risque théorique de clobber si `mode` changeait dynamiquement sur une même instance de composant ; risque réel faible car `mode` est un input statique lié à la route — deferred, nécessite une investigation architecturale plus large hors périmètre [`calendar-view.ts:99`, `142-144`]

## Change Log

| Date | Change |
|------|--------|
| 2026-07-02 | Story créée (bmad-create-story) |
| 2026-07-02 | Implémentation complète (7 tasks). 90 tests passent, 0 régression. |
| 2026-07-02 | Code review (3 layers) : 0 decision-needed, 3 patch, 4 defer, 8 dismissed (dont 2 faux positifs vérifiés : garde `isMjMode()` confirmée présente, template `poll-status.html` confirmé bien formé). |
| 2026-07-02 | 3 patches appliqués : garde de ré-entrance (`dialogPending`/`busy`/`pollActionPending`), reset de `error()`, 6 nouveaux tests (toast, échec, ré-entrance). 95 tests passent, 0 régression. |
