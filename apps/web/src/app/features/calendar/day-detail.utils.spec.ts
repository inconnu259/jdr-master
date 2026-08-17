import { describe, expect, it } from 'vitest';
import type { AvailabilityDeclarationDto, CalendarLayerKey } from '@master-jdr/shared';
import type { AgendaEntry } from './calendar-agenda-view/calendar-agenda-view';
import {
  RAIL_SLOTS,
  SLOT_PRECEDENCE,
  bandsAreUniform,
  buildDayDetail,
  buildMonthDetails,
  dateKeyToUtcMidnight,
  nextMeaningfulDate,
  toDateKey,
} from './day-detail.utils';

const ALL_LAYERS: CalendarLayerKey[] = [
  'mes-indisponibilites',
  'mes-disponibilites',
  'mes-seances',
  'votes-en-cours',
  'inscriptions-ouvertes',
  'disponibilite-groupe',
];

const NOW = new Date('2026-08-17T00:00:00Z');

function decl(over: Partial<AvailabilityDeclarationDto> = {}): AvailabilityDeclarationDto {
  return {
    id: 'd1',
    userId: 'u1',
    kind: 'AVAILABLE',
    recurKind: 'PUNCTUAL',
    dayOfWeek: null,
    slot: 'FULL_DAY',
    startDate: '2026-08-20T00:00:00.000Z',
    endDate: '2026-08-20T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function seanceEntry(over: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    key: 'seance-s1',
    type: 'mes-seances',
    date: '2026-08-20',
    label: 'Le Convoi du Nord',
    slot: 'EVENING',
    partieId: 'p1',
    scenarioId: 'sc1',
    seanceId: 's1',
    ...over,
  };
}

describe('buildDayDetail — les trois créneaux', () => {
  it('rend toujours trois créneaux, dans l’ordre matin → après-midi → soir', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);

    expect(detail.slots).toHaveLength(3);
    expect(detail.slots.map((s) => s.slot)).toEqual(['MORNING', 'AFTERNOON', 'EVENING']);
    expect(detail.slots.map((s) => s.label)).toEqual(['Matin', 'Après-midi', 'Soir']);
  });

  it('rend les trois créneaux même quand un seul porte un objet — « Matin » ne disparaît jamais', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [], NOW);

    expect(detail.slots).toHaveLength(3);
    expect(detail.slots[0].slot).toBe('MORNING');
    expect(detail.slots[0].seanceLabel).toBeNull();
    expect(detail.slots[2].seanceLabel).toBe('Le Convoi du Nord');
  });

  it('marque un jour sans rien comme vide (AC4)', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);

    expect(detail.isEmpty).toBe(true);
    expect(detail.slots.every((s) => s.status === 'UNKNOWN')).toBe(true);
  });

  it('ne marque pas comme vide un jour portant seulement une déclaration', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [decl()], NOW);

    expect(detail.isEmpty).toBe(false);
    expect(detail.slots.every((s) => s.status === 'AVAILABLE')).toBe(true);
  });

  it('ignore les entrées d’un autre jour', () => {
    const detail = buildDayDetail(
      '2026-08-21',
      [seanceEntry({ date: '2026-08-20' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots.every((s) => s.seanceLabel === null)).toBe(true);
    expect(detail.isEmpty).toBe(true);
  });
});

describe('buildDayDetail — FULL_DAY et créneau absent', () => {
  it('applique une séance FULL_DAY aux trois créneaux', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry({ slot: 'FULL_DAY' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots.map((s) => s.seanceLabel)).toEqual([
      'Le Convoi du Nord',
      'Le Convoi du Nord',
      'Le Convoi du Nord',
    ]);
  });

  it('traite un créneau absent comme FULL_DAY', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry({ slot: undefined })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots.every((s) => s.seanceLabel === 'Le Convoi du Nord')).toBe(true);
  });
});

describe('buildDayDetail — AC6 : la couche gouverne le texte, jamais l’indisponibilité', () => {
  it('nomme la séance et rend le créneau indisponible quand la couche est allumée', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [], NOW);

    expect(detail.slots[2].seanceLabel).toBe('Le Convoi du Nord');
    expect(detail.slots[2].status).toBe('UNAVAILABLE');
  });

  it('retire le TEXTE mais conserve l’indisponibilité quand la couche est éteinte', () => {
    const sansSeances = ALL_LAYERS.filter((l) => l !== 'mes-seances');
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], sansSeances, [], NOW);

    expect(detail.slots[2].seanceLabel).toBeNull();
    expect(detail.slots[2].status).toBe('UNAVAILABLE');
  });

  it('l’indisponibilité d’une séance écrase une déclaration « disponible »', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [decl()], NOW);

    expect(detail.slots[0].status).toBe('AVAILABLE');
    expect(detail.slots[2].status).toBe('UNAVAILABLE');
  });

  it('masque le libellé d’un vote quand la couche « votes-en-cours » est éteinte', () => {
    const poll: AgendaEntry = {
      key: 'poll-1',
      type: 'votes-en-cours',
      date: '2026-08-20',
      label: 'Les Cendres d’Ashal',
      slot: 'MORNING',
    };
    const sansVotes = ALL_LAYERS.filter((l) => l !== 'votes-en-cours');

    expect(buildDayDetail('2026-08-20', [poll], ALL_LAYERS, [], NOW).slots[0].pollLabel).toBe(
      'Les Cendres d’Ashal',
    );
    expect(buildDayDetail('2026-08-20', [poll], sansVotes, [], NOW).slots[0].pollLabel).toBeNull();
  });

  it('revue de code (2026-08-18) : le rang « vote » retombe sur le statut déclaré quand la couche « votes-en-cours » est éteinte', () => {
    const poll: AgendaEntry = {
      key: 'poll-1',
      type: 'votes-en-cours',
      date: '2026-08-20',
      label: 'Les Cendres d’Ashal',
      slot: 'MORNING',
    };
    const sansVotes = ALL_LAYERS.filter((l) => l !== 'votes-en-cours');

    expect(buildDayDetail('2026-08-20', [poll], ALL_LAYERS, [], NOW).slots[0].winner).toBe('vote');
    // Couche éteinte, aucune déclaration : retombe sur « none », pas « vote ».
    expect(buildDayDetail('2026-08-20', [poll], sansVotes, [], NOW).slots[0].winner).toBe('none');
    // Couche éteinte, avec une disponibilité déclarée : retombe sur « available ».
    expect(buildDayDetail('2026-08-20', [poll], sansVotes, [decl()], NOW).slots[0].winner).toBe(
      'available',
    );
  });
});

describe('buildDayDetail — doublon sur le même jour/créneau', () => {
  it('signale un « +1 autre » quand deux séances portent le même jour/créneau, sans les perdre', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry(), seanceEntry({ key: 'seance-s2', label: 'Autre table', scenarioId: 'sc2' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots[2].seanceLabel).toBe('Le Convoi du Nord (+1 autre)');
  });

  it('signale un « +1 autre » quand deux votes portent le même jour/créneau', () => {
    const poll1: AgendaEntry = {
      key: 'poll-1',
      type: 'votes-en-cours',
      date: '2026-08-20',
      label: 'Les Cendres d’Ashal',
      slot: 'MORNING',
    };
    const poll2: AgendaEntry = { ...poll1, key: 'poll-2', label: 'Autre vote' };

    const detail = buildDayDetail('2026-08-20', [poll1, poll2], ALL_LAYERS, [], NOW);

    expect(detail.slots[0].pollLabel).toBe('Les Cendres d’Ashal (+1 autre)');
  });

  it('ne signale rien quand une seule séance porte le jour/créneau', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [], NOW);

    expect(detail.slots[2].seanceLabel).toBe('Le Convoi du Nord');
  });
});

describe('buildDayDetail — AC11 / AC7 : cible de navigation', () => {
  it('expose la cible du scénario quand la séance est nommée', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [], NOW);

    expect(detail.slots[2].seanceTarget).toEqual({ partieId: 'p1', scenarioId: 'sc1' });
  });

  it('n’expose aucune cible quand la couche est éteinte — pas d’affordance sur une ligne muette', () => {
    const sansSeances = ALL_LAYERS.filter((l) => l !== 'mes-seances');
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], sansSeances, [], NOW);

    expect(detail.slots[2].seanceTarget).toBeNull();
  });

  it('n’expose aucune cible quand l’entrée ne porte pas d’identifiants (AC7)', () => {
    const anonyme = seanceEntry({ partieId: undefined, scenarioId: undefined });
    const detail = buildDayDetail('2026-08-20', [anonyme], ALL_LAYERS, [], NOW);

    expect(detail.slots[2].seanceLabel).toBe('Le Convoi du Nord');
    expect(detail.slots[2].seanceTarget).toBeNull();
  });

  it('n’expose jamais de cible sur un créneau sans séance', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [decl()], NOW);

    expect(detail.slots.every((s) => s.seanceTarget === null)).toBe(true);
  });
});

describe('nextMeaningfulDate — AC3', () => {
  const entries: AgendaEntry[] = [
    seanceEntry({ key: 'a', date: '2026-08-25' }),
    { key: 'b', type: 'votes-en-cours', date: '2026-08-22', label: 'Vote' },
    { key: 'c', type: 'mes-disponibilites', date: '2026-08-18', label: 'Ponctuel' },
  ];

  it('retient le plus proche jour porteur à partir d’aujourd’hui', () => {
    expect(nextMeaningfulDate(entries, '2026-08-17')).toBe('2026-08-22');
  });

  it('ne compte pas une déclaration de disponibilité comme « quelque chose »', () => {
    const declsOnly: AgendaEntry[] = [
      { key: 'c', type: 'mes-disponibilites', date: '2026-08-18', label: 'Ponctuel' },
      { key: 'd', type: 'mes-indisponibilites', date: '2026-08-19', label: 'Ponctuel' },
    ];

    expect(nextMeaningfulDate(declsOnly, '2026-08-17')).toBeNull();
  });

  it('ne compte pas la tendance du groupe', () => {
    const groupe: AgendaEntry[] = [
      { key: 'g', type: 'disponibilite-groupe', date: '2026-08-18', label: '2/4 disponibles' },
    ];

    expect(nextMeaningfulDate(groupe, '2026-08-17')).toBeNull();
  });

  it('ignore les jours passés', () => {
    expect(nextMeaningfulDate(entries, '2026-08-23')).toBe('2026-08-25');
    expect(nextMeaningfulDate(entries, '2026-08-26')).toBeNull();
  });

  it('ignore les entrées sans date propre (inscriptions ouvertes)', () => {
    const sansDate: AgendaEntry[] = [
      { key: 'i', type: 'inscriptions-ouvertes', date: '', label: 'Partie — Scénario' },
    ];

    expect(nextMeaningfulDate(sansDate, '2026-08-17')).toBeNull();
  });

  it('retourne null sur une liste vide', () => {
    expect(nextMeaningfulDate([], '2026-08-17')).toBeNull();
  });
});

describe('conversions de dates', () => {
  it('convertit une clé de jour en minuit UTC', () => {
    const d = dateKeyToUtcMidnight('2026-08-20');

    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(20);
    expect(d.getUTCHours()).toBe(0);
  });

  it('produit une clé locale à zéros de tête', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('fait l’aller-retour sur une date locale', () => {
    expect(toDateKey(new Date(2026, 7, 20))).toBe('2026-08-20');
  });
});

describe('RAIL_SLOTS', () => {
  it('porte les trois créneaux et leurs abréviations', () => {
    expect(RAIL_SLOTS).toHaveLength(3);
    expect(RAIL_SLOTS.map((r) => r.shortLabel)).toEqual(['Matin', 'Après-m.', 'Soir']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story 36.2 — la préséance dans un créneau
// ─────────────────────────────────────────────────────────────────────────────

function pollEntry(over: Partial<AgendaEntry> = {}): AgendaEntry {
  return {
    key: 'poll-p1',
    type: 'votes-en-cours',
    date: '2026-08-20',
    label: 'Les Cendres d’Ashal',
    slot: 'EVENING',
    ...over,
  };
}

describe('SLOT_PRECEDENCE — l’ordre est écrit une fois', () => {
  it('porte les quatre rangs, dans l’ordre de FR-49', () => {
    expect([...SLOT_PRECEDENCE]).toEqual(['seance', 'vote', 'unavailable', 'available']);
  });

  it('n’inclut pas « non déclaré » — ce n’est pas un rang', () => {
    expect(SLOT_PRECEDENCE).not.toContain('none');
  });

  it('n’inclut pas la disponibilité du groupe — sortie de la préséance (FR-53)', () => {
    expect(SLOT_PRECEDENCE.some((r) => String(r).includes('groupe'))).toBe(false);
  });
});

describe('buildDayDetail — le rang gagnant', () => {
  it('une séance gagne sur tout le reste', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry(), pollEntry()],
      ALL_LAYERS,
      [decl()],
      NOW,
    );

    expect(detail.slots[2].winner).toBe('seance');
  });

  it('un vote gagne sur une déclaration', () => {
    const detail = buildDayDetail('2026-08-20', [pollEntry()], ALL_LAYERS, [decl()], NOW);

    expect(detail.slots[2].winner).toBe('vote');
  });

  it('une indisponibilité gagne sur rien', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [],
      ALL_LAYERS,
      [decl({ kind: 'UNAVAILABLE' })],
      NOW,
    );

    expect(detail.slots.map((s) => s.winner)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
  });

  it('une disponibilité déclarée donne « available »', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [decl()], NOW);

    expect(detail.slots.every((s) => s.winner === 'available')).toBe(true);
  });

  it('un créneau sans rien donne « none »', () => {
    const detail = buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW);

    expect(detail.slots.every((s) => s.winner === 'none')).toBe(true);
  });

  it('l’arbitrage est BANDE PAR BANDE, jamais à la journée (AC2)', () => {
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [decl()], NOW);

    expect(detail.slots.map((s) => s.winner)).toEqual(['available', 'available', 'seance']);
  });

  it('une séance sans créneau (FULL_DAY) occupe les trois bandes (AC11 / AD-9)', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry({ slot: 'FULL_DAY' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots.every((s) => s.winner === 'seance')).toBe(true);
  });

  it('la couche éteinte retire le TEXTE mais pas le rang ni l’indisponibilité (AC6)', () => {
    const sansSeances = ALL_LAYERS.filter((l) => l !== 'mes-seances');
    const detail = buildDayDetail('2026-08-20', [seanceEntry()], sansSeances, [], NOW);

    expect(detail.slots[2].winner).toBe('seance');
    expect(detail.slots[2].seanceLabel).toBeNull();
    expect(detail.slots[2].status).toBe('UNAVAILABLE');
  });
});

describe('bandsAreUniform — la fusion des trois bandes (AC4)', () => {
  it('fusionne un jour entièrement disponible', () => {
    expect(bandsAreUniform(buildDayDetail('2026-08-20', [], ALL_LAYERS, [decl()], NOW))).toBe(true);
  });

  it('fusionne un jour entièrement vierge', () => {
    expect(bandsAreUniform(buildDayDetail('2026-08-20', [], ALL_LAYERS, [], NOW))).toBe(true);
  });

  it('ne fusionne pas quand un créneau diffère', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [],
      ALL_LAYERS,
      [decl({ slot: 'MORNING', kind: 'UNAVAILABLE' })],
      NOW,
    );

    expect(bandsAreUniform(detail)).toBe(false);
  });

  it('ne fusionne JAMAIS quand un événement est posé, même sur les trois créneaux', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [seanceEntry({ slot: 'FULL_DAY' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(detail.slots.every((s) => s.winner === 'seance')).toBe(true);
    expect(bandsAreUniform(detail)).toBe(false);
  });

  it('ne fusionne pas un jour couvert par un vote sur les trois créneaux', () => {
    const detail = buildDayDetail(
      '2026-08-20',
      [pollEntry({ slot: 'FULL_DAY' })],
      ALL_LAYERS,
      [],
      NOW,
    );

    expect(bandsAreUniform(detail)).toBe(false);
  });
});

describe('buildMonthDetails — la projection du mois', () => {
  it('rend une entrée par jour demandé', () => {
    const keys = ['2026-08-19', '2026-08-20', '2026-08-21'];
    const map = buildMonthDetails(keys, [seanceEntry()], ALL_LAYERS, [], NOW);

    expect([...map.keys()]).toEqual(keys);
    expect(map.get('2026-08-20')!.slots[2].winner).toBe('seance');
    expect(map.get('2026-08-19')!.isEmpty).toBe(true);
  });

  it('produit exactement le même détail que buildDayDetail pour un jour donné', () => {
    const direct = buildDayDetail('2026-08-20', [seanceEntry()], ALL_LAYERS, [decl()], NOW);
    const viaMonth = buildMonthDetails(['2026-08-20'], [seanceEntry()], ALL_LAYERS, [decl()], NOW);

    expect(viaMonth.get('2026-08-20')).toEqual(direct);
  });

  it('supporte une grille de 42 jours', () => {
    const keys = Array.from(
      { length: 42 },
      (_, i) => `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    );
    const map = buildMonthDetails(keys, [], ALL_LAYERS, [], NOW);

    expect(map.size).toBeGreaterThan(0);
    for (const detail of map.values()) expect(detail.slots).toHaveLength(3);
  });
});
