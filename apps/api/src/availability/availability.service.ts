import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DaySlot, SlotStatus } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

/** Forme minimale d'une déclaration suffisante pour computeSlotStatus (pas de dépendance à @prisma/client). */
export interface DeclarationLike {
  kind: 'UNAVAILABLE' | 'AVAILABLE';
  recurKind: 'RECURRING' | 'PUNCTUAL';
  dayOfWeek: number | null;
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY';
  startDate: Date | null;
  endDate: Date | null;
  expiresAt: Date;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  create(userId: string, dto: CreateAvailabilityDto) {
    if (new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException('expiresAt doit être une date dans le futur');
    }
    return this.prisma.availabilityDeclaration.create({
      data: {
        userId,
        kind: dto.kind,
        recurKind: dto.recurKind,
        dayOfWeek: dto.dayOfWeek ?? null,
        slot: dto.slot,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        expiresAt: new Date(dto.expiresAt),
      },
    });
  }

  /** Déclarations actives de l'utilisateur (expiresAt > now). */
  findActive(userId: string) {
    return this.prisma.availabilityDeclaration.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateAvailabilityDto) {
    const decl = await this.prisma.availabilityDeclaration.findUnique({ where: { id } });
    if (!decl) throw new NotFoundException('Déclaration introuvable');
    if (decl.userId !== userId) throw new ForbiddenException();
    // updateMany avec { id, userId } rend le write atomique (élimine la race TOCTOU)
    await this.prisma.availabilityDeclaration.updateMany({
      where: { id, userId },
      data: {
        ...(dto.kind && { kind: dto.kind }),
        ...(dto.recurKind && { recurKind: dto.recurKind }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.slot && { slot: dto.slot }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
      },
    });
    return this.prisma.availabilityDeclaration.findUnique({ where: { id } });
  }

  /** Soft-archive : ramène expiresAt à maintenant (filtrée hors des actives). */
  async softDelete(id: string, userId: string) {
    const decl = await this.prisma.availabilityDeclaration.findUnique({ where: { id } });
    if (!decl) throw new NotFoundException('Déclaration introuvable');
    if (decl.userId !== userId) throw new ForbiddenException();
    // updateMany avec { id, userId } rend le soft-delete atomique
    await this.prisma.availabilityDeclaration.updateMany({
      where: { id, userId },
      data: { expiresAt: new Date() },
    });
  }

  // ─── Calcul de disponibilité (utilisé par PartiesService) ──────────────────

  /**
   * Charge toutes les déclarations actives pour un ensemble d'utilisateurs
   * en une seule requête SQL (pas de N+1).
   */
  async getActiveDeclarations(userIds: string[]): Promise<Map<string, DeclarationLike[]>> {
    if (userIds.length === 0) return new Map();
    const decls = await this.prisma.availabilityDeclaration.findMany({
      where: { userId: { in: userIds }, expiresAt: { gt: new Date() } },
    });
    const map = new Map<string, DeclarationLike[]>();
    for (const userId of userIds) map.set(userId, []);
    for (const d of decls) {
      map.get(d.userId)?.push(d);
    }
    return map;
  }

  /**
   * Calcule le statut d'un créneau (date + slot) pour un utilisateur,
   * à partir de ses déclarations pré-chargées (pas de requête SQL ici).
   *
   * Priorité : UNAVAILABLE > AVAILABLE explicite > inférence positive (période couverte) > UNKNOWN
   */
  computeSlotStatus(
    declarations: DeclarationLike[],
    date: Date,
    slot: DaySlot,
    now: Date = new Date(),
  ): SlotStatus {
    const active = declarations.filter((d) => d.expiresAt > now);

    if (active.some((d) => d.kind === 'UNAVAILABLE' && this.matchesDeclaration(d, date, slot))) {
      return 'UNAVAILABLE';
    }
    if (active.some((d) => d.kind === 'AVAILABLE' && this.matchesDeclaration(d, date, slot))) {
      return 'AVAILABLE';
    }
    if (this.isInCoveredPeriod(active, date, now)) {
      return 'AVAILABLE';
    }
    return 'UNKNOWN';
  }

  // ─── Helpers privés ────────────────────────────────────────────────────────

  private matchesDeclaration(decl: DeclarationLike, date: Date, slot: DaySlot): boolean {
    if (!this.slotMatches(decl.slot, slot)) return false;
    if (decl.recurKind === 'RECURRING') {
      if (decl.dayOfWeek !== date.getUTCDay()) return false;
      // Borne inférieure : startDate = jour de la première occurrence déclarée
      if (decl.startDate && date < decl.startDate) return false;
      // Borne supérieure : expiresAt (la déclaration ne couvre pas les occurrences après expiration)
      return date <= decl.expiresAt;
    }
    // PUNCTUAL
    if (!decl.startDate || !decl.endDate) return false;
    const t = date.getTime();
    return t >= decl.startDate.getTime() && t <= decl.endDate.getTime();
  }

  /**
   * Une déclaration FULL_DAY couvre tous les slots.
   * Une déclaration sur un slot précis couvre uniquement ce slot.
   */
  private slotMatches(declSlot: DaySlot, querySlot: DaySlot): boolean {
    return declSlot === 'FULL_DAY' || declSlot === querySlot;
  }

  /**
   * L'union des plages temporelles des déclarations actives forme la "période couverte".
   * À l'intérieur → inférence AVAILABLE (FR3).
   * En dehors → UNKNOWN (FR4).
   */
  private isInCoveredPeriod(active: DeclarationLike[], date: Date, _now: Date): boolean {
    return active.some((d) => {
      if (d.recurKind === 'RECURRING') {
        // Couvre [startDate, expiresAt] — startDate = premier jour déclaré
        if (d.startDate && date < d.startDate) return false;
        return date <= d.expiresAt;
      }
      if (!d.startDate || !d.endDate) return false;
      return date >= d.startDate && date <= d.endDate;
    });
  }
}
