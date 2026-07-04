import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  StreamableFile,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  mapToPdfFields: jest.fn(),
}));

import { CharactersController } from './characters.controller';
import { CharacterService } from './character.service';
import { RyuutamaPdfService } from './ryuutama-pdf.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';

function makeCharacterService() {
  return {
    findOne: jest.fn(),
  };
}

function makePdfService() {
  return {
    fillCharacterPdf: jest.fn(),
  };
}

describe('CharactersController', () => {
  let controller: CharactersController;
  let characters: ReturnType<typeof makeCharacterService>;
  let ryuutamaPdf: ReturnType<typeof makePdfService>;

  beforeEach(async () => {
    characters = makeCharacterService();
    ryuutamaPdf = makePdfService();
    const module = await Test.createTestingModule({
      controllers: [CharactersController],
      providers: [
        { provide: CharacterService, useValue: characters },
        { provide: RyuutamaPdfService, useValue: ryuutamaPdf },
      ],
    }).compile();
    controller = module.get(CharactersController);
  });

  it('exportPdf() charge le personnage via findOne (403/404 déjà gérés) puis retourne un StreamableFile', async () => {
    const character = {
      id: 'char1',
      gameSystemId: 'ryuutama',
      sheetData: {},
      derived: {},
    };
    characters.findOne.mockResolvedValue(character);
    ryuutamaPdf.fillCharacterPdf.mockResolvedValue(Buffer.from('pdf-bytes'));

    const result = await controller.exportPdf('char1', { format: 'editable' }, {
      id: 'u1',
    } as any);

    expect(characters.findOne).toHaveBeenCalledWith('char1', 'u1');
    expect(ryuutamaPdf.fillCharacterPdf).toHaveBeenCalledWith(
      character,
      'editable',
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('exportPdf() propage le 403 de findOne (non-propriétaire/non-MJ)', async () => {
    characters.findOne.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.exportPdf('char1', { format: 'editable' }, {
        id: 'stranger',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(ryuutamaPdf.fillCharacterPdf).not.toHaveBeenCalled();
  });

  it("exportPdf() appelle fillCharacterPdf avec format='2pages'", async () => {
    const character = {
      id: 'char1',
      gameSystemId: 'ryuutama',
      sheetData: {},
      derived: {},
    };
    characters.findOne.mockResolvedValue(character);
    ryuutamaPdf.fillCharacterPdf.mockResolvedValue(Buffer.from('pdf-bytes'));

    await controller.exportPdf('char1', { format: '2pages' }, {
      id: 'u1',
    } as any);

    expect(ryuutamaPdf.fillCharacterPdf).toHaveBeenCalledWith(
      character,
      '2pages',
    );
  });

  it("exportPdf() rejette un personnage d'un autre système de jeu que Ryuutama (BadRequestException)", async () => {
    const character = {
      id: 'char1',
      gameSystemId: 'conte-de-minuit',
      sheetData: {},
      derived: {},
    };
    characters.findOne.mockResolvedValue(character);

    await expect(
      controller.exportPdf('char1', { format: 'editable' }, {
        id: 'u1',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(ryuutamaPdf.fillCharacterPdf).not.toHaveBeenCalled();
  });

  describe('validation HTTP réelle (ValidationPipe global)', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [CharactersController],
        providers: [
          { provide: CharacterService, useValue: characters },
          { provide: RyuutamaPdfService, useValue: ryuutamaPdf },
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
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('format invalide → 400 via le pipeline HTTP réel', async () => {
      characters.findOne.mockResolvedValue({
        id: 'char1',
        gameSystemId: 'ryuutama',
        sheetData: {},
        derived: {},
      });

      await request(app.getHttpServer())
        .get('/characters/11111111-1111-1111-1111-111111111111/export.pdf')
        .query({ format: '1page' })
        .expect(400);

      expect(ryuutamaPdf.fillCharacterPdf).not.toHaveBeenCalled();
    });

    it('format=editable → 200 via le pipeline HTTP réel', async () => {
      characters.findOne.mockResolvedValue({
        id: 'char1',
        gameSystemId: 'ryuutama',
        sheetData: {},
        derived: {},
      });
      ryuutamaPdf.fillCharacterPdf.mockResolvedValue(Buffer.from('pdf-bytes'));

      await request(app.getHttpServer())
        .get('/characters/11111111-1111-1111-1111-111111111111/export.pdf')
        .query({ format: 'editable' })
        .expect(200);
    });
  });
});
