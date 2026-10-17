import type { EventCardDto } from '@master-jdr/shared';
import { TONE_MAP } from '../../core/theme/tones';
import {
  eventBadge,
  eventDateLabel,
  eventSituation,
  eventSituationTextKey,
  frUnit,
  initialsOf,
  isHostOf,
  isParticipantOf,
  participationLine,
  isImminentEvent,
  isPastEvent,
  splitEvents,
} from './event-card.util';

const TONE = TONE_MAP['grimoire-emeraude'];
const TODAY = '2026-10-17';

const card = (id: string, date: string | null, over: Partial<EventCardDto> = {}): EventCardDto => ({
  id,
  title: id,
  hostId: 'hote',
  hostDisplayName: 'Léa',
  seance: {
    id: `s-${id}`,
    date,
    slot: date ? 'EVENING' : null,
    lieu: null,
    heureRdv: null,
    notePratique: null,
    capacity: null,
  },
  participants: [],
  ...over,
});

describe('event-card.util (Story 40.1)', () => {
  it('passée = jour AVANT aujourd’hui ; aujourd’hui et sans date restent à venir', () => {
    expect(isPastEvent(card('hier', '2026-10-16'), TODAY)).toBe(true);
    expect(isPastEvent(card('auj', TODAY), TODAY)).toBe(false);
    expect(isPastEvent(card('sans', null), TODAY)).toBe(false);
  });

  it('badge : « Passé » (done), « À venir » au-delà d’une semaine ou sans date', () => {
    expect(eventBadge(card('hier', '2026-10-16'), TODAY, TONE)).toEqual({
      tone: 'done',
      labelKey: 'status.scenario_passe',
      draft: false,
    });
    for (const c of [card('loin', '2026-11-30'), card('sans', null)]) {
      expect(eventBadge(c, TODAY, TONE)).toEqual({
        tone: 'soon',
        labelKey: 'status.scenario_a_venir',
        draft: false,
      });
    }
  });

  it('badge : « Dans n jours » dans la semaine (near), PLEIN au palier imminent (aujourd’hui / demain)', () => {
    expect(eventBadge(card('d3', '2026-10-20'), TODAY, TONE)).toEqual(
      expect.objectContaining({ tone: 'soon', intensity: 'near', text: 'Dans 3 jours' }),
    );
    expect(eventBadge(card('d1', '2026-10-18'), TODAY, TONE)).toEqual(
      expect.objectContaining({ intensity: 'imminent', text: 'Demain' }),
    );
    expect(eventBadge(card('d0', TODAY), TODAY, TONE)).toEqual(
      expect.objectContaining({ intensity: 'imminent', text: 'Aujourd’hui' }),
    );
    expect(isImminentEvent(card('d1', '2026-10-18'), TODAY)).toBe(true);
    expect(isImminentEvent(card('d3', '2026-10-20'), TODAY)).toBe(false);
    expect(isImminentEvent(card('hier', '2026-10-16'), TODAY)).toBe(false);
  });

  it('date en gras : « Sam. 10 oct. · soir » ; sans date : « Date à fixer »', () => {
    expect(eventDateLabel(card('a', '2026-10-10'), TONE)).toBe('Sam. 10 oct. · soir');
    expect(
      eventDateLabel(card('b', '2026-10-25', { seance: { ...card('b', '2026-10-25').seance!, slot: 'AFTERNOON' } }), TONE),
    ).toBe('Dim. 25 oct. · après-midi');
    expect(eventDateLabel(card('c', null), TONE)).toBe(TONE['partie.ralliement_event_no_date']);
  });

  it('situation : l’hôte participe (« J’y étais » une fois passée), les autres ne sont pas inscrits (pointillés)', () => {
    expect(eventSituation(card('f', '2026-10-20'), 'hote', TODAY)).toEqual({
      labelKey: 'partie.ralliement_event_chip_participating',
      dotted: false,
    });
    expect(eventSituation(card('p', '2026-10-01'), 'hote', TODAY)).toEqual({
      labelKey: 'partie.ralliement_event_chip_was_there',
      dotted: false,
    });
    expect(eventSituation(card('f', '2026-10-20'), 'autre', TODAY)).toEqual({
      labelKey: 'partie.ralliement_event_chip_not_registered',
      dotted: true,
    });
    expect(eventSituation(card('f', '2026-10-20'), null, TODAY).dotted).toBe(true);
  });

  it('sections : à venir par date croissante (sans date en dernier), passées de la plus récente à la plus ancienne', () => {
    const { upcoming, past } = splitEvents(
      [
        card('sans', null),
        card('loin', '2026-12-01'),
        card('vieux', '2026-09-01'),
        card('auj', TODAY),
        card('recent', '2026-10-15'),
      ],
      TODAY,
    );
    expect(upcoming.map((c) => c.id)).toEqual(['auj', 'loin', 'sans']);
    expect(past.map((c) => c.id)).toEqual(['recent', 'vieux']);
  });

  it('même jour : tri par créneau (matin < après-midi < soir) ; passées dans l’ordre inverse de la clé complète', () => {
    const at = (id: string, date: string, slot: 'MORNING' | 'AFTERNOON' | 'EVENING') =>
      card(id, date, { seance: { ...card(id, date).seance!, slot } });
    const { upcoming, past } = splitEvents(
      [
        at('f-soir', '2026-10-20', 'EVENING'),
        at('f-matin', '2026-10-20', 'MORNING'),
        at('f-aprem', '2026-10-20', 'AFTERNOON'),
        at('p-matin', '2026-10-10', 'MORNING'),
        at('p-soir', '2026-10-10', 'EVENING'),
      ],
      TODAY,
    );
    expect(upcoming.map((c) => c.id)).toEqual(['f-matin', 'f-aprem', 'f-soir']);
    expect(past.map((c) => c.id)).toEqual(['p-soir', 'p-matin']);
  });

  describe('Story 40.2', () => {
    const withPeople = (capacity: number | null, n: number) =>
      card('x', '2026-10-20', {
        seance: { ...card('x', '2026-10-20').seance!, capacity },
        participants: Array.from({ length: n }, (_, k) => ({
          userId: k === 0 ? 'hote' : `u${k}`,
          displayName: `P${k}`,
          isHost: k === 0,
          isAdmin: false,
        })),
      });

    it('hôte et participants : « participe », les autres non', () => {
      const c = withPeople(8, 3);
      expect(isHostOf(c, 'hote')).toBe(true);
      expect(isHostOf(c, 'u1')).toBe(false);
      expect(isParticipantOf(c, 'u1')).toBe(true);
      expect(isParticipantOf(c, 'étranger')).toBe(false);
      expect(isParticipantOf(c, null)).toBe(false);
      expect(eventSituation(c, 'u1', TODAY)).toEqual({
        labelKey: 'partie.ralliement_event_chip_participating',
        dotted: false,
      });
    });

    it('texte du panneau de situation : hôte / inscrit / non inscrit, au présent ou à l’imparfait', () => {
      const futur = withPeople(8, 2);
      const passe = card('p', '2026-10-01', { participants: futur.participants });
      expect(eventSituationTextKey(futur, 'hote', TODAY)).toBe('partie.ralliement_event_situation_host');
      expect(eventSituationTextKey(futur, 'u1', TODAY)).toBe('partie.ralliement_event_situation_registered');
      expect(eventSituationTextKey(futur, 'x', TODAY)).toBe('partie.ralliement_event_situation_none');
      expect(eventSituationTextKey(passe, 'hote', TODAY)).toBe('partie.ralliement_event_situation_host_past');
      expect(eventSituationTextKey(passe, 'u1', TODAY)).toBe('partie.ralliement_event_situation_registered_past');
      expect(eventSituationTextKey(passe, 'x', TODAY)).toBe('partie.ralliement_event_situation_none_past');
    });

    it('participation : « 8 places · 5 inscrits · 3 libres » (l’hôte compte), accords du français, « Tous les membres »', () => {
      expect(participationLine(withPeople(8, 5), TONE)).toBe('8 places · 5 inscrits · 3 libres');
      expect(participationLine(withPeople(2, 1), TONE)).toBe('2 places · 1 inscrit · 1 libre');
      expect(participationLine(withPeople(3, 3), TONE)).toBe('3 places · 3 inscrits · 0 libre');
      expect(participationLine(withPeople(null, 4), TONE)).toBe('Tous les membres');
      expect(frUnit('place|places', 0)).toBe('0 place');
      expect(frUnit('place|places', 2)).toBe('2 places');
    });

    it('initiales : une ou deux lettres, majuscules', () => {
      expect(initialsOf('Hélène Hôte')).toBe('HH');
      expect(initialsOf('  léa ')).toBe('L');
      expect(initialsOf('Jean de la Fontaine')).toBe('JF');
      expect(initialsOf('')).toBe('?');
    });
  });
});
