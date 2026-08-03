import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Les portraits sont servis via GET /characters/:id/portrait (AuthenticatedGuard),
  // jamais en fichiers statiques publics — cf. Character.updatePortrait/getPortraitFile.

  // En-têtes de sécurité. `crossOriginResourcePolicy` par défaut ('same-origin') bloquerait
  // le chargement cross-origin des <img src="…/portrait"> (le front est sur un port différent,
  // cf. WEB_ORIGIN) — l'accès reste contrôlé par CORS + AuthenticatedGuard, pas par ce header.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Session stockée en base (Postgres) → révocable. Le cookie ne contient qu'un id de session.
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false, // la table "session" est gérée par Prisma (modèle Session)
      }),
      secret: process.env.SESSION_SECRET ?? 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // inaccessible au JS → pas de vol par XSS
        secure: process.env.NODE_ENV === 'production', // HTTPS only en prod
        sameSite: 'lax', // mitige le CSRF
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Valide et nettoie les entrées (rejette les champs non déclarés dans les DTO).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Le front (autre origine en dev) doit pouvoir envoyer le cookie → credentials: true.
  // `WEB_ORIGIN` accepte une LISTE d'origines séparées par des virgules : en dev il faut autoriser
  // simultanément `localhost:4200` (navigateur du poste) et l'IP LAN du poste (`192.168.x.x:4200`,
  // utilisée depuis un vrai téléphone pour valider le rendu mobile du Palier 9).
  //
  // ⚠️ CHANGEMENT DE DEV À REVOIR AVANT LA MISE EN PRODUCTION (Palier 10) : en prod `WEB_ORIGIN`
  // ne doit contenir QUE l'origine publique réelle — surtout aucune IP de réseau local.
  // Voir docs/backlog.md § Palier 10.
  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: webOrigins,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
