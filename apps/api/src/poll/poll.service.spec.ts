import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PollService } from './poll.service';
import { PARTIE_SIGNALS_PORT } from './ports/partie-signals.port';
import { SEANCE_DATE_PORT } from './ports/seance-date.port';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { testGrant } from '../common/test-utils/grant';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { anyOf, callArg, mockCalls } from '../common/test-utils/jest-typed';
import { HIDDEN_DRAFT_POLL_WHERE, VISIBLE_POLL_WHERE } from '../permissions/scenario-visibility';
import type { DaySlot } from '@master-jdr/shared';

/**
 * Mock construit sans annotation `: any` : l'inference donne un vrai type aux modeles et a leurs
 * `jest.fn()`, ce qui type les assertions au lieu de les laisser passer en aveugle.
 */
function makePrisma() {
  const models = {
    sessionPoll: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      // Anti-spoil serveur : « ce vote est-il celui d'un brouillon caché ? » (0 = non, par défaut).
      count: jest.fn().mockResolvedValue(0),
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
  // $transaction exécute le callback avec le même mock en guise de `tx`. Construit en deux temps :
  // il doit référencer les modèles qui l'accompagnent, ce qu'un littéral unique ne permet pas
  // sans retomber sur `any`.
  return {
    ...models,
    $transaction: jest.fn((fn: (tx: typeof models) => unknown) => fn(models)),
  };
}

/** Story 37.8 : `PartieSignalsPort` — port de la couche 1, implémenté par `parties/`. */
function makePartieSignals() {
  return {
    notifyChanged: jest.fn().mockResolvedValue(undefined),
  };
}

/** Story 37.6 — les droits sont décidés par `PermissionService.assert()`, simulé ici. */
function makePermissions() {
  // Par défaut l'appelant est le MJ de `p1` (aucune restriction anti-spoil) ; les tests joueurs
  // reconfigurent l'autorisation.
  return { assert: jest.fn().mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }, 'mj')) };
}

/** Autorisation délivrée par `ScenariosService.createSeancePoll()` à `create()` (MJ de `p1`). */
const GRANT_P1 = testGrant({ id: 'p1', ownerId: 'mj1' });

/** Story 37.8 : `SeanceDatePort` — port de la couche 1, implémenté par `events/`. */
function makeSeanceDate() {
  return { chooseDate: jest.fn().mockResolvedValue(undefined) };
}

function makeRealtimeEvents() {
  return { emit: jest.fn() };
}

function opt(date: string, slot: DaySlot) {
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
  let partieSignals: ReturnType<typeof makePartieSignals>;
  let permissions: ReturnType<typeof makePermissions>;
  let realtimeEvents: ReturnType<typeof makeRealtimeEvents>;
  let seanceDate: ReturnType<typeof makeSeanceDate>;

  beforeEach(async () => {
    prisma = makePrisma();
    partieSignals = makePartieSignals();
    permissions = makePermissions();
    realtimeEvents = makeRealtimeEvents();
    seanceDate = makeSeanceDate();
    const module = await Test.createTestingModule({
      providers: [
        PollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PARTIE_SIGNALS_PORT, useValue: partieSignals },
        { provide: PermissionService, useValue: permissions },
        { provide: RealtimeEventsService, useValue: realtimeEvents },
        { provide: SEANCE_DATE_PORT, useValue: seanceDate },
      ],
    }).compile();
    service = module.get(PollService);
  });

  it('create() → crée sans jamais appeler findFirst/updateMany (Story 8.8)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.sessionPoll.findFirst).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it('create() avec un poll OPEN déjà existant sur la Partie → ne le ferme pas (Story 8.8, un vote par Séance, pas par Partie)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.sessionPoll.findFirst).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it('create() → exécute create dans une transaction Prisma', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('create() → écrit expiresAt à ~14 jours dans le futur (jamais null)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    const before = Date.now();
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    const after = Date.now();
    const data = callArg<{ data: { expiresAt: Date } }>(prisma.sessionPoll.create).data;
    expect(data.expiresAt).toBeInstanceOf(Date);
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + fourteenDaysMs);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + fourteenDaysMs);
  });

  it('create() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('create() → notifie aussi PartieSignalsPort.notifyChanged (Story 29.7, AD-14, signal AUCUNE_DATE_NI_VOTE)', async () => {
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create(GRANT_P1, 'mj1', {
      options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')],
    });
    expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
  });

  describe('membersCount — effectif de la troupe (Story 36.6, AC7/AC9)', () => {
    it('create() → renvoie un membersCount = MJ + Membership', async () => {
      prisma.membership.count.mockResolvedValue(3);
      prisma.sessionPoll.create.mockResolvedValue(makePoll());
      const dto = await service.create(GRANT_P1, 'mj1', {
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

    it('une partie sans aucun membre a un effectif de 1 — le MJ, qui vote (castVote ouvert au MJ comme aux membres, POLL_VOTE)', async () => {
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

  describe('anti-spoil serveur — vote de la séance d’un brouillon caché', () => {
    const joueur = () => permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'player'));

    it('findOpen() : un joueur ne lit que les votes hors brouillon caché (fragment partagé), le MJ lit tout', async () => {
      prisma.sessionPoll.findFirst.mockResolvedValue(null);

      joueur();
      await service.findOpen('p1', 'u1');
      expect(prisma.sessionPoll.findFirst).toHaveBeenLastCalledWith({
        where: { AND: [{ partieId: 'p1', status: 'OPEN' }, VISIBLE_POLL_WHERE] },
        include: expect.anything() as unknown,
      });

      permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'mj'));
      await service.findOpen('p1', 'mj1');
      expect(prisma.sessionPoll.findFirst).toHaveBeenLastCalledWith({
        where: { partieId: 'p1', status: 'OPEN' },
        include: expect.anything() as unknown,
      });
    });

    it('échec FERMÉ : un rôle autre que MJ (ici admin) est filtré comme un joueur', async () => {
      prisma.sessionPoll.findFirst.mockResolvedValue(null);
      permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'admin'));

      await service.findOpen('p1', 'u1');

      expect(prisma.sessionPoll.findFirst).toHaveBeenLastCalledWith({
        where: { AND: [{ partieId: 'p1', status: 'OPEN' }, VISIBLE_POLL_WHERE] },
        include: expect.anything() as unknown,
      });
    });

    it('castVote() : un joueur sur le vote d’un brouillon caché reçoit l’erreur d’un vote inconnu, aucun vote écrit', async () => {
      joueur();
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'OPEN',
      });
      prisma.sessionPoll.count.mockResolvedValue(1);

      const promise = service.castVote('p1', 'poll1', 'u1', { optionId: 'opt1', answer: 'YES' });

      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow('Poll introuvable ou fermé');
      expect(prisma.sessionPoll.count).toHaveBeenCalledWith({
        where: { AND: [{ id: 'poll1' }, HIDDEN_DRAFT_POLL_WHERE] },
      });
      expect(prisma.pollVote.upsert).not.toHaveBeenCalled();
      expect(partieSignals.notifyChanged).not.toHaveBeenCalled();
    });

    it('withdrawVote() : même refus pour un joueur, aucune suppression', async () => {
      joueur();
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'OPEN',
      });
      prisma.sessionPoll.count.mockResolvedValue(1);

      await expect(service.withdrawVote('p1', 'poll1', 'opt1', 'u1')).rejects.toThrow(
        'Poll introuvable ou fermé',
      );
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled();
    });

    it('le MJ vote sur le vote d’un brouillon : aucune requête de masquage', async () => {
      permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'mj'));
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'OPEN',
      });
      prisma.pollOption.findUnique.mockResolvedValue({ id: 'opt1', pollId: 'poll1' });
      prisma.pollVote.upsert.mockResolvedValue({});

      await service.castVote('p1', 'poll1', 'mj1', { optionId: 'opt1', answer: 'YES' });

      expect(prisma.sessionPoll.count).not.toHaveBeenCalled();
      expect(prisma.pollVote.upsert).toHaveBeenCalledTimes(1);
    });
  });

  it('create() avec deux options (date,slot) identiques → BadRequestException', async () => {
    await expect(
      service.create(GRANT_P1, 'mj1', {
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
      service.create(GRANT_P1, 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-01T00:00:00.000Z', 'MORNING')],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('castVote() deux fois sur la même option → upsert (pas de doublon)', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'player'));
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
    const calls = mockCalls<[{ where: unknown }]>(prisma.pollVote.upsert);
    expect(calls[0][0].where).toEqual({
      optionId_userId: { optionId: 'opt1', userId: 'u1' },
    });
    expect(calls[1][0].where).toEqual({
      optionId_userId: { optionId: 'opt1', userId: 'u1' },
    });
  });

  it('castVote() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1' }, 'player'));
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

  it('castVote() → notifie aussi PartieSignalsPort.notifyChanged (Story 29.7, AD-14, signal VOTE_EN_COURS_SANS_REPONSE)', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }, 'player'));
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
    expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
  });

  describe('withdrawVote() (Story 30.1, AD-10)', () => {
    beforeEach(() => {
      permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }, 'player'));
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
      const calls = mockCalls<[{ where: unknown }]>(prisma.pollVote.deleteMany);
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
      await expect(service.withdrawVote('p1', 'poll1', 'opt1', 'u1')).resolves.toBeUndefined();
    });

    it('retrait sans avoir jamais voté (aucune ligne à supprimer) → résout normalement', async () => {
      prisma.pollVote.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.withdrawVote('p1', 'poll1', 'opt1', 'u1')).resolves.toBeUndefined();
    });

    it('sur un poll CLOSED → BadRequestException, aucune suppression', async () => {
      prisma.sessionPoll.findUnique.mockResolvedValue({
        id: 'poll1',
        partieId: 'p1',
        status: 'CLOSED',
      });
      await expect(service.withdrawVote('p1', 'poll1', 'opt1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled();
    });

    it("option inexistante ou n'appartenant pas à ce poll → BadRequestException", async () => {
      prisma.pollOption.findUnique.mockResolvedValue(null);
      await expect(service.withdrawVote('p1', 'poll1', 'opt-inconnu', 'u1')).rejects.toThrow(
        BadRequestException,
      );
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

    it('notifie aussi PartieSignalsPort.notifyChanged (Story 29.7, AD-14, signal VOTE_EN_COURS_SANS_REPONSE)', async () => {
      await service.withdrawVote('p1', 'poll1', 'opt1', 'u1');
      expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
    });
  });

  it('choose() par non-MJ → ForbiddenException', async () => {
    permissions.assert.mockRejectedValue(new ForbiddenException());
    await expect(service.choose('p1', 'poll1', 'joueur1', { optionId: 'opt1' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('choose() → positionne chosenDate/chosenSlot, ferme le poll, délègue la date de séance au port', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
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
    expect(permissions.assert).toHaveBeenCalledWith('mj1', 'POLL_CHOOSE', { partieId: 'p1' });
    expect(prisma.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED', chosenDate: d, chosenSlot: 'MORNING' },
    });
    // Story 37.8 (AD-15) : la date de séance et `nextSessionDate/Slot` sont écrites par le port.
    expect(seanceDate.chooseDate).toHaveBeenCalledWith(anyOf(Object), 'poll1', d, 'MORNING');
    // PollService n'écrit JAMAIS `Partie` : `events/` est l'unique écrivain de la prochaine séance.
    expect(prisma.partie.update).not.toHaveBeenCalled();
  });

  it('choose() → ferme le poll ET délègue la plage de la séance au port dans la même transaction (Stories 37.4, 37.8)', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
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
    prisma.partie.update.mockResolvedValue({});
    // Client de transaction DISTINCT du client racine : une écriture faite hors transaction
    // passerait par `prisma.sessionPoll.update` et ferait échouer ce test.
    const tx = { sessionPoll: { update: jest.fn().mockResolvedValue({}) } };
    prisma.$transaction.mockImplementationOnce((fn: (t: never) => unknown) => fn(tx as never));
    await service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED', chosenDate: d, chosenSlot: 'MORNING' },
    });
    expect(prisma.sessionPoll.update).not.toHaveBeenCalled();
    expect(seanceDate.chooseDate).toHaveBeenCalledWith(tx, 'poll1', d, 'MORNING');
  });

  it('choose() → échec du port : ni émission ni notification des signaux (tout ou rien, Stories 37.4, 37.8)', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
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
    seanceDate.chooseDate.mockRejectedValue(new Error('boom'));
    await expect(service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' })).rejects.toThrow(
      'boom',
    );
    expect(prisma.partie.update).not.toHaveBeenCalled();
    expect(realtimeEvents.emit).not.toHaveBeenCalled();
    expect(partieSignals.notifyChanged).not.toHaveBeenCalled();
  });

  it('choose() → émet un événement temps réel scopé sur la Partie, après la résolution des DEUX écritures (Story 18.1, AC1)', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
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

  it('choose() → notifie aussi PartieSignalsPort.notifyChanged (Story 29.7, AD-14)', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
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
    expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
  });

  it('choose() sur le même créneau déjà actif → PollService n’écrit pas Partie (la remise à zéro du rappel est décidée par events/, Story 37.8)', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    permissions.assert.mockResolvedValue(
      testGrant({
        id: 'p1',
        ownerId: 'mj1',
        nextSessionDate: d,
        nextSessionSlot: 'MORNING',
      }),
    );
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
    await service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(prisma.partie.update).not.toHaveBeenCalled();
    expect(seanceDate.chooseDate).toHaveBeenCalledWith(anyOf(Object), 'poll1', d, 'MORNING');
  });

  it('close() sur un poll OPEN → le ferme', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(permissions.assert).toHaveBeenCalledWith('mj1', 'POLL_CLOSE', { partieId: 'p1' });
    expect(prisma.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED' },
    });
  });

  it('close() → émet un événement temps réel scopé sur la Partie (Story 18.1, AC1)', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
  });

  it('close() → notifie aussi PartieSignalsPort.notifyChanged (Story 29.7, AD-14)', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'OPEN',
    });
    prisma.sessionPoll.update.mockResolvedValue({});
    await service.close('p1', 'poll1', 'mj1');
    expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
  });

  it('close() sur un poll déjà CLOSED → BadRequestException', async () => {
    permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
    prisma.sessionPoll.findUnique.mockResolvedValue({
      id: 'poll1',
      partieId: 'p1',
      status: 'CLOSED',
    });
    await expect(service.close('p1', 'poll1', 'mj1')).rejects.toThrow(BadRequestException);
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
      permissions.assert.mockResolvedValue(testGrant({ id: 'p1', ownerId: 'mj1' }));
      prisma.sessionPoll.findUnique.mockResolvedValue(pollWithOptions());
    });

    it('→ MJ seul : un refus du service de permission fait rejeter la mutation, sans aucune écriture (AC8)', async () => {
      permissions.assert.mockRejectedValue(new ForbiddenException());
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
      await expect(service.setOptions('p1', 'poll1', 'mj1', { options })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.pollOption.deleteMany).not.toHaveBeenCalled();
    });

    it("🚨 {A,B} → {A,C} : supprime l'id de B et LUI SEUL, crée C seul, et n'écrit JAMAIS sur A (AC5, AC7)", async () => {
      await service.setOptions('p1', 'poll1', 'mj1', {
        options: [opt('2026-08-01', 'MORNING'), opt('2026-08-03', 'EVENING')],
      });

      expect(permissions.assert).toHaveBeenCalledWith('mj1', 'POLL_OPTIONS_SET', {
        partieId: 'p1',
      });
      // B retirée — et B seule.
      expect(prisma.pollOption.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.pollOption.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['optB'] } },
      });

      // C créée — et C seule.
      expect(prisma.pollOption.createMany).toHaveBeenCalledTimes(1);
      const created = callArg<{ data: { pollId: string; slot: string; date: Date }[] }>(
        prisma.pollOption.createMany,
      ).data;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ pollId: 'poll1', slot: 'EVENING' });
      expect(created[0].date.toISOString()).toBe('2026-08-03T00:00:00.000Z');

      // 🚨 A conservée : aucune écriture ne la cible, d'aucune manière.
      expect(prisma.pollOption.update).not.toHaveBeenCalled();
      expect(JSON.stringify(prisma.pollOption.deleteMany.mock.calls)).not.toContain('optA');
      expect(JSON.stringify(prisma.pollOption.createMany.mock.calls)).not.toContain('2026-08-01');
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
      expect(partieSignals.notifyChanged).toHaveBeenCalledWith('p1');
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
