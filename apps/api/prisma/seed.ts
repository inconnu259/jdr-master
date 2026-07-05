import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readAdminSeedConfig, seedAdmin } from '../src/prisma/seed-admin';

// Inscription sur invitation → il faut un PREMIER compte (admin) pour amorcer le système.
// Logique de config/upsert testée unitairement dans src/prisma/seed-admin.spec.ts (ce fichier
// est un point d'entrée hors du rootDir Jest de l'API, volontairement non testé lui-même).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const config = readAdminSeedConfig(process.env);
  await seedAdmin(prisma, config);
  console.log(`✓ Admin seedé : ${config.email} (pseudo: ${config.pseudo})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
