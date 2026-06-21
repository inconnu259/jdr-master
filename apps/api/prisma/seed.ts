import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

// Inscription sur invitation → il faut un PREMIER compte (admin) pour amorcer le système.
// Ce seed est idempotent (upsert) et lit ses valeurs depuis l'environnement.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@master-jdr.local';
  const pseudo = process.env.ADMIN_PSEUDO ?? 'admin';
  // Pas de mot de passe en dur : il vient de l'env (en dev, de .env.dev → rien à re-saisir).
  // En prod, si on oublie de le définir, on échoue franchement plutôt que d'utiliser une valeur publique.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD non défini (cf. .env / .env.dev) — définis-le avant de seeder.');
  }

  const passwordHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, pseudo, passwordHash, role: 'ADMIN' },
  });

  console.log(`✓ Admin seedé : ${email} (pseudo: ${pseudo})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
