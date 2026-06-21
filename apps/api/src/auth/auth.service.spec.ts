import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'create'>>;

  const fakeUser = {
    id: 'u1',
    email: 'a@b.c',
    pseudo: 'alice',
    passwordHash: 'HASH',
    role: 'USER' as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
    service = new AuthService(users as unknown as UsersService);
  });

  describe('validateUser', () => {
    it('renvoie null si email inconnu', async () => {
      users.findByEmail.mockResolvedValue(null);
      expect(await service.validateUser('x@y.z', 'pw')).toBeNull();
    });

    it('renvoie null si mauvais mot de passe', async () => {
      users.findByEmail.mockResolvedValue(fakeUser as never);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      expect(await service.validateUser('a@b.c', 'wrong')).toBeNull();
    });

    it("renvoie l'utilisateur sans le hash si mot de passe correct", async () => {
      users.findByEmail.mockResolvedValue(fakeUser as never);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      const result = await service.validateUser('a@b.c', 'good');
      expect(result).toMatchObject({ id: 'u1', email: 'a@b.c', pseudo: 'alice' });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('register', () => {
    it("crée et renvoie l'utilisateur sans le hash", async () => {
      users.create.mockResolvedValue(fakeUser as never);
      const result = await service.register({
        email: 'a@b.c',
        pseudo: 'alice',
        password: 'password123',
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ pseudo: 'alice' });
    });

    it('lève ConflictException si email/pseudo déjà pris (P2002)', async () => {
      users.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.register({ email: 'a@b.c', pseudo: 'alice', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
