import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteLinksService } from '../invitations/invite-links.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<UsersService, 'findByEmailOrPseudo' | 'create'>>;
  let tx: { user: { create: jest.Mock } };
  let prisma: { $transaction: jest.Mock };
  let inviteLinks: { consumeLink: jest.Mock };

  const fakeUser = {
    id: 'u1',
    email: 'a@b.c',
    pseudo: 'alice',
    passwordHash: 'HASH',
    role: 'USER' as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    users = { findByEmailOrPseudo: jest.fn(), create: jest.fn() };
    tx = { user: { create: jest.fn() } };
    // $transaction exécute le callback avec notre `tx` mocké.
    prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    inviteLinks = {
      consumeLink: jest.fn().mockResolvedValue({ partieId: 'p1' }),
    };
    service = new AuthService(
      users as unknown as UsersService,
      prisma as unknown as PrismaService,
      inviteLinks as unknown as InviteLinksService,
    );
  });

  describe('validateUser', () => {
    it('renvoie null si identifiant (email ou pseudo) inconnu', async () => {
      users.findByEmailOrPseudo.mockResolvedValue(null);
      expect(await service.validateUser('x@y.z', 'pw')).toBeNull();
    });

    it('renvoie null si mauvais mot de passe', async () => {
      users.findByEmailOrPseudo.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      expect(await service.validateUser('a@b.c', 'wrong')).toBeNull();
    });

    it("renvoie l'utilisateur sans le hash si mot de passe correct, via l'email", async () => {
      users.findByEmailOrPseudo.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      const result = await service.validateUser('a@b.c', 'good');
      expect(result).toMatchObject({
        id: 'u1',
        email: 'a@b.c',
        pseudo: 'alice',
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it("renvoie l'utilisateur sans le hash si mot de passe correct, via le pseudo", async () => {
      users.findByEmailOrPseudo.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      const result = await service.validateUser('alice', 'good');
      expect(users.findByEmailOrPseudo).toHaveBeenCalledWith('alice');
      expect(result).toMatchObject({ id: 'u1', pseudo: 'alice' });
    });

    it('hash stocké invalide/corrompu (argon2.verify lève) → renvoie null plutôt que de laisser planter la requête', async () => {
      users.findByEmailOrPseudo.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockRejectedValue(
        new Error('pwhash must be a argon2 hash'),
      );
      await expect(
        service.validateUser('a@b.c', 'anything'),
      ).resolves.toBeNull();
    });
  });

  describe('register', () => {
    it("crée le compte, consomme le lien et renvoie l'utilisateur sans le hash", async () => {
      tx.user.create.mockResolvedValue(fakeUser);
      const result = await service.register({
        email: 'a@b.c',
        pseudo: 'alice',
        password: 'password123',
        token: 'tok',
      });
      expect(inviteLinks.consumeLink).toHaveBeenCalledWith(tx, 'tok', 'u1');
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ pseudo: 'alice' });
    });

    it('lève ConflictException si email/pseudo déjà pris (P2002)', async () => {
      tx.user.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.register({
          email: 'a@b.c',
          pseudo: 'alice',
          password: 'password123',
          token: 'tok',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
