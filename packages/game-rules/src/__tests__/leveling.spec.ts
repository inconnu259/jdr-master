import { describe, it, expect } from 'vitest';
import { levelForXp, pendingLevels } from '../ryuutama/leveling';

describe('levelForXp', () => {
  it('99 XP → niveau 1', () => expect(levelForXp(99)).toBe(1));
  it('100 XP → niveau 2', () => expect(levelForXp(100)).toBe(2));
  it('599 XP → niveau 2', () => expect(levelForXp(599)).toBe(2));
  it('600 XP → niveau 3', () => expect(levelForXp(600)).toBe(3));
  it('1199 XP → niveau 3', () => expect(levelForXp(1199)).toBe(3));
  it('1200 XP → niveau 4', () => expect(levelForXp(1200)).toBe(4));
  it('10000 XP → niveau 10 (plafond)', () => expect(levelForXp(10000)).toBe(10));
  it('20000 XP → niveau 10 (aucun seuil au-delà)', () => expect(levelForXp(20000)).toBe(10));
  it('0 XP → niveau 1', () => expect(levelForXp(0)).toBe(1));
});

describe('pendingLevels', () => {
  it('aucun niveau franchi (xp bas, appliedCount=0) → []', () =>
    expect(pendingLevels(50, 0)).toEqual([]));
  it('1 niveau franchi non appliqué', () =>
    expect(pendingLevels(150, 0)).toEqual([2]));
  it('plusieurs niveaux franchis d’un coup', () =>
    expect(pendingLevels(1200, 0)).toEqual([2, 3, 4]));
  it('appliedCount déjà à jour → []', () =>
    expect(pendingLevels(150, 1)).toEqual([]));
  it('un niveau déjà appliqué, un nouveau en attente', () =>
    expect(pendingLevels(600, 1)).toEqual([3]));
});
