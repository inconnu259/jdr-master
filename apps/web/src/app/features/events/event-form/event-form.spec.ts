import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { EventForm } from './event-form';

const TONE = TONE_MAP['grimoire-emeraude'];

/** Clé de jour locale décalée de `days` jours (comme le champ du formulaire). */
function dayKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pollCard(deadline: string): EventCardDto {
  return {
    id: 'e1',
    title: 'Sondage plateaux',
    hostId: 'u1',
    hostDisplayName: 'Léa',
    seance: {
      id: 's1',
      date: null,
      slot: null,
      lieu: 'Lyon 3e',
      heureRdv: null,
      notePratique: null,
      capacity: null,
      placesTaken: 1,
    },
    participants: [],
    myInscription: null,
    poll: {
      id: 'p1',
      expiresAt: `${deadline}T23:59:59.999Z`,
      status: 'OPEN',
      eligibleVoterIds: ['u1'],
      options: [
        { id: 'o2', date: dayKey(9), slot: 'MORNING', availableCount: 0 },
        { id: 'o1', date: dayKey(8), slot: 'EVENING', availableCount: 0 },
      ],
      votes: [],
    },
  };
}

@Component({
  imports: [EventForm],
  template: `<app-event-form [prefill]="card()" />`,
})
class Host {
  card = signal<EventCardDto | null>(null);
  form = viewChild.required(EventForm);
}

describe('EventForm — modification d’une conjonction à sondage (Story 40.5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function mount(card: EventCardDto) {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.card.set(card);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const form = fixture.componentInstance.form();
    const el = fixture.nativeElement as HTMLElement;
    const setDeadline = (value: string) => {
      const input = el.querySelector<HTMLInputElement>('.ec__poll-deadline')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, form, el, setDeadline };
  }

  it('mode sondage, bascule figée, créneaux triés et échéance préremplis ; le dto envoie pollOptions + pollDeadline sans date ni créneau', async () => {
    const { form, el } = await mount(pollCard(dayKey(5)));

    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.ec__date-mode button'));
    const byLabel = (label: string) => buttons.find((b) => b.textContent?.trim() === label)!;
    expect(
      byLabel(TONE['partie.ralliement_event_date_poll'])
        .closest('mat-button-toggle')!
        .classList.contains('mat-button-toggle-checked'),
    ).toBe(true);
    // L'autre mode est verrouillé : le mode d'une conjonction ne change pas.
    expect(byLabel(TONE['partie.ralliement_event_date_fixed']).disabled).toBe(true);
    expect(el.querySelector('.ec__day')).toBeNull();
    expect(el.querySelectorAll('.ec__chip-label')).toHaveLength(2);
    expect(el.querySelector<HTMLInputElement>('.ec__poll-deadline')!.value).toBe(dayKey(5));

    const dto = form.dto();
    expect(dto.pollOptions).toEqual([
      { date: dayKey(8), slot: 'EVENING' },
      { date: dayKey(9), slot: 'MORNING' },
    ]);
    expect(dto.pollDeadline).toBe(dayKey(5));
    expect('date' in dto).toBe(false);
    expect('slot' in dto).toBe(false);
    expect(form.valid()).toBe(true);
  });

  it('échéance passée INCHANGÉE : valide, le champ ne la bloque pas ; changée vers une autre date passée : invalide', async () => {
    const past = dayKey(-3);
    const { form, el, setDeadline } = await mount(pollCard(past));

    expect(form.valid()).toBe(true);
    expect(el.querySelector<HTMLInputElement>('.ec__poll-deadline')!.min).toBe(past);

    setDeadline(dayKey(-1));
    expect(form.valid()).toBe(false);

    setDeadline(past);
    expect(form.valid()).toBe(true);

    setDeadline(dayKey(2));
    expect(form.valid()).toBe(true);
  });

  it('échéance future d’origine : la borne basse reste aujourd’hui et une échéance passée est refusée', async () => {
    const { form, el, setDeadline } = await mount(pollCard(dayKey(5)));
    expect(el.querySelector<HTMLInputElement>('.ec__poll-deadline')!.min).toBe(dayKey(0));
    setDeadline(dayKey(-1));
    expect(form.valid()).toBe(false);
  });
});
