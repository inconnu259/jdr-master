import { TestBed, ComponentFixture } from '@angular/core/testing';
import { PartieDetail } from './partie-detail';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import type {
  CharacterDto,
  InviteLinkDto,
  PartieDto,
  PartieMemberDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { CharacterService } from '../../../core/characters/character.service';
import { makeCharacterDto } from '../../../core/characters/character-dto.fixture';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { MatDialog } from '@angular/material/dialog';
import { TONE_MAP } from '../../../core/theme/tones';

/** jsdom n'implémente pas de vraie détection de largeur — desktop=true par défaut pour préserver
 *  le comportement historique des tests existants (onglet "Détails" actif par défaut) ; les tests
 *  ciblant spécifiquement le comportement mobile passent `desktop: false`. */
function makeBreakpointObserver(desktop: boolean) {
  return {
    observe: () => of({ matches: desktop, breakpoints: {} }),
    isMatched: () => desktop,
  };
}

const MJ_ID = 'mj-1';
const PLAYER_ID = 'player-1';

function makePartie(overrides: Partial<PartieDto> = {}): PartieDto {
  return {
    id: 'party-1',
    name: 'Test Party',
    kind: 'ONE_SHOT',
    gameSystemId: 'draconis',
    description: null,
    mjId: MJ_ID,
    createdAt: new Date().toISOString(),
    nextSessionDate: null,
    nextSessionSlot: null,
    ...overrides,
  };
}

function makeToneService() {
  return { tone: signal(TONE_MAP['grimoire-emeraude']) };
}

function makeAuthService(userId: string) {
  return {
    currentUser: signal({
      id: userId,
      pseudo: 'Test',
      email: 'test@test.com',
      role: 'USER',
      createdAt: '',
    }),
  };
}

function makePartiesService(
  partie: PartieDto,
  members: PartieMemberDto[] = [],
  links: InviteLinkDto[] = [],
) {
  return {
    get: vi.fn().mockResolvedValue(partie),
    members: vi.fn().mockResolvedValue(members),
    inviteLinks: vi.fn().mockResolvedValue(links),
    searchUsers: vi.fn().mockResolvedValue([]),
    inviteUser: vi.fn(),
    inviteByEmail: vi.fn(),
    removeMember: vi.fn(),
    createInviteLink: vi.fn(),
    revokeInviteLink: vi.fn(),
    remove: vi.fn(),
  };
}

interface CreateFixtureOptions {
  members?: PartieMemberDto[];
  poll?: SessionPollDto | null;
  characters?: CharacterDto[];
  links?: InviteLinkDto[];
  noopAnimations?: boolean;
  desktop?: boolean;
}

async function createFixture(
  partie: PartieDto,
  currentUserId: string,
  options: CreateFixtureOptions = {},
): Promise<{ fixture: ComponentFixture<PartieDetail>; el: HTMLElement }> {
  await TestBed.configureTestingModule({
    imports: [PartieDetail],
    providers: [
      provideRouter([]),
      // MatTabGroup anime le changement d'onglet via le Web Animations API, non fiable en jsdom —
      // les tests qui doivent naviguer entre onglets utilisent le mode noop pour un rendu synchrone.
      options.noopAnimations ? provideNoopAnimations() : provideAnimationsAsync(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => partie.id } } } },
      { provide: AuthService, useValue: makeAuthService(currentUserId) },
      {
        provide: PartiesService,
        useValue: makePartiesService(partie, options.members ?? [], options.links ?? []),
      },
      { provide: BreakpointObserver, useValue: makeBreakpointObserver(options.desktop ?? true) },
      { provide: ModeService, useValue: { refreshMjParties: vi.fn() } },
      {
        provide: PollService,
        useValue: { getCurrentPoll: vi.fn().mockResolvedValue(options.poll ?? null) },
      },
      {
        provide: CharacterService,
        useValue: {
          listByPartie: vi.fn().mockResolvedValue(options.characters ?? []),
          getGameSystemContent: vi.fn().mockResolvedValue({
            class: [{ key: 'menestrel', data: { label: 'Ménestrel' } }],
          }),
        },
      },
      { provide: ThemeToneService, useValue: makeToneService() },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(PartieDetail);
  fixture.detectChanges();
  // ngOnInit enchaîne plusieurs await (partie, membres, poll actif) — whenStable() ne garantit pas
  // toujours le drainage complet de chaînes de promesses simples (mocks) en environnement zoneless.
  // On vide explicitement la file de microtasks à plusieurs reprises pour laisser chaque await se résoudre.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement };
}

describe('PartieDetail — widget de planification', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("affiche l'état vide quand nextSessionDate est null", async () => {
    const { el } = await createFixture(
      makePartie({ nextSessionDate: null, nextSessionSlot: null }),
      MJ_ID,
    );

    const section = el.querySelector('.scheduling-widget');
    expect(section).toBeTruthy();
    expect(section!.querySelector('.next-session-date')).toBeFalsy();
    const muted = section!.querySelector('.muted');
    expect(muted).toBeTruthy();
    expect(muted!.textContent).toContain('oracle');
  });

  it('affiche la date + slot formatés quand nextSessionDate est renseigné', async () => {
    const { el } = await createFixture(
      makePartie({ nextSessionDate: '2026-08-15T00:00:00.000Z', nextSessionSlot: 'EVENING' }),
      MJ_ID,
    );

    const section = el.querySelector('.scheduling-widget');
    expect(section).toBeTruthy();
    const dateEl = section!.querySelector('.next-session-date');
    expect(dateEl).toBeTruthy();
    const text = dateEl!.textContent ?? '';
    expect(text).toContain('août');
    expect(text).toContain('Soirée');
    expect(text).toContain('15');
  });

  it('affiche le bouton cta.find_date pour le MJ mais pas pour un joueur', async () => {
    const partie = makePartie({ mjId: MJ_ID });

    // MJ voit le bouton
    const { el: elMj } = await createFixture(partie, MJ_ID);
    const sectionMj = elMj.querySelector('.scheduling-widget');
    expect(sectionMj!.querySelector('a[mat-flat-button]')).toBeTruthy();
    TestBed.resetTestingModule();

    // Joueur ne voit pas le bouton
    const { el: elPlayer } = await createFixture(partie, PLAYER_ID);
    const sectionPlayer = elPlayer.querySelector('.scheduling-widget');
    expect(sectionPlayer!.querySelector('a[mat-flat-button]')).toBeFalsy();
  });
});

// ─── Statut du vote (Story 3.5) ───────────────────────────────────────────

describe('PartieDetail — statut du vote', () => {
  afterEach(() => TestBed.resetTestingModule());

  const members: PartieMemberDto[] = [
    { userId: 'u1', pseudo: 'Alice', email: 'alice@test.com', joinedAt: '' },
    { userId: 'u2', pseudo: 'Bob', email: 'bob@test.com', joinedAt: '' },
  ];

  function makePoll(votesOnOpt: string[]): SessionPollDto {
    return {
      id: 'poll1',
      partieId: 'party-1',
      status: 'OPEN',
      scenarioRef: null,
      expiresAt: null,
      chosenDate: null,
      chosenSlot: null,
      options: [
        {
          id: 'opt1',
          date: '2026-08-01T00:00:00.000Z',
          slot: 'MORNING',
          votes: votesOnOpt.map((userId) => ({ userId, pseudo: userId, answer: 'YES' as const })),
        },
      ],
    };
  }

  it('affiche la ligne de statut X/Y quand un poll OPEN existe', async () => {
    const { el } = await createFixture(makePartie(), MJ_ID, { members, poll: makePoll(['u1']) });
    const line = el.querySelector('.poll-status-line');
    expect(line).toBeTruthy();
    expect(line!.textContent).toContain('1/2');
  });

  it("n'affiche pas la ligne de statut si aucun poll OPEN n'existe", async () => {
    const { el } = await createFixture(makePartie(), MJ_ID, { members, poll: null });
    expect(el.querySelector('.poll-status-line')).toBeFalsy();
  });

  it('le lien joueur utilise poll.vote_pending quand un poll est actif', async () => {
    const partie = makePartie({ mjId: MJ_ID });
    const { el } = await createFixture(partie, PLAYER_ID, { members, poll: makePoll(['u1']) });
    const link = el.querySelector('.scheduling-widget a[mat-stroked-button]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Vote de date en cours');
  });
});

// ─── Chargement des personnages (Story 4.2, consommé par le roster + l'onglet "Ma fiche" depuis 6.1) ───

describe('PartieDetail — chargement des personnages', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge les personnages de la partie via CharacterService.listByPartie', async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID, { characters: [] });

    const characterSvc = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
    };
    expect(characterSvc.listByPartie).toHaveBeenCalledWith('party-1');
    expect(
      (fixture.componentInstance as unknown as { characters: () => unknown[] }).characters(),
    ).toEqual([]);
  });

  it('expose les personnages chargés sur le signal characters()', async () => {
    const character: CharacterDto = makeCharacterDto({
      userId: PLAYER_ID,
      partieId: 'party-1',
    });
    const { fixture } = await createFixture(makePartie(), MJ_ID, { characters: [character] });

    expect(
      (fixture.componentInstance as unknown as { characters: () => unknown[] }).characters(),
    ).toEqual([character]);
  });

  it("un personnage créé par un AUTRE joueur n'empêche pas l'utilisateur courant de créer le sien", async () => {
    const otherPlayerCharacter: CharacterDto = makeCharacterDto({
      userId: 'some-other-player',
      partieId: 'party-1',
      ownerPseudo: 'bob',
    });
    const { fixture } = await createFixture(makePartie(), PLAYER_ID, {
      characters: [otherPlayerCharacter],
    });

    // Le joueur courant (PLAYER_ID) n'a pas de personnage à lui, même si un autre joueur a déjà
    // créé le sien sur cette partie — myCharacters() doit rester vide pour PLAYER_ID.
    const comp = fixture.componentInstance as unknown as { myCharacters: () => unknown[] };
    expect(comp.myCharacters()).toEqual([]);
  });

  it('classLabel() résout le label de classe depuis le contenu chargé (pas la clé brute)', async () => {
    const character: CharacterDto = makeCharacterDto({
      userId: PLAYER_ID,
      partieId: 'party-1',
      sheetData: { classId: 'menestrel', narrative: { name: 'Fenn' } },
    });
    const { fixture } = await createFixture(makePartie(), MJ_ID, { characters: [character] });

    const comp = fixture.componentInstance as unknown as {
      classLabel: (c: CharacterDto) => string;
    };
    expect(comp.classLabel(character)).toBe('Ménestrel');
  });

  it('openCharacterSheet() navigue vers /parties/:id/characters/:characterId', async () => {
    const { fixture } = await createFixture(makePartie(), MJ_ID, { characters: [] });

    const router = TestBed.inject((await import('@angular/router')).Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const comp = fixture.componentInstance as unknown as {
      openCharacterSheet: (partieId: string, characterId: string) => void;
    };
    comp.openCharacterSheet('party-1', 'c1');

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'party-1', 'characters', 'c1']);
  });
});

// ─── Nouvelle disposition de la page Partie (Story 6.1) ───────────────────

describe('PartieDetail — roster (Story 6.1)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const members: PartieMemberDto[] = [
    { userId: MJ_ID, pseudo: 'Sylas', email: 'sylas@test.com', joinedAt: '' },
    { userId: PLAYER_ID, pseudo: 'Alice', email: 'alice@test.com', joinedAt: '' },
  ];

  it('desktop → affiche app-roster-rail, pas app-roster-strip', async () => {
    const { el } = await createFixture(makePartie(), MJ_ID, { members, desktop: true });
    expect(el.querySelector('app-roster-rail')).not.toBeNull();
    expect(el.querySelector('app-roster-strip')).toBeNull();
  });

  it('mobile + MJ → affiche app-roster-strip, pas app-roster-rail', async () => {
    const { el } = await createFixture(makePartie(), MJ_ID, { members, desktop: false });
    expect(el.querySelector('app-roster-strip')).not.toBeNull();
    expect(el.querySelector('app-roster-rail')).toBeNull();
  });

  it("mobile + joueur → aucun roster (ni rail ni strip), l'onglet Ma fiche est sélectionné par défaut", async () => {
    const { el } = await createFixture(makePartie(), PLAYER_ID, {
      members,
      desktop: false,
      noopAnimations: true,
    });
    expect(el.querySelector('app-roster-rail')).toBeNull();
    expect(el.querySelector('app-roster-strip')).toBeNull();

    const activeTab = el.querySelector('div[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent?.trim()).toBe('Ma fiche');
  });

  it('desktop + joueur → aucun onglet "Ma fiche" (accès via le roster à la place)', async () => {
    const { el } = await createFixture(makePartie(), PLAYER_ID, { members, desktop: true });
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).not.toContain('Ma fiche');
  });

  it("réinitialise la sélection manuelle d'onglet quand le redimensionnement fait disparaître l'onglet sélectionné", async () => {
    const breakpoint$ = new BehaviorSubject({ matches: false, breakpoints: {} });
    const dynamicBreakpointObserver = {
      observe: () => breakpoint$.asObservable(),
      isMatched: () => breakpoint$.value.matches,
    };

    await TestBed.configureTestingModule({
      imports: [PartieDetail],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'party-1' } } } },
        { provide: AuthService, useValue: makeAuthService(PLAYER_ID) },
        { provide: PartiesService, useValue: makePartiesService(makePartie(), members, []) },
        { provide: BreakpointObserver, useValue: dynamicBreakpointObserver },
        { provide: ModeService, useValue: { refreshMjParties: vi.fn() } },
        { provide: PollService, useValue: { getCurrentPoll: vi.fn().mockResolvedValue(null) } },
        {
          provide: CharacterService,
          useValue: {
            listByPartie: vi.fn().mockResolvedValue([]),
            getGameSystemContent: vi.fn().mockResolvedValue(null),
          },
        },
        { provide: ThemeToneService, useValue: makeToneService() },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PartieDetail);
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
    fixture.detectChanges();

    // Joueur mobile : sélection manuelle explicite de l'onglet "Ma fiche" (index 1).
    const comp = fixture.componentInstance as unknown as {
      onTabIndexChange: (i: number) => void;
      selectedTabIndex: () => number;
    };
    comp.onTabIndexChange(1);
    expect(comp.selectedTabIndex()).toBe(1);

    // Redimensionnement vers desktop : l'onglet "Ma fiche" (index 1) disparaît (un seul onglet "Détails").
    // Sans réinitialisation, selectedTabIndex resterait bloqué à 1, un index désormais hors bornes.
    breakpoint$.next({ matches: true, breakpoints: {} });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(comp.selectedTabIndex()).toBe(0); // la sélection manuelle obsolète a été oubliée
  });
});

// ─── Onglet Invitations & liens révoqués (Story 6.1) ──────────────────────

describe('PartieDetail — invitations', () => {
  afterEach(() => TestBed.resetTestingModule());

  const links: InviteLinkDto[] = [
    {
      id: 'l1',
      token: 'active-token',
      maxUses: 1,
      usesCount: 0,
      expiresAt: '2099-01-01',
      revoked: false,
      createdAt: '',
    },
    {
      id: 'l2',
      token: 'revoked-token',
      maxUses: 1,
      usesCount: 0,
      expiresAt: '2099-01-01',
      revoked: true,
      createdAt: '',
    },
  ];

  it("un lien révoqué ne s'affiche plus dans l'onglet Invitations (AC6)", async () => {
    const { fixture, el } = await createFixture(makePartie(), MJ_ID, {
      links,
      noopAnimations: true,
    });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const invitationsTab = Array.from(tabLabels).find((t) =>
      t.textContent?.includes('Invitations'),
    );
    invitationsTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = el.textContent ?? '';
    expect(text).toContain('active-token');
    expect(text).not.toContain('revoked-token');
  });

  it("un joueur (non-MJ) n'a pas d'onglet Invitations", async () => {
    const { el } = await createFixture(makePartie(), PLAYER_ID, { links });
    const tabLabels = Array.from(el.querySelectorAll<HTMLElement>('div[role="tab"]')).map((t) =>
      t.textContent?.trim(),
    );
    expect(tabLabels).not.toContain('Invitations');
  });

  it('le MJ peut retirer un membre depuis la liste "Membres actuels" de l\'onglet Invitations', async () => {
    const members: PartieMemberDto[] = [
      { userId: MJ_ID, pseudo: 'Sylas', email: 'sylas@test.com', joinedAt: '' },
      { userId: PLAYER_ID, pseudo: 'Alice', email: 'alice@test.com', joinedAt: '' },
    ];
    const { fixture, el } = await createFixture(makePartie(), MJ_ID, {
      members,
      noopAnimations: true,
    });

    const dialog = TestBed.inject(MatDialog) as unknown as { open: ReturnType<typeof vi.fn> };
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });

    const tabLabels = el.querySelectorAll<HTMLElement>('div[role="tab"]');
    const invitationsTab = Array.from(tabLabels).find((t) =>
      t.textContent?.includes('Invitations'),
    );
    invitationsTab?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Alice');

    const removeButtons = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Retirer'),
    );
    expect(removeButtons.length).toBe(1); // seule Alice est retirable, le MJ (Sylas) est exclu de la liste
    removeButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    const parties = TestBed.inject(PartiesService) as unknown as {
      removeMember: ReturnType<typeof vi.fn>;
    };
    expect(parties.removeMember).toHaveBeenCalledWith('party-1', PLAYER_ID);
  });
});

describe('PartieDetail — invitation par e-mail', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('succès : affiche la confirmation et vide le champ', async () => {
    const { fixture } = await createFixture(makePartie({ mjId: MJ_ID }), MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      inviteByEmail: ReturnType<typeof vi.fn>;
    };
    parties.inviteByEmail.mockResolvedValue({ ok: true });

    const component = fixture.componentInstance as unknown as {
      inviteEmail: { set: (v: string) => void; (): string };
      inviteEmailError: () => string | null;
      notice: () => string | null;
      inviteByEmail: () => Promise<void>;
    };
    component.inviteEmail.set('ami@example.com');
    await component.inviteByEmail();
    fixture.detectChanges();

    expect(parties.inviteByEmail).toHaveBeenCalledWith('party-1', 'ami@example.com');
    expect(component.notice()).toContain('ami@example.com');
    expect(component.inviteEmail()).toBe('');
    expect(component.inviteEmailError()).toBeNull();
  });

  it('échec ({ ok: false }) : affiche un message d’erreur explicite, ne vide pas le champ', async () => {
    const { fixture } = await createFixture(makePartie({ mjId: MJ_ID }), MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      inviteByEmail: ReturnType<typeof vi.fn>;
    };
    parties.inviteByEmail.mockResolvedValue({ ok: false });

    const component = fixture.componentInstance as unknown as {
      inviteEmail: { set: (v: string) => void; (): string };
      inviteEmailError: () => string | null;
      inviteByEmail: () => Promise<void>;
    };
    component.inviteEmail.set('ami@example.com');
    await component.inviteByEmail();
    fixture.detectChanges();

    expect(component.inviteEmailError()).toBeTruthy();
    expect(component.inviteEmail()).toBe('ami@example.com');
  });

  it('ignore un second appel concurrent tant que le premier est en cours (anti double-soumission)', async () => {
    const { fixture } = await createFixture(makePartie({ mjId: MJ_ID }), MJ_ID);
    const parties = TestBed.inject(PartiesService) as unknown as {
      inviteByEmail: ReturnType<typeof vi.fn>;
    };
    let resolveFirst!: (v: { ok: boolean }) => void;
    parties.inviteByEmail.mockReturnValue(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const component = fixture.componentInstance as unknown as {
      inviteEmail: { set: (v: string) => void; (): string };
      inviteByEmail: () => Promise<void>;
    };
    component.inviteEmail.set('ami@example.com');
    const firstCall = component.inviteByEmail();
    const secondCall = component.inviteByEmail(); // déclenché pendant que le premier est en vol

    resolveFirst({ ok: true });
    await firstCall;
    await secondCall;

    expect(parties.inviteByEmail).toHaveBeenCalledTimes(1);
  });
});
