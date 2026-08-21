import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AvailabilityDeclarationDto,
  AvailKind,
  ConflictInfo,
  CreateAvailabilityBatchItem,
  DaySlot,
  MeCalendarDto,
  MyCalendarOpenInscriptionEntry,
  MyCalendarPollEntry,
  MyCalendarSeanceEntry,
  RecurKind,
  SlotStatus,
  VoteAnswer,
} from '@master-jdr/shared';
import { participantCount } from '../parties/participant-count.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  RealtimeEventsService,
  partieTopic,
} from '../realtime/realtime-events.service';
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

/** Ligne persistée retenue comme conflit : forme minimale suffisante pour la découpe et pour
 *  toConflictInfo(), sans dépendance à @prisma/client (Story 36.4). */
export interface ConflictRow extends DeclarationLike {
  id: string;
}

/** `data` d'une création de déclaration, calculée mais pas encore écrite — ce que rend
 *  buildHolePieces() pour que l'appelant l'écrive dans la transaction de son choix. */
export interface AvailabilityCreateData {
  userId: string;
  kind: AvailKind;
  recurKind: RecurKind;
  dayOfWeek: number | null;
  slot: DaySlot;
  startDate: Date | null;
  endDate: Date | null;
  expiresAt: Date;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  // ─── Temps réel ─────────────────────────────────────────────────────────────

  /** AvailabilityDeclaration est scopé par userId uniquement (aucune relation Partie en base,
   *  cf. schema.prisma) — une déclaration modifiée peut affecter le calendrier de n'importe
   *  quelle Partie où l'utilisateur est MJ ou membre. On résout donc ces Parties une fois, après
   *  l'écriture, pour émettre un événement partie:{id} sur chacune (MJ.getHeatmap/getAvailableSlots
   *  agrège déjà les disponibilités de tous les participants d'une Partie). */
  private async affectedPartieIds(userId: string): Promise<string[]> {
    const [memberships, ownedParties] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId },
        select: { partieId: true },
      }),
      this.prisma.partie.findMany({
        where: { mjId: userId },
        select: { id: true },
      }),
    ]);
    return [
      ...new Set([
        ...memberships.map((m) => m.partieId),
        ...ownedParties.map((p) => p.id),
      ]),
    ];
  }

  private async emitForUser(userId: string): Promise<void> {
    const partieIds = await this.affectedPartieIds(userId);
    for (const id of partieIds) {
      this.realtimeEvents.emit(partieTopic(id));
    }
  }

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
      await this.emitForUser(userId);
      return { created };
    }

    const created = await this.doCreate(userId, dto);
    await this.emitForUser(userId);
    return { created: [created] };
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

    return active.filter((existing) => this.conflictPredicate(existing, dto));
  }

  /** Prédicat pur de conflit (kind opposé + slot + dates chevauchants), extrait pour
   *  être appliqué en mémoire à un jeu de déclarations lu une seule fois (Story 30.2,
   *  route groupée) sans dupliquer la logique de findConflictsForCreate (AC6). */
  private conflictPredicate(
    existing: {
      kind: AvailKind;
      slot: DaySlot;
      recurKind: RecurKind;
      dayOfWeek: number | null;
      startDate: Date | null;
      endDate: Date | null;
      expiresAt: Date;
    },
    dto: CreateAvailabilityDto,
  ): boolean {
    if (existing.kind === dto.kind) return false;
    if (!this.slotsConflict(existing.slot, dto.slot)) return false;
    return this.dateRangesConflict(existing, dto);
  }

  /** Représente un élément de lot sous la forme Date attendue par conflictPredicate/
   *  dateRangesConflict côté "existing" (les items de lot portent des dates en string). */
  private batchItemAsExisting(item: CreateAvailabilityBatchItem) {
    return {
      kind: item.kind,
      slot: item.slot,
      recurKind: item.recurKind,
      dayOfWeek: item.dayOfWeek ?? null,
      startDate: item.startDate
        ? new Date(item.startDate + 'T00:00:00Z')
        : null,
      endDate: item.endDate ? new Date(item.endDate + 'T00:00:00Z') : null,
      expiresAt: new Date(item.expiresAt),
    };
  }

  /** Un item de lot n'a pas d'id persisté ; on synthétise un id unique par index pour
   *  qu'un client qui indexerait/dédoublonnerait par `id` ne fusionne pas deux entrées
   *  distinctes d'un même conflit interne (voir revue de code Story 30.2). */
  private batchItemToConflictInfo(
    item: CreateAvailabilityBatchItem,
    index: number,
  ): ConflictInfo {
    return {
      id: `batch-item-${index}`,
      kind: item.kind,
      slot: item.slot,
      recurKind: item.recurKind,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      dayOfWeek: item.dayOfWeek ?? null,
      internal: true,
    };
  }

  /** Cherche la première paire d'éléments du lot qui se contredisent entre eux (AC5).
   *  Aucune fonction existante ne les voit : le prédicat compare une création à des
   *  lignes persistées, pas à un autre élément du même lot. */
  private findInternalConflict(
    items: CreateAvailabilityBatchItem[],
  ): [number, number] | null {
    for (let i = 0; i < items.length; i++) {
      const existingShape = this.batchItemAsExisting(items[i]);
      for (let j = i + 1; j < items.length; j++) {
        if (this.conflictPredicate(existingShape, items[j])) {
          return [i, j];
        }
      }
    }
    return null;
  }

  /** Écriture groupée : une seule lecture des déclarations actives (AC7), conflits externes
   *  puis internes détectés avant toute écriture, puis une unique $transaction pour toutes
   *  les écritures (AC8) et une unique émission temps réel.
   *
   *  Story 36.4 / dérogation D-18 — RENVERSEMENT ASSUMÉ de l'AC2 de la story 30.2 et de la
   *  phrase 3 d'AD-21 : un conflit avec une déclaration PERSISTÉE ne fait plus échouer le
   *  lot dès lors que l'item porte une `conflictResolution`. Sans résolution, le lot échoue
   *  toujours — mais le 409 énumère désormais TOUS les conflits (AC9), faute de quoi le
   *  dialogue ne pourrait pas les NOMMER (AC2).
   *
   *  Deux invariants NON renversés :
   *  - un conflit INTERNE au lot reste irrésoluble (AC14) : aucun des deux items n'est
   *    « l'existant », « Remplacer » n'y a aucun sens ;
   *  - create() n'est toujours PAS le modèle d'atomicité (story 30.2, encadré n°2) : il
   *    expire les conflits HORS transaction. Ici l'expiration est dans la transaction.
   *
   *  ⚠️ `created` n'a PAS de correspondance positionnelle garantie avec `items` : un item
   *  résolu `keep` peut produire 0 à N pièces (découpe), quand tout autre item en produit
   *  exactement une. Aucun consommateur actuel n'indexe `created[i]` en le supposant aligné
   *  sur `items[i]` — le client retrouve les créneaux via `batchIndex` sur le 409, pas via ce
   *  retour de succès (revue de code Story 36.4). Voir `CreateAvailabilityBatchResult`
   *  (`packages/shared`). */
  async createBatch(
    userId: string,
    items: CreateAvailabilityBatchItem[],
  ): Promise<{ created: object[] }> {
    if (items.length === 0) {
      throw new BadRequestException('Le lot ne peut pas être vide');
    }

    const now = new Date();
    items.forEach((item, index) => {
      if (new Date(item.expiresAt) <= now) {
        throw new BadRequestException(
          `expiresAt doit être une date dans le futur (élément ${index})`,
        );
      }
    });

    const active = await this.prisma.availabilityDeclaration.findMany({
      where: { userId, expiresAt: { gt: now } },
    });

    // Un seul parcours : on résout les conflits de chaque item à partir de l'unique lecture
    // ci-dessus (AC7 — jamais un findMany par item, ce serait le fan-out que le palier combat).
    const conflictsByIndex = items.map((item) =>
      active.filter((existing) => this.conflictPredicate(existing, item)),
    );

    // AC9 : on COLLECTE au lieu de s'arrêter au premier. Le dialogue nomme les créneaux, il
    // ne peut pas le faire à partir d'une seule entrée. L'ordre suit celui du lot, le client
    // s'en servant (via batchIndex) pour retrouver la cellule sélectionnée correspondante.
    const unresolved: Array<ConflictInfo & { batchIndex: number }> = [];
    conflictsByIndex.forEach((conflicts, index) => {
      if (items[index].conflictResolution) return;
      for (const conflict of conflicts) {
        unresolved.push({
          ...this.toConflictInfo(conflict),
          batchIndex: index,
        });
      }
    });
    if (unresolved.length > 0) {
      throw new ConflictException({ conflicts: unresolved });
    }

    const internalConflict = this.findInternalConflict(items);
    if (internalConflict) {
      const [i, j] = internalConflict;
      throw new ConflictException({
        conflicts: [
          { ...this.batchItemToConflictInfo(items[i], i), batchIndex: i },
          { ...this.batchItemToConflictInfo(items[j], j), batchIndex: j },
        ],
      });
    }

    // Tout se calcule AVANT d'ouvrir la transaction, pour la garder aussi courte que possible :
    // elle reste séquentielle et le lot va jusqu'à 42 items, dont chacun peut produire
    // plusieurs pièces de découpe (timeout par défaut de $transaction : 5 s).
    //
    // Deux passes : `toExpire` doit être connu en ENTIER avant de calculer les pièces « à
    // trous » des items `keep`. Sans ça, un item `keep` recouvrant la MÊME déclaration
    // persistée qu'un item `overwrite` du même lot creuserait un trou autour d'une ligne qui
    // n'existera plus au commit (revue de code Story 36.4 — l'`overwrite` prime).
    const toExpire: string[] = [];
    items.forEach((item, index) => {
      if (item.conflictResolution === 'overwrite') {
        // Remplacer : n'expire que MES déclarations persistées. Une indisponibilité dérivée
        // d'une séance n'est jamais lue ici (AD-9, jamais persistée), elle survit donc
        // structurellement — il n'y a rien à coder pour cela (AC4/AC5).
        toExpire.push(...conflictsByIndex[index].map((c) => c.id));
      }
    });
    const expiredIds = new Set(toExpire);

    const toCreate: AvailabilityCreateData[] = [];
    items.forEach((item, index) => {
      const conflicts = conflictsByIndex[index];
      if (item.conflictResolution === 'keep' && conflicts.length > 0) {
        // Conserver : l'existant gagne, le créneau est créé « à trous » autour de lui — la
        // découpe de la story 1.7, appliquée dans le lot par la MÊME fonction (AC6).
        // On exclut les conflits déjà voués à l'expiration par un AUTRE item `overwrite` du
        // lot : ils n'existeront plus au commit, un trou à leur sujet serait injustifié.
        const stillActive = conflicts.filter((c) => !expiredIds.has(c.id));
        toCreate.push(...this.buildHolePieces(userId, item, stillActive));
        return;
      }
      // `overwrite` : l'expiration a déjà été collectée dans la première passe ci-dessus.
      toCreate.push({
        userId,
        kind: item.kind,
        recurKind: item.recurKind,
        dayOfWeek: item.dayOfWeek ?? null,
        slot: item.slot,
        startDate: item.startDate
          ? new Date(item.startDate + 'T00:00:00Z')
          : null,
        endDate: item.endDate ? new Date(item.endDate + 'T00:00:00Z') : null,
        expiresAt: new Date(item.expiresAt),
      });
    });

    const created = await this.prisma.$transaction(async (tx) => {
      // Expirations d'abord, créations ensuite — et UN SEUL updateMany pour tout le lot,
      // jamais un par item. `userId` borne l'écriture à l'appelant : les identifiants
      // viennent déjà d'une lecture scopée, la clause est une seconde barrière (AC16).
      if (toExpire.length > 0) {
        await tx.availabilityDeclaration.updateMany({
          where: { id: { in: toExpire }, userId },
          data: { expiresAt: new Date() },
        });
      }
      const results: object[] = [];
      for (const data of toCreate) {
        results.push(await tx.availabilityDeclaration.create({ data }));
      }
      return results;
    });

    await this.emitForUser(userId);
    return { created };
  }

  /** Crée la déclaration en faisant des "trous" autour des conflits existants — chemin
   *  unitaire (POST /availability, résolution `keep`). Ouvre sa propre transaction.
   *
   *  Story 36.4 : le CALCUL des pièces est extrait dans buildHolePieces() pour que la route
   *  groupée puisse écrire les mêmes pièces dans SA transaction, sans imbriquer une seconde
   *  $transaction et sans dupliquer la logique de découpe (AC6). */
  private async createWithHoles(
    userId: string,
    dto: CreateAvailabilityDto,
    conflicts: ConflictRow[],
  ): Promise<object[]> {
    const pieces = this.buildHolePieces(userId, dto, conflicts);
    return this.prisma.$transaction(async (tx) => {
      const results: object[] = [];
      for (const data of pieces) {
        results.push(await tx.availabilityDeclaration.create({ data }));
      }
      return results;
    });
  }

  /** Calcul PUR des déclarations à créer « avec des trous » autour des conflits existants
   *  (résolution `keep` / Conserver). N'écrit rien, ne lit rien : rend les `data` prêts à
   *  être créés, que l'appelant écrit dans la transaction de son choix.
   *  Pour RECURRING : découpe en pièces entre les conflits (pas de 7 jours).
   *  Pour PUNCTUAL : idem, avec un pas de 1 jour. */
  private buildHolePieces(
    userId: string,
    dto: CreateAvailabilityDto,
    conflicts: ConflictRow[],
  ): AvailabilityCreateData[] {
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

      return pieces.map((piece) => ({
        userId,
        kind: dto.kind,
        recurKind: 'RECURRING' as const,
        dayOfWeek: dto.dayOfWeek!,
        slot: dto.slot,
        startDate: piece.startDate,
        endDate: piece.endDate,
        expiresAt: dtoExpires,
      }));
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

    return pieces2.map((p) => ({
      userId,
      kind: dto.kind,
      recurKind: 'PUNCTUAL' as const,
      dayOfWeek: null,
      slot: dto.slot,
      startDate: p.startDate,
      endDate: p.endDate,
      expiresAt: new Date(p.endDate.getTime() + 86_399_999),
    }));
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
    const updated = await this.prisma.availabilityDeclaration.findUnique({
      where: { id },
    });
    await this.emitForUser(userId);
    return updated;
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
    await this.emitForUser(userId);
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
   * Même chose que `getActiveDeclarations`, augmentée des indisponibilités dérivées des séances
   * datées de CHACUNE des parties (toutes, pas seulement celle consultée) des utilisateurs demandés
   * (AD-9). Seul point d'entrée utilisé par `PartiesService.getAvailableSlots`/`getHeatmap` — les
   * deux vues (MJ et joueur) partagent ainsi la même source de vérité (AC6, Story 30.5).
   * `getActiveDeclarations` reste inchangée : elle ne renvoie que des déclarations réelles.
   */
  async getActiveDeclarationsWithSeances(
    userIds: string[],
  ): Promise<Map<string, DeclarationLike[]>> {
    const map = await this.getActiveDeclarations(userIds);
    if (userIds.length === 0) return map;

    const derived = await this.getSeanceDerivedUnavailability(userIds);
    for (const [userId, entries] of derived) {
      if (entries.length === 0) continue;
      map.set(userId, [...(map.get(userId) ?? []), ...entries]);
    }
    return map;
  }

  /**
   * Résout, pour chaque utilisateur demandé, les créneaux occupés par une séance datée de
   * N'IMPORTE LAQUELLE de ses parties (MJ ou membre) — pas seulement celle consultée par
   * l'appelant. C'est la traduction structurelle d'AD-9 : la sortie est un `DeclarationLike`
   * synthétique (`UNAVAILABLE`, `PUNCTUAL`), jamais une identité de partie/scénario — la non-fuite
   * cross-partie découle directement de cette forme, aucun filtrage supplémentaire n'est requis.
   *
   * Participant d'une séance datée : ONE_SHOT/CAMPAGNE_LINEAIRE → tous les membres + le MJ (aucune
   * présence individuelle dans ces kinds) ; CAMPAGNE_EPISODIQUE → le MJ + les seuls utilisateurs
   * inscrits (`Inscription`) à CETTE séance — un joueur non inscrit n'est engagé sur rien.
   *
   * Deux requêtes Prisma au total, jamais une par utilisateur ni par partie (pas de N+1).
   */
  private async getSeanceDerivedUnavailability(
    userIds: string[],
  ): Promise<Map<string, DeclarationLike[]>> {
    const map = new Map<string, DeclarationLike[]>();
    for (const userId of userIds) map.set(userId, []);

    const parties = await this.prisma.partie.findMany({
      where: {
        OR: [
          { mjId: { in: userIds } },
          { memberships: { some: { userId: { in: userIds } } } },
        ],
      },
      select: {
        id: true,
        kind: true,
        mjId: true,
        memberships: { select: { userId: true } },
      },
    });
    if (parties.length === 0) return map;

    const partieIds = parties.map((p) => p.id);
    const partieById = new Map(parties.map((p) => [p.id, p]));
    const seances = await this.prisma.seance.findMany({
      where: { scenario: { partieId: { in: partieIds } } },
      include: {
        poll: true,
        inscriptions: { select: { userId: true } },
        scenario: { select: { partieId: true } },
      },
    });

    const requested = new Set(userIds);

    for (const seance of seances) {
      const date = seance.poll?.chosenDate ?? seance.dateValidee;
      if (!date) continue;
      const slot = seance.poll?.chosenSlot ?? 'FULL_DAY';

      const partie = partieById.get(seance.scenario.partieId);
      if (!partie) continue; // partie hors du périmètre résolu ci-dessus

      const participantIds =
        partie.kind === 'CAMPAGNE_EPISODIQUE'
          ? new Set([partie.mjId, ...seance.inscriptions.map((i) => i.userId)])
          : new Set([partie.mjId, ...partie.memberships.map((m) => m.userId)]);

      const dayUtc = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
      const entry: DeclarationLike = {
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        slot: slot,
        startDate: dayUtc,
        endDate: dayUtc,
        expiresAt: new Date(dayUtc.getTime() + 86_399_999),
      };

      for (const userId of participantIds) {
        // Copie par entrée : chaque utilisateur reçoit son propre objet, jamais une référence
        // partagée avec les autres participants de la même séance.
        if (requested.has(userId)) map.get(userId)!.push({ ...entry });
      }
    }

    return map;
  }

  // ─── Calendrier personnel (GET /me/calendar, AD-18, Story 30.5) ────────────

  private static readonly ME_CALENDAR_MAX_RANGE_DAYS = 366;

  /**
   * Endpoint unique du calendrier personnel (AD-18) : un seul appel pour toute la plage `[from,
   * to]`, indexé par couche. `disponibilite-groupe` n'y figure JAMAIS (AD-16, AC5 Story 30.4) —
   * elle n'a de sens que dans le calendrier d'une partie. Toutes les lectures sont groupées par
   * `partieId: { in: [...] }`, jamais une itération par partie (AC1).
   */
  async getMyCalendar(
    userId: string,
    from: string,
    to: string,
  ): Promise<MeCalendarDto> {
    const fromMs = this.parseDateOnly(from, false);
    const toMs = this.parseDateOnly(to, true);
    if (fromMs > toMs) {
      throw new BadRequestException('from must be before or equal to to');
    }
    if (
      toMs - fromMs >
      AvailabilityService.ME_CALENDAR_MAX_RANGE_DAYS * 86_400_000
    ) {
      throw new BadRequestException(
        `Date range cannot exceed ${AvailabilityService.ME_CALENDAR_MAX_RANGE_DAYS} days`,
      );
    }

    const myParties = await this.prisma.partie.findMany({
      where: { OR: [{ mjId: userId }, { memberships: { some: { userId } } }] },
      select: { id: true, name: true, kind: true, mjId: true },
    });
    const partieIds = myParties.map((p) => p.id);
    const partieById = new Map(myParties.map((p) => [p.id, p]));

    const [declarations, seances, polls, membershipCounts] = await Promise.all([
      this.prisma.availabilityDeclaration.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
      }),
      partieIds.length === 0
        ? Promise.resolve([])
        : this.prisma.seance.findMany({
            where: { scenario: { partieId: { in: partieIds } } },
            include: {
              poll: true,
              inscriptions: { select: { userId: true } },
              scenario: { select: { partieId: true, title: true } },
            },
          }),
      partieIds.length === 0
        ? Promise.resolve([])
        : this.prisma.sessionPoll.findMany({
            where: { partieId: { in: partieIds }, status: 'OPEN' },
            // Story 36.6 — `votes: true` et RIEN de plus. 🚨 Ne jamais y ajouter
            // `include: { user: … }` : le calendrier personnel agrège des parties entre
            // lesquelles aucune identité ne doit transiter (AD-9/AD-2). Les compteurs et ma
            // seule réponse se déduisent de `userId` + `answer`, qui ne sortent jamais d'ici.
            include: { options: { include: { votes: true } } },
          }),
      // Story 36.6 — l'effectif de chaque partie, en UNE requête groupée pour toutes mes parties
      // (AD-3). Jamais un `membership.count` par partie : c'est exactement le fan-out que la
      // garde anti-N+1 de la spec interdit.
      partieIds.length === 0
        ? Promise.resolve([])
        : this.prisma.membership.groupBy({
            by: ['partieId'],
            where: { partieId: { in: partieIds } },
            _count: true,
          }),
    ]);

    // Le MJ n'a jamais de ligne `Membership` : une partie absente de l'agrégat a 0 membre, donc
    // un effectif de 1. `participantCount()` est le point unique de cette formule.
    const membershipCountByPartie = new Map<string, number>(
      (membershipCounts as { partieId: string; _count: number }[]).map((m) => [
        m.partieId,
        m._count,
      ]),
    );

    return {
      'mes-indisponibilites': declarations
        .filter(
          (d) =>
            d.kind === 'UNAVAILABLE' &&
            this.declarationOverlapsRange(d, fromMs, toMs),
        )
        .map((d) => this.toAvailabilityDeclarationDto(d)),
      'mes-disponibilites': declarations
        .filter(
          (d) =>
            d.kind === 'AVAILABLE' &&
            this.declarationOverlapsRange(d, fromMs, toMs),
        )
        .map((d) => this.toAvailabilityDeclarationDto(d)),
      'mes-seances': this.buildMySeancesLayer(
        seances,
        partieById,
        userId,
        fromMs,
        toMs,
      ),
      'votes-en-cours': this.buildOpenPollsLayer(
        polls,
        partieById,
        fromMs,
        toMs,
        userId,
        membershipCountByPartie,
      ),
      // Non filtrée par [from, to] (décision documentée, Story 30.5 Dev Notes) : une séance en
      // attente d'inscriptions n'a pas encore de date propre à comparer.
      'inscriptions-ouvertes': this.buildOpenInscriptionsLayer(
        seances,
        partieById,
        userId,
      ),
    };
  }

  /** Parse une borne `YYYY-MM-DD` en timestamp UTC, début ou fin de journée. Rejette les dates
   *  calendairement invalides (ex. `2026-02-30`) que `Date` accepterait sinon en les décalant
   *  silencieusement au mois suivant. */
  private parseDateOnly(value: string, endOfDay: boolean): number {
    const iso = `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
    const ms = new Date(iso).getTime();
    if (
      Number.isNaN(ms) ||
      new Date(ms).toISOString().substring(0, 10) !== value
    ) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return ms;
  }

  /** PUNCTUAL : chevauchement direct des bornes. RECURRING : bornée par expiresAt à défaut
   *  d'endDate — même convention que `dateRangesConflict`/`isInCoveredPeriod`, ET au moins une
   *  date de la fenêtre d'intersection tombe sur `dayOfWeek` (sinon une règle "tous les lundis"
   *  serait incluse pour une plage qui ne couvre aucun lundi). */
  private declarationOverlapsRange(
    d: {
      recurKind: string;
      dayOfWeek: number | null;
      startDate: Date | null;
      endDate: Date | null;
      expiresAt: Date;
    },
    fromMs: number,
    toMs: number,
  ): boolean {
    if (d.recurKind === 'PUNCTUAL') {
      if (!d.startDate || !d.endDate) return false;
      return d.startDate.getTime() <= toMs && d.endDate.getTime() >= fromMs;
    }
    const effStart = Math.max((d.startDate ?? new Date(0)).getTime(), fromMs);
    const effEnd = Math.min((d.endDate ?? d.expiresAt).getTime(), toMs);
    if (effStart > effEnd || d.dayOfWeek == null) return false;
    for (let t = effStart; t <= effEnd; t += 86_400_000) {
      if (new Date(t).getUTCDay() === d.dayOfWeek) return true;
    }
    return false;
  }

  private toAvailabilityDeclarationDto(d: {
    id: string;
    userId: string;
    kind: string;
    recurKind: string;
    dayOfWeek: number | null;
    slot: string;
    startDate: Date | null;
    endDate: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }): AvailabilityDeclarationDto {
    return {
      id: d.id,
      userId: d.userId,
      kind: d.kind as AvailKind,
      recurKind: d.recurKind as RecurKind,
      dayOfWeek: d.dayOfWeek,
      slot: d.slot as DaySlot,
      startDate: d.startDate?.toISOString().substring(0, 10) ?? null,
      endDate: d.endDate?.toISOString().substring(0, 10) ?? null,
      expiresAt: d.expiresAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    };
  }

  /** Mes séances datées, toutes mes parties confondues — identité de partie/scénario incluse,
   *  ce sont mes propres parties (AC4 : la notion de partie tierce n'existe pas ici). Pour une
   *  partie CAMPAGNE_EPISODIQUE, une séance n'est « mienne » que si j'y suis inscrit (ou MJ) —
   *  même règle « participant » qu'`getSeanceDerivedUnavailability` (AD-9), sinon un membre non
   *  inscrit verrait une séance à laquelle il ne participe pas listée comme sienne. */
  private buildMySeancesLayer(
    seances: Array<{
      id: string;
      scenarioId: string;
      poll: { chosenDate: Date | null; chosenSlot: string | null } | null;
      dateValidee: Date | null;
      inscriptions: { userId: string }[];
      scenario: { partieId: string; title: string };
      // Story 36.5 — déjà chargés par le findMany (aucun `select` de scalaires), donc gratuits.
      heureRdv?: string | null;
      lieu?: string | null;
      notePratique?: string | null;
    }>,
    partieById: Map<
      string,
      { id: string; name: string; kind: string; mjId: string }
    >,
    userId: string,
    fromMs: number,
    toMs: number,
  ): MyCalendarSeanceEntry[] {
    const entries: MyCalendarSeanceEntry[] = [];
    for (const s of seances) {
      const date = s.poll?.chosenDate ?? s.dateValidee;
      if (!date) continue;
      if (date.getTime() < fromMs || date.getTime() > toMs) continue;
      const partie = partieById.get(s.scenario.partieId);
      if (!partie) continue;
      if (
        partie.kind === 'CAMPAGNE_EPISODIQUE' &&
        partie.mjId !== userId &&
        !s.inscriptions.some((i) => i.userId === userId)
      ) {
        continue;
      }
      entries.push({
        seanceId: s.id,
        partieId: partie.id,
        partieName: partie.name,
        scenarioId: s.scenarioId,
        scenarioTitle: s.scenario.title,
        date: date.toISOString().substring(0, 10),
        // AC5 : lu sur le sondage rattaché s'il existe, FULL_DAY à défaut — jamais une supposition
        // locale à l'appelant.
        slot: (s.poll?.chosenSlot ?? 'FULL_DAY') as DaySlot,
        // Story 36.5 — transmis tels quels. `heureRdv` reste une CHAÎNE : rien ici ne la parse
        // ni ne la compare, et elle n'entre pas dans le calcul de statut de créneau (AD-9).
        heureRdv: s.heureRdv ?? null,
        lieu: s.lieu ?? null,
        notePratique: s.notePratique ?? null,
      });
    }
    return entries;
  }

  /**
   * Sondages de date ouverts sur mes parties, dont au moins une option tombe dans la plage.
   *
   * Story 36.6 — chaque option porte désormais son `optionId`, les trois compteurs de réponses et
   * **ma seule** réponse ; l'entrée porte l'effectif de la troupe (le dénominateur de la piste).
   *
   * ⚠️ **Le filtre de plage reste au niveau du SONDAGE, et toutes ses options sont renvoyées**
   * (comportement d'origine, délibérément conservé). Filtrer option par option aurait retiré de
   * la charge utile des créneaux que le client sait déjà ne pas rendre — la grille ne dessine que
   * les jours qu'elle affiche — mais aurait rendu `nextMeaningfulDate()` (le rail, story 36.1)
   * aveugle à une option juste au-delà de la fenêtre chargée, qui est précisément ce qu'il
   * cherche : le prochain jour porteur.
   */
  private buildOpenPollsLayer(
    polls: Array<{
      id: string;
      partieId: string;
      options: {
        id: string;
        date: Date;
        slot: string;
        votes?: { userId: string; answer: string }[];
      }[];
    }>,
    partieById: Map<string, { id: string; name: string }>,
    fromMs: number,
    toMs: number,
    userId: string,
    membershipCountByPartie: Map<string, number>,
  ): MyCalendarPollEntry[] {
    const entries: MyCalendarPollEntry[] = [];
    for (const poll of polls) {
      const inRange = poll.options.some(
        (o) => o.date.getTime() >= fromMs && o.date.getTime() <= toMs,
      );
      if (!inRange) continue;
      const partie = partieById.get(poll.partieId);
      if (!partie) continue;
      entries.push({
        pollId: poll.id,
        partieId: partie.id,
        partieName: partie.name,
        membersCount: participantCount(
          membershipCountByPartie.get(partie.id) ?? 0,
        ),
        options: poll.options.map((o) => {
          const votes = o.votes ?? [];
          const mine = votes.find((v) => v.userId === userId);
          return {
            optionId: o.id,
            date: o.date.toISOString().substring(0, 10),
            slot: o.slot as DaySlot,
            yes: votes.filter((v) => v.answer === 'YES').length,
            maybe: votes.filter((v) => v.answer === 'MAYBE').length,
            no: votes.filter((v) => v.answer === 'NO').length,
            // `null`, jamais `undefined` : une seule représentation de « n'a pas répondu ».
            myAnswer: mine ? (mine.answer as VoteAnswer) : null,
          };
        }),
      });
    }
    return entries;
  }

  /** Séances à inscription ouverte de mes parties CAMPAGNE_EPISODIQUE — jamais filtrée par plage
   *  (D-13, Story 30.5 Dev Notes) : une séance en attente d'inscriptions n'a pas encore de date. */
  private buildOpenInscriptionsLayer(
    seances: Array<{
      id: string;
      poll: { chosenDate: Date | null } | null;
      dateValidee: Date | null;
      inscriptionMin: number | null;
      inscriptionMax: number | null;
      inscriptions: { userId: string }[];
      scenario: { partieId: string; title: string };
    }>,
    partieById: Map<string, { id: string; name: string; kind: string }>,
    userId: string,
  ): MyCalendarOpenInscriptionEntry[] {
    const entries: MyCalendarOpenInscriptionEntry[] = [];
    for (const s of seances) {
      if (s.inscriptionMax == null) continue;
      // Date validée (via poll ou dateValidee) fige le roster (ScenariosService.inscrire()) —
      // l'inscription n'est alors plus "ouverte".
      if (s.poll?.chosenDate ?? s.dateValidee) continue;
      const partie = partieById.get(s.scenario.partieId);
      if (!partie || partie.kind !== 'CAMPAGNE_EPISODIQUE') continue;
      entries.push({
        seanceId: s.id,
        partieId: partie.id,
        partieName: partie.name,
        scenarioTitle: s.scenario.title,
        inscriptionMin: s.inscriptionMin ?? 0,
        inscriptionMax: s.inscriptionMax,
        inscritsCount: s.inscriptions.length,
        jeSuisInscrit: s.inscriptions.some((i) => i.userId === userId),
      });
    }
    return entries;
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
    if (this.isInCoveredPeriod(active, date, slot, now)) {
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

    await this.emitForUser(userId);
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
    slot: DaySlot,
    _now: Date,
  ): boolean {
    return active.some((d) => {
      if (!this.slotMatches(d.slot, slot)) return false;
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
