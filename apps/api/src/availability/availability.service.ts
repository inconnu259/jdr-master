import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AvailKind,
  ConflictInfo,
  DaySlot,
  SlotStatus,
} from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';

export interface SplitOccurrenceModifyDto {
  kind: AvailKind;
  slot: DaySlot;
}

export interface SplitResult {
  created: object[];
  deleted: string[];
}

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

  async create(
    userId: string,
    dto: CreateAvailabilityDto,
  ): Promise<{ created: object[] }> {
    if (new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException(
        'expiresAt doit être une date dans le futur',
      );
    }

    const conflicts = await this.findConflictsForCreate(
      userId,
      dto,
      dto.replacingId,
    );

    if (conflicts.length > 0 && !dto.conflictResolution) {
      throw new ConflictException({
        conflicts: conflicts.map((c) => this.toConflictInfo(c)),
      });
    }

    if (dto.conflictResolution === 'overwrite' && conflicts.length > 0) {
      await this.prisma.availabilityDeclaration.updateMany({
        where: { id: { in: conflicts.map((c) => c.id) }, userId },
        data: { expiresAt: new Date() },
      });
    }

    if (dto.conflictResolution === 'keep' && conflicts.length > 0) {
      const created = await this.createWithHoles(userId, dto, conflicts);
      return { created };
    }

    return { created: [await this.doCreate(userId, dto)] };
  }

  private doCreate(userId: string, dto: CreateAvailabilityDto) {
    return this.prisma.availabilityDeclaration.create({
      data: {
        userId,
        kind: dto.kind,
        recurKind: dto.recurKind,
        dayOfWeek: dto.dayOfWeek ?? null,
        slot: dto.slot,
        startDate: dto.startDate
          ? new Date(dto.startDate + 'T00:00:00Z')
          : null,
        endDate: dto.endDate ? new Date(dto.endDate + 'T00:00:00Z') : null,
        expiresAt: new Date(dto.expiresAt),
      },
    });
  }

  /** Trouve les déclarations actives dont le kind, le slot et la plage de dates
   *  entrent en conflit avec le DTO de création (kind opposé + slot + dates chevauchants). */
  async findConflictsForCreate(
    userId: string,
    dto: CreateAvailabilityDto,
    excludeId?: string,
  ) {
    const now = new Date();
    const active = await this.prisma.availabilityDeclaration.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    return active.filter((existing) => {
      if (existing.kind === dto.kind) return false;
      if (!this.slotsConflict(existing.slot, dto.slot)) return false;
      return this.dateRangesConflict(existing, dto);
    });
  }

  /** Crée la déclaration en faisant des "trous" autour des conflits existants.
   *  Pour RECURRING : découpe en pièces entre les conflits.
   *  Pour PUNCTUAL : idem, avec un pas de 1 jour. */
  private async createWithHoles(
    userId: string,
    dto: CreateAvailabilityDto,
    conflicts: Awaited<
      ReturnType<typeof this.prisma.availabilityDeclaration.findMany>
    >,
  ): Promise<object[]> {
    const MS_1D = 24 * 60 * 60 * 1000;
    const MS_7D = 7 * MS_1D;

    if (dto.recurKind === 'RECURRING') {
      // Construit les plages exclues : [start, end] pour chaque conflit.
      // Pour RECURRING sans endDate : expiresAt borne la série (pas startDate → évite intervalle zéro-largeur).
      const excluded: Array<{ start: Date; end: Date }> = conflicts.map(
        (c) => ({
          start: c.startDate ?? new Date(0),
          end: c.endDate ?? c.expiresAt,
        }),
      );
      excluded.sort((a, b) => a.start.getTime() - b.start.getTime());

      const dtoStart = dto.startDate
        ? new Date(dto.startDate + 'T00:00:00Z')
        : null;
      const dtoExpires = new Date(dto.expiresAt);
      const pieces: Array<{ startDate: Date | null; endDate: Date | null }> =
        [];
      let currentStart = dtoStart;

      for (const { start: excStart, end: excEnd } of excluded) {
        const pieceEnd = new Date(excStart.getTime() - MS_7D);
        if (!currentStart || currentStart <= pieceEnd) {
          pieces.push({ startDate: currentStart, endDate: pieceEnd });
        }
        currentStart = new Date(excEnd.getTime() + MS_7D);
      }
      if (!currentStart || currentStart <= dtoExpires) {
        pieces.push({ startDate: currentStart, endDate: null });
      }

      return this.prisma.$transaction(async (tx) => {
        const results: object[] = [];
        for (const piece of pieces) {
          results.push(
            await tx.availabilityDeclaration.create({
              data: {
                userId,
                kind: dto.kind,
                recurKind: 'RECURRING' as const,
                dayOfWeek: dto.dayOfWeek!,
                slot: dto.slot,
                startDate: piece.startDate,
                endDate: piece.endDate,
                expiresAt: dtoExpires,
              },
            }),
          );
        }
        return results;
      });
    }

    // PUNCTUAL : collecte tous les jours "trous" dans [dto.startDate, dto.endDate]
    const dtoStart = new Date(dto.startDate! + 'T00:00:00Z');
    const dtoEnd = new Date(dto.endDate! + 'T00:00:00Z');
    const holeDates: Date[] = [];

    for (const c of conflicts) {
      if (c.recurKind === 'PUNCTUAL') {
        const cStart = c.startDate ?? c.expiresAt;
        const cEnd = c.endDate ?? cStart;
        let d = new Date(Math.max(cStart.getTime(), dtoStart.getTime()));
        const endD = new Date(Math.min(cEnd.getTime(), dtoEnd.getTime()));
        while (d <= endD) {
          holeDates.push(new Date(d));
          d = new Date(d.getTime() + MS_1D);
        }
      } else if (c.recurKind === 'RECURRING' && c.dayOfWeek !== null) {
        const cEffEnd = c.endDate ?? c.expiresAt;
        const overlapStart = new Date(
          Math.max(dtoStart.getTime(), (c.startDate ?? dtoStart).getTime()),
        );
        const overlapEnd = new Date(
          Math.min(dtoEnd.getTime(), cEffEnd.getTime()),
        );
        if (overlapStart > overlapEnd) continue;
        const daysUntil = (c.dayOfWeek - overlapStart.getUTCDay() + 7) % 7;
        let occ = new Date(overlapStart.getTime() + daysUntil * MS_1D);
        while (occ <= overlapEnd) {
          holeDates.push(new Date(occ));
          occ = new Date(occ.getTime() + MS_7D);
        }
      }
    }

    holeDates.sort((a, b) => a.getTime() - b.getTime());
    const unique = holeDates.filter(
      (d, i) => i === 0 || d.getTime() !== holeDates[i - 1].getTime(),
    );
    const pieces2: Array<{ startDate: Date; endDate: Date }> = [];
    let cur = dtoStart;

    for (const hole of unique) {
      const pieceEnd = new Date(hole.getTime() - MS_1D);
      if (cur <= pieceEnd)
        pieces2.push({ startDate: new Date(cur), endDate: pieceEnd });
      cur = new Date(hole.getTime() + MS_1D);
    }
    if (cur <= dtoEnd) pieces2.push({ startDate: cur, endDate: dtoEnd });

    return this.prisma.$transaction(async (tx) => {
      const results: object[] = [];
      for (const p of pieces2) {
        results.push(
          await tx.availabilityDeclaration.create({
            data: {
              userId,
              kind: dto.kind,
              recurKind: 'PUNCTUAL' as const,
              dayOfWeek: null,
              slot: dto.slot,
              startDate: p.startDate,
              endDate: p.endDate,
              expiresAt: new Date(p.endDate.getTime() + 86_399_999),
            },
          }),
        );
      }
      return results;
    });
  }

  private toConflictInfo(d: {
    id: string;
    kind: string;
    slot: string;
    recurKind: string;
    startDate: Date | null;
    endDate: Date | null;
    dayOfWeek: number | null;
  }): ConflictInfo {
    return {
      id: d.id,
      kind: d.kind as AvailKind,
      slot: d.slot as DaySlot,
      recurKind: d.recurKind as 'RECURRING' | 'PUNCTUAL',
      startDate: d.startDate?.toISOString().substring(0, 10) ?? null,
      endDate: d.endDate?.toISOString().substring(0, 10) ?? null,
      dayOfWeek: d.dayOfWeek,
    };
  }

  private slotsConflict(s1: DaySlot, s2: DaySlot | string): boolean {
    return s1 === 'FULL_DAY' || s2 === 'FULL_DAY' || s1 === s2;
  }

  private hasWeekdayInRange(start: Date, end: Date, weekday: number): boolean {
    const daysUntil = (weekday - start.getUTCDay() + 7) % 7;
    return new Date(start.getTime() + daysUntil * 24 * 60 * 60 * 1000) <= end;
  }

  private dateRangesConflict(
    existing: {
      recurKind: string;
      dayOfWeek: number | null;
      startDate: Date | null;
      endDate: Date | null;
      expiresAt: Date;
    },
    dto: CreateAvailabilityDto,
  ): boolean {
    const MS_1D = 24 * 60 * 60 * 1000;
    const dtoIsRecurring = dto.recurKind === 'RECURRING';
    const existingIsRecurring = existing.recurKind === 'RECURRING';

    if (dtoIsRecurring && existingIsRecurring) {
      if (existing.dayOfWeek !== (dto.dayOfWeek ?? null)) return false;
      const existingEffEnd = existing.endDate ?? existing.expiresAt;
      const dtoStart = dto.startDate
        ? new Date(dto.startDate + 'T00:00:00Z')
        : new Date(0);
      const dtoEnd = new Date(dto.expiresAt);
      const existingStart = existing.startDate ?? new Date(0);
      return existingStart <= dtoEnd && existingEffEnd >= dtoStart;
    }

    if (dtoIsRecurring && !existingIsRecurring) {
      // Nouveau RECURRING vs PUNCTUAL existant
      const existingStart = existing.startDate ?? existing.expiresAt;
      const existingEnd =
        existing.endDate ?? existing.startDate ?? existing.expiresAt;
      const dtoStart = dto.startDate
        ? new Date(dto.startDate + 'T00:00:00Z')
        : new Date(0);
      const dtoEnd = new Date(dto.expiresAt);
      const overlapStart = existingStart > dtoStart ? existingStart : dtoStart;
      const overlapEnd = existingEnd < dtoEnd ? existingEnd : dtoEnd;
      if (overlapStart > overlapEnd) return false;
      return this.hasWeekdayInRange(overlapStart, overlapEnd, dto.dayOfWeek!);
    }

    if (!dtoIsRecurring && existingIsRecurring) {
      // Nouveau PUNCTUAL vs RECURRING existant
      if (!dto.startDate || !dto.endDate) return false;
      const existingEffEnd = existing.endDate ?? existing.expiresAt;
      const existingStart = existing.startDate ?? new Date(0);
      const dtoStart = new Date(dto.startDate + 'T00:00:00Z');
      const dtoEnd = new Date(dto.endDate + 'T00:00:00Z');
      const overlapStart = existingStart > dtoStart ? existingStart : dtoStart;
      const overlapEnd = existingEffEnd < dtoEnd ? existingEffEnd : dtoEnd;
      if (overlapStart > overlapEnd) return false;
      return this.hasWeekdayInRange(
        overlapStart,
        overlapEnd,
        existing.dayOfWeek!,
      );
    }

    // PUNCTUAL vs PUNCTUAL
    if (
      !existing.startDate ||
      !existing.endDate ||
      !dto.startDate ||
      !dto.endDate
    )
      return false;
    const s2 = new Date(dto.startDate + 'T00:00:00Z');
    const e2 = new Date(dto.endDate + 'T00:00:00Z');
    return existing.startDate <= e2 && existing.endDate >= s2;
  }

  /** Déclarations actives de l'utilisateur (expiresAt > now). */
  findActive(userId: string) {
    return this.prisma.availabilityDeclaration.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateAvailabilityDto) {
    const decl = await this.prisma.availabilityDeclaration.findUnique({
      where: { id },
    });
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
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
        ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
      },
    });
    return this.prisma.availabilityDeclaration.findUnique({ where: { id } });
  }

  /** Soft-archive : ramène expiresAt à maintenant (filtrée hors des actives). */
  async softDelete(id: string, userId: string) {
    const decl = await this.prisma.availabilityDeclaration.findUnique({
      where: { id },
    });
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
  async getActiveDeclarations(
    userIds: string[],
  ): Promise<Map<string, DeclarationLike[]>> {
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

    if (
      active.some(
        (d) =>
          d.kind === 'UNAVAILABLE' && this.matchesDeclaration(d, date, slot),
      )
    ) {
      return 'UNAVAILABLE';
    }
    if (
      active.some(
        (d) => d.kind === 'AVAILABLE' && this.matchesDeclaration(d, date, slot),
      )
    ) {
      return 'AVAILABLE';
    }
    if (this.isInCoveredPeriod(active, date, now)) {
      return 'AVAILABLE';
    }
    return 'UNKNOWN';
  }

  // ─── Modèle SPLIT : modifier / supprimer une occurrence d'une récurrente ──

  /**
   * Scinde une déclaration RECURRING en extrayant une occurrence unique (D).
   *
   * Produit R1 (avant D), Rmod (occurrence modifiée/annulée sur D), R2 (après D)
   * selon les cas limites (bord gauche/droit, occurrence unique).
   * Toutes les opérations sont atomiques (transaction Prisma).
   *
   * @param occurrence  Date ISO YYYY-MM-DD de l'occurrence ciblée
   * @param action      'modify' → Rmod avec dto ; 'delete' → Rmod avec kind opposé
   * @param dto         Requis si action = 'modify' : kind + slot du nouvel état
   */
  async splitOccurrence(
    id: string,
    userId: string,
    occurrence: string,
    action: 'modify' | 'delete',
    dto?: SplitOccurrenceModifyDto,
  ): Promise<SplitResult> {
    const decl = await this.prisma.availabilityDeclaration.findUnique({
      where: { id },
    });
    if (!decl) throw new NotFoundException('Déclaration introuvable');
    if (decl.userId !== userId) throw new ForbiddenException();
    if (decl.recurKind !== 'RECURRING') {
      throw new BadRequestException("La déclaration n'est pas récurrente");
    }
    if (action === 'modify' && !dto) {
      throw new BadRequestException("dto est requis pour l'action modify");
    }

    const utcD = new Date(occurrence + 'T00:00:00Z');
    if (isNaN(utcD.getTime()))
      throw new BadRequestException("Date d'occurrence invalide");
    if (utcD.getUTCDay() !== decl.dayOfWeek) {
      throw new BadRequestException(
        "La date d'occurrence ne correspond pas au jour de la semaine de la déclaration",
      );
    }
    if (decl.startDate && utcD < decl.startDate) {
      throw new BadRequestException(
        "La date d'occurrence est antérieure au début de la déclaration",
      );
    }
    // Borne effective : endDate (si positionné par un SPLIT précédent) ou expiresAt
    const effectiveEnd = decl.endDate ?? decl.expiresAt;
    if (utcD > effectiveEnd) {
      throw new BadRequestException(
        "La date d'occurrence est postérieure à la fin de la déclaration",
      );
    }

    const MS_7D = 7 * 24 * 60 * 60 * 1000;
    const dMinus7 = new Date(utcD.getTime() - MS_7D);
    const dPlus7 = new Date(utcD.getTime() + MS_7D);

    const isLeftEdge =
      !decl.startDate || decl.startDate.getTime() === utcD.getTime();
    const isRightEdge = dPlus7 > effectiveEnd;

    // Rmod : PUNCTUAL, toujours sur [D, D], expire en fin de journée D
    const rmodExpiresAt = new Date(utcD.getTime() + 86_399_999); // 23:59:59.999 UTC
    const rmodData = {
      userId,
      kind:
        action === 'delete'
          ? decl.kind === 'UNAVAILABLE'
            ? 'AVAILABLE'
            : 'UNAVAILABLE'
          : dto!.kind,
      recurKind: 'PUNCTUAL' as const,
      dayOfWeek: null,
      slot: action === 'delete' ? decl.slot : dto!.slot,
      startDate: utcD,
      endDate: utcD,
      expiresAt: rmodExpiresAt,
    };

    // R1 : partie avant D (absent si left-edge)
    const r1Data = !isLeftEdge
      ? {
          userId,
          kind: decl.kind,
          recurKind: 'RECURRING' as const,
          dayOfWeek: decl.dayOfWeek,
          slot: decl.slot,
          startDate: decl.startDate,
          endDate: dMinus7,
          expiresAt: decl.expiresAt,
        }
      : null;

    // R2 : partie après D (absent si right-edge)
    const r2Data = !isRightEdge
      ? {
          userId,
          kind: decl.kind,
          recurKind: 'RECURRING' as const,
          dayOfWeek: decl.dayOfWeek,
          slot: decl.slot,
          startDate: dPlus7,
          endDate: decl.endDate, // hérite la borne de fin de l'original (null ou valeur d'un SPLIT antérieur)
          expiresAt: decl.expiresAt,
        }
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const results: object[] = [];
      if (r1Data)
        results.push(await tx.availabilityDeclaration.create({ data: r1Data }));
      results.push(await tx.availabilityDeclaration.create({ data: rmodData }));
      if (r2Data)
        results.push(await tx.availabilityDeclaration.create({ data: r2Data }));
      // Soft-delete l'original (updateMany pour atomicité TOCTOU, même pattern que softDelete)
      await tx.availabilityDeclaration.update({
        where: { id },
        data: { expiresAt: new Date() },
      });
      return results;
    });

    return { created, deleted: [id] };
  }

  // ─── Helpers privés ────────────────────────────────────────────────────────

  private matchesDeclaration(
    decl: DeclarationLike,
    date: Date,
    slot: DaySlot,
  ): boolean {
    if (!this.slotMatches(decl.slot, slot)) return false;
    if (decl.recurKind === 'RECURRING') {
      if (decl.dayOfWeek !== date.getUTCDay()) return false;
      // Borne inférieure : startDate = jour de la première occurrence déclarée
      if (decl.startDate && date < decl.startDate) return false;
      // Borne de série (set par le modèle SPLIT) : endDate tronque la série avant expiresAt
      if (decl.endDate && date > decl.endDate) return false;
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
  private isInCoveredPeriod(
    active: DeclarationLike[],
    date: Date,
    _now: Date,
  ): boolean {
    return active.some((d) => {
      if (d.recurKind === 'RECURRING') {
        // Couvre [startDate, min(endDate, expiresAt)] — startDate = premier jour déclaré
        if (d.startDate && date < d.startDate) return false;
        if (d.endDate && date > d.endDate) return false;
        return date <= d.expiresAt;
      }
      if (!d.startDate || !d.endDate) return false;
      return date >= d.startDate && date <= d.endDate;
    });
  }
}
