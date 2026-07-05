import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('argon2');

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('findByEmailOrPseudo', () => {
    it('cherche par email OU pseudo en correspondance exacte (utilisé pour la connexion)', async () => {
      await service.findByEmailOrPseudo('alice');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ email: 'alice' }, { pseudo: 'alice' }] },
      });
    });

    it('retourne le premier utilisateur trouvé (email ou pseudo)', async () => {
      const user = { id: 'u1', email: 'a@b.c', pseudo: 'alice' };
      prisma.user.findFirst.mockResolvedValue(user);
      await expect(service.findByEmailOrPseudo('a@b.c')).resolves.toEqual(user);
    });
  });

  describe('searchByEmailOrPseudo', () => {
    it('cherche par email OU pseudo sans jamais sélectionner le hash de mot de passe', async () => {
      await service.searchByEmailOrPseudo('bob');
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { OR: [{ email: 'bob' }, { pseudo: 'bob' }] },
        select: { id: true, pseudo: true, email: true },
      });
    });
  });

  describe('create', () => {
    it('hash le mot de passe (argon2) avant de créer le compte — jamais en clair', async () => {
      (argon2.hash as jest.Mock).mockResolvedValue('HASHED');

      await service.create({
        email: 'a@b.c',
        pseudo: 'alice',
        password: 'plain-text',
      });

      expect(argon2.hash).toHaveBeenCalledWith('plain-text');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'a@b.c', pseudo: 'alice', passwordHash: 'HASHED' },
      });
    });
  });
});
