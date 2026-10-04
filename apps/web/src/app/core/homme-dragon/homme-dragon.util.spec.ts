import {
  SANS_AVENTURE_LABEL,
  hommeDragonAventuresLabel,
  hommeDragonName,
} from './homme-dragon.util';

describe('hommeDragonName (Story 33.5)', () => {
  it('rend le nom normalisé', () => {
    expect(hommeDragonName('  Skarn ')).toBe('Skarn');
  });

  it.each([undefined, null, '', '   '])('repli lisible pour %j', (nom) => {
    expect(hommeDragonName(nom)).toBe('Homme Dragon sans nom');
  });
});

describe('hommeDragonAventuresLabel (Story 33.8)', () => {
  it('joint les noms des aventures dans l’ordre reçu', () => {
    expect(hommeDragonAventuresLabel([{ nom: 'Les Vents du Nord' }, { nom: "L'Archipel" }])).toBe(
      "Les Vents du Nord · L'Archipel",
    );
  });

  it('une seule aventure → son nom', () => {
    expect(hommeDragonAventuresLabel([{ nom: 'Les Vents du Nord' }])).toBe('Les Vents du Nord');
  });

  it.each([[[]], [undefined], [null]])('sans aventure (%j) → « Sans aventure »', (aventures) => {
    expect(hommeDragonAventuresLabel(aventures)).toBe(SANS_AVENTURE_LABEL);
  });
});
