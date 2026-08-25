import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PollService } from './poll.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import {
  RealtimeEventsService,
  partieTopic,
} from '../realtime/realtime-events.service';

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
      deleteMany: jest.fn(),
    },
    pollOption: {
      findUnique: jest.fn(),
      // Story 36.10 — la mutation d'options n'utilise QUE ces trois-là. `update` est présent
      // uniquement pour pouvoir asserter qu'il n'est JAMAIS appelé : une option conservée garde
      // son id et ne subit aucune écriture.
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    partie: {
      update: jest.fn(),
    },
    // Story 36.6 — effectif de la troupe porté par SessionPollDto.membersCount. 0 Membership par
    // défaut, ce qui donne un effectif de 1 (le MJ) : sans effet sur les tests existants, qui
    // n'assertent pas sur la forme du DTO.
    membership: {
      count: jest.fn().mockResolvedValue(0),
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
    notifyPartieSignalsChanged: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRealtimeEvents() {
  return { emit: jest.fn() };
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
  let realtimeEvents: ReturnType<typeof makeRealtimeEvents>;

  beforeEach(async () => {
    prisma = makePrisma();
    parties = makePartiesService();
    realtimeEvents = makeRealtimeEvents();
    const module = await Test.createTestingModule({
      providers: [
        PollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: RealtimeEventsService, useValue: realtimeEvents },
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

  it('create() → écrit expiresAt à ~14 jours dans le futur (jamais null)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    const before = Date.now();
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    const after = Date.now();
    const data = prisma.sessionPoll.create.mock.calls[0][0].data;
    expect(data.expiresAt).toBeInstanceOf(Date);
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + fourteenDaysMs,
    );
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(
      after + fourteenDaysMs,
    );
  });

  it('create() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('create() → notifie aussi PartiesService.notifyPartieSignalsChanged (Story 29.7, AD-14, signal AUCUNE_DATE_NI_VOTE)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
      'p1',
      'mj1',
    );
  });

  describe('membersCount — effectif de la troupe (Story 36.6, AC7/AC9)', () => {
    it('create() → renvoie un membersCount = MJ + Membership', async () => {
      prisma.membership.count.mockResolvedValue(3);
      prisma.sessionPoll.create.mockResolvedValue(makePoll());
      const dto = await service.create('p1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING')],
      });
      expect(dto.membersCount).toBe(4);
      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { partieId: 'p1' },
      });
    });

    it('findOpen() → renvoie le même effectif que create()', async () => {
      prisma.membership.count.mockResolvedValue(3);
      prisma.sessionPoll.findFirst.mockResolvedValue(makePoll());
      const dto = await service.findOpen('p1', 'u1');
      expect(dto?.membersCount).toBe(4);
    });

    it('une partie sans aucun membre a un effectif de 1 — le MJ, qui vote (castVote garde par getViewable)', async () => {
      prisma.membership.count.mockResolvedValue(0);
      prisma.sessionPoll.findFirst.mockResolvedValue(makePoll());
      const dto = await service.findOpen('p1', 'mj1');
      expect(dto?.membersCount).toBe(1);
    });

    it('findOpen() sans poll ouvert → aucun comptage inutile', async () => {
      prisma.sessionPoll.findFirst.mockResolvedValue(null);
      const dto = await service.findOpen('p1', 'u1');
      expect(dto).toBeNull();
      expect(prisma.membership.count).not.toHaveBeenCalled();
    });
  });

  it('create() avec deux options (date,slot) identiques → BadRequestException', async () => {
    await expect(
      service.create('p1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-01', 'MORNING')],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('🚨 create() — deux options représentant le MÊME instant sous des formats différents → BadRequestException (revue de code, Story 36.10)', async () => {
    // '2026-08-01' et '2026-08-01T00:00:00.000Z' désignent le même instant, mais diffèrent comme
    // chaînes brutes : avant la revue de code, la dédup de create() comparait la chaîne reçue, et
    // ce doublon serait passé — divergent de la clé normalisée qu'utilise setOptions().
    await expect(
      service.create('p1', 'mj1', {
        options: [
          opt('2026-08-01', 'MORNING'),
          opt('2026-08-01T00:00:00.000Z', 'MORNING'),
        ],
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

  it('castVote() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
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
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('castVote() → notifie aussi PartiesService.notifyPartieSignalsChanged (Story 29.7, AD-14, signal VOTE_EN_COURS_SANS_REPONSE)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
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
    expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
      'p1',
      'mj1',
    );
  });

  describe('withdrawVote() (Story 30.1, AD-10)', () => {
    beforeEach(() => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'OPEN',
      });
      prisma.pollOption.findUnique.mockResolvedValue({
        id: 'opt1',
        pollId: 'poll1',
      });
      prisma.pollVote.deleteMany.mockResolvedValue({ count: 1 });
    });

    it("AC1 — supprime la ligne PollVote de l'appelant sur l'option visée (deleteMany, jamais delete)", async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
        where: { optionId: 'opt1', userId: 'u1' },
      });
    });

    it('AC3 — deux retraits par deux utilisateurs différents ne ciblent jamais le userId de l’autre', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u2');
      const calls = prisma.pollVote.deleteMany.mock.calls;
      expect(calls[0][0].where).toEqual({ optionId: 'opt1', userId: 'u1' });
      expect(calls[1][0].where).toEqual({ optionId: 'opt1', userId: 'u2' });
    });

    it('AC4 — un poll à plusieurs options : le retrait ne cible que l’option visée', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
        where: { optionId: 'opt1', userId: 'u1' },
      });
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalledWith({
        where: { optionId: 'opt2', userId: 'u1' },
      });
    });

    it('idempotent — un second retrait consécutif ne lève jamais (deleteMany tolère 0 ligne)', async () => {
      prisma.pollVote.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.withdrawVote('p1', 'poll1', 'opt1', 'u1'),
      ).resolves.toBeUndefined();
    });

    it('retrait sans avoir jamais voté (aucune ligne à supprimer) → résout normalement', async () => {
      prisma.pollVote.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.withdrawVote('p1', 'poll1', 'opt1', 'u1'),
      ).resolves.toBeUndefined();
    });

    it('sur un poll CLOSED → BadRequestException, aucune suppression', async () => {
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'CLOSED',
      });
      await expect(
        service.withdrawVote('p1', 'poll1', 'opt1', 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled();
    });

    it("option inexistante ou n'appartenant pas à ce poll → BadRequestException", async () => {
      prisma.pollOption.findUnique.mockResolvedValue(null);
      await expect(
        service.withdrawVote('p1', 'poll1', 'opt-inconnu', 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled();
    });

    it('AC5 — n’appelle jamais sessionPoll.update (indépendant de close())', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(prisma.sessionPoll.update).not.toHaveBeenCalled();
    });

    it('émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('notifie aussi PartiesService.notifyPartieSignalsChanged (Story 29.7, AD-14, signal VOTE_EN_COURS_SANS_REPONSE)', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
        'p1',
        'mj1',
      );
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

  it('choose() → émet un événement temps réel scopé sur la Partie, après la résolution des DEUX écritures (Story 18.1, AC1)', async () => {
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
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('choose() → notifie aussi PartiesService.notifyPartieSignalsChanged (Story 29.7, AD-14)', async () => {
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
    expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
      'p1',
      'mj1',
    );
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

  it('close() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('close() → notifie aussi PartiesService.notifyPartieSignalsChanged (Story 29.7, AD-14)', async () => {
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
      'p1',
      'mj1',
    );
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

  // ─── Story 36.10 (D-16) — mutation des options d'un vote ouvert ───────────
  describe('setOptions()', () => {
    /** Poll de départ à DEUX options, chacune portant une réponse. C'est le jeu qui rend
     *  observable l'invariant central : une option conservée ne doit subir AUCUNE écriture. */
    function pollWithOptions() {
      return {
        ...makePoll(),
        options: [
          {
            id: 'optA',
            pollId: 'poll1',
            date: new Date('2026-08-01T00:00:00.000Z'),
            slot: 'MORNING',
            votes: [
              {
                userId: 'u1',
                answer: 'YES',
                user: { pseudo: 'Léa', displayName: 'Léa' },
              },
            ],
          },
          {
            id: 'optB',
            pollId: 'poll1',
            date: new Date('2026-08-02T00:00:00.000Z'),
            slot: 'AFTERNOON',
            votes: [
              {
                userId: 'u2',
                answer: 'NO',
                user: { pseudo: 'Tom', displayName: 'Tom' },
              },
            ],
          },
        ],
      };
    }

    beforeEach(() => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.sessionPoll.findUnique.mockResolvedValue(pollWithOptions());
    });

    it('→ MJ seul : getOwned qui rejette fait rejeter la mutation, sans aucune écriture (AC8)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());
      await expect(
        service.setOptions('p1', 'poll1', 'joueur1', {
          options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
      expect(prisma.pollOption.createMany).not.toHaveBeenCalled();
    });

    it('→ poll introuvable : NotFoundException (AC14)', async () => {
      prisma.sessionPoll.findUnique.mockResolvedValue(null);
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', {
          options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it("→ poll d'une AUTRE partie : NotFoundException, même si le MJ possède la partie de l'URL (AC14, sécurité)", async () => {
      prisma.sessionPoll.findUnique.mockResolvedValue({
        ...pollWithOptions(),
        partieId: 'autre-partie',
      });
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', {
          options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it('→ poll CLOSED : BadRequestException (AC14)', async () => {
      prisma.sessionPoll.findUnique.mockResolvedValue({
        ...pollWithOptions(),
        status: 'CLOSED',
      });
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', {
          options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it('→ deux options portant la même paire date + slot : BadRequestException (AC14)', async () => {
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', {
          options: [opt('2026-08-01', 'MORNING'), opt('2026-08-01', 'MORNING')],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it('→ moins de 2 options : BadRequestException (AC14, garde de service en plus du DTO)', async () => {
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', {
          options: [opt('2026-08-01', 'MORNING')],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it('→ plus de 40 options : BadRequestException (AC14, garde de service en plus du DTO)', async () => {
      const options = Array.from({ length: 41 }, (_, i) =>
        opt(`2026-09-${String(i + 1).padStart(2, '0')}`, 'EVENING'),
      );
      await expect(
        service.setOptions('p1', 'poll1', 'mj1', { options }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it("🚨 {A,B} → {A,C} : supprime l'id de B et LUI SEUL, crée C seul, et n'écrit JAMAIS sur A (AC5, AC7)", async () => {
      await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
      });

      // B retirée — et B seule.
      expect(prisma.pollOption.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.pollOption.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['optB'] } },
      });

      // C créée — et C seule.
      expect(prisma.pollOption.createMany).toHaveBeenCalledTimes(1);
      const created = prisma.pollOption.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ pollId: 'poll1', slot: 'EVENING' });
      expect(created[0].date.toISOString()).toBe('2026-08-03T00:00:00.000Z');

      // 🚨 A conservée : aucune écriture ne la cible, d'aucune manière.
      expect(prisma.pollOption.update).not.toHaveBeenCalled();
      expect(
        JSON.stringify(prisma.pollOption.deleteMany.mock.calls),
      ).not.toContain('optA');
      expect(
        JSON.stringify(prisma.pollOption.createMany.mock.calls),
      ).not.toContain('2026-08-01');
    });

    it('→ jeu identique à l’existant : aucune suppression, aucune création (AC5)', async () => {
      await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
      });
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
      expect(prisma.pollOption.createMany).not.toHaveBeenCalled();
    });

    it('→ suppressions et créations dans UNE SEULE transaction (AC15)', async () => {
      await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('→ émet partieTopic ET notifyPartieSignalsChanged, les deux (AC15)', async () => {
      await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
      });
      expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
      expect(parties.notifyPartieSignalsChanged).toHaveBeenCalledWith(
        'p1',
        'mj1',
      );
    });

    it('→ renvoie le DTO relu, avec membersCount (AC5)', async () => {
      prisma.membership.count.mockResolvedValue(3);
      const dto = await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
      });
      expect(dto.membersCount).toBe(4);
      expect(dto.id).toBe('poll1');
    });
  });
});
