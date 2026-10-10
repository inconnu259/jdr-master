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

type DueSeance = {
  id: string;
  startDate: Date | null;
  startSlot: DaySlot | null;
  event: {
    partie: {
      id: string;
      name: string;
      owner: { id: string; email: string } | null;
      memberships: { user: { id: string; email: string } }[];
    };
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
        event: {
          select: {
            partie: {
              select: {
                id: true,
                name: true,
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
    // Propriétaire absent (AD-5, compte supprimé) : seuls les membres restent destinataires.
    const allRecipients = [
      ...(partie.owner ? [partie.owner] : []),
      ...partie.memberships.map((m) => m.user),
    ];
    const recipients = [...new Map(allRecipients.map((r) => [r.id, r])).values()];
    for (const recipient of recipients) {
      const result = await this.email.sendMail('session-reminder', recipient.email, {
        partieName: partie.name,
        sessionDate: this.formatSessionDate(seance.startDate!, seance.startSlot),
        link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${partie.id}`,
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
