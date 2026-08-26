import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MyPartiesService } from './my-parties.service';
import { PartiesService } from '../parties/parties.service';

describe('MyPartiesService', () => {
  let service: MyPartiesService;
  let mjResult: unknown[];
  let playerResult: unknown[];

  beforeEach(() => {
    mjResult = [];
    playerResult = [];
    const partiesMock = {
      list: vi.fn((kind: 'mj' | 'player') =>
        Promise.resolve(kind === 'mj' ? mjResult : playerResult),
      ),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: PartiesService, useValue: partiesMock }],
    });
    service = TestBed.inject(MyPartiesService);
  });

  it("nettoie la clé localStorage orpheline 'master-jdr.mode' de l'ancien ModeService (revue de code)", () => {
    localStorage.setItem('master-jdr.mode', 'mj');
    TestBed.resetTestingModule();
    const partiesMock = { list: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({
      providers: [{ provide: PartiesService, useValue: partiesMock }],
    });
    TestBed.inject(MyPartiesService);

    expect(localStorage.getItem('master-jdr.mode')).toBeNull();
  });

  it('hasMjParties devient true après refresh avec des parties', async () => {
    mjResult = [{ id: 'p1' }];
    await service.refreshMjParties();
    expect(service.hasMjParties()).toBe(true);
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

  describe('allParties (Story 29.1, AC1)', () => {
    it('concatène mjParties et playerParties, role déjà porté par chaque PartieDto', async () => {
      mjResult = [{ id: 'p-mj', role: 'mj' }];
      playerResult = [{ id: 'p-player', role: 'player' }];

      await service.refreshMjParties();
      await service.refreshPlayerParties();

      expect(service.allParties()).toEqual([
        { id: 'p-mj', role: 'mj' },
        { id: 'p-player', role: 'player' },
      ]);
    });

    it('reflète un changement ultérieur de mjParties()/playerParties() (dérivé, pas figé)', async () => {
      await service.refreshMjParties();
      await service.refreshPlayerParties();
      expect(service.allParties()).toEqual([]);

      mjResult = [{ id: 'p-mj', role: 'mj' }];
      await service.refreshMjParties();
      expect(service.allParties()).toEqual([{ id: 'p-mj', role: 'mj' }]);
    });
  });

  describe('bug fix critique : garde de concurrence + jamais de vidage sur échec transitoire', () => {
    it('refreshMjParties() : un échec réseau conserve le dernier état connu bon (jamais de .set([]))', async () => {
      mjResult = [{ id: 'p-mj' }];
      await service.refreshMjParties();
      expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);

      const partiesMock = TestBed.inject(PartiesService) as unknown as {
        list: ReturnType<typeof vi.fn>;
      };
      partiesMock.list.mockRejectedValueOnce(new Error('network down'));
      await service.refreshMjParties();

      expect(service.mjParties()).toEqual([{ id: 'p-mj' }]);
    });

    it('refreshPlayerParties() : un échec réseau conserve le dernier état connu bon (jamais de .set([]))', async () => {
      playerResult = [{ id: 'p-player' }];
      await service.refreshPlayerParties();
      expect(service.playerParties()).toEqual([{ id: 'p-player' }]);

      const partiesMock = TestBed.inject(PartiesService) as unknown as {
        list: ReturnType<typeof vi.fn>;
      };
      partiesMock.list.mockRejectedValueOnce(new Error('network down'));
      await service.refreshPlayerParties();

      expect(service.playerParties()).toEqual([{ id: 'p-player' }]);
    });

    it("refreshPlayerParties() : une réponse obsolète (résolue en désordre) n'écrase jamais un état plus frais", async () => {
      const partiesMock = TestBed.inject(PartiesService) as unknown as {
        list: ReturnType<typeof vi.fn>;
      };
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
