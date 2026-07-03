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
});
