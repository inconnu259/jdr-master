import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { CreneauCard } from './creneau-card';
import type { AvailableSlotDto } from '@master-jdr/shared';

function makeSlot(overrides: Partial<AvailableSlotDto> = {}): AvailableSlotDto {
  return {
    date: '2026-07-04',
    slot: 'MORNING',
    members: [
      { userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' },
      { userId: 'u2', pseudo: 'Bob',   status: 'AVAILABLE' },
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
    create(makeSlot({
      members: [
        { userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' },
        { userId: 'u2', pseudo: 'Bob',   status: 'AVAILABLE' },
      ],
    }));
    expect(el.textContent).toContain('Guilde complète');
  });

  it('affiche l\'alerte avec pseudo interpolé pour chaque membre UNKNOWN', () => {
    create(makeSlot({
      members: [
        { userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' },
        { userId: 'u2', pseudo: 'Bob',   status: 'UNKNOWN' },
      ],
    }));
    expect(el.textContent).not.toContain('Guilde complète');
    const alertList = el.querySelector('.creneau-card__alerts');
    expect(alertList).toBeTruthy();
    expect(alertList!.textContent).toContain('Bob');
  });
});
