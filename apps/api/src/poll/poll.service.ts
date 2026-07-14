import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionPollDto } from '@master-jdr/shared';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { CreatePollDto } from './dto/create-poll.dto';

const POLL_INCLUDE = {
  options: {
    include: { votes: { include: { user: { select: { pseudo: true } } } } },
  },
} as const;

@Injectable()
export class PollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async create(
    partieId: string,
    userId: string,
    dto: CreatePollDto,
  ): Promise<SessionPollDto> {
    await this.parties.getOwned(partieId, userId);

    const seen = new Set<string>();
    for (const o of dto.options) {
      const key = `${o.date}|${o.slot}`;
      if (seen.has(key))
        throw new BadRequestException(
          'Options dupliquées (même date et créneau)',
        );
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
          options: {
            create: dto.options.map((o) => ({
              date: new Date(o.date),
              slot: o.slot as any,
            })),
          },
        },
        include: POLL_INCLUDE,
      });
    });
    return toDto(poll);
  }

  async findOpen(
    partieId: string,
    userId: string,
  ): Promise<SessionPollDto | null> {
    await this.parties.getViewable(partieId, userId);
    const poll = await this.prisma.sessionPoll.findFirst({
      where: { partieId, status: 'OPEN' },
      include: POLL_INCLUDE,
    });
    return poll ? toDto(poll) : null;
  }

  async castVote(
    partieId: string,
    pollId: string,
    userId: string,
    dto: CastVoteDto,
  ): Promise<void> {
    await this.parties.getViewable(partieId, userId);
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
      update: { answer: dto.answer as any },
      create: {
        pollId,
        optionId: dto.optionId,
        userId,
        answer: dto.answer as any,
      },
    });
  }

  async choose(
    partieId: string,
    pollId: string,
    userId: string,
    dto: ChooseDateDto,
  ): Promise<void> {
    const partie = await this.parties.getOwned(partieId, userId);
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId)
      throw new NotFoundException('Poll introuvable');
    if (poll.status !== 'OPEN')
      throw new BadRequestException('Le poll est déjà fermé');
    const option = await this.prisma.pollOption.findUnique({
      where: { id: dto.optionId },
    });
    if (!option || option.pollId !== pollId)
      throw new NotFoundException('Option introuvable');
    await this.prisma.sessionPoll.update({
      where: { id: pollId },
      data: {
        status: 'CLOSED',
        chosenDate: option.date,
        chosenSlot: option.slot,
      },
    });
    // Ne remettre reminderSentAt à null que si la date/le créneau change réellement — une
    // re-confirmation du créneau déjà actif ne doit pas annuler un rappel déjà envoyé.
    const dateUnchanged =
      partie.nextSessionDate?.getTime() === option.date.getTime() &&
      partie.nextSessionSlot === option.slot;
    await this.prisma.partie.update({
      where: { id: partieId },
      data: {
        nextSessionDate: option.date,
        nextSessionSlot: option.slot,
        ...(dateUnchanged ? {} : { reminderSentAt: null }),
      },
    });
  }

  async close(partieId: string, pollId: string, userId: string): Promise<void> {
    await this.parties.getOwned(partieId, userId);
    const poll = await this.prisma.sessionPoll.findUnique({
      where: { id: pollId },
    });
    if (!poll || poll.partieId !== partieId)
      throw new NotFoundException('Poll introuvable');
    if (poll.status !== 'OPEN')
      throw new BadRequestException('Le poll est déjà fermé');
    await this.prisma.sessionPoll.update({
      where: { id: pollId },
      data: { status: 'CLOSED' },
    });
  }
}

function toDto(poll: any): SessionPollDto {
  return {
    id: poll.id,
    partieId: poll.partieId,
    status: poll.status,
    scenarioRef: poll.scenarioRef,
    expiresAt: poll.expiresAt?.toISOString() ?? null,
    chosenDate: poll.chosenDate?.toISOString() ?? null,
    chosenSlot: poll.chosenSlot,
    options: (poll.options ?? []).map((opt: any) => ({
      id: opt.id,
      date: opt.date.toISOString(),
      slot: opt.slot,
      votes: (opt.votes ?? []).map((v: any) => ({
        userId: v.userId,
        pseudo: v.user.pseudo,
        answer: v.answer,
      })),
    })),
  };
}
