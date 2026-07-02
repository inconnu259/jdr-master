import {
  BadRequestException,
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

  /** Retourne MJ + membres (dédoublonnés) avec leur pseudo. */
  private async resolveParticipants(partieId: string, mjId: string) {
    const [mjUser, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: mjId },
        select: { id: true, pseudo: true },
      }),
      this.prisma.membership.findMany({
        where: { partieId },
        include: { user: { select: { id: true, pseudo: true } } },
      }),
    ]);

    const seen = new Set<string>();
    const participants: { userId: string; pseudo: string }[] = [];

    if (mjUser) {
      seen.add(mjUser.id);
      participants.push({ userId: mjUser.id, pseudo: mjUser.pseudo });
    }
    for (const m of memberships) {
      if (!seen.has(m.user.id)) {
        seen.add(m.user.id);
        participants.push({ userId: m.user.id, pseudo: m.user.pseudo });
      }
    }
    return { participants, memberships };
  }

  async getAvailableSlots(
    partieId: string,
    userId: string,
    weeks: number,
    from?: string,
    to?: string,
  ): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
    });
    if (!partie) throw new NotFoundException('Partie introuvable');

    const { participants, memberships } = await this.resolveParticipants(
      partieId,
      partie.mjId,
    );

    const isMj = partie.mjId === userId;
    const isMember = memberships.some((m) => m.userId === userId);
    if (!isMj && !isMember) throw new ForbiddenException();

    const participantIds = participants.map((p) => p.userId);
    const declarationsMap =
      await this.availability.getActiveDeclarations(participantIds);

    if (!!from !== !!to) {
      throw new BadRequestException(
        'from and to must both be provided together',
      );
    }

    const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
    const all: AvailableSlotDto[] = [];

    if (from && to) {
      const fromMs = new Date(from + 'T00:00:00Z').getTime();
      const toMs = new Date(to + 'T00:00:00Z').getTime();
      if (fromMs > toMs)
        throw new BadRequestException('from must be before or equal to to');
      if (toMs - fromMs > 366 * 86_400_000)
        throw new BadRequestException('Date range cannot exceed 366 days');
      for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
        const dateUtc = new Date(ms);
        for (const slot of SLOTS) {
          const members = participants.map((p) => ({
            userId: p.userId,
            pseudo: p.pseudo,
            status: this.availability.computeSlotStatus(
              declarationsMap.get(p.userId) ?? [],
              dateUtc,
              slot,
            ),
          }));
          all.push({
            date: dateUtc.toISOString().substring(0, 10),
            slot,
            members,
          });
        }
      }
    } else {
      const now = new Date();
      const todayUtcMidnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      for (let d = 0; d < weeks * 7; d++) {
        const dateUtc = new Date(todayUtcMidnight + d * 86_400_000);
        for (const slot of SLOTS) {
          const members = participants.map((p) => ({
            userId: p.userId,
            pseudo: p.pseudo,
            status: this.availability.computeSlotStatus(
              declarationsMap.get(p.userId) ?? [],
              dateUtc,
              slot,
            ),
          }));
          all.push({
            date: dateUtc.toISOString().substring(0, 10),
            slot,
            members,
          });
        }
      }
    }

    // Q1: hard-exclude tout créneau où le MJ est UNAVAILABLE (prérequis organisateur)
    const mjId = partie.mjId;
    const filtered = all.filter((s) => {
      const mj = s.members.find((m) => m.userId === mjId);
      return mj?.status !== 'UNAVAILABLE';
    });

    // Priorité : 0=tous dispos, 1=mixte sans refus, 2=tous inconnus, 3=au moins un refus
    const priority = (s: AvailableSlotDto): number => {
      const hasUnavail = s.members.some((m) => m.status === 'UNAVAILABLE');
      const availCount = s.members.filter(
        (m) => m.status === 'AVAILABLE',
      ).length;
      if (hasUnavail) return 3;
      if (availCount === s.members.length) return 0;
      if (availCount > 0) return 1;
      return 2;
    };

    const slotIdx = (s: AvailableSlotDto) =>
      SLOTS.indexOf(s.slot as (typeof SLOTS)[number]);

    const sorted = [...filtered].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (pa === 1) {
        const ca = a.members.filter((m) => m.status === 'AVAILABLE').length;
        const cb = b.members.filter((m) => m.status === 'AVAILABLE').length;
        if (ca !== cb) return cb - ca;
      }
      const dateCmp = a.date.localeCompare(b.date);
      return dateCmp !== 0 ? dateCmp : slotIdx(a) - slotIdx(b);
    });

    const limited = sorted.slice(0, 20);

    if (isMj) return limited;

    return limited.map(({ date, slot, members }) => ({
      date,
      slot,
      available: members.filter((m) => m.status === 'AVAILABLE').length,
      unavailable: members.filter((m) => m.status === 'UNAVAILABLE').length,
      unknown: members.filter((m) => m.status === 'UNKNOWN').length,
      total: members.length,
    }));
  }

  async getHeatmap(
    partieId: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<AggregatedSlotDto[]> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
    });
    if (!partie) throw new NotFoundException('Partie introuvable');

    const { participants, memberships } = await this.resolveParticipants(
      partieId,
      partie.mjId,
    );

    const isMj = partie.mjId === userId;
    const isMember = memberships.some((m) => m.userId === userId);
    if (!isMj && !isMember) throw new ForbiddenException();

    const participantIds = participants.map((p) => p.userId);
    const declarationsMap =
      await this.availability.getActiveDeclarations(participantIds);

    const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
    const fromMs = new Date(from + 'T00:00:00Z').getTime();
    const toMs = new Date(to + 'T00:00:00Z').getTime();
    if (fromMs > toMs)
      throw new BadRequestException('from must be before or equal to to');
    if (toMs - fromMs > 45 * 86_400_000)
      throw new BadRequestException('Date range must not exceed 45 days');
    const results: AggregatedSlotDto[] = [];

    for (let ms = fromMs; ms <= toMs; ms += 86_400_000) {
      const dateUtc = new Date(ms);
      const dateStr = dateUtc.toISOString().substring(0, 10);
      for (const slot of SLOTS) {
        const statuses = participants.map((p) =>
          this.availability.computeSlotStatus(
            declarationsMap.get(p.userId) ?? [],
            dateUtc,
            slot,
          ),
        );
        results.push({
          date: dateStr,
          slot,
          available: statuses.filter((s) => s === 'AVAILABLE').length,
          unavailable: statuses.filter((s) => s === 'UNAVAILABLE').length,
          unknown: statuses.filter((s) => s === 'UNKNOWN').length,
          total: participants.length,
        });
      }
    }

    return results;
  }
}
