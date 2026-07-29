import { describe, it, expect } from 'vitest';
import { resolveStartingEquipment } from '../ryuutama/resolve-starting-equipment';
import type { EquipmentCatalogEntry } from '../ryuutama/resolve-starting-equipment';

function catalog(): EquipmentCatalogEntry[] {
  return [
    { key: 'rations', label: 'Rations', priceGold: 10, nature: 'individual', weight: 1 },
    {
      key: 'grand-sac-a-dos',
      label: 'Grand sac à dos',
      priceGold: 40,
      nature: 'contenant',
      weight: 3,
      effect: 'Capacité 10.',
    },
    {
      key: 'animal-de-bat',
      label: 'Animal de bât',
      priceGold: 500,
      nature: 'animal',
      effect: 'Transporte 15 Enc.',
    },
  ];
}

describe('resolveStartingEquipment', () => {
  it('résout une sélection multi-nature avec quantités > 1 en entrées distinctes', () => {
    const result = resolveStartingEquipment(
      [
        { key: 'rations', quantity: 2 },
        { key: 'grand-sac-a-dos', quantity: 1 },
        { key: 'animal-de-bat', quantity: 1 },
      ],
      catalog(),
    );
    expect(result.individual).toEqual([
      { name: 'Rations', weight: 1, price: '10 Po', effect: undefined },
      { name: 'Rations', weight: 1, price: '10 Po', effect: undefined },
    ]);
    expect(result.contenants).toEqual([
      { name: 'Grand sac à dos', weight: 3, price: '40 Po', effect: 'Capacité 10.' },
    ]);
    expect(result.animaux).toEqual([
      { name: 'Animal de bât', price: '500 Po', effect: 'Transporte 15 Enc.' },
    ]);
  });

  it('clé inconnue → dans unresolvedKeys, absente des listes résolues, jamais une exception', () => {
    expect(() =>
      resolveStartingEquipment([{ key: 'inexistant', quantity: 1 }], catalog()),
    ).not.toThrow();
    const result = resolveStartingEquipment([{ key: 'inexistant', quantity: 1 }], catalog());
    expect(result.unresolvedKeys).toEqual(['inexistant']);
    expect(result.individual).toEqual([]);
    expect(result.contenants).toEqual([]);
    expect(result.animaux).toEqual([]);
    expect(result.totalPriceGold).toBe(0);
  });

  it('totalPriceGold = somme priceGold × quantity sur toutes les lignes résolues', () => {
    const result = resolveStartingEquipment(
      [
        { key: 'rations', quantity: 3 }, // 3 × 10 = 30
        { key: 'grand-sac-a-dos', quantity: 1 }, // 40
      ],
      catalog(),
    );
    expect(result.totalPriceGold).toBe(70);
  });

  it("item nature: 'animal' → jamais de champ weight sur l'entrée produite", () => {
    const result = resolveStartingEquipment([{ key: 'animal-de-bat', quantity: 1 }], catalog());
    expect(result.animaux[0]).not.toHaveProperty('weight');
  });

  it('revue de code (2026-07-29) : quantity négative → clé dans unresolvedKeys, ne soustrait pas du totalPriceGold', () => {
    const result = resolveStartingEquipment(
      [
        { key: 'grand-sac-a-dos', quantity: 1 }, // 40
        { key: 'rations', quantity: -49 },
      ],
      catalog(),
    );
    expect(result.unresolvedKeys).toEqual(['rations']);
    expect(result.individual).toEqual([]);
    expect(result.totalPriceGold).toBe(40);
  });

  it('revue de code (2026-07-29) : quantity fractionnaire → clé dans unresolvedKeys, aucune entrée poussée', () => {
    const result = resolveStartingEquipment([{ key: 'rations', quantity: 0.5 }], catalog());
    expect(result.unresolvedKeys).toEqual(['rations']);
    expect(result.individual).toEqual([]);
    expect(result.totalPriceGold).toBe(0);
  });

  it('revue de code (2026-07-29) : quantity === 0 → clé dans unresolvedKeys (ligne de sélection sans effet réel)', () => {
    const result = resolveStartingEquipment([{ key: 'rations', quantity: 0 }], catalog());
    expect(result.unresolvedKeys).toEqual(['rations']);
  });

  it('sélection vide → tout à [] / 0', () => {
    const result = resolveStartingEquipment([], catalog());
    expect(result).toEqual({
      individual: [],
      contenants: [],
      animaux: [],
      totalPriceGold: 0,
      unresolvedKeys: [],
    });
  });
});
