import { Logger } from '@nestjs/common';
import type { MailerService } from '@nestjs-modules/mailer';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let mailer: { sendMail: jest.Mock };

  beforeEach(() => {
    mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
    service = new EmailService(mailer as unknown as MailerService);
  });

  it('transmet to/template/context à MailerService et renvoie { ok: true }', async () => {
    const result = await service.sendMail('invitation', 'ami@example.com', {
      partieName: 'La Forêt Ancienne',
      link: 'https://jdr-master.local/invite/abc',
    });

    expect(mailer.sendMail).toHaveBeenCalledWith({
      to: 'ami@example.com',
      subject: 'Invitation à rejoindre {{partieName}}',
      template: 'invitation',
      context: {
        partieName: 'La Forêt Ancienne',
        link: 'https://jdr-master.local/invite/abc',
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it('sujet correct par gabarit (session-reminder, password-reset)', async () => {
    await service.sendMail('session-reminder', 'joueur@example.com', {});
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Rappel : séance de {{partieName}} demain',
      }),
    );

    await service.sendMail('password-reset', 'joueur@example.com', {});
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Réinitialisation de votre mot de passe',
      }),
    );

    await service.sendMail('level-up', 'joueur@example.com', {});
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Nouveau niveau disponible pour {{characterName}}',
      }),
    );
  });

  it("catch une erreur d'envoi, la logge, et renvoie { ok: false } sans relancer", async () => {
    const error = new Error('ECONNREFUSED');
    mailer.sendMail.mockRejectedValue(error);
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await service.sendMail('invitation', 'ami@example.com', {});

    expect(result).toEqual({ ok: false });
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('invitation'),
      expect.any(String),
    );

    loggerSpy.mockRestore();
  });
});
