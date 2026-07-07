import { ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { InviteLinksService } from '../invitations/invite-links.service';
import { EmailService } from '../email/email.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmailOrPseudo' | 'findByEmail' | 'create'>
  >;
  let tx: {
    user: { create: jest.Mock; update: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    passwordResetToken: { create: jest.Mock };
  };
  let inviteLinks: { consumeLink: jest.Mock };
  let email: { sendMail: jest.Mock };

  const fakeUser = {
    id: 'u1',
    email: 'a@b.c',
    pseudo: 'alice',
    passwordHash: 'HASH',
    role: 'USER' as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    users = {
      findByEmailOrPseudo: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    tx = {
      user: { create: jest.fn(), update: jest.fn() },
      passwordResetToken: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    // $transaction exécute le callback avec notre `tx` mocké.
    prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      passwordResetToken: { create: jest.fn() },
    };
    inviteLinks = {
      consumeLink: jest.fn().mockResolvedValue({ partieId: 'p1' }),
    };
    email = { sendMail: jest.fn().mockResolvedValue({ ok: true }) };
    service = new AuthService(
      users as unknown as UsersService,
      prisma as unknown as PrismaService,
      inviteLinks as unknown as InviteLinksService,
      email as unknown as EmailService,
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

  describe('requestPasswordReset', () => {
    it('e-mail correspondant à un compte → crée un PasswordResetToken (+24h) et envoie l’e-mail', async () => {
      users.findByEmail.mockResolvedValue(fakeUser);
      const before = Date.now();
      const result = await service.requestPasswordReset('a@b.c');
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('u1');
      expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(
        before + 23 * 60 * 60 * 1000,
      );
      expect(email.sendMail).toHaveBeenCalledWith(
        'password-reset',
        'a@b.c',
        expect.objectContaining({
          link: expect.stringContaining('/reset-password/'),
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it('e-mail sans compte correspondant → aucun token créé, aucun e-mail envoyé, renvoie quand même { ok: true } (AC1)', async () => {
      users.findByEmail.mockResolvedValue(null);
      const result = await service.requestPasswordReset('inconnu@x.y');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(email.sendMail).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });
  });

  describe('resetPassword', () => {
    it('token valide et non expiré → réclame le token atomiquement puis met à jour le mot de passe, dans une transaction', async () => {
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      tx.passwordResetToken.findUniqueOrThrow.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        token: 'tok',
      });
      (argon2.hash as jest.Mock).mockResolvedValue('NEW_HASH');
      await service.resetPassword('tok', 'newpassword123');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: {
          token: 'tok',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'NEW_HASH' },
      });
    });

    it('token inconnu, expiré ou déjà utilisé → la réclamation atomique échoue (count: 0) → NotFoundException, mot de passe non modifié', async () => {
      // La garde `WHERE usedAt: null, expiresAt: { gt: now }` de `updateMany` couvre les 3 cas
      // (token inexistant, expiré, déjà utilisé) et protège aussi contre la course entre deux
      // requêtes concurrentes sur le même token (une seule verrait count: 1 côté Postgres).
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.resetPassword('tok', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
