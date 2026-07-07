import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EmailModule } from './email.module';
import { EmailService } from './email.service';

// Test d'intégration réel : envoie un e-mail via le transport SMTP configuré (Mailpit en
// dev/test) et vérifie via l'API HTTP de Mailpit que le layout, le sujet interpolé et le lien
// arrivent bien. Un test unitaire mocké (email.service.spec.ts) ne peut pas attraper une
// régression sur la config du transport/du layout — ce test l'aurait fait pendant cette story
// (deux bugs réels n'ont été trouvés que par vérification manuelle : import HandlebarsAdapter,
// placement de l'option `layout`).
//
// Ignoré gracieusement si Mailpit n'est pas joignable (ex. exécution hors `docker compose up`).
const MAILPIT_API = `http://${process.env.MAIL_HOST ?? 'mailpit'}:8025`;

async function isMailpitReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT_API}/api/v1/messages?limit=1`);
    return res.ok;
  } catch {
    return false;
  }
}

@Module({ imports: [EmailModule] })
class TestAppModule {}

describe('EmailModule (intégration réelle via Mailpit)', () => {
  let reachable = false;

  beforeAll(async () => {
    reachable = await isMailpitReachable();
    if (!reachable) {
      console.warn(
        `Mailpit injoignable sur ${MAILPIT_API} — test d'intégration ignoré (lancer via "docker compose up").`,
      );
    }
  });

  it('envoie un e-mail réel, retrouvé dans Mailpit avec sujet interpolé, layout et lien', async () => {
    if (!reachable) return;

    const app = await NestFactory.createApplicationContext(TestAppModule, {
      logger: false,
    });
    const email = app.get(EmailService);
    const to = `integration-test-${Date.now()}@example.com`;

    try {
      const result = await email.sendMail('invitation', to, {
        partieName: 'Test Intégration',
        link: 'https://example.com/invite/test',
      });
      expect(result).toEqual({ ok: true });

      const searchRes = await fetch(
        `${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      const search = (await searchRes.json()) as {
        messages: Array<{ ID: string }>;
      };
      expect(search.messages.length).toBeGreaterThan(0);

      const messageRes = await fetch(
        `${MAILPIT_API}/api/v1/message/${search.messages[0].ID}`,
      );
      const message = (await messageRes.json()) as {
        Subject: string;
        HTML: string;
      };
      expect(message.Subject).toBe('Invitation à rejoindre Test Intégration');
      expect(message.HTML).toContain('jdr-master'); // preuve que layout.hbs enveloppe le corps
      expect(message.HTML).toContain('https://example.com/invite/test');
    } finally {
      await app.close();
    }
  });
});
