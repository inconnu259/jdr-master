import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import type {
  AuthUser,
  PartieDto,
  PartySignalsDto,
  SessionPollDto,
  Theme,
} from '@master-jdr/shared';
import { Dashboard } from './dashboard';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { PartySignalsService } from '../../core/parties/party-signals.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';
import { TONE_MAP } from '../../core/theme/tones';

function makeParty(
  id: string,
  role: 'mj' | 'player' = 'player',
  status: PartieDto['status'] = 'EN_COURS',
  isFavorite = false,
  coverImageVersion: string | null = null,
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
    isFavorite,
    coverImageVersion,
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
    // Story 36.6 — effectif de la troupe (MJ + membres).
    membersCount: 4,
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

function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'u1@test.fr',
    pseudo: 'u1',
    displayName: 'U1',
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
    theme: 'grimoire-emeraude',
    hideFinishedParties: false,
    partiesSort: 'urgence',
    partiesViewMode: 'medium',
    charactersViewMode: 'medium',
    charactersSort: 'partie',
    defaultCalendarLayers: [],
    ...overrides,
  };
}

function makeAccountService() {
  return {
    updatePreferences: vi.fn().mockResolvedValue(undefined),
    addFavorite: vi.fn().mockResolvedValue({ ok: true }),
    removeFavorite: vi.fn().mockResolvedValue({ ok: true }),
  };
}

async function createFixture(
  openPolls: Map<string, SessionPollDto>,
  invitationsSvc = makeInvitationsService(),
  allParties: PartieDto[] = [makeParty('p1', 'player'), makeParty('p2', 'player')],
  hasMjParties = false,
  partySignals = new Map<string, PartySignalsDto>(),
  authUserOverrides: Partial<AuthUser> = {},
  accountSvc = makeAccountService(),
) {
  // Story 21.1 (Task 4) : Dashboard ouvre désormais sa propre connexion RealtimeService — mock
  // direct, jsdom n'implémente pas EventSource.
  const realtimeSvc = { connect: vi.fn(), disconnect: vi.fn() };
  const authSvc = { currentUser: signal(makeAuthUser(authUserOverrides)) };
  const myPartiesSvc = {
    allParties: signal(allParties),
    hasMjParties: signal(hasMjParties),
    refreshPlayerParties: vi.fn().mockResolvedValue(undefined),
    refreshMjParties: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [
      provideRouter([]),
      provideAnimationsAsync(),
      { provide: MyPartiesService, useValue: myPartiesSvc },
      { provide: InvitationsService, useValue: invitationsSvc },
      { provide: OpenPollsService, useValue: { openPolls: signal(openPolls) } },
      { provide: PartySignalsService, useValue: { signals: signal(partySignals) } },
      {
        provide: ThemeToneService,
        // `activeTheme` est requis depuis la Story 29.10 : `PartyBanner` le lit pour choisir le
        // style de la composition. Un mock qui ne porterait que `tone` casserait tout l'écran.
        useValue: {
          tone: signal(TONE_MAP['grimoire-emeraude']),
          activeTheme: signal<Theme>('grimoire-emeraude'),
        },
      },
      { provide: AuthService, useValue: authSvc },
      { provide: AccountService, useValue: accountSvc },
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
  return { fixture, invitationsSvc, realtimeSvc, authSvc, myPartiesSvc, accountSvc };
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
    expect(badge.textContent).toContain('Soir');
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

describe('Dashboard — filtres rôle/statut (Story 29.8, AC2/AC5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('filtre par rôle : réduit la liste affichée sans appel réseau supplémentaire', async () => {
    const { fixture, myPartiesSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p-mj', 'mj'), makeParty('p-player', 'player')],
      true,
    );
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(2);

    const comp = fixture.componentInstance as any;
    comp.roleFilter.set('mj');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);
    expect(myPartiesSvc.refreshMjParties).not.toHaveBeenCalled();
    expect(myPartiesSvc.refreshPlayerParties).not.toHaveBeenCalled();
  });

  it('filtre par statut : réduit la liste affichée', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS'), makeParty('p2', 'player', 'A_VENIR')],
      false,
    );
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(2);

    const comp = fixture.componentInstance as any;
    comp.statusFilter.set('A_VENIR');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);
  });

  it('les sélecteurs de filtre se limitent au rôle et au statut (AC5) — aucun select de date/nom/type', async () => {
    const { fixture } = await createFixture(new Map());
    const selects = fixture.nativeElement.querySelectorAll('select');
    // 3 <select> attendus : rôle, statut, tri (le tri N'EST PAS un filtre — AC5).
    expect(selects.length).toBe(3);
  });
});

// Repli/révélation par icône (comportement générique) : couvert par `list-control-bar.spec.ts`
// (Story 29.9) — plus dupliqué ici. Ce fichier ne vérifie que le câblage `Dashboard` ↔
// `ListControlBar` (cf. describe ci-dessous).
describe('Dashboard — câblage vers ListControlBar (Story 29.9)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('les filtres rôle/statut/masquage sont bien projetés dans ListControlBar', async () => {
    const { fixture } = await createFixture(new Map());
    const bar = fixture.nativeElement.querySelector('app-list-control-bar');
    expect(bar.querySelectorAll('select').length).toBeGreaterThanOrEqual(2);
    expect(bar.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("bascule de mode d'affichage appelle AccountService.updatePreferences({ partiesViewMode }) et change la classe CSS de la grille", async () => {
    const { fixture, accountSvc } = await createFixture(new Map(), undefined, [
      makeParty('p1', 'player', 'A_VENIR'),
    ]);
    accountSvc.updatePreferences.mockResolvedValue({});

    const modeButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.list-control-bar__mode');
    modeButtons[2].click(); // 'compact'
    fixture.detectChanges();
    await fixture.whenStable();

    expect(accountSvc.updatePreferences).toHaveBeenCalledWith({ partiesViewMode: 'compact' });
    expect(fixture.nativeElement.querySelector('.grid--compact')).not.toBeNull();
  });
});

// DESIGN.md §4.1 + §7.7 « ne pas » : le mode liste a son PROPRE rendu — une ligne, pas une carte
// rétrécie. C'est l'écart avec la maquette (direction B de `directions-liste-parties.html`) relevé
// après la première implémentation de 29.9, qui ne faisait varier que la densité de la carte.
describe('Dashboard — mode liste : gabarit ligne (Story 29.9, AC1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mode compact → des lignes .row, aucune carte .tile', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesViewMode: 'compact' },
    );

    expect(fixture.nativeElement.querySelectorAll('.row').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.tile')).toBeNull();
  });

  it('mode moyen → des cartes .tile, aucune ligne .row', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesViewMode: 'medium' },
    );

    expect(fixture.nativeElement.querySelector('.tile')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.row')).toBeNull();
  });

  it('la pastille n’est jamais seule : la sous-ligne porte rôle + libellé du signal dominant (P-1)', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: ['PERSONNAGE_A_CREER'] as const,
        },
      ],
    ]);
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      signals as any,
      { partiesViewMode: 'compact' },
    );

    const tone = TONE_MAP['grimoire-emeraude'];
    const sub = fixture.nativeElement.querySelector('.row__sub');
    expect(sub.textContent).toContain(tone['dashboard.role_player']);
    expect(sub.textContent).toContain(tone['partie.signal_personnage_a_creer']);
  });

  it('sans aucun signal, la sous-ligne retombe sur le libellé de teinte — jamais vide', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesViewMode: 'compact' },
    );

    const sub = fixture.nativeElement.querySelector('.row__sub');
    expect(sub.textContent).toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_ongoing']);
  });

  it('un seul compteur (§4.1 bis), jamais les badges détaillés, et il porte un aria-label', async () => {
    const signals = new Map([
      [
        'p1',
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: [
            'PERSONNAGE_A_CREER',
            'VOTE_EN_COURS_SANS_REPONSE',
            'AUCUN_SCENARIO_EN_COURS',
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
      { partiesViewMode: 'compact' },
    );

    const counts = fixture.nativeElement.querySelectorAll('.row__count');
    expect(counts.length).toBe(1);
    expect(counts[0].textContent.trim()).toBe('3');
    expect(counts[0].getAttribute('aria-label')).toContain('3');
    expect(fixture.nativeElement.querySelector('.signal-badge')).toBeNull();
  });

  it('l’étoile de favori reste actionnable en mode liste', async () => {
    const { fixture, accountSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesViewMode: 'compact' },
    );

    fixture.nativeElement.querySelector('.row .favorite-btn').click();
    await fixture.whenStable();

    expect(accountSvc.addFavorite).toHaveBeenCalledWith('p1');
  });
});

// AD-19 : les trois modes rendent leur bannière via le MÊME composant. `Dashboard` ne fait que
// lui passer le mode courant — il ne connaît ni la graine, ni les dimensions, ni le monogramme.
describe('Dashboard — câblage de la bannière générative (Story 29.10, AC3/AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const PARTIES = [makeParty('p1', 'player', 'EN_COURS'), makeParty('p2', 'mj', 'A_VENIR')];

  it('mode grand → une bannière par tuile, en mode "large"', async () => {
    const { fixture } = await createFixture(new Map(), undefined, PARTIES, true, new Map(), {
      partiesViewMode: 'large',
    });

    const banners = fixture.nativeElement.querySelectorAll('app-party-banner');
    expect(banners.length).toBe(2);
    for (const banner of banners) {
      expect(banner.classList.contains('party-banner-host--large')).toBe(true);
    }
  });

  it('mode moyen → une vignette carrée par tuile, dans l’en-tête', async () => {
    const { fixture } = await createFixture(new Map(), undefined, PARTIES, true, new Map(), {
      partiesViewMode: 'medium',
    });

    const banners = fixture.nativeElement.querySelectorAll('app-party-banner');
    expect(banners.length).toBe(2);
    for (const banner of banners) {
      expect(banner.classList.contains('party-banner-host--medium')).toBe(true);
      expect(banner.closest('.tile__head')).not.toBeNull();
    }
  });

  it('mode liste → une vignette par ligne, entre la pastille d’état et le texte', async () => {
    const { fixture } = await createFixture(new Map(), undefined, PARTIES, true, new Map(), {
      partiesViewMode: 'compact',
    });

    const banners = fixture.nativeElement.querySelectorAll('app-party-banner');
    expect(banners.length).toBe(2);

    const row = fixture.nativeElement.querySelector('.row');
    const children = Array.from(row.children) as Element[];
    const dotIndex = children.findIndex((el) => el.classList.contains('row__dot'));
    const bannerIndex = children.findIndex((el) => el.tagName.toLowerCase() === 'app-party-banner');
    const textIndex = children.findIndex((el) => el.classList.contains('row__txt'));
    expect(dotIndex).toBeLessThan(bannerIndex);
    expect(bannerIndex).toBeLessThan(textIndex);
  });

  it('le monogramme rendu en mode liste vient du nom de la partie', async () => {
    const partie = { ...makeParty('p1', 'player', 'EN_COURS'), name: 'Les Cendres de Kavaan' };
    const { fixture } = await createFixture(new Map(), undefined, [partie], false, new Map(), {
      partiesViewMode: 'compact',
    });

    expect(fixture.nativeElement.querySelector('.party-banner__monogram').textContent.trim()).toBe(
      'CK',
    );
  });

  it('deux parties différentes → deux compositions différentes ; la même partie → la même', async () => {
    const { fixture } = await createFixture(new Map(), undefined, PARTIES, true, new Map(), {
      partiesViewMode: 'large',
    });

    const svgs = Array.from(
      fixture.nativeElement.querySelectorAll('app-party-banner svg'),
    ) as SVGElement[];
    // Les identifiants de défs sont scopés par instance : on les neutralise, ils DOIVENT différer.
    const strip = (svg: SVGElement) => svg.innerHTML.replace(/pb\d+/g, 'pbX');
    expect(strip(svgs[0])).not.toBe(strip(svgs[1]));
  });

  it('Story 29.12 : coverImageVersion est transmis à app-party-banner, qui rend l’image plutôt que la composition', async () => {
    const withCover = {
      ...makeParty('p1', 'player', 'EN_COURS'),
      coverImageVersion: '99999999-9999-9999-9999-999999999999',
    };
    const { fixture } = await createFixture(new Map(), undefined, [withCover], false, new Map(), {
      partiesViewMode: 'large',
    });

    expect(fixture.nativeElement.querySelector('app-party-banner img.party-banner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-party-banner svg.party-banner')).toBeNull();
  });

  it('non-régression 29.9 : le placeholder de bannière a disparu, la ligne garde ses éléments', async () => {
    const { fixture } = await createFixture(new Map(), undefined, PARTIES, true, new Map(), {
      partiesViewMode: 'compact',
    });

    // Le pseudo-élément `.grid--large .tile::before` n'est plus la bannière : plus aucune `.tile`
    // en mode liste, et les éléments de ligne de la Story 29.9 sont intacts.
    expect(fixture.nativeElement.querySelector('.tile')).toBeNull();
    expect(fixture.nativeElement.querySelector('.row__dot')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.row__sub')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.row .favorite-btn')).not.toBeNull();
  });

  it('les cartes d’invitation reçue ne portent aucune bannière', async () => {
    const invitationsSvc = makeInvitationsService();
    invitationsSvc.listReceived = vi.fn().mockResolvedValue([
      {
        id: 'inv1',
        inviterPseudo: 'mj',
        partie: { id: 'px', name: 'Invitée', gameSystemId: 'draconis' },
      },
    ]);
    const { fixture } = await createFixture(new Map(), invitationsSvc, [], false, new Map(), {
      partiesViewMode: 'large',
    });

    const invitationCard = fixture.nativeElement.querySelector('mat-card.tile');
    expect(invitationCard).not.toBeNull();
    expect(invitationCard.querySelector('app-party-banner')).toBeNull();
  });
});

// DESIGN.md §7.4 : le compte à rebours DOUBLE le badge de séance, et n'apparaît que sur UN SEUL
// élément à la fois — la prochaine séance.
//
// Trois conditions cumulatives, toutes issues d'un contrat resserré en revue :
//  · mode GRAND uniquement — `.signal-badges` est partagé avec le mode moyen, où AC2 interdit
//    toute animation, et le compte à rebours en porte ;
//  · le badge `PROCHAINE_SEANCE_CONNUE` doit être RÉELLEMENT visible — `visibleSignals` est
//    plafonné à deux, et sans cette garde le compte à rebours deviendrait le seul porteur de
//    l'information, ce qu'AC5 interdit ;
//  · la séance la plus proche à venir, et elle seule.
describe('Dashboard — compte à rebours de séance (Story 29.11, AC4/AC5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function inDays(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  }

  function partyWithSession(id: string, days: number | null): PartieDto {
    return {
      ...makeParty(id, 'player', 'EN_COURS'),
      nextSessionDate: days === null ? null : inDays(days),
    };
  }

  /** Signaux portant le badge de séance — condition nécessaire à l'affichage du compte à rebours. */
  function sessionSignals(...ids: string[]) {
    return new Map(
      ids.map((id) => [
        id,
        {
          role: 'player' as const,
          status: 'EN_COURS' as const,
          signals: ['PROCHAINE_SEANCE_CONNUE'] as const,
        },
      ]),
    );
  }

  async function renderLarge(parties: PartieDto[], signalled: string[]) {
    return createFixture(
      new Map(),
      undefined,
      parties,
      false,
      sessionSignals(...signalled) as any,
      { partiesViewMode: 'large' },
    );
  }

  it('séance dans trois jours, badge visible, mode grand → compte à rebours rendu', async () => {
    const { fixture } = await renderLarge([partyWithSession('p1', 3)], ['p1']);
    expect(fixture.nativeElement.querySelector('app-party-countdown')).not.toBeNull();
  });

  it('séance dans dix jours → aucun compte à rebours (au-delà de la fenêtre de sept jours)', async () => {
    const { fixture } = await renderLarge([partyWithSession('p1', 10)], ['p1']);
    expect(fixture.nativeElement.querySelector('app-party-countdown')).toBeNull();
  });

  it('aucune date → aucun compte à rebours, aucune erreur', async () => {
    const { fixture } = await renderLarge([partyWithSession('p1', null)], ['p1']);
    expect(fixture.nativeElement.querySelector('app-party-countdown')).toBeNull();
  });

  it('AC5 : sans badge de séance visible, aucun compte à rebours — il ne peut rien doubler', async () => {
    // Même partie, même date : seul le badge manque. Sans cette garde, le compte à rebours serait
    // le seul porteur de l'information de séance.
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [partyWithSession('p1', 3)],
      false,
      new Map(),
      { partiesViewMode: 'large' },
    );
    expect(fixture.nativeElement.querySelector('app-party-countdown')).toBeNull();
  });

  it('AC2 : aucun compte à rebours en mode moyen ni en mode liste — il porte de l’animation', async () => {
    for (const mode of ['medium', 'compact'] as const) {
      const { fixture } = await createFixture(
        new Map(),
        undefined,
        [partyWithSession('p1', 3)],
        false,
        sessionSignals('p1') as any,
        { partiesViewMode: mode },
      );
      expect(fixture.nativeElement.querySelector('app-party-countdown')).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('trois parties éligibles → UN SEUL compte à rebours, celui de la séance la plus proche', async () => {
    const { fixture } = await renderLarge(
      [partyWithSession('loin', 6), partyWithSession('proche', 1), partyWithSession('milieu', 4)],
      ['loin', 'proche', 'milieu'],
    );

    const countdowns = fixture.nativeElement.querySelectorAll('app-party-countdown');
    expect(countdowns.length).toBe(1);
    expect(countdowns[0].closest('mat-card').textContent).toContain('Party proche');
  });

  it('une séance PASSÉE ne confisque pas le compte à rebours de la vraie prochaine', async () => {
    // `nextSessionDate` n'est jamais purgé après coup (item différé, revue 29.7) : sans garde, une
    // date passée gagnerait toujours la comparaison sur l'horodatage le plus ancien.
    const { fixture } = await renderLarge(
      [partyWithSession('passee', -3), partyWithSession('avenir', 2)],
      ['passee', 'avenir'],
    );

    const countdowns = fixture.nativeElement.querySelectorAll('app-party-countdown');
    expect(countdowns.length).toBe(1);
    expect(countdowns[0].closest('mat-card').textContent).toContain('Party avenir');
  });

  it('AC5 : le badge de séance reste rendu à côté, libellé inchangé', async () => {
    const { fixture } = await renderLarge([partyWithSession('p1', 2)], ['p1']);

    expect(fixture.nativeElement.querySelector('app-party-countdown')).not.toBeNull();
    const badge = fixture.nativeElement.querySelector('.signal-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim().length).toBeGreaterThan(0);
  });

  it('le compte à rebours est décoratif : aucun texte ajouté à la carte', async () => {
    const { fixture } = await renderLarge([partyWithSession('p1', 2)], ['p1']);
    const countdown = fixture.nativeElement.querySelector('app-party-countdown');
    expect(countdown.textContent.trim()).toBe('');
    expect(countdown.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('Dashboard — tri (Story 29.8, AC3/AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("changer le tri appelle AccountService.updatePreferences({ partiesSort }) et réordonne l'affichage", async () => {
    const { fixture, accountSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('zebre', 'player', 'A_VENIR'), makeParty('abbaye', 'player', 'A_VENIR')],
      false,
    );
    const comp = fixture.componentInstance as any;
    // Deux parties A_VENIR nommées 'Party zebre'/'Party abbaye' — noms générés par makeParty().
    comp.onSortChange('nom');
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(accountSvc.updatePreferences).toHaveBeenCalledWith({ partiesSort: 'nom' });
    const titles = Array.from(fixture.nativeElement.querySelectorAll('mat-card-title')).map(
      (el: any) => el.textContent.trim(),
    );
    // Tri alphabétique : "Party abbaye" avant "Party zebre".
    expect(titles[0]).toContain('Party abbaye');
  });

  it("tri 'urgence' (défaut) : les 4 intertitres restent affichés", async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
    );
    expect(fixture.nativeElement.textContent).toContain(
      TONE_MAP['grimoire-emeraude']['dashboard.section_ongoing'],
    );
  });

  it("tri différent de 'urgence' : les 4 intertitres disparaissent au profit d'une liste plate", async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesSort: 'nom' },
    );
    const headings: string[] = [];
    fixture.nativeElement
      .querySelectorAll('h2')
      .forEach((h: Element) => headings.push(h.textContent ?? ''));
    expect(headings).not.toContain(TONE_MAP['grimoire-emeraude']['dashboard.section_ongoing']);
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);
  });

  it("échec serveur (Review Findings) : onSortChange() restaure l'ancien critère plutôt que de laisser l'UI mentir", async () => {
    const failingAccountSvc = {
      updatePreferences: vi.fn().mockRejectedValue(new Error('boom')),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    };
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { partiesSort: 'urgence' },
      failingAccountSvc as any,
    );
    const comp = fixture.componentInstance as any;

    comp.onSortChange('nom');
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(comp.partiesSort()).toBe('urgence');
  });
});

describe('Dashboard — masquage des parties terminées (Story 29.8, AC6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('hideFinishedParties actif : les parties TERMINEE sont absentes par défaut', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS'), makeParty('p2', 'player', 'TERMINEE')],
      false,
      new Map(),
      { hideFinishedParties: true },
    );
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);
  });

  it('le bouton de révélation fait réapparaître les terminées sans nouvel appel serveur (AC6, dernière clause)', async () => {
    const { fixture, accountSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS'), makeParty('p2', 'player', 'TERMINEE')],
      false,
      new Map(),
      { hideFinishedParties: true },
    );
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);

    const revealBtn = fixture.nativeElement.querySelector('.controls-bar__reveal');
    expect(revealBtn).not.toBeNull();
    revealBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(2);
    expect(accountSvc.updatePreferences).not.toHaveBeenCalled();
  });

  it('hideFinishedParties inactif : aucun bouton de révélation, les terminées sont déjà visibles', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'TERMINEE')],
      false,
      new Map(),
      { hideFinishedParties: false },
    );
    expect(fixture.nativeElement.querySelector('.controls-bar__reveal')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.tile').length).toBe(1);
  });

  it('cocher la case appelle AccountService.updatePreferences({ hideFinishedParties: true })', async () => {
    const { fixture, accountSvc } = await createFixture(new Map());
    const comp = fixture.componentInstance as any;

    comp.onHideFinishedChange(true);
    fixture.detectChanges();

    expect(accountSvc.updatePreferences).toHaveBeenCalledWith({ hideFinishedParties: true });
  });

  it("échec serveur (Review Findings) : onHideFinishedChange() restaure l'ancienne préférence", async () => {
    const failingAccountSvc = {
      updatePreferences: vi.fn().mockRejectedValue(new Error('boom')),
      addFavorite: vi.fn(),
      removeFavorite: vi.fn(),
    };
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS')],
      false,
      new Map(),
      { hideFinishedParties: false },
      failingAccountSvc as any,
    );
    const comp = fixture.componentInstance as any;

    comp.onHideFinishedChange(true);
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(comp.hideFinishedParties()).toBe(false);
  });

  it('le bouton de révélation ne tient pas compte des parties terminées hors du filtre de rôle actif (Review Findings)', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p-mj', 'mj', 'EN_COURS'), makeParty('p-player-terminee', 'player', 'TERMINEE')],
      true,
      new Map(),
      { hideFinishedParties: true },
    );
    const comp = fixture.componentInstance as any;
    comp.roleFilter.set('mj');
    fixture.detectChanges();

    expect(comp.hasHiddenFinished()).toBe(false);
    expect(fixture.nativeElement.querySelector('.controls-bar__reveal')).toBeNull();
  });
});

describe('Dashboard — favoris (Story 29.8, AC1, FR-11)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("clic sur l'étoile d'une partie MJ non favorite appelle addFavorite et recharge refreshMjParties (jamais refreshPlayerParties)", async () => {
    const { fixture, accountSvc, myPartiesSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'mj', 'EN_COURS', false)],
      true,
    );
    const star = fixture.nativeElement.querySelector('.favorite-btn');
    expect(star).not.toBeNull();
    star.click();
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(accountSvc.addFavorite).toHaveBeenCalledWith('p1');
    expect(myPartiesSvc.refreshMjParties).toHaveBeenCalledTimes(1);
    expect(myPartiesSvc.refreshPlayerParties).not.toHaveBeenCalled();
  });

  it("clic sur l'étoile d'une partie joueur déjà favorite appelle removeFavorite et recharge refreshPlayerParties", async () => {
    const { fixture, accountSvc, myPartiesSvc } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS', true)],
      false,
    );
    const star = fixture.nativeElement.querySelector('.favorite-btn');
    star.click();
    fixture.detectChanges();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(accountSvc.removeFavorite).toHaveBeenCalledWith('p1');
    expect(myPartiesSvc.refreshPlayerParties).toHaveBeenCalledTimes(1);
    expect(myPartiesSvc.refreshMjParties).not.toHaveBeenCalled();
  });

  it("l'étoile porte un aria-label explicite, jamais la couleur/l'icône seule", async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS', true)],
      false,
    );
    const star = fixture.nativeElement.querySelector('.favorite-btn');
    expect(star.getAttribute('aria-label')).toBeTruthy();
    expect(star.classList.contains('favorite-btn--active')).toBe(true);
  });

  it('une partie favorite apparaît en tête de son groupe après rechargement (AC1)', async () => {
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p-a', 'player', 'A_VENIR', false), makeParty('p-b', 'player', 'A_VENIR', true)],
      false,
    );
    const titles = Array.from(fixture.nativeElement.querySelectorAll('mat-card-title')).map(
      (el: any) => el.textContent,
    );
    // p-b (favorite) doit précéder p-a, alors qu'elle est arrivée en 2e position dans allParties().
    const idxA = titles.findIndex((t: string) => t.includes('Party p-a'));
    const idxB = titles.findIndex((t: string) => t.includes('Party p-b'));
    expect(idxB).toBeLessThan(idxA);
  });

  it('garde anti-double-clic (Review Findings) : un second clic pendant que la requête est en vol est ignoré', async () => {
    let resolveAdd!: () => void;
    const pendingAdd = new Promise<{ ok: true }>((resolve) => {
      resolveAdd = () => resolve({ ok: true });
    });
    const accountSvc = {
      updatePreferences: vi.fn().mockResolvedValue(undefined),
      addFavorite: vi.fn().mockReturnValue(pendingAdd),
      removeFavorite: vi.fn(),
    };
    const { fixture } = await createFixture(
      new Map(),
      undefined,
      [makeParty('p1', 'player', 'EN_COURS', false)],
      false,
      new Map(),
      {},
      accountSvc as any,
    );
    const star = fixture.nativeElement.querySelector('.favorite-btn');

    star.click();
    fixture.detectChanges();
    star.click(); // second clic pendant que la première requête est encore en vol
    fixture.detectChanges();

    expect(accountSvc.addFavorite).toHaveBeenCalledTimes(1);
    expect(star.disabled).toBe(true);

    resolveAdd();
    await pendingAdd;
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }

    expect(star.disabled).toBe(false);
  });
});
