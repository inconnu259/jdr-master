import { defineConfig, env } from 'prisma/config';

// Prisma 7 : l'URL de connexion n'est plus dans schema.prisma — elle vit ici (pour la CLI :
// generate, db push, migrate). Le client runtime se connecte, lui, via le driver adapter
// (@prisma/adapter-pg) — voir src/prisma/prisma.service.ts.
type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});
