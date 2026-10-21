import type { DaySlot } from '@master-jdr/shared';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'matin',
  AFTERNOON: 'après-midi',
  EVENING: 'soir',
  FULL_DAY: 'toute la journée',
};

/** Date d'une conjonction écrite pour un e-mail (Story 40.4) : « samedi 24 octobre (soir) ». Le jour
 *  est celui de la clé UTC stockée ; sans créneau, seule la date est écrite. */
export function formatSessionDate(date: Date, slot: DaySlot | null): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
  return slot ? `${formatted} (${SLOT_LABELS[slot]})` : formatted;
}
