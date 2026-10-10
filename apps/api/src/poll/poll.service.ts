import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DaySlot, SessionPollDto } from '@master-jdr/shared';
import { countParticipants } from '../common/participant-count.util';
import { PermissionService, type PartieGrant } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { Prisma } from '@prisma/client';
import { SetPollOptionsDto } from './dto/set-poll-options.dto';
import { PARTIE_SIGNALS_PORT, type PartieSignalsPort } from './ports/partie-signals.port';
import { SEANCE_DATE_PORT, type SeanceDatePort } from './ports/seance-date.port';

const DEFAULT_POLL_TTL_MS = 14 * 24 * 60 * 60 * 1000; // défaut 14 jours

const POLL_INCLUDE = {
  options: {
    include: {
      votes: {
        include: { user: { select: { pseudo: true, displayName: true } } },
      },
    },
  },
} as const;

@Injectable()
export class PollService {
  constructor(
    private readonly prisma: PrismaService,
    // Story 37.6 (AD-6) : tout droit sur une partie est décidé par le service de permission. Les
    // routes de vote gardent la cible `{ partieId }` de l'URL plus leurs propres contrôles
    // d'appartenance (vote → partie, option → vote).
    private readonly permissions: PermissionService,
    private readonly realtimeEvents: RealtimeEventsService,
    // Story 37.8 (AD-8) : couche 1 — les deux dépendances vers les couches supérieures sont des
    // ports (`poll/ports/`), liés par `PortsModule` : la date de la séance (écrite dans la
    // transaction de clôture du vote, avec `Partie.nextSessionDate/Slot`, seul écrivain
    // `events/`) et les signaux de partie (émis par `parties/`).
    @Inject(SEANCE_DATE_PORT) private readonly seanceDate: SeanceDatePort,
    @Inject(PARTIE_SIGNALS_PORT) private readonly partieSignals: PartieSignalsPort,
  ) {}

  /** Crée un vote de date sur la partie de l'autorisation. Seul appelant :
   *  `ScenariosService.createSeancePoll()`, qui a déjà obtenu l'autorisation `SEANCE_POLL_CREATE`
   *  pour la séance visée (Story 37.6 : plus de second contrôle de droit ici). */
  async create(grant: PartieGrant, userId: string, dto: CreatePollDto): Promise<SessionPollDto> {
    const partieId = grant.partieId;

    // Revue de code (Story 36.10) — clé normalisée par `optionKey()`, la MÊME que celle de
    // `setOptions()` : comparer la chaîne brute reçue laissait deux dates représentant le même
    // instant (composante horaire ou décalage différents) passer pour distinctes, ce que
    // `@IsDateString()` autorise en entrée.
    const seen = new Set<string>();
    for (const o of dto.options) {
      const key = optionKey(new Date(o.date), o.slot);
      if (seen.has(key)) throw new BadRequestException('Options dupliquées (même date et créneau)');
      seen.add(key);
    }

    const poll = await this.prisma.$transaction(async (tx) => {
      // Story 8.8 (Décision 2) : un seul vote actif par Séance, pas par Partie — plusieurs
      // SessionPoll OPEN peuvent désormais coexister sur la même Partie (un par Séance). La garde
      // « déjà liée à un vote de date » de ScenariosService.createSeancePoll() (Story 8.7) suffit à
      // garantir l'unicité au niveau Séance ; retiré : la fermeture auto de tout poll OPEN existant.
      return tx.sessionPoll.create({
        data: {
          partieId,
          createdById: userId,
          scenarioRef: dto.scenarioRef ?? null,
          expiresAt: new Date(Date.now() + DEFAULT_POLL_TTL_MS),
          options: {
            create: dto.options.map((o) => ({
              date: new Date(o.date),
              slot: o.slot,
            })),
          },
        },
        include: POLL_INCLUDE,
      });
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    // AUCUNE_DATE_NI_VOTE (Story 29.7, AD-14) : en plus de partieTopic ci-dessus, jamais en
    // remplacement.
    await this.partieSignals.notifyChanged(partieId);
    return toDto(poll, await countParticipants(this.prisma, partieId));
  }

  async findOpen(partieId: string, userId: string): Promise<SessionPollDto | null> {
    await this.permissions.assert(userId, 'POLL_READ', { partieId });
    const poll = await this.prisma.sessionPoll.findFirst({
      where: { partieId, status: 'OPEN' },
      include: POLL_INCLUDE,
    });
    return poll ? toDto(poll, await countParticipants(this.prisma, partieId)) : null;
  }

  async castVote(
    partieId: string,
    pollId: string,
    userId: string,
    dto: CastVoteDto,
  ): Promise<void> {
    await this.permissions.assert(userId, 'POLL_VOTE', { partieId });
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId || poll.status !== 'OPEN') {
      throw new BadRequestException('Poll introuvable ou fermé');
    }
    const option = await this.prisma.pollOption.findUnique({
      where: { id: dto.optionId },
    });
    if (!option || option.pollId !== pollId) {
      throw new BadRequestException('Option introuvable dans ce poll');
    }
    await this.prisma.pollVote.upsert({
      where: { optionId_userId: { optionId: dto.optionId, userId } },
      update: { answer: dto.answer },
      create: {
        pollId,
        optionId: dto.optionId,
        userId,
        answer: dto.answer,
      },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    // VOTE_EN_COURS_SANS_REPONSE (Story 29.7, AD-14) : en plus de partieTopic ci-dessus, jamais en
    // remplacement.
    await this.partieSignals.notifyChanged(partieId);
  }

  /** Retire la réponse de l'appelant sur une option (Story 30.1, AD-10) — supprime la ligne
   *  `PollVote`, jamais une réponse vide : « n'a pas répondu » est déjà représenté par l'absence
   *  de ligne. `userId` vient uniquement de `@CurrentUser()` (jamais de l'URL/du corps), donc le
   *  `where` du `deleteMany` ne peut jamais cibler que la réponse de l'appelant — l'isolation
   *  entre membres est structurelle, pas une vérification ajoutée. `deleteMany` (jamais `delete`
   *  avec la clé composite) rend le retrait idempotent : rejouer un retrait, ou retirer une
   *  réponse jamais posée, ne lève jamais (même garantie que `removeFavorite()`). */
  async withdrawVote(
    partieId: string,
    pollId: string,
    optionId: string,
    userId: string,
  ): Promise<void> {
    await this.permissions.assert(userId, 'POLL_VOTE', { partieId });
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId || poll.status !== 'OPEN') {
      throw new BadRequestException('Poll introuvable ou fermé');
    }
    const option = await this.prisma.pollOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.pollId !== pollId) {
      throw new BadRequestException('Option introuvable dans ce poll');
    }
    await this.prisma.pollVote.deleteMany({
      where: { optionId, userId },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    // VOTE_EN_COURS_SANS_REPONSE (Story 29.7, AD-14) : un retrait peut faire réapparaître ce
    // signal pour ce membre — même raisonnement que castVote(), en plus de partieTopic ci-dessus,
    // jamais en remplacement.
    await this.partieSignals.notifyChanged(partieId);
  }

  async choose(
    partieId: string,
    pollId: string,
    userId: string,
    dto: ChooseDateDto,
  ): Promise<void> {
    await this.permissions.assert(userId, 'POLL_CHOOSE', { partieId });
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
    if (poll.status !== 'OPEN') throw new BadRequestException('Le poll est déjà fermé');
    const option = await this.prisma.pollOption.findUnique({
      where: { id: dto.optionId },
    });
    if (!option || option.pollId !== pollId) throw new NotFoundException('Option introuvable');
    // Story 37.8 (AD-15) : le vote clos, la plage de la séance rattachée et la prochaine séance de
    // la partie sont écrits ensemble ou pas du tout. Ce service n'écrit QUE le vote : la date de
    // séance et `Partie.nextSessionDate/Slot` (recalculé comme la plus proche séance à venir, une
    // date passée n'est pas retenue) sont l'affaire du port, dans cette même transaction. Le même
    // port ré-arme le rappel de la veille de la séance (`Seance.reminderSentAt`, Story 37.9).
    await this.prisma.$transaction(async (tx) => {
      await tx.sessionPoll.update({
        where: { id: pollId },
        data: {
          status: 'CLOSED',
          chosenDate: option.date,
          chosenSlot: option.slot,
        },
      });
      await this.seanceDate.chooseDate(tx, pollId, option.date, option.slot);
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    // AUCUNE_DATE_NI_VOTE/PROCHAINE_SEANCE_CONNUE (Story 29.7, AD-14) : en plus de partieTopic
    // ci-dessus, jamais en remplacement.
    await this.partieSignals.notifyChanged(partieId);
  }

  /**
   * Story 36.10 (dérogation D-16) — remplace le jeu d'options d'un vote **OUVERT** par celui que
   * le MJ vient de composer sur la grille. MJ seul (`POLL_OPTIONS_SET`).
   *
   * 🚨 **RÉCONCILIATION, JAMAIS REMPLACEMENT.** `PollVote` est en cascade sur `PollOption`
   * (`schema.prisma:313`) : supprimer toutes les options pour les recréer détruirait les réponses
   * de TOUS les membres à chaque ajout d'une seule date. La comparaison se fait sur la clé métier
   * `date|slot` — la même que celle du dédoublonnage de `create()` — et **une option conservée
   * garde son `id` et ne subit aucune écriture**. Seules les options réellement retirées perdent
   * leurs réponses, ce que Q-22 autorise sous avertissement préalable côté client.
   *
   * Le jeu reçu est **déclaratif et complet** : ce qui n'y est pas est retiré.
   */
  async setOptions(
    partieId: string,
    pollId: string,
    userId: string,
    dto: SetPollOptionsDto,
  ): Promise<SessionPollDto> {
    await this.permissions.assert(userId, 'POLL_OPTIONS_SET', { partieId });

    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
      include: POLL_INCLUDE,
    });
    // Le poll doit appartenir à la partie de l'URL : sans cette vérification, un MJ pourrait
    // muter le vote d'une AUTRE partie en forgeant un pollId (même garde que castVote/choose).
    if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
    if (poll.status !== 'OPEN') throw new BadRequestException('Le poll est déjà fermé');

    // Bornes redites ici, en plus du DTO : le service est appelable sans passer par le pipe de
    // validation (tests, orchestration cross-module), et c'est lui qui porte l'invariant.
    if (dto.options.length < 2 || dto.options.length > 40)
      throw new BadRequestException('Un vote porte de 2 à 40 créneaux');

    const wanted = new Map<string, { date: Date; slot: DaySlot }>();
    for (const o of dto.options) {
      const date = new Date(o.date);
      const key = optionKey(date, o.slot);
      if (wanted.has(key))
        throw new BadRequestException('Options dupliquées (même date et créneau)');
      wanted.set(key, { date, slot: o.slot });
    }

    const existing = new Map<string, string>(); // clé métier → id d'option
    for (const opt of poll.options) {
      existing.set(optionKey(opt.date, opt.slot), opt.id);
    }

    const toDeleteIds = [...existing.entries()]
      .filter(([key]) => !wanted.has(key))
      .map(([, id]) => id);
    const toCreate = [...wanted.entries()]
      .filter(([key]) => !existing.has(key))
      .map(([, o]) => ({ pollId, date: o.date, slot: o.slot }));

    // Une seule transaction : un retrait appliqué sans son ajout laisserait le vote dans un état
    // que le MJ n'a jamais demandé.
    await this.prisma.$transaction(async (tx) => {
      if (toDeleteIds.length > 0) {
        // La cascade `onDelete: Cascade` de PollVote → PollOption emporte les réponses de ces
        // options, et d'elles seules.
        await tx.pollOption.deleteMany({ where: { id: { in: toDeleteIds } } });
      }
      if (toCreate.length > 0) {
        await tx.pollOption.createMany({ data: toCreate });
      }
    });

    const updated = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
      include: POLL_INCLUDE,
    });
    // Revue de code — même garde qu'à la lecture initiale : rien ne supprime un `SessionPoll`
    // aujourd'hui, donc ce cas est inatteignable en pratique, mais `toDto(null, ...)` planterait
    // en erreur non contrôlée plutôt qu'en 404 propre si ça changeait un jour.
    if (!updated) throw new NotFoundException('Poll introuvable');
    this.realtimeEvents.emit(partieTopic(partieId));
    // VOTE_EN_COURS_SANS_REPONSE (Story 29.7, AD-14) : ajouter une option fait RÉAPPARAÎTRE ce
    // signal chez les membres qui avaient tout répondu ; en retirer une peut le faire
    // disparaître. En plus de partieTopic ci-dessus, jamais en remplacement.
    await this.partieSignals.notifyChanged(partieId);
    return toDto(updated, await countParticipants(this.prisma, partieId));
  }

  async close(partieId: string, pollId: string, userId: string): Promise<void> {
    await this.permissions.assert(userId, 'POLL_CLOSE', { partieId });
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
    if (poll.status !== 'OPEN') throw new BadRequestException('Le poll est déjà fermé');
    await this.prisma.sessionPoll.update({
      where: { id: pollId },
      data: { status: 'CLOSED' },
    });
    this.realtimeEvents.emit(partieTopic(partieId));
    // VOTE_EN_COURS_SANS_REPONSE/AUCUNE_DATE_NI_VOTE (Story 29.7, AD-14) : en plus de partieTopic
    // ci-dessus, jamais en remplacement.
    await this.partieSignals.notifyChanged(partieId);
  }
}

/** Story 36.10 (revue de code) — clé métier d'une option : `date|slot`, normalisée. Point UNIQUE
 *  de la définition, partagé par le dédoublonnage de `create()` **et** la comparaison
 *  « existante » / « voulue » de `setOptions()`. Une option se reconnaît par ce qu'elle propose,
 *  jamais par sa position dans la liste — et deux dates représentant le même instant sous des
 *  formats différents (composante horaire, décalage) doivent produire la MÊME clé, sans quoi
 *  `create()` laisserait passer un doublon que `setOptions()` traiterait différemment. */
function optionKey(date: Date, slot: string): string {
  return `${date.toISOString()}|${slot}`;
}

/** Story 36.6 — `membersCount` est passé en paramètre (jamais dérivé de `poll`) : c'est une
 *  propriété de la PARTIE, et le point unique qui la calcule est `countParticipants()`. */
function toDto(
  poll: Prisma.SessionPollGetPayload<{ include: typeof POLL_INCLUDE }>,
  membersCount: number,
): SessionPollDto {
  return {
    id: poll.id,
    partieId: poll.partieId,
    status: poll.status,
    scenarioRef: poll.scenarioRef,
    expiresAt: poll.expiresAt?.toISOString() ?? null,
    chosenDate: poll.chosenDate?.toISOString() ?? null,
    chosenSlot: poll.chosenSlot,
    membersCount,
    options: (poll.options ?? []).map((opt) => ({
      id: opt.id,
      date: opt.date.toISOString(),
      slot: opt.slot,
      votes: (opt.votes ?? []).map((v) => ({
        userId: v.userId,
        pseudo: v.user.pseudo,
        displayName: v.user.displayName,
        answer: v.answer,
      })),
    })),
  };
}
