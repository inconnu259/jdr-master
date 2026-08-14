import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';

// AccountService importe toDto() depuis AnnouncementsService (Story 29.13, AD-17) qui importe
// transitivement CharacterService -> @master-jdr/game-rules (ESM, non transformé par ts-jest) —
// même mock que announcements.service.spec.ts pour éviter "Unexpected token export".
jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  pendingLevels: jest.fn(),
  LEVEL_TABLE: [],
}));

import { PrismaService } from '../prisma/prisma.service';
import { AccountService } from './account.service';

// Champs requis par toAuthUser() (Story 30.4) — fusionnés dans chaque mock de retour
// `prisma.user.update()` qui ne les fournit pas déjà explicitement.
const AUTH_USER_BASE_FIELDS = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  calendarLayersSetAt: null,
  calendarLayers: [],
};

function makePrisma() {
  return {
    user: { update: jest.fn() },
    userCalendarLayer: { deleteMany: jest.fn(), createMany: jest.fn() },
    partieFavorite: { create: jest.fn(), deleteMany: jest.fn() },
    announcement: { findMany: jest.fn() },
    announcementRead: { create: jest.fn() },
    $transaction: jest.fn(),
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
        calendarLayersSetAt: null,
        calendarLayers: [],
      });

      const result = await service.updateDisplayName('u1', 'Alice au pays');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { displayName: 'Alice au pays' },
        include: { calendarLayers: true },
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
        calendarLayersSetAt: null,
        calendarLayers: [],
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
        calendarLayersSetAt: null,
        calendarLayers: [],
      });

      const result = await service.updateTheme('u1', 'foret-ancienne');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { theme: 'foret-ancienne' },
        include: { calendarLayers: true },
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
        calendarLayersSetAt: null,
        calendarLayers: [],
      });

      const result = await service.updatePreferences('u1', {
        partiesSort: 'date',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { partiesSort: 'date' },
        include: { calendarLayers: true },
      });
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(result).toMatchObject({ partiesSort: 'date' });
    });

    it('ne met à jour que les champs fournis (patch partiel) — hideFinishedParties seul', async () => {
      prisma.user.update.mockResolvedValue({
        ...AUTH_USER_BASE_FIELDS,
        id: 'u1',
        hideFinishedParties: true,
      });

      await service.updatePreferences('u1', { hideFinishedParties: true });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { hideFinishedParties: true },
        include: { calendarLayers: true },
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

    it('ne met à jour que les champs fournis (patch partiel) — les 3 champs de la Story 29.9 isolément', async () => {
      prisma.user.update.mockResolvedValue({
        ...AUTH_USER_BASE_FIELDS,
        id: 'u1',
        partiesViewMode: 'compact',
      });
      await service.updatePreferences('u1', { partiesViewMode: 'compact' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { partiesViewMode: 'compact' },
        include: { calendarLayers: true },
      });

      prisma.user.update.mockResolvedValue({
        ...AUTH_USER_BASE_FIELDS,
        id: 'u1',
        charactersViewMode: 'large',
      });
      await service.updatePreferences('u1', { charactersViewMode: 'large' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { charactersViewMode: 'large' },
        include: { calendarLayers: true },
      });

      prisma.user.update.mockResolvedValue({
        ...AUTH_USER_BASE_FIELDS,
        id: 'u1',
        charactersSort: 'niveau',
      });
      await service.updatePreferences('u1', { charactersSort: 'niveau' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { charactersSort: 'niveau' },
        include: { calendarLayers: true },
      });
    });

    it('patch combinant les 6 champs de préférence en un seul appel (Story 29.9)', async () => {
      const body = {
        partiesSort: 'date' as const,
        hideFinishedParties: true,
        partiesViewMode: 'compact' as const,
        charactersViewMode: 'large' as const,
        charactersSort: 'niveau' as const,
      };
      prisma.user.update.mockResolvedValue({
        ...AUTH_USER_BASE_FIELDS,
        id: 'u1',
        ...body,
      });

      await service.updatePreferences('u1', body);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: body,
        include: { calendarLayers: true },
      });
    });

    describe('defaultCalendarLayers (Story 30.4, AD-16)', () => {
      it('lot fourni → remplacement atomique via $transaction (delete puis create) et calendarLayersSetAt posé', async () => {
        prisma.$transaction.mockResolvedValue([
          {},
          {},
          {
            ...AUTH_USER_BASE_FIELDS,
            id: 'u1',
            calendarLayersSetAt: new Date('2026-02-01T00:00:00.000Z'),
            calendarLayers: [
              { id: 'l1', userId: 'u1', layerKey: 'mes-seances' },
            ],
          },
        ]);

        const result = await service.updatePreferences('u1', {
          defaultCalendarLayers: ['mes-seances'],
        });

        expect(prisma.userCalendarLayer.deleteMany).toHaveBeenCalledWith({
          where: { userId: 'u1' },
        });
        expect(prisma.userCalendarLayer.createMany).toHaveBeenCalledWith({
          data: [{ userId: 'u1', layerKey: 'mes-seances' }],
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { calendarLayersSetAt: expect.any(Date) },
          include: { calendarLayers: true },
        });
        expect(result.defaultCalendarLayers).toEqual(['mes-seances']);
      });

      it('lot vide → aucune ligne créée mais calendarLayersSetAt posé quand même (AC3 — tout éteint, distinct d’absent)', async () => {
        prisma.$transaction.mockResolvedValue([
          {},
          {},
          {
            ...AUTH_USER_BASE_FIELDS,
            id: 'u1',
            calendarLayersSetAt: new Date('2026-02-01T00:00:00.000Z'),
            calendarLayers: [],
          },
        ]);

        const result = await service.updatePreferences('u1', {
          defaultCalendarLayers: [],
        });

        expect(prisma.userCalendarLayer.createMany).toHaveBeenCalledWith({
          data: [],
        });
        expect(result.defaultCalendarLayers).toEqual([]);
      });

      it('doublons dans le lot → dédupliqués avant écriture (AC9)', async () => {
        prisma.$transaction.mockResolvedValue([
          {},
          {},
          {
            ...AUTH_USER_BASE_FIELDS,
            id: 'u1',
            calendarLayersSetAt: new Date('2026-02-01T00:00:00.000Z'),
            calendarLayers: [
              { id: 'l1', userId: 'u1', layerKey: 'mes-seances' },
            ],
          },
        ]);

        await service.updatePreferences('u1', {
          defaultCalendarLayers: ['mes-seances', 'mes-seances'],
        });

        expect(prisma.userCalendarLayer.createMany).toHaveBeenCalledWith({
          data: [{ userId: 'u1', layerKey: 'mes-seances' }],
        });
      });

      it('combiné à un scalaire dans le même patch → les deux appliqués dans la même transaction', async () => {
        prisma.$transaction.mockResolvedValue([
          {},
          {},
          {
            ...AUTH_USER_BASE_FIELDS,
            id: 'u1',
            partiesSort: 'date',
            calendarLayersSetAt: new Date('2026-02-01T00:00:00.000Z'),
            calendarLayers: [],
          },
        ]);

        await service.updatePreferences('u1', {
          partiesSort: 'date',
          defaultCalendarLayers: [],
        });

        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 'u1' },
          data: { partiesSort: 'date', calendarLayersSetAt: expect.any(Date) },
          include: { calendarLayers: true },
        });
      });
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

  describe('getUnseenAnnouncements() (Story 29.13)', () => {
    it('effectue un unique appel findMany batché (AD-3, jamais de fan-out par partie)', async () => {
      prisma.announcement.findMany.mockResolvedValue([]);

      await service.getUnseenAnnouncements('u1');

      expect(prisma.announcement.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.announcement.findMany).toHaveBeenCalledWith({
        where: {
          partie: {
            OR: [{ mjId: 'u1' }, { memberships: { some: { userId: 'u1' } } }],
          },
          reads: { none: { userId: 'u1' } },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          partie: {
            select: { mj: { select: { pseudo: true, displayName: true } } },
          },
        },
      });
    });

    it('mappe les annonces trouvées vers AnnouncementDto (auteur dérivé du MJ de la partie)', async () => {
      prisma.announcement.findMany.mockResolvedValue([
        {
          id: 'a1',
          partieId: 'p1',
          scenarioId: null,
          text: 'Bienvenue',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          partie: { mj: { pseudo: 'mj1', displayName: 'Le Meneur' } },
        },
      ]);

      const result = await service.getUnseenAnnouncements('u1');

      expect(result).toEqual([
        {
          id: 'a1',
          partieId: 'p1',
          scenarioId: null,
          text: 'Bienvenue',
          createdAt: '2026-08-01T00:00:00.000Z',
          authorPseudo: 'mj1',
          authorDisplayName: 'Le Meneur',
        },
      ]);
    });

    it('aucune annonce non vue → tableau vide', async () => {
      prisma.announcement.findMany.mockResolvedValue([]);

      await expect(service.getUnseenAnnouncements('u1')).resolves.toEqual([]);
    });

    it("AC3 (multi-appareil) : une annonce disparaît de la liste après markAnnouncementRead(), l'état vivant en base par userId", async () => {
      const announcement = {
        id: 'a1',
        partieId: 'p1',
        scenarioId: null,
        text: 'Bienvenue',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        partie: { mj: { pseudo: 'mj1', displayName: 'Le Meneur' } },
      };
      // Premier appareil : l'annonce est encore non-lue.
      prisma.announcement.findMany.mockResolvedValueOnce([announcement]);
      const first = await service.getUnseenAnnouncements('u1');
      expect(first).toHaveLength(1);

      prisma.announcementRead.create.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        announcementId: 'a1',
      });
      await service.markAnnouncementRead('u1', 'a1');

      // Second appareil : la requête reflète désormais reads:{none} exclu par le mock, donc vide.
      prisma.announcement.findMany.mockResolvedValueOnce([]);
      const second = await service.getUnseenAnnouncements('u1');
      expect(second).toHaveLength(0);
    });
  });

  describe('markAnnouncementRead() (Story 29.13)', () => {
    it('crée la ligne AnnouncementRead', async () => {
      prisma.announcementRead.create.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        announcementId: 'a1',
      });

      const result = await service.markAnnouncementRead('u1', 'a1');

      expect(prisma.announcementRead.create).toHaveBeenCalledWith({
        data: { userId: 'u1', announcementId: 'a1' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('déjà marquée lue (P2002) → aucune erreur, idempotent', async () => {
      prisma.announcementRead.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      await expect(service.markAnnouncementRead('u1', 'a1')).resolves.toEqual({
        ok: true,
      });
    });

    it('announcementId inexistant (P2003, FK invalide) → NotFoundException', async () => {
      prisma.announcementRead.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed.',
          { code: 'P2003', clientVersion: '7.8.0' },
        ),
      );

      await expect(
        service.markAnnouncementRead('u1', 'inconnue'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('erreur Prisma non P2002/P2003 → propagée telle quelle', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError('boom', {
        code: 'P2025',
        clientVersion: '7.8.0',
      });
      prisma.announcementRead.create.mockRejectedValue(otherError);

      await expect(service.markAnnouncementRead('u1', 'a1')).rejects.toBe(
        otherError,
      );
    });
  });
});
