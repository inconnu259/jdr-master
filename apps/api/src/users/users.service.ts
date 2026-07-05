import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Connexion par **email OU pseudo** (au choix de l'utilisateur, cf. Story login). */
  findByEmailOrPseudo(identifier: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { pseudo: identifier }] },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Recherche par **email OU pseudo** en correspondance **exacte** (spec §4).
   * Ne renvoie jamais le hash : juste de quoi inviter (id, pseudo, email).
   */
  searchByEmailOrPseudo(q: string) {
    return this.prisma.user.findMany({
      where: { OR: [{ email: q }, { pseudo: q }] },
      select: { id: true, pseudo: true, email: true },
    });
  }

  async create(data: { email: string; pseudo: string; password: string }) {
    const passwordHash = await argon2.hash(data.password);
    return this.prisma.user.create({
      data: { email: data.email, pseudo: data.pseudo, passwordHash },
    });
  }
}
