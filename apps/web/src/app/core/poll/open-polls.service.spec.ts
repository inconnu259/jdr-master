import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { PartieDto, SessionPollDto } from '@master-jdr/shared';
import { OpenPollsService } from './open-polls.service';
import { ModeService } from '../mode/mode.service';
import { PollService } from './poll.service';

function makeParty(id: string): PartieDto {
  return {
    id, name: `Party ${id}`, kind: 'ONE_SHOT', gameSystemId: 'draconis',
    description: null, mjId: 'mj-1', createdAt: '', nextSessionDate: null, nextSessionSlot: null,
  };
}

function makePoll(partieId: string): SessionPollDto {
  return {
    id: `poll-${partieId}`, partieId, status: 'OPEN', scenarioRef: null,
    expiresAt: null, chosenDate: null, chosenSlot: null, options: [],
  };
}

// Harnais minimal : instancier le service dans un contexte de composant permet à `fixture.whenStable()`
// de vider la queue d'effects (`effect()` planifié dans le constructeur du service), contrairement à un
// simple `TestBed.inject()` hors composant.
@Component({ selector: 'app-test-host', template: '', standalone: true })
class TestHost {
  readonly svc = inject(OpenPollsService);
}

async function createHarness(playerParties: PartieDto[], getCurrentPoll: ReturnType<typeof vi.fn>) {
  const playerPartiesSignal = signal(playerParties);
  await TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [
      { provide: ModeService, useValue: { playerParties: playerPartiesSignal } },
      { provide: PollService, useValue: { getCurrentPoll } },
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
    const getCurrentPoll = vi.fn((id: string) =>
      id === 'p1' ? Promise.resolve(makePoll('p1')) : Promise.resolve(null),
    );
    const { svc } = await createHarness([makeParty('p1'), makeParty('p2')], getCurrentPoll);

    expect(svc.count()).toBe(1);
    expect(svc.openPolls().has('p1')).toBe(true);
    expect(svc.openPolls().has('p2')).toBe(false);
  });

  it('count() à 0 si aucune partie n\'a de poll OPEN', async () => {
    const getCurrentPoll = vi.fn().mockResolvedValue(null);
    const { svc } = await createHarness([makeParty('p1')], getCurrentPoll);

    expect(getCurrentPoll).toHaveBeenCalled();
    expect(svc.count()).toBe(0);
  });

  it('openPolls se vide quand playerParties() passe de non-vide à vide (dernière partie quittée)', async () => {
    const getCurrentPoll = vi.fn().mockResolvedValue(makePoll('p1'));
    const { svc, playerPartiesSignal, fixture } = await createHarness([makeParty('p1')], getCurrentPoll);

    expect(svc.count()).toBe(1);

    playerPartiesSignal.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(svc.count()).toBe(0);
    expect(svc.openPolls().size).toBe(0);
  });
});
