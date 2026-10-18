import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import type { EventCardDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { TONE_MAP } from '../../../core/theme/tones';
import { EventsApiService } from '../events-api.service';
import { SoireeTab } from './soiree-tab';

const TONE = TONE_MAP['grimoire-emeraude'];

const card = (id: string, title: string): EventCardDto => ({
  id,
  title,
  hostId: 'host',
  hostDisplayName: 'Léa',
  seance: {
    id: `s-${id}`,
    date: null,
    slot: null,
    lieu: null,
    heureRdv: null,
    notePratique: null,
    capacity: null,
    placesTaken: 1,
  },
  participants: [],
  myInscription: null,
  poll: null,
});

@Component({
  imports: [SoireeTab],
  template: `<app-soiree-tab [partieId]="partieId()" />`,
})
class Host {
  partieId = signal('p1');
}

describe('SoireeTab — détail en ligne de l’unique événement (Story 41.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function mount(list: ReturnType<typeof vi.fn>) {
    const changed = signal(0);
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideNoopAnimations(),
        { provide: EventsApiService, useValue: { list } },
        { provide: PartiesService, useValue: { changed, members: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'host' }) } },
        { provide: ThemeToneService, useValue: { tone: signal(TONE) } },
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
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, changed, settle };
  }

  it('lit la liste de la partie et rend le premier (et seul) événement en ligne', async () => {
    const list = vi.fn().mockResolvedValue([card('e1', 'Soirée jeux')]);
    const { el } = await mount(list);
    expect(list).toHaveBeenCalledWith('p1');
    expect(el.querySelector('.ed--inline .ed__title')?.textContent?.trim()).toBe('Soirée jeux');
  });

  it('une liste vide ne rend rien et n’écrit aucune erreur', async () => {
    const { el } = await mount(vi.fn().mockResolvedValue([]));
    expect(el.querySelector('app-event-dialog')).toBeNull();
    expect(el.querySelector('.soiree__error')).toBeNull();
  });

  it('un échec au premier chargement écrit l’erreur et ne rend aucun détail', async () => {
    const { el } = await mount(vi.fn().mockRejectedValue(new Error('réseau')));
    expect(el.querySelector('.soiree__error')?.textContent).toContain(
      TONE['partie.ralliement_event_list_error'],
    );
    expect(el.querySelector('app-event-dialog')).toBeNull();
  });

  it('un signal temps réel relit la liste', async () => {
    const list = vi.fn().mockResolvedValue([card('e1', 'Avant')]);
    const { el, changed, settle } = await mount(list);
    list.mockResolvedValue([card('e1', 'Après')]);
    changed.update((v) => v + 1);
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.ed__title')?.textContent?.trim()).toBe('Après');
  });

  it('une réponse périmée n’écrase pas une réponse plus récente', async () => {
    let resolveSlow!: (value: EventCardDto[]) => void;
    const slow = new Promise<EventCardDto[]>((resolve) => (resolveSlow = resolve));
    const list = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValue([card('e2', 'Récent')]);
    const { el, changed, settle } = await mount(list);
    changed.update((v) => v + 1);
    await settle();
    expect(el.querySelector('.ed__title')?.textContent?.trim()).toBe('Récent');

    resolveSlow([card('e1', 'Périmé')]);
    await settle();
    expect(el.querySelector('.ed__title')?.textContent?.trim()).toBe('Récent');
  });

  it('relit quand la partie affichée change', async () => {
    const list = vi.fn().mockResolvedValue([card('e1', 'Une')]);
    const { fixture, settle } = await mount(list);
    fixture.componentInstance.partieId.set('p2');
    await settle();
    expect(list).toHaveBeenLastCalledWith('p2');
  });
});
