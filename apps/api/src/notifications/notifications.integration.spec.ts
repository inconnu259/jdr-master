import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';

// Test d'intégration réel contre Postgres : notifications.service.spec.ts mocke entièrement
// `prisma.seance.findMany`, donc la forme réelle du `where` (fenêtre 24h + `reminderSentAt: null`)
// et le snapshot des memberships au moment du job (AC2, AC5) n'étaient vérifiés que par lecture
// du code. Ce test exécute la vraie requête Prisma contre la DB du docker-compose ; seul
// EmailService est remplacé par un espion pour éviter un envoi réseau réel.
class FakeEmailService {
  calls: { to: string; data: Record<string, unknown> }[] = [];
  sendMail(_template: string, to: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
    this.calls.push({ to, data });
    return Promise.resolve({ ok: true });
  }
}

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, { provide: EmailService, useClass: FakeEmailService }],
})
class TestAppModule {}

describe('NotificationsService (intégration réelle via Postgres)', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let prisma: PrismaService;
  let service: NotificationsService;
  let fakeEmail: FakeEmailService;

  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const partieIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestAppModule, {
      logger: false,
    });
    prisma = app.get(PrismaService);
    service = app.get(NotificationsService);
    fakeEmail = app.get(EmailService);
  });

  afterAll(async () => {
    await prisma.partie.deleteMany({ where: { id: { in: partieIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    // PrismaService n'implémente pas OnModuleDestroy : app.close() seul ne ferme pas le pool
    // de connexions pg sous-jacent (adapter driver), ce qui laisse un handle actif et empêche
    // Jest de sortir proprement.
    await prisma.$disconnect();
    await app.close();
  });

  it('AC2 + AC5 : ne rappelle que les séances dues, avec les membres réels au moment du job', async () => {
    const mj = await prisma.user.create({
      data: {
        email: `mj-${suffix}@test.local`,
        pseudo: `mj-${suffix}`,
        displayName: `mj-${suffix}`,
        passwordHash: 'x',
      },
    });
    const player = await prisma.user.create({
      data: {
        email: `player-${suffix}@test.local`,
        pseudo: `player-${suffix}`,
        displayName: `player-${suffix}`,
        passwordHash: 'x',
      },
    });
    userIds.push(mj.id, player.id);

    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Une partie, un événement et une séance datée (la séance porte la date et le rappel).
    const partieAvecSeance = async (
      name: string,
      startDate: Date | null,
      startSlot?: 'EVENING',
    ) => {
      const partie = await prisma.partie.create({
        data: {
          name,
          kind: 'ONE_SHOT',
          gameSystemId: 'ryuutama',
          ownerId: mj.id,
          nextSessionDate: startDate,
          nextSessionSlot: startSlot ?? null,
        },
      });
      partieIds.push(partie.id);
      const event = await prisma.event.create({
        data: { partieId: partie.id, title: name, ownerId: mj.id },
      });
      const seance = await prisma.seance.create({
        data: {
          eventId: event.id,
          startDate,
          startSlot: startSlot ?? null,
          endDate: startDate,
          endSlot: startSlot ?? null,
        },
      });
      return { partie, seance };
    };

    const due = await partieAvecSeance(`Due-${suffix}`, in12h, 'EVENING');
    const notYetDue = await partieAvecSeance(`NotYet-${suffix}`, in48h);
    const noDate = await partieAvecSeance(`NoDate-${suffix}`, null);

    await prisma.membership.create({
      data: { userId: player.id, partieId: due.partie.id },
    });

    await service.sendDueReminders();

    const recipients = fakeEmail.calls.map((c) => c.to).sort();
    expect(recipients).toEqual([mj.email, player.email].sort());

    const [refreshedDue, refreshedNotYet, refreshedNoDate] = await Promise.all([
      prisma.seance.findUniqueOrThrow({ where: { id: due.seance.id } }),
      prisma.seance.findUniqueOrThrow({ where: { id: notYetDue.seance.id } }),
      prisma.seance.findUniqueOrThrow({ where: { id: noDate.seance.id } }),
    ]);
    expect(refreshedDue.reminderSentAt).not.toBeNull();
    expect(refreshedNotYet.reminderSentAt).toBeNull();
    expect(refreshedNoDate.reminderSentAt).toBeNull();
  });
});
