// Story 37.5 : registre unique des systèmes de jeu (`GAME_SYSTEMS` de `@master-jdr/shared`) et
// ses quatre lecteurs. Le VRAI registre est exercé (aucun `jest.mock`) : `transformIgnorePatterns`
// laisse ts-jest transformer `@master-jdr/*`.
import {
  GAME_SYSTEMS,
  familyOf,
  hasCapability,
  isOpenForCreation,
  kindsOf,
  type GameSystemCapability,
} from '@master-jdr/shared';

const ALL_CAPABILITIES: GameSystemCapability[] = [
  'characters',
  'scenarioLifecycle',
  'xp',
  'hommeDragon',
  'groupRoles',
  'announcements',
  'linearCampaign',
];

const JDR_KINDS = ['ONE_SHOT', 'CAMPAGNE_LINEAIRE', 'CAMPAGNE_EPISODIQUE'];

describe('registre GAME_SYSTEMS (Story 37.5)', () => {
  it('déclare exactement les cinq systèmes attendus', () => {
    expect(GAME_SYSTEMS.map((g) => g.id)).toEqual([
      'draconis',
      'conte-de-minuit',
      'ryuutama',
      'esteren',
      'ralliement',
    ]);
  });

  it('ryuutama : famille jdr, toutes les capacités, trois types, ouvert à la création', () => {
    expect(familyOf('ryuutama')).toBe('jdr');
    for (const capability of ALL_CAPABILITIES) {
      expect(hasCapability('ryuutama', capability)).toBe(true);
    }
    expect(kindsOf('ryuutama')).toEqual(JDR_KINDS);
    expect(isOpenForCreation('ryuutama')).toBe(true);
  });

  it.each(['draconis', 'conte-de-minuit', 'esteren'])(
    '%s : famille jdr, aucune capacité, trois types, fermé',
    (id) => {
      expect(familyOf(id)).toBe('jdr');
      for (const capability of ALL_CAPABILITIES) {
        expect(hasCapability(id, capability)).toBe(false);
      }
      expect(kindsOf(id)).toEqual(JDR_KINDS);
      expect(isOpenForCreation(id)).toBe(false);
    },
  );

  it('ralliement : famille ralliement, aucune capacité, ONE_SHOT + CAMPAGNE_EPISODIQUE, fermé jusqu’à l’épic 38', () => {
    const entry = GAME_SYSTEMS.find((g) => g.id === 'ralliement');
    expect(entry?.name).toBe('Ralliement');
    expect(familyOf('ralliement')).toBe('ralliement');
    for (const capability of ALL_CAPABILITIES) {
      expect(hasCapability('ralliement', capability)).toBe(false);
    }
    expect(kindsOf('ralliement')).toEqual(['ONE_SHOT', 'CAMPAGNE_EPISODIQUE']);
    expect(isOpenForCreation('ralliement')).toBe(false);
  });

  it('seul ryuutama est ouvert à la création (aucun changement de l’offre)', () => {
    expect(GAME_SYSTEMS.filter((g) => isOpenForCreation(g.id)).map((g) => g.id)).toEqual([
      'ryuutama',
    ]);
  });

  it('un id inconnu ne lève jamais : null / false / [] / false', () => {
    expect(() => familyOf('inconnu')).not.toThrow();
    expect(familyOf('inconnu')).toBeNull();
    expect(hasCapability('inconnu', 'characters')).toBe(false);
    expect(kindsOf('inconnu')).toEqual([]);
    expect(isOpenForCreation('inconnu')).toBe(false);
  });
});
