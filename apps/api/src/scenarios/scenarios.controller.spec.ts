import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthUser } from '@master-jdr/shared';

import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

function makeScenariosService() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    listDrafts: jest.fn(),
    findAllForPartie: jest.fn(),
    open: jest.fn(),
    markCourant: jest.fn(),
    close: jest.fn(),
    participate: jest.fn(),
    addSeance: jest.fn(),
    linkSeancePoll: jest.fn(),
    setSeanceCapacity: jest.fn(),
    inscrire: jest.fn(),
    desinscrire: jest.fn(),
    validerDate: jest.fn(),
    setCompteRendu: jest.fn(),
    uploadDocument: jest.fn(),
    listDocuments: jest.fn(),
    listLibraryDocuments: jest.fn(),
    getDocumentFile: jest.fn().mockResolvedValue({
      buffer: Buffer.from('x'),
      mime: 'application/pdf',
      originalName: 'x.pdf',
    }),
  };
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

  it('listDrafts() route partieId/user vers ScenariosService.listDrafts', async () => {
    await controller.listDrafts('p1', user);
    expect(scenarios.listDrafts).toHaveBeenCalledWith('p1', 'mj1');
  });

  it('findAll() route partieId/user vers ScenariosService.findAllForPartie', async () => {
    await controller.findAll('p1', user);
    expect(scenarios.findAllForPartie).toHaveBeenCalledWith('p1', 'mj1');
  });

  it('open() route scenarioId/user vers ScenariosService.open', async () => {
    await controller.open('s1', user);
    expect(scenarios.open).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('markCourant() route scenarioId/user vers ScenariosService.markCourant', async () => {
    await controller.markCourant('s1', user);
    expect(scenarios.markCourant).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('close() route scenarioId/user vers ScenariosService.close', async () => {
    await controller.close('s1', user);
    expect(scenarios.close).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('participate() route scenarioId/user vers ScenariosService.participate', async () => {
    await controller.participate('s1', user);
    expect(scenarios.participate).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('addSeance() route scenarioId/user vers ScenariosService.addSeance', async () => {
    await controller.addSeance('s1', user);
    expect(scenarios.addSeance).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('linkSeancePoll() route seanceId/user/pollId vers ScenariosService.linkSeancePoll', async () => {
    await controller.linkSeancePoll('seance1', user, { pollId: 'poll1' });
    expect(scenarios.linkSeancePoll).toHaveBeenCalledWith(
      'seance1',
      'mj1',
      'poll1',
    );
  });

  it('setSeanceCapacity() route seanceId/user/min/max vers ScenariosService.setSeanceCapacity', async () => {
    await controller.setSeanceCapacity('seance1', user, {
      inscriptionMin: 4,
      inscriptionMax: 6,
    });
    expect(scenarios.setSeanceCapacity).toHaveBeenCalledWith(
      'seance1',
      'mj1',
      4,
      6,
    );
  });

  it('inscrire() route seanceId/user vers ScenariosService.inscrire', async () => {
    await controller.inscrire('seance1', user);
    expect(scenarios.inscrire).toHaveBeenCalledWith('seance1', 'mj1');
  });

  it('desinscrire() route seanceId/user vers ScenariosService.desinscrire', async () => {
    await controller.desinscrire('seance1', user);
    expect(scenarios.desinscrire).toHaveBeenCalledWith('seance1', 'mj1');
  });

  it('validerDate() route seanceId/user vers ScenariosService.validerDate', async () => {
    await controller.validerDate('seance1', user);
    expect(scenarios.validerDate).toHaveBeenCalledWith('seance1', 'mj1');
  });

  it('setCompteRendu() route seanceId/user/compteRendu vers ScenariosService.setCompteRendu', async () => {
    await controller.setCompteRendu('seance1', user, { compteRendu: 'texte' });
    expect(scenarios.setCompteRendu).toHaveBeenCalledWith('seance1', 'mj1', 'texte');
  });

  it('uploadDocument() route partieId/user/file/scenarioId vers ScenariosService.uploadDocument', async () => {
    const file = { buffer: Buffer.from('x') } as Express.Multer.File;
    await controller.uploadDocument('p1', file, 's1', user);
    expect(scenarios.uploadDocument).toHaveBeenCalledWith(
      'p1',
      'mj1',
      file,
      's1',
    );
  });

  it('listDocuments() route scenarioId/user vers ScenariosService.listDocuments', async () => {
    await controller.listDocuments('s1', user);
    expect(scenarios.listDocuments).toHaveBeenCalledWith('s1', 'mj1');
  });

  it('listLibraryDocuments() route partieId/user vers ScenariosService.listLibraryDocuments', async () => {
    await controller.listLibraryDocuments('p1', user);
    expect(scenarios.listLibraryDocuments).toHaveBeenCalledWith('p1', 'mj1');
  });

  it('downloadDocument() route documentId/user vers ScenariosService.getDocumentFile et renvoie un StreamableFile', async () => {
    const result = await controller.downloadDocument('d1', user);
    expect(scenarios.getDocumentFile).toHaveBeenCalledWith('d1', 'mj1');
    expect(result).toBeDefined();
  });

  it('downloadDocument() échappe les CR/LF et guillemets d’un originalName malveillant avant de construire Content-Disposition', async () => {
    scenarios.getDocumentFile.mockResolvedValue({
      buffer: Buffer.from('x'),
      mime: 'application/pdf',
      originalName: 'x".pdf\r\nX-Injected: evil',
    });

    const result = await controller.downloadDocument('d1', user);
    const { disposition } = result.getHeaders();
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toBe('attachment; filename="x.pdfX-Injected: evil"');
  });

  describe('upload de document — pipeline HTTP réel (multer + ParseFilePipe)', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [ScenariosController],
        providers: [{ provide: ScenariosService, useValue: scenarios }],
      })
        .overrideGuard(AuthenticatedGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest<{ user?: unknown }>();
            req.user = { id: 'mj1' };
            return true;
          },
        })
        .compile();

      app = module.createNestApplication();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('document trop volumineux (>5 Mo) → 413, uploadDocument jamais appelé (AC2)', async () => {
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);

      await request(app.getHttpServer())
        .post('/parties/11111111-1111-1111-1111-111111111111/documents')
        .attach('file', oversized, 'document.pdf')
        .expect(413);

      expect(scenarios.uploadDocument).not.toHaveBeenCalled();
    });

    it('PDF valide ≤5 Mo → uploadDocument est appelé (AC1)', async () => {
      scenarios.uploadDocument.mockResolvedValue({
        id: 'd1',
        partieId: '11111111-1111-1111-1111-111111111111',
        scenarioId: null,
        originalName: 'document.pdf',
        sizeBytes: 12,
        createdAt: '2026-07-12T00:00:00.000Z',
      });
      const small = Buffer.from('%PDF-1.4\n...');

      await request(app.getHttpServer())
        .post('/parties/11111111-1111-1111-1111-111111111111/documents')
        .attach('file', small, 'document.pdf')
        .expect(201);

      expect(scenarios.uploadDocument).toHaveBeenCalled();
    });
  });
});
