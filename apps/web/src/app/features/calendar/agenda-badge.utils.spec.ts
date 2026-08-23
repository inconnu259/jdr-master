import { describe, expect, it } from 'vitest';
import type { AgendaEntry } from './calendar-agenda-view/calendar-agenda-view';
import type { VoteParticipation } from './poll-track.utils';
import {
  addDaysToKey,
  badgeFor,
  daysBetweenKeys,
  groupVoteEntries,
  imminenceLabel,
  pollGroupBadge,
  sectionIdFor,
} from './agenda-badge.utils';

const TODAY = '2026-08-22';

function seance(over: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    key: 'seance-1',
    type: 'mes-seances',
    date: TODAY,
    label: 'Le Convoi du Nord',
    slot: 'EVENING',
    partieId: 'p1',
    scenarioId: 's1',
    seanceId: 'se1',
    compteRenduManquant: false,
    ...over,
  };
}

function vote(over: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    key: 'poll-1',
    type: 'votes-en-cours',
    date: TODAY,
    label: 'Les Cendres d’Ashal',
    slot: 'EVENING',
    vote: {
      partieId: 'p1',
      pollId: 'poll1',
      optionId: 'o1',
      yes: 1,
      maybe: 0,
      no: 0,
      total: 4,
      myAnswer: null,
    },
    ...over,
  };
}

function inscription(over: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    key: 'inscription-1',
    type: 'inscriptions-ouvertes',
    date: '',
    label: 'La Halte du Griffon',
    detail: '3/5 inscrits',
    jeSuisInscrit: false,
    ...over,
  };
}

describe('daysBetweenKeys / addDaysToKey', () => {
  it('compte des jours entiers, sans dérive de fuseau', () => {
    expect(daysBetweenKeys(TODAY, '2026-08-25')).toBe(3);
    expect(daysBetweenKeys(TODAY, TODAY)).toBe(0);
    expect(daysBetweenKeys(TODAY, '2026-08-21')).toBe(-1);
  });

  it('traverse un changement de mois et une année bissextile', () => {
    expect(daysBetweenKeys('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetweenKeys('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('addDaysToKey est l’inverse de daysBetweenKeys', () => {
    expect(addDaysToKey(TODAY, 10)).toBe('2026-09-01');
    expect(addDaysToKey(TODAY, -22)).toBe('2026-07-31');
  });
});

describe('imminenceLabel (AC11 — libellés humains au dernier palier)', () => {
  it('le jour même : « ce soir », jamais « J-0 »', () => {
    expect(imminenceLabel(TODAY, 'EVENING', TODAY)).toBe('ce soir');
    expect(imminenceLabel(TODAY, 'MORNING', TODAY)).toBe('ce matin');
    expect(imminenceLabel(TODAY, 'AFTERNOON', TODAY)).toBe('cet après-midi');
    expect(imminenceLabel(TODAY, 'FULL_DAY', TODAY)).toBe("aujourd'hui");
    expect(imminenceLabel(TODAY, undefined, TODAY)).toBe("aujourd'hui");
  });

  it('le lendemain : « demain soir », jamais « J-1 »', () => {
    expect(imminenceLabel('2026-08-23', 'EVENING', TODAY)).toBe('demain soir');
    expect(imminenceLabel('2026-08-23', 'FULL_DAY', TODAY)).toBe('demain');
  });

  it('de 2 à 13 jours : un décompte en jours', () => {
    expect(imminenceLabel('2026-08-24', 'EVENING', TODAY)).toBe('dans 2 j');
    expect(imminenceLabel('2026-08-29', 'EVENING', TODAY)).toBe('dans 7 j');
    expect(imminenceLabel('2026-08-30', 'EVENING', TODAY)).toBe('dans 8 j');
  });

  it('à partir de 14 jours : un décompte en semaines', () => {
    expect(imminenceLabel('2026-09-05', 'EVENING', TODAY)).toBe('dans 2 sem.');
    expect(imminenceLabel('2026-09-12', 'EVENING', TODAY)).toBe('dans 3 sem.');
  });
});

describe('sectionIdFor (AC1, AC9, encadré n°4)', () => {
  it('les votes et les inscriptions vont dans « Ça t’attend », répondus compris', () => {
    expect(sectionIdFor(vote(), TODAY)).toBe('awaiting');
    expect(sectionIdFor(vote({ vote: { ...vote().vote!, myAnswer: 'YES' } }), TODAY)).toBe(
      'awaiting',
    );
    expect(sectionIdFor(inscription(), TODAY)).toBe('awaiting');
    expect(sectionIdFor(inscription({ jeSuisInscrit: true }), TODAY)).toBe('awaiting');
  });

  it('une séance du jour ou à venir est programmée', () => {
    expect(sectionIdFor(seance(), TODAY)).toBe('scheduled');
    expect(sectionIdFor(seance({ date: '2026-12-01' }), TODAY)).toBe('scheduled');
  });

  it('une séance passée sans compte-rendu est passée', () => {
    expect(sectionIdFor(seance({ date: '2026-08-01', compteRenduManquant: true }), TODAY)).toBe(
      'past',
    );
  });

  it('une séance passée dont le compte-rendu existe n’a plus de section', () => {
    expect(sectionIdFor(seance({ date: '2026-08-01', compteRenduManquant: false }), TODAY)).toBe(
      null,
    );
  });

  it('🚨 une séance passée du calendrier PERSONNEL (compteRenduManquant absent) n’a pas de section', () => {
    const personnelle = seance({ date: '2026-08-01' });
    delete personnelle.compteRenduManquant;
    expect(sectionIdFor(personnelle, TODAY)).toBe(null);
  });

  it('les trois couches de disponibilité ne produisent AUCUNE ligne d’agenda', () => {
    for (const type of [
      'mes-disponibilites',
      'mes-indisponibilites',
      'disponibilite-groupe',
    ] as const) {
      expect(sectionIdFor({ key: 'k', type, date: TODAY, label: 'x' }, TODAY)).toBe(null);
    }
  });
});

describe('badgeFor (AC4, AC8, AC11)', () => {
  it('AC4 — un vote sans ma réponse appelle une action, avec ma réponse il informe', () => {
    expect(badgeFor(vote(), TODAY)).toMatchObject({ kind: 'answer-poll', tone: 'todo' });
    expect(badgeFor(vote({ vote: { ...vote().vote!, myAnswer: 'NO' } }), TODAY)).toMatchObject({
      kind: 'poll-open',
      tone: 'live',
    });
  });

  it('une inscription ouverte dit s’il reste quelque chose à faire', () => {
    expect(badgeFor(inscription(), TODAY)).toMatchObject({ kind: 'signup', tone: 'todo' });
    expect(badgeFor(inscription({ jeSuisInscrit: true }), TODAY)).toMatchObject({
      kind: 'signed-up',
      tone: 'live',
    });
  });

  it('AC11 — une séance programmée porte son imminence en trois intensités, une seule teinte', () => {
    expect(badgeFor(seance({ date: '2026-09-05' }), TODAY)).toMatchObject({
      kind: 'imminence',
      tone: 'soon',
      intensity: 'far',
    });
    expect(badgeFor(seance({ date: '2026-08-29' }), TODAY)).toMatchObject({
      tone: 'soon',
      intensity: 'near',
    });
    expect(badgeFor(seance({ date: '2026-08-24' }), TODAY)).toMatchObject({
      tone: 'soon',
      intensity: 'near',
    });
    expect(badgeFor(seance({ date: '2026-08-23' }), TODAY)).toMatchObject({
      tone: 'soon',
      intensity: 'imminent',
      text: 'demain soir',
    });
    expect(badgeFor(seance(), TODAY)).toMatchObject({
      tone: 'soon',
      intensity: 'imminent',
      text: 'ce soir',
    });
  });

  it('une séance passée sans compte-rendu appelle le débrief', () => {
    expect(
      badgeFor(seance({ date: '2026-08-01', compteRenduManquant: true }), TODAY),
    ).toMatchObject({ kind: 'debrief', tone: 'done' });
  });

  it('une entrée sans section n’a pas de badge', () => {
    expect(badgeFor({ key: 'k', type: 'mes-disponibilites', date: TODAY, label: 'x' }, TODAY)).toBe(
      null,
    );
  });
});

// ─── Story 36.12 — le regroupement par vote, la maturité, la faveur ─────────

/** Une option de vote, avec ses agrégats — la brique de tous les tests de groupe. */
function option(over: Partial<AgendaEntry> & { o?: Partial<VoteParticipation> } = {}): AgendaEntry {
  const { o, ...entryOver } = over;
  return vote({
    ...entryOver,
    vote: {
      partieId: 'p1',
      pollId: 'poll1',
      optionId: 'o1',
      yes: 0,
      maybe: 0,
      no: 0,
      total: 4,
      myAnswer: null,
      ...o,
    },
  });
}

describe('groupVoteEntries', () => {
  it('rend UNE ligne par vote, quel que soit le nombre d’options (AC7)', () => {
    const entries = [
      option({ key: 'a', date: '2026-08-28', o: { optionId: 'o1' } }),
      option({ key: 'b', date: '2026-08-29', o: { optionId: 'o2' } }),
      option({ key: 'c', date: '2026-08-30', o: { optionId: 'o3' } }),
    ];
    const { groups, ungrouped } = groupVoteEntries(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(3);
    expect(ungrouped).toHaveLength(0);
  });

  it('sépare deux votes entrelacés, sans les mélanger', () => {
    const entries = [
      option({ key: 'a', date: '2026-08-28', o: { pollId: 'A', optionId: 'a1' } }),
      option({ key: 'b', date: '2026-08-29', o: { pollId: 'B', optionId: 'b1' } }),
      option({ key: 'c', date: '2026-08-30', o: { pollId: 'A', optionId: 'a2' } }),
    ];
    const { groups } = groupVoteEntries(entries);
    expect(groups.map((g) => g.pollId)).toEqual(['A', 'B']);
    expect(groups[0].options).toHaveLength(2);
    expect(groups[1].options).toHaveLength(1);
  });

  it('ne PERD pas une entrée de vote dépourvue d’agrégats (API dégradée)', () => {
    const orphan = vote({ key: 'orphelin', vote: undefined });
    const { groups, ungrouped } = groupVoteEntries([orphan, option({ key: 'a' })]);
    expect(groups).toHaveLength(1);
    expect(ungrouped).toEqual([orphan]);
  });

  it('retient la date la PLUS PROCHE du vote, pas celle de la première option', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'a', date: '2026-09-15', o: { optionId: 'o1' } }),
      option({ key: 'b', date: '2026-08-25', o: { optionId: 'o2' } }),
    ]);
    expect(groups[0].nearestDate).toBe('2026-08-25');
  });

  it('compte les répondants au MINIMUM des options, jamais à la somme', () => {
    // 3 personnes sur le vendredi, 1 seule sur le samedi ⇒ 1 personne a répondu au VOTE.
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', yes: 3 } }),
      option({ key: 'b', o: { optionId: 'o2', yes: 1 } }),
    ]);
    expect(groups[0].respondedCount).toBe(1);
  });
});

describe('isPollMature (Q-25)', () => {
  it('critère A — tout le monde a répondu à TOUTES les options', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', yes: 2, no: 2 } }),
      option({ key: 'b', o: { optionId: 'o2', yes: 4 } }),
    ]);
    expect(groups[0].mature).toBe(true);
  });

  it('critère A — une seule option incomplète suffit à rendre le vote NON mûr', () => {
    // 🚨 Le premier créneau est complet mais SANS majorité (1 oui sur 4) : sans cette précaution
    // le critère B rendrait le vote mûr et le test ne prouverait plus rien sur le critère A.
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', yes: 1, maybe: 1, no: 2 } }),
      option({ key: 'b', o: { optionId: 'o2', yes: 1 } }),
    ]);
    expect(groups[0].respondedCount).toBe(1);
    expect(groups[0].mature).toBe(false);
  });

  it('critère B — la majorité ABSOLUE, pas la majorité relative', () => {
    // 2 oui sur 4 = la moitié, pas la majorité absolue.
    const half = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', yes: 2 } }),
      option({ key: 'b', o: { optionId: 'o2', yes: 0 } }),
    ]).groups[0];
    expect(half.mature).toBe(false);

    // 3 oui sur 4 franchissent le seuil, même si personne d’autre n’a répondu ailleurs.
    const majority = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', yes: 3 } }),
      option({ key: 'b', o: { optionId: 'o2', yes: 0 } }),
    ]).groups[0];
    expect(majority.mature).toBe(true);
  });

  it('un effectif NUL n’est jamais mûr — sinon 0 >= 0 déplierait tout', () => {
    const { groups } = groupVoteEntries([option({ key: 'a', o: { total: 0 } })]);
    expect(groups[0].mature).toBe(false);
  });

  it('un effectif non numérique (API en retard) n’est jamais mûr', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { total: undefined as unknown as number } }),
    ]);
    expect(groups[0].mature).toBe(false);
  });
});

describe('l’ordre par faveur (AC1, AC4)', () => {
  it('trie par oui décroissant, puis peut-être, puis la date', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'c', date: '2026-08-30', o: { optionId: 'o3', yes: 1, maybe: 0 } }),
      option({ key: 'a', date: '2026-08-28', o: { optionId: 'o1', yes: 3 } }),
      option({ key: 'b', date: '2026-08-29', o: { optionId: 'o2', yes: 1, maybe: 2 } }),
    ]);
    expect(groups[0].options.map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('départage deux options identiques par la date, de façon stable', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'tard', date: '2026-09-02', o: { optionId: 'o2', yes: 2 } }),
      option({ key: 'tot', date: '2026-08-25', o: { optionId: 'o1', yes: 2 } }),
    ]);
    expect(groups[0].options.map((e) => e.key)).toEqual(['tot', 'tard']);
  });
});

describe('hasAnsweredAll (AC15)', () => {
  it('avoir répondu à une option sur deux, ce n’est pas avoir répondu au vote', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', myAnswer: 'YES' } }),
      option({ key: 'b', o: { optionId: 'o2', myAnswer: null } }),
    ]);
    expect(groups[0].answeredAll).toBe(false);
  });

  it('avoir répondu partout, c’est avoir répondu au vote', () => {
    const { groups } = groupVoteEntries([
      option({ key: 'a', o: { optionId: 'o1', myAnswer: 'YES' } }),
      option({ key: 'b', o: { optionId: 'o2', myAnswer: 'NO' } }),
    ]);
    expect(groups[0].answeredAll).toBe(true);
  });
});

describe('pollGroupBadge (AC15)', () => {
  function group(over: Partial<VoteParticipation>[], keys = ['a', 'b']) {
    return groupVoteEntries(
      over.map((o, i) => option({ key: keys[i], o: { optionId: `o${i}`, ...o } })),
    ).groups[0];
  }

  it('MJ + vote mûr → « À sceller »', () => {
    expect(pollGroupBadge(group([{ yes: 4 }, { yes: 4 }]), true)).toMatchObject({
      kind: 'to-seal',
      tone: 'todo',
    });
  });

  it('vote mûr mais lecteur sans pouvoir de scellement → libellés de la 36.11', () => {
    expect(pollGroupBadge(group([{ yes: 4 }, { yes: 4 }]), false)).toMatchObject({
      kind: 'answer-poll',
      tone: 'todo',
    });
  });

  it('MJ + vote NON mûr → « Réponds au vote », jamais « À sceller »', () => {
    expect(pollGroupBadge(group([{ yes: 1 }, { yes: 0 }]), true)).toMatchObject({
      kind: 'answer-poll',
      tone: 'todo',
    });
  });

  it('j’ai répondu partout → « Vote en cours »', () => {
    expect(
      pollGroupBadge(group([{ myAnswer: 'YES' }, { myAnswer: 'MAYBE' }]), false),
    ).toMatchObject({ kind: 'poll-open', tone: 'live' });
  });
});

describe('sectionIdFor — la séance sans date proposée (AC5)', () => {
  it('range la séance sans date dans « Ça t’attend »', () => {
    expect(
      sectionIdFor(
        { key: 'sd-1', type: 'seances-sans-date', date: '', label: 'Le Convoi du Nord' },
        TODAY,
      ),
    ).toBe('awaiting');
  });

  it('ne lui donne AUCUN badge — sa ligne porte une action, pas un état', () => {
    expect(badgeFor({ key: 'sd-1', type: 'seances-sans-date', date: '', label: 'x' }, TODAY)).toBe(
      null,
    );
  });
});
