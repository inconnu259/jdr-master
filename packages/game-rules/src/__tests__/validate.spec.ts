import { describe, it, expect } from 'vitest';
import { validate } from '../ryuutama/validate';
import type { RyuutamaCatalog, RyuutamaSheetData } from '../ryuutama/types';

function validSheet(): RyuutamaSheetData {
  return {
    classId: 'chasseur',
    typeId: 'attaque',
    weaponCategoryId: 'arc',
    attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
  };
}

/** Reflète le contenu réellement seedé en base pour Ryuutama (cf. apps/api/game-systems/ryuutama/data/*.json). */
function catalog(): RyuutamaCatalog {
  return {
    validClasses: [
      'artisan',
      'chasseur',
      'fermier',
      'guerisseur',
      'marchand',
      'menestrel',
      'noble',
    ],
    validTypes: ['attaque', 'technique', 'magie'],
    validWeapons: ['arc', 'epee-courte', 'epee-longue', 'hache', 'lance'],
    attributePatterns: [[4, 6, 6, 8]],
  };
}

describe('validate (strict)', () => {
  it('sheetData avec 0 classe → valid: false, errors[0].field = classId', () => {
    const data = { ...validSheet(), classId: '' };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('classId');
  });

  it('sheetData avec classe inconnue (2+ classes simulées) → valid: false', () => {
    const data = { ...validSheet(), classId: 'artisan,chasseur' };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(false);
  });

  it("attributs ne correspondant pas au pattern Polyvalent → valid: false, errors[0].field = attributes", () => {
    const data = {
      ...validSheet(),
      attributes: { AGI: 5, ESP: 5, INT: 5, VIG: 5 },
    };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'attributes')).toBe(true);
  });

  it('weaponCategoryId invalide (ex. "mains-nues") → valid: false, errors[0].field = weaponCategoryId', () => {
    const data = { ...validSheet(), weaponCategoryId: 'mains-nues' };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'weaponCategoryId'),
    ).toBe(true);
  });

  it('classId: "artisan" sans specialtyTypeId → valid: false, errors[0].field = specialtyTypeId', () => {
    const data = { ...validSheet(), classId: 'artisan' };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'specialtyTypeId'),
    ).toBe(true);
  });

  it('sheetData entièrement valide → valid: true, errors = []', () => {
    const result = validate(validSheet(), 'strict', catalog());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('mode "mj" → règles réelles exécutées, mais valid: true même avec des erreurs', () => {
    const result = validate({ ...validSheet(), classId: '' }, 'mj', catalog());
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.field === 'classId')).toBe(true);
  });

  it('mode "mj" → sheetData valide → valid: true, errors: []', () => {
    const result = validate(validSheet(), 'mj', catalog());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('catalog avec 2 patterns d’attributs → accepte le second pattern', () => {
    const twoPatterns = { ...catalog(), attributePatterns: [[4, 6, 6, 8], [3, 3, 3, 3]] };
    const data = { ...validSheet(), attributes: { AGI: 3, ESP: 3, INT: 3, VIG: 3 } };
    const result = validate(data, 'strict', twoPatterns);
    expect(result.valid).toBe(true);
  });

  describe('Story 24.1 : 3 profils d’attributs (Équilibré/Polyvalent/Spécialiste)', () => {
    function catalogWithThreePatterns(): RyuutamaCatalog {
      return {
        ...catalog(),
        // Reflète le contenu réellement seedé (attribute-patterns.json) après cette story.
        attributePatterns: [
          [6, 6, 6, 6], // Équilibré
          [4, 6, 6, 8], // Polyvalent
          [4, 4, 8, 8], // Spécialiste
        ],
      };
    }

    it('profil Équilibré (6,6,6,6) → valid: true', () => {
      const data = { ...validSheet(), attributes: { AGI: 6, ESP: 6, INT: 6, VIG: 6 } };
      const result = validate(data, 'strict', catalogWithThreePatterns());
      expect(result.valid).toBe(true);
    });

    it('profil Polyvalent (assigné dans un ordre quelconque) → valid: true', () => {
      const data = { ...validSheet(), attributes: { AGI: 4, ESP: 8, INT: 6, VIG: 6 } };
      const result = validate(data, 'strict', catalogWithThreePatterns());
      expect(result.valid).toBe(true);
    });

    it('profil Spécialiste (4,4,8,8) → valid: true', () => {
      const data = { ...validSheet(), attributes: { AGI: 4, ESP: 4, INT: 8, VIG: 8 } };
      const result = validate(data, 'strict', catalogWithThreePatterns());
      expect(result.valid).toBe(true);
    });

    it('répartition ne correspondant à aucun des 3 profils → valid: false', () => {
      const data = { ...validSheet(), attributes: { AGI: 4, ESP: 4, INT: 4, VIG: 12 } };
      const result = validate(data, 'strict', catalogWithThreePatterns());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'attributes')).toBe(true);
    });
  });

  it('Story 14.1 : equipment (individual/contenants/animaux) sans price/effect → valid: true, aucune règle ne le touche', () => {
    const data: RyuutamaSheetData = {
      ...validSheet(),
      equipment: {
        individual: [{ id: 'i1', name: 'Corde', weight: 1, addedBy: 'player' }],
        contenants: [{ id: 'c1', name: 'Sac', weight: 2, addedBy: 'player' }],
        animaux: [{ id: 'a1', name: 'Cheval', addedBy: 'player' }],
      },
    };
    const result = validate(data, 'strict', catalog());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  describe('Règle 6 (Story 23.8) : choix requis à la création', () => {
    function catalogWithRequiredChoices(): RyuutamaCatalog {
      return {
        ...catalog(),
        validClasses: [...catalog().validClasses, 'fermier', 'meteomancien', 'ermite'],
        requiredChoicesByClass: {
          fermier: [{ key: 'fermier-metier-appoint', kind: 'eligible-talent' }],
          meteomancien: [{ key: 'meteomancien-climatophile', kind: 'landscape-capability' }],
          ermite: [
            { key: 'ermite-metier-appoint', kind: 'eligible-talent' },
            { key: 'ermite-metamorphose', kind: 'landscape-flavor' },
          ],
        },
      };
    }

    it('classe avec requiredChoices, classChoices manquant → valid: false, errors[].field = key du choix', () => {
      const data = { ...validSheet(), classId: 'fermier' };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'fermier-metier-appoint'),
      ).toBe(true);
    });

    it('classe avec requiredChoices, classChoices renseigné → valid: true', () => {
      const data = {
        ...validSheet(),
        classId: 'fermier',
        classChoices: { 'fermier-metier-appoint': 'guerisseur:soins' },
      };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('choix landscape-capability (Climatophile) satisfait via classCapabilities (pas classChoices)', () => {
      const data = {
        ...validSheet(),
        classId: 'meteomancien',
        classCapabilities: [
          { type: 'landscape' as const, params: { key: 'foret' } },
        ],
      };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('classe sans requiredChoices dans le catalogue → aucune erreur Règle 6', () => {
      const result = validate(validSheet(), 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(true);
    });

    it('revue de code (2026-07-26) : classCapabilities non vide ne doit PAS contourner un choix eligible-talent/landscape-flavor d\'une AUTRE nature (Ermite)', () => {
      const data = {
        ...validSheet(),
        classId: 'ermite',
        // classCapabilities non vide, sans rapport avec les choix requis de l'Ermite (qui n'a
        // aucun choix landscape-capability) — ne doit satisfaire ni ermite-metier-appoint ni
        // ermite-metamorphose.
        classCapabilities: [{ type: 'landscape' as const, params: { key: 'foret' } }],
      };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'ermite-metier-appoint')).toBe(true);
      expect(result.errors.some((e) => e.field === 'ermite-metamorphose')).toBe(true);
    });

    it('Ermite avec classChoices renseignés pour les deux choix → valid: true', () => {
      const data = {
        ...validSheet(),
        classId: 'ermite',
        classChoices: {
          'ermite-metier-appoint': 'guerisseur:soins',
          'ermite-metamorphose': 'foret',
        },
      };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('Règle 5 (Artisan) reste inchangée en présence de requiredChoicesByClass', () => {
      const data = { ...validSheet(), classId: 'artisan' };
      const result = validate(data, 'strict', catalogWithRequiredChoices());
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.field === 'specialtyTypeId'),
      ).toBe(true);
    });
  });

  describe('Règle 7 (Story 23.9) : choix de magie à la création (type Magie)', () => {
    function catalogWithMagie(): RyuutamaCatalog {
      return {
        ...catalog(),
        validSeasons: ['printemps', 'ete', 'automne', 'hiver'],
        validDebutantRitualSpells: [
          'benediction-main-rouge',
          'cloche-alarme',
          'eclatante-purete-cristal',
        ],
      };
    }

    function magieSheet(overrides: Partial<RyuutamaSheetData> = {}): RyuutamaSheetData {
      return { ...validSheet(), typeId: 'magie', ...overrides };
    }

    it('typeId "magie" sans magicSeason → valid: false, errors[].field = magicSeason', () => {
      const data = magieSheet({
        knownRitualSpells: ['benediction-main-rouge', 'cloche-alarme'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'magicSeason')).toBe(true);
    });

    it('typeId "magie" avec magicSeason hors catalogue → valid: false', () => {
      const data = magieSheet({
        magicSeason: 'saison-inexistante',
        knownRitualSpells: ['benediction-main-rouge', 'cloche-alarme'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'magicSeason')).toBe(true);
    });

    it('typeId "magie" sans knownRitualSpells → valid: false, errors[].field = knownRitualSpells', () => {
      const data = magieSheet({ magicSeason: 'printemps' });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('typeId "magie" avec 1 seul sort connu → valid: false (exactement 2 requis)', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: ['benediction-main-rouge'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('typeId "magie" avec 3 sorts connus → valid: false (exactement 2 requis)', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: [
          'benediction-main-rouge',
          'cloche-alarme',
          'eclatante-purete-cristal',
        ],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('typeId "magie" avec un sort dupliqué (même clé deux fois) → valid: false', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: ['benediction-main-rouge', 'benediction-main-rouge'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('typeId "magie" avec un sort hors catalogue rituel débutant → valid: false', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: ['benediction-main-rouge', 'sort-inconnu'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('revue de code (2026-07-26) : knownRitualSpells non-tableau (client malveillant/buggé) → valid: false, ne plante pas', () => {
      const data = {
        ...magieSheet({ magicSeason: 'printemps' }),
        knownRitualSpells: { foo: 'bar' } as unknown as string[],
      };
      expect(() => validate(data, 'strict', catalogWithMagie())).not.toThrow();
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'knownRitualSpells')).toBe(true);
    });

    it('revue de code (2026-07-26) : catalog.validSeasons vide → message ne se termine pas par "Saisons acceptées : " sans rien après', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: ['benediction-main-rouge', 'cloche-alarme'],
      });
      const catalogNoSeasons: RyuutamaCatalog = { ...catalogWithMagie(), validSeasons: [] };
      const result = validate(data, 'strict', catalogNoSeasons);
      const message = result.errors.find((e) => e.field === 'magicSeason')?.message;
      expect(message).not.toMatch(/Saisons acceptées : $/);
    });

    it('typeId "magie" avec magicSeason et 2 sorts valides et distincts → valid: true', () => {
      const data = magieSheet({
        magicSeason: 'printemps',
        knownRitualSpells: ['benediction-main-rouge', 'cloche-alarme'],
      });
      const result = validate(data, 'strict', catalogWithMagie());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('typeId différent de "magie" → aucune erreur de la Règle 7 même sans magicSeason/knownRitualSpells', () => {
      const result = validate(validSheet(), 'strict', catalogWithMagie());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
