import { describe, it, expect } from 'vitest';
import {
  computeHommeDragonDerived,
  levelForScenariosPasse,
  pendingEveilLevels,
} from '../ryuutama/homme-dragon-derived';

describe('levelForScenariosPasse', () => {
  it('0 scénario Passé → niveau 1', () => expect(levelForScenariosPasse(0)).toBe(1));

  it('1 scénario Passé → niveau 2', () => expect(levelForScenariosPasse(1)).toBe(2));
  it('2 scénarios Passé → niveau 2 (pas encore 3)', () => expect(levelForScenariosPasse(2)).toBe(2));

  it('3 scénarios Passé → niveau 3', () => expect(levelForScenariosPasse(3)).toBe(3));
  it('6 scénarios Passé → niveau 3 (pas encore 4)', () => expect(levelForScenariosPasse(6)).toBe(3));

  it('7 scénarios Passé → niveau 4', () => expect(levelForScenariosPasse(7)).toBe(4));
  it('11 scénarios Passé → niveau 4 (pas encore 5)', () => expect(levelForScenariosPasse(11)).toBe(4));

  it('12 scénarios Passé → niveau 5', () => expect(levelForScenariosPasse(12)).toBe(5));
  it('50 scénarios Passé → niveau 5 (plafond)', () => expect(levelForScenariosPasse(50)).toBe(5));
});

describe('computeHommeDragonDerived', () => {
  it('niveau 1 → PS 3', () => expect(computeHommeDragonDerived(1)).toEqual({ PS: 3 }));
  it('niveau 2 → PS 3', () => expect(computeHommeDragonDerived(2)).toEqual({ PS: 3 }));
  it('niveau 3 → PS 5', () => expect(computeHommeDragonDerived(3)).toEqual({ PS: 5 }));
  it('niveau 4 → PS 5', () => expect(computeHommeDragonDerived(4)).toEqual({ PS: 5 }));
  it('niveau 5 → PS 10', () => expect(computeHommeDragonDerived(5)).toEqual({ PS: 10 }));

  it('ne lève jamais, même avec un niveau hors bornes (défense de profondeur)', () => {
    expect(() => computeHommeDragonDerived(0)).not.toThrow();
    expect(() => computeHommeDragonDerived(-1)).not.toThrow();
    expect(() => computeHommeDragonDerived(99)).not.toThrow();
  });
});

describe('pendingEveilLevels', () => {
  it('niveau 1, aucun choix fait → aucun niveau en attente (niveau 1 ne débloque jamais de choix)', () => {
    expect(pendingEveilLevels(1, [])).toEqual([]);
  });

  it('niveau 3, aucun choix fait → 2 et 3 en attente (AC3 — plusieurs seuils franchis d\'un coup)', () => {
    expect(pendingEveilLevels(3, [])).toEqual([2, 3]);
  });

  it('niveau 3, niveau 2 déjà pourvu → seul 3 en attente (AC2)', () => {
    expect(pendingEveilLevels(3, [2])).toEqual([3]);
  });

  it('niveau 5, tous pourvus → aucun en attente', () => {
    expect(pendingEveilLevels(5, [2, 3, 4, 5])).toEqual([]);
  });

  it('niveau 2, niveau 2 déjà pourvu → aucun en attente', () => {
    expect(pendingEveilLevels(2, [2])).toEqual([]);
  });
});
