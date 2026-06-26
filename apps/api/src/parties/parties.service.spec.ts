import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PartiesService', () => {
  let service: PartiesService;
  let prisma: {
    partie: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    membership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const partie = {
    id: 'p1',
    name: 'La Nuit',
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj1',
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      partie: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      membership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new PartiesService(prisma as unknown as PrismaService);
  });

  it('create attache le mjId', async () => {
    prisma.partie.create.mockResolvedValue(partie);
    await service.create('mj1', { name: 'La Nuit', kind: 'ONE_SHOT', gameSystemId: 'draconis' });
    expect(prisma.partie.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mjId: 'mj1', name: 'La Nuit', description: null }),
    });
  });

  it('listForUser(player) renvoie les parties des memberships', async () => {
    prisma.membership.findMany.mockResolvedValue([{ partie }]);
    expect(await service.listForUser('u', 'player')).toEqual([partie]);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u' }, include: { partie: true } }),
    );
  });

  it('getViewable : renvoie la partie au MJ sans vérifier les memberships', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    expect(await service.getViewable('p1', 'mj1')).toEqual(partie);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('getViewable : autorise un membre', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue({ userId: 'u', partieId: 'p1' });
    expect(await service.getViewable('p1', 'u')).toEqual(partie);
  });

  it('getViewable : 403 si ni MJ ni membre', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.getViewable('p1', 'u')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removeMember : MJ uniquement, puis supprime le membership', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.membership.deleteMany.mockResolvedValue({ count: 1 });
    await service.removeMember('p1', 'mj1', 'u');
    expect(prisma.membership.deleteMany).toHaveBeenCalledWith({
      where: { partieId: 'p1', userId: 'u' },
    });
  });

  it('removeMember : 403 si pas le MJ (aucune suppression)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(service.removeMember('p1', 'autre', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.deleteMany).not.toHaveBeenCalled();
  });

  it('getOwned : 404 si introuvable', async () => {
    prisma.partie.findUnique.mockResolvedValue(null);
    await expect(service.getOwned('p1', 'mj1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getOwned : 403 si pas le MJ', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(service.getOwned('p1', 'autre')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getOwned : renvoie la partie si MJ', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    expect(await service.getOwned('p1', 'mj1')).toEqual(partie);
  });

  it('remove : vérifie la propriété puis supprime', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    prisma.partie.delete.mockResolvedValue(partie);
    await service.remove('p1', 'mj1');
    expect(prisma.partie.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('remove : 403 si pas le MJ (et aucune suppression)', async () => {
    prisma.partie.findUnique.mockResolvedValue(partie);
    await expect(service.remove('p1', 'autre')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.partie.delete).not.toHaveBeenCalled();
  });
});
