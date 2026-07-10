import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { migrateInventoryFormat } from '../src/characters/migrate-inventory-format';

// Migration one-off (Story 6.4, AD-3) : equipment.individual string[] → InventoryItem[].
// Doit tourner AVANT le redémarrage de l'API sur ce changement — jamais de fenêtre à
// double-format (cf. Dev Notes de la story). Logique testée unitairement dans
// src/characters/migrate-inventory-format.spec.ts (ce fichier est un point d'entrée hors du
// rootDir Jest de l'API, volontairement non testé lui-même — même pattern que prisma/seed.ts).
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

migrateInventoryFormat(prisma as any)
  .then((count) => {
    console.log(`✓ ${count} personnage(s) migré(s) vers InventoryItem[]`);
    return prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
