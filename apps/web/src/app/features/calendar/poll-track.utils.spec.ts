import { describe, expect, it } from 'vitest';
import type { VoteAnswer } from '@master-jdr/shared';
import {
  type VoteParticipation,
  answerLabel,
  counterLabel,
  participationAriaLabel,
  respondedCount,
  trackSegments,
} from './poll-track.utils';

function vote(over: Partial<VoteParticipation> = {}): VoteParticipation {
  return {
    partieId: 'partie1',
    pollId: 'poll1',
    optionId: 'o1',
    yes: 0,
    maybe: 0,
    no: 0,
    total: 4,
    myAnswer: null,
    ...over,
  };
}

describe('VoteParticipation — le triplet d’identité de l’action (Story 36.7, AC8)', () => {
  it('porte partieId, pollId et optionId : les deux routes de vote sont scopées à la partie', () => {
    // Story 36.7, encadré n°3 — sans `partieId`, le calendrier PERSONNEL (qui agrège plusieurs
    // parties) ne peut pas construire l’URL `/parties/:partieId/poll/:pollId/vote`. Le champ est
    // REQUIS : un `undefined` finirait silencieusement dans une URL.
    const v = vote({ partieId: 'p-42', pollId: 'poll-7', optionId: 'opt-3' });
    expect(v.partieId).toBe('p-42');
    expect(v.pollId).toBe('poll-7');
    expect(v.optionId).toBe('opt-3');
  });
});

describe('trackSegments — la piste entière représente la troupe (AC1, AC2, AC3)', () => {
  it('AC1 — les largeurs sont des pourcentages de l’EFFECTIF TOTAL, pas des répondants', () => {
    const seg = trackSegments(vote({ yes: 1, total: 4 }));
    expect(seg.yes).toBe(25);
    expect(seg.maybe).toBe(0);
    expect(seg.no).toBe(0);
  });

  it('AC3 — « 1 oui sur 4 » et « 4 oui sur 4 » ne produisent PAS la même piste', () => {
    const solitaire = trackSegments(vote({ yes: 1, total: 4 }));
    const plebiscite = trackSegments(vote({ yes: 4, total: 4 }));
    expect(solitaire.yes).not.toBe(plebiscite.yes);
    expect(solitaire.yes).toBe(25);
    expect(plebiscite.yes).toBe(100);
  });

  it('AC2 — oui, peut-être et non occupent trois portions distinctes', () => {
    const seg = trackSegments(vote({ yes: 2, maybe: 1, no: 1, total: 4 }));
    expect(seg).toEqual({ yes: 50, maybe: 25, no: 25 });
  });

  it('AC2 — la portion restante n’est PAS un segment : elle est le fond tramé', () => {
    const seg = trackSegments(vote({ yes: 2, maybe: 1, total: 4 }));
    // 50 + 25 = 75 % couverts ; les 25 % restants laissent voir la trame du fond.
    expect(seg.yes + seg.maybe + seg.no).toBe(75);
  });

  it('aucune réponse → trois segments à zéro, piste entièrement tramée', () => {
    expect(trackSegments(vote({ total: 4 }))).toEqual({
      yes: 0,
      maybe: 0,
      no: 0,
    });
  });

  it('effectif nul → jamais de division par zéro, jamais de NaN', () => {
    const seg = trackSegments(vote({ yes: 2, total: 0 }));
    expect(Number.isNaN(seg.yes)).toBe(false);
    expect(seg).toEqual({ yes: 0, maybe: 0, no: 0 });
  });

  it('plus de réponses que de membres → les largeurs restent bornées à 100 %', () => {
    // Défense en profondeur : un effectif périmé (membre retiré après son vote) ne doit jamais
    // produire une largeur > 100 % dans un attribut de style.
    const seg = trackSegments(vote({ yes: 5, total: 4 }));
    expect(seg.yes).toBeLessThanOrEqual(100);
    expect(seg.yes + seg.maybe + seg.no).toBeLessThanOrEqual(100);
  });
});

describe('robustesse — une charge utile incomplète ne produit jamais « NaN / undefined »', () => {
  // 🚨 Défaut RÉEL, trouvé à l'œil et par aucun des 3117 tests : avec un serveur qui ne sert pas
  // encore les agrégats (client neuf / API en retard, exactement ce qui se produit pendant un
  // déploiement), le rail affichait « NaN / undefined ». Les utilitaires doivent dégrader, pas
  // écrire des non-nombres à l'écran.
  const partiel = {
    partieId: 'partie-1',
    pollId: 'p',
    optionId: 'o1',
  } as unknown as VoteParticipation;

  it('compteur : « 0 / 0 », jamais « NaN / undefined »', () => {
    const label = counterLabel(partiel);
    expect(label).not.toContain('NaN');
    expect(label).not.toContain('undefined');
    expect(label).toBe('0 / 0');
  });

  it('segments : zéro partout, aucune largeur non finie', () => {
    const seg = trackSegments(partiel);
    expect(seg).toEqual({ yes: 0, maybe: 0, no: 0 });
  });

  it('nom accessible : aucun NaN ni undefined annoncé', () => {
    const label = participationAriaLabel(partiel);
    expect(label).not.toContain('NaN');
    expect(label).not.toContain('undefined');
  });

  it('respondedCount reste un entier fini', () => {
    expect(Number.isFinite(respondedCount(partiel))).toBe(true);
  });
});

describe('respondedCount / counterLabel (AC4)', () => {
  it('compte les répondants, tous avis confondus', () => {
    expect(respondedCount(vote({ yes: 2, maybe: 1, no: 0 }))).toBe(3);
  });

  it('AC4 — le compteur se lit « 3 / 4 »', () => {
    expect(counterLabel(vote({ yes: 2, maybe: 1, total: 4 }))).toBe('3 / 4');
  });

  it('aucun répondant → « 0 / 4 », jamais une chaîne vide', () => {
    expect(counterLabel(vote({ total: 4 }))).toBe('0 / 4');
  });
});

describe('answerLabel — ma réponse en toutes lettres (AC5)', () => {
  it('rend les trois réponses en toutes lettres, jamais un code', () => {
    const cases: [VoteAnswer, string][] = [
      ['YES', 'oui'],
      ['MAYBE', 'peut-être'],
      ['NO', 'non'],
    ];
    for (const [answer, expected] of cases) {
      expect(answerLabel(answer, 'compact')).toBe(expected);
    }
  });

  it('niveau complet — la réponse est phrasée', () => {
    expect(answerLabel('YES', 'full')).toBe('tu as dit oui');
    expect(answerLabel('MAYBE', 'full')).toBe('tu as dit peut-être');
  });

  it('aucune réponse → chaîne vide, jamais « null » affiché', () => {
    expect(answerLabel(null, 'full')).toBe('');
    expect(answerLabel(null, 'compact')).toBe('');
  });
});

describe('participationAriaLabel — la proportion doublée par du texte (AC14)', () => {
  it('dit le nombre de répondants sur l’effectif', () => {
    expect(participationAriaLabel(vote({ yes: 2, maybe: 1, total: 4 }))).toContain(
      '3 réponses sur 4',
    );
  });

  it('un seul répondant est annoncé au singulier', () => {
    expect(participationAriaLabel(vote({ yes: 1, total: 4 }))).toContain('1 réponse sur 4');
  });

  it('détaille les avis donnés', () => {
    const label = participationAriaLabel(vote({ yes: 2, maybe: 1, no: 1, total: 4 }));
    expect(label).toContain('2 oui');
    expect(label).toContain('1 peut-être');
    expect(label).toContain('1 non');
  });

  it('n’énumère jamais un avis à zéro', () => {
    expect(participationAriaLabel(vote({ yes: 2, total: 4 }))).not.toContain('0 non');
  });

  it('ma réponse y figure en toutes lettres quand elle existe', () => {
    expect(participationAriaLabel(vote({ yes: 1, total: 4, myAnswer: 'YES' }))).toContain(
      'tu as dit oui',
    );
  });
});
