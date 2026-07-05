import { describe, it, expect } from 'vitest';
import { mapToPdfFields } from '../ryuutama/pdf-field-map';
import { computeDerived } from '../ryuutama/compute-derived';
import type { RyuutamaSheetData } from '../ryuutama/types';

const CLASSES = [
  'artisan',
  'chasseur',
  'fermier',
  'guerisseur',
  'marchand',
  'menestrel',
  'noble',
];
const TYPES = ['attaque', 'technique', 'magie'];
const WEAPONS = ['arc', 'epee-courte', 'epee-longue', 'hache', 'lance'];
const WEAPON_PDF_OPTIONS: Record<string, string> = {
  arc: 'Arc',
  'epee-courte': 'Epées courtes',
  'epee-longue': 'Epées longues',
  hache: 'Haches',
  lance: 'Lances',
};

function baseData(overrides: Partial<RyuutamaSheetData> = {}): RyuutamaSheetData {
  return {
    classId: 'chasseur',
    typeId: 'attaque',
    weaponCategoryId: 'arc',
    attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
    ...overrides,
  };
}

const content = {
  classLabel: 'Chasseur',
  classTalents: [
    { name: 'Pistage', effect: 'Suit une piste' },
    { name: 'Camouflage', effect: 'Se dissimule' },
    { name: 'Piège', effect: 'Pose un piège' },
  ],
  typeLabel: 'Attaque',
  weaponLabel: 'Arc',
  weaponTouchFormula: 'AGI+INT-2',
  weaponDamageFormula: 'AGI',
  ownerPseudo: 'alice',
};

describe('mapToPdfFields', () => {
  it('couvre chacune des 7 classes sans valeur orpheline', () => {
    for (const classId of CLASSES) {
      const data = baseData({ classId });
      const fields = mapToPdfFields(data, computeDerived(data), {
        ...content,
        classLabel: 'Label',
      });
      const classField = fields.find((f) => f.field === 'Classe 1');
      expect(classField?.value).toBe('Label');
    }
  });

  it('couvre chacun des 3 types sans valeur orpheline', () => {
    for (const typeId of TYPES) {
      const data = baseData({ typeId });
      const fields = mapToPdfFields(data, computeDerived(data), {
        ...content,
        typeLabel: 'TypeLabel',
      });
      expect(fields.find((f) => f.field === 'Type')?.value).toBe('TypeLabel');
    }
  });

  it('mappe chacune des 5 armes vers son option PDF exacte', () => {
    for (const weaponCategoryId of WEAPONS) {
      const data = baseData({ weaponCategoryId });
      const fields = mapToPdfFields(data, computeDerived(data), content);
      const weaponField = fields.find((f) => f.field === 'Arme Fav');
      expect(weaponField?.value).toBe(WEAPON_PDF_OPTIONS[weaponCategoryId]);
      expect(weaponField?.value).not.toBe('');
    }
  });

  it('mappe les 4 attributs vers les dropdowns correspondants', () => {
    const data = baseData({ attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 } });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'AGI')?.value).toBe('4');
    expect(fields.find((f) => f.field === 'ESP')?.value).toBe('6');
    expect(fields.find((f) => f.field === 'INT')?.value).toBe('6');
    expect(fields.find((f) => f.field === 'VIG')?.value).toBe('8');
  });

  it('mappe les statistiques dérivées disponibles sur le template (PV, PE, Initiative)', () => {
    const data = baseData();
    const derived = computeDerived(data);
    const fields = mapToPdfFields(data, derived, content);
    expect(fields.find((f) => f.field === 'PV max')?.value).toBe(String(derived.PV));
    expect(fields.find((f) => f.field === 'PE max')?.value).toBe(String(derived.PE));
    expect(fields.find((f) => f.field === 'Initiative')?.value).toBe(
      String(derived.Initiative),
    );
  });

  it("ne mappe pas 'Condition' : aucun champ correspondant sur le template officiel", () => {
    const data = baseData();
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'Condition')).toBeUndefined();
  });

  it("ne mappe pas 'Encombrement' : aucun champ correspondant sur le template officiel", () => {
    const data = baseData();
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'Encombrement')).toBeUndefined();
  });

  it('ne mappe pas specialtyTypeId (Artisan) ni narrative.personality : aucun champ dédié sur le template officiel', () => {
    const data = baseData({
      classId: 'artisan',
      specialtyTypeId: 'Forgeron',
      narrative: { personality: 'Curieux et prudent' },
    });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.some((f) => f.value === 'Forgeron')).toBe(false);
    expect(fields.some((f) => f.value === 'Curieux et prudent')).toBe(false);
  });

  it('attributs manquants => valeurs par défaut à 0, pas de crash', () => {
    const data = baseData({ attributes: undefined as any });
    const fields = mapToPdfFields(data, computeDerived({ ...data, attributes: { AGI: 0, ESP: 0, INT: 0, VIG: 0 } }), content);
    expect(fields.find((f) => f.field === 'AGI')?.value).toBe('0');
    expect(fields.find((f) => f.field === 'VIG')?.value).toBe('0');
  });

  it('équipement partiel (individual sans group, ou inversement) => pas de crash', () => {
    const data = baseData({ equipment: { individual: ['grand sac à dos'] } as any });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'Notes')?.value).toBe('grand sac à dos');

    const data2 = baseData({ equipment: { group: ['tente'] } as any });
    const fields2 = mapToPdfFields(data2, computeDerived(data2), content);
    expect(fields2.find((f) => f.field === 'Notes')?.value).toBe('tente');
  });

  it('mappe les talents et effets de la classe (talent 1/Talent 2/Talent 3, Effet 1/2/3)', () => {
    const data = baseData();
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'talent 1')?.value).toBe('Pistage');
    expect(fields.find((f) => f.field === 'Talent 2')?.value).toBe('Camouflage');
    expect(fields.find((f) => f.field === 'Talent 3')?.value).toBe('Piège');
    expect(fields.find((f) => f.field === 'Effet 1')?.value).toBe('Suit une piste');
  });

  it('objet fétiche et équipement (individual + group) fusionnés dans Notes', () => {
    const data = baseData({
      fetiqueObject: 'Une pierre porte-bonheur',
      equipment: { individual: ['grand sac à dos'], group: ['tente'] },
    });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'Objet fétiche')?.value).toBe(
      'Une pierre porte-bonheur',
    );
    expect(fields.find((f) => f.field === 'Notes')?.value).toBe('grand sac à dos, tente');
  });

  it('champs narratifs optionnels absents => chaîne vide, pas de crash', () => {
    const data = baseData({ narrative: undefined });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(fields.find((f) => f.field === 'Nom')?.value).toBe('');
    expect(fields.find((f) => f.field === 'Village natal et raisons du départ')?.value).toBe(
      '',
    );
  });

  it('village natal et motivation combinés avec un séparateur, un seul si l’autre est absent', () => {
    const data = baseData({ narrative: { homeTown: 'Norn' } });
    const fields = mapToPdfFields(data, computeDerived(data), content);
    expect(
      fields.find((f) => f.field === 'Village natal et raisons du départ')?.value,
    ).toBe('Norn');
  });

  it('mappe le pseudo du propriétaire sur le champ "Joueur" (Story 4.6)', () => {
    const data = baseData();
    const fields = mapToPdfFields(data, computeDerived(data), {
      ...content,
      ownerPseudo: 'bob',
    });
    const joueurField = fields.find((f) => f.field === 'Joueur');
    expect(joueurField?.value).toBe('bob');
    expect(joueurField?.kind).toBe('text');
  });
});
