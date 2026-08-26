import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { PartieDto, SessionPollDto } from '@master-jdr/shared';
import { OpenPollsService } from './open-polls.service';
import { AuthService } from '../auth/auth.service';
import { MyPartiesService } from '../my-parties/my-parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';

function makeParty(id: string): PartieDto {
  return {
    id,
    name: `Party ${id}`,
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj-1',
    mjPseudo: 'mj-pseudo',
    mjDisplayName: 'MJ Nom',
    createdAt: '',
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'player',
    status: 'EN_COURS',
    isFavorite: false,
    coverImageVersion: null,
  };
}

/** Par défaut, une option non répondue par 'u1' — pour que le poll compte comme "en attente" dans les tests existants. */
function makePoll(
  partieId: string,
  options: SessionPollDto['options'] = [
    { id: `opt-${partieId}`, date: '2026-08-01T00:00:00.000Z', slot: 'MORNING', votes: [] },
  ],
): SessionPollDto {
  return {
    id: `poll-${partieId}`,
    partieId,
    status: 'OPEN',
    scenarioRef: null,
    expiresAt: null,
    chosenDate: null,
    chosenSlot: null,
    // Story 36.6 — effectif de la troupe (MJ + membres).
    membersCount: 4,
    options,
  };
}

/** Story 8.8 (revue de code) : `refresh()` utilise désormais `ScenariosService.listAll()` (plus
 *  `PollService.getCurrentPoll()`, un seul poll par Partie) — enveloppe chaque poll dans un
 *  scénario/séance synthétique minimal. */
function wrapPollsAsScenarios(polls: SessionPollDto[]): any[] {
  return polls.map((poll, i) => ({
    id: `s-${poll.id}`,
    partieId: poll.partieId,
    title: `Scénario ${i + 1}`,
    description: null,
    status: 'COURANT',
    dureeHeures: null,
    dureeSeances: null,
    resumeFin: null,
    createdAt: '',
    closedAt: null,
    seances: [
      {
        id: `seance-${poll.id}`,
        scenarioId: `s-${poll.id}`,
        compteRendu: null,
        createdAt: '',
        poll,
      },
    ],
  }));
}

// Harnais minimal : instancier le service dans un contexte de composant permet à `fixture.whenStable()`
// de vider la queue d'effects (`effect()` planifié dans le constructeur du service), contrairement à un
// simple `TestBed.inject()` hors composant.
@Component({ selector: 'app-test-host', template: '', standalone: true })
class TestHost {
  readonly svc = inject(OpenPollsService);
}

async function createHarness(
  playerParties: PartieDto[],
  listAll: ReturnType<typeof vi.fn>,
  currentUserId: string | undefined = 'u1',
) {
  const playerPartiesSignal = signal(playerParties);
  await TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [
      { provide: MyPartiesService, useValue: { playerParties: playerPartiesSignal } },
      { provide: ScenariosService, useValue: { listAll } },
      {
        provide: AuthService,
        useValue: { currentUser: () => (currentUserId ? { id: currentUserId } : null) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable(); // second cycle : laisse le effect() de OpenPollsService déclencher et résoudre son refresh() async
  return { svc: fixture.componentInstance.svc, playerPartiesSignal, fixture };
}

describe('OpenPollsService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('count() reflète le nombre de parties avec un poll OPEN', async () => {
    const listAll = vi.fn((id: string) =>
      id === 'p1' ? Promise.resolve(wrapPollsAsScenarios([makePoll('p1')])) : Promise.resolve([]),
    );
    const { svc } = await createHarness([makeParty('p1'), makeParty('p2')], listAll);

    expect(svc.count()).toBe(1);
    expect(svc.openPolls().has('p1')).toBe(true);
    expect(svc.openPolls().has('p2')).toBe(false);
  });

  it("count() à 0 si aucune partie n'a de poll OPEN", async () => {
    const listAll = vi.fn().mockResolvedValue([]);
    const { svc } = await createHarness([makeParty('p1')], listAll);

    expect(listAll).toHaveBeenCalled();
    expect(svc.count()).toBe(0);
  });

  it('openPolls se vide quand playerParties() passe de non-vide à vide (dernière partie quittée)', async () => {
    const listAll = vi.fn().mockResolvedValue(wrapPollsAsScenarios([makePoll('p1')]));
    const { svc, playerPartiesSignal, fixture } = await createHarness([makeParty('p1')], listAll);

    expect(svc.count()).toBe(1);

    playerPartiesSignal.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(svc.count()).toBe(0);
    expect(svc.openPolls().size).toBe(0);
  });

  it("count() exclut une partie dont le poll OPEN a déjà été entièrement répondu par l'utilisateur courant", async () => {
    const answeredPoll = makePoll('p1', [
      {
        id: 'opt-p1',
        date: '2026-08-01T00:00:00.000Z',
        slot: 'MORNING',
        votes: [{ userId: 'u1', pseudo: 'Moi', displayName: 'Moi', answer: 'YES' }],
      },
    ]);
    const unansweredPoll = makePoll('p2'); // option par défaut sans vote
    const listAll = vi.fn((id: string) =>
      id === 'p1'
        ? Promise.resolve(wrapPollsAsScenarios([answeredPoll]))
        : Promise.resolve(wrapPollsAsScenarios([unansweredPoll])),
    );
    const { svc } = await createHarness([makeParty('p1'), makeParty('p2')], listAll);

    expect(svc.count()).toBe(1);
    expect(svc.openPolls().has('p1')).toBe(false);
    expect(svc.openPolls().has('p2')).toBe(true);
  });

  it('une partie avec plusieurs polls OPEN (un par séance) compte si au moins un a une option non répondue', async () => {
    const answeredPoll: SessionPollDto = {
      ...makePoll('p1', [
        {
          id: 'opt-a',
          date: '2026-08-01T00:00:00.000Z',
          slot: 'MORNING',
          votes: [{ userId: 'u1', pseudo: 'Moi', displayName: 'Moi', answer: 'YES' }],
        },
      ]),
      id: 'poll-a',
    };
    const pendingPoll: SessionPollDto = { ...makePoll('p1'), id: 'poll-b' };
    const listAll = vi.fn().mockResolvedValue(wrapPollsAsScenarios([answeredPoll, pendingPoll]));
    const { svc } = await createHarness([makeParty('p1')], listAll);

    expect(svc.count()).toBe(1);
    expect(svc.openPolls().get('p1')?.id).toBe('poll-b');
  });

  it("notifyChanged('partie:p1') (Story 22.1, AC1) recharge sans changement de playerParties()", async () => {
    const listAll = vi.fn().mockResolvedValue([]);
    const { svc, fixture } = await createHarness([makeParty('p1')], listAll);
    expect(svc.count()).toBe(0);

    listAll.mockResolvedValue(wrapPollsAsScenarios([makePoll('p1')]));
    svc.notifyChanged('partie:p1');
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(svc.count()).toBe(1);
    expect(svc.openPolls().has('p1')).toBe(true);
  });

  it('bug fix (production, tempête de requêtes) : notifyChanged(topic) ne refetch QUE la Partie du topic, pas toutes les playerParties()', async () => {
    const listAll = vi.fn((id: string) =>
      id === 'p1' ? Promise.resolve(wrapPollsAsScenarios([makePoll('p1')])) : Promise.resolve([]),
    );
    const { svc, fixture } = await createHarness(
      [makeParty('p1'), makeParty('p2'), makeParty('p3')],
      listAll,
    );
    expect(svc.count()).toBe(1); // seule p1 a un poll en attente au chargement initial
    listAll.mockClear(); // ignore les 3 appels du chargement initial (refresh() complet, légitime)

    // p2 a désormais aussi un poll en attente, mais l'événement temps réel ne concerne que p2.
    listAll.mockImplementation((id: string) =>
      id === 'p2' ? Promise.resolve(wrapPollsAsScenarios([makePoll('p2')])) : Promise.resolve([]),
    );
    svc.notifyChanged('partie:p2');
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    // Un seul appel réseau (celui de p2), pas un par Partie du joueur (p1/p3 non re-fetchées).
    expect(listAll).toHaveBeenCalledTimes(1);
    expect(listAll).toHaveBeenCalledWith('p2');
    // p1 (état précédent, non re-fetché) et p2 (nouvellement connu) comptent tous les deux.
    expect(svc.count()).toBe(2);
    expect(svc.openPolls().has('p1')).toBe(true);
    expect(svc.openPolls().has('p2')).toBe(true);
  });
});
