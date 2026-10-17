import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { EmailTemplate } from './email-template.enum';

// Objet par gabarit (FR-2 : "objet clair"). Interpolé par MailerService via le même contexte
// que le corps de l'e-mail (ex. {{partieName}} résolu depuis `data`).
const SUBJECTS: Record<EmailTemplate, string> = {
  invitation: 'Invitation à rejoindre {{partieName}}',
  // Story 39.3 : e-mail neutre (aucun mot de jeu de rôle, l'invité peut ne pas avoir de compte).
  'group-invitation': '{{inviterName}} vous invite à rejoindre « {{partieName}} »',
  'session-reminder': 'Rappel : séance de {{partieName}} demain',
  // Story 40.3 : rappel de la veille d'une conjonction de groupe — vocabulaire neutre, aucun mot de JDR.
  'conjonction-reminder': 'Demain : « {{eventTitle}} »',
  'password-reset': 'Réinitialisation de votre mot de passe',
  'password-changed': 'Votre mot de passe a été modifié',
  'level-up': 'Nouveau niveau disponible pour {{characterName}}',
  'email-change-confirm': 'Confirmez votre nouvelle adresse e-mail',
  'email-change-notice': "Un changement d'adresse e-mail a été demandé",
  'email-change-rollback-available': 'Votre adresse e-mail a été modifiée',
  'email-change-rolled-back': 'Votre adresse e-mail a été restaurée',
};

// Libellé du bouton d'action (Story 39.2) : le gabarit commun `layout.hbs` dessine un bouton vert plein
// quand le contexte porte `link` ET `actionLabel`. `null` = e-mail sans action, donc sans bouton. Record
// sur l'union fermée : un nouveau gabarit ne compile pas tant qu'il n'a pas déclaré son bouton.
const ACTION_LABELS: Record<EmailTemplate, string | null> = {
  invitation: 'Rejoindre la partie',
  'group-invitation': 'Rejoindre le groupe',
  'session-reminder': 'Voir la partie',
  'conjonction-reminder': 'Voir la rencontre',
  'password-reset': 'Choisir un nouveau mot de passe',
  'password-changed': null,
  'level-up': 'Voir la fiche',
  'email-change-confirm': 'Confirmer cette nouvelle adresse',
  'email-change-notice': null,
  'email-change-rollback-available': 'Annuler ce changement et restaurer mon adresse',
  'email-change-rolled-back': 'Réinitialiser mon mot de passe',
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
        context: { ...data, actionLabel: ACTION_LABELS[template] },
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
