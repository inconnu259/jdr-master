import type { PartySignalCode } from '@master-jdr/shared';
import { dominantCategory, dominantSignal, sortByPriority } from './party-signal-priority';

describe('dominantSignal (Story 29.7, AC8)', () => {
  it('aucun signal → null', () => {
    expect(dominantSignal([])).toBeNull();
  });

  it('un seul signal → lui-même', () => {
    expect(dominantSignal(['RAPPORT_FIN_MANQUANT'])).toBe('RAPPORT_FIN_MANQUANT');
  });

  it('plusieurs signaux concurrents → le plus prioritaire (bloque le démarrage > échéance > retard)', () => {
    const signals: PartySignalCode[] = [
      'RAPPORT_FIN_MANQUANT',
      'VOTE_EN_COURS_SANS_REPONSE',
      'AUCUN_MEMBRE_INVITE',
    ];
    expect(dominantSignal(signals)).toBe('AUCUN_MEMBRE_INVITE');
  });

  it('PARTIE_TERMINEE est toujours dominant, même avec RAPPORT_FIN_MANQUANT coexistant (AC8)', () => {
    expect(dominantSignal(['RAPPORT_FIN_MANQUANT', 'PARTIE_TERMINEE'])).toBe('PARTIE_TERMINEE');
    expect(dominantSignal(['COMPTE_RENDU_NON_REDIGE', 'PARTIE_TERMINEE'])).toBe('PARTIE_TERMINEE');
  });

  it("PROCHAINE_SEANCE_CONNUE (informatif) n'est jamais dominant s'il coexiste avec un autre signal", () => {
    expect(dominantSignal(['PROCHAINE_SEANCE_CONNUE', 'AUCUN_SCENARIO_EN_COURS'])).toBe(
      'AUCUN_SCENARIO_EN_COURS',
    );
  });

  it('PROCHAINE_SEANCE_CONNUE seul reste tout de même le signal retourné', () => {
    expect(dominantSignal(['PROCHAINE_SEANCE_CONNUE'])).toBe('PROCHAINE_SEANCE_CONNUE');
  });
});

describe('sortByPriority (Story 29.7, AC3)', () => {
  it('trie du plus au moins prioritaire, dominantSignal() en tête', () => {
    const sorted = sortByPriority([
      'PROCHAINE_SEANCE_CONNUE',
      'RAPPORT_FIN_MANQUANT',
      'AUCUN_MEMBRE_INVITE',
    ]);
    expect(sorted).toEqual([
      'AUCUN_MEMBRE_INVITE',
      'RAPPORT_FIN_MANQUANT',
      'PROCHAINE_SEANCE_CONNUE',
    ]);
  });

  it('ne mute pas le tableau original', () => {
    const original: PartySignalCode[] = ['RAPPORT_FIN_MANQUANT', 'AUCUN_MEMBRE_INVITE'];
    const copy = [...original];
    sortByPriority(original);
    expect(original).toEqual(copy);
  });
});

describe('dominantCategory (Story 29.7, AC8, revue de code)', () => {
  it('aucun signal → null', () => {
    expect(dominantCategory([])).toBeNull();
  });

  it("un signal qui bloque le démarrage → 'blocking'", () => {
    expect(dominantCategory(['AUCUN_MEMBRE_INVITE'])).toBe('blocking');
  });

  it("un signal à échéance → 'deadline'", () => {
    expect(dominantCategory(['VOTE_EN_COURS_SANS_REPONSE'])).toBe('deadline');
  });

  it("un signal en retard → 'overdue'", () => {
    expect(dominantCategory(['RAPPORT_FIN_MANQUANT'])).toBe('overdue');
  });

  it('un blocage prime sur une échéance concurrente (même ordre que dominantSignal)', () => {
    expect(dominantCategory(['VOTE_EN_COURS_SANS_REPONSE', 'AUCUN_MEMBRE_INVITE'])).toBe(
      'blocking',
    );
  });

  it("PROCHAINE_SEANCE_CONNUE seul → 'informative'", () => {
    expect(dominantCategory(['PROCHAINE_SEANCE_CONNUE'])).toBe('informative');
  });
});
