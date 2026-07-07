import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    partie: { findMany: jest.Mock; update: jest.Mock };
  };
  let email: { sendMail: jest.Mock };

  const makePartie = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    name: 'La Nuit',
    nextSessionDate: new Date(),
    nextSessionSlot: 'MORNING',
    mj: { id: 'mj1', email: 'mj@example.com' },
    memberships: [{ user: { id: 'u1', email: 'joueur@example.com' } }],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      partie: { findMany: jest.fn(), update: jest.fn() },
    };
    email = { sendMail: jest.fn().mockResolvedValue({ ok: true }) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
    );
  });

  it('envoie un rappel à chaque destinataire (MJ + membres) puis marque reminderSentAt', async () => {
    const partie = makePartie();
    prisma.partie.findMany.mockResolvedValue([partie]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(email.sendMail).toHaveBeenCalledWith(
      'session-reminder',
      'mj@example.com',
      expect.objectContaining({ partieName: 'La Nuit' }),
    );
    expect(email.sendMail).toHaveBeenCalledWith(
      'session-reminder',
      'joueur@example.com',
      expect.objectContaining({ partieName: 'La Nuit' }),
    );
    expect(prisma.partie.update).toHaveBeenCalledTimes(1);
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
    });
  });

  it('aucune partie due → aucun e-mail envoyé, aucune erreur', async () => {
    prisma.partie.findMany.mockResolvedValue([]);

    await expect(service.sendDueReminders()).resolves.toBeUndefined();
    expect(email.sendMail).not.toHaveBeenCalled();
    expect(prisma.partie.update).not.toHaveBeenCalled();
  });

  it("un échec d'envoi pour un destinataire n'empêche pas les autres, et la partie est quand même marquée", async () => {
    const partie = makePartie();
    prisma.partie.findMany.mockResolvedValue([partie]);
    email.sendMail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
    });
  });

  it('deux parties dues dans le même run → chacune traitée indépendamment', async () => {
    const partie1 = makePartie({ id: 'p1' });
    const partie2 = makePartie({ id: 'p2', name: 'Le Jour' });
    prisma.partie.findMany.mockResolvedValue([partie1, partie2]);
    email.sendMail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(4);
    expect(prisma.partie.update).toHaveBeenCalledTimes(2);
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
    });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
    });
  });

  it('le MJ apparaissant aussi dans memberships ne reçoit le rappel qu’une seule fois', async () => {
    const partie = makePartie({
      memberships: [{ user: { id: 'mj1', email: 'mj@example.com' } }],
    });
    prisma.partie.findMany.mockResolvedValue([partie]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(1);
  });

  it('une exécution déjà en cours empêche un second run concurrent de démarrer', async () => {
    prisma.partie.findMany.mockResolvedValue([makePartie()]);

    // isRunning est positionné de façon synchrone avant le premier await : ces deux appels,
    // non attendus individuellement, s'exécutent donc en chevauchement délibéré.
    const firstRun = service.sendDueReminders();
    const secondRun = service.sendDueReminders();
    await Promise.all([firstRun, secondRun]);

    expect(prisma.partie.findMany).toHaveBeenCalledTimes(1);
  });
});
