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

  describe('bug fix critique : garde de concurrence + jamais de vidage sur échec transitoire', () => {
    it("refreshMjParties() : un échec réseau conserve le dernier état connu bon (jamais de .set([]))", async () => {
      mjResult = [{ id: 'p-mj' }];
      await service.refreshMjParties();
      expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);

      const partiesMock = TestBed.inject(PartiesService) as unknown as { list: ReturnType<typeof vi.fn> };
      partiesMock.list.mockRejectedValueOnce(new Error('network down'));
      await service.refreshMjParties();

      expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);
    });

    it("refreshPlayerParties() : un échec réseau conserve le dernier état connu bon (jamais de .set([]))", async () => {
      playerResult = [{ id: 'p-player' }];
      await service.refreshPlayerParties();
      expect(service.playerParties()).toEqual([{ id: 'p-player' }]);

      const partiesMock = TestBed.inject(PartiesService) as unknown as { list: ReturnType<typeof vi.fn> };
      partiesMock.list.mockRejectedValueOnce(new Error('network down'));
      await service.refreshPlayerParties();

      expect(service.playerParties()).toEqual([{ id: 'p-player' }]);
    });

    it("refreshMjParties() : un échec transitoire ne fait jamais basculer le mode 'mj' -> 'joueur'", async () => {
      mjResult = [{ id: 'p-mj' }];
      await service.refreshMjParties();
      service.setMode('mj');

      const partiesMock = TestBed.inject(PartiesService) as unknown as { list: ReturnType<typeof vi.fn> };
      partiesMock.list.mockRejectedValueOnce(new Error('network down'));
      await service.refreshMjParties();

      expect(service.mode()).toBe('mj');
      expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);
    });

    it("refreshPlayerParties() : une réponse obsolète (résolue en désordre) n'écrase jamais un état plus frais", async () => {
      const partiesMock = TestBed.inject(PartiesService) as unknown as { list: ReturnType<typeof vi.fn> };
      let resolveFirst!: (v: unknown[]) => void;
      let resolveSecond!: (v: unknown[]) => void;
      partiesMock.list
        .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
        .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)));

      const first = service.refreshPlayerParties(); // plus ancien, plus lent
      const second = service.refreshPlayerParties(); // plus récent, plus rapide

      // Le plus récent résout EN PREMIER (ex. le plus ancien a été ralenti par le réseau).
      resolveSecond([{ id: 'fresh' }]);
      await second;
      expect(service.playerParties()).toEqual([{ id: 'fresh' }]);

      // Le plus ancien résout ensuite — ne doit PAS écraser l'état plus frais déjà posé.
      resolveFirst([{ id: 'stale' }]);
      await first;
      expect(service.playerParties()).toEqual([{ id: 'fresh' }]);
    });
  });
});
