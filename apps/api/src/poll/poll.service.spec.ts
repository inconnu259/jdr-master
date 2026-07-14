import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PollService } from './poll.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

function makePrisma() {
  const prisma: any = {
    sessionPoll: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    pollVote: {
      upsert: jest.fn(),
    },
    pollOption: {
      findUnique: jest.fn(),
    },
    partie: {
      update: jest.fn(),
    },
  };
  // $transaction exécute le callback avec le même mock en guise de `tx`
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

function opt(date: string, slot: string) {
  return { date, slot };
}

function makePoll() {
  return {
    id: 'poll1',
    partieId: 'p1',
    status: 'OPEN',
    scenarioRef: null,
    expiresAt: null,
    chosenDate: null,
    chosenSlot: null,
    createdById: 'mj1',
    createdAt: new Date(),
    options: [],
  };
}

describe('PollService', () => {
  let service: PollService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;

  beforeEach(async () => {
    prisma = makePrisma();
    parties = makePartiesService();
    const module = await Test.createTestingModule({
      providers: [
        PollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
      ],
    }).compile();
    service = module.get(PollService);
  });

  it('create() → crée sans jamais appeler findFirst/updateMany (Story 8.8)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.sessionPoll.findFirst).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it('create() avec un poll OPEN déjà existant sur la Partie → ne le ferme pas (Story 8.8, un vote par Séance, pas par Partie)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.sessionPoll.findFirst).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it('create() → exécute create dans une transaction Prisma', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('create() avec deux options (date,slot) identiques → BadRequestException', async () => {
    await expect(
      service.create('p1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-01', 'MORNING')],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('castVote() deux fois sur la même option → upsert (pas de doublon)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.pollOption.findUnique.mockResolvedValue({
      id: 'opt1',
      pollId: 'poll1',
    });
    prisma.pollVote.upsert.mockResolvedValue({});
    await service.castVote('p1', 'poll1', 'u1', {
      optionId: 'opt1',
      answer: 'YES',
    });
    await service.castVote('p1', 'poll1', 'u1', {
      optionId: 'opt1',
      answer: 'NO',
    });
    expect(prisma.pollVote.upsert).toHaveBeenCalledTimes(2);
    const calls = prisma.pollVote.upsert.mock.calls;
    expect(calls[0][0].where).toEqual({
      optionId_userId: { optionId: 'opt1', userId: 'u1' },
    });
    expect(calls[1][0].where).toEqual({
      optionId_userId: { optionId: 'opt1', userId: 'u1' },
    });
  });

  it('choose() par non-MJ → ForbiddenException', async () => {
    parties.getOwned.mockRejectedValue(new ForbiddenException());
    await expect(
      service.choose('p1', 'poll1', 'joueur1', { optionId: 'opt1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('choose() → positionne chosenDate/chosenSlot, ferme le poll, met à jour Partie', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.pollOption.findUnique.mockResolvedValue({
      id: 'opt1',
      pollId: 'poll1',
      date: d,
      slot: 'MORNING',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    prisma.partie.update.mockResolvedValue({});
    await service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(prisma.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED', chosenDate: d, chosenSlot: 'MORNING' },
    });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        nextSessionDate: d,
        nextSessionSlot: 'MORNING',
        reminderSentAt: null,
      },
    });
  });

  it('choose() sur le même créneau déjà actif → ne remet PAS reminderSentAt à null', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    parties.getOwned.mockResolvedValue({
      id: 'p1',
      mjId: 'mj1',
      nextSessionDate: d,
      nextSessionSlot: 'MORNING',
    });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.pollOption.findUnique.mockResolvedValue({
      id: 'opt1',
      pollId: 'poll1',
      date: d,
      slot: 'MORNING',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    prisma.partie.update.mockResolvedValue({});
    await service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { nextSessionDate: d, nextSessionSlot: 'MORNING' },
    });
  });

  it('close() sur un poll OPEN → le ferme', async () => {
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(prisma.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED' },
    });
  });

  it('close() sur un poll déjà CLOSED → BadRequestException', async () => {
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'CLOSED',
    });
    await expect(service.close('p1', 'poll1', 'mj1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.sessionPoll.update).not.toHaveBeenCalled();
  });
});
