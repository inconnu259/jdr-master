import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { EmailTemplate } from './email-template.enum';

// Objet par gabarit (FR-2 : "objet clair"). Interpolé par MailerService via le même contexte
// que le corps de l'e-mail (ex. {{partieName}} résolu depuis `data`).
const SUBJECTS: Record<EmailTemplate, string> = {
  invitation: 'Invitation à rejoindre {{partieName}}',
  'session-reminder': 'Rappel : séance de {{partieName}} demain',
  'password-reset': 'Réinitialisation de votre mot de passe',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailer: MailerService) {}

  /** Ne relance jamais : un échec d'envoi est loggé (NFR) et signalé via `{ ok: false }`, jamais une exception. */
  async sendMail(
    template: EmailTemplate,
    to: string,
    data: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    try {
      await this.mailer.sendMail({
        to,
        subject: SUBJECTS[template],
        template,
        context: data,
      });
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Échec d'envoi de l'e-mail "${template}" à ${to}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { ok: false };
    }
  }
}
