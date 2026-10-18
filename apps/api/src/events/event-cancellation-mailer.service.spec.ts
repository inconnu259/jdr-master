import type { EmailService } from '../email/email.service';
import { EventCancellationMailer } from './event-cancellation-mailer.service';
import type { EventsService } from './events.service';

describe('EventCancellationMailer — e-mail n° 7 (Stories 42.1 et 42.3)', () => {
  let events: { cancellationNotice: jest.Mock };
  let email: { sendMail: jest.Mock };
  let mailer: EventCancellationMailer;

  const NOTICE = {
    partieId: 'g1',
    eventTitle: 'Catane',
    actorName: 'Léa',
    startDate: new Date('2026-11-14T00:00:00Z'),
    startSlot: 'EVENING',
    recipients: [
      { id: 'u2', email: 'u2@example.com' },
      { id: 'u3', email: 'u3@example.com' },
    ],
  };

  beforeEach(() => {
    events = { cancellationNotice: jest.fn().mockResolvedValue(NOTICE) };
    email = { sendMail: jest.fn().mockResolvedValue({ ok: true }) };
    mailer = new EventCancellationMailer(
      events as unknown as EventsService,
      email as unknown as EmailService,
    );
  });

  it('un e-mail « conjonction-annulee » par destinataire, au nom de l’auteur, avec le lien de la partie', async () => {
    await mailer.send('g1', 'e1', 'u1');

    expect(events.cancellationNotice).toHaveBeenCalledWith('e1', 'u1');
    expect(email.sendMail).toHaveBeenCalledTimes(2);
    expect(email.sendMail).toHaveBeenCalledWith(
      'conjonction-annulee',
      'u2@example.com',
      expect.objectContaining({
        actorName: 'Léa',
        eventTitle: 'Catane',
        link: expect.stringContaining('/parties/g1'),
      }),
    );
    expect(email.sendMail.mock.calls[0][2].sessionDate).toEqual(expect.any(String));
  });

  it('conjonction sans date : le gabarit reçoit sessionDate null', async () => {
    events.cancellationNotice.mockResolvedValue({ ...NOTICE, startDate: null, startSlot: null });

    await mailer.send('g1', 'e1', 'u1');

    expect(email.sendMail.mock.calls[0][2].sessionDate).toBeNull();
  });

  it('un échec d’envoi (ok: false) ou de lecture est journalisé et ne remonte jamais', async () => {
    email.sendMail.mockResolvedValue({ ok: false });
    await expect(mailer.send('g1', 'e1', 'u1')).resolves.toBeUndefined();
    expect(email.sendMail).toHaveBeenCalledTimes(2);

    events.cancellationNotice.mockRejectedValue(new Error('lecture'));
    await expect(mailer.send('g1', 'e1', 'u1')).resolves.toBeUndefined();
  });

  it('aucun destinataire, ou conjonction sans notice : aucun e-mail', async () => {
    events.cancellationNotice.mockResolvedValue({ ...NOTICE, recipients: [] });
    await mailer.send('g1', 'e1', 'u1');
    events.cancellationNotice.mockResolvedValue(null);
    await mailer.send('g1', 'e1', 'u1');

    expect(email.sendMail).not.toHaveBeenCalled();
  });
});
