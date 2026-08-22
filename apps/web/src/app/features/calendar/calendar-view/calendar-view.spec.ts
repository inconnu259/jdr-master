import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Location } from '@angular/common';
import { vi } from 'vitest';
import { CalendarView } from './calendar-view';
import { ActivatedRoute, Router } from '@angular/router';
import type { AuthUser } from '@master-jdr/shared';
import {
  AvailabilityService,
  ConflictError,
} from '../../../core/availability/availability.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { PollService } from '../../../core/poll/poll.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { TONE_MAP } from '../../../core/theme/tones';

interface CreateOptions {
  mode?: 'mj' | 'personal';
  partieId?: string;
  queryParams?: Record<string, string>;
  scenarios?: any[];
  availabilitySvc?: ReturnType<typeof makeAvailabilityService>;
  authSvc?: ReturnType<typeof makeAuthService>;
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
  return {
    getMyDeclarations: vi.fn().mockResolvedValue([]),
    createDeclarationBatch: vi.fn().mockResolvedValue({ created: [] }),
    getMyCalendar: vi.fn().mockResolvedValue({
      'mes-indisponibilites': [],
      'mes-disponibilites': [],
      'mes-seances': [],
      'votes-en-cours': [],
      'inscriptions-ouvertes': [],
    }),
    changed: signal(0),
  };
}

// Story 30.6 : AuthService mocké — seul `currentUser` (source de `defaultCalendarLayers`,
// encadré n°2) est lu par CalendarView.
function makeAuthService(defaultCalendarLayers?: AuthUser['defaultCalendarLayers']) {
  return {
    currentUser: signal<Partial<AuthUser> | null>(
      defaultCalendarLayers ? { defaultCalendarLayers } : null,
    ),
  };
}

function makePollService() {
  return {
    getAvailableSlots: vi.fn().mockResolvedValue([]),
    getHeatmap: vi.fn().mockResolvedValue([]),
    chooseDate: vi.fn().mockResolvedValue(undefined),
    closePoll: vi.fn().mockResolvedValue(undefined),
    // Story 36.7 — les deux écritures du sélecteur de réponse. Sans elles, les nouveaux chemins
    // lèvent au lieu d'échouer proprement.
    castVote: vi.fn().mockResolvedValue(undefined),
    withdrawVote: vi.fn().mockResolvedValue(undefined),
  };
}

/** Story 36.4 : le dialogue de résolution est ouvert par CalendarView. Par défaut il est ANNULÉ
 *  (résultat null) — un test qui veut une résolution règle `dialog.__result`. */
function makeMatDialog() {
  const dialog = {
    __result: null as unknown,
    open: vi.fn((component: unknown, config?: { data?: any }) => ({
      component,
      config,
      afterClosed: () => of(dialog.__result),
    })),
  };
  return dialog;
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
    changed: signal<{ partieId: string } | null>(null),
  };
}

function makeRealtimeService() {
  return { connect: vi.fn(), disconnect: vi.fn() };
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
        // Story 36.6 — effectif de la troupe (MJ + membres).
        membersCount: 4,
        options: [],
      },
    },
  ],
};

async function createCalendarView(options?: CreateOptions | 'mj' | 'personal') {
  const opts: CreateOptions = typeof options === 'string' ? { mode: options } : (options ?? {});

  const availabilitySvc = opts.availabilitySvc ?? makeAvailabilityService();
  const authSvc = opts.authSvc ?? makeAuthService();
  const pollSvc = makePollService();
  const snack = makeSnackBar();
  const dialog = makeMatDialog();
  const partiesSvc = makePartiesService();
  const scenariosSvc = makeScenariosService(opts.scenarios ?? []);
  const realtimeSvc = makeRealtimeService();

  await TestBed.configureTestingModule({
    imports: [CalendarView],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: ActivatedRoute, useValue: makeActivatedRoute(opts.partieId, opts.queryParams) },
      { provide: AvailabilityService, useValue: availabilitySvc },
      { provide: AuthService, useValue: authSvc },
      { provide: PartiesService, useValue: partiesSvc },
      { provide: PollService, useValue: pollSvc },
      { provide: MatSnackBar, useValue: snack },
      { provide: MatDialog, useValue: dialog },
      { provide: ScenariosService, useValue: scenariosSvc },
      { provide: RealtimeService, useValue: realtimeSvc },
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
  return {
    fixture,
    pollSvc,
    availabilitySvc,
    authSvc,
    snack,
    dialog,
    partiesSvc,
    scenariosSvc,
    realtimeSvc,
    location,
  };
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

  it('bouton "Retour" présent dans le DOM sur une route scopée à une Partie', async () => {
    const { fixture } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    expect(fixture.nativeElement.querySelector('.oracle-back-btn')).toBeTruthy();
  });

  it('bouton absent sur la destination globale Calendrier (aucun partieId, correction post-test 29.4)', async () => {
    const { fixture } = await createCalendarView('personal');
    expect(fixture.nativeElement.querySelector('.oracle-back-btn')).toBeNull();
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
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.poll-entry__label')).map(
      (el: any) => el.textContent.trim(),
    );
    expect(labels).toEqual(['Chapitre 1', 'Chapitre 2']);
  });

  it('un scénario à plusieurs séances → étiquette précise le numéro de séance', async () => {
    const multiSeanceScenario = {
      ...ACTIVE_POLL_SCENARIO,
      seances: [
        {
          id: 'seanceA',
          scenarioId: 's1',
          compteRendu: null,
          createdAt: '2026-07-10T00:00:00.000Z',
        },
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

  // ⚠️ Story 36.7, AC3 — ce test CHANGE DE SENS. Il verrouillait la présence de
  // `<app-poll-response>` dans le calendrier (story 8.8, AC8) ; depuis cette story, ce composant
  // est le « second chemin de retrait » que l'AC3 interdit : « aucun second chemin de retrait ne
  // subsiste dans le calendrier ». Il est retiré du calendrier, et de lui SEUL — il reste rendu
  // par la fiche de scénario (`seance-list`, `scenario-read-dialog`), qui ont leurs propres tests.
  // Ce que le joueur perd ici, la grille le lui rend : chaque créneau proposé est nommé et porte
  // sa piste depuis la 36.6, et le sélecteur de réponse s'ouvre dessus.
  it('AC3 — le calendrier ne rend plus app-poll-response : le sélecteur est le seul chemin', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    expect(fixture.nativeElement.querySelector('app-poll-response')).toBeNull();
    // Le vote reste LISIBLE dans le calendrier : l'option est projetée en entrée de calendrier.
    const comp = fixture.componentInstance as any;
    expect(comp.calendarEntries().some((e: any) => e.type === 'votes-en-cours')).toBe(true);
  });

  // ⚠️ Story 36.7 — le test « onPollResponded() met à jour uniquement l’entrée concernée » a été
  // RETIRÉ avec la méthode qu'il couvrait. Elle n'existait que pour l'`(responded)` de
  // `<app-poll-response>`, retiré du calendrier par l'AC3 : elle n'avait plus aucun appelant.
  // Ce que faisait sa mise à jour locale est désormais assuré par le rechargement explicite de
  // `writeVote()` — un seul chemin de fraîcheur après une écriture, dans les deux contextes.

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
    const option = fixture.nativeElement.querySelector(
      '.new-vote-form__select option[value="seanceX"]',
    );
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

// ─── Connexion temps réel (Story 19.1, AC3) ──────────────────────────────────

describe('CalendarView — connexion temps réel (Story 19.1, AC3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('connect() est appelé avec partieTopic(partieId) au montage', async () => {
    const { realtimeSvc } = await createCalendarView({ mode: 'mj', partieId: 'partie-1' });
    expect(realtimeSvc.connect).toHaveBeenCalledWith(partieTopic('partie-1'));
  });

  it('disconnect() est appelé à la destruction du composant', async () => {
    const { fixture, realtimeSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
    });
    fixture.destroy();
    expect(realtimeSvc.disconnect).toHaveBeenCalledWith(partieTopic('partie-1'));
  });

  it('une notification ScenariosService.changed() recharge scénarios et créneaux/heatmap', async () => {
    const { fixture, scenariosSvc, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
    });
    const listAllCallsBefore = scenariosSvc.listAll.mock.calls.length;
    const slotsCallsBefore = pollSvc.getAvailableSlots.mock.calls.length;
    const heatmapCallsBefore = pollSvc.getHeatmap.mock.calls.length;

    scenariosSvc.changed.set({ partieId: '*' });
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(scenariosSvc.listAll.mock.calls.length).toBe(listAllCallsBefore + 1);
    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsCallsBefore + 1);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapCallsBefore + 1);
  });

  it('bug fix : une notification AvailabilityService.changed() (dispo d’un autre membre) recharge créneaux/heatmap', async () => {
    const { fixture, availabilitySvc, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
    });
    const slotsCallsBefore = pollSvc.getAvailableSlots.mock.calls.length;
    const heatmapCallsBefore = pollSvc.getHeatmap.mock.calls.length;

    availabilitySvc.changed.set(1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsCallsBefore + 1);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapCallsBefore + 1);
  });

  it('garde firstRun : un AvailabilityService.changed() déjà non-nul au montage ne déclenche PAS de refetch redondant', async () => {
    const availabilitySvc = {
      getMyDeclarations: vi.fn().mockResolvedValue([]),
      createDeclarationBatch: vi.fn().mockResolvedValue({ created: [] }),
      getMyCalendar: vi.fn().mockResolvedValue({
        'mes-indisponibilites': [],
        'mes-disponibilites': [],
        'mes-seances': [],
        'votes-en-cours': [],
        'inscriptions-ouvertes': [],
      }),
      changed: signal(1),
    };
    const { pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      availabilitySvc,
    });
    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(1);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(1);
  });
});

describe('CalendarView — bandeau contextuel (Story 29.4)', () => {
  it("ngOnInit() renseigne ContextualNavService avec le titre de l'écran", async () => {
    await createCalendarView('personal');

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe(TONE_MAP['grimoire-emeraude']['nav.calendar']);
  });
});

// ─── Câblage de la sélection par glissement (Story 30.3) ─────────────────────

describe('CalendarView — onBatchDeclareRequested (Story 30.3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const CELLS = [
    { date: new Date('2026-08-10'), slot: 'EVENING' as const },
    { date: new Date('2026-08-11'), slot: 'EVENING' as const },
  ];

  it('un seul appel à createDeclarationBatch, jamais une boucle (AC1, AC7)', async () => {
    const { fixture, availabilitySvc } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(availabilitySvc.createDeclarationBatch).toHaveBeenCalledTimes(1);
    const items = availabilitySvc.createDeclarationBatch.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items.every((i: { recurKind: string }) => i.recurKind === 'PUNCTUAL')).toBe(true);
  });

  it('succès → recharge les déclarations', async () => {
    const { fixture, availabilitySvc } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;
    availabilitySvc.getMyDeclarations.mockClear();

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'AVAILABLE' });

    expect(availabilitySvc.getMyDeclarations).toHaveBeenCalledTimes(1);
  });

  // ⚠️ Story 36.4 — ces deux tests CHANGENT DE VÉRITÉ (ils ne disparaissent pas). Le 409 ne se
  // solde plus par une snackbar d'échec en bloc : il OUVRE le dialogue de résolution (D-18).

  function conflict(startDate: string, batchIndex: number) {
    return {
      id: 'ex-' + batchIndex,
      kind: 'AVAILABLE' as const,
      slot: 'EVENING' as const,
      recurKind: 'PUNCTUAL' as const,
      startDate,
      endDate: startDate,
      dayOfWeek: null,
      batchIndex,
    };
  }

  function rejectingBatch(conflicts: ReturnType<typeof conflict>[]) {
    const svc = makeAvailabilityService();
    let call = 0;
    svc.createDeclarationBatch = vi.fn(() => {
      call += 1;
      // 1er appel : le serveur refuse et énumère les conflits. 2e appel (résolu) : succès.
      return call === 1
        ? Promise.reject(new ConflictError(conflicts))
        : Promise.resolve({ created: [] });
    });
    return svc;
  }

  it('AC1 : 409 → le dialogue de résolution s’ouvre, aucune snackbar d’échec en bloc', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    const { fixture, snack, dialog } = await createCalendarView({
      mode: 'personal',
      availabilitySvc,
    });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(snack.open).not.toHaveBeenCalled();
  });

  it('AC2 : le dialogue reçoit les créneaux NOMMÉS, pas un simple décompte', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-10', 0), conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    const data = dialog.open.mock.calls[0][1]!.data;
    const labels = data.conflicts.map((c: { label: string }) => c.label);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('10');
    expect(labels[1]).toContain('11');
    expect(data.conflicts.map((c: { batchIndex: number }) => c.batchIndex)).toEqual([0, 1]);
  });

  it('AC2 : un créneau « Journée » est nommé par sa seule date — sinon le séparateur devient ambigu', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 0)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({
      cells: [{ date: new Date('2026-08-10'), slot: 'FULL_DAY' as const }],
      kind: 'UNAVAILABLE',
    });

    const label = dialog.open.mock.calls[0][1]!.data.conflicts[0].label as string;
    expect(label).not.toContain('Journée');
    expect(label).toContain('10');
  });

  it('AC2 : un créneau partiel garde son nom de créneau', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 0)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({
      cells: [{ date: new Date('2026-08-10'), slot: 'EVENING' as const }],
      kind: 'UNAVAILABLE',
    });

    expect(dialog.open.mock.calls[0][1]!.data.conflicts[0].label).toContain('Soir');
  });

  it('AC12 : la sélection est RETENUE — la résolution rejoue le lot complet en un seul appel', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    dialog.__result = { 1: 'overwrite' };
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(availabilitySvc.createDeclarationBatch).toHaveBeenCalledTimes(2);
    const items = availabilitySvc.createDeclarationBatch.mock.calls[1][0];
    expect(items).toHaveLength(2);
    expect(items[0].conflictResolution).toBeUndefined();
    expect(items[1].conflictResolution).toBe('overwrite');
  });

  it('AC10 : annuler le dialogue → aucun second appel, rien n’est enregistré', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    dialog.__result = null;
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(availabilitySvc.createDeclarationBatch).toHaveBeenCalledTimes(1);
  });

  it('AC10 : un geste résolu ne produit jamais plus de DEUX appels, quel que soit le nombre de conflits', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-10', 0), conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    dialog.__result = { 0: 'keep', 1: 'overwrite' };
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(availabilitySvc.createDeclarationBatch).toHaveBeenCalledTimes(2);
    const items = availabilitySvc.createDeclarationBatch.mock.calls[1][0];
    expect(items[0].conflictResolution).toBe('keep');
    expect(items[1].conflictResolution).toBe('overwrite');
  });

  it('AC14 : un conflit INTERNE (sans batchIndex exploitable) garde le message d’échec en bloc', async () => {
    const availabilitySvc = makeAvailabilityService();
    availabilitySvc.createDeclarationBatch = vi.fn().mockRejectedValue(
      new ConflictError([
        { ...conflict('2026-08-10', 0), id: 'batch-item-0', internal: true },
        { ...conflict('2026-08-11', 1), id: 'batch-item-1', internal: true },
      ]),
    );
    const { fixture, snack, dialog } = await createCalendarView({
      mode: 'personal',
      availabilitySvc,
    });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(dialog.open).not.toHaveBeenCalled();
    expect(snack.open).toHaveBeenCalledTimes(1);
  });

  it('AC11 : une cellule couverte par une séance figure en exception, et jamais en conflit', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    availabilitySvc.getMyCalendar = vi.fn().mockResolvedValue({
      'mes-indisponibilites': [],
      'mes-disponibilites': [],
      'mes-seances': [
        {
          seanceId: 's1',
          partieId: 'p1',
          partieName: 'Partie',
          scenarioId: 'sc1',
          scenarioTitle: 'Le Convoi',
          date: '2026-08-10',
          slot: 'EVENING',
        },
      ],
      'votes-en-cours': [],
      'inscriptions-ouvertes': [],
    });
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'AVAILABLE' });

    const data = dialog.open.mock.calls[0][1]!.data;
    expect(data.seanceExceptions).toHaveLength(1);
    expect(data.seanceExceptions[0]).toContain('10');
    expect(data.conflicts.map((c: { batchIndex: number }) => c.batchIndex)).not.toContain(0);
  });

  it('AC11 : sans séance recouverte, aucune exception n’est transmise au dialogue', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(dialog.open.mock.calls[0][1]!.data.seanceExceptions).toEqual([]);
  });

  it('AC11 : construire l’exception n’émet AUCUN appel réseau supplémentaire', async () => {
    const availabilitySvc = rejectingBatch([conflict('2026-08-11', 1)]);
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    availabilitySvc.getMyCalendar.mockClear();
    dialog.__result = null;
    const comp = fixture.componentInstance as any;

    await comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' });

    expect(availabilitySvc.getMyCalendar).not.toHaveBeenCalled();
  });

  it('une garde empêche d’ouvrir deux dialogues de conflit à la fois', async () => {
    // Rejet SYSTÉMATIQUE : sans garde, les deux gestes ouvriraient chacun leur dialogue.
    const availabilitySvc = makeAvailabilityService();
    availabilitySvc.createDeclarationBatch = vi
      .fn()
      .mockRejectedValue(new ConflictError([conflict('2026-08-11', 1)]));
    const { fixture, dialog } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    await Promise.all([
      comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' }),
      comp.onBatchDeclareRequested({ cells: CELLS, kind: 'UNAVAILABLE' }),
    ]);

    expect(dialog.open).toHaveBeenCalledTimes(1);
  });
});

// ─── Couches du calendrier — état et bandeau (Story 30.6, AC3/AC4/AC7, encadré n°2) ───────────

describe('CalendarView — couches actives (Story 30.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('montage en contexte personnel : 5 couches actives (disponibilite-groupe absente, AC8)', async () => {
    const authSvc = makeAuthService([
      'mes-indisponibilites',
      'mes-disponibilites',
      'mes-seances',
      'votes-en-cours',
      'inscriptions-ouvertes',
      'disponibilite-groupe',
    ]);
    const { fixture } = await createCalendarView({ mode: 'personal', authSvc });
    const comp = fixture.componentInstance as any;

    expect(comp.activeLayers()).toEqual([
      'mes-indisponibilites',
      'mes-disponibilites',
      'mes-seances',
      'votes-en-cours',
      'inscriptions-ouvertes',
    ]);
  });

  it('montage en contexte de partie : 6 couches actives (disponibilite-groupe incluse, AC9)', async () => {
    const authSvc = makeAuthService([
      'mes-indisponibilites',
      'mes-disponibilites',
      'mes-seances',
      'votes-en-cours',
      'inscriptions-ouvertes',
      'disponibilite-groupe',
    ]);
    const { fixture } = await createCalendarView({ mode: 'mj', partieId: 'partie-1', authSvc });
    const comp = fixture.componentInstance as any;

    expect(comp.activeLayers()).toHaveLength(6);
    expect(comp.activeLayers()).toContain('disponibilite-groupe');
  });

  it('toggleLayer() retire une couche par défaut → isOverridden() true (AC4, retrait pas seulement ajout)', async () => {
    const { fixture } = await createCalendarView({ mode: 'personal' });
    const comp = fixture.componentInstance as any;
    expect(comp.isOverridden()).toBe(false);

    comp.toggleLayer('mes-indisponibilites');

    expect(comp.activeLayers()).not.toContain('mes-indisponibilites');
    expect(comp.isOverridden()).toBe(true);
  });

  it('toggleLayer() ajoute une couche absente du défaut → isOverridden() true', async () => {
    const authSvc = makeAuthService(['mes-disponibilites']);
    const { fixture } = await createCalendarView({ mode: 'personal', authSvc });
    const comp = fixture.componentInstance as any;
    expect(comp.isOverridden()).toBe(false);

    comp.toggleLayer('mes-indisponibilites');

    expect(comp.isOverridden()).toBe(true);
  });

  it('resetToDefault() réaffecte le défaut du compte, aucun appel HTTP émis (AC3, encadré n°2)', async () => {
    const availabilitySvc = makeAvailabilityService();
    const { fixture } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;
    comp.toggleLayer('mes-indisponibilites');
    expect(comp.isOverridden()).toBe(true);
    const callsBefore = availabilitySvc.getMyCalendar.mock.calls.length;

    comp.resetToDefault();

    expect(comp.isOverridden()).toBe(false);
    expect(availabilitySvc.getMyCalendar.mock.calls.length).toBe(callsBefore);
  });

  it('une bascule de visite ne modifie jamais le défaut — un remontage (nouvelle navigation) rétablit le défaut (AC3)', async () => {
    const authSvc = makeAuthService(['mes-disponibilites', 'mes-indisponibilites']);
    const { fixture } = await createCalendarView({ mode: 'personal', authSvc });
    const comp = fixture.componentInstance as any;
    comp.toggleLayer('mes-indisponibilites');
    expect(comp.activeLayers()).toEqual(['mes-disponibilites']);

    // Remontage simulé (nouvelle instance du composant, même défaut de compte) — jamais
    // persisté par la bascule précédente : aucun appel PATCH n'existe même dans ce composant.
    fixture.destroy();
    TestBed.resetTestingModule();
    const second = await createCalendarView({ mode: 'personal', authSvc });
    const comp2 = second.fixture.componentInstance as any;

    expect(comp2.activeLayers()).toEqual(['mes-disponibilites', 'mes-indisponibilites']);
  });
});

// ─── Source des couches — deux chemins distincts (Story 30.6, AC6/AC8/AC9, encadré n°1) ───────

describe('CalendarView — source des couches (Story 30.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('contexte personnel : GET /me/calendar appelé une seule fois au montage', async () => {
    const availabilitySvc = makeAvailabilityService();
    await createCalendarView({ mode: 'personal', availabilitySvc });

    expect(availabilitySvc.getMyCalendar).toHaveBeenCalledTimes(1);
  });

  it('contexte de partie : GET /me/calendar jamais appelé (AC9)', async () => {
    const availabilitySvc = makeAvailabilityService();
    await createCalendarView({ mode: 'mj', partieId: 'partie-1', availabilitySvc });

    expect(availabilitySvc.getMyCalendar).not.toHaveBeenCalled();
  });

  it('contexte de partie : votes-en-cours dérivé d’activePolls, aucune requête HTTP de plus en bascule (AC6)', async () => {
    const { fixture, pollSvc, scenariosSvc, availabilitySvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;
    const slotsCalls = pollSvc.getAvailableSlots.mock.calls.length;
    const heatmapCalls = pollSvc.getHeatmap.mock.calls.length;
    const listAllCalls = scenariosSvc.listAll.mock.calls.length;
    const meCalendarCalls = availabilitySvc.getMyCalendar.mock.calls.length;

    comp.toggleLayer('votes-en-cours');

    expect(comp.agendaEntries().some((e: any) => e.type === 'votes-en-cours')).toBe(false);
    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsCalls);
    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapCalls);
    expect(scenariosSvc.listAll.mock.calls.length).toBe(listAllCalls);
    expect(availabilitySvc.getMyCalendar.mock.calls.length).toBe(meCalendarCalls);
  });
});

// ─── Piste de participation — une entrée par OPTION (Story 36.6, AC8) ─────────────────────────

const TWO_OPTION_POLL_SCENARIO = {
  ...ACTIVE_POLL_SCENARIO,
  seances: [
    {
      ...ACTIVE_POLL_SCENARIO.seances[0],
      poll: {
        ...ACTIVE_POLL_SCENARIO.seances[0].poll,
        membersCount: 4,
        options: [
          {
            id: 'o1',
            date: '2026-08-28T00:00:00.000Z',
            slot: 'EVENING',
            votes: [
              { userId: 'me', pseudo: 'Moi', displayName: 'Moi', answer: 'YES' },
              { userId: 'u2', pseudo: 'Bob', displayName: 'Bob', answer: 'YES' },
              { userId: 'u3', pseudo: 'Cyd', displayName: 'Cyd', answer: 'MAYBE' },
            ],
          },
          {
            id: 'o2',
            date: '2026-08-29T00:00:00.000Z',
            slot: 'EVENING',
            votes: [{ userId: 'u2', pseudo: 'Bob', displayName: 'Bob', answer: 'NO' }],
          },
        ],
      },
    },
  ],
};

describe('CalendarView — une piste par créneau proposé (Story 36.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC8 — contexte de partie : un vote à deux options produit DEUX entrées, sur DEUX dates', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const votes = comp.calendarEntries().filter((e: any) => e.type === 'votes-en-cours');
    expect(votes).toHaveLength(2);
    expect(votes.map((e: any) => e.date).sort()).toEqual(['2026-08-28', '2026-08-29']);
  });

  it('AC8 — les clés restent distinctes entre deux options du même vote', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const keys = comp
      .calendarEntries()
      .filter((e: any) => e.type === 'votes-en-cours')
      .map((e: any) => e.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('AC7 — les compteurs et ma réponse sont dérivés de la charge utile déjà chargée (AD-20), aucun appel de plus', async () => {
    const authSvc = { currentUser: signal<Partial<AuthUser> | null>({ id: 'me' }) };
    const { fixture, pollSvc, scenariosSvc, availabilitySvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
      authSvc,
    });
    const comp = fixture.componentInstance as any;

    const first = comp
      .calendarEntries()
      .find((e: any) => e.type === 'votes-en-cours' && e.date === '2026-08-28');
    expect(first.vote).toEqual({
      partieId: 'partie-1',
      pollId: 'poll1',
      optionId: 'o1',
      yes: 2,
      maybe: 1,
      no: 0,
      total: 4,
      myAnswer: 'YES',
    });
    // Aucun appel réseau n'a été émis pour obtenir cela : la charge utile était déjà là.
    expect(availabilitySvc.getMyCalendar).not.toHaveBeenCalled();
    expect(pollSvc.getAvailableSlots).toHaveBeenCalledTimes(1);
    expect(scenariosSvc.listAll).toHaveBeenCalledTimes(1);
  });

  it("une option sur laquelle je n'ai pas voté porte myAnswer null", async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const second = comp
      .calendarEntries()
      .find((e: any) => e.type === 'votes-en-cours' && e.date === '2026-08-29');
    expect(second.vote.myAnswer).toBeNull();
    expect(second.vote.no).toBe(1);
  });

  it('🚨 dégradation : une API qui ne sert pas encore les agrégats ne produit NI piste NI « NaN / undefined »', async () => {
    const availabilitySvc = makeAvailabilityService();
    // Forme ANTÉRIEURE à la story 36.6 — ce que renvoie une API en retard pendant un déploiement.
    availabilitySvc.getMyCalendar.mockResolvedValue({
      'mes-indisponibilites': [],
      'mes-disponibilites': [],
      'mes-seances': [],
      'votes-en-cours': [
        {
          pollId: 'poll9',
          partieId: 'partie-9',
          partieName: 'Les Cendres',
          options: [{ date: '2026-08-28', slot: 'EVENING' }],
        },
      ],
      'inscriptions-ouvertes': [],
    });
    const { fixture } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    const votes = comp.calendarEntries().filter((e: any) => e.type === 'votes-en-cours');
    expect(votes).toHaveLength(1);
    // L'entrée existe (le vote est toujours signalé), mais SANS participation : aucune piste.
    expect(votes[0].vote).toBeUndefined();
  });

  it('AC6/AC8 — contexte personnel : les agrégats servis par GET /me/calendar sont repris tels quels, une entrée par option', async () => {
    const availabilitySvc = makeAvailabilityService();
    availabilitySvc.getMyCalendar.mockResolvedValue({
      'mes-indisponibilites': [],
      'mes-disponibilites': [],
      'mes-seances': [],
      'votes-en-cours': [
        {
          pollId: 'poll9',
          partieId: 'partie-9',
          partieName: 'Les Cendres',
          membersCount: 4,
          options: [
            {
              optionId: 'o1',
              date: '2026-08-28',
              slot: 'EVENING',
              yes: 2,
              maybe: 1,
              no: 0,
              myAnswer: 'YES',
            },
            {
              optionId: 'o2',
              date: '2026-08-29',
              slot: 'EVENING',
              yes: 0,
              maybe: 0,
              no: 1,
              myAnswer: null,
            },
          ],
        },
      ],
      'inscriptions-ouvertes': [],
    });
    const { fixture } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const comp = fixture.componentInstance as any;

    const votes = comp.calendarEntries().filter((e: any) => e.type === 'votes-en-cours');
    expect(votes).toHaveLength(2);
    expect(votes[0].vote).toEqual({
      partieId: 'partie-9',
      pollId: 'poll9',
      optionId: 'o1',
      yes: 2,
      maybe: 1,
      no: 0,
      total: 4,
      myAnswer: 'YES',
    });
    expect(availabilitySvc.getMyCalendar).toHaveBeenCalledTimes(1);
  });
});

// ─── Vue Agenda (Story 30.6, AC1/AC2) ─────────────────────────────────────────────────────────

describe('CalendarView — vue Agenda (Story 30.6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('troisième option "Vue agenda" présente dans le sélecteur (AC1)', async () => {
    const { fixture } = await createCalendarView('personal');
    const toggles = Array.from(fixture.nativeElement.querySelectorAll('mat-button-toggle')).map(
      (el: any) => el.textContent.trim(),
    );
    expect(toggles).toContain('Vue agenda');
  });

  it('bascule vers la vue agenda affiche app-calendar-agenda-view', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onViewChange('agenda');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-calendar-agenda-view')).toBeTruthy();
  });

  it('une couche désactivée n’apporte plus ses entrées à agendaEntries()', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      availabilitySvc: (() => {
        const svc = makeAvailabilityService();
        svc.getMyCalendar.mockResolvedValue({
          'mes-indisponibilites': [],
          'mes-disponibilites': [],
          'mes-seances': [
            {
              seanceId: 'sX',
              partieId: 'pX',
              partieName: 'Partie X',
              scenarioId: 'scX',
              scenarioTitle: 'Chapitre X',
              date: '2026-09-01',
              slot: 'EVENING',
            },
          ],
          'votes-en-cours': [],
          'inscriptions-ouvertes': [],
        });
        return svc;
      })(),
    });
    const comp = fixture.componentInstance as any;

    expect(comp.agendaEntries().some((e: any) => e.type === 'mes-seances')).toBe(true);

    comp.toggleLayer('mes-seances');

    expect(comp.agendaEntries().some((e: any) => e.type === 'mes-seances')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 36.1 — Le rail de détail
// ─────────────────────────────────────────────────────────────────────────────

/** Calendrier personnel portant une séance datée, pour exercer le rail hors contexte de partie. */
function makeAvailabilityServiceWithSeance(date = '2026-09-01', slot = 'EVENING') {
  const svc = makeAvailabilityService();
  svc.getMyCalendar.mockResolvedValue({
    'mes-indisponibilites': [],
    'mes-disponibilites': [],
    'mes-seances': [
      {
        seanceId: 'sX',
        partieId: 'pX',
        partieName: 'Partie X',
        scenarioId: 'scX',
        scenarioTitle: 'Chapitre X',
        date,
        slot,
      },
    ],
    'votes-en-cours': [],
    'inscriptions-ouvertes': [],
  });
  return svc;
}

describe('CalendarView — rail : présence permanente (AC1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('rend le rail en vue mois', async () => {
    const { fixture } = await createCalendarView('personal');

    expect(fixture.nativeElement.querySelector('app-calendar-detail-rail')).toBeTruthy();
  });

  it('rend le rail en vue semaine', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onViewChange('week');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-calendar-detail-rail')).toBeTruthy();
  });

  it('ne rend pas le rail en vue agenda — celle-ci est déjà une liste détaillée', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onViewChange('agenda');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-calendar-detail-rail')).toBeNull();
  });

  it('n’expose aucun geste d’ouverture ou de fermeture du rail', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    expect(comp.railOpen).toBeUndefined();
    expect(comp.toggleRail).toBeUndefined();
  });
});

describe('CalendarView — rail : il suit le toucher (AC2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // ⚠️ Story 36.3, AC1/AC11 — ce test portait la garantie « le toucher ouvre TOUJOURS le
  // panneau » (AC9 de 36.1). Elle est levée : le toucher arme une sélection, et le panneau se
  // rejoint par « Autre… ». Ce qui reste dû, c'est que le rail suive — AC2 de 36.1.
  it('AC11 — un toucher peuple le rail et n’ouvre PLUS le panneau de déclaration', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'EVENING' });
    fixture.detectChanges();

    expect(comp.railSlot()).toBe('EVENING');
    expect(comp.railDetail().date).toBe('2026-09-01');
    expect(comp.panelOpen()).toBe(false);
  });

  it('AC4/AC10 — « Autre… » ouvre le panneau, avec la déclaration existante s’il y en a une', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onDeclarationPanelRequested({ date: new Date(2026, 8, 1), slot: 'EVENING' });
    fixture.detectChanges();

    expect(comp.panelOpen()).toBe(true);
    expect(comp.selectedSlot()).toBe('EVENING');
    // `selectedExisting` est renseigné par le même chemin qu'avant (findMatchingDeclaration) —
    // sans lui, la suppression et la découpe d'une récurrente deviendraient inatteignables.
    expect(comp.selectedExisting()).toBeDefined();
    // Le rail suit aussi ce chemin (AC11).
    expect(comp.railDetail().date).toBe('2026-09-01');
  });

  it('n’utilise PAS les signaux du panneau — fermer le panneau ne vide pas le rail', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'EVENING' });
    comp.closePanel();
    fixture.detectChanges();

    expect(comp.panelOpen()).toBe(false);
    expect(comp.railDetail().date).toBe('2026-09-01');
  });

  it('le détail porte toujours trois créneaux', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'FULL_DAY' });

    expect(comp.railDetail().slots.map((s: any) => s.slot)).toEqual([
      'MORNING',
      'AFTERNOON',
      'EVENING',
    ]);
  });
});

describe('CalendarView — rail : état de repos (AC3/AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('montre le prochain jour porteur quand aucune case n’a été touchée', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      availabilitySvc: makeAvailabilityServiceWithSeance('2026-09-01'),
    });
    const comp = fixture.componentInstance as any;

    expect(comp.railDate()).toBeNull();
    expect(comp.railDetail().date).toBe('2026-09-01');
    expect(comp.railDetail().slots[2].seanceLabel).toBe('Partie X — Chapitre X');
  });

  it('retombe sur aujourd’hui quand rien n’est porteur, plutôt qu’un rail blanc', async () => {
    const { fixture } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    const todayKey = new Date().toLocaleDateString('sv-SE');
    expect(comp.railDetail().date).toBe(todayKey);
    expect(comp.railDetail().isEmpty).toBe(true);
  });
});

describe('CalendarView — rail : AC5, zéro appel réseau supplémentaire', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('un toucher n’émet aucun appel de plus (contexte personnel)', async () => {
    const { fixture, availabilitySvc, pollSvc } = await createCalendarView('personal');
    const comp = fixture.componentInstance as any;

    const calendarCalls = availabilitySvc.getMyCalendar.mock.calls.length;
    const declCalls = availabilitySvc.getMyDeclarations.mock.calls.length;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'MORNING' });
    comp.railDetail();
    fixture.detectChanges();

    expect(availabilitySvc.getMyCalendar.mock.calls.length).toBe(calendarCalls);
    expect(availabilitySvc.getMyDeclarations.mock.calls.length).toBe(declCalls);
    expect(pollSvc.getHeatmap).not.toHaveBeenCalled();
    expect(pollSvc.getAvailableSlots).not.toHaveBeenCalled();
  });

  it('un toucher n’émet aucun appel de plus (contexte de partie)', async () => {
    const { fixture, availabilitySvc, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const heatmapCalls = pollSvc.getHeatmap.mock.calls.length;
    const slotsCalls = pollSvc.getAvailableSlots.mock.calls.length;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'MORNING' });
    comp.railDetail();
    fixture.detectChanges();

    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapCalls);
    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsCalls);
    // Le calendrier personnel n'est JAMAIS appelé depuis un contexte de partie (AD-18).
    expect(availabilitySvc.getMyCalendar).not.toHaveBeenCalled();
  });
});

describe('CalendarView — bandes du Mois : AC13, zéro appel réseau', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('basculer une couche ne déclenche aucun appel — les bandes se redérivent localement', async () => {
    const { fixture, availabilitySvc, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const heatmapCalls = pollSvc.getHeatmap.mock.calls.length;
    const slotsCalls = pollSvc.getAvailableSlots.mock.calls.length;
    const declCalls = availabilitySvc.getMyDeclarations.mock.calls.length;

    comp.toggleLayer('mes-seances');
    comp.toggleLayer('votes-en-cours');
    fixture.detectChanges();

    expect(pollSvc.getHeatmap.mock.calls.length).toBe(heatmapCalls);
    expect(pollSvc.getAvailableSlots.mock.calls.length).toBe(slotsCalls);
    expect(availabilitySvc.getMyDeclarations.mock.calls.length).toBe(declCalls);
    expect(availabilitySvc.getMyCalendar).not.toHaveBeenCalled();
  });

  it('transmet à la vue Mois les entrées NON filtrées par couche (FR-50)', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const before = comp.calendarEntries().length;
    comp.toggleLayer('votes-en-cours');

    // agendaEntries() perd les votes, calendarEntries() les conserve : c'est ce qui permet à la
    // case de garder son rang et son indisponibilité quand la couche est éteinte.
    expect(comp.agendaEntries().some((e: any) => e.type === 'votes-en-cours')).toBe(false);
    expect(comp.calendarEntries().length).toBe(before);
  });
});

describe('CalendarView — rail : AC6, la couche gouverne le texte', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('éteindre « mes séances » retire le titre mais garde l’indisponibilité', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      availabilitySvc: makeAvailabilityServiceWithSeance('2026-09-01'),
    });
    const comp = fixture.componentInstance as any;

    comp.onSlotSelected({ date: new Date(2026, 8, 1), slot: 'EVENING' });
    expect(comp.railDetail().slots[2].seanceLabel).toBe('Partie X — Chapitre X');
    expect(comp.railDetail().slots[2].status).toBe('UNAVAILABLE');

    comp.toggleLayer('mes-seances');

    expect(comp.railDetail().slots[2].seanceLabel).toBeNull();
    expect(comp.railDetail().slots[2].status).toBe('UNAVAILABLE');
  });
});

describe('CalendarView — rail : AC11, activer une ligne ouvre le scénario', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('navigue vers l’écran du scénario, jamais vers un écran de séance', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      availabilitySvc: makeAvailabilityServiceWithSeance('2026-09-01'),
    });
    const comp = fixture.componentInstance as any;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await comp.onScenarioActivated({ partieId: 'pX', scenarioId: 'scX' });

    expect(navigate).toHaveBeenCalledWith(['/parties', 'pX', 'scenarios', 'scX']);
  });

  it('expose une cible navigable sur la séance du calendrier personnel', async () => {
    const { fixture } = await createCalendarView({
      mode: 'personal',
      availabilitySvc: makeAvailabilityServiceWithSeance('2026-09-01'),
    });
    const comp = fixture.componentInstance as any;

    expect(comp.railDetail().slots[2].seanceTarget).toEqual({
      partieId: 'pX',
      scenarioId: 'scX',
    });
  });

  it('les entrées de séance d’un contexte de partie ne nomment que CETTE partie (AC7)', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [ACTIVE_POLL_SCENARIO],
    });
    const comp = fixture.componentInstance as any;

    const seances = comp.agendaEntries().filter((e: any) => e.type === 'mes-seances');
    for (const s of seances) expect(s.partieId).toBe('partie-1');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Story 36.7 — le sélecteur de réponse de vote
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('CalendarView — le sélecteur de réponse de vote (Story 36.7)', () => {
  /** 🚨 Le sélecteur vit dans le CONTENEUR D'OVERLAY, attaché à `document.body` — jamais dans
   *  `fixture.nativeElement`. Une assertion négative faite dans le fixture passerait toujours,
   *  pour une mauvaise raison. On interroge donc le document, et on nettoie entre les tests. */
  function pickerEl(): HTMLElement | null {
    return document.body.querySelector('app-vote-answer-picker');
  }

  function pickerOption(answer: string): HTMLButtonElement {
    return document.body.querySelector(
      `app-vote-answer-picker .opt2--answer[data-answer="${answer}"]`,
    ) as HTMLButtonElement;
  }

  afterEach(() => {
    // Sans ce nettoyage, les overlays s'accumulent d'un test à l'autre et les assertions de
    // présence deviennent fausses par intermittence.
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  /** Ouvre le sélecteur en jouant le signal que les vues émettent (`voteOptionActivated`) —
   *  le chemin réel, sans dépendre du rendu d'une bande dans jsdom. */
  async function openPicker(fixture: any, vote: Record<string, unknown>, anchor?: HTMLElement) {
    const el = anchor ?? document.createElement('div');
    document.body.appendChild(el);
    (fixture.componentInstance as any).onVoteOptionActivated({
      vote,
      date: new Date(2026, 7, 28),
      slot: 'EVENING',
      anchor: el,
    });
    await tick(fixture);
    return el;
  }

  async function tick(fixture: any) {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  const PARTIE_VOTE = {
    partieId: 'partie-1',
    pollId: 'poll1',
    optionId: 'o1',
    yes: 2,
    maybe: 1,
    no: 0,
    total: 4,
    myAnswer: 'YES' as const,
  };

  it('AC1 — ouvre un sélecteur proposant oui, peut-être, non', async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });

    expect(pickerEl()).toBeNull();
    await openPicker(fixture, PARTIE_VOTE);

    expect(pickerEl()).toBeTruthy();
    expect(pickerOption('YES')).toBeTruthy();
    expect(pickerOption('MAYBE')).toBeTruthy();
    expect(pickerOption('NO')).toBeTruthy();
  });

  it("AC1 — l'entête nomme le jour ET le créneau touchés", async () => {
    const { fixture } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    await openPicker(fixture, PARTIE_VOTE);

    const head = document.body.querySelector('app-vote-answer-picker .picker__head');
    expect(head?.textContent).toContain('28');
    expect(head?.textContent?.toLowerCase()).toContain('soir');
  });

  it("AC8 — en contexte de partie, l'écriture vise la partie de la ROUTE", async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    await openPicker(fixture, PARTIE_VOTE);

    pickerOption('MAYBE').click();
    await tick(fixture);

    expect(pollSvc.castVote).toHaveBeenCalledWith('partie-1', 'poll1', {
      optionId: 'o1',
      answer: 'MAYBE',
    });
  });

  it("AC8 — en calendrier PERSONNEL, l'écriture vise la partie de l'ENTRÉE, pas une autre", async () => {
    // Le seul test qui prouve l'encadré n°3 : le calendrier personnel agrège plusieurs parties,
    // et rien dans la route ne dit laquelle porte le vote touché.
    const { fixture, pollSvc } = await createCalendarView({ mode: 'personal' });
    await openPicker(fixture, { ...PARTIE_VOTE, partieId: 'partie-9', pollId: 'poll9' });

    pickerOption('NO').click();
    await tick(fixture);

    expect(pollSvc.castVote).toHaveBeenCalledWith('partie-9', 'poll9', {
      optionId: 'o1',
      answer: 'NO',
    });
  });

  it('AC2/AC3 — le retrait passe par ce sélecteur, et par lui seul', async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    await openPicker(fixture, PARTIE_VOTE);

    const withdraw = document.body.querySelector(
      'app-vote-answer-picker .opt2--withdraw',
    ) as HTMLButtonElement;
    expect(withdraw).toBeTruthy();
    withdraw.click();
    await tick(fixture);

    expect(pollSvc.withdrawVote).toHaveBeenCalledWith('partie-1', 'poll1', 'o1');
  });

  it('AC4 — fermer sans choisir ne change rien', async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    await openPicker(fixture, PARTIE_VOTE);

    (fixture.componentInstance as any).closePicker();
    await tick(fixture);

    expect(pickerEl()).toBeNull();
    expect(pollSvc.castVote).not.toHaveBeenCalled();
    expect(pollSvc.withdrawVote).not.toHaveBeenCalled();
  });

  it('AC4 — Échap ferme le sélecteur sans rien écrire', async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    await openPicker(fixture, PARTIE_VOTE);

    (fixture.componentInstance as any).onPickerKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    await tick(fixture);

    expect(pickerEl()).toBeNull();
    expect(pollSvc.castVote).not.toHaveBeenCalled();
  });

  it("AC9 — après une écriture réussie, le sélecteur se ferme et l'écran se recharge", async () => {
    const { fixture, pollSvc, scenariosSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    const before = scenariosSvc.listAll.mock.calls.length;
    await openPicker(fixture, PARTIE_VOTE);

    pickerOption('YES').click();
    await tick(fixture);

    expect(pollSvc.castVote).toHaveBeenCalledTimes(1);
    expect(scenariosSvc.listAll.mock.calls.length).toBeGreaterThan(before);
    expect(pickerEl()).toBeNull();
  });

  it("AC9 — en calendrier personnel, c'est GET /me/calendar qui est rejoué", async () => {
    const availabilitySvc = makeAvailabilityService();
    const { fixture } = await createCalendarView({ mode: 'personal', availabilitySvc });
    const before = availabilitySvc.getMyCalendar.mock.calls.length;
    await openPicker(fixture, { ...PARTIE_VOTE, partieId: 'partie-9' });

    pickerOption('YES').click();
    await tick(fixture);

    expect(availabilitySvc.getMyCalendar.mock.calls.length).toBeGreaterThan(before);
  });

  it("AC10 — un échec n'affiche jamais une réponse comme enregistrée", async () => {
    // `myAnswer` se dérive de l'utilisateur courant : sans lui, la piste ne saurait pas dire ce
    // que J'AI répondu, et l'assertion porterait sur rien.
    const authSvc = { currentUser: signal<Partial<AuthUser> | null>({ id: 'me' }) };
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
      authSvc,
    });
    pollSvc.castVote.mockRejectedValueOnce(new Error('400'));
    await openPicker(fixture, PARTIE_VOTE);

    pickerOption('NO').click();
    await tick(fixture);

    const comp = fixture.componentInstance as any;
    expect(comp.error()).toBeTruthy();
    // L'état affiché n'a pas bougé : la piste dit toujours ce que le serveur, lui, dit.
    const entry = comp
      .calendarEntries()
      .find((e: any) => e.type === 'votes-en-cours' && e.vote?.optionId === 'o1');
    expect(entry.vote.myAnswer).toBe('YES');
  });

  it("AC11 — deux activations rapprochées ne produisent qu'UNE requête", async () => {
    const { fixture, pollSvc } = await createCalendarView({
      mode: 'mj',
      partieId: 'partie-1',
      scenarios: [TWO_OPTION_POLL_SCENARIO],
    });
    // La première écriture est laissée EN VOL : c'est le seul état où la garde d'unicité peut
    // être observée. On la relâche à la fin du test pour ne pas laisser de promesse pendante.
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => (release = resolve));
    pollSvc.castVote.mockImplementationOnce(() => inFlight);
    await openPicker(fixture, PARTIE_VOTE);

    const comp = fixture.componentInstance as any;
    comp.onVoteAnswerChosen('YES');
    comp.onVoteAnswerChosen('NO');
    await tick(fixture);

    expect(pollSvc.castVote).toHaveBeenCalledTimes(1);
    release();
    await tick(fixture);
  });
});
