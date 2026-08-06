import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CreneauCard } from './creneau-card';
import type { AvailableSlotDto } from '@master-jdr/shared';

function makeSlot(overrides: Partial<AvailableSlotDto> = {}): AvailableSlotDto {
  return {
    date: '2026-07-04',
    slot: 'MORNING',
    members: [
      { userId: 'u1', pseudo: 'Alice', displayName: 'Alice au pays', status: 'AVAILABLE' },
      { userId: 'u2', pseudo: 'Bob', displayName: 'Bobby', status: 'AVAILABLE' },
    ],
    ...overrides,
  };
}

describe('CreneauCard', () => {
  let fixture: ComponentFixture<CreneauCard>;
  let el: HTMLElement;

  function create(slot: AvailableSlotDto): void {
    fixture = TestBed.createComponent(CreneauCard);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CreneauCard] });
  });

  it('affiche la date et le label MORNING → "Matin"', () => {
    create(makeSlot({ date: '2026-07-04', slot: 'MORNING' }));
    expect(el.textContent).toContain('juillet');
    expect(el.textContent).toContain('Matin');
  });

  it('affiche le tag "Guilde complète" quand tous les membres sont AVAILABLE', () => {
    create(
      makeSlot({
        members: [
          { userId: 'u1', pseudo: 'Alice', displayName: 'Alice au pays', status: 'AVAILABLE' },
          { userId: 'u2', pseudo: 'Bob', displayName: 'Bobby', status: 'AVAILABLE' },
        ],
      }),
    );
    expect(el.textContent).toContain('Guilde complète');
  });

  it("affiche l'alerte avec le nom affiché interpolé pour chaque membre UNKNOWN", () => {
    create(
      makeSlot({
        members: [
          { userId: 'u1', pseudo: 'Alice', displayName: 'Alice au pays', status: 'AVAILABLE' },
          { userId: 'u2', pseudo: 'Bob', displayName: 'Bobby', status: 'UNKNOWN' },
        ],
      }),
    );
    expect(el.textContent).not.toContain('Guilde complète');
    const alertList = el.querySelector('.creneau-card__alerts');
    expect(alertList).toBeTruthy();
    expect(alertList!.textContent).toContain('Bobby');
  });

  it('chaque membre est rendu via IdentityLabel (icône silhouette + nom affiché, pas le pseudo)', () => {
    create(makeSlot());
    const members = el.querySelectorAll('.creneau-card__member');
    expect(members.length).toBe(2);
    expect(members[0].querySelector('svg')).not.toBeNull();
    expect(members[0].textContent).toContain('Alice au pays');
    expect(members[0].textContent).not.toContain('Bobby');
  });

  it('deux membres avec le même displayName → le pseudo de chacun est affiché en complément (AC3)', () => {
    create(
      makeSlot({
        members: [
          { userId: 'u1', pseudo: 'Alice', displayName: 'Même Nom', status: 'AVAILABLE' },
          { userId: 'u2', pseudo: 'Bob', displayName: 'Même Nom', status: 'AVAILABLE' },
        ],
      }),
    );
    const members = el.querySelectorAll('.creneau-card__member');
    expect(members[0].querySelector('.identity-label__pseudo')?.textContent?.trim()).toBe(
      '(Alice)',
    );
    expect(members[1].querySelector('.identity-label__pseudo')?.textContent?.trim()).toBe('(Bob)');
  });

  it('aucune collision → aucun pseudo affiché (AC3)', () => {
    create(makeSlot());
    expect(el.querySelector('.identity-label__pseudo')).toBeNull();
  });
});
