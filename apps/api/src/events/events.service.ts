import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event, type Seance } from '@prisma/client';
import type { DaySlot, PartieKind } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';

/** Données de base d'un événement (Story 37.3, AD-3). `ownerId` = propriétaire de la partie. */
export interface CreateEventInput {
  partieId: string;
  title: string;
  description?: string | null;
  ownerId: string | null;
}

/** Rappel d'extension : écrit, dans la MÊME transaction, la ligne qui étend l'événement (le
 *  `Scenario` pour le JDR). Fourni par l'appelant — `events/` ne connaît aucune extension. */
export type EventExtension<T> = (tx: Prisma.TransactionClient, event: Event) => Promise<T>;

export interface CreatedEvent<T> {
  event: Event;
  extension: T;
}

/** Une séance telle que lue par l'appelant — seuls les champs dont les règles ont besoin. */
type SeanceRef = Pick<Seance, 'id' | 'eventId' | 'pollId'>;
/** Story 37.4 : la date de la séance est le début de sa plage (`startDate`), seule source de la
 *  date — posée au choix d'une option de vote, effacée à sa remise à zéro. */
type SeanceDated = Pick<Seance, 'id' | 'inscriptionMax' | 'startDate'>;

/** Forme du payload des informations pratiques (Story 36.5) — les trois champs sont saisis
 *  ensemble et `null` vide le champ. */
export interface SeanceInfosPratiques {
  heureRdv: string | null;
  lieu: string | null;
  notePratique: string | null;
}

const FROZEN_ROSTER_MESSAGE = 'Cette séance a déjà une date validée — les inscriptions sont figées';

/**
 * Événement de base et ses séances (Story 37.3, couche 2 « rassemblement »).
 *
 * Écrivain unique d'`Event`, de `Seance` (hors `compteRendu`, écrit par `scenarios/`) et
 * d'`Inscription` (AD-1). Les gardes propres à un système (statut de scénario, type de partie,
 * anti-spoil) restent chez l'appelant, qui délègue ensuite l'écriture ici ; les règles propres à la
 * séance (verrou de ligne, capacité, gel par la date, idempotence) vivent ici, messages inchangés.
 *
 * Les droits sont vérifiés par l'appelant AVANT tout appel (`partieId` reçu = partie déjà résolue
 * et autorisée). Toute méthode publique non transactionnelle émet `partie:{id}` après validation ;
 * les variantes `…InTx` n'émettent jamais — l'appelant émet après SON commit.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /** Création composite (événement + extension + première séance) dans une transaction, puis
   *  émission après validation. */
  async create<T = undefined>(
    input: CreateEventInput,
    extend?: EventExtension<T>,
  ): Promise<CreatedEvent<T>> {
    const created = await this.prisma.$transaction((tx) => this.createInTx(tx, input, extend));
    this.realtimeEvents.emit(partieTopic(input.partieId));
    return created;
  }

  /** Variante pour un appelant déjà dans une transaction (`PartiesService.create`/`convertKind`).
   *  N'émet rien : l'appelant émet après son propre commit. */
  async createInTx<T = undefined>(
    tx: Prisma.TransactionClient,
    input: CreateEventInput,
    extend?: EventExtension<T>,
  ): Promise<CreatedEvent<T>> {
    await this.assertCanAddEvent(tx, input.partieId);

    const event = await tx.event.create({
      data: {
        partieId: input.partieId,
        title: input.title,
        description: input.description ?? null,
        ownerId: input.ownerId,
      },
    });
    const extension = (extend ? await extend(tx, event) : undefined) as T;
    // Un événement a systématiquement besoin d'au moins une séance pour planifier sa date — on
    // peut toujours en ajouter d'autres ensuite (addSeance, aucun plafond).
    await tx.seance.create({ data: { eventId: event.id } });
    return { event, extension };
  }

  /** Titre/description d'un événement, dans la transaction de l'appelant (qui émet après). */
  async updateInTx(
    tx: Prisma.TransactionClient,
    eventId: string,
    data: { title?: string; description?: string | null },
  ): Promise<Event> {
    return tx.event.update({ where: { id: eventId }, data });
  }

  /** `ONE_SHOT` = exactement un événement (AD-3), vérifié sous verrou de la partie : deux
   *  créations concurrentes ne peuvent pas lire toutes deux « zéro événement ». */
  private async assertCanAddEvent(tx: Prisma.TransactionClient, partieId: string): Promise<void> {
    const [partie] = await tx.$queryRaw<{ kind: PartieKind }[]>`
      SELECT "kind"::text AS "kind" FROM "Partie" WHERE "id" = ${partieId} FOR UPDATE`;
    if (!partie) throw new NotFoundException('Partie introuvable');
    if (partie.kind !== 'ONE_SHOT') return;
    const existing = await tx.event.findFirst({ where: { partieId }, select: { id: true } });
    if (existing) {
      throw new BadRequestException(
        "Une Partie de type ONE_SHOT n'a qu'un seul événement — il est créé avec elle",
      );
    }
  }

  // ─── Séances ────────────────────────────────────────────────────────────────────────────────

  /** Ajoute une séance à un événement — aucun plafond (Story 8.2, AC1). */
  async addSeance(partieId: string, eventId: string): Promise<void> {
    await this.prisma.seance.create({ data: { eventId } });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /**
   * Supprime une séance (Story 8.7). Un événement a toujours au moins une séance — la toute
   * première (par createdAt croissant, id en tie-breaker) ne peut jamais être supprimée (AC5).
   * `Inscription.onDelete: Cascade` emporte les inscriptions liées. Revue de code Story 8.8
   * (décision utilisateur) : sans séance, un vote de date n'a plus de sens — le SessionPoll lié est
   * supprimé plutôt que laissé orphelin ; la Seance d'abord (elle référence le poll en FK). Enfin,
   * la date la plus proche de la Partie peut disparaître → recalcul.
   */
  async deleteSeance(partieId: string, seance: SeanceRef): Promise<void> {
    const [firstSeance] = await this.prisma.seance.findMany({
      where: { eventId: seance.eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1,
    });
    if (firstSeance?.id === seance.id) {
      throw new BadRequestException("La première séance d'un scénario ne peut pas être supprimée");
    }

    // Deferred-work (2026-08-25) : TOCTOU entre la lecture de la séance par l'appelant et ce
    // delete() — une seconde suppression concurrente de la MÊME séance ferait lever un P2025 brut
    // plutôt qu'un 404 propre.
    try {
      await this.prisma.seance.delete({ where: { id: seance.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Séance introuvable');
      }
      throw e;
    }
    if (seance.pollId) {
      await this.prisma.sessionPoll.delete({ where: { id: seance.pollId } });
    }
    await this.recalculateNextSession(partieId);
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /**
   * Rattache à une séance le vote de date que `createPoll` crée (Story 8.7). Un seul vote par
   * séance : refus si la séance en porte déjà un, AVANT de créer le vote. `createPoll` est fourni
   * par l'appelant — `PollService` reste le seul écrivain de `SessionPoll` (P2-AD-2) ; ce service
   * ne fait que poser `Seance.pollId`. Non-atomique par construction (risque accepté, Story 8.7).
   */
  async createSeancePoll(
    partieId: string,
    seance: SeanceRef,
    createPoll: () => Promise<{ id: string }>,
  ): Promise<void> {
    if (seance.pollId) {
      throw new BadRequestException('Cette séance est déjà liée à un vote de date');
    }
    const poll = await createPoll();
    await this.prisma.seance.update({
      where: { id: seance.id },
      data: { pollId: poll.id },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /**
   * Story 8.8, AC4 : détache le vote de la séance et efface sa plage de date (Story 37.4), PUIS
   * supprime le SessionPoll lui-même (détacher avant de supprimer : FK). La date la plus proche de
   * la Partie peut changer → recalcul.
   */
  async resetSeanceDate(partieId: string, seance: SeanceRef): Promise<void> {
    await this.prisma.seance.update({
      where: { id: seance.id },
      data: { pollId: null, startDate: null, startSlot: null, endDate: null, endSlot: null },
    });
    if (seance.pollId) {
      await this.prisma.sessionPoll.delete({ where: { id: seance.pollId } });
    }
    await this.recalculateNextSession(partieId);
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /**
   * Story 37.4 : pose la plage de date de la séance rattachée au vote `pollId` depuis l'option
   * choisie — `start = end` (seules plages écrites à ce palier). Appelé par `PollService.choose`
   * DANS sa transaction : le vote clos et la date de la séance sont écrits ensemble ou pas du tout.
   * Un vote sans séance rattachée (vote de partie hérité) ne touche aucune ligne. N'émet jamais.
   */
  async setSpanFromPollInTx(
    tx: Prisma.TransactionClient,
    pollId: string,
    date: Date,
    slot: DaySlot,
  ): Promise<void> {
    await tx.seance.updateMany({
      where: { pollId },
      data: { startDate: date, startSlot: slot, endDate: date, endSlot: slot },
    });
  }

  /** Capacité d'inscription d'une séance (Story 8.3). */
  async setSeanceCapacity(
    partieId: string,
    seanceId: string,
    inscriptionMin: number,
    inscriptionMax: number,
  ): Promise<void> {
    if (inscriptionMax < inscriptionMin) {
      throw new BadRequestException('Le maximum doit être supérieur ou égal au minimum');
    }
    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { inscriptionMin, inscriptionMax },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /** Informations pratiques d'une séance (Story 36.5, dérogation D-15 amendée le 2026-08-19).
   *  🚨 Les trois valeurs sont écrites TELLES QUELLES : `heureRdv` est une étiquette `"HH:MM"`,
   *  jamais parsée, convertie ni comparée (addendum §5.7). `null` vide le champ. */
  async setInfosPratiques(
    partieId: string,
    seanceId: string,
    dto: SeanceInfosPratiques,
  ): Promise<void> {
    // Un seul update pour les trois champs : ils sont saisis ensemble.
    await this.prisma.seance.update({
      where: { id: seanceId },
      data: {
        heureRdv: dto.heureRdv,
        lieu: dto.lieu,
        notePratique: dto.notePratique,
      },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  // ─── Inscriptions ───────────────────────────────────────────────────────────────────────────

  /**
   * Inscription à capacité limitée (Story 8.3). AD-5 (verbatim) : verrou de ligne explicite
   * SELECT ... FOR UPDATE obligatoire — READ COMMITTED seul ne suffit pas à empêcher un dépassement
   * de max entre deux inscriptions concurrentes.
   */
  async inscrire(partieId: string, seance: SeanceDated, userId: string): Promise<void> {
    const seanceId = seance.id;
    if (seance.inscriptionMax == null) {
      throw new BadRequestException("Cette séance n'a pas encore de capacité définie par le MJ");
    }
    // Story 37.4 : la plage porte la date, qu'elle vienne d'un vote choisi ou non.
    if (seance.startDate) {
      throw new BadRequestException(FROZEN_ROSTER_MESSAGE);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Seance" WHERE id = ${seanceId} FOR UPDATE`;
      const existing = await tx.inscription.findUnique({
        where: { seanceId_userId: { seanceId, userId } },
      });
      // AC2 vs AC4 : ce check précède le comptage — un joueur déjà inscrit reste inscrit sans
      // jamais être rejeté par un quota déjà atteint par d'autres (idempotence).
      if (existing) return;
      // Relit inscriptionMax ET la date sous le verrou — sinon une capacité ou une date validée
      // concurrentes entre la lecture initiale (hors transaction) et cette comparaison
      // utiliseraient un état périmé (revue de code, 2026-07-14).
      const locked = await tx.seance.findUniqueOrThrow({ where: { id: seanceId } });
      if (locked.startDate) {
        throw new ConflictException(FROZEN_ROSTER_MESSAGE);
      }
      const count = await tx.inscription.count({ where: { seanceId } });
      if (count >= locked.inscriptionMax!) {
        throw new ConflictException('Cette séance a atteint son nombre maximal d’inscrits');
      }
      await tx.inscription.create({ data: { seanceId, userId } });
    });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  /**
   * Retrait d'inscription — deleteMany (pas delete) : idempotent si l'utilisateur n'était pas
   * inscrit. Décision utilisateur (revue de code, 2026-07-14) : la date validée fige le roster.
   */
  async desinscrire(
    partieId: string,
    seance: Omit<SeanceDated, 'inscriptionMax'>,
    userId: string,
  ): Promise<void> {
    if (seance.startDate) {
      throw new BadRequestException(FROZEN_ROSTER_MESSAGE);
    }
    await this.prisma.inscription.deleteMany({ where: { seanceId: seance.id, userId } });
    this.realtimeEvents.emit(partieTopic(partieId));
  }

  // ─── Prochaine séance ───────────────────────────────────────────────────────────────────────

  /**
   * Story 8.8 (Décision 2) : un seul vote actif par Séance — Partie.nextSessionDate/nextSessionSlot
   * reflètent la date la plus proche dans le futur parmi TOUTES les séances de la Partie
   * (début de leur plage, Story 37.4). Appelé après tout événement pouvant faire changer cette date :
   * choix d'un vote (PollController, via `ScenariosService`), réinitialisation ou suppression d'une
   * séance. Remet `reminderSentAt` à null seulement si la date/le créneau change réellement.
   */
  async recalculateNextSession(partieId: string): Promise<void> {
    const seances = await this.prisma.seance.findMany({
      where: { event: { partieId } },
      select: { startDate: true, startSlot: true },
    });

    // Bug fix (production) : comparer à Date.now() excluait TOUJOURS une séance datée
    // d'aujourd'hui dès que l'heure courante dépassait minuit, quel que soit le créneau — on
    // compare donc au début du jour courant (UTC), pas à l'horodatage exact.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const now = startOfToday.getTime();
    type Candidate = { date: Date; slot: DaySlot | null };
    const nearest =
      seances
        .map((s): Candidate | null => {
          // Créneau vide = « sans créneau » (date posée hors vote) → `nextSessionSlot` null.
          if (s.startDate) return { date: s.startDate, slot: s.startSlot ?? null };
          return null;
        })
        .filter((c): c is Candidate => c !== null && c.date.getTime() >= now)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;

    const partie = await this.prisma.partie.findUniqueOrThrow({
      where: { id: partieId },
    });
    const unchanged =
      (partie.nextSessionDate?.getTime() ?? null) === (nearest?.date.getTime() ?? null) &&
      partie.nextSessionSlot === (nearest?.slot ?? null);

    await this.prisma.partie.update({
      where: { id: partieId },
      data: {
        nextSessionDate: nearest?.date ?? null,
        nextSessionSlot: nearest?.slot ?? null,
        ...(unchanged ? {} : { reminderSentAt: null }),
      },
    });
  }
}
