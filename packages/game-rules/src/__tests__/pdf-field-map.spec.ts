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
    const data = baseData({
      equipment: {
        individual: [{ id: 'item-1', name: 'grand sac à dos', weight: 0, addedBy: 'player' }],
      } as any,
    });
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
      equipment: {
        individual: [{ id: 'item-1', name: 'grand sac à dos', weight: 0, addedBy: 'player' }],
        group: ['tente'],
      },
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

  describe('PX (XP, round 2)', () => {
    it('mappe content.xp sur le champ PX', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), { ...content, xp: 250 });
      expect(fields.find((f) => f.field === 'PX')?.value).toBe('250');
    });

    it('content.xp absent → PX = "0", pas de crash', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'PX')?.value).toBe('0');
    });
  });

  describe('tableau de talents 6 lignes + attributs utilisés (round 2)', () => {
    const contentWithAttributes = {
      ...content,
      classTalents: [
        { name: 'Pistage', effect: 'Suit une piste', attributes: ['INT', 'AGI'] },
        { name: 'Camouflage', effect: 'Se dissimule', attributes: ['AGI', 'ESP'] },
        { name: 'Piège', effect: 'Pose un piège', attributes: ['AGI', 'INT'] },
      ],
    };

    it('mappe les 2 attributs utilisés par talent sur les dropdowns Attribut 1.{i}.0/1', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), contentWithAttributes);
      expect(fields.find((f) => f.field === 'Attribut 1.0.0')?.value).toBe('INT');
      expect(fields.find((f) => f.field === 'Attribut 1.0.1')?.value).toBe('AGI');
      expect(fields.find((f) => f.field === 'Attribut 1.1.0')?.value).toBe('AGI');
      expect(fields.find((f) => f.field === 'Attribut 1.1.1')?.value).toBe('ESP');
    });

    it('talent sans attributes → aucun dropdown Attribut poussé pour ce talent, pas de crash', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'Attribut 1.0.0')).toBeUndefined();
    });

    it('classe secondaire (secondaryClassTalents) → remplit Talent 4-6/Effet 4-6 et leurs attributs', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), {
        ...contentWithAttributes,
        secondaryClassLabel: 'Marchand',
        secondaryClassTalents: [
          { name: 'Négociation', effect: 'Baisse un prix', attributes: ['ESP', 'INT'] },
        ],
      });
      expect(fields.find((f) => f.field === 'Talent 4')?.value).toBe('Négociation');
      expect(fields.find((f) => f.field === 'Effet 4')?.value).toBe('Baisse un prix');
      expect(fields.find((f) => f.field === 'Attribut 1.3.0')?.value).toBe('ESP');
      expect(fields.find((f) => f.field === 'Attribut 1.3.1')?.value).toBe('INT');
    });

    it('sans classe secondaire → Talent 4-6/Effet 4-6 absents, pas de champ orphelin', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'Talent 4')).toBeUndefined();
      expect(fields.find((f) => f.field === 'Effet 4')).toBeUndefined();
    });
  });

  describe('Paysage climat (dropdown résumé, round 2)', () => {
    it('landscapeDropdownValue renseigné → remplit le dropdown "Paysage climat"', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), {
        ...content,
        landscapeDropdownValue: 'Forêt',
      });
      const field = fields.find((f) => f.field === 'Paysage climat');
      expect(field?.value).toBe('Forêt');
      expect(field?.kind).toBe('dropdown');
    });

    it('landscapeDropdownValue absent → aucun champ "Paysage climat" poussé', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'Paysage climat')).toBeUndefined();
    });
  });

  describe('Niveau (Story 6.3)', () => {
    it('sans levelUps → Niveau = 1', () => {
      const data = baseData();
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'Niveau')?.value).toBe('1');
    });

    it('avec 2 entrées levelUps → Niveau = 3, jamais dérivé de xp', () => {
      const data = baseData({
        levelUps: [
          { level: 2, pvAllocated: 2, peAllocated: 1, capabilities: [{ type: 'attribute', params: {} }] },
          { level: 3, pvAllocated: 1, peAllocated: 2, capabilities: [{ type: 'landscape', params: {} }] },
        ],
      });
      const fields = mapToPdfFields(data, computeDerived(data), content);
      expect(fields.find((f) => f.field === 'Niveau')?.value).toBe('3');
    });
  });

  describe('capacités de montée de niveau (Story 6.3)', () => {
    const capabilityContent = {
      ...content,
      capabilityLabels: {
        landscape: { foret: 'Forêt' },
        immunity: { blesse: 'Blessé' },
        class: { marchand: 'Marchand' },
      },
    };

    it('capacité landscape connue → remplit le champ paysage correspondant avec "+2"', () => {
      const data = baseData({
        levelUps: [
          {
            level: 3,
            pvAllocated: 1,
            peAllocated: 2,
            capabilities: [{ type: 'landscape', params: { key: 'foret' } }],
          },
        ],
      });
      const fields = mapToPdfFields(data, computeDerived(data), capabilityContent);
      expect(fields.find((f) => f.field === 'Forêt')?.value).toBe('+2');
    });

    it('capacité immunity connue → remplit le champ statut correspondant avec "Immunisé"', () => {
      const data = baseData({
        levelUps: [
          {
            level: 4,
            pvAllocated: 2,
            peAllocated: 1,
            capabilities: [{ type: 'immunity', params: { key: 'blesse' } }],
          },
        ],
      });
      const fields = mapToPdfFields(data, computeDerived(data), capabilityContent);
      expect(fields.find((f) => f.field === 'Blessé')?.value).toBe('Immunisé');
    });

    it('capacité class connue → remplit le dropdown "Classe 2"', () => {
      const data = baseData({
        levelUps: [
          {
            level: 5,
            pvAllocated: 0,
            peAllocated: 3,
            capabilities: [{ type: 'class', params: { key: 'marchand' } }],
          },
        ],
      });
      const fields = mapToPdfFields(data, computeDerived(data), capabilityContent);
      const classe2 = fields.find((f) => f.field === 'Classe 2');
      expect(classe2?.value).toBe('Marchand');
      expect(classe2?.kind).toBe('dropdown');
    });

    it("capacités type/dragon-protection/legendary-journey → aucun champ supplémentaire (pas de destination PDF)", () => {
      const data = baseData({
        levelUps: [
          { level: 6, pvAllocated: 1, peAllocated: 2, capabilities: [{ type: 'type', params: { key: 'technique' } }] },
          { level: 9, pvAllocated: 2, peAllocated: 1, capabilities: [{ type: 'dragon-protection', params: { key: 'ete' } }] },
          { level: 10, pvAllocated: 1, peAllocated: 2, capabilities: [{ type: 'legendary-journey', params: {} }] },
        ],
      });
      const before = mapToPdfFields(baseData(), computeDerived(baseData()), capabilityContent);
      const after = mapToPdfFields(data, computeDerived(data), capabilityContent);
      expect(after.length).toBe(before.length);
    });

    it('clé introuvable dans capabilityLabels → aucun champ poussé, pas de crash', () => {
      const data = baseData({
        levelUps: [
          {
            level: 3,
            pvAllocated: 1,
            peAllocated: 2,
            capabilities: [{ type: 'landscape', params: { key: 'inconnu' } }],
          },
        ],
      });
      expect(() => mapToPdfFields(data, computeDerived(data), capabilityContent)).not.toThrow();
      const fields = mapToPdfFields(data, computeDerived(data), capabilityContent);
      const before = mapToPdfFields(baseData(), computeDerived(baseData()), capabilityContent);
      expect(fields.length).toBe(before.length);
    });

    it('content.capabilityLabels absent (objet content littéral existant) → pas de crash', () => {
      const data = baseData({
        levelUps: [
          {
            level: 3,
            pvAllocated: 1,
            peAllocated: 2,
            capabilities: [{ type: 'landscape', params: { key: 'foret' } }],
          },
        ],
      });
      expect(() => mapToPdfFields(data, computeDerived(data), content)).not.toThrow();
    });
  });
});
