import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import connectPgSimple from 'connect-pg-simple';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // En-têtes de sécurité.
  app.use(helmet());

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
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
