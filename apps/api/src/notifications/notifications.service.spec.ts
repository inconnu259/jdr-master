import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EventsService } from '../events/events.service';
import type { RealtimeEventsService } from '../realtime/realtime-events.service';
import { anyOf, objectLike } from '../common/test-utils/jest-typed';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    seance: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let email: { sendMail: jest.Mock };

  const makeSeance = (
    overrides: Record<string, unknown> = {},
    partie: Record<string, unknown> = {},
  ) => ({
    id: 's1',
    startDate: new Date('2026-07-14T00:00:00.000Z'),
    startSlot: 'MORNING',
    event: {
      partie: {
        id: 'p1',
        name: 'La Nuit',
        owner: { id: 'mj1', email: 'mj@example.com' },
        memberships: [{ user: { id: 'u1', email: 'joueur@example.com' } }],
        ...partie,
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      seance: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    email = { sendMail: jest.fn().mockResolvedValue({ ok: true }) };
    // Story 40.3 : l'EventsService réel — `reminderRecipients` est pur (aucune lecture en base).
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
      new EventsService(prisma as unknown as PrismaService, {} as unknown as RealtimeEventsService),
    );
  });

  it('envoie un rappel à chaque destinataire (MJ + membres) puis marque le reminderSentAt de la séance', async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance()]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(email.sendMail).toHaveBeenCalledWith(
      'session-reminder',
      'mj@example.com',
      objectLike({ partieName: 'La Nuit' }),
    );
    expect(email.sendMail).toHaveBeenCalledWith(
      'session-reminder',
      'joueur@example.com',
      objectLike({ partieName: 'La Nuit' }),
    );
    expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.seance.updateMany).toHaveBeenCalledWith({
      where: objectLike({ id: 's1' }),
      data: objectLike({ reminderSentAt: anyOf(Date) }),
    });
  });

  describe('anti-spoil serveur — séance d’un brouillon caché', () => {
    const avecScenario = (status: string, kind: string) => {
      const s = makeSeance({}, { kind });
      return { ...s, event: { ...s.event, scenario: { status } } };
    };

    it('brouillon d’une campagne : seul le propriétaire est rappelé, la séance est quand même marquée', async () => {
      prisma.seance.findMany.mockResolvedValue([avecScenario('BROUILLON', 'CAMPAGNE_LINEAIRE')]);

      await service.sendDueReminders();

      expect(email.sendMail).toHaveBeenCalledTimes(1);
      expect(email.sendMail).toHaveBeenCalledWith(
        'session-reminder',
        'mj@example.com',
        objectLike({ partieName: 'La Nuit' }),
      );
      expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
    });

    it('brouillon d’un ONE_SHOT (exemption) : tout le monde est rappelé', async () => {
      prisma.seance.findMany.mockResolvedValue([avecScenario('BROUILLON', 'ONE_SHOT')]);

      await service.sendDueReminders();

      expect(email.sendMail).toHaveBeenCalledTimes(2);
    });

    it.each(['A_VENIR', 'COURANT', 'PASSE'])(
      'scénario %s d’une campagne : tout le monde est rappelé',
      async (status) => {
        prisma.seance.findMany.mockResolvedValue([avecScenario(status, 'CAMPAGNE_EPISODIQUE')]);

        await service.sendDueReminders();

        expect(email.sendMail).toHaveBeenCalledTimes(2);
      },
    );

    it('brouillon caché sans propriétaire : aucun e-mail, la séance est marquée', async () => {
      const s = avecScenario('BROUILLON', 'CAMPAGNE_LINEAIRE');
      s.event.partie.owner = null as never;
      prisma.seance.findMany.mockResolvedValue([s]);

      await service.sendDueReminders();

      expect(email.sendMail).not.toHaveBeenCalled();
      expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  it('formate la date depuis le début de la séance et pointe vers la partie', async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance({ startSlot: 'EVENING' })]);

    await service.sendDueReminders();

    const [, , data] = email.sendMail.mock.calls[0] as [
      string,
      string,
      { partieName: string; sessionDate: string; link: string },
    ];
    expect(data.partieName).toBe('La Nuit');
    expect(data.sessionDate).toBe('mardi 14 juillet (soir)');
    expect(data.link).toMatch(/\/parties\/p1$/);
  });

  it('séance sans créneau → date sans libellé de créneau', async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance({ startSlot: null })]);

    await service.sendDueReminders();

    const [, , data] = email.sendMail.mock.calls[0] as [string, string, { sessionDate: string }];
    expect(data.sessionDate).toBe('mardi 14 juillet');
  });

  describe('groupe de ralliement — rappel de la veille d’une conjonction (Story 40.3)', () => {
    const conjonction = (over: Record<string, unknown> = {}, inscrits: string[] = ['b', 'c']) => ({
      ...makeSeance(
        {
          lieu: 'Chez Léa',
          inscriptions: inscrits.map((id) => ({ user: { id, email: `${id}@example.com` } })),
          ...over,
        },
        {
          kind: 'CAMPAGNE_EPISODIQUE',
          gameSystemId: 'ralliement',
          owner: { id: 'admin', email: 'admin@example.com' },
          memberships: [
            { user: { id: 'admin', email: 'admin@example.com' } },
            { user: { id: 'a', email: 'a@example.com' } },
            { user: { id: 'b', email: 'b@example.com' } },
            { user: { id: 'c', email: 'c@example.com' } },
            { user: { id: 'd', email: 'd@example.com' } },
          ],
        },
      ),
    });
    const withHost = (seance: ReturnType<typeof conjonction>, title = 'Catane') => ({
      ...seance,
      event: { ...seance.event, title, owner: { id: 'a', email: 'a@example.com' } },
    });

    it('seuls l’hôte et les inscrits reçoivent l’e-mail neutre « conjonction-reminder », une fois chacun', async () => {
      prisma.seance.findMany.mockResolvedValue([withHost(conjonction({}, ['b', 'c', 'a']))]);

      await service.sendDueReminders();

      const sent = (email.sendMail.mock.calls as [string, string, Record<string, unknown>][]).map(
        ([template, to]) => [template, to],
      );
      expect(sent).toEqual([
        ['conjonction-reminder', 'a@example.com'],
        ['conjonction-reminder', 'b@example.com'],
        ['conjonction-reminder', 'c@example.com'],
      ]);
      expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
    });

    it('une place seulement RÉSERVÉE ne reçoit pas le rappel (Story 40.4) — hôte et inscrits confirmés seulement', async () => {
      const u = (id: string) => ({ id, email: `${id}@example.com` });
      prisma.seance.findMany.mockResolvedValue([
        withHost(
          conjonction({
            inscriptions: [
              { status: 'CONFIRMED', user: u('b') },
              { status: 'RESERVED', user: u('c') },
            ],
          }),
        ),
      ]);

      await service.sendDueReminders();

      const recipients = (email.sendMail.mock.calls as [string, string][]).map(([, to]) => to);
      expect(recipients).toEqual(['a@example.com', 'b@example.com']);
    });

    it('le message porte le titre, la date, le lieu et le lien vers la page du groupe', async () => {
      prisma.seance.findMany.mockResolvedValue([withHost(conjonction({ startSlot: 'EVENING' }))]);

      await service.sendDueReminders();

      const [, , data] = email.sendMail.mock.calls[0] as [string, string, Record<string, string>];
      expect(data.eventTitle).toBe('Catane');
      expect(data.sessionDate).toBe('mardi 14 juillet (soir)');
      expect(data.lieu).toBe('Chez Léa');
      expect(data.link).toMatch(/\/parties\/p1$/);
      expect(data).not.toHaveProperty('partieName');
    });

    it('sans lieu : lieu nul ; hôte disparu : seuls les inscrits reçoivent le rappel', async () => {
      const seance = withHost(conjonction({ lieu: null }));
      prisma.seance.findMany.mockResolvedValue([
        { ...seance, event: { ...seance.event, owner: null } },
      ]);

      await service.sendDueReminders();

      expect(email.sendMail).toHaveBeenCalledTimes(2);
      const [, , data] = email.sendMail.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(data.lieu).toBeNull();
    });

    it('un échec d’envoi est loggé, ne lève jamais, et la séance est quand même marquée', async () => {
      prisma.seance.findMany.mockResolvedValue([withHost(conjonction())]);
      email.sendMail.mockResolvedValue({ ok: false });
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.sendDueReminders()).resolves.toBeUndefined();

      expect(errorLog).toHaveBeenCalledTimes(3);
      expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
      errorLog.mockRestore();
    });

    it('rencontre isolée de ralliement (ONE_SHOT) : session-reminder à tous, comme avant', async () => {
      const s = conjonction();
      prisma.seance.findMany.mockResolvedValue([
        { ...s, event: { ...s.event, partie: { ...s.event.partie, kind: 'ONE_SHOT' } } },
      ]);

      await service.sendDueReminders();

      expect(email.sendMail).toHaveBeenCalledTimes(5);
      for (const [template] of email.sendMail.mock.calls as [string][]) {
        expect(template).toBe('session-reminder');
      }
    });
  });

  it('interroge les séances datées dans la fenêtre de 24 h dont le rappel est non envoyé', async () => {
    prisma.seance.findMany.mockResolvedValue([]);

    await service.sendDueReminders();

    const [args] = prisma.seance.findMany.mock.calls[0] as [
      { where: { startDate: { gte: Date; lte: Date }; reminderSentAt: null } },
    ];
    expect(args.where.reminderSentAt).toBeNull();
    expect(args.where.startDate.lte.getTime() - args.where.startDate.gte.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it('aucune séance due → aucun e-mail envoyé, aucune erreur', async () => {
    prisma.seance.findMany.mockResolvedValue([]);

    await expect(service.sendDueReminders()).resolves.toBeUndefined();
    expect(email.sendMail).not.toHaveBeenCalled();
    expect(prisma.seance.updateMany).not.toHaveBeenCalled();
  });

  it("un échec d'envoi pour un destinataire n'empêche pas les autres, et la séance est quand même marquée", async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance()]);
    email.sendMail.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(prisma.seance.updateMany).toHaveBeenCalledWith({
      where: objectLike({ id: 's1' }),
      data: objectLike({ reminderSentAt: anyOf(Date) }),
    });
  });

  it('deux séances dues de parties différentes dans le même run → chacune traitée indépendamment', async () => {
    const seance1 = makeSeance({ id: 's1' });
    const seance2 = makeSeance({ id: 's2' }, { id: 'p2', name: 'Le Jour' });
    prisma.seance.findMany.mockResolvedValue([seance1, seance2]);
    email.sendMail
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(4);
    expect(prisma.seance.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.seance.updateMany).toHaveBeenCalledWith({
      where: objectLike({ id: 's1' }),
      data: objectLike({ reminderSentAt: anyOf(Date) }),
    });
    expect(prisma.seance.updateMany).toHaveBeenCalledWith({
      where: objectLike({ id: 's2' }),
      data: objectLike({ reminderSentAt: anyOf(Date) }),
    });
  });

  it('deux séances dues de la même partie → un rappel par séance et par destinataire', async () => {
    prisma.seance.findMany.mockResolvedValue([
      makeSeance({ id: 's1', startSlot: 'MORNING' }),
      makeSeance({ id: 's2', startSlot: 'EVENING' }),
    ]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(4);
    const toJoueur = (email.sendMail.mock.calls as [string, string, { sessionDate: string }][])
      .filter(([, to]) => to === 'joueur@example.com')
      .map(([, , data]) => data.sessionDate);
    expect(toJoueur).toEqual(['mardi 14 juillet (matin)', 'mardi 14 juillet (soir)']);
    expect(prisma.seance.updateMany).toHaveBeenCalledTimes(2);
  });

  it('le MJ apparaissant aussi dans memberships ne reçoit le rappel qu’une seule fois', async () => {
    prisma.seance.findMany.mockResolvedValue([
      makeSeance({}, { memberships: [{ user: { id: 'mj1', email: 'mj@example.com' } }] }),
    ]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(1);
  });

  it('propriétaire absent (compte supprimé) → seuls les membres reçoivent le rappel', async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance({}, { owner: null })]);

    await service.sendDueReminders();

    expect(email.sendMail).toHaveBeenCalledTimes(1);
    expect(email.sendMail).toHaveBeenCalledWith(
      'session-reminder',
      'joueur@example.com',
      objectLike({ partieName: 'La Nuit' }),
    );
    expect(prisma.seance.updateMany).toHaveBeenCalledTimes(1);
  });

  it('le marquage est gardé par la date lue (no-op si la date a changé entre-temps)', async () => {
    const startDate = new Date('2026-07-14T00:00:00.000Z');
    prisma.seance.findMany.mockResolvedValue([makeSeance({ startDate, startSlot: 'EVENING' })]);

    await service.sendDueReminders();

    expect(prisma.seance.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', startDate, startSlot: 'EVENING' },
      data: { reminderSentAt: anyOf(Date) },
    });
  });

  it("une séance en échec n'empêche pas le traitement de la suivante", async () => {
    prisma.seance.findMany.mockResolvedValue([
      makeSeance({ id: 's1' }),
      makeSeance({ id: 's2' }, { id: 'p2', name: 'Le Jour' }),
    ]);
    prisma.seance.updateMany.mockRejectedValueOnce(new Error('base indisponible'));
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.sendDueReminders()).resolves.toBeUndefined();

    expect(email.sendMail).toHaveBeenCalledTimes(4);
    expect(prisma.seance.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.seance.updateMany).toHaveBeenLastCalledWith(
      objectLike({ where: objectLike({ id: 's2' }) }),
    );
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('séance s1'), anyOf(String));
    errorLog.mockRestore();
  });

  it('une exécution déjà en cours empêche un second run concurrent de démarrer', async () => {
    prisma.seance.findMany.mockResolvedValue([makeSeance()]);

    // isRunning est positionné de façon synchrone avant le premier await : ces deux appels,
    // non attendus individuellement, s'exécutent donc en chevauchement délibéré.
    const firstRun = service.sendDueReminders();
    const secondRun = service.sendDueReminders();
    await Promise.all([firstRun, secondRun]);

    expect(prisma.seance.findMany).toHaveBeenCalledTimes(1);
  });
});
