import type { AvailabilityDeclarationDto, DaySlot, SlotStatus } from '@master-jdr/shared';

type QuerySlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

/**
 * Computes the display status for a specific date+slot given a list of active declarations.
 * Mirror of the backend computeSlotStatus — operates on AvailabilityDeclarationDto (ISO string dates).
 *
 * @param date  UTC-midnight Date (use new Date(Date.UTC(y, m, d)) to avoid TZ bugs)
 * @param slot  Requested slot (MORNING | AFTERNOON | EVENING)
 * @param declarations All declarations for the user (including potentially expired ones)
 * @param now   Current timestamp for expiry check (injectable for tests)
 */
export function computeDisplayStatus(
  date: Date,
  slot: QuerySlot,
  declarations: AvailabilityDeclarationDto[],
  now: Date = new Date(),
): SlotStatus {
  const active = declarations.filter((d) => new Date(d.expiresAt) > now);

  const matches = (d: AvailabilityDeclarationDto) =>
    slotsMatch(d.slot, slot) && matchesDate(d, date);

  if (active.some((d) => d.kind === 'UNAVAILABLE' && matches(d))) return 'UNAVAILABLE';
  if (active.some((d) => d.kind === 'AVAILABLE' && matches(d))) return 'AVAILABLE';
  if (active.some((d) => isInCoveredPeriod(d, date))) return 'AVAILABLE';
  return 'UNKNOWN';
}

function slotsMatch(declSlot: DaySlot, query: QuerySlot): boolean {
  if (declSlot === 'FULL_DAY') return true;
  return declSlot === query;
}

function matchesDate(d: AvailabilityDeclarationDto, date: Date): boolean {
  if (d.recurKind === 'RECURRING') {
    return d.dayOfWeek === date.getUTCDay();
  }
  if (!d.startDate || !d.endDate) return false;
  const start = toUTCMidnight(d.startDate);
  const end = toUTCMidnight(d.endDate);
  return date >= start && date <= end;
}

function isInCoveredPeriod(d: AvailabilityDeclarationDto, date: Date): boolean {
  if (d.recurKind === 'RECURRING') {
    return date <= new Date(d.expiresAt);
  }
  if (!d.startDate || !d.endDate) return false;
  const start = toUTCMidnight(d.startDate);
  const end = toUTCMidnight(d.endDate);
  return date >= start && date <= end;
}

function toUTCMidnight(isoDate: string): Date {
  const d = new Date(isoDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
