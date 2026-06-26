import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
