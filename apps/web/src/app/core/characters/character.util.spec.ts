import type { CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { characterName, findContentEntry } from './character.util';

function makeCharacter(overrides: Partial<CharacterDto> = {}): CharacterDto {
  return {
    id: 'c1',
    userId: 'u1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {},
    derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
    portraitUrl: null,
    portraitCropData: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('characterName', () => {
  it('retourne le nom narratif si renseigné', () => {
    const c = makeCharacter({ sheetData: { narrative: { name: 'Fenn' } } });
    expect(characterName(c)).toBe('Fenn');
  });

  it('retourne un libellé de repli si le nom est absent', () => {
    const c = makeCharacter({ sheetData: {} });
    expect(characterName(c)).toBe('Personnage sans nom');
  });

  it('retourne un libellé de repli si le nom est une chaîne vide/espaces', () => {
    const c = makeCharacter({ sheetData: { narrative: { name: '   ' } } });
    expect(characterName(c)).toBe('Personnage sans nom');
  });
});

describe('findContentEntry', () => {
  const CONTENT: GameSystemContentDto = {
    class: [{ key: 'menestrel', data: { label: 'Ménestrel' } }],
  };

  it("retourne les données de l'entrée dont la clé correspond", () => {
    expect(findContentEntry<{ label: string }>(CONTENT, 'class', 'menestrel')).toEqual({
      label: 'Ménestrel',
    });
  });

  it('retourne null si la clé est absente', () => {
    expect(findContentEntry(CONTENT, 'class', undefined)).toBeNull();
  });

  it('retourne null si aucune entrée ne correspond à la clé', () => {
    expect(findContentEntry(CONTENT, 'class', 'inconnu')).toBeNull();
  });

  it('retourne null si le contenu est null/undefined', () => {
    expect(findContentEntry(null, 'class', 'menestrel')).toBeNull();
    expect(findContentEntry(undefined, 'class', 'menestrel')).toBeNull();
  });
});
