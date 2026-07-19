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
    passwordResetToken: { updateMany: jest.Mock };
    userSession: { findMany: jest.Mock; deleteMany: jest.Mock };
    session: { deleteMany: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock };
    userSession: { upsert: jest.Mock; deleteMany: jest.Mock };
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
      },
      userSession: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      session: { deleteMany: jest.fn() },
    };
    // $transaction exécute le callback avec notre `tx` mocké.
    prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn() },
      userSession: { upsert: jest.fn(), deleteMany: jest.fn() },
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
    it('e-mail correspondant à un compte → crée un PasswordResetToken (+24h, tokenHash haché, jamais le secret) et envoie l’e-mail', async () => {
      users.findByEmail.mockResolvedValue(fakeUser);
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'r1' });
      (argon2.hash as jest.Mock).mockResolvedValue('SECRET_HASH');
      const before = Date.now();
      const result = await service.requestPasswordReset('a@b.c');
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe('u1');
      expect(createArgs.data.tokenHash).toBe('SECRET_HASH');
      expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(
        before + 23 * 60 * 60 * 1000,
      );
      expect(email.sendMail).toHaveBeenCalledWith(
        'password-reset',
        'a@b.c',
        expect.objectContaining({
          link: expect.stringContaining('/reset-password/r1.'),
        }),
      );
      // Le secret embarqué dans le lien n'est jamais le tokenHash stocké en base (AC1).
      const link = email.sendMail.mock.calls[0][2].link as string;
      const secret = link.split('/reset-password/r1.')[1];
      expect(secret).not.toBe('SECRET_HASH');
      expect(secret.length).toBeGreaterThan(0);
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

  describe('recordSession', () => {
    it('crée une ligne UserSession (userId, sid) via upsert (sid @unique, idempotent en cas de retry)', async () => {
      await service.recordSession('u1', 'sess1');
      expect(prisma.userSession.upsert).toHaveBeenCalledWith({
        where: { sid: 'sess1' },
        create: { userId: 'u1', sid: 'sess1' },
        update: { userId: 'u1' },
      });
    });
  });

  describe('forgetSession', () => {
    it('supprime la ligne UserSession correspondant au sid (deleteMany, idempotent)', async () => {
      await service.forgetSession('sess1');
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: { sid: 'sess1' },
      });
    });
  });

  describe('resetPassword', () => {
    const validRecord = {
      id: 'r1',
      userId: 'u1',
      tokenHash: 'STORED_HASH',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    it('token composite valide (id connu, secret correct) → vérifie via argon2.verify hors transaction, réclame atomiquement, met à jour le mot de passe puis invalide les sessions actives (Session + UserSession), dans la même transaction limitée au claim+update+invalidation', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRecord);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      (argon2.hash as jest.Mock).mockResolvedValue('NEW_HASH');
      tx.userSession.findMany.mockResolvedValue([
        { sid: 's1' },
        { sid: 's2' },
      ]);

      await service.resetPassword('r1.secretvalue', 'newpassword123');

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
      expect(argon2.verify).toHaveBeenCalledWith('STORED_HASH', 'secretvalue');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'NEW_HASH' },
      });
      expect(tx.userSession.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { sid: true },
      });
      expect(tx.session.deleteMany).toHaveBeenCalledWith({
        where: { sid: { in: ['s1', 's2'] } },
      });
      expect(tx.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('aucune session active (UserSession.findMany vide) → invalidation en no-op, reset réussit normalement', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRecord);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      (argon2.hash as jest.Mock).mockResolvedValue('NEW_HASH');
      tx.userSession.findMany.mockResolvedValue([]);

      await expect(
        service.resetPassword('r1.secretvalue', 'newpassword123'),
      ).resolves.toBeUndefined();

      expect(tx.session.deleteMany).toHaveBeenCalledWith({
        where: { sid: { in: [] } },
      });
      expect(tx.userSession.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('token sans séparateur "." (format invalide) → NotFoundException, aucune requête DB', async () => {
      await expect(
        service.resetPassword('nosecretmarker', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('id inconnu (findUnique → null) → NotFoundException, mot de passe non modifié, transaction jamais ouverte', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('unknown.secretvalue', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('secret incorrect (argon2.verify → false) → NotFoundException, la réclamation atomique (updateMany) n’est jamais appelée, transaction jamais ouverte', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRecord);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.resetPassword('r1.wrongsecret', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Garde anti-brûlage : un mauvais secret ne doit jamais marquer le token comme utilisé,
      // sinon une tentative ratée invaliderait le vrai lien de l'utilisateur légitime.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('token déjà utilisé (usedAt non nul) → NotFoundException avant toute vérification du secret', async () => {
      const verifyCallsBefore = (argon2.verify as jest.Mock).mock.calls.length;
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validRecord,
        usedAt: new Date(),
      });
      await expect(
        service.resetPassword('r1.secretvalue', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((argon2.verify as jest.Mock).mock.calls.length).toBe(
        verifyCallsBefore,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('token expiré (expiresAt dans le passé) → NotFoundException avant toute vérification du secret', async () => {
      const verifyCallsBefore = (argon2.verify as jest.Mock).mock.calls.length;
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('r1.secretvalue', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((argon2.verify as jest.Mock).mock.calls.length).toBe(
        verifyCallsBefore,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('réclamation atomique échoue malgré secret valide (course concurrente, count: 0) → NotFoundException, mot de passe non modifié', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validRecord);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.resetPassword('r1.secretvalue', 'newpassword123'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
