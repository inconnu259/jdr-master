import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { EventsService } from './events.service';

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
    seance: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      update: jest.fn(),
    },
    sessionPoll: { delete: jest.fn() },
    inscription: { deleteMany: jest.fn() },
    partie: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'p1',
        nextSessionDate: null,
        nextSessionSlot: null,
      }),
      update: jest.fn(),
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

      const result = await service.create(
        { partieId: 'p1', title: EVENT.title, ownerId: 'mj1' },
        extend,
      );

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
        service.create({ partieId: 'p1', title: 'X', ownerId: 'mj1' }, extend),
      ).rejects.toThrow('échec extension');
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('ONE_SHOT déjà pourvu d’un événement → 400, aucune écriture', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([{ kind: 'ONE_SHOT' }]);
      prisma.tx.event.findFirst.mockResolvedValue({ id: 'existant' });

      await expect(
        service.create({ partieId: 'p1', title: 'Second', ownerId: 'mj1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tx.event.create).not.toHaveBeenCalled();
      expect(prisma.tx.seance.create).not.toHaveBeenCalled();
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('ONE_SHOT sans événement → création autorisée (le premier, créé avec la partie)', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([{ kind: 'ONE_SHOT' }]);

      await service.create({ partieId: 'p1', title: 'Unique', ownerId: 'mj1' });

      expect(prisma.tx.event.findFirst).toHaveBeenCalledWith({
        where: { partieId: 'p1' },
        select: { id: true },
      });
      expect(prisma.tx.event.create).toHaveBeenCalledTimes(1);
    });

    it('partie introuvable sous le verrou → 404', async () => {
      prisma.tx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.create({ partieId: 'absente', title: 'X', ownerId: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tx.event.create).not.toHaveBeenCalled();
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
      await service.addSeance('p1', 'e1');

      expect(prisma.seance.create).toHaveBeenCalledWith({ data: { eventId: 'e1' } });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('deleteSeance() refuse la première séance de l’événement', async () => {
      prisma.seance.findMany.mockResolvedValueOnce([{ id: 'se2' }]);

      await expect(service.deleteSeance('p1', seance)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.seance.delete).not.toHaveBeenCalled();
    });

    it('deleteSeance() supprime la séance PUIS son vote, recalcule la prochaine date et émet', async () => {
      prisma.seance.findMany.mockResolvedValueOnce([{ id: 'se1' }]);

      await service.deleteSeance('p1', seance);

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

      await expect(service.deleteSeance('p1', seance)).rejects.toBeInstanceOf(NotFoundException);
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('createSeancePoll() refuse une séance déjà liée AVANT de créer le vote', async () => {
      const createPoll = jest.fn();

      await expect(service.createSeancePoll('p1', seance, createPoll)).rejects.toThrow(
        'Cette séance est déjà liée à un vote de date',
      );
      expect(createPoll).not.toHaveBeenCalled();
    });

    it('createSeancePoll() pose Seance.pollId du vote créé par l’appelant et émet', async () => {
      const createPoll = jest.fn().mockResolvedValue({ id: 'poll9' });

      await service.createSeancePoll('p1', { ...seance, pollId: null }, createPoll);

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: { pollId: 'poll9' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('resetSeanceDate() détache le vote, le supprime, recalcule et émet', async () => {
      await service.resetSeanceDate('p1', seance);

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: { pollId: null, dateValidee: null },
      });
      expect(prisma.sessionPoll.delete).toHaveBeenCalledWith({ where: { id: 'poll1' } });
      expect(prisma.partie.update).toHaveBeenCalled();
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('setSeanceCapacity() refuse max < min, sans écriture', async () => {
      await expect(service.setSeanceCapacity('p1', 'se2', 4, 2)).rejects.toThrow(
        'Le maximum doit être supérieur ou égal au minimum',
      );
      expect(prisma.seance.update).not.toHaveBeenCalled();
    });

    it('setInfosPratiques() écrit les trois champs tels quels et émet', async () => {
      await service.setInfosPratiques('p1', 'se2', {
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

  describe('inscriptions', () => {
    const open = { id: 'se1', inscriptionMax: 2, dateValidee: null, poll: null };

    it('capacité non définie → 400, aucune transaction', async () => {
      await expect(
        service.inscrire('p1', { ...open, inscriptionMax: null }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('date validée (vote scellé) → 400, roster figé', async () => {
      await expect(
        service.inscrire('p1', { ...open, poll: { chosenDate: new Date() } }, 'u1'),
      ).rejects.toThrow('Cette séance a déjà une date validée — les inscriptions sont figées');
    });

    it('verrou FOR UPDATE puis inscription, émission après validation', async () => {
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({ ...open, poll: null });

      await service.inscrire('p1', open, 'u1');

      expect(prisma.tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.tx.inscription.create).toHaveBeenCalledWith({
        data: { seanceId: 'se1', userId: 'u1' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });

    it('déjà inscrit → idempotent, aucun comptage ni création', async () => {
      prisma.tx.inscription.findUnique.mockResolvedValue({ id: 'i1' });

      await service.inscrire('p1', open, 'u1');

      expect(prisma.tx.inscription.count).not.toHaveBeenCalled();
      expect(prisma.tx.inscription.create).not.toHaveBeenCalled();
    });

    it('plafond atteint sous le verrou → 409', async () => {
      prisma.tx.seance.findUniqueOrThrow.mockResolvedValue({ ...open, poll: null });
      prisma.tx.inscription.count.mockResolvedValue(2);

      await expect(service.inscrire('p1', open, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('desinscrire() : date validée → 400 ; sinon retrait idempotent et émission', async () => {
      await expect(
        service.desinscrire('p1', { id: 'se1', dateValidee: new Date(), poll: null }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inscription.deleteMany).not.toHaveBeenCalled();

      await service.desinscrire('p1', { id: 'se1', dateValidee: null, poll: null }, 'u1');
      expect(prisma.inscription.deleteMany).toHaveBeenCalledWith({
        where: { seanceId: 'se1', userId: 'u1' },
      });
      expect(realtime.emit).toHaveBeenCalledWith(partieTopic('p1'));
    });
  });

  it('recalculateNextSession() lit les séances par l’événement et pose la plus proche date future', async () => {
    const future = new Date(Date.UTC(2099, 0, 2));
    prisma.seance.findMany.mockResolvedValue([
      { poll: null, dateValidee: new Date(Date.UTC(2099, 0, 5)) },
      { poll: { chosenDate: future, chosenSlot: 'EVENING' }, dateValidee: null },
    ]);

    await service.recalculateNextSession('p1');

    expect(prisma.seance.findMany).toHaveBeenCalledWith({
      where: { event: { partieId: 'p1' } },
      include: { poll: true },
    });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { nextSessionDate: future, nextSessionSlot: 'EVENING', reminderSentAt: null },
    });
  });
});
