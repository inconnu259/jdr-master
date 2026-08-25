import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { AvailableSlotsPanel } from './available-slots';
import type { AvailableSlotDto } from '@master-jdr/shared';

const SLOT: AvailableSlotDto = {
  date: '2026-07-04',
  slot: 'MORNING',
  members: [{ userId: 'u1', pseudo: 'Alice', displayName: 'Alice au pays', status: 'AVAILABLE' }],
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

// ─────────────────────────────────────────────────────────────────────────────
// Story 36.8, AC9 — « Fenêtres de la destinée » reste la LECTURE LONGUE
//
// Cette section ne livre RIEN de neuf : la différenciation par rôle existe depuis la 30.6. Elle
// la verrouille, parce que la story 36.8 vient d'ajouter un `members?` optionnel à
// `AggregatedSlotDto` — ce qui a rendu le discriminant historique (`'members' in s`) ambigu. Sans
// ces tests, un joueur pourrait un jour se voir servir la carte nominative sans que rien ne
// tombe.
// ─────────────────────────────────────────────────────────────────────────────

describe('AvailableSlotsPanel — la lecture longue par rôle (Story 36.8, AC9)', () => {
  let fixture: ComponentFixture<AvailableSlotsPanel>;
  let el: HTMLElement;

  function create(slots: unknown[]): void {
    fixture = TestBed.createComponent(AvailableSlotsPanel);
    fixture.componentRef.setInput('slots', slots);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', null);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AvailableSlotsPanel] });
  });

  it('MJ — la carte NOMMÉE, avec les membres et leur statut', () => {
    create([SLOT]);
    expect(el.querySelector('app-creneau-card')).toBeTruthy();
    expect(el.querySelector('app-aggregated-creneau-card')).toBeFalsy();
  });

  it('🚨 Joueur — la carte AGRÉGÉE, aucune identité, même si la charge utile porte des compteurs', () => {
    create([
      {
        date: '2026-07-04',
        slot: 'MORNING',
        available: 2,
        unavailable: 1,
        unknown: 1,
        total: 4,
      },
    ]);

    expect(el.querySelector('app-aggregated-creneau-card')).toBeTruthy();
    expect(el.querySelector('app-creneau-card')).toBeFalsy();
    expect(el.textContent).not.toContain('Alice');
  });

  it('🚨 le discriminant ne se laisse plus tromper par un `members` optionnel sur l’agrégat', () => {
    // Exactement la forme que `GET /parties/:id/heatmap` sert désormais au MJ (Story 36.8) : des
    // agrégats ET des identités. Ce n'est PAS un `AvailableSlotDto` — c'est un agrégat enrichi, et
    // ce panneau doit continuer de le lire comme tel. Avec l'ancien test `'members' in s`, il
    // aurait basculé sur la carte nominative et lu `s.members` sans garantie.
    create([
      {
        date: '2026-07-04',
        slot: 'MORNING',
        available: 1,
        unavailable: 0,
        unknown: 1,
        total: 2,
        members: [
          { userId: 'u1', pseudo: 'Alice', displayName: 'Alice au pays', status: 'AVAILABLE' },
        ],
      },
    ]);

    expect(el.querySelector('app-aggregated-creneau-card')).toBeTruthy();
    expect(el.querySelector('app-creneau-card')).toBeFalsy();
  });
});
