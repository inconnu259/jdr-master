import { describe, it, expect } from 'vitest';
import { validate } from '../ryuutama/validate';
import type { RyuutamaSheetData } from '../ryuutama/types';

function validSheet(): RyuutamaSheetData {
  return {
    classId: 'chasseur',
    typeId: 'attaque',
    weaponCategoryId: 'arc',
    attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
  };
}

describe('validate (strict)', () => {
  it('sheetData avec 0 classe → valid: false, errors[0].field = classId', () => {
    const data = { ...validSheet(), classId: '' };
    const result = validate(data, 'strict');
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('classId');
  });

  it('sheetData avec classe inconnue (2+ classes simulées) → valid: false', () => {
    const data = { ...validSheet(), classId: 'artisan,chasseur' };
    const result = validate(data, 'strict');
    expect(result.valid).toBe(false);
  });

  it("attributs ne correspondant pas au pattern Polyvalent → valid: false, errors[0].field = attributes", () => {
    const data = {
      ...validSheet(),
      attributes: { AGI: 5, ESP: 5, INT: 5, VIG: 5 },
    };
    const result = validate(data, 'strict');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'attributes')).toBe(true);
  });

  it('weaponCategoryId invalide (ex. "mains-nues") → valid: false, errors[0].field = weaponCategoryId', () => {
    const data = { ...validSheet(), weaponCategoryId: 'mains-nues' };
    const result = validate(data, 'strict');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'weaponCategoryId'),
    ).toBe(true);
  });

  it('classId: "artisan" sans specialtyTypeId → valid: false, errors[0].field = specialtyTypeId', () => {
    const data = { ...validSheet(), classId: 'artisan' };
    const result = validate(data, 'strict');
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'specialtyTypeId'),
    ).toBe(true);
  });

  it('sheetData entièrement valide → valid: true, errors = []', () => {
    const result = validate(validSheet(), 'strict');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('mode "mj" → no-op, toujours valid: true', () => {
    const result = validate({ ...validSheet(), classId: '' }, 'mj');
    expect(result).toEqual({ valid: true, errors: [] });
  });
});
