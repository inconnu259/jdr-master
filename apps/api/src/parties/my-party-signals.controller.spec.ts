import { Test } from '@nestjs/testing';
import type { AuthUser } from '@master-jdr/shared';
import { MyPartySignalsController } from './my-party-signals.controller';
import { PartySignalsService } from './party-signals.service';

describe('MyPartySignalsController', () => {
  let controller: MyPartySignalsController;
  let signals: { getSignals: jest.Mock };

  const user: AuthUser = {
    id: 'u1',
    email: 'u1@test.fr',
    pseudo: 'U1',
    role: 'USER',
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    signals = { getSignals: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [MyPartySignalsController],
      providers: [{ provide: PartySignalsService, useValue: signals }],
    }).compile();
    controller = module.get(MyPartySignalsController);
  });

  it('getMine() route user.id vers PartySignalsService.getSignals', async () => {
    await controller.getMine(user);
    expect(signals.getSignals).toHaveBeenCalledWith('u1');
  });
});
