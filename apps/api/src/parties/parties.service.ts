import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AggregatedSlotDto, AvailableSlotDto } from '@master-jdr/shared';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartieDto } from './dto/create-partie.dto';
import { UpdatePartieDto } from './dto/update-partie.dto';

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

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
   * `mj` = les parties que je maîtrise ; `player` = celles où je suis membre (via `Membership`).
   */
  async listForUser(userId: string, role: 'mj' | 'player') {
    if (role === 'player') {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        orderBy: { joinedAt: 'desc' },
        include: { partie: true },
      });
      return memberships.map((m) => m.partie);
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

  /** Récupère une partie visible par l'utilisateur : MJ **ou** membre (sinon 404 / 403). */
  async getViewable(id: string, userId: string) {
    const partie = await this.prisma.partie.findUnique({ where: { id } });
    if (!partie) throw new NotFoundException('Partie introuvable');
    if (partie.mjId === userId) return partie;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_partieId: { userId, partieId: id } },
    });
    if (!membership) throw new ForbiddenException();
    return partie;
  }

  /** Liste des joueurs d'une partie (visible par le MJ ou un membre). */
  async listMembers(partieId: string, userId: string) {
    await this.getViewable(partieId, userId);
    const memberships = await this.prisma.membership.findMany({
      where: { partieId },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, pseudo: true, email: true } } },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      pseudo: m.user.pseudo,
      email: m.user.email,
      joinedAt: m.joinedAt,
    }));
  }

  /** Le MJ retire un joueur de SA partie. */
  async removeMember(partieId: string, userId: string, targetUserId: string) {
    await this.getOwned(partieId, userId);
    await this.prisma.membership.deleteMany({
      where: { partieId, userId: targetUserId },
    });
    return { ok: true };
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

  async getAvailableSlots(
    partieId: string,
    userId: string,
    weeks: number,
  ): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
    });
    if (!partie) throw new NotFoundException('Partie introuvable');

    const memberships = await this.prisma.membership.findMany({
      where: { partieId },
      include: { user: { select: { id: true, pseudo: true } } },
    });

    const isMj = partie.mjId === userId;
    const isMember = memberships.some((m) => m.userId === userId);
    if (!isMj && !isMember) throw new ForbiddenException();

    const memberIds = memberships.map((m) => m.userId);
    const declarationsMap =
      await this.availability.getActiveDeclarations(memberIds);

    const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
    const now = new Date();
    const todayUtcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const results: AvailableSlotDto[] = [];

    outer: for (let d = 0; d < weeks * 7; d++) {
      const dateUtc = new Date(todayUtcMidnight + d * 86_400_000);
      for (const slot of SLOTS) {
        const memberStatuses = memberships.map((m) => ({
          userId: m.user.id,
          pseudo: m.user.pseudo,
          status: this.availability.computeSlotStatus(
            declarationsMap.get(m.userId) ?? [],
            dateUtc,
            slot,
          ),
        }));

        if (memberStatuses.some((m) => m.status === 'UNAVAILABLE')) continue;

        results.push({
          date: dateUtc.toISOString().substring(0, 10),
          slot,
          members: memberStatuses,
        });
        if (results.length >= 5) break outer;
      }
    }

    if (isMj) return results;

    return results.map(({ date, slot, members }) => ({
      date,
      slot,
      available: members.filter((m) => m.status === 'AVAILABLE').length,
      unavailable: members.filter((m) => m.status === 'UNAVAILABLE').length,
      unknown: members.filter((m) => m.status === 'UNKNOWN').length,
      total: members.length,
    }));
  }
}
