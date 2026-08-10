import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type { AuthUser, PartieDto, PartySignalsDto, SessionPollDto } from '@master-jdr/shared';
import { Dashboard } from './dashboard';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { PartySignalsService } from '../../core/parties/party-signals.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';
import { TONE_MAP } from '../../core/theme/tones';

function makeParty(
  id: string,
  role: 'mj' | 'player' = 'player',
  status: PartieDto['status'] = 'EN_COURS',
): PartieDto {
  return {
    id,
    name: `Party ${id}`,
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: 'mj-1',
    mjPseudo: 'mj-pseudo',
    mjDisplayName: 'MJ Nom',
    createdAt: '',
    nextSessionDate: null,
    nextSessionSlot: null,
    role,
    status,
  };
}

function makePoll(partieId: string): SessionPollDto {
  return {
    id: `poll-${partieId}`,
    partieId,
    status: 'OPEN',
    scenarioRef: null,
    expiresAt: null,
    chosenDate: null,
    chosenSlot: null,
    options: [],
  };
}

function makeInvitationsService(
  overrides: Partial<{ changed: ReturnType<typeof signal<number>> }> = {},
) {
  return {
    listReceived: vi.fn().mockResolvedValue([]),
    accept: vi.fn(),
    decline: vi.fn(),
    // Story 21.1 (Task 4) : Dashboard réagit désormais à ce signal (effect() du constructeur).
    changed: signal(0),
    ...overrides,
  };
}

async function createFixture(
  openPolls: Map<string, SessionPollDto>,
  invitationsSvc = makeInvitationsService(),
  allParties: PartieDto[] = [makeParty('p1', 'player'), makeParty('p2', 'player')],
  hasMjParties = false,
  partySignals = new Map<string, PartySignalsDto>(),
) {
  // Story 21.1 (Task 4) : Dashboard ouvre désormais sa propre connexion RealtimeService — mock
  // direct, jsdom n'implémente pas EventSource.
  const realtimeSvc = { connect: vi.fn(), disconnect: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      {
        provide: MyPartiesService,
        useValue: {
          allParties: signal(allParties),
          hasMjParties: signal(hasMjParties),
          refreshPlayerParties: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: InvitationsService, useValue: invitationsSvc },
      { provide: OpenPollsService, useValue: { openPolls: signal(openPolls) } },
      { provide: PartySignalsService, useValue: { signals: signal(partySignals) } },
      { provide: ThemeToneService, useValue: { tone: signal(TONE_MAP['grimoire-emeraude']) } },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'u1' } as AuthUser) } },
      { provide: RealtimeService, useValue: realtimeSvc },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, invitationsSvc, realtimeSvc };
}

describe('Dashboard — liste unifiée (Story 29.1, AC1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche toutes les parties (MJ et joueur confondues) dans une seule grille', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p-mj', 'mj'), makeParty('p-player', 'player')],
      true,
    );
    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    // 1 tuile de partie MJ + 1 tuile de partie joueur (aucune invitation ici).
    expect(tiles.length).toBe(2);
  });

  it('état vide : aucune carte, message affiché, quand allParties() est vide', async () => {
    const { fixture } = await createFixture(new Map(), undefined, [], false);
    expect(fixture.nativeElement.querySelector('.tile')).toBeNull();
    expect(fixture.nativeElement.querySelector('.empty')).not.toBeNull();
  });
});

describe('Dashboard — indicateur de rôle non chromatique (Story 29.1, AC2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une carte de partie MJ affiche le libellé de rôle MJ (icône + texte)', async () => {
    const { fixture } = await createFixture(new Map(), undefined, [makeParty('p-mj', 'mj')], true);
    const indicator = fixture.nativeElement.querySelector('.role-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.querySelector('mat-icon')).not.toBeNull();
    expect(indicator.textContent).toContain('Maître'); // dashboard.role_mj, thème grimoire-emeraude
  });

  it('une carte de partie joueur affiche le libellé de rôle joueur (icône + texte)', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p-player', 'player')],
      false,
    );
    const indicator = fixture.nativeElement.querySelector('.role-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain('Héros'); // dashboard.role_player, thème grimoire-emeraude
  });

  it("l'indicateur porte un aria-label explicite (jamais la couleur seule)", async () => {
    const { fixture } = await createFixture(new Map(), undefined, [makeParty('p-mj', 'mj')], true);
    const indicator = fixture.nativeElement.querySelector('.role-indicator');
    expect(indicator.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('Dashboard — CTA de création conditionnel (Story 29.1, AC3/AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hasMjParties() vrai → le CTA de création est présent', async () => {
    const { fixture } = await createFixture(new Map(), undefined, [], true);
    expect(fixture.nativeElement.querySelector('a[routerLink="/parties/new"]')).not.toBeNull();
  });

  it('hasMjParties() faux → aucun CTA de création sur le dashboard (accès réservé au menu)', async () => {
    const { fixture } = await createFixture(new Map(), undefined, [], false);
    expect(fixture.nativeElement.querySelector('a[routerLink="/parties/new"]')).toBeNull();
  });
});

describe('Dashboard — badge de vote en attente (Story 29.1 : limité aux cartes joueur)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("affiche le badge sur la carte d'une partie JOUEUR présente dans OpenPollsService.openPolls", async () => {
    const { fixture } = await createFixture(
      new Map([['p1', makePoll('p1')]]),
      undefined,
      [makeParty('p1', 'player')],
      false,
    );
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(1);
  });

  it("n'affiche jamais le badge sur une carte MJ, même si openPolls la contient (revue de code)", async () => {
    const { fixture } = await createFixture(
      new Map([['p-mj', makePoll('p-mj')]]),
      undefined,
      [makeParty('p-mj', 'mj')],
      true,
    );
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(0);
  });

  it("n'affiche aucun badge si openPolls est vide", async () => {
    const { fixture } = await createFixture(new Map());
    const badges = fixture.nativeElement.querySelectorAll('.poll-badge');
    expect(badges.length).toBe(0);
  });
});

describe('Dashboard — invitations toujours visibles, sans condition de rôle (Story 29.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une invitation en attente est visible même si l’utilisateur est déjà MJ de parties', async () => {
    const invitationsSvc = makeInvitationsService();
    invitationsSvc.listReceived.mockResolvedValue([
      {
        id: 'inv1',
        partie: { id: 'p-new', name: 'Nouvelle Campagne', gameSystemId: 'ryuutama' },
        inviterPseudo: 'MJ',
        status: 'PENDING' as const,
        createdAt: '2026-07-22T00:00:00.000Z',
      },
    ]);
    const { fixture } = await createFixture(
      new Map(),
      invitationsSvc,
      [makeParty('p-mj', 'mj')],
      true,
    );
    expect(fixture.nativeElement.textContent).toContain('Nouvelle Campagne');
  });
});

describe('Dashboard — accept() rafraîchit playerParties (comportement préexistant conservé)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('accept() appelle myPartiesSvc.refreshPlayerParties()', async () => {
    const invitationsSvc = makeInvitationsService();
    invitationsSvc.listReceived.mockResolvedValue([
      {
        id: 'inv1',
        partie: { id: 'p-new', name: 'Nouvelle Campagne', gameSystemId: 'ryuutama' },
        inviterPseudo: 'MJ',
        status: 'PENDING' as const,
        createdAt: '2026-07-22T00:00:00.000Z',
      },
    ]);
    const { fixture } = await createFixture(new Map(), invitationsSvc);
    const comp = fixture.componentInstance as any;
    const myParties = TestBed.inject(MyPartiesService) as unknown as {
      refreshPlayerParties: ReturnType<typeof vi.fn>;
    };

    await comp.accept(comp.received()[0]);

    expect(myParties.refreshPlayerParties).toHaveBeenCalledTimes(1);
  });
});

describe('Dashboard — câblage temps réel (Story 21.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('connect() est appelé avec userTopic(currentUserId) au montage (AC1)', async () => {
    const { realtimeSvc } = await createFixture(new Map());
    expect(realtimeSvc.connect).toHaveBeenCalledWith(userTopic('u1'));
  });

  it('disconnect() est appelé à la destruction du composant', async () => {
    const { fixture, realtimeSvc } = await createFixture(new Map());
    fixture.destroy();
    expect(realtimeSvc.disconnect).toHaveBeenCalledTimes(1);
    expect(realtimeSvc.disconnect).toHaveBeenCalledWith(userTopic('u1'));
  });

  it('une notification InvitationsService.changed() recharge les invitations reçues (AC2)', async () => {
    const invitationsSvc = makeInvitationsService();
    const { fixture } = await createFixture(new Map(), invitationsSvc);
    const comp = fixture.componentInstance as any;
    const updated = [
      {
        id: 'inv1',
        partie: { id: 'p1', name: 'Ma Campagne', gameSystemId: 'ryuutama' },
        inviterPseudo: 'MJ',
        status: 'PENDING' as const,
        createdAt: '2026-07-22T00:00:00.000Z',
      },
    ];
    invitationsSvc.listReceived.mockResolvedValue(updated);

    invitationsSvc.changed.update((v) => v + 1);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(comp.received()).toEqual(updated);
  });

  it('garde firstRun : un changed() déjà non-nul au montage ne déclenche PAS de refetch redondant', async () => {
    // InvitationsService est providedIn:'root' — son signal _changed peut déjà porter une valeur
    // non-nulle AVANT le montage (mutation locale antérieure dans la même session). Sans le garde
    // firstRun, ce cas déclencherait un refetch en plus de celui déjà fait par ngOnInit(). Dashboard
    // ne rend aucun enfant réagissant lui aussi à InvitationsService.changed — un compte exact de 1
    // est donc fiable ici.
    const invitationsSvc = makeInvitationsService({ changed: signal(1) });
    await createFixture(new Map(), invitationsSvc);

    expect(invitationsSvc.listReceived.mock.calls.length).toBe(1);
  });
});

describe('Dashboard — traitement « en retrait » des parties terminées (Story 29.6, AC5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une partie TERMINEE porte la classe tile--closed et un libellé/icône non chromatique', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'TERMINEE')],
      false,
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--closed')).toBe(true);
    const indicator = fixture.nativeElement.querySelector('.status-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.querySelector('mat-icon')).not.toBeNull();
    expect(indicator.textContent).toContain(
      TONE_MAP['grimoire-emeraude']['dashboard.status_closed_badge'],
    );
  });

  it('une partie EN_COURS/A_VENIR ne porte ni la classe tile--closed ni le badge « terminée »', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS'), makeParty('p2', 'player', 'A_VENIR')],
      false,
    );
    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    tiles.forEach((tile: Element) => expect(tile.classList.contains('tile--closed')).toBe(false));
    // Ces tuiles portent tout de même leur propre .status-indicator (AC9/P-1, revue de code) —
    // seul le libellé « terminée » (dashboard.status_closed_badge) doit être absent.
    const indicators = fixture.nativeElement.querySelectorAll('.status-indicator');
    indicators.forEach((indicator: Element) =>
      expect(indicator.textContent).not.toContain(
        TONE_MAP['grimoire-emeraude']['dashboard.status_closed_badge'],
      ),
    );
  });
});

describe('Dashboard — bandeau contextuel (Story 29.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("ngOnInit() renseigne ContextualNavService avec le titre de l'écran", async () => {
    await createFixture(new Map());

    const contextualNav = TestBed.inject(ContextualNavService);
    expect(contextualNav.title()).toBe(TONE_MAP['grimoire-emeraude']['nav.my_games']);
  });
});

describe('Dashboard — badges de signal (Story 29.7, AC3/AC9)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une partie avec 3 signaux → 2 badges visibles + compteur "+1"', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: [
            'PERSONNAGE_A_CREER',
            'VOTE_EN_COURS_SANS_REPONSE',
            'PROCHAINE_SEANCE_CONNUE',
          ] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      signals as any,
    );
    const badges = fixture.nativeElement.querySelectorAll('.signal-badge:not(.signal-badge--more)');
    expect(badges.length).toBe(2);
    const more = fixture.nativeElement.querySelector('.signal-badge--more');
    expect(more).not.toBeNull();
    expect(more.textContent).toContain('+1');
  });

  it('un badge de signal porte toujours une icône ET un libellé (jamais la couleur seule)', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'mj' as const,
          status: 'EN_COURS' as const,
          signals: ['AUCUN_MEMBRE_INVITE'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'mj', 'EN_COURS')],
      true,
      signals as any,
    );
    const badge = fixture.nativeElement.querySelector('.signal-badge');
    expect(badge).not.toBeNull();
    expect(badge.querySelector('mat-icon')).not.toBeNull();
    expect(badge.textContent.trim().length).toBeGreaterThan(0);
  });

  it('aucun signal → aucun badge affiché', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
    );
    expect(fixture.nativeElement.querySelector('.signal-badge')).toBeNull();
  });

  it('PROCHAINE_SEANCE_CONNUE affiche la date réelle (nextSessionDate/nextSessionSlot), pas un libellé générique (bug fix, revue utilisateur)', async () => {
    const party = {
      ...makeParty('p1', 'player', 'EN_COURS'),
      nextSessionDate: '2026-08-12T00:00:00.000Z',
      nextSessionSlot: 'EVENING' as const,
    };
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: ['PROCHAINE_SEANCE_CONNUE'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(new Map(), undefined, [party], false, signals as any);
    const badge = fixture.nativeElement.querySelector('.signal-badge');
    expect(badge.textContent).toContain('12 août');
    expect(badge.textContent).toContain('Soirée');
  });

  it('PARTIE_TERMINEE n’est jamais rendu en badge (doublon avec .status-indicator, revue de code)', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'TERMINEE' as const,
          signals: ['PARTIE_TERMINEE', 'RAPPORT_FIN_MANQUANT'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'TERMINEE')],
      false,
      signals as any,
    );
    const badges = fixture.nativeElement.querySelectorAll('.signal-badge:not(.signal-badge--more)');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).not.toContain(
      TONE_MAP['grimoire-emeraude']['partie.signal_partie_terminee'],
    );
    // .status-indicator porte déjà l'information « terminée » — pas de doublon.
    expect(fixture.nativeElement.querySelector('.status-indicator')).not.toBeNull();
  });

  it('un badge informatif (PROCHAINE_SEANCE_CONNUE) porte une teinte distincte des badges actionnables (revue de code)', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: ['PERSONNAGE_A_CREER', 'PROCHAINE_SEANCE_CONNUE'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      signals as any,
    );
    const badges = fixture.nativeElement.querySelectorAll('.signal-badge:not(.signal-badge--more)');
    expect(badges.length).toBe(2);
    const actionable = Array.from(badges as unknown as Element[]).find(
      (b) => !b.classList.contains('signal-badge--soon'),
    );
    const informational = Array.from(badges as unknown as Element[]).find((b) =>
      b.classList.contains('signal-badge--soon'),
    );
    expect(actionable).not.toBeUndefined();
    expect(informational).not.toBeUndefined();
    expect(informational!.textContent).toContain('Prochaine séance connue');
  });
});

describe('Dashboard — teinte des cartes selon le statut (bug fix, revue utilisateur : StateRail, DESIGN.md §7.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('une partie EN_COURS sans signal actionnable porte la classe tile--live', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--live')).toBe(true);
  });

  it('une partie A_VENIR sans signal actionnable porte la classe tile--soon', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'A_VENIR')],
      false,
      new Map(),
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--soon')).toBe(true);
  });

  it('une partie avec un signal actionnable porte tile--awaiting, jamais tile--live/tile--soon', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'mj' as const,
          status: 'EN_COURS' as const,
          signals: ['AUCUN_MEMBRE_INVITE'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'mj', 'EN_COURS')],
      true,
      signals as any,
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--awaiting')).toBe(true);
    expect(tile.classList.contains('tile--live')).toBe(false);
  });

  it('une partie EN_COURS sans aucun signal affiche quand même un libellé non chromatique (AC9/P-1, revue de code)', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--live')).toBe(true);
    const indicator = tile.querySelector('.status-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.querySelector('mat-icon')).not.toBeNull();
    expect(indicator.textContent).toContain(
      TONE_MAP['grimoire-emeraude']['dashboard.section_ongoing'],
    );
  });

  it('une partie A_VENIR sans aucun signal affiche quand même un libellé non chromatique (AC9/P-1, revue de code)', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'A_VENIR')],
      false,
      new Map(),
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--soon')).toBe(true);
    const indicator = tile.querySelector('.status-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain(
      TONE_MAP['grimoire-emeraude']['dashboard.section_upcoming'],
    );
  });

  it('un signal « en retard » (RAPPORT_FIN_MANQUANT) porte tile--soon, jamais tile--awaiting (AC8, revue de code)', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'mj' as const,
          status: 'EN_COURS' as const,
          signals: ['RAPPORT_FIN_MANQUANT'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'mj', 'EN_COURS')],
      true,
      signals as any,
    );
    const tile = fixture.nativeElement.querySelector('.tile');
    expect(tile.classList.contains('tile--soon')).toBe(true);
    expect(tile.classList.contains('tile--awaiting')).toBe(false);
  });
});

describe('Dashboard — quatre intertitres (Story 29.7, AC10)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('regroupe les parties en ce qui t’attend / en cours / à venir / terminées', async () => {
    const signals = new Map([
      [
        'p-awaiting',
        {
          role: 'mj' as const,
          status: 'EN_COURS' as const,
          signals: ['AUCUN_MEMBRE_INVITE'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [
        makeParty('p-awaiting', 'mj', 'EN_COURS'),
        makeParty('p-ongoing', 'player', 'EN_COURS'),
        makeParty('p-upcoming', 'player', 'A_VENIR'),
        makeParty('p-finished', 'player', 'TERMINEE'),
      ],
      true,
      signals as any,
    );
    const headings: string[] = [];
    fixture.nativeElement
      .querySelectorAll('h2')
      .forEach((h: Element) => headings.push(h.textContent ?? ''));
    expect(headings).toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_awaiting']);
    expect(headings).toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_ongoing']);
    expect(headings).toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_upcoming']);
    expect(headings).toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_finished']);
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(4);
  });

  it('une section vide ne rend aucun intertitre', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
    );
    const headings: string[] = [];
    fixture.nativeElement
      .querySelectorAll('h2')
      .forEach((h: Element) => headings.push(h.textContent ?? ''));
    expect(headings).not.toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_awaiting']);
    expect(headings).not.toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_upcoming']);
    expect(headings).not.toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_finished']);
  });
});
