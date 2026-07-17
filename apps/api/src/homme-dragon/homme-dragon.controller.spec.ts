jest.mock('@master-jdr/game-rules', () => ({
  validateHommeDragon: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { HommeDragonController } from './homme-dragon.controller';
import { HommeDragonService } from './homme-dragon.service';

function makeService() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    chooseEveilPower: jest.fn(),
  };
}

describe('HommeDragonController', () => {
  let controller: HommeDragonController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [HommeDragonController],
      providers: [{ provide: HommeDragonService, useValue: service }],
    }).compile();
    controller = module.get(HommeDragonController);
  });

  it('POST délègue à create() avec partieId/user.id/dto', () => {
    const dto = { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: 'Ignis' } as any;
    controller.create('p1', { id: 'mj1' } as any, dto);
    expect(service.create).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('GET délègue à findOne() avec partieId/user.id', () => {
    controller.findOne('p1', { id: 'u1' } as any);
    expect(service.findOne).toHaveBeenCalledWith('p1', 'u1');
  });

  it('PATCH délègue à update() avec partieId/user.id/dto', () => {
    const dto = { demeure: 'Une auberge' } as any;
    controller.update('p1', { id: 'mj1' } as any, dto);
    expect(service.update).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('POST eveil-power délègue à chooseEveilPower() avec partieId/user.id/dto', () => {
    const dto = { level: 2, key: 'escorte-du-dragon' } as any;
    controller.chooseEveilPower('p1', { id: 'mj1' } as any, dto);
    expect(service.chooseEveilPower).toHaveBeenCalledWith('p1', 'mj1', dto);
  });
});
