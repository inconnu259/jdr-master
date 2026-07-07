import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';

// Test d'intégration réel contre Postgres : notifications.service.spec.ts mocke entièrement
// `prisma.partie.findMany`, donc la forme réelle du `where` (fenêtre 24h + `reminderSentAt: null`)
// et le snapshot des memberships au moment du job (AC2, AC5) n'étaient vérifiés que par lecture
// du code. Ce test exécute la vraie requête Prisma contre la DB du docker-compose ; seul
// EmailService est remplacé par un espion pour éviter un envoi réseau réel.
class FakeEmailService {
  calls: { to: string; data: Record<string, unknown> }[] = [];
  async sendMail(
    _template: string,
    to: string,
    data: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    this.calls.push({ to, data });
    return { ok: true };
  }
}

@Module({
  imports: [PrismaModule],
  providers: [
    NotificationsService,
    { provide: EmailService, useClass: FakeEmailService },
  ],
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

  it('AC2 + AC5 : ne rappelle que les parties dues, avec les membres réels au moment du job', async () => {
    const mj = await prisma.user.create({
      data: {
        email: `mj-${suffix}@test.local`,
        pseudo: `mj-${suffix}`,
        passwordHash: 'x',
      },
    });
    const player = await prisma.user.create({
      data: {
        email: `player-${suffix}@test.local`,
        pseudo: `player-${suffix}`,
        passwordHash: 'x',
      },
    });
    userIds.push(mj.id, player.id);

    const now = new Date();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const duePartie = await prisma.partie.create({
      data: {
        name: `Due-${suffix}`,
        kind: 'ONE_SHOT',
        gameSystemId: 'ryuutama',
        mjId: mj.id,
        nextSessionDate: in12h,
        nextSessionSlot: 'EVENING',
      },
    });
    const notYetDuePartie = await prisma.partie.create({
      data: {
        name: `NotYet-${suffix}`,
        kind: 'ONE_SHOT',
        gameSystemId: 'ryuutama',
        mjId: mj.id,
        nextSessionDate: in48h,
      },
    });
    const noDatePartie = await prisma.partie.create({
      data: {
        name: `NoDate-${suffix}`,
        kind: 'ONE_SHOT',
        gameSystemId: 'ryuutama',
        mjId: mj.id,
      },
    });
    partieIds.push(duePartie.id, notYetDuePartie.id, noDatePartie.id);

    await prisma.membership.create({
      data: { userId: player.id, partieId: duePartie.id },
    });

    await service.sendDueReminders();

    const recipients = fakeEmail.calls.map((c) => c.to).sort();
    expect(recipients).toEqual([mj.email, player.email].sort());

    const [refreshedDue, refreshedNotYet, refreshedNoDate] = await Promise.all([
      prisma.partie.findUniqueOrThrow({ where: { id: duePartie.id } }),
      prisma.partie.findUniqueOrThrow({ where: { id: notYetDuePartie.id } }),
      prisma.partie.findUniqueOrThrow({ where: { id: noDatePartie.id } }),
    ]);
    expect(refreshedDue.reminderSentAt).not.toBeNull();
    expect(refreshedNotYet.reminderSentAt).toBeNull();
    expect(refreshedNoDate.reminderSentAt).toBeNull();
  });
});
