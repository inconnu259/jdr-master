import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import type { SessionPollDto } from '@master-jdr/shared';
import { PollResponseComponent } from './poll-response';
import { PollService } from '../../../core/poll/poll.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

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
  return {
    currentUser: () => ({ id: userId, email: 'alice@test.com', pseudo: 'Alice', role: 'USER', createdAt: '' }),
  };
}

function makeThemeService() {
  return {
    tone: () => ({
      'success.vote_cast': 'Réponse enregistrée !',
      'cta.confirm_votes': 'Confirmer',
      'poll.vote_closed': 'Vote clos',
      'poll.status_title': 'Vote en cours',
    }),
  };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    comp.setAnswer('opt1', 'YES');
    expect(comp.pendingAnswers().get('opt1')).toBe('YES');
  });

  it('confirmation → castVote appelé 2×, toast affiché', async () => {
    const { fixture, pollSvc, snack } = await createComponent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    // ngOnInit pre-populates opt2 → YES (from fakePoll votes for u1)
    // add opt1 → NO so we have 2 selections total
    comp.setAnswer('opt1', 'NO');
    await comp.onConfirm();
    expect(pollSvc.castVote).toHaveBeenCalledTimes(2);
    expect(snack.open).toHaveBeenCalledWith('Réponse enregistrée !', undefined, { duration: 3000 });
  });

  it('échec partiel → l\'option en échec est marquée, message avec compteur, pas de toast de succès', async () => {
    const { fixture, pollSvc, snack } = await createComponent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    pollSvc.castVote = vi.fn((_partieId: string, _pollId: string, dto: { optionId: string }) =>
      dto.optionId === 'opt2' ? Promise.reject(new Error('network')) : Promise.resolve(undefined),
    );
    comp.setAnswer('opt1', 'NO');
    comp.setAnswer('opt2', 'MAYBE');
    await comp.onConfirm();
    expect(snack.open).not.toHaveBeenCalled();
    expect(comp.error()).toContain('1/2');
    expect(comp.failedOptionIds().has('opt2')).toBe(true);
    expect(comp.failedOptionIds().has('opt1')).toBe(false);
  });

  it('poll CLOSED → isClosed vrai, setAnswer sans effet', async () => {
    const closedPoll: SessionPollDto = { ...fakePoll, status: 'CLOSED' };
    const { fixture } = await createComponent(closedPoll);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = fixture.componentInstance as any;
    expect(comp.isClosed()).toBe(true);
    comp.setAnswer('opt1', 'YES');
    expect(comp.pendingAnswers().get('opt1')).toBeUndefined();
  });
});
