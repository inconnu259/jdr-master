import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { AnnouncementDto, PartieDto } from '@master-jdr/shared';
import { Shell } from './shell';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { UnseenAnnouncementsService } from '../../core/announcements/unseen-announcements.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';
import { TONE_MAP } from '../../core/theme/tones';

@Component({ selector: 'app-test-blank', template: '' })
class BlankComponent {}

function makePartie(overrides: Partial<PartieDto> = {}): PartieDto {
  return {
    id: 'p1',
    name: 'La Forêt Noire',
    kind: 'CAMPAGNE_LINEAIRE',
    gameSystemId: 'ryuutama',
    description: null,
    mjId: 'mj1',
    createdAt: '',
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'player',
    status: 'EN_COURS',
    isFavorite: false,
    coverImageVersion: null,
    ...overrides,
  };
}

function makeAnnouncement(overrides: Partial<AnnouncementDto> = {}): AnnouncementDto {
  return {
    id: 'ann1',
    partieId: 'p1',
    scenarioId: null,
    text: 'Une annonce importante',
    createdAt: '2026-08-01T00:00:00.000Z',
    authorPseudo: 'le-mj',
    authorDisplayName: 'Le Grand MJ',
    ...overrides,
  };
}

async function createFixture(
  openPollsCount: number,
  unseenAnnouncementsCount = 0,
  opts: {
    unseenAnnouncements?: AnnouncementDto[];
    parties?: PartieDto[];
    markRead?: ReturnType<typeof vi.fn>;
  } = {},
) {
  await TestBed.configureTestingModule({
    imports: [Shell],
    providers: [
      provideRouter([{ path: 'parties/:id', component: BlankComponent }]),
      provideAnimationsAsync(),
      {
        provide: MyPartiesService,
        useValue: {
          refreshMjParties: vi.fn().mockResolvedValue(undefined),
          refreshPlayerParties: vi.fn().mockResolvedValue(undefined),
          allParties: signal(opts.parties ?? []),
        },
      },
      { provide: OpenPollsService, useValue: { count: signal(openPollsCount) } },
      {
        provide: UnseenAnnouncementsService,
        useValue: {
          count: signal(unseenAnnouncementsCount),
          unseenAnnouncements: signal(opts.unseenAnnouncements ?? []),
          markRead: opts.markRead ?? vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Shell);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('Shell — barre de navigation à 4 destinations (Story 29.3, AC1/AC2/AC4/AC5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('expose 4 liens vers Parties, Personnages, Calendrier et Compte', async () => {
    const fixture = await createFixture(0);
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav.nav-bar a'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((a) => a.getAttribute('routerLink') ?? a.getAttribute('href'));

    expect(links.length).toBe(4);
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/characters');
    expect(hrefs).toContain('/profile/calendar');
    expect(hrefs).toContain('/account');
  });

  it('AC4 — le lien vers /account est direct, sans passer par un sous-menu', async () => {
    const fixture = await createFixture(0);
    expect(fixture.nativeElement.querySelector('a[routerLink="/account"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[matMenuTriggerFor]')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-menu')).toBeNull();
  });

  it('aucun mat-menu ni bouton account_circle ne subsiste dans le DOM (menu remplacé par la barre)', async () => {
    const fixture = await createFixture(0);
    expect(fixture.nativeElement.querySelector('mat-menu')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('account_circle');
  });
});

describe('Shell — badge de vote en attente sur la destination Parties (Story 29.3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le badge avec le bon compte quand des polls sont ouverts', async () => {
    const fixture = await createFixture(3);
    expect((fixture.componentInstance as any).openPollsCount()).toBe(3);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.classList.contains('mat-badge-hidden')).toBe(false);
    const content = partiesLink.querySelector('.mat-badge-content');
    expect(content?.textContent?.trim()).toBe('3');
  });

  it('masque le badge quand le compte est 0', async () => {
    const fixture = await createFixture(0);
    expect((fixture.componentInstance as any).openPollsCount()).toBe(0);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.classList.contains('mat-badge-hidden')).toBe(true);
  });
});

describe('Shell — badge combiné annonces non vues + votes en attente (Story 29.13)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('additionne polls en attente et annonces non vues dans le même badge', async () => {
    const fixture = await createFixture(2, 3);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.classList.contains('mat-badge-hidden')).toBe(false);
    const content = partiesLink.querySelector('.mat-badge-content');
    expect(content?.textContent?.trim()).toBe('5');
  });

  it('affiche le badge dès qu’il y a des annonces non vues, même sans poll en attente', async () => {
    const fixture = await createFixture(0, 1);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.classList.contains('mat-badge-hidden')).toBe(false);
    const content = partiesLink.querySelector('.mat-badge-content');
    expect(content?.textContent?.trim()).toBe('1');
  });

  it('la description accessible mentionne les annonces non vues, jamais la couleur seule', async () => {
    const fixture = await createFixture(0, 2);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.getAttribute('aria-description') ?? partiesLink.textContent).toBeTruthy();
    expect((fixture.componentInstance as any).homeBadgeDescription()).toContain(
      '2 annonce(s) non lue(s)',
    );
  });

  it('masque le badge quand aucun poll ni aucune annonce non vue', async () => {
    const fixture = await createFixture(0, 0);
    const partiesLink = fixture.nativeElement.querySelector('a[routerLink="/"]');
    expect(partiesLink.classList.contains('mat-badge-hidden')).toBe(true);
  });
});

describe('Shell — bandeau « push » d’annonce non vue (Story 29.13, révision du 2026-08-13)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("aucun bandeau tant qu'il n'y a aucune annonce non vue", async () => {
    const fixture = await createFixture(0, 0);
    expect(fixture.nativeElement.querySelector('.announcement-banner')).toBeNull();
  });

  it("aucun bandeau tant que le nom de la Partie n'est pas résolu (course de chargement)", async () => {
    const fixture = await createFixture(0, 1, {
      unseenAnnouncements: [makeAnnouncement()],
      parties: [], // MyPartiesService pas encore chargé
    });
    expect(fixture.nativeElement.querySelector('.announcement-banner')).toBeNull();
  });

  it('affiche la Partie et le texte intégral de l’annonce la plus récente', async () => {
    const fixture = await createFixture(0, 1, {
      unseenAnnouncements: [makeAnnouncement({ text: 'Rendez-vous samedi soir !' })],
      parties: [makePartie({ id: 'p1', name: 'La Forêt Noire' })],
    });

    const banner = fixture.nativeElement.querySelector('.announcement-banner');
    expect(banner?.textContent).toContain('La Forêt Noire');
    expect(banner?.textContent).toContain('Rendez-vous samedi soir !');
  });

  it('un clic sur le bandeau (hors bouton fermer) mène vers la Partie concernée', async () => {
    const fixture = await createFixture(0, 1, {
      unseenAnnouncements: [makeAnnouncement({ partieId: 'p1' })],
      parties: [makePartie({ id: 'p1', name: 'La Forêt Noire' })],
    });

    const link = fixture.nativeElement.querySelector('.announcement-banner__link');
    expect(link.getAttribute('href')).toContain('/parties/p1');
  });

  it('fermer le bandeau appelle markRead() avec le bon id, jamais au simple affichage', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    const fixture = await createFixture(0, 1, {
      unseenAnnouncements: [makeAnnouncement({ id: 'ann-x' })],
      parties: [makePartie({ id: 'p1', name: 'La Forêt Noire' })],
      markRead,
    });

    expect(markRead).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('.announcement-banner__close').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(markRead).toHaveBeenCalledWith('ann-x');
  });
});

describe('Shell — suppression du sélecteur de mode (Story 29.1, AC1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("aucun mat-button-toggle-group n'existe plus dans la navigation", async () => {
    const fixture = await createFixture(0);
    expect(fixture.nativeElement.querySelector('mat-button-toggle-group')).toBeNull();
  });

  it('ngOnInit() charge toujours mjParties et playerParties', async () => {
    await createFixture(0);
    const myParties = TestBed.inject(MyPartiesService) as unknown as {
      refreshMjParties: ReturnType<typeof vi.fn>;
      refreshPlayerParties: ReturnType<typeof vi.fn>;
    };
    expect(myParties.refreshMjParties).toHaveBeenCalledTimes(1);
    expect(myParties.refreshPlayerParties).toHaveBeenCalledTimes(1);
  });
});

describe('Shell — entrée active distinguée autrement que par la couleur (Story 29.3, AC3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('la destination correspondant à la route courante porte aria-current="page" et la classe active', async () => {
    const fixture = await createFixture(0);
    await TestBed.inject(Router).navigate(['/']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav.nav-bar a'),
    ) as HTMLAnchorElement[];
    const active = links.filter((a) => a.getAttribute('aria-current') === 'page');
    expect(active.length).toBe(1);
    expect(active[0].classList.contains('nav-bar__link--active')).toBe(true);
  });

  it('les destinations non actives ne portent ni aria-current ni la classe active', async () => {
    const fixture = await createFixture(0);
    await TestBed.inject(Router).navigate(['/']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav.nav-bar a'),
    ) as HTMLAnchorElement[];
    const inactive = links.filter((a) => a.getAttribute('aria-current') !== 'page');
    expect(inactive.length).toBe(3);
    for (const link of inactive) {
      expect(link.classList.contains('nav-bar__link--active')).toBe(false);
    }
  });
});

describe('Shell — bandeau contextuel (Story 29.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche le titre et le sous-titre quand ContextualNavService.set() a été appelé', async () => {
    const fixture = await createFixture(0);
    const contextualNav = TestBed.inject(ContextualNavService);

    contextualNav.set({ title: 'Les Cendres de Kavaan', subtitle: 'Maître' });
    fixture.detectChanges();

    const t1 = fixture.nativeElement.querySelector('.contextual-header .t1');
    const t2 = fixture.nativeElement.querySelector('.contextual-header .t2');
    expect(t1?.textContent?.trim()).toBe('Les Cendres de Kavaan');
    expect(t2?.textContent?.trim()).toBe('Maître');
  });

  it("n'affiche pas de sous-titre quand aucun n'a été fourni", async () => {
    const fixture = await createFixture(0);
    const contextualNav = TestBed.inject(ContextualNavService);

    contextualNav.set({ title: 'Mes aventures' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.contextual-header .t1')?.textContent?.trim()).toBe(
      'Mes aventures',
    );
    expect(fixture.nativeElement.querySelector('.contextual-header .t2')).toBeNull();
  });

  it('aucun bandeau ne s’affiche tant que title() est null (état par défaut)', async () => {
    const fixture = await createFixture(0);
    expect(fixture.nativeElement.querySelector('.contextual-header')).toBeNull();
  });

  it('AC3 (29.4) : sur un écran contextualisé, aucune entrée de la barre globale ne reste active', async () => {
    const fixture = await createFixture(0);
    await TestBed.inject(Router).navigate(['/']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Point de départ : "Parties" est actif sur '/'.
    let active = Array.from(
      fixture.nativeElement.querySelectorAll('nav.nav-bar a.nav-bar__link--active'),
    );
    expect(active.length).toBe(1);

    await TestBed.inject(Router).navigate(['/parties', '1']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    active = Array.from(
      fixture.nativeElement.querySelectorAll('nav.nav-bar a.nav-bar__link--active'),
    );
    expect(active.length).toBe(0);
    expect(fixture.nativeElement.querySelector('nav.nav-bar a[aria-current="page"]')).toBeNull();
  });
});
