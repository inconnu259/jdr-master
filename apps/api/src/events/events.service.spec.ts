import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { EventsService } from './events.service';
import { testGrant } from '../common/test-utils/grant';
import { callArg, mockCalls, objectLike } from '../common/test-utils/jest-typed';
import { VISIBLE_SEANCE_WHERE } from '../permissions/scenario-visibility';

/** Story 37.6 — autorisation délivrée (simulée) par `PermissionService.assert()` sur `p1`. */
const GRANT_P1 = testGrant({ id: 'p1', ownerId: 'mj1' });

const EVENT = {
  id: 'e1',
  partieId: 'p1',
  title: 'Le Marché aux Ombres',
  description: null,
  ownerId: 'mj1',
  createdAt: new Date('2026-10-10T00:00:00.000Z'),
};

function makePrisma() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ kind: 'CAMPAGNE_LINEAIRE' }]),
    event: {
      create: jest.fn().mockResolvedValue(EVENT),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    seance: {
      create: jest.fn().mockResolvedValue({ id: 'se1' }),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    // Story 37.8 : `chooseDate` lit le vote (sa partie) et recalcule la prochaine séance DANS la
    // transaction fournie.
    sessionPoll: { findUnique: jest.fn().mockResolvedValue({ partieId: 'p1' }) },
    partie: {
      update: jest.fn(),
    },
    inscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
  };
  return {
    tx,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    // Story 37.6 — appartenance à la partie de l'autorisation (1 = la séance/l'événement en est).
    // Story 40.1 : `listCards` lit les événements de la partie (cartes de conjonctions).
    event: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    seance: {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      update: jest.fn(),
    },
    sessionPoll: { delete: jest.fn() },
    inscription: { deleteMany: jest.fn() },
    partie: {
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('EventsService (Story 37.3)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let realtime: { emit: jest.Mock };
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    realtime = { emit: jest.fn() };
    service = new EventsService(
      prisma as unknown as PrismaService,
      realtime as unknown as RealtimeEventsService,
    );
  });

  describe('create()', () => {
    it('crée l’événement, son extension et sa première séance dans UNE transaction, puis émet', async () => {
      const extend = jest.fn().mockResolvedValue({ id: 'e1', status: 'BROUILLON' });

      const result = await service.create(GRANT_P1, { title: EVENT.title, ownerId: 'mj1' }, extend);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.tx.event.create).toHaveBeenCalledWith({
        data: { partieId: 'p1', title: EVENT.title, description: null, ownerId: 'mj1' },
      });
      expect(extend).toHaveBeenCalledWith(prisma.tx, EVENT);
      expect(prisma.tx.seance.create).toHaveBeenCalledWith({ data: { eventId: 'e1' } });
      expect(result).toEqual({ event: EVENT, extension: { id: 'e1', status: 'BROUILLON' } });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('n’émet rien si la transaction échoue (émission après validation seulement)', async () => {
      const extend = jest.fn().mockRejectedValue(new Error('échec extension'));

      await expect(
        service.create(GRANT_P1, { title: 'X', ownerId: 'mj1' }, extend),
      ).rejects.toThrow('échec extension');
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('ONE_SHOT déjà pourvu d’un événement → 400, aucune écriture', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([{ kind: 'ONE_SHOT' }]);
      prisma.tx.event.findFirst.mockResolvedValue({ id: 'existant' });

      await expect(
        service.create(GRANT_P1, { title: 'Second', ownerId: 'mj1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tx.event.create).not.toHaveBeenCalled();
      expect(prisma.tx.seance.create).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('ONE_SHOT sans événement → création autorisée (le premier, créé avec la partie)', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([{ kind: 'ONE_SHOT' }]);

      await service.create(GRANT_P1, { title: 'Unique', ownerId: 'mj1' });

      expect(prisma.tx.event.findFirst).toHaveBeenCalledWith({
        where: { partieId: 'p1' },
        select: { id: true },
      });
      expect(prisma.tx.event.create).toHaveBeenCalledTimes(1);
    });

    it('partie introuvable sous le verrou → 404', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.create(testGrant({ id: 'absente', ownerId: null }), { title: 'X', ownerId: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tx.event.create).not.toHaveBeenCalled();
    });
  });

  describe('createHosted() — conjonction à date fixée (Story 40.1)', () => {
    const DAY = new Date('2026-11-14T00:00:00.000Z');
    const SEANCE = {
      date: DAY,
      slot: 'EVENING' as const,
      lieu: 'Lyon 3e',
      heureRdv: '20:30',
      notePratique: 'Apportez un jeu',
      capacity: 8,
    };

    it('écrit l’événement (hôte = propriétaire de l’événement) et sa séance datée dans UNE transaction, recalcule la prochaine date, puis émet', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([{ kind: 'CAMPAGNE_EPISODIQUE' }]);

      await service.createHosted(GRANT_P1, 'hote', { title: 'Catane', seance: SEANCE });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.tx.event.create).toHaveBeenCalledWith({
        data: { partieId: 'p1', title: 'Catane', description: null, ownerId: 'hote' },
      });
      expect(prisma.tx.seance.create).toHaveBeenCalledWith({
        data: {
          eventId: 'e1',
          startDate: DAY,
          startSlot: 'EVENING',
          endDate: DAY,
          endSlot: 'EVENING',
          lieu: 'Lyon 3e',
          heureRdv: '20:30',
          notePratique: 'Apportez un jeu',
          inscriptionMax: 8,
        },
      });
      // Verrou de la partie (assertCanAddEvent) puis verrou du recalcul, même transaction.
      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.tx.seance.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.tx.partie.update).toHaveBeenCalledTimes(1);
      expect(prisma.partie.update).not.toHaveBeenCalled();
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('capacité nulle = « tous les membres » : aucune capacité écrite', async () => {
      await service.createHosted(GRANT_P1, 'hote', {
        title: 'X',
        seance: { ...SEANCE, capacity: null, lieu: null, heureRdv: null, notePratique: null },
      });

      expect(prisma.tx.seance.create).toHaveBeenCalledWith({
        data: objectLike({
          inscriptionMax: null,
          lieu: null,
          heureRdv: null,
          notePratique: null,
        }),
      });
    });

    it('n’émet rien si la transaction échoue', async () => {
      prisma.tx.seance.create.mockRejectedValue(new Error('échec séance'));

      await expect(
        service.createHosted(GRANT_P1, 'hote', { title: 'X', seance: SEANCE }),
      ).rejects.toThrow('échec séance');
      expect(realtime.emit).not.toHaveBeenCalled();
    });
  });

  describe('listCards() — cartes de conjonctions (Story 40.1)', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'e1',
      title: 'Catane',
      ownerId: 'hote',
      owner: { displayName: 'Léa' },
      seances: [
        {
          id: 'se1',
          startDate: new Date('2026-11-14T00:00:00.000Z'),
          startSlot: 'EVENING',
          lieu: 'Lyon 3e',
          heureRdv: '20:30',
          notePratique: null,
          inscriptionMax: 8,
        },
      ],
      ...over,
    });

    it('projection explicite : hôte, séance unique (date en clé de jour), capacité', async () => {
      prisma.event.findMany.mockResolvedValue([row()]);

      const cards = await service.listCards(GRANT_P1);

      expect(cards).toEqual([
        {
          id: 'e1',
          title: 'Catane',
          hostId: 'hote',
          hostDisplayName: 'Léa',
          seance: {
            id: 'se1',
            date: '2026-11-14',
            slot: 'EVENING',
            lieu: 'Lyon 3e',
            heureRdv: '20:30',
            notePratique: null,
            capacity: 8,
          },
        },
      ]);
      // Une seule lecture, scopée à la partie de l'autorisation.
      expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
      expect(callArg(prisma.event.findMany)).toEqual(
        objectLike({ where: { partieId: 'p1' } }),
      );
    });

    it('même jour : tri par créneau (matin < après-midi < soir), pas par ordre de création', async () => {
      const at = (id: string, slot: string) =>
        row({ id, seances: [{ ...row().seances[0], startSlot: slot }] });
      prisma.event.findMany.mockResolvedValue([
        at('soir', 'EVENING'),
        at('matin', 'MORNING'),
        at('aprem', 'AFTERNOON'),
      ]);

      const cards = await service.listCards(GRANT_P1);

      expect(cards.map((c) => c.id)).toEqual(['matin', 'aprem', 'soir']);
    });

    it('hôte disparu → identité nulle ; tri par date, sans date en dernier', async () => {
      prisma.event.findMany.mockResolvedValue([
        row({ id: 'sans-date', seances: [{ ...row().seances[0], startDate: null }] }),
        row({
          id: 'tard',
          ownerId: null,
          owner: null,
          seances: [{ ...row().seances[0], startDate: new Date('2026-12-01T00:00:00Z') }],
        }),
        row({ id: 'tot' }),
      ]);

      const cards = await service.listCards(GRANT_P1);

      expect(cards.map((c) => c.id)).toEqual(['tot', 'tard', 'sans-date']);
      expect(cards[1]).toEqual(objectLike({ hostId: null, hostDisplayName: null }));
    });

    it('restreinte à des identifiants donnés (carte d’un événement tout juste créé)', async () => {
      await service.listCards(GRANT_P1, ['e9']);

      expect(callArg(prisma.event.findMany)).toEqual(
        objectLike({ where: { partieId: 'p1', id: { in: ['e9'] } } }),
      );
    });
  });

  it('createInTx() n’ouvre pas de transaction et n’émet pas — l’appelant émet après son commit', async () => {
    await service.createInTx(prisma.tx as unknown as Prisma.TransactionClient, {
      partieId: 'p1',
      title: 'X',
      ownerId: 'mj1',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tx.seance.create).toHaveBeenCalledWith({ data: { eventId: 'e1' } });
    expect(realtime.emit).not.toHaveBeenCalled();
  });

  describe('séances', () => {
    const seance = { id: 'se2', eventId: 'e1', pollId: 'poll1' };

    it('addSeance() crée une séance rattachée à l’événement et émet', async () => {
      await service.addSeance(GRANT_P1, 'e1');

      expect(prisma.seance.create).toHaveBeenCalledWith({ data: { eventId: 'e1' } });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('deleteSeance() refuse la première séance de l’événement', async () => {
      prisma.seance.findMany.mockResolvedValueOnce([{ id: 'se2' }]);

      await expect(service.deleteSeance(GRANT_P1, seance)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('deleteSeance() supprime la séance PUIS son vote, recalcule la prochaine date et émet', async () => {
      prisma.seance.findMany.mockResolvedValueOnce([{ id: 'se1' }]);

      await service.deleteSeance(GRANT_P1, seance);

      expect(prisma.seance.delete).toHaveBeenCalledWith({ where: { id: 'se2' } });
      expect(prisma.sessionPoll.delete).toHaveBeenCalledWith({ where: { id: 'poll1' } });
      expect(prisma.partie.update).toHaveBeenCalled();
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('deleteSeance() concurrente (P2025) → 404 propre', async () => {
      prisma.seance.findMany.mockResolvedValueOnce([{ id: 'se1' }]);
      prisma.seance.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('absente', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(service.deleteSeance(GRANT_P1, seance)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('createSeancePoll() refuse une séance déjà liée AVANT de créer le vote', async () => {
      const createPoll = jest.fn();

      await expect(service.createSeancePoll(GRANT_P1, seance, createPoll)).rejects.toThrow(
        'Cette séance est déjà liée à un vote de date',
      );
      expect(createPoll).not.toHaveBeenCalled();
    });

    it('createSeancePoll() pose Seance.pollId du vote créé par l’appelant et émet', async () => {
      const createPoll = jest.fn().mockResolvedValue({ id: 'poll9' });

      await service.createSeancePoll(GRANT_P1, { ...seance, pollId: null }, createPoll);

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: { pollId: 'poll9' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('chooseDate() pose une plage start = end sur la séance du vote, sans émettre', async () => {
      const d = new Date('2026-11-03T00:00:00.000Z');

      await service.chooseDate(
        prisma.tx as unknown as Prisma.TransactionClient,
        'poll1',
        d,
        'EVENING',
      );

      expect(prisma.tx.seance.updateMany).toHaveBeenCalledWith({
        where: { pollId: 'poll1' },
        data: {
          startDate: d,
          startSlot: 'EVENING',
          endDate: d,
          endSlot: 'EVENING',
          // Nouvelle date → rappel de la veille ré-armé (Story 37.9).
          reminderSentAt: null,
        },
      });
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('chooseDate() recalcule la prochaine séance de la partie du vote DANS la transaction fournie (Story 37.8, AD-15)', async () => {
      const future = new Date(Date.UTC(2099, 0, 2));
      prisma.tx.seance.findMany.mockResolvedValue([{ startDate: future, startSlot: 'EVENING' }]);

      await service.chooseDate(
        prisma.tx as unknown as Prisma.TransactionClient,
        'poll1',
        future,
        'EVENING',
      );

      expect(prisma.tx.sessionPoll.findUnique).toHaveBeenCalledWith({
        where: { id: 'poll1' },
        select: { partieId: true },
      });
      // Anti-spoil serveur : seules les séances qui ne sont pas celles d'un brouillon caché
      // comptent (fragment partagé `VISIBLE_SEANCE_WHERE`).
      expect(prisma.tx.seance.findMany).toHaveBeenCalledWith({
        where: { AND: [{ event: { partieId: 'p1' } }, VISIBLE_SEANCE_WHERE] },
        select: { startDate: true, startSlot: true },
      });
      expect(prisma.tx.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nextSessionDate: future, nextSessionSlot: 'EVENING' },
      });
      // Rien n'est écrit hors de la transaction de l'appelant.
      expect(prisma.partie.update).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('chooseDate() : une date passée est écrite sur la séance mais n’est pas retenue comme prochaine séance', async () => {
      const past = new Date(Date.UTC(2020, 0, 2));
      prisma.tx.seance.findMany.mockResolvedValue([{ startDate: past, startSlot: 'MORNING' }]);

      await service.chooseDate(
        prisma.tx as unknown as Prisma.TransactionClient,
        'poll1',
        past,
        'MORNING',
      );

      expect(prisma.tx.seance.updateMany).toHaveBeenCalledWith({
        where: { pollId: 'poll1' },
        data: {
          startDate: past,
          startSlot: 'MORNING',
          endDate: past,
          endSlot: 'MORNING',
          reminderSentAt: null,
        },
      });
      expect(prisma.tx.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nextSessionDate: null, nextSessionSlot: null },
      });
    });

    it('chooseDate() : un vote introuvable lève 404 sans recalcul', async () => {
      prisma.tx.sessionPoll.findUnique.mockResolvedValue(null);

      await expect(
        service.chooseDate(
          prisma.tx as unknown as Prisma.TransactionClient,
          'poll-inconnu',
          new Date(),
          'EVENING',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tx.partie.update).not.toHaveBeenCalled();
      // Le vote est cherché AVANT toute écriture : rien n'a été écrit sur les séances.
      expect(prisma.tx.seance.updateMany).not.toHaveBeenCalled();
    });

    it('resetSeanceDate() détache le vote, le supprime, recalcule et émet', async () => {
      await service.resetSeanceDate(GRANT_P1, seance);

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: {
          pollId: null,
          startDate: null,
          startSlot: null,
          endDate: null,
          endSlot: null,
          // Plage effacée → plus de rappel en attente pour cette séance (Story 37.9).
          reminderSentAt: null,
        },
      });
      expect(prisma.sessionPoll.delete).toHaveBeenCalledWith({ where: { id: 'poll1' } });
      expect(prisma.partie.update).toHaveBeenCalled();
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('setSeanceCapacity() refuse max < min, sans écriture', async () => {
      await expect(service.setSeanceCapacity(GRANT_P1, 'se2', 4, 2)).rejects.toThrow(
        'Le maximum doit être supérieur ou égal au minimum',
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('setInfosPratiques() écrit les trois champs tels quels et émet', async () => {
      await service.setInfosPratiques(GRANT_P1, 'se2', {
        heureRdv: '20:30',
        lieu: null,
        notePratique: 'Apporter des dés',
      });

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: { heureRdv: '20:30', lieu: null, notePratique: 'Apporter des dés' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });
  });

  describe('appartenance à la partie de l’autorisation (Story 37.6)', () => {
    const seanceB = { id: 'seance-b', eventId: 'event-b', pollId: null };

    it('séance d’une autre partie → 404 « Séance introuvable », aucune écriture', async () => {
      prisma.seance.count.mockResolvedValue(0);

      await expect(service.resetSeanceDate(GRANT_P1, seanceB)).rejects.toThrow(
        new NotFoundException('Séance introuvable'),
      );
      await expect(service.deleteSeance(GRANT_P1, seanceB)).rejects.toThrow('Séance introuvable');
      await expect(service.setSeanceCapacity(GRANT_P1, 'seance-b', 1, 2)).rejects.toThrow(
        'Séance introuvable',
      );
      await expect(
        service.inscrire(GRANT_P1, { id: 'seance-b', inscriptionMax: 2, startDate: null }, 'u1'),
      ).rejects.toThrow('Séance introuvable');
      expect(prisma.seance.count).toHaveBeenCalledWith({
        where: { id: 'seance-b', event: { partieId: 'p1' } },
      });
      expect(prisma.seance.update).not.toHaveBeenCalled();
      expect(prisma.seance.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('événement d’une autre partie → 404 « Scénario introuvable », aucune séance créée', async () => {
      prisma.event.count.mockResolvedValue(0);

      await expect(service.addSeance(GRANT_P1, 'event-b')).rejects.toThrow(
        new NotFoundException('Scénario introuvable'),
      );
      expect(prisma.event.count).toHaveBeenCalledWith({
        where: { id: 'event-b', partieId: 'p1' },
      });
      expect(prisma.seance.create).not.toHaveBeenCalled();
    });

    it('autorisation délivrée sur la séance elle-même → aucune requête d’appartenance', async () => {
      const grant = testGrant({ id: 'p1' }, 'mj', { eventId: 'e1', seanceId: 'se2' });

      await service.setInfosPratiques(grant, 'se2', {
        heureRdv: null,
        lieu: null,
        notePratique: null,
      });

      expect(prisma.seance.count).not.toHaveBeenCalled();
      expect(prisma.seance.update).toHaveBeenCalled();
    });
  });

  describe('inscriptions', () => {
    const open = { id: 'se1', inscriptionMax: 2, startDate: null };

    it('capacité non définie → 400, aucune transaction', async () => {
      await expect(
        service.inscrire(GRANT_P1, { ...open, inscriptionMax: null }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('date validée (vote scellé) → 400, roster figé', async () => {
      await expect(
        service.inscrire(GRANT_P1, { ...open, startDate: new Date() }, 'u1'),
      ).rejects.toThrow('Cette séance a déjà une date validée — les inscriptions sont figées');
    });

    it('verrou FOR UPDATE puis inscription, émission après validation', async () => {
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({ ...open });

      await service.inscrire(GRANT_P1, open, 'u1');

      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.tx.inscription.create).toHaveBeenCalledWith({
        data: { seanceId: 'se1', userId: 'u1' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('déjà inscrit → idempotent, aucun comptage ni création', async () => {
      prisma.tx.inscription.findUnique.mockResolvedValue({ id: 'i1' });

      await service.inscrire(GRANT_P1, open, 'u1');

      expect(prisma.tx.inscription.count).not.toHaveBeenCalled();
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('plafond atteint sous le verrou → 409', async () => {
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({ ...open });
      prisma.tx.inscription.count.mockResolvedValue(2);

      await expect(service.inscrire(GRANT_P1, open, 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('desinscrire() : date validée → 400 ; sinon retrait idempotent et émission', async () => {
      await expect(
        service.desinscrire(GRANT_P1, { id: 'se1', startDate: new Date() }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();

      await service.desinscrire(GRANT_P1, { id: 'se1', startDate: null }, 'u1');
      expect(prisma.inscription.deleteMany).toHaveBeenCalledWith({
        where: { seanceId: 'se1', userId: 'u1' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });
  });

  describe('recalculateNextSession() (Story 8.8, Décision 2 ; seul écrivain de nextSession, Story 37.8)', () => {
    const NOW = new Date('2026-07-14T12:00:00.000Z');
    const FUTURE_NEAR = new Date('2026-08-01T00:00:00.000Z');
    const FUTURE_FAR = new Date('2026-09-01T00:00:00.000Z');
    const PAST = new Date('2026-06-01T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("n'émet PAS d'événement temps réel directement (Story 18.1) — couvert par ses appelants deleteSeance()/resetSeanceDate()", async () => {
      prisma.seance.findMany.mockResolvedValue([]);

      await service.recalculateNextSession('p1');

      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('plusieurs séances actives → Partie.nextSessionDate reflète la plus proche dans le futur', async () => {
      prisma.seance.findMany.mockResolvedValue([
        {
          id: 's1',
          startDate: FUTURE_FAR,
          startSlot: 'MORNING',
        },
        {
          id: 's2',
          startDate: FUTURE_NEAR,
          startSlot: 'EVENING',
        },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_NEAR,
          nextSessionSlot: 'EVENING',
        },
      });
    });

    it("séance datée d'aujourd'hui (même jour que NOW, minuit) → toujours retenue comme prochaine séance", async () => {
      const TODAY = new Date('2026-07-14T00:00:00.000Z');
      prisma.seance.findMany.mockResolvedValue([
        {
          id: 's1',
          startDate: TODAY,
          startSlot: 'MORNING',
        },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: TODAY,
          nextSessionSlot: 'MORNING',
        },
      });
    });

    it('date passée ignorée — seules les dates futures comptent', async () => {
      prisma.seance.findMany.mockResolvedValue([
        {
          id: 's1',
          startDate: PAST,
          startSlot: 'MORNING',
        },
        {
          id: 's2',
          startDate: FUTURE_FAR,
          startSlot: 'AFTERNOON',
        },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_FAR,
          nextSessionSlot: 'AFTERNOON',
        },
      });
    });

    it('plage sans créneau (date posée hors vote) → utilisée, slot null', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', startDate: FUTURE_NEAR, startSlot: null },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: FUTURE_NEAR,
          nextSessionSlot: null,
        },
      });
    });

    it('aucune date future → nextSessionDate/nextSessionSlot remis à null', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', startDate: null, startSlot: null },
        { id: 's2', startDate: PAST, startSlot: null },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          nextSessionDate: null,
          nextSessionSlot: null,
        },
      });
    });

    it('le recalcul de la prochaine séance ne touche jamais aux rappels (Story 37.9)', async () => {
      prisma.seance.findMany.mockResolvedValue([
        { id: 's1', startDate: FUTURE_NEAR, startSlot: 'EVENING' },
      ]);

      await service.recalculateNextSession('p1');

      expect(prisma.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nextSessionDate: FUTURE_NEAR, nextSessionSlot: 'EVENING' },
      });
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('recalculateNextSessionInTx() verrouille la ligne Partie AVANT de lire les séances (Story 37.8, concurrence)', async () => {
      prisma.tx.seance.findMany.mockResolvedValue([]);

      await service.recalculateNextSessionInTx(
        prisma.tx as unknown as Prisma.TransactionClient,
        'p1',
      );

      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = mockCalls<[readonly string[], ...unknown[]]>(
        prisma.tx.$queryRaw,
      )[0];
      expect(strings.join('?')).toContain('FROM "Partie"');
      expect(strings.join('?')).toContain('FOR UPDATE');
      expect(values).toEqual(['p1']);
      expect(prisma.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.tx.seance.findMany.mock.invocationCallOrder[0],
      );
    });

    it('recalculateNextSessionInTx() écrit dans la transaction fournie, jamais via le client global (Story 37.8)', async () => {
      prisma.tx.seance.findMany.mockResolvedValue([
        { startDate: FUTURE_NEAR, startSlot: 'EVENING' },
      ]);

      await service.recalculateNextSessionInTx(
        prisma.tx as unknown as Prisma.TransactionClient,
        'p1',
      );

      expect(prisma.tx.partie.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nextSessionDate: FUTURE_NEAR, nextSessionSlot: 'EVENING' },
      });
      expect(prisma.seance.findMany).not.toHaveBeenCalled();
      expect(prisma.partie.update).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Ports du calendrier (Story 37.8) ───────────────────────────────────────────────────────

  describe('occupiedSpansOf() — OccupiedSpansPort (AD-9)', () => {
    const seanceB = (over: Record<string, unknown> = {}) => ({
      id: 'sB',
      startDate: new Date('2026-09-10T00:00:00Z'),
      startSlot: 'EVENING',
      inscriptions: [],
      event: { partieId: 'B' },
      ...over,
    });

    it('renvoie une entrée vide par utilisateur quand aucune partie n’est trouvée', async () => {
      const map = await service.occupiedSpansOf(['u1', 'u2']);

      expect([...map.keys()]).toEqual(['u1', 'u2']);
      expect(map.get('u1')).toEqual([]);
      expect(prisma.seance.findMany).not.toHaveBeenCalled();
    });

    it('un membre d’une partie ONE_SHOT est occupé sur la plage de sa séance datée — { date, slot } SEULEMENT', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { id: 'B', kind: 'ONE_SHOT', ownerId: 'mjB', memberships: [{ userId: 'u1' }] },
      ]);
      prisma.seance.findMany.mockResolvedValue([seanceB()]);

      const map = await service.occupiedSpansOf(['u1']);

      expect(map.get('u1')).toEqual([{ date: new Date('2026-09-10T00:00:00Z'), slot: 'EVENING' }]);
      // Aucun titre, aucun identifiant de partie, aucune identité : la forme l'interdit.
      expect(Object.keys(map.get('u1')![0]).sort()).toEqual(['date', 'slot']);
    });

    it('créneau de début vide → FULL_DAY ; séance sans date ignorée', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { id: 'B', kind: 'CAMPAGNE_LINEAIRE', ownerId: 'mjB', memberships: [{ userId: 'u1' }] },
      ]);
      prisma.seance.findMany.mockResolvedValue([
        seanceB({ startSlot: null }),
        seanceB({ id: 'sans-date', startDate: null }),
      ]);

      const map = await service.occupiedSpansOf(['u1']);

      expect(map.get('u1')).toEqual([{ date: new Date('2026-09-10T00:00:00Z'), slot: 'FULL_DAY' }]);
    });

    it('campagne épisodique : seuls le propriétaire et les inscrits à CETTE séance sont occupés', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          id: 'B',
          kind: 'CAMPAGNE_EPISODIQUE',
          ownerId: 'mjB',
          memberships: [{ userId: 'inscrit' }, { userId: 'absent' }],
        },
      ]);
      prisma.seance.findMany.mockResolvedValue([
        seanceB({ inscriptions: [{ userId: 'inscrit' }] }),
      ]);

      const map = await service.occupiedSpansOf(['mjB', 'inscrit', 'absent']);

      expect(map.get('mjB')).toHaveLength(1);
      expect(map.get('inscrit')).toHaveLength(1);
      expect(map.get('absent')).toEqual([]);
    });

    it('propriétaire absent (compte supprimé) : seuls les membres sont concernés ; jamais d’utilisateur non demandé', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          id: 'B',
          kind: 'ONE_SHOT',
          ownerId: null,
          memberships: [{ userId: 'u1' }, { userId: 'x' }],
        },
      ]);
      prisma.seance.findMany.mockResolvedValue([seanceB()]);

      const map = await service.occupiedSpansOf(['u1']);

      expect([...map.keys()]).toEqual(['u1']);
      expect(map.get('u1')).toHaveLength(1);
    });

    it('rencontre isolée de ralliement (ONE_SHOT) datée : règle historique inchangée — propriétaire et tous les membres', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          id: 'B',
          kind: 'ONE_SHOT',
          gameSystemId: 'ralliement',
          ownerId: 'createur',
          memberships: [{ userId: 'createur' }, { userId: 'autre' }],
        },
      ]);
      prisma.seance.findMany.mockResolvedValue([
        seanceB({ event: { partieId: 'B', ownerId: 'hote-ailleurs' } }),
      ]);

      const map = await service.occupiedSpansOf(['createur', 'autre', 'hote-ailleurs']);

      expect(map.get('createur')).toHaveLength(1);
      expect(map.get('autre')).toHaveLength(1);
      expect(map.get('hote-ailleurs')).toEqual([]);
    });

    it('ralliement (Story 40.1) : l’HÔTE de l’événement et les inscrits sont occupés — ni le propriétaire de la partie ni les autres membres', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          id: 'B',
          kind: 'CAMPAGNE_EPISODIQUE',
          gameSystemId: 'ralliement',
          ownerId: 'createur',
          memberships: [{ userId: 'createur' }, { userId: 'hote' }, { userId: 'autre' }],
        },
      ]);
      prisma.seance.findMany.mockResolvedValue([
        seanceB({ event: { partieId: 'B', ownerId: 'hote' } }),
      ]);

      const map = await service.occupiedSpansOf(['createur', 'hote', 'autre']);

      expect(map.get('hote')).toEqual([{ date: new Date('2026-09-10T00:00:00Z'), slot: 'EVENING' }]);
      expect(map.get('createur')).toEqual([]);
      expect(map.get('autre')).toEqual([]);
    });

    it('ralliement : hôte disparu → seuls les inscrits sont occupés', async () => {
      prisma.partie.findMany.mockResolvedValue([
        {
          id: 'B',
          kind: 'CAMPAGNE_EPISODIQUE',
          gameSystemId: 'ralliement',
          ownerId: 'createur',
          memberships: [{ userId: 'inscrit' }],
        },
      ]);
      prisma.seance.findMany.mockResolvedValue([
        seanceB({ event: { partieId: 'B', ownerId: null }, inscriptions: [{ userId: 'inscrit' }] }),
      ]);

      const map = await service.occupiedSpansOf(['createur', 'inscrit']);

      expect(map.get('inscrit')).toHaveLength(1);
      expect(map.get('createur')).toEqual([]);
    });

    it('deux requêtes au total, jamais une par utilisateur ni par partie', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { id: 'B', kind: 'ONE_SHOT', ownerId: 'mjB', memberships: [{ userId: 'u1' }] },
        { id: 'C', kind: 'ONE_SHOT', ownerId: 'mjC', memberships: [{ userId: 'u2' }] },
      ]);
      prisma.seance.findMany.mockResolvedValue([]);

      await service.occupiedSpansOf(['u1', 'u2']);

      expect(prisma.partie.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.seance.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('ownEventsOf() — OwnEventsPort', () => {
    const RANGE = {
      fromMs: Date.parse('2026-10-01T00:00:00.000Z'),
      toMs: Date.parse('2026-10-31T23:59:59.999Z'),
    };
    const partieA = { id: 'A', name: 'Ma Partie', kind: 'ONE_SHOT' };
    const episodique = { id: 'A', name: 'Ma Partie', kind: 'CAMPAGNE_EPISODIQUE' };
    const seance = (over: Record<string, unknown> = {}) => ({
      id: 'se1',
      eventId: 'ev1',
      startDate: new Date('2026-10-10T00:00:00Z'),
      startSlot: 'MORNING',
      inscriptions: [],
      inscriptionMin: null,
      inscriptionMax: null,
      event: { partieId: 'A', title: 'Le Donjon Oublié' },
      ...over,
    });
    const rolesOf = (role: 'mj' | 'player') => jest.fn().mockResolvedValue(new Map([['A', role]]));

    it('sans partie : rien, et aucune lecture de séances ni de rôles', async () => {
      const roles = rolesOf('mj');

      const own = await service.ownEventsOf('me', roles, RANGE);

      expect(own).toEqual({ parties: [], seances: [], inscriptionsOuvertes: [] });
      expect(prisma.seance.findMany).not.toHaveBeenCalled();
      expect(roles).not.toHaveBeenCalled();
    });

    it('rend mes parties et mes séances avec titres (mes propres parties), rôles résolus UNE fois en lot', async () => {
      prisma.partie.findMany.mockResolvedValue([partieA, { ...partieA, id: 'B' }]);
      prisma.seance.findMany.mockResolvedValue([seance()]);
      const roles = rolesOf('mj');

      const own = await service.ownEventsOf('me', roles, RANGE);

      expect(own.parties).toEqual([partieA, { ...partieA, id: 'B' }]);
      expect(own.seances).toEqual([
        {
          seanceId: 'se1',
          partieId: 'A',
          partieName: 'Ma Partie',
          scenarioId: 'ev1',
          scenarioTitle: 'Le Donjon Oublié',
          date: '2026-10-10',
          slot: 'MORNING',
          heureRdv: null,
          lieu: null,
          notePratique: null,
          compteRenduManquant: true,
        },
      ]);
      expect(roles).toHaveBeenCalledTimes(1);
      expect(roles).toHaveBeenCalledWith(['A', 'B']);
      expect(prisma.seance.findMany).toHaveBeenCalledTimes(1);
    });

    it('une séance hors de la fenêtre ou sans date n’est pas dans mes séances ; créneau vide → FULL_DAY', async () => {
      prisma.partie.findMany.mockResolvedValue([partieA]);
      prisma.seance.findMany.mockResolvedValue([
        seance({ id: 'hors', startDate: new Date('2026-12-01T00:00:00Z') }),
        seance({ id: 'sans-date', startDate: null }),
        seance({ id: 'plein', startSlot: null }),
      ]);

      const own = await service.ownEventsOf('me', rolesOf('mj'), RANGE);

      expect(own.seances.map((s) => [s.seanceId, s.slot])).toEqual([['plein', 'FULL_DAY']]);
    });

    it('épisodique : le MJ voit la séance sans inscription, un membre non inscrit ne la voit pas, un inscrit oui', async () => {
      prisma.partie.findMany.mockResolvedValue([episodique]);
      prisma.seance.findMany.mockResolvedValue([seance({ inscriptions: [{ userId: 'autre' }] })]);

      expect((await service.ownEventsOf('me', rolesOf('mj'), RANGE)).seances).toHaveLength(1);
      expect((await service.ownEventsOf('me', rolesOf('player'), RANGE)).seances).toEqual([]);

      prisma.seance.findMany.mockResolvedValue([seance({ inscriptions: [{ userId: 'me' }] })]);
      expect((await service.ownEventsOf('me', rolesOf('player'), RANGE)).seances).toHaveLength(1);
    });

    it('inscriptions ouvertes : épisodique, capacité définie, sans date — jamais filtrées par la fenêtre', async () => {
      prisma.partie.findMany.mockResolvedValue([episodique]);
      prisma.seance.findMany.mockResolvedValue([
        seance({
          id: 'ouverte',
          startDate: null,
          startSlot: null,
          inscriptionMin: null,
          inscriptionMax: 4,
          inscriptions: [{ userId: 'me' }, { userId: 'autre' }],
        }),
        seance({ id: 'datee', inscriptionMax: 4 }),
        seance({ id: 'sans-capacite', startDate: null, inscriptionMax: null }),
      ]);

      const own = await service.ownEventsOf('me', rolesOf('player'), RANGE);

      expect(own.inscriptionsOuvertes).toEqual([
        {
          seanceId: 'ouverte',
          partieId: 'A',
          partieName: 'Ma Partie',
          scenarioId: 'ev1',
          scenarioTitle: 'Le Donjon Oublié',
          inscriptionMin: 0,
          inscriptionMax: 4,
          inscritsCount: 2,
          jeSuisInscrit: true,
        },
      ]);
    });

    it('anti-spoil : un joueur ignore les séances d’un brouillon caché (hors ONE_SHOT), le MJ les voit toutes', async () => {
      prisma.partie.findMany.mockResolvedValue([episodique]);
      prisma.seance.findMany.mockResolvedValue([
        seance({
          id: 'brouillon-datee',
          inscriptions: [{ userId: 'me' }],
          event: {
            partieId: 'A',
            title: 'Secret',
            scenario: { status: 'BROUILLON' },
          },
        }),
        seance({
          id: 'brouillon-ouverte',
          startDate: null,
          startSlot: null,
          inscriptionMax: 4,
          event: { partieId: 'A', title: 'Secret', scenario: { status: 'BROUILLON' } },
        }),
        seance({
          id: 'ouvert',
          inscriptions: [{ userId: 'me' }],
          event: { partieId: 'A', title: 'Public', scenario: { status: 'A_VENIR' } },
        }),
      ]);

      const joueur = await service.ownEventsOf('me', rolesOf('player'), RANGE);
      expect(joueur.seances.map((s) => s.seanceId)).toEqual(['ouvert']);
      expect(joueur.inscriptionsOuvertes).toEqual([]);

      const mj = await service.ownEventsOf('me', rolesOf('mj'), RANGE);
      expect(mj.seances.map((s) => s.seanceId)).toEqual(['brouillon-datee', 'ouvert']);
      expect(mj.inscriptionsOuvertes.map((s) => s.seanceId)).toEqual(['brouillon-ouverte']);
    });

    it('anti-spoil, échec FERMÉ : un rôle inconnu (absent de la table des rôles) est traité comme un joueur', async () => {
      prisma.partie.findMany.mockResolvedValue([episodique]);
      prisma.seance.findMany.mockResolvedValue([
        seance({
          inscriptions: [{ userId: 'me' }],
          event: { partieId: 'A', title: 'Secret', scenario: { status: 'BROUILLON' } },
        }),
      ]);

      const own = await service.ownEventsOf('me', jest.fn().mockResolvedValue(new Map()), RANGE);

      expect(own.seances).toEqual([]);
    });

    it('anti-spoil : le brouillon d’un ONE_SHOT reste dans le calendrier du joueur (exemption)', async () => {
      prisma.partie.findMany.mockResolvedValue([partieA]);
      prisma.seance.findMany.mockResolvedValue([
        seance({
          event: { partieId: 'A', title: 'One-shot', scenario: { status: 'BROUILLON' } },
        }),
      ]);

      const own = await service.ownEventsOf('me', rolesOf('player'), RANGE);

      expect(own.seances.map((s) => s.seanceId)).toEqual(['se1']);
    });

    it('rencontre isolée de ralliement (ONE_SHOT) datée : règle historique — tout membre la voit, hôte ou non', async () => {
      prisma.partie.findMany.mockResolvedValue([{ ...partieA, gameSystemId: 'ralliement' }]);
      prisma.seance.findMany.mockResolvedValue([
        seance({ event: { partieId: 'A', title: 'Soirée', ownerId: 'quelquun', scenario: null } }),
      ]);
      const membre = jest.fn().mockResolvedValue(new Map([['A', 'member']]));

      const own = await service.ownEventsOf('me', membre, RANGE);

      expect(own.seances.map((s) => s.seanceId)).toEqual(['se1']);
    });

    it('ralliement (Story 40.1) : l’hôte voit son événement, un membre non inscrit non ; la sortie garde sa forme', async () => {
      const groupe = { ...episodique, gameSystemId: 'ralliement' };
      prisma.partie.findMany.mockResolvedValue([groupe]);
      prisma.seance.findMany.mockResolvedValue([
        seance({ event: { partieId: 'A', title: 'Catane', ownerId: 'me', scenario: null } }),
      ]);
      // Le rôle de partie ne décide pas : un simple membre hôte voit son événement.
      const roles = jest.fn().mockResolvedValue(new Map([['A', 'member']]));

      const own = await service.ownEventsOf('me', roles, RANGE);

      expect(own.parties).toEqual([episodique]);
      expect(own.seances.map((s) => [s.seanceId, s.scenarioTitle])).toEqual([['se1', 'Catane']]);

      const admin = jest.fn().mockResolvedValue(new Map([['A', 'admin']]));
      expect((await service.ownEventsOf('autre', admin, RANGE)).seances).toEqual([]);
    });

    it('inscriptions ouvertes : une partie non épisodique n’en a jamais', async () => {
      prisma.partie.findMany.mockResolvedValue([partieA]);
      prisma.seance.findMany.mockResolvedValue([
        seance({ startDate: null, startSlot: null, inscriptionMax: 4 }),
      ]);

      const own = await service.ownEventsOf('me', rolesOf('mj'), RANGE);

      expect(own.inscriptionsOuvertes).toEqual([]);
    });
  });
});
