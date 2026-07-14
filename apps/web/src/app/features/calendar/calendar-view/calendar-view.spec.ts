import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
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
    getCurrentPoll: vi.fn().mockResolvedValue(null),
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

function makeScenariosService() {
  return { createSeancePoll: vi.fn() };
}

async function createCalendarView(options?: CreateOptions | 'mj' | 'personal') {
  const opts: CreateOptions = typeof options === 'string' ? { mode: options } : (options ?? {});

  const availabilitySvc = makeAvailabilityService();
  const pollSvc = makePollService();
  const snack = makeSnackBar();
  const partiesSvc = makePartiesService();

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
      { provide: ScenariosService, useValue: makeScenariosService() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CalendarView);
  if (opts.mode) fixture.componentRef.setInput('mode', opts.mode);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges(); // D5: second cycle pour les bindings asynchrones
  return { fixture, pollSvc, availabilitySvc, snack, partiesSvc };
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

// ─── Choix de la date finale (Story 3.4) ──────────────────────────────────

describe('CalendarView — onChooseDate()', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setActivePoll(comp: any) {
    comp.activePoll.set({
      id: 'poll1',
      partieId: 'partie-1',
      status: 'OPEN',
      scenarioRef: null,
      expiresAt: null,
      chosenDate: null,
      chosenSlot: null,
      options: [],
    });
  }

  it('onChooseDate() appelle pollSvc.chooseDate, vide activePoll et affiche un toast', async () => {
    const { fixture, pollSvc, snack } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
    });
    const comp = fixture.componentInstance as any;
    setActivePoll(comp);

    await comp.onChooseDate('opt1');

    expect(pollSvc.chooseDate).toHaveBeenCalledWith('partie-1', 'poll1', { optionId: 'opt1' });
    expect(comp.activePoll()).toBeNull();
    expect(snack.open).toHaveBeenCalledTimes(1);
    expect(snack.open.mock.calls[0][2]).toEqual({ duration: 3000 });
  });

  it('onChooseDate() en échec → activePoll conservé, error affichée, pas de toast', async () => {
    const { fixture, pollSvc, snack } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
    });
    pollSvc.chooseDate.mockRejectedValueOnce(new Error('network'));
    const comp = fixture.componentInstance as any;
    setActivePoll(comp);

    await comp.onChooseDate('opt1');

    expect(comp.activePoll()).not.toBeNull();
    expect(comp.error()).toBe('Impossible de choisir cette date. Réessayez.');
    expect(snack.open).not.toHaveBeenCalled();
  });

  it('deux appels concurrents à onChooseDate() → un seul appel réel à pollSvc.chooseDate (garde pollActionPending)', async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    const comp = fixture.componentInstance as any;
    setActivePoll(comp);

    const p1 = comp.onChooseDate('opt1');
    const p2 = comp.onChooseDate('opt1');
    await Promise.all([p1, p2]);

    expect(pollSvc.chooseDate).toHaveBeenCalledTimes(1);
  });

  it("onClosePoll() bloqué pendant qu'un onChooseDate() est en cours", async () => {
    const { fixture, pollSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    const comp = fixture.componentInstance as any;
    setActivePoll(comp);
    let resolveChoose!: () => void;
    pollSvc.chooseDate.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveChoose = resolve;
      }),
    );

    const choosePromise = comp.onChooseDate('opt1');
    await comp.onClosePoll();
    expect(pollSvc.closePoll).not.toHaveBeenCalled();

    resolveChoose();
    await choosePromise;
  });
});
