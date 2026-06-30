import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PollService } from './poll.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

function makePrisma() {
  return {
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

  it("create() sans poll OPEN → crée sans appeler updateMany", async () => {
    prisma.sessionPoll.findFirst.mockResolvedValue(null);
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it("create() avec poll OPEN existant → ferme l'existant puis crée", async () => {
    prisma.sessionPoll.findFirst.mockResolvedValue({ id: 'old-poll' });
    prisma.sessionPoll.updateMany.mockResolvedValue({ count: 1 });
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    const updateCall = prisma.sessionPoll.updateMany.mock.invocationCallOrder[0];
    const createCall = prisma.sessionPoll.create.mock.invocationCallOrder[0];
    expect(updateCall).toBeLessThan(createCall);
  });

  it('castVote() deux fois sur la même option → upsert (pas de doublon)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({ id: 'poll1', partieId: 'p1', status: 'OPEN' });
    prisma.pollOption.findUnique.mockResolvedValue({ id: 'opt1', pollId: 'poll1' });
    prisma.pollVote.upsert.mockResolvedValue({});
    await service.castVote('p1', 'poll1', 'u1', { optionId: 'opt1', answer: 'YES' });
    await service.castVote('p1', 'poll1', 'u1', { optionId: 'opt1', answer: 'NO' });
    expect(prisma.pollVote.upsert).toHaveBeenCalledTimes(2);
    const calls = prisma.pollVote.upsert.mock.calls;
    expect(calls[0][0].where).toEqual({ optionId_userId: { optionId: 'opt1', userId: 'u1' } });
    expect(calls[1][0].where).toEqual({ optionId_userId: { optionId: 'opt1', userId: 'u1' } });
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
    prisma.sessionPoll.findUnique.mockResolvedValue({ id: 'poll1', partieId: 'p1', status: 'OPEN' });
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
      data: { nextSessionDate: d, nextSessionSlot: 'MORNING' },
    });
  });
});
