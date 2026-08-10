import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

function makePrisma() {
  return {
    user: { update: jest.fn() },
    partieFavorite: { create: jest.fn(), deleteMany: jest.fn() },
  };
}

describe('AccountService', () => {
  let service: AccountService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [AccountService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AccountService);
  });

  describe('updateDisplayName()', () => {
    it('persiste le nom affiché pour l’id fourni et renvoie l’utilisateur sans passwordHash', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        pseudo: 'alice',
        displayName: 'Alice au pays',
        passwordHash: 'HASH',
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.updateDisplayName('u1', 'Alice au pays');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { displayName: 'Alice au pays' },
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ id: 'u1', displayName: 'Alice au pays' });
    });

    it('deux utilisateurs différents peuvent porter exactement le même nom affiché (AC4, aucune contrainte d’unicité)', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u2',
        email: 'x@y.z',
        pseudo: 'bob',
        displayName: 'Alice au pays',
        passwordHash: 'HASH2',
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.updateDisplayName('u2', 'Alice au pays');

      expect(result).toMatchObject({ id: 'u2', displayName: 'Alice au pays' });
    });

    it('userId de session référant un compte supprimé (P2025) → NotFoundException, pas un 500 brut', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'An operation failed because it depends on one or more records that were required but not found.',
          { code: 'P2025', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.updateDisplayName('deleted-user', 'Nom'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('erreur Prisma non-P2025 → propagée telle quelle', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed.',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      prisma.user.update.mockRejectedValue(otherError);

      await expect(service.updateDisplayName('u1', 'Nom')).rejects.toBe(
        otherError,
      );
    });
  });

  describe('updateTheme()', () => {
    it('persiste le thème pour l’id fourni et renvoie l’utilisateur sans passwordHash', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        pseudo: 'alice',
        displayName: 'Alice',
        passwordHash: 'HASH',
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        theme: 'foret-ancienne',
      });

      const result = await service.updateTheme('u1', 'foret-ancienne');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { theme: 'foret-ancienne' },
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ id: 'u1', theme: 'foret-ancienne' });
    });

    it('userId de session référant un compte supprimé (P2025) → NotFoundException, pas un 500 brut', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'An operation failed because it depends on one or more records that were required but not found.',
          { code: 'P2025', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.updateTheme('deleted-user', 'grimoire-emeraude'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('erreur Prisma non-P2025 → propagée telle quelle', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed.',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      prisma.user.update.mockRejectedValue(otherError);

      await expect(service.updateTheme('u1', 'grimoire-emeraude')).rejects.toBe(
        otherError,
      );
    });
  });

  describe('updatePreferences() (Story 29.8)', () => {
    it('ne met à jour que les champs fournis (patch partiel) — partiesSort seul', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        pseudo: 'alice',
        displayName: 'Alice',
        passwordHash: 'HASH',
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        partiesSort: 'date',
        hideFinishedParties: false,
      });

      const result = await service.updatePreferences('u1', {
        partiesSort: 'date',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { partiesSort: 'date' },
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ partiesSort: 'date' });
    });

    it('ne met à jour que les champs fournis (patch partiel) — hideFinishedParties seul', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        hideFinishedParties: true,
      });

      await service.updatePreferences('u1', { hideFinishedParties: true });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { hideFinishedParties: true },
      });
    });

    it('userId de session référant un compte supprimé (P2025) → NotFoundException, pas un 500 brut', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'An operation failed because it depends on one or more records that were required but not found.',
          { code: 'P2025', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.updatePreferences('deleted-user', { partiesSort: 'nom' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addFavorite() (Story 29.8)', () => {
    it('crée la ligne PartieFavorite', async () => {
      prisma.partieFavorite.create.mockResolvedValue({
        id: 'f1',
        userId: 'u1',
        partieId: 'p1',
      });

      const result = await service.addFavorite('u1', 'p1');

      expect(prisma.partieFavorite.create).toHaveBeenCalledWith({
        data: { userId: 'u1', partieId: 'p1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('déjà favori (P2002) → aucune erreur, idempotent', async () => {
      prisma.partieFavorite.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      await expect(service.addFavorite('u1', 'p1')).resolves.toEqual({
        ok: true,
      });
    });

    it('partieId inexistant (P2003, FK invalide) → NotFoundException', async () => {
      prisma.partieFavorite.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed.',
          {
            code: 'P2003',
            clientVersion: '7.8.0',
          },
        ),
      );

      await expect(
        service.addFavorite('u1', 'inconnue'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('erreur Prisma non P2002/P2003 → propagée telle quelle', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError('boom', {
        code: 'P2025',
        clientVersion: '7.8.0',
      });
      prisma.partieFavorite.create.mockRejectedValue(otherError);

      await expect(service.addFavorite('u1', 'p1')).rejects.toBe(otherError);
    });
  });

  describe('removeFavorite() (Story 29.8)', () => {
    it('supprime la ligne PartieFavorite', async () => {
      prisma.partieFavorite.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeFavorite('u1', 'p1');

      expect(prisma.partieFavorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', partieId: 'p1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('partie non favorite (0 ligne supprimée) → aucune erreur, idempotent', async () => {
      prisma.partieFavorite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeFavorite('u1', 'p1')).resolves.toEqual({
        ok: true,
      });
    });
  });
});
