import { describe, it, expect } from 'vitest';
import { mapEquipmentToPdfFields } from '../ryuutama/equipment-pdf-field-map';
import type { EquipmentPdfInput } from '../ryuutama/equipment-pdf-field-map';

function makeInput(overrides: Partial<EquipmentPdfInput> = {}): EquipmentPdfInput {
  return {
    ownerPseudo: 'Alice',
    characterName: 'Miren',
    encombrementLimit: 11,
    equipment: { individual: [], group: [] },
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

  it('encombrement = somme des poids individual uniquement, group jamais compté', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [
            { name: 'Corde', weight: 2 },
            { name: 'Gourde', weight: 1 },
          ],
          group: ['Tente'],
        },
      }),
    );
    expect(field(fields, 'encombrement')).toBe('3');
  });

  it('individual rempli dans l\'ordre (Objet/Enc), Prix/Effets toujours vides', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [
            { name: 'Corde', weight: 2 },
            { name: 'Gourde', weight: 1 },
          ],
          group: [],
        },
      }),
    );
    expect(field(fields, 'ObjetRow1')).toBe('Corde');
    expect(field(fields, 'EncRow1')).toBe('2');
    expect(field(fields, 'PrixRow1')).toBe('');
    expect(field(fields, 'ObjetRow2')).toBe('Gourde');
    expect(field(fields, 'EncRow2')).toBe('1');
    expect(field(fields, 'EffetsRow1')).toBe('');
    expect(field(fields, 'EffetsRow2')).toBe('');
  });

  it('group rempli après individual (Objet seul, Enc vide)', () => {
    const fields = mapEquipmentToPdfFields(
      makeInput({
        equipment: {
          individual: [{ name: 'Corde', weight: 2 }],
          group: ['Tente', 'Marmite'],
        },
      }),
    );
    expect(field(fields, 'ObjetRow1')).toBe('Corde');
    expect(field(fields, 'EncRow1')).toBe('2');
    expect(field(fields, 'ObjetRow2')).toBe('Tente');
    expect(field(fields, 'EncRow2')).toBe('');
    expect(field(fields, 'ObjetRow3')).toBe('Marmite');
    expect(field(fields, 'EncRow3')).toBe('');
  });

  it('remplit les 21 emplacements dans l\'ordre exact du template (Bloc A puis Bloc B)', () => {
    const individual = Array.from({ length: 21 }, (_, i) => ({ name: `Objet${i + 1}`, weight: i }));
    const fields = mapEquipmentToPdfFields(makeInput({ equipment: { individual, group: [] } }));
    expect(field(fields, 'ObjetRow5')).toBe('Objet5');
    expect(field(fields, 'ObjetRow1_2')).toBe('Objet6');
    expect(field(fields, 'ObjetRow1_3')).toBe('Objet7');
    expect(field(fields, 'ObjetRow8')).toBe('Objet20');
    expect(field(fields, 'ObjetRow8_2')).toBe('Objet21');
  });

  it('plus de 21 objets combinés (individual + group) : les excédentaires sont omis sans erreur', () => {
    const individual = Array.from({ length: 21 }, (_, i) => ({ name: `Objet${i + 1}`, weight: i }));
    expect(() =>
      mapEquipmentToPdfFields(
        makeInput({ equipment: { individual, group: ['En trop 1', 'En trop 2'] } }),
      ),
    ).not.toThrow();
    const fields = mapEquipmentToPdfFields(
      makeInput({ equipment: { individual, group: ['En trop 1', 'En trop 2'] } }),
    );
    expect(field(fields, 'ObjetRow8_2')).toBe('Objet21');
    expect(fields.some((f) => f.value === 'En trop 1')).toBe(false);
    expect(fields.some((f) => f.value === 'En trop 2')).toBe(false);
  });

  it('0 objet : tous les emplacements Objet/Prix/Enc/Effets sont vides', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'ObjetRow1')).toBe('');
    expect(field(fields, 'PrixRow1')).toBe('');
    expect(field(fields, 'EncRow1')).toBe('');
    expect(field(fields, 'ObjetRow8_2')).toBe('');
    expect(field(fields, 'EffetsRow5')).toBe('');
  });

  it('Po/blocs Contenant et Animal ne sont jamais présents dans le résultat (aucune donnée correspondante)', () => {
    const fields = mapEquipmentToPdfFields(makeInput());
    expect(field(fields, 'Po')).toBeUndefined();
    expect(field(fields, 'ContenantRow1')).toBeUndefined();
    expect(field(fields, 'AnimalRow1')).toBeUndefined();
  });
});
