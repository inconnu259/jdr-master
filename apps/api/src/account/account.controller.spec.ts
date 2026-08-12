import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// AccountController -> update-theme.dto.ts -> import RUNTIME (pas `import type`) de THEMES depuis
// @master-jdr/shared (ESM, non transformé par ts-jest) — même piège déjà documenté pour
// GAME_SYSTEMS (realtime.module.spec.ts) et @master-jdr/game-rules (mémoire projet).
jest.mock('@master-jdr/shared', () => ({
  THEMES: ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'],
  PARTIE_SORTS: ['urgence', 'date', 'nom', 'type', 'statut'],
  LIST_VIEW_MODES: ['large', 'medium', 'compact'],
  CHARACTER_SORTS: ['niveau', 'partie', 'nom'],
}));

import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { AuthService } from '../auth/auth.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

function makeAccountService() {
  return {
    updateDisplayName: jest.fn(),
    updateTheme: jest.fn(),
    updatePreferences: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  };
}

function makeAuthService() {
  return { changePassword: jest.fn(), requestEmailChange: jest.fn() };
}

describe('AccountController', () => {
  let controller: AccountController;
  let account: ReturnType<typeof makeAccountService>;
  let auth: ReturnType<typeof makeAuthService>;

  beforeEach(async () => {
    account = makeAccountService();
    auth = makeAuthService();
    const module = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        { provide: AccountService, useValue: account },
        { provide: AuthService, useValue: auth },
      ],
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

    expect(account.updateDisplayName).toHaveBeenCalledWith('u1', 'Nouveau nom');
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

  it("changePassword() lit l'id et le sid depuis la session (req.user/req.sessionID), jamais depuis le corps", async () => {
    auth.changePassword.mockResolvedValue({ ok: true });

    const req = { user: { id: 'u1' }, sessionID: 'sess-1' } as any;
    const result = await controller.changePassword(req, {
      currentPassword: 'oldpw',
      newPassword: 'newpassword123',
    });

    expect(auth.changePassword).toHaveBeenCalledWith(
      'u1',
      'oldpw',
      'newpassword123',
      'sess-1',
    );
    expect(result).toEqual({ ok: true });
  });

  it("requestEmailChange() lit l'id depuis la session (req.user), jamais depuis le corps", async () => {
    auth.requestEmailChange.mockResolvedValue({ ok: true });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.requestEmailChange(req, {
      currentPassword: 'oldpw',
      newEmail: 'new@b.c',
    });

    expect(auth.requestEmailChange).toHaveBeenCalledWith(
      'u1',
      'oldpw',
      'new@b.c',
    );
    expect(result).toEqual({ ok: true });
  });

  it("updatePreferences() lit l'id depuis la session (req.user), jamais depuis le corps", async () => {
    account.updatePreferences.mockResolvedValue({
      id: 'u1',
      partiesSort: 'date',
    });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.updatePreferences(req, {
      partiesSort: 'date',
    });

    expect(account.updatePreferences).toHaveBeenCalledWith('u1', {
      partiesSort: 'date',
    });
    expect(result).toEqual({ id: 'u1', partiesSort: 'date' });
  });

  it("addFavorite() lit l'id depuis la session et le partieId depuis l'URL", async () => {
    account.addFavorite.mockResolvedValue({ ok: true });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.addFavorite(req, 'p1');

    expect(account.addFavorite).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ ok: true });
  });

  it("removeFavorite() lit l'id depuis la session et le partieId depuis l'URL", async () => {
    account.removeFavorite.mockResolvedValue({ ok: true });

    const req = { user: { id: 'u1' } } as any;
    const result = await controller.removeFavorite(req, 'p1');

    expect(account.removeFavorite).toHaveBeenCalledWith('u1', 'p1');
    expect(result).toEqual({ ok: true });
  });

  describe('validation HTTP réelle (ValidationPipe global)', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [AccountController],
        providers: [
          { provide: AccountService, useValue: account },
          { provide: AuthService, useValue: auth },
        ],
      })
        .overrideGuard(AuthenticatedGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();
            req.user = { id: 'u1' };
            req.sessionID = 'sess-1';
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

    it('newPassword < 8 caractères → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .send({ currentPassword: 'oldpw', newPassword: 'short' })
        .expect(400);
      expect(auth.changePassword).not.toHaveBeenCalled();
    });

    it('currentPassword absent → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .send({ newPassword: 'newpassword123' })
        .expect(400);
      expect(auth.changePassword).not.toHaveBeenCalled();
    });

    it('sid glissé dans le corps (même avec des mots de passe valides) → 400 forbidNonWhitelisted, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .send({
          currentPassword: 'oldpw',
          newPassword: 'newpassword123',
          sid: 'autre-session',
        })
        .expect(400);
      expect(auth.changePassword).not.toHaveBeenCalled();
    });

    it('mots de passe valides sans champ superflu → 200, sid de session transmis (jamais du corps)', async () => {
      auth.changePassword.mockResolvedValue({ ok: true });
      await request(app.getHttpServer())
        .patch('/me/password')
        .send({ currentPassword: 'oldpw', newPassword: 'newpassword123' })
        .expect(200);
      expect(auth.changePassword).toHaveBeenCalledWith(
        'u1',
        'oldpw',
        'newpassword123',
        'sess-1',
      );
    });

    it('newEmail invalide → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/email')
        .send({ currentPassword: 'oldpw', newEmail: 'pas-un-email' })
        .expect(400);
      expect(auth.requestEmailChange).not.toHaveBeenCalled();
    });

    it('currentPassword absent → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/email')
        .send({ newEmail: 'new@b.c' })
        .expect(400);
      expect(auth.requestEmailChange).not.toHaveBeenCalled();
    });

    it('id glissé dans le corps → 400 forbidNonWhitelisted, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/email')
        .send({
          currentPassword: 'oldpw',
          newEmail: 'new@b.c',
          id: 'autre-utilisateur',
        })
        .expect(400);
      expect(auth.requestEmailChange).not.toHaveBeenCalled();
    });

    it('requête valide → 200', async () => {
      auth.requestEmailChange.mockResolvedValue({ ok: true });
      await request(app.getHttpServer())
        .patch('/me/email')
        .send({ currentPassword: 'oldpw', newEmail: 'new@example.com' })
        .expect(200);
      expect(auth.requestEmailChange).toHaveBeenCalledWith(
        'u1',
        'oldpw',
        'new@example.com',
      );
    });

    it('partiesSort hors union fermée → 400, service jamais appelé (AC4, Story 29.8)', async () => {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ partiesSort: 'favori' })
        .expect(400);
      expect(account.updatePreferences).not.toHaveBeenCalled();
    });

    it('hideFinishedParties non booléen → 400, service jamais appelé', async () => {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ hideFinishedParties: 'oui' })
        .expect(400);
      expect(account.updatePreferences).not.toHaveBeenCalled();
    });

    it('patch partiel (un seul champ fourni) → 200', async () => {
      account.updatePreferences.mockResolvedValue({
        id: 'u1',
        partiesSort: 'nom',
      });
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ partiesSort: 'nom' })
        .expect(200);
      expect(account.updatePreferences).toHaveBeenCalledWith('u1', {
        partiesSort: 'nom',
      });
    });

    it('corps vide (aucun champ) → 200, patch vide transmis', async () => {
      account.updatePreferences.mockResolvedValue({ id: 'u1' });
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({})
        .expect(200);
      expect(account.updatePreferences).toHaveBeenCalledWith('u1', {});
    });

    it('partiesViewMode hors union fermée → 400, service jamais appelé (AC4, Story 29.9)', async () => {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ partiesViewMode: 'geant' })
        .expect(400);
      expect(account.updatePreferences).not.toHaveBeenCalled();
    });

    it('charactersViewMode hors union fermée → 400, service jamais appelé (AC4, Story 29.9)', async () => {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ charactersViewMode: 'geant' })
        .expect(400);
      expect(account.updatePreferences).not.toHaveBeenCalled();
    });

    it('charactersSort hors union fermée → 400, service jamais appelé (AC4, Story 29.9)', async () => {
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send({ charactersSort: 'urgence' }) // vocabulaire des parties, disjoint de celui des personnages
        .expect(400);
      expect(account.updatePreferences).not.toHaveBeenCalled();
    });

    it('patch combinant les 6 champs de préférence en un seul appel → 200, tous transmis (Story 29.9)', async () => {
      account.updatePreferences.mockResolvedValue({ id: 'u1' });
      const body = {
        partiesSort: 'date',
        hideFinishedParties: true,
        partiesViewMode: 'compact',
        charactersViewMode: 'large',
        charactersSort: 'niveau',
      };
      await request(app.getHttpServer())
        .patch('/me/preferences')
        .send(body)
        .expect(200);
      expect(account.updatePreferences).toHaveBeenCalledWith('u1', body);
    });

    it('PUT /me/favorites/:partieId → 200', async () => {
      account.addFavorite.mockResolvedValue({ ok: true });
      await request(app.getHttpServer()).put('/me/favorites/p1').expect(200);
      expect(account.addFavorite).toHaveBeenCalledWith('u1', 'p1');
    });

    it('DELETE /me/favorites/:partieId → 200', async () => {
      account.removeFavorite.mockResolvedValue({ ok: true });
      await request(app.getHttpServer()).delete('/me/favorites/p1').expect(200);
      expect(account.removeFavorite).toHaveBeenCalledWith('u1', 'p1');
    });
  });
});
