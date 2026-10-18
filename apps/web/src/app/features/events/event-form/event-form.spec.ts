import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import type { ConjonctionDraft } from '../conjonction-draft.service';
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

// Story 40.5b — « Choisir les créneaux dans le calendrier » et le brouillon qui fait l'aller-retour.
@Component({
  imports: [EventForm],
  template: `<app-event-form [draft]="draft()" (composeRequested)="requests = requests + 1" />`,
})
class CreateHost {
  draft = signal<ConjonctionDraft | null>(null);
  form = viewChild.required(EventForm);
  requests = 0;
}

describe('EventForm — calendrier du groupe et brouillon (Story 40.5b)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function mountCreate(draft: ConjonctionDraft | null = null) {
    await TestBed.configureTestingModule({
      imports: [CreateHost],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CreateHost);
    fixture.componentInstance.draft.set(draft);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const DRAFT: ConjonctionDraft = {
    partieId: 'g1',
    title: 'Brunch du dimanche',
    pollOptions: [
      { date: dayKey(9), slot: 'MORNING' },
      { date: dayKey(8), slot: 'EVENING' },
    ],
    pollDeadline: dayKey(5),
    lieu: 'Parc',
    heureRdv: '11:00',
    notePratique: 'Pique-nique',
    participation: 'limited',
    places: 6,
    reserved: ['u2'],
  };

  it('en mode sondage, le bouton écrit demande au parent d’ouvrir le calendrier ; absent en date fixée', async () => {
    const { fixture, host, el } = await mountCreate();
    expect(el.querySelector('.ec__poll-calendar-btn')).toBeNull();

    const toggles = Array.from(el.querySelectorAll<HTMLButtonElement>('.ec__date-mode button'));
    toggles.find((b) => b.textContent?.trim() === TONE['partie.ralliement_event_date_poll'])!.click();
    fixture.detectChanges();

    const button = el.querySelector<HTMLButtonElement>('.ec__poll-calendar-btn')!;
    expect(button.textContent?.trim()).toBe('Choisir les créneaux dans le calendrier');
    button.click();
    expect(host.requests).toBe(1);
  });

  it('à la modification d’une conjonction, le chemin « calendrier » n’est pas offert dans la fenêtre', async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.card.set(pollCard(dayKey(5)));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ec__poll-calendar-btn')).toBeNull();
  });

  it('le brouillon restaure tous les champs, créneaux triés, mode sondage', async () => {
    const { host, el } = await mountCreate(DRAFT);
    const form = host.form();

    expect(el.querySelector<HTMLInputElement>('.ec__name')!.value).toBe('Brunch du dimanche');
    expect(el.querySelector<HTMLInputElement>('.ec__place')!.value).toBe('Parc');
    expect(el.querySelector<HTMLInputElement>('.ec__poll-deadline')!.value).toBe(dayKey(5));
    expect(el.querySelectorAll('.ec__chip--slot').length).toBe(2);
    expect(el.querySelector('.ec__poll-summary')?.textContent?.trim()).toMatch(/^2 créneaux · /);

    expect(form.dto()).toEqual({
      title: 'Brunch du dimanche',
      pollOptions: [
        { date: dayKey(8), slot: 'EVENING' },
        { date: dayKey(9), slot: 'MORNING' },
      ],
      pollDeadline: dayKey(5),
      lieu: 'Parc',
      heureRdv: '11:00',
      notePratique: 'Pique-nique',
      capacity: 6,
      // Les places réservées d'emblée voyagent aussi avec le brouillon.
      reservedUserIds: ['u2'],
    });
    expect(form.valid()).toBe(true);
  });

  it('l’instantané rend les champs bruts, tels que la fenêtre les retrouvera', async () => {
    const { host } = await mountCreate(DRAFT);
    const snap = host.form().snapshot('g1');
    expect(snap).toMatchObject({
      partieId: 'g1',
      title: 'Brunch du dimanche',
      pollDeadline: dayKey(5),
      lieu: 'Parc',
      heureRdv: '11:00',
      notePratique: 'Pique-nique',
      participation: 'limited',
      places: 6,
    });
    expect(snap.pollOptions).toEqual([
      { date: dayKey(8), slot: 'EVENING' },
      { date: dayKey(9), slot: 'MORNING' },
    ]);
  });
});

@Component({
  imports: [EventForm],
  template: `<app-event-form
    [prefill]="card()"
    [soiree]="soiree()"
    [initialTitle]="initialTitle()"
  />`,
})
class SoireeHost {
  card = signal<EventCardDto | null>(null);
  soiree = signal(true);
  initialTitle = signal('');
  form = viewChild.required(EventForm);
}

describe('EventForm — soirée isolée (Story 41.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Événement d'une soirée fraîchement créée : ni date ni sondage. */
  const awaiting = (): EventCardDto => ({
    ...pollCard(dayKey(5)),
    poll: null,
  });

  async function mount(card: EventCardDto | null, title = '') {
    await TestBed.configureTestingModule({
      imports: [SoireeHost],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SoireeHost);
    fixture.componentInstance.card.set(card);
    fixture.componentInstance.initialTitle.set(title);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, form: fixture.componentInstance.form(), el };
  }

  it('création : le nom est pré-rempli, la participation est en lecture seule, le dto n’envoie jamais de capacité', async () => {
    const { form, el } = await mount(null, 'Marathon Pandémie');

    expect(el.querySelector<HTMLInputElement>('.ec__name')!.value).toBe('Marathon Pandémie');
    expect(el.querySelector('.ec__participation-readonly')?.textContent).toContain(
      TONE['partie.ralliement_soiree_participation_form'],
    );
    expect(el.querySelector('.ec__participation')).toBeNull();
    expect(el.querySelector('.ec__reserve')).toBeNull();
    expect(form.dto().capacity).toBeNull();
    expect(form.dto().reservedUserIds).toBeUndefined();
  });

  it('un brouillon restauré prime sur le nom pré-rempli', async () => {
    await TestBed.configureTestingModule({
      imports: [DraftSoireeHost],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DraftSoireeHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('.ec__name')!.value,
    ).toBe('Titre du brouillon');
  });

  it('un événement qui attend sa date garde les deux modes ouverts ; un sondage existant reste figé', async () => {
    const open = await mount(awaiting());
    const toggles = Array.from(
      open.el.querySelectorAll<HTMLButtonElement>('.ec__date-mode button'),
    );
    expect(toggles).toHaveLength(2);
    expect(toggles.every((b) => !b.disabled)).toBe(true);
    TestBed.resetTestingModule();

    const locked = await mount(pollCard(dayKey(5)));
    const lockedToggles = Array.from(
      locked.el.querySelectorAll<HTMLButtonElement>('.ec__date-mode button'),
    );
    expect(lockedToggles.some((b) => b.disabled)).toBe(true);
  });
});

@Component({
  imports: [EventForm],
  template: `<app-event-form [soiree]="true" initialTitle="Nom pré-rempli" [draft]="draft" />`,
})
class DraftSoireeHost {
  draft: ConjonctionDraft = {
    partieId: 'p1',
    title: 'Titre du brouillon',
    pollOptions: [{ date: dayKey(8), slot: 'EVENING' }],
    pollDeadline: dayKey(5),
    lieu: '',
    heureRdv: '',
    notePratique: '',
    participation: 'all',
    places: 4,
    reserved: [],
  };
}
