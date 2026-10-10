import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event, type Seance } from '@prisma/client';
import type {
  DaySlot,
  MyCalendarOpenInscriptionEntry,
  MyCalendarSeanceEntry,
  PartieKind,
} from '@master-jdr/shared';
import type { OccupiedSpan, OccupiedSpansPort } from '../availability/ports/occupied-spans.port';
import type {
  OwnEvents,
  OwnEventsPort,
  OwnEventsRange,
  OwnRolesResolver,
} from '../availability/ports/own-events.port';
import type { PartieGrant } from '../permissions/permission.service';
import {
  VISIBLE_SEANCE_WHERE,
  isHiddenDraft,
  isSpoilRestricted,
} from '../permissions/scenario-visibility';
import type { SeanceDatePort } from '../poll/ports/seance-date.port';
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

/** Valeur persistée de `Partie.nextSessionDate/nextSessionSlot`, telle que (re)calculée. */
export interface NextSession {
  nextSessionDate: Date | null;
  nextSessionSlot: DaySlot | null;
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
 * Les droits sont vérifiés par l'appelant AVANT tout appel : chaque écriture publique exige
 * l'autorisation (`PartieGrant`) délivrée par `PermissionService.assert()` (Story 37.6, AD-6) —
 * pas d'autorisation, pas d'appel, et la partie écrite est celle de l'autorisation, jamais un
 * identifiant passé à part. Une séance ou un événement écrit doit appartenir à la partie de
 * l'autorisation, sinon 404 avec le message historique (`Séance introuvable`, `Scénario
 * introuvable`) : une autorisation obtenue sur la partie A ne permet jamais d'écrire dans B.
 *
 * Seules exceptions, qui prennent un `partieId` (ou un identifiant) nu, chacune pour une raison :
 * - `createInTx` : appelée par `PartiesService` (écrivain de `Partie`) dans sa propre transaction,
 *   sur la partie qu'il crée (aucune autorisation ne peut encore exister) ou qu'il convertit
 *   (autorisation déjà vérifiée dans la même méthode) ;
 * - `updateInTx` : appelée dans la transaction de l'appelant, qui a obtenu l'autorisation sur
 *   l'événement lui-même (`{ eventId }`) juste avant ;
 * - `chooseDate` (`SeanceDatePort`) : appelée par `PollService.choose()` dans sa transaction, après
 *   l'autorisation `POLL_CHOOSE` et la vérification que le vote appartient à la partie ;
 * - `recalculateNextSession[InTx]` : recalcul d'une valeur dérivée (aucune donnée saisie),
 *   idempotent, appelé après une écriture déjà autorisée — seul écrivain de
 *   `Partie.nextSessionDate/nextSessionSlot` (Story 37.8, AD-15).
 *
 * Story 37.8 : implémente les ports de la couche 1 (`OccupiedSpansPort`, `OwnEventsPort`,
 * `SeanceDatePort`), branchés par `PortsModule` — `availability/` et `poll/` ne connaissent que les
 * interfaces.
 *
 * Toute méthode publique non transactionnelle émet `partie:{id}` après validation ; les variantes
 * `…InTx` n'émettent jamais — l'appelant émet après SON commit.
 */
@Injectable()
export class EventsService implements OccupiedSpansPort, OwnEventsPort, SeanceDatePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /** Création composite (événement + extension + première séance) dans une transaction, puis
   *  émission après validation. La partie est celle de l'autorisation. */
  async create<T = undefined>(
    grant: PartieGrant,
    input: Omit<CreateEventInput, 'partieId'>,
    extend?: EventExtension<T>,
  ): Promise<CreatedEvent<T>> {
    const created = await this.prisma.$transaction((tx) =>
      this.createInTx(tx, { ...input, partieId: grant.partieId }, extend),
    );
    this.realtimeEvents.emit(partieTopic(grant.partieId));
    return created;
  }

  /** Variante pour un appelant déjà dans une transaction (`PartiesService.create`/`convertKind`).
   *  N'émet rien : l'appelant émet après son propre commit. Seul écrivain de `Partie`,
   *  `PartiesService` l'appelle sur la partie qu'il est en train de créer (aucune autorisation ne
   *  peut encore exister) ou de convertir (autorisation déjà vérifiée dans la même méthode). */
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

  // ─── Appartenance à la partie de l'autorisation ──────────────────────────────────────────────

  /** L'événement appartient-il à la partie de l'autorisation ? Sans requête quand l'autorisation a
   *  été délivrée sur cet événement (ou une de ses séances) ; sinon vérifié en base. 404 avec le
   *  message historique dans le cas contraire — jamais d'écriture hors de la partie autorisée. */
  private async assertEventInGrant(grant: PartieGrant, eventId: string): Promise<void> {
    if (grant.target.eventId === eventId) return;
    const count = await this.prisma.event.count({
      where: { id: eventId, partieId: grant.partieId },
    });
    if (count === 0) throw new NotFoundException('Scénario introuvable');
  }

  /** Même garde pour une séance (`Séance introuvable`). */
  private async assertSeanceInGrant(grant: PartieGrant, seanceId: string): Promise<void> {
    if (grant.target.seanceId === seanceId) return;
    const count = await this.prisma.seance.count({
      where: { id: seanceId, event: { partieId: grant.partieId } },
    });
    if (count === 0) throw new NotFoundException('Séance introuvable');
  }

  // ─── Séances ────────────────────────────────────────────────────────────────────────────────

  /** Ajoute une séance à un événement — aucun plafond (Story 8.2, AC1). */
  async addSeance(grant: PartieGrant, eventId: string): Promise<void> {
    await this.assertEventInGrant(grant, eventId);
    await this.prisma.seance.create({ data: { eventId } });
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /**
   * Supprime une séance (Story 8.7). Un événement a toujours au moins une séance — la toute
   * première (par createdAt croissant, id en tie-breaker) ne peut jamais être supprimée (AC5).
   * `Inscription.onDelete: Cascade` emporte les inscriptions liées. Revue de code Story 8.8
   * (décision utilisateur) : sans séance, un vote de date n'a plus de sens — le SessionPoll lié est
   * supprimé plutôt que laissé orphelin ; la Seance d'abord (elle référence le poll en FK). Enfin,
   * la date la plus proche de la Partie peut disparaître → recalcul.
   */
  async deleteSeance(grant: PartieGrant, seance: SeanceRef): Promise<void> {
    await this.assertSeanceInGrant(grant, seance.id);
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
    await this.recalculateNextSession(grant.partieId);
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /**
   * Rattache à une séance le vote de date que `createPoll` crée (Story 8.7). Un seul vote par
   * séance : refus si la séance en porte déjà un, AVANT de créer le vote. `createPoll` est fourni
   * par l'appelant — `PollService` reste le seul écrivain de `SessionPoll` (P2-AD-2) ; ce service
   * ne fait que poser `Seance.pollId`. Non-atomique par construction (risque accepté, Story 8.7).
   */
  async createSeancePoll(
    grant: PartieGrant,
    seance: SeanceRef,
    createPoll: () => Promise<{ id: string }>,
  ): Promise<void> {
    await this.assertSeanceInGrant(grant, seance.id);
    if (seance.pollId) {
      throw new BadRequestException('Cette séance est déjà liée à un vote de date');
    }
    const poll = await createPoll();
    await this.prisma.seance.update({
      where: { id: seance.id },
      data: { pollId: poll.id },
    });
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /**
   * Story 8.8, AC4 : détache le vote de la séance et efface sa plage de date (Story 37.4), PUIS
   * supprime le SessionPoll lui-même (détacher avant de supprimer : FK). La date la plus proche de
   * la Partie peut changer → recalcul.
   */
  async resetSeanceDate(grant: PartieGrant, seance: SeanceRef): Promise<void> {
    await this.assertSeanceInGrant(grant, seance.id);
    await this.prisma.seance.update({
      where: { id: seance.id },
      data: {
        pollId: null,
        startDate: null,
        startSlot: null,
        endDate: null,
        endSlot: null,
        reminderSentAt: null,
      },
    });
    if (seance.pollId) {
      await this.prisma.sessionPoll.delete({ where: { id: seance.pollId } });
    }
    await this.recalculateNextSession(grant.partieId);
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /**
   * `SeanceDatePort` (Story 37.8) : pose la plage de date de la séance rattachée au vote `pollId`
   * depuis l'option choisie — `start = end` (seules plages écrites à ce palier, Story 37.4) —
   * puis recalcule `Partie.nextSessionDate/Slot`, le tout DANS la transaction de l'appelant
   * (`PollService.choose`) : le vote clos, la date de la séance et la prochaine séance sont écrits
   * ensemble ou pas du tout. Un vote sans séance rattachée (vote de partie hérité) ne touche
   * aucune séance mais recalcule quand même la partie du vote. N'émet jamais.
   */
  async chooseDate(
    tx: Prisma.TransactionClient,
    pollId: string,
    date: Date,
    slot: DaySlot,
  ): Promise<void> {
    // Le vote est cherché AVANT toute écriture : un vote introuvable échoue sans rien avoir écrit.
    const poll = await tx.sessionPoll.findUnique({
      where: { id: pollId },
      select: { partieId: true },
    });
    if (!poll) throw new NotFoundException('Poll introuvable');
    await tx.seance.updateMany({
      where: { pollId },
      // Nouvelle date → le rappel de la veille de cette séance est ré-armé (Story 37.9).
      data: {
        startDate: date,
        startSlot: slot,
        endDate: date,
        endSlot: slot,
        reminderSentAt: null,
      },
    });
    await this.recalculateNextSessionInTx(tx, poll.partieId);
  }

  /** Capacité d'inscription d'une séance (Story 8.3). */
  async setSeanceCapacity(
    grant: PartieGrant,
    seanceId: string,
    inscriptionMin: number,
    inscriptionMax: number,
  ): Promise<void> {
    await this.assertSeanceInGrant(grant, seanceId);
    if (inscriptionMax < inscriptionMin) {
      throw new BadRequestException('Le maximum doit être supérieur ou égal au minimum');
    }
    await this.prisma.seance.update({
      where: { id: seanceId },
      data: { inscriptionMin, inscriptionMax },
    });
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /** Informations pratiques d'une séance (Story 36.5, dérogation D-15 amendée le 2026-08-19).
   *  🚨 Les trois valeurs sont écrites TELLES QUELLES : `heureRdv` est une étiquette `"HH:MM"`,
   *  jamais parsée, convertie ni comparée (addendum §5.7). `null` vide le champ. */
  async setInfosPratiques(
    grant: PartieGrant,
    seanceId: string,
    dto: SeanceInfosPratiques,
  ): Promise<void> {
    await this.assertSeanceInGrant(grant, seanceId);
    // Un seul update pour les trois champs : ils sont saisis ensemble.
    await this.prisma.seance.update({
      where: { id: seanceId },
      data: {
        heureRdv: dto.heureRdv,
        lieu: dto.lieu,
        notePratique: dto.notePratique,
      },
    });
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  // ─── Inscriptions ───────────────────────────────────────────────────────────────────────────

  /**
   * Inscription à capacité limitée (Story 8.3). AD-5 (verbatim) : verrou de ligne explicite
   * SELECT ... FOR UPDATE obligatoire — READ COMMITTED seul ne suffit pas à empêcher un dépassement
   * de max entre deux inscriptions concurrentes.
   */
  async inscrire(grant: PartieGrant, seance: SeanceDated, userId: string): Promise<void> {
    await this.assertSeanceInGrant(grant, seance.id);
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
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  /**
   * Retrait d'inscription — deleteMany (pas delete) : idempotent si l'utilisateur n'était pas
   * inscrit. Décision utilisateur (revue de code, 2026-07-14) : la date validée fige le roster.
   */
  async desinscrire(
    grant: PartieGrant,
    seance: Omit<SeanceDated, 'inscriptionMax'>,
    userId: string,
  ): Promise<void> {
    await this.assertSeanceInGrant(grant, seance.id);
    if (seance.startDate) {
      throw new BadRequestException(FROZEN_ROSTER_MESSAGE);
    }
    await this.prisma.inscription.deleteMany({ where: { seanceId: seance.id, userId } });
    this.realtimeEvents.emit(partieTopic(grant.partieId));
  }

  // ─── Prochaine séance ───────────────────────────────────────────────────────────────────────

  /**
   * Story 8.8 (Décision 2) : un seul vote actif par Séance — Partie.nextSessionDate/nextSessionSlot
   * reflètent la date la plus proche dans le futur parmi TOUTES les séances de la Partie
   * (début de leur plage, Story 37.4). Appelé après tout événement pouvant faire changer cette date :
   * choix d'un vote (`chooseDate`), réinitialisation ou suppression d'une séance. Ne touche pas
   * aux rappels : ils sont portés par chaque séance (Story 37.9).
   */
  async recalculateNextSession(partieId: string): Promise<void> {
    await this.recomputeNextSession(this.prisma, partieId);
  }

  /**
   * Story 37.8 (AD-15) : SEUL écrivain de `Partie.nextSessionDate/nextSessionSlot`. Variante à
   * exécuter dans la transaction de l'appelant (`chooseDate`) ; `recalculateNextSession` calcule
   * hors transaction. N'émet jamais.
   *
   * Prend un verrou de ligne sur la partie AVANT de lire les séances : sous READ COMMITTED, deux
   * votes de la même partie choisis en même temps recalculeraient chacun depuis un instantané
   * privé de la plage non validée de l'autre, et le dernier à écrire figerait une valeur périmée.
   * Le verrou les sérialise : le second relit les séances une fois le premier validé.
   */
  async recalculateNextSessionInTx(
    tx: Prisma.TransactionClient,
    partieId: string,
  ): Promise<NextSession> {
    await tx.$queryRaw`SELECT "id" FROM "Partie" WHERE "id" = ${partieId} FOR UPDATE`;
    return this.recomputeNextSession(tx, partieId);
  }

  private async recomputeNextSession(
    tx: Prisma.TransactionClient,
    partieId: string,
  ): Promise<NextSession> {
    // Anti-spoil serveur : la valeur est UNIQUE et persistée, partagée par tous les lecteurs (MJ
    // compris) — les séances d'un brouillon caché n'y entrent donc jamais, sans quoi un joueur lirait
    // la date d'un scénario qu'il ne doit pas voir. Elles y entrent à l'ouverture du scénario.
    const seances = await tx.seance.findMany({
      where: { AND: [{ event: { partieId } }, VISIBLE_SEANCE_WHERE] },
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

    const next: NextSession = {
      nextSessionDate: nearest?.date ?? null,
      nextSessionSlot: nearest?.slot ?? null,
    };
    await tx.partie.update({ where: { id: partieId }, data: next });
    return next;
  }

  // ─── Ports du calendrier (Story 37.8) ───────────────────────────────────────────────────────

  /**
   * `OccupiedSpansPort` (AD-9) : pour chaque utilisateur demandé, les plages occupées par une
   * séance datée de N'IMPORTE LAQUELLE de ses parties (propriétaire ou membre) — pas seulement
   * celle consultée par l'appelant. La sortie est réduite à `{ date, slot }` : jamais une identité
   * de partie/scénario, la non-fuite cross-partie découle directement de cette forme.
   *
   * Participant d'une séance datée : ONE_SHOT/CAMPAGNE_LINEAIRE → tous les membres + le
   * propriétaire (aucune présence individuelle dans ces kinds) ; CAMPAGNE_EPISODIQUE → le
   * propriétaire + les seuls utilisateurs inscrits (`Inscription`) à CETTE séance — un joueur non
   * inscrit n'est engagé sur rien.
   *
   * Deux requêtes Prisma au total, jamais une par utilisateur ni par partie (pas de N+1).
   */
  async occupiedSpansOf(userIds: string[]): Promise<Map<string, OccupiedSpan[]>> {
    const map = new Map<string, OccupiedSpan[]>();
    for (const userId of userIds) map.set(userId, []);

    const parties = await this.prisma.partie.findMany({
      where: {
        OR: [{ ownerId: { in: userIds } }, { memberships: { some: { userId: { in: userIds } } } }],
      },
      select: {
        id: true,
        kind: true,
        ownerId: true,
        memberships: { select: { userId: true } },
      },
    });
    if (parties.length === 0) return map;

    const partieIds = parties.map((p) => p.id);
    const partieById = new Map(parties.map((p) => [p.id, p]));
    const seances = await this.prisma.seance.findMany({
      where: { event: { partieId: { in: partieIds } } },
      include: {
        inscriptions: { select: { userId: true } },
        event: { select: { partieId: true } },
      },
    });

    const requested = new Set(userIds);

    for (const seance of seances) {
      // Story 37.4 : la plage de la séance est la seule source ; créneau vide = FULL_DAY ici.
      const date = seance.startDate;
      if (!date) continue;
      const slot = seance.startSlot ?? 'FULL_DAY';

      const partie = partieById.get(seance.event.partieId);
      if (!partie) continue; // partie hors du périmètre résolu ci-dessus

      // Propriétaire absent (AD-5, compte supprimé) : seuls les membres/inscrits sont concernés.
      const ownerIds = partie.ownerId === null ? [] : [partie.ownerId];
      const participantIds =
        partie.kind === 'CAMPAGNE_EPISODIQUE'
          ? new Set([...ownerIds, ...seance.inscriptions.map((i) => i.userId)])
          : new Set([...ownerIds, ...partie.memberships.map((m) => m.userId)]);

      const dayUtc = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );

      for (const userId of participantIds) {
        // Copie par entrée : chaque utilisateur reçoit son propre objet, jamais une référence
        // partagée avec les autres participants de la même séance.
        if (requested.has(userId)) map.get(userId)!.push({ date: new Date(dayUtc), slot });
      }
    }

    return map;
  }

  /**
   * `OwnEventsPort` : le calendrier personnel d'un utilisateur — ses parties (propriétaire ou
   * membre) et, en UNE lecture groupée des séances de toutes ces parties (AD-3, jamais une
   * itération par partie), les couches `mes-seances` et `inscriptions-ouvertes`. Identité de
   * partie/scénario incluse : ce sont ses propres parties.
   */
  async ownEventsOf(
    userId: string,
    roles: OwnRolesResolver,
    range: OwnEventsRange,
  ): Promise<OwnEvents> {
    const parties = await this.prisma.partie.findMany({
      where: { OR: [{ ownerId: userId }, { memberships: { some: { userId } } }] },
      select: { id: true, name: true, kind: true },
    });
    if (parties.length === 0) return { parties: [], seances: [], inscriptionsOuvertes: [] };

    const partieIds = parties.map((p) => p.id);
    const partieById = new Map(parties.map((p) => [p.id, p]));

    const [seances, roleByPartie] = await Promise.all([
      this.prisma.seance.findMany({
        where: { event: { partieId: { in: partieIds } } },
        include: {
          inscriptions: { select: { userId: true } },
          event: {
            select: { partieId: true, title: true, scenario: { select: { status: true } } },
          },
        },
      }),
      // Rôle de l'utilisateur sur chacune de ses parties, en UNE requête (jamais une par partie).
      roles(partieIds),
    ]);

    const mySeances: MyCalendarSeanceEntry[] = [];
    const openInscriptions: MyCalendarOpenInscriptionEntry[] = [];
    for (const s of seances) {
      const partie = partieById.get(s.event.partieId);
      if (!partie) continue;

      // Anti-spoil serveur : tout rôle autre que MJ (inconnu compris) ignore les séances d'un
      // brouillon caché ; seul le MJ voit tout.
      if (
        isSpoilRestricted(roleByPartie.get(partie.id)) &&
        s.event.scenario &&
        isHiddenDraft(s.event.scenario.status, partie.kind)
      ) {
        continue;
      }

      // Mes séances datées dans la fenêtre. Pour une partie CAMPAGNE_EPISODIQUE, une séance n'est
      // « mienne » que si j'y suis inscrit (ou MJ) — même règle « participant » qu'`occupiedSpansOf`
      // (AD-9), sinon un membre non inscrit verrait listée comme sienne une séance à laquelle il
      // ne participe pas.
      const date = s.startDate;
      const notMine =
        partie.kind === 'CAMPAGNE_EPISODIQUE' &&
        roleByPartie.get(partie.id) !== 'mj' &&
        !s.inscriptions.some((i) => i.userId === userId);
      if (date && date.getTime() >= range.fromMs && date.getTime() <= range.toMs && !notMine) {
        mySeances.push({
          seanceId: s.id,
          partieId: partie.id,
          partieName: partie.name,
          scenarioId: s.eventId,
          scenarioTitle: s.event.title,
          date: date.toISOString().substring(0, 10),
          // AC5 : créneau de la plage de la séance (Story 37.4), FULL_DAY à défaut — jamais une
          // supposition locale à l'appelant.
          slot: s.startSlot ?? 'FULL_DAY',
          // Story 36.5 — transmis tels quels. `heureRdv` reste une CHAÎNE : rien ici ne la parse
          // ni ne la compare, et elle n'entre pas dans le calcul de statut de créneau (AD-9).
          heureRdv: s.heureRdv ?? null,
          lieu: s.lieu ?? null,
          notePratique: s.notePratique ?? null,
          // Story 36.16 — même formule que `CalendarView.allCalendarEntries()` (front) : une
          // chaîne vide ou uniquement des espaces compte comme manquant.
          compteRenduManquant: !s.compteRendu?.trim(),
        });
      }

      // Séances à inscription ouverte de mes parties CAMPAGNE_EPISODIQUE — jamais filtrées par
      // fenêtre (D-13, Story 30.5) : une séance en attente d'inscriptions n'a pas encore de date.
      // Une date validée (plage de la séance) fige le roster (`inscrire()`) : plus « ouverte ».
      if (s.inscriptionMax != null && !s.startDate && partie.kind === 'CAMPAGNE_EPISODIQUE') {
        openInscriptions.push({
          seanceId: s.id,
          partieId: partie.id,
          partieName: partie.name,
          scenarioId: s.eventId,
          scenarioTitle: s.event.title,
          inscriptionMin: s.inscriptionMin ?? 0,
          inscriptionMax: s.inscriptionMax,
          inscritsCount: s.inscriptions.length,
          jeSuisInscrit: s.inscriptions.some((i) => i.userId === userId),
        });
      }
    }

    return { parties, seances: mySeances, inscriptionsOuvertes: openInscriptions };
  }
}
