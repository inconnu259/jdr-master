import { describe, it, expect } from 'vitest';
import { validateHommeDragon } from '../ryuutama/validate-homme-dragon';
import type {
  HommeDragonArtefactCatalogEntry,
  HommeDragonSheetData,
} from '../ryuutama/validate-homme-dragon';

function validSheet(): HommeDragonSheetData {
  return {
    race: 'DRAGON_ROUGE',
    artefact: { key: 'grand-arc' },
    nom: 'Ignis',
  };
}

/** Reflète le contenu réellement seedé (cf. apps/api/game-systems/ryuutama/data/homme-dragon-artefacts.json). */
function catalog(): HommeDragonArtefactCatalogEntry[] {
  return [
    { key: 'encyclopedie', race: 'DRAGON_VERT' },
    { key: 'lanterne', race: 'DRAGON_VERT' },
    { key: 'sextant', race: 'DRAGON_VERT' },
    { key: 'anneau', race: 'DRAGON_BLEU' },
    { key: 'cristal', race: 'DRAGON_BLEU' },
    { key: 'mascotte', race: 'DRAGON_BLEU' },
    { key: 'grand-arc', race: 'DRAGON_ROUGE' },
    { key: 'grande-epee', race: 'DRAGON_ROUGE' },
    { key: 'grande-lance', race: 'DRAGON_ROUGE' },
    { key: 'coupe', race: 'DRAGON_NOIR' },
    { key: 'dague', race: 'DRAGON_NOIR' },
    { key: 'miroir', race: 'DRAGON_NOIR' },
  ];
}

describe('validateHommeDragon', () => {
  it('sheetData entièrement valide → valid: true, errors: []', () => {
    const result = validateHommeDragon(validSheet(), catalog());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('nom vide → valid: false, errors[0].field = nom', () => {
    const result = validateHommeDragon({ ...validSheet(), nom: '' }, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'nom')).toBe(true);
  });

  it('nom composé uniquement d’espaces → valid: false', () => {
    const result = validateHommeDragon({ ...validSheet(), nom: '   ' }, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'nom')).toBe(true);
  });

  it('race absente → valid: false, errors[0].field = race', () => {
    const data = { ...validSheet(), race: undefined as unknown as HommeDragonSheetData['race'] };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'race')).toBe(true);
  });

  it('race invalide (hors des 4 races connues) → valid: false', () => {
    const data = { ...validSheet(), race: 'DRAGON_ROSE' as unknown as HommeDragonSheetData['race'] };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'race')).toBe(true);
  });

  it("artefact d'une race différente de celle choisie → valid: false, errors[0].field = artefact.key", () => {
    // "lanterne" appartient à DRAGON_VERT, mais la race choisie est DRAGON_ROUGE.
    const data = { ...validSheet(), artefact: { key: 'lanterne' } };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'artefact.key')).toBe(true);
  });

  it('artefact avec une clé inconnue du catalogue → valid: false', () => {
    const data = { ...validSheet(), artefact: { key: 'artefact-inexistant' } };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'artefact.key')).toBe(true);
  });

  it('artefact absent → valid: false, errors[0].field = artefact.key', () => {
    const data = { ...validSheet(), artefact: undefined as unknown as HommeDragonSheetData['artefact'] };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'artefact.key')).toBe(true);
  });

  it('nom+inscription personnalisés sur artefact → toujours valide (texte libre, non contraint)', () => {
    const data = { ...validSheet(), artefact: { key: 'grand-arc', nom: 'Le Perceur', inscription: 'Pour Ignis' } };
    const result = validateHommeDragon(data, catalog());
    expect(result.valid).toBe(true);
  });

  it('ne lève jamais — même avec un catalogue vide', () => {
    expect(() => validateHommeDragon(validSheet(), [])).not.toThrow();
    expect(validateHommeDragon(validSheet(), []).valid).toBe(false);
  });
});
