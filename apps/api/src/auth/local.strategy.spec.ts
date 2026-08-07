import { UnauthorizedException } from '@nestjs/common';

// LocalStrategy -> AuthService -> import RUNTIME (pas `import type`) de THEMES depuis
// @master-jdr/shared (ESM, non transformé par ts-jest) — même piège déjà documenté (mémoire
// projet, Story 28.4/28.5).
jest.mock('@master-jdr/shared', () => ({
  THEMES: ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'],
}));

import { LocalStrategy } from './local.strategy';
import { AuthService } from './auth.service';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: { validateUser: jest.Mock };

  beforeEach(() => {
    authService = { validateUser: jest.fn() };
    strategy = new LocalStrategy(authService as unknown as AuthService);
  });

  it('identifiants invalides (validateUser → null) → UnauthorizedException', async () => {
    authService.validateUser.mockResolvedValue(null);

    await expect(strategy.validate('a@b.c', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("compte valide sans mustResetPassword → renvoie l'utilisateur (attaché à req.user)", async () => {
    const user = { id: 'u1', email: 'a@b.c', mustResetPassword: false };
    authService.validateUser.mockResolvedValue(user);

    await expect(strategy.validate('a@b.c', 'good')).resolves.toBe(user);
  });

  it('Story 28.6 : mustResetPassword: true → connexion refusée avec un message dédié, même mot de passe correct', async () => {
    const user = { id: 'u1', email: 'a@b.c', mustResetPassword: true };
    authService.validateUser.mockResolvedValue(user);

    await expect(strategy.validate('a@b.c', 'good')).rejects.toThrow(
      'Une réinitialisation de mot de passe est requise avant de vous reconnecter.',
    );
  });
});
