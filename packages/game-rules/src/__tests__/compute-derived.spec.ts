import { describe, it, expect } from 'vitest';
import { computeDerived } from '../ryuutama/compute-derived';

describe('computeDerived', () => {
  const base = {
    classId: 'chasseur',
    typeId: 'attaque',
    weaponCategoryId: 'arc',
    attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
  };
  it('PV = VIG × 2', () => expect(computeDerived(base).PV).toBe(16));
  it('PE = ESP × 2', () => expect(computeDerived(base).PE).toBe(12));
  it('Condition = VIG + ESP', () =>
    expect(computeDerived(base).Condition).toBe(14));
  it('Initiative = AGI + INT', () =>
    expect(computeDerived(base).Initiative).toBe(10));
  it('Encombrement = VIG + 3', () =>
    expect(computeDerived(base).Encombrement).toBe(11));

  it('sans levelUps (régression) : PV/PE/Encombrement inchangés', () => {
    const derived = computeDerived({ ...base, levelUps: undefined });
    expect(derived.PV).toBe(16);
    expect(derived.PE).toBe(12);
    expect(derived.Encombrement).toBe(11);
  });

  it('avec 1 entrée levelUps : PV/PE/Encombrement +N', () => {
    const derived = computeDerived({
      ...base,
      levelUps: [
        {
          level: 2,
          pvAllocated: 2,
          peAllocated: 1,
          capabilities: [{ type: 'attribute', params: {} }],
        },
      ],
    });
    expect(derived.PV).toBe(18);
    expect(derived.PE).toBe(13);
    expect(derived.Encombrement).toBe(12);
  });

  it('avec 2 entrées levelUps cumulées', () => {
    const derived = computeDerived({
      ...base,
      levelUps: [
        {
          level: 2,
          pvAllocated: 2,
          peAllocated: 1,
          capabilities: [{ type: 'attribute', params: {} }],
        },
        {
          level: 3,
          pvAllocated: 0,
          peAllocated: 3,
          capabilities: [{ type: 'landscape', params: {} }],
        },
      ],
    });
    expect(derived.PV).toBe(18);
    expect(derived.PE).toBe(16);
    expect(derived.Encombrement).toBe(13);
  });
});
