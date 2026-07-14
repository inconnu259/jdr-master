import { Test } from '@nestjs/testing';
import type { AuthUser } from '@master-jdr/shared';

// ScenariosService (import réel pour servir de jeton DI) importe transitivement CharacterService
// -> @master-jdr/game-rules (ESM, non transformé par ts-jest) — même mock que
// scenarios.service.spec.ts pour éviter "Unexpected token export" au chargement du module.
jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  pendingLevels: jest.fn(),
  LEVEL_TABLE: [],
}));

import { PollController } from './poll.controller';
import { PollService } from './poll.service';
import { ScenariosService } from '../scenarios/scenarios.service';

function makePollService() {
  return {
    findOpen: jest.fn(),
    castVote: jest.fn(),
    choose: jest.fn(),
    close: jest.fn(),
  };
}

function makeScenariosService() {
  return { recalculateNextSession: jest.fn() };
}

describe('PollController', () => {
  let controller: PollController;
  let poll: ReturnType<typeof makePollService>;
  let scenarios: ReturnType<typeof makeScenariosService>;
  const user: AuthUser = { id: 'mj1' } as AuthUser;

  beforeEach(async () => {
    poll = makePollService();
    scenarios = makeScenariosService();
    const module = await Test.createTestingModule({
      controllers: [PollController],
      providers: [
        { provide: PollService, useValue: poll },
        { provide: ScenariosService, useValue: scenarios },
      ],
    }).compile();
    controller = module.get(PollController);
  });

  it('choose() appelle PollService.choose() PUIS ScenariosService.recalculateNextSession() (Story 8.8, Décision 2)', async () => {
    await controller.choose('p1', 'poll1', user, { optionId: 'opt1' });

    expect(poll.choose).toHaveBeenCalledWith('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(scenarios.recalculateNextSession).toHaveBeenCalledWith('p1');
    const chooseCall = poll.choose.mock.invocationCallOrder[0];
    const recalcCall = scenarios.recalculateNextSession.mock.invocationCallOrder[0];
    expect(chooseCall).toBeLessThan(recalcCall);
  });

  it('choose() : si PollService.choose() échoue, ScenariosService.recalculateNextSession() jamais appelé', async () => {
    poll.choose.mockRejectedValue(new Error('poll fermé'));

    await expect(
      controller.choose('p1', 'poll1', user, { optionId: 'opt1' }),
    ).rejects.toThrow('poll fermé');
    expect(scenarios.recalculateNextSession).not.toHaveBeenCalled();
  });

  it('choose() : si ScenariosService.recalculateNextSession() échoue après un choose() déjà réussi, l’erreur est absorbée (revue de code)', async () => {
    scenarios.recalculateNextSession.mockRejectedValue(new Error('partie introuvable'));

    await expect(
      controller.choose('p1', 'poll1', user, { optionId: 'opt1' }),
    ).resolves.toBeUndefined();
    expect(poll.choose).toHaveBeenCalledWith('p1', 'poll1', 'mj1', { optionId: 'opt1' });
  });

  it('findOpen() route vers PollService.findOpen()', async () => {
    await controller.findOpen('p1', user);
    expect(poll.findOpen).toHaveBeenCalledWith('p1', 'mj1');
  });

  it('castVote() route vers PollService.castVote()', async () => {
    await controller.castVote('p1', 'poll1', user, { optionId: 'opt1', answer: 'YES' });
    expect(poll.castVote).toHaveBeenCalledWith('p1', 'poll1', 'mj1', {
      optionId: 'opt1',
      answer: 'YES',
    });
  });

  it('close() route vers PollService.close()', async () => {
    await controller.close('p1', 'poll1', user);
    expect(poll.close).toHaveBeenCalledWith('p1', 'poll1', 'mj1');
  });
});
