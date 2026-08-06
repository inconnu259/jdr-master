import { ambiguousUserIds } from './identity-ambiguity.util';

describe('ambiguousUserIds', () => {
  it('retourne les userId dont le displayName est partagé', () => {
    const result = ambiguousUserIds([
      { userId: 'u1', displayName: 'Même Nom' },
      { userId: 'u2', displayName: 'Même Nom' },
      { userId: 'u3', displayName: 'Unique' },
    ]);
    expect(result).toEqual(new Set(['u1', 'u2']));
  });

  it('liste sans collision → ensemble vide', () => {
    const result = ambiguousUserIds([
      { userId: 'u1', displayName: 'Alice' },
      { userId: 'u2', displayName: 'Bob' },
    ]);
    expect(result.size).toBe(0);
  });

  it('liste vide → ensemble vide', () => {
    expect(ambiguousUserIds([]).size).toBe(0);
  });
});
