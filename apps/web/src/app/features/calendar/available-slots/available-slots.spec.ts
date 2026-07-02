import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { AvailableSlotsPanel } from './available-slots';
import type { AvailableSlotDto } from '@master-jdr/shared';

const SLOT: AvailableSlotDto = {
  date: '2026-07-04',
  slot: 'MORNING',
  members: [{ userId: 'u1', pseudo: 'Alice', status: 'AVAILABLE' }],
};

describe('AvailableSlotsPanel', () => {
  let fixture: ComponentFixture<AvailableSlotsPanel>;
  let el: HTMLElement;

  function create(opts: {
    slots?: AvailableSlotDto[];
    loading?: boolean;
    error?: string | null;
  }): void {
    fixture = TestBed.createComponent(AvailableSlotsPanel);
    fixture.componentRef.setInput('slots', opts.slots ?? []);
    fixture.componentRef.setInput('loading', opts.loading ?? false);
    fixture.componentRef.setInput('error', opts.error ?? null);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AvailableSlotsPanel] });
  });

  it('affiche le spinner/squelette quand loading=true', () => {
    create({ loading: true });
    expect(el.querySelector('.available-slots__loading')).toBeTruthy();
    expect(el.querySelector('.available-slots__empty')).toBeFalsy();
    expect(el.querySelector('.available-slots__list')).toBeFalsy();
  });

  it('affiche empty.no_slots quand slots=[] et pas de loading', () => {
    create({ slots: [] });
    expect(el.querySelector('.available-slots__empty')).toBeTruthy();
    expect(el.querySelector('.available-slots__list')).toBeFalsy();
  });

  it('affiche un CreneauCard par slot quand slots non vide', () => {
    create({ slots: [SLOT, { ...SLOT, slot: 'AFTERNOON' }] });
    const cards = el.querySelectorAll('app-creneau-card');
    expect(cards.length).toBe(2);
    expect(el.querySelector('.available-slots__empty')).toBeFalsy();
  });
});
