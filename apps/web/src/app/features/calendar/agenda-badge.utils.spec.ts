import { describe, expect, it } from 'vitest';
import type { AgendaEntry } from './calendar-agenda-view/calendar-agenda-view';
import {
  addDaysToKey,
  badgeFor,
  daysBetweenKeys,
  imminenceLabel,
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
