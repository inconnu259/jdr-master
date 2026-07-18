import { describe, it, expect } from 'vitest';
import { mapEquipmentToPdfFields } from '../ryuutama/equipment-pdf-field-map';
import type { EquipmentPdfInput } from '../ryuutama/equipment-pdf-field-map';

function makeInput(overrides: Partial<EquipmentPdfInput> = {}): EquipmentPdfInput {
  return {
    ownerPseudo: 'Alice',
    characterName: 'Miren',
    encombrementLimit: 11,
    equipment: { individual: [], contenants: [], animaux: [] },
    ...overrides,
  };
}

function field(fields: ReturnType<typeof mapEquipmentToPdfFields>, name: string): string | undefined {
  return fields.find((f) => f.field === name)?.value;
}

describe('mapEquipmentToPdfFields', () => {
  it('champs d\'en-tête mappés correctement', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'joueur')).toBe('Alice');
    expect(field(fields, 'voyageur')).toBe('Miren');
    expect(field(fields, 'limite_enc')).toBe('11');
  });

  it('encombrement = somme des poids individual + contenants, animaux jamais compté', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [
            { name: 'Corde', weight: 2 },
            { name: 'Gourde', weight: 1 },
          ],
          contenants: [{ name: 'Sac à dos', weight: 3 }],
          animaux: [{ name: 'Cheval' }],
        },
      }),
    );
    expect(field(fields, 'encombrement')).toBe('6');
  });

  it('individual rempli dans l\'ordre (Objet/Prix/Enc), Effets vide au-delà des 5 premiers', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [
            { name: 'Corde', weight: 2, price: '5po', effect: 'Solide' },
            { name: 'Gourde', weight: 1 },
          ],
          contenants: [],
          animaux: [],
        },
      }),
    );
    expect(field(fields, 'ObjetRow1')).toBe('Corde');
    expect(field(fields, 'PrixRow1')).toBe('5po');
    expect(field(fields, 'EncRow1')).toBe('2');
    expect(field(fields, 'EffetsRow1')).toBe('Solide');
    expect(field(fields, 'ObjetRow2')).toBe('Gourde');
    expect(field(fields, 'EncRow2')).toBe('1');
    expect(field(fields, 'PrixRow2')).toBe('');
    expect(field(fields, 'EffetsRow2')).toBe('');
  });

  it('remplit les 21 emplacements dans l\'ordre exact du template (Bloc A puis Bloc B), Prix rempli partout', () => {
    const individual = Array.from({ length: 21 }, (_, i) => ({
      name: `Objet${i + 1}`,
      weight: i,
      price: `${i}po`,
    }));
    const fields = mapEquipmentToPdfFields(
      makeInput({ equipment: { individual, contenants: [], animaux: [] } }),
    );
    expect(field(fields, 'ObjetRow5')).toBe('Objet5');
    expect(field(fields, 'ObjetRow1_2')).toBe('Objet6');
    expect(field(fields, 'ObjetRow1_3')).toBe('Objet7');
    expect(field(fields, 'ObjetRow8')).toBe('Objet20');
    expect(field(fields, 'ObjetRow8_2')).toBe('Objet21');
    expect(field(fields, 'PrixRow8_2')).toBe('20po');
  });

  it('plus de 21 objets individual : les excédentaires sont omis sans erreur', () => {
    const individual = Array.from({ length: 25 }, (_, i) => ({ name: `Objet${i + 1}`, weight: i }));
    expect(() =>
      mapEquipmentToPdfFields(makeInput({ equipment: { individual, contenants: [], animaux: [] } })),
    ).not.toThrow();
    const fields = mapEquipmentToPdfFields(
      makeInput({ equipment: { individual, contenants: [], animaux: [] } }),
    );
    expect(field(fields, 'ObjetRow8_2')).toBe('Objet21');
    expect(fields.some((f) => f.value === 'Objet22')).toBe(false);
    expect(fields.some((f) => f.value === 'Objet25')).toBe(false);
  });

  it('0 objet : tous les emplacements Objet/Prix/Enc/Effets sont vides', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'ObjetRow1')).toBe('');
    expect(field(fields, 'PrixRow1')).toBe('');
    expect(field(fields, 'EncRow1')).toBe('');
    expect(field(fields, 'ObjetRow8_2')).toBe('');
    expect(field(fields, 'PrixRow8_2')).toBe('');
    expect(field(fields, 'EffetsRow5')).toBe('');
  });

  it('contenants remplis sur leurs 3 emplacements dédiés (Objet/Prix/Enc/Effets)', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [],
          contenants: [
            { name: 'Sac à dos', weight: 3, price: '10po', effect: '+5 enc' },
            { name: 'Besace', weight: 1 },
          ],
          animaux: [],
        },
      }),
    );
    expect(field(fields, 'ContenantRow1')).toBe('Sac à dos');
    expect(field(fields, 'PrixRow1_4')).toBe('10po');
    expect(field(fields, 'EncRow1_4')).toBe('3');
    expect(field(fields, 'EffetsRow1_2')).toBe('+5 enc');
    expect(field(fields, 'ContenantRow2')).toBe('Besace');
    expect(field(fields, 'EncRow2_4')).toBe('1');
    expect(field(fields, 'ContenantRow3')).toBe('');
  });

  it('plus de 3 contenants : les excédentaires sont omis sans erreur', () => {
    const contenants = [
      { name: 'A', weight: 1 },
      { name: 'B', weight: 1 },
      { name: 'C', weight: 1 },
      { name: 'D', weight: 1 },
    ];
    expect(() =>
      mapEquipmentToPdfFields(makeInput({ equipment: { individual: [], contenants, animaux: [] } })),
    ).not.toThrow();
    const fields = mapEquipmentToPdfFields(
      makeInput({ equipment: { individual: [], contenants, animaux: [] } }),
    );
    expect(field(fields, 'ContenantRow3')).toBe('C');
    expect(fields.some((f) => f.value === 'D')).toBe(false);
  });

  it('animaux remplis sur leurs 3 emplacements dédiés (Objet/Prix/Effets), aucun champ Enc', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [],
          contenants: [],
          animaux: [
            { name: 'Cheval', price: '50po', effect: 'Rapide' },
            { name: 'Chien' },
          ],
        },
      }),
    );
    expect(field(fields, 'AnimalRow1')).toBe('Cheval');
    expect(field(fields, 'PrixRow1_5')).toBe('50po');
    expect(field(fields, 'EffetsRow1_3')).toBe('Rapide');
    expect(field(fields, 'AnimalRow2')).toBe('Chien');
    expect(field(fields, 'AnimalRow3')).toBe('');
    expect(fields.some((f) => f.field === 'EncRow1_5')).toBe(false);
  });

  it('plus de 3 animaux : les excédentaires sont omis sans erreur', () => {
    const animaux = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
    expect(() =>
      mapEquipmentToPdfFields(makeInput({ equipment: { individual: [], contenants: [], animaux } })),
    ).not.toThrow();
    const fields = mapEquipmentToPdfFields(
      makeInput({ equipment: { individual: [], contenants: [], animaux } }),
    );
    expect(field(fields, 'AnimalRow3')).toBe('C');
    expect(fields.some((f) => f.value === 'D')).toBe(false);
  });

  it('Po n\'est jamais présent dans le résultat (hors scope monnaie)', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'Po')).toBeUndefined();
  });

  it('ContenantRow1/AnimalRow1 vides (chaîne vide, pas absents) quand contenants/animaux sont vides', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'ContenantRow1')).toBe('');
    expect(field(fields, 'AnimalRow1')).toBe('');
  });

  it('weight null/NaN/chaîne sur un objet individual ou contenant : Enc affiché vide, jamais "null"/"NaN", et exclu du total', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [{ name: 'Corde', weight: null as unknown as number }],
          contenants: [{ name: 'Sac', weight: Number.NaN }],
          animaux: [],
        },
      }),
    );
    expect(field(fields, 'EncRow1')).toBe('');
    expect(field(fields, 'EncRow1_4')).toBe('');
    expect(field(fields, 'encombrement')).toBe('0');
  });

  it('weight sous forme de chaîne numérique : jamais de concaténation silencieuse dans le total', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [
            { name: 'Corde', weight: '2' as unknown as number },
            { name: 'Gourde', weight: 3 },
          ],
          contenants: [],
          animaux: [],
        },
      }),
    );
    expect(field(fields, 'encombrement')).toBe('3');
  });
});
