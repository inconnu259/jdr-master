import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InviteLinksService } from './invite-links.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('InviteLinksService', () => {
  let service: InviteLinksService;
  let prisma: { inviteLink: { create: jest.Mock; findUnique: jest.Mock } };
  let parties: { getOwned: jest.Mock };

  beforeEach(() => {
    prisma = { inviteLink: { create: jest.fn(), findUnique: jest.fn() } };
    parties = {
      getOwned: jest.fn().mockResolvedValue({ id: 'p1', mjId: 'mj1' }),
    };
    service = new InviteLinksService(
      prisma as unknown as PrismaService,
      parties as unknown as PartiesService,
    );
  });

  it('create : MJ requis, token généré, expiration par défaut +7j', async () => {
    prisma.inviteLink.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );
    const before = Date.now();
    const link = (await service.create('p1', 'mj1', {})) as {
      token: string;
      expiresAt: Date;
    };
    expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    expect(link.token).toHaveLength(43); // 32 octets en base64url
    expect(link.expiresAt.getTime()).toBeGreaterThan(
      before + 6 * 24 * 3600 * 1000,
    );
  });

  it('create : refuse une expiration passée', async () => {
    await expect(
      service.create('p1', 'mj1', { expiresAt: past().toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preview : 404 si le token est inconnu', async () => {
    prisma.inviteLink.findUnique.mockResolvedValue(null);
    await expect(service.preview('xxx')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preview : valide si non révoqué/expiré et quota ok', async () => {
    prisma.inviteLink.findUnique.mockResolvedValue({
      revoked: false,
      expiresAt: future(),
      maxUses: null,
      usesCount: 0,
      partie: { name: 'La Nuit', gameSystemId: 'draconis' },
    });
    expect(await service.preview('tok')).toEqual({
      partieName: 'La Nuit',
      gameSystemId: 'draconis',
      valid: true,
      reason: undefined,
    });
  });

  it('preview : invalide si expiré', async () => {
    prisma.inviteLink.findUnique.mockResolvedValue({
      revoked: false,
      expiresAt: past(),
      maxUses: null,
      usesCount: 0,
      partie: { name: 'La Nuit', gameSystemId: 'draconis' },
    });
    const res = await service.preview('tok');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('expiré');
  });

  // --- consumeLink (cœur du join + register) ---

  const makeTx = (
    link: unknown,
    existingMember: unknown = null,
    claimCount = 1,
  ) => ({
    inviteLink: {
      findUnique: jest.fn().mockResolvedValue(link),
      updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
    },
    membership: {
      findUnique: jest.fn().mockResolvedValue(existingMember),
      create: jest.fn().mockResolvedValue({}),
    },
  });

  it('consumeLink : 404 si lien inconnu', async () => {
    const tx = makeTx(null);
    await expect(
      service.consumeLink(tx as never, 'tok', 'u'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('consumeLink : 403 si révoqué', async () => {
    const tx = makeTx({
      id: 'l1',
      revoked: true,
      expiresAt: future(),
      maxUses: null,
      usesCount: 0,
      partieId: 'p1',
      partie: { mjId: 'mj1' },
    });
    await expect(
      service.consumeLink(tx as never, 'tok', 'u'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('consumeLink : 409 si l’utilisateur est le MJ', async () => {
    const tx = makeTx({
      id: 'l1',
      revoked: false,
      expiresAt: future(),
      maxUses: null,
      usesCount: 0,
      partieId: 'p1',
      partie: { mjId: 'mj1' },
    });
    await expect(
      service.consumeLink(tx as never, 'tok', 'mj1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('consumeLink : 409 si déjà membre', async () => {
    const tx = makeTx(
      {
        id: 'l1',
        revoked: false,
        expiresAt: future(),
        maxUses: null,
        usesCount: 0,
        partieId: 'p1',
        partie: { mjId: 'mj1' },
      },
      { userId: 'u', partieId: 'p1' },
    );
    await expect(
      service.consumeLink(tx as never, 'tok', 'u'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('consumeLink : 403 si le quota est épuisé (claim atomique = 0)', async () => {
    const tx = makeTx(
      {
        id: 'l1',
        revoked: false,
        expiresAt: future(),
        maxUses: 1,
        usesCount: 1,
        partieId: 'p1',
        partie: { mjId: 'mj1' },
      },
      null,
      0,
    );
    await expect(
      service.consumeLink(tx as never, 'tok', 'u'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('consumeLink : crée le membership et incrémente quand tout est ok', async () => {
    const link = {
      id: 'l1',
      revoked: false,
      expiresAt: future(),
      maxUses: null,
      usesCount: 0,
      partieId: 'p1',
      partie: { mjId: 'mj1' },
    };
    const tx = makeTx(link);
    const res = await service.consumeLink(tx as never, 'tok', 'u');
    expect(tx.inviteLink.updateMany).toHaveBeenCalled();
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: { userId: 'u', partieId: 'p1' },
    });
    expect(res).toBe(link);
  });
});
