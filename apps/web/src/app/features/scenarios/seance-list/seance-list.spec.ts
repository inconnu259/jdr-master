import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { AvailableSlotDto, ScenarioDto, SeanceDto, SessionPollDto } from '@master-jdr/shared';
import { SeanceList } from './seance-list';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';

const POLL: SessionPollDto = {
  id: 'poll1',
  partieId: 'p1',
  status: 'OPEN',
  scenarioRef: null,
  expiresAt: null,
  chosenDate: null,
  chosenSlot: null,
  options: [],
};

const SEANCE_NO_POLL: SeanceDto = {
  id: 'seance1',
  scenarioId: 's1',
  compteRendu: null,
  createdAt: '2026-07-13T00:00:00.000Z',
};

const SEANCE_WITH_POLL: SeanceDto = {
  ...SEANCE_NO_POLL,
  poll: POLL,
};

const SCENARIO: ScenarioDto = {
  id: 's1',
  partieId: 'p1',
  title: 'Chapitre 1',
  description: null,
  status: 'COURANT',
  dureeHeures: null,
  dureeSeances: 3,
  resumeFin: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  closedAt: null,
  seances: [],
};

async function createComponent(
  scenario: ScenarioDto,
  {
    isMj = false,
    isEpisodique = false,
    availableSlots = [],
  }: { isMj?: boolean; isEpisodique?: boolean; availableSlots?: AvailableSlotDto[] } = {},
) {
  const scenariosSvc = { linkSeancePoll: vi.fn(), listAll: vi.fn().mockResolvedValue([scenario]) };
  const pollSvc = {
    chooseDate: vi.fn(),
    closePoll: vi.fn(),
    getAvailableSlots: vi.fn().mockResolvedValue(availableSlots),
  };

  await TestBed.configureTestingModule({
    imports: [SeanceList],
    providers: [
      provideAnimationsAsync(),
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: PollService, useValue: pollSvc },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SeanceList);
  fixture.componentRef.setInput('scenario', scenario);
  fixture.componentRef.setInput('partieId', 'p1');
  fixture.componentRef.setInput('isMj', isMj);
  fixture.componentRef.setInput('isEpisodique', isEpisodique);
  fixture.detectChanges();
  // ngOnInit charge les créneaux calculés de façon async (mock résolu) — zoneless, on vide la file
  // de microtasks avant de faire des assertions sur le rendu qui en dépend.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, scenariosSvc, pollSvc };
}

describe('SeanceList', () => {
  it('MJ, séance sans poll → bouton "Lancer le vote" visible, panneau fermé par défaut', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Lancer le vote');
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
  });

  it('MJ, clic sur "Lancer le vote" → app-poll-creation apparaît avec les créneaux calculés', async () => {
    const slot: AvailableSlotDto = { date: '2026-08-01', slot: 'EVENING', members: [] };
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true, availableSlots: [slot] },
    );
    const btn: HTMLButtonElement = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((b: any) => b.textContent.includes('Lancer le vote')) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const creation = fixture.nativeElement.querySelector('app-poll-creation');
    expect(creation).toBeTruthy();
  });

  it('panneau de création ouvert, (cancelled) → panneau se referme, bouton "Lancer le vote" réapparaît', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    const comp = fixture.componentInstance as any;
    comp.openPollPanel('seance1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeTruthy();

    comp.closePollPanel();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Lancer le vote');
  });

  it('MJ, séance avec poll → app-poll-status + members visibles', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
      { isMj: true },
    );
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
  });

  it('joueur, séance avec poll → app-poll-response visible', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
      { isMj: false },
    );
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeTruthy();
  });

  it('joueur, séance sans poll → rien affiché pour cette séance', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: false },
    );
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
  });

  it('épisodique : aucun composant de vote affiché, quel que soit isMj', async () => {
    const { fixture } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
      { isMj: true, isEpisodique: true },
    );
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
  });

  it('onPollCreated appelle linkSeancePoll et émet seanceLinked', async () => {
    const { fixture, scenariosSvc } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    const comp = fixture.componentInstance as any;
    const updated = { ...SCENARIO, seances: [SEANCE_WITH_POLL] };
    scenariosSvc.linkSeancePoll.mockResolvedValue(updated);
    let emitted: ScenarioDto | undefined;
    comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

    await comp.onPollCreated('seance1', POLL);

    expect(scenariosSvc.linkSeancePoll).toHaveBeenCalledWith('seance1', 'poll1');
    expect(emitted).toEqual(updated);
  });

  it('onPollCreated ignore les appels concurrents pendant qu’un premier est en cours (anti double-clic)', async () => {
    const { fixture, scenariosSvc } = await createComponent(
      { ...SCENARIO, seances: [SEANCE_NO_POLL] },
      { isMj: true },
    );
    const comp = fixture.componentInstance as any;
    let resolveFirst!: (v: ScenarioDto) => void;
    scenariosSvc.linkSeancePoll.mockReturnValue(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const first = comp.onPollCreated('seance1', POLL);
    await comp.onPollCreated('seance1', POLL);

    expect(scenariosSvc.linkSeancePoll).toHaveBeenCalledTimes(1);
    resolveFirst({ ...SCENARIO, seances: [SEANCE_WITH_POLL] });
    await first;
  });

  describe('onChoose()/onClosePoll() rafraîchissent l’affichage (bug-fix : « rien ne se passe » après avoir scellé un créneau)', () => {
    it('onChoose appelle chooseDate PUIS recharge le scénario et émet seanceLinked', async () => {
      const { fixture, scenariosSvc, pollSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;
      const closedPoll: SessionPollDto = {
        ...POLL,
        status: 'CLOSED',
        chosenDate: '2026-08-01T00:00:00.000Z',
        chosenSlot: 'EVENING',
      };
      const fresh = { ...SCENARIO, seances: [{ ...SEANCE_WITH_POLL, poll: closedPoll }] };
      scenariosSvc.listAll.mockResolvedValue([fresh]);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onChoose('poll1', 'opt1');

      expect(pollSvc.chooseDate).toHaveBeenCalledWith('p1', 'poll1', { optionId: 'opt1' });
      expect(scenariosSvc.listAll).toHaveBeenCalledWith('p1');
      expect(emitted).toEqual(fresh);
    });

    it('onClosePoll appelle closePoll PUIS recharge le scénario et émet seanceLinked', async () => {
      const { fixture, scenariosSvc, pollSvc } = await createComponent(
        { ...SCENARIO, seances: [SEANCE_WITH_POLL] },
        { isMj: true },
      );
      const comp = fixture.componentInstance as any;
      const closedPoll: SessionPollDto = { ...POLL, status: 'CLOSED' };
      const fresh = { ...SCENARIO, seances: [{ ...SEANCE_WITH_POLL, poll: closedPoll }] };
      scenariosSvc.listAll.mockResolvedValue([fresh]);
      let emitted: ScenarioDto | undefined;
      comp.seanceLinked.subscribe((v: ScenarioDto) => (emitted = v));

      await comp.onClosePoll('poll1');

      expect(pollSvc.closePoll).toHaveBeenCalledWith('p1', 'poll1');
      expect(emitted).toEqual(fresh);
    });
  });

  describe('Poll clôturé : date retenue affichée (bug-fix : aucune indication de la date choisie)', () => {
    const CLOSED_WITH_DATE: SeanceDto = {
      ...SEANCE_NO_POLL,
      poll: {
        ...POLL,
        status: 'CLOSED',
        chosenDate: '2026-08-01T00:00:00.000Z',
        chosenSlot: 'EVENING',
      },
    };
    const CLOSED_NO_DATE: SeanceDto = {
      ...SEANCE_NO_POLL,
      poll: { ...POLL, status: 'CLOSED' },
    };

    it('MJ, poll CLOSED avec chosenDate → affiche "Date retenue", plus de app-poll-status', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-poll-status')).toBeNull();
    });

    it('joueur, poll CLOSED avec chosenDate → affiche "Date retenue", plus de app-poll-response', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_WITH_DATE] },
        { isMj: false },
      );
      expect(fixture.nativeElement.textContent).toContain('Date retenue');
      expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
    });

    it('poll CLOSED sans chosenDate → message neutre plutôt qu\'une date vide', async () => {
      const { fixture } = await createComponent(
        { ...SCENARIO, seances: [CLOSED_NO_DATE] },
        { isMj: true },
      );
      expect(fixture.nativeElement.textContent).toContain('Vote clôturé sans date retenue');
    });
  });
});
