import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { vi } from 'vitest';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { EventsApiService } from '../events-api.service';
import { EventCreate } from './event-create';

const TONE = TONE_MAP['grimoire-emeraude'];

@Component({
  imports: [EventCreate],
  template: `<app-event-create
    partieId="g1"
    (created)="created.set($event)"
    (closed)="closedCount = closedCount + 1"
  />`,
})
class Host {
  created = signal<EventCardDto | null>(null);
  closedCount = 0;
}

/** Clé de jour locale décalée de `days` jours (borne `min` du champ de date). */
function dayKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CARD: EventCardDto = {
  id: 'e1',
  title: 'Catane',
  hostId: 'u1',
  hostDisplayName: 'Léa',
  seance: null,
};

describe('EventCreate — fenêtre de création d’une conjonction (Story 40.1)', () => {
  let api: { create: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('app-detail-surface').forEach((n) => n.remove());
  });

  async function mount() {
    api = { create: vi.fn().mockResolvedValue(CARD), list: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideNoopAnimations(),
        { provide: EventsApiService, useValue: api },
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
        {
          provide: BreakpointObserver,
          useValue: { isMatched: () => true, observe: () => of({ matches: true, breakpoints: {} }) },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    const settle = async () => {
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
        fixture.detectChanges();
      }
    };
    fixture.detectChanges();
    await settle();
    const q = <T extends Element>(sel: string) => document.body.querySelector<T>(sel);
    const type = async (sel: string, value: string) => {
      const input = q<HTMLInputElement | HTMLTextAreaElement>(sel)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const click = async (sel: string) => {
      q<HTMLElement>(sel)!.click();
      await settle();
    };
    const toggle = async (group: string, label: string) => {
      const buttons = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>(`${group} button`),
      );
      buttons.find((b) => (b.textContent ?? '').trim() === label)!.click();
      await settle();
    };
    return { fixture, q, type, click, toggle, settle };
  }

  it('ordre du contrat : nom → date (fixée | sondage désactivé) → jour + créneau → lieu → heure → infos → participation ; fenêtre LARGE', async () => {
    const { q } = await mount();
    const panel = q('.detail-surface-panel')!;
    expect(panel.classList).toContain('detail-surface-panel--wide');
    expect(panel.getAttribute('aria-label')).toBe(TONE['partie.ralliement_event_create_title']);

    const order = ['.ec__name', '.ec__date-mode', '.ec__day', '.ec__slot', '.ec__place', '.ec__time', '.ec__note', '.ec__participation'];
    const nodes = order.map((sel) => q(sel)!);
    for (let i = 1; i < nodes.length; i++) {
      expect(
        nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        order[i],
      ).toBeTruthy();
    }
    expect(q<HTMLInputElement>('.ec__time')!.type).toBe('time');
    expect(q<HTMLInputElement>('.ec__day')!.type).toBe('date');
    const poll = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ec__date-mode button')).find(
      (b) => (b.textContent ?? '').trim() === TONE['partie.ralliement_event_date_poll'],
    )!;
    expect(poll.disabled).toBe(true);
    // Le créneau ne propose jamais « Journée ».
    const slots = Array.from(document.body.querySelectorAll('.ec__slot button')).map((b) =>
      (b.textContent ?? '').trim(),
    );
    expect(slots).toEqual(['Matin', 'Après-midi', 'Soir']);
  });

  it('« Créer » reste désactivé tant que le nom et le jour manquent', async () => {
    const { q, type } = await mount();
    const submit = () => q<HTMLButtonElement>('.ec__submit')!;
    expect(submit().disabled).toBe(true);
    await type('.ec__name', '   ');
    await type('.ec__day', dayKey(2));
    expect(submit().disabled).toBe(true);
    await type('.ec__name', 'Catane');
    expect(submit().disabled).toBe(false);
  });

  it('envoie une conjonction à date fixée, « tous les membres » par défaut, champs vides → null ; émet la carte créée', async () => {
    const { fixture, q, type, click, toggle } = await mount();
    await type('.ec__name', '  Catane et galettes ');
    await type('.ec__day', dayKey(3));
    await toggle('.ec__slot', 'Matin');
    await type('.ec__place', '  ');
    await type('.ec__time', '20:30');
    await click('.ec__submit');

    expect(api.create).toHaveBeenCalledWith('g1', {
      title: 'Catane et galettes',
      date: dayKey(3),
      slot: 'MORNING',
      lieu: null,
      heureRdv: '20:30',
      notePratique: null,
      capacity: null,
    });
    expect(fixture.componentInstance.created()).toEqual(CARD);
    expect(q('.ec__error')).toBeNull();
  });

  it('places limitées : compteur à 4 par défaut, jamais sous 2, sans plafond ; rappel de la place de l’hôte', async () => {
    const { q, type, click, toggle } = await mount();
    await type('.ec__name', 'Huit');
    await type('.ec__day', dayKey(1));
    expect(q('.ec__places')).toBeNull();
    await toggle('.ec__participation', TONE['partie.ralliement_event_participation_limited']);

    const count = () => q<HTMLInputElement>('.ec__places-count')!.value;
    expect(count()).toBe('4');
    expect(q('.ec__places-hint')?.textContent?.trim()).toBe(
      TONE['partie.ralliement_event_places_hint'],
    );
    for (let i = 0; i < 5; i++) await click('.ec__step--less');
    expect(count()).toBe('2');
    expect(q<HTMLButtonElement>('.ec__step--less')!.disabled).toBe(true);
    for (let i = 0; i < 6; i++) await click('.ec__step--more');
    expect(count()).toBe('8');
    await click('.ec__submit');
    expect(api.create.mock.calls[0][1]).toEqual(expect.objectContaining({ capacity: 8 }));
  });

  it.each(['1', '0', '2.5', 'abc', ''])(
    'saisie invalide « %s » dans le compteur : le champ réaffiche la valeur retenue, qui sera envoyée',
    async (saisie) => {
      const { q, type, click, toggle, settle } = await mount();
      await type('.ec__name', 'Compteur');
      await type('.ec__day', dayKey(1));
      await toggle('.ec__participation', TONE['partie.ralliement_event_participation_limited']);
      await click('.ec__step--more');
      const input = q<HTMLInputElement>('.ec__places-count')!;
      input.value = saisie;
      input.dispatchEvent(new Event('change'));
      await settle();

      expect(q<HTMLInputElement>('.ec__places-count')!.value).toBe('5');
      await click('.ec__submit');
      expect(api.create.mock.calls[0][1]).toEqual(expect.objectContaining({ capacity: 5 }));
    },
  );

  it('refus du serveur : message français affiché DANS la fenêtre, rien n’est émis ; garde de double envoi', async () => {
    const { fixture, q, type, click } = await mount();
    let resolve!: (v: unknown) => void;
    api.create.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await type('.ec__name', 'Catane');
    await type('.ec__day', dayKey(2));
    await click('.ec__submit');
    // En vol : le bouton est désactivé, un second clic n'envoie rien.
    expect(q<HTMLButtonElement>('.ec__submit')!.disabled).toBe(true);
    await click('.ec__submit');
    expect(api.create).toHaveBeenCalledTimes(1);
    resolve(CARD);
    await Promise.resolve();

    api.create.mockRejectedValueOnce({ error: { message: 'La date ne peut pas être passée' } });
    await type('.ec__name', 'Autre');
    await click('.ec__submit');
    expect(q('.ec__error')?.textContent?.trim()).toBe('La date ne peut pas être passée');

    api.create.mockRejectedValueOnce({ status: 0 });
    await click('.ec__submit');
    expect(q('.ec__error')?.textContent?.trim()).toBe(
      TONE['partie.ralliement_event_create_error'],
    );
    expect(fixture.componentInstance.created()).toEqual(CARD);
  });

  it('« Renoncer » ferme sans rien envoyer', async () => {
    const { fixture, click } = await mount();
    await click('.ec__cancel');
    expect(fixture.componentInstance.closedCount).toBe(1);
    expect(api.create).not.toHaveBeenCalled();
  });
});
