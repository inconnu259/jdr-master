import { TestBed, ComponentFixture } from '@angular/core/testing';
import { PartieDetail } from './partie-detail';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import type { CharacterDto, PartieDto, PartieMemberDto, SessionPollDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { CharacterService } from '../../../core/characters/character.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { MatDialog } from '@angular/material/dialog';
import { TONE_MAP } from '../../../core/theme/tones';

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

function makePartiesService(partie: PartieDto, members: PartieMemberDto[] = []) {
  return {
    get: vi.fn().mockResolvedValue(partie),
    members: vi.fn().mockResolvedValue(members),
    inviteLinks: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([]),
    inviteUser: vi.fn(),
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
      provideAnimationsAsync(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => partie.id } } } },
      { provide: AuthService, useValue: makeAuthService(currentUserId) },
      { provide: PartiesService, useValue: makePartiesService(partie, options.members ?? []) },
      { provide: ModeService, useValue: { refreshMjParties: vi.fn() } },
      {
        provide: PollService,
        useValue: { getCurrentPoll: vi.fn().mockResolvedValue(options.poll ?? null) },
      },
      {
        provide: CharacterService,
        useValue: { listByPartie: vi.fn().mockResolvedValue(options.characters ?? []) },
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

// ─── Onglet Personnages (Story 4.2) ───────────────────────────────────────

describe('PartieDetail — onglet Personnages', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("charge les personnages de la partie via CharacterService.listByPartie et affiche le libellé de l'onglet", async () => {
    const { fixture, el } = await createFixture(makePartie(), MJ_ID, { characters: [] });

    const characterSvc = TestBed.inject(CharacterService) as unknown as {
      listByPartie: ReturnType<typeof vi.fn>;
    };
    expect(characterSvc.listByPartie).toHaveBeenCalledWith('party-1');
    expect(el.textContent).toContain('Personnages');
    expect((fixture.componentInstance as unknown as { characters: () => unknown[] }).characters())
      .toEqual([]);
  });

  it('expose les personnages chargés sur le signal characters()', async () => {
    const character: CharacterDto = {
      id: 'c1',
      userId: PLAYER_ID,
      partieId: 'party-1',
      gameSystemId: 'ryuutama',
      sheetData: {},
      derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
      portraitUrl: null,
      portraitCropData: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { fixture } = await createFixture(makePartie(), MJ_ID, { characters: [character] });

    expect((fixture.componentInstance as unknown as { characters: () => unknown[] }).characters())
      .toEqual([character]);
  });

  it("un personnage créé par un AUTRE joueur n'empêche pas l'utilisateur courant de créer le sien", async () => {
    const otherPlayerCharacter: CharacterDto = {
      id: 'c1',
      userId: 'some-other-player',
      partieId: 'party-1',
      gameSystemId: 'ryuutama',
      sheetData: {},
      derived: { PV: 16, PE: 12, Condition: 14, Initiative: 10, Encombrement: 11 },
      portraitUrl: null,
      portraitCropData: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { fixture } = await createFixture(makePartie(), PLAYER_ID, {
      characters: [otherPlayerCharacter],
    });

    // Le joueur courant (PLAYER_ID) n'a pas de personnage à lui, même si un autre joueur a déjà
    // créé le sien sur cette partie — myCharacters() doit rester vide pour PLAYER_ID.
    const comp = fixture.componentInstance as unknown as { myCharacters: () => unknown[] };
    expect(comp.myCharacters()).toEqual([]);
  });
});
