jest.mock('@master-jdr/game-rules', () => ({
  validateHommeDragon: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HommeDragonController } from './homme-dragon.controller';
import { HommeDragonService } from './homme-dragon.service';
import { HommeDragonPdfService } from './homme-dragon.pdf.service';

function makeService() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    chooseEveilPower: jest.fn(),
    getOwnerPseudo: jest.fn(),
  };
}

function makePdfService() {
  return {
    fillHommeDragonPdf: jest.fn(),
  };
}

describe('HommeDragonController', () => {
  let controller: HommeDragonController;
  let service: ReturnType<typeof makeService>;
  let pdfService: ReturnType<typeof makePdfService>;

  beforeEach(async () => {
    service = makeService();
    pdfService = makePdfService();
    const module = await Test.createTestingModule({
      controllers: [HommeDragonController],
      providers: [
        { provide: HommeDragonService, useValue: service },
        { provide: HommeDragonPdfService, useValue: pdfService },
      ],
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

  describe('exportPdf()', () => {
    it('résout la fiche/le pseudo MJ puis délègue à fillHommeDragonPdf()', async () => {
      const hommeDragon = { userId: 'mj1' } as any;
      service.findOne.mockResolvedValue(hommeDragon);
      service.getOwnerPseudo.mockResolvedValue('admin');
      pdfService.fillHommeDragonPdf.mockResolvedValue(Buffer.from('pdf'));

      const result = await controller.exportPdf('p1', { id: 'u1' } as any);

      expect(service.findOne).toHaveBeenCalledWith('p1', 'u1');
      expect(service.getOwnerPseudo).toHaveBeenCalledWith('mj1');
      expect(pdfService.fillHommeDragonPdf).toHaveBeenCalledWith(hommeDragon, 'admin');
      expect(result.getStream()).toBeDefined();
    });

    it('aucune fiche existante → NotFoundException, jamais un PDF vide', async () => {
      service.findOne.mockResolvedValue(null);

      await expect(controller.exportPdf('p1', { id: 'u1' } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(pdfService.fillHommeDragonPdf).not.toHaveBeenCalled();
    });
  });
});
