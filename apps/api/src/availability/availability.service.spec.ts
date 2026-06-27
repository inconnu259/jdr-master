import { AvailabilityService, DeclarationLike } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';

// Dates de référence (UTC) :
// July 1, 2026 = mercredi (getUTCDay() = 3)
// July 2, 2026 = jeudi   (getUTCDay() = 4)
const NOW = new Date('2026-06-30T12:00:00Z'); // veille, pour que WED soit dans le futur
const WED = new Date('2026-07-01T00:00:00Z'); // mercredi UTC
const THU = new Date('2026-07-02T00:00:00Z'); // jeudi UTC
const FAR = new Date('2027-01-01T00:00:00Z'); // date d'expiration lointaine

function makeDecl(overrides: Partial<DeclarationLike>): DeclarationLike {
  return {
    kind: 'UNAVAILABLE',
    recurKind: 'RECURRING',
    dayOfWeek: 3, // mercredi
    slot: 'EVENING',
    startDate: null,
    endDate: null,
    expiresAt: FAR,
    ...overrides,
  };
}

describe('AvailabilityService.computeSlotStatus', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService({} as PrismaService);
  });

  it('déclaration UNAVAILABLE sur le bon créneau → UNAVAILABLE', () => {
    const decls = [makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' })];
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe('UNAVAILABLE');
  });

  it('déclaration AVAILABLE explicite sur le bon créneau → AVAILABLE', () => {
    const decls = [makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'MORNING' })];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('AVAILABLE');
  });

  it('UNAVAILABLE prime sur AVAILABLE sur le même créneau', () => {
    const decls = [
      makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
      makeDecl({ kind: 'AVAILABLE', dayOfWeek: 3, slot: 'EVENING' }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe('UNAVAILABLE');
  });

  it('date dans la période couverte, pas de déclaration sur le slot → AVAILABLE (inférence)', () => {
    // Déclaration RECURRING mercredi soir expirant en 2027 : période couverte [NOW, 2027-01-01]
    // On interroge le créneau MATIN du même mercredi (non déclaré) → inférence positive
    const decls = [makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' })];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('AVAILABLE');
  });

  it('date hors de la période couverte, pas de déclaration → UNKNOWN', () => {
    // Déclaration ponctuelle [2026-07-05, 2026-07-10] : WED (02/07) est avant → hors période
    const decls = [
      makeDecl({
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        dayOfWeek: null,
        startDate: new Date('2026-07-05'),
        endDate: new Date('2026-07-10'),
      }),
    ];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('UNKNOWN');
  });

  it('déclaration expirée (expiresAt < now) ignorée → slot tombe sur UNKNOWN hors période', () => {
    const expired = makeDecl({ expiresAt: new Date('2026-01-01') }); // expiré avant NOW
    expect(service.computeSlotStatus([expired], WED, 'EVENING', NOW)).toBe('UNKNOWN');
  });

  it('déclaration RECURRING : ne correspond pas à un autre jour de la semaine', () => {
    // Déclaration mercredi soir (dayOfWeek=3) : ne doit pas bloquer le jeudi (dayOfWeek=4)
    const decls = [makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'EVENING' })];
    expect(service.computeSlotStatus(decls, THU, 'EVENING', NOW)).toBe('AVAILABLE');
    //                                                                ↑ AVAILABLE par inférence (THU est dans [NOW, FAR])
  });

  it('déclaration FULL_DAY UNAVAILABLE couvre tous les slots', () => {
    const decls = [makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'FULL_DAY' })];
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('UNAVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe('UNAVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'EVENING', NOW)).toBe('UNAVAILABLE');
  });

  it('déclaration MORNING UNAVAILABLE ne couvre pas AFTERNOON', () => {
    const decls = [makeDecl({ kind: 'UNAVAILABLE', dayOfWeek: 3, slot: 'MORNING' })];
    // MORNING → UNAVAILABLE, AFTERNOON → inférence AVAILABLE (dans période couverte)
    expect(service.computeSlotStatus(decls, WED, 'MORNING', NOW)).toBe('UNAVAILABLE');
    expect(service.computeSlotStatus(decls, WED, 'AFTERNOON', NOW)).toBe('AVAILABLE');
  });
});
