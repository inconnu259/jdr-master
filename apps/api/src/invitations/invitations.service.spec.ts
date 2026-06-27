import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    membership: { findUnique: jest.Mock; upsert: jest.Mock };
    invitation: { upsert: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let parties: { getOwned: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      membership: { findUnique: jest.fn(), upsert: jest.fn() },
      invitation: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    parties = { getOwned: jest.fn().mockResolvedValue({ id: 'p1', mjId: 'mj1' }) };
    service = new InvitationsService(
      prisma as unknown as PrismaService,
      parties as unknown as PartiesService,
    );
  });

  it('invite : refuse de s’inviter soi-même', async () => {
    await expect(service.invite('p1', 'mj1', 'mj1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invite : 404 si destinataire inconnu', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.invite('p1', 'mj1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('invite : 409 si déjà membre', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u' });
    prisma.membership.findUnique.mockResolvedValue({ userId: 'u', partieId: 'p1' });
    await expect(service.invite('p1', 'mj1', 'u')).rejects.toBeInstanceOf(ConflictException);
  });

  it('invite : upsert PENDING si tout est ok', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u' });
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.invitation.upsert.mockResolvedValue({ id: 'inv1' });
    await service.invite('p1', 'mj1', 'u');
    expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    expect(prisma.invitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('accept : 404 si l’invitation ne m’est pas adressée', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ id: 'inv1', inviteeUserId: 'autre', status: 'PENDING' });
    await expect(service.accept('inv1', 'u')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accept : 409 si l’invitation n’est plus PENDING', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ id: 'inv1', inviteeUserId: 'u', status: 'ACCEPTED' });
    await expect(service.accept('inv1', 'u')).rejects.toBeInstanceOf(ConflictException);
  });

  it('accept : crée le membership et marque ACCEPTED (transaction)', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      inviteeUserId: 'u',
      partieId: 'p1',
      status: 'PENDING',
    });
    const res = await service.accept('inv1', 'u');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.membership.upsert).toHaveBeenCalled();
    expect(prisma.invitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
    expect(res).toEqual({ ok: true, partieId: 'p1' });
  });

  it('revoke : 403 si ni inviteur ni MJ', async () => {
    prisma.invitation.findUnique.mockResolvedValue({
      id: 'inv1',
      inviterId: 'mj1',
      partie: { mjId: 'mj1' },
    });
    await expect(service.revoke('inv1', 'intrus')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
