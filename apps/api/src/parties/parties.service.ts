import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartieDto } from './dto/create-partie.dto';
import { UpdatePartieDto } from './dto/update-partie.dto';

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(mjId: string, dto: CreatePartieDto) {
    return this.prisma.partie.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        gameSystemId: dto.gameSystemId,
        description: dto.description ?? null,
        mjId,
      },
    });
  }

  /**
   * 1b : `mj` = les parties que je maîtrise ; `player` = mes participations.
   * Les participations (Membership) arrivent en 1c → liste vide pour l'instant.
   */
  listForUser(userId: string, role: 'mj' | 'player') {
    if (role === 'player') {
      return Promise.resolve([]);
    }
    return this.prisma.partie.findMany({
      where: { mjId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Récupère une partie en vérifiant que l'utilisateur en est le MJ (sinon 404 / 403). */
  async getOwned(id: string, userId: string) {
    const partie = await this.prisma.partie.findUnique({ where: { id } });
    if (!partie) throw new NotFoundException('Partie introuvable');
    if (partie.mjId !== userId) throw new ForbiddenException();
    return partie;
  }

  async update(id: string, userId: string, dto: UpdatePartieDto) {
    await this.getOwned(id, userId);
    return this.prisma.partie.update({ where: { id }, data: { ...dto } });
  }

  async remove(id: string, userId: string) {
    await this.getOwned(id, userId);
    await this.prisma.partie.delete({ where: { id } });
    return { ok: true };
  }
}
