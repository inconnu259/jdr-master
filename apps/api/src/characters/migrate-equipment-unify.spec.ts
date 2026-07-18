jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'fixed-uuid') }));

import { migrateEquipmentUnify } from './migrate-equipment-unify';

function makePrisma(characters: { id: string; sheetData: unknown }[]) {
  return {
    character: {
      findMany: jest.fn().mockResolvedValue(characters),
      update: jest.fn(),
    },
  };
}

describe('migrateEquipmentUnify', () => {
  it('fusionne equipment.group dans individual (weight:0/addedBy:player), initialise contenants/animaux à []', async () => {
    const prisma = makePrisma([
      {
        id: 'char1',
        sheetData: {
          classId: 'chasseur',
          equipment: {
            individual: [
              { id: 'i1', name: 'Corde', weight: 1, addedBy: 'player' },
            ],
            group: ['Tente', 'Briquet'],
          },
        },
      },
    ]);

    const migrated = await migrateEquipmentUnify(prisma as any);

    expect(migrated).toBe(1);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char1' },
      data: {
        sheetData: {
          classId: 'chasseur',
          equipment: {
            individual: [
              { id: 'i1', name: 'Corde', weight: 1, addedBy: 'player' },
              {
                id: 'fixed-uuid',
                name: 'Tente',
                weight: 0,
                addedBy: 'player',
              },
              {
                id: 'fixed-uuid',
                name: 'Briquet',
                weight: 0,
                addedBy: 'player',
              },
            ],
            contenants: [],
            animaux: [],
          },
        },
      },
    });
  });

  it('individual legacy string[] (jamais migré par la Story 6.4) est aussi normalisé', async () => {
    const prisma = makePrisma([
      {
        id: 'char2',
        sheetData: {
          equipment: { individual: ['Sac'], group: [] },
        },
      },
    ]);

    await migrateEquipmentUnify(prisma as any);

    const written = prisma.character.update.mock.calls[0][0].data.sheetData;
    expect(written.equipment.individual).toEqual([
      { id: 'fixed-uuid', name: 'Sac', weight: 0, addedBy: 'player' },
    ]);
  });

  it('supprime la clé group de l’objet equipment écrit', async () => {
    const prisma = makePrisma([
      {
        id: 'char3',
        sheetData: { equipment: { individual: [], group: ['Tente'] } },
      },
    ]);

    await migrateEquipmentUnify(prisma as any);

    const written = prisma.character.update.mock.calls[0][0].data.sheetData;
    expect(written.equipment).not.toHaveProperty('group');
  });

  it('idempotent : contenants déjà présent → update jamais appelé', async () => {
    const prisma = makePrisma([
      {
        id: 'char4',
        sheetData: {
          equipment: {
            individual: [{ id: 'i1', name: 'Cape', weight: 1.2, addedBy: 'player' }],
            contenants: [],
            animaux: [],
          },
        },
      },
    ]);

    const migrated = await migrateEquipmentUnify(prisma as any);

    expect(migrated).toBe(0);
    expect(prisma.character.update).not.toHaveBeenCalled();
  });

  it('sheetData sans equipment → normalisé sans crash (individual/contenants/animaux vides)', async () => {
    const prisma = makePrisma([{ id: 'char5', sheetData: { classId: 'chasseur' } }]);

    const migrated = await migrateEquipmentUnify(prisma as any);

    expect(migrated).toBe(1);
    expect(prisma.character.update).toHaveBeenCalledWith({
      where: { id: 'char5' },
      data: {
        sheetData: {
          classId: 'chasseur',
          equipment: { individual: [], contenants: [], animaux: [] },
        },
      },
    });
  });

  it('plusieurs personnages : seuls ceux non migrés (sans contenants) sont mis à jour', async () => {
    const prisma = makePrisma([
      {
        id: 'old',
        sheetData: { equipment: { individual: [], group: ['Sac'] } },
      },
      {
        id: 'new',
        sheetData: {
          equipment: { individual: [], contenants: [], animaux: [] },
        },
      },
    ]);

    const migrated = await migrateEquipmentUnify(prisma as any);

    expect(migrated).toBe(1);
    expect(prisma.character.update).toHaveBeenCalledTimes(1);
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old' } }),
    );
  });
});
