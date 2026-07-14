import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Location } from '@angular/common';
import { vi } from 'vitest';
import { CalendarView } from './calendar-view';
import { ActivatedRoute } from '@angular/router';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { PollService } from '../../../core/poll/poll.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';

interface CreateOptions {
  mode?: 'mj' | 'personal';
  partieId?: string;
  queryParams?: Record<string, string>;
  scenarios?: any[];
}

function makeActivatedRoute(partieId?: string, queryParams: Record<string, string> = {}) {
  return {
    snapshot: {
      paramMap: { get: (key: string) => (key === 'id' ? (partieId ?? null) : null) },
      queryParamMap: { get: (key: string) => queryParams[key] ?? null },
    },
  };
}

function makeAvailabilityService() {
  return { getMyDeclarations: vi.fn().mockResolvedValue([]) };
}

function makePollService() {
  return {
    getAvailableSlots: vi.fn().mockResolvedValue([]),
    getHeatmap: vi.fn().mockResolvedValue([]),
    chooseDate: vi.fn().mockResolvedValue(undefined),
    closePoll: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSnackBar() {
  return { open: vi.fn() };
}

function makePartiesService() {
  return { members: vi.fn().mockResolvedValue([]) };
}

function makeScenariosService(scenarios: any[] = []) {
  return {
    createSeancePoll: vi.fn(),
    listAll: vi.fn().mockResolvedValue(scenarios),
  };
}

const ACTIVE_POLL_SCENARIO = {
  id: 's1',
  partieId: 'partie-1',
  title: 'Chapitre 1',
  description: null,
  status: 'COURANT',
  dureeHeures: null,
  dureeSeances: null,
  resumeFin: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  closedAt: null,
  seances: [
    {
      id: 'seance1',
      scenarioId: 's1',
      compteRendu: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      poll: {
        id: 'poll1',
        partieId: 'partie-1',
        status: 'OPEN',
        scenarioRef: null,
        expiresAt: null,
        chosenDate: null,
        chosenSlot: null,
        options: [],
      },
    },
  ],
};

async function createCalendarView(options?: CreateOptions | 'mj' | 'personal') {
  const opts: CreateOptions = typeof options === 'string' ? { mode: options } : (options ?? {});

  const availabilitySvc = makeAvailabilityService();
  const pollSvc = makePollService();
  const snack = makeSnackBar();
  const partiesSvc = makePartiesService();
  const scenariosSvc = makeScenariosService(opts.scenarios ?? []);

  await TestBed.configureTestingModule({
    imports: [CalendarView],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: ActivatedRoute, useValue: makeActivatedRoute(opts.partieId, opts.queryParams) },
      { provide: AvailabilityService, useValue: availabilitySvc },
      { provide: PartiesService, useValue: partiesSvc },
      { provide: PollService, useValue: pollSvc },
      { provide: MatSnackBar, useValue: snack },
      { provide: ScenariosService, useValue: scenariosSvc },
    ],
  }).compileComponents();

  // Location réel (nécessaire au Router interne, ex. la synchro d'URL déclenchée par
  // router.navigate() dans ngOnInit) — on espionne juste back() plutôt que de le remplacer.
  const location = TestBed.inject(Location);
  vi.spyOn(location, 'back').mockImplementation(() => {});

  const fixture = TestBed.createComponent(CalendarView);
  if (opts.mode) fixture.componentRef.setInput('mode', opts.mode);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges(); // D5: second cycle pour les bindings asynchrones
  return { fixture, pollSvc, availabilitySvc, snack, partiesSvc, scenariosSvc, location };
}

describe('CalendarView — signal mode', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('isMjMode() retourne true quand mode="mj"', async () => {
    const { fixture } = await createCalendarView('mj');
    expect((fixture.componentInstance as any).isMjMode()).toBe(true);
  });

  it('isMjMode() retourne false avec le mode par défaut ("personal")', async () => {
    const { fixture } = await createCalendarView();
    expect((fixture.componentInstance as any).isMjMode()).toBe(false);
  });

  it('affiche .mj-results-panel quand mode="mj" (D4)', async () => {
    const { fixture } = await createCalendarView('mj');
    const panel = fixture.nativeElement.querySelector('.mj-results-panel');
    expect(panel).not.toBeNull();
  });

  it('masque .mj-results-panel quand mode="personal" (D4)', async () => {
    const { fixture } = await createCalendarView('personal');
    const panel = fixture.nativeElement.querySelector('.mj-results-panel');
    expect(panel).toBeNull();
  });
});

// ─── Bouton retour contextuel (Story 8.8, AC6) ───────────────────────────────

describe('CalendarView — bouton retour (Story 8.8, AC6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('goBack() appelle Location.back()', async () => {
    const { fixture, location } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    (fixture.componentInstance as any).goBack();
    expect(location.back).toHaveBeenCalledTimes(1);
  });

  it('bouton "Retour" présent dans le DOM', async () => {
    const { fixture } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    expect(fixture.nativeElement.querySelector('.oracle-back-btn')).toBeTruthy();
  });
});

// ─── Pré-sélection de séance depuis SeanceList (Story 8.7, AC1/AC2) ──────────

describe('CalendarView — pré-sélection de séance (?seanceId=...)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('?seanceId=xxx → ouvre pollPanelOpen automatiquement et transmet lockedSeanceId', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      queryParams: { seanceId: 'seance1' },
    });
    const comp = fixture.componentInstance as any;

    expect(comp.pollPanelOpen()).toBe(true);
    expect(comp.lockedSeanceId()).toBe('seance1');

    const pollCreation = fixture.nativeElement.querySelector('app-poll-creation');
    expect(pollCreation).toBeTruthy();
  });

  it('sans seanceId → pollPanelOpen fermé par défaut', async () => {
    const { fixture } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    const comp = fixture.componentInstance as any;

    expect(comp.pollPanelOpen()).toBe(false);
    expect(comp.lockedSeanceId()).toBeNull();
  });

  it('closePollPanel() réinitialise lockedSeanceId', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      queryParams: { seanceId: 'seance1' },
    });
    const comp = fixture.componentInstance as any;

    comp.closePollPanel();

    expect(comp.lockedSeanceId()).toBeNull();
    expect(comp.pollPanelOpen()).toBe(false);
  });

  it('?seanceId=xxx sans partieId (route :id absente) → panneau non ouvert (revue de code)', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      queryParams: { seanceId: 'seance1' },
    });
    const comp = fixture.componentInstance as any;

    expect(comp.pollPanelOpen()).toBe(false);
    expect(comp.lockedSeanceId()).toBeNull();
  });

  it('?seanceId=xxx en mode personal (non-MJ) → panneau MJ-only non ouvert, non exposé à un joueur (revue de code)', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      partieId: 'partie-1',
      queryParams: { seanceId: 'seance1' },
    });
    const comp = fixture.componentInstance as any;

    expect(comp.pollPanelOpen()).toBe(false);
    expect(comp.lockedSeanceId()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-poll-creation')).toBeNull();
  });

  it('onPollCreated() ferme le panneau et recharge la liste des votes actifs', async () => {
    const { fixture, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      queryParams: { seanceId: 'seance1' },
    });
    const comp = fixture.componentInstance as any;
    const callsBefore = scenariosSvc.listAll.mock.calls.length;

    await comp.onPollCreated({ id: 'poll1' });

    expect(comp.pollPanelOpen()).toBe(false);
    expect(comp.lockedSeanceId()).toBeNull();
    expect(scenariosSvc.listAll.mock.calls.length).toBe(callsBefore + 1);
  });
});

// ─── Sync calendrier → fenêtre de la destinée (Bug 2) ────────────────────────

describe('CalendarView — rafraîchissement après sauvegarde/suppression (Bug 2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('onPanelSaved() recharge créneaux et heatmap quand une partieId est active', async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });

    // ngOnInit a déjà appelé les deux loaders une fois
    const slotsBefore = pollSvc.getAvailableSlots.mock.calls.length;
    const heatmapBefore = pollSvc.getHeatmap.mock.calls.length;

    await (fixture.componentInstance as any).onPanelSaved();

    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsBefore + 1);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapBefore + 1);
  });

  it('onPanelDeleted() recharge créneaux et heatmap quand une partieId est active', async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });

    const slotsBefore = pollSvc.getAvailableSlots.mock.calls.length;
    const heatmapBefore = pollSvc.getHeatmap.mock.calls.length;

    await (fixture.componentInstance as any).onPanelDeleted();

    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsBefore + 1);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapBefore + 1);
  });

  it('onPanelSaved() sans partieId ne déclenche pas loadAvailableSlots', async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'personal' });

    await (fixture.componentInstance as any).onPanelSaved();

    expect(pollSvc.getAvailableSlots).not.toHaveBeenCalled();
  });

  it('onPanelDeleted() sans partieId ne déclenche pas loadAvailableSlots', async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'personal' });

    await (fixture.componentInstance as any).onPanelDeleted();

    expect(pollSvc.getAvailableSlots).not.toHaveBeenCalled();
  });
});

// ─── Vote(s) actif(s) — liste multi-poll (Story 8.8, AC7) ────────────────────

describe('CalendarView — activePolls() (Story 8.8, AC7 : plusieurs votes actifs)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge les votes actifs (poll OPEN) via ScenariosService.listAll au montage', async () => {
    const { fixture, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    expect(scenariosSvc.listAll).toHaveBeenCalledWith('partie-1');
    expect(comp.activePolls()).toHaveLength(1);
    expect(comp.activePolls()[0].poll.id).toBe('poll1');
    expect(comp.activePolls()[0].scenario.title).toBe('Chapitre 1');
  });

  it('un poll CLOSED (déjà scellé) est exclu de la liste des votes actifs', async () => {
    const closedScenario = {
      ...ACTIVE_POLL_SCENARIO,
      seances: [
        { ...ACTIVE_POLL_SCENARIO.seances[0], poll: { ...ACTIVE_POLL_SCENARIO.seances[0].poll, status: 'CLOSED' } },
      ],
    };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [closedScenario],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.activePolls()).toHaveLength(0);
  });

  it('plusieurs scénarios/séances avec vote OPEN → toutes les entrées présentes, étiquetées', async () => {
    const secondScenario = {
      ...ACTIVE_POLL_SCENARIO,
      id: 's2',
      title: 'Chapitre 2',
      seances: [
        {
          id: 'seance2',
          scenarioId: 's2',
          compteRendu: null,
          createdAt: '2026-07-14T00:00:00.000Z',
          poll: { ...ACTIVE_POLL_SCENARIO.seances[0].poll, id: 'poll2' },
        },
      ],
    };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO, secondScenario],
    });
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.poll-entry__label'),
    ).map((el: any) => el.textContent.trim());
    expect(labels).toEqual(['Chapitre 1', 'Chapitre 2']);
  });

  it('un scénario à plusieurs séances → étiquette précise le numéro de séance', async () => {
    const multiSeanceScenario = {
      ...ACTIVE_POLL_SCENARIO,
      seances: [
        { id: 'seanceA', scenarioId: 's1', compteRendu: null, createdAt: '2026-07-10T00:00:00.000Z' },
        {
          id: 'seanceB',
          scenarioId: 's1',
          compteRendu: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          poll: { ...ACTIVE_POLL_SCENARIO.seances[0].poll },
        },
      ],
    };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [multiSeanceScenario],
    });
    const label = fixture.nativeElement.querySelector('.poll-entry__label').textContent as string;
    expect(label.replace(/\s+/g, ' ').trim()).toBe('Chapitre 1 — Séance 2');
  });

  it('aucun vote actif → message neutre "Aucun vote de date en cours."', async () => {
    const { fixture } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    expect(fixture.nativeElement.textContent).toContain('Aucun vote de date en cours.');
  });

  it('joueur (mode personal) : votes actifs affichés via app-poll-response, étiquetés', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Chapitre 1');
  });

  it('onPollResponded() met à jour uniquement l’entrée concernée (par pollId), pas de refetch', async () => {
    const { fixture, scenariosSvc } = await createCalendarView({
      mode: 'personal',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;
    const callsBefore = scenariosSvc.listAll.mock.calls.length;
    // Reste OPEN (sinon l'entrée sortirait légitimement de activePolls, cf. filtre par statut).
    const updatedPoll = {
      ...ACTIVE_POLL_SCENARIO.seances[0].poll,
      expiresAt: '2026-09-01T00:00:00.000Z',
    };

    comp.onPollResponded(updatedPoll);

    expect(comp.activePolls()[0].poll.expiresAt).toBe('2026-09-01T00:00:00.000Z');
    expect(scenariosSvc.listAll.mock.calls.length).toBe(callsBefore); // pas de refetch
  });
});

// ─── Sélecteur de séance pour lancer un vote depuis l'Oracle (Story 8.8, AC9) ─

describe('CalendarView — eligibleSeances()/startVoteFor() (Story 8.8, AC9)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const NO_POLL_SEANCE = {
    id: 'seanceX',
    scenarioId: 's1',
    compteRendu: null,
    createdAt: '2026-07-13T00:00:00.000Z',
  };

  it('une séance sans poll, scénario non PASSE → éligible, étiquetée scénario + séance', async () => {
    const scenario = { ...ACTIVE_POLL_SCENARIO, seances: [NO_POLL_SEANCE] };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.eligibleSeances()).toHaveLength(1);
    expect(comp.eligibleSeances()[0].seance.id).toBe('seanceX');
    const option = fixture.nativeElement.querySelector('.new-vote-form__select option[value="seanceX"]');
    expect(option.textContent.replace(/\s+/g, ' ').trim()).toBe('Chapitre 1 — Séance 1');
  });

  it('scénario PASSE → ses séances sont exclues (séance passée)', async () => {
    const scenario = { ...ACTIVE_POLL_SCENARIO, status: 'PASSE', seances: [NO_POLL_SEANCE] };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.eligibleSeances()).toHaveLength(0);
  });

  it('séance avec un poll déjà lié (OPEN) → exclue (vote en cours)', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.eligibleSeances()).toHaveLength(0);
  });

  it('séance avec un poll déjà lié mais CLOSED → exclue quand même (createSeancePoll() la rejetterait)', async () => {
    const closedScenario = {
      ...ACTIVE_POLL_SCENARIO,
      seances: [
        {
          ...ACTIVE_POLL_SCENARIO.seances[0],
          poll: { ...ACTIVE_POLL_SCENARIO.seances[0].poll, status: 'CLOSED' },
        },
      ],
    };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [closedScenario],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.eligibleSeances()).toHaveLength(0);
  });

  it('séance épisodique avec dateValidee déjà posée (héritage) → exclue (date déjà choisie)', async () => {
    const scenario = {
      ...ACTIVE_POLL_SCENARIO,
      seances: [
        {
          ...NO_POLL_SEANCE,
          inscription: { min: 2, max: 4, inscrits: [], dateValidee: '2026-08-01T00:00:00.000Z' },
        },
      ],
    };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;

    expect(comp.eligibleSeances()).toHaveLength(0);
  });

  it('aucune séance éligible → sélecteur absent du DOM', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO], // seule séance a déjà un poll OPEN
    });
    expect(fixture.nativeElement.querySelector('.new-vote-form')).toBeNull();
  });

  it('startVoteFor(seanceId) verrouille lockedSeanceId et ouvre pollPanelOpen (réutilise le flux existant)', async () => {
    const scenario = { ...ACTIVE_POLL_SCENARIO, seances: [NO_POLL_SEANCE] };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;

    comp.startVoteFor('seanceX');

    expect(comp.lockedSeanceId()).toBe('seanceX');
    expect(comp.pollPanelOpen()).toBe(true);
  });

  it('startVoteFor("") (rien sélectionné) → ignoré, panneau reste fermé', async () => {
    const scenario = { ...ACTIVE_POLL_SCENARIO, seances: [NO_POLL_SEANCE] };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;

    comp.startVoteFor('');

    expect(comp.pollPanelOpen()).toBe(false);
  });

  it('clic sur "Lancer le vote" avec une séance sélectionnée dans le select → appelle startVoteFor', async () => {
    const scenario = { ...ACTIVE_POLL_SCENARIO, seances: [NO_POLL_SEANCE] };
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [scenario],
    });
    const comp = fixture.componentInstance as any;
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.new-vote-form__select');
    select.value = 'seanceX';
    fixture.detectChanges();

    // Invoque directement le handler du bouton (contourne les subtilités jsdom sur la
    // synchronisation de l'attribut `disabled` natif après une mutation programmatique de
    // `<select>.value` sans passer par une vraie interaction utilisateur) — teste le câblage
    // template → startVoteFor(), déjà couvert unitairement ci-dessus pour la logique elle-même.
    const btnDebugEl = fixture.debugElement.query(By.css('.new-vote-form button'));
    btnDebugEl.triggerEventHandler('click', null);

    expect(comp.lockedSeanceId()).toBe('seanceX');
    expect(comp.pollPanelOpen()).toBe(true);
  });
});

// ─── Choix de la date finale (Story 3.4, révisé Story 8.8 — pollId explicite) ─

describe('CalendarView — onChooseDate()/onClosePoll() (multi-poll, Story 8.8)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('onChooseDate(pollId, optionId) appelle pollSvc.chooseDate, recharge les votes actifs, affiche un toast', async () => {
    const { fixture, pollSvc, snack, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;
    const callsBefore = scenariosSvc.listAll.mock.calls.length;

    await comp.onChooseDate('poll1', 'opt1');

    expect(pollSvc.chooseDate).toHaveBeenCalledWith('partie-1', 'poll1', { optionId: 'opt1' });
    expect(snack.open).toHaveBeenCalledTimes(1);
    expect(snack.open.mock.calls[0][2]).toEqual({ duration: 3000 });
    expect(scenariosSvc.listAll.mock.calls.length).toBe(callsBefore + 1);
  });

  it('onChooseDate() en échec → error affichée, pas de toast, pas de rechargement', async () => {
    const { fixture, pollSvc, snack, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    pollSvc.chooseDate.mockRejectedValueOnce(new Error('network'));
    const comp = fixture.componentInstance as any;
    const callsBefore = scenariosSvc.listAll.mock.calls.length;

    await comp.onChooseDate('poll1', 'opt1');

    expect(comp.error()).toBe('Impossible de choisir cette date. Réessayez.');
    expect(snack.open).not.toHaveBeenCalled();
    expect(scenariosSvc.listAll.mock.calls.length).toBe(callsBefore);
  });

  it('deux appels concurrents à onChooseDate() → un seul appel réel à pollSvc.chooseDate (garde pollActionPending)', async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const p1 = comp.onChooseDate('poll1', 'opt1');
    const p2 = comp.onChooseDate('poll1', 'opt1');
    await Promise.all([p1, p2]);

    expect(pollSvc.chooseDate).toHaveBeenCalledTimes(1);
  });

  it("onClosePoll() bloqué pendant qu'un onChooseDate() est en cours", async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;
    let resolveChoose!: () => void;
    pollSvc.chooseDate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveChoose = resolve;
      }),
    );

    const choosePromise = comp.onChooseDate('poll1', 'opt1');
    await comp.onClosePoll('poll1');
    expect(pollSvc.closePoll).not.toHaveBeenCalled();

    resolveChoose();
    await choosePromise;
  });

  it('onClosePoll(pollId) appelle pollSvc.closePoll et recharge les votes actifs', async () => {
    const { fixture, pollSvc, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;
    const callsBefore = scenariosSvc.listAll.mock.calls.length;

    await comp.onClosePoll('poll1');

    expect(pollSvc.closePoll).toHaveBeenCalledWith('partie-1', 'poll1');
    expect(scenariosSvc.listAll.mock.calls.length).toBe(callsBefore + 1);
  });
});
