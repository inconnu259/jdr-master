import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { PartieMemberDto, SessionPollDto } from '@master-jdr/shared';
import { PollStatusPanel } from './poll-status';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const alice: PartieMemberDto = { userId: 'u1', pseudo: 'Alice', email: 'alice@test.com', joinedAt: '' };
const bob: PartieMemberDto = { userId: 'u2', pseudo: 'Bob', email: 'bob@test.com', joinedAt: '' };
const carol: PartieMemberDto = { userId: 'u3', pseudo: 'Carol', email: 'carol@test.com', joinedAt: '' };

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
  return {
    tone: () => ({
      'poll.status_title': 'Vote en cours',
      'cta.choose_date': 'Sceller ce créneau',
      'alert.all_responded': 'Tous ont répondu.',
      'alert.missing_player': '{name} n\'a pas encore répondu.',
    }),
  };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    expect(comp.isAllYes(fakePoll.options[0])).toBe(true);
    expect(comp.isAllYes(fakePoll.options[1])).toBe(false);
  });

  it('onChooseClick + confirmation → émet chosen avec optionId', async () => {
    const { fixture } = await createComponent(fakePoll, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    const emitted: string[] = [];
    comp.chosen.subscribe((id: string) => emitted.push(id));
    await comp.onChooseClick(fakePoll.options[0]);
    expect(emitted).toEqual(['opt1']);
  });

  it('onChooseClick + annulation → pas d\'émission', async () => {
    const { fixture } = await createComponent(fakePoll, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    const emitted: string[] = [];
    comp.chosen.subscribe((id: string) => emitted.push(id));
    await comp.onChooseClick(fakePoll.options[0]);
    expect(emitted).toEqual([]);
  });

  it('double-clic rapide → le dialogue ne s\'ouvre qu\'une seule fois (garde dialogPending)', async () => {
    const { fixture, dialog } = await createComponent(fakePoll, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    const p1 = comp.onChooseClick(fakePoll.options[0]);
    const p2 = comp.onChooseClick(fakePoll.options[0]);
    await Promise.all([p1, p2]);
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('busy=true → onChooseClick n\'ouvre pas de dialogue', async () => {
    const { fixture, dialog } = await createComponent(fakePoll, true);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    await comp.onChooseClick(fakePoll.options[0]);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('members non fourni (défaut []) → pas de bannière "tous ont répondu", aucun manquant affiché', async () => {
    const { fixture } = await createComponent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    expect(comp.members()).toEqual([]);
    expect(comp.allResponded()).toBe(false);
    expect(comp.missingVotersForOption(fakePoll.options[0])).toEqual([]);
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Tous ont répondu.');
  });

  it('bannière "tous ont répondu" quand tous les membres ont voté sur toutes les options', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('members', [alice, bob]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Tous ont répondu.');
  });

  it('Carol (n\'a voté nulle part) apparaît comme manquante sur CHAQUE option, pas de bannière globale', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('members', [alice, bob, carol]);
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    expect(comp.missingVotersForOption(fakePoll.options[0]).map((m: PartieMemberDto) => m.pseudo)).toEqual(['Carol']);
    expect(comp.missingVotersForOption(fakePoll.options[1]).map((m: PartieMemberDto) => m.pseudo)).toEqual(['Carol']);
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Tous ont répondu.');
  });

  it('vote partiel : un membre ayant voté sur une option mais pas l\'autre n\'apparaît manquant QUE sur celle où il n\'a pas voté', async () => {
    // Dans fakePoll, Bob a voté sur opt1 et opt2 — on ajoute Dana qui ne vote QUE sur opt1.
    const dana: PartieMemberDto = { userId: 'u4', pseudo: 'Dana', email: 'dana@test.com', joinedAt: '' };
    const pollWithPartialVote: SessionPollDto = {
      ...fakePoll,
      options: [
        { ...fakePoll.options[0], votes: [...fakePoll.options[0].votes, { userId: 'u4', pseudo: 'Dana', answer: 'YES' }] },
        fakePoll.options[1],
      ],
    };
    const { fixture } = await createComponent(pollWithPartialVote);
    fixture.componentRef.setInput('members', [alice, bob, dana]);
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    // Dana a voté sur opt1 → absente des manquants de opt1
    expect(comp.missingVotersForOption(pollWithPartialVote.options[0]).map((m: PartieMemberDto) => m.pseudo)).toEqual([]);
    // Dana n'a pas voté sur opt2 → présente dans les manquants de opt2 (et seulement elle, Alice/Bob ont voté)
    expect(comp.missingVotersForOption(pollWithPartialVote.options[1]).map((m: PartieMemberDto) => m.pseudo)).toEqual(['Dana']);
  });
});
