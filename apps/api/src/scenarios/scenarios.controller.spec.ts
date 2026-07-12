import { Test } from '@nestjs/testing';
import type { AuthUser } from '@master-jdr/shared';

import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

function makeScenariosService() {
  return { create: jest.fn(), update: jest.fn() };
}

describe('ScenariosController', () => {
  let controller: ScenariosController;
  let scenarios: ReturnType<typeof makeScenariosService>;

  const user: AuthUser = {
    id: 'mj1',
    email: 'mj@test.fr',
    pseudo: 'MJ',
    role: 'USER',
    createdAt: '2026-07-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    scenarios = makeScenariosService();
    const module = await Test.createTestingModule({
      controllers: [ScenariosController],
      providers: [{ provide: ScenariosService, useValue: scenarios }],
    }).compile();
    controller = module.get(ScenariosController);
  });

  it('create() route partieId/user/dto vers ScenariosService.create', async () => {
    const dto = { title: 'Le Marché aux Ombres' };
    await controller.create('p1', user, dto);
    expect(scenarios.create).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('update() route scenarioId/user/dto vers ScenariosService.update', async () => {
    const dto = { title: 'Nouveau titre' };
    await controller.update('s1', user, dto);
    expect(scenarios.update).toHaveBeenCalledWith('s1', 'mj1', dto);
  });
});
