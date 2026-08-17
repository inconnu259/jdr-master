import type {
  AvailabilityDeclarationDto,
  CalendarLayerKey,
  DaySlot,
  SlotStatus,
} from '@master-jdr/shared';
import { computeDisplayStatus } from '../../core/availability/compute-display-status';
import type { AgendaEntry } from './calendar-agenda-view/calendar-agenda-view';

/**
 * Story 36.1 — modèle du rail de détail.
 *
 * Fonctions pures, testées sans TestBed (patron `selection.utils.ts`). Elles ne connaissent ni
 * Angular, ni HTTP, ni routes : elles projettent des données DÉJÀ CHARGÉES par `CalendarView`
 * vers la forme qu'affiche le rail. Aucun appel réseau n'existe ni ne doit exister ici (AC5).
 */

/** Les trois créneaux nommés du jour. `FULL_DAY` n'en est pas un : c'est un joker qui les couvre
 *  tous les trois en lecture. Dérivé de `DaySlot` (`@master-jdr/shared`) plutôt que dupliqué à la
 *  main, pour ne pas driver silencieusement si `DaySlot` évolue. */
export type RailSlot = Exclude<DaySlot, 'FULL_DAY'>;

/** Ordre d'affichage du rail, verrouillé : matin → après-midi → soir (contrat d'UI). */
export const RAIL_SLOTS: readonly { slot: RailSlot; label: string; shortLabel: string }[] = [
  { slot: 'MORNING', label: 'Matin', shortLabel: 'Matin' },
  { slot: 'AFTERNOON', label: 'Après-midi', shortLabel: 'Après-m.' },
  { slot: 'EVENING', label: 'Soir', shortLabel: 'Soir' },
] as const;

/** Cible de navigation d'une ligne activable. Story 36.1, AC11 : on ouvre le SCÉNARIO qui porte
 *  la séance — aucun écran de séance n'existe dans l'application. */
export interface RailTarget {
  partieId: string;
  scenarioId: string;
}

export interface DaySlotDetail {
  slot: RailSlot;
  label: string;
  shortLabel: string;
  /** État de disponibilité du créneau. Une séance confirmée le force à `UNAVAILABLE`, quel que
   *  soit l'état de la couche « mes séances » (AC6 / FR-50). */
  status: SlotStatus;
  /** Titre de la séance, ou `null` si aucune séance — ou si la couche est éteinte (AC6). */
  seanceLabel: string | null;
  /** Renseignée uniquement quand la séance est nommée ET navigable (AC11). */
  seanceTarget: RailTarget | null;
  /** Libellé du vote en cours sur ce créneau, ou `null`. */
  pollLabel: string | null;
}

export interface DayDetail {
  /** `YYYY-MM-DD`. */
  date: string;
  /** TOUJOURS trois entrées, dans l'ordre de `RAIL_SLOTS` — y compris les créneaux vides, qui
   *  disent alors leur état. Invariant de la story : aucune largeur, aucun état, aucune couche
   *  éteinte ne peut en retirer une. */
  slots: DaySlotDetail[];
  /** Vrai quand aucun créneau ne porte d'objet ET qu'aucun n'a d'état déclaré (AC4). */
  isEmpty: boolean;
}

/** Types d'entrées qui font d'un jour un jour « porteur » au sens de l'AC3. Une déclaration de
 *  disponibilité est un ÉTAT, pas un événement : elle ne suffit pas. La tendance du groupe non
 *  plus — elle décrit un créneau, elle n'y ajoute rien à faire. */
const MEANINGFUL_TYPES = new Set(['mes-seances', 'votes-en-cours', 'inscriptions-ouvertes']);

/** `FULL_DAY` (ou un créneau absent) couvre les trois créneaux — même convention de lecture que
 *  `compute-display-status.ts` et `calendar-week-view.ts`. */
function entryCoversSlot(entrySlot: DaySlot | undefined, slot: RailSlot): boolean {
  if (entrySlot == null || entrySlot === 'FULL_DAY') return true;
  return entrySlot === slot;
}

/** `YYYY-MM-DD` → Date minuit UTC, contrat d'entrée de `computeDisplayStatus`. */
export function dateKeyToUtcMidnight(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date locale → `YYYY-MM-DD`, même convention que `dateKey()` des vues Mois/Semaine. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Construit le détail d'UN jour pour le rail.
 *
 * @param dateKey      Jour à détailler, `YYYY-MM-DD`.
 * @param entries      Entrées du calendrier **non filtrées par couche** — le filtrage se fait ici,
 *                     et seulement sur le TEXTE (AC6). Les passer déjà filtrées ferait disparaître
 *                     l'indisponibilité d'une séance en même temps que son titre, ce que FR-50
 *                     interdit.
 * @param activeLayers Couches actives : gouvernent ce qui est NOMMÉ, jamais l'indisponibilité.
 * @param declarations Déclarations déjà filtrées par couche (mêmes données que la grille, pour que
 *                     rail et grille ne se contredisent jamais).
 * @param now          Injectable pour les tests (expiration des déclarations).
 */
export function buildDayDetail(
  dateKey: string,
  entries: AgendaEntry[],
  activeLayers: readonly CalendarLayerKey[],
  declarations: AvailabilityDeclarationDto[],
  now: Date = new Date(),
): DayDetail {
  const active = new Set(activeLayers);
  const utcDate = dateKeyToUtcMidnight(dateKey);
  const sameDay = entries.filter((e) => e.date === dateKey);

  const slots = RAIL_SLOTS.map(({ slot, label, shortLabel }): DaySlotDetail => {
    // Plusieurs entrées peuvent partager le même jour/créneau (ex. deux séances de deux parties
    // distinctes). On n'en agrège pas la liste complète (hors périmètre de la story) mais on ne
    // fait jamais disparaître silencieusement les suivantes : un indicateur minimal les signale.
    const seanceMatches = sameDay.filter(
      (e) => e.type === 'mes-seances' && entryCoversSlot(e.slot, slot),
    );
    const pollMatches = sameDay.filter(
      (e) => e.type === 'votes-en-cours' && entryCoversSlot(e.slot, slot),
    );
    const seance = seanceMatches[0];
    const poll = pollMatches[0];

    // AC6 / FR-50 : une séance confirmée rend le créneau indisponible INDÉPENDAMMENT de
    // l'affichage. La couche retire le texte, jamais le fait d'être pris.
    const status: SlotStatus = seance
      ? 'UNAVAILABLE'
      : computeDisplayStatus(utcDate, slot, declarations, now);

    const seanceNamed = seance != null && active.has('mes-seances');
    // AC11 : navigable seulement si la séance est nommée (pas d'affordance sur une ligne muette)
    // ET si l'entrée porte de quoi naviguer. AC7 : une indisponibilité dérivée d'une séance d'une
    // autre partie n'expose aucun identifiant — elle n'arrive donc jamais ici avec une cible.
    const target: RailTarget | null =
      seanceNamed && seance?.partieId && seance.scenarioId
        ? { partieId: seance.partieId, scenarioId: seance.scenarioId }
        : null;

    return {
      slot,
      label,
      shortLabel,
      status,
      seanceLabel: seanceNamed
        ? seance!.label + (seanceMatches.length > 1 ? ' (+1 autre)' : '')
        : null,
      seanceTarget: target,
      pollLabel:
        poll && active.has('votes-en-cours')
          ? poll.label + (pollMatches.length > 1 ? ' (+1 autre)' : '')
          : null,
    };
  });

  const isEmpty = slots.every(
    (s) => s.seanceLabel === null && s.pollLabel === null && s.status === 'UNKNOWN',
  );

  return { date: dateKey, slots, isEmpty };
}

/**
 * AC3 — le prochain jour « portant quelque chose », à partir d'aujourd'hui inclus.
 *
 * « Quelque chose » = une séance, un vote en cours ou une inscription ouverte **datée**. Une
 * déclaration de disponibilité est un état, pas un événement. Les entrées sans date propre
 * (inscriptions ouvertes, cf. AD-18) sont naturellement exclues : leur `date` est vide.
 *
 * @returns la clé du jour, ou `null` si rien n'est porteur dans les données chargées.
 */
export function nextMeaningfulDate(entries: AgendaEntry[], todayKey: string): string | null {
  let best: string | null = null;
  for (const e of entries) {
    if (!e.date || !MEANINGFUL_TYPES.has(e.type)) continue;
    if (e.date < todayKey) continue;
    if (best === null || e.date < best) best = e.date;
  }
  return best;
}
