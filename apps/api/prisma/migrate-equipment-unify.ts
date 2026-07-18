import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { migrateEquipmentUnify } from '../src/characters/migrate-equipment-unify';

// Migration one-off (Story 14.1, AD-1) : fusionne equipment.group (string[]) dans
// equipment.individual, initialise contenants/animaux à []. Doit tourner AVANT le redémarrage de
// l'API sur ce changement — jamais de fenêtre à double-format (cf. Dev Notes de la story).
// Logique testée unitairement dans src/characters/migrate-equipment-unify.spec.ts (ce fichier est
// un point d'entrée hors du rootDir Jest de l'API, volontairement non testé lui-même — même
// pattern que prisma/migrate-inventory-format.ts).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

migrateEquipmentUnify(prisma as any)
  .then((count) => {
    console.log(`✓ ${count} personnage(s) migré(s) vers le modèle d'inventaire unifié`);
    return prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
