import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { DaySlot } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'matin',
  AFTERNOON: 'après-midi',
  EVENING: 'soir',
  FULL_DAY: 'toute la journée',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Garde de non-chevauchement : @Cron(EVERY_HOUR) ne suspend pas l'exécution suivante si
  // celle-ci dépasse 1h (beaucoup de parties/destinataires dus) — sans cette garde, deux runs
  // pourraient tous les deux voir reminderSentAt: null et double-envoyer avant que le premier
  // ne persiste sa mise à jour.
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendDueReminders(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'sendDueReminders ignoré : une exécution précédente est encore en cours',
      );
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

    const dueParties = await this.prisma.partie.findMany({
      where: {
        nextSessionDate: { gte: now, lte: in24h },
        reminderSentAt: null,
      },
      include: {
        mj: { select: { id: true, email: true } },
        memberships: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    for (const partie of dueParties) {
      const allRecipients = [
        partie.mj,
        ...partie.memberships.map((m) => m.user),
      ];
      const recipients = [
        ...new Map(allRecipients.map((r) => [r.id, r])).values(),
      ];
      for (const recipient of recipients) {
        const result = await this.email.sendMail(
          'session-reminder',
          recipient.email,
          {
            partieName: partie.name,
            sessionDate: this.formatSessionDate(
              partie.nextSessionDate!,
              partie.nextSessionSlot,
            ),
            link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${partie.id}`,
          },
        );
        if (!result.ok) {
          this.logger.error(
            `Échec d'envoi du rappel de séance à ${recipient.email} (partie ${partie.id})`,
          );
        }
      }
      await this.prisma.partie.update({
        where: { id: partie.id },
        data: { reminderSentAt: new Date() },
      });
    }
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
