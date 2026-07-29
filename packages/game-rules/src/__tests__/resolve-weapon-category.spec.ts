import { describe, it, expect } from 'vitest';
import { resolveWeaponCategory } from '../ryuutama/resolve-weapon-category';
import type { WeaponResolutionCatalog } from '../ryuutama/resolve-weapon-category';

function catalog(): WeaponResolutionCatalog {
  return {
    weaponItems: [
      { key: 'dague', label: 'Dague', categoryId: 'epee-courte' },
      { key: 'lance', label: 'Lance', categoryId: 'lance' },
      { key: 'orpheline', label: 'Arme orpheline', categoryId: 'categorie-inexistante' },
    ],
    weaponCategories: [
      {
        key: 'epee-courte',
        label: 'Épée courte',
        touchFormula: 'AGI+INT+1',
        damageFormula: 'INT-1',
      },
      { key: 'lance', label: 'Lance', touchFormula: 'VIG+AGI', damageFormula: 'VIG+1' },
    ],
  };
}

describe('resolveWeaponCategory', () => {
  it('résout l’arme précise ET sa catégorie (formules incluses)', () => {
    const result = resolveWeaponCategory('dague', catalog());
    expect(result).toEqual({
      weaponLabel: 'Dague',
      categoryId: 'epee-courte',
      categoryLabel: 'Épée courte',
      touchFormula: 'AGI+INT+1',
      damageFormula: 'INT-1',
    });
  });

  it('weaponId inconnu → null', () => {
    expect(resolveWeaponCategory('arme-inexistante', catalog())).toBeNull();
  });

  it('categoryId de l’arme ne correspondant à aucune catégorie du catalogue → null (contenu incohérent)', () => {
    expect(resolveWeaponCategory('orpheline', catalog())).toBeNull();
  });
});
