import type { DaySlot, EventCardDto, EventParticipantDto } from '@master-jdr/shared';
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

/** Story 40.3 : toutes les places d'une conjonction à places limitées sont prises. Story 40.4 : les
 *  places prises sont celles du serveur (`placesTaken` : l'hôte et TOUTES les lignes, réservées
 *  comprises) — la liste des participants n'en montre pas forcément autant. « Tous les membres » (sans
 *  limite) n'est jamais complet. */
export function isFull(card: EventCardDto): boolean {
  const capacity = card.seance?.capacity ?? null;
  return capacity !== null && (card.seance?.placesTaken ?? 0) >= capacity;
}

/** Story 40.3 : la personne peut encore s'inscrire — conjonction avec séance, membre ni hôte ni inscrit, conjonction à venir
 *  et pas complète. (Le serveur reste juge : une course sur la dernière place répond 409.) */
export function canSignUp(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): boolean {
  return (
    !!currentUserId &&
    card.seance !== null &&
    !isParticipantOf(card, currentUserId) &&
    // Story 40.4 : qui tient une place réservée l'accepte ou la décline, il ne « s'inscrit » pas.
    card.myInscription !== 'RESERVED' &&
    !isPastEvent(card, todayKey) &&
    !isFull(card)
  );
}

/** Story 40.3 : « Complet » est écrit pour une personne NON inscrite quand la conjonction à venir n'a
 *  plus de place ; les inscrits et l'hôte gardent leur état normal. */
export function isFullForViewer(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): boolean {
  return (
    isFull(card) &&
    !isParticipantOf(card, currentUserId) &&
    // Story 40.4 : la place réservée est la sienne — la conjonction n'est pas « complète » pour lui.
    card.myInscription !== 'RESERVED' &&
    !isPastEvent(card, todayKey)
  );
}

/** Story 40.3 : un inscrit (jamais l'hôte, qui garde sa place) peut se désinscrire tant que la
 *  conjonction n'est pas passée. */
export function canUnsubscribe(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): boolean {
  return (
    !!currentUserId &&
    card.seance !== null &&
    isParticipantOf(card, currentUserId) &&
    !isHostOf(card, currentUserId) &&
    !isPastEvent(card, todayKey)
  );
}

/**
 * Badge d'état (UX-DR7) : « Passé » (teinte `done`) ; « Complet » (même teinte grise) pour une
 * personne non inscrite quand toutes les places sont prises (Story 40.3) ; « Dans *n* jours » dans la
 * semaine qui vient (teinte `soon`, intensité `near`, PLEIN au palier `imminent` — « Aujourd'hui » /
 * « Demain ») ; « À venir » au-delà ou sans date. Le libellé est toujours écrit : la teinte le double.
 * `currentUserId` absent : aucune personne n'est inscrite, donc « Complet » s'applique.
 */
export function eventBadge(
  card: EventCardDto,
  todayKey: string,
  tone: EventTone,
  currentUserId?: string | null,
): StatusBadgeState {
  if (isPastEvent(card, todayKey)) {
    return { tone: 'done', labelKey: 'status.scenario_passe', draft: false };
  }
  if (isFullForViewer(card, currentUserId, todayKey)) {
    return {
      tone: 'done',
      labelKey: 'status.scenario_passe',
      draft: false,
      text: tone['partie.ralliement_event_badge_full'],
    };
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

/** Story 40.2 : la personne est l'hôte de la conjonction. */
export function isHostOf(card: EventCardDto, userId: string | null | undefined): boolean {
  return !!userId && card.hostId === userId;
}

/** Story 40.2 : la personne participe — l'hôte, ou un inscrit de la liste des participants. Story
 *  40.4 : une place seulement réservée (statut `RESERVED`, que l'hôte est seul à voir dans la liste)
 *  n'est pas une participation. */
export function isParticipantOf(card: EventCardDto, userId: string | null | undefined): boolean {
  return (
    !!userId &&
    (isHostOf(card, userId) ||
      card.participants.some((p) => p.userId === userId && p.status === 'CONFIRMED'))
  );
}

/** Story 40.4 : la personne tient une place réservée, pas encore acceptée. */
export function hasReservedPlace(card: EventCardDto): boolean {
  return card.myInscription === 'RESERVED';
}

/** Story 40.4 : la personne peut accepter ou décliner sa place réservée — tant que la conjonction
 *  n'est pas passée (le serveur refuse après). */
export function canRespondToReservation(card: EventCardDto, todayKey: string): boolean {
  return card.seance !== null && hasReservedPlace(card) && !isPastEvent(card, todayKey);
}

/** Story 40.4 : l'hôte gère les réservations de sa conjonction à places limitées tant qu'elle n'est
 *  pas passée. */
export function canManageReservations(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): boolean {
  return (
    card.seance !== null &&
    card.seance.capacity !== null &&
    isHostOf(card, currentUserId) &&
    !isPastEvent(card, todayKey)
  );
}

/** Story 40.4 : une place réservée, en attente de réponse, parmi les participants (vue de l'hôte). */
export function isPendingParticipant(participant: EventParticipantDto): boolean {
  return participant.status === 'RESERVED';
}

/** Ligne « Ma situation » : l'hôte et les inscrits participent (« J'y étais » une fois passée) ; tout
 *  autre membre n'est pas inscrit (chip pointillée). */
export interface EventSituation {
  labelKey:
    | 'partie.ralliement_event_chip_participating'
    | 'partie.ralliement_event_chip_reserved'
    | 'partie.ralliement_event_chip_was_there'
    | 'partie.ralliement_event_chip_not_registered';
  dotted: boolean;
}

export function eventSituation(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): EventSituation {
  // Story 40.4 : « Place réservée » tant que la conjonction est à venir ; une fois passée, une place
  // jamais acceptée n'a pas été une participation.
  if (hasReservedPlace(card) && !isPastEvent(card, todayKey)) {
    return { labelKey: 'partie.ralliement_event_chip_reserved', dotted: false };
  }
  if (!isParticipantOf(card, currentUserId)) {
    return { labelKey: 'partie.ralliement_event_chip_not_registered', dotted: true };
  }
  return isPastEvent(card, todayKey)
    ? { labelKey: 'partie.ralliement_event_chip_was_there', dotted: false }
    : { labelKey: 'partie.ralliement_event_chip_participating', dotted: false };
}

/** Texte du panneau de situation de la fenêtre de détail (Story 40.2) : la situation de la personne,
 *  au présent ou à l'imparfait selon que la conjonction est passée. Le bouton « S'inscrire » (Story
 *  40.3) vit dans le panneau, pas dans ce texte. Pas de vote à ce palier. */
export function eventSituationTextKey(
  card: EventCardDto,
  currentUserId: string | null | undefined,
  todayKey: string,
): string {
  const past = isPastEvent(card, todayKey);
  const who = isHostOf(card, currentUserId)
    ? 'host'
    : isParticipantOf(card, currentUserId)
      ? 'registered'
      : hasReservedPlace(card)
        ? 'reserved'
        : 'none';
  return `partie.ralliement_event_situation_${who}${past ? '_past' : ''}`;
}

/** Accord français d'une unité portée par le registre (`'place|places'`) : 0 et 1 au singulier. */
export function frUnit(spec: string, n: number): string {
  const [one, many] = spec.split('|');
  return `${n} ${n <= 1 ? one : (many ?? one)}`;
}

/** Participation de la fiche : « 8 places · 5 inscrits · 3 libres » ou « Tous les membres » quand la
 *  conjonction n'a pas de limite. Story 40.4 : « inscrits » = l'hôte + les inscriptions CONFIRMÉES (une
 *  place réservée n'est pas une inscription), « libres » = capacité − places prises (réservées
 *  comprises : une place tenue n'est pas libre). */
export function participationLine(card: EventCardDto, tone: EventTone): string {
  const capacity = card.seance?.capacity ?? null;
  if (capacity === null) return tone['partie.ralliement_event_participation_all'];
  const registered = card.participants.filter((p) => !isPendingParticipant(p)).length;
  const taken = card.seance?.placesTaken ?? registered;
  return [
    frUnit(tone['partie.ralliement_event_unit_place'], capacity),
    frUnit(tone['partie.ralliement_event_unit_registered'], registered),
    frUnit(tone['partie.ralliement_event_unit_free'], Math.max(0, capacity - taken)),
  ].join(' · ');
}

/** Initiales d'un nom affiché (une ou deux lettres) pour le disque d'avatar. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '?';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('fr-FR');
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
