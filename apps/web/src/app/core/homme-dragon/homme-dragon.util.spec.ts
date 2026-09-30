import { hommeDragonName } from './homme-dragon.util';

describe('hommeDragonName (Story 33.5)', () => {
  it('rend le nom normalisé', () => {
    expect(hommeDragonName('  Skarn ')).toBe('Skarn');
  });

  it.each([undefined, null, '', '   '])('repli lisible pour %j', (nom) => {
    expect(hommeDragonName(nom)).toBe('Homme Dragon sans nom');
  });
});
