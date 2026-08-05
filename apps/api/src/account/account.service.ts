import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updateDisplayName(userId: string, displayName: string) {
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { displayName },
      });
    } catch (e) {
      // Session référant un compte supprimé entre-temps (cas normalement impossible en usage
      // courant) — jamais un 500 brut, même pattern que resolveScenarioOrThrow().
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Compte introuvable');
      }
      throw e;
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
