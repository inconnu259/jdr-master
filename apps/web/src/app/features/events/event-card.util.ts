import type { DaySlot, EventCardDto } from '@master-jdr/shared';
import type { StatusBadgeState } from '../../core/status/status-derivation';
import { daysBetweenKeys, imminenceIntensity } from '../../core/status/status-badge.model';
import { fillTone } from '../../core/theme/tone-format';
import { SLOT_LABELS } from '../calendar/agenda-badge.utils';

/**
 * Story 40.1 — dérivations PURES de la carte d'une conjonction (testables sans TestBed). Le jour de
 * l'événement est la clé `YYYY-MM-DD` servie par l'API ; « aujourd'hui » est une clé de jour figée
 * par l'écran (même convention que `CalendarView.todayKey` / `PartieDetail.todayKey`).
 */

/** Textes de registre dont la carte a besoin (sous-ensemble de `theme.tone()`). */
export type EventTone = Readonly<Record<string, string>>;

/** Jour de la conjonction, ou `null` tant qu'il n'est pas fixé. */
export function eventDayKey(card: EventCardDto): string | null {
  return card.seance?.date ?? null;
}

/** Passée : son jour est AVANT aujourd'hui (aujourd'hui reste « À venir »). Sans date : à venir. */
export function isPastEvent(card: EventCardDto, todayKey: string): boolean {
  const day = eventDayKey(card);
  return day !== null && day < todayKey;
}

/** Imminente : à venir et au palier `imminent` (aujourd'hui ou demain) de `imminenceIntensity`. */
export function isImminentEvent(card: EventCardDto, todayKey: string): boolean {
  const day = eventDayKey(card);
  return day !== null && day >= todayKey && imminenceIntensity(day, todayKey) === 'imminent';
}

/**
 * Badge d'état (UX-DR7) : « Passé » (teinte `done`) ; « Dans *n* jours » dans la semaine qui vient
 * (teinte `soon`, intensité `near`, PLEIN au palier `imminent` — « Aujourd'hui » / « Demain ») ;
 * « À venir » au-delà ou sans date. Le libellé est toujours écrit : la teinte le double.
 */
export function eventBadge(card: EventCardDto, todayKey: string, tone: EventTone): StatusBadgeState {
  if (isPastEvent(card, todayKey)) {
    return { tone: 'done', labelKey: 'status.scenario_passe', draft: false };
  }
  const day = eventDayKey(card);
  const upcoming: StatusBadgeState = {
    tone: 'soon',
    labelKey: 'status.scenario_a_venir',
    draft: false,
  };
  if (day === null) return upcoming;
  const intensity = imminenceIntensity(day, todayKey);
  if (intensity === 'far') return upcoming;
  const days = daysBetweenKeys(todayKey, day);
  const text =
    days <= 0
      ? tone['partie.ralliement_event_badge_today']
      : days === 1
        ? tone['partie.ralliement_event_badge_tomorrow']
        : fillTone(tone['partie.ralliement_event_badge_in_days'], { n: days });
  return { ...upcoming, intensity, text };
}

/** Date en gras de la carte : « Sam. 10 oct. · soir ». Sans date : « Date à fixer ». */
export function eventDateLabel(card: EventCardDto, tone: EventTone): string {
  const day = eventDayKey(card);
  if (!day) return tone['partie.ralliement_event_no_date'];
  const [y, m, d] = day.split('-').map(Number);
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
  const date = formatted.charAt(0).toLocaleUpperCase('fr-FR') + formatted.slice(1);
  const slot: DaySlot | null = card.seance?.slot ?? null;
  return slot ? `${date} · ${SLOT_LABELS[slot].toLocaleLowerCase('fr-FR')}` : date;
}

/** Ligne « Ma situation » : l'hôte participe (« J'y étais » une fois passée) ; tout autre membre
 *  n'est pas inscrit (chip pointillée) — l'inscription arrive avec la Story 40.3. */
export interface EventSituation {
  labelKey:
    | 'partie.ralliement_event_chip_participating'
    | 'partie.ralliement_event_chip_was_there'
    | 'partie.ralliement_event_chip_not_registered';
  dotted: boolean;
}

export function eventSituation(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): EventSituation {
  const isHost = !!currentUserId && card.hostId === currentUserId;
  if (!isHost) return { labelKey: 'partie.ralliement_event_chip_not_registered', dotted: true };
  return isPastEvent(card, todayKey)
    ? { labelKey: 'partie.ralliement_event_chip_was_there', dotted: false }
    : { labelKey: 'partie.ralliement_event_chip_participating', dotted: false };
}

/** Ordre des créneaux d'une même journée. */
const SLOT_ORDER: Record<DaySlot, number> = { MORNING: 0, AFTERNOON: 1, EVENING: 2, FULL_DAY: 3 };

/** Sections de l'onglet : « À venir » par jour puis créneau croissants (sans date en dernier),
 *  « Passées » dans l'ordre inverse de cette même clé (la plus récente d'abord). */
export function splitEvents(
  cards: readonly EventCardDto[],
  todayKey: string,
): { upcoming: EventCardDto[]; past: EventCardDto[] } {
  const byDay = (a: EventCardDto, b: EventCardDto) => {
    const da = eventDayKey(a);
    const db = eventDayKey(b);
    if (da === null || db === null) return da === db ? 0 : da === null ? 1 : -1;
    if (da !== db) return da < db ? -1 : 1;
    const sa = a.seance?.slot ? SLOT_ORDER[a.seance.slot] : -1;
    const sb = b.seance?.slot ? SLOT_ORDER[b.seance.slot] : -1;
    return sa - sb;
  };
  const upcoming = cards.filter((c) => !isPastEvent(c, todayKey)).sort(byDay);
  const past = cards
    .filter((c) => isPastEvent(c, todayKey))
    .sort(byDay)
    .reverse();
  return { upcoming, past };
}
