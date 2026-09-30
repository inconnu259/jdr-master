jest.mock('@master-jdr/game-rules', () => ({
  validateHommeDragon: jest.fn(),
}));

import {
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { HommeDragonController } from './homme-dragon.controller';
import { HommeDragonService } from './homme-dragon.service';
import { HommeDragonPdfService } from './homme-dragon.pdf.service';
import type { ChooseEveilPowerDto } from './dto/choose-eveil-power.dto';
import type {
  CreateHommeDragonDto,
  HommeDragonDto,
  UpdateHommeDragonDto,
} from '@master-jdr/shared';

function makeService() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    chooseEveilPower: jest.fn(),
    chooseArtefactCadeau: jest.fn(),
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
    const dto = {
      race: 'DRAGON_ROUGE',
      artefact: { key: 'grand-arc' },
      nom: 'Ignis',
    } as unknown as CreateHommeDragonDto;
    controller.create('p1', { id: 'mj1' } as any, dto);
    expect(service.create).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('GET délègue à findOne() avec partieId/user.id', () => {
    controller.findOne('p1', { id: 'u1' } as any);
    expect(service.findOne).toHaveBeenCalledWith('p1', 'u1');
  });

  it('PATCH délègue à update() avec partieId/user.id/dto', () => {
    const dto = { demeure: 'Une auberge' } as UpdateHommeDragonDto;
    controller.update('p1', { id: 'mj1' } as any, dto);
    expect(service.update).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('POST eveil-power délègue à chooseEveilPower() avec partieId/user.id/dto', () => {
    const dto: ChooseEveilPowerDto = { level: 2, key: 'escorte-du-dragon' };
    controller.chooseEveilPower('p1', { id: 'mj1' } as any, dto);
    expect(service.chooseEveilPower).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  it('POST artefact-cadeau délègue à chooseArtefactCadeau() avec partieId/user.id/dto (Story 33.7)', () => {
    const dto = { key: 'lanterne' };
    controller.chooseArtefactCadeau('p1', { id: 'mj1' } as any, dto);
    expect(service.chooseArtefactCadeau).toHaveBeenCalledWith('p1', 'mj1', dto);
  });

  describe('exportPdf()', () => {
    it('résout la fiche/le pseudo MJ puis délègue à fillHommeDragonPdf()', async () => {
      const hommeDragon = { userId: 'mj1' } as unknown as HommeDragonDto;
      service.findOne.mockResolvedValue(hommeDragon);
      service.getOwnerPseudo.mockResolvedValue('admin');
      pdfService.fillHommeDragonPdf.mockResolvedValue(Buffer.from('pdf'));

      const result = await controller.exportPdf('p1', { format: 'editable' }, { id: 'u1' } as any);

      expect(service.findOne).toHaveBeenCalledWith('p1', 'u1');
      expect(service.getOwnerPseudo).toHaveBeenCalledWith('mj1');
      expect(pdfService.fillHommeDragonPdf).toHaveBeenCalledWith(hommeDragon, 'admin', 'editable');
      expect(result.getStream()).toBeDefined();
    });

    it("transmet le format '2pages' au service et le met dans le nom de fichier", async () => {
      const hommeDragon = { userId: 'mj1' } as unknown as HommeDragonDto;
      service.findOne.mockResolvedValue(hommeDragon);
      service.getOwnerPseudo.mockResolvedValue('admin');
      pdfService.fillHommeDragonPdf.mockResolvedValue(Buffer.from('pdf'));

      const result = await controller.exportPdf('p1', { format: '2pages' }, { id: 'u1' } as any);

      expect(pdfService.fillHommeDragonPdf).toHaveBeenCalledWith(hommeDragon, 'admin', '2pages');
      expect(result.getHeaders().disposition).toBe(
        'attachment; filename="homme-dragon-p1-2pages.pdf"',
      );
    });

    it('aucune fiche existante → NotFoundException, jamais un PDF vide', async () => {
      service.findOne.mockResolvedValue(null);

      await expect(
        controller.exportPdf('p1', { format: 'editable' }, { id: 'u1' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(pdfService.fillHommeDragonPdf).not.toHaveBeenCalled();
    });
  });

  describe('validation HTTP réelle (ValidationPipe global)', () => {
    let app: INestApplication;
    const EXPORT_URL = '/parties/11111111-1111-1111-1111-111111111111/homme-dragon/export.pdf';

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [HommeDragonController],
        providers: [
          { provide: HommeDragonService, useValue: service },
          { provide: HommeDragonPdfService, useValue: pdfService },
        ],
      })
        .overrideGuard(AuthenticatedGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest<{ user?: unknown }>();
            req.user = { id: 'u1' };
            return true;
          },
        })
        .compile();

      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();

      service.findOne.mockResolvedValue({ userId: 'mj1' });
      service.getOwnerPseudo.mockResolvedValue('admin');
      pdfService.fillHommeDragonPdf.mockResolvedValue(Buffer.from('pdf-bytes'));
    });

    afterEach(async () => {
      await app.close();
    });

    it('format absent → 400 via le pipeline HTTP réel', async () => {
      await request(app.getHttpServer()).get(EXPORT_URL).expect(400);

      expect(pdfService.fillHommeDragonPdf).not.toHaveBeenCalled();
    });

    it('format inconnu (1page) → 400 via le pipeline HTTP réel', async () => {
      await request(app.getHttpServer()).get(EXPORT_URL).query({ format: '1page' }).expect(400);

      expect(pdfService.fillHommeDragonPdf).not.toHaveBeenCalled();
    });

    it("PATCH avec artefactCadeau → 400 : le cadeau n'est jamais modifiable par PATCH (Story 33.7)", async () => {
      await request(app.getHttpServer())
        .patch('/parties/11111111-1111-1111-1111-111111111111/homme-dragon')
        .send({ artefactCadeau: { key: 'lanterne' } })
        .expect(400);

      expect(service.update).not.toHaveBeenCalled();
    });

    it('POST artefact-cadeau sans clé → 400 ; avec clé → délègue au service', async () => {
      const url = '/parties/11111111-1111-1111-1111-111111111111/homme-dragon/artefact-cadeau';
      await request(app.getHttpServer()).post(url).send({}).expect(400);
      expect(service.chooseArtefactCadeau).not.toHaveBeenCalled();

      await request(app.getHttpServer()).post(url).send({ key: 'lanterne' }).expect(201);
      expect(service.chooseArtefactCadeau).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'u1',
        { key: 'lanterne' },
      );
    });

    it.each(['editable', '2pages'])('format=%s → 200 via le pipeline HTTP réel', async (format) => {
      await request(app.getHttpServer()).get(EXPORT_URL).query({ format }).expect(200);

      expect(pdfService.fillHommeDragonPdf).toHaveBeenCalledWith(
        { userId: 'mj1' },
        'admin',
        format,
      );
    });
  });
});
