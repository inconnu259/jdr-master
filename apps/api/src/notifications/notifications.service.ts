import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { DaySlot } from '@prisma/client';
import { EventsService, isRalliementGroup, type ReminderSeance } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'matin',
  AFTERNOON: 'après-midi',
  EVENING: 'soir',
  FULL_DAY: 'toute la journée',
};

/** Séance due telle que lue par la tâche : les champs de `ReminderSeance` (qui décide des
 *  destinataires, Story 40.3) plus ce que le message affiche. */
type DueSeance = ReminderSeance & {
  id: string;
  startDate: Date | null;
  startSlot: DaySlot | null;
  lieu?: string | null;
  event: ReminderSeance['event'] & {
    title?: string;
    partie: ReminderSeance['event']['partie'] & { id: string; name: string };
  };
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Garde de non-chevauchement : @Cron(EVERY_HOUR) ne suspend pas l'exécution suivante si
  // celle-ci dépasse 1h (beaucoup de séances/destinataires dus) — sans cette garde, deux runs
  // pourraient tous les deux voir Seance.reminderSentAt: null et double-envoyer avant que le
  // premier ne persiste sa mise à jour.
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    // Story 40.3 : seul décideur des destinataires du rappel (`reminderRecipients`).
    private readonly events: EventsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendDueReminders(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('sendDueReminders ignoré : une exécution précédente est encore en cours');
      return;
    }
    this.isRunning = true;
    try {
      await this.processDueReminders();
    } finally {
      this.isRunning = false;
    }
  }

  private async processDueReminders(): Promise<void> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Un rappel par séance datée (Story 37.9, AD-12) : une campagne à plusieurs séances dans les
    // 24 h rappelle chacune d'elles, et chaque séance porte sa propre marque d'envoi.
    const dueSeances = await this.prisma.seance.findMany({
      where: {
        startDate: { gte: now, lte: in24h },
        reminderSentAt: null,
      },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      include: {
        // Story 40.3 : les inscrits d'une conjonction, lus avec la séance (jamais une requête par séance).
        inscriptions: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { user: { select: { id: true, email: true } } },
        },
        event: {
          select: {
            title: true,
            owner: { select: { id: true, email: true } },
            scenario: { select: { status: true } },
            partie: {
              select: {
                id: true,
                name: true,
                kind: true,
                gameSystemId: true,
                owner: { select: { id: true, email: true } },
                memberships: {
                  include: { user: { select: { id: true, email: true } } },
                },
              },
            },
          },
        },
      },
    });

    for (const seance of dueSeances) {
      // Une séance en échec (base, données incohérentes) n'empêche pas les suivantes.
      try {
        await this.remindSeance(seance);
      } catch (error) {
        this.logger.error(
          `Échec du rappel de séance (partie ${seance.event.partie.id}, séance ${seance.id})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async remindSeance(seance: DueSeance): Promise<void> {
    const partie = seance.event.partie;
    // Destinataires : une seule définition, dans `events/` (propriétaire + membres pour le JDR, avec
    // l'anti-spoil des brouillons cachés ; hôte + inscrits pour un groupe).
    const recipients = this.events.reminderRecipients(seance);
    const group = isRalliementGroup(partie);
    const link = `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${partie.id}`;
    const sessionDate = this.formatSessionDate(seance.startDate!, seance.startSlot);
    for (const recipient of recipients) {
      // Story 40.3 : un groupe reçoit l'e-mail neutre de la conjonction (hôte et inscrits seulement) ;
      // le JDR et la rencontre isolée gardent `session-reminder`.
      const result = group
        ? await this.email.sendMail('conjonction-reminder', recipient.email, {
            eventTitle: seance.event.title,
            sessionDate,
            lieu: seance.lieu ?? null,
            link,
          })
        : await this.email.sendMail('session-reminder', recipient.email, {
            partieName: partie.name,
            sessionDate,
            link,
          });
      if (!result.ok) {
        this.logger.error(
          `Échec d'envoi du rappel à ${recipient.email} (partie ${partie.id}, séance ${seance.id})`,
        );
      }
    }
    // Marque après l'envoi, gardée par la date lue : si la date a changé entre-temps (rappel
    // ré-armé à null) ou si la séance a disparu, l'écriture ne touche rien et la nouvelle date
    // sera rappelée à un prochain passage.
    await this.prisma.seance.updateMany({
      where: { id: seance.id, startDate: seance.startDate, startSlot: seance.startSlot },
      data: { reminderSentAt: new Date() },
    });
  }

  private formatSessionDate(date: Date, slot: DaySlot | null): string {
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(date);
    return slot ? `${formatted} (${SLOT_LABELS[slot]})` : formatted;
  }
}
