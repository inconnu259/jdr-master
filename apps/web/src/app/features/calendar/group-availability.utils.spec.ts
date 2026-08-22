import { describe, expect, it } from 'vitest';
import {
  GROUP_PASTILLE_MAX,
  type GroupAvailability,
  type GroupMember,
  groupAriaLabel,
  groupCounterLabel,
  groupFillRatio,
  groupIsAllBlocked,
  memberStatusGlyph,
  memberStatusWord,
  showsMemberPastilles,
} from './group-availability.utils';

function member(id: string, status: GroupMember['status']): GroupMember {
  return { userId: id, pseudo: id, displayName: id.toUpperCase(), status };
}

function group(partial: Partial<GroupAvailability> = {}): GroupAvailability {
  return {
    available: 0,
    unavailable: 0,
    unknown: 0,
    total: 4,
    members: null,
    ...partial,
  };
}

describe('groupFillRatio (Story 36.8)', () => {
  it('remplit à proportion des membres disponibles (AC3)', () => {
    expect(groupFillRatio(group({ available: 1, unknown: 3 }))).toBe(25);
    expect(groupFillRatio(group({ available: 4 }))).toBe(100);
  });

  it('rend zéro sur un effectif nul — jamais une division par zéro ni un NaN dans un style', () => {
    expect(groupFillRatio(group({ available: 2, total: 0 }))).toBe(0);
    expect(groupFillRatio(group({ available: undefined as unknown as number, total: 4 }))).toBe(0);
  });

  it('borne à 100 % un effectif périmé (plus de disponibles que de membres)', () => {
    expect(groupFillRatio(group({ available: 6, total: 4 }))).toBe(100);
  });
});

describe('les deux vides (AC6, Story 36.8)', () => {
  it('« tout le monde est bloqué » quand unavailable atteint l’effectif', () => {
    expect(groupIsAllBlocked(group({ unavailable: 4, total: 4 }))).toBe(true);
  });

  it('« personne ne s’est prononcé » n’est PAS « tout le monde est bloqué »', () => {
    const nobodySpoke = group({ unknown: 4 });
    expect(groupIsAllBlocked(nobodySpoke)).toBe(false);
    expect(groupFillRatio(nobodySpoke)).toBe(0);
    // Les deux états rendent une jauge de hauteur nulle : sans le drapeau, ils seraient
    // indistinguables. C'est exactement ce que l'AC6 interdit.
    expect(groupFillRatio(group({ unavailable: 4, total: 4 }))).toBe(0);
  });

  it('cas intermédiaire tranché par la story : personne de dispo, une PARTIE bloquée ⇒ pas « tout le monde »', () => {
    expect(groupIsAllBlocked(group({ unavailable: 2, unknown: 2, total: 4 }))).toBe(false);
  });

  it('un effectif nul n’est jamais « tout le monde est bloqué »', () => {
    expect(groupIsAllBlocked(group({ unavailable: 0, total: 0 }))).toBe(false);
  });
});

describe('showsMemberPastilles (AC4/AC5, Story 36.8)', () => {
  it('rend des pastilles jusqu’à six membres', () => {
    const six = Array.from({ length: GROUP_PASTILLE_MAX }, (_, i) => member(`u${i}`, 'AVAILABLE'));
    expect(showsMemberPastilles(group({ members: six, total: 6 }))).toBe(true);
  });

  it('retombe sur la jauge au-delà de six (AC5)', () => {
    const seven = Array.from({ length: 7 }, (_, i) => member(`u${i}`, 'AVAILABLE'));
    expect(showsMemberPastilles(group({ members: seven, total: 7 }))).toBe(false);
  });

  it('retombe sur la jauge quand le serveur n’a servi aucune identité (joueur, AC3)', () => {
    expect(showsMemberPastilles(group({ members: null }))).toBe(false);
  });

  it('retombe sur la jauge sur une liste vide — « aucune identité » n’est pas « troupe de zéro »', () => {
    expect(showsMemberPastilles(group({ members: [] }))).toBe(false);
  });
});

describe('groupAriaLabel (AC15, Story 36.8)', () => {
  it('dit toujours les disponibles sur l’effectif', () => {
    expect(groupAriaLabel(group({ available: 2, unknown: 2 }))).toContain('2 sur 4 disponibles');
  });

  it('distingue les deux vides EN TOUTES LETTRES, sans la couleur (AC6 + P-1)', () => {
    expect(groupAriaLabel(group({ unavailable: 4, total: 4 }))).toContain(
      'tout le monde est bloqué',
    );
    expect(groupAriaLabel(group({ unknown: 4 }))).toContain("personne ne s'est prononcé");
  });

  it('nomme les membres et leur statut quand le serveur en a servi (AC7, vue MJ)', () => {
    const label = groupAriaLabel(
      group({
        available: 1,
        unavailable: 1,
        unknown: 1,
        total: 3,
        members: [
          member('alice', 'AVAILABLE'),
          member('bob', 'UNAVAILABLE'),
          member('carol', 'UNKNOWN'),
        ],
      }),
    );
    expect(label).toContain('ALICE disponible');
    expect(label).toContain('BOB indisponible');
    expect(label).toContain('CAROL sans réponse');
  });

  it('ne nomme personne quand aucune identité n’est servie (AC3, vue joueur)', () => {
    const counts = { available: 2, unavailable: 1, unknown: 1 };
    const anonymous = groupAriaLabel(group(counts));
    // Assertion d'égalité STRICTE : « ne contient pas tel nom » passerait aussi pour une
    // mauvaise raison (un nom absent de la fixture). Ici, la seule chose que le libellé peut
    // dire, ce sont les nombres.
    expect(anonymous).toBe('Disponibilité du groupe : 2 sur 4 disponibles — 1 indisponible');

    // Et la preuve que c'est bien la donnée qui décide : mêmes compteurs, identités servies.
    const named = groupAriaLabel(
      group({
        ...counts,
        members: [
          member('alice', 'AVAILABLE'),
          member('bob', 'AVAILABLE'),
          member('carol', 'UNAVAILABLE'),
          member('dave', 'UNKNOWN'),
        ],
      }),
    );
    expect(named).toContain('ALICE disponible');
    expect(named.startsWith(anonymous)).toBe(true);
  });
});

describe('groupCounterLabel (Story 36.8)', () => {
  it('double la forme là où il y a la place', () => {
    expect(groupCounterLabel(group({ available: 2 }))).toBe('2 / 4');
  });

  it('borne un effectif périmé — jamais « 5 / 4 »', () => {
    expect(groupCounterLabel(group({ available: 5, total: 4 }))).toBe('4 / 4');
  });
});

describe('memberStatusWord (Story 36.8)', () => {
  it('écrit les trois statuts en toutes lettres — point unique du vocabulaire', () => {
    expect(memberStatusWord(member('a', 'AVAILABLE'))).toBe('disponible');
    expect(memberStatusWord(member('a', 'UNAVAILABLE'))).toBe('indisponible');
    expect(memberStatusWord(member('a', 'UNKNOWN'))).toBe('sans réponse');
  });
});

describe('memberStatusGlyph (revue de code, Story 36.8)', () => {
  it('donne un glyphe distinct par statut — jamais la seule couleur sous le seuil téléphone', () => {
    expect(memberStatusGlyph(member('a', 'AVAILABLE'))).toBe('D');
    expect(memberStatusGlyph(member('a', 'UNAVAILABLE'))).toBe('I');
    expect(memberStatusGlyph(member('a', 'UNKNOWN'))).toBe('?');
  });
});
