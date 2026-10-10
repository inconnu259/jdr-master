import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { EventsService } from './events.service';
import { testGrant } from '../common/test-utils/grant';

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
      updateMany: jest.fn(),
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
    event: { count: jest.fn().mockResolvedValue(1) },
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

    it('setSpanFromPollInTx() pose une plage start = end sur la séance du vote, sans émettre', async () => {
      const d = new Date('2026-11-03T00:00:00.000Z');

      await service.setSpanFromPollInTx(
        prisma.tx as unknown as Prisma.TransactionClient,
        'poll1',
        d,
        'EVENING',
      );

      expect(prisma.tx.seance.updateMany).toHaveBeenCalledWith({
        where: { pollId: 'poll1' },
        data: { startDate: d, startSlot: 'EVENING', endDate: d, endSlot: 'EVENING' },
      });
      expect(realtime.emit).not.toHaveBeenCalled();
    });

    it('resetSeanceDate() détache le vote, le supprime, recalcule et émet', async () => {
      await service.resetSeanceDate(GRANT_P1, seance);

      expect(prisma.seance.update).toHaveBeenCalledWith({
        where: { id: 'se2' },
        data: { pollId: null, startDate: null, startSlot: null, endDate: null, endSlot: null },
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

  it('recalculateNextSession() lit les séances par l’événement et pose la plus proche date future', async () => {
    const future = new Date(Date.UTC(2099, 0, 2));
    prisma.seance.findMany.mockResolvedValue([
      { startDate: new Date(Date.UTC(2099, 0, 5)), startSlot: null },
      { startDate: future, startSlot: 'EVENING' },
    ]);

    await service.recalculateNextSession('p1');

    expect(prisma.seance.findMany).toHaveBeenCalledWith({
      where: { event: { partieId: 'p1' } },
      select: { startDate: true, startSlot: true },
    });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { nextSessionDate: future, nextSessionSlot: 'EVENING', reminderSentAt: null },
    });
  });
});
