import { describe, expect, it } from 'vitest';
import { computeDisplayStatus } from './compute-display-status';
import type { AvailabilityDeclarationDto } from '@master-jdr/shared';

const NOW = new Date('2026-06-30T12:00:00Z');
const WED = new Date('2026-07-01T00:00:00Z');      // getUTCDay() === 3 (Wednesday)
const NEXT_WED = new Date('2026-07-08T00:00:00Z'); // mercredi suivant
const AUG_WED = new Date('2026-08-05T00:00:00Z');  // mercredi en août
const FAR = new Date('2027-01-01T00:00:00Z');

function decl(overrides: Partial<AvailabilityDeclarationDto> = {}): AvailabilityDeclarationDto {
  return {
    id: 'test-id',
    kind: 'UNAVAILABLE',
    recurKind: 'RECURRING',
    dayOfWeek: 3,
    slot: 'EVENING',
    startDate: null,
    endDate: null,
    expiresAt: FAR.toISOString(),
    ...overrides,
  };
}

describe('computeDisplayStatus', () => {
  it('UNAVAILABLE RECURRING matching date+slot → UNAVAILABLE', () => {
    expect(computeDisplayStatus(WED, 'EVENING', [decl()], NOW)).toBe('UNAVAILABLE');
  });

  it('AVAILABLE explicit matching → AVAILABLE', () => {
    expect(
      computeDisplayStatus(WED, 'EVENING', [decl({ kind: 'AVAILABLE' })], NOW),
    ).toBe('AVAILABLE');
  });

  it('UNAVAILABLE beats AVAILABLE on same slot', () => {
    expect(
      computeDisplayStatus(
        WED,
        'EVENING',
        [decl({ kind: 'AVAILABLE' }), decl({ kind: 'UNAVAILABLE' })],
        NOW,
      ),
    ).toBe('UNAVAILABLE');
  });

  it('no exact match → UNKNOWN (positive inference removed)', () => {
    // Decl is for EVENING on Wednesdays — query is MORNING; no exact match → UNKNOWN
    expect(computeDisplayStatus(WED, 'MORNING', [decl({ slot: 'EVENING' })], NOW)).toBe('UNKNOWN');
  });

  it('date outside covered period → UNKNOWN', () => {
    const punctual = decl({
      recurKind: 'PUNCTUAL',
      dayOfWeek: null,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      slot: 'MORNING',
    });
    expect(computeDisplayStatus(WED, 'MORNING', [punctual], NOW)).toBe('UNKNOWN');
  });

  it('expired declaration ignored → UNKNOWN', () => {
    const expired = decl({ expiresAt: new Date('2026-06-01T00:00:00Z').toISOString() });
    expect(computeDisplayStatus(WED, 'EVENING', [expired], NOW)).toBe('UNKNOWN');
  });

  it('RECURRING before startDate → UNKNOWN', () => {
    // La déclaration commence mercredi prochain — ce mercredi ne doit pas être coloré
    const d = decl({ startDate: '2026-07-08' });
    expect(computeDisplayStatus(WED, 'EVENING', [d], NOW)).toBe('UNKNOWN');
  });

  it('RECURRING after expiresAt → UNKNOWN', () => {
    // La déclaration expire fin juillet — un mercredi d'août ne doit pas être coloré
    const d = decl({ startDate: '2026-07-01', expiresAt: '2026-07-31T23:59:59Z' });
    expect(computeDisplayStatus(AUG_WED, 'EVENING', [d], NOW)).toBe('UNKNOWN');
  });

  it('RECURRING within [startDate, expiresAt] → UNAVAILABLE', () => {
    // La déclaration couvre juillet-décembre — le mercredi suivant est dans la plage
    const d = decl({ startDate: '2026-07-01', expiresAt: '2026-12-31T23:59:59Z' });
    expect(computeDisplayStatus(NEXT_WED, 'EVENING', [d], NOW)).toBe('UNAVAILABLE');
  });

  it('FULL_DAY declaration matches any specific slot', () => {
    const fullDay = decl({ slot: 'FULL_DAY', kind: 'UNAVAILABLE' });
    expect(computeDisplayStatus(WED, 'MORNING', [fullDay], NOW)).toBe('UNAVAILABLE');
    expect(computeDisplayStatus(WED, 'AFTERNOON', [fullDay], NOW)).toBe('UNAVAILABLE');
    expect(computeDisplayStatus(WED, 'EVENING', [fullDay], NOW)).toBe('UNAVAILABLE');
  });
});
