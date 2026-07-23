import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ModeService } from './mode.service';
import { PartiesService } from '../parties/parties.service';

describe('ModeService', () => {
  let service: ModeService;
  let mjResult: unknown[];
  let playerResult: unknown[];

  beforeEach(() => {
    localStorage.clear();
    mjResult = [];
    playerResult = [];
    const partiesMock = {
      list: vi.fn((kind: 'mj' | 'player') => Promise.resolve(kind === 'mj' ? mjResult : playerResult)),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: PartiesService, useValue: partiesMock }],
    });
    service = TestBed.inject(ModeService);
  });

  it('hasMjParties devient true après refresh avec des parties', async () => {
    mjResult = [{ id: 'p1' }];
    await service.refreshMjParties();
    expect(service.hasMjParties()).toBe(true);
  });

  it('repasse en mode joueur si on ne maîtrise plus aucune partie', async () => {
    service.setMode('mj');
    mjResult = [];
    await service.refreshMjParties();
    expect(service.mode()).toBe('joueur');
    expect(service.hasMjParties()).toBe(false);
  });

  it('notifyChanged() (Story 22.1, AC2/AC3) recharge à la fois mjParties et playerParties', async () => {
    mjResult = [{ id: 'p-mj' }];
    playerResult = [{ id: 'p-player' }];

    service.notifyChanged();
    // notifyChanged() appelle deux méthodes async fire-and-forget (void) — flush des microtasks.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);
    expect(service.playerParties()).toEqual([{ id: 'p-player' }]);
  });
});
