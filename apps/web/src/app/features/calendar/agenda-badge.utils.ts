import type { DaySlot } from '@master-jdr/shared';
import type { AgendaEntry } from './calendar-agenda-view/calendar-agenda-view';

/**
 * Story 36.11 — le modèle de la vue Agenda refondue.
 *
 * Fonctions pures, testées sans TestBed (patron `poll-track.utils.ts` / `selection.utils.ts`).
 * Elles ne connaissent ni Angular, ni HTTP, ni routes : elles projettent des entrées DÉJÀ
 * dérivées par `CalendarView` vers la section et le badge qui leur reviennent.
 *
 * 🚨 **L'Agenda n'a pas d'axe temporel.** Le Mois et la Semaine portent déjà le temps ; le porter
 * une troisième fois n'aurait produit qu'un doublon. Ce qui organise cette vue, c'est **ce qu'on
 * attend du lecteur** — d'où `sectionIdFor()`, qui n'est pas un tri mais un changement de critère.
 * [Source: EXPERIENCE.md §4.4 bis]
 */

/** Les trois sections du contrat, dans leur ordre d'affichage. */
export type AgendaSectionId = 'awaiting' | 'scheduled' | 'past';

/** Teintes de la palette de statut (`--jdr-status-*`, `styles.scss`). Jamais une couleur en dur. */
export type BadgeTone = 'todo' | 'live' | 'soon' | 'done';

/** L'imminence est une **intensité**, jamais un état ni une cinquième couleur : la séance garde
 *  `status-soon` et le badge se densifie. [Source: DESIGN.md §7.1] */
export type BadgeIntensity = 'far' | 'near' | 'imminent';

/** Ce que dit le badge d'une ligne. `kind` désigne une clé de ton (résolue par le composant, qui
 *  seul connaît le thème actif) ; `text` n'est renseigné que pour l'imminence, qui est un
 *  **décompte calculé** et non un libellé de registre. */
export interface AgendaBadge {
  kind: 'answer-poll' | 'poll-open' | 'signup' | 'signed-up' | 'imminence' | 'debrief';
  tone: BadgeTone;
  intensity?: BadgeIntensity;
  text?: string;
}

/** Libellés de créneau. Dupliqués depuis `calendar-view.ts` plutôt que déplacés : les remonter
 *  dans un module commun toucherait quatre surfaces livrées pour un gain nul dans cette story. */
export const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soir',
  FULL_DAY: 'Journée',
};

/** Forme adverbiale du créneau, pour les libellés humains d'imminence (« ce soir », « demain
 *  matin »). `FULL_DAY` et l'absence de créneau n'en portent aucune : « aujourd'hui » suffit. */
const SLOT_WHEN: Record<DaySlot, { today: string; tomorrow: string } | null> = {
  MORNING: { today: 'ce matin', tomorrow: 'demain matin' },
  AFTERNOON: { today: 'cet après-midi', tomorrow: 'demain après-midi' },
  EVENING: { today: 'ce soir', tomorrow: 'demain soir' },
  FULL_DAY: null,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Découpe une clé `YYYY-MM-DD` en instant UTC.
 *
 * 🚨 On **n'utilise jamais `new Date(dateKey)` implicitement pour comparer des jours** : ici les
 * trois nombres sont extraits à la main et recomposés en UTC, donc l'arithmétique est exacte et
 * ne peut pas dériver d'un jour selon le fuseau. L'incohérence UTC/local du projet est une dette
 * connue (`deferred-work.md`) ; ces fonctions n'y ajoutent rien parce qu'elles ne raisonnent que
 * sur des clés, jamais sur des instants. */
function keyToUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Nombre de jours entiers de `fromKey` à `toKey`. Négatif si `toKey` est dans le passé. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / MS_PER_DAY);
}

/** Décale une clé de N jours et rend une clé. Utilitaire de test, et de tout ce qui a besoin de
 *  raisonner en jours sans quitter le vocabulaire des clés. */
export function addDaysToKey(dateKey: string, days: number): string {
  return new Date(keyToUtcMs(dateKey) + days * MS_PER_DAY).toISOString().substring(0, 10);
}

/** Le palier d'imminence d'une échéance. [Source: DESIGN.md §7.1, table des trois paliers] */
export function imminenceIntensity(dateKey: string, todayKey: string): BadgeIntensity {
  const days = daysBetweenKeys(todayKey, dateKey);
  if (days <= 1) return 'imminent';
  if (days <= 7) return 'near';
  return 'far';
}

/**
 * Le décompte affiché sur le badge d'une séance programmée.
 *
 * 🚨 **Au dernier palier le libellé est humain** — « ce soir », « demain soir » — **jamais
 * « J-1 »** [Source: EXPERIENCE.md §3]. Au-delà, un décompte : en jours jusqu'à deux semaines,
 * puis en semaines, comme la planche contractuelle (« dans 5 j », « dans 3 sem. »).
 */
export function imminenceLabel(
  dateKey: string,
  slot: DaySlot | undefined,
  todayKey: string,
): string {
  const days = daysBetweenKeys(todayKey, dateKey);
  const when = slot ? SLOT_WHEN[slot] : null;
  if (days <= 0) return when ? when.today : "aujourd'hui";
  if (days === 1) return when ? when.tomorrow : 'demain';
  if (days < 14) return `dans ${days} j`;
  return `dans ${Math.round(days / 7)} sem.`;
}

/**
 * La section d'une entrée, ou `null` si elle n'en a aucune.
 *
 * ⚠️ **Trois types n'ont volontairement aucune section** : `mes-disponibilites`,
 * `mes-indisponibilites`, `disponibilite-groupe`. L'Agenda est « ce qu'on attend de moi », et ma
 * propre déclaration n'attend rien de moi — elle est déjà lisible dans les deux grilles et dans
 * le rail. C'est un retrait **d'affichage** : ces entrées restent dans `allCalendarEntries()`,
 * dont dépendent le rail, le Mois et la Semaine.
 *
 * 🚨 **`compteRenduManquant` n'est renseigné qu'en contexte de partie** (`SeanceDto.compteRendu`
 * n'a pas d'équivalent sur `MyCalendarSeanceEntry`). En calendrier personnel, une séance passée
 * ne peut donc pas atteindre « C'est passé » — et de toute façon la plage de `GET /me/calendar`
 * part d'aujourd'hui, donc aucune n'y arrive. La section est alors vide, donc **absente**.
 */
export function sectionIdFor(entry: AgendaEntry, todayKey: string): AgendaSectionId | null {
  if (entry.type === 'votes-en-cours' || entry.type === 'inscriptions-ouvertes') return 'awaiting';
  if (entry.type !== 'mes-seances' || !entry.date) return null;
  if (entry.date >= todayKey) return 'scheduled';
  return entry.compteRenduManquant ? 'past' : null;
}

/**
 * Le badge d'une ligne — **jamais la couleur seule** (P-1) : la teinte double un libellé, elle ne
 * le remplace pas.
 *
 * AC4 : le libellé d'un vote dépend **du lecteur**. Sans ma réponse il appelle une action
 * (`todo`) ; une fois répondu il informe (`live`). *Deux teintes imposent deux libellés*
 * [Source: EXPERIENCE.md §5]. Le vote **reste rendu** dans les deux cas : c'est le seul chemin
 * pour changer sa réponse depuis l'Agenda.
 */
export function badgeFor(entry: AgendaEntry, todayKey: string): AgendaBadge | null {
  switch (sectionIdFor(entry, todayKey)) {
    case 'awaiting':
      if (entry.type === 'inscriptions-ouvertes') {
        return entry.jeSuisInscrit
          ? { kind: 'signed-up', tone: 'live' }
          : { kind: 'signup', tone: 'todo' };
      }
      return entry.vote?.myAnswer
        ? { kind: 'poll-open', tone: 'live' }
        : { kind: 'answer-poll', tone: 'todo' };
    case 'scheduled':
      return {
        kind: 'imminence',
        tone: 'soon',
        intensity: imminenceIntensity(entry.date, todayKey),
        text: imminenceLabel(entry.date, entry.slot, todayKey),
      };
    case 'past':
      return { kind: 'debrief', tone: 'done' };
    default:
      return null;
  }
}
