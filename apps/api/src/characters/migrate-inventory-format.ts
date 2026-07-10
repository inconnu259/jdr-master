import { randomUUID } from 'node:crypto';

export interface InventoryMigrationClient {
  character: {
    findMany(args: {
      select: { id: true; sheetData: true };
    }): Promise<{ id: string; sheetData: unknown }[]>;
    update(args: { where: { id: string }; data: { sheetData: unknown } }): Promise<unknown>;
  };
}

/**
 * Convertit `equipment.individual` de `string[]` vers `InventoryItem[]` (Story 6.4, AD-3) pour
 * tout personnage qui a encore l'ancien format. Idempotent : ne touche pas un personnage déjà
 * migré (individual déjà composé d'objets, ou vide). Retourne le nombre de personnages migrés.
 */
export async function migrateInventoryFormat(
  prisma: InventoryMigrationClient,
): Promise<number> {
  const characters = await prisma.character.findMany({
    select: { id: true, sheetData: true },
  });
  let migrated = 0;
  for (const c of characters) {
    const sheetData = c.sheetData as any;
    const individual = sheetData?.equipment?.individual;
    if (!Array.isArray(individual) || individual.length === 0) continue;
    if (typeof individual[0] !== 'string') continue; // déjà migré ou vide

    const converted = individual.map((name: string) => ({
      id: randomUUID(),
      name,
      weight: 0,
      addedBy: 'player' as const,
    }));
    await prisma.character.update({
      where: { id: c.id },
      data: {
        sheetData: {
          ...sheetData,
          equipment: { ...sheetData.equipment, individual: converted },
        },
      },
    });
    migrated++;
  }
  return migrated;
}
