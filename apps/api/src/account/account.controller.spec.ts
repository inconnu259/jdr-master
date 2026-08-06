import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// AccountController -> update-theme.dto.ts -> import RUNTIME (pas `import type`) de THEMES depuis
// @master-jdr/shared (ESM, non transformé par ts-jest) — même piège déjà documenté pour
// GAME_SYSTEMS (realtime.module.spec.ts) et @master-jdr/game-rules (mémoire projet).
jest.mock('@master-jdr/shared', () => ({
  THEMES: ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'],
}));

import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

function makeAccountService() {
  return { updateDisplayName: jest.fn(), updateTheme: jest.fn() };
}

describe('AccountController', () => {
  let controller: AccountController;
  let account: ReturnType<typeof makeAccountService>;

  beforeEach(async () => {
    account = makeAccountService();
    const module = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [{ provide: AccountService, useValue: account }],
    }).compile();
    controller = module.get(AccountController);
  });

  it("updateDisplayName() lit l'id depuis la session (req.user), jamais depuis le corps", async () => {
    account.updateDisplayName.mockResolvedValue({
      id: 'u1',
      displayName: 'Nouveau nom',
    });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.updateDisplayName(req, {
      displayName: 'Nouveau nom',
    });

    expect(account.updateDisplayName).toHaveBeenCalledWith(
      'u1',
      'Nouveau nom',
    );
    expect(result).toEqual({ id: 'u1', displayName: 'Nouveau nom' });
  });

  it("updateTheme() lit l'id depuis la session (req.user), jamais depuis le corps", async () => {
    account.updateTheme.mockResolvedValue({
      id: 'u1',
      theme: 'foret-ancienne',
    });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.updateTheme(req, {
      theme: 'foret-ancienne',
    });

    expect(account.updateTheme).toHaveBeenCalledWith('u1', 'foret-ancienne');
    expect(result).toEqual({ id: 'u1', theme: 'foret-ancienne' });
  });

  describe('validation HTTP réelle (ValidationPipe global)', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [AccountController],
        providers: [{ provide: AccountService, useValue: account }],
      })
        .overrideGuard(AuthenticatedGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();
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

    it('displayName vide → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: '' })
        .expect(400);
      expect(account.updateDisplayName).not.toHaveBeenCalled();
    });

    it('displayName > 60 caractères → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: 'x'.repeat(61) })
        .expect(400);
      expect(account.updateDisplayName).not.toHaveBeenCalled();
    });

    it('displayName composé uniquement d’espaces → 400 (trim avant validation), service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: '   ' })
        .expect(400);
      expect(account.updateDisplayName).not.toHaveBeenCalled();
    });

    it('espaces en début/fin d’un displayName par ailleurs valide sont retirés avant persistance', async () => {
      account.updateDisplayName.mockResolvedValue({
        id: 'u1',
        displayName: 'Nom valide',
      });
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: '  Nom valide  ' })
        .expect(200);
      expect(account.updateDisplayName).toHaveBeenCalledWith(
        'u1',
        'Nom valide',
      );
    });

    it('un id glissé dans le corps est rejeté (forbidNonWhitelisted) — jamais transmis au service', async () => {
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: 'Nom valide', id: 'autre-utilisateur' })
        .expect(400);
      expect(account.updateDisplayName).not.toHaveBeenCalled();
    });

    it('id de session utilisé, jamais un id du corps ni de l’URL (DTO propre)', async () => {
      account.updateDisplayName.mockResolvedValue({
        id: 'u1',
        displayName: 'Nom valide',
      });
      await request(app.getHttpServer())
        .patch('/me/display-name')
        .send({ displayName: 'Nom valide' })
        .expect(200);
      expect(account.updateDisplayName).toHaveBeenCalledWith(
        'u1',
        'Nom valide',
      );
    });

    it('theme hors de THEMES → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/theme')
        .send({ theme: 'theme-inexistant' })
        .expect(400);
      expect(account.updateTheme).not.toHaveBeenCalled();
    });

    it('id glissé dans le corps (même avec un theme valide) → 400 forbidNonWhitelisted, service jamais appelé', async () => {
      account.updateTheme.mockResolvedValue({
        id: 'u1',
        theme: 'foret-ancienne',
      });
      await request(app.getHttpServer())
        .patch('/me/theme')
        .send({ theme: 'foret-ancienne', id: 'autre-utilisateur' })
        .expect(400); // forbidNonWhitelisted : id glissé dans le corps
      expect(account.updateTheme).not.toHaveBeenCalled();
    });

    it('theme valide sans champ superflu → 200', async () => {
      account.updateTheme.mockResolvedValue({
        id: 'u1',
        theme: 'medieval-steampunk',
      });
      await request(app.getHttpServer())
        .patch('/me/theme')
        .send({ theme: 'medieval-steampunk' })
        .expect(200);
      expect(account.updateTheme).toHaveBeenCalledWith(
        'u1',
        'medieval-steampunk',
      );
    });
  });
});
