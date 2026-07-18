import { randomUUID } from 'node:crypto';

/**
 * Duplique volontairement la logique de `normalizeInventoryIndividual` (`character.service.ts`)
 * plutôt que de l'importer — même choix que le précédent `migrate-inventory-format.ts` (Story
 * 6.4), qui n'importe rien de `character.service.ts` non plus : ce fichier est un script one-off
 * autonome, importer le service complet chargerait ses dépendances NestJS/argon2 (incompatibles
 * hors contexte d'application, cf. échec Jest constaté à l'écriture de cette story).
 */
function normalizeInventoryIndividual(
  individual: (Record<string, unknown> | string)[] | undefined,
): Record<string, unknown>[] {
  return (individual ?? []).map((item) =>
    typeof item === 'string'
      ? { id: randomUUID(), name: item, weight: 0, addedBy: 'player' as const }
      : item,
  );
}

export interface EquipmentMigrationClient {
  character: {
    findMany(args: {
      select: { id: true; sheetData: true };
    }): Promise<{ id: string; sheetData: unknown }[]>;
    update(args: {
      where: { id: string };
      data: { sheetData: unknown };
    }): Promise<unknown>;
  };
}

/**
 * Migration one-off (Story 14.1, AD-1) : fusionne l'ancien `equipment.group: string[]` (texte
 * libre, sans poids) dans `equipment.individual` (poids `0`, `addedBy: 'player'`, prix/effet
 * vides), et initialise les 2 nouvelles catégories `contenants`/`animaux` à des listes vides.
 * Doit tourner AVANT tout redémarrage de l'API portant le nouveau type `RyuutamaSheetData` —
 * jamais de fenêtre à double-format (même contrainte que `migrateInventoryFormat`, Story 6.4).
 *
 * Idempotence : contrairement à `migrateInventoryFormat` (qui teste `typeof individual[0] ===
 * 'string'`), cette migration ajoute des clés qui n'existaient jamais avant elle (`contenants`/
 * `animaux`) — leur présence est un marqueur de migration fiable et suffisant.
 */
export async function migrateEquipmentUnify(
  prisma: EquipmentMigrationClient,
): Promise<number> {
  const characters = await prisma.character.findMany({
    select: { id: true, sheetData: true },
  });
  let migrated = 0;
  for (const c of characters) {
    const sheetData = c.sheetData as any;
    const equipment = sheetData?.equipment;

    if (
      equipment &&
      Array.isArray(equipment.contenants) &&
      Array.isArray(equipment.animaux)
    ) {
      continue; // déjà migré
    }

    if (!equipment) {
      await prisma.character.update({
        where: { id: c.id },
        data: {
          sheetData: {
            ...sheetData,
            equipment: { individual: [], contenants: [], animaux: [] },
          },
        },
      });
      migrated++;
      continue;
    }

    const individual = [
      ...normalizeInventoryIndividual(equipment.individual),
      ...(equipment.group ?? []).map((name: string) => ({
        id: randomUUID(),
        name,
        weight: 0,
        addedBy: 'player' as const,
      })),
    ];

    await prisma.character.update({
      where: { id: c.id },
      data: {
        sheetData: {
          ...sheetData,
          equipment: { individual, contenants: [], animaux: [] },
        },
      },
    });
    migrated++;
  }
  return migrated;
}
