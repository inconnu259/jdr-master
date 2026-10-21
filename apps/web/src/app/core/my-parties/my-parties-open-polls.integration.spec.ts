import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { PartieDto } from '@master-jdr/shared';
import { MyPartiesService } from './my-parties.service';
import { OpenPollsService } from '../poll/open-polls.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { AuthService } from '../auth/auth.service';

// Intégration du VRAI MyPartiesService avec le VRAI OpenPollsService (seuls les services de niveau
// HTTP sont simulés) : un refresh de la liste unique (Story 38.5) ne doit pas relancer le fan-out
// `scenariosSvc.listAll` par partie de joueur tant que l'ensemble des parties de joueur ne change pas
// (classe de bug « tempête de requêtes », cf. open-polls.service.ts).

@Component({ selector: 'app-test-host', template: '', standalone: true })
class TestHost {
  readonly myParties = inject(MyPartiesService);
  readonly openPolls = inject(OpenPollsService);
}

function makeParty(id: string, role: PartieDto['role'], isFavorite = false): PartieDto {
  return {
    id,
    name: `Party ${id}`,
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    ownerId: 'mj-1',
    createdAt: '',
    nextSessionDate: null,
    nextSessionSlot: null,
    role,
    status: 'EN_COURS',
    isFavorite,
    coverImageVersion: null,
  } as PartieDto;
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('MyPartiesService × OpenPollsService (Story 38.5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(initial: PartieDto[]) {
    let current = initial;
    const list = vi.fn(() => Promise.resolve(current));
    const listAll = vi.fn().mockResolvedValue([]);
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        { provide: PartiesService, useValue: { list } },
        { provide: ScenariosService, useValue: { listAll } },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1' }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TestHost);
    await fixture.componentInstance.myParties.refreshAll();
    await settle(fixture);
    return {
      fixture,
      myParties: fixture.componentInstance.myParties,
      listAll,
      next: async (parties: PartieDto[]) => {
        current = parties;
        await fixture.componentInstance.myParties.refreshAll();
        await settle(fixture);
      },
    };
  }

  it("un refresh où seul le favori d'une partie MJ change ne relance aucun listAll", async () => {
    const { listAll, next } = await setup([makeParty('mj1', 'mj'), makeParty('pl1', 'player')]);
    expect(listAll).toHaveBeenCalledTimes(1); // une fois, pour la seule partie de joueur
    expect(listAll).toHaveBeenCalledWith('pl1');
    listAll.mockClear();

    await next([makeParty('mj1', 'mj', true), makeParty('pl1', 'player')]);

    expect(listAll).not.toHaveBeenCalled();
  });

  it("un changement de l'ensemble des parties de joueur relance le fan-out", async () => {
    const { listAll, next } = await setup([makeParty('mj1', 'mj'), makeParty('pl1', 'player')]);
    listAll.mockClear();

    await next([makeParty('mj1', 'mj'), makeParty('pl1', 'player'), makeParty('pl2', 'player')]);

    expect(listAll).toHaveBeenCalledWith('pl1');
    expect(listAll).toHaveBeenCalledWith('pl2');
  });

  it('allParties() est en lecture seule : aucun .set() possible hors refreshAll()', async () => {
    const { myParties } = await setup([]);
    expect((myParties.allParties as unknown as { set?: unknown }).set).toBeUndefined();
  });
});
