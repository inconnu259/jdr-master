jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'fixed-uuid') }));

import { migrateInventoryFormat } from './migrate-inventory-format';

function makePrisma(characters: { id: string; sheetData: unknown }[]) {
  return {
    character: {
      findMany: jest.fn().mockResolvedValue(characters),
      update: jest.fn(),
    },
  };
}

describe('migrateInventoryFormat', () => {
  it('convertit equipment.individual: string[] en InventoryItem[] avec weight:0/addedBy:player', async () => {
    const prisma = makePrisma([
      {
        id: 'char1',
        sheetData: {
          classId: 'chasseur',
          equipment: {
            individual: ['Grand sac à dos', 'Outre'],
            group: ['Tente'],
          },
        },
      },
    ]);

    const migrated = await migrateInventoryFormat(prisma);

    expect(migrated).toBe(1);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        sheetData: {
          classId: 'chasseur',
          equipment: {
            individual: [
              {
                id: 'fixed-uuid',
                name: 'Grand sac à dos',
                weight: 0,
                addedBy: 'player',
              },
              { id: 'fixed-uuid', name: 'Outre', weight: 0, addedBy: 'player' },
            ],
            group: ['Tente'],
          },
        },
      },
    });
  });

  it('idempotent : personnage déjà au nouveau format → update jamais appelé', async () => {
    const prisma = makePrisma([
      {
        id: 'char2',
        sheetData: {
          equipment: {
            individual: [{ name: 'Cape', weight: 1.2, addedBy: 'player' }],
            group: [],
          },
        },
      },
    ]);

    const migrated = await migrateInventoryFormat(prisma);

    expect(migrated).toBe(0);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('individual vide → ignoré, pas d’appel update', async () => {
    const prisma = makePrisma([
      { id: 'char3', sheetData: { equipment: { individual: [], group: [] } } },
    ]);

    const migrated = await migrateInventoryFormat(prisma);

    expect(migrated).toBe(0);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('sheetData sans equipment → ignoré, pas de crash', async () => {
    const prisma = makePrisma([
      { id: 'char4', sheetData: { classId: 'chasseur' } },
    ]);

    const migrated = await migrateInventoryFormat(prisma);

    expect(migrated).toBe(0);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('plusieurs personnages : seuls ceux à l’ancien format sont migrés', async () => {
    const prisma = makePrisma([
      {
        id: 'old',
        sheetData: { equipment: { individual: ['Sac'], group: [] } },
      },
      {
        id: 'new',
        sheetData: {
          equipment: {
            individual: [{ name: 'Cape', weight: 1, addedBy: 'player' }],
            group: [],
          },
        },
      },
    ]);

    const migrated = await migrateInventoryFormat(prisma);

    expect(migrated).toBe(1);
    expect(prisma.character.update).toHaveBeenCalledTimes(1);
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old' } }),
    );
  });

  it('group non touché par la migration', async () => {
    const prisma = makePrisma([
      {
        id: 'char5',
        sheetData: {
          equipment: { individual: ['Sac'], group: ['Tente', 'Briquet'] },
        },
      },
    ]);

    await migrateInventoryFormat(prisma);

    const call = prisma.character.update.mock.calls[0][0];
    expect(call.data.sheetData.equipment.group).toEqual(['Tente', 'Briquet']);
  });
});
